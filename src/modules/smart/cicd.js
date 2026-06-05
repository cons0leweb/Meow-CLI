import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, ERROR, WARNING } from "../ui.js";
import { callApi } from "../api.js";

// ═══════════════════════════════════════════════════════════════
// VERSION
// ═══════════════════════════════════════════════════════════════

/** @returns {string} CI/CD module version from package.json */
function getCICDVersion() {
  try {
    const pkgPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const CICD_VERSION = getCICDVersion();

/**
 * Executes a git command and returns the output.
 * @param {string} cmd - The git command to run.
 * @param {string} [cwd=process.cwd()] - Working directory.
 * @returns {string} Command output or error message.
 */
function git(cmd, cwd = process.cwd()) {
  try { return execSync(`git ${cmd}`, { encoding: "utf8", cwd, timeout: 15000 }).trim(); }
  catch (e) { return e.stdout?.trim() || e.stderr?.trim() || e.message; }
}

/**
 * Checks if the current directory is inside a git repository.
 * @returns {boolean}
 */
function isGitRepo() {
  try { execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" }); return true; }
  catch { return false; }
}

/**
 * Returns the git diff of the repository.
 * @param {Object} [args={}] - Arguments (staged, file).
 * @returns {string}
 */
function gitDiff(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { staged, file } = args;
  let cmd = staged ? "diff --cached" : "diff";
  if (file) cmd += ` -- ${file}`;
  const output = git(cmd);
  return output || "ℹ No changes";
}

/**
 * Returns the git commit log.
 * @param {Object} [args={}] - Arguments (count, file, oneline).
 * @returns {string}
 */
function gitLog(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { count = 10, file, oneline = true } = args;
  let cmd = `log -${count}`;
  if (oneline) cmd += " --oneline --decorate";
  if (file) cmd += ` -- ${file}`;
  return git(cmd) || "ℹ No commits";
}

/**
 * Manages git branches.
 * @param {Object} [args={}] - Arguments (create, checkout, name).
 * @returns {string}
 */
function gitBranch(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { create, checkout, name } = args;
  if (create && name) return git(`checkout -b ${name}`);
  if (checkout && name) return git(`checkout ${name}`);
  return git("branch -a --no-color");
}

/**
 * Creates a git commit.
 * @param {Object} [args={}] - Arguments (message, files).
 * @returns {string}
 */
function gitCommit(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { message, files } = args;
  if (!message) return "❌ Commit message required";
  if (files && files.length > 0) {
    for (const f of files) git(`add ${f}`);
  } else {
    git("add -A");
  }
  return git(`commit -m ${JSON.stringify(message)}`);
}

/**
 * Stashes or pops git changes.
 * @param {Object} [args={}] - Arguments (pop).
 * @returns {string}
 */
function gitStash(args = {}) {
  if (!isGitRepo()) return "❌ Not a git repository";
  const { pop } = args;
  return pop ? git("stash pop") : git("stash");
}

/**
 * Returns git status summary.
 * @returns {string}
 */
function gitStatus() {
  if (!isGitRepo()) return "❌ Not a git repository";
  return git("status --short") || "ℹ Working tree clean";
}

/**
 * Detects the CI/CD provider used in the current repository.
 * @returns {string|null}
 */
function detectCIProvider() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, ".github/workflows"))) return "github_actions";
  if (fs.existsSync(path.join(cwd, ".gitlab-ci.yml"))) return "gitlab_ci";
  if (fs.existsSync(path.join(cwd, ".circleci/config.yml"))) return "circleci";
  if (fs.existsSync(path.join(cwd, "Jenkinsfile"))) return "jenkins";
  if (fs.existsSync(path.join(cwd, "bitbucket-pipelines.yml"))) return "bitbucket";
  if (fs.existsSync(path.join(cwd, ".travis.yml"))) return "travis";
  return null;
}

/**
 * Lists CI/CD workflows for the current provider.
 * @returns {Object}
 */
