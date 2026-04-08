# Skills Guide

## Overview

Skills are modular capabilities that extend what Aether can do. They use the SKILL.md format — the same format pioneered by OpenClaw — making skills portable between platforms.

## How Skills Work

1. When Aether starts, the **Skill Loader** scans two directories:
   - `src/skills/builtin/` — Built-in skills (ship with Aether)
   - `workspace/skills/` — User/workspace skills (your custom skills)

2. Each skill is a directory containing a `SKILL.md` file
3. Workspace skills override built-in skills with the same ID
4. Skill instructions are injected into Claude's system prompt
5. Skills can define tools that Claude can call

## SKILL.md Format

```markdown
---
name: My Skill Name
id: my-skill-id
icon: 🎯
description: A brief description of what this skill does
category: custom
enabled: true
---

# Skill Title

Main instructions for the agent. This text is injected into the system prompt
when the skill is enabled. Write clear, specific instructions.

## Guidelines
- Rule 1
- Rule 2

## Tools

### tool_name
Description of the tool.
Parameters:
- param1 (string) - Description
- param2 (number) - Description
```

### YAML Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Display name |
| `id` | string | yes | Unique identifier |
| `icon` | string | no | Emoji icon |
| `description` | string | yes | Brief description |
| `category` | string | no | Category grouping |
| `enabled` | boolean | no | Default enabled state |

## Creating a Custom Skill

### Example: Daily Standup Skill

```bash
mkdir workspace/skills/daily-standup
```

`workspace/skills/daily-standup/SKILL.md`:

```markdown
---
name: Daily Standup
id: daily-standup
icon: 📋
description: Help format and track daily standup updates
category: productivity
enabled: true
---

# Daily Standup Skill

Help the user prepare their daily standup update. When asked about standups:

1. Ask about what they did yesterday
2. Ask about today's plan
3. Ask about blockers

Format the standup as:

**Yesterday:** [items]
**Today:** [items]
**Blockers:** [items or "None"]

Store key decisions and blockers in memory for follow-up.
```

### Example: Git Helper Skill

`workspace/skills/git-helper/SKILL.md`:

```markdown
---
name: Git Helper
id: git-helper
icon: 🔀
description: Help with Git commands, workflows, and resolving conflicts
category: dev
enabled: true
---

# Git Helper

You are an expert at Git. Help the user with:
- Writing commit messages (use conventional commits format)
- Resolving merge conflicts
- Explaining Git workflows
- Suggesting branch strategies

When the user describes a Git problem, first diagnose it, then provide
the exact commands needed to fix it.

Always explain what each command does before suggesting it.
```

## Skill Categories

Organize skills into categories:

- `core` — Essential built-in skills
- `productivity` — Task management, scheduling, summarization
- `dev` — Development tools and helpers
- `creative` — Writing, design, brainstorming
- `automation` — Recurring tasks, workflows
- `custom` — User-created skills

## Managing Skills

### CLI
```bash
aether skills --list          # List all skills
aether skills --enable git-helper
aether skills --disable translator
```

### API
```bash
# List skills
curl http://localhost:18789/api/skills

# Toggle a skill
curl -X POST http://localhost:18789/api/skills/git-helper/toggle
```

### Chat Commands
In any chat interface, type `/skills` to see active skills.

## Tips

- Keep skill instructions focused and specific
- Use the memory system to track skill-related state
- Test skills by chatting and checking if Claude follows the instructions
- Skills are loaded at gateway startup — restart to pick up changes
