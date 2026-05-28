/**
 * InlineCodeActionsProvider — Provides the lightbulb code actions menu.
 * Appears when the user selects code, offering Explain/Refactor/Fix/Document/Test.
 */

import * as vscode from 'vscode';

export class InlineCodeActionsProvider {
  static providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
    vscode.CodeActionKind.RefactorExtract,
  ];

  constructor(context, bridge, chatProvider) {
    this.context = context;
    this.bridge = bridge;
    this.chatProvider = chatProvider;
  }

  provideCodeActions(document, range, context, token) {
    if (range.isEmpty) return [];

    const selectedText = document.getText(range);
    if (!selectedText.trim()) return [];

    const lang = document.languageId;
    const actions = [];

    // Explain
    const explain = new vscode.CodeAction('🐱 Meow: Explain this code', vscode.CodeActionKind.QuickFix);
    explain.command = {
      command: 'meow.explainCode',
      title: 'Explain Code',
      arguments: [selectedText, lang, document.uri],
    };
    actions.push(explain);

    // Fix / Debug
    const fix = new vscode.CodeAction('🐱 Meow: Fix / Debug', vscode.CodeActionKind.QuickFix);
    fix.command = {
      command: 'meow.fixCode',
      title: 'Fix Code',
      arguments: [selectedText, lang, document.uri],
    };
    actions.push(fix);

    // Refactor
    const refactor = new vscode.CodeAction('🐱 Meow: Refactor', vscode.CodeActionKind.Refactor);
    refactor.command = {
      command: 'meow.refactorCode',
      title: 'Refactor Code',
      arguments: [selectedText, lang, document.uri],
    };
    actions.push(refactor);

    // Document
    const doc = new vscode.CodeAction('🐱 Meow: Add Documentation', vscode.CodeActionKind.Refactor);
    doc.command = {
      command: 'meow.documentCode',
      title: 'Document Code',
      arguments: [selectedText, lang, document.uri],
    };
    actions.push(doc);

    // Generate Tests
    const tests = new vscode.CodeAction('🐱 Meow: Generate Tests', vscode.CodeActionKind.RefactorExtract);
    tests.command = {
      command: 'meow.generateTests',
      title: 'Generate Tests',
      arguments: [selectedText, lang, document.uri],
    };
    actions.push(tests);

    // Check for diagnostics (errors/warnings) in selection
    const diags = context.diagnostics.filter(d =>
      range.intersection(d.range) !== undefined
    );
    if (diags.length > 0) {
      const autoFix = new vscode.CodeAction(
        `🐱 Meow: Fix ${diags.length} error${diags.length > 1 ? 's' : ''}`,
        vscode.CodeActionKind.QuickFix
      );
      autoFix.isPreferred = true;
      const errMessages = diags.map(d => d.message).join('; ');
      autoFix.command = {
        command: 'meow.fixCode',
        title: 'Fix Errors',
        arguments: [selectedText, lang, document.uri, errMessages],
      };
      actions.unshift(autoFix);
    }

    return actions;
  }
}
