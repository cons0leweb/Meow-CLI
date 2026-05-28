/**
 * ChatPanelProvider — The main AI chat interface as a VSCode WebviewViewProvider.
 * Renders the full chat UI in the sidebar with streaming responses, tool call
 * visualizations, file context injection, and session management.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger.js';

export class ChatPanelProvider {
  static viewType = 'meow.chatView';

  /** @type {vscode.WebviewView} */
  _view = undefined;

  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('../bridge/MeowBridge.js').MeowBridge} bridge
   * @param {import('../providers/StatusBarProvider.js').MeowStatusBar} statusBar
   */
  constructor(context, bridge, statusBar) {
    this.context = context;
    this.bridge = bridge;
    this.statusBar = statusBar;
  }

  /**
   * Called by VSCode when the webview view is first created.
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView, _webviewContext, _token) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'out'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (msg) => this._handleWebviewMessage(msg),
      undefined,
      this.context.subscriptions
    );

    // Send initial state
    this._sendInitialState();
  }

  async _handleWebviewMessage(msg) {
    switch (msg.type) {
      case 'chat':
        await this._handleChat(msg);
        break;
      case 'abort':
        this.bridge.abort();
        this._postMessage({ type: 'aborted' });
        break;
      case 'newSession':
        await this.bridge.newSession();
        this._postMessage({ type: 'sessionCleared' });
        this._postMessage({ type: 'info', text: '🐱 New session started' });
        break;
      case 'loadSession':
        await this.bridge.loadSession(msg.id);
        this._postMessage({ type: 'historyLoaded', history: this.bridge.getHistory() });
        break;
      case 'saveSession':
        await this.bridge.saveSession(msg.name);
        this._postMessage({ type: 'info', text: '💾 Session saved' });
        break;
      case 'getSessions':
        const sessions = await this.bridge.listSessions();
        this._postMessage({ type: 'sessions', sessions });
        break;
      case 'compactHistory':
        const remaining = this.bridge.compactHistory();
        this._postMessage({ type: 'info', text: `✂️ History compacted (${remaining} messages kept)` });
        break;
      case 'insertFileContext': {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const doc = editor.document;
          const content = doc.getText();
          const rel = vscode.workspace.asRelativePath(doc.uri);
          this._postMessage({
            type: 'fileContextInserted',
            fileName: rel,
            language: doc.languageId,
            content: content.slice(0, 10000),
          });
        }
        break;
      }
      case 'insertSelection': {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
          const text = editor.document.getText(editor.selection);
          const lang = editor.document.languageId;
          const rel = vscode.workspace.asRelativePath(editor.document.uri);
          const startLine = editor.selection.start.line + 1;
          this._postMessage({
            type: 'selectionInserted',
            fileName: rel,
            language: lang,
            content: text,
            startLine,
          });
        }
        break;
      }
      case 'openFile': {
        const uri = vscode.Uri.file(msg.path);
        await vscode.window.showTextDocument(uri, { preview: true });
        break;
      }
      case 'applyPatch': {
        await this._applyPatch(msg);
        break;
      }
      case 'getConfig': {
        const cfg = this.bridge.getConfig();
        this._postMessage({
          type: 'config',
          config: {
            model: cfg.get('model'),
            provider: cfg.get('apiProvider'),
            streamResponses: cfg.get('streamResponses'),
            theme: cfg.get('theme'),
            showCostTracker: cfg.get('showCostTracker'),
          },
        });
        break;
      }
      case 'getCost': {
        this._postMessage({ type: 'cost', cost: this.bridge.cost.getSummary() });
        break;
      }
      case 'addMemory': {
        await this.bridge.rag.addEntry(msg.content, msg.tags || []);
        this._postMessage({ type: 'info', text: '🧠 Added to memory' });
        break;
      }
      case 'openSettings': {
        vscode.commands.executeCommand('workbench.action.openSettings', 'meow');
        break;
      }
    }
  }

  async _handleChat(msg) {
    const { text, fileContext, selection, language } = msg;

    if (!text?.trim()) return;

    // Start streaming
    this._postMessage({ type: 'streamStart' });

    let fullResponse = '';

    await this.bridge.chat(
      text,
      { fileContext, selection, language },
      // onChunk
      (chunk) => {
        fullResponse += chunk;
        this._postMessage({ type: 'streamChunk', chunk });
      },
      // onToolCall
      (call) => {
        this._postMessage({
          type: 'toolCall',
          name: call.name,
          input: call.input,
          id: call.id,
        });
      },
      // onComplete
      (result) => {
        if (result?.error) {
          this._postMessage({ type: 'streamError', error: result.error });
        } else {
          this._postMessage({ type: 'streamEnd', content: fullResponse });
          // Update cost
          this._postMessage({ type: 'cost', cost: this.bridge.cost.getSummary() });
        }
      }
    );
  }

  async _applyPatch(msg) {
    const { filePath, oldString, newString } = msg;
    try {
      const result = await this.bridge.tools.execute('patch_file', {
        path: filePath,
        old_string: oldString,
        new_string: newString,
      });
      this._postMessage({ type: 'patchResult', success: true, message: result });
    } catch (e) {
      this._postMessage({ type: 'patchResult', success: false, message: e.message });
    }
  }

  _sendInitialState() {
    setTimeout(() => {
      this._postMessage({ type: 'historyLoaded', history: this.bridge.getHistory() });
      this._postMessage({ type: 'cost', cost: this.bridge.cost.getSummary() });
    }, 300);
  }

  _postMessage(msg) {
    this._view?.webview.postMessage(msg);
  }

  /**
   * Send a pre-filled message to the chat (used by code action commands).
   */
  async sendMessage(text, options = {}) {
    // Ensure the view is visible
    await vscode.commands.executeCommand('meow.chatView.focus');

    // Give the webview a moment to load
    await new Promise(r => setTimeout(r, 200));

    this._postMessage({
      type: 'prefillMessage',
      text,
      ...options,
    });
  }

  /**
   * Open as a full editor panel (for autopilot / large tasks).
   */
  openAsPanel(title = 'Meow AI Agent') {
    const panel = vscode.window.createWebviewPanel(
      'meow.fullPanel',
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'out'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
      }
    );

    panel.webview.html = this._getHtml(panel.webview, { fullPanel: true });

    panel.webview.onDidReceiveMessage(
      (msg) => this._handleWebviewMessage(msg),
      undefined,
      this.context.subscriptions
    );

    return panel;
  }

  // ─── HTML Generation ──────────────────────────────────────────────────────

  _getHtml(webview, options = {}) {
    const nonce = this._getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} data: https:;
  ">
  <title>Meow AI</title>
  <link href="${styleUri}" rel="stylesheet">
</head>
<body class="meow-chat ${options.fullPanel ? 'full-panel' : 'sidebar'}">
  <div id="root"></div>
  <script nonce="${nonce}">
    // Pass VSCode API to the webview bundle
    window.vscode = acquireVsCodeApi();
    window.MEOW_FULL_PANEL = ${options.fullPanel ? 'true' : 'false'};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
