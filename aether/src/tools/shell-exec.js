/**
 * ✦ Aether — Shell Execution Tool
 * Hardened sandbox with comprehensive command filtering
 */

import { exec } from 'child_process';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';

// Dangerous command patterns — regex-based for better coverage
const BLOCKED_PATTERNS = [
  // Destructive filesystem ops
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\//, // rm -rf /, rm -f /etc
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*\s+\//,     // rm -r /
  /mkfs/,
  /wipefs/,
  /shred\s/,
  // Fork bomb & resource exhaustion
  /:\(\)\s*\{/, // :(){ :|: & };:
  /fork\s*bomb/i,
  /while\s+true.*do/,
  // Disk/device operations
  /dd\s+if=\/dev/,
  /dd\s+of=\/dev/,
  // Permission escalation
  /chmod\s+(-R\s+)?[0-7]*7[0-7]*\s+\//,
  /chown\s+-R\s+.*\s+\//,
  /sudo\s+rm/,
  /sudo\s+chmod/,
  /sudo\s+chown/,
  // Network attacks
  /nc\s+-[a-z]*l/,    // netcat listen (reverse shell)
  /ncat\s+-[a-z]*l/,
  /curl\s+.*\|\s*(ba)?sh/,  // curl | bash
  /wget\s+.*\|\s*(ba)?sh/,  // wget | bash
  // Sensitive file access
  /\/etc\/shadow/,
  /\/etc\/passwd/,
  // Env/credential exfiltration
  /printenv.*\|.*(curl|wget|nc)/,
  /env\s*\|.*(curl|wget|nc)/,
  /cat\s+.*\.(env|pem|key|crt)/,
  // Crypto mining
  /xmrig/i,
  /minerd/i,
  /cryptonight/i,
  // System shutdown
  /shutdown\s/,
  /reboot/,
  /init\s+0/,
  /halt/,
  /poweroff/,
];

// Sensitive environment variables to strip
const SENSITIVE_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'DISCORD_BOT_TOKEN',
  'AETHER_SECRET',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
  'DATABASE_URL',
  'REDIS_URL',
];

class ShellExecTool {
  constructor(config) {
    this.config = config;
    this.sandbox = config.sandbox;
    this.workDir = resolve(config.workspace);
  }

  _isSafe(command) {
    const normalized = command.toLowerCase().trim();
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command) || pattern.test(normalized)) {
        return { safe: false, pattern: pattern.source };
      }
    }
    return { safe: true };
  }

  _buildSafeEnv() {
    const env = { ...process.env };
    if (this.sandbox) {
      for (const key of SENSITIVE_ENV_KEYS) {
        delete env[key];
      }
      // Also strip any key containing SECRET, TOKEN, PASSWORD, KEY (except PATH)
      for (const key of Object.keys(env)) {
        if (/SECRET|TOKEN|PASSWORD|PRIVATE.?KEY|API.?KEY/i.test(key) && key !== 'PATH') {
          delete env[key];
        }
      }
    }
    return env;
  }

  async execute(toolName, input) {
    const { command, language = 'bash', timeout = 30000 } = input;

    if (!command) return { error: 'No command provided' };
    if (command.length > 10000) return { error: 'Command too long (max 10000 chars)' };

    // Sandbox checks
    if (this.sandbox) {
      const check = this._isSafe(command);
      if (!check.safe) {
        logger.warn(`Blocked dangerous command: ${command.slice(0, 100)}`);
        return { error: `Blocked: dangerous command pattern detected` };
      }
    }

    let cmd;
    switch (language) {
      case 'node':
        cmd = `node -e ${JSON.stringify(command)}`;
        break;
      case 'python':
        cmd = `python3 -c ${JSON.stringify(command)}`;
        break;
      default:
        cmd = command;
    }

    const env = this._buildSafeEnv();

    return new Promise((resolve) => {
      exec(cmd, {
        timeout: Math.min(timeout, 60000), // cap at 60s
        cwd: this.workDir,
        maxBuffer: 1024 * 1024, // 1MB
        env,
      }, (error, stdout, stderr) => {
        if (error && error.killed) {
          resolve({ error: `Command timed out after ${timeout}ms`, stdout: stdout?.slice(0, 5000) || '' });
          return;
        }

        const result = {
          stdout: stdout?.slice(0, 10000) || '',
          stderr: stderr?.slice(0, 5000) || '',
          exitCode: error ? error.code || 1 : 0,
        };

        if (error && !stdout) {
          result.error = error.message;
        }

        resolve(result);
      });
    });
  }
}

export { ShellExecTool };
export default ShellExecTool;
