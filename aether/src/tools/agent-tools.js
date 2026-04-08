/**
 * ✦ Aether — Agent Tools (for Claude tool use)
 * Allows Claude to spawn, manage, and query background agents,
 * scheduled tasks, file watchers, and workflow pipelines.
 */

import { logger } from '../utils/logger.js';

class AgentTools {
  constructor(agentRunner, scheduler, watcher, pipelineEngine) {
    this.runner = agentRunner;
    this.scheduler = scheduler;
    this.watcher = watcher;
    this.pipeline = pipelineEngine;
  }

  async execute(toolName, input) {
    switch (toolName) {
      // ─── Background Agents ───
      case 'agent_spawn': {
        const agent = this.runner.spawn({
          name: input.name || 'Background Task',
          task: input.task,
          interval: input.interval ? this._parseInterval(input.interval) : null,
          maxRuns: input.max_runs || (input.interval ? Infinity : 1),
          notify: input.notify || [],
        });
        return {
          success: true,
          agent: agent.toJSON(),
          message: `Background agent "${agent.name}" spawned (${agent.id})`,
        };
      }

      case 'agent_list': {
        const agents = this.runner.list({ state: input.state });
        return {
          count: agents.length,
          agents: agents.map(a => ({
            id: a.id,
            name: a.name,
            state: a.state,
            runCount: a.runCount,
            lastResult: a.lastResult?.text?.slice(0, 200) || null,
          })),
        };
      }

      case 'agent_results': {
        const results = this.runner.getResults(input.agent_id, { limit: input.limit || 5 });
        if (!results) return { error: 'Agent not found' };
        return { agent_id: input.agent_id, results };
      }

      case 'agent_stop': {
        const stopped = this.runner.stop(input.agent_id);
        return { success: stopped, message: stopped ? 'Agent stopped' : 'Agent not found' };
      }

      // ─── Scheduled Tasks ───
      case 'schedule_add': {
        const task = this.scheduler.add({
          name: input.name,
          schedule: input.schedule,
          task: input.task,
          notify: input.notify || [],
        });
        return {
          success: true,
          task: task.toJSON(),
          message: `Scheduled task "${input.name}" added (${input.schedule})`,
        };
      }

      case 'schedule_list': {
        return { tasks: this.scheduler.list() };
      }

      case 'schedule_remove': {
        const removed = this.scheduler.remove(input.task_id);
        return { success: removed };
      }

      // ─── File Watchers ───
      case 'watch_add': {
        const rule = this.watcher.addFileWatch({
          name: input.name,
          path: input.path || '.',
          pattern: input.pattern || '*',
          task: input.task,
          debounceMs: input.debounce ? input.debounce * 1000 : 5000,
          notify: input.notify || [],
        });
        return {
          success: true,
          watch: rule.toJSON(),
          message: `File watch "${input.name}" added on ${input.path || '.'}`,
        };
      }

      case 'watch_list': {
        return { watches: this.watcher.list() };
      }

      case 'watch_remove': {
        const removed = this.watcher.remove(input.watch_id);
        return { success: removed };
      }

      // ─── Pipelines ───
      case 'pipeline_list': {
        return { pipelines: this.pipeline.list() };
      }

      case 'pipeline_run': {
        const run = await this.pipeline.execute(input.pipeline_id, input.variables || {});
        return {
          run_id: run.id,
          status: run.status,
          stepResults: Object.keys(run.stepResults),
          error: run.error || null,
        };
      }

      default:
        return { error: `Unknown agent operation: ${toolName}` };
    }
  }

  _parseInterval(str) {
    const match = str.match(/^(\d+)\s*(s|m|h|d)/i);
    if (!match) return 60000;
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return val * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] || 60000);
  }

  /**
   * Tool definitions for Anthropic API
   */
  static getToolDefinitions() {
    return [
      {
        name: 'agent_spawn',
        description: 'Spawn a background agent that runs autonomously. Use for monitoring, scheduled checks, or long-running tasks. The agent will execute independently and report results.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Human-readable name for the agent' },
            task: { type: 'string', description: 'Detailed task description/prompt for the agent' },
            interval: { type: 'string', description: 'Repeat interval (e.g., "5m", "1h", "30s"). Omit for one-shot tasks.' },
            max_runs: { type: 'number', description: 'Maximum number of runs (default: 1 for one-shot, unlimited for interval)' },
            notify: {
              type: 'array',
              items: { type: 'string' },
              description: 'Channels to notify with results: "webchat", "telegram", "discord"',
            },
          },
          required: ['task'],
        },
      },
      {
        name: 'agent_list',
        description: 'List all background agents and their current status.',
        input_schema: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['running', 'paused', 'completed', 'failed', 'stopped'],
              description: 'Filter by state (optional)',
            },
          },
        },
      },
      {
        name: 'agent_results',
        description: 'Get the results/output from a background agent.',
        input_schema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'Agent ID' },
            limit: { type: 'number', description: 'Number of results to return (default: 5)' },
          },
          required: ['agent_id'],
        },
      },
      {
        name: 'agent_stop',
        description: 'Stop a running background agent.',
        input_schema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'Agent ID to stop' },
          },
          required: ['agent_id'],
        },
      },
      {
        name: 'schedule_add',
        description: 'Add a scheduled recurring task. Supports cron expressions ("0 9 * * *") and intervals ("every 5m"). The task will be executed by a background agent on schedule.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Task name' },
            schedule: { type: 'string', description: 'Cron expression (e.g., "0 9 * * *" for 9am daily) or interval (e.g., "every 30m")' },
            task: { type: 'string', description: 'Task description/prompt for the agent' },
            notify: {
              type: 'array',
              items: { type: 'string' },
              description: 'Channels to notify',
            },
          },
          required: ['name', 'schedule', 'task'],
        },
      },
      {
        name: 'schedule_list',
        description: 'List all scheduled tasks.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'schedule_remove',
        description: 'Remove a scheduled task.',
        input_schema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Scheduled task ID to remove' },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'watch_add',
        description: 'Watch a directory for file changes. When changes are detected, a background agent is spawned to analyze them. Useful for monitoring logs, config files, or project files.',
        input_schema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Watch name' },
            path: { type: 'string', description: 'Directory path to watch (relative to workspace)' },
            pattern: { type: 'string', description: 'File pattern to match (e.g., "*.log", "*.json"). Default: all files.' },
            task: { type: 'string', description: 'Task for the agent when changes are detected' },
            debounce: { type: 'number', description: 'Debounce time in seconds (default: 5)' },
            notify: {
              type: 'array',
              items: { type: 'string' },
              description: 'Channels to notify',
            },
          },
          required: ['name', 'task'],
        },
      },
      {
        name: 'watch_list',
        description: 'List all active file watchers.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'watch_remove',
        description: 'Remove a file watcher.',
        input_schema: {
          type: 'object',
          properties: {
            watch_id: { type: 'string', description: 'Watch rule ID to remove' },
          },
          required: ['watch_id'],
        },
      },
      {
        name: 'pipeline_list',
        description: 'List all available workflow pipelines.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'pipeline_run',
        description: 'Execute a workflow pipeline by ID.',
        input_schema: {
          type: 'object',
          properties: {
            pipeline_id: { type: 'string', description: 'Pipeline ID to run' },
            variables: { type: 'object', description: 'Input variables for the pipeline' },
          },
          required: ['pipeline_id'],
        },
      },
    ];
  }
}

export { AgentTools };
export default AgentTools;
