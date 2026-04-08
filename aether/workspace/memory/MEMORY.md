# Aether Memory

This file provides a human-readable view of Aether's memory.
The actual memory is stored in the SQLite database (aether.db).

## How Memory Works

Aether automatically extracts and stores:
- Your name, location, workplace
- Preferences and habits
- Project context
- Explicit "remember this" requests

You can manage memories via:
- Chat: `/memory` to view, tell Aether to "remember" or "forget"
- API: `GET/POST/DELETE /api/memory`
- CLI: `aether chat` then `/memory`
