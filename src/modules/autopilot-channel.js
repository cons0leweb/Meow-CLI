import * as readline from "readline";
import { C, INFO, MUTED, TEXT, TEXT_DIM, ACCENT, AUTO_CLR } from "./ui.js";

/**
 * CoordinationChannel — manages an interactive bottom input bar during autopilot.
 *
 * The channel reserves a fixed input line at the bottom of the terminal where
 * the user can type coordination messages during autopilot execution.
 * Autopilot output scrolls above the input bar, creating a clean separation.
 *
 * Uses ANSI escape codes to manage cursor position between content area
 * and the input prompt at the bottom.
 */
class CoordinationChannel {
  constructor() {
    /** @type {Array<string>} Queued coordination messages */
    this._queue = [];
    /** @type {boolean} Whether the channel is active */
    this._active = false;
    /** @type {readline.Interface|null} */
    this._rl = null;
    /** @type {number} Total messages received */
    this._totalReceived = 0;
    /** @type {boolean} Whether input prompt is currently displayed */
    this._promptDisplayed = false;
  }

  /**
   * Starts the coordination channel.
   * Sets up a readline interface with a persistent bottom input bar.
   */
  start() {
    if (this._active) return;
    this._active = true;
    this._queue = [];
    this._totalReceived = 0;
    this._promptDisplayed = false;

    const COLS = process.stdout.columns || 80;

    // ── Banner ──
    console.log(
      `  ${INFO("┃")} ${ACCENT.bold("💬 Coordination Channel")} ${MUTED("active — type at the bottom prompt")}`
    );
    console.log(
      `  ${MUTED("┃")} ${TEXT_DIM("Messages appear in agent context on next iteration")}`
    );
    console.log(
      `  ${MUTED("┃")} ${TEXT_DIM("Press")} ${ACCENT("Ctrl+D")} ${TEXT_DIM("to close channel early")}\n`
    );

    // ── Separator line (creates visual "shift" from content) ──
    const sepLine = `  ${AUTO_CLR("┋")} ${MUTED("─".repeat(Math.min(COLS - 8, 60)))}`;
    console.log(sepLine);

    // ── Set up readline with proper terminal handling ──
    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: "",
    });

    // Show initial input prompt at the bottom
    this._showPrompt();

    this._rl.on("line", (line) => {
      const trimmed = line.replace(/\r?\n$/, "").trim();
      if (!trimmed || !this._active) {
        this._showPrompt();
        return;
      }

      this._queue.push(trimmed);
      this._totalReceived++;

      // Clear the prompt line, show confirmation, then re-show prompt
      const preview = trimmed.length > 60
        ? trimmed.slice(0, 57) + "…"
        : trimmed;
      this._clearInputLine();
      console.log(
        `  ${AUTO_CLR("┃")} ${INFO("💬")} ${MUTED("Coordination:")} ${TEXT(`"${preview}"`)} ${MUTED(`(#${this._totalReceived})`)}`
      );
      this._showPrompt();
    });

    this._rl.on("close", () => {
      if (this._active) {
        this._clearInputLine();
        console.log(`  ${MUTED("┃")} ${TEXT_DIM("Coordination channel closed")}`);
      }
      this._active = false;
      this._promptDisplayed = false;
    });
  }

  /**
   * Shows the input prompt at the bottom line.
   * @private
   */
  _showPrompt() {
    if (!this._rl || !this._active) return;
    
    const prompt = `  ${AUTO_CLR("┃")} ${ACCENT("⎔")} ${AUTO_CLR.bold("coordination")}${MUTED(" > ")}`;
    this._rl.setPrompt(prompt);
    this._rl.prompt(true);
    this._promptDisplayed = true;
  }

  /**
   * Clears the current input prompt line from the terminal.
   * Moves cursor up one line, clears it, and returns cursor to start.
   * @private
   */
  _clearInputLine() {
    if (!this._promptDisplayed) return;
    // ANSI: move up 1 line, clear line, move to beginning
    process.stdout.write("\x1b[1A\x1b[2K\r");
    this._promptDisplayed = false;
  }

  /**
   * Clears the input prompt temporarily before autopilot output.
   * Should be called BEFORE autopilot writes new output.
   * After output is done, call refresh() to re-show the prompt.
   */
  suspendPrompt() {
    this._clearInputLine();
  }

  /**
   * Re-shows the input prompt after autopilot output.
   * Call this after any autopilot output that might have overwritten
   * or pushed past the input line.
   */
  refresh() {
    if (this._active && this._rl) {
      this._showPrompt();
    }
  }

  /**
   * Stops the coordination channel and cleans up.
   */
  stop() {
    if (!this._active && !this._rl) return;
    
    // Clear the input line first
    this._clearInputLine();
    this._active = false;

    if (this._rl) {
      try {
        this._rl.close();
      } catch { /* ignore */ }
      this._rl = null;
    }

    if (this._totalReceived > 0) {
      console.log(
        `  ${INFO("┃")} ${ACCENT("💬")} ${MUTED(`Coordination closed (${this._totalReceived} message${this._totalReceived !== 1 ? "s" : ""} relayed)`)}`
      );
    }

    this._queue = [];
    this._promptDisplayed = false;
  }

  /**
   * @returns {boolean} True if there are pending messages.
   */
  hasMessages() {
    return this._queue.length > 0;
  }

  /**
   * Drains all pending messages from the queue.
   * @returns {Array<string>} Pending coordination messages.
   */
  drain() {
    const messages = [...this._queue];
    this._queue = [];
    return messages;
  }

  /**
   * @returns {number} Total messages received since start.
   */
  get totalReceived() {
    return this._totalReceived;
  }

  /**
   * @returns {boolean} Whether channel is active.
   */
  get active() {
    return this._active;
  }
}

/**
 * Formats a coordination message for injection into the conversation.
 * @param {string} message - User's coordination message.
 * @param {number} index - Message sequence number.
 * @returns {string} Formatted message for the AI context.
 */
function formatCoordinationMessage(message, index) {
  return [
    `💬 [COORDINATION #${index}] User says:`,
    ``,
    message,
    ``,
    `[This is a coordination message from the user during autopilot. `,
    `Consider it carefully — it may adjust your task, provide guidance, `,
    `request a status update, or ask you to change approach.]`,
  ].join("\n");
}

export { CoordinationChannel, formatCoordinationMessage };
