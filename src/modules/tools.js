import fs from "fs";
import path from "path";
import os from "os";
import { createTwoFilesPatch } from "diff";
import { exec, execFileSync, execSync } from "child_process";
import { C, WARNING, SUCCESS, ERROR, MUTED, TEXT, TEXT_DIM, log, box, COLS, SHELL_TIMEOUT_MS } from "./ui.js";
import { CONF_FILE, DATA_DIR, UNDO_FILE } from "./config.js";
import { loadUndoState, saveUndoState } from "./persistence.js";
import { callApi } from "./api.js";
import { mcpManager } from "./mcp/manager.js";
import { toolRegistry } from "./tool-registry.js";
import { formatToolResult, success, error, info, cancelled } from "./tool-result.js";

/**
 * Core tool definitions for the AI model.
 * @type {Array<Object>}
 */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories at the given path. Returns sorted entries with '/' suffix for directories.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path to list" },
          recursive: { type: "boolean", description: "If true, list recursively (max 3 levels deep)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Large files are truncated to 50KB.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to read" },
          start_line: { type: "number", description: "Start reading from this line (1-based)" },
          end_line: { type: "number", description: "Stop reading at this line (inclusive)" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with the given content. Shows diff for confirmation.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to write" },
          content: { type: "string", description: "Full file content" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "patch_file",
      description: "Apply a targeted edit to a file. Replaces 'old_string' with 'new_string'. Use this instead of write_file when you only need to change part of a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to patch" },
          old_string: { type: "string", description: "Exact string to find and replace (must match exactly, including whitespace)" },
          new_string: { type: "string", description: "Replacement string" }
        },
        required: ["path", "old_string", "new_string"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "Move or rename a file or directory.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source path" },
          to: { type: "string", description: "Destination path" }
        },
        required: ["from", "to"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "copy_file",
      description: "Copy a file or directory.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source path" },
          to: { type: "string", description: "Destination path" }
        },
        required: ["from", "to"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file or directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to delete" },
          recursive: { type: "boolean", description: "If true, delete directory and its contents" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_info",
      description: "Get information about the current system (OS, Node version, etc.).",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description: "Search for files by name pattern. Fast, uses project index. Returns up to 20 matching file paths, sorted by modification time (most recent first).",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "File name pattern (partial match, e.g. 'auth', 'test.js', 'api')" },
          limit: { type: "number", description: "Max results (default 20, max 100)" }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep_search",
      description: "Search for a pattern across files in a directory. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Search pattern (regex supported)" },
          path: { type: "string", description: "Directory or file to search in (default: current dir)" },
          include: { type: "string", description: "File glob pattern to include (e.g. '*.js', '*.py')\"" },
          max_results: { type: "number", description: "Maximum results to return (default: 50)" }
        },
        required: ["pattern"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_shell",
      description: "Execute a shell command (Bash). Returns stdout, stderr, and exit code.",
      parameters: {
        type: "object",
        properties: {
          cmd: { type: "string", description: "Shell command to execute" }
        },
        required: ["cmd"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "http_request",
      description: "Make an HTTP request and return the response.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          headers: { type: "object", additionalProperties: { type: "string" } },
          body: { type: "string" },
          timeout_ms: { type: "number" }
        },
        required: ["url"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the internet using DuckDuckGo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          max_results: { type: "number" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "tool_chain",
      description: "Execute a sequence of tools in order. Useful for batch operations.",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tool: { type: "string" },
                args: { type: "object" }
              },
              required: ["tool"]
            }
          }
        },
        required: ["steps"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description: "Ask the user a question and get a text response.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          default: { type: "string" }
        },
        required: ["question"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "confirm",
      description: "Ask the user for yes/no confirmation.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
          default: { type: "boolean" }
        },
        required: ["message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "choose",
      description: "Present options to the user and get their choice.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          default_index: { type: "number" }
        },
        required: ["question", "options"]
      }
    }
  }
];

