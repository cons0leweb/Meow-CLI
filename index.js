#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════╗
 * ║          M E O W   C L I            ║
 * ║   Terminal AI Assistant for Devs    ║
 * ╚══════════════════════════════════════╝
 */

import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { createTwoFilesPatch } from "diff";
import { exec } from "child_process";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

// ─── Theme & Styling ────────────────────────────────────────────────────────

const C = {
  reset:     "\x1b[0m",
  bold:      "\x1b[1m",
  dim:       "\x1b[2m",
  italic:    "\x1b[3m",
  underline: "\x1b[4m",
  blink:     "\x1b[5m",
  inverse:   "\x1b[7m",
  hidden:    "\x1b[8m",
  strike:    "\x1b[9m",

  black:   "\x1b[30m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",

  bgBlack:   "\x1b[40m",
  bgRed:     "\x1b[41m",
  bgGreen:   "\x1b[42m",
  bgYellow:  "\x1b[43m",
  bgBlue:    "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan:    "\x1b[46m",
  bgWhite:   "\x1b[47m",

  brightBlack:   "\x1b[90m",
  brightRed:     "\x1b[91m",
  brightGreen:   "\x1b[92m",
  brightYellow:  "\x1b[93m",
  brightBlue:    "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan:    "\x1b[96m",
  brightWhite:   "\x1b[97m",
};

const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

const ACCENT    = rgb(139, 92, 246);
const ACCENT2   = rgb(99, 102, 241);
const ACCENT3   = rgb(236, 72, 153);
const SUCCESS   = rgb(34, 197, 94);
const WARNING   = rgb(250, 204, 21);
const ERROR     = rgb(239, 68, 68);
const INFO      = rgb(56, 189, 248);
const MUTED     = rgb(115, 115, 115);
const SURFACE   = rgb(38, 38, 38);
const TEXT      = rgb(229, 229, 229);
const TEXT_DIM  = rgb(163, 163, 163);
const TOOL_CLR  = rgb(251, 191, 36);
const USER_CLR  = rgb(96, 165, 250);
const AI_CLR    = rgb(167, 139, 250);
const IMG_CLR   = rgb(244, 114, 182);
const AUTO_CLR  = rgb(251, 146, 60);  // orange-400 for autopilot

const COLS = Math.min(process.stdout.columns || 80, 100);

marked.setOptions({
  renderer: new TerminalRenderer({
    code: (code) => `\n${code}\n`,
    blockquote: (quote) => `  ${MUTED}│${C.reset} ${quote}\n`,
    heading: (text, level) => {
      const icons = ["", "◆", "◇", "▸", "▹", "·", "·"];
      return `\n${ACCENT}${C.bold}${icons[level] || "▸"} ${text}${C.reset}\n`;
    },
    hr: () => `\n${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}\n`,
  })
});

// ─── Box Drawing Helpers ────────────────────────────────────────────────────

function box(content, { title = "", color = ACCENT, width = COLS - 2, padding = 1 } = {}) {
  const w = Math.max(width, 20);
  const inner = w - 2;
  const pad = " ".repeat(padding);

  const top = title
    ? `${color}╭─ ${C.bold}${title}${C.reset}${color} ${"─".repeat(Math.max(0, inner - title.length - 3))}╮${C.reset}`
    : `${color}╭${"─".repeat(inner)}╮${C.reset}`;
  const bot = `${color}╰${"─".repeat(inner)}╯${C.reset}`;

  const lines = content.split("\n").map(line => {
    const stripped = stripAnsi(line);
    const space = Math.max(0, inner - padding * 2 - stripped.length);
    return `${color}│${C.reset}${pad}${line}${" ".repeat(space)}${pad}${color}│${C.reset}`;
  });

  return [top, ...lines, bot].join("\n");
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function centerText(text, width = COLS) {
  const len = stripAnsi(text).length;
  const pad = Math.max(0, Math.floor((width - len) / 2));
  return " ".repeat(pad) + text;
}

function divider(char = "─", color = MUTED, width = COLS - 2) {
  return `${color}${char.repeat(width)}${C.reset}`;
}

function badge(text, bg = ACCENT, fg = C.white) {
  return `${bg}${bgRgb(88, 28, 135)}${fg}${C.bold} ${text} ${C.reset}`;
}

function tag(text, color = ACCENT) {
  return `${color}[${text}]${C.reset}`;
}

function pill(text, color = ACCENT) {
  return `${color}(${text})${C.reset}`;
}

// ─── Spinner ────────────────────────────────────────────────────────────────

class Spinner {
  constructor(text = "Thinking") {
    this.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.text = text;
    this.i = 0;
    this.timer = null;
    this.startTime = 0;
  }

  start() {
    this.startTime = Date.now();
    this.i = 0;
    process.stdout.write("\x1b[?25l");
    this.timer = setInterval(() => {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const frame = this.frames[this.i % this.frames.length];
      const gradient = this.i % 2 === 0 ? ACCENT : ACCENT2;
      process.stdout.write(`\r${gradient}${frame}${C.reset} ${TEXT_DIM}${this.text}${MUTED} ${elapsed}s${C.reset}  `);
      this.i++;
    }, 80);
  }

  update(text) { this.text = text; }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stdout.write("\r" + " ".repeat(COLS - 1) + "\r");
    process.stdout.write("\x1b[?25h");
  }
}

// ─── Logger ─────────────────────────────────────────────────────────────────

const log = {
  info: (s) => console.log(`  ${INFO}●${C.reset} ${TEXT}${s}${C.reset}`),
  ok:   (s) => console.log(`  ${SUCCESS}✓${C.reset} ${TEXT}${s}${C.reset}`),
  warn: (s) => console.log(`  ${WARNING}▲${C.reset} ${C.bold}${WARNING}${s}${C.reset}`),
  err:  (s) => console.log(`  ${ERROR}✗${C.reset} ${C.bold}${ERROR}${s}${C.reset}`),
  dim:  (s) => console.log(`  ${MUTED}${s}${C.reset}`),
  tool: (name, args) => {
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 60 ? argsStr.slice(0, 57) + "..." : argsStr;
    console.log(`  ${TOOL_CLR}⚡${C.reset} ${TOOL_CLR}${name}${C.reset} ${MUTED}${short}${C.reset}`);
  },
  img: (filePath, size) => {
    console.log(`  ${IMG_CLR}🖼${C.reset}  ${IMG_CLR}${path.basename(filePath)}${C.reset} ${MUTED}(${size})${C.reset}`);
  },
  auto: (s) => console.log(`  ${AUTO_CLR}🤖${C.reset} ${AUTO_CLR}${s}${C.reset}`),
  step: (n, total, text) => {
    const bar = `${ACCENT}[${"█".repeat(n)}${"░".repeat(total - n)}]${C.reset}`;
    console.log(`  ${bar} ${TEXT_DIM}${text}${C.reset}`);
  }
};

// ─── Config & State ─────────────────────────────────────────────────────────

const HIST_FILE = path.join(os.homedir(), ".meowcli_history.json");
const CONF_FILE = path.join(os.homedir(), ".meowcli.json");

const DEFAULT_CONFIG = {
  api_base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  api_key: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4-turbo",
  auto_yes: process.env.AI_AUTO_YES === "1",
  quiet: false,
  profile: "default",
  autopilot: {
    max_iterations: 50,
    max_errors: 5,
    retry_delay_ms: 2000,
    save_log: true,
    trigger_cmd: "",
  },
  profiles: {
    default: {
      temperature: 0.2,
      system: "Ты — опытный инженер-программист. Твои ответы кратки, точны и по существу. Используй инструменты для работы с файлами и системой."
    },
    creative: {
      temperature: 0.7,
      system: "Ты — креативный помощник. Предлагай нестандартные идеи и развернутые объяснения."
    }
  },
  aliases: {
    "/h": "/help",
    "/q": "/exit",
    "/m": "/model",
    "/p": "/profile",
    "/ls": "/list",
    "/cat": "/read",
    "/run": "/shell",
    "/ap": "/autopilot",
    "/auto": "/autopilot",
  },
  templates: {
    "fix": "Исправь ошибку в следующем коде: {code}. Объясни, в чем была проблема.",
    "refactor": "Отрефактори этот файл: {file}. Улучши читаемость и производительность.",
    "explain": "Объясни, что делает этот код: {context}."
  }
};

const TOOLS = [
  { type:"function", function:{ name:"list_dir", description:"Получить список файлов в директории", parameters:{ type:"object", properties:{ path:{type:"string"} }, required:["path"] } } },
  { type:"function", function:{ name:"read_file", description:"Прочитать содержимое файла", parameters:{ type:"object", properties:{ path:{type:"string"} }, required:["path"] } } },
  { type:"function", function:{ name:"write_file", description:"Создать или перезаписать файл", parameters:{ type:"object", properties:{ path:{type:"string"}, content:{type:"string"} }, required:["path","content"] } } },
  { type:"function", function:{ name:"run_shell", description:"Выполнить команду в терминале (Bash)", parameters:{ type:"object", properties:{ cmd:{type:"string"} }, required:["cmd"] } } },
  { type:"function", function:{ name:"http_request", description:"Выполнить HTTP-запрос и вернуть ответ", parameters:{ type:"object", properties:{ url:{type:"string"}, method:{type:"string", enum:["GET","POST","PUT","PATCH","DELETE"]}, headers:{type:"object", additionalProperties:{type:"string"}}, body:{type:"string"}, timeout_ms:{type:"number"} }, required:["url"] } } },
  { type:"function", function:{ name:"web_search", description:"Поиск в интернете (DuckDuckGo)", parameters:{ type:"object", properties:{ query:{type:"string"}, max_results:{type:"number"} }, required:["query"] } } },
  { type:"function", function:{ name:"tool_chain", description:"Выполнить цепочку инструментов последовательно", parameters:{ type:"object", properties:{ steps:{ type:"array", items:{ type:"object", properties:{ tool:{type:"string"}, args:{type:"object"} }, required:["tool"] } } }, required:["steps"] } } }
];

// ─── Image Helpers ──────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
const MIME_TYPES = {
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
  ".gif":"image/gif", ".webp":"image/webp", ".bmp":"image/bmp", ".svg":"image/svg+xml",
};

function isImagePath(p) { return IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase()); }
function isUrl(s) { return /^https?:\/\//i.test(s); }

function encodeImageFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`Not a file: ${resolved}`);
  if (stat.size > 20 * 1024 * 1024) throw new Error(`Image too large (${formatBytes(stat.size)}, max 20MB)`);
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_TYPES[ext] || "image/png";
  const buf = fs.readFileSync(resolved);
  return { url: `data:${mime};base64,${buf.toString("base64")}`, size: formatBytes(stat.size) };
}

