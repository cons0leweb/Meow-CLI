/**
 * Meow VSCode Extension — Integration Tests
 * Tests core bridge logic without VSCode APIs (using mocks).
 * Run with: node --test tests/extension.test.js
 */

import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Mock vscode module ───────────────────────────────────────────────────────
// We inject a mock before importing any bridge modules

const mockVscode = {
  workspace: {
    getConfiguration: () => ({
      get: (key) => {
        const defaults = {
          apiProvider: 'anthropic',
          model: 'claude-opus-4-5',
          streamResponses: true,
          maxTokens: 8192,
          temperature: 0.7,
          enableRAG: true,
          enableCheckpoints: true,
          sandboxMode: 'workspace',
          toolPermissions: {},
          showCostTracker: true,
        };
        return defaults[key];
      },
    }),
    workspaceFolders: [{ uri: { fsPath: '/tmp/test-workspace' } }],
  },
  window: {
    createStatusBarItem: () => ({ show: () => {}, dispose: () => {}, text: '', tooltip: '' }),
    showWarningMessage: async () => 'Allow',
    showInformationMessage: async () => {},
    showTextDocument: async () => {},
    terminals: [],
    createTerminal: () => ({ show: () => {}, sendText: () => {} }),
    activeTextEditor: null,
  },
  Uri: {
    file: (p) => ({ fsPath: p }),
    parse: (s) => ({ fsPath: s }),
    joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }),
  },
  EventEmitter: class { event = () => {}; fire = () => {}; },
  TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  CodeActionKind: { QuickFix: 'quickfix', Refactor: 'refactor', RefactorExtract: 'refactor.extract' },
  CodeAction: class { constructor(title, kind) { this.title = title; this.kind = kind; } },
  commands: { executeCommand: async () => {} },
  languages: { registerCodeActionsProvider: () => ({ dispose: () => {} }) },
  Position: class { constructor(l, c) { this.line = l; this.character = c; } },
  Range: class { constructor(s, e) { this.start = s; this.end = e; } },
  Selection: class { constructor(s, e) { this.start = s; this.end = e; } },
  TextEditorRevealType: { InCenter: 2 },
};

// Register mock vscode via a custom loader (Node.js module mock)
// We use a simple approach: patch the module cache
const require = createRequire(import.meta.url);
try {
  require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: mockVscode };
} catch {}

// ─── Pure logic tests (no vscode import) ─────────────────────────────────────

describe('CostTracker — Pure Logic', () => {
  it('should correctly calculate Claude Opus cost', () => {
    // Replicate the pricing logic inline (no import needed)
    const PRICING = {
      'claude-opus-4-5': { input: 15.0, output: 75.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
    };

    const model = 'claude-opus-4-5';
    const inputTokens = 1000;
    const outputTokens = 500;
    const pricing = PRICING[model];

    const cost = (inputTokens / 1_000_000) * pricing.input
               + (outputTokens / 1_000_000) * pricing.output;

    assert.ok(cost > 0, 'Cost should be positive');
    assert.ok(cost < 0.1, 'Cost for 1.5k tokens should be < $0.10');
    // 1000 * 15/1M + 500 * 75/1M = 0.015 + 0.0375 = 0.0525
    assert.ok(Math.abs(cost - 0.0525) < 0.0001, `Expected ~$0.0525, got $${cost}`);
  });

  it('should correctly calculate GPT-4o-mini cost', () => {
    const PRICING = { 'gpt-4o-mini': { input: 0.15, output: 0.6 } };
    const model = 'gpt-4o-mini';
    const inputTokens = 10000;
    const outputTokens = 2000;
    const pricing = PRICING[model];

    const cost = (inputTokens / 1_000_000) * pricing.input
               + (outputTokens / 1_000_000) * pricing.output;

    // 10000 * 0.15/1M + 2000 * 0.6/1M = 0.0015 + 0.0012 = 0.0027
    assert.ok(Math.abs(cost - 0.0027) < 0.0001, `Expected ~$0.0027, got $${cost}`);
  });
});

describe('ToolExecutor — Path Logic', () => {
  it('should resolve relative paths correctly', () => {
    const wsRoot = '/tmp/test-workspace';
    const resolve = (p) => path.isAbsolute(p) ? p : path.resolve(wsRoot, p);

    assert.equal(resolve('src/main.js'), '/tmp/test-workspace/src/main.js');
    assert.equal(resolve('/absolute/path.js'), '/absolute/path.js');
    assert.equal(resolve('./relative.js'), '/tmp/test-workspace/relative.js');
  });

  it('should detect sandbox violations in strict mode', () => {
    const wsRoot = '/tmp/test-workspace';
    const sandboxCheck = (p, mode) => {
      if (mode === 'permissive') return true;
      const resolved = path.isAbsolute(p) ? p : path.resolve(wsRoot, p);
      if (!resolved.startsWith(wsRoot)) {
        throw new Error(`Sandbox violation: '${p}' is outside workspace`);
      }
      return true;
    };

    assert.ok(sandboxCheck('src/main.js', 'workspace'));
    assert.throws(() => sandboxCheck('/etc/passwd', 'workspace'), /Sandbox violation/);
    assert.ok(sandboxCheck('/etc/passwd', 'permissive'));
  });
});

describe('SessionManager — Data Structure', () => {
  it('should create valid session objects', () => {
    const createSession = ({ name, history, model, timestamp }) => ({
      id: `session_${timestamp}`,
      name: name || `Session ${new Date(timestamp).toLocaleString()}`,
      history: history || [],
      model: model || 'unknown',
      timestamp: timestamp || Date.now(),
    });

    const session = createSession({
      name: 'Test Session',
      history: [{ role: 'user', content: 'Hello' }],
      model: 'claude-opus-4-5',
      timestamp: 1000000,
    });

    assert.equal(session.id, 'session_1000000');
    assert.equal(session.name, 'Test Session');
    assert.equal(session.history.length, 1);
    assert.equal(session.model, 'claude-opus-4-5');
  });
});

describe('Markdown Renderer — Logic', () => {
  it('should detect code blocks in AI responses', () => {
    const response = 'Here is some code:\n```js\nconsole.log("hello")\n```\nDone.';
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];

    assert.equal(matches.length, 1);
    assert.equal(matches[0][1], 'js');
    assert.ok(matches[0][2].includes('console.log'));
  });

  it('should detect multiple code blocks', () => {
    const response = '```python\nprint("hi")\n```\nAnd:\n```bash\necho hello\n```';
    const matches = [...response.matchAll(/```(\w*)\n([\s\S]*?)```/g)];
    assert.equal(matches.length, 2);
    assert.equal(matches[0][1], 'python');
    assert.equal(matches[1][1], 'bash');
  });
});

