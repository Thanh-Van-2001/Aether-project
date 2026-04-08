/**
 * ✦ Aether — Gateway Server
 * HTTP + WebSocket server with rate limiting, security headers, input validation
 */

import express from 'express';
import { createServer } from 'http';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { Agent } from './agent.js';
import { ChannelManager } from './channels/manager.js';
import { BackgroundAgentRunner, Scheduler, Watcher, PipelineEngine } from './agents/index.js';
import { KnowledgeBase } from './knowledge/index.js';
import { logger } from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Rate Limiter (in-memory, no deps) ───
class RateLimiter {
  constructor({ windowMs = 60000, max = 30 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
    // Cleanup stale entries every minute
    this._cleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.hits) {
        if (now - entry.start > this.windowMs) this.hits.delete(key);
      }
    }, 60000);
    this._cleanup.unref?.();
  }

  check(key) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.start > this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: this.max - 1 };
    }
    entry.count++;
    if (entry.count > this.max) {
      return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.start + this.windowMs - now) / 1000) };
    }
    return { allowed: true, remaining: this.max - entry.count };
  }

  middleware(opts = {}) {
    const keyFn = opts.keyFn || ((req) => req.ip || req.socket.remoteAddress || 'unknown');
    return (req, res, next) => {
      const key = keyFn(req);
      const result = this.check(key);
      res.setHeader('X-RateLimit-Limit', this.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter);
        return res.status(429).json({ error: 'Too many requests', retryAfter: result.retryAfter });
      }
      next();
    };
  }
}

// ─── Input validation ───
function validateChatInput(req, res, next) {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (typeof message !== 'string') return res.status(400).json({ error: 'message must be a string' });
  if (message.length > 100000) return res.status(400).json({ error: 'message too long (max 100000 chars)' });
  if (message.trim().length === 0) return res.status(400).json({ error: 'message cannot be empty' });
  next();
}

function validateMemoryInput(req, res, next) {
  const { content, type } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  if (content.length > 10000) return res.status(400).json({ error: 'content too long (max 10000 chars)' });
  const validTypes = ['fact', 'preference', 'identity', 'project', 'context', 'work', 'location', 'language'];
  if (type && !validTypes.includes(type)) return res.status(400).json({ error: `invalid type. Must be one of: ${validTypes.join(', ')}` });
  next();
}

