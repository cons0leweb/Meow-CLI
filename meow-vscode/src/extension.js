/**
 * Meow CLI VSCode Extension — Main Entry Point
 * Activates all panels, providers, commands, and status bar items.
 */

import * as vscode from 'vscode';
import { ChatPanelProvider } from './panels/ChatPanelProvider.js';
import { SessionsTreeProvider } from './providers/SessionsTreeProvider.js';
import { MemoryTreeProvider } from './providers/MemoryTreeProvider.js';
import { ToolCallsTreeProvider } from './providers/ToolCallsTreeProvider.js';
import { InlineCodeActionsProvider } from './providers/InlineCodeActionsProvider.js';
import { MeowStatusBar } from './providers/StatusBarProvider.js';
import { MeowBridge } from './bridge/MeowBridge.js';
import { registerCommands } from './commands/index.js';
import { Logger } from './utils/Logger.js';

/** @type {MeowBridge} */
let bridge;

/** @type {MeowStatusBar} */
let statusBar;

/**
 * Extension activation — called by VSCode when the extension is first used.
 * @param {vscode.ExtensionContext} context
 */
export function activate(context) {
  Logger.init(context);
  Logger.info('🐱 Meow CLI Extension activating...');

  // Initialize the bridge to Meow CLI backend
  bridge = new MeowBridge(context);

  // Status bar
  statusBar = new MeowStatusBar(context, bridge);

  // ─── Sidebar Chat Panel (WebviewViewProvider) ────────────────────────────
  const chatProvider = new ChatPanelProvider(context, bridge, statusBar);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('meow.chatView', chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // ─── Tree View Providers ─────────────────────────────────────────────────
  const sessionsProvider = new SessionsTreeProvider(context, bridge);
  const memoryProvider = new MemoryTreeProvider(context, bridge);
  const toolsProvider = new ToolCallsTreeProvider(context, bridge);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('meow.sessionsView', sessionsProvider),
    vscode.window.registerTreeDataProvider('meow.memoryView', memoryProvider),
    vscode.window.registerTreeDataProvider('meow.toolsView', toolsProvider)
  );

  // ─── Inline Code Actions (Lightbulb) ─────────────────────────────────────
  const codeActionsProvider = new InlineCodeActionsProvider(context, bridge, chatProvider);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { pattern: '**/*' },
      codeActionsProvider,
      { providedCodeActionKinds: InlineCodeActionsProvider.providedCodeActionKinds }
    )
  );

  // ─── Register All Commands ────────────────────────────────────────────────
  registerCommands(context, {
    bridge,
    chatProvider,
    sessionsProvider,
    memoryProvider,
    toolsProvider,
    statusBar,
  });

  // ─── Bridge event forwarding to providers ────────────────────────────────
  bridge.on('toolCall', (call) => {
    toolsProvider.addToolCall(call);
    statusBar.setWorking(call.name);
  });

  bridge.on('toolResult', () => {
    statusBar.setReady();
  });

  bridge.on('sessionChanged', () => {
    sessionsProvider.refresh();
  });

  bridge.on('memoryUpdated', () => {
    memoryProvider.refresh();
  });

  bridge.on('costUpdate', (cost) => {
    statusBar.updateCost(cost);
  });

  bridge.on('error', (err) => {
    statusBar.setError();
    Logger.error('Bridge error:', err);
  });

  Logger.info('✅ Meow CLI Extension activated');
  statusBar.setReady();
}

/**
 * Extension deactivation — cleanup.
 */
export function deactivate() {
  bridge?.dispose();
  statusBar?.dispose();
  Logger.info('Meow CLI Extension deactivated');
}
