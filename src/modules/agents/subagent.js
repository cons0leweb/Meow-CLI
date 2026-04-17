/**
 * Sub-agent module for autonomous task execution and delegation.
 * Provides isolated environments, caching, and parallel execution coordination.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { callApi } from "../api.js";
import { executeTool, TOOLS } from "../tools.js";
import { log, C, MUTED, TEXT_DIM, ACCENT, SUCCESS, ERROR, WARNING, TOOL_CLR } from "../ui.js";
import { getModelPrice } from "../cost-tracker.js";
import { formatDuration } from "../utils.js";
import { askPermission, getPermissionStore } from "../permissions.js";
import { getSandbox, getAuditLogger } from "../security/sandbox.js";
import { mcpManager } from "../mcp/manager.js";

const MAX_DEPTH = 3;
const MAX_PARALLEL = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Caches results of sub-agent tasks to avoid redundant execution.
 */
class SubagentCache {
  constructor() {
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /** @private */
  _hash(task, toolsUsed) {
    const key = JSON.stringify({ task: task.slice(0, 500), tools: toolsUsed });
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  /**
   * Retrieves a cached result if available and not expired.
   * @param {string} task - The task description.
   * @param {Array<string>} [toolsUsed=[]] - Tools used for the task.
   * @returns {Object|null} Cached result or null.
   */
  get(task, toolsUsed = []) {
    const hash = this._hash(task, toolsUsed);
    const entry = this.entries.get(hash);
    if (!entry) { this.misses++; return null; }
    if (Date.now() - entry.time > CACHE_TTL_MS) {
      this.entries.delete(hash);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.result;
  }

  /**
   * Stores a task result in the cache.
   * @param {string} task - Task description.
   * @param {Array<string>} toolsUsed - Tools used.
   * @param {Object} result - Task result.
   */
  set(task, toolsUsed, result) {
    const hash = this._hash(task, toolsUsed);
    this.entries.set(hash, { result, time: Date.now(), task: task.slice(0, 200) });
    if (this.entries.size > 200) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].time - b[1].time);
      for (let i = 0; i < 50; i++) this.entries.delete(oldest[i][0]);
    }
  }

  /**
   * Returns cache performance statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      entries: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses) * 100).toFixed(1) + "%" : "0%"
    };
  }
}

/**
 * Represents an isolated environment for a sub-agent to operate in.
 */
class IsolatedEnv {
  /**
   * @param {string} parentCwd - Current working directory of the parent.
   * @param {number} depth - Recursion depth.
   * @param {Object} budget - Resource budget (tokens, cost, tools).
   */
  constructor(parentCwd, depth, budget) {
    this.id = crypto.randomUUID().slice(0, 8);
    this.parentCwd = parentCwd;
    this.tmpDir = path.join(os.tmpdir(), `meow-agent-${this.id}`);
    this.depth = depth;
    this.budget = {
      maxTokens: budget.maxTokens || 20000,
      maxCost: budget.maxCost || 1.0,
      usedTokens: 0,
      usedCost: 0
    };
    this.toolsAllowed = new Set(budget.tools || ["list_dir", "read_file", "grep_search", "patch_file", "write_file", "run_shell"]);
    this.filesModified = [];
    this.startTime = Date.now();
  }

  /** Sets up the temporary directory */
  setup() {
    try { fs.mkdirSync(this.tmpDir, { recursive: true }); } catch {}
  }

  /** Cleans up the temporary directory */
  cleanup() {
    try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
  }

  /** @returns {boolean} */
  isToolAllowed(name) { return this.toolsAllowed.has(name); }

  /** Records resource usage */
  recordUsage(tokens, model) {
    this.budget.usedTokens += tokens;
    const price = getModelPrice(model);
    this.budget.usedCost += (tokens * (price.input + price.output) / 2) / 1_000_000;
  }

  /** @returns {boolean} */
  isBudgetExceeded() {
    return this.budget.usedTokens > this.budget.maxTokens || this.budget.usedCost > this.budget.maxCost;
  }

