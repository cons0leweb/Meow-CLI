/**
 * CoordinationChannel — Ink-based interactive coordination UI for autopilot mode.
 *
 * Renders a two-zone chat interface:
 *   ┌─ Output area ──────────────────────┐
 *   │  Autopilot output & coordination   │
 *   │  messages appear here, scrollable  │
 *   └────────────────────────────────────┘
 *   ┌─ Input area (fixed) ───────────────┐
 *   │  ⎔ coordination> _                │
 *   └────────────────────────────────────┘
 *
 * The input line stays pinned at the bottom. The user can type at any time
 * while output streams above. No ANSI cursor management needed.
 */

import process from "node:process";
import React from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { C, INFO, MUTED, TEXT, TEXT_DIM, ACCENT, AUTO_CLR } from "./ui.js";

// ─── React Component (using createElement — no JSX) ─────────────────────────

/**
 * CoordinateInput — Ink component for the coordination channel UI.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │  Output entries (flexGrow: 1)        │
 *   │  - autopilot output                  │
 *   │  - coordination messages             │
 *   └──────────────────────────────────────┘
 *   ┌──────────────────────────────────────┐
 *   │  ┃ ⎔ coordination > _               │  ← fixed input line
 *   └──────────────────────────────────────┘
 */
const CoordinateInput = ({ channel }) => {
  const { unmount } = useApp();
  const [input, setInput] = React.useState("");
  // Initialize with any entries buffered before component mounted
  const [entries, setEntries] = React.useState([...channel._entries]);

  // Register state updater so the channel can push new entries as they arrive.
  React.useEffect(() => {
    channel._setEntriesUpdater(setEntries);
    // Also forward any entries that arrived between creation and mount
    if (channel._entries.length > entries.length) {
      const missed = channel._entries.slice(entries.length);
      setEntries((prev) => [...prev, ...missed]);
    }
    return () => channel._setEntriesUpdater(null);
  }, []);

  // Keyboard handling
  useInput(
    (char, key) => {
      // Ctrl+D or Ctrl+C → close
      if (
        (key.ctrl && key.name === "d") ||
        (key.ctrl && key.name === "c")
      ) {
        channel._handleClose();
        return;
      }

      // Enter → submit
      if (key.name === "return" || key.name === "enter") {
        const trimmed = input.trim();
        if (trimmed) {
          channel._submitMessage(trimmed);
          setInput("");
        }
        return;
      }

      // Backspace
      if (key.name === "backspace") {
        setInput((prev) => prev.slice(0, -1));
        return;
      }

      // Printable character
      if (char && !key.ctrl && !key.meta) {
        setInput((prev) => prev + char);
      }
    },
    { isActive: channel._active }
  );

  // Render output entries
  const outputChildren = entries.map((entry, i) =>
    React.createElement(Text, { key: i }, entry)
  );

  // Render input line
  const inputLine = React.createElement(
    Text,
    null,
    "  ",
    AUTO_CLR("┃"),
    " ",
    ACCENT("⎔"),
    " ",
    AUTO_CLR.bold("coordination"),
    MUTED(" > "),
    input,
    React.createElement(Text, { inverse: true }, " ")
  );

  return React.createElement(
    Box,
    { flexDirection: "column", width: "100%", minHeight: 1 },
    // Output area
    React.createElement(Box, { flexDirection: "column", flexGrow: 1 }, ...outputChildren),
    // Fixed input area
    React.createElement(Box, null, inputLine)
  );
};

// ─── CoordinationChannel class ──────────────────────────────────────────────

class CoordinationChannel {
  constructor() {
    /** @type {Array<string>} Queued coordination messages */
    this._queue = [];
    /** @type {boolean} Whether the channel is active */
    this._active = false;
    /** @type {Object|null} Ink render result */
    this._app = null;
    /** @type {number} Total messages received */
    this._totalReceived = 0;
    /** @type {Array<string>} Display entries buffer */
    this._entries = [];
    /**
     * @type {Function|null} React setState for entries, registered by component.
     */
    this._setEntries = null;
    /** @type {Function|null} Original console.log */
    this._restoreConsoleLog = null;
    /** @type {Function|null} Original console.error */
    this._restoreConsoleError = null;
  }

  /**
   * Called by the React component to register its setState for entries.
   * @param {Function|null} fn - React setState function
   * @private
   */
  _setEntriesUpdater(fn) {
    this._setEntries = fn;
  }

  /**
   * Adds a line of text to the display, pushing it to the React component.
   * @param {string} text
   * @private
   */
  _addToDisplay(text) {
    if (!text) return;
    this._entries.push(text);

    if (this._setEntries) {
      // Append to React state
      this._setEntries((prev) => {
        const next = [...prev];
        next.push(text);
        return next;
      });
    }
  }

