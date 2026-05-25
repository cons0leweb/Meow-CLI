/**
 * MeowChat — The main chat UI component.
 * Renders messages, handles input, streaming, tool calls, and more.
 * Pure vanilla JS — no framework dependencies.
 */

export class MeowChat {
  constructor(container, state, vscode) {
    this.container = container;
    this.state = state;
    this.vscode = vscode;
    this.streamBuffer = {};
    this.render();
    this._bindEvents();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  render() {
    this.container.innerHTML = `
      <div class="meow-app">
        <!-- Header -->
        <div class="meow-header">
          <div class="meow-header__left">
            <svg class="meow-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span class="meow-title">Meow AI</span>
            <span class="meow-model" id="meow-model">claude</span>
          </div>
          <div class="meow-header__right">
            <button class="meow-btn meow-btn--icon" id="btn-sessions" title="Sessions">
              <svg viewBox="0 0 24 24" class="meow-icon"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.75-1.23-3.5-2.09V8z"/></svg>
            </button>
            <button class="meow-btn meow-btn--icon" id="btn-new-session" title="New Session">
              <svg viewBox="0 0 24 24" class="meow-icon"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <button class="meow-btn meow-btn--icon" id="btn-compact" title="Compact History">
              <svg viewBox="0 0 24 24" class="meow-icon"><path d="M4 19h16v-2H4v2zm16-6H4v2h16v-2zM4 9h16V7H4v2zm16-4H4v2h16V5z"/></svg>
            </button>
            <button class="meow-btn meow-btn--icon" id="btn-settings" title="Settings">
              <svg viewBox="0 0 24 24" class="meow-icon"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
          </div>
        </div>

        <!-- Cost Bar -->
        <div class="meow-cost-bar" id="meow-cost-bar" style="display:none">
          <span class="meow-cost-bar__item">
            <svg class="meow-cost-bar__icon" viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 1.21-1.04 1.93-2.7 1.93-1.96 0-2.73-.93-2.8-2.2H6.3c.08 1.97 1.43 3.3 3.5 3.78V21h3v-2.15c2.05-.37 3.5-1.62 3.5-3.61 0-2.84-2.52-3.75-4.5-4.34z"/></svg>
            <span id="meow-cost-text">$0.0000</span>
          </span>
          <span class="meow-cost-bar__divider">|</span>
          <span class="meow-cost-bar__item" id="meow-tokens-text">0 tokens</span>
        </div>

        <!-- Context Badge -->
        <div class="meow-context-badge" id="meow-context-badge" style="display:none">
          <span class="meow-context-badge__content">
            <svg class="meow-icon-sm" viewBox="0 0 24 24"><path d="M16 5H8c-1.66 0-3 1.34-3 3v8c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V8c0-1.66-1.34-3-3-3zm1 11c0 .55-.45 1-1 1H8c-.55 0-1-.45-1-1V8c0-.55.45-1 1-1h8c.55 0 1 .45 1 1v8z"/></svg>
            <span id="meow-context-label"></span>
          </span>
          <button class="meow-context-clear" id="btn-clear-context" title="Clear context">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <!-- Messages -->
        <div class="meow-messages" id="meow-messages">
          <div class="meow-welcome" id="meow-welcome">
            <div class="meow-welcome__logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="meow-welcome__title">Meow AI Agent</div>
            <div class="meow-welcome__subtitle">Autonomous coding assistant powered by Claude</div>
            
            <div class="meow-quick-actions">
              <button class="meow-quick-btn" data-action="explain">
                <svg viewBox="0 0 24 24" class="meow-icon-sm"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 16h-2v-6h2v6zm0-8h-2V6h2v4z"/></svg>
                Explain file
              </button>
              <button class="meow-quick-btn" data-action="review">
                <svg viewBox="0 0 24 24" class="meow-icon-sm"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.53c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                Review code
              </button>
              <button class="meow-quick-btn" data-action="autopilot">
                <svg viewBox="0 0 24 24" class="meow-icon-sm"><path d="M12 2L2 22l10-4 10 4L12 2z"/></svg>
                Autopilot
              </button>
              <button class="meow-quick-btn" data-action="git">
                <svg viewBox="0 0 24 24" class="meow-icon-sm"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z"/></svg>
                Git summary
              </button>
              <button class="meow-quick-btn" data-action="analyze">
                <svg viewBox="0 0 24 24" class="meow-icon-sm"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                Analyze project
              </button>
              <button class="meow-quick-btn" data-action="tests">
                <svg viewBox="0 0 24 24" class="meow-icon-sm"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/></svg>
                Generate tests
              </button>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="meow-input-area">
          <div class="meow-input-toolbar">
            <button class="meow-btn meow-btn--sm" id="btn-attach-file" title="Attach current file">
              <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-3.31 2.69-6 6-6s6 2.69 6 6v10c0 1.1-.9 2-2 2s-2-.9-2-2V6h-2v9c0 2.21 1.79 4 4 4s4-1.79 4-4V5c0-4.42-3.58-8-8-8s-8 3.58-8 8v12c0 3.31 2.69 6 6 6s6-2.69 6-6V6h-2z"/></svg>
              File
            </button>
            <button class="meow-btn meow-btn--sm" id="btn-attach-selection" title="Attach selection">
              <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M9.64 7.64c.23-.2.36-.48.36-.78 0-.55-.45-1-1-1H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-5c0-.55-.45-1-1-1s-1 .45-1 1v5H4V8h5c.3 0 .58-.13.78-.36zM17.41 3H14c-.55 0-1 .45-1 1s.45 1 1 1h2.17l-7.46 7.46c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L17 6.41V9c0 .55.45 1 1 1s1-.45 1-1V4.5c0-.83-.67-1.5-1.5-1.5z"/></svg>
              Selection
            </button>
          </div>
          <div class="meow-input-wrapper">
            <textarea
              id="meow-input"
              class="meow-input"
              placeholder="Ask Meow anything... (Enter to send, Shift+Enter for newline)"
              rows="3"
              maxlength="100000"
            ></textarea>
            <button class="meow-send-btn" id="btn-send" title="Send (Enter)">
              <svg viewBox="0 0 24 24" class="meow-icon"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="meow-input-footer">
            <span class="meow-char-count" id="meow-char-count">0</span>
            <button class="meow-btn meow-btn--xs meow-btn--danger" id="btn-abort" style="display:none">
              <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M6 19h12V5H6v14z"/></svg>
              Stop
            </button>
          </div>
        </div>
      </div>
    `;

    // Cache DOM refs
    this.messagesEl = document.getElementById('meow-messages');
    this.inputEl = document.getElementById('meow-input');
    this.sendBtn = document.getElementById('btn-send');
    this.abortBtn = document.getElementById('btn-abort');
    this.welcomeEl = document.getElementById('meow-welcome');
    this.costBar = document.getElementById('meow-cost-bar');
    this.contextBadge = document.getElementById('meow-context-badge');
    this.contextLabel = document.getElementById('meow-context-label');
    this.charCount = document.getElementById('meow-char-count');
    this.modelLabel = document.getElementById('meow-model');
  }

  _bindEvents() {
    // Send on Enter (Shift+Enter = newline)
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });

