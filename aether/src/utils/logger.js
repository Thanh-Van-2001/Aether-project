/**
 * ✦ Aether — Logger
 */

import chalk from 'chalk';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor(opts = {}) {
    this.level = LEVELS[opts.level || process.env.LOG_LEVEL || 'info'] ?? 1;
    this.logFile = opts.logFile || process.env.LOG_FILE || '';
    this.prefix = opts.prefix || '✦';

    if (this.logFile) {
      try {
        mkdirSync(dirname(this.logFile), { recursive: true });
      } catch {}
    }
  }

  _log(level, color, ...args) {
    if (LEVELS[level] < this.level) return;
    const ts = new Date().toISOString().slice(11, 19);
    const tag = color(`[${ts}] ${this.prefix} ${level.toUpperCase()}`);
    console.log(tag, ...args);

    if (this.logFile) {
      try {
        const line = `[${ts}] ${level.toUpperCase()} ${args.map(a =>
          typeof a === 'string' ? a : JSON.stringify(a)
        ).join(' ')}\n`;
        appendFileSync(this.logFile, line);
      } catch {}
    }
  }

  debug(...args) { this._log('debug', chalk.gray, ...args); }
  info(...args) { this._log('info', chalk.blue, ...args); }
  warn(...args) { this._log('warn', chalk.yellow, ...args); }
  error(...args) { this._log('error', chalk.red, ...args); }

  child(prefix) {
    return new Logger({ level: Object.keys(LEVELS)[this.level], logFile: this.logFile, prefix });
  }
}

export const logger = new Logger();
export default Logger;
