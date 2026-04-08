/**
 * ✦ Aether — Event Watcher
 * Monitors filesystem changes, git events, and custom triggers.
 * Spawns background agents when events match configured patterns.
 */

import { watch } from 'fs';
import { resolve, relative, extname } from 'path';
import { existsSync, statSync } from 'fs';
import { logger } from '../utils/logger.js';
import { uuid } from '../utils/helpers.js';

/**
 * A watch rule that triggers an agent when conditions are met
 */
class WatchRule {
  constructor({ id, name, type, pattern, path, task, debounceMs, notify, enabled = true }) {
    this.id = id || uuid();
    this.name = name;
    this.type = type;         // 'file', 'git', 'custom'
    this.pattern = pattern;   // Glob or regex for matching
    this.path = path;         // Directory to watch
    this.task = task;         // Prompt for Claude when triggered
    this.debounceMs = debounceMs || 5000; // Debounce rapid changes
    this.notify = notify || [];
    this.enabled = enabled;
    this.triggerCount = 0;
    this.lastTriggered = null;
    this.createdAt = new Date();
    this._watcher = null;
    this._debounceTimer = null;
    this._pendingChanges = [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      pattern: this.pattern,
      path: this.path,
      task: this.task,
      debounceMs: this.debounceMs,
      enabled: this.enabled,
      triggerCount: this.triggerCount,
      lastTriggered: this.lastTriggered?.toISOString() || null,
    };
  }
}

class Watcher {
  constructor(agentRunner, config) {
    this.agentRunner = agentRunner;
    this.config = config;
    this.rules = new Map();
    this._watchers = new Map(); // ruleId -> fs.FSWatcher or chokidar
  }

  /**
   * Add a file watch rule
   */
  addFileWatch({ name, path: watchPath, pattern, task, debounceMs, notify }) {
    const fullPath = resolve(this.config.workspace, watchPath || '.');

    if (!existsSync(fullPath)) {
      throw new Error(`Watch path does not exist: ${watchPath}`);
    }

    const rule = new WatchRule({
      name,
      type: 'file',
      pattern: pattern || '*',
      path: fullPath,
      task,
      debounceMs,
      notify,
    });

    this.rules.set(rule.id, rule);
    this._startFileWatch(rule);

    logger.info(`File watch added: "${name}" on ${watchPath}`);
    return rule;
  }

  /**
   * Start watching filesystem for a rule
   */
  _startFileWatch(rule) {
    try {
      // Use native fs.watch (recursive supported on Windows/macOS)
      const watcher = watch(rule.path, { recursive: true }, (eventType, filename) => {
        if (!rule.enabled || !filename) return;

        // Pattern matching
        if (rule.pattern !== '*') {
          const regex = this._globToRegex(rule.pattern);
          if (!regex.test(filename)) return;
        }

        // Skip hidden files, node_modules, .git
        if (filename.startsWith('.') || filename.includes('node_modules') || filename.includes('.git')) {
          return;
        }

        // Collect changes with debounce
        rule._pendingChanges.push({
          type: eventType,
          file: filename,
          timestamp: new Date().toISOString(),
        });

        // Debounce: wait for changes to settle before triggering
        if (rule._debounceTimer) clearTimeout(rule._debounceTimer);
        rule._debounceTimer = setTimeout(() => {
          this._triggerRule(rule);
        }, rule.debounceMs);
      });

      this._watchers.set(rule.id, watcher);
    } catch (err) {
      logger.error(`Failed to start file watch for "${rule.name}":`, err.message);
    }
  }

  /**
   * Trigger a rule — spawn a background agent with context about what changed
   */
  _triggerRule(rule) {
    const changes = [...rule._pendingChanges];
    rule._pendingChanges = [];
    rule.triggerCount++;
    rule.lastTriggered = new Date();

    // Build change summary for the agent
    const changeSummary = changes.map(c => `${c.type}: ${c.file}`).join('\n');
    const taskWithContext = `${rule.task}

## Changes detected:
${changeSummary}

## Watch info:
- Watch path: ${rule.path}
- Pattern: ${rule.pattern}
- Trigger #${rule.triggerCount}`;

    logger.info(`Watch "${rule.name}" triggered: ${changes.length} change(s)`);

    this.agentRunner.spawn({
      name: `[watch] ${rule.name}`,
      task: taskWithContext,
      maxRuns: 1,
      notify: rule.notify,
      immediate: true,
    });
  }

  /**
   * Convert a simple glob pattern to regex
   */
  _globToRegex(glob) {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(escaped, 'i');
  }

  /**
   * Add a git watch (polls git status periodically)
   */
  addGitWatch({ name, path: repoPath, task, interval = 60000, notify }) {
    const fullPath = resolve(this.config.workspace, repoPath || '.');

    const rule = new WatchRule({
      name,
      type: 'git',
      path: fullPath,
      task,
      debounceMs: interval,
      notify,
    });

    this.rules.set(rule.id, rule);

    // Poll git status at interval
    const timer = setInterval(async () => {
      if (!rule.enabled) return;

      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const { stdout } = await execAsync('git status --porcelain', {
          cwd: fullPath,
          timeout: 10000,
        });

        if (stdout.trim()) {
          rule._pendingChanges = stdout.trim().split('\n').map(line => ({
            type: line.slice(0, 2).trim(),
            file: line.slice(3),
            timestamp: new Date().toISOString(),
          }));
          this._triggerRule(rule);
        }
      } catch {
        // Not a git repo or git not available — skip silently
      }
    }, interval);
    timer.unref?.();

    this._watchers.set(rule.id, { close: () => clearInterval(timer) });
    logger.info(`Git watch added: "${name}" on ${repoPath || '.'}`);
    return rule;
  }

  /**
   * Remove a watch rule
   */
  remove(id) {
    const watcher = this._watchers.get(id);
    if (watcher) {
      watcher.close();
      this._watchers.delete(id);
    }
    const rule = this.rules.get(id);
    if (rule?._debounceTimer) clearTimeout(rule._debounceTimer);
    return this.rules.delete(id);
  }

  /**
   * Toggle a watch rule
   */
  toggle(id) {
    const rule = this.rules.get(id);
    if (!rule) return null;
    rule.enabled = !rule.enabled;
    return rule;
  }

  /**
   * List all watch rules
   */
  list() {
    return [...this.rules.values()].map(r => r.toJSON());
  }

  /**
   * Shutdown all watchers
   */
  shutdown() {
    for (const [id, watcher] of this._watchers) {
      watcher.close();
    }
    for (const [id, rule] of this.rules) {
      if (rule._debounceTimer) clearTimeout(rule._debounceTimer);
    }
    this._watchers.clear();
    this.rules.clear();
    logger.info('All watchers stopped');
  }
}

export { Watcher };
export default Watcher;
