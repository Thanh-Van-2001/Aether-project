# Getting Started with Aether

## Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **Anthropic API Key** — [Get one](https://console.anthropic.com/)

## Step 1: Install

```bash
git clone https://github.com/your-username/aether.git
cd aether
npm install
```

## Step 2: Setup

Run the interactive onboarding wizard:

```bash
node bin/aether.js onboard
```

This will:
1. Ask for your Anthropic API key
2. Let you choose a default model
3. Configure messaging channels (Telegram, Discord)
4. Set up security options
5. Create your `.env` file and workspace directories

## Step 3: Verify

Run the doctor to check everything is working:

```bash
node bin/aether.js doctor
```

## Step 4: Start

### Option A: Gateway (recommended)

Starts the full server with web UI, API, and all messaging channels:

```bash
node bin/aether.js gateway --verbose
```

Then open `http://localhost:18789` in your browser.

### Option B: Interactive Chat

For a quick terminal chat session:

```bash
node bin/aether.js chat
```

Commands inside chat:
- `/quit` — Exit
- `/clear` — Clear history
- `/skills` — List active skills
- `/memory` — Show stored memories

### Option C: One-shot

Send a single message and get a response:

```bash
node bin/aether.js agent --message "What are the top 5 programming languages?"
```

## Next Steps

- **[Skills Guide](./skills.md)** — Learn about the skills system and create your own
- **[Channels Guide](./channels.md)** — Set up Telegram, Discord, and more
- **[README](../README.md)** — Full reference

## Troubleshooting

### "No Anthropic API key found"
Run `aether onboard` or manually create a `.env` file with `ANTHROPIC_API_KEY=sk-ant-...`

### "SQLite not available"
Aether will fall back to JSON storage. To use SQLite:
```bash
npm install better-sqlite3 --build-from-source
```

### Port already in use
Change the port: `aether gateway --port 18790`
