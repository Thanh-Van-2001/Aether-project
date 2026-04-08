# Contributing to Aether

Thank you for your interest in contributing to Aether! ✦

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/aether.git`
3. **Install** dependencies: `npm install`
4. **Setup**: `node bin/aether.js onboard`
5. **Verify**: `node bin/aether.js doctor`

## Development

```bash
# Run in dev mode (auto-reload on changes)
npm run dev

# Run tests
npm test

# Syntax check
find src bin -name '*.js' -exec node --check {} \;
```

## Project Structure

See [README.md](./README.md#project-structure) for the full directory layout.

Key areas for contribution:

| Area | Location | Description |
|------|----------|-------------|
| **Channels** | `src/channels/` | Messaging platform adapters |
| **Skills** | `src/skills/builtin/` or `examples/skills/` | Agent capabilities |
| **Tools** | `src/tools/` | Tools Claude can call |
| **Web UI** | `web/index.html` | Built-in chat interface |
| **CLI** | `bin/aether.js` | Command-line interface |
| **Docs** | `docs/` | Documentation |

## Contribution Guidelines

### Code Style

- ES Modules (`import`/`export`)
- Async/await for all asynchronous code
- Descriptive variable names
- JSDoc comments for public APIs
- Keep files focused — one module per file

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Slack channel adapter
fix: handle empty messages in Telegram
docs: update skills guide with new examples
refactor: simplify tool registry dispatch
test: add memory store unit tests
chore: update dependencies
```

### Pull Requests

1. Create a feature branch from `main`: `git checkout -b feat/my-feature`
2. Make your changes
3. Add tests if applicable
4. Run `npm test` to ensure nothing is broken
5. Commit with a clear message
6. Push and open a PR against `main`

**PR Checklist:**

- [ ] Code follows the project style
- [ ] Tests pass (`npm test`)
- [ ] JS files parse correctly (`node --check src/yourfile.js`)
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventional format

### Adding a New Channel

1. Create `src/channels/yourplatform.js`
2. Implement the channel interface:
   ```javascript
   export class YourChannel {
     constructor(config, agent) { }
     async init(httpServer) { }
     async send(target, message) { }
     async shutdown() { }
   }
   ```
3. Register in `src/channels/manager.js`
4. Add config options to `src/config.js` and `.env.example`
5. Add documentation in `docs/channels.md`
6. Open a PR

### Adding a New Skill

1. Create `examples/skills/your-skill/SKILL.md`
2. Follow the [SKILL.md format](./docs/skills.md)
3. Test by copying to `workspace/skills/` and running the gateway
4. Open a PR

### Adding a New Tool

1. Create `src/tools/your-tool.js`
2. Register in `src/tools/registry.js`:
   - Add to `getToolDefinitions()` with proper JSON schema
   - Add handler in `init()`
3. Add tests in `tests/`
4. Open a PR

## Reporting Issues

- **Bugs**: Include steps to reproduce, expected vs actual behavior, and your environment (OS, Node version)
- **Features**: Describe the use case and proposed solution
- **Security**: See [SECURITY.md](./SECURITY.md) — do NOT open a public issue

## Code of Conduct

Be respectful, constructive, and inclusive. We're building something together.

---

*The ether connects all contributors. ✦*
