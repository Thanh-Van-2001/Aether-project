/**
 * ✦ Aether — Background Agent Runner
 * Core lifecycle manager for autonomous background agents.
 * Agents run independently, execute tasks, and push results to channels.
 */

import { EventEmitter } from 'events';
import { uuid } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

// Agent states
const STATE = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped',
};

const MAX_CONCURRENT_AGENTS = 10;
const MAX_RESULTS_PER_AGENT = 100;

class BackgroundAgent {
  constructor({ id, name, task, config, interval, maxRuns, notify }) {
    this.id = id || uuid();
    this.name = name || 'Unnamed Agent';
    this.task = task;           // The instruction/prompt for Claude
    this.config = config;       // App config (model, apiKey, etc.)
    this.interval = interval;   // Repeat interval in ms (null = one-shot)
    this.maxRuns = maxRuns || Infinity;
    this.notify = notify || []; // Channels to notify: ['webchat', 'telegram']
    this.state = STATE.PENDING;
    this.results = [];
    this.runCount = 0;
    this.errors = [];
    this.createdAt = new Date();
    this.lastRunAt = null;
    this._timer = null;
    this._abortController = null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      task: this.task,
      state: this.state,
      interval: this.interval,
      maxRuns: this.maxRuns === Infinity ? null : this.maxRuns,
      runCount: this.runCount,
      resultCount: this.results.length,
      lastResult: this.results[this.results.length - 1] || null,
      errors: this.errors.slice(-5),
      createdAt: this.createdAt.toISOString(),
      lastRunAt: this.lastRunAt?.toISOString() || null,
      notify: this.notify,
    };
  }
}

class BackgroundAgentRunner extends EventEmitter {
  constructor(mainAgent, config) {
    super();
    this.mainAgent = mainAgent; // The main Agent instance (for Claude API access)
    this.config = config;
    this.agents = new Map();    // id -> BackgroundAgent
  }

  /**
   * Spawn a new background agent
   */
  spawn({ name, task, interval, maxRuns, notify, immediate = true }) {
    if (this.agents.size >= MAX_CONCURRENT_AGENTS) {
      throw new Error(`Max concurrent agents reached (${MAX_CONCURRENT_AGENTS})`);
    }

    const agent = new BackgroundAgent({
      name,
      task,
      config: this.config,
      interval,
      maxRuns,
      notify,
    });

    this.agents.set(agent.id, agent);
    logger.info(`Background agent spawned: ${agent.name} (${agent.id})`);
    this.emit('agent:spawned', agent.toJSON());

    if (immediate) {
      this._startAgent(agent);
    }

    return agent;
  }

  /**
   * Start running an agent
   */
  _startAgent(agent) {
    agent.state = STATE.RUNNING;
    this.emit('agent:started', agent.toJSON());

    // Run immediately first time
    this._executeAgent(agent);

    // Set up interval if recurring
    if (agent.interval && agent.interval > 0) {
      agent._timer = setInterval(() => {
        if (agent.state === STATE.RUNNING) {
          this._executeAgent(agent);
        }
      }, agent.interval);
      agent._timer.unref?.();
    }
  }

  /**
   * Execute one run of a background agent
   */
  async _executeAgent(agent) {
    if (agent.state !== STATE.RUNNING) return;
    if (agent.runCount >= agent.maxRuns) {
      this._completeAgent(agent, 'Max runs reached');
      return;
    }

    agent.lastRunAt = new Date();
    agent.runCount++;

    try {
      // Create a fresh, isolated chat context for this agent run
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: this.config.apiKey });

      const systemPrompt = `You are an autonomous Aether background agent.
Your task: ${agent.task}

You are running autonomously in the background. Be concise and report only important findings.
Current time: ${new Date().toISOString()}
Run #${agent.runCount}${agent.maxRuns !== Infinity ? ` of ${agent.maxRuns}` : ''}`;

      // Get tool definitions from main agent
      const toolDefs = this.mainAgent.tools?.getToolDefinitions() || [];

      const messages = [
        { role: 'user', content: `Execute your task now. Report your findings concisely.` },
      ];

      // Agentic loop (simplified, max 5 iterations for background agents)
      let response;
      let finalText = '';
      let iterations = 0;
      const maxIterations = 5;

