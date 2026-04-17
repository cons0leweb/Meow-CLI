import { spawn } from "child_process";
import { log, ERROR, MUTED } from "../ui.js";

/**
 * Basic stdio-based MCP Client.
 */
export class McpClient {
  constructor(name, command, args = [], env = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
    this.process = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.buffer = "";
    this.tools = [];
    this.status = "stopped";
  }

  async start() {
    try {
      this.process = spawn(this.command, this.args, {
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true
      });

      this.process.stdout.on("data", (data) => this._handleData(data));
      this.process.stderr.on("data", (data) => {
        // MCP servers often use stderr for logging
        // log(`${MUTED("[MCP:" + this.name + "]")} ${data.toString().trim()}`);
      });

      this.process.on("error", (err) => {
        log(`${ERROR("MCP Server Error (" + this.name + "):")} ${err.message}`);
        this.status = "error";
      });

      this.process.on("exit", (code) => {
        this.status = "stopped";
        if (code !== 0 && code !== null) {
          log(`${ERROR("MCP Server (" + this.name + ") exited with code " + code)}`);
        }
      });

      this.status = "starting";

      // Initialize MCP connection (wait for server to be ready)
      // Standard MCP initialization: initialize request
      const initResult = await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "meowcli", version: "3.0.0" }
      });

      await this.notification("notifications/initialized", {});
      
      this.status = "running";
      
      // Fetch available tools
      await this.refreshTools();

      return true;
    } catch (e) {
      log(`${ERROR("Failed to start MCP server (" + this.name + "):")} ${e.message}`);
      this.status = "error";
      return false;
    }
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.status = "stopped";
    }
  }

  async refreshTools() {
    if (this.status !== "running") return [];
    try {
      const result = await this.request("tools/list", {});
      this.tools = result.tools || [];
      return this.tools;
    } catch (e) {
      log(`${ERROR("Failed to fetch tools from MCP server (" + this.name + "):")} ${e.message}`);
      return [];
    }
  }

  async callTool(name, args) {
    if (this.status !== "running") throw new Error(`MCP server ${this.name} is not running`);
    return await this.request("tools/call", {
      name,
      arguments: args
    });
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        return reject(new Error("Server process not available"));
      }

      const id = this.requestId++;
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  notification(method, params) {
    if (!this.process || !this.process.stdin.writable) return;
    const notification = {
      jsonrpc: "2.0",
      method,
      params
    };
    this.process.stdin.write(JSON.stringify(notification) + "\n");
  }

  _handleData(data) {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop(); // Keep the last partial line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const { resolve, reject } = this.pendingRequests.get(response.id);
          this.pendingRequests.delete(response.id);
          if (response.error) {
            reject(new Error(response.error.message || "Unknown MCP error"));
          } else {
            resolve(response.result);
          }
        } else if (response.method) {
          // Handle server-to-client notifications if needed
        }
      } catch (e) {
        // Ignore non-JSON lines or parse errors
      }
    }
  }
}
