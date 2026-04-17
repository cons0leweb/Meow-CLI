import { select, text, isCancel, confirm, log as clackLog } from "@clack/prompts";
import { mcpManager } from "../mcp/manager.js";
import { log, SUCCESS, WARNING, ERROR, MUTED, C, ACCENT, TEXT_DIM, box, table } from "../ui.js";
import { saveConfig } from "../persistence.js";

/**
 * Handler for /mcp command.
 */
export async function mcpHandler(ctx, input) {
  const parts = input.split(/\s+/);
  const action = parts[1];

  if (!action) {
    await interactiveMenu(ctx);
    return { handled: true };
  }

  switch (action) {
    case "list":
    case "status":
      showStatus();
      break;
    case "add":
      const name = parts[2];
      const urlIdx = parts.indexOf("--url");
      if (name && urlIdx !== -1 && parts[urlIdx + 1]) {
        const url = parts[urlIdx + 1];
        await addServerDirect(ctx, name, { url, enabled: true });
      } else {
        await addServer(ctx, name);
      }
      break;
    case "remove":
      const removeName = parts[2];
      if (removeName) {
        await removeServerDirect(ctx, removeName);
      } else {
        await removeServer(ctx);
      }
      break;
    case "refresh":
      await refreshTools();
      break;
    default:
      log.err("Unknown MCP action. Use /mcp for interactive menu.");
  }

  return { handled: true };
}

async function addServerDirect(ctx, name, serverCfg) {
  const spinner = clackLog.step(`Connecting to MCP server '${name}'...`);
  const success = await mcpManager.addServer(name, serverCfg);
  
  if (success) {
    ctx.cfg.mcp_servers = ctx.cfg.mcp_servers || {};
    ctx.cfg.mcp_servers[name] = serverCfg;
    saveConfig(ctx.cfg);
    log.ok(`Server '${name}' added and connected.`);
  } else {
    log.err(`Failed to connect to server '${name}'.`);
  }
}

async function removeServerDirect(ctx, name) {
  const success = await mcpManager.removeServer(name);
  if (success) {
    if (ctx.cfg.mcp_servers) {
      delete ctx.cfg.mcp_servers[name];
      saveConfig(ctx.cfg);
    }
    log.ok(`Server '${name}' removed.`);
  } else {
    log.err(`Server '${name}' not found.`);
  }
}

async function interactiveMenu(ctx) {
  const choice = await select({
    message: "MCP Server Management",
    options: [
      { value: "status", label: "📊 Show Status", hint: "List connected servers and tools" },
      { value: "add", label: "➕ Add Server", hint: "Connect to a new MCP server" },
      { value: "remove", label: "❌ Remove Server", hint: "Disconnect and remove a server" },
      { value: "refresh", label: "🔄 Refresh Tools", hint: "Reload tools from all servers" },
      { value: "back", label: "↩ Back", hint: "Return to chat" }
    ]
  });

  if (isCancel(choice) || choice === "back") return;

  switch (choice) {
    case "status":
      showStatus();
      break;
    case "add":
      await addServer(ctx);
      break;
    case "remove":
      await removeServer(ctx);
      break;
    case "refresh":
      await refreshTools();
      break;
  }
}

function showStatus() {
  const servers = mcpManager.getStatus();
  if (servers.length === 0) {
    log.info("No MCP servers configured.");
    return;
  }

  console.log(`\n  ${ACCENT.bold("MCP Servers Status")}`);
  const rows = servers.map(s => [
    s.name,
    s.status === "running" ? SUCCESS(s.status) : (s.status === "error" ? ERROR(s.status) : WARNING(s.status)),
    String(s.tools),
    TEXT_DIM(s.command || "N/A")
  ]);

  console.log(table(
    ["Name", "Status", "Tools", "Command/URL"],
    rows
  ));
}

async function addServer(ctx, initialName) {
  const name = initialName || await text({
    message: "Server Name",
    placeholder: "e.g. figma, filesystem",
    validate: (v) => !v ? "Name is required" : undefined
  });
  if (isCancel(name)) return;

  const type = await select({
    message: "Connection Type",
    options: [
      { value: "stdio", label: "Local (stdio)", hint: "Run a local command (e.g. npx)" },
      { value: "sse", label: "Remote (SSE)", hint: "Connect to a URL (HTTPS)" }
    ]
  });
  if (isCancel(type)) return;

  let serverCfg = { enabled: true };

  if (type === "sse") {
    const url = await text({
      message: "Server URL",
      placeholder: "https://mcp-server.example.com/sse",
      validate: (v) => !v ? "URL is required" : undefined
    });
    if (isCancel(url)) return;
    serverCfg.url = url;
  } else {
    const command = await text({
      message: "Command",
      placeholder: "e.g. npx -y @modelcontextprotocol/server-figma",
      validate: (v) => !v ? "Command is required" : undefined
    });
    if (isCancel(command)) return;

    const argsInput = await text({
      message: "Arguments (optional, space separated)",
      placeholder: "--some-flag value"
    });
    if (isCancel(argsInput)) return;

    const envInput = await text({
      message: "Env Vars (optional, KEY=VAL, comma separated)",
      placeholder: "FIGMA_TOKEN=..., OTHER=..."
    });
    if (isCancel(envInput)) return;

    const args = argsInput ? argsInput.split(" ") : [];
    const env = {};
    if (envInput) {
      envInput.split(",").forEach(pair => {
        const [k, v] = pair.trim().split("=");
        if (k && v) env[k] = v;
      });
    }
    serverCfg.command = command;
    serverCfg.args = args;
    serverCfg.env = env;
  }
  
  await addServerDirect(ctx, name, serverCfg);
}

async function removeServer(ctx) {
  const servers = mcpManager.getStatus();
  if (servers.length === 0) {
    log.info("No servers to remove.");
    return;
  }

  const name = await select({
    message: "Select server to remove",
    options: servers.map(s => ({ value: s.name, label: s.name }))
  });

  if (isCancel(name)) return;

  const confirmed = await confirm({
    message: `Are you sure you want to remove MCP server '${name}'?`
  });

  if (confirmed) {
    await removeServerDirect(ctx, name);
  }
}

async function refreshTools() {
  const spinner = clackLog.step("Refreshing tools...");
  for (const [name, client] of mcpManager.servers.entries()) {
    await client.refreshTools();
  }
  log.ok("Tools refreshed.");
}
