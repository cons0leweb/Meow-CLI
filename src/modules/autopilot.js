// src/modules/autopilot.js — Упрощённая версия
// Только надёжное выполнение, никаких экспериментов

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

function getAutopilotVersion() {
  try {
    const pkgPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const AUTOPILOT_VERSION = getAutopilotVersion();

// Упрощённые фазы
const PHASE = {
  PLANNING:     "planning",
  EXECUTION:    "execution",
  VERIFICATION: "verification",
  COMPLETE:     "complete",
  FAILED:       "failed",
};

// Упрощённые статусы задач
const TASK_STATUS = {
  PENDING:   "pending",
  COMPLETED: "completed",
  FAILED:    "failed",
};

const PHASE_ICONS = {
  [PHASE.PLANNING]:     "📋",
  [PHASE.EXECUTION]:    "⚡",
  [PHASE.VERIFICATION]: "🔍",
  [PHASE.COMPLETE]:     "✅",
  [PHASE.FAILED]:       "❌",
};

const PHASE_COLORS = {
  [PHASE.PLANNING]:     INFO,
  [PHASE.EXECUTION]:    AUTO_CLR,
  [PHASE.VERIFICATION]: ACCENT2,
  [PHASE.COMPLETE]:     SUCCESS,
  [PHASE.FAILED]:       ERROR,
};

// Упрощённый промпт планировщика
const PLANNER_SYSTEM_PROMPT = `
You are a planning agent. Output a JSON plan:

{
  "tasks": [
    {"description": "Task description"}
  ]
}

Rules:
- Each task is a single, atomic action
- Order tasks logically
- Maximum 20 tasks
- Output ONLY valid JSON
`;

function executionPrompt(taskDescription, taskIndex, totalTasks) {
  return `
Execute this task: ${taskDescription} (${taskIndex + 1}/${totalTasks})

Use tools as needed. When done, respond naturally.
CWD: ${process.cwd()}
`;
}

function extractFirstValidJson(text) {
  if (!text || typeof text !== "string") return null;
  
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }
  
  let startIndex = -1;
  let endIndex = -1;
  let stack = [];
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (startIndex === -1 && (char === '{' || char === '[')) {
      startIndex = i;
      stack = [char];
      continue;
    }
    
    if (startIndex !== -1) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' && stack[stack.length - 1] === '{') {
        stack.pop();
        if (stack.length === 0) {
          endIndex = i;
          break;
        }
      } else if (char === ']' && stack[stack.length - 1] === '[') {
        stack.pop();
        if (stack.length === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }
  
  if (startIndex !== -1 && endIndex !== -1) {
    try {
      return JSON.parse(text.substring(startIndex, endIndex + 1));
    } catch {
      // fall through
    }
  }
  
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // fall through
    }
  }
  
  return null;
}

async function parseStructuredResponse(rawResponse, cfg, logFn, maxRetries = 3, context = "planning") {
  let lastError = null;
  let currentResponse = rawResponse;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const extracted = extractFirstValidJson(currentResponse);
    
    if (extracted !== null) {
      if (logFn) logFn("json_parse_success", `${context} parsed on attempt ${attempt}`);
      return extracted;
    }
    
    lastError = new Error("No valid JSON found");
    if (logFn) logFn("json_parse_failed", `${context} attempt ${attempt}/${maxRetries}: no valid JSON`);
    
    if (attempt < maxRetries) {
      const retryPrompt = `Your previous response was not valid JSON. Return ONLY valid JSON. Previous invalid response:\n${currentResponse.slice(0, 1000)}`;
      
      try {
        const retryMessages = [
          { role: "system", content: "You are a JSON generator. Output ONLY valid JSON, no other text." },
          { role: "user", content: retryPrompt }
        ];
        
        const data = await callApi(retryMessages, cfg);
        currentResponse = data.choices?.[0]?.message?.content || "";
        if (logFn) logFn("json_retry", `${context} retry attempt ${attempt + 1}`);
      } catch (retryError) {
        if (logFn) logFn("json_retry_error", `${context} retry failed: ${retryError.message}`);
      }
    }
  }
  
  if (logFn) logFn("json_parse_final_failure", `${context} failed after ${maxRetries} attempts`);
  return null;
}

