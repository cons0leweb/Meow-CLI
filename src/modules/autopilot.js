import fs from "fs";
import path from "path";
import {
  AUTO_CLR, C, TEXT, MUTED, ACCENT, ACCENT2, SUCCESS, ERROR,
  WARNING, TOOL_CLR, TEXT_DIM, AI_CLR, INFO,
  log, Spinner, renderMD, COLS, box
} from "./ui.js";
import { LOG_DIR, t } from "./config.js";
import { formatDuration } from "./utils.js";
import { callApi } from "./api.js";
import { executeTool, runShell } from "./tools.js";
import { getTrustManager, TRUST_LEVEL } from "./trust.js";
import { PromptOptimizer } from "./smart/prompt-optimizer.js";
import { sanitizeToolCallsForApi } from "./images.js";
import { compactWithAI, compactMessages } from "./compact.js";

// ═══════════════════════════════════════════════════════════════
// PHASE CONSTANTS — State machine phases
// ═══════════════════════════════════════════════════════════════
const PHASE = {
  PLANNING:      "planning",
  EXECUTION:     "execution",
  REPLANNING:    "replanning",
  VERIFICATION:  "verification",
  COMPLETE:      "complete",
  FAILED:        "failed",
};

// ═══════════════════════════════════════════════════════════════
// TASK STATUSES
// ═══════════════════════════════════════════════════════════════
const TASK_STATUS = {
  PENDING:   "pending",
  RUNNING:   "running",
  COMPLETED: "completed",
  FAILED:    "failed",
  BLOCKED:   "blocked",
};

// ═══════════════════════════════════════════════════════════════
// TOOL RESULT EVALUATION
// ═══════════════════════════════════════════════════════════════
const TOOL_OUTCOME = {
  SUCCESS: "success",
  FAILURE: "failure",
  PARTIAL: "partial",
};

/** @type {Object} Icons for each phase */
const PHASE_ICONS = {
  [PHASE.PLANNING]:     "📋",
  [PHASE.EXECUTION]:    "⚡",
  [PHASE.REPLANNING]:   "🔧",
  [PHASE.VERIFICATION]: "🔍",
  [PHASE.COMPLETE]:     "✅",
  [PHASE.FAILED]:       "❌",
};

/** @type {Object} Colors for each phase */
const PHASE_COLORS = {
  [PHASE.PLANNING]:     INFO,
  [PHASE.EXECUTION]:    AUTO_CLR,
  [PHASE.REPLANNING]:   WARNING,
  [PHASE.VERIFICATION]: ACCENT2,
  [PHASE.COMPLETE]:     SUCCESS,
  [PHASE.FAILED]:       ERROR,
};

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPTS (per-phase, NOT a monolithic suffix)
// ═══════════════════════════════════════════════════════════════

/** Prompt for the planning phase — model MUST return structured JSON. */
const PLANNER_SYSTEM_PROMPT = `
You are a planning agent. Your ONLY job is to produce a structured JSON plan.

Given a task description, you MUST output a JSON object with this exact structure:

{
  "tasks": [
    {
      "description": "Concise description of what to do (one action per task)"
    }
  ]
}

RULES:
- Each task must be a single, atomic action.
- Order tasks logically (dependencies first).
- Do NOT include any text outside the JSON.
- Do NOT use markdown code fences around the JSON.
- The JSON must be valid and parseable.
- Maximum 20 tasks.
- Use tool names like: list_dir, read_file, write_file, patch_file, grep_search, run_shell, find_files, git_diff, http_request, web_search

Output ONLY the JSON object, nothing else.`;

/** Prompt for executing a single task. */
function executionPrompt(taskDescription, taskIndex, totalTasks) {
  return `
You are executing one specific task. Execute ONLY this task, nothing more.

CURRENT TASK (${taskIndex + 1}/${totalTasks}):
${taskDescription}

INSTRUCTIONS:
- Use tools as needed to complete this ONE task.
- When done, respond with "TASK DONE" and a brief summary of what you did.
- If the task cannot be completed, respond with "TASK FAILED: <reason>".
- If the task depends on something not yet done, respond with "TASK BLOCKED: <reason>".
- Do NOT plan other tasks. Do NOT verify. Just execute this one task.

CWD: ${process.cwd()}
Time: ${new Date().toISOString()}
`;
}

/** Prompt for replanning after a task failure. */
const REPLANNER_SYSTEM_PROMPT = `
You are a replanning agent. A task has failed and you need to create replacement tasks.

Given the failed task description and the error, output a JSON object with replacement tasks:

{
  "replacement_tasks": [
    {
      "description": "New task to fix or work around the failure"
    }
  ]
}

RULES:
- Analyze the failure and create tasks that address the root cause.
- You may create 1-5 replacement tasks.
- Do NOT include any text outside the JSON.
- Do NOT use markdown code fences.
- Output ONLY the JSON object.`;

// ═══════════════════════════════════════════════════════════════
// AUTOPILOT STATE — The single source of truth
// ═══════════════════════════════════════════════════════════════

/**
 * Immutable-style state snapshot for the autopilot state machine.
 */
class AutopilotState {
  constructor() {
    /** @type {string} Current phase from PHASE */
    this.phase = PHASE.PLANNING;
    /** @type {Array<Object>} Task graph */
    this.tasks = [];
    /** @type {number} Index of currently executing task */
    this.currentTaskIndex = -1;
    /** @type {boolean} Verification passed */
    this.verificationPassed = false;
    /** @type {string|null} Verification output */
    this.verificationOutput = null;
    /** @type {number} Replan count */
    this.replanCount = 0;
    /** @type {number} Max replans allowed */
    this.maxReplans = 5;
    /** @type {number} Consecutive tool failures without progress */
    this.stallCounter = 0;
    /** @type {number} Max stalls before failing */
    this.maxStalls = 3;
  }

  /**
   * Transition to a new phase. Logs the transition.
   * @param {string} newPhase
   * @param {Function} logFn
   */
  transition(newPhase, logFn) {
    const old = this.phase;
    this.phase = newPhase;
    if (logFn && old !== newPhase) {
      logFn("phase_transition", `${old} → ${newPhase}`);
    }
  }

  /** @returns {boolean} True if all tasks are completed */
  allTasksCompleted() {
    return this.tasks.length > 0 &&
      this.tasks.every(t => t.status === TASK_STATUS.COMPLETED);
  }

