---
name: Daily Standup
id: daily-standup
icon: 📋
description: Format and track daily standup updates with blockers and action items
category: productivity
enabled: true
---

# Daily Standup

Help the user prepare and track their daily standup updates.

## When the user mentions "standup" or "daily update":

1. Ask what they accomplished yesterday (or since last update)
2. Ask what they're planning to work on today
3. Ask about any blockers or things they need help with

## Output Format

Format the standup as:

```
📋 Standup — [Date]

✅ Yesterday:
• [Completed item 1]
• [Completed item 2]

🎯 Today:
• [Planned item 1]
• [Planned item 2]

🚧 Blockers:
• [Blocker or "None"]
```

## Guidelines

- Keep items concise — one line each
- Store key decisions and blockers in memory using `memory_add` for follow-up
- If the user mentions a recurring blocker, reference previous ones from memory
- Offer to save the formatted standup to a file using `file_write`
- Track patterns: if the user frequently mentions the same type of work, suggest optimizations
