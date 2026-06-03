/**
 * AssetEncryptor - AES-256-GCM file encryption/decryption.
 * ESM module. On first run (optional), generates a random seed,
 * encrypts the config file, validates it, and marks plaintext for deletion.
 *
 * The seed lives ONLY in ~/.meowcli/data/.data — not in package.json.
 * Stealers scanning for "key"/"secret" in package.json see nothing.
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

const MARKER_DISABLED = "meow://veil/off";

// ─── .data marker helpers ───────────────────────────────────────────

/**
 * Reads the seed from the .data marker file.
 * @param {string} dataDir
 * @returns {string|null} seed if encryption enabled, null if disabled or missing
 */
function readSeed(dataDir) {
  const markerPath = path.join(dataDir, ".data");
  if (!fs.existsSync(markerPath)) return null;
  try {
    const content = fs.readFileSync(markerPath, "utf8").trim();
    if (content === MARKER_DISABLED || content.length === 0) return null;
    return content;
  } catch {
    return null;
  }
}

/**
 * Checks whether encryption is active.
 * @param {string} dataDir
 * @returns {boolean}
 */
function isEncryptionActive(dataDir) {
  const seed = readSeed(dataDir);
  return seed !== null && seed.length > 0;
}

/**
 * Generates a cryptographically random 64-char hex seed (32 bytes).
 * @returns {string}
 */
function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

// ─── PBKDF2 derivation ──────────────────────────────────────────────

/**
 * Derives an AES-256 key from a password using PBKDF2 (async).
 */
function deriveKey(password, salt, iterations) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// ─── Binary header ──────────────────────────────────────────────────

function buildHeader(salt, iv, iterations) {
  const header = Buffer.alloc(5 + 1 + 4 + 1 + 1 + SALT_LEN + IV_LEN);
  MAGIC.copy(header, 0);
  header.writeUInt8(VERSION, 5);
  header.writeUInt32BE(iterations, 6);
  header.writeUInt8(SALT_LEN, 10);
  header.writeUInt8(IV_LEN, 11);
  salt.copy(header, 12);
  iv.copy(header, 12 + SALT_LEN);
  return header;
}

function parseHeader(buffer) {
  if (buffer.length < 12 + SALT_LEN + IV_LEN) {
    throw new Error("Encrypted data too short");
  }
  if (!buffer.subarray(0, 5).equals(MAGIC)) {
    throw new Error("Invalid magic bytes — not a MeowCLI encrypted file");
  }
  const iterations = buffer.readUInt32BE(6);
  const saltLen = buffer.readUInt8(10);
  const ivLen = buffer.readUInt8(11);
  if (saltLen !== SALT_LEN || ivLen !== IV_LEN) {
    throw new Error(`Unsupported salt/iv lengths: ${saltLen}/${ivLen}`);
  }
  const dataOffset = 12 + saltLen + ivLen;
  return {
    salt: buffer.subarray(12, 12 + saltLen),
    iv: buffer.subarray(12 + saltLen, dataOffset),
    iterations,
    dataOffset,
  };
}

// ─── Encrypt / Decrypt (async) ──────────────────────────────────────

async function encrypt(data, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = await deriveKey(password, salt, ITERATIONS);
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const header = buildHeader(salt, iv, ITERATIONS);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(header);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([header, encrypted, cipher.getAuthTag()]);
}

async function decrypt(buffer, password) {
  const { salt, iv, iterations, dataOffset } = parseHeader(buffer);
  const key = await deriveKey(password, salt, iterations);
  const header = buildHeader(salt, iv, iterations);
  const tagStart = buffer.length - TAG_LEN;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(header);
  decipher.setAuthTag(buffer.subarray(tagStart));
  return Buffer.concat([decipher.update(buffer.subarray(dataOffset, tagStart)), decipher.final()]);
}

// ─── Encrypt / Decrypt (sync) ───────────────────────────────────────

function encryptSync(data, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const header = buildHeader(salt, iv, ITERATIONS);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(header);
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([header, encrypted, cipher.getAuthTag()]);
}

