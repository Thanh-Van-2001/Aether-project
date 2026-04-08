/**
 * ✦ Aether — WebChat Channel
 * WebSocket-based real-time chat for the built-in web UI
 */

import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';
import { uuid } from '../utils/helpers.js';

class WebChatChannel {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
    this.wss = null;
    this.clients = new Map(); // ws -> { id, authenticated }
  }

  async init(httpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
    });

    // Listen for background agent results and forward to all clients
    this.agent.on('agent:result', (result) => {
      for (const [ws, client] of this.clients) {
        if (client.authenticated) {
          this._send(ws, {
            type: 'agent_result',
            agentId: result.agentId,
            agentName: result.agentName,
            text: result.text,
            timestamp: result.timestamp,
          });
        }
      }
    });

    this.wss.on('connection', (ws, req) => {
      const clientId = uuid();
      this.clients.set(ws, { id: clientId, authenticated: !this.config.gateway.secret });
      logger.debug(`WebChat: client connected (${clientId})`);

      ws.on('message', async (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          await this._handleMessage(ws, data);
        } catch (err) {
          this._send(ws, { type: 'error', message: 'Invalid message format' });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.debug(`WebChat: client disconnected (${clientId})`);
      });

      // Send welcome
      this._send(ws, {
        type: 'connected',
        clientId,
        needsAuth: !!this.config.gateway.secret,
      });
    });

    logger.debug('WebChat WebSocket server ready');
  }

  async _handleMessage(ws, data) {
    const client = this.clients.get(ws);

    // Authentication
    if (data.type === 'auth') {
      if (!this.config.gateway.secret || data.secret === this.config.gateway.secret) {
        client.authenticated = true;
        this._send(ws, { type: 'auth_ok' });
      } else {
        this._send(ws, { type: 'auth_fail' });
      }
      return;
    }

    // Check auth
    if (!client.authenticated) {
      this._send(ws, { type: 'error', message: 'Not authenticated' });
      return;
    }

    // Chat message
    if (data.type === 'message') {
      const text = data.text?.trim();
      if (!text) return;

      // Handle commands
      if (text === '/skills') {
        const skills = this.agent.getSkills();
        this._send(ws, {
          type: 'skills',
          skills: skills.map(s => ({
            id: s.id,
            name: s.name,
            icon: s.icon,
            description: s.description,
            enabled: s.enabled,
            category: s.category,
          })),
        });
        return;
      }

      if (text === '/memory') {
        const memories = await this.agent.getMemories({ limit: 20 });
        this._send(ws, { type: 'memories', memories });
        return;
      }

      if (text === '/clear') {
        this.agent.clearHistory();
        this._send(ws, { type: 'cleared' });
        return;
      }

      // Stream response
      this._send(ws, { type: 'thinking' });

      try {
        const response = await this.agent.chatStream(
          text,
          (chunk) => {
            if (chunk.type === 'text') {
              this._send(ws, { type: 'chunk', text: chunk.text });
            } else if (chunk.type === 'tool_start') {
              this._send(ws, { type: 'tool_start', name: chunk.name });
            } else if (chunk.type === 'tool_end') {
              this._send(ws, { type: 'tool_end', name: chunk.name, result: chunk.result });
            } else if (chunk.type === 'error') {
              this._send(ws, { type: 'error', message: chunk.error });
            }
          },
          { channel: 'webchat', userId: client.id }
        );

        this._send(ws, {
          type: 'done',
          toolResults: response.toolResults?.map(t => ({
            name: t.name,
            input: t.input,
          })),
        });
      } catch (err) {
        logger.error('WebChat response error:', err.message);
        this._send(ws, { type: 'error', message: err.message });
      }
      return;
    }

    // Skill toggle
    if (data.type === 'toggle_skill') {
      const skills = this.agent.getSkills();
      const skill = skills.find(s => s.id === data.skillId);
      if (skill) {
        skill.enabled = !skill.enabled;
        this._send(ws, {
          type: 'skill_toggled',
          skillId: data.skillId,
          enabled: skill.enabled,
        });
      }
      return;
    }

    // Memory operations
    if (data.type === 'add_memory') {
      await this.agent.memory.addMemory(data.content, {
        type: data.memoryType || 'fact',
        source: 'webchat',
      });
      this._send(ws, { type: 'memory_added', content: data.content });
      return;
    }

    if (data.type === 'delete_memory') {
      await this.agent.memory.deleteMemory(data.memoryId);
      this._send(ws, { type: 'memory_deleted', memoryId: data.memoryId });
      return;
    }

    // Agent commands via chat
    if (data.type === 'message' && data.text?.startsWith('/agents')) {
      // Forward agent info — Claude handles the rest via tools
      return;
    }
  }

  _send(ws, data) {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify(data));
    }
  }

  async send(clientId, message) {
    for (const [ws, client] of this.clients) {
      if (client.id === clientId) {
        this._send(ws, { type: 'message', text: message });
        return;
      }
    }
  }

  async shutdown() {
    if (this.wss) {
      this.wss.close();
    }
  }
}

export { WebChatChannel };
export default WebChatChannel;
