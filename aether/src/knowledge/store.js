/**
 * ✦ Aether — Knowledge Store
 * SQLite FTS5-backed search engine for local file content.
 * BM25 ranking, no embeddings needed.
 */

import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

class KnowledgeStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this._stmtCache = new Map();
  }

  async init() {
    mkdirSync(dirname(this.dbPath), { recursive: true });

    try {
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -16000'); // 16MB cache

      // Main document chunks table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL,
          extension TEXT,
          chunk_index INTEGER DEFAULT 0,
          total_chunks INTEGER DEFAULT 1,
          line_start INTEGER,
          line_end INTEGER,
          content TEXT NOT NULL,
          preview TEXT,
          size INTEGER DEFAULT 0,
          indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          file_modified DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
        CREATE INDEX IF NOT EXISTS idx_chunks_ext ON chunks(extension);
      `);

      // FTS5 virtual table for full-text search
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
          path,
          content,
          content='chunks',
          content_rowid='id',
          tokenize='porter unicode61'
        );
      `);

      // Triggers to keep FTS in sync
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
          INSERT INTO chunks_fts(rowid, path, content)
          VALUES (new.id, new.path, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, path, content)
          VALUES ('delete', old.id, old.path, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts, rowid, path, content)
          VALUES ('delete', old.id, old.path, old.content);
          INSERT INTO chunks_fts(rowid, path, content)
          VALUES (new.id, new.path, new.content);
        END;
      `);

      // Metadata table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS index_meta (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      logger.debug('Knowledge store initialized');
    } catch (err) {
      logger.error('Knowledge store init failed:', err.message);
      throw err;
    }
  }

  /**
   * Get or create a prepared statement (cached)
   */
  _stmt(sql) {
    if (!this._stmtCache.has(sql)) {
      this._stmtCache.set(sql, this.db.prepare(sql));
    }
    return this._stmtCache.get(sql);
  }

  /**
   * Clear all indexed content for a specific path prefix
   */
  clearPath(pathPrefix) {
    this._stmt('DELETE FROM chunks WHERE path LIKE ?').run(`${pathPrefix}%`);
  }

  /**
   * Clear entire index
   */
  clearAll() {
    this.db.exec('DELETE FROM chunks');
    // Rebuild FTS
    this.db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
    this._setMeta('last_full_index', null);
  }

  /**
   * Insert chunks from indexer
   */
  insertChunks(chunks) {
    const insert = this._stmt(`
      INSERT INTO chunks (path, extension, chunk_index, total_chunks, line_start, line_end, content, preview, size)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const chunk of items) {
        insert.run(
          chunk.path,
          chunk.extension || '',
          chunk.chunkIndex || 0,
          chunk.totalChunks || 1,
          chunk.lineStart || null,
          chunk.lineEnd || null,
          chunk.content,
          chunk.preview || chunk.content.slice(0, 200),
          chunk.content.length,
        );
      }
    });

    insertMany(chunks);
  }

  /**
   * Re-index a single file (delete old chunks, insert new)
   */
  reindexFile(relativePath, chunks) {
    this.db.transaction(() => {
      this.clearPath(relativePath);
      if (chunks.length > 0) {
        this.insertChunks(chunks);
      }
    })();
  }

  /**
   * Full-text search with BM25 ranking
   * Returns top matching chunks with relevance scores
   */
  search(query, { limit = 10, extension, pathPrefix } = {}) {
    if (!query || query.trim().length === 0) return [];

    // Build FTS5 query — handle multi-word queries
    const words = query.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length === 0) return [];

    // Use proximity matching: words near each other score higher
    const ftsQuery = words.map(w => `"${w.replace(/"/g, '')}"`).join(' OR ');

    try {
      let sql = `
        SELECT
          c.id,
          c.path,
          c.extension,
          c.chunk_index,
          c.total_chunks,
          c.line_start,
          c.line_end,
          c.content,
          c.preview,
          rank
        FROM chunks_fts fts
        JOIN chunks c ON c.id = fts.rowid
        WHERE chunks_fts MATCH ?
      `;
      const params = [ftsQuery];

      if (extension) {
        sql += ' AND c.extension = ?';
        params.push(extension.startsWith('.') ? extension : `.${extension}`);
      }

      if (pathPrefix) {
        sql += ' AND c.path LIKE ?';
        params.push(`${pathPrefix}%`);
      }

      sql += ' ORDER BY rank LIMIT ?';
      params.push(limit);

      return this.db.prepare(sql).all(...params).map(row => ({
        ...row,
        score: Math.abs(row.rank), // BM25 rank (lower = better, we abs it)
      }));
    } catch (err) {
      logger.debug(`Knowledge search error: ${err.message}`);
      // Fallback to LIKE search if FTS query fails
      return this._fallbackSearch(query, { limit, extension, pathPrefix });
    }
  }

  /**
   * Fallback LIKE-based search
   */
  _fallbackSearch(query, { limit = 10, extension, pathPrefix } = {}) {
    let sql = 'SELECT * FROM chunks WHERE content LIKE ?';
    const params = [`%${query}%`];

    if (extension) {
      sql += ' AND extension = ?';
      params.push(extension.startsWith('.') ? extension : `.${extension}`);
    }
    if (pathPrefix) {
      sql += ' AND path LIKE ?';
      params.push(`${pathPrefix}%`);
    }

    sql += ' ORDER BY indexed_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params).map(row => ({
      ...row,
      score: 0,
    }));
  }

  /**
   * Search by file path pattern
   */
  searchByPath(pattern, { limit = 20 } = {}) {
    return this._stmt(
      'SELECT DISTINCT path, extension, total_chunks, MIN(indexed_at) as indexed_at FROM chunks WHERE path LIKE ? GROUP BY path ORDER BY path LIMIT ?'
    ).all(`%${pattern}%`, limit);
  }

  /**
   * Get all chunks for a specific file
   */
  getFileChunks(filePath) {
    return this._stmt(
      'SELECT * FROM chunks WHERE path = ? ORDER BY chunk_index'
    ).all(filePath);
  }

  /**
   * Get index statistics
   */
  getStats() {
    const totalChunks = this._stmt('SELECT count(*) as c FROM chunks').get().c;
    const totalFiles = this._stmt('SELECT count(DISTINCT path) as c FROM chunks').get().c;
    const totalSize = this._stmt('SELECT sum(size) as s FROM chunks').get().s || 0;

    const byExtension = this._stmt(
      'SELECT extension, count(*) as chunks, count(DISTINCT path) as files FROM chunks GROUP BY extension ORDER BY files DESC LIMIT 15'
    ).all();

    const lastIndex = this._getMeta('last_full_index');

    return {
      totalChunks,
      totalFiles,
      totalSizeKB: Math.round(totalSize / 1024),
      byExtension,
      lastFullIndex: lastIndex,
    };
  }

  /**
   * Get list of all indexed files
   */
  getIndexedFiles({ limit = 100, offset = 0 } = {}) {
    return this._stmt(
      'SELECT path, extension, total_chunks, MIN(indexed_at) as indexed_at FROM chunks GROUP BY path ORDER BY path LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }

  // ─── Metadata helpers ───
  _setMeta(key, value) {
    this._stmt(
      'INSERT OR REPLACE INTO index_meta (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
    ).run(key, value);
  }

  _getMeta(key) {
    const row = this._stmt('SELECT value FROM index_meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  /**
   * Build context string from search results (for injection into Claude prompt)
   */
  buildSearchContext(results, { maxChars = 8000 } = {}) {
    if (!results || results.length === 0) return '';

    let ctx = '\n<local_knowledge>\n';
    let totalChars = 0;

    for (const result of results) {
      const header = `## ${result.path}${result.line_start ? `:${result.line_start}-${result.line_end}` : ''}\n`;
      const content = result.content.slice(0, 2000); // Cap each chunk

      if (totalChars + header.length + content.length > maxChars) break;

      ctx += header;
      ctx += '```' + (result.extension || '').replace('.', '') + '\n';
      ctx += content + '\n';
      ctx += '```\n\n';
      totalChars += header.length + content.length;
    }

    ctx += '</local_knowledge>\n';
    return ctx;
  }

  close() {
    this._stmtCache.clear();
    if (this.db) this.db.close();
  }
}

export { KnowledgeStore };
export default KnowledgeStore;
