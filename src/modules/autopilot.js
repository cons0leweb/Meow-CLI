/**
 * @fileoverview Enhanced Autopilot module v2.1 - Stable release with critical fixes
 * @version 2.1.0
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

/**
 * Retrieves Autopilot module version from package.json
 * @returns {string} Autopilot module version from package.json
 */
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

/**
 * Phase constants for state machine
 * @readonly
 * @enum {string}
 */
const PHASE = {
  PLANNING:      "planning",
  EXECUTION:     "execution",
  REPLANNING:    "replanning",
  VERIFICATION:  "verification",
  COMPLETE:      "complete",
  FAILED:        "failed",
};

/**
 * Task status constants
 * @readonly
 * @enum {string}
 */
const TASK_STATUS = {
  PENDING:   "pending",
  RUNNING:   "running",
  COMPLETED: "completed",
  FAILED:    "failed",
  BLOCKED:   "blocked",
  REPLACED:  "replaced",
};

/**
 * Tool outcome constants
 * @readonly
 * @enum {string}
 */
const TOOL_OUTCOME = {
  SUCCESS: "success",
  FAILURE: "failure",
  PARTIAL: "partial",
};

/**
 * Complexity modes for task planning
 * @readonly
 * @enum {string}
 */
const COMPLEXITY_MODE = {
  DIRECT: "direct",
  PLANNED: "planned"
};

/**
 * Phase icons mapping
 * @type {Object<string, string>}
 */
const PHASE_ICONS = {
  [PHASE.PLANNING]:     "📋",
  [PHASE.EXECUTION]:    "⚡",
  [PHASE.REPLANNING]:   "🔧",
  [PHASE.VERIFICATION]: "🔍",
  [PHASE.COMPLETE]:     "✅",
  [PHASE.FAILED]:       "❌",
};

/**
 * Phase colors mapping
 * @type {Object<string, string>}
 */
const PHASE_COLORS = {
  [PHASE.PLANNING]:     INFO,
  [PHASE.EXECUTION]:    AUTO_CLR,
  [PHASE.REPLANNING]:   WARNING,
  [PHASE.VERIFICATION]: ACCENT2,
  [PHASE.COMPLETE]:     SUCCESS,
  [PHASE.FAILED]:       ERROR,
};

/**
 * Planning system prompt with targetFiles requirement
 * @type {string}
 */
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
- successCriteria MUST be specific and verifiable (e.g., "flag --version shows version 1.0.0").
- Do NOT include any text outside the JSON.
- Do NOT use markdown code fences around the JSON.
- The JSON must be valid and parseable.
- Maximum 20 tasks.
- Use tool names like: list_dir, read_file, write_file, patch_file, grep_search, run_shell, find_files, git_diff, http_request, web_search

Output ONLY the JSON object, nothing else.`;

/**
 * Generates execution prompt for a single task
 * @param {string} taskDescription - Description of the task to execute
 * @param {number} taskIndex - Current task index (0-based)
 * @param {number} totalTasks - Total number of tasks
 * @returns {string} Execution prompt
 */
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

/**
 * Replanning system prompt
 * @type {string}
 */
const REPLANNER_SYSTEM_PROMPT = `
You are a replanning agent. A task has failed and you need to create replacement tasks.

Given the failed task description and the error, output a JSON object with replacement tasks:

{
  "replacement_tasks": [
    {
      "description": "New task to fix or work around the failure",
      "targetFiles": ["file1.js"],
      "successCriteria": "Clear condition that proves task completion"
    }
  ]
}

RULES:
- Analyze the failure and create tasks that address the root cause.
- You may create 1-5 replacement tasks.
- targetFiles MUST be populated with the main files each task will modify.
- successCriteria MUST be specific and verifiable.
- Do NOT include any text outside the JSON.
- Do NOT use markdown code fences.
- Output ONLY the JSON object.`;

/**
 * Extracts first valid JSON object or array from text using brace balancing
 * @param {string} text - Text containing JSON
 * @returns {Object|Array|null} Parsed JSON or null
 */
function extractFirstValidJson(text) {
  if (!text || typeof text !== "string") {
    return null;
  }
  
  const trimmed = text.trim();
  
  try {
    const direct = JSON.parse(trimmed);
    return direct;
  } catch {
    /** Continue to extraction methods */
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
    
    if (inString) {
      continue;
    }
    
    if (startIndex === -1 && (char === '{' || char === '[')) {
      startIndex = i;
      stack = [];
      stack.push(char);
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
    const jsonStr = text.substring(startIndex, endIndex + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch {
      /** Invalid JSON structure */
    }
  }
  
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return parsed;
    } catch {
      /** Invalid JSON in code block */
    }
  }
  
  return null;
}

/**
 * Parses structured JSON response from model with retries and recovery
 * @param {string} rawResponse - Raw model response text
 * @param {Object} cfg - Configuration object
 * @param {Function} logFn - Logging function
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {string} context - Context for error messages ("planning" or "replanning")
 * @returns {Promise<Object|null>} Parsed JSON object or null if failed
 */
async function parseStructuredResponse(rawResponse, cfg, logFn, maxRetries = 3, context = "planning") {
  let lastError = null;
  let currentResponse = rawResponse;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const extracted = extractFirstValidJson(currentResponse);
    
    if (extracted !== null) {
      if (logFn) {
        logFn("json_parse_success", `${context} parsed on attempt ${attempt}`);
      }
      return extracted;
    }
    
    lastError = new Error("No valid JSON found");
    if (logFn) {
      logFn("json_parse_failed", `${context} attempt ${attempt}/${maxRetries}: no valid JSON`);
    }
    
    if (attempt < maxRetries) {
      const retryPrompt = `Your previous response was not valid JSON. Return ONLY valid JSON. Previous invalid response:\n${currentResponse.slice(0, 1000)}`;
      
      try {
        const retryMessages = [
          { role: "system", content: "You are a JSON generator. Output ONLY valid JSON, no other text." },
          { role: "user", content: retryPrompt }
        ];
        
        const data = await callApi(retryMessages, cfg);
        currentResponse = data.choices?.[0]?.message?.content || "";
        if (logFn) {
          logFn("json_retry", `${context} retry attempt ${attempt + 1}`);
        }
      } catch (retryError) {
        if (logFn) {
          logFn("json_retry_error", `${context} retry failed: ${retryError.message}`);
        }
      }
    }
  }
  
  if (logFn) {
    logFn("json_parse_final_failure", `${context} failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
  return null;
}

