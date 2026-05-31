import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { callApi } from "../api.js";
import { executeTool, grepSearch, listDir, readFile } from "../tools.js";
import { log, C, ACCENT, ACCENT2, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING, AUTO_CLR, box, COLS, progressBar, stripAnsi } from "../ui.js";
import { getModelPrice } from "../cost-tracker.js";
import { formatDuration } from "../utils.js";
import { getMemoryStore } from "../memory/rag.js";
import { DATA_DIR } from "../config.js";
import { getSandbox } from "../security/sandbox.js";
// Lazy-import for project index (may not be available, gracefully handled)
let _indexModule = null;
async function _getIndexModule() {
  if (!_indexModule) { try { _indexModule = await import("../project-index.js"); } catch { _indexModule = {}; } }
  return _indexModule;
}

const LEAD_LOG_DIR = path.join(DATA_DIR, "lead-dev-logs");

/**
 * Enum for quality gate types.
 */
const QualityGate = {
  LINT: "lint",
  TEST: "test",
  BUILD: "build",
  TYPE_CHECK: "type_check",
};

/**
 * Analyzes projects to detect type and available quality gates.
 */
class ProjectAnalyzer {
  constructor() {
    this.cwd = process.cwd();
    this.projectType = null;
    this.testCmd = null;
    this.lintCmd = null;
    this.buildCmd = null;
    this.typeCheckCmd = null;
    this._cache = new Map();
  }

  detect() {
    if (this._cache.has("detected")) return this;
    this.projectType = this._detectProjectType();
    this.testCmd = this._findCommand("test");
    this.lintCmd = this._findCommand("lint");
    this.buildCmd = this._findCommand("build");
    this.typeCheckCmd = this._findTypeCheck();
    this._cache.set("detected", true);
    return this;
  }

  _detectProjectType() {
    if (fs.existsSync(path.join(this.cwd, "package.json"))) return "node";
    if (fs.existsSync(path.join(this.cwd, "Cargo.toml"))) return "rust";
    if (fs.existsSync(path.join(this.cwd, "go.mod"))) return "go";
    if (fs.existsSync(path.join(this.cwd, "pyproject.toml")) ||
        fs.existsSync(path.join(this.cwd, "requirements.txt"))) return "python";
    return "unknown";
  }

  _findCommand(name) {
    try {
      if (this.projectType === "node") {
        const pkg = JSON.parse(fs.readFileSync(path.join(this.cwd, "package.json"), "utf8"));
        if (pkg.scripts?.[name]) return `npm run ${name}`;
      }
      if (this.projectType === "python") {
        if (name === "test") return "python -m pytest";
        if (name === "lint") return "python -m flake8 .";
      }
      if (this.projectType === "rust") {
        if (name === "test") return "cargo test";
        if (name === "build") return "cargo build";
        if (name === "lint") return "cargo clippy";
      }
      if (this.projectType === "go") {
        if (name === "test") return "go test ./...";
        if (name === "build") return "go build ./...";
        if (name === "lint") return "golangci-lint run";
      }
    } catch {}
    return null;
  }

  _findTypeCheck() {
    if (this.projectType === "node") {
      if (fs.existsSync(path.join(this.cwd, "tsconfig.json"))) return "npx tsc --noEmit";
    }
    if (this.projectType === "rust") return "cargo check";
    return null;
  }

  runGate(gate) {
    const commands = {
      [QualityGate.LINT]: this.lintCmd,
      [QualityGate.TEST]: this.testCmd,
      [QualityGate.BUILD]: this.buildCmd,
      [QualityGate.TYPE_CHECK]: this.typeCheckCmd,
    };
    const cmd = commands[gate];
    if (!cmd) return { gate, passed: true, skipped: true, output: "No command configured" };
    try {
      const sandbox = getSandbox();
      const output = sandbox.safeExec(cmd, { cwd: this.cwd, stdio: 'pipe' }).trim();
      return { gate, passed: true, skipped: false, output: output.slice(0, 1000) };
    } catch (e) {
      return { gate, passed: false, skipped: false, output: (e.stdout || e.stderr || e.message || "").slice(0, 1000) };
    }
  }

