import { COMMANDS } from "./cli-input.js";
import {
  ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, MUTED,
  TEXT, TEXT_DIM, AUTO_CLR, INFO, C, COLS, box, table, list, log, stripAnsi, 
  MEOW_GRADIENT, AI_GRADIENT
} from "./ui.js";
import { t } from "./config.js";
import { listPlugins } from "./plugins.js";
import { mcpManager } from "./mcp/manager.js";
import { getVersionDisplay } from "./updater.js";

function banner(cfg, currentChat, historyLen, pinsCount = 0) {
  console.clear();
  const logoText = `
  ╔╦╗╔═╗╔═╗╦ ╦  ╔═╗╦  ╦
  ║║║║╣ ║ ║║║║  ║  ║  ║
  ╩ ╩╚═╝╚═╝╚╩╝  ╚═╝╩═╝╩
  `;
  console.log(MEOW_GRADIENT(logoText));
  console.log(`  ${MUTED(t(cfg, "banner_subtitle"))}`);
  console.log(`  ${MUTED("─".repeat(Math.min(COLS - 4, 50)))}`);
  const pairs = [
    [`model`,   `${ACCENT(cfg.model)}`],
    [`prov`,    `${ACCENT3(cfg.active_provider || "manual")}`],
    [`profile`, `${ACCENT2(cfg.profile)}`],
    [`chat`,    `${SUCCESS(currentChat)}`],
    [`msgs`,    `${TEXT_DIM(historyLen)}`],
  ];
  if (pinsCount > 0) pairs.push([`pins`, `${TEXT_DIM(pinsCount)}`]);
  pairs.unshift([`ver`, `${MUTED(getVersionDisplay())}`]);
  const statusLine = pairs.map(([k, v]) => `${MUTED(k + ":")} ${v}`).join(`  ${MUTED("·")}  `);
  console.log(`  ${statusLine}`);
  if (!cfg.api_key) {
    console.log("");
    console.log(box(`${C.bold(WARNING(t(cfg, "api_key_missing_title")))}\n${TEXT_DIM(t(cfg, "api_key_missing_hint"))}`, { title: "⚠ Setup Required", color: "#DEB858", width: Math.min(COLS - 2, 55) }));
  }
  // Quick tips — much more useful than just "Type /help"
  console.log(`\n  ${MUTED("─".repeat(Math.min(COLS - 4, 50)))}`);
  console.log(`  ${TEXT_DIM("Just type to chat  ·  ")}${ACCENT("/ap <task>")} ${TEXT_DIM("autopilot  ·  ")}${ACCENT("/clear")} ${TEXT_DIM("reset  ·  ")}${ACCENT("?")} ${TEXT_DIM("help")}`);
  console.log(`  ${MUTED("Tab")} ${TEXT_DIM("autocomplete  ·  ")}${MUTED("/help <topic>")} ${TEXT_DIM("e.g. /help chat, /help settings")}\n`);
}

/**
 * All help sections — used by printHelp for both overview and filtered views.
 */
