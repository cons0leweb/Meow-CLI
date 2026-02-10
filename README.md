# Meow CLI

A powerful, stylish, and feature-rich command-line interface for interacting with OpenAI-compatible APIs (OpenAI, DeepSeek, LocalAI, vLLM, etc.).

Designed for developers who want to pair-program with AI directly in their terminal, with access to local filesystem tools.

![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## ✨ Features

*   **🛠 Auto-Tools:** The AI can read, write, list files, and execute shell commands (with your confirmation).
*   **🎨 Markdown Rendering:** Beautiful formatting right in the terminal.
*   **💾 Context & History:** Persistent chat history (saved locally).
*   **🎭 Profiles:** Switch between personas instantly (custom assistants supported).
*   **📌 Pins:** Save important messages with `/pin` and list them with `/pins`.
*   **🧹 Chat Vacuum:** Auto-clean old messages with `/vacuum` settings.
*   **↩️ Undo:** Roll back last AI file changes with `/undo [N]`.
*   **🌍 Language:** UI can be switched with `/lang ru|en`.
*   **🤖 Autopilot:** Run autonomous multi-step tasks.
*   **🔌 Universal Compatibility:** Works with any API compatible with OpenAI `chat/completions` format.
*   **🛡 Safe Mode:** Shows diffs and asks for confirmation before writing files or running commands.

## 🚀 Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/cons0leweb/Meow-CLI.git
    cd meow-cli
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Link globally (optional):**
    ```bash
    npm link
    ```
    Now you can run `ai` from anywhere!


## 🤖 Assistants

Custom assistants are stored in `~/.meowcli/data/assistents` as `.json`, `.txt`, or `.md` files.

**Commands:**
- `/assistant list`
- `/assistant show <name>`
- `/assistant use <name>`
- `/assistant new <name> [temp:0.2] <system prompt>`

**Switch assistant**: ` /assistant use coder ` or use standard `/profile <name>`.


## 🌍 Language

Switch UI language:

```bash
/lang en
/lang ru
```

Default: `ru` (or set `AI_LANG=en`).

## ⚙️ Configuration

On the first run, the tool will ask for your **API Key** and **Base URL**.

Configuration is stored in `~/.meowcli/data/config.json`.

### Example Config Structure
```json
{
  "api_key": "sk-...",
  "api_base": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "profile": "default",
  "lang": "ru",
  "vacuum": {
    "enabled": true,
    "drop_count": 4,
    "keep_last": 1
  },
  "profiles": {
    "default": {
      "temperature": 0.2,
      "system": "Ты — опытный инженер-программист..."
    }
  }
}
```

## 📌 Pins

Save important replies for later.

```bash
/pin          # pin last message
/pin 3        # pin message #3
/pins         # list pins
```

Pins are stored in `~/.meowcli/data/pins.json`.

## 🧹 Chat Vacuum (auto-clean)

Auto-remove old messages while keeping the newest ones.

```bash
/vacuum on drop:4 keep:1
/vacuum off
/vacuum        # show current settings
```

## ↩️ Undo AI Changes

Roll back last AI file edits. History is stored in `~/.meowcli/data/undo.json`.

```bash
/undo          # undo last change
/undo 3        # undo last 3 changes
```

## ⚖️ License

PolyForm Noncommercial License 1.0.0. See [LICENSE](LICENSE).

## 🧭 Quick Commands

```bash
/help
/model gpt-4o
/profile creative
/autopilot <task>
```
