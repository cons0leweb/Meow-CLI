/**
 * Theme module for Meow CLI.
 * Loads themes from themes.json in the project root or user data directory.
 * Provides a simple API to get colors for the active theme.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DATA_DIR } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_THEMES_FILE = path.resolve(__dirname, "../../themes.json");
const USER_THEMES_FILE = path.join(DATA_DIR, "themes.json");

/**
 * Default fallback colors (matching the original hardcoded values in ui.js).
 */
const DEFAULT_COLORS = {
  accent: "#CC7832",
  accent2: "#A98EDA",
  accent3: "#CC7832",
  success: "#6ABE82",
  warning: "#DEB858",
  error: "#D26060",
  info: "#6CB4DC",
  muted: "#646464",
  text: "#D4D4D4",
  textDim: "#969696",
  toolClr: "#6CB4DC",
  userClr: "#D4D4D4",
  aiClr: "#CC7832",
  imgClr: "#D28CB4",
  autoClr: "#DEB858",
  gradientStart: "#CC7832",
  gradientMid: "#EBCB8B",
  gradientEnd: "#A98EDA"
};

/** @type {Object|null} Cached themes data */
let _themesCache = null;
/** @type {number} Timestamp of last load */
let _lastLoad = 0;
/** @type {number} Cache TTL in ms */
const CACHE_TTL = 5000;

/**
 * Load all themes from themes.json.
 * Checks project root first, then user data directory.
 * @returns {Object} Map of theme name -> theme definition
 */
function loadThemes() {
  const now = Date.now();
  if (_themesCache && now - _lastLoad < CACHE_TTL) {
    return _themesCache;
  }

  let themes = {};

  // Try project-level themes.json
  if (fs.existsSync(PROJECT_THEMES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROJECT_THEMES_FILE, "utf-8"));
      themes = { ...themes, ...data };
    } catch (e) {
      console.error(`[theme] Error reading project themes.json: ${e.message}`);
    }
  }

  // Try user-level themes.json (overrides project themes)
  if (fs.existsSync(USER_THEMES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USER_THEMES_FILE, "utf-8"));
      themes = { ...themes, ...data };
    } catch (e) {
      console.error(`[theme] Error reading user themes.json: ${e.message}`);
    }
  }

  // Always ensure "default" theme exists
  if (!themes.default) {
    themes.default = {
      name: "Default",
      description: "Original Meow CLI color scheme",
      colors: { ...DEFAULT_COLORS }
    };
  }

  _themesCache = themes;
  _lastLoad = now;
  return themes;
}

/**
 * Get colors for a specific theme.
 * Falls back to default if theme not found.
 * @param {string} themeName - Name of the theme
 * @returns {Object} Color map for the theme
 */
function getThemeColors(themeName = "default") {
  const themes = loadThemes();
  const theme = themes[themeName];
  if (!theme || !theme.colors) {
    return { ...DEFAULT_COLORS };
  }
  return { ...DEFAULT_COLORS, ...theme.colors };
}

/**
 * Get a specific color value from a theme.
 * @param {string} themeName - Name of the theme
 * @param {string} colorKey - Color key (e.g. "accent", "text")
 * @param {string} [fallback] - Fallback hex if not found
 * @returns {string} Hex color string
 */
function getThemeColor(themeName, colorKey, fallback = "#CC7832") {
  const colors = getThemeColors(themeName);
  return colors[colorKey] || fallback;
}

/**
 * List available themes (names only).
 * @returns {Array<{id: string, name: string, description: string}>}
 */
function listThemes() {
  const themes = loadThemes();
  return Object.entries(themes).map(([id, t]) => ({
    id,
    name: t.name || id,
    description: t.description || ""
  }));
}

/**
 * Validate a theme name exists.
 * @param {string} name - Theme ID to check
 * @returns {boolean}
 */
function isValidTheme(name) {
  const themes = loadThemes();
  return !!themes[name];
}

/**
 * Invalidate the theme cache (force reload on next access).
 */
function invalidateCache() {
  _lastLoad = 0;
}

export {
  loadThemes,
  getThemeColors,
  getThemeColor,
  listThemes,
  isValidTheme,
  invalidateCache,
  DEFAULT_COLORS,
  PROJECT_THEMES_FILE,
  USER_THEMES_FILE
};
