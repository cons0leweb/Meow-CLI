import * as readline from "readline";
import { C, INFO, MUTED, TEXT, TEXT_DIM, ACCENT, AUTO_CLR } from "./ui.js";

/**
 * CoordinationChannel — allows the user to send messages to the agent
 * during autopilot execution for guidance, status checks, or task refinement.
 *
 * Uses a non-blocking readline interface on stdin. Messages are queued and
 * drained by the autopilot loop each iteration.
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
  }

  /**
   * Starts the coordination channel.
   * Sets up a non-blocking readline listener on stdin.
   */
  start() {
    if (this._active) return;
    this._active = true;
    this._queue = [];
    this._totalReceived = 0;

    // Brief system message to show the channel is active
    console.log(
      `  ${INFO("┃")} ${ACCENT.bold("💬 Coordination Channel")} ${MUTED("active — type messages during execution")}`
    );
    console.log(
      `  ${MUTED("┃")} ${TEXT_DIM("Messages will appear in agent context on next iteration")}`
    );
    console.log(
      `  ${MUTED("┃")} ${TEXT_DIM("Type")} ${ACCENT("Ctrl+D")} ${TEXT_DIM("to close channel early")}\n`
    );

    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
      // Don't echo — we handle output ourselves
    });

    this._rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed || !this._active) return;

      this._queue.push(trimmed);
      this._totalReceived++;

      // Show confirmation that message was received
      const preview = trimmed.length > 60
        ? trimmed.slice(0, 57) + "…"
        : trimmed;
      console.log(
        `  ${AUTO_CLR("┃")} ${INFO("💬")} ${MUTED("Coordination:")} ${TEXT(`"${preview}"`)} ${MUTED(`(#${this._totalReceived})`)}`
      );
    });

    this._rl.on("close", () => {
      if (this._active) {
        console.log(
          `  ${MUTED("┃")} ${TEXT_DIM("Coordination channel closed")}`
        );
      }
      this._active = false;
    });
  }

  /**
   * Stops the coordination channel and cleans up.
   */
  stop() {
    if (!this._active && !this._rl) return;
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
