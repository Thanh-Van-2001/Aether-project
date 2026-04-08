/**
 * ✦ Aether — Knowledge Base Manager
 * Orchestrates indexing, searching, and auto-reindexing of local files.
 * This is the main API — combines FileIndexer + KnowledgeStore + Watcher.
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { FileIndexer } from './indexer.js';
import { KnowledgeStore } from './store.js';
import { logger } from '../utils/logger.js';

class KnowledgeBase {
  constructor(config) {
    this.config = config;
    this.indexer = new FileIndexer(config);
    this.store = null;
    this.enabled = config.knowledge?.enabled !== false;
    this.indexDirs = config.knowledge?.dirs || [];
    this.dbPath = config.knowledge?.dbPath || resolve(config.workspace, 'knowledge/aether-kb.db');
    this._reindexTimer = null;
  }

  async init() {
    if (!this.enabled) {
      logger.info('Knowledge base disabled');
      return;
    }

    this.store = new KnowledgeStore(this.dbPath);
    await this.store.init();

    // Auto-index workspace if no index exists yet
    const stats = this.store.getStats();
    if (stats.totalFiles === 0 && this.indexDirs.length === 0) {
      // Index workspace by default
      logger.info('Knowledge base: initial indexing of workspace...');
      await this.indexDirectory(this.config.workspace);
    } else if (this.indexDirs.length > 0) {
      // Index configured directories
      for (const dir of this.indexDirs) {
        const fullDir = resolve(dir);
        if (existsSync(fullDir)) {
          await this.indexDirectory(fullDir);
        }
      }
    }

    logger.info('Knowledge base ready');
  }

  /**
   * Index a directory — scan, chunk, store
   */
  async indexDirectory(dirPath, { clear = false } = {}) {
    if (!this.store) return { error: 'Knowledge base not initialized' };

    const fullPath = resolve(dirPath);
    if (!existsSync(fullPath)) {
      return { error: `Directory not found: ${dirPath}` };
    }

    if (clear) {
      this.store.clearAll();
    }

    const chunks = this.indexer.indexDirectory(fullPath);

    if (chunks.length > 0) {
      // Clear existing chunks for this directory, then insert new
      this.store.clearPath('');
      this.store.insertChunks(chunks);
      this.store._setMeta('last_full_index', new Date().toISOString());
    }

    return {
      ...this.indexer.getStats(),
      directory: dirPath,
    };
  }

  /**
   * Re-index a single file (incremental update)
   */
  async reindexFile(filePath) {
    if (!this.store) return;

    const relativePath = filePath; // Should already be relative
    const chunks = this.indexer.chunkFile(resolve(this.config.workspace, filePath), filePath);
    this.store.reindexFile(relativePath, chunks);

    logger.debug(`Re-indexed: ${filePath} (${chunks.length} chunks)`);
    return { path: filePath, chunks: chunks.length };
  }

  /**
   * Search the knowledge base
   */
  search(query, opts = {}) {
    if (!this.store) return [];
    return this.store.search(query, opts);
  }

  /**
   * Search and build context string for Claude
   */
  searchForContext(query, { maxResults = 5, maxChars = 8000 } = {}) {
    if (!this.store) return '';
    const results = this.store.search(query, { limit: maxResults });
    return this.store.buildSearchContext(results, { maxChars });
  }

  /**
   * Find files by path pattern
   */
  findFiles(pattern, opts = {}) {
    if (!this.store) return [];
    return this.store.searchByPath(pattern, opts);
  }

  /**
   * Get all chunks for a file
   */
  getFile(filePath) {
    if (!this.store) return [];
    return this.store.getFileChunks(filePath);
  }

  /**
   * Get index statistics
   */
  getStats() {
    if (!this.store) return { enabled: false };
    return {
      enabled: true,
      ...this.store.getStats(),
      indexer: this.indexer.getStats(),
    };
  }

  /**
   * Clear the entire index
   */
  clearIndex() {
    if (!this.store) return;
    this.store.clearAll();
    logger.info('Knowledge base index cleared');
  }

  /**
   * Setup auto-reindex with file watcher (called from gateway)
   */
  setupAutoReindex(watcherInstance) {
    if (!this.store || !watcherInstance) return;

    // Watch workspace for changes and trigger re-index
    watcherInstance.addFileWatch({
      name: '[knowledge] auto-reindex',
      path: '.',
      pattern: '*',
      task: '__internal_reindex__', // Special marker — handled differently
      debounceMs: 10000, // Wait 10s after changes settle
      notify: [],
    });

    logger.info('Knowledge base auto-reindex enabled');
  }

  close() {
    if (this._reindexTimer) clearInterval(this._reindexTimer);
    this.store?.close();
  }
}

export { KnowledgeBase };
export default KnowledgeBase;
