/**
 * CheckpointManager — Creates file backups before destructive operations.
 * Allows undo/rewind of AI-made changes.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';

const MAX_CHECKPOINTS = 50;

export class CheckpointManager {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.storageDir = path.join(context.globalStorageUri.fsPath, 'checkpoints');
    fs.mkdirSync(this.storageDir, { recursive: true });
    this.checkpoints = [];
    this._loadIndex();
  }

  _loadIndex() {
    const indexPath = path.join(this.storageDir, 'index.json');
    try {
      this.checkpoints = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch {
      this.checkpoints = [];
    }
  }

  _saveIndex() {
    const indexPath = path.join(this.storageDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(this.checkpoints, null, 2), 'utf8');
  }

  async create(toolName, input) {
    const filePath = input.path;
    if (!filePath) return;

    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(wsRoot, filePath);

    if (!fs.existsSync(resolved)) return;

    const timestamp = Date.now();
    const id = `cp_${timestamp}`;
    const backupPath = path.join(this.storageDir, `${id}_${path.basename(filePath)}`);

    try {
      fs.copyFileSync(resolved, backupPath);
      const checkpoint = { id, timestamp, toolName, originalPath: resolved, backupPath, size: fs.statSync(resolved).size };
      this.checkpoints.unshift(checkpoint);
      if (this.checkpoints.length > MAX_CHECKPOINTS) {
        const old = this.checkpoints.splice(MAX_CHECKPOINTS);
        for (const cp of old) { try { fs.unlinkSync(cp.backupPath); } catch {} }
      }
      this._saveIndex();
      Logger.info(`Checkpoint created: ${id} for ${filePath}`);
      return checkpoint;
    } catch (e) {
      Logger.error('Failed to create checkpoint:', e);
    }
  }

  async restore(checkpointId) {
    const cp = this.checkpoints.find(c => c.id === checkpointId);
    if (!cp) return { success: false, error: 'Checkpoint not found' };

    try {
      fs.copyFileSync(cp.backupPath, cp.originalPath);
      Logger.info(`Restored checkpoint: ${checkpointId}`);
      return { success: true, path: cp.originalPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  list() {
    return this.checkpoints.map(cp => ({
      id: cp.id,
      timestamp: cp.timestamp,
      toolName: cp.toolName,
      path: cp.originalPath,
      size: cp.size,
      age: Date.now() - cp.timestamp,
    }));
  }

  async restoreLast() {
    if (this.checkpoints.length === 0) return { success: false, error: 'No checkpoints available' };
    return this.restore(this.checkpoints[0].id);
  }
}
