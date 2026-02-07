#!/usr/bin/env node
/**
 * Meow CLI
 *
 * A terminal-based AI assistant with file system access and shell execution capabilities.
 * Designed for developers who live in the terminal.
 */

import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { createTwoFilesPatch } from "diff";
import { exec } from "child_process";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

marked.setOptions({
  renderer: new TerminalRenderer({
    code: (code) => `\n${code}\n`,
    blockquote: (quote) => `┃ ${quote}\n`,
    heading: (text, level) => `\n${"█".repeat(level)} ${text}\n`,
    hr: () => `\n${"─".repeat(40)}\n`,
  })
});

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m"
};

const DIVIDER = `${COLORS.gray}${"─".repeat(60)}${COLORS.reset}`;
const HIST_FILE = path.join(os.homedir(), ".meowcli_history.json");
const CONF_FILE = path.join(os.homedir(), ".meowcli.json");

const DEFAULT_CONFIG = {
  api_base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  api_key: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4-turbo",
  auto_yes: process.env.AI_AUTO_YES === "1",
  quiet: false,
  profile: "default",
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
    "/run": "/shell"
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


const log = {
  info: (s) => console.log(`${COLORS.cyan}ℹ ${s}${COLORS.reset}`),
  ok:   (s) => console.log(`${COLORS.green}✔ ${s}${COLORS.reset}`),
  warn: (s) => console.log(`${COLORS.yellow}⚠ ${s}${COLORS.reset}`),
  err:  (s) => console.log(`${COLORS.red}✖ ${s}${COLORS.reset}`),
  dim:  (s) => console.log(`${COLORS.dim}${s}${COLORS.reset}`)
};

function loadJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,"utf8")) : fallback; }
  catch { return fallback; }
}

function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data,null,2)); } catch (e) { log.err(`Ошибка сохранения: ${e.message}`); }
}

function loadConfig() {
  const cfg = loadJson(CONF_FILE, DEFAULT_CONFIG);
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    profiles: { ...DEFAULT_CONFIG.profiles, ...(cfg.profiles||{}) },
    templates: { ...DEFAULT_CONFIG.templates, ...(cfg.templates||{}) },
    aliases: { ...DEFAULT_CONFIG.aliases, ...(cfg.aliases||{}) }
  };
}

function saveConfig(cfg) { saveJson(CONF_FILE, cfg); }
function loadHistory() { return loadJson(HIST_FILE, []); }
function saveHistory(msgs) { saveJson(HIST_FILE, msgs); }

function renderMD(text) {
  try { return marked.parse(text || ""); } catch { return text || ""; }
}

async function confirm(action, detail, auto_yes=false) {
  if (auto_yes) return true;
  return new Promise(resolve => {
    process.stdout.write(`\n${COLORS.yellow}⚠️  ПОДТВЕРЖДЕНИЕ: ${action}${COLORS.reset}\n${COLORS.dim}${detail}${COLORS.reset}\n\nВыполнить? [y/N]: `);
    process.stdin.once("data", d => resolve(d.toString().trim().toLowerCase() === "y"));
  });
}

function listDir(p) {
  try {
    const dir = path.resolve(p);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return `❌ Ошибка: Директория не найдена: ${dir}`;
    return fs.readdirSync(dir).map(n => {
      try { return fs.statSync(path.join(dir,n)).isDirectory() ? n + "/" : n; } catch { return n; }
    }).sort().join("\n");
  } catch (e) { return `❌ Ошибка: ${e.message}`; }
}

function readFile(p) {
  try {
    const file = path.resolve(p);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return `❌ Ошибка: Файл не найден: ${file}`;
    let data = fs.readFileSync(file, "utf8");
    if (data.length > 50000) data = data.slice(0,50000) + `\n...[ОБРЕЗАНО: ${data.length} байт]...`;
    return data;
  } catch (e) { return `❌ Ошибка чтения: ${e.message}`; }
}

