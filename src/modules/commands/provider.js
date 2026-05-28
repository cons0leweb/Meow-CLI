import { select, text, password, isCancel } from "@clack/prompts";
import { log, saveConfig, SUCCESS, C, ACCENT, MUTED } from "../../core.js";
import { handleAuth } from "./auth.js";

/**
 * Shows an interactive submenu for managing custom values of a specific provider.
 * @param {Object} ctx - CLI context.
 * @param {string} providerId - Provider ID to manage.
 */
async function manageCustomValues(ctx, providerId) {
  const providers = ctx.cfg.providers;
  const provider = providers[providerId];
  if (!provider) {
    log.err(`Provider '${providerId}' not found.`);
    return;
  }

  // Initialize custom_values structure if not present
  if (!provider.custom_values) {
    provider.custom_values = {
      headers: {},
      body_params: {},
      query_params: {}
    };
  }

  while (true) {
    const cv = provider.custom_values;
    const headerCount = Object.keys(cv.headers || {}).length;
    const bodyParamCount = Object.keys(cv.body_params || {}).length;
    const queryParamCount = Object.keys(cv.query_params || {}).length;
    const totalCustomValues = headerCount + bodyParamCount + queryParamCount;

    const action = await select({
      message: `⚙️ Custom Values for "${ACCENT}${providerId}${C.reset}"`,
      options: [
        { value: "view", label: "📋 View All Custom Values", hint: totalCustomValues > 0 ? `${totalCustomValues} configured` : "none configured" },
        { value: "headers", label: "📌 Custom Headers", hint: headerCount > 0 ? `${headerCount} set` : "empty" },
        { value: "body_params", label: "📦 Custom Body Parameters", hint: bodyParamCount > 0 ? `${bodyParamCount} set` : "empty" },
        { value: "query_params", label: "🔗 Custom Query Parameters", hint: queryParamCount > 0 ? `${queryParamCount} set` : "empty" },
        { value: "clear", label: "🗑️ Clear All Custom Values", hint: totalCustomValues > 0 ? `remove ${totalCustomValues} values` : "nothing to clear" },
        { value: "back", label: "🔙 Back to Provider Menu" }
      ]
    });

    if (isCancel(action) || action === "back") break;

    if (action === "view") {
      printCustomValues(providerId, cv, provider);
      continue;
    }

    if (action === "clear") {
      provider.custom_values = { headers: {}, body_params: {}, query_params: {} };
      saveConfig(ctx.cfg);
      log.ok(`All custom values cleared for provider "${ACCENT}${providerId}${C.reset}"`);
      continue;
    }

    // Handle specific category: headers, body_params, query_params
    await manageCustomValueCategory(ctx, providerId, action, cv);
  }
}

/**
 * Prints all custom values for a provider in a readable format.
 */
function printCustomValues(providerId, cv, provider) {
  const hasAny = Object.values(cv).some(obj => Object.keys(obj).length > 0);
  if (!hasAny) {
    log.info(`No custom values configured for provider "${ACCENT}${providerId}${C.reset}"`);
    return;
  }

  log.section(`Custom Values for ${providerId} (${provider.base_url})`);

  if (Object.keys(cv.headers || {}).length > 0) {
    console.log(`  ${ACCENT.bold("📌 Headers:")}${C.reset}`);
    for (const [key, value] of Object.entries(cv.headers)) {
      console.log(`    ${MUTED("•")} ${key}: ${MUTED(value.length > 40 ? value.slice(0, 37) + "..." : value)}`);
    }
  }

  if (Object.keys(cv.body_params || {}).length > 0) {
    console.log(`  ${ACCENT.bold("📦 Body Parameters:")}${C.reset}`);
    for (const [key, value] of Object.entries(cv.body_params)) {
      const valStr = typeof value === "string" ? value : JSON.stringify(value);
      console.log(`    ${MUTED("•")} ${key}: ${MUTED(valStr.length > 40 ? valStr.slice(0, 37) + "..." : valStr)}`);
    }
  }

  if (Object.keys(cv.query_params || {}).length > 0) {
    console.log(`  ${ACCENT.bold("🔗 Query Parameters:")}${C.reset}`);
    for (const [key, value] of Object.entries(cv.query_params)) {
      console.log(`    ${MUTED("•")} ${key}=${MUTED(value)}`);
    }
  }
}

/**
 * Manages a specific category of custom values (headers, body_params, query_params).
 * @param {Object} ctx - CLI context.
 * @param {string} providerId - Provider ID.
 * @param {string} category - 'headers', 'body_params', or 'query_params'.
 * @param {Object} cv - The custom_values object { headers, body_params, query_params }
 */
