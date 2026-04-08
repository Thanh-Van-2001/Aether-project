/**
 * ✦ Aether — Workflow Pipeline Engine
 * Chain multiple AI-powered steps together. Define in YAML, execute with Claude reasoning.
 *
 * Example workflow:
 *   name: morning-briefing
 *   trigger: cron("0 9 * * *")
 *   steps:
 *     - name: check-news
 *       action: web_fetch
 *       input: { url: "https://news.ycombinator.com" }
 *     - name: summarize
 *       action: llm
 *       prompt: "Summarize top 5 tech stories from: {{steps.check-news.output}}"
 *     - name: notify
 *       action: notify
 *       channel: telegram
 *       message: "{{steps.summarize.output}}"
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, basename, extname } from 'path';
import YAML from 'yaml';
import { logger } from '../utils/logger.js';
import { uuid } from '../utils/helpers.js';

// Pipeline step types
const STEP_TYPES = {
  LLM: 'llm',           // Send prompt to Claude
  TOOL: 'tool',          // Execute a tool directly
  NOTIFY: 'notify',      // Send notification to channel
  CONDITION: 'condition', // Conditional branching
  WAIT: 'wait',          // Wait/delay
};

class Pipeline {
  constructor({ id, name, description, trigger, steps, notify, variables }) {
    this.id = id || uuid();
    this.name = name;
    this.description = description || '';
    this.trigger = trigger;       // 'manual', cron expression, or event
    this.steps = steps || [];
    this.notify = notify || [];
    this.variables = variables || {};
    this.runs = [];
    this.createdAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      trigger: this.trigger,
      stepCount: this.steps.length,
      steps: this.steps.map(s => ({ name: s.name, action: s.action })),
      runCount: this.runs.length,
      lastRun: this.runs[this.runs.length - 1] || null,
    };
  }
}

class PipelineEngine {
  constructor(mainAgent, agentRunner, config) {
    this.mainAgent = mainAgent;
    this.agentRunner = agentRunner;
    this.config = config;
    this.pipelines = new Map();
    this.workflowDir = resolve(config.workspace, 'workflows');
  }

  /**
   * Load all workflow YAML files from workspace/workflows/
   */
  async loadAll() {
    if (!existsSync(this.workflowDir)) return [];

    const files = readdirSync(this.workflowDir)
      .filter(f => ['.yml', '.yaml'].includes(extname(f)));

    for (const file of files) {
      try {
        const content = readFileSync(resolve(this.workflowDir, file), 'utf-8');
        const def = YAML.parse(content);
        if (def && def.name && def.steps) {
          const pipeline = new Pipeline({
            name: def.name,
            description: def.description,
            trigger: def.trigger || 'manual',
            steps: def.steps,
            notify: def.notify,
            variables: def.variables,
          });
          this.pipelines.set(pipeline.id, pipeline);
          logger.debug(`Loaded workflow: ${def.name} (${file})`);
        }
      } catch (err) {
        logger.warn(`Failed to load workflow ${file}:`, err.message);
      }
    }

    logger.info(`Loaded ${this.pipelines.size} workflow(s)`);
    return this.list();
  }

  /**
   * Create a pipeline from definition
   */
  create(def) {
    const pipeline = new Pipeline(def);
    this.pipelines.set(pipeline.id, pipeline);
    return pipeline;
  }

  /**
   * Execute a pipeline
   */
  async execute(pipelineId, inputVars = {}) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

    const run = {
      id: uuid(),
      pipelineId,
      startedAt: new Date().toISOString(),
      status: 'running',
      stepResults: {},
      variables: { ...pipeline.variables, ...inputVars },
    };

    logger.info(`Pipeline "${pipeline.name}" started (run: ${run.id})`);

    try {
      for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];
        const stepName = step.name || `step_${i}`;

        logger.debug(`Pipeline step: ${stepName} (${step.action})`);

        let result;

        switch (step.action) {
          case STEP_TYPES.LLM:
            result = await this._executeLLMStep(step, run);
            break;

          case STEP_TYPES.TOOL:
          case 'web_fetch':
          case 'shell_exec':
          case 'file_read':
          case 'file_write':
          case 'file_list':
          case 'memory_search':
            result = await this._executeToolStep(step, run);
            break;

          case STEP_TYPES.NOTIFY:
            result = await this._executeNotifyStep(step, run);
            break;

          case STEP_TYPES.CONDITION:
            result = this._executeConditionStep(step, run);
            if (result.skip) {
              logger.debug(`Pipeline step ${stepName}: condition not met, skipping`);
              continue;
            }
            break;

          case STEP_TYPES.WAIT:
            await new Promise(r => setTimeout(r, step.duration || 1000));
            result = { waited: step.duration || 1000 };
            break;

          default:
            // Treat unknown actions as tool names
            result = await this._executeToolStep({ ...step, action: step.action }, run);
        }

        run.stepResults[stepName] = {
          action: step.action,
          output: result,
          completedAt: new Date().toISOString(),
        };
      }

      run.status = 'completed';
      run.completedAt = new Date().toISOString();

      // Send final notification if configured
      if (pipeline.notify?.length) {
        const summary = this._buildRunSummary(pipeline, run);
        for (const channel of pipeline.notify) {
          this.agentRunner.emit('agent:result', {
            agentId: run.id,
            agentName: `[pipeline] ${pipeline.name}`,
            text: summary,
            timestamp: run.completedAt,
            notify: [channel],
          });
        }
      }

    } catch (err) {
      run.status = 'failed';
      run.error = err.message;
      run.completedAt = new Date().toISOString();
      logger.error(`Pipeline "${pipeline.name}" failed:`, err.message);
    }

    // Store run history (keep last 20)
    pipeline.runs.push(run);
    if (pipeline.runs.length > 20) pipeline.runs = pipeline.runs.slice(-20);

    return run;
  }

  /**
   * Execute an LLM step — send prompt to Claude
   */
  async _executeLLMStep(step, run) {
    const prompt = this._interpolate(step.prompt || step.input, run);

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: this.config.apiKey });

    const response = await client.messages.create({
      model: step.model || this.config.model,
      max_tokens: step.maxTokens || 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }

  /**
   * Execute a tool step — run a tool directly
   */
  async _executeToolStep(step, run) {
    const toolName = step.tool || step.action;
    const input = {};

    // Interpolate input values
    if (step.input) {
      for (const [key, val] of Object.entries(step.input)) {
        input[key] = typeof val === 'string' ? this._interpolate(val, run) : val;
      }
    }

    return await this.mainAgent.tools.execute(toolName, input);
  }

  /**
   * Execute a notification step
   */
  async _executeNotifyStep(step, run) {
    const message = this._interpolate(step.message || '', run);
    const channel = step.channel || 'webchat';

    this.agentRunner.emit('agent:result', {
      agentId: run.id,
      agentName: `[pipeline] notification`,
      text: message,
      timestamp: new Date().toISOString(),
      notify: [channel],
    });

    return { sent: true, channel, messageLength: message.length };
  }

  /**
   * Execute a condition step — evaluate a simple condition
   */
  _executeConditionStep(step, run) {
    const value = this._interpolate(step.check || '', run);
    const condition = step.condition || 'not_empty';

    switch (condition) {
      case 'not_empty':
        return { skip: !value || value.trim() === '' };
      case 'empty':
        return { skip: value && value.trim() !== '' };
      case 'contains':
        return { skip: !value.includes(step.value || '') };
      case 'not_contains':
        return { skip: value.includes(step.value || '') };
      default:
        return { skip: false };
    }
  }

  /**
   * Interpolate template variables: {{steps.stepName.output}}, {{vars.key}}
   */
  _interpolate(template, run) {
    if (typeof template !== 'string') return template;

    return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
      const parts = path.split('.');

      if (parts[0] === 'steps' && parts.length >= 3) {
        const stepName = parts[1];
        const field = parts.slice(2).join('.');
        const stepResult = run.stepResults[stepName];
        if (!stepResult) return match;

        let value = stepResult.output;
        if (field !== 'output') {
          // Navigate nested object
          for (const key of parts.slice(2)) {
            if (value && typeof value === 'object') value = value[key];
            else break;
          }
        }
        return typeof value === 'string' ? value : JSON.stringify(value);
      }

      if (parts[0] === 'vars' && parts.length >= 2) {
        return run.variables[parts[1]] || match;
      }

      if (parts[0] === 'env' && parts.length >= 2) {
        return process.env[parts[1]] || match;
      }

      return match;
    });
  }

  /**
   * Build a human-readable summary of a pipeline run
   */
  _buildRunSummary(pipeline, run) {
    const stepSummaries = Object.entries(run.stepResults)
      .map(([name, r]) => {
        const output = typeof r.output === 'string'
          ? r.output.slice(0, 200)
          : JSON.stringify(r.output).slice(0, 200);
        return `- **${name}** (${r.action}): ${output}`;
      })
      .join('\n');

    return `**Pipeline: ${pipeline.name}**\nStatus: ${run.status}\n\n${stepSummaries}`;
  }

  // ─── Public API ───

  list() {
    return [...this.pipelines.values()].map(p => p.toJSON());
  }

  get(id) {
    const p = this.pipelines.get(id);
    return p ? p.toJSON() : null;
  }

  remove(id) {
    return this.pipelines.delete(id);
  }

  shutdown() {
    this.pipelines.clear();
  }
}

export { PipelineEngine, Pipeline };
export default PipelineEngine;
