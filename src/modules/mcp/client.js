import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { log, ERROR } from "../ui.js";

/**
 * MCP Client using the official SDK.
 */
export class McpClient {
  constructor(name, config = {}) {
    this.name = name;
    this.command = config.command;
    this.args = config.args || [];
    this.env = { ...process.env, ...(config.env || {}) };
    this.url = config.url;
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.status = "stopped";
  }

  async start() {
    try {
      if (this.url) {
        this.transport = new SSEClientTransport(new URL(this.url));
      } else if (this.command) {
        let finalCommand = this.command;
        let finalArgs = [...this.args];

        // If the command string contains spaces, it's likely a full command line 
        // that needs splitting for spawn() with shell: false.
        if (finalCommand.includes(" ")) {
          const parts = finalCommand.split(/\s+/);
          finalCommand = parts[0];
          finalArgs = [...parts.slice(1), ...finalArgs];
        }

        this.transport = new StdioClientTransport({
          command: finalCommand,
          args: finalArgs,
          env: this.env,
        });
      } else {
        throw new Error("No command or URL provided for MCP server");
      }

      this.client = new Client(
        {
          name: "meowcli",
          version: "3.0.0",
        },
        {
          capabilities: {},
        }
      );

      this.status = "starting";
      await this.client.connect(this.transport);
      
      this.status = "running";
      await this.refreshTools();

      return true;
    } catch (e) {
      log.dim(`${ERROR("Failed to start MCP server (" + this.name + "):")} ${e.message}`);
      this.status = "error";
      return false;
    }
  }

  async stop() {
    try {
      if (this.transport) {
        await this.transport.close();
      }
    } catch (e) {
      // Ignore errors during stop
    } finally {
      this.transport = null;
      this.client = null;
      this.status = "stopped";
    }
  }

  async refreshTools() {
    if (this.status !== "running") return [];
    try {
      const result = await this.client.listTools();
      this.tools = result.tools || [];
      return this.tools;
    } catch (e) {
      log.dim(`${ERROR("Failed to fetch tools from MCP server (" + this.name + "):")} ${e.message}`);
      return [];
    }
  }

  async callTool(name, args) {
    if (this.status !== "running") throw new Error(`MCP server ${this.name} is not running`);
    // The SDK expects { name, arguments }
    return await this.client.callTool({
      name,
      arguments: args
    });
  }
}
