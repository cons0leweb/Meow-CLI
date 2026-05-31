import { execSync } from "child_process";
import {
  log, C, MUTED,
  printContext, editContext, buildSystemPrompt, loadProjectContext,
} from "../../core.js";

/**
 * Handles the /context command for managing project-specific AI instructions (MEOW.md).
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleContext = async (ctx, input) => {
  if (!input.startsWith("/context")) return null;

  const parts = input.split(/\s+/);
  const cmd = parts[1] || "";

  if (!cmd || cmd === "show") {
    await printContext();
    return { handled: true };
  }

  if (cmd === "edit") {
    const { editor, path: filePath } = editContext(parts[2] || null);
    log.info(`Opening ${filePath} in ${editor}...`);
    try {
      execSync(`${editor} ${JSON.stringify(filePath)}`, { stdio: "inherit" });
      const contextParts = loadProjectContext();
      const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
      ctx.messages[0] = { role: "system", content: buildSystemPrompt(basePrompt, contextParts) };
      log.ok("Context reloaded into system prompt");
    } catch (e) {
      log.err(`Editor failed: ${e.message}`);
      log.dim(`You can manually edit: ${filePath}`);
    }
    return { handled: true };
  }

  if (cmd === "reload") {
    const contextParts = loadProjectContext();
    const basePrompt = ctx.cfg.profiles[ctx.cfg.profile]?.system || "";
    ctx.messages[0] = { role: "system", content: buildSystemPrompt(basePrompt, contextParts) };
    const totalChars = contextParts.reduce((sum, p) => sum + p.content.length, 0);
    log.ok(`Context reloaded (${contextParts.length} files, ~${Math.ceil(totalChars / 3.5)} tokens)`);
    return { handled: true };
  }

  log.err("Usage: /context [show|edit|reload]");
  return { handled: true };
};

export { handleContext };