/**
 * Internal helper for reading a single line from stdin.
 * @param {string} prompt - Prompt text.
 * @param {boolean} [auto_yes=false] - If true, return default immediately.
 * @param {string} [defaultValue=""] - Default value to return.
 * @returns {Promise<string>} User input or default.
 */
async function promptLine(prompt, auto_yes = false, defaultValue = "") {
  if (auto_yes) return defaultValue || "";
  return new Promise(resolve => {
    process.stdout.write(`\n  ${TEXT}${prompt}${C.reset} `);
    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const value = d.toString().trim();
      resolve(value || defaultValue || "");
    };
    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      resolve(defaultValue || "");
    }, 10000);
    process.stdin.on("data", onData);
  });
}

/**
 * Asks the user a question.
 * @param {string} question - The question to ask.
 * @param {boolean} [auto_yes=false] - Auto-yes mode.
 * @param {string} [defaultValue=""] - Default response.
 * @returns {Promise<string>}
 */
async function askUser(question, auto_yes = false, defaultValue = "") {
  const hint = defaultValue ? `(${defaultValue})` : "";
  return await promptLine(`${question} ${MUTED}${hint}${C.reset}`, auto_yes, defaultValue);
}

/**
 * Asks the user for confirmation.
 * @param {string} message - The confirmation message.
 * @param {boolean} [auto_yes=false] - Auto-yes mode.
 * @param {boolean} [defaultValue=false] - Default boolean value.
 * @returns {Promise<boolean>}
 */
async function confirmUser(message, auto_yes = false, defaultValue = false) {
  if (auto_yes) return !!defaultValue;
  return new Promise(resolve => {
    process.stdout.write(`\n  ${TEXT}${message} ${MUTED}[${SUCCESS}y${MUTED}/${ERROR}N${MUTED}]${TEXT_DIM} (auto-yes 10s)${C.reset} `);
    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const answer = d.toString().trim().toLowerCase();
      if (!answer) resolve(!!defaultValue);
      else resolve(answer === "y" || answer === "yes");
    };
    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      resolve(!!defaultValue);
    }, 10000);
    process.stdin.on("data", onData);
  });
}

/**
 * Presents a list of options to the user.
 * @param {string} question - Selection prompt.
 * @param {Array<string>} options - List of choices.
 * @param {boolean} [auto_yes=false] - Auto-yes mode.
 * @param {number} [defaultIndex=0] - Default option index.
 * @returns {Promise<string>} Selected option.
 */
async function chooseUser(question, options, auto_yes = false, defaultIndex = 0) {
  const safeOptions = Array.isArray(options) ? options : [];
  const idx = Math.min(Math.max(parseInt(defaultIndex, 10) || 0, 0), Math.max(safeOptions.length - 1, 0));
  if (auto_yes) return safeOptions[idx] ?? "";
  const list = safeOptions.map((opt, i) => `  ${TEXT_DIM}${i + 1}.${C.reset} ${TEXT}${opt}${C.reset}`).join("\n");
  console.log(`\n${list}`);
  const answer = await promptLine(`${question} ${MUTED}(1-${safeOptions.length})${C.reset}`, auto_yes, String(idx + 1));
  const num = parseInt(answer, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= safeOptions.length) return safeOptions[num - 1];
  return safeOptions[idx] ?? "";
}

/** @returns {boolean} True if git is installed */
function isGitAvailable() {
  try { execSync("git --version", { stdio: "ignore" }); return true; } catch { return false; }
}