class AutopilotState {
  constructor() {
    this.phase = PHASE.PLANNING;
    this.tasks = [];
    this.currentTaskIndex = -1;
    this.verificationPassed = false;
    this.verificationOutput = null;
  }

  transition(newPhase, logFn) {
    const old = this.phase;
    this.phase = newPhase;
    if (logFn && old !== newPhase) {
      logFn("phase_transition", `${old} → ${newPhase}`);
    }
  }

  allTasksCompleted() {
    if (this.tasks.length === 0) return false;
    return this.tasks.every(t => t.status === TASK_STATUS.COMPLETED);
  }

  getNextPendingTask() {
    return this.tasks.find(t => t.status === TASK_STATUS.PENDING) || null;
  }

  completedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
  }

  failedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.FAILED).length;
  }

  pendingCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.PENDING).length;
  }
}

// Упрощённый менеджер контекста
class ContextManager {
  constructor(cfg = {}, maxTokens = 120000) {
    this.maxTokens = maxTokens;
    this.cfg = cfg;
    this.compressions = 0;
  }

  estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
      total += Math.ceil(content.length / 3.5);
      if (msg.tool_calls) {
        total += msg.tool_calls.length * 50;
      }
    }
    return total;
  }

  needsCompression(messages) {
    return this.estimateTokens(messages) > this.maxTokens * 0.8;
  }

  compress(messages) {
    if (messages.length < 10) return messages;
    
    this.compressions++;
    
    // Простая стратегия: сохраняем систему и последние 12 сообщений
    const systemMsg = messages[0];
    const recentMessages = messages.slice(-12);
    
    const compressed = [
      systemMsg,
      { 
        role: "user", 
        content: `[Context compressed #${this.compressions}] Continuing from recent messages.`
      },
      ...recentMessages,
    ];
    
    log.dim(`Context compressed: ${messages.length} → ${compressed.length} messages`);
    return sanitizeToolCallsForApi(compressed);
  }
}

// Упрощённый трекер изменений
class DiffTracker {
  constructor() {
    this.filesCreated = [];
    this.filesModified = [];
    this.commandsRun = [];
    this.snapshots = new Map();
  }

