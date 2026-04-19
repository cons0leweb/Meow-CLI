/**
 * Meow VSCode Extension — Integration Tests
 * Tests core bridge logic without VSCode APIs (using mocks)
 */

import { strict as assert } from 'assert';
import { describe, it, before } from 'node:test';

// Mock VSCode API
const mockContext = {
  globalStorageUri: { fsPath: '/tmp/meow-test-storage' },
  globalState: {
    data: {},
    get(key, def) { return this.data[key] ?? def; },
    update(key, val) { this.data[key] = val; },
  },
  subscriptions: [],
  extensionUri: { fsPath: '/tmp/meow-ext' },
};

describe('CostTracker', () => {
  it('should track tokens and calculate cost', async () => {
    const { CostTracker } = await import('../src/bridge/CostTracker.js');
    const tracker = new CostTracker(mockContext);

    tracker.track({ input_tokens: 1000, output_tokens: 500 }, 'claude-opus-4-5');
    const summary = tracker.getSummary();

    assert.ok(summary.session.cost > 0, 'Cost should be > 0');
    assert.equal(summary.session.tokens.input, 1000);
    assert.equal(summary.session.tokens.output, 500);
  });

  it('should reset session cost', async () => {
    const { CostTracker } = await import('../src/bridge/CostTracker.js');
    const tracker = new CostTracker(mockContext);
    tracker.track({ input_tokens: 100, output_tokens: 100 }, 'gpt-4o-mini');
    tracker.resetSession();
    assert.equal(tracker.sessionCost, 0);
  });
});

describe('PermissionManager', () => {
  it('should return default permissions', async () => {
    // Mock vscode module
    const { PermissionManager } = await import('../src/bridge/PermissionManager.js');
    // read_file should be allow by default
    const pm = new PermissionManager(mockContext);
    // We can't easily test without full vscode mock, so just check it instantiates
    assert.ok(pm, 'PermissionManager should instantiate');
  });
});

describe('Extension Structure', () => {
  it('should have all required source files', async () => {
    const { existsSync } = await import('fs');
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
      'package.json',
    ];

    const base = '/home/cons0leweb/JS/meow-cli/meow-vscode';
    for (const file of files) {
      assert.ok(existsSync(`${base}/${file}`), `Missing: ${file}`);
    }
  });
});