const HELP_SECTIONS = (cfg) => [
  {
    key: "chat",
    title: t(cfg, "help_title_chat"),
    emoji: "💬",
    summary: "Manage conversations and context",
    items: [
      ["/clear",              t(cfg, "cmd_clear")],
      ["/reset",              "Reset chat context"],
      ["/chat list",          t(cfg, "cmd_chat_list")],
      ["/chat new [name]",    t(cfg, "cmd_chat_new")],
      ["/chat use <name>",    t(cfg, "cmd_chat_use")],
      ["/chat delete <name>", t(cfg, "cmd_chat_delete")],
      ["/compact",            t(cfg, "cmd_compact")],
      ["/compact --ai",       "AI-powered context compression"],
    ]
  },
  {
    key: "autopilot",
    title: t(cfg, "help_title_autopilot"),
    emoji: "🤖",
    summary: "Autonomous AI task execution",
    items: [
      ["/autopilot <task>",   t(cfg, "cmd_autopilot")],
      ["/ap <task>",          t(cfg, "cmd_autopilot_short")],
      ["/ap-config",          t(cfg, "cmd_ap_config")],
      ["/ap-limit <N>",       t(cfg, "cmd_ap_limit")],
      ["/ap-errors <N>",      t(cfg, "cmd_ap_errors")],
      ["/trigger <cmd|off>",  t(cfg, "cmd_trigger")],
      ["Ctrl+C",              t(cfg, "cmd_ctrl_c")],
    ]
  },
  {
    key: "agents",
    title: "🔀 Agents",
    emoji: "🔀",
    summary: "Multi-agent workflows and pair programming",
    items: [
      ["/lead [opts]",         t(cfg, "cmd_lead")],
      ["/lead --plan",         "Plan mode: list tasks without executing them"],
      ["/lead --focus <area>", "Focus on specific area (security, perf, tests)"],
      ["/lead --tasks <N>",    "Limit number of tasks in this session"],
      ["/delegate <task>",      t(cfg, "cmd_delegate")],
      ["/pair <mode>",          t(cfg, "cmd_pair")],
      ["/ci status",            t(cfg, "cmd_ci")],
      ["/ci generate <desc>",   "Generate GitHub Actions workflow"],
      ["/ci heal",              "Self-heal failing tests"],
    ]
  },
  {
    key: "memory",
    title: "🧠 Memory",
    emoji: "🧠",
    summary: "Project memory and smart model routing",
    items: [
      ["/memory stats",       t(cfg, "cmd_memory")],
      ["/memory search <q>",  "Search project memory"],
      ["/memory prefs",       "Show learned preferences"],
      ["/memory clear",       "Clear project memory"],
      ["/routing",            t(cfg, "cmd_routing")],
      ["/routing on|off",     "Toggle dynamic model selection"],
    ]
  },
  {
    key: "images",
    title: t(cfg, "help_title_images"),
    emoji: "🖼",
    summary: "Send images to the AI",
    items: [
      ["/img <path> [text]",  t(cfg, "cmd_img_path")],
      ["/img <url> [text]",   t(cfg, "cmd_img_url")],
      ["{img:path} text",     t(cfg, "cmd_img_inline")],
    ]
  },
  {
    key: "tools",
    title: t(cfg, "help_title_tools"),
    emoji: "🔧",
    summary: "File system and shell access",
    items: [
      ["/list <path>",  t(cfg, "cmd_list")],
      ["/read <file>",  t(cfg, "cmd_read")],
      ["/shell <cmd>",  t(cfg, "cmd_shell")],
      ["/undo [N]",     t(cfg, "cmd_undo")],
    ]
  },
  {
    key: "security",
    title: "🔒 Security",
    emoji: "🔒",
    summary: "Permissions, context and audit",
    items: [
      ["/permissions",        t(cfg, "cmd_permissions")],
      ["/perm allow <tool>",  "Always allow a tool"],
      ["/perm deny <tool>",   "Always deny a tool"],
      ["/context",            t(cfg, "cmd_context")],
      ["/context edit",       "Edit project MEOW.md"],
      ["/context reload",     "Reload context into prompt"],
      ["/audit",              t(cfg, "cmd_audit")],
      ["/incognito on|off",   t(cfg, "cmd_incognito")],
      ["/trust [grant]",      t(cfg, "cmd_trust")],
    ]
  },
  {
    key: "history",
    title: "⏪ History",
    emoji: "⏪",
    summary: "Sessions, undo and cost tracking",
    items: [
      ["/rewind [N]",        t(cfg, "cmd_rewind")],
      ["/rewind --list",     t(cfg, "cmd_checkpoint")],
      ["/session list",      t(cfg, "cmd_session")],
      ["/session load <id>", "Resume a saved session"],
      ["/session save",      "Save current session"],
      ["/cost",              t(cfg, "cmd_cost")],
      ["/cost total",        "Show all-time cost"],
      ["/export <file>",     t(cfg, "cmd_export")],
      ["/import <file>",     t(cfg, "cmd_import")],
    ]
  },
  {
    key: "settings",
    title: t(cfg, "help_title_settings"),
    emoji: "⚙️",
    summary: "Model, profile, API key and config",
    items: [
      ["/model [name]",      t(cfg, "cmd_model") + ` ${MUTED("(" + cfg.model + ")")}`],
      ["/profile [name]",    t(cfg, "cmd_profile") + ` ${MUTED("(" + cfg.profile + ")")}`],
      ["/assistant <cmd>",   t(cfg, "cmd_assistant")],
      ["/temp [0.0-2.0]",    t(cfg, "cmd_temp")],
      ["/key [sk-...]",      t(cfg, "cmd_key")],
      ["/url [http...]",     t(cfg, "cmd_url")],
      ["/provider",          t(cfg, "cmd_provider")],
      //["/login",             t(cfg, "cmd_login")],
      ["/logout",            t(cfg, "cmd_logout")],
      ["/whoami",            t(cfg, "cmd_whoami")],
      ["/mcp",               t(cfg, "cmd_mcp")],
      ["/lang <ru|en>",      "Switch UI language"],
      ["/theme [name]",      t(cfg, "cmd_theme")],
      ["/config",            t(cfg, "cmd_config")],
      ["/saveconfig",        t(cfg, "cmd_saveconfig")],
      ["/git [on|off]",      t(cfg, "cmd_git")],
      ["/preview start|stop",t(cfg, "cmd_preview")],
    ]
  },
  {
    key: "other",
    title: t(cfg, "help_title_other"),
    emoji: "📦",
    summary: "Pins, plugins, templates and utilities",
    items: [
      ["/init",              t(cfg, "cmd_init")],
      ["/pins",              t(cfg, "cmd_pins")],
      ["/pin [index]",       t(cfg, "cmd_pin")],
      ["/plugin [cmd]",      t(cfg, "cmd_plugin")],
      ["/optimize",          t(cfg, "cmd_optimize")],
      ["/template <name>",   t(cfg, "cmd_template")],
      ["/vacuum [opts]",     t(cfg, "cmd_vacuum")],
      ["/alias",             t(cfg, "cmd_alias")],
      ["/stats",             t(cfg, "cmd_stats")],
      ["/version",           "Show current version & check for updates"],
      ["/update",            "Check for and show update instructions"],
      ["/help [topic]",      t(cfg, "cmd_help")],
      ["/exit",              t(cfg, "cmd_exit")],
    ]
  },
];

