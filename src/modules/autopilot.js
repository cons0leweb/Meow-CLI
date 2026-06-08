/**
 * @fileoverview Enhanced Autopilot module v3.0 - Task/Attempt separation
 * @version 3.0.0
 */

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

const PHASE = {
  PLANNING:      "planning",
  EXECUTION:     "execution",
  
  VERIFICATION:  "verification",
  COMPLETE:      "complete",
  FAILED:        "failed",
};

// Simplified task states: PENDING → COMPLETED or FAILED
const TASK_STATUS = {
  PENDING:   "pending",
  COMPLETED: "completed",
  FAILED:    "failed",
};

const TOOL_OUTCOME = {
  SUCCESS: "success",
  FAILURE: "failure",
};

const COMPLEXITY_MODE = {
  DIRECT: "direct",
  PLANNED: "planned"
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

const PLANNER_SYSTEM_PROMPT = `
You are a planning agent. Your ONLY job is to produce a structured JSON plan.

Given a task description, you MUST output a JSON object with this exact structure:

{
  "tasks": [
    {
      "description": "Concise description of what to do (one action per task)",
      "targetFiles": ["file1.js", "file2.py"],
      "successCriteria": "Clear condition that proves task completion"
    }
  ]
}

RULES:
- Each task must be a single, atomic action.
- Order tasks logically (dependencies first).
- targetFiles MUST be populated with the main files this task will modify.
- successCriteria MUST be specific and verifiable.
- Do NOT include any text outside the JSON.
- Do NOT use markdown code fences around the JSON.
- The JSON must be valid and parseable.
- Maximum 20 tasks.

Output ONLY the JSON object, nothing else.`;

function executionPrompt(taskDescription, taskIndex, totalTasks) {
  return `
You are executing one specific task. Execute ONLY this task, nothing more.

CURRENT TASK (${taskIndex + 1}/${totalTasks}):
${taskDescription}

INSTRUCTIONS:
- Use tools as needed to complete this ONE task.
- If a tool fails, try a different approach. Tool errors are NOT task failures.
- When done, respond with "TASK DONE" and a brief summary.
- If the task is truly impossible (file missing with no way to create it), respond with "TASK FAILED: <reason>".

CWD: ${process.cwd()}
Time: ${new Date().toISOString()}
`;
}



function extractFirstValidJson(text) {
  if (!text || typeof text !== "string") return null;
  
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue to extraction
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

function extractTargetFilesFromDescription(description) {
  const files = [];
  const filePattern = /(?:[\w\/-]+\.(?:js|ts|jsx|tsx|py|go|rs|json|html|css|md))/g;
  const matches = description.match(filePattern);
  if (matches) files.push(...matches);
  
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes("api") && !files.some(f => f.includes("api"))) {
    if (lowerDesc.includes(".js")) files.push("api.js");
    else if (lowerDesc.includes(".py")) files.push("api.py");
    else files.push("api");
  }
  
  if (lowerDesc.includes("config") && !files.some(f => f.includes("config"))) {
    if (lowerDesc.includes(".js")) files.push("config.js");
    else if (lowerDesc.includes(".json")) files.push("config.json");
    else files.push("config");
  }
  
  if (lowerDesc.includes("readme") && !files.some(f => f.includes("readme"))) {
    files.push("README.md");
  }
  
  return [...new Set(files)];
}

function extractSuccessCriteriaFromDescription(description) {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes("add flag") || lowerDesc.includes("--version")) {
    return "Command responds with version information";
  }
  if (lowerDesc.includes("fix bug") || lowerDesc.includes("fix error")) {
    return "Error is resolved and functionality works correctly";
  }
  if (lowerDesc.includes("rename")) {
    return "File/function is renamed successfully";
  }
  if (lowerDesc.includes("refactor")) {
    return "Code is restructured without breaking existing functionality";
  }
  if (lowerDesc.includes("test")) {
    return "All tests pass successfully";
  }
  return "Task completed successfully with verifiable results";
}