/** @returns {boolean} True if current directory is inside a git repo */
function isInsideGitRepo() {
  try { execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" }); return true; } catch { return false; }
}

/**
 * Ensures a git repository exists in the current directory.
 * @returns {boolean}
 */
function ensureGitRepo() {
  if (!isGitAvailable()) return false;
  if (isInsideGitRepo()) return true;
  try { execSync("git init", { stdio: "ignore" }); return true; } catch { return false; }
}

/** Sets default git user if not configured. */
function ensureGitUser() {
  try {
    const name = execSync("git config user.name", { encoding: "utf8" }).trim();
    const email = execSync("git config user.email", { encoding: "utf8" }).trim();
    if (!name) execSync('git config user.name "Meow CLI"');
    if (!email) execSync('git config user.email "meowcli@local"');
  } catch { /* ignore */ }
}

/** @returns {boolean} True if there are uncommitted changes */
function gitHasChanges() {
  try { return execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0; } catch { return false; }
}

/**
 * Escapes a string for shell use.
 * @param {string} value - String to escape.
 * @returns {string}
 */
function escapeShellArg(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[\r\n]+/g, " ").trim();
}

/**
 * Shortens a shell command for display.
 * @param {string} cmd - Command string.
 * @returns {string}
 */
function describeShellCommand(cmd) {
  return escapeShellArg(cmd).slice(0, 80) || "shell command";
}

/**
 * Formats a file path for display relative to CWD.
 * @param {string} filePath - Path to format.
 * @returns {string}
 */
function describeFileChange(filePath) {
  const rel = path.relative(process.cwd(), filePath) || path.basename(filePath);
  return rel.replace(/\\/g, "/");
}

/**
 * Truncates a preview string to keep prompts readable.
 * @param {string} text - Text to truncate.
 * @param {number} [maxChars=4000] - Character limit.
 * @returns {string}
 */
function truncatePreview(text, maxChars = 4000) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…[TRUNCATED]…";
}

/**
 * Gets a summary of staged git changes.
 * @param {number} [maxChars=6000] - Character limit.
 * @returns {string}
 */
function getStagedDiffSummary(maxChars = 6000) {
  try {
    const diff = execSync("git diff --cached --stat", { encoding: "utf8" }).trim();
    if (!diff) return "";
    if (diff.length > maxChars) return diff.slice(0, maxChars) + "\n…";
    return diff;
  } catch { return ""; }
}

/**
 * Generates an AI-powered git commit message.
 * @param {Object} data - Commit data.
 * @param {string} data.summary - Diff summary.
 * @param {string} data.fallback - Fallback message.
 * @param {Object} cfg - Configuration.
 * @returns {Promise<string>}
 */
async function generateAiCommitMessage({ summary, fallback }, cfg) {
  if (!cfg?.api_key) return fallback;
  const profile = cfg.profiles?.[cfg.profile] || cfg.profiles?.default || { temperature: 0.2 };
  const system = "You are a senior engineer. Write a concise git commit message (imperative mood, <= 72 chars). Return ONLY the message.";
  const user = summary
    ? `Summarize this staged diff into a single commit message:\n\n${summary}`
    : `Write a concise git commit message for the changes. Use: ${fallback}`;

  try {
    const data = await callApi(
      [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      { ...cfg, profile: cfg.profile, profiles: { ...cfg.profiles, [cfg.profile]: { ...profile, temperature: 0.2 } } }
    );
    const msg = data?.choices?.[0]?.message?.content?.trim();
    if (!msg) return fallback;
    return msg.split("\n")[0].slice(0, 72);
  } catch {
    return fallback;
  }
}

/**
 * Automatically stages and commits changes if enabled.
 * @param {string} message - Default commit message.
 * @param {Object} cfg - Configuration.
 */
async function autoGitCommit(message, cfg) {
  const gitCfg = cfg?.git || {};
  if (gitCfg.autocommit === false) return;
  if (!ensureGitRepo()) return;
  try {
    if (!gitHasChanges()) return;
    ensureGitUser();
    execSync("git add -A", { stdio: "ignore" });
    const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim();
    if (!staged) return;

    const rawPrefix = gitCfg.prefix;
    const prefix = typeof rawPrefix === "string" ? rawPrefix.trim() : "";
    const fallback = prefix ? `${prefix}: ${message}` : message;

    let finalMessage = fallback;
    if (gitCfg.ai_message !== false) {
      const maxChars = Number.isFinite(gitCfg.ai_max_diff_chars) ? gitCfg.ai_max_diff_chars : 6000;
      const summary = getStagedDiffSummary(maxChars);
      const aiMessage = await generateAiCommitMessage({ summary, fallback }, cfg);
      finalMessage = prefix ? `${prefix}: ${aiMessage}` : aiMessage;
    }

    execSync(`git commit -m ${JSON.stringify(finalMessage)}`, { stdio: "ignore" });
  } catch { /* ignore */ }
}

/**
 * Moves or renames a file or directory.
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<string>} Result message.
 */
async function moveFile(from, to, cfg = {}) {
  try {
    const src = path.resolve(from);
    const dest = path.resolve(to);
    if (!fs.existsSync(src)) return error(`❌ Source not found: ${src}`);

    const descFrom = describeFileChange(src);
    const descTo = describeFileChange(dest);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);

    autoGitCommit(`move ${descFrom} to ${descTo}`, cfg);
    return success(`✅ Moved: ${descFrom} → ${descTo}`, null, { changedFiles: [src, dest] });
  } catch (e) { return error(`❌ Move error: ${e.message}`); }
}

