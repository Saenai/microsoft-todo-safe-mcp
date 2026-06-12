# Microsoft To Do Safe MCP Skill

This repository is packaged as a Codex skill. The skill is the source of truth
for both operating instructions and server development.

Skill source:

```text
.codex/skills/microsoft-todo-safe-mcp
```

Server source:

```text
.codex/skills/microsoft-todo-safe-mcp/server
```

Install or refresh the local Codex skill copy:

```powershell
powershell -ExecutionPolicy Bypass -File .codex\skills\microsoft-todo-safe-mcp\scripts\install.ps1
```

After installing, restart/reopen Codex so it reloads skills and MCP servers.

Token values are not part of this repository. They must stay under:

```text
%APPDATA%\microsoft-todo-mcp\tokens.json
```