function estimateComplexity(taskDescription) {
  const lower = taskDescription.toLowerCase();
  
  const complexKeywords = [
    'refactor', 'architecture', 'redesign', 'rewrite', 'migrate',
    'plugin system', 'modular', 'restructure', 'overhaul',
    'implement', 'integrate', 'database', 'api gateway', 'microservice'
  ];
  
  const simpleKeywords = [
    'add flag', 'fix bug', 'rename', 'delete', 'update version',
    'bump', 'patch', 'typo', 'comment', 'log', 'console'
  ];
  
  const isComplex = complexKeywords.some(kw => lower.includes(kw));
  const isSimple = simpleKeywords.some(kw => lower.includes(kw));
  
  if (isSimple) return { mode: COMPLEXITY_MODE.DIRECT, suggestedMaxTasks: 5 };
  if (isComplex) return { mode: COMPLEXITY_MODE.PLANNED, suggestedMaxTasks: 20 };
  
  const wordCount = taskDescription.split(/\s+/).length;
  if (wordCount < 15) return { mode: COMPLEXITY_MODE.DIRECT, suggestedMaxTasks: 7 };
  
  return { mode: COMPLEXITY_MODE.PLANNED, suggestedMaxTasks: 15 };
}

function calculateRelevanceScore(taskDescription, targetFile) {
  if (!taskDescription || !targetFile) return 0;
  
  const taskLower = taskDescription.toLowerCase();
  const fileLower = targetFile.toLowerCase();
  const fileName = path.basename(fileLower);
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  
  let score = 0;
  if (taskLower.includes(fileNameWithoutExt)) score += 0.5;
  if (taskLower.includes(fileName)) score += 0.3;
  
  const taskWords = taskLower.split(/[\s_\-./]+/);
  const fileWords = fileLower.split(/[\s_\-./]+/);
  const commonWords = taskWords.filter(word => word.length > 2 && fileWords.includes(word));
  score += commonWords.length * 0.1;
  
  const extensions = {
    '.js': ['javascript', 'node', 'script'],
    '.py': ['python', 'script'],
    '.go': ['golang'],
    '.rs': ['rust'],
    '.ts': ['typescript'],
    '.json': ['config', 'configuration'],
    '.html': ['html', 'web'],
    '.css': ['style', 'stylesheet'],
    '.md': ['documentation', 'doc', 'readme']
  };
  
  const ext = path.extname(fileLower);
  if (extensions[ext]) {
    const extKeywords = extensions[ext];
    if (extKeywords.some(kw => taskLower.includes(kw))) score += 0.2;
  }
  
  const pathPatterns = {
    'api': ['api', 'endpoint', 'route'],
    'config': ['config', 'configuration', 'setting'],
    'test': ['test', 'spec'],
    'util': ['util', 'helper', 'common'],
    'model': ['model', 'schema', 'entity'],
    'controller': ['controller', 'handler'],
    'service': ['service', 'business'],
    'repository': ['repository', 'dao', 'data']
  };
  
  for (const [pattern, keywords] of Object.entries(pathPatterns)) {
    if (fileLower.includes(pattern) && keywords.some(kw => taskLower.includes(kw))) {
      score += 0.25;
      break;
    }
  }
  
  return Math.min(score, 1.0);
}

function isRelevantFileChange(taskDescription, targetFiles, actualFile) {
  if (!targetFiles || targetFiles.length === 0) return true;
  
  const score = calculateRelevanceScore(taskDescription, actualFile);
  const isExplicitMatch = targetFiles.some(target => 
    actualFile.includes(target) || target.includes(actualFile)
  );
  
  if (isExplicitMatch) return true;
  if (score >= 0.4) {
    log.dim(`File ${actualFile} has relevance score ${score.toFixed(2)} for task: ${taskDescription.slice(0, 50)}`);
    return true;
  }
  
  log.warn(`⚠️  File ${actualFile} is not relevant to task: ${taskDescription.slice(0, 50)} (score: ${score.toFixed(2)})`);
  return false;
}