    // Char count
    this.inputEl.addEventListener('input', () => {
      this.charCount.textContent = this.inputEl.value.length.toLocaleString();
    });

    // Send button
    this.sendBtn.addEventListener('click', () => this._send());

    // Abort
    this.abortBtn.addEventListener('click', () => {
      this.vscode.postMessage({ type: 'abort' });
    });

    // Header buttons
    document.getElementById('btn-new-session').addEventListener('click', () => {
      this.vscode.postMessage({ type: 'newSession' });
    });

    document.getElementById('btn-sessions').addEventListener('click', () => {
      this.vscode.postMessage({ type: 'getSessions' });
      this._toggleSessionsPanel();
    });

    document.getElementById('btn-compact').addEventListener('click', () => {
      this.vscode.postMessage({ type: 'compactHistory' });
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
      this.vscode.postMessage({ type: 'openSettings' });
    });

    // Attach file/selection
    document.getElementById('btn-attach-file').addEventListener('click', () => {
      this.vscode.postMessage({ type: 'insertFileContext' });
    });

    document.getElementById('btn-attach-selection').addEventListener('click', () => {
      this.vscode.postMessage({ type: 'insertSelection' });
    });

    // Clear context
    document.getElementById('btn-clear-context').addEventListener('click', () => {
      this.state.fileContext = null;
      this.state.selection = null;
      this.contextBadge.style.display = 'none';
    });

