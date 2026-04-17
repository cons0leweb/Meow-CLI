import { select, text, password, isCancel } from "@clack/prompts";
import { log, saveConfig, SUCCESS, C, ACCENT, MUTED } from "../../core.js";
import { handleAuth } from "./auth.js";

/**
 * Handles /provider command to manage API profiles.
 * @param {Object} ctx - CLI context.
 * @param {string} input - User input.
 * @returns {Promise<Object|null>}
 */
export const handleProvider = async (ctx, input) => {
  if (input !== "/provider" && !input.startsWith("/provider ")) return null;

  // Initialize providers if not exists
  ctx.cfg.providers = ctx.cfg.providers || {};
  
  const providers = ctx.cfg.providers;
  const active = ctx.cfg.active_provider;

  // Add current as 'default' if it's not in providers and has a key
  if (Object.keys(providers).length === 0 && ctx.cfg.api_key) {
    providers["default"] = {
      base_url: ctx.cfg.api_base,
      api_key: ctx.cfg.api_key,
      model: ctx.cfg.model
    };
    if (!ctx.cfg.active_provider) {
      ctx.cfg.active_provider = "default";
    }
  }

  const options = Object.keys(providers).map(id => ({
    value: id,
    label: id,
    hint: `${id === active ? SUCCESS(" (active)") : ""} ${providers[id].base_url}`
  }));

  options.push({ value: "add", label: "➕ Add New Provider", hint: "Configure a new API endpoint" });
  options.push({ value: "login_meow", label: "🔐 Login with MeowCube", hint: "Connect to meowcube.space" });
  if (Object.keys(providers).length > 0) {
    options.push({ value: "delete", label: "❌ Delete Provider", hint: "Remove an existing configuration" });
  }

  const choice = await select({
    message: "Manage API Providers",
    options: options
  });

  if (isCancel(choice)) {
    return { handled: true };
  }

  if (choice === "login_meow") {
    return await handleAuth(ctx, "/login");
  }

  if (choice === "add") {
    const id = await text({
      message: "Provider Name (e.g., 'deepseek', 'openrouter')",
      validate: (v) => {
        if (!v) return "Name is required";
        if (providers[v]) return "Provider already exists";
        if (v === "add" || v === "delete") return "Reserved name";
      }
    });
    if (isCancel(id)) return { handled: true };

    const baseUrl = await text({
      message: "Base URL",
      placeholder: "https://api.openai.com/v1",
      defaultValue: "https://api.openai.com/v1"
    });
    if (isCancel(baseUrl)) return { handled: true };

    const apiKey = await password({
      message: "API Key"
    });
    if (isCancel(apiKey)) return { handled: true };

    const model = await text({
      message: "Default Model",
      placeholder: "gpt-4-turbo",
      defaultValue: "gpt-4-turbo"
    });
    if (isCancel(model)) return { handled: true };

    providers[id] = {
      base_url: baseUrl,
      api_key: apiKey,
      model: model
    };

    const useNow = await select({
      message: "Switch to this provider now?",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" }
      ]
    });

    if (useNow === true) {
      ctx.cfg.active_provider = id;
      ctx.cfg.api_base = baseUrl;
      ctx.cfg.api_key = apiKey;
      ctx.cfg.model = model;
      log.ok(`Switched to provider: ${ACCENT}${id}${C.reset}`);
    }

    saveConfig(ctx.cfg);
    log.ok(`Provider ${ACCENT}${id}${C.reset} added.`);
    return { handled: true };
  }

  if (choice === "delete") {
    const toDelete = await select({
      message: "Select provider to delete",
      options: Object.keys(providers).map(id => ({ value: id, label: id }))
    });

    if (isCancel(toDelete)) return { handled: true };

    delete providers[toDelete];
    if (ctx.cfg.active_provider === toDelete) {
      ctx.cfg.active_provider = "";
    }
    saveConfig(ctx.cfg);
    log.ok(`Provider ${toDelete} deleted.`);
    return { handled: true };
  }

  // Switch to selected provider
  const p = providers[choice];
  ctx.cfg.active_provider = choice;
  ctx.cfg.api_base = p.base_url;
  ctx.cfg.api_key = p.api_key;
  if (p.model) ctx.cfg.model = p.model;

  saveConfig(ctx.cfg);
  log.ok(`Switched to provider: ${ACCENT}${choice}${C.reset}`);
  log.dim(`URL: ${p.base_url}`);
  log.dim(`Model: ${ctx.cfg.model}`);

  return { handled: true };
};
