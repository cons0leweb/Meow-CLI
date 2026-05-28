import readline from "readline";
import { C, MUTED, ACCENT, TEXT, TEXT_DIM, SUCCESS, AI_GRADIENT, stripAnsi, COLS } from "./ui.js";

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
 * Get the visible (strip-ANSI) length of a string.
 * @param {string} s
 * @returns {number}
 */
function visLen(s) {
  return stripAnsi(s).length;
}

/**
 * Given a buffer string and a cursor index, compute the styled display string
 * with syntax highlighting for slash commands.
 * @param {string} buf
 * @param {boolean} isCommand - whether buf starts with /
 * @returns {string} styled string (no cursor — cursor is shown via terminal position)
 */
function styledBuffer(buf, isCommand) {
  if (!isCommand) return TEXT(buf);
  // Highlight the command word in accent, rest in text
  const spaceIdx = buf.indexOf(" ");
  if (spaceIdx === -1) return ACCENT(buf);
  return ACCENT(buf.slice(0, spaceIdx)) + TEXT(buf.slice(spaceIdx));
}

/**
 * Full-redraw the input area.
 * Moves cursor up to the first line of input, clears all lines, rewrites.
 *
 * Key fix: uses cursorRow (where the cursor actually is) instead of prevRows
 * to determine how far up to move. The old code used prevRows-1 which
 * overshoots when the cursor is in the middle of multi-line input,
 * causing the input to "creep upward" eating lines above.
 *
 * @param {string} promptPrefix - e.g. "│  "
 * @param {string} buf          - current buffer text
 * @param {number} cursorIdx    - cursor position in buf (0..buf.length)
 * @param {number} cols         - terminal width
 * @returns {number} new row count (for next redraw)
 */
function redraw(promptPrefix, buf, cursorIdx, cols) {
  const prefixLen = visLen(promptPrefix);
  const isCommand = buf.startsWith("/");

  // Build the styled display text
  const display = styledBuffer(buf, isCommand);

  // Calculate positions
  const totalLen = prefixLen + buf.length;
  const cursorPos = prefixLen + cursorIdx;
  const cursorRow = Math.floor(cursorPos / cols);
  const cursorCol = cursorPos % cols;

  // Move cursor up to the FIRST row of the input area.
  // The cursor is at row cursorRow (0-based within input).
  // We need to go up by exactly cursorRow rows — NOT prevRows-1,
  // which would overshoot when cursor is mid-input.
  if (cursorRow > 0) {
    readline.moveCursor(process.stdout, 0, -cursorRow);
  }
  readline.cursorTo(process.stdout, 0);

  // Clear everything from cursor to end of screen
  readline.clearScreenDown(process.stdout);

  // Rewrite prompt + styled buffer
  process.stdout.write(promptPrefix + display);

  // After writing totalLen visible chars, terminal cursor is at endRow.
  // Move it back to where the user's cursor should be.
  const endRow = Math.floor(totalLen / cols);
  const rowDiff = cursorRow - endRow;
  if (rowDiff !== 0) {
    readline.moveCursor(process.stdout, 0, rowDiff);
  }
  readline.cursorTo(process.stdout, cursorCol);

  // Return number of rows the content occupies (ceil, not floor+1, to
  // avoid off-by-one when totalLen is an exact multiple of cols)
  const newRows = Math.ceil(totalLen / cols);
  return newRows;
}

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
 * Reads a single-line input from the terminal with:
 * - Left/Right arrow: cursor movement
 * - Up/Down arrow: history navigation
 * - Backspace/Delete: proper deletion at cursor
 * - Home/End: jump to start/end
 * - Tab: autocomplete
 * - Enter / Ctrl+D: submit
 * - Ctrl+C: exit
 *
 * @param {string} promptTitle - Title to display above the input area.
 * @returns {Promise<string>} The user's input.
 */