export async function startGateway() {
  const config = loadConfig();

  if (!config.apiKey) {
    logger.error('No Anthropic API key found. Run: aether onboard');
    process.exit(1);
  }

  // Initialize agent
  const agent = new Agent(config);
  await agent.init();

  // Initialize autonomous agent system
  const agentRunner = new BackgroundAgentRunner(agent, config);
  const scheduler = new Scheduler(agentRunner);
  const watcher = new Watcher(agentRunner, config);
  const pipelineEngine = new PipelineEngine(agent, agentRunner, config);

  // Register agent tools so Claude can spawn/manage background agents
  agent.tools.registerAgentTools(agentRunner, scheduler, watcher, pipelineEngine);

  // Initialize knowledge base (local RAG)
  const knowledgeBase = new KnowledgeBase(config);
  await knowledgeBase.init();
  agent.tools.registerKnowledgeTools(knowledgeBase);
  agent.knowledge = knowledgeBase; // Enable auto-search in chat

  // Load workflow pipelines from workspace
  await pipelineEngine.loadAll();

  // Start scheduler
  scheduler.start();

  // Forward agent results to channels
  agentRunner.on('agent:result', (result) => {
    logger.info(`[BG Agent] ${result.agentName}: ${result.text?.slice(0, 100)}`);
    // Broadcast to WebSocket clients
    agent.emit('agent:result', result);
  });

  // Create Express app
  const app = express();

  // ─── Security headers ───
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Only set CSP for HTML responses
    if (req.path === '/' || req.path.endsWith('.html')) {
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:;"
      );
    }
    next();
  });

  // Body parser with size limit
  app.use(express.json({ limit: '1mb' }));

  // ─── CORS ───
  app.use((req, res, next) => {
    const origin = config.gateway.corsOrigin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ─── Rate limiters ───
  const chatLimiter = new RateLimiter({ windowMs: 60000, max: 20 });  // 20 chats/min
  const apiLimiter = new RateLimiter({ windowMs: 60000, max: 60 });   // 60 req/min general

  // ─── Auth middleware ───
  function authMiddleware(req, res, next) {
    if (!config.gateway.secret) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== config.gateway.secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  // ─── Static files (Web UI) ───
  const webDir = resolve(ROOT, 'web');
  app.use('/static', express.static(webDir, { maxAge: '1d' }));

  app.get('/', (req, res) => {
    const indexPath = resolve(webDir, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.json({
        name: 'Aether',
        version: '1.0.0',
        status: 'running',
        emoji: '✦',
      });
    }
  });

  // ─── API Routes ───

  // Health check (no auth, no rate limit)
  app.get('/api/health', (req, res) => {
    const stats = agent.memory?.memory?.store?.getStats?.() || {};
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      model: config.model,
      memory: config.memory.enabled,
      stats,
    });
  });

  // Chat (non-streaming)
  app.post('/api/chat', authMiddleware, chatLimiter.middleware(), validateChatInput, async (req, res) => {
    const { message, channel = 'api' } = req.body;

    try {
      const response = await agent.chat(message, { channel });
      res.json({
        text: response.text,
        toolResults: response.toolResults?.map(t => ({
          name: t.name,
          input: t.input,
        })),
      });
    } catch (err) {
      logger.error('API chat error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Chat (streaming via SSE)
  app.post('/api/chat/stream', authMiddleware, chatLimiter.middleware(), validateChatInput, async (req, res) => {
    const { message, channel = 'api' } = req.body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Handle client disconnect
    let aborted = false;
    req.on('close', () => { aborted = true; });

    try {
      await agent.chatStream(
        message,
        (chunk) => {
          if (!aborted) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        },
        { channel }
      );
      if (!aborted) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    } catch (err) {
      if (!aborted) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      }
    }
    res.end();
  });

  // Skills
  app.get('/api/skills', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const skills = agent.getSkills();
    res.json({
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        description: s.description,
        enabled: s.enabled,
        category: s.category,
      })),
    });
  });

  app.post('/api/skills/:id/toggle', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const skillId = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(skillId)) return res.status(400).json({ error: 'Invalid skill ID' });
    const skills = agent.getSkills();
    const skill = skills.find(s => s.id === skillId);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    skill.enabled = !skill.enabled;
    res.json({ id: skill.id, enabled: skill.enabled });
  });

  // Skill hot-reload
  app.post('/api/skills/reload', authMiddleware, apiLimiter.middleware(), async (req, res) => {
    await agent.reloadSkills();
    const skills = agent.getSkills();
    res.json({ reloaded: true, count: skills.length });
  });

  // Memory
  app.get('/api/memory', authMiddleware, apiLimiter.middleware(), async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const memories = await agent.getMemories({
      type: req.query.type,
      search: req.query.search,
      limit,
    });
    res.json({ memories });
  });

  app.post('/api/memory', authMiddleware, apiLimiter.middleware(), validateMemoryInput, async (req, res) => {
    const { content, type = 'fact' } = req.body;
    const id = await agent.memory.addMemory(content, { type, source: 'api' });
    res.json({ id, content, type });
  });

  app.delete('/api/memory/:id', authMiddleware, apiLimiter.middleware(), async (req, res) => {
    const memId = req.params.id;
    if (!/^[a-f0-9-]{36}$/.test(memId)) return res.status(400).json({ error: 'Invalid memory ID' });
    await agent.memory.deleteMemory(memId);
    res.json({ deleted: true });
  });

  // Conversations
  app.get('/api/conversations', authMiddleware, apiLimiter.middleware(), async (req, res) => {
    const convs = await agent.memory?.store?.getConversations() || [];
    res.json({ conversations: convs });
  });

  // Clear
  app.post('/api/clear', authMiddleware, apiLimiter.middleware(), (req, res) => {
    agent.clearHistory();
    res.json({ cleared: true });
  });

  // Config (safe subset)
  app.get('/api/config', authMiddleware, apiLimiter.middleware(), (req, res) => {
    res.json({
      model: config.model,
      maxTokens: config.maxTokens,
      sandbox: config.sandbox,
      memory: config.memory.enabled,
      thinking: config.thinking || false,
      channels: Object.entries(config.channels).map(([name, ch]) => ({
        name,
        enabled: ch.enabled,
      })),
    });
  });

  // ─── Agent API Routes ───

  // List background agents
  app.get('/api/agents', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const agents = agentRunner.list({ state: req.query.state });
    res.json({ agents });
  });

  // Get agent details
  app.get('/api/agents/:id', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const ag = agentRunner.get(req.params.id);
    if (!ag) return res.status(404).json({ error: 'Agent not found' });
    res.json(ag);
  });

  // Get agent results
  app.get('/api/agents/:id/results', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const results = agentRunner.getResults(req.params.id, {
      limit: Math.min(parseInt(req.query.limit) || 10, 50),
    });
    if (!results) return res.status(404).json({ error: 'Agent not found' });
    res.json({ results });
  });

  // Spawn a background agent
  app.post('/api/agents', authMiddleware, chatLimiter.middleware(), (req, res) => {
    const { name, task, interval, maxRuns, notify } = req.body;
    if (!task) return res.status(400).json({ error: 'task is required' });
    if (typeof task !== 'string') return res.status(400).json({ error: 'task must be a string' });

    try {
      const ag = agentRunner.spawn({
        name: name || 'API Agent',
        task,
        interval: interval ? parseIntervalStr(interval) : null,
        maxRuns: maxRuns || (interval ? Infinity : 1),
        notify: notify || [],
      });
      res.json({ agent: ag.toJSON() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Pause/resume/stop an agent
  app.post('/api/agents/:id/pause', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const ok = agentRunner.pause(req.params.id);
    res.json({ success: ok });
  });

  app.post('/api/agents/:id/resume', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const ok = agentRunner.resume(req.params.id);
    res.json({ success: ok });
  });

  app.delete('/api/agents/:id', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const ok = agentRunner.remove(req.params.id);
    res.json({ success: ok });
  });

  // ─── Schedule API Routes ───
  app.get('/api/schedules', authMiddleware, apiLimiter.middleware(), (req, res) => {
    res.json({ tasks: scheduler.list() });
  });

  app.post('/api/schedules', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const { name, schedule, task, notify } = req.body;
    if (!name || !schedule || !task) {
      return res.status(400).json({ error: 'name, schedule, and task are required' });
    }
    try {
      const t = scheduler.add({ name, schedule, task, notify });
      res.json({ task: t.toJSON() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/schedules/:id', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const ok = scheduler.remove(req.params.id);
    res.json({ success: ok });
  });

  // ─── Watch API Routes ───
  app.get('/api/watches', authMiddleware, apiLimiter.middleware(), (req, res) => {
    res.json({ watches: watcher.list() });
  });

  app.post('/api/watches', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const { name, path: watchPath, pattern, task, debounce, notify } = req.body;
    if (!name || !task) return res.status(400).json({ error: 'name and task are required' });
    try {
      const rule = watcher.addFileWatch({
        name, path: watchPath, pattern, task,
        debounceMs: debounce ? debounce * 1000 : 5000,
        notify,
      });
      res.json({ watch: rule.toJSON() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/watches/:id', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const ok = watcher.remove(req.params.id);
    res.json({ success: ok });
  });

  // ─── Pipeline API Routes ───
  app.get('/api/pipelines', authMiddleware, apiLimiter.middleware(), (req, res) => {
    res.json({ pipelines: pipelineEngine.list() });
  });

  app.post('/api/pipelines/:id/run', authMiddleware, chatLimiter.middleware(), async (req, res) => {
    try {
      const run = await pipelineEngine.execute(req.params.id, req.body.variables || {});
      res.json(run);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Interval string parser for API
  function parseIntervalStr(str) {
    const match = str.match(/^(\d+)\s*(s|m|h|d)/i);
    if (!match) return 60000;
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    return val * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] || 60000);
  }

  // ─── Knowledge Base API Routes ───

  app.get('/api/knowledge/status', authMiddleware, apiLimiter.middleware(), (req, res) => {
    res.json(knowledgeBase.getStats());
  });

  app.get('/api/knowledge/search', authMiddleware, apiLimiter.middleware(), (req, res) => {
    const query = req.query.q || req.query.query;
    if (!query) return res.status(400).json({ error: 'q parameter is required' });
    const results = knowledgeBase.search(query, {
      limit: Math.min(parseInt(req.query.limit) || 10, 50),
      extension: req.query.type,
      pathPrefix: req.query.path,
    });
    res.json({ query, count: results.length, results });
  });

  app.get('/api/knowledge/files', authMiddleware, apiLimiter.middleware(), (req, res) => {
    if (req.query.pattern) {
      const files = knowledgeBase.findFiles(req.query.pattern, { limit: parseInt(req.query.limit) || 20 });
      res.json({ files });
    } else {
      const files = knowledgeBase.store?.getIndexedFiles({ limit: parseInt(req.query.limit) || 100 }) || [];
      res.json({ files });
    }
  });

  app.post('/api/knowledge/index', authMiddleware, chatLimiter.middleware(), async (req, res) => {
    const { directory, clear } = req.body;
    try {
      const result = await knowledgeBase.indexDirectory(directory || config.workspace, { clear: clear || false });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/knowledge/clear', authMiddleware, apiLimiter.middleware(), (req, res) => {
    knowledgeBase.clearIndex();
    res.json({ cleared: true });
  });

  // ─── 404 handler ───
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ─── Error handler ───
  app.use((err, req, res, _next) => {
    logger.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ─── Start server ───
  const httpServer = createServer(app);

  // Initialize channels (including WebSocket)
  const channelManager = new ChannelManager(config, agent);
  await channelManager.init(httpServer);

  const { host, port } = config.gateway;
  httpServer.listen(port, host, () => {
    const pipelineCount = pipelineEngine.list().length;
    logger.info(`\n✦ Aether Gateway running at http://${host}:${port}`);
    logger.info(`   Web UI:     http://${host}:${port}`);
    logger.info(`   API:        http://${host}:${port}/api`);
    logger.info(`   WebSocket:  ws://${host}:${port}/ws`);
    logger.info(`   Model:      ${config.model}`);
    logger.info(`   Sandbox:    ${config.sandbox ? 'ON' : 'OFF'}`);
    logger.info(`   Thinking:   ${config.thinking ? 'ON' : 'OFF'}`);
    const kbStats = knowledgeBase.getStats();
    logger.info(`   Tools:      ${agent.tools.getToolDefinitions().length} (core + agents + knowledge)`);
    logger.info(`   Workflows:  ${pipelineCount} loaded`);
    logger.info(`   Knowledge:  ${kbStats.totalFiles || 0} files indexed (${kbStats.totalChunks || 0} chunks)`);
    logger.info(`   Scheduler:  active\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('\n✦ Shutting down...');
    scheduler.stop();
    watcher.shutdown();
    await agentRunner.shutdown();
    pipelineEngine.shutdown();
    knowledgeBase.close();
    await channelManager.shutdown();
    agent.close();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { app, httpServer, agent, channelManager, agentRunner, scheduler, watcher, pipelineEngine, knowledgeBase };
}

export default startGateway;