/**
 * Copies a file or directory.
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<string>} Result message.
 */
async function copyFile(from, to, cfg = {}) {
  try {
    const src = path.resolve(from);
    const dest = path.resolve(to);
    if (!fs.existsSync(src)) return error(`❌ Source not found: ${src}`);

    const descFrom = describeFileChange(src);
    const descTo = describeFileChange(dest);

    const approved = await confirmUser(
      `Copy ${descFrom} to ${descTo}?`,
      cfg.auto_yes,
      false
    );
    // if (!approved) return cancelled(`ℹ Cancelled copy_file.`);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }

    autoGitCommit(`copy ${descFrom} to ${descTo}`, cfg);
    return success(`✅ Copied: ${descFrom} → ${descTo}`, null, { changedFiles: [dest] });
  } catch (e) { return error(`❌ Copy error: ${e.message}`); }
}

/**
 * Deletes a file or directory.
 * @param {string} p - Path to delete.
 * @param {boolean} [recursive=false] - Recursive delete.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<string>} Result message.
 */
async function deleteFile(p, recursive = false, cfg = {}) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file)) return `❌ Path not found: ${file}`;

    const desc = describeFileChange(file);
    const approved = await confirmUser(
      `DELETE ${desc}${recursive ? ' (recursively)' : ''}?`,
      cfg.auto_yes,
      false
    );
    // if (!approved) return `ℹ Cancelled delete_file.`;

    if (fs.statSync(file).isDirectory()) {
      if (!recursive) return `❌ ${desc} is a directory. Use recursive: true to delete.`;
      fs.rmSync(file, { recursive: true, force: true });
    } else {
      fs.unlinkSync(file);
    }

    autoGitCommit(`delete ${desc}`, cfg);
    return `✅ Deleted: ${desc}`;
  } catch (e) { return `❌ Delete error: ${e.message}`; }
}

/**
 * Gets system information.
 * @returns {string} System info JSON.
 */