/**
 * Extracts target files from task description automatically if not provided
 * @param {string} description - Task description
 * @returns {Array<string>}
 */
function extractTargetFilesFromDescription(description) {
  const files = [];
  
  const filePattern = /(?:[\w\/-]+\.(?:js|ts|jsx|tsx|py|go|rs|json|html|css|md))/g;
  const matches = description.match(filePattern);
  if (matches) {
    files.push(...matches);
  }
  
  const lowerDesc = description.toLowerCase();
  if (lowerDesc.includes("api") && !files.some(f => f.includes("api"))) {
    if (lowerDesc.includes(".js")) {
      files.push("api.js");
    } else if (lowerDesc.includes(".py")) {
      files.push("api.py");
    } else {
      files.push("api");
    }
  }
  
  if (lowerDesc.includes("config") && !files.some(f => f.includes("config"))) {
    if (lowerDesc.includes(".js")) {
      files.push("config.js");
    } else if (lowerDesc.includes(".json")) {
      files.push("config.json");
    } else {
      files.push("config");
    }
  }
  
  if (lowerDesc.includes("readme") && !files.some(f => f.includes("readme"))) {
    files.push("README.md");
  }
  
  return [...new Set(files)];
}

/**
 * Extracts success criteria from description automatically if not provided
 * @param {string} description - Task description
 * @returns {string}
 */
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

/**
 * Estimates task complexity and determines appropriate planning mode
 * @param {string} taskDescription - The task description to analyze
 * @returns {{ mode: string, suggestedMaxTasks: number }}
 */
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
  
  if (isSimple) {
    return { mode: COMPLEXITY_MODE.DIRECT, suggestedMaxTasks: 5 };
  }
  
  if (isComplex) {
    return { mode: COMPLEXITY_MODE.PLANNED, suggestedMaxTasks: 20 };
  }
  
  const wordCount = taskDescription.split(/\s+/).length;
  if (wordCount < 15) {
    return { mode: COMPLEXITY_MODE.DIRECT, suggestedMaxTasks: 7 };
  }
  
  return { mode: COMPLEXITY_MODE.PLANNED, suggestedMaxTasks: 15 };
}

/**
 * Calculates relevance score between task and target file
 * @param {string} taskDescription - Task description
 * @param {string} targetFile - Target file path
 * @returns {number} Relevance score (0-1)
 */