  snapshotFile(filePath) {
    const resolved = path.resolve(filePath);
    if (this.snapshots.has(resolved)) return;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        this.snapshots.set(resolved, fs.readFileSync(resolved, "utf8"));
      } else {
        this.snapshots.set(resolved, null);
      }
    } catch {
      // ignore
    }
  }

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

  trackCommand(cmd) {
    this.commandsRun.push({ cmd: cmd.slice(0, 200), time: Date.now() });
  }

  getSummary() {
    const parts = [];
    const cwd = process.cwd();
    if (this.filesCreated.length > 0) {
      parts.push(`📄 Created (${this.filesCreated.length}): ${this.filesCreated.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.filesModified.length > 0) {
      parts.push(`✏️ Modified (${this.filesModified.length}): ${this.filesModified.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.commandsRun.length > 0) {
      parts.push(`🖥 Commands (${this.commandsRun.length}): ${this.commandsRun.map(c => c.cmd.slice(0, 60)).join("; ")}`);
    }
    return parts.join("\n") || "No changes tracked.";
  }

  getTotalChanges() {
    return this.filesCreated.length + this.filesModified.length;
  }
}

// Упрощённый recovery
class RecoveryStrategy {
  constructor() {
    this.retryMap = new Map();
    this.maxRetriesPerTool = 2;
    this.backoffMs = 1000;
  }

  shouldRetry(toolName) {
    const count = this.retryMap.get(toolName) || 0;
    return count < this.maxRetriesPerTool;
  }

  recordRetry(toolName) {
    const count = (this.retryMap.get(toolName) || 0) + 1;
    this.retryMap.set(toolName, count);
  }

  getBackoffMs(toolName) {
    const count = this.retryMap.get(toolName) || 0;
    return this.backoffMs * Math.pow(2, count - 1);
  }

  isApiError(error) {
    const msg = error.message || String(error);
    return /429|rate|500|502|503|timeout|ECONNRESET|fetch failed/i.test(msg);
  }
}

async function executeToolTracked(name, args, cfg, tracker, recovery, iteration) {
  const { getSandbox } = await import("./security/sandbox.js");
  const sandbox = getSandbox();
  const validation = sandbox.validate(name, args);
  if (!validation.allowed) {
    return { result: `❌ Security: ${validation.reason}`, changed: false };
  }

  let changed = false;
  
  if ((name === "write_file" || name === "patch_file") && args.path) {
    tracker.snapshotFile(args.path);
  }
  if (name === "run_shell" && args.cmd) {
    tracker.trackCommand(args.cmd);
  }

  try {
    const result = await executeTool(name, args, cfg);
    
    if ((name === "write_file" || name === "patch_file") && args.path) {
      tracker.trackWrite(args.path);
      changed = true;
    }
    
    return { result, changed };
  } catch (e) {
    if (recovery.shouldRetry(name) && recovery.isApiError(e)) {
      recovery.recordRetry(name);
      const backoff = recovery.getBackoffMs(name);
      log.warn(`API error, retry in ${backoff / 1000}s: ${e.message}`);
      await new Promise(r => setTimeout(r, backoff));
      try {
        const result = await executeTool(name, args, cfg);
        if ((name === "write_file" || name === "patch_file") && args.path) {
          tracker.trackWrite(args.path);
          changed = true;
        }
        return { result, changed };
      } catch (e2) {
        return { result: `❌ Tool error after retry: ${e2.message}`, changed: false };
      }
    }
    return { result: `❌ Tool error: ${e.message}`, changed: false };
  }
}

function detectProjectType() {
  const cwd = process.cwd();

  if (fs.existsSync(path.join(cwd, "package.json"))) {
    return { type: "node", cmd: "npm test" };
  }

  if (fs.existsSync(path.join(cwd, "pyproject.toml")) || fs.existsSync(path.join(cwd, "requirements.txt"))) {
    return { type: "python", cmd: "pytest" };
  }

  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) {
    return { type: "rust", cmd: "cargo test" };
  }

  if (fs.existsSync(path.join(cwd, "go.mod"))) {
    return { type: "go", cmd: "go test ./..." };
  }

  return null;
}

class Planner {
  constructor(cfg) {
    this.cfg = cfg;
    this.maxRetries = 3;
    this.maxTasks = 15;
  }

  async plan(task) {
    const plannerPrompt = PLANNER_SYSTEM_PROMPT + `\n\nIMPORTANT: Create at most ${this.maxTasks} tasks.`;
    
    const messages = [
      { role: "system", content: plannerPrompt },
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

    const parsed = await parseStructuredResponse(rawResponse, this.cfg, log.dim, this.maxRetries, "planning");
    
    if (!parsed) {
      log.err(`Planner failed to produce valid JSON after ${this.maxRetries} attempts`);
      return [];
    }
    
    return this._parsePlan(parsed);
  }

  _parsePlan(parsed) {
    const tasks = (parsed.tasks || []).map((t, i) => ({
      id: `task-${i + 1}`,
      description: t.description || String(t),
      status: TASK_STATUS.PENDING,
      result: null,
    }));
    return tasks;
  }
}

class Executor {
  constructor(cfg, tracker, recovery, contextManager, logFn) {
    this.cfg = cfg;
    this.tracker = tracker;
    this.recovery = recovery;
    this.contextManager = contextManager;
    this.logFn = logFn || (() => {});

    this.toolCalls = 0;
    this.errors = 0;
  }