function printHelp(cfg, topic) {
  const sections = HELP_SECTIONS(cfg);

  // Filtered help: /help chat, /help settings, etc.
  if (topic) {
    const q = topic.toLowerCase().trim();
    const match = sections.find(s =>
      s.key === q ||
      s.title.toLowerCase().includes(q) ||
      s.emoji === q
    );
    if (match) {
      log.br();
      console.log(`  ${C.bold(AI_GRADIENT(stripAnsi(match.title)))}\n`);
      table(match.items.map(([cmd, desc]) => [`${TEXT.bold(cmd)}`, `${MUTED(desc)}`]), { indent: 4, colWidths: [26] });
      log.br();
      return;
    }
    // No match — show overview with hint
    log.warn(`Unknown topic "${topic}". Showing overview.`);
    log.br();
  }

  // Compact overview: categories + top commands
  log.br();
  console.log(`  ${C.bold(AI_GRADIENT("Commands"))}  ${MUTED("· /help <topic> for details")}\n`);

  // Show categories in a grid
  const catRows = [];
  for (let i = 0; i < sections.length; i += 2) {
    const left  = sections[i];
    const right = sections[i + 1];
    const leftStr  = `${TEXT.bold(left.key.padEnd(10))} ${MUTED(left.summary)}`;
    const rightStr = right ? `${TEXT.bold(right.key.padEnd(10))} ${MUTED(right.summary)}` : "";
    catRows.push([leftStr, rightStr]);
  }
  table(catRows, { indent: 4, colWidths: [42] });

  log.br();
  console.log(`  ${MUTED("─".repeat(Math.min(COLS - 4, 55)))}`);

  // Quick-reference: most commonly used commands
  console.log(`\n  ${C.bold(TEXT_DIM("Quick reference"))}\n`);
  const quickItems = [
    ["/ap <task>",        "Autonomous task execution (autopilot)"],
    ["/clear",            "Start fresh conversation"],
    ["/chat new [name]",  "Create a new chat"],
    ["/model <name>",     "Switch AI model"],
    ["/init",             "Index project → MEOW.md + project.meow"],
    ["/rewind",           "Undo last AI file changes"],
    ["/cost",             "Show token usage & cost"],
    ["/q",                "Quit"],
  ];
  table(quickItems.map(([cmd, desc]) => [`${ACCENT.bold(cmd)}`, `${TEXT_DIM(desc)}`]), { indent: 4, colWidths: [22] });

  log.br();

  // Aliases hint
  const aliasEntries = Object.entries(cfg.aliases).slice(0, 8);
  if (aliasEntries.length > 0) {
    const aliasStr = aliasEntries.map(([a, b]) => `${ACCENT(a)}${MUTED("→")}${TEXT_DIM(b)}`).join(`  `);
    console.log(`  ${MUTED("aliases:")} ${aliasStr}`);
    console.log(`  ${MUTED("         /alias to see all")}\n`);
  }
}