function decryptSync(buffer, password) {
  const { salt, iv, iterations, dataOffset } = parseHeader(buffer);
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const header = buildHeader(salt, iv, iterations);
  const tagStart = buffer.length - TAG_LEN;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(header);
  decipher.setAuthTag(buffer.subarray(tagStart));
  return Buffer.concat([decipher.update(buffer.subarray(dataOffset, tagStart)), decipher.final()]);
}

// ─── File helpers ───────────────────────────────────────────────────

async function encryptFile(inputPath, password, outputPath = null) {
  if (!outputPath) outputPath = inputPath + ".mc";
  fs.writeFileSync(outputPath, await encrypt(fs.readFileSync(inputPath), password));
  return outputPath;
}

async function decryptFile(inputPath, password, outputPath) {
  fs.writeFileSync(outputPath, await decrypt(fs.readFileSync(inputPath), password));
  return outputPath;
}

// ─── Init (called once at CLI startup) ──────────────────────────────

/**
 * Initializes the encryption system.
 *
 * Flow:
 * 1. .data exists & enabled  → cleanup .delete files, return seed.
 * 2. .data exists & disabled → return null (user opted out).
 * 3. .data missing → prompt user (if TTY).
 *    - Accept:  generate seed → store in .data → encrypt config → validate → mark .delete.
 *    - Decline: write disabled sentinel to .data.
 *
 * @param {string} dataDir  - e.g. ~/.meowcli/data/
 * @param {string} configPath - e.g. ~/.meowcli/data/config.json
 * @param {boolean} [interactive=false]
 * @returns {Promise<string|null>} seed if active, null otherwise
 */
async function initEncryption(dataDir, configPath, interactive = false) {
  const markerPath = path.join(dataDir, ".data");
  const deletePath = configPath + ".delete";
  const encryptedConfigPath = configPath + ".mc";

  // ── Already initialized ───────────────────────────────────────────
  if (fs.existsSync(markerPath)) {
    const seed = readSeed(dataDir);

    if (seed === null) {
      // Disabled — nothing to do
      return null;
    }

    // Enabled — cleanup
    if (fs.existsSync(deletePath)) {
      try { fs.unlinkSync(deletePath); } catch {}
    }
    // If plaintext config.json was recreated alongside encrypted copy, nuke it
    if (fs.existsSync(configPath) && fs.existsSync(encryptedConfigPath)) {
      try { fs.unlinkSync(configPath); } catch {}
    }

    return seed;
  }

  // ── First run ─────────────────────────────────────────────────────
  let enableEncryption = false;

  if (interactive && process.stdin.isTTY) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question("\n  🔐 Enable config file encryption? (protects API keys on disk) [Y/n] ", (ans) => {
        rl.close();
        resolve(ans.trim().toLowerCase());
      });
    });
    enableEncryption = answer === "" || answer === "y" || answer === "yes";
  }

  fs.mkdirSync(dataDir, { recursive: true });

  if (!enableEncryption) {
    fs.writeFileSync(markerPath, MARKER_DISABLED, "utf8");
    return null;
  }

  // ── Enable encryption ─────────────────────────────────────────────
  const seed = generateKey();

  // Store seed in .data (ONLY place where it lives)
  fs.writeFileSync(markerPath, seed, "utf8");

  // Encrypt config if present
  if (fs.existsSync(configPath)) {
    await encryptFile(configPath, seed, encryptedConfigPath);

    // Validate
    const decryptedBuf = await decrypt(fs.readFileSync(encryptedConfigPath), seed);
    try {
      JSON.parse(decryptedBuf.toString("utf8"));
    } catch (e) {
      try { fs.unlinkSync(encryptedConfigPath); } catch {}
      throw new Error(`Encryption validation failed: invalid JSON — ${e.message}`);
    }

    // Mark original for deletion
    fs.renameSync(configPath, deletePath);
  }

  return seed;
}

export {
  encrypt,
  decrypt,
  encryptSync,
  decryptSync,
  encryptFile,
  decryptFile,
  initEncryption,
  isEncryptionActive,
  readSeed,
  generateKey,
  MAGIC,
  VERSION,
  ITERATIONS,
  SALT_LEN,
  IV_LEN,
  TAG_LEN,
};