  /** @returns {number} */
  getElapsed() { return Date.now() - this.startTime; }
}

/**
 * A sub-agent that executes a specific task autonomously.
 */
class SubAgent {
  /**
   * @param {string} task - Task description.
   * @param {Object} cfg - Global configuration.
   * @param {Object} [options={}] - Execution options.
   */
  constructor(task, cfg, options = {}) {
    this.task = task;
    this.cfg = { ...cfg };
    this.depth = options.depth || 0;
    this.parentId = options.parentId || null;
    this.maxIterations = options.maxIterations || 15;
    this.env = new IsolatedEnv(process.cwd(), this.depth, {
      maxTokens: options.maxTokens || 20000,
      maxCost: options.maxCost || 1.0,
      tools: options.tools,
    });
    this.messages = [];
    this.result = null;
    this.status = "pending";
    this.error = null;
    this.toolCalls = 0;
    this.iterations = 0;
  }

  /** @private */
  _buildSystemPrompt() {
    return [
      "You are a focused sub-agent. Complete your specific task efficiently.",
      `TASK: ${this.task}`,
      `WORKING DIRECTORY: ${this.env.parentCwd}`,
      `DEPTH: ${this.depth}/${MAX_DEPTH}`,
      `TOKEN BUDGET: ${this.env.budget.maxTokens - this.env.budget.usedTokens} remaining`,
      "",
      "RULES:",
      "- Complete the task as concisely as possible",
      "- Use tools efficiently — batch reads when possible",
      "- Report results clearly in your final message",
      "- Start final message with ✅ DONE: <summary>",
      "- If blocked, start message with ❌ BLOCKED: <reason>",
      this.depth < MAX_DEPTH ? "- You can use delegate_task to spawn sub-agents for parallel subtasks" : "- MAX DEPTH reached: no further delegation allowed",
    ].join("\n");
  }

  /** @private */
  _getFilteredTools() {
    const allowed = this.env.toolsAllowed;
    let tools = TOOLS.filter(t => allowed.has(t.function.name));
    
    // Add MCP tools if allowed
    const mcpTools = mcpManager.getAllTools();
    for (const tool of mcpTools) {
      if (allowed.has(tool.function.name) || allowed.has("mcp__*")) {
        tools.push(tool);
      }
    }

    if (this.depth < MAX_DEPTH) {
      tools.push({
        type: "function",
        function: {
          name: "delegate_task",
          description: "Delegate a subtask to a parallel sub-agent. Returns the result when complete.",
          parameters: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    description: { type: "string", description: "Clear task description" },
                    tools: { type: "array", items: { type: "string" }, description: "Tools this sub-agent needs" },
                  },
                  required: ["description"]
                },
                description: "Array of subtasks to execute in parallel"
              }
            },
            required: ["tasks"]
          }
        }
      });
    }
    return tools;
  }

  /** @private */
  async _executeTool(name, args) {
    if (name === "delegate_task") {
      return await this._handleDelegation(args);
    }
    if (!this.env.isToolAllowed(name)) {
      return `❌ Tool '${name}' not allowed in this sub-agent scope`;
    }

    const sandbox = getSandbox();
    const audit = getAuditLogger();
    const sandboxCheck = sandbox.validate(name, args);
    if (!sandboxCheck.allowed) {
      const res = `❌ Blocked by sandbox: ${sandboxCheck.reason}`;
      audit.logPermission(name, "sandbox_blocked");
      return res;
    }

    const permStore = getPermissionStore();
    const allowed = await askPermission(name, args, permStore, this.cfg.auto_yes);
    if (!allowed) {
      audit.logPermission(name, "denied");
      return `❌ Permission denied for ${name}`;
    }
    audit.logPermission(name, "allowed");

    const env = sandbox.filterEnv();
    return await executeTool(name, args, this.cfg, env);
  }

  /** @private */
  async _handleDelegation(args) {
    const tasks = args.tasks || [];
    if (tasks.length === 0) return "❌ No tasks provided";
    if (tasks.length > MAX_PARALLEL) return `❌ Max ${MAX_PARALLEL} parallel tasks`;

    const coordinator = new AgentCoordinator(this.cfg, _globalCache);
    const results = await coordinator.runParallel(
      tasks.map(t => ({
        task: t.description,
        tools: t.tools,
        maxTokens: Math.floor(this.env.budget.maxTokens / (tasks.length + 1)),
        maxCost: this.env.budget.maxCost / (tasks.length + 1),
        depth: this.depth + 1,
        parentId: this.env.id,
      }))
    );

    for (const r of results) {
      this.env.budget.usedTokens += r.tokensUsed || 0;
    }

    const summary = results.map((r, i) =>
      `[${i + 1}] ${r.status === "done" ? "✅" : "❌"} ${r.task.slice(0, 60)}: ${(r.result || r.error || "no output").slice(0, 300)}`
    ).join("\n");

    return `Sub-agent results (${results.filter(r => r.status === "done").length}/${results.length} success):\n${summary}`;
  }

  /**
   * Runs the sub-agent until the task is complete, blocked, or budget is exceeded.
   * @returns {Promise<Object>} Execution result summary.
   */
  async run() {
    this.status = "running";
    this.env.setup();

    this.messages = [
      { role: "system", content: this._buildSystemPrompt() },
      { role: "user", content: this.task },
    ];

    const tools = this._getFilteredTools();

    try {
      while (this.iterations < this.maxIterations) {
        this.iterations++;

        if (this.env.isBudgetExceeded()) {
          this.status = "budget_exceeded";
          this.result = `⚠ Budget exceeded after ${this.iterations} iterations (${this.env.budget.usedTokens} tokens)`;
          break;
        }

        const data = await callApi(this.messages, { ...this.cfg,
          profiles: { ...this.cfg.profiles, [this.cfg.profile]: { ...(this.cfg.profiles[this.cfg.profile] || {}), temperature: 0.1 } }
        });

        const usage = data.usage || {};
        this.env.recordUsage(usage.total_tokens || 0, this.cfg.model);

        const msg = data.choices?.[0]?.message;
        if (!msg) break;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          this.messages.push(msg);
          for (const call of msg.tool_calls) {
            const name = call.function.name;
            let args = {};
            try { args = JSON.parse(call.function.arguments); } catch {}
            this.toolCalls++;
            const result = await this._executeTool(name, args);
            this.messages.push({ role: "tool", tool_call_id: call.id, content: result || "" });
          }
          continue;
        }
        const content = msg.content || "";
        this.messages.push(msg);

        if (content.includes("✅ DONE:") || content.includes("DONE:")) {
          this.status = "done";
          this.result = content;
          break;
        }
        if (content.includes("❌ BLOCKED:")) {
          this.status = "blocked";
          this.result = content;
          break;
        }
        if (this.iterations >= this.maxIterations) {
          this.status = "max_iterations";
          this.result = content || "Max iterations reached without completion";
        }
      }
    } catch (e) {
      this.status = "error";
      this.error = e.message;
      this.result = `❌ Error: ${e.message}`;
    } finally {
      this.env.cleanup();
    }

    return {
      task: this.task,
      status: this.status,
      result: this.result,
      error: this.error,
      iterations: this.iterations,
      toolCalls: this.toolCalls,
      tokensUsed: this.env.budget.usedTokens,
      costUsd: this.env.budget.usedCost,
      elapsed: this.env.getElapsed(),
      depth: this.depth,
    };
  }
}

