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

  if (input === "/schema" || input.startsWith("/schema ")) {
    const parts = input.split(/\s+/);
    const sub = parts[1];

    // /schema — общая информация
    if (!sub) {
      try {
        const schema = getSchema();
        console.log("");
        console.log(`  ${ACCENT}${C.bold}◆ API Schema${C.reset}`);
        console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
        console.log(`  ${TEXT}Title:${C.reset}   ${TEXT_DIM}${schema.title || "—"}${C.reset}`);
        console.log(`  ${TEXT}Version:${C.reset}  ${TEXT_DIM}${schema.version || "—"}${C.reset}`);
        console.log(`  ${TEXT}Modules:${C.reset}  ${TEXT_DIM}${listModules().length}${C.reset}`);
        const definitions = schema.definitions ? Object.keys(schema.definitions).length : 0;
        console.log(`  ${TEXT}Types:${C.reset}    ${TEXT_DIM}${definitions}${C.reset}`);
        if (schema.info) {
          console.log(`  ${TEXT}Purpose:${C.reset} ${TEXT_DIM}${schema.info.purpose || "—"}${C.reset}`);
          console.log(`  ${TEXT}Transport:${C.reset} ${TEXT_DIM}${schema.info.transport || "—"}${C.reset}`);
          console.log(`  ${TEXT}Base URL:${C.reset} ${TEXT_DIM}${schema.info.base_url || "—"}${C.reset}`);
        }
        console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
        console.log(`  ${TEXT_DIM}Use /schema <module> to list methods.${C.reset}`);
        console.log(`  ${TEXT_DIM}Use /schema <module>.<method> for details.${C.reset}`);
        console.log(`  ${TEXT_DIM}Use /schema type <name> for type definition.${C.reset}`);
        console.log("");

        // Проверка версии
        try {
          const pkg = JSON.parse(fs.readFileSync(
            new URL("../../package.json", import.meta.url), "utf8"
          ));
          checkSchemaVersion(pkg.version);
        } catch {}

        return { handled: true };
      } catch (e) {
        log.err(`Schema error: ${e.message}`);
        return { handled: true };
      }
    }

    // /schema type <name>
    if (sub === "type" && parts[2]) {
      const typeName = parts[2];
      const def = getDefinition(typeName);
      if (!def) {
        log.err(`Type '${typeName}' not found in schema definitions.`);
        return { handled: true };
      }
      console.log(`\n  ${ACCENT}${C.bold}◆ Type: ${typeName}${C.reset}`);
      console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
      console.log(`  ${JSON.stringify(def, null, 2).split("\n").map(l => `  ${TEXT_DIM}${l}${C.reset}`).join("\n")}`);
      console.log("");
      return { handled: true };
    }

    // /schema <module> — список методов модуля
    const dotIdx = sub.indexOf(".");
    if (dotIdx === -1) {
      const mod = getModule(sub);
      if (!mod) {
        log.err(`Module '${sub}' not found. Use /schema to list all modules.`);
        return { handled: true };
      }
      const methods = listMethods(sub);
      console.log(`\n  ${ACCENT}${C.bold}◆ Module: ${sub}${C.reset}`);
      console.log(`  ${MUTED}${mod.description || ""}${C.reset}`);
      console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
      for (const m of methods) {
        console.log(`  ${TEXT}${m.name}${C.reset}`);
        if (m.description) console.log(`  ${TEXT_DIM}  ${m.description}${C.reset}`);
      }
      console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
      console.log(`  ${TEXT_DIM}Use /schema ${sub}.<method> for details.${C.reset}`);
      console.log("");
      return { handled: true };
    }

    // /schema <module>.<method> — детали метода
    const moduleName = sub.slice(0, dotIdx);
    const methodName = sub.slice(dotIdx + 1);
    const method = getMethod(moduleName, methodName);
    if (!method) {
      log.err(`Method '${sub}' not found.`);
      return { handled: true };
    }
    console.log(`\n  ${ACCENT}${C.bold}◆ ${moduleName}.${methodName}${C.reset}`);
    console.log(`  ${MUTED}${method.description || ""}${C.reset}`);
    console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);

    if (method.params && Object.keys(method.params).length > 0) {
      console.log(`  ${TEXT}Params:${C.reset}`);
      for (const [pName, pDef] of Object.entries(method.params)) {
        const type = pDef.type || "any";
        const req = pDef.required !== false ? "required" : "optional";
        const defVal = pDef.default !== undefined ? ` (default: ${pDef.default})` : "";
        const enumVal = pDef.enum ? ` [${pDef.enum.join(", ")}]` : "";
        console.log(`    ${TEXT}${pName}${C.reset} ${MUTED}(${type}, ${req}${defVal}${enumVal})${C.reset}`);
        if (pDef.description) console.log(`    ${TEXT_DIM}  ${pDef.description}${C.reset}`);
      }
    } else {
      console.log(`  ${TEXT_DIM}  No parameters${C.reset}`);
    }

    if (method.returns) {
      console.log(`  ${TEXT}Returns:${C.reset} ${TEXT_DIM}${JSON.stringify(method.returns)}${C.reset}`);
    }
    console.log("");
    return { handled: true };
  }

  return null;
};

export { handleMisc };