  runAllGates() {
    return [QualityGate.TYPE_CHECK, QualityGate.LINT, QualityGate.TEST, QualityGate.BUILD]
      .map(g => this.runGate(g));
  }

  getSummary() {
    return {
      type: this.projectType,
      test: !!this.testCmd,
      lint: !!this.lintCmd,
      build: !!this.buildCmd,
      typeCheck: !!this.typeCheckCmd,
    };
  }
}

/**
 * Analyzes Git history and state.
 */
class GitAnalyzer {
  constructor() {
    this.cwd = process.cwd();
    this.hasGit = fs.existsSync(path.join(this.cwd, ".git"));
  }

  getHotFiles(limit = 10) {
    if (!this.hasGit) return [];
    try {
      const sandbox = getSandbox();
      const output = sandbox.safeExec("git log --format='' --name-only | sort | uniq -c | sort -rn | head -n " + limit, { cwd: this.cwd });
      return output.trim().split("\n").map(line => {
        const [count, file] = line.trim().split(/\s+/);
        return { file, changes: parseInt(count, 10) };
      }).filter(f => f.file && fs.existsSync(path.join(this.cwd, f.file)));
    } catch { return []; }
  }

  getRecentChanges(days = 7) {
    if (!this.hasGit) return "";
    try {
      const sandbox = getSandbox();
      return sandbox.safeExec(`git log --since="${days} days ago" --oneline --stat`, { cwd: this.cwd }).slice(0, 2000);
    } catch { return ""; }
  }

  getUncommittedChanges() {
    if (!this.hasGit) return "";
    try {
      const sandbox = getSandbox();
      return sandbox.safeExec("git status --short", { cwd: this.cwd }).trim();
    } catch { return ""; }
  }
}

/**
 * Static analysis for code intelligence.
 */
class CodeIntelligence {
  constructor() {
    this.cwd = process.cwd();
  }

  scanForKeywords(keywords = ["TODO", "FIXME", "HACK", "OPTIMIZE", "SECURITY"]) {
    const results = [];
    try {
      for (const kw of keywords) {
        const output = grepSearch(kw, this.cwd, "*.*");
        if (typeof output === "string" && !output.startsWith("❌") && !output.startsWith("ℹ")) {
          const lines = output.split("\n");
          results.push(...lines.map(line => ({ line, keyword: kw })));
        }
      }
    } catch {}
    return results.slice(0, 20);
  }

  getComplexityInsights() {
    const rawFiles = listDir(this.cwd, true).split("\n");
    const insights = [];
    
    for (let file of rawFiles.slice(0, 150)) {
      file = file.trim();
      if (!file || file.includes("(skipped)") || file.includes("(truncated)") || file.startsWith("❌")) continue;
      
      const isDir = file.endsWith("/");
      const cleanFile = isDir ? file.slice(0, -1) : file;
      const fullPath = path.join(this.cwd, cleanFile);
      
      try {
        if (!fs.existsSync(fullPath) || fs.lstatSync(fullPath).isDirectory()) continue;
        
        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n").length;
        if (lines > 300) insights.push({ file: cleanFile, lines, issue: "High file length" });
        
        const deepIndents = (content.match(/^\s{8,}/gm) || []).length;
        if (deepIndents > 20) insights.push({ file: cleanFile, deepIndents, issue: "High nesting complexity" });
      } catch {}
    }
    return insights.sort((a, b) => (b.lines || 0) - (a.lines || 0)).slice(0, 10);
  }
}

/**
 * Task category definitions.
 */
const TASK_CATEGORIES = [
  { id: "fix_bugs", label: "Fix bugs & errors", priority: 1, icon: "🐛", color: ERROR },
  { id: "add_tests", label: "Improve test coverage", priority: 2, icon: "🧪", color: SUCCESS },
  { id: "refactor", label: "Refactor & clean up", priority: 3, icon: "♻️", color: ACCENT2 },
  { id: "docs", label: "Update documentation", priority: 4, icon: "📝", color: TEXT_DIM },
  { id: "security", label: "Security improvements", priority: 5, icon: "🔒", color: WARNING },
  { id: "performance", label: "Optimize performance", priority: 6, icon: "⚡", color: ACCENT },
  { id: "deps", label: "Update dependencies", priority: 7, icon: "📦", color: MUTED },
];

