// ── patch_file tool wrapper ─────────────────────────────────────────
// Thin wrapper around patch-engine.js that handles file I/O,
// undo state, and result formatting for the tool registry.

import fs from "fs";
import path from "path";
import { loadUndoState, saveUndoState } from "../persistence.js";
import { success, error } from "../tool-result.js";
import { patchEngine } from "./patch-engine.js";

/**
 * Describes a file path relative to CWD for display.
 * @param {string} filePath
 * @returns {string}
 */
function describeFileChange(filePath) {
  const rel = path.relative(process.cwd(), filePath) || path.basename(filePath);
  return rel.replace(/\\/g, "/");
}

/**
 * Applies a targeted edit to a file using fuzzy matching.
 *
 * @param {string} p - File path
 * @param {string} oldString - String to find
 * @param {string} newString - Replacement string
 * @param {Object} [cfg={}] - Configuration
 * @returns {Promise<string>} Result message
 */
export async function patchFile(p, oldString, newString, cfg = {}) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return error(`❌ File not found: ${file}`);
    }

    const original = fs.readFileSync(file, "utf8");
    const desc = describeFileChange(file);

    const result = patchEngine(original, oldString, newString, desc);

    if (!result.success) {
      return error(`❌ ${result.error}`);
    }

    // Save undo state
    const undoState = loadUndoState();
    undoState.push({ path: file, existed: true, content: original, time: Date.now() });
    saveUndoState(undoState);

    // Write patched content
    fs.writeFileSync(file, result.patched, "utf8");

    const oldLines = oldString.replace(/\r\n/g, '\n').split('\n').length;
    const newLines = newString.replace(/\r\n/g, '\n').split('\n').length;
    const matchLabel = result.matchType === 'exact' ? '' : ` (${result.matchType} match${result.matchScore != null ? ` ${(result.matchScore * 100).toFixed(0)}%` : ''})`;

    const msg = `✅ Patched${matchLabel}: ${desc} (line ~${result.lineNum}, ${oldLines} lines → ${newLines} lines)`;
    const fullMsg = result.diagnostics ? `${msg}\n${result.diagnostics}` : msg;

    return success(fullMsg, null, {
      changedFiles: [file],
      bytesWritten: Buffer.byteLength(result.patched, 'utf8'),
      matchType: result.matchType,
      matchScore: result.matchScore
    });
  } catch (e) {
    return error(`❌ Patch error: ${e.message}`);
  }
}
