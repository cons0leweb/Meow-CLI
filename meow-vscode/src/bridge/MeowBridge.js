/**
 * MeowBridge — The core bridge between VSCode and the Meow CLI AI backend.
 *
 * Architecture:
 *  - Directly calls the Anthropic/OpenAI/OpenRouter APIs (same as Meow CLI)
 *  - Manages session state, tool execution, permissions, checkpoints
 *  - Emits events for the UI to react to
 *  - Runs tool calls in the VSCode workspace context
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';
import { ToolExecutor } from './ToolExecutor.js';
import { SessionManager } from './SessionManager.js';
import { PermissionManager } from './PermissionManager.js';
import { CheckpointManager } from './CheckpointManager.js';
import { RagManager } from './RagManager.js';
import { CostTracker } from './CostTracker.js';

const MEOW_CONFIG_DIR = path.join(os.homedir(), '.meowcli');
const MEOW_CONFIG_FILE = path.join(MEOW_CONFIG_DIR, 'config.json');

export class MeowBridge extends EventEmitter {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    super();
    this.context = context;
    this.isProcessing = false;

    // Sub-managers
    this.tools = new ToolExecutor(this);
    this.sessions = new SessionManager(context);
    this.permissions = new PermissionManager(context);
    this.checkpoints = new CheckpointManager(context);
    this.rag = new RagManager(context);
    this.cost = new CostTracker(context);

    // Conversation history for current session
    this.history = [];
    this.systemPrompt = '';
    this._buildSystemPrompt();
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  getConfig() {
    return vscode.workspace.getConfiguration('meow');
  }

  getApiKey() {
    const cfg = this.getConfig();
    if (cfg.get('apiKey')) return cfg.get('apiKey');

    // Fall back to ~/.meowcli/config.json
    try {
      if (fs.existsSync(MEOW_CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(MEOW_CONFIG_FILE, 'utf8'));
        const provider = cfg.get('apiProvider') || 'anthropic';
        return data[`${provider}_api_key`] || data.api_key || '';
      }
    } catch (e) {
      Logger.warn('Could not read ~/.meowcli/config.json:', e.message);
    }
    return '';
  }

  getModel() {
    return this.getConfig().get('model') || 'claude-opus-4-5';
  }

  getProvider() {
    return this.getConfig().get('apiProvider') || 'anthropic';
  }

  getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  }

  // ─── System Prompt ────────────────────────────────────────────────────────

  _buildSystemPrompt() {
    const cfg = this.getConfig();
    const customPrefix = cfg.get('systemPrompt') || '';
    const wsRoot = this.getWorkspaceRoot();

    // Load MEOW.md if present
    let projectContext = '';
    const meowMd = path.join(wsRoot, 'MEOW.md');
    if (fs.existsSync(meowMd)) {
      try { projectContext = fs.readFileSync(meowMd, 'utf8'); } catch {}
    }

    // Load project.meow if present
    let projectIndex = '';
    const projectMeow = path.join(wsRoot, 'project.meow');
    if (fs.existsSync(projectMeow)) {
      try { projectIndex = fs.readFileSync(projectMeow, 'utf8'); } catch {}
    }

    this.systemPrompt = [
      customPrefix,
      `You are Meow, a powerful AI coding agent integrated into VSCode.`,
      `Current workspace: ${wsRoot}`,
      `You have access to tools for reading/writing files, running shell commands, searching code, and more.`,
      `Always prefer targeted edits (patch_file) over full rewrites (write_file) for existing files.`,
      `When making file changes, explain what you're doing and why.`,
      `Format code responses with proper syntax highlighting.`,
      projectContext ? `\n## Project Context (MEOW.md)\n${projectContext}` : '',
      projectIndex ? `\n## Project Index\n${projectIndex}` : '',
    ].filter(Boolean).join('\n\n');
  }

  async refreshSystemPrompt() {
    this._buildSystemPrompt();
    const ragContext = await this.rag.getContext(this.history.slice(-3).map(m => m.content).join(' '));
    if (ragContext) {
      this.systemPrompt += `\n\n## RAG Memory\n${ragContext}`;
    }
  }

  // ─── Core Chat ────────────────────────────────────────────────────────────

  /**
   * Send a message and stream the response.
   * @param {string} userMessage
   * @param {object} options
   * @param {function} onChunk - called with each streamed token
   * @param {function} onToolCall - called when a tool is invoked
   * @param {function} onComplete - called when done
   */
  async chat(userMessage, options = {}, onChunk, onToolCall, onComplete) {
    if (this.isProcessing) {
      Logger.warn('Already processing, ignoring new chat request');
      return;
    }

    this.isProcessing = true;
    this.emit('processingStart');

    try {
      await this.refreshSystemPrompt();

      // Inject file context if provided
      let fullMessage = userMessage;
      if (options.fileContext) {
        fullMessage = `${options.fileContext}\n\n${userMessage}`;
      }
      if (options.selection) {
        fullMessage = `Selected code (${options.language || 'unknown'}):\n\`\`\`${options.language || ''}\n${options.selection}\n\`\`\`\n\n${userMessage}`;
      }

      this.history.push({ role: 'user', content: fullMessage });

      await this._runAgentLoop(onChunk, onToolCall, onComplete);

    } catch (err) {
      Logger.error('Chat error:', err);
      this.emit('error', err);
      onComplete?.({ error: err.message });
    } finally {
      this.isProcessing = false;
      this.emit('processingEnd');
    }
  }

  /**
   * The core Think-Act loop — mirrors Meow CLI's ai-loop.js
   */
  async _runAgentLoop(onChunk, onToolCall, onComplete) {
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await this._callApi(onChunk);

      if (!response) break;

      // Add assistant message to history
      this.history.push({ role: 'assistant', content: response.content });

      // Track cost
      if (response.usage) {
        this.cost.track(response.usage, this.getModel());
        this.emit('costUpdate', this.cost.getSummary());
      }

      // Check for tool calls
      const toolCalls = response.tool_calls || [];
      if (toolCalls.length === 0) {
        // No more tool calls — we're done
        onComplete?.({ content: response.content, usage: response.usage });
        break;
      }

      // Execute tool calls
      const toolResults = [];
      for (const call of toolCalls) {
        this.emit('toolCall', call);
        onToolCall?.(call);

        const result = await this._executeToolCall(call);
        toolResults.push({
          tool_call_id: call.id,
          role: 'tool',
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });

        this.emit('toolResult', { call, result });
      }

      // Add tool results to history
      this.history.push(...toolResults);
    }

    if (iterations >= MAX_ITERATIONS) {
      onComplete?.({ error: 'Max iterations reached' });
    }
  }

  /**
   * Call the AI API with streaming support.
   */
  async _callApi(onChunk) {
    const provider = this.getProvider();
    const model = this.getModel();
    const apiKey = this.getApiKey();
    const cfg = this.getConfig();
    const maxTokens = cfg.get('maxTokens') || 8192;
    const temperature = cfg.get('temperature') || 0.7;
    const stream = cfg.get('streamResponses') !== false;

    if (!apiKey) {
      throw new Error('No API key configured. Set meow.apiKey in settings or configure ~/.meowcli/config.json');
    }

    const tools = this.tools.getToolDefinitions();

    switch (provider) {
      case 'anthropic':
        return this._callAnthropic({ model, apiKey, maxTokens, temperature, stream, tools, onChunk });
      case 'openai':
        return this._callOpenAI({ model, apiKey, maxTokens, temperature, stream, tools, onChunk });
      case 'openrouter':
        return this._callOpenRouter({ model, apiKey, maxTokens, temperature, stream, tools, onChunk });
      case 'ollama':
        return this._callOllama({ model, maxTokens, temperature, stream, tools, onChunk });
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  async _callAnthropic({ model, apiKey, maxTokens, temperature, stream, tools, onChunk }) {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: this.systemPrompt,
      messages: this._formatHistoryForAnthropic(),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    };

    if (stream) {
      return this._streamAnthropic(apiKey, body, onChunk);
    } else {
      return this._fetchJson('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      }).then(data => this._parseAnthropicResponse(data));
    }
  }

  async _streamAnthropic(apiKey, body, onChunk) {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify({ ...body, stream: true });
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      };

      let fullContent = '';
      let toolCalls = [];
      let currentToolCall = null;
      let usage = null;

      const req = https.request(options, (res) => {
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              this._handleAnthropicStreamEvent(event, {
                onText: (text) => {
                  fullContent += text;
                  onChunk?.(text);
                },
                onToolStart: (tool) => { currentToolCall = tool; },
                onToolDelta: (delta) => {
                  if (currentToolCall) currentToolCall.input_delta = (currentToolCall.input_delta || '') + delta;
                },
                onToolEnd: () => {
                  if (currentToolCall) {
                    try {
                      currentToolCall.input = JSON.parse(currentToolCall.input_delta || '{}');
                    } catch { currentToolCall.input = {}; }
                    toolCalls.push({
                      id: currentToolCall.id,
                      name: currentToolCall.name,
                      input: currentToolCall.input,
                    });
                    currentToolCall = null;
                  }
                },
                onUsage: (u) => { usage = u; },
              });
            } catch {}
          }
        });

        res.on('end', () => {
          resolve({
            content: fullContent,
            tool_calls: toolCalls,
            usage,
          });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  _handleAnthropicStreamEvent(event, handlers) {
    switch (event.type) {
      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          handlers.onToolStart?.({
            id: event.content_block.id,
            name: event.content_block.name,
          });
        }
        break;
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          handlers.onText?.(event.delta.text);
        } else if (event.delta?.type === 'input_json_delta') {
          handlers.onToolDelta?.(event.delta.partial_json);
        }
        break;
      case 'content_block_stop':
        handlers.onToolEnd?.();
        break;
      case 'message_delta':
        if (event.usage) handlers.onUsage?.(event.usage);
        break;
    }
  }

  _parseAnthropicResponse(data) {
    const textBlocks = data.content?.filter(b => b.type === 'text') || [];
    const toolBlocks = data.content?.filter(b => b.type === 'tool_use') || [];

    return {
      content: textBlocks.map(b => b.text).join(''),
      tool_calls: toolBlocks.map(b => ({
        id: b.id,
        name: b.name,
        input: b.input,
      })),
      usage: data.usage,
    };
  }

  _formatHistoryForAnthropic() {
    return this.history.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          }],
        };
      }
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        return msg;
      }
      return { role: msg.role, content: msg.content };
    });
  }

  async _callOpenAI({ model, apiKey, maxTokens, temperature, stream, tools, onChunk }) {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: this.systemPrompt },
        ...this.history,
      ],
      tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      stream,
    };

    const data = await this._fetchJson('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const choice = data.choices?.[0];
    const msg = choice?.message;
    return {
      content: msg?.content || '',
      tool_calls: (msg?.tool_calls || []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      })),
      usage: data.usage,
    };
  }

  async _callOpenRouter({ model, apiKey, maxTokens, temperature, stream, tools, onChunk }) {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: this.systemPrompt },
        ...this.history,
      ],
      tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    };

    const data = await this._fetchJson('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://meowcli.dev',
        'X-Title': 'Meow CLI VSCode',
      },
      body: JSON.stringify(body),
    });

    const choice = data.choices?.[0];
    const msg = choice?.message;
    return {
      content: msg?.content || '',
      tool_calls: (msg?.tool_calls || []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      })),
      usage: data.usage,
    };
  }

  async _callOllama({ model, maxTokens, temperature, tools, onChunk }) {
    const ollamaUrl = 'http://localhost:11434/api/chat';
    const body = {
      model,
      messages: [
        { role: 'system', content: this.systemPrompt },
        ...this.history,
      ],
      stream: false,
      options: { num_predict: maxTokens, temperature },
    };

    const data = await this._fetchJson(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return {
      content: data.message?.content || '',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  // ─── Tool Execution ───────────────────────────────────────────────────────

  async _executeToolCall(call) {
    const toolName = call.name;
    const input = call.input || {};

    // Check permissions
    const permission = await this.permissions.check(toolName, input);
    if (permission === 'deny') {
      return `Tool '${toolName}' was denied by user permissions.`;
    }
    if (permission === 'ask') {
      const allowed = await this._askUserPermission(toolName, input);
      if (!allowed) return `Tool '${toolName}' was denied by user.`;
    }

    // Checkpoint before destructive operations
    const destructive = ['write_file', 'patch_file', 'run_shell', 'git_commit'];
    if (destructive.includes(toolName) && this.getConfig().get('enableCheckpoints')) {
      await this.checkpoints.create(toolName, input);
    }

    try {
      return await this.tools.execute(toolName, input);
    } catch (err) {
      Logger.error(`Tool '${toolName}' failed:`, err);
      return `Error executing ${toolName}: ${err.message}`;
    }
  }

  async _askUserPermission(toolName, input) {
    const inputPreview = JSON.stringify(input, null, 2).slice(0, 200);
    const answer = await vscode.window.showWarningMessage(
      `🐱 Meow wants to run: ${toolName}\n\n${inputPreview}`,
      { modal: true },
      'Allow',
      'Allow Always',
      'Deny'
    );

    if (answer === 'Allow Always') {
      this.permissions.setPermission(toolName, 'allow');
      return true;
    }
    return answer === 'Allow';
  }

  // ─── Session Management ───────────────────────────────────────────────────

  async newSession() {
    this.history = [];
    await this._buildSystemPrompt();
    this.emit('sessionChanged');
  }

  async saveSession(name) {
    const session = await this.sessions.save({
      name,
      history: this.history,
      model: this.getModel(),
      timestamp: Date.now(),
    });
    this.emit('sessionChanged');
    return session;
  }

  async loadSession(id) {
    const session = await this.sessions.load(id);
    if (session) {
      this.history = session.history || [];
      this.emit('sessionChanged');
    }
    return session;
  }

  async listSessions() {
    return this.sessions.list();
  }

  // ─── History Management ───────────────────────────────────────────────────

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
    this.emit('sessionChanged');
  }

  compactHistory() {
    // Keep only last N messages to save tokens
    const MAX_HISTORY = 20;
    if (this.history.length > MAX_HISTORY) {
      const systemMessages = this.history.filter(m => m.role === 'system');
      const recent = this.history.slice(-MAX_HISTORY);
      this.history = [...systemMessages, ...recent];
    }
    return this.history.length;
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  _fetchJson(url, options) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const lib = isHttps ? https : http;
      const urlObj = new URL(url);

      const reqOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        port: urlObj.port || (isHttps ? 443 : 80),
        method: options.method || 'GET',
        headers: options.headers || {},
      };

      const req = lib.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`API error ${res.statusCode}: ${parsed.error?.message || data}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  abort() {
    this.isProcessing = false;
    this.emit('aborted');
  }

  dispose() {
    this.removeAllListeners();
    this.tools.dispose?.();
  }
}
