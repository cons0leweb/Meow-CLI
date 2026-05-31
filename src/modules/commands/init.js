import fs from "fs";
import path from "path";
import {
  log, C, ACCENT, MUTED, TEXT, TEXT_DIM, SUCCESS, WARNING, Spinner,
  callApi,
  buildSystemPrompt, loadProjectContext, LOCAL_MEOW_MD,
  listDir,
} from "../../core.js";

/** @type {string} Project index filename */
const PROJECT_MEOW = "project.meow";

/** @type {number} Max chars of a single file to include in the index prompt */
const MAX_FILE_PREVIEW = 3000;

/** @type {number} Max total chars sent to model for indexing */
const MAX_PROMPT_CHARS = 60000;

/**
 * Collects information about the project for the AI to analyze.
 * @param {string} cwd - Current working directory.
 * @returns {string} Aggregated project snapshot text.
 */
function collectProjectSnapshot(cwd) {
  const lines = [];

  // --- Directory tree ---
  lines.push("## Directory Tree");
  lines.push("```");
  lines.push(listDir(cwd, true));
  lines.push("```");
  lines.push("");

  // --- Key files to read ---
  const KEY_FILES = [
    "package.json",
    "package-lock.json",
    "pyproject.toml",
    "setup.py",
    "requirements.txt",
    "environment.yml",
    "Pipfile",
    "Cargo.toml",
    "go.mod",
    "go.sum",
    "composer.json",
    "Gemfile",
    "build.gradle",
    "pom.xml",
    "CMakeLists.txt",
    "Makefile",
    "Dockerfile",
    "docker-compose.yml",
    "README.md",
    "ARCHITECTURE.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    ".env.example",
    ".eslintrc.json",
    ".eslintrc.js",
    ".prettierrc",
    "tsconfig.json",
    "jsconfig.json",
    "vite.config.js",
    "vite.config.ts",
    "webpack.config.js",
    "index.js",
    "index.ts",
    "main.js",
    "main.ts",
    "app.py",
    "main.py",
    "src/index.js",
    "src/index.ts",
    "src/main.js",
    "src/main.ts",
    "src/app.js",
    "src/app.ts",
    "src/main.py",
    "src/app.py",
  ];

  lines.push("## Key Files");
  for (const rel of KEY_FILES) {
    const full = path.resolve(cwd, rel);
    if (!fs.existsSync(full)) continue;
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      let content = fs.readFileSync(full, "utf8");
      if (content.length > MAX_FILE_PREVIEW) {
        content = content.slice(0, MAX_FILE_PREVIEW) + "\n... [truncated]";
      }
      lines.push(`### ${rel}`);
      lines.push("```");
      lines.push(content);
      lines.push("```");
      lines.push("");
    } catch { /* skip */ }
  }

  // --- Existing MEOW.md / AGENTS.md ---
  for (const extra of ["MEOW.md", "AGENTS.md"]) {
    const full = path.resolve(cwd, extra);
    if (!fs.existsSync(full)) continue;
    try {
      let content = fs.readFileSync(full, "utf8");
      if (content.length > MAX_FILE_PREVIEW) content = content.slice(0, MAX_FILE_PREVIEW) + "\n... [truncated]";
      lines.push(`### ${extra} (existing)`);
      lines.push("```");
      lines.push(content);
      lines.push("```");
      lines.push("");
    } catch { /* skip */ }
  }

  const result = lines.join("\n");
  if (result.length > MAX_PROMPT_CHARS) {
    return result.slice(0, MAX_PROMPT_CHARS) + "\n\n... [snapshot truncated due to size]";
  }
  return result;
}

/**
 * Calls the AI to generate project.meow and MEOW.md contents.
 * @param {string} snapshot - Project snapshot text.
 * @param {Object} cfg - App configuration.
 * @returns {Promise<{projectMeow: string, meowMd: string}>}
 */
