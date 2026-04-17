import path from "path";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";
import boxen from "boxen";
import gradient from "gradient-string";


const getOpen = (fn) => {
  const stylerSymbol = Object.getOwnPropertySymbols(fn).find(s => s.description === 'STYLER');
  return fn[stylerSymbol]?.open || "";
};

const color = (hex) => {
  const fn = chalk.hex(hex);
  const wrapper = (text) => fn(text);
  const proxy = new Proxy(wrapper, {
    get(target, prop) {
      if (prop === 'hexCode') return hex;
      if (prop === 'toString' || prop === Symbol.toPrimitive) {
        return () => getOpen(fn);
      }
      const val = fn[prop];
      if (typeof val === 'function') {
        return (...args) => {
          const result = val.apply(fn, args);
          return result;
        };
      }
      return val;
    }
  });
  wrapper[Symbol.toPrimitive] = () => getOpen(fn);
  wrapper.toString = () => getOpen(fn);
  return proxy;
};

const style = (fn) => {
  const wrapper = (...args) => fn(...args);
  const proxy = new Proxy(wrapper, {
    get(target, prop) {
      if (prop === 'toString' || prop === Symbol.toPrimitive) {
        return () => getOpen(fn);
      }
      const val = fn[prop];
      if (typeof val === 'function' || (typeof val === 'object' && val !== null)) {
        return style(val);
      }
      return val;
    }
  });
  return proxy;
};

const C = {
  reset:     style(chalk.reset),
  bold:      style(chalk.bold),
  dim:       style(chalk.dim),
  italic:    style(chalk.italic),
  underline: style(chalk.underline),
  inverse:   style(chalk.inverse),
  gray:      style(chalk.gray),
  red:       style(chalk.red),
  green:     style(chalk.green),
  yellow:    style(chalk.yellow),
  blue:      style(chalk.blue),
  magenta:   style(chalk.magenta),
  cyan:      style(chalk.cyan),
  white:     style(chalk.white),
};

const ACCENT    = color("#CC7832");
const ACCENT2   = color("#A98EDA");
const ACCENT3   = color("#CC7832");
const SUCCESS   = color("#6ABE82");
const WARNING   = color("#DEB858");
const ERROR     = color("#D26060");
const INFO      = color("#6CB4DC");
const MUTED     = color("#646464");
const TEXT      = color("#D4D4D4");
const TEXT_DIM  = color("#969696");
const TOOL_CLR  = color("#6CB4DC");
const USER_CLR  = color("#D4D4D4");
const AI_CLR    = color("#CC7832");
const IMG_CLR   = color("#D28CB4");
const AUTO_CLR  = color("#DEB858");

const SHELL_TIMEOUT_MS = parseInt(process.env.MEOWCLI_SHELL_TIMEOUT_MS || "30000", 10);
const COLS = Math.min(process.stdout.columns || 80, 100);

const MEOW_GRADIENT = gradient(["#CC7832", "#EBCB8B", "#A98EDA"]);
const AI_GRADIENT = gradient(["#CC7832", "#A98EDA"]);

marked.use(markedTerminal({
  code: (code) => `\n${MUTED("  ┃")} ${code}\n`,
  blockquote: (quote) => `  ${MUTED("┃")} ${TEXT_DIM(quote)}\n`,
  heading: (text, level) => {
    if (level === 1) return `\n${ACCENT.bold("# " + text)}\n`;
    if (level === 2) return `\n${ACCENT2.bold("## " + text)}\n`;
    return `\n${TEXT.bold(text)}\n`;
  },
  hr: () => `\n${MUTED("─".repeat(Math.min(COLS - 4, 60)))}\n`,
}));

function box(content, { title = "", color = "#CC7832", width = COLS - 2, padding = 1, style = "round" } = {}) {
  return boxen(content, {
    title,
    borderColor: color?.hexCode || (typeof color === 'string' ? color : "#CC7832"),
    borderStyle: style,
    padding,
    width,
    float: "left",
  });
}

function table(rows, { indent = 2, colSpacing = 2, colWidths = [] } = {}) {
  const padding = " ".repeat(indent);
  const spacing = " ".repeat(colSpacing);
  const widths = [...colWidths];
  rows.forEach(row => {
    row.forEach((cell, i) => {
      const len = stripAnsi(String(cell)).length;
      if (!widths[i] || len > widths[i]) widths[i] = len;
    });
  });
  rows.forEach(row => {
    const line = row.map((cell, i) => {
      const str = String(cell);
      const len = stripAnsi(str).length;
      const pad = " ".repeat(Math.max(0, (widths[i] || 0) - len));
      return str + pad;
    }).join(spacing);
    console.log(padding + line);
  });
}

