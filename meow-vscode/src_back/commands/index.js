/**
 * Commands Registry — Registers all Meow VSCode commands.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger.js';

/**
 * @param {vscode.ExtensionContext} context
 * @param {object} providers
 */
export function registerCommands(context, providers) {
  const { bridge, chatProvider, sessionsProvider, memoryProvider, toolsProvider, statusBar } = providers;

  const reg = (cmd, fn) => context.subscriptions.push(vscode.commands.registerCommand(cmd, fn));

  // ─── Chat ────────────────────────────────────────────────────────────────

  reg('meow.openChat', async () => {
    await vscode.commands.executeCommand('meow.chatView.focus');
  });

  reg('meow.newSession', async () => {
    await bridge.newSession();
    sessionsProvider.refresh();
    vscode.window.showInformationMessage('🐱 New Meow session started');
  });

  reg('meow.compactHistory', async () => {
    const remaining = bridge.compactHistory();
    vscode.window.showInformationMessage(`✂️ History compacted to ${remaining} messages`);
  });

  reg('meow.loadSession', async (id) => {
    if (!id) {
      const sessions = await bridge.listSessions();
      if (sessions.length === 0) {
        vscode.window.showInformationMessage('No saved sessions found');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        sessions.map(s => ({
          label: s.name,
          description: `${s.messageCount} messages · ${s.model}`,
          detail: new Date(s.timestamp).toLocaleString(),
          id: s.id,
        })),
        { placeHolder: 'Select a session to load' }
      );
      if (!picked) return;
      id = picked.id;
    }
    await bridge.loadSession(id);
    await vscode.commands.executeCommand('meow.chatView.focus');
    vscode.window.showInformationMessage('📂 Session loaded');
  });

  reg('meow.openSessions', async () => {
    await vscode.commands.executeCommand('meow.sessionsView.focus');
  });

  // ─── Code Actions ─────────────────────────────────────────────────────────

  reg('meow.explainCode', async (selection, lang, uri, errorMsg) => {
    const { text, language, fileName } = await _getCodeContext(selection, lang, uri);
    if (!text) return;
    const prompt = `Please explain this ${language} code from \`${fileName}\` in detail:\n\n\`\`\`${language}\n${text}\n\`\`\``;
    await chatProvider.sendMessage(prompt, { selection: text, language });
  });

  reg('meow.refactorCode', async (selection, lang, uri) => {
    const { text, language, fileName } = await _getCodeContext(selection, lang, uri);
    if (!text) return;
    const prompt = `Please refactor this ${language} code from \`${fileName}\` to improve readability, performance, and maintainability. Show the improved version with explanation:\n\n\`\`\`${language}\n${text}\n\`\`\``;
    await chatProvider.sendMessage(prompt, { selection: text, language });
  });

  reg('meow.fixCode', async (selection, lang, uri, errorMsg) => {
    const { text, language, fileName } = await _getCodeContext(selection, lang, uri);
    if (!text) return;
    const errPart = errorMsg ? `\n\nErrors to fix: ${errorMsg}` : '';
    const prompt = `Please debug and fix this ${language} code from \`${fileName}\`.${errPart}\n\nCode:\n\`\`\`${language}\n${text}\n\`\`\``;
    await chatProvider.sendMessage(prompt, { selection: text, language });
  });

  reg('meow.documentCode', async (selection, lang, uri) => {
    const { text, language, fileName } = await _getCodeContext(selection, lang, uri);
    if (!text) return;
    const prompt = `Please add comprehensive documentation/comments to this ${language} code from \`${fileName}\`. Follow the language's standard documentation format (JSDoc, docstrings, etc.):\n\n\`\`\`${language}\n${text}\n\`\`\``;
    await chatProvider.sendMessage(prompt, { selection: text, language });
  });

  reg('meow.generateTests', async (selection, lang, uri) => {
    const { text, language, fileName } = await _getCodeContext(selection, lang, uri);
    if (!text) return;
    const prompt = `Please generate comprehensive unit tests for this ${language} code from \`${fileName}\`. Use the appropriate testing framework for the project:\n\n\`\`\`${language}\n${text}\n\`\`\``;
    await chatProvider.sendMessage(prompt, { selection: text, language });
  });

  reg('meow.reviewFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active file to review');
      return;
    }
    const doc = editor.document;
    const content = doc.getText();
    const rel = vscode.workspace.asRelativePath(doc.uri);
    const lang = doc.languageId;

    const prompt = `Please do a comprehensive code review of \`${rel}\`. Look for bugs, security issues, performance problems, code smells, and suggest improvements:\n\n\`\`\`${lang}\n${content.slice(0, 15000)}\n\`\`\``;
    await chatProvider.sendMessage(prompt, { fileContext: `File: ${rel}`, language: lang });
  });

  // ─── Inline Chat ─────────────────────────────────────────────────────────

  reg('meow.inlineChat', async () => {
    const editor = vscode.window.activeTextEditor;
    const question = await vscode.window.showInputBox({
      placeHolder: 'Ask Meow anything about this code...',
      prompt: '🐱 Meow Inline Chat',
    });
    if (!question) return;

    let context = '';
    if (editor) {
      const sel = editor.selection;
      if (!sel.isEmpty) {
        const text = editor.document.getText(sel);
        const lang = editor.document.languageId;
        context = `\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
      }
    }

    await chatProvider.sendMessage(context + question);
  });

  // ─── Autopilot ───────────────────────────────────────────────────────────

  reg('meow.autopilot', async () => {
    const task = await vscode.window.showInputBox({
      placeHolder: 'Describe the task for Meow to execute autonomously...',
      prompt: '🚀 Meow Autopilot — Autonomous Task',
      value: '',
    });
    if (!task) return;

    const budget = vscode.workspace.getConfiguration('meow').get('autopilotBudget') || 10;
    const panel = chatProvider.openAsPanel(`🚀 Autopilot: ${task.slice(0, 40)}`);

    const autopilotPrompt = [
      `You are operating in AUTOPILOT mode. Execute this task autonomously:`,
      ``,
      `**Task:** ${task}`,
      ``,
      `**Rules:**`,
      `1. Use tools actively to accomplish the task`,
      `2. Read files before modifying them`,
      `3. Use patch_file for targeted edits`,
      `4. Verify your work after completing`,
      `5. Provide a summary when done`,
      ``,
      `Begin execution now.`,
    ].join('\n');

    await chatProvider.sendMessage(autopilotPrompt);
  });

  // ─── Project Analysis ─────────────────────────────────────────────────────

  reg('meow.analyzeProject', async () => {
    const wsRoot = bridge.getWorkspaceRoot();
    const prompt = [
      `Please analyze this project thoroughly. Use list_dir, read_file, and grep_search tools to understand:`,
      `1. Project structure and architecture`,
      `2. Main technologies and dependencies`,
      `3. Code quality and potential issues`,
      `4. Security concerns`,
      `5. Performance bottlenecks`,
      `6. Suggestions for improvement`,
      ``,
      `Start with the project root: ${wsRoot}`,
    ].join('\n');

    await chatProvider.sendMessage(prompt);
    await vscode.commands.executeCommand('meow.chatView.focus');
  });

  // ─── Git Summary ──────────────────────────────────────────────────────────

  reg('meow.gitSummary', async () => {
    const prompt = [
      `Please analyze the current git state of this project:`,
      `1. Run git_status to see uncommitted changes`,
      `2. Run git_log to see recent commits`,
      `3. Run git_diff to see what changed`,
      `4. Provide a clear summary of what has changed and suggest a commit message`,
    ].join('\n');

    await chatProvider.sendMessage(prompt);
    await vscode.commands.executeCommand('meow.chatView.focus');
  });

  // ─── Memory ───────────────────────────────────────────────────────────────

  reg('meow.openMemory', async () => {
    await vscode.commands.executeCommand('meow.memoryView.focus');
    memoryProvider.refresh();
  });

  // ─── Settings ─────────────────────────────────────────────────────────────

  reg('meow.openSettings', () => {
    vscode.commands.executeCommand('workbench.action.openSettings', 'meow');
  });

  // ─── Terminal ─────────────────────────────────────────────────────────────

  reg('meow.runInTerminal', async () => {
    const meowPath = vscode.workspace.getConfiguration('meow').get('meowCliPath') || 'meow';
    let terminal = vscode.window.terminals.find(t => t.name === 'Meow CLI');
    if (!terminal) {
      terminal = vscode.window.createTerminal({
        name: 'Meow CLI',
        iconPath: new vscode.ThemeIcon('cat'),
        cwd: bridge.getWorkspaceRoot(),
      });
    }
    terminal.show();
    terminal.sendText(meowPath);
  });

  // ─── Apply Diff ───────────────────────────────────────────────────────────

  reg('meow.applyDiff', async () => {
    vscode.window.showInformationMessage('Select a code block in the chat to apply a diff');
  });

  Logger.info(`Registered ${context.subscriptions.length} commands`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _getCodeContext(selection, lang, uri) {
  // If called from code action with pre-filled args
  if (selection) {
    const fileName = uri ? vscode.workspace.asRelativePath(uri) : 'unknown';
    return { text: selection, language: lang || 'text', fileName };
  }

  // Otherwise get from active editor
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return { text: null };
  }

  const sel = editor.selection;
  if (sel.isEmpty) {
    vscode.window.showWarningMessage('Please select some code first');
    return { text: null };
  }

  return {
    text: editor.document.getText(sel),
    language: editor.document.languageId,
    fileName: vscode.workspace.asRelativePath(editor.document.uri),
  };
}
