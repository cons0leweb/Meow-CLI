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
    name: "/version",
    execute: async (ctx) => {
      const current = getCurrentVersion();
      const repo = "cons0leweb/Meow-CLI";
      const releaseUrl = `https://github.com/${repo}/releases/tag/v${current}`;
      const downloadUrl = `https://github.com/${repo}/releases/latest/download/meow-cli.tar.xz`;
      
      console.log(`\n  ${ACCENT.bold("🐾 Meow CLI")}  ${MUTED(`v${current}`)}`);
      console.log(`  ${MUTED("─".repeat(30))}`);
      console.log(`  ${TEXT_DIM("Download:")}  ${ACCENT(downloadUrl)}`);
      console.log(`  ${TEXT_DIM("Release:")}   ${ACCENT(releaseUrl)}`);
      
      // Quick async check (fire and forget for display)
      const result = await checkForUpdate();
      if (result.error) {
        log.dim(`Update check: ${result.error}`);
      } else if (result.available) {
        log.warn(`Update available: ${ACCENT(`v${result.latest}`)} ${MUTED(`(current: v${result.current})`)}`);
        log.dim(`Type /update to upgrade.`);
      } else if (result.latest) {
        log.ok(`You're on the latest version ${MUTED(`(v${result.current})`)}`);
      }
      return { handled: true };
    }
  },
  {
    name: ["/update", "/upgrade"],
    execute: async (ctx, { rest }) => {
      const result = await checkForUpdate();
      
      if (result.error) {
        log.err(`Cannot check for updates: ${result.error}`);
        log.dim(`Check your internet connection or try again later.`);
        return { handled: true };
      }
      
      if (!result.available) {
        log.ok(`You're on the latest version ${ACCENT(`v${result.current}`)}`);
        return { handled: true };
      }

      console.log(`\n  ${ACCENT.bold("📦 Update Available")}`);
      console.log(`  ${MUTED("─".repeat(35))}`);
      console.log(`  ${TEXT_DIM("Current:")}  ${WARNING(`v${result.current}`)}`);
      console.log(`  ${TEXT_DIM("Latest:")}   ${SUCCESS(`v${result.latest}`)}`);

      // Try to fetch the release page URL
      const repo = "cons0leweb/Meow-CLI";
      const releaseUrl = `https://github.com/${repo}/releases/tag/v${result.latest}`;
      
      console.log(`\n  ${TEXT_DIM("To update manually, run:")}`);
      console.log(`  ${ACCENT(`curl -fsSL https://github.com/${repo}/releases/latest/download/meow-cli.tar.xz | tar -xJ`)}`);
      console.log(`\n  ${MUTED(`Release page: ${releaseUrl}`)}`);
      console.log(`  ${MUTED("─".repeat(35))}\n`);
      
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