function list(items, { indent = 2, bullet = "•", bulletColor = MUTED } = {}) {
  const padding = " ".repeat(indent);
  items.forEach(item => {
    console.log(`${padding}${bulletColor(bullet)} ${item}`);
  });
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function progressBar(current, total, { width = 20, label = "", color = ACCENT } = {}) {
  const pct = Math.min(current / Math.max(total, 1), 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = `${color("━".repeat(filled))}${MUTED("━".repeat(empty))}`;
  const pctStr = `${Math.round(pct * 100)}%`;
  return `${bar} ${TEXT_DIM(pctStr)}${label ? ` ${label}` : ""}`;
}

function colorDiff(diffText) {
  if (!diffText) return "";
  return diffText.split("\n").map(line => {
    if (line.startsWith("+") && !line.startsWith("+++")) return SUCCESS(line);
    if (line.startsWith("-") && !line.startsWith("---")) return ERROR(line);
    if (line.startsWith("@@")) return INFO(line);
    if (line.startsWith("diff ") || line.startsWith("index ")) return ACCENT.bold(line);
    return TEXT_DIM(line);
  }).join("\n");
}

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
      process.stdout.write(`\r  ${ACCENT(frame)} ${TEXT_DIM(this.text)} ${MUTED(elapsed + "s")}  `);
      this.i++;
    }, 80);
  }
  update(text) { this.text = text; }
  stop(msg = "") {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stdout.write("\r" + " ".repeat(COLS - 1) + "\r");
    process.stdout.write("\x1b[?25h");
    if (msg) console.log(`  ${SUCCESS("✔")} ${TEXT(msg)}`);
  }
}

const log = {
  info: (s) => console.log(`  ${INFO("ℹ")} ${TEXT(s)}`),
  ok:   (s) => console.log(`  ${SUCCESS("✔")} ${TEXT(s)}`),
  success: (s) => console.log(`  ${SUCCESS("✔")} ${TEXT(s)}`),
  warn: (s) => console.log(`  ${WARNING("⚠")} ${WARNING(s)}`),
  err:  (s) => console.log(`  ${ERROR("✘")} ${ERROR(s)}`),
  error: (s) => console.log(`  ${ERROR("✘")} ${ERROR(s)}`),
  box: (s, opts) => console.log(box(s, typeof opts === "string" ? { title: opts } : opts)),
  dim:  (s) => console.log(`  ${MUTED(s)}`),
  tool: (name, args) => {
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    const short = argsStr.length > 70 ? argsStr.slice(0, 67) + "…" : argsStr;
    console.log(`  ${TOOL_CLR("┃")} ${TOOL_CLR.bold(name)} ${MUTED(short)}`);
  },
  toolResult: (name, result) => {
    const lines = (result || "").split("\n").slice(0, 8);
    for (const line of lines) console.log(`  ${MUTED("┃")} ${TEXT_DIM(line)}`);
    if ((result || "").split("\n").length > 8) console.log(`  ${MUTED("┃")} ${MUTED("… (truncated)")}`);
  },
  img: (filePath, size) => {
    console.log(`  ${IMG_CLR("┃")} ${IMG_CLR("📎 " + path.basename(filePath))} ${MUTED(size)}`);
  },
  auto: (s) => console.log(`  ${AUTO_CLR("┃")} ${AUTO_CLR.bold("autopilot")} ${TEXT_DIM(s)}`),
  step: (n, total, text) => console.log(`  ${progressBar(n, total, { color: ACCENT, label: text })}`),
  section: (title) => {
    console.log(`\n  ${C.bold(AI_GRADIENT(stripAnsi(title)))}`);
    console.log(`  ${MUTED("─".repeat(Math.min(COLS - 4, 50)))}`);
  },
  br: () => console.log(""),
};

function renderMD(text) {
  try { return marked.parse(text || ""); }
  catch { return text || ""; }
}

export {
  C, ACCENT, ACCENT2, ACCENT3, SUCCESS, WARNING, ERROR, INFO,
  MUTED, TEXT, TEXT_DIM, TOOL_CLR, USER_CLR, AI_CLR,
  IMG_CLR, AUTO_CLR, COLS, SHELL_TIMEOUT_MS,
  MEOW_GRADIENT, AI_GRADIENT,
  box, table, list, stripAnsi,
  progressBar, colorDiff,
  Spinner, log, renderMD, gradient
};