async function writeFile(p, content, auto_yes=false) {
  try {
    const file = path.resolve(p);
    const old = fs.existsSync(file) ? fs.readFileSync(file,"utf8") : "";
    const diff = createTwoFilesPatch(file, file, old, content, "Old", "New");
    
    if (diff.trim() && diff.length > 100) { 
      const ok = await confirm("Запись файла", diff.slice(0, 3000), auto_yes);
      if (!ok) return "❌ Запись отменена пользователем.";
    } else if (!fs.existsSync(file)) {
      const ok = await confirm("Создание нового файла", file, auto_yes);
      if (!ok) return "❌ Создание отменено пользователем.";
    }

    fs.mkdirSync(path.dirname(file), { recursive:true });
    fs.writeFileSync(file, content, "utf8");
    return `✅ Файл записан: ${file} (${content.length} байт)`;
  } catch (e) { return `❌ Ошибка записи: ${e.message}`; }
}

async function runShell(cmd, auto_yes=false) {
  const ok = await confirm("Запуск команды Shell", cmd, auto_yes);
  if (!ok) return "❌ Запуск отменен пользователем.";
  
  return new Promise(resolve => {
    exec(cmd, { maxBuffer: 10*1024*1024, cwd: process.cwd() }, (err, stdout, stderr) => {
      const output = [];
      if (stdout) output.push(`STDOUT:\n${stdout.trim()}`);
      if (stderr) output.push(`STDERR:\n${stderr.trim()}`);
      if (err) output.push(`EXIT CODE: ${err.code}`);
      resolve(output.join("\n\n") || "✅ Команда выполнена (нет вывода).");
    });
  });
}

async function httpRequest({ url, method = "GET", headers = {}, body = "", timeout_ms = 15000 }, auto_yes=false) {
  if (!url) return "❌ Ошибка: url не указан";
  const detail = `${method} ${url}`;
  const ok = await confirm("HTTP-запрос", detail, auto_yes);
  if (!ok) return "❌ Запрос отменен пользователем.";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout_ms);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
      signal: controller.signal
    });

    const contentType = res.headers.get("content-type") || "";
    let data = await res.text();
    if (data.length > 50000) data = data.slice(0, 50000) + `\n...[ОБРЕЗАНО: ${data.length} байт]...`;

    const headersObj = {};
    res.headers.forEach((v, k) => headersObj[k] = v);

    return [
      `STATUS: ${res.status} ${res.statusText}`,
      `HEADERS: ${JSON.stringify(headersObj, null, 2)}`,
      `CONTENT-TYPE: ${contentType}`,
      `BODY:\n${data}`
    ].join("\n\n");
  } catch (e) {
    const msg = e.name == "AbortError" ? "Timeout" : e.message;
    return `❌ Ошибка HTTP: ${msg}`;
  } finally {
    clearTimeout(t);
  }
}

async function webSearch({ query, max_results = 5 }, auto_yes=false) {
  if (!query) return "❌ Ошибка: query не указан";
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ok = await confirm("Web search", `${query}`, auto_yes);
  if (!ok) return "❌ Поиск отменен пользователем.";

  try {
    const res = await fetch(url, { headers: { "User-Agent": "meowcli/1.0" } });
    const html = await res.text();

    const results = [];
    const re = /<a[^>]+class="result__a"[^>]*href="(.*?)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[1];
      const title = m[2].replace(/<[^>]+>/g, "");
      const snippet = m[3].replace(/<[^>]+>/g, "");
      results.push({ title, url, snippet });
      if (results.length >= max_results) break;
    }

    if (results.length === 0) return "ℹ Результатов не найдено.";
    return JSON.stringify(results, null, 2);
  } catch (e) {
    return `❌ Ошибка поиска: ${e.message}`;
  }
}

async function toolChain(steps, cfg) {
  if (!Array.isArray(steps) || steps.length === 0) return "❌ Ошибка: steps пуст";
  const outputs = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    const tool = step.tool;
    const args = step.args || {};
    let result = "";

    if (tool === "list_dir") result = listDir(args.path);
    else if (tool === "read_file") result = readFile(args.path);
    else if (tool === "write_file") result = await writeFile(args.path, args.content, cfg.auto_yes);
    else if (tool === "run_shell") result = await runShell(args.cmd, cfg.auto_yes);
    else if (tool === "http_request") result = await httpRequest(args, cfg.auto_yes);
    else if (tool === "web_search") result = await webSearch(args, cfg.auto_yes);
    else result = `❌ Неизвестный инструмент в шаге ${i+1}: ${tool}`;

    outputs.push({ step: i + 1, tool, result });
  }
  return JSON.stringify(outputs, null, 2);
}