function buildVisionContent(text, images) {
  const content = [];
  for (const img of images) {
    if (isUrl(img)) {
      content.push({ type: "image_url", image_url: { url: img, detail: "auto" } });
      log.img(img, "URL");
    } else {
      const encoded = encodeImageFile(img);
      content.push({ type: "image_url", image_url: { url: encoded.url, detail: "auto" } });
      log.img(img, encoded.size);
    }
  }
  content.push({ type: "text", text: text.trim() || "Что на этом изображении?" });
  return content;
}

function parseInlineImages(input) {
  const images = [];
  const text = input.replace(/\{img:([^}]+)\}/g, (_, p) => { images.push(p.trim()); return ""; });
  return { text: text.trim(), images };
}

function simplifyContentForHistory(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content;
  return content.map(part => {
    if (part.type === "image_url" && part.image_url?.url?.startsWith("data:"))
      return { type: "image_url", image_url: { url: "[base64 image]", detail: part.image_url.detail } };
    return part;
  });
}

// ─── Persistence ────────────────────────────────────────────────────────────

function loadJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback; }
  catch { return fallback; }
}

function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { log.err(`Save error: ${e.message}`); }
}

function loadConfig() {
  const cfg = loadJson(CONF_FILE, DEFAULT_CONFIG);
  return {
    ...DEFAULT_CONFIG, ...cfg,
    autopilot: { ...DEFAULT_CONFIG.autopilot, ...(cfg.autopilot || {}) },
    profiles:  { ...DEFAULT_CONFIG.profiles,  ...(cfg.profiles  || {}) },
    templates: { ...DEFAULT_CONFIG.templates, ...(cfg.templates || {}) },
    aliases:   { ...DEFAULT_CONFIG.aliases,   ...(cfg.aliases   || {}) }
  };
}

function saveConfig(cfg) { saveJson(CONF_FILE, cfg); }

function loadHistoryState() {
  const fallback = { current: "default", chats: { default: [] } };
  const data = loadJson(HIST_FILE, fallback);
  if (Array.isArray(data)) return { current: "default", chats: { default: data } };
  if (data && typeof data === "object") {
    const chats = data.chats && typeof data.chats === "object" ? data.chats : {};
    const current = data.current || "default";
    if (!chats[current]) chats[current] = [];
    return { current, chats };
  }
  return fallback;
}

function saveHistoryState(state) { saveJson(HIST_FILE, state); }

// ─── Markdown Renderer ─────────────────────────────────────────────────────

function renderMD(text) {
  try { return marked.parse(text || ""); }
  catch { return text || ""; }
}

// ─── Confirmation Dialog ────────────────────────────────────────────────────

async function confirm(action, detail, auto_yes = false) {
  if (auto_yes) return true;
  return new Promise(resolve => {
    console.log("");
    console.log(box(
      `${WARNING}${C.bold}${action}${C.reset}\n${MUTED}${detail.slice(0, 500)}${detail.length > 500 ? "..." : ""}`,
      { title: "⚠ CONFIRM", color: WARNING, width: Math.min(COLS - 2, 70) }
    ));
    process.stdout.write(`\n  ${TEXT}Execute? ${MUTED}[${SUCCESS}y${MUTED}/${ERROR}N${MUTED}] ${TEXT_DIM}(auto-yes 10s)${C.reset} `);

    const onData = (d) => {
      clearTimeout(timer);
      process.stdin.off("data", onData);
      const answer = d.toString().trim().toLowerCase();
      if (answer === "y") { console.log(`  ${SUCCESS}✓ Confirmed${C.reset}\n`); resolve(true); }
      else { console.log(`  ${ERROR}✗ Cancelled${C.reset}\n`); resolve(false); }
    };

    const timer = setTimeout(() => {
      process.stdin.off("data", onData);
      console.log(`  ${SUCCESS}✓ Auto-confirmed${C.reset}\n`);
      resolve(true);
    }, 10000);

    process.stdin.on("data", onData);
  });
}

