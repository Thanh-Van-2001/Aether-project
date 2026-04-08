/**
 * ✦ Aether — Memory Tool (for Claude tool use)
 */

import { uuid } from '../utils/helpers.js';

class MemoryTool {
  constructor(memoryManager) {
    this.memory = memoryManager;
  }

  async execute(toolName, input) {
    switch (toolName) {
      case 'memory_add': {
        const id = await this.memory.addMemory(input.content, {
          type: input.type || 'fact',
          source: 'agent',
        });
        return { success: true, id, message: `Memory stored: "${input.content}"` };
      }

      case 'memory_search': {
        const results = await this.memory.searchMemories(input.query);
        return {
          query: input.query,
          count: results.length,
          results: results.map(m => ({
            content: m.content,
            type: m.type,
            created: m.created_at,
          })),
        };
      }

      case 'memory_list': {
        const memories = await this.memory.getMemories({ type: input.type });
        return {
          count: memories.length,
          memories: memories.map(m => ({
            id: m.id,
            content: m.content,
            type: m.type,
            created: m.created_at,
          })),
        };
      }

      default:
        return { error: `Unknown memory operation: ${toolName}` };
    }
  }
}

export { MemoryTool };
export default MemoryTool;
