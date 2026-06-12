---
name: microsoft-todo-safe-mcp
description: Use when Codex needs to inspect, validate, operate, or integrate the local Microsoft To Do Safe MCP project on this laptop, including Microsoft To Do task/list management, safe plan workflows, MCP server startup checks, token-safe diagnostics, laptop-side health checks, and deciding whether to run doctor/test/typecheck/build. Do not use for generic todo advice unrelated to the local Microsoft To Do MCP server.
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
are not available in the active session, explain that Codex loads MCP servers at
session start and ask the user to restart/reopen Codex after config changes.

## Repository And Install Locations

- Repository source copy: `D:\SharedSpace\CODEX\projects\microsoft-todo-safe-mcp\.codex\skills\microsoft-todo-safe-mcp`
- Installed local copy: `C:\Users\higik\.codex\skills\microsoft-todo-safe-mcp`
- Server source/build root inside the skill: `server\`

Treat the repository copy as the versioned source of truth. Sync it to the
installed local copy when changing skill behavior.

Install or refresh the local copy with:

```powershell
powershell -ExecutionPolicy Bypass -File .codex\skills\microsoft-todo-safe-mcp\scripts\install.ps1
```

The installer copies the complete skill package, installs/builds the bundled
server, updates `C:\Users\higik\.codex\config.toml`, and runs an MCP smoke test.

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

- Repository: `D:\SharedSpace\CODEX\projects\microsoft-todo-safe-mcp`
- Installed server: `C:\Users\higik\.codex\skills\microsoft-todo-safe-mcp\server`
- Token: `%APPDATA%\microsoft-todo-mcp\tokens.json`
- Handoff report: `D:\SharedSpace\CODEX\handoff\outbox\ai-todo-laptop-agent-report-2026-06-11.md`

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

For normal MCP server startup, prefer the built server entry:

```powershell
cd C:\Users\higik\.codex\skills\microsoft-todo-safe-mcp\server
node dist\todo-index.js
```

The server is stdio-based. It should be launched by an MCP host or by a test
harness that keeps stdin open.

To smoke-test the configured server without touching Microsoft Graph:

```powershell
node C:\Users\higik\.codex\skills\microsoft-todo-safe-mcp\scripts\mcp_smoke.mjs
```

This only runs `initialize` and `tools/list`.

## Diagnostics

Use light checks first:

```powershell
cd C:\Users\higik\.codex\skills\microsoft-todo-safe-mcp\server
git status --short --branch
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