function getSystemInfo() {
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

/**
 * Lists directory contents.
 * @param {string} p - Directory path.
 * @param {boolean} [recursive=false] - Recursive mode.
 * @returns {string} Formatted list or error message.
 */
function listDir(p, recursive = false) {
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
 * @returns {string} File content or error.
 */
function readFile(p, startLine, endLine) {
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
 * @returns {Promise<string>} Result message.
 */
async function writeFile(p, content, cfg = {}) {
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

    autoGitCommit(`update ${desc}`, cfg);

    return success(`✅ Written: ${desc} (${content.length} bytes)`, null, {
      changedFiles: [file],
      bytesWritten: content.length,
    });
  } catch (e) { return error(`❌ Write error: ${e.message}`); }
}

/**
 * Patches a file by replacing a string.
 * @param {string} p - File path.
 * @param {string} oldString - String to find.
 * @param {string} newString - Replacement string.
 * @param {Object} [cfg={}] - Configuration.
 * @returns {Promise<string>} Result message.
 */
async function patchFile(p, oldString, newString, cfg = {}) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return error(`❌ File not found: ${file}`);
    }

    const original = fs.readFileSync(file, "utf8");

    const index = original.indexOf(oldString);
    if (index === -1) {
      const lines = original.split("\n");
      const firstWords = oldString.split("\n")[0].trim().slice(0, 40);
      const candidates = lines
        .map((l, i) => ({ line: i + 1, text: l }))
        .filter(l => l.text.includes(firstWords.slice(0, 20)))
        .slice(0, 3);

      let hint = "";
      if (candidates.length > 0) {
        hint = `\nPossible matches near:\n${candidates.map(c => `  L${c.line}: ${c.text.slice(0, 80)}`).join("\n")}`;
      }

      return error(`❌ old_string not found in ${describeFileChange(file)}.${hint}\nMake sure the string matches exactly (including whitespace and indentation).`);
    }

    const secondIndex = original.indexOf(oldString, index + 1);
    if (secondIndex !== -1) {
      const lineNum1 = original.slice(0, index).split("\n").length;
      const lineNum2 = original.slice(0, secondIndex).split("\n").length;
      return error(`❌ old_string found multiple times (lines ${lineNum1} and ${lineNum2}). Please provide a more specific/unique string to match.`);
    }

    const patched = original.slice(0, index) + newString + original.slice(index + oldString.length);
    const desc = describeFileChange(file);

    const undoState = loadUndoState();
    undoState.push({ path: file, existed: true, content: original, time: Date.now() });
    saveUndoState(undoState);

    fs.writeFileSync(file, patched, "utf8");

    const lineNum = original.slice(0, index).split("\n").length;
    autoGitCommit(`patch ${desc}`, cfg);

    return success(`✅ Patched: ${desc} (line ~${lineNum}, ${oldString.split("\n").length} lines → ${newString.split("\n").length} lines)`, null, {
      changedFiles: [file],
      bytesWritten: Buffer.byteLength(patched, "utf8"),
    });
  } catch (e) { return error(`❌ Patch error: ${e.message}`); }
}

/**
 * Searches for a pattern in files.
 * @param {string} pattern - Search regex.
 * @param {string} searchPath - Directory to search.
 * @param {string} [include] - Glob include pattern.
 * @param {number} [maxResults=50] - Limit results.
 * @returns {string} Search results.
 */
function grepSearch(pattern, searchPath, include, maxResults = 50) {
  try {
    const dir = path.resolve(searchPath || ".");
    if (!fs.existsSync(dir)) return `❌ Path not found: ${dir}`;

    try {
      const args = ["-rn", "--color=never"];
      if (include) args.push(`--include=${include}`);
      args.push("-E", pattern, dir);

      const output = execFileSync("grep", args, {
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
        timeout: 10000,
      }).trim();

      if (!output) return "ℹ No matches found.";

      const lines = output.split("\n").slice(0, maxResults);
      const results = lines.map(line => {
        const rel = line.replace(dir + "/", "").replace(dir + "\\", "");
        return rel;
      });

      let result = results.join("\n");
      if (output.split("\n").length > maxResults) {
        result += `\n… (${output.split("\n").length - maxResults} more matches)`;
      }
      return result;

    } catch (e) {
      if (e.status === 1) return "ℹ No matches found.";
      return grepSearchJS(pattern, dir, include, maxResults);
    }
  } catch (e) { return `❌ Search error: ${e.message}`; }
}

/**
 * Pure JS fallback for grepSearch.
 * @private
 */