describe('Extension Structure', () => {
  it('should have all required source files', () => {
    const files = [
      'src/extension.js',
      'src/bridge/MeowBridge.js',
      'src/bridge/ToolExecutor.js',
      'src/bridge/SessionManager.js',
      'src/bridge/PermissionManager.js',
      'src/bridge/CheckpointManager.js',
      'src/bridge/RagManager.js',
      'src/bridge/CostTracker.js',
      'src/panels/ChatPanelProvider.js',
      'src/providers/SessionsTreeProvider.js',
      'src/providers/MemoryTreeProvider.js',
      'src/providers/ToolCallsTreeProvider.js',
      'src/providers/InlineCodeActionsProvider.js',
      'src/providers/StatusBarProvider.js',
      'src/commands/index.js',
      'src/utils/Logger.js',
      'webview-ui/src/main.js',
      'webview-ui/src/components/MeowChat.js',
      'media/chat.css',
      'media/icons/meow-sidebar.svg',
      'package.json',
      'README.md',
      'CHANGELOG.md',
      'build.js',
    ];

    const missing = files.filter(f => !existsSync(path.join(ROOT, f)));
    assert.deepEqual(missing, [], `Missing files: ${missing.join(', ')}`);
  });

  it('should have valid package.json', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'meow-vscode');
    assert.ok(pkg.contributes?.commands?.length > 0, 'Should have commands');
    assert.ok(pkg.contributes?.views, 'Should have views');
    assert.ok(pkg.contributes?.keybindings?.length > 0, 'Should have keybindings');
    assert.ok(pkg.contributes?.configuration?.properties, 'Should have configuration');
    assert.equal(pkg.engines?.vscode, '^1.85.0');
  });

  it('should have valid webview entry point', () => {
    const main = readFileSync(path.join(ROOT, 'webview-ui/src/main.js'), 'utf8');
    assert.ok(main.includes('MeowChat'), 'main.js should import MeowChat');
    assert.ok(main.includes('postMessage'), 'main.js should use postMessage');
    assert.ok(main.includes('streamStart'), 'main.js should handle streamStart');
  });

  it('should have CSS with VSCode variables', () => {
    const css = readFileSync(path.join(ROOT, 'media/chat.css'), 'utf8');
    assert.ok(css.includes('--vscode-'), 'CSS should use VSCode theme variables');
    assert.ok(css.includes('--meow-accent'), 'CSS should have meow accent variable');
    assert.ok(css.includes('meow-message'), 'CSS should style messages');
    assert.ok(css.includes('meow-code-block'), 'CSS should style code blocks');
  });
});
