<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/dizzy-symbol_1f4ab.png" width="100" alt="Aether" />
</p>

<h1 align="center">Aether</h1>

<p align="center">
  <strong>Claude-native AI assistant with autonomous agents & local knowledge base.<br/>
  The fifth element of AI. ✦</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#autonomous-agents">Autonomous Agents</a> &bull;
  <a href="#local-knowledge-base">Knowledge Base</a> &bull;
  <a href="#api-reference">API</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#configuration">Config</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  <img src="https://img.shields.io/badge/powered%20by-Claude-orange" alt="Claude" />
  <img src="https://img.shields.io/badge/tools-25-purple" alt="Tools" />
  <img src="https://img.shields.io/badge/API%20endpoints-29-informational" alt="API" />
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## What is Aether?

Aether is an open-source, locally-running AI assistant built **exclusively for Claude**. Instead of being another generic LLM wrapper, Aether goes deep on what makes Claude unique — native tool use, agentic loops, extended thinking — and adds capabilities that no other assistant has:

- **Autonomous Background Agents** — Claude spawns agents that work independently, monitor systems, and push notifications
- **Local Knowledge Base** — Indexes your files locally (zero cloud upload), auto-injects relevant context into every conversation
- **Workflow Pipelines** — Chain AI reasoning steps in YAML, triggered by cron or events

Everything runs on your machine. Your data never leaves your device except API calls to Anthropic.

### Aether vs OpenClaw

| | Aether | OpenClaw |
|---|---|---|
| **LLM** | Claude only (deeply optimized) | Multi-provider |
| **Autonomous agents** | Built-in (spawn, schedule, watch) | Partial |
| **Local file RAG** | FTS5 search, auto-context injection | No |
| **Workflow pipelines** | YAML-based with AI reasoning per step | No |
| **File watcher + AI** | Detect changes, spawn analysis agent | No |
| **Cron scheduler** | Zero-dependency, built-in | External |
| **Setup** | `npm install` + onboard wizard | Complex (daemon + services) |
| **Tools** | 25 native tools | ~10 with plugins |
| **Privacy** | 100% local indexing | Cloud-leaning |

---

## Features

### Claude-Native Agent Core

- Native `tool_use` API — no abstraction layers
- **Parallel tool execution** — multiple tools run concurrently via `Promise.allSettled()`
- **Agentic loops** — up to 10 iterations per turn
- **History pruning** — auto-trims to stay within 100K token context
- **Exponential backoff retry** — resilient API calls (3 retries)
- **Extended thinking** — optional deep reasoning mode
- **Event hooks** — `EventEmitter`-based plugin system
- **Streaming** via WebSocket and Server-Sent Events

### Autonomous Background Agents

Claude can spawn agents that run independently in the background:

```
User: "Monitor my server every 5 minutes"

Claude calls: agent_spawn({
  name: "Server Monitor",
  task: "Fetch https://mysite.com, check HTTP 200. Alert if down.",
  interval: "5m",
  notify: ["webchat", "telegram"]
})

→ Agent runs autonomously, checks every 5m, sends alerts
```

**Components:**
- **BackgroundAgentRunner** — Lifecycle management, max 10 concurrent agents
- **Scheduler** — Cron expressions (`0 9 * * *`) and intervals (`every 5m`), zero dependencies
- **File Watcher** — Monitor directories for changes, spawn AI analysis
- **Pipeline Engine** — Chain multiple steps in YAML workflows

### Local Knowledge Base (Personal RAG)

Aether indexes your local files and searches them before every response — **no cloud upload, no embeddings, no GPU needed**.

```
User: "Where's the payment API endpoint?"

→ Aether auto-searches local files
→ Finds src/api/payment.ts:42
→ Injects relevant code into Claude's context
→ "The payment endpoint is in src/api/payment.ts line 42, using Stripe webhooks..."
```

**How it works:**
- **FileIndexer** — Scans 50+ file types, smart code-aware chunking (splits by functions/classes)
- **SQLite FTS5** — BM25 full-text search ranking (porter stemming)
- **Auto-context injection** — Extracts key terms from user message, searches index, injects top results
- Auto-skips `node_modules`, `.git`, lock files, binaries

### Multi-Channel Messaging

