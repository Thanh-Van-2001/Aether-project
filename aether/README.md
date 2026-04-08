<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/dizzy-symbol_1f4ab.png" width="80" alt="Aether Logo" />
</p>

<h1 align="center">Aether</h1>

<p align="center">
  <strong>Your personal AI assistant powered by Claude. Connects everything. The fifth element of AI. ✦</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#skills-system">Skills</a> •
  <a href="#channels">Channels</a> •
  <a href="#api-reference">API</a> •
  <a href="#configuration-reference">Config</a> •
  <a href="#faq">FAQ</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  <img src="https://img.shields.io/badge/powered%20by-Claude-orange" alt="Claude" />
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## What is Aether?

Aether is an open-source personal AI assistant inspired by [OpenClaw](https://openclaw.ai/), built from the ground up for deep integration with Anthropic's Claude API. Unlike OpenClaw which supports multiple LLM providers, Aether is purpose-built for Claude — leveraging its tool use, streaming, extended thinking, and agentic capabilities to the fullest.

It runs **100% locally** on your machine. Your API key, your data, your conversations — nothing leaves your device except API calls to Anthropic.

### Aether vs OpenClaw

| Feature | Aether | OpenClaw |
|---------|--------|----------|
| LLM Provider | Claude only (optimized) | Multi-provider (Claude, GPT, DeepSeek, local) |
| Tool Use | Native Claude tool_use API | Custom tool abstraction layer |
| Streaming | Native streaming + SSE | Custom streaming |
| Skills Format | SKILL.md (compatible) | SKILL.md (original) |
| Memory | SQLite + auto-extraction | File-based + dreaming |
| Setup Complexity | Simple (`npm install` + `onboard`) | More complex (gateway daemon, services) |
| Focus | Claude-first, simple, hackable | Platform-agnostic, feature-rich |

**Choose Aether if:** You use Claude exclusively and want a simpler, Claude-optimized setup.
**Choose OpenClaw if:** You need multi-provider support, advanced plugin ecosystem, or the full OpenClaw community.

---

## Features

### 🧠 Claude-Native Agent

- Full **tool use** with Claude's native `tool_use` API — no abstraction layers
- **Agentic loops** — Claude can call multiple tools in sequence, inspect results, and continue reasoning (up to 10 iterations per turn)
- **Streaming** responses via WebSocket and Server-Sent Events
- Automatic **system prompt construction** from skills + memories

### 💬 Multi-Channel Messaging

Chat with Aether from anywhere:

- **Web UI** — Built-in chat interface at `http://localhost:18789`
- **Telegram** — Full bot with commands, typing indicators, message splitting
- **Discord** — DM or mention in servers, with `!aether` prefix support
- **REST API** — Programmatic access with streaming support
- **WebSocket** — Real-time bidirectional protocol for custom integrations
- **CLI** — Interactive REPL or one-shot messages

### 🔧 Skills System

- **SKILL.md format** — Compatible with OpenClaw's skill format
- **5 built-in skills** — Web Search, Code Execution, File Manager, Summarizer, Translator
- **Custom skills** — Drop a folder in `workspace/skills/` and it's loaded automatically
- **Hot-override** — Workspace skills override built-in skills with the same ID
- **Per-skill toggle** — Enable/disable skills via CLI, API, or chat

### 🧠 Persistent Memory

- **SQLite-backed** with automatic JSON fallback
- **Auto-extraction** — Detects patterns like "My name is...", "I work at...", "I prefer..."
- **Agent-accessible** — Claude can store and search memories via tools during conversations
- **CRUD API** — Full Create/Read/Update/Delete via REST API
- **Importance ranking** — Memories are ranked and the most relevant ones go into context

### ⚡ Tool Execution

Claude can use these tools during conversations:

| Tool | Description | Sandbox-Safe |
|------|-------------|:---:|
| `shell_exec` | Execute bash, Node.js, or Python code | ✅ |
| `file_read` | Read file contents | ✅ |
| `file_write` | Write/create files | ✅ |
| `file_list` | List directory contents | ✅ |
| `web_fetch` | Fetch web page content | ✅ |
| `memory_add` | Store a memory/fact | ✅ |
| `memory_search` | Search stored memories | ✅ |
| `memory_list` | List all memories | ✅ |

### 🔒 Security

- **Sandbox mode** — Blocks dangerous shell commands, strips sensitive env vars
- **User allowlists** — Restrict Telegram/Discord access by user ID
- **API authentication** — Bearer token for gateway API
- **Local binding** — Gateway binds to `127.0.0.1` by default
- **Path restrictions** — File operations restricted to workspace directory

---

## Quick Start

### Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | >= 20.0.0 | [Download](https://nodejs.org/) |
| npm | >= 9.0.0 | Comes with Node.js |
| Anthropic API Key | — | [Get one](https://console.anthropic.com/) |

### 1. Clone and Install

```bash
git clone https://github.com/your-username/aether.git
cd aether
npm install
```

### 2. Setup

Run the interactive wizard:

```bash
node bin/aether.js onboard
```

This will ask for your API key, preferred model, channels to enable, and security settings. It generates a `.env` file and creates the workspace directories.

**Or configure manually:**

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Verify

```bash
node bin/aether.js doctor
```

Expected output:
```
  ✓ Node.js version: v22.x.x
  ✓ .env file: Found
  ✓ Anthropic API key: sk-ant-xxxxx...
  ✓ Claude API connection: Model: claude-sonnet-4-20250514
  ✓ Skills loaded: 5 skills found
  ✓ Workspace directory: Found

  All checks passed! ✦
```

### 4. Run

**Option A — Gateway (recommended)**

Starts everything: Web UI, REST API, WebSocket, Telegram, Discord.

```bash
node bin/aether.js gateway --verbose
```

Open `http://localhost:18789` in your browser.

**Option B — Interactive CLI Chat**

```bash
node bin/aether.js chat
```

**Option C — One-shot Message**

```bash
node bin/aether.js agent --message "Explain quantum computing in 3 sentences"
```

### 5. Install Globally (optional)

```bash
npm install -g .
aether gateway --verbose
```

### Docker (optional)

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 18789
CMD ["node", "bin/aether.js", "gateway"]
```

```bash
docker build -t aether .
docker run -p 18789:18789 --env-file .env aether
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Gateway                              │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  REST API   │  │  WebSocket  │  │  Static File Server  │ │
│  │  /api/*     │  │  /ws        │  │  / (Web UI)          │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────────────────┘ │
│         │                │                                    │
│  ┌──────┴────────────────┴──────────────────────────────┐   │
│  │                Channel Manager                        │   │
│  │                                                       │   │
│  │  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │   │
│  │  │ Telegram  │  │  Discord  │  │    WebChat (WS)  │ │   │
│  │  │   Bot     │  │    Bot    │  │   Real-time chat │ │   │
│  │  └─────┬─────┘  └─────┬─────┘  └────────┬─────────┘ │   │
│  └────────┴───────────────┴─────────────────┴────────────┘   │
│                           │                                    │
│  ┌────────────────────────┴──────────────────────────────┐   │
│  │                    Agent Core                          │   │
│  │                                                        │   │
│  │  ┌──────────────┐                                     │   │
│  │  │  Claude API   │◄── Agentic Loop:                   │   │
│  │  │  (Anthropic)  │    1. User message                 │   │
│  │  └──────┬───────┘    2. Claude responds / calls tools │   │
│  │         │             3. Execute tools                 │   │
│  │         │             4. Send results back to Claude   │   │
│  │         │             5. Repeat until done (max 10)    │   │
│  │         │                                              │   │
│  │  ┌──────┴───────┐  ┌────────────┐  ┌──────────────┐  │   │
│  │  │ Skill Loader │  │  Memory    │  │    Tool      │  │   │
│  │  │              │  │  Manager   │  │  Registry    │  │   │
│  │  │ • Builtin    │  │            │  │              │  │   │
│  │  │ • Workspace  │  │ • SQLite   │  │ • shell_exec │  │   │
│  │  │ • SKILL.md   │  │ • Auto-    │  │ • file_ops   │  │   │
│  │  │   parser     │  │   extract  │  │ • web_fetch  │  │   │
│  │  │              │  │ • Context  │  │ • memory_*   │  │   │
│  │  │              │  │   builder  │  │              │  │   │
│  │  └──────────────┘  └────────────┘  └──────────────┘  │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

Filesystem:
  workspace/
  ├── memory/aether.db    ← SQLite database (persistent)
  ├── skills/             ← User custom skills (SKILL.md)
  └── logs/               ← Log files
```

### Request Flow

```
User types "What files are in my project?"
  │
  ├─► Channel receives message (Telegram/Discord/WebChat/API)
  ├─► Channel Manager routes to Agent.chat()
  ├─► Agent builds system prompt:
  │     base prompt + skill instructions + memory context
  ├─► Agent sends to Claude API with tool definitions
  ├─► Claude responds with tool_use: file_list({path: "."})
  ├─► Agent executes file_list via Tool Registry
  │     → FileOpsTool._list() → returns directory listing
  ├─► Agent sends tool_result back to Claude
  ├─► Claude generates final text response with file listing
  └─► Agent returns response to Channel → User sees it
```

---

## Project Structure

```
aether/
│
├── bin/
│   └── aether.js ·················· CLI entry point (commander.js)
│                                     Commands: onboard, gateway, chat,
│                                     agent, skills, doctor, message
│
├── src/
│   ├── index.js ··················· Main entry + re-exports
│   ├── config.js ·················· Config loader (.env + YAML + env vars)
│   ├── gateway.js ················· Express HTTP server + routes
│   ├── agent.js ··················· Claude agent core (agentic loop)
│   │
│   ├── memory/
│   │   ├── index.js ·············· MemoryManager (high-level API)
│   │   └── store.js ·············· MemoryStore (SQLite/JSON persistence)
│   │
│   ├── skills/
│   │   ├── loader.js ············· SKILL.md parser & loader
│   │   └── builtin/
│   │       ├── web-search/ ······· 🔍 Web search skill
│   │       ├── code-exec/ ········ ⚡ Code execution skill
│   │       ├── file-manager/ ····· 📁 File management skill
│   │       ├── summarizer/ ······· 📝 Summarization skill
│   │       └── translator/ ······· 🌐 Translation skill
│   │
│   ├── channels/
│   │   ├── manager.js ············ Channel router & lifecycle
│   │   ├── telegram.js ··········· Telegram bot (polling mode)
│   │   ├── discord.js ············ Discord bot (gateway intents)
│   │   └── webchat.js ············ WebSocket real-time chat
│   │
│   ├── tools/
│   │   ├── registry.js ··········· Tool definitions & dispatch
│   │   ├── shell-exec.js ········· Shell/Node/Python execution
│   │   ├── file-ops.js ··········· File read/write/list
│   │   ├── web-fetch.js ·········· HTTP content fetcher
│   │   └── memory-tool.js ········ Memory CRUD for Claude
│   │
│   └── utils/
│       ├── logger.js ············· Colored console + file logging
│       └── helpers.js ············· uuid, truncate, sleep, etc.
│
├── web/
│   └── index.html ················ Built-in web chat UI (single file)
│
├── workspace/ ····················· User data directory (gitignored)
│   ├── memory/
│   │   ├── aether.db ············· SQLite database
│   │   └── MEMORY.md ············· Human-readable memory doc
│   ├── skills/ ··················· Custom user skills
│   └── logs/ ····················· Log files
│
├── docs/
│   ├── getting-started.md ········ Beginner guide
│   ├── skills.md ················· Skills system documentation
│   └── channels.md ··············· Channel setup guides
│
├── .env.example ·················· Environment variable template
├── .gitignore
├── aether.yaml.example ··········· Optional YAML config
├── package.json
├── LICENSE (MIT)
└── README.md ····················· This file
```

---

## CLI Reference

```
aether <command> [options]

Commands:
  onboard             Interactive setup wizard
  gateway [options]   Start the full gateway server
  chat [options]      Interactive REPL chat session
  agent [options]     Send a one-shot message
  skills [options]    List and manage skills
  doctor              Run system health checks
  message <action>    Send a message via a channel
```

### `aether gateway`

Start the gateway server with all channels.

| Option | Default | Description |
|--------|---------|-------------|
| `-p, --port <port>` | `18789` | Gateway port |
| `-h, --host <host>` | `127.0.0.1` | Bind address |
| `--verbose` | `false` | Enable debug logging |

### `aether chat`

Start an interactive terminal chat.

| Option | Default | Description |
|--------|---------|-------------|
| `--model <model>` | from config | Override the Claude model |

**Chat commands:** `/quit`, `/exit`, `/clear`, `/skills`, `/memory`

### `aether agent`

Send a single message and exit.

| Option | Default | Description |
|--------|---------|-------------|
| `-m, --message <msg>` | — | Message to send (**required**) |
| `--thinking <level>` | `off` | Thinking level: `off`, `low`, `high` |
| `--model <model>` | from config | Override the Claude model |

**Examples:**

```bash
# Simple question
aether agent -m "What is the capital of Vietnam?"

# Code task
aether agent -m "Write a Python script that counts words in a file"

# With model override
aether agent -m "Analyze this deeply" --model claude-opus-4-20250514
```

### `aether skills`

| Option | Description |
|--------|-------------|
| `--list` | List all loaded skills |
| `--enable <id>` | Enable a skill by ID |
| `--disable <id>` | Disable a skill by ID |

### `aether doctor`

Checks: Node.js version, `.env` file, API key, Claude API connection, skills loading, workspace directory.

### `aether onboard`

Interactive wizard: API key → model → channels → sandbox → generates `.env` + workspace.

---

## API Reference

Base URL: `http://localhost:18789`

Authentication (when `AETHER_SECRET` is set):
```
Authorization: Bearer your-secret-here
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (uptime, model, memory status) |
| `POST` | `/api/chat` | Send message, get full response |
| `POST` | `/api/chat/stream` | Send message, stream response via SSE |
| `GET` | `/api/skills` | List all skills with status |
| `POST` | `/api/skills/:id/toggle` | Toggle a skill on/off |
| `GET` | `/api/memory` | List memories (supports `?type=`, `?search=`, `?limit=`) |
| `POST` | `/api/memory` | Add a memory (`{content, type}`) |
| `DELETE` | `/api/memory/:id` | Delete a memory |
| `POST` | `/api/clear` | Clear conversation history |
| `GET` | `/api/config` | Get safe config subset |
| `GET` | `/api/conversations` | List past conversations |

### Examples

**cURL:**

```bash
# Non-streaming chat
curl -s http://localhost:18789/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Aether!"}' | jq .

# Streaming chat (SSE)
curl -N http://localhost:18789/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Write me a haiku about crabs"}'

# Add memory
curl -X POST http://localhost:18789/api/memory \
  -H "Content-Type: application/json" \
  -d '{"content": "User prefers TypeScript", "type": "preference"}'

# Search memories
curl "http://localhost:18789/api/memory?search=typescript"

# Toggle skill
curl -X POST http://localhost:18789/api/skills/web-search/toggle
```

**JavaScript:**

```javascript
// Non-streaming
const res = await fetch('http://localhost:18789/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello!' }),
});
const { text } = await res.json();

// Streaming (SSE)
const res = await fetch('http://localhost:18789/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Tell me a story' }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split('\n')
    .filter(l => l.startsWith('data: '));
  for (const line of lines) {
    const data = JSON.parse(line.slice(6));
    if (data.type === 'text') process.stdout.write(data.text);
  }
}
```

**Python:**

```python
import requests, json

# Non-streaming
r = requests.post('http://localhost:18789/api/chat',
                   json={'message': 'Hello!'})
print(r.json()['text'])

# Streaming
r = requests.post('http://localhost:18789/api/chat/stream',
                   json={'message': 'Tell me a story'}, stream=True)
for line in r.iter_lines():
    if line.startswith(b'data: '):
        data = json.loads(line[6:])
        if data['type'] == 'text':
            print(data['text'], end='', flush=True)
```

---

## WebSocket Protocol

Connect to `ws://localhost:18789/ws`

### Client → Server

| Type | Fields | Description |
|------|--------|-------------|
| `auth` | `secret` | Authenticate (if `AETHER_SECRET` is set) |
| `message` | `text` | Send a chat message |
| `toggle_skill` | `skillId` | Toggle skill on/off |
| `add_memory` | `content`, `memoryType` | Store a memory |
| `delete_memory` | `memoryId` | Delete a memory |

### Server → Client

| Type | Fields | Description |
|------|--------|-------------|
| `connected` | `clientId`, `needsAuth` | Connection established |
| `auth_ok` | — | Authentication successful |
| `auth_fail` | — | Authentication failed |
| `thinking` | — | Claude is processing |
| `chunk` | `text` | Streamed text chunk |
| `tool_start` | `name` | Tool execution started |
| `tool_end` | `name`, `result` | Tool execution completed |
| `done` | `toolResults` | Full response complete |
| `error` | `message` | Error occurred |
| `skills` | `skills[]` | Skills list response |
| `memories` | `memories[]` | Memory list response |
| `skill_toggled` | `skillId`, `enabled` | Skill toggle confirmation |
| `memory_added` | `content` | Memory add confirmation |
| `memory_deleted` | `memoryId` | Memory delete confirmation |
| `cleared` | — | History cleared |

### WebSocket Client Example

```javascript
const ws = new WebSocket('ws://localhost:18789/ws');

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  switch (data.type) {
    case 'chunk':
      process.stdout.write(data.text);
      break;
    case 'tool_start':
      console.log(`\n⚡ Using ${data.name}...`);
      break;
    case 'done':
      console.log('\n✓ Done');
      break;
  }
};

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'message', text: 'What can you do?' }));
};
```

---

## Skills System

### Built-in Skills

| ID | Name | Icon | Description |
|----|------|------|-------------|
| `web-search` | Web Search | 🔍 | Search the web for current information |
| `code-exec` | Code Execution | ⚡ | Execute bash, Node.js, or Python in sandbox |
| `file-manager` | File Manager | 📁 | Read, write, list, and manage files |
| `summarizer` | Smart Summarizer | 📝 | Summarize documents, articles, and URLs |
| `translator` | Multi-Translator | 🌐 | Translate between 100+ languages |

### Creating a Custom Skill

```bash
mkdir workspace/skills/my-skill
```

Create `workspace/skills/my-skill/SKILL.md`:

```markdown
---
name: My Custom Skill
id: my-skill
icon: 🎯
description: Does something amazing
category: custom
enabled: true
---

# My Custom Skill

Instructions for Claude when this skill is active.

## Guidelines
- Be specific about behavior
- Handle edge cases
```

### SKILL.md Frontmatter Reference

| Field | Type | Required | Description |
|-------|------|:---:|-------------|
| `name` | string | ✅ | Display name |
| `id` | string | ✅ | Unique identifier (kebab-case) |
| `icon` | string | — | Emoji icon |
| `description` | string | ✅ | One-line description |
| `category` | string | — | `core`, `productivity`, `dev`, `creative`, `automation`, `custom` |
| `enabled` | boolean | — | Default: `true` |

### Loading Priority

1. `src/skills/builtin/` — Built-in skills (ship with Aether)
2. `workspace/skills/` — User-created skills
3. Workspace skills **override** built-in skills with the same ID

---

## Memory System

### Auto-Extraction Patterns

| User says | Stored as |
|-----------|-----------|
| "My name is Alex" | `identity`: User's name is Alex |
| "I work at Google" | `work`: User works at Google |
| "I live in Hanoi" | `location`: User lives in Hanoi |
| "I prefer dark mode" | `preference`: User prefers dark mode over light mode |
| "I speak Vietnamese" | `language`: User speaks Vietnamese |
| "I'm a developer" | `identity`: User is a developer |
| "Remember that X" | `fact`: X |

### Memory Types

`fact`, `preference`, `identity`, `project`, `context`, `work`, `location`, `language`

### How Context Injection Works

At each conversation turn, the Memory Manager builds a `<user_memory>` block from stored memories, grouped by type and ranked by importance. This block is appended to Claude's system prompt, giving Claude access to everything it knows about the user.

---

## Channels

### Web Chat — Always enabled, open `http://localhost:18789`

### Telegram

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_USERS=your_user_id
```

Create bot via [@BotFather](https://t.me/BotFather). Find your ID via [@userinfobot](https://t.me/userinfobot).

**Commands:** `/start`, `/help`, `/skills`, `/memory`, `/clear`

### Discord

```env
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_ALLOWED_USERS=your_user_id
```

Create app at [Discord Developer Portal](https://discord.com/developers/applications). Enable **Message Content Intent**.

**Usage:** DM the bot, mention `@Aether`, or prefix with `!aether` in servers.

### Adding New Channels

See [docs/channels.md](./docs/channels.md) for the channel adapter template.

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | **Required.** Anthropic API key |
| `AETHER_MODEL` | `claude-sonnet-4-20250514` | Default Claude model |
| `AETHER_MAX_TOKENS` | `4096` | Max tokens per response |
| `AETHER_THINKING` | `false` | Enable extended thinking |
| `GATEWAY_PORT` | `18789` | HTTP server port |
| `GATEWAY_HOST` | `127.0.0.1` | Bind address |
| `AETHER_SECRET` | — | API bearer token |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token |
| `TELEGRAM_ALLOWED_USERS` | — | Comma-separated user IDs |
| `DISCORD_BOT_TOKEN` | — | Discord bot token |
| `DISCORD_ALLOWED_USERS` | — | Comma-separated user IDs |
| `SANDBOX_MODE` | `true` | Restrict shell execution |
| `ALLOWED_DIRS` | — | Comma-separated allowed paths |
| `MEMORY_ENABLED` | `true` | Enable persistent memory |
| `MEMORY_DB_PATH` | `./workspace/memory/aether.db` | Database path |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FILE` | — | Path to log file |

### YAML Config (optional)

Create `aether.yaml` for structured config (overrides `.env`):

```yaml
model: claude-sonnet-4-20250514
maxTokens: 4096
gateway:
  port: 18789
  host: 127.0.0.1
  secret: my-secret
memory:
  enabled: true
sandbox: true
```

### Priority: Environment variables > `aether.yaml` > `.env` > defaults

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No Anthropic API key found" | Run `aether onboard` or create `.env` with `ANTHROPIC_API_KEY=sk-ant-...` |
| "SQLite not available" | Falls back to JSON. For SQLite: `npm install better-sqlite3 --build-from-source` |
| Port already in use | `aether gateway --port 18790` |
| Telegram bot not responding | Check `aether doctor`, verify token, check `TELEGRAM_ALLOWED_USERS`, send `/start` |
| Discord bot not responding | Enable **Message Content Intent** in Dev Portal, check permissions |
| API returns 401 | Include `Authorization: Bearer your-secret` header |
| Tool execution timeout | Default is 30s. Break commands into smaller steps |
| Memory not persisting | Check `MEMORY_ENABLED=true`, verify `workspace/memory/` exists |

---

## FAQ

**Q: Is my data sent anywhere?**
Only to Anthropic's API. Everything else stays on your machine.

**Q: Can I use GPT or other models?**
No. Aether is Claude-only. For multi-provider, use [OpenClaw](https://openclaw.ai/).

**Q: Can I run this on a VPS?**
Yes. Set `GATEWAY_HOST=0.0.0.0`, set `AETHER_SECRET`, use a reverse proxy with HTTPS.

**Q: Are skills compatible with OpenClaw?**
Yes, the SKILL.md format is compatible. Skills using only instructions (no custom tool implementations) work directly.

**Q: How much does it cost?**
Aether is free. You pay only for Claude API usage (~$0.003–0.015 per conversation turn with Sonnet).

**Q: How do I add WhatsApp/Slack/Signal?**
Create a channel adapter in `src/channels/`. See [docs/channels.md](./docs/channels.md).

**Q: How do I reset everything?**
Delete `workspace/memory/aether.db` and `.env`, then run `aether onboard`.

---

## Roadmap

- [ ] WhatsApp channel (Business API)
- [ ] Slack channel (Bot API)
- [ ] Signal channel (signal-cli)
- [ ] MCP server support — connect to external MCP tools
- [ ] Skill marketplace — browse & install community skills
- [ ] Voice input/output — STT and TTS
- [ ] Extended thinking — leverage Claude's thinking for complex tasks
- [ ] Multi-agent — spawn sub-agents for parallel tasks
- [ ] Scheduled tasks — cron-like task scheduling
- [ ] File upload handling — images, PDFs, documents
- [ ] Desktop app (Electron/Tauri) with system tray
- [ ] Full web dashboard — skills, memory, logs management

---

## Contributing

1. **Fork** the repo
2. **Branch**: `git checkout -b feature/amazing-thing`
3. **Code** your changes
4. **Test**: `aether doctor` + manual testing
5. **Commit**: `git commit -m 'feat: add amazing thing'`
6. **Push**: `git push origin feature/amazing-thing`
7. **PR**: Open a Pull Request

**Areas to contribute:** new channels, new skills, security hardening, documentation, bug fixes.

---

## License

MIT — see [LICENSE](./LICENSE)

---

<p align="center">
  <strong>The ether connects all. ✦</strong>
</p>
