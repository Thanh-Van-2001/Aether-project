/**
 * ✦ Aether — Memory Manager
 * Manages persistent memory with auto-extraction
 */

import { MemoryStore } from './store.js';
import { uuid } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

class MemoryManager {
  constructor(config) {
    this.config = config;
    this.store = new MemoryStore(config.memory.dbPath);
    this.enabled = config.memory.enabled;
  }

  async init() {
    if (!this.enabled) {
      logger.info('Memory disabled');
      return;
    }
    await this.store.init();
    logger.info('Memory manager initialized');
  }

  async addMemory(content, opts = {}) {
    if (!this.enabled) return null;
    const id = opts.id || uuid();
    this.store.addMemory({
      id,
      type: opts.type || 'fact',
      content,
      source: opts.source || 'user',
      importance: opts.importance || 5,
      tags: opts.tags || [],
    });
    logger.debug(`Memory added: ${content.slice(0, 60)}`);
    return id;
  }

  async getMemories(opts = {}) {
    if (!this.enabled) return [];
    return this.store.getMemories(opts);
  }

  async searchMemories(query) {
    if (!this.enabled) return [];
    return this.store.getMemories({ search: query });
  }

  async deleteMemory(id) {
    if (!this.enabled) return;
    this.store.deleteMemory(id);
    logger.debug(`Memory deleted: ${id}`);
  }

  buildContext() {
    if (!this.enabled) return '';
    return this.store.buildContextString();
  }

  /**
   * Extract potential memories from a conversation turn.
   * Looks for patterns like "I am...", "My name is...", "I work at...", etc.
   */
  async extractFromMessage(message) {
    if (!this.enabled) return [];

    const patterns = [
      { regex: /my name is (\w+)/i, type: 'identity', template: (m) => `User's name is ${m[1]}` },
      { regex: /i (?:work|am working) (?:at|for) (.+?)(?:\.|,|$)/i, type: 'work', template: (m) => `User works at ${m[1]}` },
      { regex: /i live in (.+?)(?:\.|,|$)/i, type: 'location', template: (m) => `User lives in ${m[1]}` },
      { regex: /i (?:prefer|like) (.+?) over (.+?)(?:\.|,|$)/i, type: 'preference', template: (m) => `User prefers ${m[1]} over ${m[2]}` },
      { regex: /i speak (\w+)/i, type: 'language', template: (m) => `User speaks ${m[1]}` },
      { regex: /i(?:'m| am) a (.+?)(?:\.|,|$)/i, type: 'identity', template: (m) => `User is a ${m[1]}` },
      { regex: /remember (?:that )?(.+?)(?:\.|$)/i, type: 'fact', template: (m) => m[1] },
    ];

    const extracted = [];
    for (const pat of patterns) {
      const match = message.match(pat.regex);
      if (match) {
        const content = pat.template(match);
        const id = await this.addMemory(content, { type: pat.type, source: 'auto' });
        if (id) extracted.push({ id, content });
      }
    }
    return extracted;
  }

  // ─── Conversation tracking ───
  async saveConversation(convId, channel, messages) {
    if (!this.enabled) return;
    const summary = messages.length > 0
      ? messages[messages.length - 1].content?.slice(0, 100)
      : '';
    this.store.saveConversation({
      id: convId,
      channel,
      summary,
      messageCount: messages.length,
    });
  }

  async saveMessage(convId, msg) {
    if (!this.enabled) return;
    this.store.saveMessage({
      id: uuid(),
      conversationId: convId,
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      toolUse: msg.toolUse,
    });
  }

  async getConversationHistory(convId, opts) {
    if (!this.enabled) return [];
    return this.store.getMessages(convId, opts);
  }

  async getStats() {
    if (!this.enabled) return {};
    return this.store.getStats();
  }

  close() {
    this.store.close();
  }
}

export { MemoryManager };
export default MemoryManager;
