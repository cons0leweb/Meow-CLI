/**
 * Meow CLI Web Backend Server
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost:3001'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ─── Health & Info ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.4', name: 'meow-cli-web' });
});

app.get('/api/info', (req, res) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  res.json({
    version: pkg.version,
    name: pkg.name,
    description: pkg.description,
    dataDir: '~/.meowcli/data',
    cwd: process.cwd(),
  });
});

// ─── Config Management ──────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    const safe = { ...cfg };
    if (safe.api_key) safe.api_key = safe.api_key.substring(0, 8) + '...';
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    const merged = { ...cfg, ...req.body };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
    res.json({ success: true, message: 'Config saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Status ─────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    const hasApiKey = !!(cfg.api_key || (cfg.providers && Object.values(cfg.providers).some(p => p.api_key)));
    res.json({
      apiKeyConfigured: hasApiKey,
      activeModel: cfg.model || 'not set',
      activeProfile: cfg.profile || 'default',
      activeProvider: cfg.active_provider || 'none',
      theme: cfg.theme || 'default',
      lang: cfg.lang || 'ru',
      sessionsCount: 0,
      autopilotMaxIterations: cfg.autopilot?.max_iterations || 50,
      autoYes: cfg.auto_yes || false,
      quiet: cfg.quiet || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Sessions ───────────────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  res.json({ sessions: [], current: null });
});

app.post('/api/sessions', (req, res) => {
  const sessionId = 'sess-' + Date.now();
  res.json({ sessionId, message: 'New session created' });
});

// ─── Cost ───────────────────────────────────────────────────────────
app.get('/api/cost', (req, res) => {
  res.json({
    session: { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0 },
    total: { input_tokens: 0, output_tokens: 0, total_usd: 0, requests: 0, since: Date.now() },
    history: [],
    modelPrices: {}
  });
});

// ─── Models ─────────────────────────────────────────────────────────
app.get('/api/models', (req, res) => {
  res.json([
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  ]);
});

// ─── Providers ──────────────────────────────────────────────────────
app.get('/api/providers', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    const providers = cfg.providers || {};
    const safe = Object.fromEntries(
      Object.entries(providers).map(([k, v]) => {
        const p = { ...v };
        if (p.api_key) p.api_key = p.api_key.substring(0, 8) + '...';
        return [k, p];
      })
    );
    res.json({ providers: safe, active: cfg.active_provider || '', api_schema: cfg.api_schema || 'openai' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Profiles ───────────────────────────────────────────────────────
app.get('/api/profiles', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    res.json(cfg.profiles || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Auth ───────────────────────────────────────────────────────────
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: false, user: null });
});

// ─── Theme ──────────────────────────────────────────────────────────
app.get('/api/theme', (req, res) => {
  res.json({ current: 'default', themes: {} });
});

app.put('/api/theme', (req, res) => {
  res.json({ success: true, message: 'Theme updated' });
});

// ─── API Key ────────────────────────────────────────────────────────
app.put('/api/config/api-key', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    cfg.api_key = req.body.key;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    res.json({ success: true, message: 'API key saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config/model', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    cfg.model = req.body.model;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    res.json({ success: true, message: `Model set to ${req.body.model}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config/profile', (req, res) => {
  try {
    const configPath = path.join(process.env.HOME || '/tmp', '.meowcli', 'data', 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    cfg.profile = req.body.profile;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    res.json({ success: true, message: `Profile set to ${req.body.profile}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Templates ──────────────────────────────────────────────────────
app.get('/api/templates', (req, res) => {
  res.json({});
});

// ─── Context ────────────────────────────────────────────────────────
app.get('/api/context', (req, res) => {
  res.json([]);
});

// ─── CWD ────────────────────────────────────────────────────────────
app.get('/api/cwd', (req, res) => {
  res.json({ cwd: process.cwd(), dataDir: '~/.meowcli/data' });
});

// ─── Chat ───────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  res.json({
    choices: [{ message: { role: 'assistant', content: 'Chat endpoint ready. Configure API key to use.' } }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  });
});

// ─── Serve Static Files ─────────────────────────────────────────────
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use('/assets', express.static(path.join(distPath, 'assets')));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) res.status(404).json({ error: 'Not found' });
    });
  });
}

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
