# AI CLI Pro 🤖

A powerful, stylish, and feature-rich command-line interface for interacting with OpenAI-compatible APIs (OpenAI, DeepSeek, LocalAI, vLLM, etc.).

Designed for developers who want to pair-program with AI directly in their terminal, with access to local filesystem tools.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## ✨ Features

*   **🛠 Auto-Tools:** The AI can read, write, list files, and execute shell commands (with your confirmation).
*   **🎨 Markdown Rendering:** Beautiful syntax highlighting and formatting right in the terminal.
*   **💾 Context & History:** Persistent chat history (saved locally).
*   **🎭 Profiles:** Switch between "Coder", "Writer", or "Analyst" personas instantly.
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

## ⚙️ Configuration

On the first run, the tool will ask for your **API Key** and **Base URL**.

Configuration is stored in `~/.mewocli.json`. You can edit it manually to add custom profiles or system prompts.

### Example Config Structure
```json
{
  "api_key": "sk-...",
  "base_url": "https://api.openai.com/v1",
  "profiles": {
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7
    }
  }
}