/**
 * Uses AI to suggest next tasks based on deep project context.
 */
async function suggestNextTasks(cfg, analyzer, options = {}) {
  const { context = "", focus = "", failedTasks = [] } = options;
  const git = new GitAnalyzer();
  const intel = new CodeIntelligence();
  
  const rawStructure = listDir(process.cwd(), true);
  const structure = rawStructure.startsWith("❌") ? [] : rawStructure.split("\n").filter(l => l.trim()).slice(0, 100);
  const gates = analyzer.runAllGates();
  const failedGates = gates.filter(g => !g.passed && !g.skipped);
  
  const hotFiles = git.getHotFiles(5);
  const uncommitted = git.getUncommittedChanges();
  const todoItems = intel.scanForKeywords();
  const complexity = intel.getComplexityInsights();
  
  const memory = getMemoryStore();
  const recentPatterns = memory.search("recent work improvements", { maxResults: 5 });

  const systemPrompt = [
    "You are a Senior AI Tech Lead. Analyze the project state and suggest 3-5 high-impact tasks.",
    focus ? `FOCUS AREA: ${focus.toUpperCase()}` : "",
    "Return ONLY valid JSON array of objects: {\"task\": \"...\", \"category\": \"...\", \"priority\": 1-5, \"reason\": \"...\", \"files\": [\"...\"], \"parallel\": boolean}",
    "Categories: fix_bugs, add_tests, refactor, docs, security, performance, deps",
    "Mark 'parallel: true' if the task is independent and can be executed by a sub-agent without affecting others.",
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `Project: ${analyzer.projectType}`,
    `Structure: ${structure.join(", ").slice(0, 500)}...`,
    failedGates.length > 0 ? `FAILED GATES: ${failedGates.map(g => g.gate).join(", ")}` : "All gates pass.",
    failedTasks.length > 0 ? `PREVIOUSLY FAILED TASKS: ${failedTasks.map(t => t.task).join("; ")} (Avoid repeating these without a new approach)` : "",
    hotFiles.length > 0 ? `HOT FILES (frequent changes): ${hotFiles.map(f => f.file).join(", ")}` : "",
    uncommitted ? `UNCOMMITTED CHANGES:\n${uncommitted}` : "",
    todoItems.length > 0 ? `TODO/FIXME Items: ${todoItems.length} found` : "",
    complexity.length > 0 ? `COMPLEXITY ISSUES: ${complexity.map(c => `${c.file} (${c.issue})`).join("; ")}` : "",
    context ? `CONTEXT: ${context}` : "",
    recentPatterns.length > 0 ? `RECENT MEMORY: ${recentPatterns.map(r => r.memory.content.slice(0, 100)).join("; ")}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const data = await callApi([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { ...cfg, profiles: { ...cfg.profiles, [cfg.profile]: { ...(cfg.profiles[cfg.profile] || {}), temperature: 0.3 } } });

    const content = data.choices?.[0]?.message?.content || "[]";
    const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    log.dim(`Task suggestion failed: ${e.message}`);
    return [{ task: "Audit codebase for improvements", category: "refactor", priority: 3, reason: "Fallback due to API error", files: [], parallel: false }];
  }
}

/**
 * Manages an enhanced AI Lead Developer session.
 */
class LeadDevSession {
  constructor(cfg, messages, saveCallback) {
    this.cfg = cfg;
    this.messages = messages;
    this.saveCallback = saveCallback;
    this.running = false;
    this.aborted = false;
    this.analyzer = new ProjectAnalyzer().detect();
    this.tasksCompleted = [];
    this.tasksFailed = [];
    this.totalTokens = 0;
    this.totalCost = 0;
    this.startTime = 0;
    this.logEntries = [];
    
    // Limits
    this.maxCost = cfg.lead_dev?.max_cost_usd || 10.0;
    this.maxTasks = cfg.lead_dev?.max_tasks || 20;
    
    // Modes
    this.autoMode = false;
    this.planOnly = false;
    this.focusArea = "";
  }

  abort() { this.aborted = true; this.running = false; }

  _log(msg) {
    this.logEntries.push({ time: Date.now(), msg: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }

  async run(initialContext = "", options = {}) {
    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();
    this.autoMode = !!options.auto;
    this.planOnly = !!options.plan || !!options.dryRun;
    this.focusArea = options.focus || "";
    if (options.tasks) this.maxTasks = parseInt(options.tasks, 10);

    const origAutoYes = this.cfg.auto_yes;
    this._printHeader(initialContext);

    try {
      let round = 0;
      while (round < this.maxTasks && !this.aborted && this.totalCost < this.maxCost) {
        round++;

        console.log(`\n  ${ACCENT2}${C.bold}🔄 Round ${round}/${this.maxTasks}${C.reset} ${MUTED}— Deep Analysis...${C.reset}`);
        
        const context = round === 1 ? initialContext : `Completed: ${this.tasksCompleted.slice(-2).map(t => t.task).join("; ")}`;
        const suggestions = await suggestNextTasks(this.cfg, this.analyzer, { 
          context, 
          focus: this.focusArea,
          failedTasks: this.tasksFailed 
        });

        if (!suggestions || suggestions.length === 0) {
          log.ok("Project state is optimal. No further suggestions.");
          break;
        }

        this._printSuggestions(suggestions);

        if (this.planOnly) {
          log.info("Plan mode: stopping after suggestion.");
          break;
        }

        let selectedTask;
        if (this.autoMode) {
          selectedTask = suggestions[0];
          console.log(`  ${AUTO_CLR}Auto-selecting:${C.reset} ${TEXT}${selectedTask.task}${C.reset}`);
        } else {
          const choice = await this._askUserChoice(suggestions);
          if (choice === null) break;
          if (choice === -1) {
            this.autoMode = true;
            selectedTask = suggestions[0];
            console.log(`  ${AUTO_CLR}Auto-mode enabled.${C.reset}`);
          } else {
            selectedTask = suggestions[choice];
          }
        }

        // Parallel execution check
        const parallelTasks = suggestions.filter(s => s.parallel && s !== selectedTask).slice(0, 2);
        
        if (parallelTasks.length > 0 && this.autoMode) {
           console.log(`  ${ACCENT}🔀 Running ${parallelTasks.length} sub-tasks in parallel...${C.reset}`);
           await this._executeParallel([selectedTask, ...parallelTasks]);
        } else {
           console.log(`\n  ${ACCENT}${C.bold}⚡ Executing:${C.reset} ${TEXT}${selectedTask.task}${C.reset}`);
           this.cfg.auto_yes = true;
           await this._executeTask(selectedTask);
           this.cfg.auto_yes = origAutoYes;
        }

        // Quality check
        const gates = this.analyzer.runAllGates();
        const failed = gates.filter(g => !g.passed && !g.skipped);

        if (failed.length > 0) {
          log.warn(`Quality gates failed: ${failed.map(g => g.gate).join(", ")}`);
          this.tasksFailed.push({ ...selectedTask, gates: failed.map(g => g.gate) });
          
          // Progressive learning: record failure
          const memory = getMemoryStore();
          memory.add("pattern", `Failed task "${selectedTask.task}" due to ${failed.map(g => g.gate).join(", ")} failures.`);
        } else {
          log.ok(`Task completed and verified.`);
          this.tasksCompleted.push(selectedTask);
          
          // Progressive learning: record success
          const memory = getMemoryStore();
          memory.recordDecision(selectedTask.task, selectedTask.reason || "lead-dev suggestion");
          memory.add("pattern", `Successfully improved project: ${selectedTask.task}`);
        }

        this._printStatus(round);

        if (!this.autoMode && round < this.maxTasks) {
          const cont = await this._askContinue();
          if (!cont) break;
        } else if (this.autoMode && round < this.maxTasks) {
          // Small delay for reliability in auto-mode
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    } catch (e) {
      log.err(`Lead dev session error: ${e.message}`);
    } finally {
      this.cfg.auto_yes = origAutoYes;
      this.running = false;
    }

    this._printSummary();
    this._saveLog();
    this.saveCallback();

    return {
      completed: this.tasksCompleted.length,
      failed: this.tasksFailed.length,
      tokens: this.totalTokens,
      cost: this.totalCost,
      elapsed: Date.now() - this.startTime,
    };
  }

  async _executeTask(task) {
    const { Autopilot } = await import("../autopilot.js");
    const ap = new Autopilot({ ...this.cfg, auto_yes: true, autopilot: { ...this.cfg.autopilot, max_iterations: 20 } },
      [...this.messages], this.saveCallback);

    const taskPrompt = [
      `TASK: ${task.task}`,
      task.files?.length > 0 ? `\nFILES: ${task.files.join(", ")}` : "",
      task.reason ? `\nCONTEXT: ${task.reason}` : "",
      `\nMISSION: Improve the code according to the task while ensuring all tests/linters pass.`,
    ].filter(Boolean).join("");

    const result = await ap.run(taskPrompt);
    this.totalTokens += result.tokens || 0;
    const price = getModelPrice(this.cfg.model);
    this.totalCost += (result.tokens * (price.input + price.output) / 2) / 1_000_000;
    return result;
  }

  async _executeParallel(tasks) {
    const { AgentCoordinator } = await import("./subagent.js");
    const coordinator = new AgentCoordinator(this.cfg);
    
    const taskDefs = tasks.map(t => ({
      task: t.task,
      maxTokens: 15000,
      maxCost: 1.0,
    }));
    
    const results = await coordinator.runParallel(taskDefs);
    
    for (const r of results) {
      this.totalTokens += r.tokensUsed || 0;
      this.totalCost += r.costUsd || 0;
      if (r.status === "done") {
        this.tasksCompleted.push({ task: r.task });
      } else {
        this.tasksFailed.push({ task: r.task, reason: r.error || r.result });
      }
    }
  }

  async _printHeader(context) {
    const summary = this.analyzer.getSummary();
    const git = new GitAnalyzer();
    const hot = git.getHotFiles(3);

    // Try to get index-based hot files
    let indexInfo = "";
    try {
      const idx = await _getIndexModule();
      if (idx.getIndexStats && idx.getRecentFiles) {
        const stats = await idx.getIndexStats(process.cwd());
        if (stats.exists && stats.fileCount > 0) {
          const recent = await idx.getRecentFiles(3, process.cwd());
          const hotFromIndex = recent.map(f => TEXT_DIM(f.path)).join(", ");
          indexInfo = `${MUTED}Index:${C.reset} ${ACCENT(String(stats.fileCount))} ${MUTED}files ${hotFromIndex ? `· Hot: ${hotFromIndex}` : ""}`;
        }
      }
    } catch { /* index not available */ }

    const lines = [
      `${ACCENT2}${C.bold}AI LEAD DEVELOPER v3.5${C.reset}`,
      "",
      `${MUTED}Project:${C.reset} ${TEXT}${this.analyzer.projectType}${C.reset}  ${MUTED}CWD:${C.reset} ${TEXT_DIM}${process.cwd()}${C.reset}`,
      `${MUTED}Gates:${C.reset} ${summary.test ? SUCCESS("test") : MUTED("test")} ${summary.lint ? SUCCESS("lint") : MUTED("lint")} ${summary.build ? SUCCESS("build") : MUTED("build")}`,
      hot.length > 0 ? `${MUTED}Git Hot Files:${C.reset} ${hot.map(f => TEXT_DIM(f.file)).join(", ")}` : "",
      indexInfo,
      `${MUTED}Budget:${C.reset} $${this.maxCost} ${MUTED}Limit:${C.reset} ${this.maxTasks} tasks`,
      this.focusArea ? `${WARNING("Focus Area:")} ${TEXT(this.focusArea)}` : "",
      context ? `\n${MUTED}Initial Goal:${C.reset} ${TEXT(context)}` : "",
    ].filter(Boolean);

    console.log("\n" + box(lines.join("\n"), { title: "🎯 LEAD DEV ENGINE", color: ACCENT2, width: Math.min(COLS - 2, 70) }));
  }

  _printSuggestions(suggestions) {
    console.log(`\n  ${ACCENT2}${C.bold}📋 Suggested Roadmap${C.reset}`);
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const cat = TASK_CATEGORIES.find(c => c.id === s.category) || { icon: "▸", color: TEXT };
      const parallelTag = s.parallel ? `${ACCENT(" [parallel]")}` : "";
      const priorityStars = "★".repeat(6 - (s.priority || 3));
      
      console.log(`  ${TEXT}${i + 1}.${C.reset} ${cat.icon} ${cat.color(s.task)}${parallelTag} ${MUTED}${priorityStars}${C.reset}`);
      if (s.reason) console.log(`     ${TEXT_DIM}${s.reason.slice(0, 90)}${C.reset}`);
    }
  }

  _askUserChoice(suggestions) {
    return new Promise(resolve => {
      const prompt = `\n  ${TEXT}Choose (1-${suggestions.length}), ${MUTED}'a'=auto, 'p'=plan, 'q'=quit${C.reset}: `;
      process.stdout.write(prompt);
      const onData = (d) => {
        clearTimeout(timer);
        process.stdin.off("data", onData);
        const answer = d.toString().trim().toLowerCase();
        if (answer === "q") resolve(null);
        else if (answer === "a") resolve(-1);
        else if (answer === "p") { this.planOnly = true; resolve(null); }
        else {
          const num = parseInt(answer, 10);
          resolve(!isNaN(num) && num >= 1 && num <= suggestions.length ? num - 1 : 0);
        }
      };
      const timer = setTimeout(() => { process.stdin.off("data", onData); resolve(0); }, 60000);
      process.stdin.on("data", onData);
    });
  }

  _askContinue() {
    return new Promise(resolve => {
      process.stdout.write(`\n  ${TEXT}Next round? ${MUTED}[Y/n/a/p]${C.reset} `);
      const onData = (d) => {
        clearTimeout(timer);
        process.stdin.off("data", onData);
        const answer = d.toString().trim().toLowerCase();
        if (answer === "n") resolve(false);
        else if (answer === "a") { this.autoMode = true; resolve(true); }
        else if (answer === "p") { this.planOnly = true; resolve(false); }
        else resolve(true);
      };
      const timer = setTimeout(() => { process.stdin.off("data", onData); resolve(true); }, 30000);
      process.stdin.on("data", onData);
    });
  }

  _printStatus(round) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const progress = progressBar(round, this.maxTasks, { width: 15 });
    console.log(`  ${progress} Round ${round} · ✔${this.tasksCompleted.length} ✗${this.tasksFailed.length} · $${this.totalCost.toFixed(3)} · ${elapsed}`);
  }

  _printSummary() {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const lines = [
      `${C.bold}Status:${C.reset}        ${this.tasksFailed.length === 0 ? SUCCESS("Excellent") : WARNING("Partial Success")}`,
      `${C.bold}Completed:${C.reset}     ${SUCCESS(this.tasksCompleted.length)} tasks`,
      `${C.bold}Failed:${C.reset}        ${this.tasksFailed.length > 0 ? ERROR(this.tasksFailed.length) : "0"} tasks`,
      `${C.bold}Total Cost:${C.reset}    $${this.totalCost.toFixed(4)}`,
      `${C.bold}Duration:${C.reset}      ${elapsed}`,
    ];
    
    if (this.tasksCompleted.length > 0) {
      lines.push("", `${C.bold}Achievements:${C.reset}`);
      for (const t of this.tasksCompleted.slice(-5)) lines.push(`  ${SUCCESS("✔")} ${TEXT_DIM(t.task)}`);
    }
    
    console.log("\n" + box(lines.join("\n"), { title: "🎯 LEAD DEV SUMMARY", color: ACCENT2, width: Math.min(COLS - 2, 70) }));
  }

  _saveLog() {
    try {
      if (!fs.existsSync(LEAD_LOG_DIR)) fs.mkdirSync(LEAD_LOG_DIR, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      fs.writeFileSync(path.join(LEAD_LOG_DIR, `lead-v3-${ts}.json`), JSON.stringify({
        startTime: new Date(this.startTime).toISOString(),
        completed: this.tasksCompleted, failed: this.tasksFailed,
        tokens: this.totalTokens, cost: this.totalCost,
        duration: Date.now() - this.startTime, focus: this.focusArea,
      }, null, 2));
    } catch {}
  }
}

export { LeadDevSession, ProjectAnalyzer, QualityGate, suggestNextTasks, TASK_CATEGORIES, GitAnalyzer, CodeIntelligence };
