<p align="center">
  <img src="https://img.shields.io/badge/meow--cli%20v3.0-0f0f23?style=for-the-badge&logo=windowsterminal&logoColor=white" alt="meow cli v3">
  <br>
  <img src="https://img.shields.io/badge/node-%3E%3D18-6DA55F?style=flat&logo=nodedotjs" alt="node">
  <img src="https://img.shields.io/badge/ESM--only-ffe953?style=flat" alt="esm">
  <img src="https://img.shields.io/badge/license-PolyForm%20NC-blue?style=flat" alt="license">
  <img src="https://img.shields.io/badge/~15K%20lines-0f0f23?style=flat" alt="lines">
  <img src="https://img.shields.io/badge/19%20tools-8A2BE2?style=flat" alt="tools">
</p>

<h3 align="center">Terminal AI Agent · Autonomous · Hierarchical · Streaming</h3>

<p align="center">
  <sub>Not a chat wrapper. A tool-equipped autonomous agent that lives in your terminal.</sub>
</p>

---

## 🧬 What is Meow CLI?

Meow CLI is a **terminal-native AI agent** built on a Think-Act loop. It reasons, calls local tools,
spawns parallel sub-agents, learns from your project via RAG memory, self-heals CI failures,
and operates under a strict security sandbox — all from the comfort of `~/projects/my-app`.

```
You   →  /lead refactor the entire auth layer
Meow  →  analyzes project → splits into 6 tasks → spawns sub-agents → patches files → verifies
```

---

## ⚡ Features

<table>
<tr><th>Category</th><th>Feature</th><th>Description</th></tr>

<tr><td rowspan="4"><b>🤖 Autonomous</b></td>
<td><code>/autopilot</code></td><td>Full auto task execution with iteration & error limits</td></tr>
<tr><td><code>/lead</code></td><td>AI Lead Developer — analyzes project, suggests roadmap, executes autonomously with quality gates</td></tr>
<tr><td><code>/delegate</code></td><td>Parallel sub-agents. Splits large tasks, runs concurrently (max 8, depth 3)</td></tr>
<tr><td><code>/ci heal</code></td><td>CI Self-Healing — reads failing test logs, patches code, re-runs (3 attempts max)</td></tr>

<tr><td rowspan="3"><b>🧠 Intelligence</b></td>
<td>RAG Memory</td><td>Learns from every interaction. TF-IDF + JSON store. Recalls decisions, errors, preferences</td></tr>
<tr><td>Smart Router</td><td><code>/routing on</code> — auto-selects cheapest capable model per query complexity</td></tr>
<tr><td>Prompt Optimizer</td><td><code>/optimize</code> — compresses & rewrites prompts for token efficiency</td></tr>

<tr><td rowspan="3"><b>🔧 Tools (19)</b></td>
<td>Filesystem</td><td><code>list_dir</code> <code>read_file</code> <code>write_file</code> <code>patch_file</code> <code>grep_search</code></td></tr>
<tr><td>System</td><td><code>run_shell</code> <code>http_request</code> <code>web_search</code></td></tr>
<tr><td>Git & CI</td><td><code>git_diff</code> <code>git_log</code> <code>git_commit</code> <code>git_branch</code> <code>ci_pipeline</code></td></tr>

<tr><td rowspan="4"><b>🔒 Security</b></td>
<td>Sandbox</td><td>All file ops restricted to CWD. Blocked: <code>../../../etc/passwd</code></td></tr>
<tr><td>Permissions</td><td>Every tool defaults to <code>ask</code>. Set <code>allow</code>/<code>deny</code> per session or permanently</td></tr>
<tr><td>Config Encryption</td><td>AES-256-GCM. Seed stored ONLY in <code>~/.meowcli/data/.data</code>. Nothing in <code>package.json</code></td></tr>
<tr><td>Audit Log</td><td>Every tool call timestamped with arguments. <code>/audit</code> to view</td></tr>

