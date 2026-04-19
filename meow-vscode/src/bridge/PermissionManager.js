/**
 * PermissionManager — Manages tool execution permissions (allow/ask/deny).
 * Persists permission overrides in VSCode's global state.
 */

import * as vscode from 'vscode';

const DEFAULT_PERMISSIONS = {
  run_shell: 'ask',
  write_file: 'ask',
  patch_file: 'ask',
  read_file: 'allow',
  list_dir: 'allow',
  grep_search: 'allow',
  git_commit: 'ask',
  git_log: 'allow',
  git_diff: 'allow',
  git_status: 'allow',
  web_search: 'allow',
  open_file_in_editor: 'allow',
  show_diff: 'allow',
};

export class PermissionManager {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    this.overrides = context.globalState.get('meow.permissions', {});
  }

  check(toolName, input) {
    // Check user overrides first
    if (this.overrides[toolName]) return this.overrides[toolName];

    // Check VSCode config
    const cfgPermissions = vscode.workspace.getConfiguration('meow').get('toolPermissions') || {};
    if (cfgPermissions[toolName]) return cfgPermissions[toolName];

    // Fall back to defaults
    return DEFAULT_PERMISSIONS[toolName] || 'ask';
  }

  setPermission(toolName, level) {
    this.overrides[toolName] = level;
    this.context.globalState.update('meow.permissions', this.overrides);
  }

  resetPermissions() {
    this.overrides = {};
    this.context.globalState.update('meow.permissions', {});
  }

  getAll() {
    const cfgPermissions = vscode.workspace.getConfiguration('meow').get('toolPermissions') || {};
    const merged = { ...DEFAULT_PERMISSIONS, ...cfgPermissions, ...this.overrides };
    return merged;
  }
}
