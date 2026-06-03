import fs from "fs";
import path from "path";
import { log } from "./ui.js";
import { ASSIST_DIR, CONF_FILE, CONF_FILE_ENC, HIST_FILE, PIN_FILE, UNDO_FILE, LOG_DIR, LEGACY_CONF_FILE, LEGACY_HIST_FILE, LEGACY_LOG_DIR, DATA_DIR, DEFAULT_CONFIG, PLUGIN_DIR } from "./config.js";
import { readPassword, encryptSync, decryptSync } from "./security/encryptor.js";

/**
 * Resolves the path to package.json (project root).
 * @returns {string}
 */
function getPkgPath() {
  const __filename = (import.meta?.url && new URL(import.meta.url).pathname) || "";
  return path.resolve(path.dirname(__filename), "..", "..", "package.json");
}

/**
 * Checks whether config encryption is active (.data marker exists + key available).
 * @returns {boolean}
 */
function isEncryptionActive() {
  const markerPath = path.join(DATA_DIR, ".data");
  if (!fs.existsSync(markerPath)) return false;
  const pwd = readPassword(getPkgPath());
  return !!pwd;
}

/**
 * Reads the encrypted config, or falls back to defaults.
 * @returns {Object}
 */
function loadEncryptedConfig() {
  const pwd = readPassword(getPkgPath());
  if (!pwd || !fs.existsSync(CONF_FILE_ENC)) return { ...DEFAULT_CONFIG };
  try {
    const encBuf = fs.readFileSync(CONF_FILE_ENC);
    const decBuf = decryptSync(encBuf, pwd);
    return JSON.parse(decBuf.toString("utf8"));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Saves config encrypted to .mc file. Ensures no plain .json is left behind.
 * @param {Object} cfg
 */
function saveEncryptedConfig(cfg) {
  const pwd = readPassword(getPkgPath());
  if (!pwd) return;
  try {
    fs.mkdirSync(path.dirname(CONF_FILE_ENC), { recursive: true });
    const data = Buffer.from(JSON.stringify(cfg, null, 2), "utf8");
    const enc = encryptSync(data, pwd);
    fs.writeFileSync(CONF_FILE_ENC, enc);
    // Remove any stray plaintext config.json
    if (fs.existsSync(CONF_FILE)) {
      try { fs.unlinkSync(CONF_FILE); } catch {}
    }
  } catch (e) {
    log.err(`Encrypted config save error: ${e.message}`);
  }
}

/**
 * Loads and parses a JSON file.
 * @param {string} file - Path to the JSON file.
 * @param {any} fallback - Fallback value if file doesn't exist or is invalid.
 * @returns {any} Parsed data or fallback.
 */
function loadJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback; }
  catch { return fallback; }
}

/**
 * Serializes and saves data to a JSON file.
 * @param {string} file - Path to the JSON file.
 * @param {any} data - Data to save.
 */
function saveJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }
  catch (e) { log.err(`Save error: ${e.message}`); }
}

/**
 * Normalizes an assistant profile from raw data.
 * @param {string} name - Profile name.
 * @param {any} data - Profile data (string prompt or object).
 * @returns {Object|null} Normalized profile object or null.
 */
function normalizeAssistantProfile(name, data) {
  if (!name || !data) return null;
  let system = "";
  let temperature = DEFAULT_CONFIG.profiles.default.temperature;
  if (typeof data === "string") {
    system = data;
  } else if (typeof data === "object") {
    system = data.system || data.prompt || "";
    if (typeof data.temperature === "number" && !Number.isNaN(data.temperature)) {
      temperature = data.temperature;
    }
  }
  if (!system) return null;
  return { name, profile: { system, temperature } };
}

/**
 * Loads all assistant profiles from the assistants directory.
 * @returns {Object} Map of profile names to profile objects.
 */
function loadAssistantsFromDir() {
  const profiles = {};
  try { fs.mkdirSync(ASSIST_DIR, { recursive: true }); } catch {}
  if (!fs.existsSync(ASSIST_DIR)) return profiles;
  let files = [];
  try { files = fs.readdirSync(ASSIST_DIR); } catch { return profiles; }
  for (const file of files) {
    const full = path.join(ASSIST_DIR, file);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    try {
      if (ext === ".json") {
        const data = JSON.parse(fs.readFileSync(full, "utf8"));
        const name = data.name || base;
        const normalized = normalizeAssistantProfile(name, data);
        if (normalized) profiles[normalized.name] = normalized.profile;
      } else if (ext === ".txt" || ext === ".md") {
        const system = fs.readFileSync(full, "utf8").trim();
        const normalized = normalizeAssistantProfile(base, system);
        if (normalized) profiles[normalized.name] = normalized.profile;
      }
    } catch {
      continue;
    }
  }
  return profiles;
}

/**
 * Saves a new assistant profile to a JSON file.
 * @param {string} name - Profile name.
 * @param {string} system - System prompt.
 * @param {number} temperature - Model temperature.
 * @returns {string} Path to the saved file.
 */
