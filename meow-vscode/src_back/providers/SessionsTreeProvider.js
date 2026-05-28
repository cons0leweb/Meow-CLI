/**
 * SessionsTreeProvider — Shows saved chat sessions in the sidebar tree view.
 */

import * as vscode from 'vscode';

export class SessionsTreeProvider {
  constructor(context, bridge) {
    this.context = context;
    this.bridge = bridge;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element) return [];
    const sessions = await this.bridge.listSessions();
    return sessions.map(s => {
      const item = new vscode.TreeItem(
        s.name || `Session ${new Date(s.timestamp).toLocaleDateString()}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.description = `${s.messageCount} msgs · ${s.model || 'unknown'}`;
      item.tooltip = new vscode.MarkdownString(
        `**${s.name}**\n\n` +
        `- Messages: ${s.messageCount}\n` +
        `- Model: ${s.model}\n` +
        `- Date: ${new Date(s.timestamp).toLocaleString()}`
      );
      item.iconPath = new vscode.ThemeIcon('comment-discussion');
      item.contextValue = 'session';
      item.command = {
        command: 'meow.loadSession',
        title: 'Load Session',
        arguments: [s.id],
      };
      item.id = s.id;
      return item;
    });
  }
}
