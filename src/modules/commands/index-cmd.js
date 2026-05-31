/**
 * index-cmd.js — Command handlers for /index and /find.
 *
 * /index        — Shows index statistics.
 * /index rebuild — Full reindex.
 * /index status  — Shows file changes since last index.
 * /find <query>  — Searches files by name.
 */

import {
  log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, WARNING, ERROR,
} from "../../core.js";

import {
  rebuildIndex,
  updateIndex,
  findFiles,
  getIndexStats,
  ensureIndex,
} from "../project-index.js";

/**
 * Formats a Unix timestamp as a human-readable relative time.
 * @param {number} ts - Unix timestamp (seconds).
 * @returns {string}
 */
function formatTimeAgo(ts) {
  if (!ts) return "never";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

/**
 * Formats a timestamp to a date string.
 * @param {number} ts - Unix timestamp (seconds).
 * @returns {string}
 */
function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Formats file size in human-readable form.
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Handles the /index command.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleIndex = async (ctx, input) => {
  if (input !== "/index" && !input.startsWith("/index ")) return null;

  const parts = input.split(/\s+/);
  const subcommand = parts[1] || "";
  const cwd = process.cwd();

  // ── /index (no args) — show statistics ──
  if (!subcommand) {
    const stats = await getIndexStats(cwd);

    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Project Index${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

    if (!stats.exists) {
      console.log(`  ${MUTED}No index found.${C.reset}`);
      console.log(`  ${TEXT_DIM}Run ${ACCENT("/index rebuild")}${TEXT_DIM} to create one.${C.reset}`);
      console.log("");
      return { handled: true };
    }

    console.log(`  ${TEXT}Files indexed:${C.reset} ${ACCENT(String(stats.fileCount))}`);
    console.log(`  ${TEXT}Database size:${C.reset} ${TEXT_DIM(stats.dbSize)}`);

    if (stats.lastFullIndex) {
      const lastIndex = parseInt(stats.lastFullIndex, 10);
      console.log(`  ${TEXT}Last full index:${C.reset} ${TEXT_DIM(formatDate(lastIndex))} ${MUTED(`(${formatTimeAgo(lastIndex)})`)}`);
    }

    if (stats.rootPath) {
      console.log(`  ${TEXT}Root:${C.reset} ${TEXT_DIM(stats.rootPath)}`);
    }

    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    console.log(`  ${TEXT_DIM}Commands: ${ACCENT("/index rebuild")}${MUTED(" | ")}${ACCENT("/index status")}${MUTED(" | ")}${ACCENT("/find <query>")}${C.reset}`);
    console.log("");
    return { handled: true };
  }

  // ── /index rebuild ──
  if (subcommand === "rebuild") {
    const result = await rebuildIndex(cwd);
    if (result.ok) {
      console.log(`  ${SUCCESS("✔")} ${C.bold}${TEXT("Index rebuild complete")}${C.reset}`);
      console.log(`  ${TEXT_DIM}${result.files} files indexed, database: ${result.dbSize}, time: ${result.elapsed}${C.reset}`);
    } else {
      log.err("Index rebuild failed.");
    }
    console.log("");
    return { handled: true };
  }

  // ── /index status ──
  if (subcommand === "status") {
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ Index Status${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

    const stats = await getIndexStats(cwd);
    if (!stats.exists) {
      console.log(`  ${MUTED}No index found. Run ${ACCENT("/index rebuild")} first.${C.reset}`);
      console.log("");
      return { handled: true };
    }

    // Run lazy update to detect changes
    const updateResult = await updateIndex(cwd);

    if (updateResult.ok) {
      console.log(`  ${SUCCESS("✔")} ${TEXT("Index is up to date")}${C.reset}`);
      console.log(`  ${TEXT}Total files:${C.reset} ${ACCENT(String(updateResult.total))}`);
      if (updateResult.updated > 0) {
        console.log(`  ${WARNING("⚠")} ${TEXT}Changed:${C.reset} ${WARNING(String(updateResult.updated))}`);
      }
      if (updateResult.added > 0) {
        console.log(`  ${SUCCESS("+")} ${TEXT}Added:${C.reset} ${SUCCESS(String(updateResult.added))}`);
      }
      if (updateResult.removed > 0) {
        console.log(`  ${ERROR("-")} ${TEXT}Removed:${C.reset} ${ERROR(String(updateResult.removed))}`);
      }
      if (updateResult.updated === 0 && updateResult.added === 0 && updateResult.removed === 0) {
        console.log(`  ${TEXT_DIM}No files have changed since last index.${C.reset}`);
      }
    } else {
      console.log(`  ${WARNING("⚠")} ${TEXT(updateResult.message)}${C.reset}`);
    }

    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    console.log("");
    return { handled: true };
  }

  log.err(`Unknown subcommand: ${subcommand}. Use: /index, /index rebuild, /index status`);
  return { handled: true };
};

/**
 * Handles the /find command.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleFind = async (ctx, input) => {
  if (!input.startsWith("/find") && !input.startsWith("/search")) return null;

  // Parse query
  const parts = input.split(/\s+/);
  const cmdName = parts[0]; // /find or /search
  const query = parts.slice(1).join(" ").trim();

  if (!query) {
    log.warn(`Usage: ${cmdName} <query> — search files by name`);
    return { handled: true };
  }

  const cwd = process.cwd();

  // First, ensure index is up to date (lazy update)
  const indexCheck = await ensureIndex(cwd);
  if (!indexCheck.ready) {
    log.warn(indexCheck.message);
    return { handled: true };
  }

  const results = await findFiles(query, { cwd });

  console.log("");
  console.log(`  ${ACCENT}${C.bold}◆ Find: ${TEXT(query)}${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

  if (results.length === 0) {
    console.log(`  ${MUTED}No files matching "${query}" found.${C.reset}`);
  } else {
    for (let i = 0; i < results.length; i++) {
      const f = results[i];
      const timeAgo = formatTimeAgo(f.mtime);
      const size = formatSize(f.size);
      console.log(
        `  ${TEXT_DIM(String(i + 1).padStart(2))}.${C.reset} ${TEXT(f.path)}${C.reset}`,
      );
      console.log(
        `     ${MUTED}modified ${timeAgo}${C.reset} ${TEXT_DIM(`· ${size}`)}${C.reset}`,
      );
    }
    if (results.length >= 20) {
      console.log(`  ${MUTED}… (showing top 20 results)${C.reset}`);
    }
  }

  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  console.log("");
  return { handled: true };
};

export { handleIndex, handleFind };
