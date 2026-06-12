---
name: microsoft-todo-safe-mcp
description: Inspect, validate, operate, and develop a self-contained Microsoft To Do Safe MCP skill with bundled server. Use for Microsoft To Do task/list management, safe backup/plan/preview/apply workflows, MCP startup checks, token-safe diagnostics, and deciding whether to run doctor/test/typecheck/build.
license: MIT; server/LICENSE has complete terms.
metadata:
  agentskills_version: "2026-06"
  bundled_server: "true"
  mcp_server_name: microsoft_todo_safe
  compatibility: Windows PowerShell, Node.js 22+, Corepack/pnpm, outbound HTTPS, token file in AppData
---

# Microsoft To Do Safe MCP

## User Entry Points

Use this skill when the user says things like:

- "use my Microsoft To Do"
- "check my todo MCP"
- "list my To Do lists"
- "plan a safe cleanup of my Microsoft To Do tasks"
- "backup/export To Do"
- "diagnose the Microsoft To Do MCP server"

In a fresh Codex session, the paired MCP server should appear as
`microsoft_todo_safe` from `C:\Users\higik\.codex\config.toml`. If the MCP tools
are not available in the active session, first check whether this installed
skill copy has been initialized. If initialization or config changes are needed,
explain that Codex loads MCP servers at session start and ask the user to
restart/reopen Codex after the initializer finishes.

## Repository And Install Locations

- Installed skill copy: this skill directory.
- Project-local install example: `<workspace>\.agents\skills\microsoft-todo-safe-mcp`
- User-wide install example: `%USERPROFILE%\.codex\skills\microsoft-todo-safe-mcp`
- Server source/build root inside the skill: `server\`

Treat the currently loaded skill directory as the source for operation. Do not
assume the user has cloned the development repository.

After installing this skill with a skills manager, initialize the bundled MCP
server from the installed skill copy:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\skills\microsoft-todo-safe-mcp\scripts\install.ps1
```

If the skill is installed somewhere else, run that copy's `scripts\install.ps1`.
By default the initializer installs/builds the bundled server in the current
skill copy, updates `%USERPROFILE%\.codex\config.toml`, and runs an MCP smoke
test. Use `-DestinationRoot` only when intentionally copying the skill to a
different skills directory.

Runtime requirements: Windows PowerShell, Node.js 22+, Corepack/pnpm, outbound
HTTPS for Microsoft Graph, and a token file at
`%APPDATA%\microsoft-todo-mcp\tokens.json`.

For script usage:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Help
```

## Core Rule

Treat Microsoft To Do as live user data. Prefer read-only inspection and safe
preview flows. Do not expose token contents, do not copy tokens into the repo,
and do not run destructive task/list operations unless the user explicitly asks
and the project safety flow requires confirmation.

## How To Use The Paired MCP Server

Prefer MCP tools when available. Expected safe tools include:

```text
auth-status
get-task-lists
get-task-lists-organized
get-tasks
get-checklist-items
export_backup
propose_plan
validate_plan
preview_plan
apply_plan
restore_preview
setup_safe_lists
```

Start with read-only tools. For user-facing changes, follow this order:

```text
export_backup -> propose_plan -> validate_plan -> preview_plan -> explicit user confirmation -> apply_plan
```

Never jump directly to `apply_plan` without backup, validation, preview, and
explicit confirmation.

## Local Paths

- Installed server: `%USERPROFILE%\.codex\skills\microsoft-todo-safe-mcp\server`
- Token: `%APPDATA%\microsoft-todo-mcp\tokens.json`

The token may be checked for existence, size, timestamps, field names, and
expiry metadata only. Never print token values.

## Startup Pattern

Use system Node from `C:\Program Files\nodejs`. Before assuming the MCP server
can run, verify:

```powershell
node --version
corepack pnpm --version
```

Expected baseline:

```text
node v22.22.3 or newer
pnpm 10.21.0 in this project
```

First-use readiness check:

```powershell
Test-Path .\server\dist\todo-index.js
```

Run this from the installed skill directory. If it returns `False`, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

For normal MCP server startup, prefer the built server entry:

```powershell
cd <installed-skill>\server
node dist\todo-index.js
```

The server is stdio-based. It should be launched by an MCP host or by a test
harness that keeps stdin open.

To smoke-test the configured server without touching Microsoft Graph:

```powershell
node <installed-skill>\scripts\mcp_smoke.mjs
```

This only runs `initialize` and `tools/list`.

## Diagnostics

Use light checks first:

```powershell
cd <installed-skill>\server
node --version
corepack pnpm --version
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm test
```

Treat `corepack pnpm run doctor` as a heavy manual diagnostic. It reaches
Microsoft Graph, enumerates lists, counts tasks, and creates/updates/deletes
temporary To Do items. Do not run it as a frequent health check or while trying
to keep the laptop responsive.

Read `references/operations.md` when planning service integration, load testing,
or deciding whether to run `doctor`.

## Safe Operating Guidance

- Keep unsafe direct tools disabled unless the user explicitly asks otherwise.
- Prefer plan/preview/backup/confirmation flows for changes.
- Stop and report if Graph returns authentication, mailbox, consent, throttling,
  or permission errors.
- If a command may run longer than 15-30 seconds, tell the user what it is doing
  and why before starting.
- Do not use parallel shell execution on this Windows laptop for this project;
  it has repeatedly triggered `CreateProcessWithLogonW 1056`.
- Keep file references relative to the skill root when editing this package.
