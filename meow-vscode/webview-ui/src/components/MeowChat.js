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
            <span class="meow-logo">🐱</span>
            <span class="meow-title">Meow AI</span>
            <span class="meow-model" id="meow-model">claude</span>
          </div>
          <div class="meow-header__right">
            <button class="meow-btn meow-btn--icon" id="btn-sessions" title="Sessions">
              <span class="codicon codicon-history">⏱</span>
            </button>
            <button class="meow-btn meow-btn--icon" id="btn-new-session" title="New Session">
              <span class="codicon codicon-add">+</span>
            </button>
            <button class="meow-btn meow-btn--icon" id="btn-compact" title="Compact History">
              <span class="codicon codicon-fold">✂</span>
            </button>
            <button class="meow-btn meow-btn--icon" id="btn-settings" title="Settings">
              <span class="codicon codicon-gear">⚙</span>
            </button>
          </div>
        </div>

        <!-- Cost Bar -->
        <div class="meow-cost-bar" id="meow-cost-bar" style="display:none">
          <span id="meow-cost-text">$0.0000</span>
          <span id="meow-tokens-text">0 tokens</span>
        </div>

        <!-- Context Badge -->
        <div class="meow-context-badge" id="meow-context-badge" style="display:none">
          <span id="meow-context-label"></span>
          <button class="meow-context-clear" id="btn-clear-context">✕</button>
        </div>

        <!-- Messages -->
        <div class="meow-messages" id="meow-messages">
          <div class="meow-welcome" id="meow-welcome">
            <div class="meow-welcome__icon">🐱</div>
            <div class="meow-welcome__title">Meow AI Agent</div>
            <div class="meow-welcome__subtitle">Your autonomous coding assistant</div>
            <div class="meow-quick-actions">
              <button class="meow-quick-btn" data-action="explain">💡 Explain file</button>
              <button class="meow-quick-btn" data-action="review">🔍 Review code</button>
              <button class="meow-quick-btn" data-action="autopilot">🚀 Autopilot</button>
              <button class="meow-quick-btn" data-action="git">📝 Git summary</button>
              <button class="meow-quick-btn" data-action="analyze">📊 Analyze project</button>
              <button class="meow-quick-btn" data-action="tests">🧪 Generate tests</button>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="meow-input-area">
          <div class="meow-input-toolbar">
            <button class="meow-btn meow-btn--sm" id="btn-attach-file" title="Attach current file">
              📎 File
            </button>
            <button class="meow-btn meow-btn--sm" id="btn-attach-selection" title="Attach selection">
              ✂️ Selection
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
              <span id="send-icon">➤</span>
            </button>
          </div>
          <div class="meow-input-footer">
            <span class="meow-char-count" id="meow-char-count">0</span>
            <button class="meow-btn meow-btn--xs meow-btn--danger" id="btn-abort" style="display:none">
              ⏹ Stop
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
      this.charCount.textContent = this.inputEl.value.length;
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
      // File drop — just show a hint
      this.inputEl.value += '\n[File dropped — use 📎 File button to attach the active file]';
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
      this.charCount.textContent = prompt.length;
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
      <div class="meow-message__avatar">You</div>
      <div class="meow-message__content">
        <div class="meow-message__text">${this._escapeHtml(text)}</div>
        <div class="meow-message__time">${this._time()}</div>
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
      <div class="meow-message__avatar">🐱</div>
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
      // Update raw text (will be rendered on finalize)
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
      contentEl.innerHTML += `
        <div class="meow-message__actions">
          <button class="meow-action-btn" onclick="navigator.clipboard.writeText(this.closest('.meow-message__content').querySelector('.meow-message__text').innerText)">📋 Copy</button>
          <button class="meow-action-btn" data-action="save-memory">🧠 Save to Memory</button>
          <div class="meow-message__time">${this._time()}</div>
        </div>
      `;
    }

    delete this.streamBuffer[id];
    this.abortBtn.style.display = 'none';
    this.sendBtn.disabled = false;
    this.state.isStreaming = false;
    this._scrollToBottom();

    // Bind save-memory button
    msgEl.querySelector('[data-action="save-memory"]')?.addEventListener('click', () => {
      const text = msgEl.querySelector('.meow-message__text')?.innerText || '';
      this.vscode.postMessage({ type: 'addMemory', content: text.slice(0, 1000) });
    });
  }

  showToolCall(name, input, id) {
    const el = document.createElement('div');
    el.className = 'meow-tool-call';
    el.id = `tool-${id}`;

    const icons = {
      read_file: '📖', write_file: '✍️', patch_file: '🔧',
      list_dir: '📁', grep_search: '🔍', run_shell: '⚡',
      git_log: '📜', git_diff: '📊', git_status: '🌿',
      web_search: '🌐', open_file_in_editor: '📂', show_diff: '📋',
    };

    const icon = icons[name] || '🔧';
    const inputStr = this._formatToolInput(name, input);

    el.innerHTML = `
      <div class="meow-tool-call__header">
        <span class="meow-tool-call__icon">${icon}</span>
        <span class="meow-tool-call__name">${name}</span>
        <span class="meow-tool-call__status meow-tool-call__status--running">running...</span>
      </div>
      <div class="meow-tool-call__input">${this._escapeHtml(inputStr)}</div>
    `;

    this.messagesEl.appendChild(el);
    this._scrollToBottom();

    // Mark as done after delay
    setTimeout(() => {
      const statusEl = el.querySelector('.meow-tool-call__status');
      if (statusEl) {
        statusEl.textContent = 'done ✓';
        statusEl.className = 'meow-tool-call__status meow-tool-call__status--done';
      }
    }, 1500);
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
        return JSON.stringify(input).slice(0, 100);
    }
  }

  showError(error) {
    const el = document.createElement('div');
    el.className = 'meow-message meow-message--error';
    el.innerHTML = `
      <div class="meow-message__avatar">❌</div>
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
    this.contextLabel.textContent = `📎 ${ctx.fileName}`;
    this.contextBadge.style.display = 'flex';
  }

  showSelectionContext(ctx) {
    this.contextLabel.textContent = `✂️ ${ctx.fileName}:${ctx.startLine} (${ctx.language})`;
    this.contextBadge.style.display = 'flex';
  }

  showPatchResult(success, message) {
    this.showInfo(success ? `✅ ${message}` : `❌ ${message}`);
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
            <div class="meow-message__avatar">🐱</div>
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
    // Show sessions in a dropdown/panel
    const existing = document.getElementById('meow-sessions-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'meow-sessions-panel';
    panel.className = 'meow-sessions-panel';
    panel.innerHTML = `
      <div class="meow-sessions-panel__header">
        <span>💾 Sessions</span>
        <button onclick="this.closest('#meow-sessions-panel').remove()">✕</button>
      </div>
      <div class="meow-sessions-panel__list">
        ${sessions.length === 0 ? '<div class="meow-sessions-empty">No saved sessions</div>' :
          sessions.map(s => `
            <div class="meow-session-item" data-id="${s.id}">
              <div class="meow-session-item__name">${this._escapeHtml(s.name)}</div>
              <div class="meow-session-item__meta">${s.messageCount} msgs · ${s.model}</div>
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
    // Keep welcome element, clear all messages
    const msgs = this.messagesEl.querySelectorAll('.meow-message, .meow-tool-call, .meow-info-msg');
    msgs.forEach(el => el.remove());
    if (this.welcomeEl) this.welcomeEl.style.display = 'flex';
  }

  prefillInput(text, options = {}) {
    this.inputEl.value = text;
    this.charCount.textContent = text.length;
    this.inputEl.focus();

    if (options.selection) {
      this.state.selection = { content: options.selection, language: options.language };
      this.contextLabel.textContent = `✂️ ${options.language || 'code'} selection`;
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
      const shortModel = config.model.split('-').slice(0, 2).join('-');
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

    // Simple markdown renderer (no external deps in webview)
    let html = text
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<div class="meow-code-block">
          <div class="meow-code-header">
            <span class="meow-code-lang">${lang || 'code'}</span>
            <button class="meow-code-copy" onclick="navigator.clipboard.writeText(this.closest('.meow-code-block').querySelector('code').innerText)">📋</button>
            ${lang ? `<button class="meow-code-apply" data-lang="${lang}">⚡ Apply</button>` : ''}
          </div>
          <pre><code class="language-${lang}">${code}</code></pre>
        </div>`;
      })

      // Inline code
      .replace(/`([^`]+)`/g, '<code class="meow-inline-code">$1</code>')

      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

      // Italic
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

      // Paragraphs (double newlines)
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
          btn.textContent = '✅';
          setTimeout(() => { btn.textContent = '📋'; }, 1500);
        });
      });
    });
  }

  _attachApplyButtons(container) {
    container.querySelectorAll('.meow-code-apply').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.closest('.meow-code-block')?.querySelector('code')?.innerText || '';
        const lang = btn.dataset.lang;
        // Show apply dialog
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
        <p>Apply this ${lang} code to a file?</p>
        <input type="text" id="apply-path" placeholder="File path (e.g., src/main.js)" class="meow-input-field">
        <div class="meow-apply-dialog__actions">
          <button class="meow-btn meow-btn--primary" id="apply-confirm">Apply</button>
          <button class="meow-btn" id="apply-cancel">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    document.getElementById('apply-confirm').addEventListener('click', () => {
      const filePath = document.getElementById('apply-path').value.trim();
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
