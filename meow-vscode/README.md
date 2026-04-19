# 🐱 Meow CLI — VSCode Extension

> Bring the full power of **Meow CLI** directly into Visual Studio Code. Run AI-assisted commands, manage sessions, stream responses, and interact with your codebase — all without leaving your editor.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=meow-cli.meow-vscode)
[![VSCode Engine](https://img.shields.io/badge/vscode-%5E1.85.0-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Usage](#-usage)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Configuration](#-configuration)
- [Architecture](#-architecture)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🤖 AI-Powered Chat Panel
A dedicated **Meow Chat** sidebar panel that lets you converse with your AI assistant in context. Ask questions about your code, request refactors, generate documentation, or get explanations — all streamed in real time directly inside VSCode.

### 📂 Workspace Context Awareness
Meow CLI automatically understands your **current workspace**. It reads open files, selected text, active editor state, and project structure to provide deeply contextual responses without you having to copy-paste anything.

### ⚡ Inline Code Actions
Right-click any selection in the editor to access Meow-powered **context menu actions**:
- **Explain Selection** — Get a plain-English explanation of highlighted code
- **Refactor Selection** — Ask Meow to improve or restructure the selected block
- **Generate Tests** — Auto-generate unit tests for selected functions or classes
- **Add Documentation** — Insert JSDoc / docstring comments above selected code
- **Fix Errors** — Diagnose and fix problems in the selected region

### 🔄 Streaming Responses
All AI responses are **streamed token-by-token** into the chat panel, giving you instant feedback without waiting for the full response to complete.

### 💬 Multi-Turn Conversation Sessions
Maintain **persistent conversation sessions** across multiple interactions. Meow remembers the context of your conversation within a session, enabling follow-up questions and iterative refinements.

### 📝 Insert-to-Editor
Any code block in a Meow response can be **inserted directly into your active editor** at the cursor position or as a replacement for the current selection — with a single click.

### 🗂️ Session Management
- Create, name, and switch between **multiple chat sessions**
- Sessions are persisted across VSCode restarts
- Export session history as Markdown or JSON
- Clear individual sessions or all history at once

### 🔍 Command Palette Integration
All Meow commands are accessible via the **VSCode Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`), making every feature discoverable and keyboard-driven.

### 🎨 Syntax-Highlighted Code Blocks
Responses containing code are rendered with **full syntax highlighting** matching your current VSCode theme, making AI-generated code easy to read and review.

### 🔗 File Reference Support
Reference files in your workspace directly in your prompts using `@filename` syntax. Meow will automatically read and include the file contents as context.

### 🛡️ Secure API Key Management
API keys are stored securely using **VSCode's built-in Secret Storage** — never written to plain-text settings files or committed to source control.

### 📊 Token Usage Display
See **token usage statistics** for each response, helping you monitor consumption and optimize your prompts.

---

## 📦 Installation

### From the VSCode Marketplace

1. Open **Visual Studio Code**
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS) to open the Extensions panel
3. Search for **"Meow CLI"**
4. Click **Install**
5. Reload VSCode when prompted

### From a VSIX File

If you have a `.vsix` package:

```bash
code --install-extension meow-cli-*.vsix
```

Or via the Extensions panel:
1. Click the `···` menu in the Extensions panel
2. Select **Install from VSIX...**
3. Browse to and select the `.vsix` file

### From Source

```bash
# Clone the repository
git clone https://github.com/cons0leweb/meow-cli.git
cd meow-cli/meow-vscode

# Install dependencies
npm install

# Compile the extension
npm run compile

# Package as VSIX (requires vsce)
npm install -g @vscode/vsce
vsce package

# Install the generated VSIX
code --install-extension meow-cli-*.vsix
```

### Prerequisites

- **Visual Studio Code** `v1.85.0` or higher
- **Node.js** `v18.0.0` or higher (for development)
- A valid **Meow CLI API key** (see [Configuration](#-configuration))

---

## 🚀 Usage

### Opening the Chat Panel

Click the 🐱 **Meow** icon in the **Activity Bar** (left sidebar) to open the Meow Chat panel. Alternatively, use the Command Palette:

```
Meow: Open Chat Panel
```

### Sending Your First Message

1. Open the Meow Chat panel
2. Type your question or request in the input box at the bottom
3. Press `Enter` or click the **Send** button
4. Watch the response stream in real time

### Using Inline Code Actions

1. **Select** any code in your editor
2. **Right-click** to open the context menu
3. Navigate to **Meow CLI** submenu
4. Choose the desired action (Explain, Refactor, Generate Tests, etc.)

### Referencing Files in Prompts

Use the `@` syntax to include file contents as context:

```
Can you explain what @src/utils/parser.ts does and suggest improvements?
```

```
Write tests for the functions in @lib/helpers.js
```

### Inserting AI-Generated Code

When Meow returns a code block in its response:
- Click the **📋 Copy** button to copy to clipboard
- Click the **⬇️ Insert** button to insert at your current cursor position
- Click the **🔄 Replace** button to replace your current selection

### Managing Sessions

- **New Session**: Click the `+` icon in the chat panel header or use `Meow: New Session`
- **Switch Session**: Click the session name dropdown in the panel header
- **Rename Session**: Right-click a session and select **Rename**
- **Delete Session**: Right-click a session and select **Delete**
- **Export Session**: Right-click a session and select **Export as Markdown**

---

## ⌨️ Keyboard Shortcuts

| Shortcut (Windows/Linux) | Shortcut (macOS) | Command |
|--------------------------|------------------|---------|
| `Ctrl+Shift+M` | `Cmd+Shift+M` | Open Meow Chat Panel |
| `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` | Send message / Submit prompt |
| `Ctrl+Alt+E` | `Cmd+Option+E` | Explain selected code |
| `Ctrl+Alt+R` | `Cmd+Option+R` | Refactor selected code |
| `Ctrl+Alt+T` | `Cmd+Option+T` | Generate tests for selection |
| `Ctrl+Alt+D` | `Cmd+Option+D` | Add documentation to selection |
| `Ctrl+Alt+F` | `Cmd+Option+F` | Fix errors in selection |
| `Ctrl+Alt+N` | `Cmd+Option+N` | New chat session |
| `Escape` | `Escape` | Stop streaming response |
| `Ctrl+L` | `Cmd+L` | Clear current chat session |

> 💡 **Tip:** All shortcuts can be customized via **File → Preferences → Keyboard Shortcuts** (search for "Meow").

---

## ⚙️ Configuration

Access settings via **File → Preferences → Settings** and search for `meow`, or edit your `settings.json` directly.

### API & Connection

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `meow.apiKey` | `string` | `""` | Your Meow CLI API key. **Recommended:** use the `Meow: Set API Key` command to store it securely instead of plain-text settings. |
| `meow.apiEndpoint` | `string` | `"https://api.meow-cli.dev/v1"` | Base URL for the Meow CLI API. Override for self-hosted or proxy deployments. |
| `meow.model` | `string` | `"meow-large"` | The AI model to use. Options: `meow-large`, `meow-fast`, `meow-mini`. |
| `meow.requestTimeout` | `number` | `60000` | Request timeout in milliseconds before a connection is aborted. |

### Chat Behavior

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `meow.streamResponses` | `boolean` | `true` | Stream responses token-by-token. Disable for batch response delivery. |
| `meow.maxTokens` | `number` | `4096` | Maximum number of tokens in a single response. |
| `meow.temperature` | `number` | `0.7` | Model temperature (0.0–1.0). Lower = more deterministic, higher = more creative. |
| `meow.systemPrompt` | `string` | `""` | Custom system prompt prepended to every conversation. Leave empty to use the default. |
| `meow.includeWorkspaceContext` | `boolean` | `true` | Automatically include workspace metadata (project name, language, open files) in context. |
| `meow.maxContextFiles` | `number` | `5` | Maximum number of files to include when using `@file` references. |

### Editor Integration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `meow.showInlineActions` | `boolean` | `true` | Show Meow actions in the editor right-click context menu. |
| `meow.insertPosition` | `string` | `"cursor"` | Where to insert AI-generated code. Options: `cursor`, `newLine`, `replaceSelection`. |
| `meow.autoFormatInserted` | `boolean` | `true` | Automatically format inserted code using VSCode's built-in formatter. |
| `meow.showTokenCount` | `boolean` | `true` | Display token usage statistics below each response. |

### Session & History

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `meow.persistSessions` | `boolean` | `true` | Save chat sessions across VSCode restarts. |
| `meow.maxSessionHistory` | `number` | `100` | Maximum number of messages to retain per session. |
| `meow.sessionStoragePath` | `string` | `""` | Custom path for session storage. Defaults to VSCode's global storage directory. |

### Appearance

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `meow.theme` | `string` | `"auto"` | Chat panel theme. Options: `auto` (follows VSCode), `light`, `dark`. |
| `meow.fontSize` | `number` | `13` | Font size in the chat panel (pixels). |
| `meow.showAvatars` | `boolean` | `true` | Show user and assistant avatars in the chat panel. |
| `meow.compactMode` | `boolean` | `false` | Use compact message layout with reduced padding. |

### Example `settings.json`

```json
{
  "meow.model": "meow-large",
  "meow.streamResponses": true,
  "meow.maxTokens": 8192,
  "meow.temperature": 0.5,
  "meow.includeWorkspaceContext": true,
  "meow.showInlineActions": true,
  "meow.insertPosition": "cursor",
  "meow.autoFormatInserted": true,
  "meow.persistSessions": true,
  "meow.maxSessionHistory": 200,
  "meow.showTokenCount": true,
  "meow.compactMode": false
}
```

### Setting Your API Key Securely

Rather than storing your API key in `settings.json`, use the secure command:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `Meow: Set API Key`
3. Enter your key when prompted

The key is stored in **VSCode's Secret Storage** (OS keychain on macOS/Windows, libsecret on Linux) and never written to disk in plain text.

---

## 🏗️ Architecture

### Overview

The Meow VSCode Extension is a **TypeScript-based VSCode extension** that bridges the VSCode editor environment with the Meow CLI backend API. It follows VSCode's extension model using the `vscode` API and a **WebView-based UI** for the chat panel.

```
┌─────────────────────────────────────────────────────────┐
│                    VSCode Editor                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Activity   │  │   Editor     │  │   Command     │  │
│  │  Bar Icon   │  │  Context     │  │   Palette     │  │
│  │  (Sidebar)  │  │  Menu        │  │   Commands    │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                   │          │
│  ┌──────▼────────────────▼───────────────────▼───────┐  │
│  │              Extension Host (Node.js)              │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  │  │
│  │  │  Extension  │  │   Session    │  │  Config  │  │  │
│  │  │  Entry      │  │   Manager    │  │  Manager │  │  │
│  │  │  (activate) │  │              │  │          │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └──────────┘  │  │
│  │         │                │                         │  │
│  │  ┌──────▼────────────────▼───────────────────────┐ │  │
│  │  │              WebView Panel                     │ │  │
│  │  │  (React/Vanilla JS + VSCode WebView API)       │ │  │
│  │  └──────────────────────┬────────────────────────┘ │  │
│  │                         │ postMessage / onMessage   │  │
│  │  ┌──────────────────────▼────────────────────────┐ │  │
│  │  │              API Client                        │ │  │
│  │  │  (HTTP + SSE streaming to Meow CLI backend)    │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │     Meow CLI Backend      │
              │  (REST API + SSE Stream)  │
              └───────────────────────────┘
```

### Key Components

#### `extension.ts` — Entry Point
The main activation function registers all commands, providers, and the WebView panel. It initializes the `SessionManager`, `ConfigManager`, and `ApiClient` singletons and wires them together.

#### `ChatPanel` — WebView Provider
Implements `vscode.WebviewViewProvider`. Manages the lifecycle of the chat WebView, handles bidirectional `postMessage` communication between the extension host and the WebView UI, and coordinates streaming responses.

#### `ApiClient` — Backend Communication
Handles all HTTP communication with the Meow CLI API:
- **REST requests** for non-streaming operations
- **Server-Sent Events (SSE)** for streaming responses
- Automatic retry logic with exponential backoff
- Request cancellation via `AbortController`

#### `SessionManager` — Conversation State
Manages the lifecycle of chat sessions:
- In-memory session state during runtime
- Persistence to VSCode's `globalStorageUri` between restarts
- Session CRUD operations (create, read, update, delete)
- Message history trimming based on `maxSessionHistory`

#### `ConfigManager` — Settings
Wraps `vscode.workspace.getConfiguration('meow')` with typed accessors and handles secure API key retrieval from `vscode.SecretStorage`.

#### `ContextBuilder` — Workspace Context
Assembles the context payload sent with each request:
- Active file path and language ID
- Selected text (if any)
- Open editor tabs
- Workspace folder name and structure
- Resolved `@file` references from the prompt

#### `InlineActionsProvider` — Editor Integration
Registers `vscode.CodeActionProvider` and context menu contributions that surface Meow actions when text is selected in the editor.

### Data Flow — Sending a Message

```
User types message → WebView UI
        │
        │ postMessage({ type: 'sendMessage', text, sessionId })
        ▼
Extension Host (ChatPanel.onDidReceiveMessage)
        │
        │ ContextBuilder.build(activeEditor, selection, prompt)
        ▼
ApiClient.streamCompletion(messages, context)
        │
        │ SSE stream opens to Meow CLI API
        ▼
Tokens arrive → postMessage({ type: 'token', content })
        │
        ▼
WebView UI appends token to message bubble
        │
        │ Stream ends → postMessage({ type: 'done', usage })
        ▼
SessionManager.appendMessage(sessionId, assistantMessage)
        │
        ▼
Session persisted to globalStorageUri
```

### WebView Security

The WebView follows VSCode's security best practices:
- **Content Security Policy (CSP)** restricts script sources to a nonce-based allowlist
- All external resources are loaded via `webview.asWebviewUri()` to use the `vscode-resource:` scheme
- No `allowScripts` beyond the bundled panel script
- User input is sanitized before being rendered as HTML

### File Structure

```
meow-vscode/
├── src/
│   ├── extension.ts          # Extension entry point & activation
│   ├── ChatPanel.ts          # WebView panel provider
│   ├── ApiClient.ts          # Meow CLI API communication
│   ├── SessionManager.ts     # Chat session lifecycle & persistence
│   ├── ConfigManager.ts      # Settings & secret storage wrapper
│   ├── ContextBuilder.ts     # Workspace context assembly
│   ├── InlineActionsProvider.ts  # Editor context menu actions
│   ├── commands/             # Individual command implementations
│   │   ├── explainSelection.ts
│   │   ├── refactorSelection.ts
│   │   ├── generateTests.ts
│   │   ├── addDocumentation.ts
│   │   └── fixErrors.ts
│   └── webview/              # WebView UI source
│       ├── index.html        # WebView HTML template
│       ├── panel.ts          # WebView-side TypeScript
│       └── styles.css        # Chat panel styles
├── media/                    # Icons and static assets
│   ├── meow-icon.svg
│   └── meow-icon-dark.svg
├── package.json              # Extension manifest & contributions
├── tsconfig.json             # TypeScript configuration
├── webpack.config.js         # Bundle configuration
├── .vscodeignore             # Files excluded from VSIX package
└── README.md                 # This file
```

---

## 🛠️ Development

### Prerequisites

- **Node.js** `v18+` and **npm** `v9+`
- **Visual Studio Code** `v1.85.0+`
- **TypeScript** `v5+` (installed as dev dependency)
- **vsce** for packaging: `npm install -g @vscode/vsce`

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/cons0leweb/meow-cli.git
cd meow-cli/meow-vscode

# 2. Install dependencies
npm install

# 3. Open in VSCode
code .

# 4. Launch the Extension Development Host
# Press F5, or use Run → Start Debugging
# This opens a new VSCode window with the extension loaded
```

### Development Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Compile | `npm run compile` | One-time TypeScript compilation |
| Watch | `npm run watch` | Continuous compilation on file changes |
| Lint | `npm run lint` | Run ESLint across all source files |
| Test | `npm run test` | Run the full test suite |
| Package | `npm run package` | Build production VSIX bundle |
| Clean | `npm run clean` | Remove compiled output (`out/` directory) |

### Running Tests

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run a specific test file
npm run test -- --grep "SessionManager"
```

Tests use **Mocha** as the test runner and **@vscode/test-electron** to run tests inside a real VSCode instance. Test files live alongside source files with a `.test.ts` suffix.

### Debugging

1. Set breakpoints in any `.ts` source file
2. Press `F5` to launch the **Extension Development Host**
3. Perform actions in the new VSCode window to hit breakpoints
4. Use the **Debug Console** in the original window to inspect values

For WebView debugging:
1. In the Extension Development Host, open the Command Palette
2. Run `Developer: Open Webview Developer Tools`
3. Use the browser-style DevTools to inspect the WebView DOM and console

### Adding a New Command

1. **Create the command handler** in `src/commands/myNewCommand.ts`:

```typescript
import * as vscode from 'vscode';
import { ApiClient } from '../ApiClient';
import { ContextBuilder } from '../ContextBuilder';

export async function myNewCommand(
  apiClient: ApiClient,
  contextBuilder: ContextBuilder
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor.');
    return;
  }

  const selection = editor.document.getText(editor.selection);
  const context = await contextBuilder.build(editor, selection);

  // Call the API and handle the response...
}
```

2. **Register the command** in `src/extension.ts`:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('meow.myNewCommand', () =>
    myNewCommand(apiClient, contextBuilder)
  )
);
```

3. **Declare the command** in `package.json` under `contributes.commands`:

```json
{
  "command": "meow.myNewCommand",
  "title": "My New Command",
  "category": "Meow"
}
```

4. **Add a keybinding** (optional) in `package.json` under `contributes.keybindings`:

```json
{
  "command": "meow.myNewCommand",
  "key": "ctrl+alt+x",
  "mac": "cmd+alt+x",
  "when": "editorTextFocus"
}
```

### Code Style

- **TypeScript strict mode** is enabled — no implicit `any`
- **ESLint** with `@typescript-eslint` rules enforces consistent style
- **Prettier** formats code on save (configured in `.vscode/settings.json`)
- Follow the existing patterns for error handling (`try/catch` + `vscode.window.showErrorMessage`)
- All public methods and classes should have JSDoc comments

### Building for Production

```bash
# Compile and bundle with webpack (minified, tree-shaken)
npm run package

# This produces meow-cli-<version>.vsix
# Test the production build before publishing:
code --install-extension meow-cli-*.vsix
```

---

## 🔧 Troubleshooting

### Extension Not Activating

- Ensure VSCode version is `v1.85.0` or higher (`Help → About`)
- Check the **Output** panel (`View → Output`) and select **Meow CLI** from the dropdown for error logs
- Try reloading the window: `Developer: Reload Window`

### API Key Not Working

- Re-enter your key using `Meow: Set API Key` from the Command Palette
- Verify the key is valid by testing it with the Meow CLI directly: `meow --api-key YOUR_KEY "hello"`
- Check that `meow.apiEndpoint` points to the correct server

### Responses Not Streaming

- Ensure `meow.streamResponses` is `true` in settings
- Check that your network/proxy does not buffer SSE connections
- Try increasing `meow.requestTimeout` if on a slow connection

### Chat Panel Blank / Not Loading

- Run `Developer: Open Webview Developer Tools` and check the console for errors
- Disable other extensions temporarily to check for conflicts
- Reinstall the extension: uninstall, reload VSCode, then reinstall

### High Memory Usage

- Reduce `meow.maxSessionHistory` to limit stored messages
- Clear old sessions via `Meow: Clear All Sessions`
- Disable `meow.persistSessions` if session history is not needed

---

## 🤝 Contributing

Contributions are welcome! Please read the guidelines below before submitting a pull request.

### Reporting Issues

1. Search [existing issues](https://github.com/cons0leweb/meow-cli/issues) to avoid duplicates
2. Use the **Bug Report** or **Feature Request** issue templates
3. Include your VSCode version, OS, and extension version
4. Attach relevant logs from the **Output → Meow CLI** panel

### Pull Request Process

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```
2. Make your changes, following the [code style](#code-style) guidelines
3. Add or update tests for your changes
4. Ensure all tests pass: `npm run test`
5. Ensure linting passes: `npm run lint`
6. Update this README if you've added new features or settings
7. Submit a pull request with a clear description of the changes

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for @file references in prompts
fix: prevent duplicate messages on rapid send
docs: update keyboard shortcuts table
refactor: extract ContextBuilder from ChatPanel
test: add SessionManager persistence tests
chore: bump vscode engine to 1.85.0
```

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](../LICENSE) file for details.

---

## 🙏 Acknowledgements

- Built on the [Meow CLI](https://github.com/cons0leweb/meow-cli) core engine
- Powered by the [VSCode Extension API](https://code.visualstudio.com/api)
- Inspired by the developer community's love of staying in flow 🐱

---

<p align="center">Made with ❤️ and lots of 🐱 energy</p>