function calculateRelevanceScore(taskDescription, targetFile) {
  if (!taskDescription || !targetFile) {
    return 0;
  }
  
  const taskLower = taskDescription.toLowerCase();
  const fileLower = targetFile.toLowerCase();
  const fileName = path.basename(fileLower);
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  
  let score = 0;
  
  if (taskLower.includes(fileNameWithoutExt)) {
    score += 0.5;
  }
  
  if (taskLower.includes(fileName)) {
    score += 0.3;
  }
  
  const taskWords = taskLower.split(/[\s_\-./]+/);
  const fileWords = fileLower.split(/[\s_\-./]+/);
  
  const commonWords = taskWords.filter(word => 
    word.length > 2 && fileWords.includes(word)
  );
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
    if (extKeywords.some(kw => taskLower.includes(kw))) {
      score += 0.2;
    }
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

/**
 * Checks if a task is relevant to the target files
 * @param {string} taskDescription - Task description
 * @param {Array<string>} targetFiles - Target files from task
 * @param {string} actualFile - Actual file being modified
 * @returns {boolean}
 */
function isRelevantFileChange(taskDescription, targetFiles, actualFile) {
  if (!targetFiles || targetFiles.length === 0) {
    return true;
  }
  
  const score = calculateRelevanceScore(taskDescription, actualFile);
  const isExplicitMatch = targetFiles.some(target => 
    actualFile.includes(target) || target.includes(actualFile)
  );
  
  if (isExplicitMatch) {
    return true;
  }
  
  if (score >= 0.4) {
    log.dim(`File ${actualFile} has relevance score ${score.toFixed(2)} for task: ${taskDescription.slice(0, 50)}`);
    return true;
  }
  
  log.warn(`⚠️  File ${actualFile} is not relevant to task: ${taskDescription.slice(0, 50)} (score: ${score.toFixed(2)})`);
  return false;
}

/**
 * Calculates relevance score between replacement task and original goal
 * @param {string} taskDesc - Replacement task description
 * @param {string} originalGoal - Original goal
 * @returns {number}
 */
function calculateTaskRelevanceScore(taskDesc, originalGoal) {
  if (!originalGoal) {
    return 1;
  }
  
  const taskLower = taskDesc.toLowerCase();
  const goalLower = originalGoal.toLowerCase();
  
  let score = 0;
  
  const goalWords = goalLower.split(/\s+/);
  const commonWords = goalWords.filter(word => 
    word.length > 2 && taskLower.includes(word)
  );
  score += (commonWords.length / Math.max(1, goalWords.length)) * 0.5;
  
  const fileGoalMatches = goalLower.match(/(?:[\w.-]+\.\w+)/g) || [];
  const fileTaskMatches = taskLower.match(/(?:[\w.-]+\.\w+)/g) || [];
  
  const commonFiles = fileGoalMatches.filter(f => fileTaskMatches.includes(f));
  score += (commonFiles.length / Math.max(1, fileGoalMatches.length)) * 0.3;
  
  const goalNouns = goalWords.filter(w => w.length > 3 && !['this', 'that', 'these', 'those', 'then', 'there', 'should', 'could', 'would'].includes(w));
  const matches = goalNouns.filter(word => taskLower.includes(word)).length;
  score += (matches / Math.max(1, goalNouns.length)) * 0.2;
  
  return Math.min(score, 1.0);
}

/**
 * Immutable-style state snapshot for the autopilot state machine
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
    /** @type {number} Consecutive replan failures */
    this.consecutiveReplanFailures = 0;
    /** @type {number} Max consecutive replan failures before blocking */
    this.maxConsecutiveReplanFailures = 3;
  }

  /**
   * Transition to a new phase
   * @param {string} newPhase - Target phase from PHASE
   * @param {Function} logFn - Logging function
   */
  transition(newPhase, logFn) {
    const old = this.phase;
    this.phase = newPhase;
    if (logFn && old !== newPhase) {
      logFn("phase_transition", `${old} → ${newPhase}`);
    }
  }

  /**
   * Checks if all tasks are completed or replaced
   * @returns {boolean}
   */
  allTasksCompleted() {
    if (this.tasks.length === 0) {
      return false;
    }
    return this.tasks.every(t => 
      t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.REPLACED
    );
  }

  /**
   * Checks if any task is failed or blocked
   * @returns {boolean}
   */
  hasBlockedOrFailed() {
    return this.tasks.some(t =>
      t.status === TASK_STATUS.FAILED || t.status === TASK_STATUS.BLOCKED
    );
  }

  /**
   * Gets the first failed or blocked task
   * @returns {Object|null}
   */
  getFailedTask() {
    return this.tasks.find(t =>
      t.status === TASK_STATUS.FAILED || t.status === TASK_STATUS.BLOCKED
    ) || null;
  }

  /**
   * Gets the next pending task
   * @returns {Object|null}
   */
  getNextPendingTask() {
    return this.tasks.find(t => t.status === TASK_STATUS.PENDING) || null;
  }

  /**
   * Counts completed tasks
   * @returns {number}
   */
  completedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length;
  }

  /**
   * Counts replaced tasks
   * @returns {number}
   */
  replacedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.REPLACED).length;
  }

  /**
   * Counts failed tasks
   * @returns {number}
   */
  failedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.FAILED).length;
  }

  /**
   * Counts blocked tasks
   * @returns {number}
   */
  blockedCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.BLOCKED).length;
  }

  /**
   * Counts pending tasks
   * @returns {number}
   */
  pendingCount() {
    return this.tasks.filter(t => t.status === TASK_STATUS.PENDING).length;
  }

  /**
   * Records a replan failure and checks if max is reached
   * @returns {boolean} True if should block
   */
  recordReplanFailure() {
    this.consecutiveReplanFailures++;
    return this.consecutiveReplanFailures >= this.maxConsecutiveReplanFailures;
  }

  /**
   * Resets replan failure counter
   */
  resetReplanFailures() {
    this.consecutiveReplanFailures = 0;
  }
}

/**
 * Manages context window and compression during autopilot runs
 */
