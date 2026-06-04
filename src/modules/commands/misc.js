import fs from "fs";
import {
  ACCENT,
  MUTED,
  TEXT,
  TEXT_DIM,
  C,
  log,
  renderTemplate,
  parseKv,
  saveHistoryState,
  getSchema,
  getModule,
  getMethod,
  listModules,
  listMethods,
  getDefinition,
  checkSchemaVersion
} from "../../core.js";
import { getSandbox } from "../security/sandbox.js";

/**
 * Handles miscellaneous commands like /alias, /export, /import, and /template.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleMisc = async (ctx, input) => {
  const sandbox = getSandbox();
  if (input === "/alias") {
    console.log(""); console.log(`  ${ACCENT}${C.bold}◆ Aliases${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
    for (const [a, b] of Object.entries(ctx.cfg.aliases))
      console.log(`  ${TEXT}${a.padEnd(10)}${C.reset}${MUTED}→${C.reset}  ${TEXT_DIM}${b}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`); console.log("");
    return { handled: true };
  }

  if (input.startsWith("/export ")) {
    const file = input.slice(8).trim();
    if (!file) { log.err("Specify file path."); return { handled: true }; }
    const check = sandbox.isPathAllowed(file);
    if (!check.allowed) { log.err(check.reason); return { handled: true }; }
    try { fs.writeFileSync(file, JSON.stringify(ctx.historyState, null, 2)); log.ok(`History exported to ${file}`); }
    catch (e) { log.err(`Export failed: ${e.message}`); }
    return { handled: true };
  }

  if (input.startsWith("/import ")) {
    const file = input.slice(8).trim();
    if (!file) { log.err("Specify file path."); return { handled: true }; }
    const check = sandbox.isPathAllowed(file);
    if (!check.allowed) { log.err(check.reason); return { handled: true }; }
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.chats) {
        ctx.historyState = data;
        ctx.currentChat = ctx.historyState.current || "default";
        ctx.history = ctx.historyState.chats[ctx.currentChat] || [];
        ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }, ...ctx.history];
        saveHistoryState(ctx.historyState);
        log.ok(`History imported from ${file}`);
      } else { log.err("Invalid history format."); }
    } catch (e) { log.err(`Import failed: ${e.message}`); }
    return { handled: true };
  }

  if (input.startsWith("/template ")) {
    const parts = input.split(" ");
    const name = parts[1];
    const rest = parts.slice(2).join(" ");
    const params = parseKv(rest);
    const text = renderTemplate(ctx.cfg, name, params);
    if (!text) { log.err(`Template '${name}' not found.`); return { handled: true }; }
    log.info(`Using template: ${name}`);
    return { handled: true, continue: true, input: text };
  }

  return null;
};

export { handleMisc };