async function manageCustomValueCategory(ctx, providerId, category, cv) {
  const labels = {
    headers: { name: "Header", icon: "📌" },
    body_params: { name: "Body Parameter", icon: "📦" },
    query_params: { name: "Query Parameter", icon: "🔗" }
  };
  const info = labels[category];
  const target = cv[category] || {};
  const entries = Object.entries(target);

  while (true) {
    const options = [
      { value: "add", label: `➕ Add ${info.name}`, hint: `New ${category.slice(0, -1)}` }
    ];

    // Add existing entries as selectable items for editing/deletion
    for (const [key, value] of entries) {
      const valStr = typeof value === "string" ? value : JSON.stringify(value);
      const preview = valStr.length > 35 ? valStr.slice(0, 32) + "..." : valStr;
      options.push({ 
        value: `edit:${key}`, 
        label: `✏️  ${key}`, 
        hint: preview
      });
    }

    if (entries.length > 0) {
      options.push({ value: "clear_category", label: `🗑️ Clear All ${info.name}s`, hint: `Remove ${entries.length} entries` });
    }
    options.push({ value: "back", label: "🔙 Back" });

    const action = await select({
      message: `${info.icon} ${info.name}s for "${ACCENT}${providerId}${C.reset}"`,
      options: options
    });

    if (isCancel(action) || action === "back") break;

    if (action === "add") {
      const key = await text({
        message: `${info.name} Name`,
        validate: (v) => {
          if (!v) return "Name is required";
          if (category === "headers" && !/^[a-zA-Z0-9_-]+$/i.test(v.replace(/-/g, ''))) {
            // Headers can have hyphens, so just check not empty
          }
          if (target[v] !== undefined) return `Key "${v}" already exists`;
        }
      });
      if (isCancel(key)) continue;

      let value;
      if (category === "body_params") {
        value = await text({
          message: `${info.name} Value (supports JSON: true, false, null, numbers, arrays, objects)`,
          placeholder: "Enter value...",
          validate: (v) => v ? undefined : "Value is required"
        });
      } else {
        value = await text({
          message: `${info.name} Value`,
          validate: (v) => v ? undefined : "Value is required"
        });
      }
      if (isCancel(value)) continue;

      target[key] = value;
      cv[category] = target;
      saveConfig(ctx.cfg);
      log.ok(`${info.name} "${ACCENT}${key}${C.reset}" added`);
    }

    if (action && action.startsWith("edit:")) {
      const editKey = action.slice(5);
      const editAction = await select({
        message: `${info.name}: "${ACCENT}${editKey}${C.reset}" = ${MUTED(target[editKey])}`,
        options: [
          { value: "remove", label: "❌ Remove", hint: `Delete "${editKey}"` },
          { value: "change", label: "✏️ Change Value", hint: "Set new value" },
          { value: "back", label: "🔙 Back" }
        ]
      });

      if (isCancel(editAction) || editAction === "back") continue;

      if (editAction === "remove") {
        delete target[editKey];
        cv[category] = target;
        saveConfig(ctx.cfg);
        log.ok(`${info.name} "${ACCENT}${editKey}${C.reset}" removed`);
      }

      if (editAction === "change") {
        let newValue;
        if (category === "body_params") {
          newValue = await text({
            message: `New value for "${editKey}"`,
            placeholder: "Enter new value...",
            defaultValue: String(target[editKey]),
            validate: (v) => v ? undefined : "Value is required"
          });
        } else {
          newValue = await text({
            message: `New value for "${editKey}"`,
            placeholder: "Enter new value...",
            defaultValue: String(target[editKey]),
            validate: (v) => v ? undefined : "Value is required"
          });
        }
        if (isCancel(newValue)) continue;

        target[editKey] = newValue;
        cv[category] = target;
        saveConfig(ctx.cfg);
        log.ok(`${info.name} "${ACCENT}${editKey}${C.reset}" updated`);
      }
    }

    if (action === "clear_category") {
      cv[category] = {};
      saveConfig(ctx.cfg);
      log.ok(`All ${info.name}s cleared for "${ACCENT}${providerId}${C.reset}"`);
    }
  }
}

/**
 * Shows actions for a selected provider (switch, configure custom values, etc).
 * @param {Object} ctx - CLI context.
 * @param {string} providerId - Provider ID.
 * @returns {Promise<boolean>} Whether the user switched to this provider.
 */
async function handleProviderAction(ctx, providerId) {
  const providers = ctx.cfg.providers;
  const p = providers[providerId];
  if (!p) return false;

  const active = ctx.cfg.active_provider;
  const isActive = providerId === active;

  const action = await select({
    message: `Provider: "${ACCENT}${providerId}${C.reset}"`,
    options: [
      { value: "switch", label: isActive ? "✅ Already Active" : "🔌 Switch to This Provider", hint: p.base_url },
      { value: "custom", label: "⚙️ Configure Custom Values", hint: "Headers, body params, query params" },
      { value: "edit", label: "✏️ Edit Provider Settings", hint: "Change URL, API key, model" },
      { value: "back", label: "🔙 Back to Provider List" }
    ]
  });

  if (isCancel(action) || action === "back") return false;

  if (action === "switch" && !isActive) {
    ctx.cfg.active_provider = providerId;
    ctx.cfg.api_base = p.base_url;
    ctx.cfg.api_key = p.api_key;
    if (p.model) ctx.cfg.model = p.model;
    saveConfig(ctx.cfg);
    log.ok(`Switched to provider: ${ACCENT}${providerId}${C.reset}`);
    log.dim(`URL: ${p.base_url}`);
    log.dim(`Model: ${ctx.cfg.model}`);
    return true;
  }

  if (action === "edit") {
    await editProviderSettings(ctx, providerId);
    return false;
  }

  if (action === "custom") {
    await manageCustomValues(ctx, providerId);
    // Refresh the display after managing custom values
    return false;
  }

  return false;
}