class AutopilotState {
  constructor() {
    this.phase = PHASE.PLANNING;
    this.tasks = [];
    this.currentTaskIndex = -1;
    this.verificationPassed = false;
    this.verificationOutput = null;
    this.failedCount = 0;
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
    return this.tasks.every(t => 
      t.status === TASK_STATUS.COMPLETED
    );
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

class ContextManager {
  constructor(cfg = {}, maxTokens = 4000000) {
    this.maxTokens = maxTokens;
    this.warningThreshold = 0.75;
    this.criticalThreshold = 0.90;
    this.estimatedTokens = 0;
    this.compressions = 0;
    this.cfg = cfg;
  }

  estimateTokens(messages) {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "");
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

  getUsageRatio() {
    return this.estimatedTokens / this.maxTokens;
  }

  needsCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.warningThreshold;
  }

  needsCriticalCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.criticalThreshold;
  }

  async compress(messages) {
    if (messages.length < 10) return messages;
    this.compressions++;

    if (this.cfg?.api_key) {
      try {
        const result = await compactWithAI(messages, this.cfg, 6);
        if (result.compressed) {
          this.estimatedTokens = result.after?.tokens || this.estimateTokens(result.messages);
          log.dim(`Context: ~${result.before?.tokens?.toLocaleString() || "?"} → ~${this.estimatedTokens.toLocaleString()} tokens (AI summary)`);
          return sanitizeToolCallsForApi(result.messages);
        }
      } catch {
        // fall through
      }
    }

    const systemMsg = messages[0];
    const recentCount = Math.min(12, Math.floor(messages.length * 0.3));
    const recentMessages = messages.slice(-recentCount);
    const oldMessages = messages.slice(1, -recentCount);
    const summary = this._summarizeMessages(oldMessages);

    const compressed = [
      systemMsg,
      {
        role: "user",
        content: `[CONTEXT COMPRESSION #${this.compressions}]\nPrevious ${oldMessages.length} messages were compressed.\n\n${summary}\n\nContinue from where you left off.`
      },
      ...recentMessages,
    ];

    const oldTokens = this.estimatedTokens;
    this.estimateTokens(compressed);
    log.dim(`Context: ~${oldTokens} → ~${this.estimatedTokens} tokens (${compressed.length} msgs)`);

    return sanitizeToolCallsForApi(compressed);
  }

  _summarizeMessages(messages) {
    const parts = [];
    let lastAssistant = "";
    const toolResults = [];
    const files = new Set();

    for (const msg of messages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (msg.role === "assistant" && content) lastAssistant = content;
      if (msg.role === "tool" && content) toolResults.push(content.split("\n")[0].slice(0, 150));
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
      parts.push(`✏️  Modified (${this.filesModified.length}): ${this.filesModified.map(f => path.relative(cwd, f)).join(", ")}`);
    }
    if (this.commandsRun.length > 0) {
      parts.push(`🖥  Commands (${this.commandsRun.length}): ${this.commandsRun.map(c => c.cmd.slice(0, 60)).join("; ")}`);
    }
    return parts.join("\n") || "No changes tracked.";
  }

  getTotalChanges() {
    return this.filesCreated.length + this.filesModified.length;
  }
}

class RecoveryStrategy {
  constructor() {
    this.errorHistory = [];
    this.retryMap = new Map();
    this.maxRetriesPerTool = 3;
    this.backoffMs = 2000;
  }

  recordError(error, toolName, iteration) {
    this.errorHistory.push({
      error: error.message || String(error),
      tool: toolName,
      iteration,
      time: Date.now(),
    });
    const count = (this.retryMap.get(toolName) || 0) + 1;
    this.retryMap.set(toolName, count);
  }

  shouldRetry(toolName) {
    return (this.retryMap.get(toolName) || 0) < this.maxRetriesPerTool;
  }

  getBackoffMs(toolName) {
    const count = this.retryMap.get(toolName) || 0;
    return this.backoffMs * Math.pow(2, Math.max(0, count - 1));
  }

  isApiError(error) {
    const msg = error.message || String(error);
    return /429|rate|500|502|503|timeout|ECONNRESET|fetch failed|socket/i.test(msg);
  }

  isToolCallValidationError(error) {
    const msg = error.message || String(error);
    return /tool_calls.*must be followed|insufficient tool messages|tool_call_id/i.test(msg);
  }

