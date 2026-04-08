/**
 * ✦ Aether — Task Scheduler
 * Cron-like scheduling for background agents. Zero external dependencies.
 *
 * Supports: "* * * * *" (min hour dom month dow)
 * Plus shortcuts: @hourly, @daily, @weekly, @monthly
 * Plus intervals: "every 5m", "every 2h", "every 30s"
 */

import { logger } from '../utils/logger.js';
import { uuid } from '../utils/helpers.js';

/**
 * Parse a cron field (supports *, N, N-M, * /N, N,M,...)
 */
function parseCronField(field, min, max) {
  if (field === '*') return null; // matches all

  const values = new Set();

  for (const part of field.split(',')) {
    // Step: */N or N-M/S
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr);
      let start = min, end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          [start, end] = range.split('-').map(Number);
        } else {
          start = parseInt(range);
        }
      }
      for (let i = start; i <= end; i += step) values.add(i);
    }
    // Range: N-M
    else if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      for (let i = s; i <= e; i++) values.add(i);
    }
    // Single value
    else {
      values.add(parseInt(part));
    }
  }

  return values;
}

/**
 * Parse a cron expression into a matcher
 */
function parseCron(expression) {
  const shortcuts = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
  };

  const expr = shortcuts[expression.toLowerCase()] || expression;
  const parts = expr.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${expression}" (expected 5 fields: min hour dom month dow)`);
  }

  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

/**
 * Check if a date matches a cron schedule
 */
function matchesCron(schedule, date) {
  const checks = [
    [schedule.minute, date.getMinutes()],
    [schedule.hour, date.getHours()],
    [schedule.dayOfMonth, date.getDate()],
    [schedule.month, date.getMonth() + 1],
    [schedule.dayOfWeek, date.getDay()],
  ];

  return checks.every(([allowed, value]) => {
    if (allowed === null) return true; // * matches all
    return allowed.has(value);
  });
}

/**
 * Parse interval strings: "5m", "2h", "30s", "1d"
 */
function parseInterval(str) {
  const match = str.match(/^(?:every\s+)?(\d+)\s*(s|sec|m|min|h|hr|hour|d|day)s?$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000, sec: 1000,
    m: 60000, min: 60000,
    h: 3600000, hr: 3600000, hour: 3600000,
    d: 86400000, day: 86400000,
  };

  return value * (multipliers[unit] || 60000);
}

/**
 * Scheduled task definition
 */
class ScheduledTask {
  constructor({ id, name, schedule, task, notify, enabled = true }) {
    this.id = id || uuid();
    this.name = name;
    this.schedule = schedule;     // Cron expression or interval string
    this.task = task;             // Task prompt for Claude
    this.notify = notify || [];
    this.enabled = enabled;
    this.lastRun = null;
    this.nextRun = null;
    this.runCount = 0;
    this.createdAt = new Date();

    // Parse schedule
    this._intervalMs = parseInterval(schedule);
    this._cronSchedule = this._intervalMs ? null : parseCron(schedule);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      schedule: this.schedule,
      task: this.task,
      enabled: this.enabled,
      lastRun: this.lastRun?.toISOString() || null,
      nextRun: this.nextRun?.toISOString() || null,
      runCount: this.runCount,
      type: this._intervalMs ? 'interval' : 'cron',
    };
  }
}

class Scheduler {
  constructor(agentRunner) {
    this.agentRunner = agentRunner;
    this.tasks = new Map();
    this._ticker = null;
    this._running = false;
  }

  /**
   * Start the scheduler tick loop (checks every 30 seconds)
   */
  start() {
    if (this._running) return;
    this._running = true;

    this._ticker = setInterval(() => {
      this._tick();
    }, 30000); // Check every 30 seconds
    this._ticker.unref?.();

    logger.info('Scheduler started');
  }

  /**
   * Check all tasks and run due ones
   */
  _tick() {
    const now = new Date();

    for (const [id, task] of this.tasks) {
      if (!task.enabled) continue;

      let shouldRun = false;

      if (task._intervalMs) {
        // Interval-based: check if enough time has passed
        if (!task.lastRun || (now.getTime() - task.lastRun.getTime()) >= task._intervalMs) {
          shouldRun = true;
        }
      } else if (task._cronSchedule) {
        // Cron-based: check if current minute matches
        if (matchesCron(task._cronSchedule, now)) {
          // Avoid running multiple times in the same minute
          if (!task.lastRun || (now.getTime() - task.lastRun.getTime()) > 55000) {
            shouldRun = true;
          }
        }
      }

      if (shouldRun) {
        task.lastRun = now;
        task.runCount++;
        logger.info(`Scheduler: running task "${task.name}" (${task.schedule})`);

        // Spawn a one-shot background agent for this task
        this.agentRunner.spawn({
          name: `[scheduled] ${task.name}`,
          task: task.task,
          maxRuns: 1,
          notify: task.notify,
          immediate: true,
        });
      }
    }
  }

  /**
   * Add a scheduled task
   */
  add({ name, schedule, task, notify, enabled }) {
    const scheduledTask = new ScheduledTask({ name, schedule, task, notify, enabled });
    this.tasks.set(scheduledTask.id, scheduledTask);
    logger.info(`Scheduled task added: "${name}" (${schedule})`);
    return scheduledTask;
  }

  /**
   * Remove a scheduled task
   */
  remove(id) {
    return this.tasks.delete(id);
  }

  /**
   * Enable/disable a task
   */
  toggle(id) {
    const task = this.tasks.get(id);
    if (!task) return null;
    task.enabled = !task.enabled;
    return task;
  }

  /**
   * List all scheduled tasks
   */
  list() {
    return [...this.tasks.values()].map(t => t.toJSON());
  }

  /**
   * Get a specific task
   */
  get(id) {
    const task = this.tasks.get(id);
    return task ? task.toJSON() : null;
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this._running = false;
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
    logger.info('Scheduler stopped');
  }
}

export { Scheduler, parseCron, parseInterval, matchesCron };
export default Scheduler;