/**
 * Edits the basic settings of a provider.
 */
async function editProviderSettings(ctx, providerId) {
  const p = ctx.cfg.providers[providerId];
  if (!p) return;

  while (true) {
    const action = await select({
      message: `✏️ Edit "${ACCENT}${providerId}${C.reset}"`,
      options: [
        { value: "base_url", label: "Base URL", hint: p.base_url },
        { value: "api_key", label: "API Key", hint: p.api_key ? p.api_key.slice(0, 8) + "..." : "(not set)" },
        { value: "model", label: "Default Model", hint: p.model || "(not set)" },
        { value: "back", label: "🔙 Back" }
      ]
    });

    if (isCancel(action) || action === "back") break;

    if (action === "base_url") {
      const newUrl = await text({
        message: "Base URL",
        placeholder: "https://api.openai.com/v1",
        defaultValue: p.base_url
      });
      if (!isCancel(newUrl) && newUrl) {
        p.base_url = newUrl;
        saveConfig(ctx.cfg);
        log.ok(`Base URL updated for "${ACCENT}${providerId}${C.reset}"`);
      }
    }

    if (action === "api_key") {
      const newKey = await password({
        message: "API Key"
      });
      if (!isCancel(newKey) && newKey) {
        p.api_key = newKey;
        saveConfig(ctx.cfg);
        log.ok(`API Key updated for "${ACCENT}${providerId}${C.reset}"`);
      }
    }

    if (action === "model") {
      const newModel = await text({
        message: "Default Model",
        placeholder: "gpt-4-turbo",
        defaultValue: p.model
      });
      if (!isCancel(newModel) && newModel) {
        p.model = newModel;
        saveConfig(ctx.cfg);
        log.ok(`Default model updated for "${ACCENT}${providerId}${C.reset}"`);
      }
    }
  }
}

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

  while (true) {
    const options = Object.keys(providers).map(id => ({
      value: id,
      label: id,
      hint: `${id === active ? SUCCESS(" (active)") : ""} ${providers[id].base_url}`
    }));

    options.push({ value: "add", label: "➕ Add New Provider", hint: "Configure a new API endpoint" });
    if (Object.keys(providers).length > 0) {
      options.push({ value: "delete", label: "❌ Delete Provider", hint: "Remove an existing configuration" });
    }
    options.push({ value: "exit", label: "🚪 Exit", hint: "Return to chat" });

    const choice = await select({
      message: "Manage API Providers",
      options: options
    });

    if (isCancel(choice) || choice === "exit") break;

    if (choice === "login_meow") {
      await handleAuth(ctx, "/login");
      continue;
    }

    if (choice === "add") {
      await addNewProvider(ctx, providers);
      continue;
    }

    if (choice === "delete") {
      const toDelete = await select({
        message: "Select provider to delete",
        options: Object.keys(providers).map(id => ({ value: id, label: id }))
      });

      if (isCancel(toDelete)) continue;

      delete providers[toDelete];
      if (ctx.cfg.active_provider === toDelete) {
        ctx.cfg.active_provider = "";
      }
      saveConfig(ctx.cfg);
      log.ok(`Provider "${toDelete}" deleted.`);
      continue;
    }

    // Selected a provider - show action menu
    await handleProviderAction(ctx, choice);
  }

  return { handled: true };
};

/**
 * Adds a new provider with interactive prompts.
 */
async function addNewProvider(ctx, providers) {
  const id = await text({
    message: "Provider Name (e.g., 'deepseek', 'openrouter')",
    validate: (v) => {
      if (!v) return "Name is required";
      if (providers[v]) return "Provider already exists";
      if (v === "add" || v === "delete" || v === "exit") return "Reserved name";
    }
  });
  if (isCancel(id)) return;

  const baseUrl = await text({
    message: "Base URL",
    placeholder: "https://api.openai.com/v1",
    defaultValue: "https://api.openai.com/v1"
  });
  if (isCancel(baseUrl)) return;

  const apiKey = await password({
    message: "API Key"
  });
  if (isCancel(apiKey)) return;

  const model = await text({
    message: "Default Model",
    placeholder: "gpt-4-turbo",
    defaultValue: "gpt-4-turbo"
  });
  if (isCancel(model)) return;

  providers[id] = {
    base_url: baseUrl,
    api_key: apiKey,
    model: model,
    custom_values: {
      headers: {},
      body_params: {},
      query_params: {}
    }
  };

  // Ask if user wants to configure custom values now
  const configureNow = await select({
    message: `Configure custom values for "${id}"?`,
    options: [
      { value: true, label: "Yes, configure now" },
      { value: false, label: "No, skip for now" }
    ]
  });

  if (configureNow === true) {
    await manageCustomValues(ctx, id);
  }

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
}

export { manageCustomValues, printCustomValues };