  isRetryableToolError(error) {
    const msg = error.message || String(error);
    if (/not found|ENOENT|EACCES|EISDIR|EPERM|EEXIST/i.test(msg)) return false;
    if (/timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAGAIN|EBUSY/i.test(msg)) return true;
    return true;
  }

  getRecoveryHint(error) {
    const msg = error.message || String(error);
    if (/429|rate/i.test(msg)) return "Rate limited — backoff";
    if (/500|502|503/i.test(msg)) return "Server error — retrying";
    if (/timeout/i.test(msg)) return "Timeout — retrying";
    if (/context.?length|token/i.test(msg)) return "Context overflow — compressing";
    if (this.isToolCallValidationError(error)) return "Broken tool call sequence — sanitizing";
    if (/not found|ENOENT/i.test(msg)) return "File/resource not found — check path";
    if (/EACCES|EPERM/i.test(msg)) return "Permission denied — access blocked";
    if (/ENOSPC/i.test(msg)) return "No disk space — cannot write";
    return "Unknown error — recovering";
  }

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

function evaluateToolOutcome(name, result, hasChanges = false) {
  if (!result) return TOOL_OUTCOME.FAILURE;
  const r = String(result);
  
  
  if (r.startsWith("❌") || r.includes("Error:") || r.includes("error:")) {
    return TOOL_OUTCOME.FAILURE;
  }
  
  
  return TOOL_OUTCOME.SUCCESS;
}

async function executeToolTracked(name, args, cfg, tracker, recovery, iteration, taskContext = null) {
  const { getSandbox } = await import("./security/sandbox.js");
  const sandbox = getSandbox();
  const validation = sandbox.validate(name, args);
  if (!validation.allowed) {
    return { result: `❌ Security: ${validation.reason}`, outcome: TOOL_OUTCOME.FAILURE, changed: false };
  }

  let changed = false;
  
  if ((name === "write_file" || name === "patch_file") && args.path) {
    if (taskContext && taskContext.targetFiles && taskContext.targetFiles.length > 0) {
      const isRelevant = isRelevantFileChange(taskContext.description, taskContext.targetFiles, args.path);
      if (!isRelevant) {
        return { 
          result: `❌ RELEVANCE BLOCKED: Task "${taskContext.description.slice(0, 50)}" target files: ${taskContext.targetFiles.join(", ")}. Attempted to modify ${args.path} which is not relevant.`, 
          outcome: TOOL_OUTCOME.FAILURE,
          changed: false
        };
      }
    }
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
    
    const outcome = evaluateToolOutcome(name, result, changed);
    return { result, outcome, changed };
  } catch (e) {
    recovery.recordError(e, name, iteration);
    if (recovery.shouldRetry(name) && recovery.isRetryableToolError(e)) {
      const backoff = recovery.getBackoffMs(name);
      log.warn(`${recovery.getRecoveryHint(e)} (retry in ${backoff / 1000}s)`);
      await new Promise(r => setTimeout(r, backoff));
      try {
        const result = await executeTool(name, args, cfg);
        if ((name === "write_file" || name === "patch_file") && args.path) {
          tracker.trackWrite(args.path);
          changed = true;
        }
        return { result, outcome: evaluateToolOutcome(name, result, changed), changed };
      } catch (e2) {
        return { result: `❌ Tool error after retry: ${e2.message}`, outcome: TOOL_OUTCOME.FAILURE, changed: false };
      }
    }
    return { result: `❌ Tool error (max retries): ${e.message}`, outcome: TOOL_OUTCOME.FAILURE, changed: false };
  }
}

function detectProjectType() {
  const cwd = process.cwd();

  if (fs.existsSync(path.join(cwd, "package.json"))) {
    try {
      const pkgContent = fs.readFileSync(path.join(cwd, "package.json"), "utf8");
      const pkg = JSON.parse(pkgContent);
      const scripts = pkg.scripts || {};
      if (scripts.test) return { type: "node", cmd: "npm test" };
    } catch {
      log.warn("package.json is invalid, falling back to default test command");
      return { type: "node", cmd: "node --test" };
    }
    return { type: "node", cmd: "node --test" };
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
  }

  async plan(task) {
    const complexity = estimateComplexity(task);
    const maxTasks = complexity.suggestedMaxTasks;
    
    const plannerPrompt = PLANNER_SYSTEM_PROMPT + `\n\nIMPORTANT: Create at most ${maxTasks} tasks. Each task MUST include targetFiles array and successCriteria string.`;
    
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
    
    return this._parsePlan(parsed, task);
  }

  _parsePlan(parsed, originalTask) {
    const tasks = (parsed.tasks || []).map((t, i) => {
      let targetFiles = t.targetFiles || [];
      let successCriteria = t.successCriteria || "";
      
      if (targetFiles.length === 0) {
        targetFiles = extractTargetFilesFromDescription(t.description || String(t));
      }
      
      if (targetFiles.length === 0 && originalTask) {
        targetFiles = extractTargetFilesFromDescription(originalTask);
      }
      
      if (!successCriteria) {
        successCriteria = extractSuccessCriteriaFromDescription(t.description || String(t));
      }
      
      return {
        id: `task-${i + 1}`,
        description: t.description || String(t),
        status: TASK_STATUS.PENDING,
        result: null,
        attempts: 0,
        maxAttempts: 10,
        successCriteria: successCriteria,
        targetFiles: targetFiles
      };
    });
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
    this.logFn("task_start", `${task.id}: ${task.description}`);
    
    const maxAttempts = task.maxAttempts || 10;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      attempt++;
      this.logFn("attempt_start", `Attempt ${attempt}/${maxAttempts}`);
      
      const attemptResult = await this._executeAttempt(task, taskIndex, totalTasks, sharedMessages, attempt);
      
      if (attemptResult.completed) {
        task.status = TASK_STATUS.COMPLETED;
        task.result = attemptResult.result;
        this.logFn("task_end", `${task.id}: COMPLETED after ${attempt} attempts`);
        return { status: TASK_STATUS.COMPLETED, result: attemptResult.result, messages: attemptResult.messages };
      }
      
      this.logFn("attempt_failure", `Attempt ${attempt} failed: ${attemptResult.reason || "unknown"}`);
    }
    
    // Исчерпан лимит попыток — задача FAILED
    task.status = TASK_STATUS.FAILED;
    task.result = `Failed after ${maxAttempts} unsuccessful attempts`;
    this.logFn("task_failed", `${task.id}: FAILED after ${maxAttempts} attempts`);
    return { status: TASK_STATUS.FAILED, result: task.result, messages: sharedMessages };
  }
  
