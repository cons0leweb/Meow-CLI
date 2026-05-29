/**
 * Meow CLI Web Backend Server
 * Wraps all core meow-cli modules behind a REST API.
 * Provides session management, config, cost tracking, auth, and AI chat.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Import Meow CLI Core Modules ───────────────────────────────────
const MEOW_CLI_SRC = path.join(__dirname, '..', 'src', 'modules');

let configModule, persistenceModule, sessionsModule, costTrackerModule, authModule, apiModule, autopilotModule, toolsModule;

async function loadModules() {
  try {
    configModule = await import(path.join(MEOW_CLI_SRC, 'config.js'));
    console.log('  ✓ Loaded module: config');
  } catch (e) { console.error('  ✗ Failed config:', e.message); }

  try {
    persistenceModule = await import(path.join(MEOW_CLI_SRC, 'persistence.js'));
    console.log('  ✓ Loaded module: persistence');
  } catch (e) { console.error('  ✗ Failed persistence:', e.message); }

  try {
    sessionsModule = await import(path.join(MEOW_CLI_SRC, 'sessions.js'));
    console.log('  ✓ Loaded module: sessions');
  } catch (e) { console.error('  ✗ Failed sessions:', e.message); }

  try {
    costTrackerModule = await import(path.join(MEOW_CLI_SRC, 'cost-tracker.js'));
    console.log('  ✓ Loaded module: cost-tracker');
  } catch (e) { console.error('  ✗ Failed cost-tracker:', e.message); }

  try {
    authModule = await import(path.join(MEOW_CLI_SRC, 'auth.js'));
    console.log('  ✓ Loaded module: auth');
  } catch (e) { console.error('  ✗ Failed auth:', e.message); }

  try {
    apiModule = await import(path.join(MEOW_CLI_SRC, 'api.js'));
    console.log('  ✓ Loaded module: api');
  } catch (e) { console.error('  ✗ Failed api:', e.message); }

  try {
    autopilotModule = await import(path.join(MEOW_CLI_SRC, 'autopilot.js'));
    console.log('  ✓ Loaded module: autopilot');
  } catch (e) { console.error('  ✗ Failed autopilot:', e.message); }

  try {
    toolsModule = await import(path.join(MEOW_CLI_SRC, 'tools.js'));
    console.log('  ✓ Loaded module: tools');
  } catch (e) { console.error('  ✗ Failed tools:', e.message); }
}

await loadModules();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Tool-to-Activity-Type Mapper ────────────────────────────────────
function toolToActivityType(toolName) {
  const toolMap = {
    'read_file':      'read',
    'list_dir':       'read',
    'grep_search':    'read',
    'write_file':     'edit',
    'patch_file':     'edit',
    'run_shell':      'build',
    'tool_chain':     'build',
    'http_request':   'generic',
    'web_search':     'generic',
    'delegate_task':  'thought',
    'think':          'thought',
    'working':        'thought',
    'ask_user':       'review',
    'confirm':        'review',
    'choose':         'review',
    'git_diff':       'review',
    'git_log':        'review',
    'git_commit':     'edit',
    'git_branch':     'edit',
    'ci_pipeline':    'test',
  };
  return toolMap[toolName] || 'generic';
}

// ─── Middleware ──────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost:3001'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Global State ───────────────────────────────────────────────────
let sessionManager = null;
let costTracker = null;

try {
  if (sessionsModule?.SessionManager) {
    sessionManager = new sessionsModule.SessionManager();
    sessionManager.create();
    console.log(`  ✓ Session created: ${sessionManager.sessionId}`);
  }
} catch (e) {
  console.error('Session manager init error:', e.message);
}

try {
  if (costTrackerModule?.CostTracker) {
    costTracker = new costTrackerModule.CostTracker();
  }
} catch (e) {
  console.error('Cost tracker init error:', e.message);
}

// ─── Helper: Load/Save Config ───────────────────────────────────────
function loadConfig() {
  try {
    if (persistenceModule?.loadConfig) return persistenceModule.loadConfig();
  } catch (e) {
    console.error('loadConfig error:', e.message);
  }
  try {
    if (configModule?.DEFAULT_CONFIG) return { ...configModule.DEFAULT_CONFIG };
  } catch {}
  return {};
}

function saveConfig(cfg) {
  try {
    if (persistenceModule?.saveConfig) {
      persistenceModule.saveConfig(cfg);
      return true;
    }
  } catch (e) {
    console.error('saveConfig error:', e.message);
  }
  return false;
}

// ─── Routes ─────────────────────────────────────────────────────────

// Test routes
app.get('/api/debug', (req, res) => {
  res.json({ debug: 'working', modules: { config: !!configModule, persistence: !!persistenceModule, sessions: !!sessionsModule, cost: !!costTrackerModule, auth: !!authModule, api: !!apiModule, autopilot: !!autopilotModule } });
});

app.get('/api/ping', (req, res) => {
  res.json({ pong: true, time: Date.now() });
});

// ─── Health & Info ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.4', name: 'meow-cli-web' });
});

app.get('/api/info', (req, res) => {
  let pkg = { version: '0.0.0', name: 'meow-cli', description: '' };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  } catch {}
  res.json({
    version: pkg.version,
    name: pkg.name,
    description: pkg.description,
    dataDir: configModule?.DATA_DIR || '~/.meowcli/data',
    cwd: process.cwd(),
  });
});

// ─── Config Management ──────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  try {
    const cfg = loadConfig();
    const safe = JSON.parse(JSON.stringify(cfg));
    if (safe.api_key && safe.api_key.length > 12) safe.api_key = safe.api_key.substring(0, 8) + '...' + safe.api_key.substring(safe.api_key.length - 4);
    if (safe.providers) {
      safe.providers = Object.fromEntries(
        Object.entries(safe.providers).map(([k, v]) => {
          const p = { ...v };
          if (p.api_key && p.api_key.length > 12) p.api_key = p.api_key.substring(0, 8) + '...' + p.api_key.substring(p.api_key.length - 4);
          return [k, p];
        })
      );
    }
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const existing = loadConfig();
    const updates = req.body;
    const merged = { ...existing, ...updates };
    // Deep-merge nested objects
    for (const key of ['git', 'autopilot', 'prompt_optimizer', 'vacuum']) {
      if (updates[key]) merged[key] = { ...existing[key], ...updates[key] };
    }
    if (updates.profiles) merged.profiles = { ...existing.profiles, ...updates.profiles };
    if (updates.providers) merged.providers = { ...existing.providers, ...updates.providers };
    if (updates.aliases) merged.aliases = { ...existing.aliases, ...updates.aliases };
    if (updates.templates) merged.templates = { ...existing.templates, ...updates.templates };
    if (updates.plugins) merged.plugins = { ...existing.plugins, ...updates.plugins };

    saveConfig(merged);
    res.json({ success: true, message: 'Config saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/config/raw', (req, res) => {
  try {
    const cfg = loadConfig();
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API Key Management ─────────────────────────────────────────────
app.put('/api/config/api-key', (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'API key required' });
    const cfg = loadConfig();
    cfg.api_key = key;
    saveConfig(cfg);
    res.json({ success: true, message: 'API key saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config/model', (req, res) => {
  try {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: 'Model required' });
    const cfg = loadConfig();
    cfg.model = model;
    saveConfig(cfg);
    res.json({ success: true, message: `Model set to ${model}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config/api-base', (req, res) => {
  try {
    const { api_base } = req.body;
    if (!api_base) return res.status(400).json({ error: 'API base URL required' });
    const cfg = loadConfig();
    cfg.api_base = api_base;
    saveConfig(cfg);
    res.json({ success: true, message: 'API base URL saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Profile Management ─────────────────────────────────────────────
app.get('/api/profiles', (req, res) => {
  try {
    const cfg = loadConfig();
    res.json(cfg.profiles || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/profiles/:name', (req, res) => {
  try {
    const { name } = req.params;
    const profileData = req.body;
    const cfg = loadConfig();
    if (!cfg.profiles) cfg.profiles = {};
    cfg.profiles[name] = { ...(cfg.profiles[name] || {}), ...profileData };
    saveConfig(cfg);
    res.json({ success: true, message: `Profile '${name}' saved` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/profiles/:name', (req, res) => {
  try {
    const { name } = req.params;
    const cfg = loadConfig();
    if (cfg.profiles && cfg.profiles[name]) {
      delete cfg.profiles[name];
      saveConfig(cfg);
      res.json({ success: true, message: `Profile '${name}' deleted` });
    } else {
      res.status(404).json({ error: `Profile '${name}' not found` });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config/profile', (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile) return res.status(400).json({ error: 'Profile name required' });
    const cfg = loadConfig();
    cfg.profile = profile;
    saveConfig(cfg);
    res.json({ success: true, message: `Profile set to '${profile}'` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Provider Management ────────────────────────────────────────────
app.get('/api/providers', (req, res) => {
  try {
    const cfg = loadConfig();
    const providers = cfg.providers || {};
    const safe = Object.fromEntries(
      Object.entries(providers).map(([k, v]) => {
        const p = { ...v };
        if (p.api_key && p.api_key.length > 12) p.api_key = p.api_key.substring(0, 8) + '...' + p.api_key.substring(p.api_key.length - 4);
        return [k, p];
      })
    );
    res.json({
      providers: safe,
      active: cfg.active_provider || '',
      api_schema: cfg.api_schema || 'openai',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/providers', (req, res) => {
  try {
    const { id, ...providerConfig } = req.body;
    if (!id) return res.status(400).json({ error: 'Provider ID required' });
    const cfg = loadConfig();
    if (!cfg.providers) cfg.providers = {};
    cfg.providers[id] = providerConfig;
    saveConfig(cfg);
    res.json({ success: true, message: `Provider '${id}' created` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/providers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const cfg = loadConfig();
    if (!cfg.providers) cfg.providers = {};
    cfg.providers[id] = { ...(cfg.providers[id] || {}), ...updates };
    saveConfig(cfg);
    res.json({ success: true, message: `Provider '${id}' updated` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/providers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const cfg = loadConfig();
    if (cfg.providers && cfg.providers[id]) {
      delete cfg.providers[id];
      if (cfg.active_provider === id) cfg.active_provider = '';
      saveConfig(cfg);
      res.json({ success: true, message: `Provider '${id}' deleted` });
    } else {
      res.status(404).json({ error: `Provider '${id}' not found` });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/providers/:id/activate', (req, res) => {
  try {
    const { id } = req.params;
    const cfg = loadConfig();
    if (!cfg.providers || !cfg.providers[id]) {
      return res.status(404).json({ error: `Provider '${id}' not found` });
    }
    cfg.active_provider = id;
    const provider = cfg.providers[id];
    if (provider.base_url) cfg.api_base = provider.base_url;
    if (provider.api_key) cfg.api_key = provider.api_key;
    if (provider.model) cfg.model = provider.model;
    if (provider.api_schema) cfg.api_schema = provider.api_schema;
    saveConfig(cfg);
    res.json({ success: true, message: `Provider '${id}' activated` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Session Management ─────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  try {
    if (!sessionManager) return res.json({ sessions: [], current: null });
    const sessions = sessionManager.list();
    res.json({
      sessions,
      current: sessionManager.sessionId,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sessions', (req, res) => {
  try {
    if (!sessionManager) {
      if (sessionsModule?.SessionManager) {
        sessionManager = new sessionsModule.SessionManager();
      } else {
        return res.status(500).json({ error: 'Session manager unavailable' });
      }
    }
    const id = sessionManager.create();
    console.log(`  ✓ New session created: ${id}`);
    res.json({ sessionId: id, message: 'New session created' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sessions/:id', (req, res) => {
  try {
    if (!sessionManager) return res.status(404).json({ error: 'No session manager' });
    const data = sessionManager.load(req.params.id);
    if (!data) return res.status(404).json({ error: 'Session not found' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    if (!sessionManager) return res.status(404).json({ error: 'No session manager' });
    const deleted = sessionManager.delete(req.params.id);
    if (deleted) {
      if (sessionManager.sessionId === req.params.id) {
        sessionManager.create();
      }
      res.json({ success: true, message: 'Session deleted' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Chat / Messages ────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const cfg = loadConfig();
    if (!cfg.api_key) {
      return res.status(400).json({ error: 'API key not configured. Set it in Settings.' });
    }

    const effectiveModel = model || cfg.model;
    const effectiveCfg = { ...cfg, model: effectiveModel };

    if (!apiModule?.callApi) {
      return res.status(500).json({ error: 'API module not loaded' });
    }

    const data = await apiModule.callApi(messages, effectiveCfg);

    if (costTracker && data.usage) {
      costTracker.record(data.usage, effectiveModel);
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Streaming Chat (SSE) with Tool Execution Loop ─────────────────
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const cfg = loadConfig();
    if (!cfg.api_key) {
      return res.status(400).json({ error: 'API key not configured' });
    }

    const effectiveModel = model || cfg.model;
    const effectiveCfg = { ...cfg, model: effectiveModel };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!apiModule?.callApiStream || !apiModule?.callApi) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'API module not fully loaded' })}\n\n`);
      res.end();
      return;
    }

    const MAX_TOOL_ROUNDS = 10;
    let fullContent = '';
    let accumulatedUsage = null;
    let allToolCalls = [];

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const isFirst = round === 0;
        let result;

        if (isFirst) {
          // First round: stream
          result = await apiModule.callApiStream(messages, effectiveCfg, (chunk) => {
            if (chunk.type === 'text' && chunk.content) {
              fullContent += chunk.content;
              res.write(`data: ${JSON.stringify({ type: 'content', content: chunk.content })}\n\n`);
            }
          });
        } else {
          // Subsequent rounds: non-streaming with tool results
          result = await apiModule.callApi(messages, effectiveCfg);
        }

        if (!result) break;

        const msg = result.choices?.[0]?.message;
        if (!msg) break;

        // Accumulate content from non-streaming rounds
        if (!isFirst && msg.content) {
          fullContent += '\n\n' + msg.content;
          res.write(`data: ${JSON.stringify({ type: 'content', content: '\n\n' + msg.content })}\n\n`);
        }

        if (result.usage) {
          accumulatedUsage = result.usage;
          if (costTracker) costTracker.record(result.usage, effectiveModel);
        }

        const toolCalls = msg.tool_calls || [];
        if (toolCalls.length === 0) {
          // No more tool calls — done
          if (msg.content) fullContent = msg.content;
          break;
        }

        // Execute tools and push results
        allToolCalls.push(...toolCalls);

        // Push assistant message with tool calls BEFORE tool results
        messages.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function?.name || tc.name || '',
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || {})
            }
          }))
        });

        for (const tc of toolCalls) {
          const name = tc.function?.name || tc.name || 'unknown';
          let args = {};
          try {
            const rawArgs = tc.function?.arguments;
            args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || tc.input || {});
          } catch {
            args = { raw: String(tc.function?.arguments || '') };
          }

          // Notify frontend about the tool call
          res.write(`data: ${JSON.stringify({
            type: 'tool_call',
            id: tc.id || `tc-${Date.now()}-${round}`,
            name,
            args,
            toolType: toolToActivityType(name)
          })}\n\n`);

          // Execute the tool
          let toolResult = '';
          try {
            if (toolsModule?.executeTool) {
              toolResult = await toolsModule.executeTool(name, args, effectiveCfg);
            } else {
              toolResult = `Tool execution not available (${name})`;
            }
          } catch (toolErr) {
            toolResult = `Error: ${toolErr.message}`;
          }

          // Truncate large results
          if (toolResult && toolResult.length > 10000) {
            toolResult = toolResult.slice(0, 10000) + '\n… [truncated]';
          }

          // Send tool result
          res.write(`data: ${JSON.stringify({
            type: 'tool_result',
            id: tc.id || `tc-${Date.now()}-${round}`,
            name,
            result: toolResult
          })}\n\n`);

          // Push tool result into messages for next AI round
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: toolResult || ''
          });
        }
      }

      res.write(`data: ${JSON.stringify({
        type: 'done',
        content: fullContent,
        tool_calls: allToolCalls,
        usage: accumulatedUsage
      })}\n\n`);
      res.end();
    } catch (apiErr) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: apiErr.message })}\n\n`);
      res.end();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Cost Tracking ──────────────────────────────────────────────────
app.get('/api/cost', (req, res) => {
  try {
    if (!costTracker) return res.json({ session: null, total: null, history: [], modelPrices: {} });
    res.json({
      session: costTracker.sessionCost,
      total: costTracker.totalCost,
      history: costTracker.history?.slice(-20) || [],
      modelPrices: costTrackerModule?.MODEL_PRICES || {},
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cost/reset', (req, res) => {
  try {
    if (!costTracker) return res.status(404).json({ error: 'No cost tracker' });
    if (typeof costTracker.resetTotal === 'function') costTracker.resetTotal();
    res.json({ success: true, message: 'Cost tracking reset' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Templates ──────────────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  try {
    const cfg = loadConfig();
    res.json(cfg.templates || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/templates', (req, res) => {
  try {
    const templates = req.body;
    const cfg = loadConfig();
    cfg.templates = templates;
    saveConfig(cfg);
    res.json({ success: true, message: 'Templates saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Theme ──────────────────────────────────────────────────────────
app.get('/api/theme', (req, res) => {
  try {
    const cfg = loadConfig();
    const themeFile = path.join(configModule?.DATA_DIR || path.join(process.env.HOME || '/tmp', '.meowcli', 'data'), '..', '..', 'themes.json');
    let themes = {};
    try {
      themes = JSON.parse(fs.readFileSync(themeFile, 'utf8'));
    } catch {}

    const webThemes = {};
    for (const [name, colors] of Object.entries(themes)) {
      webThemes[name] = {
        bg: colors.bg || '#070709',
        surface: colors.bg2 || '#0e0e11',
        border: colors.border || '#16161a',
        text: colors.text || '#d4d4d8',
        accent: colors.accent || '#CC7832',
        success: colors.success || '#6ABE82',
        error: colors.error || '#D26060',
        warning: colors.warning || '#DEB858',
        info: colors.info || '#6CB4DC',
        muted: colors.muted || '#52525b',
      };
    }

    res.json({
      current: cfg.theme || 'default',
      themes: webThemes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/theme', (req, res) => {
  try {
    const { theme } = req.body;
    const cfg = loadConfig();
    cfg.theme = theme;
    saveConfig(cfg);
    res.json({ success: true, message: `Theme set to '${theme}'` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── System Status ──────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  try {
    const cfg = loadConfig();
    const hasApiKey = !!(cfg.api_key || Object.values(cfg.providers || {}).some(p => p.api_key));

    res.json({
      apiKeyConfigured: hasApiKey,
      activeModel: cfg.model || 'not set',
      activeProfile: cfg.profile || 'default',
      activeProvider: cfg.active_provider || 'none',
      theme: cfg.theme || 'default',
      lang: cfg.lang || 'ru',
      sessionsCount: sessionManager?.list().length || 0,
      autopilotMaxIterations: cfg.autopilot?.max_iterations || 50,
      autoYes: cfg.auto_yes || false,
      quiet: cfg.quiet || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Models List ────────────────────────────────────────────────────
app.get('/api/models', (req, res) => {
  const commonModels = [
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
    { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', provider: 'google' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' },
  ];

  res.json(commonModels);
});

// ─── Project Context (MEOW.md) ──────────────────────────────────────
app.get('/api/context', (req, res) => {
  try {
    const ctxFile = path.join(process.cwd(), 'MEOW.md');
    if (fs.existsSync(ctxFile)) {
      const content = fs.readFileSync(ctxFile, 'utf8');
      res.json({ content, path: ctxFile });
    } else {
      res.json({ content: '', path: ctxFile });
    }
  } catch (e) {
    res.json({ content: '', path: '' });
  }
});

// ─── Work Directory (CWD) ───────────────────────────────────────────
app.get('/api/cwd', (req, res) => {
  res.json({ cwd: process.cwd(), dataDir: configModule?.DATA_DIR || '' });
});

app.put('/api/cwd', (req, res) => {
  try {
    const { cwd } = req.body;
    if (!cwd) return res.status(400).json({ error: 'cwd path required' });
    if (!fs.existsSync(cwd)) return res.status(400).json({ error: `Directory does not exist: ${cwd}` });
    const stat = fs.statSync(cwd);
    if (!stat.isDirectory()) return res.status(400).json({ error: `Not a directory: ${cwd}` });

    process.chdir(cwd);
    const newCwd = process.cwd();

    res.json({ success: true, cwd: newCwd, message: `Changed to ${newCwd}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── File Operations (Tool Bridge) ──────────────────────────────────
app.get('/api/files/read', (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path query param required' });

    const resolved = path.resolve(process.cwd(), filePath);
    if (!resolved.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Path outside CWD not allowed' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });

    const content = fs.readFileSync(resolved, 'utf8');
    const stat = fs.statSync(resolved);
    res.json({
      path: resolved,
      size: stat.size,
      mtime: stat.mtime,
      content,
      truncated: content.length > 50000
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/write', (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'path and content required' });

    const resolved = path.resolve(process.cwd(), filePath);
    if (!resolved.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Path outside CWD not allowed' });
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');

    res.json({ success: true, path: resolved, size: content.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/list', (req, res) => {
  try {
    const dirPath = req.body?.path || '.';
    const resolved = path.resolve(process.cwd(), dirPath);
    if (!resolved.startsWith(process.cwd())) {
      return res.status(403).json({ error: 'Path outside CWD not allowed' });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Directory not found' });

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const files = entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : 0,
    }));

    res.json({ path: resolved, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Autopilot Routes ───────────────────────────────────────────────
let autopilotRunner = null;
let autopilotRunning = false;

app.post('/api/autopilot/execute', async (req, res) => {
  try {
    const { task, model } = req.body;
    if (!task) return res.status(400).json({ error: 'task required' });

    const cfg = loadConfig();
    if (!cfg.api_key) return res.status(400).json({ error: 'API key not configured' });

    if (!autopilotModule?.Autopilot) {
      return res.status(500).json({ error: 'Autopilot module not available' });
    }

    const AutopilotClass = autopilotModule.Autopilot;
    const effectiveModel = model || cfg.model;
    const effectiveCfg = { ...cfg, model: effectiveModel };
    const systemContent = cfg.profiles?.[cfg.profile || 'default']?.system ||
      'Ты — опытный инженер-программист. Твои ответы кратки, точны и по существу.';

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: task },
    ];

    const runner = new AutopilotClass(effectiveCfg, messages, (state) => {
      try {
        if (sessionManager?.sessionId) {
          const data = sessionManager.load(sessionManager.sessionId) || {};
          sessionManager.save({ ...data, ...state, autopilot: true });
        }
      } catch {}
    });

    autopilotRunner = runner;
    autopilotRunning = true;

    res.json({
      success: true,
      message: 'Autopilot started',
      task,
      model: effectiveModel,
      maxIterations: effectiveCfg.autopilot?.max_iterations || 50,
    });

    runner.running = true;
    runner.run().catch(err => {
      console.error('Autopilot error:', err.message);
      autopilotRunning = false;
    }).finally(() => {
      autopilotRunning = false;
    });
  } catch (e) {
    autopilotRunning = false;
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/autopilot/status', (req, res) => {
  res.json({
    running: autopilotRunning,
    hasInstance: !!autopilotRunner,
    phase: autopilotRunner?.currentPhase || 'idle',
    iterations: autopilotRunner?.iteration || 0,
    errors: autopilotRunner?.errors || 0,
  });
});

app.post('/api/autopilot/cancel', (req, res) => {
  if (autopilotRunner && typeof autopilotRunner.abort === 'function') {
    autopilotRunner.abort();
  } else if (autopilotRunner) {
    autopilotRunner.running = false;
  }
  autopilotRunning = false;
  res.json({ success: true, message: 'Autopilot cancelled' });
});

// ─── Session Save (explicit) ────────────────────────────────────────
app.post('/api/sessions/:id/save', (req, res) => {
  try {
    const { id } = req.params;
    const { messages, model, profile } = req.body;

    if (!sessionManager) {
      return res.status(404).json({ error: 'No session manager' });
    }

    const data = sessionManager.load(id) || {};
    // load() already sets sessionManager.sessionId = id

    const saveData = {
      ...data,
      model: model || data.model || '',
      profile: profile || data.profile || 'default',
      messages: messages || data.messages || [],
      messagesCount: (messages || data.messages || []).length,
    };

    sessionManager.save(saveData);
    res.json({ success: true, message: 'Session saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Shell Command (Tool Bridge) ────────────────────────────────────
app.post('/api/shell/exec', async (req, res) => {
  try {
    const { command, timeout } = req.body;
    if (!command) return res.status(400).json({ error: 'command required' });

    const maxTimeout = Math.min(timeout || 30000, 60000);

    const stdout = execSync(command, {
      cwd: process.cwd(),
      timeout: maxTimeout,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });

    res.json({ stdout, stderr: '', exitCode: 0 });
  } catch (e) {
    res.json({
      stdout: e.stdout || '',
      stderr: e.stderr || e.message,
      exitCode: e.status || 1,
      error: e.message,
    });
  }
});

// ─── Auth ───────────────────────────────────────────────────────────
app.get('/api/auth/status', (req, res) => {
  try {
    if (authModule?.authManager) {
      const am = authModule.authManager;
      res.json({
        authenticated: !!am.session,
        user: am.session || null,
      });
    } else {
      res.json({ authenticated: false, user: null });
    }
  } catch (e) {
    res.json({ authenticated: false, user: null });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    if (authModule?.authManager) {
      authModule.authManager.session = null;
    }
    res.json({ success: true, message: 'Logged out' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Serve Static Files ─────────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use('/assets', express.static(path.join(distPath, 'assets')));
  app.use('/src', express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Meow CLI Web</title></head>
      <body style="font-family: monospace; padding: 2rem;">
        <h1>🐱 Meow CLI Web Server</h1>
        <p>Server is running, but frontend is not built.</p>
        <p>📡 API: <a href="/api/health">/api/health</a></p>
        <hr>
        <pre>API endpoints:
  GET  /api/health
  GET  /api/config
  POST /api/chat
  GET  /api/sessions
  ...</pre>
      </body>
      </html>
    `);
  }
});

// ─── Start Server ───────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`┌─────────────────────────────────────────────┐`);
  console.log(`│  🐱 Meow CLI Web Server                      │`);
  console.log(`│  http://localhost:${PORT}                       │`);
  console.log(`│                                               │`);
  console.log(`│  API: http://localhost:${PORT}/api              │`);
  console.log(`│  Config: ~/.meowcli/data/config.json          │`);
  console.log(`└─────────────────────────────────────────────┘`);
});