function grepSearchJS(pattern, dir, include, maxResults) {
  const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__"]);
  const regex = new RegExp(pattern, "gi");
  const globRegex = include ? new RegExp("^" + include.replace(/\*/g, ".*").replace(/\?/g, ".") + "$") : null;
  const results = [];

  function walk(d, depth) {
    if (depth > 5 || results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(d); } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (SKIP.has(entry) || entry.startsWith(".")) continue;

      const full = path.join(d, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (stat.isFile() && stat.size < 1024 * 1024) {
          if (globRegex && !globRegex.test(entry)) continue;
          const content = fs.readFileSync(full, "utf8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (regex.test(lines[i])) {
              const rel = path.relative(dir, full);
              results.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 150)}`);
            }
            regex.lastIndex = 0;
          }
        }
      } catch { /* skip */ }
    }
  }

  walk(dir, 0);
  if (results.length === 0) return "ℹ No matches found.";
  let result = results.join("\n");
  if (results.length >= maxResults) result += `\n… (truncated at ${maxResults} results)`;
  return result;
}

/**
 * Runs a shell command.
 * @param {string} cmd - Command to run.
 * @param {Object} [cfg={}] - Configuration.
 * @param {Object} [env=process.env] - Environment variables.
 * @returns {Promise<string>} Command output.
 */
async function runShell(cmd, cfg = {}, env = process.env) {
  const desc = describeShellCommand(cmd);
  const approved = await confirmUser(
    `Run shell command?\n${TEXT_DIM}${cmd}${C.reset}`,
    cfg.auto_yes,
    false
  );
  //if (!approved) return `ℹ Cancelled run_shell: ${desc}`;

  const timeoutMs = Number.isFinite(SHELL_TIMEOUT_MS) && SHELL_TIMEOUT_MS > 0 ? SHELL_TIMEOUT_MS : 30000;
  return new Promise(resolve => {
    exec(
      cmd,
      {
        maxBuffer: 10 * 1024 * 1024,
        cwd: process.cwd(),
        timeout: timeoutMs,
        killSignal: "SIGTERM",
        env: env,
      },
      (err, stdout, stderr) => {
        const output = [];
        if (stdout) output.push(`STDOUT:\n${stdout.trim()}`);
        if (stderr) output.push(`STDERR:\n${stderr.trim()}`);
        if (err && err.killed) {
          output.push(`⚠ Process killed after ${timeoutMs}ms`);
        }
        if (err && err.code !== null && err.code !== undefined) output.push(`EXIT CODE: ${err.code}`);

        autoGitCommit(`shell ${desc}`, cfg);

        resolve(output.join("\n\n") || "✅ Done (no output).");
      }
    );
  });
}

/**
 * Makes an HTTP request.
 * Полностью игнорирует скрытый/невидимый текст в HTML
 * и выводит warning в консоль при обнаружении.
 *
 * @param {Object} options - Request options.
 * @returns {Promise<string>} Response details.
 */

function stripHiddenContent(html) {
  if (!html || typeof html !== "string") return html;

  let removed = 0;

  const patterns = [
    // script/style/noscript/template
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /<noscript[\s\S]*?<\/noscript>/gi,
    /<template[\s\S]*?<\/template>/gi,

    // hidden attribute
    /<[^>]*\shidden(?:=["'][^"']*["'])?[^>]*>[\s\S]*?<\/[^>]+>/gi,

    // aria-hidden="true"
    /<[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi,

    // display:none
    /<[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,

    // visibility:hidden
    /<[^>]*style=["'][^"']*visibility\s*:\s*hidden[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,

    // opacity:0
    /<[^>]*style=["'][^"']*opacity\s*:\s*0[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,

    // extremely offscreen elements
    /<[^>]*style=["'][^"']*(left\s*:\s*-?\d{3,}px|top\s*:\s*-?\d{3,}px)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
  ];

  for (const pattern of patterns) {
    html = html.replace(pattern, (match) => {
      removed++;
      return "";
    });
  }

  if (removed > 0) {
    console.warn(
      `[httpRequest] Ignored ${removed} hidden/invisible HTML block(s)`
    );
  }

  return html;
}

async function httpRequest(
  {
    url,
    method = "GET",
    headers = {},
    body = "",
    timeout_ms = 15000,
  },
  cfg = {}
) {
  if (!url) return "❌ Error: url required";

  const bodyPreview =
    body && method !== "GET" && method !== "HEAD"
      ? `\nBody: ${truncatePreview(body, 600)}`
      : "";

  const approved = await confirmUser(
    `Make HTTP request?\n${TEXT_DIM}${method} ${url}${bodyPreview}${C.reset}`,
    cfg.auto_yes,
    false
  );

  //if (!approved) return `ℹ Cancelled http_request: ${method} ${url}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body:
        body && method !== "GET" && method !== "HEAD"
          ? body
          : undefined,
      signal: controller.signal,
    });

    let data = await res.text();

    // Игнорируем скрытый текст
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const originalLength = data.length;
      data = stripHiddenContent(data);

      if (originalLength !== data.length) {
        console.warn(
          `[httpRequest] Hidden content stripped (${originalLength - data.length} chars removed)`
        );
      }
    }

    if (data.length > 50000) {
      data = data.slice(0, 50000) + `\n…[TRUNCATED]…`;
    }

    const headersObj = {};
    res.headers.forEach((v, k) => {
      headersObj[k] = v;
    });

    return [
      `STATUS: ${res.status} ${res.statusText}`,
      `HEADERS: ${JSON.stringify(headersObj, null, 2)}`,
      `BODY:\n${data}`,
    ].join("\n\n");

  } catch (e) {
    return `❌ HTTP Error: ${
      e.name === "AbortError" ? "Timeout" : e.message
    }`;
  } finally {
    clearTimeout(t);
  }
}