  async _executeAttempt(task, taskIndex, totalTasks, sharedMessages, attemptNumber) {
    let executionMessages = [
      ...sharedMessages,
      { role: "user", content: executionPrompt(task.description, taskIndex, totalTasks) },
    ];

    let hasRealToolCalls = false;
    let hasRealChanges = false;
    let successfulToolResults = 0;
    let filesCreatedBefore = this.tracker.filesCreated.length;
    let filesModifiedBefore = this.tracker.filesModified.length;
    let localIterations = 0;
    const maxLocalIterations = 10;
    
    while (localIterations < maxLocalIterations) {
      localIterations++;

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
        return { completed: false, partial: false, reason: `API error: ${e.message}`, messages: executionMessages };
      }

      const msg = data.choices?.[0]?.message;
      if (!msg) {
        return { completed: false, partial: false, reason: "Empty API response", messages: executionMessages };
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        executionMessages.push(msg);
        this.toolCalls += msg.tool_calls.length;
        hasRealToolCalls = true;

        for (const call of msg.tool_calls) {
          const name = call.function.name;
          let args = {};
          try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

          printToolExecution(name, args, 0, 1);
          this.logFn("tool_call", `${name}: ${JSON.stringify(args).slice(0, 300)}`);

          const taskContext = {
            description: task.description,
            targetFiles: task.targetFiles || []
          };

          const { result, outcome, changed } = await executeToolTracked(
            name, args, this.cfg, this.tracker, this.recovery, attemptNumber, taskContext
          );

          if (this.cfg.autopilot?.verbose !== false) {
            printToolResult(result, 4);
          }

          this.logFn("tool_result", `${name}: ${(result || "").slice(0, 500)}`);

          if (outcome !== TOOL_OUTCOME.FAILURE) {
            successfulToolResults++;
            if (changed) hasRealChanges = true;
          }

          executionMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
          });
        }
        continue;
      }

      const content = msg.content || "";
      executionMessages.push(msg);

      const hasCompletionMarker = /TASK\s+DONE/i.test(content);
      const hasFailedMarker = /TASK\s+FAILED/i.test(content);
      
      const filesCreatedNow = this.tracker.filesCreated.length - filesCreatedBefore;
      const filesModifiedNow = this.tracker.filesModified.length - filesModifiedBefore;
      const hasAnyProgress = hasRealToolCalls || hasRealChanges || successfulToolResults > 0 || filesCreatedNow > 0 || filesModifiedNow > 0;
      
      if (hasCompletionMarker) {
        if (hasAnyProgress) {
          return { completed: true, result: content, messages: executionMessages };
        } else {
          return { completed: false, reason: "Completion marker without evidence", messages: executionMessages };
        }
      }
      
      if (hasFailedMarker) {
        return { completed: false, reason: "Task reported FAILED", messages: executionMessages };
      }
      
      // Без маркеров, нет прогресса — пустая попытка
      if (localIterations >= 2 && !msg.tool_calls && !hasAnyProgress) {
        return { completed: false, reason: "No progress and no completion marker", messages: executionMessages };
      }
    }
    
    return { completed: false, reason: `No completion after ${maxLocalIterations} iterations`, messages: executionMessages };
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

