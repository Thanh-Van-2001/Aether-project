/**
 * ✦ Aether — Agent Core
 * The brain that connects Claude API with tools, skills, and memory.
 * Optimized: parallel tool exec, history pruning, retry, event hooks, thinking support
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { MemoryManager } from './memory/index.js';
import { SkillLoader } from './skills/loader.js';
import { ToolRegistry } from './tools/registry.js';
import { logger } from './utils/logger.js';
import { uuid } from './utils/helpers.js';

const SYSTEM_PROMPT = `You are Aether — a personal AI assistant powered by Claude, running locally on the user's machine.

Aether is the fifth classical element — the substance that connects everything. That's your role: you connect the user to their tools, their data, and their goals seamlessly.

Core principles:
- Precise and capable — you deliver results, not filler
- Privacy-first — all data stays on the user's device
- Proactive — you anticipate needs and suggest next steps
- Tool-native — you use tools effectively when they help
- Autonomous — you can spawn background agents that work independently

Style:
- Professional yet approachable
- Concise by default, detailed when asked
- Honest about limitations
- You remember what users tell you and use that context naturally

When you store a memory, confirm briefly. When recalling memories, weave them in naturally.
When using tools, briefly explain what you're doing, then show results.

## Autonomous Capabilities

You have unique autonomous capabilities that set you apart:

**Background Agents** — Use agent_spawn to create agents that run independently:
- One-shot tasks: "Fetch the latest news and summarize it"
- Recurring monitors: "Check this URL every 5 minutes for changes"
- Proactive watchers: "Watch the logs folder for errors"

**Scheduled Tasks** — Use schedule_add for cron-based recurring tasks:
- "Every morning at 9am, summarize my inbox"
- "Every 30 minutes, check system health"

**File Watchers** — Use watch_add to monitor filesystem changes:
- "Watch *.log files for error patterns"
- "Monitor config.json for changes"

**Workflow Pipelines** — Multi-step automated workflows defined in YAML:
- Chain multiple tools and LLM calls together
- Use pipeline_list and pipeline_run to manage them

When a user asks you to monitor, watch, schedule, or automate something, proactively suggest using these autonomous capabilities rather than just answering once.

## Local Knowledge Base

You have access to a local knowledge base that indexes the user's files on their machine.
- Use knowledge_search to find relevant code, docs, or configs
- Use knowledge_read to read the full content of matching files
- Use knowledge_find to locate files by name
- When the user asks about their code, project, or files, ALWAYS search the knowledge base first
- All data stays local — nothing is uploaded anywhere
`;

// Token estimation: ~4 chars per token for English
const CHARS_PER_TOKEN = 4;
const MAX_HISTORY_TOKENS = 100000;
const MAX_HISTORY_CHARS = MAX_HISTORY_TOKENS * CHARS_PER_TOKEN;

class Agent extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.memory = null;
    this.knowledge = null; // KnowledgeBase instance (set externally)
    this.skills = [];
    this.tools = null;
    this.history = [];
    this.conversationId = uuid();
    this.systemPrompt = SYSTEM_PROMPT;
    this._skillPromptCache = '';
  }

  async init() {
    // Initialize Anthropic client
    this.client = new Anthropic({ apiKey: this.config.apiKey });
    logger.info(`Agent initialized with model: ${this.config.model}`);

    // Initialize memory
    this.memory = new MemoryManager(this.config);
    await this.memory.init();

    // Load skills
    const loader = new SkillLoader(this.config.root);
    this.skills = await loader.loadAll();
    this._skillPromptCache = loader.buildSkillPrompt(this.skills);
    this.systemPrompt = SYSTEM_PROMPT + this._skillPromptCache;

    // Append memory context
    const memCtx = this.memory.buildContext();
    if (memCtx) {
      this.systemPrompt += memCtx;
    }

    // Initialize tools
    this.tools = new ToolRegistry(this.config);
    await this.tools.init(this.memory);

    this.emit('ready');
    logger.info('Agent ready');
  }

  /**
   * Build system prompt with fresh memory context + optional knowledge context
   */
  _buildSystemPrompt(knowledgeContext = '') {
    const memCtx = this.memory.buildContext();
    return SYSTEM_PROMPT + this._skillPromptCache + memCtx + knowledgeContext;
  }

  /**
   * Extract key terms from user message for knowledge search
   */
  _extractSearchTerms(message) {
    // Skip very short messages or commands
    if (message.length < 10 || message.startsWith('/')) return null;

    // Remove common filler words
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might',
      'i', 'me', 'my', 'you', 'your', 'we', 'our', 'they', 'their', 'it', 'its',
      'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'how', 'where',
      'when', 'why', 'if', 'then', 'else', 'and', 'or', 'not', 'but', 'so', 'for',
      'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'into',
      'please', 'help', 'tell', 'show', 'give', 'make', 'let', 'want', 'need',
      'have', 'has', 'had', 'get', 'got', 'know', 'think', 'just', 'like',
      'cái', 'của', 'và', 'là', 'có', 'cho', 'với', 'trong', 'được', 'không',
      'mình', 'bạn', 'tôi', 'này', 'đó', 'nào', 'gì', 'ở', 'đã', 'sẽ',
      'hãy', 'xem', 'giúp', 'làm', 'thế', 'như']);

    const words = message
      .replace(/[^\w\s\-_.]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

    if (words.length === 0) return null;

    // Take top 5 most "interesting" words (longer words, technical terms)
    const scored = words.map(w => ({
      word: w,
      score: w.length + (w.includes('_') ? 3 : 0) + (w.includes('.') ? 2 : 0) + (/[A-Z]/.test(w) ? 1 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, 5).map(s => s.word).join(' ');
  }

  /**
   * Estimate token count for history
   */
  _estimateHistoryChars() {
    let total = 0;
    for (const msg of this.history) {
      if (typeof msg.content === 'string') {
        total += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (typeof block === 'string') total += block.length;
          else if (block.text) total += block.text.length;
          else if (block.content) total += (typeof block.content === 'string' ? block.content.length : 200);
          else total += 200; // estimate for tool_use/tool_result blocks
        }
      }
    }
    return total;
  }

  /**
   * Prune conversation history to stay within token limits.
   * Keeps system messages and the most recent exchanges.
   */
  _pruneHistory() {
    if (this._estimateHistoryChars() <= MAX_HISTORY_CHARS) return;

    // Keep at minimum the last 4 messages (2 exchanges)
    const minKeep = 4;
    while (this.history.length > minKeep && this._estimateHistoryChars() > MAX_HISTORY_CHARS) {
      // Remove oldest pair (user + assistant) to maintain valid message ordering
      if (this.history.length >= 2 && this.history[0].role === 'user') {
        this.history.splice(0, 2);
      } else {
        this.history.shift();
      }
    }
    logger.debug(`History pruned to ${this.history.length} messages`);
  }

  /**
   * API call with exponential backoff retry
   */
  async _callAPI(params, maxRetries = 3) {
    let lastErr;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.messages.create(params);
      } catch (err) {
        lastErr = err;
        // Don't retry on auth errors or invalid requests
        if (err.status === 401 || err.status === 400 || err.status === 404) throw err;
        // Retry on rate limit (429), server errors (5xx), or network errors
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000);
        logger.warn(`API attempt ${attempt + 1}/${maxRetries} failed: ${err.message}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * Build API parameters, with optional extended thinking support
   */
  _buildAPIParams(currentSystem, toolDefs) {
    const params = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: currentSystem,
      messages: [...this.history],
      tools: toolDefs,
    };

    // Extended thinking support
    if (this.config.thinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(this.config.thinkingBudget || 10000, this.config.maxTokens - 1000),
      };
    }

    return params;
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async _executeToolsParallel(toolBlocks) {
    const results = await Promise.allSettled(
      toolBlocks.map(async (toolBlock) => {
        logger.info(`Tool call: ${toolBlock.name}`);
        this.emit('tool:start', { name: toolBlock.name, input: toolBlock.input });
        const result = await this.tools.execute(toolBlock.name, toolBlock.input);
        this.emit('tool:end', { name: toolBlock.name, result });
        return { toolBlock, result };
      })
    );

    const toolResults = [];
    const toolResultContents = [];

    for (const entry of results) {
      if (entry.status === 'fulfilled') {
        const { toolBlock, result } = entry.value;
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        toolResults.push({ name: toolBlock.name, input: toolBlock.input, output: result });
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: resultStr.slice(0, 50000),
        });
      } else {
        // Handle failed tool execution
        const toolBlock = toolBlocks[results.indexOf(entry)];
        const errMsg = entry.reason?.message || 'Tool execution failed';
        logger.error(`Tool ${toolBlock.name} failed:`, errMsg);
        toolResults.push({ name: toolBlock.name, input: toolBlock.input, output: { error: errMsg } });
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify({ error: errMsg }),
          is_error: true,
        });
      }
    }

    return { toolResults, toolResultContents };
  }

  /**
   * Send a message and get a response (with tool use loop)
   */
  async chat(userMessage, opts = {}) {
    const { channel = 'cli', userId = 'local' } = opts;

    // Add user message to history
    this.history.push({ role: 'user', content: userMessage });
    this._pruneHistory();

    // Auto-extract memories from user message
    await this.memory.extractFromMessage(userMessage);

    // Auto-search knowledge base for relevant context
    let knowledgeContext = '';
    if (this.knowledge) {
      const searchTerms = this._extractSearchTerms(userMessage);
      if (searchTerms) {
        knowledgeContext = this.knowledge.searchForContext(searchTerms, {
          maxResults: 3,
          maxChars: 4000,
        });
      }
    }

    // Build fresh system prompt with current memory + knowledge
    const currentSystem = this._buildSystemPrompt(knowledgeContext);

    // Build API request
    const toolDefs = this.tools.getToolDefinitions();
    const maxIterations = 10;
    let iterations = 0;
    let response;
    let toolResults = [];

    this.emit('chat:start', { userMessage, channel });

    // Agentic loop: keep going while Claude wants to use tools
    while (iterations < maxIterations) {
      iterations++;

      try {
        const apiParams = this._buildAPIParams(currentSystem, toolDefs);
        response = await this._callAPI(apiParams);
      } catch (err) {
        logger.error('API error:', err.message);
        const errorText = `Sorry, I encountered an API error: ${err.message}`;
        this.history.push({ role: 'assistant', content: errorText });
        this.emit('chat:error', { error: err });
        return { text: errorText, toolResults: [] };
      }

      // Process response content blocks
      const textBlocks = [];
      const toolUseBlocks = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text);
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push(block);
        }
      }

      // If no tool use, we're done
      if (toolUseBlocks.length === 0) {
        const finalText = textBlocks.join('\n');
        this.history.push({ role: 'assistant', content: response.content });

        // Save to memory
        await this.memory.saveMessage(this.conversationId, {
          role: 'user',
          content: userMessage,
        });
        await this.memory.saveMessage(this.conversationId, {
          role: 'assistant',
          content: finalText,
        });
        await this.memory.saveConversation(
          this.conversationId,
          channel,
          this.history
        );

        this.emit('chat:done', { text: finalText, toolResults });
        return { text: finalText, toolResults, stopReason: response.stop_reason };
      }

      // Execute tools in parallel
      this.history.push({ role: 'assistant', content: response.content });

      const { toolResults: newResults, toolResultContents } =
        await this._executeToolsParallel(toolUseBlocks);
      toolResults.push(...newResults);

      this.history.push({ role: 'user', content: toolResultContents });
      this._pruneHistory();

      // Continue the loop to let Claude process tool results
      if (response.stop_reason !== 'tool_use') {
        break;
      }
    }

    // If we hit max iterations
    if (iterations >= maxIterations) {
      logger.warn('Max tool iterations reached');
    }

    const finalText = response?.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n') || 'I completed the task.';

    this.emit('chat:done', { text: finalText, toolResults });
    return { text: finalText, toolResults };
  }

  /**
   * Stream a response (for real-time display)
   */
  async chatStream(userMessage, onChunk, opts = {}) {
    this.history.push({ role: 'user', content: userMessage });
    this._pruneHistory();
    await this.memory.extractFromMessage(userMessage);

    // Auto-search knowledge base
    let knowledgeContext = '';
    if (this.knowledge) {
      const searchTerms = this._extractSearchTerms(userMessage);
      if (searchTerms) {
        knowledgeContext = this.knowledge.searchForContext(searchTerms, {
          maxResults: 3,
          maxChars: 4000,
        });
      }
    }

    const currentSystem = this._buildSystemPrompt(knowledgeContext);
    const toolDefs = this.tools.getToolDefinitions();
    let fullText = '';
    let toolResults = [];
    let maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      try {
        const apiParams = this._buildAPIParams(currentSystem, toolDefs);
        // Remove messages copy for streaming — use direct ref
        apiParams.messages = [...this.history];

        const stream = this.client.messages.stream(apiParams);

        let currentToolUse = null;
        let currentToolInput = '';
        const toolUseBlocks = [];
        let streamedText = '';

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: '',
              };
              currentToolInput = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              streamedText += event.delta.text;
              onChunk({ type: 'text', text: event.delta.text });
            } else if (event.delta.type === 'input_json_delta') {
              if (currentToolUse) {
                currentToolInput += event.delta.partial_json;
              }
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              try {
                currentToolUse.input = JSON.parse(currentToolInput);
              } catch {
                currentToolUse.input = {};
              }
              toolUseBlocks.push(currentToolUse);
              currentToolUse = null;
              currentToolInput = '';
            }
          }
        }

        const finalMessage = await stream.finalMessage();
        fullText += streamedText;

        // If no tool use, we're done
        if (toolUseBlocks.length === 0) {
          this.history.push({ role: 'assistant', content: finalMessage.content });
          return { text: fullText, toolResults };
        }

        // Execute tools in parallel
        this.history.push({ role: 'assistant', content: finalMessage.content });

        // Notify all tool starts first
        for (const toolBlock of toolUseBlocks) {
          onChunk({ type: 'tool_start', name: toolBlock.name });
        }

        const { toolResults: newResults, toolResultContents } =
          await this._executeToolsParallel(toolUseBlocks);
        toolResults.push(...newResults);

        // Notify tool ends
        for (const r of newResults) {
          onChunk({ type: 'tool_end', name: r.name, result: r.output });
        }

        this.history.push({ role: 'user', content: toolResultContents });
        this._pruneHistory();

        if (finalMessage.stop_reason !== 'tool_use') break;

      } catch (err) {
        logger.error('Stream error:', err.message);
        onChunk({ type: 'error', error: err.message });
        return { text: fullText || `Error: ${err.message}`, toolResults };
      }
    }

    return { text: fullText, toolResults };
  }

  clearHistory() {
    this.history = [];
    this.conversationId = uuid();
    this.emit('history:cleared');
  }

  getSkills() {
    return this.skills;
  }

  async getMemories(opts) {
    return this.memory.getMemories(opts);
  }

  /**
   * Reload skills at runtime (hot-reload)
   */
  async reloadSkills() {
    const loader = new SkillLoader(this.config.root);
    this.skills = await loader.loadAll();
    this._skillPromptCache = loader.buildSkillPrompt(this.skills);
    this.emit('skills:reloaded', { count: this.skills.length });
    logger.info(`Skills reloaded: ${this.skills.length}`);
  }

  close() {
    this.memory?.close();
    this.removeAllListeners();
  }
}

export { Agent };
export default Agent;
