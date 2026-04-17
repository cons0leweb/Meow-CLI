import { McpClient } from "./client.js";
import { log, SUCCESS, WARNING, MUTED } from "../ui.js";

class McpManager {
  constructor() {
    this.servers = new Map();
  }

  async init(cfg) {
    const mcpConfig = cfg.mcp_servers || {};
    for (const [name, serverCfg] of Object.entries(mcpConfig)) {
      if (serverCfg.enabled === false) continue;
      await this.addServer(name, serverCfg);
    }
  }

  async addServer(name, serverCfg) {
    if (this.servers.has(name)) {
      await this.servers.get(name).stop();
    }

    const client = new McpClient(name, serverCfg);
    this.servers.set(name, client);
    const success = await client.start();
    if (success) {
      // log(`${SUCCESS("MCP:")} Connected to ${name} (${client.tools.length} tools)`);
    }
    return success;
  }

  async removeServer(name) {
    if (this.servers.has(name)) {
      await this.servers.get(name).stop();
      this.servers.delete(name);
      return true;
    }
    return false;
  }

  getAllTools() {
    const allTools = [];
    for (const [serverName, client] of this.servers.entries()) {
      if (client.status === "running") {
        for (const tool of client.tools) {
          // Wrap tool definition to include server info for routing
          allTools.push({
            type: "function",
            function: {
              name: `mcp__${serverName}__${tool.name}`,
              description: `[MCP: ${serverName}] ${tool.description}`,
              parameters: tool.inputSchema
            }
          });
        }
      }
    }
    return allTools;
  }

  async executeMcpTool(fullName, args) {
    const parts = fullName.split("__");
    if (parts.length < 3 || parts[0] !== "mcp") {
      throw new Error(`Invalid MCP tool name: ${fullName}`);
    }

    const serverName = parts[1];
    const toolName = parts.slice(2).join("__");

    const client = this.servers.get(serverName);
    if (!client) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    const result = await client.callTool(toolName, args);
    
    // MCP results are usually { content: [ { type: 'text', text: '...' } ], isError: false }
    if (result.content && Array.isArray(result.content)) {
      const text = result.content.map(c => c.text || JSON.stringify(c)).join("\n");
      return result.isError ? `Error: ${text}` : text;
    }
    
    return JSON.stringify(result);
  }

  getStatus() {
    const status = [];
    for (const [name, client] of this.servers.entries()) {
      status.push({
        name,
        status: client.status,
        tools: client.tools.length,
        command: client.url || client.command
      });
    }
    return status;
  }
}

export const mcpManager = new McpManager();
