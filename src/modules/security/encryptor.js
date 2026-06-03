/**
 * AssetEncryptor - AES-256-GCM file encryption/decryption.
 * ESM module. On first run, generates a random key, stores it in package.json,
 * encrypts the config file, validates it, and marks the plaintext for deletion.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAGIC = Buffer.from("MEOW3");
const VERSION = 2;
const ITERATIONS = 180000;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16; // 128 bits = 16 bytes

const PLACEHOLDER = "%DINAMIC_PLACEHOLDER%";

/**
 * Read the encryption key from package.json.
 * Returns null if placeholder is still present or file is missing.
 * @param {string} pkgPath - Path to package.json
 * @returns {string|null}
 */
function readPassword(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const key = pkg.meow_encryption_key;
    if (!key || key === PLACEHOLDER) return null;
    return key;
  } catch {
    return null;
  }
}

/**
 * Generates a cryptographically random 64-char hex key (32 bytes).
 * @returns {string}
 */
function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Writes the encryption key into package.json, replacing the placeholder.
 * @param {string} key
 * @param {string} pkgPath - Path to package.json
 */
function storeKeyInPackageJson(key, pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.meow_encryption_key = key;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

/**
 * Derives an AES-256 key from a password using PBKDF2.
 * @param {string} password
 * @param {Buffer} salt
 * @param {number} iterations
 * @returns {Promise<Buffer>}
 */
function deriveKey(password, salt, iterations) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Builds the binary header for an encrypted blob.
 * @param {Buffer} salt
 * @param {Buffer} iv
 * @param {number} iterations
 * @returns {Buffer}
 */
function buildHeader(salt, iv, iterations) {
  const header = Buffer.alloc(5 + 1 + 4 + 1 + 1 + SALT_LEN + IV_LEN);
  MAGIC.copy(header, 0);                    // 5 bytes magic
  header.writeUInt8(VERSION, 5);            // 1 byte version
  header.writeUInt32BE(iterations, 6);      // 4 bytes iterations
  header.writeUInt8(SALT_LEN, 10);          // 1 byte salt len
  header.writeUInt8(IV_LEN, 11);            // 1 byte iv len
  salt.copy(header, 12);                     // SALT_LEN bytes
  iv.copy(header, 12 + SALT_LEN);           // IV_LEN bytes
  return header;
}

/**
 * Parses the binary header from an encrypted blob.
 * @param {Buffer} buffer
 * @returns {{ salt: Buffer, iv: Buffer, iterations: number, dataOffset: number }}
 */
function parseHeader(buffer) {
  if (buffer.length < 12 + SALT_LEN + IV_LEN) {
    throw new Error("Encrypted data too short");
  }
  const magic = buffer.subarray(0, 5);
  if (!magic.equals(MAGIC)) {
    throw new Error("Invalid magic bytes — not a MeowCLI encrypted file");
  }
  const version = buffer.readUInt8(5);
  const iterations = buffer.readUInt32BE(6);
  const saltLen = buffer.readUInt8(10);
  const ivLen = buffer.readUInt8(11);

  if (saltLen !== SALT_LEN || ivLen !== IV_LEN) {
    throw new Error(`Unsupported salt/iv lengths: ${saltLen}/${ivLen}`);
  }

  const dataOffset = 12 + saltLen + ivLen;
  const salt = buffer.subarray(12, 12 + saltLen);
  const iv = buffer.subarray(12 + saltLen, dataOffset);

  return { salt, iv, iterations, dataOffset, version };
}

/**
 * Encrypts raw data with AES-256-GCM.
 * @param {Buffer|string} data
 * @param {string} password
 * @returns {Promise<Buffer>}
 */
async function encrypt(data, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = await deriveKey(password, salt, ITERATIONS);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });

  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");

  const header = buildHeader(salt, iv, ITERATIONS);
  cipher.setAAD(header);

  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([header, encrypted, tag]);
}

/**
 * Decrypts data encrypted with encrypt().
 * @param {Buffer} buffer - The full encrypted blob (header + ciphertext + tag)
 * @param {string} password
 * @returns {Promise<Buffer>}
 */