async function generateInitFiles(snapshot, cfg) {
  const systemPrompt = `You are a Lead Software Architect and Senior Developer.
Your task is to analyze a project and produce two files that help AI assistants understand it quickly and act as an expert Lead Developer.

You MUST respond with EXACTLY this format — no extra text before or after:

===PROJECT.MEOW===
<content of project.meow here>
===MEOW.MD===
<content of MEOW.md here>
===END===`;

  const userPrompt = `Analyze this project and generate:

1. **project.meow** — A structured project index and Lead Dev context that lets an AI assistant instantly understand:
   - Project name, type, and high-level purpose.
   - Core Architecture & Design Patterns (Lead-Dev level).
   - Tech stack and primary dependencies.
   - Directory structure with explanations of key folders/files.
   - Main entry points and application lifecycle.
   - Key modules/components and their responsibilities.
   - Build, run, test, and deployment commands.
   - Coding standards and best practices used in this project.
   - Environment variables and configuration overview.
   - Future roadmap or areas of improvement (if inferable).

2. **MEOW.md** — Agent Instructions with Lead-Dev persona:
   - Project overview (concise).
   - Lead-Dev Context: How to think about this project's architecture and growth.
   - Coding conventions & style (specific to this repo).
   - Step-by-step Build/Test/Run guide.
   - Critical files and "do not touch" areas.
   - Strategic Rules for the AI assistant (Lead-Dev level guidance).
   - Known limitations and technical debt.

Here is the project data:

${snapshot}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const data = await callApi(messages, cfg, { temperature: 0.3 });
  const raw = data?.choices?.[0]?.message?.content?.trim() || "";

  // Parse the structured response
  const projectMeowMatch = raw.match(/===PROJECT\.MEOW===\n([\s\S]*?)===MEOW\.MD===/);
  const meowMdMatch = raw.match(/===MEOW\.MD===\n([\s\S]*?)===END===/);

  const projectMeow = projectMeowMatch ? projectMeowMatch[1].trim() : raw;
  const meowMd = meowMdMatch ? meowMdMatch[1].trim() : "";

  return { projectMeow, meowMd };
}

/**
 * Handles the /init command.
 * Generates project.meow (project index) and MEOW.md (agent instructions).
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleInit = async (ctx, input) => {
  if (input !== "/init" && !input.startsWith("/init ")) return null;

  const cwd = process.cwd();
  const projectMeowPath = path.resolve(cwd, PROJECT_MEOW);
  const meowMdPath = path.resolve(cwd, LOCAL_MEOW_MD);

  const args = input.split(/\s+/).slice(1);
  const forceOverwrite = args.includes("--force") || args.includes("-f");

  // Check if files already exist
  const projectMeowExists = fs.existsSync(projectMeowPath);
  const meowMdExists = fs.existsSync(meowMdPath);

  if ((projectMeowExists || meowMdExists) && !forceOverwrite) {
    console.log("");
    console.log(`  ${ACCENT}${C.bold}◆ /init${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
    if (projectMeowExists) {
      console.log(`  ${WARNING("⚠")} ${TEXT(PROJECT_MEOW)} ${MUTED("already exists")}${C.reset}`);
    }
    if (meowMdExists) {
      console.log(`  ${WARNING("⚠")} ${TEXT(LOCAL_MEOW_MD)} ${MUTED("already exists")}${C.reset}`);
    }
    console.log(`  ${MUTED}Use ${TEXT("/init --force")}${MUTED} to overwrite.${C.reset}`);
    console.log("");
    return { handled: true };
  }

  if (!ctx.cfg.api_key) {
    log.err("API key not set. Use /key sk-... to set it.");
    return { handled: true };
  }

  console.log("");
  console.log(`  ${ACCENT}${C.bold}◆ Initializing project index...${C.reset}`);
  console.log(`  ${MUTED}Scanning: ${TEXT_DIM(cwd)}${C.reset}`);
  console.log("");

  // Step 1: Collect snapshot
  const scanSpinner = new Spinner("Scanning project files");
  scanSpinner.start();
  let snapshot;
  try {
    snapshot = collectProjectSnapshot(cwd);
  } finally {
    scanSpinner.stop("Project scanned");
  }

  const fileCount = (snapshot.match(/^###\s/gm) || []).length;
  console.log(`  ${MUTED}Found ${TEXT(String(fileCount))} key files, ${TEXT(String(Math.ceil(snapshot.length / 3.5)))} tokens of context${C.reset}`);
  console.log("");

  // Step 2: Generate with AI
  const genSpinner = new Spinner("Generating project index with AI");
  genSpinner.start();
  let projectMeow, meowMd;
  try {
    ({ projectMeow, meowMd } = await generateInitFiles(snapshot, ctx.cfg));
    genSpinner.stop("AI generation complete");
  } catch (e) {
    genSpinner.stop();
    log.err(`AI generation failed: ${e.message}`);
    return { handled: true };
  }

  // Step 3: Write project.meow
  try {
    const header = `# project.meow — Project Index\n# Generated by Meow CLI /init on ${new Date().toISOString()}\n# This file helps AI assistants understand your project without re-reading everything.\n# Run /init --force to regenerate.\n\n`;
    fs.writeFileSync(projectMeowPath, header + projectMeow, "utf8");
    log.ok(`Created ${PROJECT_MEOW} (${(header + projectMeow).length} bytes)`);
  } catch (e) {
    log.err(`Failed to write ${PROJECT_MEOW}: ${e.message}`);
  }

  // Step 4: Write MEOW.md (only if it doesn't exist or --force)
  if (meowMd) {
    try {
      const meowHeader = `# MEOW.md — Agent Instructions\n# Generated by Meow CLI /init on ${new Date().toISOString()}\n# Edit this file to customize AI behavior for your project.\n\n`;
      const fullMeowMd = meowHeader + meowMd;
      fs.writeFileSync(meowMdPath, fullMeowMd, "utf8");
      log.ok(`Created ${LOCAL_MEOW_MD} (${fullMeowMd.length} bytes)`);

      // Reload context into system prompt
      const contextParts = loadProjectContext();
      const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
      ctx.messages[0] = { role: "system", content: buildSystemPrompt(basePrompt, contextParts) };
      log.ok("Context reloaded into system prompt");
    } catch (e) {
      log.err(`Failed to write ${LOCAL_MEOW_MD}: ${e.message}`);
    }
  } else {
    log.warn("AI did not generate MEOW.md content — skipped");
  }

  // Summary
  console.log("");
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  console.log(`  ${SUCCESS("✔")} ${C.bold}${TEXT("Initialization complete!")}${C.reset}`);
  console.log("");
  console.log(`  ${MUTED}Files created:${C.reset}`);
  if (fs.existsSync(projectMeowPath)) {
    const sz = fs.statSync(projectMeowPath).size;
    console.log(`    ${ACCENT("📄")} ${TEXT(PROJECT_MEOW)} ${MUTED(`(${sz} bytes)`)}${C.reset}`);
    console.log(`       ${TEXT_DIM("Project index — load with /context or reference in prompts")}${C.reset}`);
  }
  if (fs.existsSync(meowMdPath)) {
    const sz = fs.statSync(meowMdPath).size;
    console.log(`    ${ACCENT("📋")} ${TEXT(LOCAL_MEOW_MD)} ${MUTED(`(${sz} bytes)`)}${C.reset}`);
    console.log(`       ${TEXT_DIM("Agent instructions — auto-loaded into every session")}${C.reset}`);
  }
  console.log("");
  console.log(`  ${MUTED}Tips:${C.reset}`);
  console.log(`    ${TEXT_DIM("• Edit MEOW.md to customize AI rules for this project")}${C.reset}`);
  console.log(`    ${TEXT_DIM("• Reference project.meow in prompts: \"see project.meow for architecture\"")}${C.reset}`);
  console.log(`    ${TEXT_DIM("• Run /init --force to regenerate both files")}${C.reset}`);
  console.log(`    ${TEXT_DIM("• Use /context show to verify context is loaded")}${C.reset}`);
  console.log(`    ${TEXT_DIM("• Run /index rebuild to create a file index for fast search")}${C.reset}`);
  console.log("");

  // Auto-run index rebuild (in background, non-blocking for UX)
  try {
    const { rebuildIndex } = await import("../project-index.js");
    console.log(`  ${MUTED}Auto-indexing project files...${C.reset}`);
    const idxResult = await rebuildIndex(cwd);
    if (idxResult.ok) {
      console.log(`  ${TEXT_DIM}  ${idxResult.files} files indexed (${idxResult.elapsed})${C.reset}`);
    }
    console.log("");
  } catch {
    // Index module not available or failed — non-critical
    console.log(`  ${TEXT_DIM}  (skip indexing — use /index rebuild manually)${C.reset}`);
    console.log("");
  }

  return { handled: true };
};

export { handleInit, PROJECT_MEOW };
