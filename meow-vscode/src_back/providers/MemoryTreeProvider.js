/**
 * MemoryTreeProvider — Shows RAG memory entries in the sidebar tree view.
 */

import * as vscode from 'vscode';

export class MemoryTreeProvider {
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
    const entries = this.bridge.rag.getAll();
    if (entries.length === 0) {
      const empty = new vscode.TreeItem('No memory entries yet', vscode.TreeItemCollapsibleState.None);
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }
    return entries.slice(0, 50).map((entry, i) => {
      const text = typeof entry === 'string' ? entry
        : entry.content || entry.pattern || JSON.stringify(entry);
      const item = new vscode.TreeItem(
        text.slice(0, 60) + (text.length > 60 ? '...' : ''),
        vscode.TreeItemCollapsibleState.None
      );
      item.description = entry.source || entry.type || 'memory';
      item.tooltip = text.slice(0, 500);
      item.iconPath = new vscode.ThemeIcon('database');
      item.contextValue = 'memoryEntry';
      return item;
    });
  }
}
