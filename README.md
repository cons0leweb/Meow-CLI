<p align="center">
  <img src="https://img.shields.io/badge/meow-cli%20v3-0f0f23?style=for-the-badge&logo=windowsterminal&logoColor=white" alt="meow cli v3">
  <br>
  <img src="https://img.shields.io/badge/node-%3E%3D18-6DA55F?style=flat&logo=node.js" alt="node">
  <img src="https://img.shields.io/badge/ESM-only-ffe953?style=flat" alt="esm">
  <img src="https://img.shields.io/badge/license-PolyForm%20NC-blue?style=flat" alt="license">
  <img src="https://img.shields.io/badge/15K%20lines%20of%20code-0f0f23?style=flat" alt="lines">
</p>

<h3 align="center">Terminal AI Agent · Autonomous · Hierarchical · Context-Aware</h3>

---

## 🧬 What is Meow CLI?

Meow CLI is **not a chat wrapper**. It's a **tool-equipped autonomous agent** that lives in your terminal.
It reasons, calls tools, spawns parallel sub-agents, learns from your project, and can self-heal CI failures —
all while respecting a strict security sandbox.

```
You  →  "Refactor the entire codebase to ESM"
Meow →  analyzes → splits into 8 sub-agents → executes in parallel → returns diff
```

---

## ⚡ v3 Feature Stack

| # | Feature | What it does |
|---|---------|-------------|
| 🔀 | **Hierarchical Sub-Agents** | Splits large tasks into parallel sub-agents. Max 8 concurrent, depth-3 nesting. |
| 🧠 | **RAG Memory** | Learns from every interaction. TF-IDF + JSON store. Recalls decisions, errors, your style. |
| 🎯 | **Lead Developer Mode** | `/lead` — analyzes project, suggests roadmap, executes autonomously with gates. |
| 🩺 | **CI Self-Healing** | `/ci heal` — reads failing test logs, patches code, re-runs. |
| 🧭 | **Smart Model Router** | `/routing on` — picks cheapest capable model per query. |
| 🔐 | **Config Encryption** | AES-256-GCM. Optional on first run. Seed never touches `package.json`. |
| 📦 | **Plugin System** | `/plugin install <name>` — extend with community modules. |
| 🔌 | **MCP Protocol** | Model Context Protocol support. Connect external tools & servers. |
| 🖼️ | **Vision** | `/img path` or `{img:photo.png}` inline — analyze screenshots, diagrams. |
| 📡 | **Streaming** | Real-time token streaming with Markdown rendering in terminal. |
| 🧹 | **Auto-Compaction** | Summarizes history before hitting context window. `/compact` for manual. |
| 🔒 | **Sandbox** | All file ops restricted to CWD. Permission system: ask/allow/deny. Audit log. |
| 🌐 | **Multi-Provider** | OpenAI, OpenRouter, local models — switch with `/provider`. |
| 🌍 | **i18n** | Русский & English. Switch with `/lang`. |

---

## 🚀 Quick Start

```bash
# Clone & enter
git clone https://github.com/cons0leweb/Meow-CLI.git && cd meow-cli

# Install
npm install

# Global Acess (opt linux:sudo req)
npm link

# Launch
node index.js

# Set your API key (OpenAI / OpenRouter / local)
/key sk-your-api-key

# Optional: enable config encryption on first run (protects keys on disk)
# You'll be prompted — type Y

# Start working
/list .                     # Browse project
/read src/cli.js            # Read a file
"Explain the architecture"  # Ask anything
/lead refactor the auth     # Autonomous Lead Dev mode
```

> **Pipe mode:** `echo "Explain this code" | node index.js --pipe`

---

## 📖 Commands at a Glance

### 💬 Chat
| Command | |
|---------|---|
| `/chat list` / `new` / `use` / `delete` | Session management |
| `/clear` | Reset context |
| `/pins` / `/pin` | Pinned messages |
| `/compact` | Compress history (saves tokens) |

### 🤖 Autonomous
| Command | |
|---------|---|
| `/autopilot <task>` | Full auto task execution |
| `/lead [--auto] [--plan] [--focus X]` | Lead Developer engine |
| `/delegate <task>` | Parallel sub-agents |
| `/ci status` / `generate` / `heal` | CI/CD management |

### 🧠 Intelligence
| Command | |
|---------|---|
| `/memory stats` / `search` / `prefs` | RAG memory |
| `/routing on\|off` | Smart model routing |
| `/optimize` | Prompt optimizer settings |
| `/init` | Generate project.meow index |

### 🔧 Tools
| Command | |
|---------|---|
| `/list <path>` | Browse files |
| `/read <file>` | Read file |
| `/shell <cmd>` | Run shell |
| `/rewind [N]` / `--list` | Undo / checkpoints |
| `/find <pattern>` | Grep project |

### 🔒 Security
| Command | |
|---------|---|
| `/permissions` | Tool allow/deny |
| `/audit` | Security log |
| `/incognito on\|off` | No-history mode |
| `/trust` | Repo trust status |

### ⚙️ Settings
| Command | |
|---------|---|
| `/key` / `/url` / `/model` | API setup |
| `/profile` / `/temp` | Persona & temp |
| `/theme` | Color themes |
| `/provider` | Multi-provider config |
| `/lang ru\|en` | Language |
| `/alias` / `/saveconfig` | Custom aliases, save |

### 🧩 Extras
| Command | |
|---------|---|
| `/plugin install\|list\|remove` | Community plugins |
| `/mcp` | Model Context Protocol servers |
| `/img <path\|url>` | Vision (image analysis) |
| `/session save\|load\|list` | Session persistence |
| `/cost` | Token usage & cost tracker |

> Type `/help` for full descriptions. `/help <topic>` to filter.

---

## 🏗 Architecture

```
index.js
  └── src/cli.js          ← Main think-act loop
        ├── api.js         ← LLM interface (streaming)
        ├── tool-handler   ← Permissions + sandbox gate
        ├── tools.js       ← fs, shell, git, delegate
        ├── modules/
        │   ├── agents/    ← Lead Dev, Sub-agents
        │   ├── commands/  ← 25 slash-command handlers
        │   ├── memory/    ← RAG (TF-IDF + JSON)
        │   ├── security/  ← Sandbox + AES-256-GCM encryptor
        │   ├── smart/     ← Model router, CI healer, prompt optimizer
        │   └── mcp/       ← Model Context Protocol
        └── ~/.meowcli/    ← Persistent state
              └── data/
                   ├── history.json
                   ├── memory/
                   ├── checkpoints/
                   └── .data    ← encryption seed (never in package.json)
```

---

## 🔐 Security Model

- **Sandbox** — all file operations restricted to `CWD`. No `../../../etc/passwd`.
- **Permissions** — every tool defaults to `ask`. Set to `allow`/`deny` per session or permanently.
- **Audit log** — every tool call timestamped with arguments. View with `/audit`.
- **Config encryption** — AES-256-GCM. Key stored in `~/.meowcli/data/.data` only. Nothing sensitive in `package.json`.
- **Trust system** — repositories have trust levels. Untrusted repos: read-only mode.

---

## 🧪 Development

```bash
npm test              # Integration tests
DEBUG=true node index.js  # Verbose tool logging
npm run bump:patch   # Bump version
```

---

## 📜 License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)  
Copyright © 2026 **cons0leweb**

---

<p align="center">
  <sub>🐾 Built for developers who live in the terminal.</sub>
</p>