async function decrypt(buffer, password) {
  const { salt, iv, iterations, dataOffset } = parseHeader(buffer);

  const key = await deriveKey(password, salt, iterations);

  const header = buildHeader(salt, iv, iterations);

  const tagStart = buffer.length - TAG_LEN;
  const encrypted = buffer.subarray(dataOffset, tagStart);
  const tag = buffer.subarray(tagStart);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Synchronous version of encrypt() — uses pbkdf2Sync.
 * For use in synchronous contexts like config loading.
 * @param {Buffer|string} data
 * @param {string} password
 * @returns {Buffer}
 */
function encryptSync(data, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const header = buildHeader(salt, iv, ITERATIONS);
  cipher.setAAD(header);

  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([header, encrypted, tag]);
}

/**
 * Synchronous version of decrypt() — uses pbkdf2Sync.
 * For use in synchronous contexts like config loading.
 * @param {Buffer} buffer - The full encrypted blob
 * @param {string} password
 * @returns {Buffer}
 */
function decryptSync(buffer, password) {
  const { salt, iv, iterations, dataOffset } = parseHeader(buffer);
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const header = buildHeader(salt, iv, iterations);

  const tagStart = buffer.length - TAG_LEN;
  const encrypted = buffer.subarray(dataOffset, tagStart);
  const tag = buffer.subarray(tagStart);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Encrypts a file on disk. Output written to outputPath (default: inputPath + '.mc').
 * @param {string} inputPath
 * @param {string} password
 * @param {string|null} outputPath
 * @returns {Promise<string>} output path
 */
async function encryptFile(inputPath, password, outputPath = null) {
  if (!outputPath) outputPath = inputPath + ".mc";
  const data = fs.readFileSync(inputPath);
  const encrypted = await encrypt(data, password);
  fs.writeFileSync(outputPath, encrypted);
  return outputPath;
}

/**
 * Decrypts a file on disk. Output written to outputPath.
 * @param {string} inputPath
 * @param {string} password
 * @param {string} outputPath
 * @returns {Promise<string>} output path
 */
async function decryptFile(inputPath, password, outputPath) {
  const encrypted = fs.readFileSync(inputPath);
  const decrypted = await decrypt(encrypted, password);
  fs.writeFileSync(outputPath, decrypted);
  return outputPath;
}

/**
 * Initializes the encryption system. Called once at CLI startup.
 *
 * Flow:
 * 1. Check for .data marker file in dataDir — if exists, just clean up .delete files.
 * 2. If .data does NOT exist:
 *    a. Generate random key → store in package.json (replacing %DINAMIC_PLACEHOLDER%)
 *    b. Encrypt config.json → config.json.mc
 *    c. Decrypt config.json.mc → validate JSON
 *    d. Rename config.json → config.json.delete (for cleanup next run)
 *    e. Create .data marker file
 *
 * @param {string} dataDir - Path to the data directory (e.g. ~/.meowcli/data/)
 * @param {string} configPath - Path to config.json
 * @param {string} pkgPath - Path to package.json
 * @returns {Promise<string|null>} The password if initialized, or null if already done
 */
async function initEncryption(dataDir, configPath, pkgPath) {
  const markerPath = path.join(dataDir, ".data");
  const deletePath = configPath + ".delete";

  // Already initialized — just clean up .delete files from previous run
  if (fs.existsSync(markerPath)) {
    if (fs.existsSync(deletePath)) {
      try { fs.unlinkSync(deletePath); } catch {}
    }
    return readPassword(pkgPath);
  }

  // --- First run: initialize ---

  // a. Generate key and store in package.json
  const key = generateKey();
  storeKeyInPackageJson(key, pkgPath);

  // b. Encrypt config.json (if it exists)
  if (fs.existsSync(configPath)) {
    const encryptedPath = configPath + ".mc";
    await encryptFile(configPath, key, encryptedPath);

    // c. Decrypt and validate JSON
    const encryptedBuf = fs.readFileSync(encryptedPath);
    const decryptedBuf = await decrypt(encryptedBuf, key);
    try {
      JSON.parse(decryptedBuf.toString("utf8"));
    } catch (e) {
      // Validation failed — clean up and throw
      try { fs.unlinkSync(encryptedPath); } catch {}
      throw new Error(`Encryption validation failed: invalid JSON after decrypt — ${e.message}`);
    }

    // d. Mark original config for deletion (rename to .delete)
    fs.renameSync(configPath, deletePath);
  }

  // e. Create .data marker — stores a one-way mystery hash, NOT the key
  fs.mkdirSync(dataDir, { recursive: true });
  const mystery = crypto.createHash("sha256")
    .update("meow://rift/" + key + "/v3")
    .digest("hex");
  fs.writeFileSync(markerPath, mystery, "utf8");

  return key;
}

export {
  encrypt,
  decrypt,
  encryptSync,
  decryptSync,
  encryptFile,
  decryptFile,
  initEncryption,
  readPassword,
  generateKey,
  MAGIC,
  VERSION,
  ITERATIONS,
  SALT_LEN,
  IV_LEN,
  TAG_LEN,
  PLACEHOLDER,
};
