import {
  C,
  ACCENT,
  MUTED,
  SUCCESS,
  WARNING,
  INFO,
  TEXT_DIM,
  log,
  printHelp,
  printStats,
  saveHistoryState,
  loadPins,
  t
} from "../../core.js";
import { getTrustManager, TRUST_LEVEL } from "../trust.js";
import { checkForUpdate, getCurrentVersion, compareVersions, getVersionDisplay } from "../updater.js";

/**
 * General CLI commands.
 */
const commands = [
  {
    name: "/trust",
    execute: async (ctx, { rest }) => {
      const trust = getTrustManager();
      const status = await trust.checkStatus();
      
      if (rest === "grant" || rest === "allow" || rest === "yes") {
        const success = await trust.grantTrust();
        if (success) {
          log.ok(t(ctx.cfg, "trust_granted"));
        } else {
          log.err(t(ctx.cfg, "trust_blocked"));
        }
        return { handled: true };
      }

      let statusStr = t(ctx.cfg, "trust_untrusted");
      if (status === TRUST_LEVEL.TRUSTED) statusStr = t(ctx.cfg, "trust_trusted");
      if (status === TRUST_LEVEL.BLACKLISTED) statusStr = t(ctx.cfg, "trust_blacklisted");

      log.info(t(ctx.cfg, "trust_status").replace("{status}", statusStr));
      if (status === TRUST_LEVEL.UNTRUSTED) {
        log.dim(`Type /trust grant to allow full access.`);
      }
      return { handled: true };
    }
  },
  {
    name: "/exit",
    execute: async () => ({ handled: true, exit: true })
  },
  {
    name: "/help",
    execute: async (ctx, { rest }) => {
      printHelp(ctx.cfg, rest || null);
      return { handled: true };
    }
  },
  {
    name: "?",
    execute: async (ctx, { rest }) => {
      printHelp(ctx.cfg, rest || null);
      return { handled: true };
    }
  },
  {
    name: "/stats",
    execute: async (ctx) => {
      printStats(ctx.cfg, ctx.currentChat, ctx.history.length, loadPins().length);
      return { handled: true };
    }
  },
  {
    name: "/clear",
    execute: async (ctx) => {
      ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }];
      ctx.history = [];
      ctx.historyState.chats[ctx.currentChat] = [];
      ctx.pendingImages = [];
      saveHistoryState(ctx.historyState);
      log.ok("Chat context cleared.");
      ctx.refreshBanner();
      return { handled: true };
    }
  },
  {
    name: "/reset",
    execute: async (ctx) => {
      ctx.messages = [{ role: "system", content: ctx.cfg.profiles[ctx.cfg.profile].system }];
      ctx.history = [];
      ctx.historyState.chats[ctx.currentChat] = [];
      ctx.pendingImages = [];
      saveHistoryState(ctx.historyState);
      log.ok("Chat context reset.");
      ctx.refreshBanner();
      return { handled: true };
    }
  }
];

export { commands };
