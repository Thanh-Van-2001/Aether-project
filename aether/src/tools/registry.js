/**
 * ✦ Aether — Tool Registry
 * Registers and manages tools that Claude can use.
 * Includes core tools + autonomous agent tools.
 */

import { logger } from '../utils/logger.js';
import { ShellExecTool } from './shell-exec.js';
import { FileOpsTool } from './file-ops.js';
import { WebFetchTool } from './web-fetch.js';
import { MemoryTool } from './memory-tool.js';
import { AgentTools } from './agent-tools.js';
import { KnowledgeTools } from './knowledge-tools.js';

class ToolRegistry {
  constructor(config) {
    this.config = config;
    this.tools = new Map();
    this._agentToolsInstance = null;
    this._agentToolDefs = [];
    this._knowledgeToolsInstance = null;
    this._knowledgeToolDefs = [];
  }

  async init(memoryManager) {
    // Register built-in tools
    const shellTool = new ShellExecTool(this.config);
    const fileTool = new FileOpsTool(this.config);
    const webTool = new WebFetchTool(this.config);
    const memTool = new MemoryTool(memoryManager);

    this.register('shell_exec', shellTool);
    this.register('file_read', fileTool);
    this.register('file_write', fileTool);
    this.register('file_list', fileTool);
    this.register('web_fetch', webTool);
    this.register('memory_add', memTool);
    this.register('memory_search', memTool);
    this.register('memory_list', memTool);

    logger.info(`Tool registry: ${this.tools.size} tools registered`);
  }

  /**
   * Register autonomous agent tools (called after agent runner is initialized)
   */
  registerAgentTools(agentRunner, scheduler, watcher, pipelineEngine) {
    this._agentToolsInstance = new AgentTools(agentRunner, scheduler, watcher, pipelineEngine);
    this._agentToolDefs = AgentTools.getToolDefinitions();

    // Register each agent tool
    const agentToolNames = [
      'agent_spawn', 'agent_list', 'agent_results', 'agent_stop',
      'schedule_add', 'schedule_list', 'schedule_remove',
      'watch_add', 'watch_list', 'watch_remove',
      'pipeline_list', 'pipeline_run',
    ];
    for (const name of agentToolNames) {
      this.register(name, this._agentToolsInstance);
    }

    logger.info(`Agent tools registered: ${agentToolNames.length} tools (+${this.tools.size} total)`);
  }

  /**
   * Register knowledge base tools (called after knowledge base is initialized)
   */
  registerKnowledgeTools(knowledgeBase) {
    this._knowledgeToolsInstance = new KnowledgeTools(knowledgeBase);
    this._knowledgeToolDefs = KnowledgeTools.getToolDefinitions();

    const toolNames = ['knowledge_search', 'knowledge_read', 'knowledge_find', 'knowledge_index', 'knowledge_status'];
    for (const name of toolNames) {
      this.register(name, this._knowledgeToolsInstance);
    }

    logger.info(`Knowledge tools registered: ${toolNames.length} tools (${this.tools.size} total)`);
  }

  register(name, handler) {
    this.tools.set(name, handler);
  }

  get(name) {
    return this.tools.get(name);
  }

  /**
   * Execute a tool call from Claude
   */
  async execute(toolName, input) {
    const handler = this.tools.get(toolName);
    if (!handler) {
      return { error: `Unknown tool: ${toolName}` };
    }

    try {
      logger.debug(`Tool call: ${toolName}`, input);
      const result = await handler.execute(toolName, input);
      logger.debug(`Tool result: ${toolName}`, typeof result === 'string' ? result.slice(0, 200) : result);
      return result;
    } catch (err) {
      logger.error(`Tool error: ${toolName}:`, err.message);
      return { error: err.message };
    }
  }

  /**
   * Get Anthropic API tool definitions (core + agent tools)
   */
  getToolDefinitions() {
    const coreDefs = [
      {
        name: 'shell_exec',
        description: 'Execute a shell command. Returns stdout and stderr. Use for running code, system commands, and scripts.',
        input_schema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to execute' },
            language: {
              type: 'string',
              enum: ['bash', 'node', 'python'],
              description: 'Execution language/runtime (default: bash)',
            },
            timeout: {
              type: 'number',
              description: 'Max execution time in milliseconds (default: 30000)',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'file_read',
        description: 'Read the contents of a file. Returns the file text.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file to read' },
          },
          required: ['path'],
        },
      },
      {
        name: 'file_write',
        description: 'Write content to a file. Creates the file if it does not exist.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to write to' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'file_list',
        description: 'List files and directories at a path.',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path to list' },
          },
          required: ['path'],
        },
      },
      {
        name: 'web_fetch',
        description: 'Fetch the content of a web page. Returns the text content.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
          },
          required: ['url'],
        },
      },
      {
        name: 'memory_add',
        description: 'Store a memory/fact about the user for future reference.',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The memory/fact to store' },
            type: {
              type: 'string',
              enum: ['fact', 'preference', 'identity', 'project', 'context'],
              description: 'Type of memory',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'memory_search',
        description: 'Search through stored memories.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'memory_list',
        description: 'List all stored memories.',
        input_schema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Filter by memory type (optional)' },
          },
        },
      },
    ];

    return [...coreDefs, ...this._agentToolDefs, ...this._knowledgeToolDefs];
  }
}

export { ToolRegistry };
export default ToolRegistry;
