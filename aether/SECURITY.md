# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Active |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues by emailing: **security@your-domain.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Security Model

### Threat Surface

Aether runs locally and has access to:
- **Shell execution** — Mitigated by sandbox mode
- **File system** — Mitigated by path restrictions
- **Network** — Outbound HTTP (web_fetch), API calls to Anthropic
- **Messaging platforms** — Telegram, Discord (user-allowlisted)

### Built-in Protections

| Protection | Default | Description |
|------------|---------|-------------|
| Sandbox mode | ON | Blocks dangerous shell commands, strips sensitive env vars |
| Local binding | `127.0.0.1` | Gateway not accessible from network |
| User allowlists | OFF | Restrict Telegram/Discord to specific user IDs |
| API authentication | OFF | Bearer token for gateway API |
| Path restrictions | ON | File operations restricted to workspace |
| Input size limits | ON | Max 50KB tool results, 1MB file reads |
| Command timeout | 30s | Shell commands killed after timeout |

### Hardening Checklist

For production deployments:

- [ ] Set `AETHER_SECRET` for API authentication
- [ ] Set `GATEWAY_HOST=127.0.0.1` (never `0.0.0.0` without auth)
- [ ] Set `SANDBOX_MODE=true`
- [ ] Configure `TELEGRAM_ALLOWED_USERS` / `DISCORD_ALLOWED_USERS`
- [ ] Use a reverse proxy (nginx) with HTTPS for public access
- [ ] Don't store secrets in `aether.yaml` (use `.env` or env vars)
- [ ] Review workspace skills before enabling (like npm packages, skills can contain malicious instructions)
- [ ] Monitor `workspace/logs/` for suspicious activity

### Known Limitations

- **Prompt injection** is an industry-wide unsolved problem. Untrusted input (messages from unvetted users, web page content from `web_fetch`) could manipulate Claude's behavior.
- **Skills from untrusted sources** could contain malicious instructions. Always review SKILL.md files before adding them.
- **Memory extraction** may store sensitive information. Users should review stored memories periodically.

## Responsible Disclosure

We follow responsible disclosure practices. Security researchers who report valid vulnerabilities will be credited (with permission) in release notes.
