import { loadConfig, saveConfig } from "./persistence.js";
import { log } from "./ui.js";

class AuthManager {
  constructor() {
    this.session = null;
    this.load();
  }

  load() {
    try {
      const config = loadConfig();
      this.session = config.auth_session || null;
    } catch (e) {
      this.session = null;
    }
  }

  save(session, config) {
    this.session = session;
    try {
      const cfg = config || loadConfig();
      cfg.auth_session = session;
      
      // If we have an active session, ensure we have a provider for it
      if (session && session.access_token) {
        const baseUrl = session.server || "https://meowcube.space";
        
        if (!cfg.providers.meowcube) {
          cfg.providers.meowcube = {
            base_url: `${baseUrl}/v1`,
            api_key: session.access_token,
            model: "gpt-4-turbo"
          };
        } else {
          cfg.providers.meowcube.api_key = session.access_token;
          cfg.providers.meowcube.base_url = `${baseUrl}/v1`;
        }
      }
      
      saveConfig(cfg);
    } catch (e) {
      log.error("Failed to save auth session: " + e.message);
    }
  }

  logout() {
    this.save(null);
  }

  get token() {
    return this.session?.access_token || null;
  }

  get user() {
    return this.session?.user || null;
  }

  async requestAuth(baseUrl, type = "login") {
    const res = await fetch(`${baseUrl}/api/cli/auth/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type })
    });
    if (!res.ok) throw new Error(`Auth request failed: ${res.status}`);
    return res.json();
  }

  async pollAuth(baseUrl, pollId) {
    const res = await fetch(`${baseUrl}/api/cli/auth/poll?poll_id=${pollId}`);
    if (!res.ok) throw new Error(`Auth poll failed: ${res.status}`);
    return res.json();
  }
}

export const authManager = new AuthManager();