| Channel | Type | Features |
|---------|------|----------|
| **Web UI** | Built-in | Chat at `http://localhost:18789`, streaming, tool badges |
| **Telegram** | Bot | Commands, typing indicators, message splitting |
| **Discord** | Bot | DM + server mention, `!aether` prefix |
| **REST API** | HTTP | `/api/chat`, `/api/chat/stream` (SSE) |
| **WebSocket** | WS | Real-time bidirectional, auth, agent notifications |
| **CLI** | Terminal | Interactive REPL + one-shot messages |

### 25 Tools for Claude

| Category | Tools |
|----------|-------|
| **Core** | `shell_exec`, `file_read`, `file_write`, `file_list`, `web_fetch` |
| **Memory** | `memory_add`, `memory_search`, `memory_list` |
| **Agents** | `agent_spawn`, `agent_list`, `agent_results`, `agent_stop` |
| **Scheduler** | `schedule_add`, `schedule_list`, `schedule_remove` |
| **Watcher** | `watch_add`, `watch_list`, `watch_remove` |
| **Pipeline** | `pipeline_list`, `pipeline_run` |
| **Knowledge** | `knowledge_search`, `knowledge_read`, `knowledge_find`, `knowledge_index`, `knowledge_status` |

### Security

- **30+ regex-based sandbox patterns** — blocks fork bombs, reverse shells, crypto mining, sudo escalation
- **Rate limiting** — 20 chat/min, 60 API/min (zero dependencies)
- **Security headers** — CSP, X-Frame-Options, XSS protection, Referrer-Policy
- **Input validation** — message length, type enum, ID format checks
- **SSRF protection** — blocks localhost/private IPs in web_fetch
- **Symlink protection** — prevents path traversal via symbolic links
- **Env stripping** — auto-removes SECRET/TOKEN/PASSWORD/KEY from child processes
- **API auth** — Bearer token for all protected endpoints

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0 ([download](https://nodejs.org/))
- **Anthropic API Key** ([get one](https://console.anthropic.com/))

### Install & Setup

```bash
git clone https://github.com/Thanh-Van-2001/Aether-project.git
cd Aether-project/aether
npm install

# Interactive setup wizard
node bin/aether.js onboard

# Verify everything works
node bin/aether.js doctor
```

### Run

```bash
# Start gateway (Web UI + API + all channels)
node bin/aether.js gateway --verbose

# Or interactive CLI chat
node bin/aether.js chat

# Or one-shot message
node bin/aether.js agent -m "What can you do?"
```

Open **http://localhost:18789** for the Web UI.

### Docker

```bash
docker build -t aether .
docker run -p 18789:18789 --env-file .env aether
```

---

## Autonomous Agents

### Spawning a Background Agent

**Via chat:**
> "Check Hacker News every hour and send me a summary"

Claude will automatically call `agent_spawn` with the right parameters.

**Via API:**
```bash
curl -X POST http://localhost:18789/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HN Monitor",
    "task": "Fetch https://news.ycombinator.com, summarize top 5 stories",
    "interval": "1h",
    "notify": ["webchat"]
  }'
```

### Scheduled Tasks

```bash
# Via API
curl -X POST http://localhost:18789/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning Briefing",
    "schedule": "0 9 * * *",
    "task": "Fetch top tech news and compose a morning briefing",
    "notify": ["telegram"]
  }'
```

Supported formats:
- Cron: `0 9 * * *` (9am daily), `*/30 * * * *` (every 30min)
- Shortcuts: `@hourly`, `@daily`, `@weekly`, `@monthly`
- Intervals: `every 5m`, `every 2h`, `every 30s`

### File Watchers

```bash
curl -X POST http://localhost:18789/api/watches \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Log Monitor",
    "path": "logs",
    "pattern": "*.log",
    "task": "Analyze these log changes for errors or warnings. Alert if critical.",
    "debounce": 10
  }'
```

### Workflow Pipelines

Define multi-step workflows in YAML:

```yaml
# workspace/workflows/morning-briefing.yaml
name: Morning Briefing
trigger: "0 9 * * *"
notify: [webchat, telegram]

steps:
  - name: fetch-news
    action: web_fetch
    input: { url: "https://news.ycombinator.com" }

  - name: summarize
    action: llm
    prompt: "Summarize top 5 stories: {{steps.fetch-news.output}}"

  - name: deliver
    action: notify
    channel: telegram
    message: "{{steps.summarize.output}}"
```

3 example workflows included: `morning-briefing`, `code-review-watch`, `health-monitor`.

---

## Local Knowledge Base

### How It Works

```
1. Indexer scans your workspace (50+ file types)
2. Smart chunker splits files:
   - Code → by functions/classes
   - Text → by paragraphs with overlap
3. Chunks stored in SQLite FTS5 with BM25 ranking
4. Every chat message → auto-extract key terms → search index
5. Top matching chunks injected into Claude's system prompt
6. Claude responds with full awareness of your codebase
```

### API

```bash
# Search your files
curl "http://localhost:18789/api/knowledge/search?q=payment+endpoint&type=ts"

# View index stats
curl http://localhost:18789/api/knowledge/status

# Trigger re-index
curl -X POST http://localhost:18789/api/knowledge/index \
  -H "Content-Type: application/json" \
  -d '{"directory": "/path/to/project"}'

# Find files by name
curl "http://localhost:18789/api/knowledge/files?pattern=config"
```

### Supported File Types

**Code:** JS, TS, Python, Go, Rust, Java, C/C++, PHP, Ruby, Swift, Kotlin, Vue, Svelte
**Config:** JSON, YAML, TOML, INI, .env, Dockerfile, Makefile
**Docs:** Markdown, TXT, RST, HTML, CSS
**Data:** CSV, SQL

---

## API Reference

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message, get response |
| POST | `/api/chat/stream` | Send message, stream SSE response |
| POST | `/api/clear` | Clear conversation history |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all background agents |
| POST | `/api/agents` | Spawn a new agent |
| GET | `/api/agents/:id` | Get agent details |
| GET | `/api/agents/:id/results` | Get agent results |
| POST | `/api/agents/:id/pause` | Pause agent |
| POST | `/api/agents/:id/resume` | Resume agent |
| DELETE | `/api/agents/:id` | Stop and remove agent |

### Schedules

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schedules` | List scheduled tasks |
| POST | `/api/schedules` | Add scheduled task |
| DELETE | `/api/schedules/:id` | Remove scheduled task |

### Watches

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watches` | List file watchers |
| POST | `/api/watches` | Add file watcher |
| DELETE | `/api/watches/:id` | Remove watcher |

### Knowledge

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/knowledge/status` | Index statistics |
| GET | `/api/knowledge/search?q=...` | Full-text search |
| GET | `/api/knowledge/files` | List indexed files |
| POST | `/api/knowledge/index` | Trigger re-index |
| POST | `/api/knowledge/clear` | Clear index |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + stats |
| GET | `/api/skills` | List skills |
| POST | `/api/skills/:id/toggle` | Toggle skill |
| POST | `/api/skills/reload` | Hot-reload skills |
| GET | `/api/memory` | List memories |
| POST | `/api/memory` | Add memory |
| DELETE | `/api/memory/:id` | Delete memory |
| GET | `/api/config` | View config (safe subset) |
| GET | `/api/pipelines` | List workflows |
| POST | `/api/pipelines/:id/run` | Run workflow |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Gateway                                  │
│  Express HTTP + WebSocket + Rate Limiting + Security Headers      │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │  REST API   │  │  WebSocket  │  │   Channel Manager        │ │
│  │  29 routes  │  │  /ws        │  │  Telegram │ Discord │ Web│ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────────┘ │
│         └────────────────┼─────────────────────┘                  │
│                          │                                         │
│  ┌───────────────────────┴────────────────────────────────────┐  │
│  │                     Agent Core                              │  │
│  │  Claude API ←→ Agentic Loop (parallel tools, retry, prune) │  │
│  │                                                             │  │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────────┐│  │
│  │  │  25 Tools  │  │  Memory    │  │  Knowledge Base       ││  │
│  │  │  Registry  │  │  SQLite    │  │  FTS5 + Auto-context  ││  │
│  │  └────────────┘  │  FTS5+Dedup│  │  50+ file types       ││  │
│  │                   └────────────┘  └───────────────────────┘│  │
│  └────────────────────────────────────────────────────────────┘  │
│                          │                                         │
│  ┌───────────────────────┴────────────────────────────────────┐  │
│  │                  Autonomous Systems                         │  │
│  │                                                             │  │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌───────────┐│  │
│  │  │  Agent   │  │ Scheduler │  │ Watcher │  │ Pipeline  ││  │
│  │  │  Runner  │  │  Cron +   │  │  File + │  │  Engine   ││  │
│  │  │  (10 max)│  │  Interval │  │  Git    │  │  YAML     ││  │
│  │  └──────────┘  └───────────┘  └─────────┘  └───────────┘│  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
aether/
├── bin/aether.js                    CLI entry point
├── src/
│   ├── agent.js                     Agent core (EventEmitter, parallel tools)
│   ├── gateway.js                   Express server + rate limiting
│   ├── config.js                    Configuration loader
│   ├── index.js                     Main exports
│   ├── agents/
│   │   ├── runner.js                Background agent lifecycle
│   │   ├── scheduler.js             Cron scheduling (zero deps)
│   │   ├── watcher.js               File/git monitoring
│   │   └── pipeline.js              YAML workflow engine
│   ├── knowledge/
│   │   ├── indexer.js               File scanner + smart chunker
│   │   ├── store.js                 SQLite FTS5 search engine
│   │   └── index.js                 KnowledgeBase manager
│   ├── channels/
│   │   ├── manager.js               Channel router
│   │   ├── webchat.js               WebSocket chat
│   │   ├── telegram.js              Telegram bot
│   │   └── discord.js               Discord bot
│   ├── tools/
│   │   ├── registry.js              Tool registry (25 tools)
│   │   ├── shell-exec.js            Shell execution (30+ sandbox rules)
│   │   ├── file-ops.js              File operations (symlink safe)
│   │   ├── web-fetch.js             HTTP fetch (SSRF protected)
│   │   ├── memory-tool.js           Memory CRUD
│   │   ├── agent-tools.js           Agent management (12 tools)
│   │   └── knowledge-tools.js       Knowledge search (5 tools)
│   ├── memory/
│   │   ├── store.js                 SQLite + FTS5 + dedup
│   │   └── index.js                 MemoryManager
│   ├── skills/
│   │   ├── loader.js                SKILL.md parser
│   │   └── builtin/                 5 built-in skills
│   └── utils/
│       ├── logger.js                Colored logging
│       └── helpers.js               UUID, sanitize, format
├── web/index.html                   Built-in chat UI
├── workspace/
│   ├── workflows/                   YAML workflow definitions
│   ├── skills/                      Custom user skills
│   ├── memory/                      SQLite databases
│   └── knowledge/                   Knowledge index DB
├── tests/index.test.js              Test suite
├── docs/                            Documentation
├── Dockerfile                       Container support
└── package.json
```

---

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Model
AETHER_MODEL=claude-sonnet-4-20250514    # or claude-opus-4-20250514
AETHER_MAX_TOKENS=4096
AETHER_THINKING=false                     # Enable extended thinking
AETHER_THINKING_BUDGET=10000              # Thinking token budget

# Gateway
GATEWAY_PORT=18789
GATEWAY_HOST=127.0.0.1
AETHER_SECRET=                            # API auth token (optional)
CORS_ORIGIN=*
RATE_LIMIT_MAX=20                         # Requests per minute

# Channels
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USERS=                   # Comma-separated user IDs
DISCORD_BOT_TOKEN=
DISCORD_ALLOWED_USERS=

# Security
SANDBOX_MODE=true
ALLOWED_DIRS=                             # Extra allowed directories

# Memory
MEMORY_ENABLED=true
MEMORY_DB_PATH=./workspace/memory/aether.db

# Knowledge Base
KNOWLEDGE_ENABLED=true
KNOWLEDGE_DB_PATH=./workspace/knowledge/aether-kb.db
KNOWLEDGE_DIRS=                           # Extra directories to index

# Logging
LOG_LEVEL=info                            # debug, info, warn, error
LOG_FILE=
```

Also supports `aether.yaml` for configuration overrides.

---

## Skills

Aether uses the **SKILL.md** format (compatible with OpenClaw):

```markdown
---
id: my-skill
name: My Custom Skill
icon: ⚡
description: Does something cool
category: custom
enabled: true
---

## Instructions

When the user asks you to do X, follow these steps:
1. First, check Y
2. Then, execute Z
```

Drop the folder in `workspace/skills/` — auto-loaded on startup.

**Built-in skills:** Web Search, Code Execution, File Manager, Summarizer, Translator

---

## Contributing

See [CONTRIBUTING.md](aether/CONTRIBUTING.md) for guidelines.

```bash
# Run tests
npm test

# Development mode (auto-reload)
npm run dev

# Check system
node bin/aether.js doctor
```

---

## License

MIT License. See [LICENSE](aether/LICENSE).

---

<p align="center">
  <strong>✦ Aether — The fifth element of AI</strong><br/>
  <em>Built with Claude. Runs locally. Thinks autonomously.</em>
</p>
