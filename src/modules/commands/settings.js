import {
  ACCENT,
  ACCENT2,
  MUTED,
  SUCCESS,
  WARNING,
  TEXT_DIM,
  C,
  log,
  saveConfig,
  printConfig,
  I18N,
  listThemes,
  isValidTheme,
  getThemeColors,
  applyTheme
} from "../../core.js";

/**
 * Handles /key, /url, /lang, /model, /profile, /temp, /git, and /config commands.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
const handleSettings = async (ctx, input) => {
  if (input.startsWith("/key ")) {
    ctx.cfg.api_key = input.split(" ")[1];
    saveConfig(ctx.cfg);
    log.ok(`API Key saved ${MUTED}(${ctx.cfg.api_key.slice(0, 8)}...)${C.reset}`);
    return { handled: true };
  }

  if (input.startsWith("/url ")) {
    ctx.cfg.api_base = input.split(" ")[1];
    saveConfig(ctx.cfg);
    log.ok(`API Base: ${ctx.cfg.api_base}`);
    return { handled: true };
  }

  if (input.startsWith("/lang")) {
    const lang = input.split(" ")[1];
    if (!lang) { log.info(`Language: ${ctx.cfg.lang}`); return { handled: true }; }
    if (!I18N[lang]) { log.err("Supported: ru, en"); return { handled: true }; }
    ctx.cfg.lang = lang;
    saveConfig(ctx.cfg);
    log.ok(`Language → ${lang}`);
    ctx.refreshBanner();
    return { handled: true };
  }

  if (input.startsWith("/model")) {
    const m = input.split(" ")[1];
    if (m) { ctx.cfg.model = m; saveConfig(ctx.cfg); log.ok(`Model → ${ACCENT}${m}${C.reset}`); }
    else { log.info(`Current model: ${ACCENT}${ctx.cfg.model}${C.reset}`); }
    return { handled: true };
  }

  if (input.startsWith("/profile")) {
    const p = input.split(" ")[1];
    if (!p) {
      log.info(`Current profile: ${ACCENT2}${ctx.cfg.profile}${C.reset}`);
      const available = Object.keys(ctx.cfg.profiles).map(name => {
        const isCurrent = name === ctx.cfg.profile;
        return isCurrent ? `${SUCCESS}${C.bold}${name}${C.reset}` : `${TEXT_DIM}${name}${C.reset}`;
      }).join("  ");
      console.log(`  ${MUTED}Available:${C.reset} ${available}`);
    } else if (ctx.cfg.profiles[p]) {
      ctx.cfg.profile = p; saveConfig(ctx.cfg);
      ctx.messages[0] = { role: "system", content: ctx.cfg.profiles[p].system };
      log.ok(`Profile → ${ACCENT2}${p}${C.reset}`);
    } else { log.err(`Profile '${p}' not found.`); }
    return { handled: true };
  }

  if (input.startsWith("/temp")) {
    const val = parseFloat(input.split(" ")[1]);
    if (!isNaN(val) && val >= 0 && val <= 2) {
      const p = ctx.cfg.profiles[ctx.cfg.profile] || ctx.cfg.profiles.default;
      p.temperature = val; saveConfig(ctx.cfg);
      log.ok(`Temperature → ${WARNING}${val}${C.reset}`);
    } else if (input.trim() === "/temp") {
      const p = ctx.cfg.profiles[ctx.cfg.profile] || ctx.cfg.profiles.default;
      log.info(`Current temperature: ${WARNING}${p.temperature}${C.reset}`);
    } else { log.err("Value must be 0.0 – 2.0"); }
    return { handled: true };
  }

  if (input.startsWith("/git")) {
    const parts = input.split(" ").map(p => p.trim()).filter(Boolean);
    const arg = (parts[1] || "").toLowerCase();

    if (!arg) {
      const status = ctx.cfg.git?.autocommit === false ? "off" : "on";
      const prefix = typeof ctx.cfg.git?.prefix === "string" && ctx.cfg.git.prefix.trim()
        ? ctx.cfg.git.prefix.trim()
        : "(none)";
      const aiMsg = ctx.cfg.git?.ai_message === false ? "off" : "on";
      log.info(`Git auto-commit: ${status}`);
      log.info(`Git commit prefix: ${prefix}`);
      log.info(`Git AI commit message: ${aiMsg}`);
      return { handled: true };
    }

    if (arg === "on" || arg === "off") {
      ctx.cfg.git = ctx.cfg.git || {};
      ctx.cfg.git.autocommit = arg === "on";
      saveConfig(ctx.cfg);
      log.ok(`Git auto-commit → ${arg}`);
      return { handled: true };
    }

    if (arg === "prefix") {
      const prefix = parts.slice(2).join(" ");
      ctx.cfg.git = ctx.cfg.git || {};
      ctx.cfg.git.prefix = prefix;
      saveConfig(ctx.cfg);
      const shown = prefix && prefix.trim() ? prefix.trim() : "(none)";
      log.ok(`Git commit prefix → ${shown}`);
      return { handled: true };
    }

    if (arg === "ai") {
      const mode = (parts[2] || "").toLowerCase();
      if (mode !== "on" && mode !== "off") {
        log.err("Usage: /git ai [on|off]");
        return { handled: true };
      }
      ctx.cfg.git = ctx.cfg.git || {};
      ctx.cfg.git.ai_message = mode === "on";
      saveConfig(ctx.cfg);
      log.ok(`Git AI commit message → ${mode}`);
      return { handled: true };
    }

    log.err("Usage: /git [on|off] | /git prefix <value> | /git ai [on|off]");
    return { handled: true };
  }

  if (input === "/config") { printConfig(ctx.cfg); return { handled: true }; }
  if (input === "/saveconfig") { saveConfig(ctx.cfg); log.ok("Config saved to ~/.meowcli/data/config.json"); return { handled: true }; }

  return null;
};

export { handleSettings };