  async execute(task, taskIndex, totalTasks, sharedMessages) {
    task.status = TASK_STATUS.PENDING;
    this.logFn("task_start", `${task.id}: ${task.description}`);
    
    let executionMessages = [
      ...sharedMessages,
      { role: "user", content: executionPrompt(task.description, taskIndex, totalTasks) },
    ];

    let localIterations = 0;
    const maxLocalIterations = 20;
    
    while (localIterations < maxLocalIterations) {
      localIterations++;

      if (this.contextManager.needsCompression(executionMessages)) {
        executionMessages = this.contextManager.compress(executionMessages);
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
        task.status = TASK_STATUS.FAILED;
        task.result = `API error: ${e.message}`;
        return { status: TASK_STATUS.FAILED, result: task.result, messages: executionMessages };
      }

      const msg = data.choices?.[0]?.message;
      if (!msg) {
        task.status = TASK_STATUS.FAILED;
        task.result = "Empty API response";
        return { status: TASK_STATUS.FAILED, result: task.result, messages: executionMessages };
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        executionMessages.push(msg);
        this.toolCalls += msg.tool_calls.length;

        for (const call of msg.tool_calls) {
          const name = call.function.name;
          let args = {};
          try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

          printToolExecution(name, args, 0, 1);
          this.logFn("tool_call", `${name}: ${JSON.stringify(args).slice(0, 300)}`);

          const { result, changed } = await executeToolTracked(
            name, args, this.cfg, this.tracker, this.recovery, localIterations
          );

          if (this.cfg.autopilot?.verbose !== false) {
            printToolResult(result, 4);
          }

          this.logFn("tool_result", `${name}: ${(result || "").slice(0, 500)}`);

          executionMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        }
        continue;
      }

      // Нет tool_calls — задача завершена
      const content = msg.content || "";
      executionMessages.push(msg);
      
      task.status = TASK_STATUS.COMPLETED;
      task.result = content;
      this.logFn("task_end", `${task.id}: COMPLETED after ${localIterations} iterations`);
      return { status: TASK_STATUS.COMPLETED, result: content, messages: executionMessages };
    }
    
    // Достигнут максимум итераций
    task.status = TASK_STATUS.FAILED;
    task.result = `Maximum iterations (${maxLocalIterations}) reached without completion`;
    this.logFn("task_failed", `${task.id}: FAILED`);
    return { status: TASK_STATUS.FAILED, result: task.result, messages: executionMessages };
  }
}

class Verifier {
  constructor() {
    this.output = null;
    this.passed = false;
  }

