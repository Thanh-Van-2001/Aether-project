# Changelog

All notable changes to Aether will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-04-08

### ✦ Initial Release

The first public release of Aether — a personal AI assistant powered by Claude.

### Added

- **Agent Core** — Full agentic loop with Claude API tool use (up to 10 iterations per turn)
- **Streaming** — Real-time response streaming via WebSocket and Server-Sent Events
- **CLI** — Commands: `onboard`, `gateway`, `chat`, `agent`, `skills`, `doctor`, `message`
- **Gateway** — Express HTTP server with REST API, WebSocket, and static file serving
- **Channels**
  - Web Chat (built-in, always enabled)
  - Telegram bot with commands and user allowlists
  - Discord bot with DM and server mention support
  - REST API with streaming support
  - WebSocket protocol for custom integrations
- **Skills System**
  - SKILL.md format (OpenClaw-compatible)
  - 5 built-in skills: Web Search, Code Execution, File Manager, Summarizer, Translator
  - Custom skills via `workspace/skills/` directory
  - Workspace skills override built-in skills
- **Tools**
  - `shell_exec` — Sandboxed shell/Node.js/Python execution
  - `file_read`, `file_write`, `file_list` — File operations
  - `web_fetch` — HTTP content fetching
  - `memory_add`, `memory_search`, `memory_list` — Memory management
- **Memory System**
  - SQLite-backed with JSON fallback
  - Auto-extraction from user messages (name, location, preferences, etc.)
  - Agent-accessible memory tools
  - Context injection into system prompt
- **Security**
  - Sandbox mode (default: ON)
  - User allowlists for Telegram/Discord
  - API bearer token authentication
  - Local-only gateway binding
  - Path-restricted file operations
- **Configuration**
  - `.env` file support
  - Optional `aether.yaml` override
  - Environment variable override
  - Interactive `onboard` setup wizard
- **Docker**
  - Multi-stage Dockerfile
  - docker-compose.yml with persistent volumes
- **Documentation**
  - Comprehensive README (800+ lines)
  - Getting Started guide
  - Skills guide
  - Channels guide
  - CONTRIBUTING.md
  - SECURITY.md
- **Tests**
  - Config, Helpers, SkillLoader, ToolRegistry, MemoryStore, FileOps, ShellExec, Logger