/**
 * Performs a web search.
 * @param {Object} options - Search options.
 * @returns {Promise<string>} Search results JSON.
 */
async function webSearch({ query, max_results = 5 }, cfg = {}) {
  if (!query) return "❌ Error: query required";
  const approved = await confirmUser(
    `Run web search?\n${TEXT_DIM}query=${query}\nmax_results=${max_results}${C.reset}`,
    cfg.auto_yes,
    false
  );
  //if (!approved) return `ℹ Cancelled web_search: ${query}`;
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "meowcli/1.0" } });
    const html = await res.text();
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]*href="(.*?)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push({
        title: m[2].replace(/<[^>]+>/g, ""),
        url: m[1],
        snippet: m[3].replace(/<[^>]+>/g, ""),
      });
      if (results.length >= max_results) break;
    }
    return results.length === 0 ? "ℹ No results." : JSON.stringify(results, null, 2);
  } catch (e) { return `❌ Search error: ${e.message}`; }
}

/**
 * Executes a sequence of tools.
 * @param {Array<Object>} steps - Tool steps.
 * @param {Object} cfg - Configuration.
 * @param {Object} env - Environment.
 * @returns {Promise<string>} Sequence results JSON.
 */
async function toolChain(steps, cfg, env) {
  if (!Array.isArray(steps) || steps.length === 0) return "❌ Error: steps empty";
  const outputs = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    let result = await executeTool(step.tool, step.args || {}, cfg, env);
    outputs.push({ step: i + 1, tool: step.tool, result });
  }
  return JSON.stringify(outputs, null, 2);
}

/**
 * Main tool execution router — thin dispatcher over ToolRegistry.
 * @param {string} name - Tool name.
 * @param {Object} args - Tool arguments.
 * @param {Object} cfg - Configuration.
 * @param {Object} [env] - Environment.
 * @returns {Promise<string>} Tool output (string for backward compat).
 */