function listWorkflows() {
  const cwd = process.cwd();
  const provider = detectCIProvider();
  if (provider !== "github_actions") return { provider, workflows: [] };
  const dir = path.join(cwd, ".github/workflows");
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
    return {
      provider,
      workflows: files.map(f => {
        try {
          const content = fs.readFileSync(path.join(dir, f), "utf8");
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          return { file: f, name: nameMatch?.[1]?.trim() || f, path: path.join(dir, f) };
        } catch { return { file: f, name: f, path: path.join(dir, f) }; }
      })
    };\n  } catch { return { provider, workflows: [] }; }
}

/**
 * Generates a GitHub Actions workflow using AI.
 * @param {Object} cfg - Application configuration.
 * @param {string} description - Description of the workflow requirements.
 * @returns {Promise<Object>}
 */
async function generateWorkflow(cfg, description) {
  const cwd = process.cwd();
  const projectType = detectProjectType();

  const systemPrompt = [
    "You are a DevOps expert. Generate a GitHub Actions workflow YAML file.",
    "Return ONLY the valid YAML content, no markdown fences, no explanation.",
    `Project type: ${projectType}`,
    `Directory: ${cwd}`,
  ].join("\n");

  try {
    const data = await callApi([
      { role: "system", content: systemPrompt },
      { role: "user", content: `Create a GitHub Actions workflow for: ${description}` },
    ], cfg);

    const yaml = (data.choices?.[0]?.message?.content || "")
      .replace(/```ya?ml\n?/g, "").replace(/```/g, "").trim();

    if (!yaml.includes("on:") || !yaml.includes("jobs:")) {
      return { success: false, error: "Generated YAML doesn't look valid" };
    }

    return { success: true, yaml, projectType };
  } catch (e) {\n    return { success: false, error: e.message };
  }
}

/**
 * Saves a workflow YAML to the repository.
 * @param {string} name - Base name of the workflow file.
 * @param {string} yaml - YAML content.
 * @returns {string} Path to the saved file.
 */
function saveWorkflow(name, yaml) {
  const dir = path.join(process.cwd(), ".github/workflows");
  fs.mkdirSync(dir, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const filePath = path.join(dir, `${safeName}.yml`);
  fs.writeFileSync(filePath, yaml, "utf8");
  return filePath;
}

/**
 * Automates testing and fixing of code failures.
 */
class SelfHealer {
  /**
   * @param {Object} cfg - Application configuration.
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.maxAttempts = 3;
    this.revertOnFailure = true;
  }

  /**
   * Checks for test failures and attempts to fix them autonomously.
   * @returns {Promise<Object>} Healing result.
   */
  async checkAndHeal() {
    if (!isGitRepo()) return { healed: false, reason: "Not a git repo" };

    const testResult = this._runTests();
    if (testResult.passed) return { healed: false, reason: "Tests pass — nothing to heal" };

    log.warn(`Tests failing: ${testResult.output.slice(0, 200)}`);

    const lastCommitHash = git("rev-parse HEAD").trim();

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      log.info(`Heal attempt ${attempt}/${this.maxAttempts}...`);

      const success = await this._attemptFix(testResult.output, attempt);
      if (success) {
        const retest = this._runTests();
        if (retest.passed) {
          log.ok("Self-healing successful — tests pass");
          gitCommit({ message: `fix: auto-heal test failures (attempt ${attempt})` });
          return { healed: true, attempt };
        }
      }
    }

    if (this.revertOnFailure) {
      log.warn("Max attempts reached — reverting to last good state");
      git(`reset --hard ${lastCommitHash}`);
      return { healed: false, reason: "Reverted after max attempts", reverted: true };
    }

    return { healed: false, reason: "Max attempts reached" };
  }

  /** @private */
  _runTests() {
    try {
      const output = execSync("npm test 2>&1", { encoding: "utf8", timeout: 60000 });
      return { passed: true, output };
    } catch (e) {\n      return { passed: false, output: (e.stdout || "") + (e.stderr || "") };
    }
  }

  /** @private */
  async _attemptFix(errorOutput, attempt) {
    try {
      const data = await callApi([
        { role: "system", content: "You are a debugging expert. Analyze the test failure and suggest a fix. Use patch_file tool to apply the fix." },
        { role: "user", content: `Test failure (attempt ${attempt}):\n${errorOutput.slice(0, 2000)}` },
      ], { ...this.cfg, auto_yes: true });

      const msg = data.choices?.[0]?.message;
      if (msg?.tool_calls) {
        const { executeTool } = await import("../tools.js");
        for (const call of msg.tool_calls) {
          const name = call.function.name;
          const args = JSON.parse(call.function.arguments || "{}");
          await executeTool(name, args, this.cfg);
        }
        return true;
      }
      return false;\n    } catch { return false; }\n  }
}

