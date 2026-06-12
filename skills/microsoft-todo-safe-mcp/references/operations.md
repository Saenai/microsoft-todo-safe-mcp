# Operations Reference

## Current Laptop Baseline

- System Node: `v22.22.3`
- npm registry: `https://registry.npmjs.org/`
- Project pnpm: `10.21.0`
- Idle MCP server working set: about 42-46 MB
- Idle CPU: effectively flat after startup
- Installed skill/server: `%USERPROFILE%\.codex\skills\microsoft-todo-safe-mcp\server`
- Repository source: `skills\microsoft-todo-safe-mcp`

## Known Fixes Applied

`src/todo-index.ts` was adjusted so Windows direct startup works and startup no
longer calls Microsoft Graph unless explicitly enabled with:

```powershell
$env:MSTODO_STARTUP_ACCOUNT_CHECK = '1'
```

## Command Cost

Lightweight:

```powershell
node --version
corepack pnpm --version
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm test
```

Heavy:

```powershell
corepack pnpm run doctor
```

`doctor` should be reserved for explicit validation because it performs live
Graph calls and temporary To Do mutations.

## Token Safety

Allowed token checks:

- file exists
- file size
- last write time
- JSON field names
- expiry timestamp
- boolean presence of access/refresh/client fields

Forbidden:

- printing token values
- copying the token into the project
- committing token contents
- including token values in reports, logs, or chat

## Integration Recommendation

Use a self-contained skill package:

- Skill files: task selection, safety rules, operational workflow, diagnostics policy
- Bundled `server/`: OAuth, Microsoft Graph, To Do reads/writes, safe plan execution
- `scripts/install.ps1`: copies the skill, installs/builds the server, updates Codex config, and runs smoke validation
- `scripts/validate_agentskill.mjs`: validates the skill against the core agentskills.io structural rules

Do not store OAuth token values inside the skill. Token storage remains under
`%APPDATA%\microsoft-todo-mcp\tokens.json`.