const readMultilineInput = (promptTitle) => new Promise(resolve => {
  const cols = process.stdout.columns || COLS || 80;
  const promptPrefix = `${MUTED("│")}  `;

  console.log(`\n${ACCENT("◇")}  ${TEXT_DIM(promptTitle)} ${MUTED("(Tab: complete, ↑↓: history, ←→: move cursor)")}`);
  process.stdout.write(promptPrefix);

  let buffer = "";
  let cursor = 0;        // index into buffer (0..buffer.length)
  let rows = 1;          // how many terminal rows the current input occupies
  let historyIndex = -1; // -1 = current input, 0..n-1 = history entries
  let savedBuffer = "";  // saved current input when browsing history

  /**
   * Perform a full redraw and update rows count.
   */
  function refresh() {
    rows = redraw(promptPrefix, buffer, cursor, cols);
  }

  const onKey = (str, key = {}) => {
    // Ctrl+C
    if (key.ctrl && key.name === "c") {
      process.stdout.write("\n");
      process.exit(0);
    }

    // Submit: Enter (always submit in single-line mode), Ctrl+D
    if (key.name === "return" || key.name === "enter" || (key.ctrl && key.name === "d")) {
      // Move to end of input area
      const prefixLen = visLen(promptPrefix);
      const totalLen = prefixLen + buffer.length;
      const endRow = Math.floor(totalLen / cols);
      const cursorRow = Math.floor((prefixLen + cursor) / cols);
      const rowsToEnd = endRow - cursorRow;
      if (rowsToEnd > 0) readline.moveCursor(process.stdout, 0, rowsToEnd);

      process.stdout.write("\n" + MUTED("└") + "\n");
      cleanup();

      const result = sanitizeInput(buffer);
      // Save to history (avoid duplicates at top)
      if (result && (inputHistory.length === 0 || inputHistory[0] !== result)) {
        inputHistory.unshift(result);
        // Keep history bounded
        if (inputHistory.length > 500) inputHistory.pop();
      }
      resolve(result);
      return;
    }

    // Arrow Up — history previous
    if (key.name === "up") {
      if (inputHistory.length === 0) return;
      if (historyIndex === -1) {
        savedBuffer = buffer;
      }
      const newIdx = Math.min(historyIndex + 1, inputHistory.length - 1);
      if (newIdx !== historyIndex) {
        historyIndex = newIdx;
        buffer = inputHistory[historyIndex];
        cursor = buffer.length;
        refresh();
      }
      return;
    }

    // Arrow Down — history next
    if (key.name === "down") {
      if (historyIndex === -1) return;
      const newIdx = historyIndex - 1;
      if (newIdx < 0) {
        historyIndex = -1;
        buffer = savedBuffer;
        cursor = buffer.length;
        refresh();
      } else {
        historyIndex = newIdx;
        buffer = inputHistory[historyIndex];
        cursor = buffer.length;
        refresh();
      }
      return;
    }

    // Arrow Left — move cursor left
    if (key.name === "left") {
      if (key.ctrl || key.meta) {
        // Ctrl+Left: jump word left
        let i = cursor;
        while (i > 0 && buffer[i - 1] === " ") i--;
        while (i > 0 && buffer[i - 1] !== " ") i--;
        cursor = i;
      } else {
        if (cursor > 0) cursor--;
      }
      refresh();
      return;
    }

    // Arrow Right — move cursor right
    if (key.name === "right") {
      if (key.ctrl || key.meta) {
        // Ctrl+Right: jump word right
        let i = cursor;
        while (i < buffer.length && buffer[i] === " ") i++;
        while (i < buffer.length && buffer[i] !== " ") i++;
        cursor = i;
      } else {
        if (cursor < buffer.length) cursor++;
      }
      refresh();
      return;
    }

    // Home — jump to start
    if (key.name === "home" || (key.ctrl && key.name === "a")) {
      cursor = 0;
      refresh();
      return;
    }

    // End — jump to end
    if (key.name === "end" || (key.ctrl && key.name === "e")) {
      cursor = buffer.length;
      refresh();
      return;
    }

    // Backspace — delete char before cursor
    if (key.name === "backspace") {
      if (cursor > 0) {
        buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
        cursor--;
        refresh();
      }
      return;
    }

    // Delete — delete char at cursor
    if (key.name === "delete") {
      if (cursor < buffer.length) {
        buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
        refresh();
      }
      return;
    }

    // Ctrl+K — kill to end of line
    if (key.ctrl && key.name === "k") {
      buffer = buffer.slice(0, cursor);
      refresh();
      return;
    }

    // Ctrl+U — kill to start of line
    if (key.ctrl && key.name === "u") {
      buffer = buffer.slice(cursor);
      cursor = 0;
      refresh();
      return;
    }

    // Ctrl+W — kill word before cursor
    if (key.ctrl && key.name === "w") {
      let i = cursor;
      while (i > 0 && buffer[i - 1] === " ") i--;
      while (i > 0 && buffer[i - 1] !== " ") i--;
      buffer = buffer.slice(0, i) + buffer.slice(cursor);
      cursor = i;
      refresh();
      return;
    }

    // Tab — autocomplete
    if (key.name === "tab") {
      // Only autocomplete if cursor is at the end of a /command (no spaces yet, or completing the command word)
      const wordBeforeCursor = buffer.slice(0, cursor);
      if (wordBeforeCursor.startsWith("/")) {
        const hits = COMMANDS.filter(c => c.startsWith(wordBeforeCursor));
        if (hits.length === 1) {
          // Single match — complete
          const suffix = hits[0].slice(wordBeforeCursor.length);
          buffer = hits[0] + buffer.slice(cursor);
          cursor = hits[0].length;
          refresh();
        } else if (hits.length > 1 && hits.length <= 8) {
          // Find common prefix
          const commonPrefix = hits.reduce((acc, h) => {
            let i = 0;
            while (i < acc.length && i < h.length && acc[i] === h[i]) i++;
            return acc.slice(0, i);
          });
          if (commonPrefix.length > wordBeforeCursor.length) {
            const suffix = commonPrefix.slice(wordBeforeCursor.length);
            buffer = commonPrefix + buffer.slice(cursor);
            cursor = commonPrefix.length;
            refresh();
          } else {
            // Show options
            const prefixLen = visLen(promptPrefix);
            const totalLen = prefixLen + buffer.length;
            const endRow = Math.floor(totalLen / cols);
            const cursorRow = Math.floor((prefixLen + cursor) / cols);
            const rowsToEnd = endRow - cursorRow;
            if (rowsToEnd > 0) readline.moveCursor(process.stdout, 0, rowsToEnd);

            process.stdout.write("\n");
            const hint = hits.map(h => MUTED(h)).join("  ");
            process.stdout.write("  " + hint + "\n");
            process.stdout.write(promptPrefix + styledBuffer(buffer, buffer.startsWith("/")));

            // Recalculate rows after re-printing
            rows = Math.floor((prefixLen + buffer.length) / cols) + 1;
            // Reposition cursor
            const cursorPos = prefixLen + cursor;
            const cRow = Math.floor(cursorPos / cols);
            const cCol = cursorPos % cols;
            const eRow = Math.floor((prefixLen + buffer.length) / cols);
            const rowBack = eRow - cRow;
            if (rowBack > 0) readline.moveCursor(process.stdout, 0, -rowBack);
            readline.cursorTo(process.stdout, cCol);
          }
        }
      }
      return;
    }

    // Normal printable character
    if (str && !key.ctrl && !key.meta) {
      buffer = buffer.slice(0, cursor) + str + buffer.slice(cursor);
      cursor += str.length;
      historyIndex = -1; // typing resets history browsing
      refresh();
    }
  };

  const cleanup = () => {
    process.stdin.off("keypress", onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  };

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("keypress", onKey);
});

/**
 * Wrapper for readMultilineInput.
 * @param {string} promptTitle - Prompt title.
 * @returns {Promise<string>}
 */
const askInput = (promptTitle) => readMultilineInput(promptTitle);

export { askInput, readMultilineInput };