/**
 * Detects the type of project based on configuration files.
 * @returns {string} Project type (node, rust, go, python, or unknown).
 */
function detectProjectType() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) return "node";
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(cwd, "go.mod"))) return "go";
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return "python";
  return "unknown";
}

/**
 * Implementation of the ci_pipeline tool.
 * @param {Object} args - Tool arguments.
 * @param {Object} cfg - Application configuration.
 * @returns {Promise<string>} Result summary.
 */
async function ciTool(args, cfg) {
  const { action } = args;\n  switch (action) {
    case "status": return JSON.stringify(listWorkflows(), null, 2);
    case "generate": {\n      const result = await generateWorkflow(cfg, args.description || "CI pipeline");
      if (!result.success) return `❌ ${result.error}`;
      const filePath = saveWorkflow(args.name || "ci", result.yaml);
      return `✅ Workflow saved: ${filePath}\n\n${result.yaml}`;
    }
    case "heal": {\n      const healer = new SelfHealer(cfg);
      const result = await healer.checkAndHeal();
      return JSON.stringify(result, null, 2);
    }
    default: return `❌ Unknown CI action: ${action}. Use: status, generate, heal`;
  }
}

/** @type {Array<Object>} Definitions of git and CI tools for the AI */
const GIT_TOOLS = [
  {\n    type: "function",
    function: {
      name: "git_diff",
      description: "Show git diff (staged or unstaged)",
      parameters: { type: "object", properties: {
        staged: { type: "boolean" }, file: { type: "string" },
      }}
    }
  },
  {\n    type: "function",
    function: {
      name: "git_log",
      description: "Show recent git commits",
      parameters: { type: "object", properties: {
        count: { type: "number", description: "Number of commits (default 10)" },
        file: { type: "string" },
      }}
    }
  },
  {\n    type: "function",
    function: {
      name: "git_commit",
      description: "Stage files and commit with message",
      parameters: { type: "object", properties: {
        message: { type: "string" },
        files: { type: "array", items: { type: "string" } },
      }, required: ["message"]}
    }
  },
  {\n    type: "function",
    function: {
      name: "git_branch",
      description: "List, create, or checkout branches",
      parameters: { type: "object", properties: {
        create: { type: "boolean" }, checkout: { type: "boolean" }, name: { type: "string" },
      }}
    }
  },
  {\n    type: "function",
    function: {
      name: "git_status",
      description: "Show working tree status",
      parameters: { type: "object", properties: {} }
    }
  },
  {\n    type: "function",
    function: {
      name: "ci_pipeline",
      description: "Manage CI/CD pipelines. Actions: status (list workflows), generate (create workflow), heal (self-healing test fix)",
      parameters: { type: "object", properties: {
        action: { type: "string", enum: ["status", "generate", "heal"] },
        description: { type: "string" },
        name: { type: "string" },
      }, required: ["action"]}
    }
  },
];

export {
  gitDiff, gitLog, gitBranch, gitCommit, gitStash, gitStatus,
  detectCIProvider, listWorkflows, generateWorkflow, saveWorkflow,
  SelfHealer, ciTool, GIT_TOOLS,
};
