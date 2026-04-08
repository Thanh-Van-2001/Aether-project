/**
 * ✦ Aether — File Indexer
 * Scans local directories, chunks text content, and indexes into SQLite FTS5.
 * Zero external dependencies — no embeddings, no vector DB, no GPU needed.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { resolve, relative, extname, basename, join } from 'path';
import { logger } from '../utils/logger.js';

// ─── File type support ───
const TEXT_EXTENSIONS = new Set([
  // Code
  '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
  '.vue', '.svelte', '.astro',
  // Config
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.env', '.env.example', '.env.local',
  '.gitignore', '.dockerignore', '.editorconfig',
  // Docs
  '.md', '.mdx', '.txt', '.rst', '.adoc', '.org',
  // Web
  '.html', '.htm', '.css', '.scss', '.less', '.sass',
  '.xml', '.svg',
  // Data
  '.csv', '.tsv', '.sql',
  // Shell
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  // Other
  '.dockerfile', '.makefile', '.gradle',
]);

// Files/dirs to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__', '.cache',
  '.next', '.nuxt', 'dist', 'build', 'out', 'target', 'vendor',
  '.venv', 'venv', 'env', '.tox', 'coverage', '.nyc_output',
  '.idea', '.vscode', '.vs', 'bower_components',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'composer.lock', 'Gemfile.lock', 'Cargo.lock', 'poetry.lock',
]);

// Max file size to index (500KB)
const MAX_FILE_SIZE = 512 * 1024;
// Chunk size for splitting large files (aim for ~500 tokens ≈ 2000 chars)
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

class FileIndexer {
  constructor(config) {
    this.config = config;
    this.stats = {
      filesScanned: 0,
      filesIndexed: 0,
      chunksCreated: 0,
      totalSize: 0,
      errors: 0,
      lastIndexed: null,
    };
  }

  /**
   * Check if a file should be indexed
   */
  _shouldIndex(filePath, stat) {
    const name = basename(filePath);
    const ext = extname(filePath).toLowerCase();

    // Skip hidden files
    if (name.startsWith('.') && !name.startsWith('.env')) return false;
    // Skip known non-text files
    if (SKIP_FILES.has(name)) return false;
    // Check extension
    if (!TEXT_EXTENSIONS.has(ext) && !this._isSpecialFile(name)) return false;
    // Size limit
    if (stat.size > MAX_FILE_SIZE) return false;
    if (stat.size === 0) return false;

    return true;
  }

  /**
   * Check for special files without extensions (Makefile, Dockerfile, etc.)
   */
  _isSpecialFile(name) {
    const lower = name.toLowerCase();
    return ['makefile', 'dockerfile', 'vagrantfile', 'procfile', 'rakefile',
            'gemfile', 'readme', 'license', 'changelog', 'contributing',
            'todo', 'notes'].some(s => lower.includes(s));
  }

  /**
   * Recursively scan a directory and collect indexable files
   */
  scanDirectory(dirPath, basePath = dirPath, maxDepth = 10) {
    const files = [];
    if (maxDepth <= 0) return files;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          files.push(...this.scanDirectory(fullPath, basePath, maxDepth - 1));
        } else if (entry.isFile()) {
          try {
            const stat = statSync(fullPath);
            if (this._shouldIndex(fullPath, stat)) {
              files.push({
                path: fullPath,
                relativePath: relative(basePath, fullPath),
                size: stat.size,
                modified: stat.mtime,
                extension: extname(fullPath).toLowerCase(),
              });
            }
          } catch { /* skip unreadable files */ }
        }

        this.stats.filesScanned++;
      }
    } catch (err) {
      logger.debug(`Scan error in ${dirPath}: ${err.message}`);
      this.stats.errors++;
    }

    return files;
  }

  /**
   * Read and chunk a file's content
   */
  chunkFile(filePath, relativePath) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const ext = extname(filePath).toLowerCase();
      const chunks = [];

      // For small files, single chunk
      if (content.length <= CHUNK_SIZE * 1.5) {
        chunks.push({
          path: relativePath,
          extension: ext,
          chunkIndex: 0,
          totalChunks: 1,
          content: content,
          preview: content.slice(0, 200),
        });
        return chunks;
      }

      // For code files: chunk by logical blocks (functions, classes)
      if (this._isCodeFile(ext)) {
        return this._chunkCode(content, relativePath, ext);
      }

      // For text/docs: chunk by paragraphs with overlap
      return this._chunkText(content, relativePath, ext);

    } catch (err) {
      logger.debug(`Chunk error for ${filePath}: ${err.message}`);
      this.stats.errors++;
      return [];
    }
  }

  /**
   * Check if a file extension is a programming language
   */
  _isCodeFile(ext) {
    return ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs',
            '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
            '.swift', '.kt', '.vue', '.svelte'].includes(ext);
  }

  /**
   * Chunk code files by logical blocks (functions, classes, etc.)
   */
  _chunkCode(content, relativePath, ext) {
    const chunks = [];
    const lines = content.split('\n');

    // Strategy: split by top-level blocks (functions, classes, exports)
    // Use indentation + keyword detection as a cheap heuristic
    const blockPatterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+/,
      /^(?:export\s+)?class\s+/,
      /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/,
      /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?function/,
      /^def\s+\w+/,           // Python
      /^class\s+\w+/,          // Python/Ruby
      /^func\s+\w+/,           // Go
      /^(?:pub\s+)?fn\s+\w+/,  // Rust
      /^(?:public|private|protected)\s+.*\w+\s*\(/,  // Java/C#
    ];

    let currentBlock = [];
    let currentStart = 0;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBlockStart = line.trim().length > 0 &&
        !line.startsWith(' ') && !line.startsWith('\t') &&
        blockPatterns.some(p => p.test(line.trim()));

      if (isBlockStart && currentBlock.length > 0) {
        // Save previous block
        const blockContent = currentBlock.join('\n');
        if (blockContent.trim().length > 50) {
          chunks.push({
            path: relativePath,
            extension: ext,
            chunkIndex: chunkIndex++,
            totalChunks: -1, // set later
            lineStart: currentStart + 1,
            lineEnd: i,
            content: blockContent,
            preview: blockContent.slice(0, 200),
          });
        }
        currentBlock = [line];
        currentStart = i;
      } else {
        currentBlock.push(line);
      }

      // Force split if block gets too long
      if (currentBlock.join('\n').length > CHUNK_SIZE * 2) {
        const blockContent = currentBlock.join('\n');
        chunks.push({
          path: relativePath,
          extension: ext,
          chunkIndex: chunkIndex++,
          totalChunks: -1,
          lineStart: currentStart + 1,
          lineEnd: i + 1,
          content: blockContent,
          preview: blockContent.slice(0, 200),
        });
        currentBlock = [];
        currentStart = i + 1;
      }
    }

    // Last block
    if (currentBlock.length > 0) {
      const blockContent = currentBlock.join('\n');
      if (blockContent.trim().length > 10) {
        chunks.push({
          path: relativePath,
          extension: ext,
          chunkIndex: chunkIndex++,
          totalChunks: -1,
          lineStart: currentStart + 1,
          lineEnd: lines.length,
          content: blockContent,
          preview: blockContent.slice(0, 200),
        });
      }
    }

    // Set total chunks
    chunks.forEach(c => c.totalChunks = chunks.length);

    // Fallback: if chunking produced nothing useful, single chunk
    if (chunks.length === 0) {
      chunks.push({
        path: relativePath,
        extension: ext,
        chunkIndex: 0,
        totalChunks: 1,
        content: content.slice(0, CHUNK_SIZE * 3),
        preview: content.slice(0, 200),
      });
    }

    return chunks;
  }

  /**
   * Chunk text/docs by paragraphs with overlap
   */
  _chunkText(content, relativePath, ext) {
    const chunks = [];
    let start = 0;
    let chunkIndex = 0;

    while (start < content.length) {
      let end = start + CHUNK_SIZE;

      // Try to break at paragraph boundary
      if (end < content.length) {
        const nextPara = content.indexOf('\n\n', end - CHUNK_OVERLAP);
        if (nextPara !== -1 && nextPara < end + CHUNK_OVERLAP) {
          end = nextPara + 2;
        } else {
          // Break at newline
          const nextLine = content.indexOf('\n', end);
          if (nextLine !== -1 && nextLine < end + 100) {
            end = nextLine + 1;
          }
        }
      } else {
        end = content.length;
      }

      const chunkContent = content.slice(start, end);
      if (chunkContent.trim().length > 20) {
        chunks.push({
          path: relativePath,
          extension: ext,
          chunkIndex: chunkIndex++,
          totalChunks: -1,
          content: chunkContent,
          preview: chunkContent.slice(0, 200),
        });
      }

      start = end - CHUNK_OVERLAP;
      if (start >= content.length) break;
    }

    chunks.forEach(c => c.totalChunks = chunks.length);
    return chunks;
  }

  /**
   * Full index run: scan + chunk + return all chunks
   */
  indexDirectory(dirPath) {
    this.stats = { filesScanned: 0, filesIndexed: 0, chunksCreated: 0, totalSize: 0, errors: 0, lastIndexed: null };

    logger.info(`Indexing directory: ${dirPath}`);
    const files = this.scanDirectory(dirPath);

    const allChunks = [];
    for (const file of files) {
      const chunks = this.chunkFile(file.path, file.relativePath);
      if (chunks.length > 0) {
        allChunks.push(...chunks);
        this.stats.filesIndexed++;
        this.stats.totalSize += file.size;
      }
    }

    this.stats.chunksCreated = allChunks.length;
    this.stats.lastIndexed = new Date();
    logger.info(`Indexed ${this.stats.filesIndexed} files → ${this.stats.chunksCreated} chunks (${(this.stats.totalSize / 1024).toFixed(1)} KB)`);

    return allChunks;
  }

  getStats() {
    return { ...this.stats };
  }
}

export { FileIndexer, TEXT_EXTENSIONS, SKIP_DIRS };
export default FileIndexer;
