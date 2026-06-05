/**
 * Tool Registry Initialization
 *
 * Registers all tool implementations with the central ToolRegistry.
 * Handles both legacy (string-returning) and modern (ToolResult-returning)
 * implementations via adapters.
 *
 * Import and call `initToolRegistry()` once during CLI startup.
 */

import { toolRegistry } from "./tool-registry.js";
import { success, error, info, cancelled } from "./tool-result.js";

// ── core tools (already return ToolResult) ──
import {
  listDir,
  readFile,
  writeFile,
  patchFile,
  moveFile,
  copyFile,
  getSystemInfo,
} from "./tools.js";

// ── core tools (still return raw strings — adapt inline) ──
import {
  grepSearch as _grepSearch,
  runShell as _runShell,
  askUser as _askUser,
  confirmUser as _confirmUser,
  chooseUser as _chooseUser,
  httpRequest as _httpRequest,
  webSearch as _webSearch,
  toolChain as _toolChain,
  deleteFile as _deleteFile,
} from "./tools.js";

// ── mcp manager ──
import { mcpManager } from "./mcp/manager.js";

// ── helpers ──

/**
 * Wraps a legacy string-returning function so it returns a ToolResult.
 * Detects ✅ / ❌ / ℹ prefixes to set success/status.
 */
function wrapLegacy(fn) {
  return async (args, cfg, env) => {
    try {
      const str = await fn(args, cfg, env);
      return stringToResult(str);
    } catch (e) {
      return error(`❌ ${e.message}`);
    }
  };
}

/** Sync version of wrapLegacy */
function wrapLegacySync(fn) {
  return (args, cfg, env) => {
    try {
      const str = fn(args, cfg, env);
      return stringToResult(str);
    } catch (e) {
      return error(`❌ ${e.message}`);
    }
  };
}

/**
 * Converts a legacy status-prefixed string to a ToolResult.
 */
function stringToResult(str) {
  if (typeof str !== "string") {
    return success(null, str);
  }
  if (str.startsWith("✅")) return success(str);
  if (str.startsWith("❌")) return error(str);
  if (str.startsWith("ℹ")) return info(str);
  // plain output → success with data
  return success(null, str);
}

// ── adapted handlers ──

// Async legacy tools
const _deleteFileAdapted = async (args, cfg) => {
  const str = await _deleteFile(args.path, args.recursive, cfg);
  return stringToResult(str);
};

const _runShellAdapted = async (args, cfg, env) => {
  const str = await _runShell(args.cmd, cfg, env);
  return stringToResult(str);
};

const _askUserAdapted = async (args, cfg) => {
  const str = await _askUser(args.question, cfg.auto_yes, args.default || "");
  return success(str); // user responses are always "success"
};

const _confirmUserAdapted = async (args, cfg) => {
  const val = await _confirmUser(args.message, cfg.auto_yes, args.default);
  return success(String(val), val);
};

const _chooseUserAdapted = async (args, cfg) => {
  const str = await _chooseUser(args.question, args.options, cfg.auto_yes, args.default_index);
  return success(str);
};

const _httpRequestAdapted = async (args, cfg) => {
  const str = await _httpRequest(args, cfg);
  return stringToResult(str);
};

const _webSearchAdapted = async (args, cfg) => {
  const str = await _webSearch(args, cfg);
  return stringToResult(str);
};

const _toolChainAdapted = async (args, cfg, env) => {
  const str = await _toolChain(args.steps, cfg, env);
  return stringToResult(str);
};

// ── git/ci tools (still return raw strings) ──

let _gitDiff, _gitLog, _gitCommit, _gitBranch, _gitStatus, _ciTool;
async function _ensureGitTools() {
  if (!_gitDiff) {
    const mod = await import("./smart/cicd.js");
    _gitDiff = mod.gitDiff;
    _gitLog = mod.gitLog;
    _gitCommit = mod.gitCommit;
    _gitBranch = mod.gitBranch;
    _gitStatus = mod.gitStatus;
    _ciTool = mod.ciTool;
  }
}

const gitDiffHandler = async (args) => { await _ensureGitTools(); return stringToResult(_gitDiff(args)); };
const gitLogHandler = async (args) => { await _ensureGitTools(); return stringToResult(_gitLog(args)); };
const gitCommitHandler = async (args) => { await _ensureGitTools(); return stringToResult(_gitCommit(args)); };
const gitBranchHandler = async (args) => { await _ensureGitTools(); return stringToResult(_gitBranch(args)); };
const gitStatusHandler = async () => { await _ensureGitTools(); return stringToResult(_gitStatus()); };
const ciPipelineHandler = async (args, cfg) => { await _ensureGitTools(); return stringToResult(await _ciTool(args, cfg)); };

// ── linux tools (still return raw strings) ──

