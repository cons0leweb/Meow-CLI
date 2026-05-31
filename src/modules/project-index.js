/**
 * project-index.js — Persistent structural index for Meow CLI projects.
 *
 * Maintains an SQLite database (.meow/index.db) tracking project files:
 * paths, sizes, mtimes, sha256 hashes (first 16 chars), and metadata.
 *
 * Exports: initIndex(), rebuildIndex(), updateIndex(), findFiles(), getIndexStats()
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, WARNING, ERROR, Spinner, progressBar } from "./ui.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {string} Directory where the index DB lives (relative to cwd) */
const INDEX_DIR = ".meow";

/** @type {string} SQLite database filename */
const DB_NAME = "index.db";

/** @type {number} DB schema version — bump to trigger migration */
const SCHEMA_VERSION = 1;

/** @type {Set<string>} Directories always excluded from indexing */
const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  "coverage",
  ".cache",
  ".next",
  ".meow",
]);

/** @type {Set<string>} File extensions / names always excluded */
const DEFAULT_IGNORE_FILES = new Set([
  ".DS_Store",
  "Thumbs.db",
  ".gitignore",
  ".gitkeep",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

/** @type {number} Max concurrency for file hashing */
const HASH_CONCURRENCY = 10;

/** @type {number} Max file size (bytes) to hash — larger files get fast-path (size+mtime only) */
const MAX_HASH_SIZE = 100 * 1024 * 1024; // 100 MB

// ---------------------------------------------------------------------------
// Internal state (lazy singleton DB connection)
// ---------------------------------------------------------------------------

/** @type {Promise<import('sqlite').Database>|null} */
let _dbPromise = null;

/** @type {string|null} Cached cwd at connection time */
let _dbCwd = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the .meow directory for the current project.
 * @param {string} [cwd=process.cwd()]
 * @returns {string}
 */
function indexDir(cwd = process.cwd()) {
  return path.resolve(cwd, INDEX_DIR);
}

/**
 * Returns the absolute path to the SQLite database file.
 * @param {string} [cwd=process.cwd()]
 * @returns {string}
 */
function dbPath(cwd = process.cwd()) {
  return path.resolve(indexDir(cwd), DB_NAME);
}

/**
 * Opens (or returns cached) SQLite connection. Creates DB + tables if missing.
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<import('sqlite').Database>}
 */
async function getDb(cwd = process.cwd()) {
  if (_dbPromise && _dbCwd === cwd) {
    return _dbPromise;
  }

  _dbCwd = cwd;
  _dbPromise = (async () => {
    const dir = indexDir(cwd);
    await fs.promises.mkdir(dir, { recursive: true });

    const db = await open({
      filename: dbPath(cwd),
      driver: sqlite3.Database,
    });

    // Enable WAL mode for better concurrent performance
    await db.exec("PRAGMA journal_mode=WAL;");
    await db.exec("PRAGMA synchronous=NORMAL;");

    // Create tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        size INTEGER NOT NULL DEFAULT 0,
        mtime INTEGER NOT NULL DEFAULT 0,
        hash TEXT NOT NULL DEFAULT '',
        last_indexed INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Ensure schema version metadata
    const row = await db.get("SELECT value FROM metadata WHERE key = 'schema_version'");
    if (!row) {
      await db.run(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
        "schema_version",
        String(SCHEMA_VERSION),
      );
    }

    return db;
  })();

  return _dbPromise;
}

/**
 * Closes the current DB connection (if any). Useful for testing or forced reopen.
 * @returns {Promise<void>}
 */
async function closeDb() {
  if (_dbPromise) {
    const db = await _dbPromise;
    await db.close();
    _dbPromise = null;
    _dbCwd = null;
  }
}

/**
 * Checks whether the index database exists on disk.
 * @param {string} [cwd=process.cwd()]
 * @returns {boolean}
 */
function indexExists(cwd = process.cwd()) {
  return fs.existsSync(dbPath(cwd));
}

/**
 * Returns the list of ignore patterns (as functions).
 * @returns {{ dirs: Set<string>, files: Set<string> }}
 */
function getIgnorePatterns() {
  return { dirs: DEFAULT_IGNORE_DIRS, files: DEFAULT_IGNORE_FILES };
}

/**
 * Recursively walks the filesystem starting from `root`, yielding relative paths.
 * Uses async iteration with a concurrency limit.
 *
 * @param {string} root - Absolute path to walk.
 * @param {Object} [options]
 * @param {Set<string>} [options.ignoreDirs] - Directory names to skip.
 * @param {Set<string>} [options.ignoreFiles] - File names to skip.
 * @returns {AsyncGenerator<string>}
 */
async function* walkFiles(root, options = {}) {
  const { ignoreDirs = DEFAULT_IGNORE_DIRS, ignoreFiles = DEFAULT_IGNORE_FILES } = options;

  const queue = [root];

  while (queue.length > 0) {
    const dir = queue.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      // Permission denied or other error — skip
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name) || entry.name.startsWith(".")) {
          continue; // skip hidden dirs and well-known ignored dirs
        }
        queue.push(fullPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (ignoreFiles.has(entry.name) || entry.name.startsWith(".")) {
          continue; // skip hidden files and well-known ignored files
        }
        yield relPath;
      }
    }
  }
}

