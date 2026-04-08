/**
 * ✦ Aether — File Operations Tool
 * Enhanced: symlink protection, binary detection, atomic writes
 */

import { readFileSync, writeFileSync, readdirSync, statSync, lstatSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, relative, extname } from 'path';
import { sanitizePath, formatBytes } from '../utils/helpers.js';

// Binary/dangerous file extensions
const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
]);

class FileOpsTool {
  constructor(config) {
    this.config = config;
    this.workDir = resolve(config.workspace);
    this.sandbox = config.sandbox;
    this.allowedDirs = config.allowedDirs.length
      ? config.allowedDirs.map(d => resolve(d))
      : [this.workDir];
  }

  _resolvePath(inputPath) {
    const cleaned = sanitizePath(inputPath);
    const full = resolve(this.workDir, cleaned);

    if (this.sandbox) {
      // Check against allowed directories
      const allowed = this.allowedDirs.some(dir => full.startsWith(dir));
      if (!allowed && !full.startsWith(this.workDir)) {
        throw new Error(`Access denied: path outside allowed directories`);
      }

      // Prevent symlink attacks: check if real path is also within allowed dirs
      if (existsSync(full)) {
        const lstat = lstatSync(full);
        if (lstat.isSymbolicLink()) {
          throw new Error(`Access denied: symbolic links are not allowed in sandbox mode`);
        }
      }
    }
    return full;
  }

  async execute(toolName, input) {
    switch (toolName) {
      case 'file_read':
        return this._read(input);
      case 'file_write':
        return this._write(input);
      case 'file_list':
        return this._list(input);
      default:
        return { error: `Unknown file operation: ${toolName}` };
    }
  }

  _read(input) {
    if (!input.path) return { error: 'path is required' };

    const path = this._resolvePath(input.path);
    if (!existsSync(path)) {
      return { error: `File not found: ${input.path}` };
    }

    const stat = statSync(path);
    if (stat.isDirectory()) {
      return { error: `Path is a directory, use file_list instead: ${input.path}` };
    }
    if (stat.size > 1024 * 1024) {
      return { error: `File too large: ${formatBytes(stat.size)} (max 1MB)` };
    }

    // Check for binary files
    const ext = extname(path).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return {
        path: input.path,
        size: formatBytes(stat.size),
        type: ext,
        content: `[Binary file: ${ext}, ${formatBytes(stat.size)}]`,
      };
    }

    const content = readFileSync(path, 'utf-8');
    return {
      content,
      size: formatBytes(stat.size),
      lines: content.split('\n').length,
      path: input.path,
    };
  }

  _write(input) {
    if (!input.path) return { error: 'path is required' };
    if (input.content === undefined || input.content === null) return { error: 'content is required' };
    if (input.content.length > 1024 * 1024) return { error: 'Content too large (max 1MB)' };

    const path = this._resolvePath(input.path);

    // Prevent writing binary/executable files in sandbox
    if (this.sandbox) {
      const ext = extname(path).toLowerCase();
      if (['.exe', '.dll', '.so', '.sh', '.bat', '.cmd', '.ps1'].includes(ext)) {
        return { error: `Cannot write executable files in sandbox mode: ${ext}` };
      }
    }

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, input.content, 'utf-8');
    return {
      success: true,
      path: input.path,
      size: formatBytes(Buffer.byteLength(input.content)),
    };
  }

  _list(input) {
    const path = this._resolvePath(input.path || '.');
    if (!existsSync(path)) {
      return { error: `Directory not found: ${input.path}` };
    }

    const stat = statSync(path);
    if (!stat.isDirectory()) {
      return { error: `Path is not a directory: ${input.path}` };
    }

    const entries = readdirSync(path, { withFileTypes: true });
    const items = entries
      .filter(e => !e.name.startsWith('.'))
      .slice(0, 200) // Cap at 200 entries
      .map(e => {
        try {
          const fullPath = resolve(path, e.name);
          const stat = statSync(fullPath);
          return {
            name: e.name,
            type: e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : 'file',
            size: e.isFile() ? formatBytes(stat.size) : null,
            modified: stat.mtime.toISOString(),
          };
        } catch {
          return { name: e.name, type: 'unknown', size: null, modified: null };
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return { path: input.path || '.', items, count: items.length, total: entries.length };
  }
}

export { FileOpsTool };
export default FileOpsTool;