// ─── Tool Implementations ───────────────────────────────────────────────────

function listDir(p) {
  try {
    const dir = path.resolve(p);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return `❌ Directory not found: ${dir}`;
    return fs.readdirSync(dir).map(n => {
      try { return fs.statSync(path.join(dir, n)).isDirectory() ? n + "/" : n; } catch { return n; }
    }).sort().join("\n");
  } catch (e) { return `❌ Error: ${e.message}`; }
}

function readFile(p) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return `❌ File not found: ${file}`;
    let data = fs.readFileSync(file, "utf8");
    if (data.length > 50000) data = data.slice(0, 50000) + `\n...[TRUNCATED: ${data.length} bytes]...`;
    return data;
  } catch (e) { return `❌ Read error: ${e.message}`; }
}

async function writeFile(p, content, auto_yes = false) {
  try {
    const file = path.resolve(p);
    const old = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    const diff = createTwoFilesPatch(file, file, old, content, "Old", "New");
    if (diff.trim() && diff.length > 100) {
      const ok = await confirm("Write file: " + file, diff.slice(0, 3000), auto_yes);
      if (!ok) return "❌ Write cancelled.";
    } else if (!fs.existsSync(file)) {
      const ok = await confirm("Create new file", file, auto_yes);
      if (!ok) return "❌ Creation cancelled.";
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
    return `✅ Written: ${file} (${content.length} bytes)`;
  } catch (e) { return `❌ Write error: ${e.message}`; }
}

async function runShell(cmd, auto_yes = false) {
  const ok = await confirm("Shell command", cmd, auto_yes);
  if (!ok) return "❌ Cancelled.";
  return new Promise(resolve => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024, cwd: process.cwd() }, (err, stdout, stderr) => {
      const output = [];
      if (stdout) output.push(`STDOUT:\n${stdout.trim()}`);
      if (stderr) output.push(`STDERR:\n${stderr.trim()}`);
      if (err) output.push(`EXIT CODE: ${err.code}`);
      resolve(output.join("\n\n") || "✅ Done (no output).");
    });
  });
}

async function httpRequest({ url, method = "GET", headers = {}, body = "", timeout_ms = 15000 }, auto_yes = false) {
  if (!url) return "❌ Error: url required";
  const ok = await confirm("HTTP Request", `${method} ${url}`, auto_yes);
  if (!ok) return "❌ Cancelled.";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);
  try {
    const res = await fetch(url, { method, headers, body: body && method !== "GET" && method !== "HEAD" ? body : undefined, signal: controller.signal });
    let data = await res.text();
    if (data.length > 50000) data = data.slice(0, 50000) + `\n...[TRUNCATED]...`;
    const headersObj = {}; res.headers.forEach((v, k) => headersObj[k] = v);
    return [`STATUS: ${res.status} ${res.statusText}`, `HEADERS: ${JSON.stringify(headersObj, null, 2)}`, `BODY:\n${data}`].join("\n\n");
  } catch (e) { return `❌ HTTP Error: ${e.name === "AbortError" ? "Timeout" : e.message}`; }
  finally { clearTimeout(t); }
}

async function webSearch({ query, max_results = 5 }, auto_yes = false) {
  if (!query) return "❌ Error: query required";
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ok = await confirm("Web Search", query, auto_yes);
  if (!ok) return "❌ Cancelled.";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "meowcli/1.0" } });
    const html = await res.text();
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]*href="(.*?)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      results.push({ title: m[2].replace(/<[^>]+>/g, ""), url: m[1], snippet: m[3].replace(/<[^>]+>/g, "") });
      if (results.length >= max_results) break;
    }
    return results.length === 0 ? "ℹ No results." : JSON.stringify(results, null, 2);
  } catch (e) { return `❌ Search error: ${e.message}`; }
}

async function toolChain(steps, cfg) {
  if (!Array.isArray(steps) || steps.length === 0) return "❌ Error: steps empty";
  const outputs = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    let result = await executeTool(step.tool, step.args || {}, cfg);
    outputs.push({ step: i + 1, tool: step.tool, result });
  }
  return JSON.stringify(outputs, null, 2);
}

async function executeTool(name, args, cfg) {
  const cleanName = (name || "").replace(/^proxy_/, "");
  switch (cleanName) {
    case "list_dir":     return listDir(args.path);
    case "read_file":    return readFile(args.path);
    case "write_file":   return await writeFile(args.path, args.content, cfg.auto_yes);
    case "run_shell":    return await runShell(args.cmd, cfg.auto_yes);
    case "http_request": return await httpRequest(args, cfg.auto_yes);
    case "web_search":   return await webSearch(args, cfg.auto_yes);
    case "tool_chain":   return await toolChain(args.steps, cfg);
    default:             return `❌ Unknown tool: ${name}`;
  }
}

// ─── API Call ───────────────────────────────────────────────────────────────

async function callApi(messages, cfg) {
  if (!cfg.api_key) throw new Error("API Key not set. Use /key or set OPENAI_API_KEY.");
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base.replace(/\/+$/, "");
  const payload = { model: cfg.model, messages, tools: TOOLS, tool_choice: "auto", temperature: profile.temperature };
  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`API ${res.status}: ${txt.slice(0, 300)}`); }
    return res.json();
  } catch (e) { throw new Error(`Network error: ${e.message}`); }
}

// ─── Tool Handler ───────────────────────────────────────────────────────────