async function callApi(messages, cfg) {
  if (!cfg.api_key) throw new Error("API Key не установлен. Используйте /config или установите OPENAI_API_KEY.");
  
  const profile = cfg.profiles[cfg.profile] || cfg.profiles.default;
  const url = cfg.api_base.replace(/\/+$/,"");
  
  const payload = {
    model: cfg.model,
    messages,
    tools: TOOLS,
    tool_choice: "auto",
    temperature: profile.temperature
  };

  try {
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API Error (${res.status}): ${txt}`);
    }
    return res.json();
  } catch (e) {
    throw new Error(`Сетевая ошибка: ${e.message}`);
  }
}

async function handleTools(msg, messages, cfg) {
  if (!msg.tool_calls || msg.tool_calls.length === 0) return false;
  
  messages.push(msg); 
  
  log.info(`Ассистент вызывает инструменты (${msg.tool_calls.length})...`);

  for (const call of msg.tool_calls) {
    const name = call.function.name;
    let args = {};
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
    
    let result = "";
    log.dim(`> ${name} ${JSON.stringify(args)}`);

    if (name === "list_dir") result = listDir(args.path);
    else if (name === "read_file") result = readFile(args.path);
    else if (name === "write_file") result = await writeFile(args.path, args.content, cfg.auto_yes);
    else if (name === "run_shell") result = await runShell(args.cmd, cfg.auto_yes);
    else if (name === "http_request") result = await httpRequest(args, cfg.auto_yes);
    else if (name === "web_search") result = await webSearch(args, cfg.auto_yes);
    else if (name === "tool_chain") result = await toolChain(args.steps, cfg);
    else result = `❌ Неизвестный инструмент: ${name}`;

    messages.push({ role:"tool", tool_call_id: call.id, content: result });
  }
  return true; 
}


function printHelp(cfg) {
  console.log(`
${COLORS.magenta}${COLORS.bold}Meow CLI — Справка${COLORS.reset}
${DIVIDER}
${COLORS.bold}Команды:${COLORS.reset}
  /help                 Показать эту справку
  /exit                 Выход из программы
  /clear                Очистить контекст диалога
  /config               Показать текущий конфиг
  /saveconfig           Сохранить текущие настройки в диск
  /stats                Статистика сессии

${COLORS.bold}Работа с файлами и системой:${COLORS.reset}
  /list <path>          Показать файлы в папке
  /read <file>          Прочитать файл
  /shell <cmd>          Выполнить shell-команду
  /edit <file>          Простой редактор (перезапись файла)

${COLORS.bold}Настройки AI:${COLORS.reset}
  /profile [name]       Сменить профиль (текущий: ${cfg.profile})
  /model [name]         Сменить модель (текущая: ${cfg.model})
  /temp [0.0-2.0]       Температура генерации
  /key [sk-...]         Установить API Key
  /url [http...]        Установить Base URL

${COLORS.bold}Разное:${COLORS.reset}
  /export <file>        Экспорт истории в JSON
  /import <file>        Импорт истории из JSON
  /template <name>      Использовать шаблон промпта
  /alias                Показать список алиасов
${DIVIDER}
`);
}

function applyAliases(input, cfg) {
  for (const [a,b] of Object.entries(cfg.aliases)) {
    if (input === a || input.startsWith(a + " ")) {
      return input.replace(a, b);
    }
  }
  return input;
}

function renderTemplate(cfg, name, params) {
  const tpl = cfg.templates[name];
  if (!tpl) return null;
  let text = tpl;
  for (const [k,v] of Object.entries(params)) {
    text = text.replaceAll(`{${k}}`, v);
  }
  return text;
}

function parseKv(s) {
  const out = {};
  s.split(/\s+/).forEach(pair => {
    const index = pair.indexOf(":");
    if (index === -1) return;
    const k = pair.slice(0, index);
    const v = pair.slice(index + 1);
    if (k && v) out[k] = v;
  });
  return out;
}

function banner() {
  console.clear();
  console.log(`${COLORS.magenta}${COLORS.bold}   MEOW CLI  ${COLORS.reset}`);
  console.log(`${COLORS.dim}  ${COLORS.reset}`);
  console.log(DIVIDER);
}

async function main() {
  let cfg = loadConfig();
  let history = loadHistory();
  
  if (!cfg.profiles[cfg.profile]) cfg.profile = "default";
  
  let messages = [{ role:"system", content: cfg.profiles[cfg.profile].system }, ...history];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  banner();
  
  if (!cfg.api_key) {
    log.warn("API Key не найден в конфиге или ENV.");
    log.info("Используйте команду /key sk-... для установки.");
  }

  const ask = (q) => new Promise(r => rl.question(q, r));

  while (true) {
    let input = (await ask(`${COLORS.green}user>${COLORS.reset} `)).trim();
    if (!input) continue;

    input = applyAliases(input, cfg);

    if (input === "/exit") break;
    if (input === "/help") { printHelp(cfg); continue; }
    if (input === "/clear") { 
      messages = [{ role:"system", content: cfg.profiles[cfg.profile].system }]; 
      history = []; 
      saveHistory([]); 
      log.ok("История очищена."); 
      continue; 
    }
    
    if (input.startsWith("/key ")) {
      cfg.api_key = input.split(" ")[1];
      saveConfig(cfg);
      log.ok("API Key сохранен.");
      continue;
    }
    
    if (input.startsWith("/url ")) {
      cfg.api_base = input.split(" ")[1];
      saveConfig(cfg);
      log.ok("API Base URL сохранен.");
      continue;
    }

    if (input.startsWith("/model ")) {
      const m = input.split(" ")[1];
      if (m) { cfg.model = m; log.ok(`Модель: ${m}`); }
      else log.info(`Текущая модель: ${cfg.model}`);
      continue;
    }

    if (input.startsWith("/profile")) {
      const p = input.split(" ")[1];
      if (!p) { 
        log.info(`Текущий профиль: ${cfg.profile}`);
        log.dim(`Доступные: ${Object.keys(cfg.profiles).join(", ")}`);
      } else if (cfg.profiles[p]) {
        cfg.profile = p;
        messages[0] = { role:"system", content: cfg.profiles[p].system };
        log.ok(`Профиль переключен на: ${p}`);
      } else {
        log.err(`Профиль '${p}' не найден.`);
      }
      continue;
    }

    if (input === "/config") { console.log(JSON.stringify(cfg,null,2)); continue; }
    if (input === "/saveconfig") { saveConfig(cfg); log.ok("Конфигурация сохранена в ~/.meowcli.json"); continue; }

    if (input.startsWith("/list ")) { console.log(listDir(input.slice(6))); continue; }
    if (input.startsWith("/read ")) { console.log(readFile(input.slice(6))); continue; }
    if (input.startsWith("/shell ")) { console.log(await runShell(input.slice(7), cfg.auto_yes)); continue; }
    
    if (input.startsWith("/template ")) {
      const parts = input.split(" ");
      const name = parts[1];
      const rest = parts.slice(2).join(" ");
      const params = parseKv(rest);
      const text = renderTemplate(cfg, name, params);
      if (!text) { log.err(`Шаблон '${name}' не найден или неверные параметры.`); continue; }
      input = text;
      log.info(`Используем шаблон:\n${text}`);
    }
    messages.push({ role:"user", content: input });
    process.stdout.write(COLORS.dim + "Думаю..." + COLORS.reset + "\r");

    try {
      while (true) {
        const data = await callApi(messages, cfg);
        const msg = data.choices[0].message;

    
        process.stdout.write("          \r");

        const toolLoop = await handleTools(msg, messages, cfg);
        
        if (!toolLoop) {
          const output = renderMD(msg.content || "").trim();
          console.log(output);
          messages.push(msg);
          
    
          history = messages.filter(m => m.role !== "system");
          saveHistory(history);
          break;
        }
      }
    } catch (e) {
      log.err(e.message);
      messages.pop();
    }
  }

  rl.close();
  console.log("До свидания! 👋");
}

main().catch(e => console.error("Fatal Error:", e));