  async verify() {
    const project = detectProjectType();

    if (!project) {
      this.output = "No project type detected. Skipping verification.";
      this.passed = true;
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

function printToolExecution(name, args, index, total) {
  const argsStr = typeof args === "string" ? args : JSON.stringify(args);
  const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
  const counter = total > 1 ? `${MUTED}[${index + 1}/${total}]${C.reset} ` : "";
  console.log(`  ${TOOL_CLR}┃${C.reset} ${counter}${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);
}

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
    `${MUTED}c${state.completedCount()}/f${state.failedCount()}/${state.tasks.length}${C.reset}`,
    `${TEXT_DIM}${elapsed}${C.reset}`,
  ];

  console.log(`\n  ${parts.join(`  ${MUTED}·${C.reset}  `)}`);
}

class Autopilot {
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
    this.originalGoal = "";

    this.state = new AutopilotState();
    this.contextManager = new ContextManager(cfg, cfg.autopilot?.max_context_tokens || 120000);
    this.diffTracker = new DiffTracker();
    this.recovery = new RecoveryStrategy();

    const apCfg = cfg.autopilot || {};
    this.maxIterations = apCfg.max_iterations || 50;
    this.maxErrors = apCfg.max_errors || 5;
    this.retryDelay = apCfg.retry_delay_ms || 2000;
    this.saveLog = apCfg.save_log !== false;
    this.verbose = apCfg.verbose !== false;

    this.planner = new Planner(cfg);
    this.verifier = new Verifier();
    this.executor = null;
  }

  abort() {
    this.aborted = true;
    this.running = false;
  }

  _log(type, msg) {
    this.logEntries.push({
      time: Date.now(),
      iteration: this.iteration,
      phase: this.state.phase,
      type,
      msg: typeof msg === "string" ? msg.slice(0, 2000) : JSON.stringify(msg).slice(0, 2000),
    });
  }

  _printHeader(task) {
    console.log("");
    const lines = [
      `${AUTO_CLR}${C.bold}AUTOPILOT ENGAGED v3.0${C.reset}`,
      ``,
      `${MUTED}Task:${C.reset} ${TEXT}${task.slice(0, 120)}${task.length > 120 ? "…" : ""}${C.reset}`,
      ``,
      `${MUTED}Model:${C.reset}        ${ACCENT}${this.cfg.model}${C.reset}`,
      `${MUTED}Version:${C.reset}      ${TEXT_DIM}v${AUTOPILOT_VERSION}${C.reset}`,
      `${MUTED}Max iters:${C.reset}    ${TEXT}${this.maxIterations}${C.reset}`,
      `${MUTED}Auto-confirm:${C.reset} ${SUCCESS}ON${C.reset}`,
      ``,
      `${TEXT_DIM}Press ${C.bold}Ctrl+C${C.reset}${TEXT_DIM} to stop gracefully${C.reset}`,
    ];
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  _printSummary(reason) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const diffSummary = this.diffTracker.getSummary();

    const lines = [
      `${C.bold}Status:${C.reset}       ${reason}`,
      `${C.bold}Phase:${C.reset}        ${this.state.phase}`,
      `${C.bold}Tasks:${C.reset}        ${this.state.completedCount()} completed, ${this.state.failedCount()} failed, ${this.state.pendingCount()} pending`,
      `${C.bold}Iterations:${C.reset}   ${this.iteration} / ${this.maxIterations}`,
      `${C.bold}Tool calls:${C.reset}   ${this.toolCalls}`,
      `${C.bold}Errors:${C.reset}       ${this.errors}`,
      `${C.bold}Duration:${C.reset}     ${elapsed}`,
      ``,
      `${C.bold}Changes:${C.reset}`,
      ...diffSummary.split("\n").map(l => `  ${l}`),
    ];

    if (this.state.tasks.length > 0) {
      lines.push(``, `${C.bold}Task Status:${C.reset}`);
      for (const t of this.state.tasks) {
        let icon = "";
        if (t.status === TASK_STATUS.COMPLETED) icon = "✅";
        else if (t.status === TASK_STATUS.FAILED) icon = "❌";
        else icon = "⏳";
        
        const desc = t.description.length > 80 ? t.description.slice(0, 77) + "…" : t.description;
        lines.push(`  ${icon} ${TEXT_DIM}${desc}${C.reset}`);
      }
    }

    console.log("");
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT SUMMARY", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  _saveLogFile() {
    if (!this.saveLog || this.logEntries.length === 0) return;
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(LOG_DIR, `autopilot-${ts}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        version: 7,
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: formatDuration(Date.now() - this.startTime),
        iterations: this.iteration,
        toolCalls: this.toolCalls,
        errors: this.errors,
        model: this.cfg.model,
        phase: this.state.phase,
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
        entries: this.logEntries,
      }, null, 2));
      log.dim(`Log saved: ${logFile}`);
    } catch (e) { log.dim(`Log save failed: ${e.message}`); }
  }

  _initExecutor() {
    this.executor = new Executor(
      this.cfg, this.diffTracker, this.recovery,
      this.contextManager, (type, msg) => this._log(type, msg)
    );
  }