  /**
   * Patches console.log / console.error to route through the display.
   * @private
   */
  _patchConsole() {
    const self = this;

    this._restoreConsoleLog = console.log;
    this._restoreConsoleError = console.error;

    console.log = function (...args) {
      const text = args
        .map((a) =>
          typeof a === "object"
            ? a instanceof Error
              ? a.message
              : JSON.stringify(a, null, 2)
            : String(a)
        )
        .join(" ");
      self._addToDisplay(text);
    };

    console.error = function (...args) {
      const text = args
        .map((a) =>
          typeof a === "object"
            ? a instanceof Error
              ? a.message
              : JSON.stringify(a, null, 2)
            : String(a)
        )
        .join(" ");
      self._addToDisplay(text);
    };
  }

  /**
   * Restores the original console.log / console.error.
   * @private
   */
  _unpatchConsole() {
    if (this._restoreConsoleLog) {
      console.log = this._restoreConsoleLog;
      this._restoreConsoleLog = null;
    }
    if (this._restoreConsoleError) {
      console.error = this._restoreConsoleError;
      this._restoreConsoleError = null;
    }
  }

  /**
   * Submits a coordination message to the queue.
   * @param {string} text
   * @private
   */
  _submitMessage(text) {
    this._queue.push(text);
    this._totalReceived++;

    // Add confirmation to display
    const preview = text.length > 60 ? text.slice(0, 57) + "…" : text;
    this._addToDisplay(
      `  ${AUTO_CLR("┃")} ${INFO("💬")} ${MUTED("Coordination:")} ${TEXT(`"${preview}"`)} ${MUTED(`(#${this._totalReceived})`)}`
    );
  }

  /**
   * Handles close from the UI (Ctrl+D / Ctrl+C).
   * @private
   */
  _handleClose() {
    if (!this._active) return;
    this._active = false;

    this._addToDisplay(
      `  ${MUTED("┃")} ${TEXT_DIM("Coordination channel closed")}`
    );

    // Delay cleanup so the close message is visible
    setTimeout(() => this._cleanup(), 80);
  }

  /**
   * Cleans up: restores console functions and unmounts Ink.
   * @private
   */
  _cleanup() {
    this._unpatchConsole();

    if (this._app) {
      try {
        this._app.unmount();
      } catch {
        /* ignore */
      }
      this._app = null;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Starts the coordination channel.
   * Renders the Ink chat interface and patches console.log so all
   * autopilot output flows into the displayed entry list.
   */
  start() {
    if (this._active) return;
    this._active = true;
    this._queue = [];
    this._entries = [];
    this._totalReceived = 0;

    // ── Print banner using original console BEFORE patching ──
    console.log(
      `  ${INFO("┃")} ${ACCENT.bold("💬 Coordination Channel")} ${MUTED("active — type at the bottom prompt")}`
    );
    console.log(
      `  ${MUTED("┃")} ${TEXT_DIM("Messages appear in agent context on next iteration")}`
    );
    console.log(
      `  ${MUTED("┃")} ${TEXT_DIM("Press")} ${ACCENT("Ctrl+D")} ${TEXT_DIM("to close channel early")}`
    );
    console.log("");

    // ── Patch console.log / console.error ──
    this._patchConsole();

    // ── Render Ink app ──
    this._app = render(
      React.createElement(CoordinateInput, { channel: this }),
      {
        patchConsole: false, // We handle console patching ourselves
        exitOnCtrlC: false,  // We handle Ctrl+C ourselves
        alternateScreen: false,
      }
    );
  }

  /**
   * Stops the coordination channel and cleans up.
   */
  stop() {
    if (!this._active && !this._app) return;

    const hadMessages = this._totalReceived > 0;
    this._active = false;

    this._cleanup();

    // ── Print summary via original console (already restored) ──
    if (hadMessages) {
      console.log(
        `  ${INFO("┃")} ${ACCENT("💬")} ${MUTED(
          `Coordination closed (${this._totalReceived} message${this._totalReceived !== 1 ? "s" : ""} relayed)`
        )}`
      );
    }

    this._queue = [];
    this._entries = [];
  }

  /**
   * @deprecated No longer needed with Ink — kept as no-op for compatibility.
   */
  suspendPrompt() {
    // Ink manages the layout — no suspension needed
  }

  /**
   * @deprecated No longer needed with Ink — kept as no-op for compatibility.
   */
  refresh() {
    // Ink manages the layout — no refresh needed
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
