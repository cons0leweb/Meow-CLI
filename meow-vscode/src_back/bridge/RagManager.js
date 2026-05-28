/**
 * RagManager — Retrieval-Augmented Generation memory for the VSCode extension.
 * Reads from ~/.meowcli/data/memory/ if available, otherwise builds a local index.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { Logger } from '../utils/Logger.js';

const MEOW_MEMORY_DIR = path.join(os.homedir(), '.meowcli', 'data', 'memory');

export class RagManager {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
    this.localMemory = [];
    this._loadMemory();
  }

  _loadMemory() {
    try {
      if (!fs.existsSync(MEOW_MEMORY_DIR)) return;
      const files = fs.readdirSync(MEOW_MEMORY_DIR).filter(f => f.endsWith('.json'));
      this.localMemory = [];
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(MEOW_MEMORY_DIR, file), 'utf8'));
          if (Array.isArray(data)) this.localMemory.push(...data);
          else if (data) this.localMemory.push(data);
        } catch {}
      }
      Logger.info(`RAG: loaded ${this.localMemory.length} memory entries`);
    } catch (e) {
      Logger.warn('RAG: could not load memory:', e.message);
    }
  }

  async getContext(query) {
    if (!vscode.workspace.getConfiguration('meow').get('enableRAG')) return '';
    this._loadMemory();
    if (this.localMemory.length === 0) return '';

    // Simple TF-IDF-like relevance scoring
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const scored = this.localMemory.map(entry => {
      const text = JSON.stringify(entry).toLowerCase();
      const score = queryTerms.reduce((acc, term) => acc + (text.split(term).length - 1), 0);
      return { entry, score };
    }).filter(e => e.score > 0).sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5).map(e => {
      const entry = e.entry;
      if (typeof entry === 'string') return `[memory] ${entry}`;
      if (entry.content) return `[memory] ${entry.content}`;
      if (entry.pattern) return `[pattern] ${entry.pattern}`;
      return `[memory] ${JSON.stringify(entry).slice(0, 200)}`;
    });

    return top.join('\n');
  }

  getAll() {
    this._loadMemory();
    return this.localMemory;
  }

  async addEntry(content, tags = []) {
    const entry = { id: `vscode_${Date.now()}`, content, tags, timestamp: Date.now(), source: 'vscode' };
    this.localMemory.push(entry);
    try {
      fs.mkdirSync(MEOW_MEMORY_DIR, { recursive: true });
      const filePath = path.join(MEOW_MEMORY_DIR, 'vscode-memory.json');
      const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];
      existing.push(entry);
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
    } catch (e) {
      Logger.error('RAG: failed to save entry:', e);
    }
    return entry;
  }
}
