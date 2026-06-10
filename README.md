# Microsoft To Do Safe MCP

A local-first Microsoft To Do MCP server for AI-assisted task cleanup with backup, preview, confirmation, and audit safeguards.

This repository is a safety-focused fork of `jordanburke/microsoft-todo-mcp-server`. The goal is not to expose every Microsoft To Do CRUD operation directly to an AI assistant. The goal is to let an AI propose structured cleanup plans, preview the exact effects, and apply them only after explicit confirmation.

## What This Is

This project sits between an AI assistant and Microsoft To Do:

```text
Codex / Claude / local LLM
  -> Safe MCP tools
  -> Microsoft Graph API
  -> Microsoft To Do
```

It is intended for personal task backlog cleanup:

- read visible Microsoft To Do lists and tasks
- export complete JSON backups
- validate AI-generated cleanup plans
- preview planned changes before any write
- require exact confirmation before applying
- write JSON Lines audit logs
- avoid permanent delete by default
- prefer soft archive lists such as Archive, Someday, and Needs Review

## Current Status

Implemented:

- community repository evaluation notes
- device-code authentication for remote/iPhone operation
- doctor script for live Microsoft Graph To Do compatibility checks
- conservative local safe-plan proposal script
- full JSON backup export
- MCP backup-based `propose_plan` tool
- safe list setup for Archive, Someday, and Needs Review
- strict safe-plan schema validation
- dry-run plan preview with saved `preview_id`
- confirmation-gated `apply_plan`
- JSON Lines audit log output
- read-only backup restore preview
- default hiding of direct destructive tools

Not implemented:

- GUI
- VPS deployment
- SQLite registry fallback
- permanent delete
- restore apply
- arbitrary Graph request tool

## Safety Model

By default, direct dangerous upstream tools are not registered:

- task delete
- task-list delete
- checklist delete
- unrestricted update/create helpers
- destructive archive helper
- Graph exploration helper

Set `MSTODO_ENABLE_UNSAFE_TOOLS=1` only if you intentionally want the original low-level tools exposed.

The supported AI write path is:

```text
validate_plan -> preview_plan -> apply_plan
```

`apply_plan` always:

- validates the plan again
- requires a matching saved `preview_id`
- requires the exact confirmation phrase returned by `preview_plan`
- creates a full backup before writing
- writes JSON Lines audit events
- defaults to fail-fast
- preserves success mappings on partial failure

Soft move operations are implemented as:

```text
copy task to Archive/Someday/Needs Review
copy checklist items when available
mark original task completed
```

The original task is not deleted.

## Allowed Plan Operations

Plan schema version `1.0` allows:

- `move_to_archive`
- `move_to_someday`
- `move_to_needs_review`
- `complete`
- `update`
- `create_checklist_item`

Version `1.0` rejects:

- `delete`
- `delete_task_list`
- silent overwrite
- apply without preview
- source-list mismatch
- missing task IDs

See [docs/SAFE_PLAN_WORKFLOW.md](docs/SAFE_PLAN_WORKFLOW.md).

## Prerequisites

- Node.js 22 or newer
- Corepack / pnpm
- Microsoft account with Microsoft To Do enabled
- Microsoft Entra / Azure app registration for OAuth

No Azure hosting is required. The app registration is only used as an OAuth client identity.

## Install

```powershell
git clone https://github.com/Saenai/microsoft-todo-safe-mcp.git
cd microsoft-todo-safe-mcp
corepack pnpm install
corepack pnpm run build
```

## Azure / Microsoft App Registration

Recommended setup for personal Microsoft accounts and remote Codex/iPhone operation:

- app type: public client
- tenant: `consumers`
- login flow: device code
- client secret: not needed

Required delegated Microsoft Graph permissions:

- `User.Read`
- `Tasks.Read`
- `Tasks.ReadWrite`
- `Tasks.Read.Shared`
- `Tasks.ReadWrite.Shared`
- `offline_access`
- `openid`
- `profile`

Full setup checklist: [docs/AZURE_APP_REGISTRATION.md](docs/AZURE_APP_REGISTRATION.md).

## Authenticate

Set the app registration client ID:

```powershell
$env:CLIENT_ID = "<application-client-id>"
$env:TENANT_ID = "consumers"
```

Start device-code login:

```powershell
corepack pnpm run auth:device -- --start-only
```

Open the printed URL on your phone or browser, enter the code, and sign in.

Then complete token retrieval on the machine running the MCP server:

```powershell
corepack pnpm run auth:device -- --complete
```

Tokens are stored under the local user profile:

```text
%APPDATA%\microsoft-todo-mcp\tokens.json
```

Do not commit or share token files.

## Verify Microsoft To Do Compatibility

Run:

```powershell
corepack pnpm run doctor
```

The doctor checks:

- OAuth token availability
- `GET /me`
- `GET /me/todo/lists`
- visible list enumeration
- per-list task counts
- temporary list create/delete
- temporary task create/read/update/complete/delete

The doctor redacts tokens and client secrets from reports.

## MCP Tools

Safe tools:

- `setup_safe_lists`
- `export_backup`
- `propose_plan`
- `validate_plan`
- `preview_plan`
- `apply_plan`
- `restore_preview`
- read/list tools inherited from the base server

Unsafe low-level tools are hidden unless `MSTODO_ENABLE_UNSAFE_TOOLS=1`.

## Safe Plan Workflow

1. Call `setup_safe_lists`.
2. Call `export_backup`.
3. Generate a conservative starter plan with either the MCP tool:

   ```text
   propose_plan
   ```

   or the local CLI:

   ```powershell
   corepack pnpm run propose:plan -- --backup safe-data/backups/<backup>.json --limit 5
   ```

4. Review or edit the generated schema version `1.0` plan.
5. Call `validate_plan`.
6. Call `preview_plan`.
7. Review `preview_id`, `confirmation_phrase`, and effects.
8. Call `apply_plan` with the same plan, matching `preview_id`, and exact confirmation phrase.

Local outputs:

```text
safe-data/backups/
safe-data/plans/
safe-data/previews/
safe-data/audit/
```

`safe-data/` is ignored by git because it may contain personal task data.

## Development

```powershell
corepack pnpm test
corepack pnpm run typecheck
corepack pnpm run format:check
corepack pnpm run build
```

Useful scripts:

- `corepack pnpm run auth:device`
- `corepack pnpm run doctor`
- `corepack pnpm run export:backup`
- `corepack pnpm run propose:plan -- --backup safe-data/backups/<backup>.json --limit 5`
- `corepack pnpm run test:doctor`
- `corepack pnpm run typecheck:doctor`

## Documentation

- [docs/REPOSITORY_EVALUATION.md](docs/REPOSITORY_EVALUATION.md): community repository review
- [docs/DECISIONS.md](docs/DECISIONS.md): implementation decisions and verified facts
- [docs/AZURE_APP_REGISTRATION.md](docs/AZURE_APP_REGISTRATION.md): app registration setup
- [docs/SAFE_PLAN_WORKFLOW.md](docs/SAFE_PLAN_WORKFLOW.md): plan validation, preview, and apply flow

## Security Notes

- Token files are sensitive.
- Backups and audit logs may contain personal task metadata.
- This project intentionally avoids permanent delete in the safe plan flow.
- Do not expose unsafe tools to an autonomous AI assistant unless you understand the risk.
- Keep the repository private if you add personal plans, backups, logs, screenshots, or account-specific notes.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgments

Forked from [jordanburke/microsoft-todo-mcp-server](https://github.com/jordanburke/microsoft-todo-mcp-server), itself a fork of `@jhirono/todomcp`.