async function handleTools(msg, messages, cfg) {
  if (!msg.tool_calls || msg.tool_calls.length === 0) return false;
  messages.push(msg);
  const count = msg.tool_calls.length;
  console.log("");
  console.log(`  ${TOOL_CLR}${C.bold}⚡ Tool calls${C.reset} ${MUTED}(${count})${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
  for (let i = 0; i < msg.tool_calls.length; i++) {
    const call = msg.tool_calls[i];
    let name = call.function.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
    log.tool(name, args);
    let result = await executeTool(name, args, cfg);
    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }
  console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);
  console.log("");
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function applyAliases(input, cfg) {
  for (const [a, b] of Object.entries(cfg.aliases)) {
    if (input === a || input.startsWith(a + " ")) return input.replace(a, b);
  }
  return input;
}

function renderTemplate(cfg, name, params) {
  const tpl = cfg.templates[name]; if (!tpl) return null;
  let text = tpl;
  for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

function parseKv(s) {
  const out = {};
  s.split(/\s+/).forEach(pair => { const i = pair.indexOf(":"); if (i === -1) return; const k = pair.slice(0, i), v = pair.slice(i + 1); if (k && v) out[k] = v; });
  return out;
}

function makeChatName(state) { let i = 1; while (state.chats[`chat-${i}`]) i++; return `chat-${i}`; }

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(ms) {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  if (ms < 3600000) return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
  return Math.floor(ms / 3600000) + "h " + Math.floor((ms % 3600000) / 60000) + "m";
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

// ─── Autopilot Engine ───────────────────────────────────────────────────────

const AUTOPILOT_SYSTEM_SUFFIX = `

═══ AUTOPILOT MODE ═══
Ты работаешь в режиме АВТОПИЛОТА. Это значит:
1. Ты получил большую задачу и должен выполнить её ПОЛНОСТЬЮ и САМОСТОЯТЕЛЬНО.
2. Пользователь ушёл и не будет отвечать — не задавай вопросов, принимай решения сам.
3. Разбей задачу на шаги и выполняй их последовательно через инструменты.
4. После каждого шага проверяй результат и исправляй ошибки.
5. Если что-то не получается — попробуй другой подход.
6. Когда задача ПОЛНОСТЬЮ выполнена, напиши финальный отчёт начинающийся со слова "✅ AUTOPILOT COMPLETE" и опиши что было сделано.
7. НЕ останавливайся пока задача не выполнена. Используй инструменты активно.
8. Если нужно создать файлы — создавай. Если нужно запустить команды — запускай.
9. Всегда проверяй свою работу (запускай тесты, проверяй файлы, и т.д.)
`;

class Autopilot {
  constructor(cfg, messages, saveCallback) {
    this.cfg = cfg;
    this.messages = messages;
    this.saveCallback = saveCallback;
    this.running = false;
    this.aborted = false;
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.startTime = 0;
    this.logEntries = [];

    const apCfg = cfg.autopilot || {};
    this.maxIterations = apCfg.max_iterations || 50;
    this.maxErrors = apCfg.max_errors || 5;
    this.retryDelay = apCfg.retry_delay_ms || 2000;
    this.saveLog = apCfg.save_log !== false;
  }

  abort() {
    this.aborted = true;
    this.running = false;
  }

  _log(type, msg) {
    this.logEntries.push({ time: Date.now(), iteration: this.iteration, type, msg });
  }

  _printHeader() {
    console.log("");
    console.log(box(
      `${AUTO_CLR}${C.bold}AUTOPILOT ENGAGED${C.reset}\n` +
      `${MUTED}Max iterations: ${TEXT}${this.maxIterations}${MUTED}  |  Max errors: ${TEXT}${this.maxErrors}${C.reset}\n` +
      `${MUTED}Model: ${ACCENT}${this.cfg.model}${MUTED}  |  Auto-confirm: ${SUCCESS}ON${C.reset}\n` +
      `${TEXT_DIM}Press ${C.bold}Ctrl+C${C.reset}${TEXT_DIM} to stop autopilot gracefully${C.reset}`,
      { title: "🤖 AUTOPILOT", color: AUTO_CLR, width: Math.min(COLS - 2, 65) }
    ));
    console.log("");
  }

  _printStatus() {
    const elapsed = formatDuration(Date.now() - this.startTime);
    const bar = this._progressBar();
    console.log(`  ${bar} ${AUTO_CLR}iter ${this.iteration}/${this.maxIterations}${C.reset} ${MUTED}│${C.reset} ${TEXT_DIM}${elapsed}${C.reset} ${MUTED}│${C.reset} ${TOOL_CLR}⚡${this.toolCalls}${C.reset} ${MUTED}│${C.reset} ${ERROR}✗${this.errors}${C.reset} ${MUTED}│${C.reset} ${MUTED}tok:${this.totalTokens}${C.reset}`);
  }

  _progressBar() {
    const total = 20;
    const filled = Math.round((this.iteration / this.maxIterations) * total);
    const empty = total - filled;
    return `${AUTO_CLR}[${"█".repeat(filled)}${"░".repeat(empty)}]${C.reset}`;
  }

  _printSummary(reason) {
    const elapsed = formatDuration(Date.now() - this.startTime);
    console.log("");
    console.log(box(
      `${C.bold}Status:${C.reset}     ${reason}\n` +
      `${C.bold}Iterations:${C.reset} ${this.iteration}\n` +
      `${C.bold}Tool calls:${C.reset} ${this.toolCalls}\n` +
      `${C.bold}Errors:${C.reset}     ${this.errors}\n` +
      `${C.bold}Tokens:${C.reset}     ${this.totalTokens}\n` +
      `${C.bold}Duration:${C.reset}   ${elapsed}`,
      { title: "🤖 AUTOPILOT SUMMARY", color: AUTO_CLR, width: Math.min(COLS - 2, 55) }
    ));
    console.log("");
  }

  _saveLogFile() {
    if (!this.saveLog || this.logEntries.length === 0) return;
    try {
      const logDir = path.join(os.homedir(), ".meowcli_logs");
      fs.mkdirSync(logDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(logDir, `autopilot-${ts}.json`);
      const logData = {
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: formatDuration(Date.now() - this.startTime),
        iterations: this.iteration,
        toolCalls: this.toolCalls,
        errors: this.errors,
        totalTokens: this.totalTokens,
        model: this.cfg.model,
        entries: this.logEntries,
      };
      fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
      log.dim(`Log saved: ${logFile}`);
    } catch (e) {
      log.dim(`Log save failed: ${e.message}`);
    }
  }

  async run(task) {
    this.running = true;
    this.aborted = false;
    this.startTime = Date.now();
    this.iteration = 0;
    this.errors = 0;
    this.totalTokens = 0;
    this.toolCalls = 0;
    this.logEntries = [];

    // Inject autopilot system prompt
    const originalSystem = this.messages[0]?.content || "";
    this.messages[0] = { role: "system", content: originalSystem + AUTOPILOT_SYSTEM_SUFFIX };

    // Add user task
    this.messages.push({ role: "user", content: `[AUTOPILOT TASK]\n${task}\n\nВыполни эту задачу полностью. Действуй самостоятельно, используй инструменты. Когда закончишь — напиши финальный отчёт.` });

    // Override auto_yes for autopilot
    const origAutoYes = this.cfg.auto_yes;
    this.cfg.auto_yes = true;

    this._printHeader();
    this._log("start", task);

    let finalReason = `${SUCCESS}✓ Completed${C.reset}`;

    try {
      while (this.iteration < this.maxIterations && !this.aborted) {
        this.iteration++;
        this._printStatus();

        let data;
        try {
          const spinner = new Spinner(`Autopilot thinking (iter ${this.iteration})`);
          spinner.start();
          data = await callApi(this.messages, this.cfg);
          spinner.stop();
        } catch (e) {
          this.errors++;
          this._log("error", `API call failed: ${e.message}`);
          log.err(`Iteration ${this.iteration}: ${e.message}`);

          if (this.errors >= this.maxErrors) {
            finalReason = `${ERROR}✗ Too many errors (${this.errors})${C.reset}`;
            break;
          }

          log.dim(`Retrying in ${this.retryDelay / 1000}s...`);
          await new Promise(r => setTimeout(r, this.retryDelay));
          this.iteration--; // retry same iteration
          continue;
        }

        if (data.usage) {
          this.totalTokens += data.usage.total_tokens || 0;
        }

        const msg = data.choices[0].message;

        // Handle tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          this.messages.push(msg);

          const count = msg.tool_calls.length;
          this.toolCalls += count;
          console.log(`  ${TOOL_CLR}${C.bold}⚡ Tool calls${C.reset} ${MUTED}(${count})${C.reset}`);
          console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);

          for (const call of msg.tool_calls) {
            let name = call.function.name;
            let args = {};
            try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

            log.tool(name, args);
            this._log("tool", `${name}: ${JSON.stringify(args).slice(0, 200)}`);

            let result;
            try {
              result = await executeTool(name, args, this.cfg);
            } catch (e) {
              result = `❌ Tool error: ${e.message}`;
              this.errors++;
              this._log("error", `Tool ${name} failed: ${e.message}`);
            }

            this.messages.push({ role: "tool", tool_call_id: call.id, content: result });
          }

          console.log(`  ${MUTED}${"─".repeat(40)}${C.reset}`);

          // Continue loop — model needs to process tool results
          continue;
        }

        // Text response from model
        const content = msg.content || "";
        this.messages.push(msg);
        this._log("response", content.slice(0, 500));

        // Print AI response
        console.log("");
        console.log(`  ${AI_CLR}${C.bold}Assistant${C.reset} ${AUTO_CLR}[iter ${this.iteration}]${C.reset}`);
        console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
        const output = renderMD(content).trim();
        const indented = output.split("\n").map(l => "  " + l).join("\n");
        console.log(indented);
        console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);

        if (data.usage) {
          const u = data.usage;
          console.log(`  ${MUTED}tokens: ${u.prompt_tokens}→${u.completion_tokens} (${u.total_tokens} total)${C.reset}`);
        }

        // Save after each iteration
        this.saveCallback();

        // Check if model considers task complete
        if (content.includes("AUTOPILOT COMPLETE") || content.includes("АВТОПИЛОТ ЗАВЕРШЁН")) {
          finalReason = `${SUCCESS}✓ Task completed by model${C.reset}`;
          this._log("complete", "Model reported task complete");
          break;
        }

        // If model didn't call any tools and didn't complete — nudge it
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          // Model gave a text response without tools and without completing
          // Ask it to continue or confirm completion
          this.messages.push({
            role: "user",
            content: "[AUTOPILOT] Ты ещё не закончил задачу. Если задача выполнена — напиши '✅ AUTOPILOT COMPLETE' и финальный отчёт. Если нет — продолжай работу, используй инструменты."
          });
          this._log("nudge", "Nudged model to continue");
        }
      }

      if (this.aborted) {
        finalReason = `${WARNING}▲ Aborted by user (Ctrl+C)${C.reset}`;
        this._log("abort", "User aborted");
      } else if (this.iteration >= this.maxIterations && !finalReason.includes("completed")) {
        finalReason = `${WARNING}▲ Max iterations reached (${this.maxIterations})${C.reset}`;
        this._log("limit", "Max iterations reached");
      }

    } catch (e) {
      finalReason = `${ERROR}✗ Fatal error: ${e.message}${C.reset}`;
      this._log("fatal", e.message);
      log.err(`Autopilot fatal: ${e.message}`);
    } finally {
      // Restore original config
      this.cfg.auto_yes = origAutoYes;
      this.messages[0] = { role: "system", content: originalSystem };
      this.running = false;
    }

    // Trigger command on completion (if set and not aborted)
    try {
      const cmd = this.cfg.autopilot?.trigger_cmd || "";
      const completed = finalReason.includes("Completed") || finalReason.includes("completed") || finalReason.includes("Task completed");
      if (cmd && completed && !this.aborted) {
        log.auto(`Triggering command: ${cmd}`);
        await runShell(cmd, true);
      }
    } catch (e) {
      log.err(`Trigger failed: ${e.message}`);
    }

    this._printSummary(finalReason);
    this._saveLogFile();

    // Save final state
    this.saveCallback();

    return {
      iterations: this.iteration,
      toolCalls: this.toolCalls,
      errors: this.errors,
      tokens: this.totalTokens,
      duration: Date.now() - this.startTime,
    };
  }
}

// ─── Banner ─────────────────────────────────────────────────────────────────

function banner(cfg, currentChat, historyLen) {
  console.clear();
  const logo = [
    `${ACCENT}${C.bold}  ╔╦╗╔═╗╔═╗╦ ╦  ╔═╗╦  ╦${C.reset}`,
    `${ACCENT2}${C.bold}  ║║║║╣ ║ ║║║║  ║  ║  ║${C.reset}`,
    `${ACCENT3}${C.bold}  ╩ ╩╚═╝╚═╝╚╩╝  ╚═╝╩═╝╩${C.reset}`,
  ];
  logo.forEach(l => console.log(l));
  console.log(`  ${MUTED}Terminal AI Assistant${C.reset}`);
  console.log("");

  const items = [
    `${MUTED}model:${C.reset} ${ACCENT}${cfg.model}${C.reset}`,
    `${MUTED}profile:${C.reset} ${ACCENT2}${cfg.profile}${C.reset}`,
    `${MUTED}chat:${C.reset} ${SUCCESS}${currentChat}${C.reset}`,
    `${MUTED}msgs:${C.reset} ${TEXT_DIM}${historyLen}${C.reset}`,
  ];
  const sep = `  ${MUTED}│${C.reset}  `;
  console.log(`  ${items.join(sep)}`);
  console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 60))}${C.reset}`);

  if (!cfg.api_key) { console.log(""); log.warn("API Key not found. Use /key sk-... to set it."); }
  console.log(`  ${MUTED}Type /help for commands${C.reset}`);
  console.log("");
}

