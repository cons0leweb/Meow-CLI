/**
 * ToolCallsTreeProvider — Shows recent tool calls in the sidebar tree view.
 * Provides real-time visibility into what the AI is doing.
 */

import * as vscode from 'vscode';

const TOOL_ICONS = {
  read_file: 'file-text',
  write_file: 'file-add',
  patch_file: 'edit',
  list_dir: 'folder-opened',
  grep_search: 'search',
  run_shell: 'terminal',
  git_log: 'git-commit',
  git_diff: 'diff',
  git_status: 'source-control',
  web_search: 'globe',
  open_file_in_editor: 'go-to-file',
  show_diff: 'diff-modified',
};

export class ToolCallsTreeProvider {
  constructor(context, bridge) {
    this.context = context;
    this.bridge = bridge;
    this.calls = [];
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  addToolCall(call) {
    this.calls.unshift({
      ...call,
      timestamp: Date.now(),
      status: 'running',
    });
    if (this.calls.length > 100) this.calls = this.calls.slice(0, 100);
    this._onDidChangeTreeData.fire();

    // Mark as done after a short delay
    setTimeout(() => {
      const idx = this.calls.findIndex(c => c.id === call.id);
      if (idx >= 0) {
        this.calls[idx].status = 'done';
        this._onDidChangeTreeData.fire();
      }
    }, 2000);
  }

  clear() {
    this.calls = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren(element) {
    if (element) {
      // Show input details as children
      const call = element._call;
      if (!call) return [];
      return Object.entries(call.input || {}).map(([k, v]) => {
        const val = typeof v === 'string' ? v : JSON.stringify(v);
        const item = new vscode.TreeItem(`${k}: ${val.slice(0, 80)}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('symbol-property');
        item.tooltip = `${k}: ${val}`;
        return item;
      });
    }

    if (this.calls.length === 0) {
      const empty = new vscode.TreeItem('No tool calls yet', vscode.TreeItemCollapsibleState.None);
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }

    return this.calls.map(call => {
      const hasInput = Object.keys(call.input || {}).length > 0;
      const item = new vscode.TreeItem(
        call.name,
        hasInput ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
      );
      const icon = TOOL_ICONS[call.name] || 'wrench';
      item.iconPath = new vscode.ThemeIcon(
        call.status === 'running' ? 'loading~spin' : icon
      );
      item.description = new Date(call.timestamp).toLocaleTimeString();
      item.tooltip = `${call.name}\n${JSON.stringify(call.input, null, 2).slice(0, 300)}`;
      item.contextValue = 'toolCall';
      item._call = call;
      return item;
    });
  }
}
