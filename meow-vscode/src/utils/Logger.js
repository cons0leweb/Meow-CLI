/**
 * Logger — Centralized logging for the Meow VSCode extension.
 * Uses VSCode's OutputChannel for structured, filterable logs.
 */

import * as vscode from 'vscode';

let outputChannel = null;
let isDebug = false;

export const Logger = {
  init(context) {
    outputChannel = vscode.window.createOutputChannel('Meow AI', { log: true });
    context.subscriptions.push(outputChannel);
    isDebug = process.env.MEOW_DEBUG === 'true' || vscode.workspace.getConfiguration('meow').get('debug') === true;
  },

  info(message, ...args) {
    const msg = _format(message, args);
    outputChannel?.info(msg);
    if (isDebug) console.log(`[Meow] ${msg}`);
  },

  warn(message, ...args) {
    const msg = _format(message, args);
    outputChannel?.warn(msg);
    console.warn(`[Meow] ${msg}`);
  },

  error(message, ...args) {
    const msg = _format(message, args);
    outputChannel?.error(msg);
    console.error(`[Meow] ${msg}`);
  },

  debug(message, ...args) {
    if (!isDebug) return;
    const msg = _format(message, args);
    outputChannel?.debug(msg);
    console.debug(`[Meow] ${msg}`);
  },

  show() {
    outputChannel?.show();
  },
};

function _format(message, args) {
  if (args.length === 0) return String(message);
  return [message, ...args.map(a =>
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
  )].join(' ');
}