class ContextManager {
  /**
   * @param {Object} cfg - Application config
   * @param {number} [maxTokens=4000000] - Max tokens before compression
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
   * Estimates token count for messages
   * @param {Array<Object>} messages - Conversation history
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

  /**
   * Gets usage ratio (0.0 - 1.0)
   * @returns {number}
   */
  getUsageRatio() {
    return this.estimatedTokens / this.maxTokens;
  }

  /**
   * Checks if context should be compressed
   * @param {Array<Object>} messages - Conversation history
   * @returns {boolean}
   */
  needsCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.warningThreshold;
  }

  /**
   * Checks if context MUST be compressed
   * @param {Array<Object>} messages - Conversation history
   * @returns {boolean}
   */
  needsCriticalCompression(messages) {
    this.estimateTokens(messages);
    return this.getUsageRatio() > this.criticalThreshold;
  }

  /**
   * Compresses message history by summarizing old messages
   * @param {Array<Object>} messages - History to compress
   * @returns {Promise<Array<Object>>} Compressed history
   */
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
        /** Fall through to heuristic compression */
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

  /**
   * Summarizes messages for compression
   * @param {Array<Object>} messages - Messages to summarize
   * @returns {string}
   * @private
   */
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

/**
 * Tracks file system changes and commands executed during autopilot
 */
class DiffTracker {
  constructor() {
    this.filesCreated = [];
    this.filesModified = [];
    this.commandsRun = [];
    this.snapshots = new Map();
  }

  /**
   * Snapshots a file's current state
   * @param {string} filePath - Path to file
   */
  snapshotFile(filePath) {
    const resolved = path.resolve(filePath);
    if (this.snapshots.has(resolved)) return;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        this.snapshots.set(resolved, fs.readFileSync(resolved, "utf8"));
      } else {
        this.snapshots.set(resolved, null);
      }
    } catch { /** Ignore errors */ }
  }

  /**
   * Tracks a file write operation
   * @param {string} filePath - Path to file
   */
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

  /**
   * Tracks a shell command execution
   * @param {string} cmd - Command that was run
   */
  trackCommand(cmd) {
    this.commandsRun.push({ cmd: cmd.slice(0, 200), time: Date.now() });
  }

  /**
   * Gets summary of tracked changes
   * @returns {string}
   */
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

  /**
   * Gets total number of file changes
   * @returns {number}
   */
  getTotalChanges() {
    return this.filesCreated.length + this.filesModified.length;
  }
}

/**
 * Manages error recovery and retry strategies
 */
class RecoveryStrategy {
  constructor() {
    this.errorHistory = [];
    this.retryMap = new Map();
    this.maxRetriesPerTool = 3;
    this.backoffMs = 2000;
  }

  /**
   * Records a tool or API error
   * @param {Error} error - Error object
   * @param {string} toolName - Name of the tool that failed
   * @param {number} iteration - Current iteration number
   */
  recordError(error, toolName, iteration) {
    this.errorHistory.push({
      error: error.message || String(error),
      tool: toolName, iteration,
      time: Date.now(),
    });
    const count = (this.retryMap.get(toolName) || 0) + 1;
    this.retryMap.set(toolName, count);
  }

  /**
   * Checks if the tool should be retried
   * @param {string} toolName - Name of the tool
   * @returns {boolean}
   */
  shouldRetry(toolName) {
    return (this.retryMap.get(toolName) || 0) < this.maxRetriesPerTool;
  }

  /**
   * Gets backoff delay in milliseconds
   * @param {string} toolName - Name of the tool
   * @returns {number}
   */
  getBackoffMs(toolName) {
    const count = this.retryMap.get(toolName) || 0;
    return this.backoffMs * Math.pow(2, Math.max(0, count - 1));
  }

  /**
   * Checks if error is a transient API error
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  isApiError(error) {
    const msg = error.message || String(error);
    return /429|rate|500|502|503|timeout|ECONNRESET|fetch failed|socket/i.test(msg);
  }

  /**
   * Checks if error is a tool call validation error
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  isToolCallValidationError(error) {
    const msg = error.message || String(error);
    return /tool_calls.*must be followed|insufficient tool messages|tool_call_id/i.test(msg);
  }

  /**
   * Checks if error is retryable (not a logic/validation error)
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  isRetryableToolError(error) {
    const msg = error.message || String(error);
    if (/not found|ENOENT|EACCES|EISDIR|EPERM|EEXIST/i.test(msg)) return false;
    if (/timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAGAIN|EBUSY/i.test(msg)) return true;
    return true;
  }

  /**
   * Gets recovery hint for logging
   * @param {Error} error - Error object
   * @returns {string}
   */
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