/**
 * Computes a SHA-256 hash of a file (first 16 hex characters).
 * Uses streaming to avoid loading large files into memory.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} First 16 hex characters of SHA-256.
 */
async function hashFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    // For very large files, skip hash and return size-based fingerprint
    if (stat.size > MAX_HASH_SIZE) {
      return `size:${stat.size}:mtime:${Math.floor(stat.mtimeMs / 1000)}`;
    }

    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64KB chunks

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex").slice(0, 16)));
      stream.on("error", (err) => {
        // Fallback: use mtime + size as fingerprint
        resolve(`size:${stat.size}:mtime:${Math.floor(stat.mtimeMs / 1000)}`);
      });
    });
  } catch {
    return "";
  }
}

/**
 * Limits concurrency of async operations.
 *
 * @template T
 * @param {Array<() => Promise<T>>} factories - Array of async factories.
 * @param {number} concurrency - Max concurrency.
 * @returns {Promise<Array<{ok: boolean, value?: T, error?: string}>>>}
 */
async function asyncPool(factories, concurrency) {
  const results = new Array(factories.length);
  let idx = 0;

  async function worker() {
    while (idx < factories.length) {
      const i = idx++;
      try {
        results[i] = { ok: true, value: await factories[i]() };
      } catch (e) {
        results[i] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, factories.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures the .meow directory and index DB exist.
 * Does NOT perform indexing — just creates the scaffolding.
 *
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<boolean>} True if index is ready.
 */
async function initIndex(cwd = process.cwd()) {
  try {
    const dir = indexDir(cwd);
    await fs.promises.mkdir(dir, { recursive: true });
    await getDb(cwd);
    return true;
  } catch (e) {
    log.err(`Failed to initialize index: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Performs a full reindex of the project.
 * Walks all files (respecting ignore lists), computes hashes, updates DB.
 *
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<{ok: boolean, files: number, dbSize: string, elapsed: string}>}
 */
async function rebuildIndex(cwd = process.cwd()) {
  const startTime = Date.now();

  // Ensure DB is ready
  await initIndex(cwd);
  const db = await getDb(cwd);

  // Collect all files
  const spinner = new Spinner("Scanning project files");
  spinner.start();

  const allFiles = [];
  try {
    for await (const relPath of walkFiles(cwd)) {
      allFiles.push(relPath);
    }
  } catch (e) {
    spinner.stop();
    log.err(`Walk error: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, files: 0, dbSize: "0 B", elapsed: "0s" };
  }

  spinner.stop(`Found ${allFiles.length} files`);

  // Begin transaction
  await db.exec("BEGIN TRANSACTION;");

  try {
    // Clear existing file records
    await db.exec("DELETE FROM files;");

    // Hash and insert in batches with concurrency
    const BATCH_SIZE = 100;
    let processed = 0;
    const totalFiles = allFiles.length;

    for (let batchStart = 0; batchStart < totalFiles; batchStart += BATCH_SIZE) {
      const batch = allFiles.slice(batchStart, batchStart + BATCH_SIZE);

      const hashResults = await asyncPool(
        batch.map((relPath) => async () => {
          const absPath = path.resolve(cwd, relPath);
          try {
            const stat = await fs.promises.stat(absPath);
            if (!stat.isFile()) return null;
            const hash = await hashFile(absPath);
            return {
              path: relPath.replace(/\\/g, "/"),
              size: stat.size,
              mtime: Math.floor(stat.mtimeMs / 1000),
              hash,
              last_indexed: Math.floor(Date.now() / 1000),
            };
          } catch {
            return null;
          }
        }),
        HASH_CONCURRENCY,
      );

      const stmt = await db.prepare(
        "INSERT OR REPLACE INTO files (path, size, mtime, hash, last_indexed) VALUES (?, ?, ?, ?, ?)",
      );

      for (const result of hashResults) {
        if (result.ok && result.value) {
          const f = result.value;
          await stmt.run(f.path, f.size, f.mtime, f.hash, f.last_indexed);
          processed++;
        }
      }

      await stmt.finalize();

      // Show progress every 10 batches
      if ((batchStart / BATCH_SIZE) % 10 === 0 && totalFiles > 0) {
        const pct = Math.round((processed / totalFiles) * 100);
        log.dim(`  Indexed: ${processed}/${totalFiles} (${pct}%)`);
      }
    }

    // Update metadata
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "last_full_index",
      String(Math.floor(Date.now() / 1000)),
    );
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "root_path",
      cwd,
    );
    await db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      "version",
      String(SCHEMA_VERSION),
    );

    await db.exec("COMMIT;");

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    let dbSize = "0 B";
    try {
      const stat = await fs.promises.stat(dbPath(cwd));
      dbSize = stat.size > 1024 * 1024
        ? `${(stat.size / (1024 * 1024)).toFixed(1)} MB`
        : stat.size > 1024
          ? `${(stat.size / 1024).toFixed(1)} KB`
          : `${stat.size} B`;
    } catch { /* ignore */ }

    log.ok(`Index rebuilt: ${processed} files, ${dbSize}, ${elapsed}s`);

    return { ok: true, files: processed, dbSize, elapsed: `${elapsed}s` };
  } catch (e) {
    await db.exec("ROLLBACK;");
    spinner.stop();
    log.err(`Rebuild failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, files: 0, dbSize: "0 B", elapsed: "0s" };
  }
}

/**
 * Lazily updates the index — only processes files whose mtime has changed.
 * Also removes files that no longer exist on disk, and adds new ones.
 *
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<{ok: boolean, updated: number, added: number, removed: number, total: number, message: string}>}
 */
async function updateIndex(cwd = process.cwd()) {
  const startTime = Date.now();

  // Check if index exists
  if (!indexExists(cwd)) {
    return {
      ok: false,
      updated: 0,
      added: 0,
      removed: 0,
      total: 0,
      message: "No index found. Run /index rebuild first.",
    };
  }

  let db;
  try {
    db = await getDb(cwd);
  } catch (e) {
    // DB might be corrupted — suggest rebuild
    return {
      ok: false,
      updated: 0,
      added: 0,
      removed: 0,
      total: 0,
      message: `Index error: ${e instanceof Error ? e.message : String(e)}. Try /index rebuild.`,
    };
  }

  // Get all files currently indexed
  const indexedMap = new Map();
  try {
    const rows = await db.all("SELECT path, mtime, hash FROM files");
    for (const row of rows) {
      indexedMap.set(row.path, row);
    }
  } catch (e) {
    // Corrupted DB
    await closeDb();
    return {
      ok: false,
      updated: 0,
      added: 0,
      removed: 0,
      total: 0,
      message: `Failed to read index: ${e instanceof Error ? e.message : String(e)}. Run /index rebuild.`,
    };
  }

  // Walk current filesystem
  const currentFiles = new Map();
  for await (const relPath of walkFiles(cwd)) {
    const normalized = relPath.replace(/\\/g, "/");
    const absPath = path.resolve(cwd, normalized);
    try {
      const stat = await fs.promises.stat(absPath);
      if (stat.isFile()) {
        currentFiles.set(normalized, {
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs / 1000),
        });
      }
    } catch {
      // File may have been deleted between walk and stat — skip
    }
  }

  // Determine changes
  const toRemove = [];
  const toAdd = [];
  const toUpdate = [];

  for (const [relPath, fsInfo] of currentFiles) {
    const indexed = indexedMap.get(relPath);
    if (!indexed) {
      toAdd.push(relPath);
    } else if (indexed.mtime !== fsInfo.mtime) {
      toUpdate.push(relPath);
    }
  }

  for (const relPath of indexedMap.keys()) {
    if (!currentFiles.has(relPath)) {
      toRemove.push(relPath);
    }
  }

  const totalChanged = toRemove.length + toAdd.length + toUpdate.length;

  if (totalChanged === 0) {
    const count = await db.get("SELECT COUNT(*) as cnt FROM files");
    return {
      ok: true,
      updated: 0,
      added: 0,
      removed: 0,
      total: count?.cnt || 0,
      message: "All files are up to date.",
    };
  }

  // Process removals
  if (toRemove.length > 0) {
    const stmt = await db.prepare("DELETE FROM files WHERE path = ?");
    for (const relPath of toRemove) {
      await stmt.run(relPath);
    }
    await stmt.finalize();
  }

  // Process additions
  if (toAdd.length > 0) {
    const hashResults = await asyncPool(
      toAdd.map((relPath) => async () => {
        const absPath = path.resolve(cwd, relPath);
        try {
          const stat = await fs.promises.stat(absPath);
          const hash = await hashFile(absPath);
          return {
            path: relPath,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs / 1000),
            hash,
            last_indexed: Math.floor(Date.now() / 1000),
          };
        } catch {
          return null;
        }
      }),
      HASH_CONCURRENCY,
    );

    const stmt = await db.prepare(
      "INSERT OR REPLACE INTO files (path, size, mtime, hash, last_indexed) VALUES (?, ?, ?, ?, ?)",
    );
    for (const r of hashResults) {
      if (r.ok && r.value) {
        await stmt.run(r.value.path, r.value.size, r.value.mtime, r.value.hash, r.value.last_indexed);
      }
    }
    await stmt.finalize();
  }

  // Process updates (changed mtime)
  if (toUpdate.length > 0) {
    const hashResults = await asyncPool(
      toUpdate.map((relPath) => async () => {
        const absPath = path.resolve(cwd, relPath);
        try {
          const stat = await fs.promises.stat(absPath);
          const hash = await hashFile(absPath);
          return {
            path: relPath,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs / 1000),
            hash,
            last_indexed: Math.floor(Date.now() / 1000),
          };
        } catch {
          return null;
        }
      }),
      HASH_CONCURRENCY,
    );

    const stmt = await db.prepare(
      "UPDATE files SET size = ?, mtime = ?, hash = ?, last_indexed = ? WHERE path = ?",
    );
    for (const r of hashResults) {
      if (r.ok && r.value) {
        await stmt.run(r.value.size, r.value.mtime, r.value.hash, r.value.last_indexed, r.value.path);
      }
    }
    await stmt.finalize();
  }

  const total = await db.get("SELECT COUNT(*) as cnt FROM files");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const msg = `Updated: ${toUpdate.length} changed, ${toAdd.length} added, ${toRemove.length} removed (${elapsed}s)`;
  log.ok(msg);

  return {
    ok: true,
    updated: toUpdate.length,
    added: toAdd.length,
    removed: toRemove.length,
    total: total?.cnt || 0,
    message: msg,
  };
}

/**
 * Searches for files by name (partial match, case-insensitive).
 * Uses SQLite LIKE query.
 *
 * @param {string} query - Search query.
 * @param {Object} [options]
 * @param {number} [options.limit=20] - Max results.
 * @param {string} [options.cwd=process.cwd()]
 * @returns {Promise<Array<{path: string, size: number, mtime: number, hash: string, last_indexed: number}>>}
 */
async function findFiles(query, options = {}) {
  const { limit = 20, cwd = process.cwd() } = options;

  if (!indexExists(cwd)) {
    return [];
  }

  try {
    const db = await getDb(cwd);
    const pattern = `%${query}%`;
    const rows = await db.all(
      "SELECT path, size, mtime, hash, last_indexed FROM files WHERE path LIKE ? ORDER BY mtime DESC LIMIT ?",
      pattern,
      limit,
    );
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Returns statistics about the current index.
 *
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<{exists: boolean, fileCount: number, dbSize: string, lastFullIndex: string|null, rootPath: string|null, dbSizeBytes: number}>}
 */
async function getIndexStats(cwd = process.cwd()) {
  const stats = {
    exists: false,
    fileCount: 0,
    dbSize: "0 B",
    dbSizeBytes: 0,
    lastFullIndex: null,
    rootPath: null,
  };

  if (!indexExists(cwd)) {
    return stats;
  }

  stats.exists = true;

  try {
    // DB file size
    const dbStat = await fs.promises.stat(dbPath(cwd));
    stats.dbSizeBytes = dbStat.size;
    stats.dbSize = dbStat.size > 1024 * 1024
      ? `${(dbStat.size / (1024 * 1024)).toFixed(1)} MB`
      : dbStat.size > 1024
        ? `${(dbStat.size / 1024).toFixed(1)} KB`
        : `${dbStat.size} B`;
  } catch { /* ignore */ }

  try {
    const db = await getDb(cwd);

    const countRow = await db.get("SELECT COUNT(*) as cnt FROM files");
    stats.fileCount = countRow?.cnt || 0;

    const metaRows = await db.all("SELECT key, value FROM metadata WHERE key IN ('last_full_index', 'root_path')");
    for (const row of metaRows) {
      if (row.key === "last_full_index") stats.lastFullIndex = row.value;
      if (row.key === "root_path") stats.rootPath = row.value;
    }
  } catch {
    // DB might be corrupted
    stats.exists = false;
  }

  return stats;
}

/**
 * Returns recently modified files from the index (for context hot-files).
 *
 * @param {number} [limit=10]
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<Array<{path: string, mtime: number, size: number}>>}
 */
async function getRecentFiles(limit = 10, cwd = process.cwd()) {
  if (!indexExists(cwd)) {
    return [];
  }

  try {
    const db = await getDb(cwd);
    const rows = await db.all(
      "SELECT path, mtime, size FROM files ORDER BY mtime DESC LIMIT ?",
      limit,
    );
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * Ensures the index exists and is up-to-date (lazy update).
 * If the index doesn't exist, returns a message suggesting rebuild.
 * If it exists, runs a fast incremental update.
 *
 * @param {string} [cwd=process.cwd()]
 * @returns {Promise<{ready: boolean, message: string}>}
 */
async function ensureIndex(cwd = process.cwd()) {
  if (!indexExists(cwd)) {
    return {
      ready: false,
      message: "No project index found. Run /index rebuild to create one.",
    };
  }

  // Quick integrity check
  try {
    const db = await getDb(cwd);
    await db.get("SELECT COUNT(*) as cnt FROM files");
  } catch {
    // Corrupted DB — suggest rebuild
    await closeDb();
    // Delete corrupted DB so rebuild can start fresh
    try {
      await fs.promises.unlink(dbPath(cwd));
    } catch { /* ignore */ }
    return {
      ready: false,
      message: "Index database was corrupted and has been reset. Run /index rebuild.",
    };
  }

  // Fast lazy update
  try {
    const result = await updateIndex(cwd);
    return {
      ready: result.ok,
      message: result.message,
    };
  } catch (e) {
    return {
      ready: false,
      message: `Index update failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export {
  initIndex,
  rebuildIndex,
  updateIndex,
  findFiles,
  getIndexStats,
  getRecentFiles,
  ensureIndex,
  getDb,
  closeDb,
  indexExists,
  walkFiles,
  hashFile,
  INDEX_DIR,
};
