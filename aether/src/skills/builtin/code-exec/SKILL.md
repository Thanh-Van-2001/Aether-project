---
name: Code Execution
id: code-exec
icon: ⚡
description: Execute code snippets in a sandboxed environment
category: core
enabled: true
---

# Code Execution Skill

You can execute code in a sandboxed environment. Supported languages:
- **JavaScript/Node.js** — Full Node.js runtime
- **Python** — Python 3 with common libraries
- **Bash** — Shell commands (restricted in sandbox mode)

## Guidelines
- Always explain what the code does before executing
- Warn about potentially destructive operations
- In sandbox mode, file system access is restricted
- Show both the code and its output
- Handle errors gracefully and explain them

## Tools

### shell_exec
Execute a shell command or script.
Parameters:
- command (string) - The command to execute
- language (string) - "bash", "node", "python" (default: "bash")
- timeout (number) - Max execution time in ms (default: 30000)
