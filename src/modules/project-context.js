import fs from "fs";
import path from "path";
import { GLOBAL_MEOW_MD } from "./config.js";
import { log, C, ACCENT, MUTED, TEXT, TEXT_DIM, COLS } from "./ui.js";

/** @typedef {{ source: "global" | "project", path: string, content: string }} ContextPart */

/** @type {string} Default filename for local project context */
const LOCAL_MEOW_MD = "MEOW.md";
/** @type {string} Project index filename */
const PROJECT_MEOW = "project.meow";
/** @type {RegExp} Pattern for !include directives in context files */
const INCLUDE_RE = /^!include\s+(.+)$/gm;
/** @type {number} Maximum size of a context file in characters */
const MAX_CONTEXT_SIZE = 50000;
/** @type {number} Maximum recursion depth for !include */
const MAX_INCLUDE_DEPTH = 3;

/**
 * Returns the canonical path for an existing filesystem entry.
 * Symlinks are resolved to enforce root boundaries correctly.
 *
 * @param {string} targetPath
 * @returns {string}
 */
function getRealPath(targetPath) {
  return fs.realpathSync(targetPath);
}

/**
 * Checks whether a candidate path is inside an allowed root directory.
 * Comparison is performed on canonical paths to prevent symlink escapes.
 *
 * @param {string} rootPath
 * @param {string} candidatePath
 * @returns {boolean}
 */
function isPathWithinRoot(rootPath, candidatePath) {
  const rootReal = getRealPath(rootPath);
  const candidateReal = getRealPath(candidatePath);
  const rel = path.relative(rootReal, candidateReal);

  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Recursively resolves !include directives in context files.
 *
 * @param {string} content - Raw file content.
 * @param {string} basePath - Directory of the current file.
 * @param {number} [depth=0] - Current recursion depth.
 * @param {string} [allowedRoot=basePath] - Root directory that includes must stay within.
 * @param {Set<string>} [seen=new Set()] - Canonical paths already included.
 * @returns {string} Content with inclusions resolved.
 */
function resolveIncludes(
  content,
  basePath,
  depth = 0,
  allowedRoot = basePath,
  seen = new Set(),
) {
  if (depth >= MAX_INCLUDE_DEPTH) {
    return content;
  }

  const rootReal = getRealPath(allowedRoot);

  return content.replace(INCLUDE_RE, (_match, rawIncludePath) => {
    const includePath = rawIncludePath.trim();
    const resolved = path.resolve(basePath, includePath);

    try {
      if (!fs.existsSync(resolved)) {
        return `<!-- Include not found: ${includePath} -->`;
      }

      if (!isPathWithinRoot(rootReal, resolved)) {
        return `<!-- Include blocked (outside context root): ${includePath} -->`;
      }

      const resolvedReal = getRealPath(resolved);
      if (seen.has(resolvedReal)) {
        return `<!-- Include skipped (cycle detected): ${includePath} -->`;
      }

      const included = fs.readFileSync(resolvedReal, "utf8");
      const nextSeen = new Set(seen);
      nextSeen.add(resolvedReal);

      return resolveIncludes(
        included,
        path.dirname(resolvedReal),
        depth + 1,
        rootReal,
        nextSeen,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `<!-- Include error: ${message} -->`;
    }
  });
}

/**
 * Loads and processes a context file.
 *
 * @param {string} filePath - Path to the file.
 * @returns {string|null} Processed content or null.
 */
function loadContextFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const fileReal = getRealPath(filePath);
    let content = fs.readFileSync(fileReal, "utf8").trim();
    if (!content) {
      return null;
    }

    content = resolveIncludes(
      content,
      path.dirname(fileReal),
      0,
      path.dirname(fileReal),
      new Set([fileReal]),
    );

    if (content.length > MAX_CONTEXT_SIZE) {
      content = `${content.slice(0, MAX_CONTEXT_SIZE)}\n\n... [TRUNCATED]`;
    }

    return content;
  } catch {
    return null;
  }
}

/**
 * Loads all relevant project context (global and local).
 *
 * @returns {ContextPart[]} List of context parts with source, path, and content.
 */
function loadProjectContext() {
  /** @type {ContextPart[]} */
  const parts = [];

  const globalCtx = loadContextFile(GLOBAL_MEOW_MD);
  if (globalCtx) {
    parts.push({
      source: "global",
      path: GLOBAL_MEOW_MD,
      content: globalCtx,
    });
  }

  const localPath = path.resolve(process.cwd(), LOCAL_MEOW_MD);
  const localCtx = loadContextFile(localPath);
  if (localCtx) {
    parts.push({
      source: "project",
      path: localPath,
      content: localCtx,
    });
  }

  const projectMeowPath = path.resolve(process.cwd(), PROJECT_MEOW);
  const projectMeowCtx = loadContextFile(projectMeowPath);
  if (projectMeowCtx) {
    parts.push({
      source: "project",
      path: projectMeowPath,
      content: projectMeowCtx,
    });
  }

  return parts;
}