// ─── Help Screen ────────────────────────────────────────────────────────────

function printHelp(cfg) {
  console.log("");
  const sections = [
    {
      title: "💬 Chat",
      items: [
        ["/clear",             "Clear current chat context"],
        ["/chat list",         "List all chats"],
        ["/chat new [name]",   "Create new chat"],
        ["/chat use <name>",   "Switch to chat"],
        ["/chat delete <name>","Delete chat"],
      ]
    },
    {
      title: "🤖 Autopilot",
      items: [
        ["/autopilot <task>",       "Start autopilot with a task"],
        ["/ap <task>",              "Short alias for autopilot"],
        ["/ap-config",              "Show autopilot settings"],
        ["/ap-limit <N>",           "Set max iterations (default 50)"],
        ["/ap-errors <N>",          "Set max errors (default 5)"],
        ["/trigger <cmd|off>",      "Run command on autopilot completion"],
        ["Ctrl+C",                  "Stop autopilot gracefully"],
      ]
    },
    {
      title: "🖼  Images",
      items: [
        ["/img <path> [text]",       "Send image with optional question"],
        ["/img <url> [text]",        "Send image by URL"],
        ["{img:path} text",          "Inline image in message"],
      ]
    },
    {
      title: "🔧 Tools",
      items: [
        ["/list <path>",  "List directory contents"],
        ["/read <file>",  "Read file contents"],
        ["/shell <cmd>",  "Execute shell command"],
      ]
    },
    {
      title: "⚙️  Settings",
      items: [
        ["/model [name]",    `Change model ${MUTED}(${cfg.model})${C.reset}`],
        ["/profile [name]",  `Change profile ${MUTED}(${cfg.profile})${C.reset}`],
        ["/temp [0.0-2.0]",  `Set temperature`],
        ["/key [sk-...]",    "Set API key"],
        ["/url [http...]",   "Set base URL"],
        ["/config",          "Show current config"],
      ]
    },
    {
      title: "📦 Other",
      items: [
        ["/export <file>",     "Export history to JSON"],
        ["/import <file>",     "Import history from JSON"],
        ["/template <name>",   "Use prompt template"],
        ["/alias",             "Show aliases"],
        ["/stats",             "Show status"],
        ["/help",              "This help"],
        ["/exit",              "Quit"],
      ]
    }
  ];

  for (const section of sections) {
    console.log(`  ${ACCENT}${C.bold}${section.title}${C.reset}`);
    for (const [cmd, desc] of section.items) {
      const padded = cmd.padEnd(26);
      console.log(`    ${TEXT}${padded}${C.reset}${MUTED}${desc}${C.reset}`);
    }
    console.log("");
  }

  const aliasStr = Object.entries(cfg.aliases).map(([a, b]) => `${TEXT_DIM}${a}${MUTED}→${TEXT_DIM}${b}`).join("  ");
  console.log(`  ${MUTED}Aliases: ${aliasStr}${C.reset}`);
  console.log("");
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function printStats(cfg, currentChat, historyLen) {
  console.log("");
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const rows = [
    ["Chat",        `${SUCCESS}${currentChat}${C.reset}`],
    ["Messages",    `${TEXT}${historyLen}${C.reset}`],
    ["Model",       `${ACCENT}${cfg.model}${C.reset}`],
    ["Profile",     `${ACCENT2}${cfg.profile}${C.reset}`],
    ["Temperature", `${TEXT}${profile.temperature}${C.reset}`],
    ["API Base",    `${MUTED}${cfg.api_base}${C.reset}`],
    ["API Key",     cfg.api_key ? `${SUCCESS}set ${MUTED}(${cfg.api_key.slice(0,8)}...)${C.reset}` : `${ERROR}not set${C.reset}`],
    ["Auto-yes",    cfg.auto_yes ? `${SUCCESS}on${C.reset}` : `${MUTED}off${C.reset}`],
    ["AP Limit",    `${AUTO_CLR}${cfg.autopilot?.max_iterations || 50}${C.reset}`],
    ["CWD",         `${MUTED}${process.cwd()}${C.reset}`],
  ];
  console.log(`  ${ACCENT}${C.bold}◆ Status${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);
  for (const [label, value] of rows) console.log(`  ${TEXT_DIM}${label.padEnd(14)}${C.reset}${value}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);
  console.log("");
}

function printChatList(state) {
  const names = Object.keys(state.chats || {}).sort();
  if (names.length === 0) { log.dim("No chats yet."); return; }
  console.log("");
  console.log(`  ${ACCENT}${C.bold}◆ Chats${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);
  for (const name of names) {
    const msgs = (state.chats[name] || []).length;
    const isCurrent = name === state.current;
    const indicator = isCurrent ? `${SUCCESS}●${C.reset}` : `${MUTED}○${C.reset}`;
    const nameColor = isCurrent ? `${SUCCESS}${C.bold}` : TEXT_DIM;
    console.log(`  ${indicator} ${nameColor}${name}${C.reset}  ${MUTED}(${msgs} msgs)${C.reset}`);
  }
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);
  console.log("");
}

function printConfig(cfg) {
  console.log("");
  console.log(`  ${ACCENT}${C.bold}◆ Configuration${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  const safe = { ...cfg, api_key: cfg.api_key ? cfg.api_key.slice(0, 8) + "..." : "(not set)" };
  const json = JSON.stringify(safe, null, 2);
  for (const line of json.split("\n")) {
    const colored = line
      .replace(/"([^"]+)":/g, `${ACCENT}"$1"${C.reset}:`)
      .replace(/: "([^"]+)"/g, `: ${SUCCESS}"$1"${C.reset}`)
      .replace(/: (\d+\.?\d*)/g, `: ${WARNING}$1${C.reset}`)
      .replace(/: (true|false)/g, `: ${INFO}$1${C.reset}`);
    console.log(`  ${colored}`);
  }
  console.log(`  ${MUTED}${"─".repeat(50)}${C.reset}`);
  console.log("");
}

function printAutopilotConfig(cfg) {
  const ap = cfg.autopilot || {};
  console.log("");
  console.log(`  ${AUTO_CLR}${C.bold}🤖 Autopilot Configuration${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);
  console.log(`  ${TEXT_DIM}${"Max iterations".padEnd(18)}${C.reset}${AUTO_CLR}${ap.max_iterations || 50}${C.reset}`);
  console.log(`  ${TEXT_DIM}${"Max errors".padEnd(18)}${C.reset}${AUTO_CLR}${ap.max_errors || 5}${C.reset}`);
  console.log(`  ${TEXT_DIM}${"Retry delay".padEnd(18)}${C.reset}${AUTO_CLR}${ap.retry_delay_ms || 2000}ms${C.reset}`);
  console.log(`  ${TEXT_DIM}${"Save logs".padEnd(18)}${C.reset}${ap.save_log !== false ? `${SUCCESS}yes${C.reset}` : `${MUTED}no${C.reset}`}`);
  console.log(`  ${TEXT_DIM}${"Trigger cmd".padEnd(18)}${C.reset}${ap.trigger_cmd ? TEXT + ap.trigger_cmd + C.reset : MUTED + "(off)" + C.reset}`);
  console.log(`  ${TEXT_DIM}${"Log dir".padEnd(18)}${C.reset}${MUTED}~/.meowcli_logs/${C.reset}`);
  console.log(`  ${MUTED}${"─".repeat(45)}${C.reset}`);
  console.log("");
}

function makePrompt(cfg, currentChat) {
  const modelShort = cfg.model.length > 20 ? cfg.model.slice(0, 17) + "..." : cfg.model;
  return `${C.reset}\n  ${SUCCESS}${C.bold}${currentChat}${C.reset} ${MUTED}·${C.reset} ${ACCENT}${modelShort}${C.reset} ${MUTED}·${C.reset} ${ACCENT2}${cfg.profile}${C.reset}\n  ${ACCENT3}❯${C.reset} `;
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

async function main() {
  let cfg = loadConfig();
  let historyState = loadHistoryState();

  if (!cfg.profiles[cfg.profile]) cfg.profile = "default";
  if (!historyState.chats[historyState.current]) historyState.chats[historyState.current] = [];

  let currentChat = historyState.current;
  let history = historyState.chats[currentChat];
  let messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }, ...history];
  let pendingImages = [];

  // Active autopilot instance (for Ctrl+C handling)
  let activeAutopilot = null;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // ── Ctrl+C handler ──
  let ctrlCCount = 0;
  let ctrlCTimer = null;
  process.on("SIGINT", () => {
    if (activeAutopilot && activeAutopilot.running) {
      // First Ctrl+C — graceful stop
      console.log(`\n  ${WARNING}▲ Stopping autopilot...${C.reset}`);
      activeAutopilot.abort();
      return;
    }

    ctrlCCount++;
    if (ctrlCCount === 1) {
      console.log(`\n  ${MUTED}Press Ctrl+C again to exit${C.reset}`);
      ctrlCTimer = setTimeout(() => { ctrlCCount = 0; }, 2000);
    } else {
      clearTimeout(ctrlCTimer);
      console.log(`\n  ${ACCENT}${C.bold}Goodbye! 👋${C.reset}\n`);
      process.exit(0);
    }
  });

  // Save callback for autopilot
  const saveState = () => {
    history = messages.filter(m => m.role !== "system").map(m => {
      if (m.role === "user" && Array.isArray(m.content))
        return { ...m, content: simplifyContentForHistory(m.content) };
      return m;
    });
    historyState.chats[currentChat] = history;
    historyState.current = currentChat;
    saveHistoryState(historyState);
  };

  banner(cfg, currentChat, history.length);

  const ask = (q) => new Promise(r => rl.question(q, r));

  while (true) {
    let input;
    try {
      input = (await ask(makePrompt(cfg, currentChat))).trim();
    } catch {
      break; // readline closed
    }
    if (!input) continue;

    input = applyAliases(input, cfg);

    // ── Exit ──
    if (input === "/exit") break;

    // ── Help ──
    if (input === "/help") { printHelp(cfg); continue; }

    // ── Stats ──
    if (input === "/stats") { printStats(cfg, currentChat, history.length); continue; }

    // ── Clear ──
    if (input === "/clear") {
      messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }];
      history = []; historyState.chats[currentChat] = []; pendingImages = [];
      saveHistoryState(historyState);
      log.ok("Chat context cleared.");
      continue;
    }

    // ── Autopilot ──
    if (input.startsWith("/autopilot ") || input === "/autopilot") {
      const task = input.slice(11).trim();
      if (!task) {
        log.err("Usage: /autopilot <task description>");
        log.dim("Example: /autopilot создай REST API на Express с CRUD для пользователей");
        continue;
      }

      if (!cfg.api_key) {
        log.err("API Key not set. Use /key to set it first.");
        continue;
      }

      const autopilot = new Autopilot(cfg, messages, saveState);
      activeAutopilot = autopilot;

      try {
        await autopilot.run(task);
      } catch (e) {
        log.err(`Autopilot crashed: ${e.message}`);
      }

      activeAutopilot = null;
      saveState();
      continue;
    }

    // ── Autopilot config ──
    if (input === "/ap-config") {
      printAutopilotConfig(cfg);
      continue;
    }

    if (input.startsWith("/ap-limit ")) {
      const val = parseInt(input.split(" ")[1]);
      if (!isNaN(val) && val > 0 && val <= 500) {
        if (!cfg.autopilot) cfg.autopilot = {};
        cfg.autopilot.max_iterations = val;
        saveConfig(cfg);
        log.ok(`Autopilot max iterations → ${AUTO_CLR}${val}${C.reset}`);
      } else {
        log.err("Value must be 1–500");
      }
      continue;
    }

    if (input.startsWith("/ap-errors ")) {
      const val = parseInt(input.split(" ")[1]);
      if (!isNaN(val) && val > 0 && val <= 50) {
        if (!cfg.autopilot) cfg.autopilot = {};
        cfg.autopilot.max_errors = val;
        saveConfig(cfg);
        log.ok(`Autopilot max errors → ${AUTO_CLR}${val}${C.reset}`);
      } else {
        log.err("Value must be 1–50");
      }
      continue;
    }

        if (input.startsWith("/trigger")) {
      const arg = input.split(" ").slice(1).join(" ").trim();
      if (!cfg.autopilot) cfg.autopilot = {};
      if (!arg || arg.toLowerCase() === "off") {
        cfg.autopilot.trigger_cmd = "";
        saveConfig(cfg);
        log.ok("Autopilot trigger disabled");
      } else {
        cfg.autopilot.trigger_cmd = arg;
        saveConfig(cfg);
        log.ok(`Autopilot trigger set → ${AUTO_CLR}${arg}${C.reset}`);
      }
      continue;
    }

    // ── Chat management ──
    if (input.startsWith("/chat ")) {
      const parts = input.split(/\s+/);
      const cmd = parts[1];
      const name = parts.slice(2).join(" ");

      if (cmd === "list") {
        printChatList(historyState);
      } else if (cmd === "new") {
        const newName = name || makeChatName(historyState);
        if (historyState.chats[newName]) { log.err(`Chat '${newName}' already exists.`); }
        else {
          historyState.chats[newName] = []; historyState.current = newName; currentChat = newName;
          history = []; messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }];
          pendingImages = []; saveHistoryState(historyState);
          log.ok(`Created & switched to: ${newName}`);
        }
      } else if (cmd === "use") {
        if (!name) { log.err("Specify chat name."); }
        else if (!historyState.chats[name]) { log.err(`Chat '${name}' not found.`); }
        else {
          historyState.current = name; currentChat = name;
          history = historyState.chats[name] || [];
          messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }, ...history];
          pendingImages = []; saveHistoryState(historyState);
          log.ok(`Switched to: ${name}`);
        }
      } else if (cmd === "delete") {
        if (!name) { log.err("Specify chat name."); }
        else if (!historyState.chats[name]) { log.err(`Chat '${name}' not found.`); }
        else {
          delete historyState.chats[name];
          if (historyState.current === name) {
            const names = Object.keys(historyState.chats);
            const next = names[0] || "default";
            if (!historyState.chats[next]) historyState.chats[next] = [];
            historyState.current = next; currentChat = next;
            history = historyState.chats[next];
            messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }, ...history];
          }
          saveHistoryState(historyState); log.ok(`Deleted: ${name}`);
        }
      } else { log.err("Unknown /chat command. Use: list | new | use | delete"); }
      continue;
    }

    // ── Key ──
    if (input.startsWith("/key ")) {
      cfg.api_key = input.split(" ")[1]; saveConfig(cfg);
      log.ok(`API Key saved ${MUTED}(${cfg.api_key.slice(0, 8)}...)${C.reset}`);
      continue;
    }

    // ── URL ──
    if (input.startsWith("/url ")) {
      cfg.api_base = input.split(" ")[1]; saveConfig(cfg);
      log.ok(`API Base: ${cfg.api_base}`);
      continue;
    }

    // ── Model ──
    if (input.startsWith("/model")) {
      const m = input.split(" ")[1];
      if (m) { cfg.model = m; saveConfig(cfg); log.ok(`Model → ${ACCENT}${m}${C.reset}`); }
      else { log.info(`Current model: ${ACCENT}${cfg.model}${C.reset}`); }
      continue;
    }

    // ── Profile ──
    if (input.startsWith("/profile")) {
      const p = input.split(" ")[1];
      if (!p) {
        log.info(`Current profile: ${ACCENT2}${cfg.profile}${C.reset}`);
        const available = Object.keys(cfg.profiles).map(name => {
          const isCurrent = name === cfg.profile;
          return isCurrent ? `${SUCCESS}${C.bold}${name}${C.reset}` : `${TEXT_DIM}${name}${C.reset}`;
        }).join("  ");
        console.log(`  ${MUTED}Available:${C.reset} ${available}`);
      } else if (cfg.profiles[p]) {
        cfg.profile = p; saveConfig(cfg);
        messages[0] = { role: "system", content: cfg.profiles[p].system };
        log.ok(`Profile → ${ACCENT2}${p}${C.reset}`);
      } else { log.err(`Profile '${p}' not found.`); }
      continue;
    }

    // ── Temperature ──
    if (input.startsWith("/temp")) {
      const val = parseFloat(input.split(" ")[1]);
      if (!isNaN(val) && val >= 0 && val <= 2) {
        const p = cfg.profiles[cfg.profile] || cfg.profiles.default;
        p.temperature = val; saveConfig(cfg);
        log.ok(`Temperature → ${WARNING}${val}${C.reset}`);
      } else if (input.trim() === "/temp") {
        const p = cfg.profiles[cfg.profile] || cfg.profiles.default;
        log.info(`Current temperature: ${WARNING}${p.temperature}${C.reset}`);
      } else { log.err("Value must be 0.0 – 2.0"); }
      continue;
    }

    // ── Config ──
    if (input === "/config") { printConfig(cfg); continue; }
    if (input === "/saveconfig") { saveConfig(cfg); log.ok("Config saved to ~/.meowcli.json"); continue; }

    // ── File tools ──
    if (input.startsWith("/list ")) { console.log(listDir(input.slice(6))); continue; }
    if (input.startsWith("/read ")) { console.log(readFile(input.slice(6))); continue; }
    if (input.startsWith("/shell ")) { console.log(await runShell(input.slice(7), cfg.auto_yes)); continue; }

    // ── Image command ──
    if (input.startsWith("/img ")) {
      const rest = input.slice(5).trim();
      if (!rest) { log.err("Usage: /img <file|url> [question text]"); continue; }
      const firstSpace = rest.indexOf(" ");
      let imgPath, imgText;
      if (firstSpace === -1) { imgPath = rest; imgText = ""; }
      else { imgPath = rest.slice(0, firstSpace); imgText = rest.slice(firstSpace + 1).trim(); }

      if (!isUrl(imgPath)) {
        const resolved = path.resolve(imgPath);
        if (!fs.existsSync(resolved)) { log.err(`File not found: ${resolved}`); continue; }
        if (!isImagePath(imgPath)) { log.warn(`File doesn't look like an image: ${imgPath}`); log.dim(`Supported: ${[...IMAGE_EXTENSIONS].join(", ")}`); continue; }
      }

      if (!imgText) {
        pendingImages.push(imgPath);
        log.ok(`Image queued: ${IMG_CLR}${path.basename(imgPath)}${C.reset} ${MUTED}(type your question next)${C.reset}`);
        if (pendingImages.length > 1) log.dim(`${pendingImages.length} images queued total`);
        continue;
      }

      try {
        const content = buildVisionContent(imgText, [imgPath]);
        const userMsg = { role: "user", content };
        console.log(""); console.log(`  ${USER_CLR}${C.bold}You${C.reset} ${IMG_CLR}🖼${C.reset}`);
        messages.push(userMsg);
        const spinner = new Spinner("Analyzing image"); spinner.start();
        try {
          let toolRound = 0;
          while (true) {
            const data = await callApi(messages, cfg);
            const msg = data.choices[0].message;
            const toolLoop = await handleTools(msg, messages, cfg);
            if (toolLoop) { toolRound++; spinner.update(`Processing (round ${toolRound + 1})`); continue; }
            spinner.stop();
            console.log(""); console.log(`  ${AI_CLR}${C.bold}Assistant${C.reset}`);
            console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
            const output = renderMD(msg.content || "").trim();
            console.log(output.split("\n").map(l => "  " + l).join("\n"));
            console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
            if (data.usage) { const u = data.usage; console.log(`  ${MUTED}tokens: ${u.prompt_tokens}→${u.completion_tokens} (${u.total_tokens} total)${C.reset}`); }
            messages.push(msg); saveState(); break;
          }
        } catch (e) { spinner.stop(); log.err(e.message); messages.pop(); }
      } catch (e) { log.err(e.message); }
      continue;
    }

    // ── Alias list ──
    if (input === "/alias") {
      console.log(""); console.log(`  ${ACCENT}${C.bold}◆ Aliases${C.reset}`);
      console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`);
      for (const [a, b] of Object.entries(cfg.aliases))
        console.log(`  ${TEXT}${a.padEnd(10)}${C.reset}${MUTED}→${C.reset}  ${TEXT_DIM}${b}${C.reset}`);
      console.log(`  ${MUTED}${"─".repeat(35)}${C.reset}`); console.log("");
      continue;
    }

    // ── Export ──
    if (input.startsWith("/export ")) {
      const file = input.slice(8).trim();
      if (!file) { log.err("Specify file path."); continue; }
      try { fs.writeFileSync(file, JSON.stringify(historyState, null, 2)); log.ok(`History exported to ${file}`); }
      catch (e) { log.err(`Export failed: ${e.message}`); }
      continue;
    }

    // ── Import ──
    if (input.startsWith("/import ")) {
      const file = input.slice(8).trim();
      if (!file) { log.err("Specify file path."); continue; }
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        if (data.chats) {
          historyState = data; currentChat = historyState.current || "default";
          history = historyState.chats[currentChat] || [];
          messages = [{ role: "system", content: cfg.profiles[cfg.profile].system }, ...history];
          saveHistoryState(historyState); log.ok(`History imported from ${file}`);
        } else { log.err("Invalid history format."); }
      } catch (e) { log.err(`Import failed: ${e.message}`); }
      continue;
    }

    // ── Template ──
    if (input.startsWith("/template ")) {
      const parts = input.split(" ");
      const name = parts[1];
      const rest = parts.slice(2).join(" ");
      const params = parseKv(rest);
      const text = renderTemplate(cfg, name, params);
      if (!text) { log.err(`Template '${name}' not found.`); continue; }
      input = text;
      log.info(`Using template: ${name}`);
    }

    // ── Check for inline images {img:path} ──
    const { text: parsedText, images: inlineImages } = parseInlineImages(input);
    const allImages = [...pendingImages, ...inlineImages];
    pendingImages = [];

    // ── Build user message ──
    let userMsg;
    if (allImages.length > 0) {
      try { userMsg = { role: "user", content: buildVisionContent(parsedText, allImages) }; }
      catch (e) { log.err(e.message); continue; }
    } else {
      userMsg = { role: "user", content: input };
    }

    messages.push(userMsg);

    console.log("");
    if (allImages.length > 0) console.log(`  ${USER_CLR}${C.bold}You${C.reset} ${IMG_CLR}🖼 ×${allImages.length}${C.reset}`);
    else console.log(`  ${USER_CLR}${C.bold}You${C.reset}`);

    const spinnerText = allImages.length > 0 ? "Analyzing image" : "Thinking";
    const spinner = new Spinner(spinnerText);
    spinner.start();

    try {
      let toolRound = 0;
      while (true) {
        const data = await callApi(messages, cfg);
        const msg = data.choices[0].message;
        const toolLoop = await handleTools(msg, messages, cfg);
        if (toolLoop) { toolRound++; spinner.update(`Processing (round ${toolRound + 1})`); continue; }
        spinner.stop();

        console.log(""); console.log(`  ${AI_CLR}${C.bold}Assistant${C.reset}`);
        console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
        const output = renderMD(msg.content || "").trim();
        console.log(output.split("\n").map(l => "  " + l).join("\n"));
        console.log(`  ${MUTED}${"─".repeat(Math.min(COLS - 4, 50))}${C.reset}`);
        if (data.usage) { const u = data.usage; console.log(`  ${MUTED}tokens: ${u.prompt_tokens}→${u.completion_tokens} (${u.total_tokens} total)${C.reset}`); }

        messages.push(msg);
        saveState();
        break;
      }
    } catch (e) {
      spinner.stop();
      log.err(e.message);
      messages.pop();
    }
  }

  rl.close();
  console.log(""); console.log(`  ${ACCENT}${C.bold}Goodbye! 👋${C.reset}`); console.log("");
}

main().catch(e => {
  console.error(`\n  ${ERROR}${C.bold}Fatal Error:${C.reset} ${e.message}\n`);
  process.exit(1);
});