  /**
   * Gets summary of all recorded errors
   * @returns {string}
   */
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

/**
 * Evaluates a tool result and returns an outcome
 * @param {string} name - Tool name
 * @param {string} result - Tool result string
 * @returns {string} TOOL_OUTCOME value
 */
function evaluateToolOutcome(name, result) {
  if (!result) return TOOL_OUTCOME.FAILURE;
  const r = String(result);
  if (r.startsWith("❌") || r.includes("Error:") || r.includes("error:")) {
    return TOOL_OUTCOME.FAILURE;
  }
  if (r.startsWith("ℹ") && (r.includes("not found") || r.includes("No "))) {
    return TOOL_OUTCOME.PARTIAL;
  }
  return TOOL_OUTCOME.SUCCESS;
}

/**
 * Executes a tool and tracks its impact
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} cfg - Configuration
 * @param {DiffTracker} tracker - Diff tracker instance
 * @param {RecoveryStrategy} recovery - Recovery strategy instance
 * @param {number} iteration - Current iteration
 * @param {Object} taskContext - Current task context for relevance validation
 * @returns {Promise<{result: string, outcome: string}>}
 * @private
 */
async function executeToolTracked(name, args, cfg, tracker, recovery, iteration, taskContext = null) {
  const { getSandbox } = await import("./security/sandbox.js");
  const sandbox = getSandbox();
  const validation = sandbox.validate(name, args);
  if (!validation.allowed) {
    return { result: `❌ Security: ${validation.reason}`, outcome: TOOL_OUTCOME.FAILURE };
  }

  if ((name === "write_file" || name === "patch_file") && args.path) {
    if (taskContext && taskContext.targetFiles && taskContext.targetFiles.length > 0) {
      const isRelevant = isRelevantFileChange(taskContext.description, taskContext.targetFiles, args.path);
      if (!isRelevant) {
        return { 
          result: `❌ RELEVANCE BLOCKED: Task "${taskContext.description.slice(0, 50)}" target files: ${taskContext.targetFiles.join(", ")}. Attempted to modify ${args.path} which is not relevant.`, 
          outcome: TOOL_OUTCOME.FAILURE 
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

/**
 * Detects project type and returns appropriate test command with safe JSON parsing
 * @returns {{ type: string, cmd: string }|null}
 */
function detectProjectType() {
  const cwd = process.cwd();

  if (fs.existsSync(path.join(cwd, "package.json"))) {
    try {
      const pkgContent = fs.readFileSync(path.join(cwd, "package.json"), "utf8");
      const pkg = JSON.parse(pkgContent);
      const scripts = pkg.scripts || {};
      if (scripts.test) {
        return { type: "node", cmd: "npm test" };
      }
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

/**
 * Planner agent - creates structured task plans
 */
class Planner {
  /**
   * @param {Object} cfg - Configuration
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.maxRetries = 3;
  }

  /**
   * Generates a plan for the given task
   * @param {string} task - Task description
   * @returns {Promise<Array<Object>>} Array of task objects
   */
  async plan(task) {
    const complexity = estimateComplexity(task);
    const maxTasks = complexity.suggestedMaxTasks;
    
    const plannerPrompt = PLANNER_SYSTEM_PROMPT + `\n\nIMPORTANT: Create at most ${maxTasks} tasks. Do NOT over-fragment. Combine related actions into single tasks where appropriate. Each task MUST include targetFiles array and successCriteria string.`;
    
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

  /**
   * Parses the parsed JSON into task objects with automatic field extraction
   * @param {Object} parsed - Parsed JSON object
   * @param {string} originalTask - Original task for context
   * @returns {Array<Object>} Task objects
   */
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
        retries: 0,
        maxRetries: 2,
        successCriteria: successCriteria,
        targetFiles: targetFiles
      };
    });
    return tasks;
  }
}

/**
 * Executor - executes one task at a time
 */
class Executor {
  /**
   * @param {Object} cfg - Configuration
   * @param {DiffTracker} tracker - Diff tracker instance
   * @param {RecoveryStrategy} recovery - Recovery strategy instance
   * @param {ContextManager} contextManager - Context manager instance
   * @param {Function} logFn - Logging function
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
   * Executes a single task
   * @param {Object} task - Task object
   * @param {number} taskIndex - Index in the task list
   * @param {number} totalTasks - Total number of tasks
   * @param {Array<Object>} sharedMessages - Shared message history (may be modified)
   * @returns {Promise<{status: string, result: string, messages: Array}>}
   */
  async execute(task, taskIndex, totalTasks, sharedMessages) {
    task.status = TASK_STATUS.RUNNING;
    this.logFn("task_start", `${task.id}: ${task.description}`);

    let executionMessages = [
      ...sharedMessages,
      { role: "user", content: executionPrompt(task.description, taskIndex, totalTasks) },
    ];

    let taskComplete = false;
    let taskStatus = TASK_STATUS.RUNNING;
    let taskResult = "";
    let localIterations = 0;
    const maxLocalIterations = 10;
    let hasRealToolCalls = false;
    let hasRealChanges = false;
    let successfulToolResults = 0;

    while (!taskComplete && localIterations < maxLocalIterations) {
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

          const { result, outcome } = await executeToolTracked(
            name, args, this.cfg, this.tracker, this.recovery, 0, taskContext
          );

          if (this.cfg.autopilot?.verbose !== false) {
            printToolResult(result, 4);
          }

          this.logFn("tool_result", `${name}: ${(result || "").slice(0, 500)}`);

          if (outcome === TOOL_OUTCOME.FAILURE) {
            this.logFn("tool_failure", `${name}: ${result.slice(0, 200)}`);
          }
          
          if (outcome === TOOL_OUTCOME.SUCCESS) {
            successfulToolResults++;
            if (name === "write_file" || name === "patch_file") {
              hasRealChanges = true;
            }
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
      
      if (hasCompletionMarker || (localIterations >= 2 && !msg.tool_calls)) {
        const hasEvidence = hasRealToolCalls || hasRealChanges || successfulToolResults > 0;
        
        if (hasEvidence) {
          taskComplete = true;
          taskStatus = TASK_STATUS.COMPLETED;
          taskResult = content;
        } else {
          taskComplete = true;
          taskStatus = TASK_STATUS.FAILED;
          taskResult = `Task reported complete but no evidence found. No tool calls, no file changes, no successful tool results.${hasCompletionMarker ? ' Marker "TASK DONE" found but insufficient proof.' : ''}`;
        }
      } else if (/TASK\s+FAILED/i.test(content)) {
        taskComplete = true;
        taskStatus = TASK_STATUS.FAILED;
        taskResult = content;
      } else if (/TASK\s+BLOCKED/i.test(content)) {
        taskComplete = true;
        taskStatus = TASK_STATUS.BLOCKED;
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

/**
 * Replanner - generates replacement tasks on failure with context awareness
 */
class Replanner {
  /**
   * @param {Object} cfg - Configuration
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.maxRetries = 3;
  }

  /**
   * Generates replacement tasks for a failed task
   * @param {Object} failedTask - The task that failed
   * @param {Array<Object>} remainingTasks - Tasks not yet executed
   * @param {string} originalGoal - Original overall goal
   * @param {Array<Object>} completedTasks - Successfully completed tasks
   * @returns {Promise<Array<Object>>} Replacement task objects
   */
  async replan(failedTask, remainingTasks, originalGoal = "", completedTasks = []) {
    const context = [
      `Original goal: ${originalGoal}`,
      ``,
      `Failed task: ${failedTask.description}`,
      `Error/Result: ${failedTask.result || "Unknown error"}`,
      ``,
      `Completed tasks (${completedTasks.length}):`,
      ...completedTasks.map(t => `✅ ${t.description}`),
      ``,
      `Remaining tasks (${remainingTasks.length}):`,
      ...remainingTasks.map(t => `⏳ ${t.description}`),
    ].join("\n");

    const messages = [
      { role: "system", content: REPLANNER_SYSTEM_PROMPT },
      { role: "user", content: `A task failed. Create replacement tasks that are DIRECTLY RELEVANT to the original goal.\n\n${context}` },
    ];

    let rawResponse = "";
    try {
      const data = await callApi(messages, this.cfg);
      rawResponse = data.choices?.[0]?.message?.content || "";
    } catch (e) {
      log.err(`Replanner API call failed: ${e.message}`);
      return [];
    }

    const parsed = await parseStructuredResponse(rawResponse, this.cfg, log.dim, this.maxRetries, "replanning");
    
    if (!parsed) {
      log.err(`Replanner failed to produce valid JSON after ${this.maxRetries} attempts`);
      return [];
    }
    
    return this._parseReplan(parsed, originalGoal);
  }

  /**
   * Parses replanner response into task objects with relevance validation
   * @param {Object} parsed - Parsed JSON object
   * @param {string} originalGoal - Original goal for relevance checking
   * @returns {Array<Object>}
   */
  _parseReplan(parsed, originalGoal) {
    const replacements = (parsed.replacement_tasks || []).map((t, i) => {
      let targetFiles = t.targetFiles || [];
      let successCriteria = t.successCriteria || "";
      
      if (targetFiles.length === 0) {
        targetFiles = extractTargetFilesFromDescription(t.description || String(t));
      }
      
      if (!successCriteria) {
        successCriteria = extractSuccessCriteriaFromDescription(t.description || String(t));
      }
      
      return {
        id: `replan-${Date.now()}-${i + 1}`,
        description: t.description || String(t),
        status: TASK_STATUS.PENDING,
        result: null,
        retries: 0,
        maxRetries: 2,
        successCriteria: successCriteria,
        targetFiles: targetFiles
      };
    });
    
    const filtered = replacements.filter(task => {
      const score = calculateTaskRelevanceScore(task.description, originalGoal);
      const isRelevant = score >= 0.3;
      if (!isRelevant) {
        log.warn(`Replanner generated irrelevant task: "${task.description.slice(0, 50)}" - relevance score: ${score.toFixed(2)} (needs >=0.3)`);
      }
      return isRelevant;
    });
    
    return filtered;
  }
}

/**
 * Verifier - system-driven test execution with safe JSON handling
 */
class Verifier {
  constructor() {
    this.output = null;
    this.passed = false;
  }

  /**
   * Runs project verification by auto-detecting project type and executing tests
   * @returns {Promise<{passed: boolean, output: string, projectType: string|null}>}
   */
  async verify() {
    const project = detectProjectType();

    if (!project) {
      this.output = "No project type detected (no package.json, pyproject.toml, Cargo.toml, go.mod). Skipping verification.";
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

  /**
   * Runs a shell command and captures output
   * @param {string} cmd
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
   * @private
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

/**
 * Prints tool call block header
 * @param {Array} calls - Tool calls array
 * @private
 */
function printToolCallBlock(calls) {
  const count = calls.length;
  console.log(`  ${TOOL_CLR}┃${C.reset} ${TOOL_CLR}${C.bold}Tools${C.reset} ${MUTED}(${count} call${count > 1 ? "s" : ""})${C.reset}`);
}

/**
 * Prints tool execution line
 * @param {string} name - Tool name
 * @param {Object|string} args - Tool arguments
 * @param {number} index - Current index
 * @param {number} total - Total calls
 * @private
 */
function printToolExecution(name, args, index, total) {
  const argsStr = typeof args === "string" ? args : JSON.stringify(args);
  const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "…" : argsStr;
  const counter = total > 1 ? `${MUTED}[${index + 1}/${total}]${C.reset} ` : "";
  console.log(`  ${TOOL_CLR}┃${C.reset} ${counter}${TOOL_CLR}${C.bold}${name}${C.reset} ${MUTED}${short}${C.reset}`);
}

/**
 * Prints tool result output
 * @param {string} result - Tool result
 * @param {number} [maxLines=5] - Maximum lines to show
 * @private
 */
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

/**
 * Prints status bar with current state
 * @param {Autopilot} ap - Autopilot instance
 * @param {AutopilotState} state - Current state
 * @private
 */
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

/**
 * Prints compact response from assistant
 * @param {string} content - Response content
 * @param {AutopilotState} state - Current state
 * @param {number} iteration - Current iteration
 * @private
 */
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

/**
 * Core Autopilot engine for autonomous task execution
 */
class Autopilot {
  /**
   * @param {Object} cfg - Configuration
   * @param {Array<Object>} messages - Initial messages history
   * @param {Function} saveCallback - State persistence callback
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
    this.replanner = new Replanner(cfg);
    this.verifier = new Verifier();
    this.executor = null;
  }

  /**
   * Aborts the current autopilot run
   */
  abort() {
    this.aborted = true;
    this.running = false;
  }

  /**
   * Internal logging
   * @param {string} type - Log type
   * @param {string} msg - Log message
   * @private
   */
  _log(type, msg) {
    this.logEntries.push({
      time: Date.now(),
      iteration: this.iteration,
      phase: this.state.phase,
      type,
      msg: typeof msg === "string" ? msg.slice(0, 2000) : JSON.stringify(msg).slice(0, 2000),
    });
  }

  /**
   * Prints header
   * @param {string} task - Task description
   * @private
   */
  _printHeader(task) {
    console.log("");
    const lines = [
      `${AUTO_CLR}${C.bold}AUTOPILOT ENGAGED${C.reset}`,
      ``,
      `${MUTED}Task:${C.reset} ${TEXT}${task.slice(0, 120)}${task.length > 120 ? "…" : ""}${C.reset}`,
      ``,
      `${MUTED}Model:${C.reset}        ${ACCENT}${this.cfg.model}${C.reset}`,
      `${MUTED}Version:${C.reset}      ${TEXT_DIM}v${AUTOPILOT_VERSION}${C.reset}`,
      `${MUTED}Max iters:${C.reset}    ${TEXT}${this.maxIterations}${C.reset}`,
      `${MUTED}Max errors:${C.reset}   ${TEXT}${this.maxErrors}${C.reset}`,
      `${MUTED}Auto-confirm:${C.reset} ${SUCCESS}ON${C.reset}`,
      ``,
      `${TEXT_DIM}Press ${C.bold}Ctrl+C${C.reset}${TEXT_DIM} to stop gracefully${C.reset}`,
    ];
    console.log(box(lines.join("\n"), { title: "🤖 AUTOPILOT", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }));
    console.log("");
  }

  /**
   * Prints summary with detailed task breakdown
   * @param {string} reason - Completion reason
   * @private
   */
  _printSummary(reason) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const diffSummary = this.diffTracker.getSummary();
    const errorSummary = this.recovery.getErrorSummary();

    const lines = [
      `${C.bold}Status:${C.reset}       ${reason}`,
      `${C.bold}Phase:${C.reset}        ${this.state.phase}`,
      `${C.bold}Tasks:${C.reset}        ${this.state.completedCount()} completed, ${this.state.replacedCount()} replaced, ${this.state.failedCount()} failed, ${this.state.blockedCount()} blocked, ${this.state.pendingCount()} pending`,
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
        let icon = "";
        if (t.status === TASK_STATUS.COMPLETED) icon = "✅";
        else if (t.status === TASK_STATUS.FAILED) icon = "❌";
        else if (t.status === TASK_STATUS.BLOCKED) icon = "🚫";
        else if (t.status === TASK_STATUS.REPLACED) icon = "🔄";
        else if (t.status === TASK_STATUS.RUNNING) icon = "▶️";
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

  /**
   * Saves log file
   * @private
   */
  _saveLogFile() {
    if (!this.saveLog || this.logEntries.length === 0) return;
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(LOG_DIR, `autopilot-${ts}.json`);
      fs.writeFileSync(logFile, JSON.stringify({
        version: 5,
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

  /**
   * Initializes executor
   * @private
   */
  _initExecutor() {
    this.executor = new Executor(
      this.cfg, this.diffTracker, this.recovery,
      this.contextManager, (type, msg) => this._log(type, msg)
    );
  }

  /**
   * Runs the autopilot for a specific task
   * @param {string} task - The task description
   * @returns {Promise<Object>} Execution statistics
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

          if (this.state.hasBlockedOrFailed()) {
            const failedTask = this.state.getFailedTask();

            if (failedTask && this.state.replanCount < this.state.maxReplans) {
              this.state.transition(PHASE.REPLANNING, (t, m) => this._log(t, m));
              printStatusBar(this, this.state);
              log.warn(`🔧 REPLANNING: Task "${failedTask.description.slice(0, 60)}" ${failedTask.status}`);

              const remaining = this.state.tasks.filter(
                t => t.status === TASK_STATUS.PENDING
              );
              
              const completed = this.state.tasks.filter(
                t => t.status === TASK_STATUS.COMPLETED
              );

              const replacements = await this.replanner.replan(failedTask, remaining, this.originalGoal, completed);

              if (replacements.length > 0) {
                failedTask.status = TASK_STATUS.REPLACED;
                failedTask.result = `Replaced via replan #${this.state.replanCount + 1}`;

                this.state.tasks.push(...replacements);
                this.state.replanCount++;
                this.state.resetReplanFailures();
                this._log("replan", `Generated ${replacements.length} replacement tasks`);
                log.ok(`Replan: ${replacements.length} new tasks added`);
              } else {
                this.state.replanCount++;
                const shouldBlock = this.state.recordReplanFailure();
                this._log("replan_failed", "No replacement tasks generated");
                log.warn("Replan returned no tasks — continuing with remaining");
                
                if (shouldBlock) {
                  finalReason = `${ERROR}✗ Replan failed ${this.state.maxConsecutiveReplanFailures} times consecutively — blocked${C.reset}`;
                  this.state.transition(PHASE.FAILED, (t, m) => this._log(t, m));
                  break;
                }
              }
            } else if (this.state.replanCount >= this.state.maxReplans) {
              finalReason = `${WARNING}▲ Max replans (${this.state.maxReplans}) reached${C.reset}`;
              this._log("max_replans", `Replan limit ${this.state.maxReplans}`);
              break;
            }
          }

          const pendingTask = this.state.getNextPendingTask();
          if (!pendingTask) {
            if (this.state.allTasksCompleted()) {
              break;
            }
            if (this.state.replanCount < this.state.maxReplans) {
              const stuckTask = this.state.getFailedTask();
              if (stuckTask) {
                this.state.transition(PHASE.REPLANNING, (t, m) => this._log(t, m));
                const remaining = this.state.tasks.filter(
                  t => t.status === TASK_STATUS.PENDING
                );
                const completed = this.state.tasks.filter(
                  t => t.status === TASK_STATUS.COMPLETED
                );
                const replacements = await this.replanner.replan(stuckTask, remaining, this.originalGoal, completed);
                if (replacements.length > 0) {
                  stuckTask.status = TASK_STATUS.REPLACED;
                  this.state.tasks.push(...replacements);
                  this.state.replanCount++;
                  this.state.resetReplanFailures();
                } else {
                  const shouldBlock = this.state.recordReplanFailure();
                  if (shouldBlock) {
                    finalReason = `${ERROR}✗ Replan failed ${this.state.maxConsecutiveReplanFailures} times consecutively — blocked${C.reset}`;
                    break;
                  }
                }
              }
            }
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
            this.state.stallCounter = 0;
          } else if (execResult.status === TASK_STATUS.FAILED) {
            log.err(`  Task failed: ${pendingTask.description.slice(0, 60)}`);
            this.state.stallCounter++;
          } else if (execResult.status === TASK_STATUS.BLOCKED) {
            log.warn(`  Task blocked: ${pendingTask.description.slice(0, 60)}`);
            this.state.stallCounter++;
          }

          if (this.state.stallCounter >= this.state.maxStalls) {
            finalReason = `${WARNING}▲ Stalled — ${this.state.maxStalls} consecutive failures/blocks${C.reset}`;
            this._log("stall", `Max stalls ${this.state.maxStalls}`);
            break;
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
      tasksReplaced: this.state.replacedCount(),
      tasksFailed: this.state.failedCount(),
      tasksBlocked: this.state.blockedCount(),
      tasksTotal: this.state.tasks.length,
      replans: this.state.replanCount,
      verificationPassed: this.state.verificationPassed,
    };
  }
}

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