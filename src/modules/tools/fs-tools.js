// ── File-system tools ──────────────────────────────────────────────
// list_dir, read_file, write_file, patch_file, move_file,
// copy_file, delete_file, get_system_info

import fs from "fs";
import path from "path";
import os from "os";
import { loadUndoState, saveUndoState } from "../persistence.js";
import { success, error } from "../tool-result.js";

/**
 * Formats a file path for display relative to CWD.
 * @param {string} filePath - Path to format.
 * @returns {string}
 */
export function describeFileChange(filePath) {
  const rel = path.relative(process.cwd(), filePath) || path.basename(filePath);
  return rel.replace(/\\/g, "/");
}

/**
 * Lists directory contents.
 * @param {string} p - Directory path.
 * @param {boolean} [recursive=false] - Recursive mode.
 * @returns {import("../tool-result.js").ToolResult}
 */
export function listDir(p, recursive = false) {
  try {
    const dir = path.resolve(p);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return error(`❌ Directory not found: ${dir}`);

    if (!recursive) {
      const entries = fs.readdirSync(dir).map(n => {
        try { return fs.statSync(path.join(dir, n)).isDirectory() ? n + "/" : n; } catch { return n; }
      }).sort();
      return success(null, entries.join("\n"));
    }

    const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", "venv"]);
    const MAX_ENTRIES = 500;
    const results = [];

    function walk(d, prefix, depth) {
      if (depth > 3 || results.length >= MAX_ENTRIES) return;
      let entries;
      try { entries = fs.readdirSync(d).sort(); } catch { return; }
      for (const entry of entries) {
        if (results.length >= MAX_ENTRIES) break;
        if (SKIP.has(entry)) { results.push(`${prefix}${entry}/ (skipped)`); continue; }
        const full = path.join(d, entry);
        try {
          const isDir = fs.statSync(full).isDirectory();
          results.push(`${prefix}${entry}${isDir ? "/" : ""}`);
          if (isDir) walk(full, prefix + "  ", depth + 1);
        } catch {
          results.push(`${prefix}${entry}`);
        }
      }
    }

    walk(dir, "", 0);
    if (results.length >= MAX_ENTRIES) results.push(`… (truncated at ${MAX_ENTRIES} entries)`);
    return success(null, results.join("\n"));
  } catch (e) { return error(`❌ Error: ${e.message}`); }
}

/**
 * Reads a file's content.
 * @param {string} p - File path.
 * @param {number} [startLine] - Start line (1-based).
 * @param {number} [endLine] - End line (inclusive).
 * @returns {import("../tool-result.js").ToolResult}
 */
export function readFile(p, startLine, endLine) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return error(`❌ File not found: ${file}`);

    let data = fs.readFileSync(file, "utf8");

    if (startLine || endLine) {
      const lines = data.split("\n");
      const start = Math.max(1, startLine || 1) - 1;
      const end = Math.min(lines.length, endLine || lines.length);
      const slice = lines.slice(start, end);
      const numbered = slice.map((l, i) => `${String(start + i + 1).padStart(4)} │ ${l}`);
      return success(`[Lines ${start + 1}-${end} of ${lines.length}]`, numbered.join("\n"));
    }

    if (data.length > 50000) data = data.slice(0, 50000) + `\n…[TRUNCATED: ${data.length} bytes total]…`;
    return success(null, data);
  } catch (e) { return error(`❌ Read error: ${e.message}`); }
}

/**
 * Writes content to a file.
 * @param {string} p - File path.
 * @param {string} content - Full content.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export async function writeFile(p, content, cfg = {}) {
  try {
    const file = path.resolve(p);
    const existed = fs.existsSync(file);
    const old = existed ? fs.readFileSync(file, "utf8") : "";
    const desc = describeFileChange(file);

    const undoState = loadUndoState();
    undoState.push({ path: file, existed, content: old, time: Date.now() });
    saveUndoState(undoState);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");

    return success(`✅ Written: ${desc} (${content.length} bytes)`, null, {
      changedFiles: [file],
      bytesWritten: content.length,
    });
  } catch (e) { return error(`❌ Write error: ${e.message}`); }
}

/**
 * Patches a file by replacing a string.
 * Delegates to the enhanced patch engine.
 * @param {string} p - File path.
 * @param {string} oldString - String to find.
 * @param {string} newString - Replacement string.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export { patchFile } from "./tools/patch-tool.js";

/**
 * Moves or renames a file or directory.
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export async function moveFile(from, to, cfg = {}) {
  try {
    const src = path.resolve(from);
    const dest = path.resolve(to);
    if (!fs.existsSync(src)) return error(`❌ Source not found: ${src}`);

    const descFrom = describeFileChange(src);
    const descTo = describeFileChange(dest);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);

    return success(`✅ Moved: ${descFrom} → ${descTo}`, null, { changedFiles: [src, dest] });
  } catch (e) { return error(`❌ Move error: ${e.message}`); }
}

/**
 * Copies a file or directory.
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export async function copyFile(from, to, cfg = {}) {
  try {
    const src = path.resolve(from);
    const dest = path.resolve(to);
    if (!fs.existsSync(src)) return error(`❌ Source not found: ${src}`);

    const descFrom = describeFileChange(src);
    const descTo = describeFileChange(dest);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }

    return success(`✅ Copied: ${descFrom} → ${descTo}`, null, { changedFiles: [dest] });
  } catch (e) { return error(`❌ Copy error: ${e.message}`); }
}

/**
 * Deletes a file or directory.
 * @param {string} p - Path to delete.
 * @param {boolean} [recursive=false] - Recursive delete.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<import("../tool-result.js").ToolResult>}
 */
export async function deleteFile(p, recursive = false, cfg = {}) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file)) return error(`❌ Path not found: ${file}`);

    const desc = describeFileChange(file);

    if (fs.statSync(file).isDirectory()) {
      if (!recursive) return error(`❌ ${desc} is a directory. Use recursive: true to delete.`);
      fs.rmSync(file, { recursive: true, force: true });
    } else {
      fs.unlinkSync(file);
    }

    return success(`✅ Deleted: ${desc}`, null, { changedFiles: [file] });
  } catch (e) { return error(`❌ Delete error: ${e.message}`); }
}

/**
 * Gets system information.
 * @returns {import("../tool-result.js").ToolResult}
 */
export function getSystemInfo() {
  const info = {
    platform: process.platform,
    arch: process.arch,
    node_version: process.version,
    cpus: os.cpus().length,
    memory_total: Math.round(os.totalmem() / (1024 * 1024)) + " MB",
    memory_free: Math.round(os.freemem() / (1024 * 1024)) + " MB",
    cwd: process.cwd(),
    shell: process.env.SHELL || "unknown",
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()) + "s"
  };
  return success("System info", info);
}
