# Channels Guide

## Overview

Channels are how you interact with Aether. Each channel is a messaging platform adapter that routes messages to and from the Agent core.

## Available Channels

### Web Chat (Built-in)

**Always enabled.** Opens at `http://localhost:18789` when the gateway is running.

Features:
- Real-time streaming via WebSocket
- Tool execution indicators
- Markdown rendering
- Skills and memory management

### Telegram

**Setup:**

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Add to your `.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_USERS=your_user_id
```

**Finding your User ID:** Message [@userinfobot](https://t.me/userinfobot)

**Bot Commands:**
- `/start` — Initialize bot
- `/help` — Show available commands
- `/skills` — List active skills
- `/memory` — Show stored memories
- `/clear` — Clear conversation history
- Any other text — Chat with Aether

**Security:**
- Set `TELEGRAM_ALLOWED_USERS` to restrict access
- Comma-separated user IDs
- Leave empty to allow all users (not recommended)

### Discord

**Setup:**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** → Create a Bot
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Copy the bot token
6. Generate an invite URL under **OAuth2 > URL Generator**:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Read Message History`
7. Add to your `.env`:

```env
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_ALLOWED_USERS=your_user_id
```

**How to interact:**
- **DMs:** Just send a message directly to the bot
- **Servers:** Mention `@Aether` or use `!aether` prefix

**Commands:**
- `skills` / `/skills` — List active skills
- `clear history` / `/clear` — Clear conversation

### REST API

The HTTP API is always available when the gateway runs.

```bash
# Non-streaming
curl -X POST http://localhost:18789/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'

# Streaming (SSE)
curl -N -X POST http://localhost:18789/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me a story"}'
```

If `AETHER_SECRET` is set, include auth:
```bash
curl -H "Authorization: Bearer your-secret" ...
```

### WebSocket

Connect to `ws://localhost:18789/ws` for real-time bidirectional communication.

**Messages (client → server):**
```json
{ "type": "auth", "secret": "..." }
{ "type": "message", "text": "Hello" }
{ "type": "toggle_skill", "skillId": "web-search" }
{ "type": "add_memory", "content": "...", "memoryType": "fact" }
{ "type": "delete_memory", "memoryId": "..." }
```

**Messages (server → client):**
```json
{ "type": "connected", "clientId": "...", "needsAuth": false }
{ "type": "thinking" }
{ "type": "chunk", "text": "partial response..." }
{ "type": "tool_start", "name": "shell_exec" }
{ "type": "tool_end", "name": "shell_exec", "result": {...} }
{ "type": "done" }
{ "type": "error", "message": "..." }
```

## Adding New Channels

To add a new channel (e.g., Slack, WhatsApp), create a file in `src/channels/`:

```javascript
// src/channels/slack.js

class SlackChannel {
  constructor(config, agent) {
    this.config = config;
    this.agent = agent;
  }

  async init() {
    // Set up the Slack client/bot
  }

  async _handleMessage(msg) {
    // Parse incoming message
    const text = msg.text;
    
    // Send to agent
    const response = await this.agent.chat(text, {
      channel: 'slack',
      userId: msg.user,
    });

    // Send response back
    await this.send(msg.channel, response.text);
  }

  async send(channelId, message) {
    // Send a message to a Slack channel
  }

  async shutdown() {
    // Clean up
  }
}

export { SlackChannel };
```

Then register it in `src/channels/manager.js`.