  async run(task) {
    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.logEntries = [];
    this.originalGoal = task;

    this.state = new AutopilotState();
    this.diffTracker = new DiffTracker();
    this.recovery = new RecoveryStrategy();
    this.contextManager = new ContextManager(this.cfg, this.cfg.autopilot?.max_context_tokens || 120000);
    this._initExecutor();

    const optimizer = new PromptOptimizer(this.cfg);
    let finalTask = task;
    if (this.cfg.prompt_optimizer?.enabled) {
      finalTask = await optimizer.optimize(task);
    }

    const trust = getTrustManager();
    const status = await trust.checkStatus();
    if (status !== TRUST_LEVEL.TRUSTED) {
      log.err(t(this.cfg, "trust_readonly_warning"));
      return { error: "Untrusted repository" };
    }

    const origAutoYes = this.cfg.auto_yes;
    this.cfg.auto_yes = true;

    this._printHeader(task);
    this._log("start", task);

    this.messages = sanitizeToolCallsForApi(this.messages);
    const originalSystem = this.messages[0]?.content || "";

    let finalReason = `${SUCCESS}✓ Completed${C.reset}`;

    try {
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
        this._log("plan", `Generated ${tasks.length} tasks`);
        log.ok(`Plan: ${tasks.length} tasks defined`);

        while (this.running && this.iteration < this.maxIterations && !this.aborted) {
          this.iteration++;
          printStatusBar(this, this.state);

          const pendingTask = this.state.getNextPendingTask();
          if (!pendingTask) {
            if (this.state.allTasksCompleted()) break;
            break;
          }

          this.state.transition(PHASE.EXECUTION, (t, m) => this._log(t, m));
          this.state.currentTaskIndex = this.state.tasks.indexOf(pendingTask);

          log.auto(`⚡ EXECUTING: ${pendingTask.description.slice(0, 100)}`);

          const execResult = await this.executor.execute(
            pendingTask,
            this.state.currentTaskIndex,
            this.state.tasks.length,
            this.messages
          );

          this.toolCalls += this.executor.toolCalls;
          this.errors += this.executor.errors;
          this.executor.toolCalls = 0;
          this.executor.errors = 0;

          this.messages = execResult.messages;

          if (execResult.status === TASK_STATUS.COMPLETED) {
            log.ok(`  Task complete: ${pendingTask.description.slice(0, 60)}`);
          } else if (execResult.status === TASK_STATUS.FAILED) {
            log.err(`  Task failed: ${pendingTask.description.slice(0, 60)}`);
          }

          if (this.errors >= this.maxErrors) {
            finalReason = `${ERROR}✗ Too many errors (${this.errors})${C.reset}`;
            this._log("max_errors", `Error limit ${this.maxErrors}`);
            break;
          }

          this.saveCallback();
        }
      }

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
        }
      } else if (!this.running || this.aborted) {
        finalReason = `${WARNING}▲ Aborted (Ctrl+C)${C.reset}`;
        this._log("abort", "User aborted");
      } else if (this.iteration >= this.maxIterations) {
        finalReason = `${WARNING}▲ Max iterations (${this.maxIterations})${C.reset}`;
        this._log("limit", "Max iterations");
      }

    } catch (e) {
      finalReason = `${ERROR}✗ Fatal: ${e.message}${C.reset}`;
      this._log("fatal", e.message);
      log.err(`Fatal: ${e.message}`);
    } finally {
      this.cfg.auto_yes = origAutoYes;
      this.messages[0] = { role: "system", content: originalSystem };
      this.running = false;
    }

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
      duration: Date.now() - this.startTime,
      filesCreated: this.diffTracker.filesCreated.length,
      filesModified: this.diffTracker.filesModified.length,
      compressions: this.contextManager.compressions,
      phase: this.state.phase,
      tasksCompleted: this.state.completedCount(),
      tasksFailed: this.state.failedCount(),
      tasksTotal: this.state.tasks.length,
      verificationPassed: this.state.verificationPassed,
    };
  }
}

export {
  Autopilot,
  AutopilotState,
  Planner,
  Executor,
  Verifier,
  ContextManager,
  DiffTracker,
  RecoveryStrategy,
  PHASE,
  TASK_STATUS,
  AUTOPILOT_VERSION,
  detectProjectType,
  parseStructuredResponse,
  extractFirstValidJson,
};