  /** @returns {boolean} True if any task is failed and needs replanning */
  hasBlockedOrFailed() {
    return this.tasks.some(t =>
      t.status === TASK_STATUS.FAILED || t.status === TASK_STATUS.BLOCKED
    );
  }

  /** @returns {Object|null} The first failed or blocked task */
  getFailedTask() {
    return this.tasks.find(t =>
      t.status === TASK_STATUS.FAILED || t.status === TASK_STATUS.BLOCKED
    ) || null;
  }

  /** @returns {Object|null} The next pending task */
  getNextPendingTask() {
    return this.tasks.find(t => t.status === TASK_STATUS.PENDING) || null;
  }

  /** @returns {number} Count of completed tasks */
  completedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
  }

  /** @returns {number} Count of failed tasks */
  failedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.FAILED).length;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT MANAGER (preserved, minimal changes)
// ═══════════════════════════════════════════════════════════════

/**
 * Manages context window and compression during autopilot runs.
 */
class ContextManager {
  /**
   * @param {Object} cfg - Application config (for AI-powered compression).
   * @param {number} [maxTokens=4000000] - Max tokens before compression.
   */
  constructor(cfg = {}, maxTokens = 4000000) {
    this.maxTokens = maxTokens;
    this.warningThreshold = 0.75;
    this.criticalThreshold = 0.90;
    this.estimatedTokens = 0;
    this.compressions = 0;
    this.cfg = cfg;
  }

  /**
   * Estimates token count for messages.
   * @param {Array<Object>} messages - Conversation history.
   * @returns {number}
   */
  estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === "string"
        ? msg.content : JSON.stringify(msg.content || "");
      total += Math.ceil(content.length / 3.5);
      if (msg.tool_calls) {
        total += msg.tool_calls.length * 50;
        for (const tc of msg.tool_calls) {
          total += Math.ceil((tc.function?.arguments || "").length / 3.5);
        }
      }
    }
    this.estimatedTokens = total;
    return total;
  }

  /** @returns {number} Usage ratio (0.0 - 1.0) */
  getUsageRatio() {
    return this.estimatedTokens / this.maxTokens;
  }

  /** @returns {boolean} True if context should be compressed */
  needsCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.warningThreshold;
  }

  /** @returns {boolean} True if context MUST be compressed */
  needsCriticalCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.criticalThreshold;
  }

  /**
   * Compresses message history by summarizing old messages.
   * Uses AI-powered compression when available, falls back to heuristic.
   * @param {Array<Object>} messages - History to compress.
   * @returns {Array<Object>} Compressed history.
   */
  async compress(messages) {
    if (messages.length < 10) return messages;
    this.compressions++;

    // Try AI-powered compression first (uses compactWithAI from compact.js)
    if (this.cfg?.api_key) {
      try {
        const result = await compactWithAI(messages, this.cfg, 6);
        if (result.compressed) {
          this.estimatedTokens = result.after?.tokens || this.estimateTokens(result.messages);
          log.dim(`Context: ~${result.before?.tokens?.toLocaleString() || "?"} → ~${this.estimatedTokens.toLocaleString()} tokens (AI summary)`);
          return sanitizeToolCallsForApi(result.messages);
        }
      } catch {
        // Fall through to heuristic compression
      }
    }

    // Heuristic compression (original behavior)
    const systemMsg = messages[0];
    const recentCount = Math.min(12, Math.floor(messages.length * 0.3));
    const recentMessages = messages.slice(-recentCount);
    const oldMessages = messages.slice(1, -recentCount);
    const summary = this._summarizeMessages(oldMessages);

    const compressed = [
      systemMsg,
      {
        role: "user",
        content:
          `[CONTEXT COMPRESSION #${this.compressions}]\n` +
          `Previous ${oldMessages.length} messages were compressed.\n\n${summary}\n\n` +
          `Continue from where you left off.`
      },
      ...recentMessages,
    ];

    const oldTokens = this.estimatedTokens;
    this.estimateTokens(compressed);
    log.dim(`Context: ~${oldTokens} → ~${this.estimatedTokens} tokens (${compressed.length} msgs)`);

    return sanitizeToolCallsForApi(compressed);
  }

  /** @private */
  _summarizeMessages(messages) {
    const parts = [];
    let lastAssistant = "";
    const toolResults = [];
    const files = new Set();

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (msg.role === "assistant" && content) {
        lastAssistant = content;
      }
      if (msg.role === "tool" && content) {
        toolResults.push(content.split("\n")[0].slice(0, 150));
      }
      const fileMatches = content.match(/(?:\/[\w.-]+)+\.\w+/g) || [];
      fileMatches.forEach(f => files.add(f));
    }

    if (toolResults.length > 0) {
      parts.push(`## Tools (${toolResults.length}):\n${toolResults.slice(-10).map(r => `- ${r}`).join("\n")}`);
    }
    if (files.size > 0) parts.push(`## Files: ${[...files].join(", ")}`);
    if (lastAssistant) parts.push(`## Last state:\n${lastAssistant.slice(0, 500)}`);

    return parts.join("\n\n") || "No significant content.";
  }
}

// ═══════════════════════════════════════════════════════════════
// DIFF TRACKER (preserved, no changes)
// ═══════════════════════════════════════════════════════════════

/**
 * Tracks file system changes and commands executed during autopilot.
 */
class DiffTracker {
  constructor() {
    this.filesCreated = [];
    this.filesModified = [];
    this.commandsRun = [];
    this.snapshots = new Map();
  }