function saveAssistantProfile(name, system, temperature) {
  if (!name || !system) throw new Error("Name and system required");
  fs.mkdirSync(ASSIST_DIR, { recursive: true });
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const file = path.join(ASSIST_DIR, `${safeName}.json`);
  const data = { name, system, temperature };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

/**
 * Loads application configuration and merges with defaults and assistant profiles.
 * @returns {Object} Complete configuration object.
 */
function loadConfig() {
  const cfg = loadJson(CONF_FILE, DEFAULT_CONFIG);
  const assistantProfiles = loadAssistantsFromDir();

  const merged = {
    ...DEFAULT_CONFIG, ...cfg,
    autopilot: { ...DEFAULT_CONFIG.autopilot, ...(cfg.autopilot || {}) },
    plugins: { ...DEFAULT_CONFIG.plugins, ...(cfg.plugins || {}) },
    vacuum: { ...DEFAULT_CONFIG.vacuum, ...(cfg.vacuum || {}) },
    profiles:  { ...DEFAULT_CONFIG.profiles,  ...(cfg.profiles  || {}), ...assistantProfiles },
    templates: { ...DEFAULT_CONFIG.templates, ...(cfg.templates || {}) },
    aliases:   { ...DEFAULT_CONFIG.aliases,   ...(cfg.aliases   || {}) }
  };

  // Apply active provider's api_schema to top-level config
  if (merged.active_provider && merged.providers?.[merged.active_provider]?.api_schema) {
    merged.api_schema = merged.providers[merged.active_provider].api_schema;
  }

  return merged;
}

/**
 * Saves configuration to file, excluding dynamic assistant profiles.
 * @param {Object} cfg - Configuration to save.
 */
function saveConfig(cfg) {
  const assistantProfiles = loadAssistantsFromDir();
  const cleanedProfiles = { ...cfg.profiles };
  for (const name of Object.keys(assistantProfiles)) {
    delete cleanedProfiles[name];
  }
  saveJson(CONF_FILE, { ...cfg, profiles: cleanedProfiles });
}

/**
 * Loads chat history state.
 * @returns {Object} History state object.
 */
function loadHistoryState() {
  const fallback = { current: "default", chats: { default: [] } };
  const data = loadJson(HIST_FILE, fallback);
  if (Array.isArray(data)) return { current: "default", chats: { default: data } };
  if (data && typeof data === "object") {
    const chats = data.chats && typeof data.chats === "object" ? data.chats : {};
    const current = data.current || "default";
    if (!chats[current]) chats[current] = [];
    return { current, chats };
  }
  return fallback;
}

/**
 * Loads pinned messages.
 * @returns {Array<Object>} List of pinned messages.
 */
function loadPins() {
  return loadJson(PIN_FILE, []);
}

/**
 * Saves pinned messages.
 * @param {Array<Object>} pins - List of pinned messages.
 */
function savePins(pins) {
  saveJson(PIN_FILE, pins || []);
}

/**
 * Applies chat vacuum (history cleanup) based on configuration.
 * @param {Array<Object>} history - Current chat history.
 * @param {Object} cfg - Configuration.
 * @returns {Array<Object>} Cleaned history.
 */
function applyVacuum(history, cfg) {
  const vac = cfg.vacuum || {};
  if (!vac.enabled) return history;
  const keepLast = Math.max(0, parseInt(vac.keep_last ?? 1));
  const dropCount = Math.max(0, parseInt(vac.drop_count ?? 4));
  if (dropCount <= 0) return history;
  if (history.length <= keepLast + dropCount) return history;
  const keepTail = keepLast > 0 ? history.slice(-keepLast) : [];
  const head = history.slice(0, Math.max(0, history.length - keepLast - dropCount));
  return [...head, ...keepTail];
}

/**
 * Saves chat history state.
 * @param {Object} state - History state to save.
 */
function saveHistoryState(state) { saveJson(HIST_FILE, state); }

/**
 * Loads undo checkpoints.
 * @returns {Array<Object>} List of undo checkpoints.
 */
function loadUndoState() {
  return loadJson(UNDO_FILE, []);
}

/**
 * Saves undo checkpoints.
 * @param {Array<Object>} state - Undo state to save.
 */
function saveUndoState(state) {
  saveJson(UNDO_FILE, state);
}

/**
 * Migrates legacy (pre-v2) data to the new data directory structure.
 */
function migrateLegacyData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(PLUGIN_DIR, { recursive: true });

    if (!fs.existsSync(CONF_FILE) && fs.existsSync(LEGACY_CONF_FILE)) {
      fs.renameSync(LEGACY_CONF_FILE, CONF_FILE);
    }

    if (!fs.existsSync(HIST_FILE) && fs.existsSync(LEGACY_HIST_FILE)) {
      fs.renameSync(LEGACY_HIST_FILE, HIST_FILE);
    }

    if (fs.existsSync(LEGACY_LOG_DIR) && fs.statSync(LEGACY_LOG_DIR).isDirectory()) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const entries = fs.readdirSync(LEGACY_LOG_DIR);
      for (const entry of entries) {
        const from = path.join(LEGACY_LOG_DIR, entry);
        const to = path.join(LOG_DIR, entry);
        if (!fs.existsSync(to)) {
          fs.renameSync(from, to);
        }
      }
      if (fs.readdirSync(LEGACY_LOG_DIR).length === 0) {
        fs.rmdirSync(LEGACY_LOG_DIR);
      }
    }
  } catch (e) {
    log.dim(`Legacy data migration skipped: ${e.message}`);
  }
}

export {
  loadJson, saveJson, normalizeAssistantProfile, loadAssistantsFromDir,
  saveAssistantProfile, loadConfig, saveConfig, loadHistoryState,
  loadPins, savePins, applyVacuum, saveHistoryState,
  loadUndoState, saveUndoState, migrateLegacyData
};