let _linuxProcessList, _linuxProcessKill, _linuxServiceControl, _linuxDiskUsage, _linuxNetStat, _linuxPkgManage;
async function _ensureLinuxTools() {
  if (!_linuxProcessList) {
    const mod = await import("./linux-sys.js");
    _linuxProcessList = mod.linuxProcessList;
    _linuxProcessKill = mod.linuxProcessKill;
    _linuxServiceControl = mod.linuxServiceControl;
    _linuxDiskUsage = mod.linuxDiskUsage;
    _linuxNetStat = mod.linuxNetStat;
    _linuxPkgManage = mod.linuxPkgManage;
  }
}

const linuxProcessListHandler = async () => { await _ensureLinuxTools(); return stringToResult(_linuxProcessList()); };
const linuxProcessKillHandler = async (args, cfg) => { await _ensureLinuxTools(); return stringToResult(await _linuxProcessKill(args, cfg)); };
const linuxServiceControlHandler = async (args, cfg) => { await _ensureLinuxTools(); return stringToResult(await _linuxServiceControl(args, cfg)); };
const linuxDiskUsageHandler = async () => { await _ensureLinuxTools(); return stringToResult(_linuxDiskUsage()); };
const linuxNetStatHandler = async () => { await _ensureLinuxTools(); return stringToResult(_linuxNetStat()); };
const linuxPkgManageHandler = async (args, cfg) => { await _ensureLinuxTools(); return stringToResult(await _linuxPkgManage(args, cfg)); };

// ── find_files (dynamic import) ──
const findFilesHandler = async (args) => {
  const { findFiles, indexExists } = await import("./project-index.js");
  const { formatBytes, timeAgo } = await import("./utils.js");

  if (!indexExists()) {
    return info("ℹ Index not found. Run /index rebuild first.");
  }

  const limit = Math.min(args.limit || 20, 100);
  const results = await findFiles(args.pattern, { limit });

  if (!results || results.length === 0) return info("ℹ No matching files found.");
  const text = results.map(f => `${f.path} (${formatBytes(f.size)}, ${timeAgo(f.mtime * 1000)})`).join("\n");
  return success(null, text);
};

// ── delegate_task (dynamic import) ──
const delegateTaskHandler = async (args, cfg) => {
  const { delegateTask } = await import("./agents/subagent.js");
  const str = await delegateTask(args, cfg);
  return stringToResult(str);
};

// ── mcp tools ──
const mcpHandler = async (args, cfg, env) => {
  // MCP tools are dispatched by name prefix in executeTool, not registered individually
  return error("❌ MCP tools must be called via executeTool directly");
};

// ── REGISTRATION ──

/**
 * Initialize the ToolRegistry with all known tools.
 * Call once during CLI startup.
 */
export function initToolRegistry() {
  // File operations
  toolRegistry.set("list_dir", (args) => listDir(args.path, args.recursive));
  toolRegistry.set("read_file", (args) => readFile(args.path, args.start_line, args.end_line));
  toolRegistry.set("write_file", (args, cfg) => writeFile(args.path, args.content, cfg));
  toolRegistry.set("patch_file", (args, cfg) => patchFile(args.path, args.old_string, args.new_string, cfg));
  toolRegistry.set("move_file", (args, cfg) => moveFile(args.from, args.to, cfg));
  toolRegistry.set("copy_file", (args, cfg) => copyFile(args.from, args.to, cfg));
  toolRegistry.set("delete_file", _deleteFileAdapted);
  toolRegistry.set("get_system_info", () => getSystemInfo());
  toolRegistry.set("find_files", findFilesHandler);

  // Search
  toolRegistry.set("grep_search", (args) => stringToResult(_grepSearch(args.pattern, args.path, args.include, args.max_results)));

  // Shell & network
  toolRegistry.set("run_shell", _runShellAdapted);
  toolRegistry.set("http_request", _httpRequestAdapted);
  toolRegistry.set("web_search", _webSearchAdapted);

  // User interaction
  toolRegistry.set("ask_user", _askUserAdapted);
  toolRegistry.set("confirm", _confirmUserAdapted);
  toolRegistry.set("choose", _chooseUserAdapted);

  // Composition
  toolRegistry.set("tool_chain", _toolChainAdapted);

  // Delegation
  toolRegistry.set("delegate_task", delegateTaskHandler);

  // Git
  toolRegistry.set("git_diff", gitDiffHandler);
  toolRegistry.set("git_log", gitLogHandler);
  toolRegistry.set("git_commit", gitCommitHandler);
  toolRegistry.set("git_branch", gitBranchHandler);
  toolRegistry.set("git_status", gitStatusHandler);

  // CI
  toolRegistry.set("ci_pipeline", ciPipelineHandler);

  // Linux
  toolRegistry.set("linux_process_list", linuxProcessListHandler);
  toolRegistry.set("linux_process_kill", linuxProcessKillHandler);
  toolRegistry.set("linux_service_control", linuxServiceControlHandler);
  toolRegistry.set("linux_disk_usage", linuxDiskUsageHandler);
  toolRegistry.set("linux_net_stat", linuxNetStatHandler);
  toolRegistry.set("linux_pkg_manage", linuxPkgManageHandler);
}