/**
 * Coordinates execution of multiple sub-agents, potentially in parallel.
 */
class AgentCoordinator {
  /**
   * @param {Object} cfg - Global configuration.
   * @param {SubagentCache|null} [cache=null] - Optional cache instance.
   */
  constructor(cfg, cache = null) {
    this.cfg = cfg;
    this.cache = cache || new SubagentCache();
    this.activeAgents = new Map();
    this.completedResults = [];
  }

  /**
   * Runs multiple tasks in parallel batches.
   * @param {Array<Object>} taskDefs - Definitions of tasks to run.
   * @returns {Promise<Array<Object>>} List of task results.
   */
  async runParallel(taskDefs) {
    const results = [];
    const batches = [];
    for (let i = 0; i < taskDefs.length; i += MAX_PARALLEL) {
      batches.push(taskDefs.slice(i, i + MAX_PARALLEL));
    }

    for (const batch of batches) {
      const promises = batch.map(async (def) => {
        const cached = this.cache.get(def.task);
        if (cached) {
          return { ...cached, fromCache: true };
        }

        const agent = new SubAgent(def.task, this.cfg, {
          depth: def.depth || 0,
          parentId: def.parentId || null,
          maxIterations: def.maxIterations || 15,
          maxTokens: def.maxTokens || 20000,
          maxCost: def.maxCost || 1.0,
          tools: def.tools,
        });

        this.activeAgents.set(agent.env.id, agent);
        const result = await agent.run();
        this.activeAgents.delete(agent.env.id);

        if (result.status === "done") {
          this.cache.set(def.task, [], result);
        }

        return result;
      });

      const batchResults = await Promise.allSettled(promises);
      for (const r of batchResults) {
        if (r.status === "fulfilled") results.push(r.value);
        else results.push({ status: "error", error: r.reason?.message || "Unknown", task: "unknown" });
      }
    }

    this.completedResults.push(...results);
    return results;
  }