<tr><td rowspan="3"><b>🎨 UX</b></td>
<td>Streaming</td><td>Real-time token streaming with terminal Markdown rendering</td></tr>
<tr><td>Themes</td><td><code>/theme</code> — multiple color themes. Gradient ASCII art banner</td></tr>
<tr><td>i18n</td><td>Русский / English / 中文. <code>/lang ru|en|zh</code></td></tr>
</table>

---

## 🚀 Quick Start

```bash
git clone https://github.com/cons0leweb/Meow-CLI.git && cd meow-cli
npm install
npm link                        # optional: global access

node index.js                   # launch

/key sk-your-api-key            # set API key
/model gpt-4o                   # choose model
/theme                          # pick a color theme

# Start working
"Explain the architecture"
/list src/
/lead refactor the auth module
```

> **Pipe mode:** `echo "Review this diff" | node index.js --pipe`

---

## 📖 Command Reference

| 💬 Chat | 🤖 Autonomous | 🧠 Intelligence | 🔧 Tools |
|:--------|:-------------|:----------------|:---------|
| `/chat list/new/use/delete` | `/autopilot <task>` | `/memory stats/search/prefs/clear` | `/list <path>` |
| `/clear` | `/ap-limit <N>` | `/routing on\|off` | `/read <file>` |
| `/pins` `/pin` | `/ap-errors <N>` | `/optimize` | `/shell <cmd>` |
| `/compact` | `/lead [--auto] [--plan] [--focus X]` | `/init` | `/find <pattern>` |
| `/vacuum on\|off drop:N keep:N` | `/delegate <task>` | `/init --force` | `/rewind [N] \| --list` |
| | `/ci status\|generate\|heal` | | `/img <path\|url>` |

| 🔒 Security | ⚙️ Settings | 🧩 Extras |
|:-----------|:------------|:----------|
| `/permissions` | `/key` `/url` `/model` | `/plugin install\|list\|remove` |
| `/audit` | `/profile` `/temp` | `/mcp` |
| `/incognito on\|off` | `/theme` `/lang ru\|en\|zh` | `/session save\|load\|list` |
| `/trust` | `/provider` `/saveconfig` | `/cost [total]` |
| | `/alias` `/stats` | `/version` `/update` |

> **Full reference:** see [`HELP.md`](./HELP.md) (EN/РУС/中文) — every command, every parameter.

---

## 🏗 Architecture

```
index.js
  └── src/cli.js              ← Main Think-Act loop
        ├── api.js             ← LLM interface (streaming + non-streaming)
        ├── tool-handler.js    ← Permissions gate + sandbox validation + audit
        ├── tools.js           ← 19 tools: fs, shell, git, http, sub-agents
        └── modules/
            ├── agents/        ← Lead Dev, Sub-agents (parallel, depth-3)
            ├── commands/      ← 25 slash-command handlers
            ├── memory/        ← RAG: TF-IDF + JSON, auto-learning
            ├── security/      ← Sandbox + AES-256-GCM encryptor
            ├── smart/         ← Model router, CI healer, prompt optimizer
            ├── mcp/           ← Model Context Protocol servers
            └── sessions/      ← Session save/load/resume
```

---

## 🔐 Security Model

| Layer | What |
|:------|:-----|
| **Sandbox** | File ops restricted to `CWD`. No escape. |
| **Permissions** | Every tool: `ask` → `allow` → `deny`. Granular. |
| **Audit** | Timestamped log of every tool call. `/audit` to inspect. |
| **Encryption** | AES-256-GCM. Config encrypted at rest. Key in `~/.meowcli/data/.data` only. |
| **Trust** | Repo trust levels. Untrusted = read-only mode. Blacklisted = blocked. |
| **Incognito** | All data → tmpdir. Destroyed on exit. No traces. |

---

## 🧪 Development

```bash
npm test                     # Integration tests (Node native test runner)
DEBUG=true node index.js     # Verbose tool logging
npm run bump:patch           # Version bump
```

---

## 📜 License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)  
Copyright © 2026 **cons0leweb**

---

<p align="center">
  <sub>🐾 Built for developers who live in the terminal.</sub>
</p>
