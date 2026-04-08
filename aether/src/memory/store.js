/**
 * ✦ Aether — Memory Store
 * SQLite-backed persistent memory with FTS5, deduplication, prepared statement caching
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

class MemoryStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.fallbackPath = dbPath.replace('.db', '.json');
    this.useFallback = false;
    this._stmtCache = new Map();
  }

  async init() {
    mkdirSync(dirname(this.dbPath), { recursive: true });

    try {
      const Database = (await import('better-sqlite3')).default;
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = -8000'); // 8MB cache

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'fact',
          content TEXT NOT NULL,
          content_hash TEXT,
          source TEXT DEFAULT 'user',
          importance INTEGER DEFAULT 5,
          tags TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          access_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          channel TEXT,
          summary TEXT,
          message_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_use TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );

        CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
      `);

      // Initialize FTS5 virtual table for full-text search
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            content,
            content_rowid='rowid',
            tokenize='porter unicode61'
          );
        `);
        // Populate FTS from existing memories if empty
        const ftsCount = this.db.prepare('SELECT count(*) as c FROM memories_fts').get();
        const memCount = this.db.prepare('SELECT count(*) as c FROM memories').get();
        if (ftsCount.c === 0 && memCount.c > 0) {
          this.db.exec(`
            INSERT INTO memories_fts(rowid, content)
            SELECT rowid, content FROM memories;
          `);
        }
        this._hasFTS = true;
      } catch {
        this._hasFTS = false;
        logger.debug('FTS5 not available, using LIKE fallback for search');
      }

      logger.debug('Memory store initialized (SQLite + FTS5)');
    } catch (e) {
      logger.warn('SQLite not available, using JSON fallback:', e.message);
      this.useFallback = true;
      this._initFallback();
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
   * Simple content hash for deduplication
   */
  _hash(content) {
    let hash = 0;
    const str = content.toLowerCase().trim();
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  _initFallback() {
    if (!existsSync(this.fallbackPath)) {
      writeFileSync(this.fallbackPath, JSON.stringify({
        memories: [],
        conversations: [],
        messages: [],
      }, null, 2));
    }
  }

  _readFallback() {
    try {
      return JSON.parse(readFileSync(this.fallbackPath, 'utf-8'));
    } catch {
      return { memories: [], conversations: [], messages: [] };
    }
  }

  _writeFallback(data) {
    writeFileSync(this.fallbackPath, JSON.stringify(data, null, 2));
  }

  // ─── Memories ───
  addMemory({ id, type = 'fact', content, source = 'user', importance = 5, tags = [] }) {
    const contentHash = this._hash(content);

    if (this.useFallback) {
      const data = this._readFallback();
      // Deduplication check
      const existing = data.memories.find(m => this._hash(m.content) === contentHash);
      if (existing) {
        existing.access_count = (existing.access_count || 0) + 1;
        existing.updated_at = new Date().toISOString();
        this._writeFallback(data);
        return;
      }
      data.memories.push({ id, type, content, source, importance, tags, created_at: new Date().toISOString(), access_count: 0 });
      this._writeFallback(data);
      return;
    }

    // Deduplication: check if similar content already exists
    const existing = this._stmt(
      'SELECT id, access_count FROM memories WHERE content_hash = ?'
    ).get(contentHash);

    if (existing) {
      this._stmt(
        'UPDATE memories SET access_count = access_count + 1, updated_at = CURRENT_TIMESTAMP, accessed_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(existing.id);
      return;
    }

    this._stmt(
      'INSERT OR REPLACE INTO memories (id, type, content, content_hash, source, importance, tags) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, type, content, contentHash, source, importance, JSON.stringify(tags));

    // Update FTS index
    if (this._hasFTS) {
      try {
        const row = this._stmt('SELECT rowid FROM memories WHERE id = ?').get(id);
        if (row) {
          this._stmt('INSERT OR REPLACE INTO memories_fts(rowid, content) VALUES (?, ?)').run(row.rowid, content);
        }
      } catch { /* FTS update failed, not critical */ }
    }
  }

  getMemories({ type, limit = 50, search } = {}) {
    if (this.useFallback) {
      let mems = this._readFallback().memories;
      if (type) mems = mems.filter(m => m.type === type);
      if (search) mems = mems.filter(m => m.content.toLowerCase().includes(search.toLowerCase()));
      return mems.slice(-limit);
    }

    // Use FTS5 for search if available
    if (search && this._hasFTS) {
      try {
        const ftsQuery = search.split(/\s+/).map(w => `"${w.replace(/"/g, '')}"`).join(' OR ');
        let query = `
          SELECT m.* FROM memories m
          JOIN memories_fts fts ON m.rowid = fts.rowid
          WHERE memories_fts MATCH ?
        `;
        const params = [ftsQuery];
        if (type) {
          query += ' AND m.type = ?';
          params.push(type);
        }
        query += ' ORDER BY rank, m.importance DESC LIMIT ?';
        params.push(limit);
        return this.db.prepare(query).all(...params).map(row => ({
          ...row,
          tags: JSON.parse(row.tags || '[]'),
        }));
      } catch {
        // Fall through to LIKE-based search
      }
    }

    let query = 'SELECT * FROM memories';
    const params = [];
    const conditions = [];

    if (type) { conditions.push('type = ?'); params.push(type); }
    if (search) { conditions.push('content LIKE ?'); params.push(`%${search}%`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY importance DESC, updated_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params).map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
    }));
  }

  deleteMemory(id) {
    if (this.useFallback) {
      const data = this._readFallback();
      data.memories = data.memories.filter(m => m.id !== id);
      this._writeFallback(data);
      return;
    }

    // Remove from FTS first
    if (this._hasFTS) {
      try {
        const row = this._stmt('SELECT rowid FROM memories WHERE id = ?').get(id);
        if (row) {
          this._stmt('DELETE FROM memories_fts WHERE rowid = ?').run(row.rowid);
        }
      } catch { /* FTS delete failed, not critical */ }
    }

    this._stmt('DELETE FROM memories WHERE id = ?').run(id);
  }

  /**
   * Update access tracking when memory is used in context
   */
  touchMemory(id) {
    if (this.useFallback) return;
    this._stmt(
      'UPDATE memories SET accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE id = ?'
    ).run(id);
  }

  // ─── Conversations ───
  saveConversation({ id, channel, summary, messageCount }) {
    if (this.useFallback) {
      const data = this._readFallback();
      const idx = data.conversations.findIndex(c => c.id === id);
      const conv = { id, channel, summary, message_count: messageCount, updated_at: new Date().toISOString() };
      if (idx >= 0) data.conversations[idx] = conv;
      else data.conversations.push({ ...conv, created_at: new Date().toISOString() });
      this._writeFallback(data);
      return;
    }
    this._stmt(`
      INSERT OR REPLACE INTO conversations (id, channel, summary, message_count, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, channel, summary, messageCount);
  }

  getConversations({ limit = 20 } = {}) {
    if (this.useFallback) {
      return this._readFallback().conversations.slice(-limit);
    }
    return this._stmt(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?'
    ).all(limit);
  }

  // ─── Messages ───
  saveMessage({ id, conversationId, role, content, toolUse }) {
    if (this.useFallback) {
      const data = this._readFallback();
      data.messages.push({ id, conversation_id: conversationId, role, content, tool_use: toolUse, created_at: new Date().toISOString() });
      this._writeFallback(data);
      return;
    }
    this._stmt(`
      INSERT INTO messages (id, conversation_id, role, content, tool_use)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, conversationId, role, content, toolUse ? JSON.stringify(toolUse) : null);
  }

  getMessages(conversationId, { limit = 100 } = {}) {
    if (this.useFallback) {
      return this._readFallback().messages
        .filter(m => m.conversation_id === conversationId)
        .slice(-limit);
    }
    return this._stmt(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(conversationId, limit);
  }

  // ─── Context builder (with relevance scoring) ───
  buildContextString() {
    const memories = this.getMemories({ limit: 30 });
    if (!memories.length) return '';

    // Sort by composite score: importance * recency * frequency
    const now = Date.now();
    const scored = memories.map(m => {
      const age = (now - new Date(m.updated_at || m.created_at).getTime()) / (1000 * 60 * 60 * 24); // days
      const recencyScore = Math.max(0.1, 1 / (1 + age * 0.05)); // decay over days
      const freqScore = Math.min(2, 1 + (m.access_count || 0) * 0.1);
      const score = (m.importance || 5) * recencyScore * freqScore;
      return { ...m, _score: score };
    }).sort((a, b) => b._score - a._score);

    const grouped = {};
    scored.forEach(m => {
      if (!grouped[m.type]) grouped[m.type] = [];
      grouped[m.type].push(m.content);
    });

    let ctx = '\n<user_memory>\n';
    for (const [type, items] of Object.entries(grouped)) {
      ctx += `## ${type}\n`;
      items.forEach(item => { ctx += `- ${item}\n`; });
    }
    ctx += '</user_memory>\n';
    return ctx;
  }

  // ─── Stats ───
  getStats() {
    if (this.useFallback) {
      const data = this._readFallback();
      return {
        memories: data.memories.length,
        conversations: data.conversations.length,
        messages: data.messages.length,
      };
    }
    return {
      memories: this._stmt('SELECT count(*) as c FROM memories').get().c,
      conversations: this._stmt('SELECT count(*) as c FROM conversations').get().c,
      messages: this._stmt('SELECT count(*) as c FROM messages').get().c,
    };
  }

  close() {
    this._stmtCache.clear();
    if (this.db) this.db.close();
  }
}

export { MemoryStore };
export default MemoryStore;