      while (iterations < maxIterations) {
        iterations++;

        response = await client.messages.create({
          model: this.config.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
          tools: toolDefs,
        });

        const textBlocks = response.content.filter(b => b.type === 'text').map(b => b.text);
        const toolBlocks = response.content.filter(b => b.type === 'tool_use');

        if (toolBlocks.length === 0) {
          finalText = textBlocks.join('\n');
          break;
        }

        // Execute tools
        messages.push({ role: 'assistant', content: response.content });

        const toolResultContents = [];
        for (const toolBlock of toolBlocks) {
          const result = await this.mainAgent.tools.execute(toolBlock.name, toolBlock.input);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          toolResultContents.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: resultStr.slice(0, 20000),
          });
        }

        messages.push({ role: 'user', content: toolResultContents });

        if (response.stop_reason !== 'tool_use') {
          finalText = textBlocks.join('\n');
          break;
        }
      }

      // Store result
      const result = {
        runNumber: agent.runCount,
        text: finalText,
        timestamp: new Date().toISOString(),
        toolsUsed: iterations > 1,
      };

      agent.results.push(result);

      // Cap stored results
      if (agent.results.length > MAX_RESULTS_PER_AGENT) {
        agent.results = agent.results.slice(-MAX_RESULTS_PER_AGENT);
      }

      logger.info(`Agent ${agent.name} run #${agent.runCount}: ${finalText.slice(0, 100)}`);
      this.emit('agent:result', { agentId: agent.id, ...result, agentName: agent.name });

      // Check if done (one-shot)
      if (!agent.interval || agent.runCount >= agent.maxRuns) {
        this._completeAgent(agent, 'Task completed');
      }

    } catch (err) {
      agent.errors.push({ message: err.message, timestamp: new Date().toISOString() });
      logger.error(`Agent ${agent.name} error:`, err.message);
      this.emit('agent:error', { agentId: agent.id, error: err.message, agentName: agent.name });

      // Stop after 3 consecutive errors
      if (agent.errors.length >= 3) {
        const recent = agent.errors.slice(-3);
        const allRecent = recent.every(e =>
          Date.now() - new Date(e.timestamp).getTime() < agent.interval * 3
        );
        if (allRecent) {
          agent.state = STATE.FAILED;
          this._stopTimer(agent);
          this.emit('agent:failed', { agentId: agent.id, reason: 'Too many consecutive errors' });
        }
      }
    }
  }

  _completeAgent(agent, reason) {
    agent.state = STATE.COMPLETED;
    this._stopTimer(agent);
    logger.info(`Agent ${agent.name} completed: ${reason}`);
    this.emit('agent:completed', { agentId: agent.id, reason, agentName: agent.name });
  }

  _stopTimer(agent) {
    if (agent._timer) {
      clearInterval(agent._timer);
      agent._timer = null;
    }
  }

  // ─── Public API ───

  /**
   * List all agents
   */
  list({ state } = {}) {
    const agents = [...this.agents.values()];
    if (state) return agents.filter(a => a.state === state).map(a => a.toJSON());
    return agents.map(a => a.toJSON());
  }

  /**
   * Get a specific agent
   */
  get(id) {
    const agent = this.agents.get(id);
    return agent ? agent.toJSON() : null;
  }

  /**
   * Get agent results
   */
  getResults(id, { limit = 10 } = {}) {
    const agent = this.agents.get(id);
    if (!agent) return null;
    return agent.results.slice(-limit);
  }

  /**
   * Pause an agent
   */
  pause(id) {
    const agent = this.agents.get(id);
    if (!agent || agent.state !== STATE.RUNNING) return false;
    agent.state = STATE.PAUSED;
    this.emit('agent:paused', { agentId: id });
    return true;
  }

  /**
   * Resume a paused agent
   */
  resume(id) {
    const agent = this.agents.get(id);
    if (!agent || agent.state !== STATE.PAUSED) return false;
    agent.state = STATE.RUNNING;
    this.emit('agent:resumed', { agentId: id });
    return true;
  }

  /**
   * Stop and remove an agent
   */
  stop(id) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.state = STATE.STOPPED;
    this._stopTimer(agent);
    this.emit('agent:stopped', { agentId: id, agentName: agent.name });
    return true;
  }

  /**
   * Remove a stopped/completed/failed agent from the list
   */
  remove(id) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    if (agent.state === STATE.RUNNING || agent.state === STATE.PAUSED) {
      this.stop(id);
    }
    this.agents.delete(id);
    return true;
  }

  /**
   * Shutdown all agents
   */
  async shutdown() {
    for (const [id, agent] of this.agents) {
      this._stopTimer(agent);
      agent.state = STATE.STOPPED;
    }
    this.agents.clear();
    this.removeAllListeners();
    logger.info('All background agents stopped');
  }
}

export { BackgroundAgentRunner, STATE };
export default BackgroundAgentRunner;
