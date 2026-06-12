# Microsoft To Do Safe MCP Skill

This repository is packaged as a Codex skill. The skill is the source of truth
for both operating instructions and server development.

Skill source:

```text
skills/microsoft-todo-safe-mcp
```

Server source:

```text
skills/microsoft-todo-safe-mcp/server
```

Install with the `vercel-labs/skills` CLI from the repository root:

```powershell
npx skills add . --skill microsoft-todo-safe-mcp -a codex --copy
```

Install or refresh the local Codex skill copy:

```powershell
powershell -ExecutionPolicy Bypass -File skills\microsoft-todo-safe-mcp\scripts\install.ps1
```

The `skills` CLI copies the skill package. The bundled `install.ps1` also
installs and builds the MCP server, updates the local Codex MCP config, and runs
the smoke test.

After installing, restart/reopen Codex so it reloads skills and MCP servers.

Token values are not part of this repository. They must stay under:

```text
%APPDATA%\microsoft-todo-mcp\tokens.json
```
