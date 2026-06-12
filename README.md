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

Then initialize the installed skill copy. For a project-local Codex install,
run:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\skills\microsoft-todo-safe-mcp\scripts\install.ps1
```

The `skills` CLI only copies the skill package. The bundled `install.ps1`
installs and builds the MCP server in the installed copy, updates the local
Codex MCP config, and runs the smoke test. If the skill is installed to a
different directory, run that copy's `scripts\install.ps1`.

After installing, restart/reopen Codex so it reloads skills and MCP servers.

Token values are not part of this repository. They must stay under:

```text
%APPDATA%\microsoft-todo-mcp\tokens.json
```
