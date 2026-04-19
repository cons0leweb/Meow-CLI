/**
 * SessionManager — Persists and loads chat sessions for the VSCode extension.
 * Stores sessions in the extension's global storage (context.globalStorageUri).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';

const MAX_SESSIONS = 20;

export class SessionManager {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.storageDir = path.join(context.globalStorageUri.fsPath, 'sessions');
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  async save({ name, history, model, timestamp }) {
    const id = `session_${timestamp || Date.now()}`;
    const session = { id, name: name || `Session ${new Date(timestamp).toLocaleString()}`, history, model, timestamp: timestamp || Date.now() };
    const filePath = path.join(this.storageDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
    await this._prune();
    Logger.info(`Session saved: ${id}`);
    return session;
  }

  async load(id) {
    const filePath = path.join(this.storageDir, `${id}.json`);
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      Logger.error(`Failed to load session ${id}:`, e);
      return null;
    }
  }

  async list() {
    try {
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(this.storageDir, f), 'utf8'));
            return { id: data.id, name: data.name, model: data.model, timestamp: data.timestamp, messageCount: data.history?.length || 0 };
          } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.timestamp - a.timestamp);
      return files;
    } catch {
      return [];
    }
  }

  async delete(id) {
    const filePath = path.join(this.storageDir, `${id}.json`);
    try { fs.unlinkSync(filePath); } catch {}
  }

  async _prune() {
    const sessions = await this.list();
    if (sessions.length > MAX_SESSIONS) {
      const toDelete = sessions.slice(MAX_SESSIONS);
      for (const s of toDelete) await this.delete(s.id);
    }
  }
}