async function executeTool(name, args, cfg, env = process.env) {
  const cleanName = (name || "").replace(/^proxy_/, "");

  // 1) Dispatch via registry
  if (toolRegistry.has(cleanName)) {
    const result = await toolRegistry.execute(cleanName, args, cfg, env);
    return formatToolResult(result);
  }

  // 2) MCP tools (dynamic namespace)
  if (cleanName.startsWith("mcp__")) {
    try {
      return await mcpManager.executeMcpTool(cleanName, args);
    } catch (e) {
      return `❌ MCP Error: ${e.message}`;
    }
  }

  return `❌ Unknown tool: ${name}`;
}

/**
 * Extended tool definitions (v3 agents/git/ci).
 * @type {Array<Object>}
 */
const EXTENDED_TOOLS = [
  {
    type: "function",
    function: {
      name: "delegate_task",
      description: "Delegate subtasks to parallel sub-agents. Each sub-agent runs independently with its own token budget. Use for multi-file operations, parallel searches, batch refactoring.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Clear task description for the sub-agent" },
                tools: { type: "array", items: { type: "string" }, description: "Tools this sub-agent may use" },
                max_tokens: { type: "number", description: "Token budget for this sub-agent (default: auto)" },
              },
              required: ["description"]
            },
            description: "Array of subtasks to run in parallel"
          }
        },
        required: ["tasks"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show git diff (staged or unstaged changes)",
      parameters: {
        type: "object", properties: {
          staged: { type: "boolean", description: "Show staged changes" },
          file: { type: "string", description: "Specific file" },
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_log",
      description: "Show recent git commits",
      parameters: {
        type: "object", properties: {
          count: { type: "number", description: "Number of commits (default 10)" },
          file: { type: "string", description: "Filter by file" },
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_commit",
      description: "Stage and commit changes",
      parameters: {
        type: "object", properties: {
          message: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        }, required: ["message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_branch",
      description: "List, create, or checkout branches",
      parameters: {
        type: "object", properties: {
          create: { type: "boolean" }, checkout: { type: "boolean" }, name: { type: "string" },
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Show git working tree status",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "ci_pipeline",
      description: "Manage CI/CD. Actions: status (list workflows), generate (create GitHub Actions), heal (auto-fix failing tests)",
      parameters: {
        type: "object", properties: {
          action: { type: "string", enum: ["status", "generate", "heal"] },
          description: { type: "string" },
          name: { type: "string" },
        }, required: ["action"]
      }
    }
  },
];

/**
 * Linux system management tool definitions (Beta).
 * @type {Array<Object>}
 */
const LINUX_TOOLS = [
  {
    type: "function",
    function: {
      name: "linux_process_list",
      description: "List top 20 running processes by CPU usage.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "linux_process_kill",
      description: "Kill a process by PID.",
      parameters: {
        type: "object",
        properties: {
          pid: { type: "number", description: "Process ID" },
          signal: { type: "string", description: "Signal to send (default: SIGTERM)" }
        },
        required: ["pid"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "linux_service_control",
      description: "Manage systemd services (start, stop, restart, status, enable, disable).",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Service name (e.g., 'nginx')" },
          action: { type: "string", enum: ["start", "stop", "restart", "status", "enable", "disable"] }
        },
        required: ["service", "action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "linux_disk_usage",
      description: "Check disk space usage (df -h).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "linux_net_stat",
      description: "Check network connections and listening ports.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "linux_pkg_manage",
      description: "Basic Linux package management (install/update). Supports apt, dnf, yum, pacman.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["install", "update"] },
          package: { type: "string", description: "Package name to install (if action is install)" }
        },
        required: ["action"]
      }
    }
  }
];

/** All available tools combined. */
const ALL_TOOLS = [...TOOLS, ...EXTENDED_TOOLS, ...LINUX_TOOLS];

export {
  TOOLS, ALL_TOOLS, EXTENDED_TOOLS,
  promptLine, askUser, confirmUser, chooseUser,
  listDir, readFile, writeFile, patchFile, moveFile, copyFile, deleteFile, getSystemInfo, grepSearch,
  runShell, httpRequest, webSearch, toolChain, executeTool
};