function printToolCallBlock(calls) {
  const count = calls.length;
  console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}Tools${C.reset} ${MUTED}(${count} call${count > 1 ? "s" : ""})${C.reset}`);
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
      `${MUTED}Max attempts/task:${C.reset} ${TEXT}10${C.reset}`,
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
    const errorSummary = this.recovery.getErrorSummary();

    const lines = [
      `${C.bold}Status:${C.reset}       ${reason}`,
      `${C.bold}Phase:${C.reset}        ${this.state.phase}`,
      `${C.bold}Tasks:${C.reset}        ${this.state.completedCount()} completed, ${this.state.failedCount()} failed, ${this.state.pendingCount()} pending`,
      `${C.bold}Iterations:${C.reset}   ${this.iteration} / ${this.maxIterations}`,
      `${C.bold}Tool calls:${C.reset}   ${this.toolCalls}`,
      `${C.bold}Errors:${C.reset}       ${this.errors}${this.errors > 0 ? ` (${errorSummary})` : ""}`,
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
        if (t.targetFiles && t.targetFiles.length > 0) {
          lines.push(`     ${MUTED}→ files: ${t.targetFiles.join(", ")}${C.reset}`);
        }
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
        version: 6,
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
          attempts: t.attempts,
          maxAttempts: t.maxAttempts,
          targetFiles: t.targetFiles,
          successCriteria: t.successCriteria,
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
    if (!origAutoYes) {
      log.warn("AUTOPILOT: Enabling auto-confirm (auto_yes=true) for autonomous execution");
      log.warn("AUTOPILOT: Only use this if you trust the LLM completely");
    }
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

          if (this.state.allTasksCompleted()) {
            this._log("all_tasks_complete", `All tasks completed or replaced`);
            break;
          }



          const pendingTask = this.state.getNextPendingTask();
          if (!pendingTask) {
            if (this.state.allTasksCompleted()) break;
            break;
          }

          this.state.transition(PHASE.EXECUTION, (t, m) => this._log(t, m));
          this.state.currentTaskIndex = this.state.tasks.indexOf(pendingTask);

          log.auto(`⚡ EXECUTING: ${pendingTask.description.slice(0, 100)} (max attempts: ${pendingTask.maxAttempts || 10})`);

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
  TOOL_OUTCOME,
  AUTOPILOT_VERSION,
  detectProjectType,
  estimateComplexity,
  parseStructuredResponse,
  extractFirstValidJson,
  extractTargetFilesFromDescription,
  extractSuccessCriteriaFromDescription,
  calculateRelevanceScore,
  isRelevantFileChange,
  COMPLEXITY_MODE,
};