function printStats(cfg, currentChat, historyLen, pinsCount = 0) {
  log.br();
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const vac = cfg.vacuum || {};
  const pluginSummary = getPluginSummary(cfg);
  let mcpCount = 0;
  try {
    mcpCount = mcpManager.getStatus().filter(s => s.status === "running").length;
  } catch {}
  const rows = [
    ["Chat", `${SUCCESS(currentChat)}`], ["Messages", `${TEXT(historyLen)}`], ["Model", `${ACCENT(cfg.model)}`], ["Profile", `${ACCENT2(cfg.profile)}`], ["Provider", `${ACCENT3(cfg.active_provider || "manual")}`], ["MCP Servers", `${mcpCount > 0 ? SUCCESS(mcpCount) : MUTED("none")}`], ["Temperature", `${TEXT(profile.temperature)}`], ["API Base", `${MUTED(cfg.api_base)}`],
    ["API Key", cfg.api_key ? `${SUCCESS("set")} ${MUTED("(" + cfg.api_key.slice(0, 8) + "…)")}` : `${ERROR("not set")}`],
    ["Auto-yes", cfg.auto_yes ? `${SUCCESS("on")}` : `${MUTED("off")}`], ["Git Autocommit", cfg.git?.autocommit === false ? `${MUTED("off")}` : `${SUCCESS("on")}`], ["AP Limit", `${AUTO_CLR(cfg.autopilot?.max_iterations || 50)}`], ["Plugins", `${TEXT(pluginSummary)}`],
    ["Vacuum", `${vac.enabled ? SUCCESS("on") : MUTED("off")} ${MUTED("(drop " + (vac.drop_count || 0) + ", keep " + (vac.keep_last || 0) + ")")}`], ["Pins", `${TEXT(pinsCount)}`], ["CWD", `${MUTED(process.cwd())}`],
  ];
  console.log(`  ${C.bold(AI_GRADIENT(stripAnsi(t(cfg, "stats_title"))))}`);
  console.log(`  ${MUTED("─".repeat(50))}`);
  table(rows.map(([label, value]) => [`${TEXT_DIM(label)}`, value]), { colWidths: [18] });
  console.log(`  ${MUTED("─".repeat(50))}\n`);
}