  /** Snapshots a file's current state. */
  snapshotFile(filePath) {
    const resolved = path.resolve(filePath);
    if (this.snapshots.has(resolved)) return;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        this.snapshots.set(resolved, fs.readFileSync(resolved, "utf8"));
      } else {
        this.snapshots.set(resolved, null);
      }
    } catch { }
  }

  /** Tracks a file write operation. */
  trackWrite(filePath) {
    const resolved = path.resolve(filePath);
    this.snapshotFile(resolved);
    const original = this.snapshots.get(resolved);
    if (original === null || original === undefined) {
      if (!this.filesCreated.includes(resolved)) this.filesCreated.push(resolved);
    } else {
      if (!this.filesModified.includes(resolved)) this.filesModified.push(resolved);
    }
  }

  /** Tracks a shell command execution. */
  trackCommand(cmd) {
    this.commandsRun.push({ cmd: cmd.slice(0, 200), time: Date.now() });
  }

  /** @returns {string} Summary of tracked changes. */
  getSummary() {
    const parts = [];
    const cwd = process.cwd();
    if (this.filesCreated.length > 0) {
      parts.push(`📄 Created (${this.filesCreated.length}): ${this.filesCreated.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.filesModified.length > 0) {
      parts.push(`✏️  Modified (${this.filesModified.length}): ${this.filesModified.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.commandsRun.length > 0) {
      parts.push(`🖥  Commands (${this.commandsRun.length}): ${this.commandsRun.map(c => c.cmd.slice(0, 60)).join("; ")}`);
    }
    return parts.join("\n") || "No changes tracked.";
  }

  /** @returns {number} Total number of file changes. */
  getTotalChanges() {
    return this.filesCreated.length + this.filesModified.length;
  }
}

// ═══════════════════════════════════════════════════════════════
// RECOVERY STRATEGY (preserved, no changes)
// ═══════════════════════════════════════════════════════════════

/**
 * Manages error recovery and retry strategies.
 */
class RecoveryStrategy {
  constructor() {
    this.errorHistory = [];
    this.retryMap = new Map();
    this.maxRetriesPerTool = 3;
    this.backoffMs = 2000;
  }

  /** Records a tool or API error. */
  recordError(error, toolName, iteration) {
    this.errorHistory.push({
      error: error.message || String(error),
      tool: toolName, iteration,
      time: Date.now(),
    });
    const count = (this.retryMap.get(toolName) || 0) + 1;
    this.retryMap.set(toolName, count);
  }

  /** @returns {boolean} True if the tool should be retried. */
  shouldRetry(toolName) {
    return (this.retryMap.get(toolName) || 0) < this.maxRetriesPerTool;
  }

  /** @returns {number} Backoff delay in milliseconds. */
  getBackoffMs(toolName) {
    const count = this.retryMap.get(toolName) || 0;
    return this.backoffMs * Math.pow(2, Math.max(0, count - 1));
  }

  /** @returns {boolean} True if the error is a transient API error. */
  isApiError(error) {
    const msg = error.message || String(error);
    return /429|rate|500|502|503|timeout|ECONNRESET|fetch failed|socket/i.test(msg);
  }

  /** @returns {boolean} True if the error is a tool call validation error. */
  isToolCallValidationError(error) {
    const msg = error.message || String(error);
    return /tool_calls.*must be followed|insufficient tool messages|tool_call_id/i.test(msg);
  }

  /** @returns {boolean} True if the error is a retryable tool error (not a logic/validation error). */
  isRetryableToolError(error) {
    const msg = error.message || String(error);
    if (/not found|ENOENT|EACCES|EISDIR|EPERM|EEXIST/i.test(msg)) return false;
    if (/timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAGAIN|EBUSY/i.test(msg)) return true;
    return true;
  }

  /** @returns {string} Recovery hint for the user/log. */
  getRecoveryHint(error) {
    const msg = error.message || String(error);
    if (/429|rate/i.test(msg))              return "Rate limited — backoff";
    if (/500|502|503/i.test(msg))           return "Server error — retrying";
    if (/timeout/i.test(msg))               return "Timeout — retrying";
    if (/context.?length|token/i.test(msg)) return "Context overflow — compressing";
    if (this.isToolCallValidationError(error)) return "Broken tool call sequence — sanitizing";
    if (/not found|ENOENT/i.test(msg))      return "File/resource not found — check path";
    if (/EACCES|EPERM/i.test(msg))          return "Permission denied — access blocked";
    if (/ENOSPC/i.test(msg))                return "No disk space — cannot write";
    return "Unknown error — recovering";
  }

  /** @returns {string} Summary of all errors. */
  getErrorSummary() {
    if (this.errorHistory.length === 0) return "No errors";
    const grouped = {};
    for (const e of this.errorHistory) {
      const key = e.tool || "api";
      grouped[key] = (grouped[key] || 0) + 1;
    }
    return Object.entries(grouped).map(([k, v]) => `${k}:${v}`).join(", ");
  }
}

// ═══════════════════════════════════════════════════════════════
// TOOL EXECUTION (preserved, minimal changes)
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluates a tool result and returns an outcome.
 * @param {string} name - Tool name
 * @param {string} result - Tool result string
 * @returns {string} TOOL_OUTCOME value
 */
function evaluateToolOutcome(name, result) {
  if (!result) return TOOL_OUTCOME.FAILURE;
  const r = String(result);
  // Explicit error markers
  if (r.startsWith("❌") || r.includes("Error:") || r.includes("error:")) {
    return TOOL_OUTCOME.FAILURE;
  }
  // Partial indicators
  if (r.startsWith("ℹ") && (r.includes("not found") || r.includes("No "))) {
    return TOOL_OUTCOME.PARTIAL;
  }
  return TOOL_OUTCOME.SUCCESS;
}

/**
 * Executes a tool and tracks its impact.
 * Uses WorkspaceSandbox for pre-execution validation.
 * @private
 */
async function executeToolTracked(name, args, cfg, tracker, recovery, iteration) {
  // Sandbox validation before execution
  const { getSandbox } = await import("./security/sandbox.js");
  const sandbox = getSandbox();
  const validation = sandbox.validate(name, args);
  if (!validation.allowed) {
    return { result: `❌ Security: ${validation.reason}`, outcome: TOOL_OUTCOME.FAILURE };
  }

  if ((name === "write_file" || name === "patch_file") && args.path) {
    tracker.snapshotFile(args.path);
  }
  if (name === "run_shell" && args.cmd) {
    tracker.trackCommand(args.cmd);
  }

  try {
    const result = await executeTool(name, args, cfg);
    const outcome = evaluateToolOutcome(name, result);
    if ((name === "write_file" || name === "patch_file") && args.path && outcome !== TOOL_OUTCOME.FAILURE) {
      tracker.trackWrite(args.path);
    }
    return { result, outcome };
  } catch (e) {
    recovery.recordError(e, name, iteration);
    if (recovery.shouldRetry(name) && recovery.isRetryableToolError(e)) {
      const backoff = recovery.getBackoffMs(name);
      log.warn(`${recovery.getRecoveryHint(e)} (retry in ${backoff / 1000}s)`);
      await new Promise(r => setTimeout(r, backoff));
      try {
        const result = await executeTool(name, args, cfg);
        return { result, outcome: evaluateToolOutcome(name, result) };
      } catch (e2) {
        return { result: `❌ Tool error after retry: ${e2.message}`, outcome: TOOL_OUTCOME.FAILURE };
      }
    }
    return { result: `❌ Tool error (max retries): ${e.message}`, outcome: TOOL_OUTCOME.FAILURE };
  }
}

// ═══════════════════════════════════════════════════════════════
// PROJECT DETECTION (for verification)
// ═══════════════════════════════════════════════════════════════

/**
 * Detects project type and returns appropriate test command.
 * @returns {{ type: string, cmd: string }|null}
 */
function detectProjectType() {
  const cwd = process.cwd();

  // Node.js
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const scripts = pkg.scripts || {};
    if (scripts.test) {
      return { type: "node", cmd: "npm test" };
    }
    return { type: "node", cmd: "node --test tests/**/*.test.js" };
  }

  // Python
  if (fs.existsSync(path.join(cwd, "pyproject.toml")) || fs.existsSync(path.join(cwd, "requirements.txt"))) {
    return { type: "python", cmd: "pytest" };
  }

  // Rust
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) {
    return { type: "rust", cmd: "cargo test" };
  }

  // Go
  if (fs.existsSync(path.join(cwd, "go.mod"))) {
    return { type: "go", cmd: "go test ./..." };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// PLANNER — Calls model for structured plan
// ═══════════════════════════════════════════════════════════════

class Planner {
  /**
   * @param {Object} cfg - Configuration
   */
  constructor(cfg) {
    this.cfg = cfg;
  }

  /**
   * Generates a plan for the given task.
   * @param {string} task - Task description
   * @returns {Promise<Array<Object>>} Array of task objects
   */
  async plan(task) {
    const messages = [
      { role: "system", content: PLANNER_SYSTEM_PROMPT },
      { role: "user", content: `Create a JSON plan for this task:\n\n${task}` },
    ];

    let rawResponse = "";
    try {
      const data = await callApi(messages, this.cfg);
      rawResponse = data.choices?.[0]?.message?.content || "";
    } catch (e) {
      log.err(`Planner API call failed: ${e.message}`);
      return [];
    }

    return this._parsePlan(rawResponse);
  }

  /**
   * Parses the model response into task objects.
   * @param {string} raw - Raw model response
   * @returns {Array<Object>} Task objects with id, description, status
   */
  _parsePlan(raw) {
    let jsonStr = raw.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    // Find the first JSON object in the text
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const tasks = (parsed.tasks || []).map((t, i) => ({
        id: `task-${i + 1}`,
        description: t.description || String(t),
        status: TASK_STATUS.PENDING,
        result: null,
        retries: 0,
        maxRetries: 2,
      }));
      return tasks;
    } catch (e) {
      log.warn(`Failed to parse plan JSON: ${e.message}`);
      // Fallback: create a single task from the raw text
      return [{
        id: "task-1",
        description: raw.slice(0, 500),
        status: TASK_STATUS.PENDING,
        result: null,
        retries: 0,
        maxRetries: 2,
      }];
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// EXECUTOR — Executes one task at a time
// ═══════════════════════════════════════════════════════════════

class Executor {
  /**
   * @param {Object} cfg
   * @param {DiffTracker} tracker
   * @param {RecoveryStrategy} recovery
   * @param {ContextManager} contextManager
   * @param {Function} logFn
   */
  constructor(cfg, tracker, recovery, contextManager, logFn) {
    this.cfg = cfg;
    this.tracker = tracker;
    this.recovery = recovery;
    this.contextManager = contextManager;
    this.logFn = logFn || (() => {});

    this.toolCalls = 0;
    this.lastToolCallIteration = 0;
    this.errors = 0;
  }

  /**
   * Executes a single task.
   * @param {Object} task - Task object
   * @param {number} taskIndex - Index in the task list
   * @param {number} totalTasks - Total number of tasks
   * @param {Array<Object>} sharedMessages - Shared message history (may be modified)
   * @returns {Promise<Object>} { status: TASK_STATUS, result: string, messages: Array }
   */
  async execute(task, taskIndex, totalTasks, sharedMessages) {
    task.status = TASK_STATUS.RUNNING;
    this.logFn("task_start", `${task.id}: ${task.description}`);

    const executionMessages = [
      ...sharedMessages,
      { role: "user", content: executionPrompt(task.description, taskIndex, totalTasks) },
    ];

    let taskComplete = false;
    let taskStatus = TASK_STATUS.RUNNING;
    let taskResult = "";
    let localIterations = 0;
    const maxLocalIterations = 10; // Max iterations for a single task

    while (!taskComplete && localIterations < maxLocalIterations) {
      localIterations++;

      // Context management
      if (this.contextManager.needsCriticalCompression(executionMessages)) {
        log.warn("Context critical — compressing");
        executionMessages = await this.contextManager.compress(executionMessages);
        executionMessages = sanitizeToolCallsForApi(executionMessages);
      } else if (this.contextManager.needsCompression(executionMessages)) {
        executionMessages = await this.contextManager.compress(executionMessages);
        executionMessages = sanitizeToolCallsForApi(executionMessages);
      }

      let data;
      try {
        data = await callApi(executionMessages, this.cfg);
      } catch (e) {
        this.errors++;
        this.logFn("api_error", e.message);

        if (this.recovery.isApiError(e)) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        taskStatus = TASK_STATUS.FAILED;
        taskResult = `API error: ${e.message}`;
        break;
      }

      const msg = data.choices?.[0]?.message;
      if (!msg) {
        taskStatus = TASK_STATUS.FAILED;
        taskResult = "Empty API response";
        break;
      }

      // Handle tool calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        executionMessages.push(msg);
        this.toolCalls += msg.tool_calls.length;

        for (const call of msg.tool_calls) {
          const name = call.function.name;
          let args = {};
          try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

          printToolExecution(name, args, 0, 1);
          this.logFn("tool_call", `${name}: ${JSON.stringify(args).slice(0, 300)}`);

          const { result, outcome } = await executeToolTracked(
            name, args, this.cfg, this.tracker, this.recovery, 0
          );

          if (this.cfg.autopilot?.verbose !== false) {
            printToolResult(result, 4);
          }

          this.logFn("tool_result", `${name}: ${(result || "").slice(0, 500)}`);

          if (outcome === TOOL_OUTCOME.FAILURE) {
            this.logFn("tool_failure", `${name}: ${result.slice(0, 200)}`);
          }

          executionMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        }
        continue;
      }

      // Handle text response
      const content = msg.content || "";
      executionMessages.push(msg);

      // Check for task completion markers
      if (/TASK\s+DONE/i.test(content)) {
        taskComplete = true;
        taskStatus = TASK_STATUS.COMPLETED;
        taskResult = content;
      } else if (/TASK\s+FAILED/i.test(content)) {
        taskComplete = true;
        taskStatus = TASK_STATUS.FAILED;
        taskResult = content;
      } else if (/TASK\s+BLOCKED/i.test(content)) {
        taskComplete = true;
        taskStatus = TASK_STATUS.BLOCKED;
        taskResult = content;
      }
      // If no marker and model responded without tool calls, assume done
      else if (localIterations >= 2 && !msg.tool_calls) {
        taskComplete = true;
        taskStatus = TASK_STATUS.COMPLETED;
        taskResult = content;
      }
    }

    if (!taskComplete && localIterations >= maxLocalIterations) {
      taskStatus = TASK_STATUS.FAILED;
      taskResult = `Exceeded max iterations (${maxLocalIterations}) for task`;
    }

    task.status = taskStatus;
    task.result = taskResult;
    this.logFn("task_end", `${task.id}: ${taskStatus}`);

    return {
      status: taskStatus,
      result: taskResult,
      messages: executionMessages,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// REPLANNER — Generates replacement tasks on failure
// ═══════════════════════════════════════════════════════════════

class Replanner {
  /**
   * @param {Object} cfg
   */
  constructor(cfg) {
    this.cfg = cfg;
  }

  /**
   * Generates replacement tasks for a failed task.
   * @param {Object} failedTask - The task that failed
   * @param {Array<Object>} remainingTasks - Tasks not yet executed
   * @returns {Promise<Array<Object>>} Replacement task objects
   */
  async replan(failedTask, remainingTasks) {
    const context = [
      `Failed task: ${failedTask.description}`,
      `Error/Result: ${failedTask.result || "Unknown error"}`,
      ``,
      `Remaining tasks:`,
      ...remainingTasks.map(t => `- ${t.description}`),
    ].join("\n");

    const messages = [
      { role: "system", content: REPLANNER_SYSTEM_PROMPT },
      { role: "user", content: `A task failed. Create replacement tasks.\n\n${context}` },
    ];

    let rawResponse = "";
    try {
      const data = await callApi(messages, this.cfg);
      rawResponse = data.choices?.[0]?.message?.content || "";
    } catch (e) {
      log.err(`Replanner API call failed: ${e.message}`);
      return [];
    }

    return this._parseReplan(rawResponse);
  }

  /**
   * Parses replanner response into task objects.
   * @param {string} raw
   * @returns {Array<Object>}
   */
  _parseReplan(raw) {
    let jsonStr = raw.trim();

    const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return (parsed.replacement_tasks || []).map((t, i) => ({
        id: `replan-${Date.now()}-${i + 1}`,
        description: t.description || String(t),
        status: TASK_STATUS.PENDING,
        result: null,
        retries: 0,
        maxRetries: 2,
      }));
    } catch (e) {
      log.warn(`Failed to parse replan JSON: ${e.message}`);
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// VERIFIER — System-driven test execution
// ═══════════════════════════════════════════════════════════════

class Verifier {
  constructor() {
    this.output = null;
    this.passed = false;
  }

  /**
   * Runs project verification by auto-detecting project type and executing tests.
   * @returns {Promise<{ passed: boolean, output: string, projectType: string|null }>}
   */
  async verify() {
    const project = detectProjectType();

    if (!project) {
      this.output = "No project type detected (no package.json, pyproject.toml, Cargo.toml, go.mod). Skipping verification.";
      this.passed = true; // Nothing to verify
      return { passed: true, output: this.output, projectType: null };
    }

    log.auto(`Detected project: ${project.type} → running: ${project.cmd}`);

    try {
      const result = await this._runCommand(project.cmd);
      this.output = result.stdout + (result.stderr ? "\n" + result.stderr : "");
      this.passed = result.exitCode === 0;

      if (this.passed) {
        log.ok(`Verification passed (${project.type})`);
      } else {
        log.err(`Verification failed (${project.type}, exit ${result.exitCode})`);
        // Show last few lines of output
        const lines = this.output.split("\n").slice(-10);
        for (const line of lines) {
          if (line.trim()) log.dim(`  ${line.slice(0, 120)}`);
        }
      }
    } catch (e) {
      this.output = `Verification error: ${e.message}`;
      this.passed = false;
      log.err(`Verification error: ${e.message}`);
    }

    return { passed: this.passed, output: this.output, projectType: project.type };
  }

  /**
   * Runs a shell command and captures output.
   * @param {string} cmd
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
   */
  async _runCommand(cmd) {
    const { exec } = await import("child_process");
    return new Promise((resolve) => {
      exec(cmd, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? (error.code || 1) : 0,
        });
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS (preserved, minimal changes)
// ═══════════════════════════════════════════════════════════════

/** @private */
function printToolCallBlock(calls) {
  const count = calls.length;
  console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}Tools${C.reset} ${MUTED}(${count} call${count > 1 ? "s" : ""})${C.reset}`);
}

/** @private */
function printToolExecution(name, args, index, total) {
  const argsStr = typeof args === "string" ? args : JSON.stringify(args);
  const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
  const counter = total > 1 ? `${MUTED}[${index + 1}/${total}]${C.reset} ` : "";
  console.log(`  ${TOOL_CLR}┃${C.reset} ${counter}${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);
}

/** @private */
function printToolResult(result, maxLines = 5) {
  if (!result) return;
  const lines = result.split("\n");
  const show = lines.slice(0, maxLines);
  for (const line of show) {
    console.log(`  ${MUTED}┃${C.reset}   ${TEXT_DIM}${line.slice(0, COLS - 8)}${C.reset}`);
  }
  if (lines.length > maxLines) {
    console.log(`  ${MUTED}┃${C.reset}   ${MUTED}… +${lines.length - maxLines} more lines${C.reset}`);
  }
}

/** @private */
function printStatusBar(ap, state) {
  const elapsed = formatDuration(Date.now() - ap.startTime);
  const barWidth = 20;
  const filled = Math.round((ap.iteration / ap.maxIterations) * barWidth);
  const empty = barWidth - filled;
  const bar = `${AUTO_CLR}${"━".repeat(filled)}${MUTED}${"━".repeat(empty)}${C.reset}`;
  const pct = Math.round((ap.iteration / ap.maxIterations) * 100);

  const phaseIcon = PHASE_ICONS[state.phase] || "▸";
  const phaseColor = PHASE_COLORS[state.phase] || MUTED;

  const parts = [
    `${bar} ${AUTO_CLR}${pct}%${C.reset}`,
    `${phaseColor}${phaseIcon} ${state.phase}${C.reset}`,
    `${MUTED}i${TEXT}${ap.iteration}${MUTED}/${ap.maxIterations}${C.reset}`,
    `${TOOL_CLR}⚡${ap.toolCalls}${C.reset}`,
    `${ap.errors > 0 ? ERROR : MUTED}✗${ap.errors}${C.reset}`,
    `${MUTED}Δ${ap.diffTracker.getTotalChanges()}${C.reset}`,
    `${MUTED}t${state.completedCount()}/${state.tasks.length}${C.reset}`,
    `${TEXT_DIM}${elapsed}${C.reset}`,
  ];

  console.log(`\n  ${parts.join(`  ${MUTED}·${C.reset}  `)}`);
}

/** @private */
function printCompactResponse(content, state, iteration) {
  if (!content || content.trim().length === 0) return;
  const phaseColor = PHASE_COLORS[state.phase] || AI_CLR;
  const phaseIcon = PHASE_ICONS[state.phase] || "💭";

  console.log("");
  console.log(`  ${phaseColor}${C.bold}${phaseIcon} Assistant${C.reset} ${MUTED}[iter ${iteration}]${C.reset}`);

  const output = renderMD(content).trim();
  for (const line of output.split("\n")) {
    console.log(`  ${line}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN AUTOPILOT CLASS — State-driven orchestration
// ═══════════════════════════════════════════════════════════════

/**
 * Core Autopilot engine for autonomous task execution.
 * State-driven architecture: no text-based phase detection, no nudges.
 */
class Autopilot {
  /**
   * @param {Object} cfg - Configuration.
   * @param {Array<Object>} messages - Initial messages history.
   * @param {Function} saveCallback - State persistence callback.
   */
  constructor(cfg, messages, saveCallback) {
    this.cfg = cfg;
    this.messages = messages;
    this.saveCallback = saveCallback;
    this.running = false;
    this.aborted = false;
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.startTime = 0;
    this.logEntries = [];

    // State machine
    this.state = new AutopilotState();

    // Shared infrastructure
    this.contextManager = new ContextManager(cfg, cfg.autopilot?.max_context_tokens || 120000);
    this.diffTracker = new DiffTracker();
    this.recovery = new RecoveryStrategy();

    const apCfg = cfg.autopilot || {};
    this.maxIterations = apCfg.max_iterations || 50;
    this.maxErrors = apCfg.max_errors || 5;
    this.retryDelay = apCfg.retry_delay_ms || 2000;
    this.saveLog = apCfg.save_log !== false;
    this.verbose = apCfg.verbose !== false;

    // Agents
    this.planner = new Planner(cfg);
    this.replanner = new Replanner(cfg);
    this.verifier = new Verifier();
    this.executor = null; // Created on run (needs logFn)
  }

  /** Aborts the current autopilot run. */
  abort() {
    this.aborted = true;
    this.running = false;
  }

  /** @private */
  _log(type, msg) {
    this.logEntries.push({
      time: Date.now(),
      iteration: this.iteration,
      phase: this.state.phase,
      type,
      msg: typeof msg === "string" ? msg.slice(0, 2000) : JSON.stringify(msg).slice(0, 2000),
    });
  }

  /** @private */
  _printHeader(task) {
    console.log("");
    const lines = [
      `${AUTO_CLR}${C.bold}AUTOPILOT ENGAGED${C.reset}`,
      ``,
      `${MUTED}Task:${C.reset} ${TEXT}${task.slice(0, 120)}${task.length > 120 ? "…" : ""}${C.reset}`,
      ``,
      `${MUTED}Model:${C.reset}        ${ACCENT}${this.cfg.model}${C.reset}`,
      `${MUTED}Max iters:${C.reset}    ${TEXT}${this.maxIterations}${C.reset}`,
      `${MUTED}Max errors:${C.reset}   ${TEXT}${this.maxErrors}${C.reset}`,
      `${MUTED}Auto-confirm:${C.reset} ${SUCCESS}ON${C.reset}`,
      ``,
      `${TEXT_DIM}Press ${C.bold}Ctrl+C${C.reset}${TEXT_DIM} to stop gracefully${C.reset}`,
    ];
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  /** @private */
  _printSummary(reason) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const diffSummary = this.diffTracker.getSummary();
    const errorSummary = this.recovery.getErrorSummary();

    const lines = [
      `${C.bold}Status:${C.reset}       ${reason}`,
      `${C.bold}Phase:${C.reset}        ${this.state.phase}`,
      `${C.bold}Tasks:${C.reset}        ${this.state.completedCount()}/${this.state.tasks.length} completed`,
      `${C.bold}Iterations:${C.reset}   ${this.iteration} / ${this.maxIterations}`,
      `${C.bold}Tool calls:${C.reset}   ${this.toolCalls}`,
      `${C.bold}Errors:${C.reset}       ${this.errors}${this.errors > 0 ? ` (${errorSummary})` : ""}`,
      `${C.bold}Replans:${C.reset}      ${this.state.replanCount}`,
      `${C.bold}Tokens:${C.reset}       ~${this.totalTokens.toLocaleString()}`,
      `${C.bold}Compressions:${C.reset} ${this.contextManager.compressions}`,
      `${C.bold}Duration:${C.reset}     ${elapsed}`,
      ``,
      `${C.bold}Changes:${C.reset}`,
      ...diffSummary.split("\n").map(l => `  ${l}`),
    ];

    if (this.state.tasks.length > 0) {
      lines.push(``, `${C.bold}Task Status:${C.reset}`);
      for (const t of this.state.tasks) {
        const icon = t.status === TASK_STATUS.COMPLETED ? "✅" :
                     t.status === TASK_STATUS.FAILED ? "❌" :
                     t.status === TASK_STATUS.BLOCKED ? "🚫" :
                     t.status === TASK_STATUS.RUNNING ? "🔄" : "⏳";
        const desc = t.description.length > 80 ? t.description.slice(0, 77) + "…" : t.description;
        lines.push(`  ${icon} ${TEXT_DIM}${desc}${C.reset}`);
      }
    }

    console.log("");
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT SUMMARY", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  /** @private */
  _saveLogFile() {
    if (!this.saveLog || this.logEntries.length === 0) return;
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(LOG_DIR, `autopilot-${ts}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        version: 3,
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: formatDuration(Date.now() - this.startTime),
        iterations: this.iteration,
        toolCalls: this.toolCalls,
        errors: this.errors,
        totalTokens: this.totalTokens,
        model: this.cfg.model,
        phase: this.state.phase,
        replans: this.state.replanCount,
        verificationPassed: this.state.verificationPassed,
        tasks: this.state.tasks.map(t => ({
          id: t.id,
          description: t.description,
          status: t.status,
          result: (t.result || "").slice(0, 500),
        })),
        changes: {
          created: this.diffTracker.filesCreated.map(f => path.relative(process.cwd(), f)),
          modified: this.diffTracker.filesModified.map(f => path.relative(process.cwd(), f)),
          commands: this.diffTracker.commandsRun.length,
        },
        compressions: this.contextManager.compressions,
        errorSummary: this.recovery.getErrorSummary(),
        entries: this.logEntries,
      }, null, 2));
      log.dim(`Log saved: ${logFile}`);
    } catch (e) { log.dim(`Log save failed: ${e.message}`); }
  }

  /** @private */
  _initExecutor() {
    this.executor = new Executor(
      this.cfg, this.diffTracker, this.recovery,
      this.contextManager, (type, msg) => this._log(type, msg)
    );
  }

  // ══════════════════════════════════════════════════════════
  // STATE MACHINE LOOP
  // ══════════════════════════════════════════════════════════

  /**
   * Runs the autopilot for a specific task.
   * @param {string} task - The task description.
   * @returns {Promise<Object>} Execution statistics.
   */
  async run(task) {
    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.logEntries = [];

    // Fresh state
    this.state = new AutopilotState();
    this.diffTracker = new DiffTracker();
    this.recovery = new RecoveryStrategy();
    this.contextManager = new ContextManager(this.cfg, this.cfg.autopilot?.max_context_tokens || 120000);
    this._initExecutor();

    // Optimize prompt if enabled
    const optimizer = new PromptOptimizer(this.cfg);
    let finalTask = task;
    if (this.cfg.prompt_optimizer?.enabled) {
      finalTask = await optimizer.optimize(task);
    }

    // Trust check
    const trust = getTrustManager();
    const status = await trust.checkStatus();
    if (status !== TRUST_LEVEL.TRUSTED) {
      log.err(t(this.cfg, "trust_readonly_warning"));
      return { error: "Untrusted repository" };
    }

    // Auto-confirm
    const origAutoYes = this.cfg.auto_yes;
    if (!origAutoYes) {
      log.warn("AUTOPILOT: Enabling auto-confirm (auto_yes=true) for autonomous execution");
      log.warn("AUTOPILOT: Only use this if you trust the LLM completely");
    }
    this.cfg.auto_yes = true;

    this._printHeader(task);
    this._log("start", task);

    // Sanitize messages
    this.messages = sanitizeToolCallsForApi(this.messages);
    // Save original system message
    const originalSystem = this.messages[0]?.content || "";

    let finalReason = `${SUCCESS}✓ Completed${C.reset}`;

    try {
      // ═══════════════════════════════════════════════
      // PHASE: PLANNING
      // ═══════════════════════════════════════════════
      this.state.transition(PHASE.PLANNING, (t, m) => this._log(t, m));
      printStatusBar(this, this.state);
      log.auto("📋 PLANNING: Generating task plan…");

      const tasks = await this.planner.plan(finalTask);
      if (tasks.length === 0) {
        finalReason = `${ERROR}✗ Planning failed — no tasks generated${C.reset}`;
        this.state.transition(PHASE.FAILED, (t, m) => this._log(t, m));
        this.running = false;
      } else {
        this.state.tasks = tasks;
        this._log("plan", `Generated ${tasks.length} tasks: ${tasks.map(t => t.description.slice(0, 50)).join("; ")}`);
        log.ok(`Plan: ${tasks.length} tasks defined`);

        // ═══════════════════════════════════════════════
        // MAIN LOOP: EXECUTION + REPLANNING
        // ═══════════════════════════════════════════════
        while (this.running && this.iteration < this.maxIterations && !this.aborted) {
          this.iteration++;
          printStatusBar(this, this.state);

          // Check completion condition
          if (this.state.allTasksCompleted()) {
            this._log("all_tasks_complete", `All ${this.state.tasks.length} tasks completed`);
            break;
          }

          // Check for blocked/failed tasks → replanning
          if (this.state.hasBlockedOrFailed()) {
            const failedTask = this.state.getFailedTask();

            if (failedTask && this.state.replanCount < this.state.maxReplans) {
              this.state.transition(PHASE.REPLANNING, (t, m) => this._log(t, m));
              printStatusBar(this, this.state);
              log.warn(`🔧 REPLANNING: Task "${failedTask.description.slice(0, 60)}" ${failedTask.status}`);

              const remaining = this.state.tasks.filter(
                t => t.status === TASK_STATUS.PENDING
              );

              const replacements = await this.replanner.replan(failedTask, remaining);

              if (replacements.length > 0) {
                // Mark the failed task as completed (we're replacing it)
                failedTask.status = TASK_STATUS.COMPLETED;
                failedTask.result = `Replaced via replan #${this.state.replanCount + 1}`;

                // Insert replacement tasks into pending queue
                this.state.tasks.push(...replacements);
                this.state.replanCount++;
                this._log("replan", `Generated ${replacements.length} replacement tasks`);
                log.ok(`Replan: ${replacements.length} new tasks added`);
              } else {
                // Can't replan — mark as permanently failed
                this.state.replanCount++;
                this._log("replan_failed", "No replacement tasks generated");
                log.warn("Replan returned no tasks — continuing with remaining");
              }
            } else if (this.state.replanCount >= this.state.maxReplans) {
              finalReason = `${WARNING}▲ Max replans (${this.state.maxReplans}) reached${C.reset}`;
              this._log("max_replans", `Replan limit ${this.state.maxReplans}`);
              break;
            }
          }

          // Get next pending task
          const pendingTask = this.state.getNextPendingTask();
          if (!pendingTask) {
            // No pending tasks — check if we're done
            if (this.state.allTasksCompleted()) {
              break;
            }
            // Otherwise something is stuck, try replanning
            if (this.state.replanCount < this.state.maxReplans) {
              // Force replan on remaining blocked/failed
              const stuckTask = this.state.getFailedTask();
              if (stuckTask) {
                this.state.transition(PHASE.REPLANNING, (t, m) => this._log(t, m));
                const remaining = this.state.tasks.filter(
                  t => t.status === TASK_STATUS.PENDING
                );
                const replacements = await this.replanner.replan(stuckTask, remaining);
                if (replacements.length > 0) {
                  stuckTask.status = TASK_STATUS.COMPLETED;
                  this.state.tasks.push(...replacements);
                  this.state.replanCount++;
                }
              }
            }
            break;
          }

          // Execute one task
          this.state.transition(PHASE.EXECUTION, (t, m) => this._log(t, m));
          this.state.currentTaskIndex = this.state.tasks.indexOf(pendingTask);

          log.auto(`⚡ EXECUTING: ${pendingTask.description.slice(0, 100)}`);

          const execResult = await this.executor.execute(
            pendingTask,
            this.state.currentTaskIndex,
            this.state.tasks.length,
            this.messages
          );

          // Sync executor stats
          this.toolCalls += this.executor.toolCalls;
          this.errors += this.executor.errors;
          this.executor.toolCalls = 0;
          this.executor.errors = 0;

          // Update messages with execution history
          this.messages = execResult.messages;

          if (execResult.status === TASK_STATUS.COMPLETED) {
            log.ok(`  Task complete: ${pendingTask.description.slice(0, 60)}`);
          } else if (execResult.status === TASK_STATUS.FAILED) {
            log.err(`  Task failed: ${pendingTask.description.slice(0, 60)}`);
            this.state.stallCounter++;
          } else if (execResult.status === TASK_STATUS.BLOCKED) {
            log.warn(`  Task blocked: ${pendingTask.description.slice(0, 60)}`);
            this.state.stallCounter++;
          }

          // Check stall threshold
          if (this.state.stallCounter >= this.state.maxStalls) {
            finalReason = `${WARNING}▲ Stalled — ${this.state.maxStalls} consecutive failures/blocks${C.reset}`;
            this._log("stall", `Max stalls ${this.state.maxStalls}`);
            break;
          }

          // Check error limit
          if (this.errors >= this.maxErrors) {
            finalReason = `${ERROR}✗ Too many errors (${this.errors})${C.reset}`;
            this._log("max_errors", `Error limit ${this.maxErrors}`);
            break;
          }

          this.saveCallback();
        }
      }

      // ═══════════════════════════════════════════════
      // PHASE: VERIFICATION
      // ═══════════════════════════════════════════════
      if (this.running && !this.aborted && this.state.allTasksCompleted()) {
        this.state.transition(PHASE.VERIFICATION, (t, m) => this._log(t, m));
        printStatusBar(this, this.state);
        log.auto("🔍 VERIFICATION: Running tests…");

        const verifResult = await this.verifier.verify();
        this.state.verificationPassed = verifResult.passed;
        this.state.verificationOutput = verifResult.output;
        this._log("verification", `${verifResult.passed ? "PASSED" : "FAILED"} (${verifResult.projectType || "none"})`);

        if (verifResult.passed) {
          this.state.transition(PHASE.COMPLETE, (t, m) => this._log(t, m));
          finalReason = `${SUCCESS}✓ Task completed & verified${C.reset}`;
        } else {
          finalReason = `${WARNING}▲ Tasks done but verification failed${C.reset}`;
          this.state.transition(PHASE.FAILED, (t, m) => this._log(t, m));
        }
      } else if (!this.running || this.aborted) {
        finalReason = `${WARNING}▲ Aborted (Ctrl+C)${C.reset}`;
        this._log("abort", "User aborted");
        this.state.transition(PHASE.FAILED, (t, m) => this._log(t, m));
      } else if (this.iteration >= this.maxIterations) {
        finalReason = `${WARNING}▲ Max iterations (${this.maxIterations})${C.reset}`;
        this._log("limit", "Max iterations");
        this.state.transition(PHASE.FAILED, (t, m) => this._log(t, m));
      }

    } catch (e) {
      finalReason = `${ERROR}✗ Fatal: ${e.message}${C.reset}`;
      this._log("fatal", e.message);
      log.err(`Fatal: ${e.message}`);
      this.state.transition(PHASE.FAILED, (t, m) => this._log(t, m));
    } finally {
      this.cfg.auto_yes = origAutoYes;
      this.messages[0] = { role: "system", content: originalSystem };
      this.running = false;
    }

    // Trigger command
    try {
      const cmd = this.cfg.autopilot?.trigger_cmd || "";
      if (cmd && /completed/i.test(finalReason) && !this.aborted) {
        log.auto(`Trigger: ${cmd}`);
        await runShell(cmd, true);
      }
    } catch (e) { log.err(`Trigger failed: ${e.message}`); }

    this._printSummary(finalReason);
    this._saveLogFile();
    this.saveCallback();

    return {
      iterations: this.iteration,
      toolCalls: this.toolCalls,
      errors: this.errors,
      tokens: this.totalTokens,
      duration: Date.now() - this.startTime,
      filesCreated: this.diffTracker.filesCreated.length,
      filesModified: this.diffTracker.filesModified.length,
      compressions: this.contextManager.compressions,
      phase: this.state.phase,
      tasksCompleted: this.state.completedCount(),
      tasksTotal: this.state.tasks.length,
      replans: this.state.replanCount,
      verificationPassed: this.state.verificationPassed,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export {
  Autopilot,
  AutopilotState,
  Planner,
  Executor,
  Replanner,
  Verifier,
  ContextManager,
  DiffTracker,
  RecoveryStrategy,
  PHASE,
  TASK_STATUS,
  TOOL_OUTCOME,
  detectProjectType,
};
