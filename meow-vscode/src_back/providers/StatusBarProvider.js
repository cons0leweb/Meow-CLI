/**
 * MeowStatusBar — Status bar item showing Meow's current state and cost.
 */

import * as vscode from 'vscode';

export class MeowStatusBar {
  constructor(context, bridge) {
    this.context = context;
    this.bridge = bridge;

    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this._item.command = 'meow.openChat';
    this._item.tooltip = 'Meow AI Agent — Click to open chat';
    this._item.show();

    context.subscriptions.push(this._item);

    this.setReady();
  }

  setReady() {
    const cfg = vscode.workspace.getConfiguration('meow');
    const model = cfg.get('model') || 'claude';
    const shortModel = model.split('-').slice(0, 2).join('-');
    this._item.text = `$(meow-icon)🐱 ${shortModel}`;
    this._item.backgroundColor = undefined;
    this._item.color = undefined;
  }

  setWorking(toolName) {
    this._item.text = `$(loading~spin) 🐱 ${toolName || 'thinking'}...`;
    this._item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  }

  setError() {
    this._item.text = `$(error) 🐱 Error`;
    this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    setTimeout(() => this.setReady(), 3000);
  }

  updateCost(costSummary) {
    const cfg = vscode.workspace.getConfiguration('meow');
    if (!cfg.get('showCostTracker')) return;

    const cost = costSummary?.session?.costFormatted || '$0.0000';
    const tokens = costSummary?.session?.tokens;
    const totalTok = tokens ? tokens.input + tokens.output : 0;

    this._item.tooltip = new vscode.MarkdownString(
      `**🐱 Meow AI Agent**\n\n` +
      `Session cost: **${cost}**\n` +
      `Session tokens: ${totalTok.toLocaleString()}\n\n` +
      `Total cost: ${costSummary?.total?.costFormatted || '$0.0000'}\n\n` +
      `*Click to open chat*`
    );
  }

  dispose() {
    this._item.dispose();
  }
}