function getPluginSummary(cfg) {
  const plugins = listPlugins();
  const total = plugins.length;
  if (total === 0) return `${MUTED("none")}`;
  const enabled = plugins.filter(p => p.enabled).length;
  const disabled = total - enabled;
  const disabledList = cfg.plugins?.disabled || [];
  const pending = disabledList.filter(name => !plugins.some(p => p.name === name)).length;
  const parts = [`${enabled}/${total}`];
  if (disabled > 0) parts.push(`${disabled} off`);
  if (pending > 0) parts.push(`${pending} missing`);
  return parts.join(` ${MUTED("·")} `);
}

function printChatList(state) {
  const names = Object.keys(state.chats || {}).sort();
  if (names.length === 0) { log.dim("No chats yet."); return; }
  log.br();
  console.log(`  ${C.bold(AI_GRADIENT("Chats"))}`);
  console.log(`  ${MUTED("─".repeat(45))}`);
  const rows = names.map(name => {
    const msgs = (state.chats[name] || []).length;
    const isCurrent = name === state.current;
    const indicator = isCurrent ? `${SUCCESS("●")}` : `${MUTED("○")}`;
    const nameColor = isCurrent ? SUCCESS.bold : TEXT;
    return [indicator, `${nameColor(name)}`, `${MUTED(msgs + " msgs")}`];
  });
  table(rows, { colSpacing: 1 });
  console.log(`  ${MUTED("─".repeat(45))}\n`);
}

function printConfig(cfg) {
  console.log("");
  console.log(`  ${C.bold(AI_GRADIENT("Configuration"))}`);
  console.log(`  ${MUTED("─".repeat(50))}`);
  const safe = { ...cfg, api_key: cfg.api_key ? cfg.api_key.slice(0, 8) + "…" : "(not set)" };
  const json = JSON.stringify(safe, null, 2);
  for (const line of json.split("\n")) {
    const colored = line.replace(/\"([^"]+)\":/g, (m, p1) => `${ACCENT("\"" + p1 + "\"")}:`).replace(/: \"([^"]+)\"/g, (m, p1) => `: ${SUCCESS("\"" + p1 + "\"")}`).replace(/: (\d+\.?\d*)/g, (m, p1) => `: ${WARNING(p1)}`).replace(/: (true|false)/g, (m, p1) => `: ${INFO(p1)}`).replace(/: (null)/g, (m, p1) => `: ${MUTED(p1)}`);
    console.log(`  ${colored}`);
  }
  console.log(`  ${MUTED("─".repeat(50))}\n`);
}

function printAutopilotConfig(cfg) {
  const ap = cfg.autopilot || {};
  log.br();
  console.log(`  ${C.bold(AI_GRADIENT("🤖 Autopilot Configuration"))}`);
  console.log(`  ${MUTED("─".repeat(45))}`);
  const rows = [["Max iterations", `${AUTO_CLR(ap.max_iterations || 50)}`], ["Max errors", `${AUTO_CLR(ap.max_errors || 5)}`], ["Retry delay", `${AUTO_CLR((ap.retry_delay_ms || 2000) + "ms")}`], ["Save logs", ap.save_log !== false ? `${SUCCESS("yes")}` : `${MUTED("no")}`], ["Trigger cmd", ap.trigger_cmd ? `${TEXT(ap.trigger_cmd)}` : `${MUTED("(off)")}`], ["Log dir", `${MUTED("~/.meowcli/data/logs/")}`]];
  table(rows.map(([label, value]) => [`${TEXT_DIM(label)}`, value]), { colWidths: [18] });
  console.log(`  ${MUTED("─".repeat(45))}\n`);
}

function makePrompt(cfg, currentChat, historyLen = 0) {
  const modelShort = cfg.model.length > 18 ? cfg.model.slice(0, 15) + "…" : cfg.model;
  return `${currentChat} · ${modelShort} · ${historyLen} msgs`;
}

export { banner, printHelp, printStats, printChatList, printConfig, printAutopilotConfig, makePrompt };
