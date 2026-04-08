/**
 * ✦ Aether — Knowledge Tools (for Claude tool use)
 * Allows Claude to search the local knowledge base, find files,
 * and trigger re-indexing.
 */

class KnowledgeTools {
  constructor(knowledgeBase) {
    this.kb = knowledgeBase;
  }

  async execute(toolName, input) {
    switch (toolName) {
      case 'knowledge_search': {
        const results = this.kb.search(input.query, {
          limit: input.limit || 10,
          extension: input.file_type,
          pathPrefix: input.path,
        });

        return {
          query: input.query,
          count: results.length,
          results: results.map(r => ({
            path: r.path,
            lines: r.line_start ? `${r.line_start}-${r.line_end}` : null,
            preview: r.preview,
            score: r.score,
          })),
        };
      }

      case 'knowledge_read': {
        const results = this.kb.search(input.query, {
          limit: input.limit || 5,
          extension: input.file_type,
          pathPrefix: input.path,
        });

        // Return full content of matching chunks
        return {
          query: input.query,
          count: results.length,
          results: results.map(r => ({
            path: r.path,
            lines: r.line_start ? `${r.line_start}-${r.line_end}` : null,
            content: r.content,
          })),
        };
      }

      case 'knowledge_find': {
        const files = this.kb.findFiles(input.pattern, { limit: input.limit || 20 });
        return {
          pattern: input.pattern,
          count: files.length,
          files: files.map(f => ({
            path: f.path,
            extension: f.extension,
            chunks: f.total_chunks,
          })),
        };
      }

      case 'knowledge_index': {
        const dir = input.directory || '.';
        const result = await this.kb.indexDirectory(dir, { clear: input.clear || false });
        return {
          success: !result.error,
          ...result,
        };
      }

      case 'knowledge_status': {
        return this.kb.getStats();
      }

      default:
        return { error: `Unknown knowledge operation: ${toolName}` };
    }
  }

  /**
   * Tool definitions for Anthropic API
   */
  static getToolDefinitions() {
    return [
      {
        name: 'knowledge_search',
        description: "Search the user's local files and codebase. Returns matching file snippets ranked by relevance. Use this to find code, documentation, configs, or any text content on the user's machine. This searches indexed local files — no data leaves the machine.",
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (natural language or keywords)' },
            file_type: { type: 'string', description: 'Filter by file extension (e.g., "js", "py", "md"). Optional.' },
            path: { type: 'string', description: 'Filter by path prefix (e.g., "src/api/"). Optional.' },
            limit: { type: 'number', description: 'Max results (default: 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'knowledge_read',
        description: "Search and read full content from the user's local files. Like knowledge_search but returns complete file chunks instead of previews. Use when you need to read the actual code/content.",
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            file_type: { type: 'string', description: 'Filter by extension (optional)' },
            path: { type: 'string', description: 'Filter by path prefix (optional)' },
            limit: { type: 'number', description: 'Max results (default: 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'knowledge_find',
        description: "Find files by name/path pattern in the user's indexed files. Use to locate specific files.",
        input_schema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'File path pattern to search for (e.g., "payment", "config.json", "api/routes")' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'knowledge_index',
        description: "Index or re-index a directory of the user's files. This scans files, chunks content, and makes it searchable. Run this when the user adds new files or asks to index a specific directory.",
        input_schema: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Directory to index (relative to workspace or absolute). Default: workspace root.' },
            clear: { type: 'boolean', description: 'Clear existing index before re-indexing (default: false)' },
          },
        },
      },
      {
        name: 'knowledge_status',
        description: 'Get knowledge base statistics — number of indexed files, chunks, and last index time.',
        input_schema: { type: 'object', properties: {} },
      },
    ];
  }
}

export { KnowledgeTools };
export default KnowledgeTools;
