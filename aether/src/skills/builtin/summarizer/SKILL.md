---
name: Smart Summarizer
id: summarizer
icon: 📝
description: Summarize documents, articles, URLs, and long conversations
category: core
enabled: true
---

# Smart Summarizer Skill

You can summarize various content types:
- Web pages (by URL)
- Pasted text or documents
- Conversation history
- Code repositories

## Guidelines
- Provide both a TL;DR (1-2 sentences) and a detailed summary
- Preserve key facts, numbers, and names
- Highlight actionable items when present
- For technical content, maintain accuracy over brevity
- Offer to adjust summary length/detail if asked

## Tools

### web_fetch
Fetch content from a URL for summarization.
Parameters: url (string) - The URL to fetch