  /**
   * Returns coordination statistics.
   * @returns {Object}
   */
  getStats() {
    const total = this.completedResults.length;
    const success = this.completedResults.filter(r => r.status === "done").length;
    const tokens = this.completedResults.reduce((s, r) => s + (r.tokensUsed || 0), 0);
    const cost = this.completedResults.reduce((s, r) => s + (r.costUsd || 0), 0);
    const elapsed = this.completedResults.reduce((s, r) => s + (r.elapsed || 0), 0);
    return {
      total,
      success,
      failed: total - success,
      tokens,
      cost: cost.toFixed(4),
      elapsed: formatDuration(elapsed),
      cacheStats: this.cache.getStats()
    };
  }
}

let _globalCache = new SubagentCache();

/**
 * Implementation of the delegate_task tool.
 * @param {Object} args - Tool arguments.
 * @param {Object} cfg - Global configuration.
 * @returns {Promise<string>} Formatted summary of all sub-agent results.
 */
async function delegateTask(args, cfg) {
  const tasks = args.tasks || [];
  if (tasks.length === 0) return "❌ No tasks to delegate";

  const coordinator = new AgentCoordinator(cfg, _globalCache);
  const startTime = Date.now();

  printDelegationHeader(tasks);

  const taskDefs = tasks.map(t => ({
    task: t.description,
    tools: t.tools,
    maxTokens: t.max_tokens || Math.floor(50000 / tasks.length),
    maxCost: t.max_cost || (5.0 / tasks.length),
    depth: 0,
  }));

  const results = await coordinator.runParallel(taskDefs);
  const stats = coordinator.getStats();
  const elapsed = Date.now() - startTime;

  printDelegationResults(results, stats, elapsed);

  const output = results.map((r, i) => {
    const icon = r.status === "done" ? "✅" : r.fromCache ? "📦" : "❌";
    const cache = r.fromCache ? " [CACHED]" : "";
    return `[${i + 1}] ${icon}${cache} ${r.task?.slice(0, 80) || "task"}\n${(r.result || r.error || "no output").slice(0, 500)}`;
  }).join("\n\n");

  return `${output}\n\n--- Stats: ${stats.success}/${stats.total} ok, ${stats.tokens} tokens, $${stats.cost}, ${formatDuration(elapsed)}, cache: ${stats.cacheStats.hitRate} hits`;
}

/** @private */
function printDelegationHeader(tasks) {
  console.log(`\n  ${ACCENT}${C.bold}🔀 Delegating ${tasks.length} subtask${tasks.length > 1 ? "s" : ""}${C.reset}`);
  for (let i = 0; i < tasks.length; i++) {
    console.log(`  ${TOOL_CLR}┃${C.reset} ${MUTED}[${i + 1}]${C.reset} ${TEXT_DIM}${tasks[i].description?.slice(0, 70) || "task"}${C.reset}`);
  }
}

/** @private */
function printDelegationResults(results, stats, elapsed) {
  console.log(`  ${TOOL_CLR}┃${C.reset}`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const icon = r.status === "done" ? `${SUCCESS}✔` : r.fromCache ? `${ACCENT}📦` : `${ERROR}✘`;
    const info = r.fromCache ? "cached" : `${r.iterations || 0}i ${r.toolCalls || 0}t ${formatDuration(r.elapsed || 0)}`;
    console.log(`  ${TOOL_CLR}┃${C.reset} ${icon}${C.reset} ${MUTED}[${i + 1}]${C.reset} ${TEXT_DIM}${info}${C.reset}`);
  }
  console.log(`  ${TOOL_CLR}┃${C.reset} ${MUTED}${stats.success}/${stats.total} ok · ${stats.tokens} tokens · $${stats.cost} · ${formatDuration(elapsed)}${C.reset}`);
}

/** Resets the global sub-agent cache. */
function resetCache() { _globalCache = new SubagentCache(); }
/** @returns {Object} Global cache statistics. */
function getCacheStats() { return _globalCache.getStats(); }

export { SubAgent, SubagentCache, AgentCoordinator, IsolatedEnv, delegateTask, resetCache, getCacheStats };
