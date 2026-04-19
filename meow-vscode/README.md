# 🐱 Meow CLI — VSCode Extension

> The full power of **Meow CLI v3** — a streaming, tool-equipped autonomous AI agent — brought natively into VSCode.

---

## ✨ Features

### 💬 AI Chat Panel
- Full streaming chat interface in the sidebar
- Markdown rendering with syntax-highlighted code blocks
- **⚡ Apply** button on code blocks — write AI suggestions directly to files
- Session history with save/load/compact
- Token cost tracker (per session + total)

### 🔧 Inline Code Actions (Lightbulb Menu)
Right-click any selection → **🐱 Meow AI**:
- 💡 **Explain** — detailed explanation of selected code
- 🔧 **Refactor** — improve readability, performance, maintainability
- 🐛 **Fix / Debug** — auto-fix with optional error message context
- 📖 **Document** — generate JSDoc / docstrings / comments
- 🧪 **Generate Tests** — create unit tests for selected code
- 🔍 **Review File** — full code review of the active file

### 🚀 Autopilot Mode
- Autonomous task execution with a full Think-Act loop
- Opens in a dedicated panel with real-time tool call visualization
- Configurable tool call budget before pausing for confirmation

### 🛠 Tool Execution (VSCode-Native)
All Meow CLI tools work natively inside VSCode:
| Tool | Description |
|------|-------------|
| `read_file` | Read files with line range support |
| `write_file` | Create/overwrite files |
| `patch_file` | Targeted string replacements (preferred) |
| `list_dir` | List directory contents recursively |
| `grep_search` | Regex search across files |
| `run_shell` | Execute shell commands in workspace |
| `git_log/diff/status` | Git operations |
| `web_search` | DuckDuckGo search |
| `open_file_in_editor` | Open files in VSCode editor |
| `show_diff` | Show proposed changes in diff viewer |

### 🔐 Security & Permissions
- **Sandbox modes**: strict (CWD only), workspace, permissive
- Per-tool permission system: `allow` / `ask` / `deny`
- **Checkpoints**: automatic file backups before destructive operations
- Undo/rewind support via checkpoint manager

### 🧠 RAG Memory
- Reads from `~/.meowcli/data/memory/` (shared with Meow CLI)
- TF-IDF relevance scoring for context injection
- Add entries directly from the chat panel
- Memory viewer in the sidebar tree view

### 📊 Sidebar Views
- **AI Chat** — main chat interface
- **Sessions** — browse and load saved conversations
- **RAG Memory** — view memory entries
- **Tool Calls** — real-time tool execution log

---

## 📦 Installation

### From VSIX
```bash
cd meow-vscode
npm install
npm run compile
vsce package
code --install-extension meow-vscode-1.0.0.vsix
```

### Development
```bash
cd meow-vscode
npm install
npm run watch
# Press F5 in VSCode to launch Extension Development Host
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` | Open AI Chat |
| `Ctrl+Shift+I` | Inline Chat at cursor |
| `Ctrl+Shift+E` | Explain selected code |
| `Ctrl+Shift+F` | Fix selected code |

---

## ⚙️ Configuration

All settings are under the `meow.*` namespace in VSCode settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `meow.apiProvider` | `anthropic` | AI provider (`anthropic`, `openai`, `openrouter`, `ollama`) |
| `meow.apiKey` | `""` | API key (falls back to `~/.meowcli/config.json`) |
| `meow.model` | `claude-opus-4-5` | Model to use |
| `meow.streamResponses` | `true` | Stream tokens in real-time |
| `meow.maxTokens` | `8192` | Max tokens per response |
| `meow.temperature` | `0.7` | Response creativity (0–2) |
| `meow.enableRAG` | `true` | Inject RAG memory into prompts |
| `meow.enableCheckpoints` | `true` | Backup files before writes |
| `meow.sandboxMode` | `workspace` | Sandbox boundary |
| `meow.toolPermissions` | `{...}` | Per-tool permission levels |
| `meow.autopilotBudget` | `10` | Max tool calls before pause |
| `meow.theme` | `auto` | Chat UI theme |
| `meow.showCostTracker` | `true` | Show cost in status bar |
| `meow.systemPrompt` | `""` | Custom system prompt prefix |

### API Key Setup
The extension automatically reads `~/.meowcli/config.json` — the same config used by the Meow CLI terminal agent. No duplicate setup needed!

---

## 🏗 Architecture

```
meow-vscode/
├── src/
│   ├── extension.js          # Activation entry point
│   ├── bridge/
│   │   ├── MeowBridge.js     # Core AI + tool orchestration (Think-Act loop)
│   │   ├── ToolExecutor.js   # VSCode-native tool implementations
│   │   ├── SessionManager.js # Chat session persistence
│   │   ├── PermissionManager.js # Tool permission system
│   │   ├── CheckpointManager.js # File backup/undo system
│   │   ├── RagManager.js     # RAG memory integration
│   │   └── CostTracker.js    # Token cost tracking
│   ├── panels/
│   │   └── ChatPanelProvider.js # WebviewView for chat UI
│   ├── providers/
│   │   ├── SessionsTreeProvider.js   # Sessions sidebar tree
│   │   ├── MemoryTreeProvider.js     # Memory sidebar tree
│   │   ├── ToolCallsTreeProvider.js  # Tool calls sidebar tree
│   │   ├── InlineCodeActionsProvider.js # Lightbulb actions
│   │   └── StatusBarProvider.js     # Status bar item
│   ├── commands/
│   │   └── index.js          # All command registrations
│   └── utils/
│       └── Logger.js         # Output channel logging
├── webview-ui/
│   └── src/
│       ├── main.js           # Webview entry point
│       └── components/
│           └── MeowChat.js   # Full chat UI component
├── media/
│   ├── chat.css              # Theme-aware styles
│   └── icons/
│       └── meow-sidebar.svg  # Activity bar icon
└── package.json              # Extension manifest
```

### Think-Act Loop
The extension mirrors Meow CLI's core loop:
1. User sends message → `MeowBridge.chat()`
2. AI API called with streaming → tokens flow to webview
3. If tool calls returned → `ToolExecutor.execute()` runs them
4. Tool results added to history → loop continues
5. No more tool calls → response complete

---

## 🤝 Contributing

This extension lives in `meow-vscode/` within the Meow CLI monorepo.

```bash
# Install deps
cd meow-vscode && npm install

# Watch mode (rebuilds on change)
npm run watch

# Run tests
npm test

# Package for distribution
npm run package
```

---

## 📄 License

MIT — Same as Meow CLI v3.