/**
 * Builds a complete system prompt by appending project context.
 *
 * @param {string} basePrompt - Initial system prompt.
 * @param {ContextPart[] | null} [contextParts=null] - Pre-loaded context parts.
 * @returns {string} Final system prompt.
 */
function buildSystemPrompt(basePrompt, contextParts = null) {
  const parts = contextParts ?? loadProjectContext();
  if (parts.length === 0) {
    return basePrompt;
  }

  const contextBlock = parts
    .map((part) => {
      let label = "Project Context";
      if (part.source === "global") label = "Global Rules";
      if (path.basename(part.path) === "project.meow") label = "Project Index (Lead-Dev)";

      return `\n\n═══ ${label} (${part.source}: ${path.basename(part.path)}) ═══\n${part.content}`;
    })
    .join("");

  return basePrompt + contextBlock;
}

/**
 * Prints the current project context to the terminal.
 */
async function printContext() {
  const parts = loadProjectContext();

  console.log("");
  console.log(`  ${ACCENT}${C.bold}◆ Project Context${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);

  if (parts.length === 0) {
    console.log(`  ${MUTED}No MEOW.md found${C.reset}`);
    console.log(
      `  ${TEXT_DIM}Create ${path.resolve(LOCAL_MEOW_MD)} or ${GLOBAL_MEOW_MD}${C.reset}`,
    );
  } else {
    for (const part of parts) {
      const linesList = part.content.split("\n");
      const lines = linesList.length;
      const tokens = Math.ceil(part.content.length / 3.5);

      console.log(
        `  ${TEXT}${part.source}${C.reset} ${MUTED}${part.path}${C.reset}`,
      );
      console.log(`  ${TEXT_DIM}${lines} lines, ~${tokens} tokens${C.reset}`);

      for (const line of linesList.slice(0, 5)) {
        console.log(
          `  ${MUTED}┃${C.reset} ${TEXT_DIM}${line.slice(0, COLS - 8)}${C.reset}`,
        );
      }

      if (lines > 5) {
        console.log(
          `  ${MUTED}┃${C.reset} ${MUTED}… +${lines - 5} more lines${C.reset}`,
        );
      }

      console.log("");
    }
  }

  // Show index stats if available
  try {
    const { getIndexStats } = await import("./project-index.js");
    const stats = await getIndexStats(process.cwd());
    if (stats.exists) {
      console.log(`  ${TEXT_DIM}Index:${C.reset} ${ACCENT(String(stats.fileCount))} ${TEXT_DIM}files, ${stats.dbSize}${C.reset}`);
      if (stats.lastFullIndex) {
        const diff = Math.floor(Date.now() / 1000) - parseInt(stats.lastFullIndex, 10);
        const ago = diff < 3600 ? `${Math.floor(diff / 60)}m` : diff < 86400 ? `${Math.floor(diff / 3600)}h` : `${Math.floor(diff / 86400)}d`;
        console.log(`  ${TEXT_DIM}Last index:${C.reset} ${MUTED}${ago} ago${C.reset}`);
      }
    }
  } catch {
    // Module not available — skip
  }

  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  console.log(`  ${MUTED}CWD:${C.reset} ${TEXT_DIM}${process.cwd()}${C.reset}`);
  console.log("");
}

/**
 * Prepares the local context file for editing.
 *
 * @param {string|null} [editor=null] - Command to open the editor.
 * @returns {{ editor: string, path: string }} Object containing the editor command and file path.
 */
function editContext(editor = null) {
  const localPath = path.resolve(process.cwd(), LOCAL_MEOW_MD);
  const editorCmd = editor || process.env.EDITOR || process.env.VISUAL || "nano";

  if (!fs.existsSync(localPath)) {
    const template = `# Project Context for Meow CLI

## Project Description
<!-- Describe your project here -->

## Architecture
<!-- Key architecture decisions -->

## Coding Standards
<!-- Your coding conventions -->

## Important Files
<!-- Key files the AI should know about -->

## Rules
<!-- Specific rules for the AI to follow -->
`;
    fs.writeFileSync(localPath, template, "utf8");
    log.ok(`Created ${localPath}`);
  }

  return { editor: editorCmd, path: localPath };
}

export {
  loadProjectContext,
  buildSystemPrompt,
  printContext,
  editContext,
  loadContextFile,
  LOCAL_MEOW_MD,
};
