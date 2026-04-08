/**
 * ✦ Aether — Configuration Loader
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load .env
dotenvConfig({ path: resolve(ROOT, '.env') });

export function loadConfig() {
  // Base config from env
  const config = {
    // API
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AETHER_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env.AETHER_MAX_TOKENS) || 4096,
    thinking: process.env.AETHER_THINKING === 'true',
    thinkingBudget: parseInt(process.env.AETHER_THINKING_BUDGET) || 10000,

    // Gateway
    gateway: {
      port: parseInt(process.env.GATEWAY_PORT) || 18789,
      host: process.env.GATEWAY_HOST || '127.0.0.1',
      secret: process.env.AETHER_SECRET || '',
      corsOrigin: process.env.CORS_ORIGIN || '*',
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 20,
    },

    // Channels
    channels: {
      telegram: {
        enabled: !!process.env.TELEGRAM_BOT_TOKEN,
        token: process.env.TELEGRAM_BOT_TOKEN || '',
        allowedUsers: (process.env.TELEGRAM_ALLOWED_USERS || '')
          .split(',')
          .filter(Boolean)
          .map(s => s.trim()),
      },
      discord: {
        enabled: !!process.env.DISCORD_BOT_TOKEN,
        token: process.env.DISCORD_BOT_TOKEN || '',
        allowedUsers: (process.env.DISCORD_ALLOWED_USERS || '')
          .split(',')
          .filter(Boolean)
          .map(s => s.trim()),
      },
      webchat: {
        enabled: true,
      },
    },

    // Security
    sandbox: process.env.SANDBOX_MODE !== 'false',
    allowedDirs: (process.env.ALLOWED_DIRS || '')
      .split(',')
      .filter(Boolean)
      .map(s => s.trim()),

    // Memory
    memory: {
      enabled: process.env.MEMORY_ENABLED !== 'false',
      dbPath: process.env.MEMORY_DB_PATH || resolve(ROOT, 'workspace/memory/aether.db'),
    },

    // Knowledge Base (local RAG)
    knowledge: {
      enabled: process.env.KNOWLEDGE_ENABLED !== 'false',
      dbPath: process.env.KNOWLEDGE_DB_PATH || resolve(ROOT, 'workspace/knowledge/aether-kb.db'),
      dirs: (process.env.KNOWLEDGE_DIRS || '').split(',').filter(Boolean).map(s => s.trim()),
    },

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || '',

    // Paths
    root: ROOT,
    workspace: resolve(ROOT, 'workspace'),
    skillsDir: resolve(ROOT, 'workspace/skills'),
    builtinSkillsDir: resolve(ROOT, 'src/skills/builtin'),
  };

  // Override from aether.yaml if exists
  const yamlPath = resolve(ROOT, 'aether.yaml');
  if (existsSync(yamlPath)) {
    try {
      const yamlConfig = YAML.parse(readFileSync(yamlPath, 'utf-8'));
      deepMerge(config, yamlConfig);
    } catch (e) {
      // Ignore yaml parse errors
    }
  }

  return config;
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export default loadConfig;
