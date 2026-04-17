import { CONF_FILE } from "./config.js";
import fs from "fs";
import { log, ACCENT, C } from "./ui.js";

class AuthManager {
  constructor() {
    this.session = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONF_FILE)) {
        const config = JSON.parse(fs.readFileSync(CONF_FILE, "utf-8"));
        this.session = config.auth_session || null;
      }
    } catch (e) {
      this.session = null;
    }
  }

  save(session) {
    this.session = session;
    try {
      const config = JSON.parse(fs.readFileSync(CONF_FILE, "utf-8"));
      config.auth_session = session;
      if (session && session.access_token) {
        if (config.active_provider === "meowcube") {
          config.api_key = session.access_token;
        }
      }
      fs.writeFileSync(CONF_FILE, JSON.stringify(config, null, 2));
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
