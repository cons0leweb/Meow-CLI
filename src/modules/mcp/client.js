import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { log, ERROR } from "../ui.js";

/**
 * MCP Client using the official SDK.
 */
export class McpClient {
  constructor(name, command, args = [], env = {}) {
    this.name = name;
    this.command = command;
    this.args = args;
    // Merge process.env to ensure variables like FIGMA_ACCESS_TOKEN are passed
    // if they are in the environment but not explicitly in config.
    this.env = { ...process.env, ...env };
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.status = "stopped";
  }

  async start() {
    try {
      let finalCommand = this.command;
      let finalArgs = [...this.args];

      // If the command string contains spaces and no arguments were provided,
      // it's likely a full command line that needs splitting for spawn() with shell: false.
      if (finalCommand.includes(" ") && finalArgs.length === 0) {
        // Simple split, handles most cases like "npx -y @mcp/server-figma"
        const parts = finalCommand.split(/\s+/);
        finalCommand = parts[0];
        finalArgs = parts.slice(1);
      }

      this.transport = new StdioClientTransport({
        command: finalCommand,
        args: finalArgs,
        env: this.env,
      });

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
