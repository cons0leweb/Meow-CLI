/**
 * Meow VSCode Extension — Webview UI Entry Point
 * A full-featured chat interface with streaming, tool call visualization,
 * markdown rendering, code highlighting, and session management.
 */

import { MeowChat } from './components/MeowChat.js';
// ─── State ────────────────────────────────────────────────────────────────────



const state = {
  messages: [],
  isStreaming: false,
  currentStreamId: null,
  fileContext: null,
  selection: null,
  sessions: [],
  cost: null,
  config: {},
};

// ─── VSCode API ───────────────────────────────────────────────────────────────

const vscode = window.vscode;

// ─── DOM ──────────────────────────────────────────────────────────────────────

const root = document.getElementById('root');
const chat = new MeowChat(root, state, vscode);

// ─── Message Handler (from extension host) ────────────────────────────────────

window.addEventListener('message', (event) => {
  const msg = event.data;
  handleMessage(msg);
});

function handleMessage(msg) {
  switch (msg.type) {
    case 'streamStart':
      state.isStreaming = true;
      state.currentStreamId = `msg_${Date.now()}`;
      chat.addStreamingMessage(state.currentStreamId);
      break;

    case 'streamChunk':
      chat.appendStreamChunk(state.currentStreamId, msg.chunk);
      break;

    case 'streamEnd':
      state.isStreaming = false;
      chat.finalizeStreamingMessage(state.currentStreamId, msg.content);
      state.currentStreamId = null;
      break;

    case 'streamError':
      state.isStreaming = false;
      chat.showError(msg.error);
      state.currentStreamId = null;
      break;

    case 'aborted':
      state.isStreaming = false;
      chat.showInfo('⏹ Stopped');
      break;

    case 'toolCall':
      chat.showToolCall(msg.name, msg.input, msg.id);
      break;

    case 'historyLoaded':
      state.messages = msg.history || [];
      chat.renderHistory(state.messages);
      break;

    case 'sessionCleared':
      state.messages = [];
      chat.clearMessages();
      break;

    case 'sessions':
      state.sessions = msg.sessions;
      chat.renderSessions(msg.sessions);
      break;

    case 'cost':
      state.cost = msg.cost;
      chat.updateCost(msg.cost);
      break;

    case 'config':
      state.config = msg.config;
      chat.updateConfig(msg.config);
      break;

    case 'prefillMessage':
      chat.prefillInput(msg.text, msg);
      break;

    case 'fileContextInserted':
      state.fileContext = msg;
      chat.showFileContext(msg);
      break;

    case 'selectionInserted':
      state.selection = msg;
      chat.showSelectionContext(msg);
      break;

    case 'info':
      chat.showInfo(msg.text);
      break;

    case 'patchResult':
      chat.showPatchResult(msg.success, msg.message);
      break;
  }
}

// ─── Initialize ───────────────────────────────────────────────────────────────

// Request initial config and cost
vscode.postMessage({ type: 'getConfig' });
vscode.postMessage({ type: 'getCost' });

// Auto-send prefilled message if any
setTimeout(() => {
  const prefill = new URLSearchParams(window.location.search).get('prefill');
  if (prefill) {
    chat.prefillInput(decodeURIComponent(prefill));
  }
}, 100);
