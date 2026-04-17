import { authManager } from "../auth.js";
import { log, ACCENT, C, SUCCESS, MUTED } from "../ui.js";
import { saveConfig } from "../core.js";
import { isCancel } from "@clack/prompts";
import open from "open";

export const handleAuth = async (ctx, input) => {
  const [cmd, ...args] = input.split(/\s+/);

  if (cmd === "/login") {
    const baseUrl = ctx.cfg.meowcube_url || "https://meowcube.space";
    log.info(`Connecting to ${ACCENT}${baseUrl}${C.reset}...`);

    try {
      const { code, poll_id, expires_at, auth_url } = await authManager.requestAuth(baseUrl);
      
      const displayUrl = auth_url || `${baseUrl}/cli-auth?code=${code}`;

      log.box(`
  ${SUCCESS("Auth Request Created!")}
  
  1. Open: ${ACCENT}${displayUrl}${C.reset}
  2. Enter code: ${ACCENT}${code}${C.reset}
  
  Expires at: ${new Date(expires_at).toLocaleTimeString()}
      `);

      // Try to open browser
      try {
        await open(displayUrl);
      } catch (e) {
        // Ignore if fails
      }

      log.info("Waiting for approval...");

      // Polling loop
      const start = Date.now();
      const timeout = 10 * 60 * 1000; // 10 minutes

      while (Date.now() - start < timeout) {
        const status = await authManager.pollAuth(baseUrl, poll_id);
        
        if (status.status === "approved") {
          authManager.save({
            access_token: status.access_token,
            refresh_token: status.refresh_token,
            expires_in: status.expires_in,
            user: status.user,
            server: baseUrl
          });
          
          log.ok(`Successfully logged in as ${ACCENT}${status.user.email}${C.reset}`);
          
          // Automatically set up MeowCube provider if not exists
          if (!ctx.cfg.providers.meowcube) {
            ctx.cfg.providers.meowcube = {
              base_url: `${baseUrl}/v1`,
              api_key: status.access_token,
              model: "gpt-4-turbo"
            };
            log.info(`Provider ${ACCENT}meowcube${C.reset} added.`);
          } else {
            ctx.cfg.providers.meowcube.api_key = status.access_token;
          }

          // Switch to it?
          ctx.cfg.active_provider = "meowcube";
          ctx.cfg.api_base = ctx.cfg.providers.meowcube.base_url;
          ctx.cfg.api_key = ctx.cfg.providers.meowcube.api_key;
          ctx.cfg.model = ctx.cfg.providers.meowcube.model;
          
          saveConfig(ctx.cfg);
          return { handled: true };
        }

        if (status.status === "expired") {
          log.error("Auth code expired.");
          return { handled: true };
        }

        // Wait 2 seconds
        await new Promise(r => setTimeout(r, 2000));
      }

      log.error("Auth timeout.");
      return { handled: true };
    } catch (e) {
      log.error(`Login failed: ${e.message}`);
      return { handled: true };
    }
  }

  if (cmd === "/logout") {
    authManager.logout();
    log.ok("Logged out.");
    return { handled: true };
  }

  if (cmd === "/whoami") {
    const user = authManager.user;
    if (user) {
      log.info(`Logged in as: ${ACCENT}${user.email}${C.reset} (${user.id})`);
      log.dim(`Server: ${authManager.session?.server}`);
    } else {
      log.info("Not logged in.");
    }
    return { handled: true };
  }

  return null;
};
