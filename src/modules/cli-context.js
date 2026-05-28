import fs from "fs";
import path from "path";
import {
  loadConfig,
  loadHistoryState,
  saveHistoryState,
  loadPins,
  simplifyContentForHistory,
  applyVacuum,
  banner,
  ASSIST_DIR,
  migrateLegacyData,
  C,
  WARNING,
  MUTED,
  ACCENT,
  SUCCESS,
  log
} from "../core.js";

/**
 * Creates and initializes the CLI application context.
 * @returns {Object} The CLI context object.
 */
const createCliContext = () => {
  migrateLegacyData();
  try { fs.mkdirSync(ASSIST_DIR, { recursive: true }); } catch {}

  let cfg = loadConfig();
  let historyState = loadHistoryState();

  if (!cfg.profiles[cfg.profile]) cfg.profile = "default";
  if (!historyState.chats[historyState.current]) historyState.chats[historyState.current] = [];

  let currentChat = historyState.current;
  let history = historyState.chats[currentChat];
  let messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }, ...history];
  let pendingImages = [];
  let activeAutopilot = null;

  const ctx = {
    cfg,
    historyState,
    currentChat,
    history,
    messages,
    pendingImages,
    activeAutopilot,
  };

  /**
   * Saves current history and configuration to disk.
   */
  ctx.saveState = () => {
    ctx.history = ctx.messages.filter(m => m.role !== "system").map(m => {
      if (m.role === "user" && Array.isArray(m.content))
        return { ...m, content: simplifyContentForHistory(m.content) };
      return m;
    });
    ctx.historyState.chats[ctx.currentChat] = ctx.history;
    ctx.historyState.current = ctx.currentChat;
    const vacHistory = applyVacuum(ctx.history, ctx.cfg);
    ctx.historyState.chats[ctx.currentChat] = vacHistory;
    ctx.history = vacHistory;
    ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }, ...ctx.history];
    saveHistoryState(ctx.historyState);
  };

  /**
   * Re-renders the application banner.
   */
  ctx.refreshBanner = () => {
    const pinsCount = loadPins().length;
    banner(ctx.cfg, ctx.currentChat, ctx.history.length, pinsCount);
  };

  // Non-blocking update check on startup
  (async () => {
    try {
      const { checkForUpdate, compareVersions } = await import("../core.js");
      const result = await checkForUpdate();
      if (result.available) {
        // Small delay so the banner renders first
        setTimeout(() => {
          log.warn(`Update available: v${result.current} → ${SUCCESS(`v${result.latest}`)} ${MUTED(`(/update)`)}`);
        }, 100);
      }
    } catch {}
  })();

  return ctx;
};

/**
 * Registers global signal handlers (SIGINT) for the CLI.
 * @param {Object} ctx - The CLI context.
 */
const registerSignalHandlers = (ctx) => {
  let ctrlCCount = 0;
  let ctrlCTimer = null;

  process.on("SIGINT", () => {
    if (ctx.activeAutopilot && ctx.activeAutopilot.running) {
      console.log(`\n  ${WARNING("▲ Stopping autopilot...")}`);
      ctx.activeAutopilot.abort();
      return;
    }

    ctrlCCount++;
    if (ctrlCCount == 1) {
      console.log(`\n  ${MUTED("Press Ctrl+C again to exit")}`);
      ctrlCTimer = setTimeout(() => { ctrlCCount = 0; }, 2000);
    } else {
      clearTimeout(ctrlCTimer);
      console.log(`\n  ${ACCENT.bold("Goodbye! 👋")}\n`);
      process.exit(0);
    }
  });
};

export { createCliContext, registerSignalHandlers };
