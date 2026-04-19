/**
 * ToolExecutor — VSCode-native implementation of all Meow CLI tools.
 * Mirrors src/modules/tools.js but runs inside the VSCode extension host.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { Logger } from '../utils/Logger.js';

const SHELL_TIMEOUT_MS = 30000;

export class ToolExecutor {
  /** @param {import('./MeowBridge.js').MeowBridge} bridge */
  constructor(bridge) {
    this.bridge = bridge;
  }

  getWorkspaceRoot() {
    return this.bridge.getWorkspaceRoot();
  }

  resolvePath(p) {
    if (path.isAbsolute(p)) return p;
    return path.resolve(this.getWorkspaceRoot(), p);
  }

  sandboxCheck(p) {
    const mode = this.bridge.getConfig().get('sandboxMode') || 'workspace';
    if (mode === 'permissive') return true;

    const resolved = this.resolvePath(p);
    const wsRoot = this.getWorkspaceRoot();

    if (mode === 'workspace' || mode === 'strict') {
      if (!resolved.startsWith(wsRoot)) {
        throw new Error(`Sandbox violation: '${p}' is outside the workspace (${wsRoot})`);
      }
    }
    return true;
  }

  // ─── Tool Definitions (for API) ───────────────────────────────────────────

  getToolDefinitions() {
    return [
      {
        name: 'list_dir',
        description: "List files and directories at the given path. Returns sorted entries with '/' suffix for directories.",
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to list' },
            recursive: { type: 'boolean', description: 'If true, list recursively (max 3 levels)' },
          },
          required: ['path'],
        },
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file. Large files are truncated to 50KB.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
            start_line: { type: 'number', description: 'Start reading from this line (1-based)' },
            end_line: { type: 'number', description: 'Stop reading at this line (inclusive)' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Create or overwrite a file with the given content.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Full file content' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'patch_file',
        description: "Apply a targeted edit to a file. Replaces 'old_string' with 'new_string'. PREFERRED over write_file for edits.",
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to patch' },
            old_string: { type: 'string', description: 'Exact string to find and replace' },
            new_string: { type: 'string', description: 'Replacement string' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'grep_search',
        description: 'Search for a pattern across files in a directory. Returns matching lines with file paths and line numbers.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern (regex supported)' },
            path: { type: 'string', description: 'Directory or file to search in' },
            include: { type: 'string', description: "File glob pattern to include (e.g. '*.js')" },
            max_results: { type: 'number', description: 'Maximum results to return (default: 50)' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'run_shell',
        description: 'Execute a shell command (Bash). Returns stdout, stderr, and exit code.',
        parameters: {
          type: 'object',
          properties: {
            cmd: { type: 'string', description: 'Shell command to execute' },
          },
          required: ['cmd'],
        },
      },
      {
        name: 'git_log',
        description: 'Show recent git commits.',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of commits (default 10)' },
            file: { type: 'string', description: 'Filter by file' },
          },
        },
      },
      {
        name: 'git_diff',
        description: 'Show git diff (staged or unstaged changes).',
        parameters: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Specific file' },
            staged: { type: 'boolean', description: 'Show staged changes' },
          },
        },
      },
      {
        name: 'git_status',
        description: 'Show git working tree status.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'web_search',
        description: 'Search the web for information.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            max_results: { type: 'number', description: 'Max results (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'open_file_in_editor',
        description: 'Open a file in the VSCode editor and optionally jump to a specific line.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to open' },
            line: { type: 'number', description: 'Line number to jump to' },
          },
          required: ['path'],
        },
      },
      {
        name: 'show_diff',
        description: 'Show a diff between original and modified content in the VSCode diff editor.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
            original: { type: 'string', description: 'Original content' },
            modified: { type: 'string', description: 'Modified content' },
          },
          required: ['path', 'original', 'modified'],
        },
      },
    ];
  }

  // ─── Tool Implementations ─────────────────────────────────────────────────

  async execute(name, input) {
    Logger.info(`Executing tool: ${name}`, input);

    switch (name) {
      case 'list_dir': return this.listDir(input);
      case 'read_file': return this.readFile(input);
      case 'write_file': return this.writeFile(input);
      case 'patch_file': return this.patchFile(input);
      case 'grep_search': return this.grepSearch(input);
      case 'run_shell': return this.runShell(input);
      case 'git_log': return this.gitLog(input);
      case 'git_diff': return this.gitDiff(input);
      case 'git_status': return this.gitStatus(input);
      case 'web_search': return this.webSearch(input);
      case 'open_file_in_editor': return this.openFileInEditor(input);
      case 'show_diff': return this.showDiff(input);
      default:
        return `Unknown tool: ${name}`;
    }
  }

  listDir({ path: dirPath, recursive = false }) {
    const resolved = this.resolvePath(dirPath);
    this.sandboxCheck(resolved);

    const listRecursive = (dir, depth = 0) => {
      if (depth > 3) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const results = [];
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
        const fullPath = path.join(dir, entry.name);
        const rel = path.relative(this.getWorkspaceRoot(), fullPath);
        if (entry.isDirectory()) {
          results.push(`${rel}/`);
          if (recursive) results.push(...listRecursive(fullPath, depth + 1));
        } else {
          results.push(rel);
        }
      }
      return results;
    };

    try {
      const entries = listRecursive(resolved);
      return entries.join('\n') || '(empty directory)';
    } catch (e) {
      return `Error listing directory: ${e.message}`;
    }
  }

  readFile({ path: filePath, start_line, end_line }) {
    const resolved = this.resolvePath(filePath);
    this.sandboxCheck(resolved);

    try {
      let content = fs.readFileSync(resolved, 'utf8');

      if (start_line || end_line) {
        const lines = content.split('\n');
        const start = (start_line || 1) - 1;
        const end = end_line || lines.length;
        content = lines.slice(start, end).join('\n');
      }

      // Truncate to 50KB
      if (content.length > 51200) {
        content = content.slice(0, 51200) + '\n... [TRUNCATED at 50KB]';
      }

      return content;
    } catch (e) {
      return `Error reading file: ${e.message}`;
    }
  }

  writeFile({ path: filePath, content }) {
    const resolved = this.resolvePath(filePath);
    this.sandboxCheck(resolved);

    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');

      // Refresh VSCode file explorer
      vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');

      return `✅ Written: ${filePath} (${content.length} bytes)`;
    } catch (e) {
      return `Error writing file: ${e.message}`;
    }
  }

  patchFile({ path: filePath, old_string, new_string }) {
    const resolved = this.resolvePath(filePath);
    this.sandboxCheck(resolved);

    try {
      const content = fs.readFileSync(resolved, 'utf8');

      if (!content.includes(old_string)) {
        return `Error: old_string not found in ${filePath}. The file may have changed. Re-read it first.`;
      }

      const patched = content.replace(old_string, new_string);
      fs.writeFileSync(resolved, patched, 'utf8');

      const linesChanged = (new_string.match(/\n/g) || []).length - (old_string.match(/\n/g) || []).length;
      return `✅ Patched: ${filePath} (${linesChanged >= 0 ? '+' : ''}${linesChanged} lines)`;
    } catch (e) {
      return `Error patching file: ${e.message}`;
    }
  }

  grepSearch({ pattern, path: searchPath, include, max_results = 50 }) {
    const resolved = this.resolvePath(searchPath || '.');
    this.sandboxCheck(resolved);

    try {
      const args = ['-rn', '--include', include || '*', '-m', String(max_results), pattern, resolved];
      const result = child_process.spawnSync('grep', args, {
        encoding: 'utf8',
        timeout: 10000,
        cwd: this.getWorkspaceRoot(),
      });

      if (result.error) throw result.error;

      const output = result.stdout || '';
      if (!output.trim()) return 'No matches found.';

      // Make paths relative
      const wsRoot = this.getWorkspaceRoot();
      return output.split('\n')
        .filter(Boolean)
        .map(line => line.replace(wsRoot + path.sep, ''))
        .join('\n');
    } catch (e) {
      return `Error searching: ${e.message}`;
    }
  }

  runShell({ cmd }) {
    const cwd = this.getWorkspaceRoot();

    try {
      const result = child_process.spawnSync('bash', ['-c', cmd], {
        encoding: 'utf8',
        timeout: SHELL_TIMEOUT_MS,
        cwd,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      const stdout = (result.stdout || '').slice(0, 20000);
      const stderr = (result.stderr || '').slice(0, 5000);
      const code = result.status ?? -1;

      let out = '';
      if (stdout) out += stdout;
      if (stderr) out += `\nSTDERR:\n${stderr}`;
      out += `\n[Exit code: ${code}]`;

      return out.trim();
    } catch (e) {
      return `Error running shell command: ${e.message}`;
    }
  }

  gitLog({ count = 10, file } = {}) {
    const args = ['log', `--max-count=${count}`, '--oneline', '--decorate'];
    if (file) args.push('--', file);

    try {
      const result = child_process.spawnSync('git', args, {
        encoding: 'utf8',
        cwd: this.getWorkspaceRoot(),
        timeout: 10000,
      });
      return result.stdout || result.stderr || 'No git log available';
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  gitDiff({ file, staged = false } = {}) {
    const args = ['diff'];
    if (staged) args.push('--staged');
    if (file) args.push('--', file);

    try {
      const result = child_process.spawnSync('git', args, {
        encoding: 'utf8',
        cwd: this.getWorkspaceRoot(),
        timeout: 10000,
      });
      return result.stdout || '(no changes)';
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  gitStatus() {
    try {
      const result = child_process.spawnSync('git', ['status', '--short'], {
        encoding: 'utf8',
        cwd: this.getWorkspaceRoot(),
        timeout: 10000,
      });
      return result.stdout || '(clean working tree)';
    } catch (e) {
      return `Error: ${e.message}`;
    }
  }

  async webSearch({ query, max_results = 5 }) {
    // Use DuckDuckGo Instant Answer API
    try {
      const encoded = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;

      return new Promise((resolve) => {
        const req = require('https').get(url, (res) => {
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const results = [];
              if (json.Abstract) results.push(`**${json.Heading}**: ${json.Abstract}`);
              (json.RelatedTopics || []).slice(0, max_results - 1).forEach(t => {
                if (t.Text) results.push(`- ${t.Text}`);
              });
              resolve(results.join('\n') || 'No results found.');
            } catch {
              resolve('Search failed: could not parse response');
            }
          });
        });
        req.on('error', (e) => resolve(`Search error: ${e.message}`));
      });
    } catch (e) {
      return `Search error: ${e.message}`;
    }
  }

  async openFileInEditor({ path: filePath, line }) {
    const resolved = this.resolvePath(filePath);
    try {
      const uri = vscode.Uri.file(resolved);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      if (line) {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }

      return `Opened ${filePath} in editor${line ? ` at line ${line}` : ''}`;
    } catch (e) {
      return `Error opening file: ${e.message}`;
    }
  }

  async showDiff({ path: filePath, original, modified }) {
    try {
      const originalUri = vscode.Uri.parse(`meow-diff:original/${filePath}`).with({ query: Buffer.from(original).toString('base64') });
      const modifiedUri = vscode.Uri.parse(`meow-diff:modified/${filePath}`).with({ query: Buffer.from(modified).toString('base64') });

      await vscode.commands.executeCommand('vscode.diff',
        vscode.Uri.parse(`untitled:original-${path.basename(filePath)}`),
        vscode.Uri.file(this.resolvePath(filePath)),
        `Meow: ${path.basename(filePath)} (proposed changes)`
      );

      return `Diff shown for ${filePath}`;
    } catch (e) {
      return `Error showing diff: ${e.message}`;
    }
  }

  dispose() {}
}