    // Quick action buttons
    document.querySelectorAll('.meow-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => this._handleQuickAction(btn.dataset.action));
    });

    // Drag & drop files
    this.inputEl.addEventListener('dragover', (e) => { e.preventDefault(); });
    this.inputEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.inputEl.value += '\n[File dropped — use Attachment button to add]';
    });
  }

  _handleQuickAction(action) {
    const prompts = {
      explain: 'Please explain the current file in detail.',
      review: 'Please do a comprehensive code review of the current file.',
      autopilot: 'I need you to autonomously improve this project. Start by analyzing the structure, identify the most impactful improvements, then execute them.',
      git: 'Please analyze the git state: run git_status, git_log, and git_diff, then summarize what changed and suggest a commit message.',
      analyze: 'Please analyze the entire project structure, architecture, dependencies, and code quality. Provide a detailed report.',
      tests: 'Please generate comprehensive tests for the current file.',
    };

    const prompt = prompts[action];
    if (prompt) {
      this.inputEl.value = prompt;
      this.charCount.textContent = prompt.length.toLocaleString();
      this.inputEl.focus();
    }
  }

  // ─── Sending ──────────────────────────────────────────────────────────────

  _send() {
    const text = this.inputEl.value.trim();
    if (!text || this.state.isStreaming) return;

    // Hide welcome
    if (this.welcomeEl) {
      this.welcomeEl.style.display = 'none';
    }

    // Add user message to UI
    this.addUserMessage(text);

    // Send to extension
    this.vscode.postMessage({
      type: 'chat',
      text,
      fileContext: this.state.fileContext ? this._formatFileContext() : null,
      selection: this.state.selection?.content || null,
      language: this.state.selection?.language || null,
    });

    // Clear input
    this.inputEl.value = '';
    this.charCount.textContent = '0';

    // Clear context
    this.state.fileContext = null;
    this.state.selection = null;
    this.contextBadge.style.display = 'none';

    // Show abort button
    this.abortBtn.style.display = 'inline-flex';
    this.sendBtn.disabled = true;
    this.state.isStreaming = true;
  }

  _formatFileContext() {
    const fc = this.state.fileContext;
    if (!fc) return null;
    return `File: ${fc.fileName} (${fc.language})\n\`\`\`${fc.language}\n${fc.content}\n\`\`\``;
  }

  // ─── Message Rendering ────────────────────────────────────────────────────

  addUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'meow-message meow-message--user';
    el.innerHTML = `
      <div class="meow-message__avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
      </div>
      <div class="meow-message__content">
        <div class="meow-message__text">${this._escapeHtml(text)}</div>
        <div class="meow-message__meta">
          <span class="meow-message__time">${this._time()}</span>
        </div>
      </div>
    `;
    this.messagesEl.appendChild(el);
    this._scrollToBottom();
  }

  addStreamingMessage(id) {
    const el = document.createElement('div');
    el.className = 'meow-message meow-message--assistant meow-message--streaming';
    el.id = `msg-${id}`;
    el.innerHTML = `
      <div class="meow-message__avatar meow-message__avatar--ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      </div>
      <div class="meow-message__content">
        <div class="meow-message__text" id="text-${id}">
          <span class="meow-cursor"></span>
        </div>
      </div>
    `;
    this.messagesEl.appendChild(el);
    this.streamBuffer[id] = '';
    this._scrollToBottom();
  }

  appendStreamChunk(id, chunk) {
    if (!id) return;
    this.streamBuffer[id] = (this.streamBuffer[id] || '') + chunk;

    const textEl = document.getElementById(`text-${id}`);
    if (textEl) {
      textEl.innerHTML = this._escapeHtml(this.streamBuffer[id]) + '<span class="meow-cursor"></span>';
      this._scrollToBottom();
    }
  }

  finalizeStreamingMessage(id, content) {
    const msgEl = document.getElementById(`msg-${id}`);
    if (!msgEl) return;

    msgEl.classList.remove('meow-message--streaming');

    const textEl = document.getElementById(`text-${id}`);
    if (textEl) {
      const finalContent = content || this.streamBuffer[id] || '';
      textEl.innerHTML = this._renderMarkdown(finalContent);
      this._attachCodeCopyButtons(textEl);
      this._attachApplyButtons(textEl);
    }

    // Add action bar
    const contentEl = msgEl.querySelector('.meow-message__content');
    if (contentEl) {
      const actionsWrapper = document.createElement('div');
      actionsWrapper.className = 'meow-message__meta';
      actionsWrapper.innerHTML = `
        <div class="meow-message__actions">
          <button class="meow-action-btn" id="btn-copy-${id}">
            <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            Copy
          </button>
          <button class="meow-action-btn" id="btn-memory-${id}">
            <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2"/></svg>
            Save to Memory
          </button>
        </div>
        <span class="meow-message__time">${this._time()}</span>
      `;
      contentEl.appendChild(actionsWrapper);

      // Copy logic
      actionsWrapper.querySelector(`#btn-copy-${id}`).addEventListener('click', (e) => {
        const text = textEl.innerText;
        navigator.clipboard.writeText(text).then(() => {
          const btn = e.currentTarget;
          const origText = btn.innerHTML;
          btn.innerHTML = `<svg viewBox="0 0 24 24" class="meow-icon-xs" style="color:var(--vscode-testing-iconPassedForeground)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied`;
          setTimeout(() => { btn.innerHTML = origText; }, 1500);
        });
      });

      // Memory logic
      actionsWrapper.querySelector(`#btn-memory-${id}`).addEventListener('click', () => {
        this.vscode.postMessage({ type: 'addMemory', content: textEl.innerText.slice(0, 1000) });
      });
    }

    delete this.streamBuffer[id];
    this.abortBtn.style.display = 'none';
    this.sendBtn.disabled = false;
    this.state.isStreaming = false;
    this._scrollToBottom();
  }

  showToolCall(name, input, id) {
    const el = document.createElement('div');
    el.className = 'meow-tool-call';
    el.id = `tool-${id}`;

    const inputStr = this._formatToolInput(name, input);

    el.innerHTML = `
      <div class="meow-tool-call__header">
        <div class="meow-tool-call__meta">
          <svg class="meow-tool-call__icon" viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.3C.5 6.7.9 9.8 2.9 11.8c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.1z"/></svg>
          <span class="meow-tool-call__name">${name}</span>
        </div>
        <span class="meow-tool-call__status meow-tool-call__status--running">running...</span>
      </div>
      <div class="meow-tool-call__input">${this._escapeHtml(inputStr)}</div>
    `;

    this.messagesEl.appendChild(el);
    this._scrollToBottom();

    setTimeout(() => {
      const statusEl = el.querySelector('.meow-tool-call__status');
      if (statusEl) {
        statusEl.textContent = 'done';
        statusEl.className = 'meow-tool-call__status meow-tool-call__status--done';
      }
    }, 1200);
  }

  _formatToolInput(name, input) {
    if (!input) return '';
    switch (name) {
      case 'read_file':
      case 'write_file':
      case 'patch_file':
        return input.path || '';
      case 'run_shell':
        return `$ ${input.cmd || ''}`;
      case 'grep_search':
        return `/${input.pattern}/ in ${input.path || '.'}`;
      case 'list_dir':
        return input.path || '.';
      default:
        return JSON.stringify(input).slice(0, 120);
    }
  }

  showError(error) {
    const el = document.createElement('div');
    el.className = 'meow-message meow-message--error';
    el.innerHTML = `
      <div class="meow-message__avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </div>
      <div class="meow-message__content">
        <div class="meow-message__text">Error: ${this._escapeHtml(error)}</div>
      </div>
    `;
    this.messagesEl.appendChild(el);
    this.abortBtn.style.display = 'none';
    this.sendBtn.disabled = false;
    this.state.isStreaming = false;
    this._scrollToBottom();
  }

  showInfo(text) {
    const el = document.createElement('div');
    el.className = 'meow-info-msg';
    el.textContent = text;
    this.messagesEl.appendChild(el);
    this._scrollToBottom();
    setTimeout(() => el.remove(), 3000);
  }

  showFileContext(ctx) {
    this.contextLabel.textContent = ctx.fileName;
    this.contextBadge.style.display = 'flex';
  }

  showSelectionContext(ctx) {
    this.contextLabel.textContent = `${ctx.fileName}:${ctx.startLine} (${ctx.language})`;
    this.contextBadge.style.display = 'flex';
  }

  showPatchResult(success, message) {
    this.showInfo(success ? `Applied successfully: ${message}` : `Patch failed: ${message}`);
  }

  renderHistory(history) {
    this.clearMessages();
    if (!history || history.length === 0) return;

    this.welcomeEl.style.display = 'none';

    for (const msg of history) {
      if (msg.role === 'user') {
        const content = typeof msg.content === 'string' ? msg.content
          : Array.isArray(msg.content) ? msg.content.map(b => b.text || '').join('') : '';
        if (content) this.addUserMessage(content);
      } else if (msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content
          : Array.isArray(msg.content) ? msg.content.map(b => b.text || '').join('') : '';
        if (content) {
          const el = document.createElement('div');
          el.className = 'meow-message meow-message--assistant';
          el.innerHTML = `
            <div class="meow-message__avatar meow-message__avatar--ai">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            </div>
            <div class="meow-message__content">
              <div class="meow-message__text">${this._renderMarkdown(content)}</div>
            </div>
          `;
          this.messagesEl.appendChild(el);
          this._attachCodeCopyButtons(el);
          this._attachApplyButtons(el);
        }
      }
    }
    this._scrollToBottom();
  }

  renderSessions(sessions) {
    const existing = document.getElementById('meow-sessions-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'meow-sessions-panel';
    panel.className = 'meow-sessions-panel';
    panel.innerHTML = `
      <div class="meow-sessions-panel__header">
        <span>History & Sessions</span>
        <button class="meow-sessions-panel__close" onclick="this.closest('#meow-sessions-panel').remove()">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="meow-sessions-panel__list">
        ${sessions.length === 0 ? '<div class="meow-sessions-empty">No saved sessions</div>' :
          sessions.map(s => `
            <div class="meow-session-item" data-id="${s.id}">
              <div class="meow-session-item__name">${this._escapeHtml(s.name)}</div>
              <div class="meow-session-item__meta">${s.messageCount} messages · ${s.model}</div>
            </div>
          `).join('')
        }
      </div>
    `;

    panel.querySelectorAll('.meow-session-item').forEach(item => {
      item.addEventListener('click', () => {
        this.vscode.postMessage({ type: 'loadSession', id: item.dataset.id });
        panel.remove();
      });
    });

    this.container.querySelector('.meow-app').insertBefore(panel, this.messagesEl);
  }

  clearMessages() {
    const msgs = this.messagesEl.querySelectorAll('.meow-message, .meow-tool-call, .meow-info-msg');
    msgs.forEach(el => el.remove());
    if (this.welcomeEl) this.welcomeEl.style.display = 'flex';
  }

  prefillInput(text, options = {}) {
    this.inputEl.value = text;
    this.charCount.textContent = text.length.toLocaleString();
    this.inputEl.focus();

    if (options.selection) {
      this.state.selection = { content: options.selection, language: options.language };
      this.contextLabel.textContent = `${options.language || 'code'} selection`;
      this.contextBadge.style.display = 'flex';
    }

    if (options.autoSend) {
      setTimeout(() => this._send(), 100);
    }
  }

  updateCost(cost) {
    if (!cost) return;
    const session = cost.session;
    const tokens = session.tokens;
    const total = tokens.input + tokens.output;

    if (total > 0) {
      this.costBar.style.display = 'flex';
      document.getElementById('meow-cost-text').textContent = session.costFormatted;
      document.getElementById('meow-tokens-text').textContent = `${total.toLocaleString()} tokens`;
    }
  }

  updateConfig(config) {
    if (config.model) {
      const shortModel = config.model.split('/').pop().split('-').slice(0, 2).join('-');
      this.modelLabel.textContent = shortModel;
    }
  }

  _toggleSessionsPanel() {
    const panel = document.getElementById('meow-sessions-panel');
    if (panel) panel.remove();
    else this.vscode.postMessage({ type: 'getSessions' });
  }

  // ─── Markdown & Code ──────────────────────────────────────────────────────

  _renderMarkdown(text) {
    if (!text) return '';

    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<div class="meow-code-block">
          <div class="meow-code-header">
            <span class="meow-code-lang">${lang || 'code'}</span>
            <div class="meow-code-actions">
              <button class="meow-code-copy">
                <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                Copy
              </button>
              ${lang ? `<button class="meow-code-apply" data-lang="${lang}">
                <svg viewBox="0 0 24 24" class="meow-icon-xs"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Apply
              </button>` : ''}
            </div>
          </div>
          <pre><code class="language-${lang}">${code}</code></pre>
        </div>`;
      })

      // Inline code
      .replace(/`([^`]+)`/g, '<code class="meow-inline-code">$1</code>')

      // Bold / Italic
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')

      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')

      // Unordered lists
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

      // Numbered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

      // Horizontal rule
      .replace(/^---$/gm, '<hr>')

      // Paragraphs
      .replace(/\n\n/g, '</p><p>')

      // Single newlines
      .replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
  }

  _attachCodeCopyButtons(container) {
    container.querySelectorAll('.meow-code-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.closest('.meow-code-block')?.querySelector('code')?.innerText || '';
        navigator.clipboard.writeText(code).then(() => {
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<svg viewBox="0 0 24 24" class="meow-icon-xs" style="color:var(--vscode-testing-iconPassedForeground)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copied`;
          setTimeout(() => { btn.innerHTML = originalHTML; }, 1500);
        });
      });
    });
  }

  _attachApplyButtons(container) {
    container.querySelectorAll('.meow-code-apply').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.closest('.meow-code-block')?.querySelector('code')?.innerText || '';
        const lang = btn.dataset.lang;
        this._showApplyDialog(code, lang);
      });
    });
  }

  _showApplyDialog(code, lang) {
    const dialog = document.createElement('div');
    dialog.className = 'meow-apply-dialog';
    dialog.innerHTML = `
      <div class="meow-apply-dialog__content">
        <h3>⚡ Apply Code</h3>
        <p>Apply this <strong>${lang}</strong> block to a file path:</p>
        <input type="text" id="apply-path" placeholder="e.g. src/index.js" class="meow-input-field" autofocus>
        <div class="meow-apply-dialog__actions">
          <button class="meow-btn meow-btn--secondary" id="apply-cancel">Cancel</button>
          <button class="meow-btn meow-btn--primary" id="apply-confirm">Apply Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const input = document.getElementById('apply-path');
    input.focus();

    document.getElementById('apply-confirm').addEventListener('click', () => {
      const filePath = input.value.trim();
      if (filePath) {
        this.vscode.postMessage({
          type: 'applyPatch',
          filePath,
          oldString: '',
          newString: code,
        });
      }
      dialog.remove();
    });

    document.getElementById('apply-cancel').addEventListener('click', () => dialog.remove());
    
    // Support Escape to close
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dialog.remove();
      if (e.key === 'Enter' && e.target === input) {
        document.getElementById('apply-confirm').click();
      }
    });
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _time() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}