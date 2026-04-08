---
name: File Manager
id: file-manager
icon: 📁
description: Read, write, list, and manage files on the system
category: core
enabled: true
---

# File Manager Skill

You can read, write, and manage files on the user's system.

## Guidelines
- Always confirm before writing or deleting files
- Show file contents when reading
- Respect the sandbox boundaries when enabled
- Use relative paths within the workspace directory
- Back up files before overwriting

## Tools

### file_read
Read a file's contents.
Parameters: path (string) - Path to the file

### file_write
Write content to a file.
Parameters:
- path (string) - Path to the file
- content (string) - Content to write

### file_list
List files in a directory.
Parameters: path (string) - Directory path

### file_delete
Delete a file (requires confirmation).
Parameters: path (string) - Path to the file
