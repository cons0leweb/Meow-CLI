import { input, select } from "@inquirer/prompts";
import { MUTED, ACCENT, TEXT, TEXT_DIM } from "./ui.js";

/**
 * List of available commands for tab-completion.
 * @type {Array<string>}
 */
export const COMMANDS = [
  // Most common first — these appear first in tab-complete
  "/help", "?", "/clear", "/exit", "/stats", "/config",
  "/ap", "/autopilot",
  "/model", "/profile", "/provider", "/pv", "/mcp", "/temp", "/key", "/url", "/lang",
  // Chat
  "/chat list", "/chat new", "/chat use", "/chat delete",
  "/reset", "/compact", "/compact --ai",
  "/optimize", "/opt",
  // Autopilot
  "/ap-config", "/ap-limit", "/ap-errors", "/trigger",
  // Agents
  "/lead", "/lead auto", "/delegate", "/pair",
  "/ci status", "/ci generate", "/ci heal",
  // Memory
  "/memory stats", "/memory search", "/memory prefs", "/memory clear",
  "/routing", "/routing on", "/routing off",
  // Tools
  "/img", "/list", "/read", "/shell",
  // Security
  "/permissions", "/perm allow", "/perm deny",
  "/context", "/context edit", "/context reload",
  "/audit", "/incognito on", "/incognito off",
  // History
  "/rewind", "/rewind --list",
  "/session list", "/session load",
  "/cost", "/cost total",
  "/export", "/import", "/undo",
  // Settings
  "/git on", "/git off", "/git prefix", "/git ai",
  "/assistant", "/preview start", "/preview stop",
  // Other
  "/init", "/init --force",
  "/pins", "/pin",
  "/plugin list", "/plugin enable", "/plugin disable",
  "/template", "/vacuum", "/alias",
  "/saveconfig",
];

/** Persistent input history across prompts */
const inputHistory = [];

/**
 * Sanitizes user input to prevent injection attacks and remove control characters.
 * @param {string} input - Raw user input.
 * @returns {string} Sanitized input.
 */
function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  // Remove null bytes and other dangerous control characters
  // Keep \n, \r, \t
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * Attempts to autocomplete a partial slash command by showing a select list
 * of matching commands.
 *
 * @param {string} partial - First word starting with "/"
 * @param {string} remainder - Everything after the first word
 * @returns {Promise<string>} The (possibly autocompleted) full input
 */
async function autocompleteCommand(partial, remainder) {
  const matches = COMMANDS.filter(c => c.startsWith(partial));

  // No matches — return original
  if (matches.length === 0) return partial + remainder;

  // Exact match already — return as-is
  if (matches.includes(partial)) return partial + remainder;

  // Single match — silently autocomplete
  if (matches.length === 1) {
    return matches[0] + remainder;
  }

  // Find common prefix among matches
  const commonPrefix = matches.reduce((acc, h) => {
    let i = 0;
    while (i < acc.length && i < h.length && acc[i] === h[i]) i++;
    return acc.slice(0, i);
  });

  // If common prefix is longer than partial, extend silently
  if (commonPrefix.length > partial.length) {
    return commonPrefix + remainder;
  }

  // Multiple matches — show select picker
  try {
    const selected = await select({
      message: `${MUTED("│")}  ${ACCENT("◇")}  Complete command`,
      choices: matches.map(c => ({ name: c, value: c })),
      pageSize: 10,
      theme: {
        prefix: MUTED("│"),
        style: {
          message: (text) => text,
        },
      },
    });
    return selected + remainder;
  } catch {
    // User pressed Ctrl+C during select — return original
    return partial + remainder;
  }
}

/**
 * Reads input using @inquirer/prompts with syntax highlighting
 * and post-input autocomplete for slash commands.
 *
 * @param {string} promptTitle - Title to display as the prompt message.
 * @returns {Promise<string>} The user's input.
 */
const readMultilineInput = async (promptTitle) => {
  let answer;

  try {
    answer = await input({
      message: `  ${ACCENT("◇")}  ${TEXT_DIM(promptTitle)} ${MUTED("(↑↓: history, Tab: complete)")}`,
      required: false,
      // Syntax highlighting for commands via transformer
      transformer: (value, { isFinal }) => {
        if (isFinal) return value;
        if (value.startsWith("/")) {
          const spaceIdx = value.indexOf(" ");
          if (spaceIdx === -1) return ACCENT(value);
          return ACCENT(value.slice(0, spaceIdx)) + TEXT(value.slice(spaceIdx));
        }
        return value;
      },
      theme: {
        prefix: MUTED("│"),
        style: {
          message: (text) => text,
        },
      },
    });
  } catch (e) {
    // Ctrl+C — exit cleanly
    process.stdout.write("\n");
    process.exit(0);
  }

  // Autocomplete: if input starts with / and isn't a complete command, try to complete
  if (answer && answer.startsWith("/")) {
    const trimmed = answer.trimStart();
    const spaceIdx = trimmed.indexOf(" ");
    const partial = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const remainder = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx);

    if (!COMMANDS.includes(partial)) {
      answer = await autocompleteCommand(partial, remainder);
    }
  }

  // Save to persistent history (avoid duplicates at top)
  const result = sanitizeInput(answer);
  if (result && (inputHistory.length === 0 || inputHistory[0] !== result)) {
    inputHistory.unshift(result);
    // Keep history bounded
    if (inputHistory.length > 500) inputHistory.pop();
  }

  return result;
};

/**
 * Wrapper for readMultilineInput.
 * @param {string} promptTitle - Prompt title.
 * @returns {Promise<string>}
 */
const askInput = (promptTitle) => readMultilineInput(promptTitle);

export { askInput, readMultilineInput };
