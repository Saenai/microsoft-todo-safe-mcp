# Decisions: Safe AI Microsoft To Do Management

Date: 2026-06-10

## Current Decision

Choose Scheme A provisionally: continue from `jordanburke/microsoft-todo-mcp-server` on branch `feat/safe-ai-task-management`.

This was provisional until the doctor was run against a real personal Microsoft account. The live doctor result on 2026-06-10 passed, so Scheme A remains the current path.

## Verified Facts

- Branch created: `feat/safe-ai-task-management`.
- The selected base is a small TypeScript To Do-specific MCP server.
- It already has Graph calls for task lists, tasks, and checklist items.
- It uses stdio MCP transport.
- It has direct destructive tools exposed in source: task list delete, task delete, checklist item delete.
- It has no full JSON backup, no structured AI plan schema, no general dry-run plan preview, no confirmation-gated apply, and no JSON Lines audit log.
- A doctor script and tests were added:
  - `scripts/doctor.ts`
  - `scripts/doctor.test.ts`
  - `pnpm run doctor`
  - `pnpm run test:doctor`
- Live doctor result on 2026-06-10:
  - Account: personal Microsoft account, redacted for repository publishing
  - Visible lists: 33
  - `GET /me`: passed
  - `GET /me/todo/lists`: passed
  - Per-list task counts: passed
  - Temporary list create/delete: passed
  - Temporary task create/read/update/complete/delete: passed

## README Claims Not Yet Live Verified

- Personal Microsoft accounts may have Graph To Do limitations.
- Akkilesh's SQLite registry fixes custom-list visibility for personal accounts.
- Jordan's auth flow works for the user's target personal account when `TENANT_ID=consumers` or `common`.

## Items Requiring Real Personal Account Test

Completed on 2026-06-10 for a personal Microsoft account:

- `GET /me` succeeds.
- `GET /me/todo/lists` succeeds.
- 33 visible lists were returned and counted.
- Creating, reading, updating, completing, and deleting a temporary task works.
- Creating and deleting a temporary list works.
- No `MailboxNotEnabledForRESTAPI` occurred in this test.

Still not independently proven:

- Whether Microsoft To Do UI has more than 33 visible lists. If the UI shows more, create `docs/PERSONAL_ACCOUNT_COMPATIBILITY.md` and choose Scheme B.

## Doctor Script

Run from repository root:

```powershell
corepack pnpm install
corepack pnpm run doctor
```

## iPhone / Codex Remote Operation

When operating this home PC through the ChatGPT iOS client, the browser is on the iPhone and `localhost` is not the PC. Use device-code authentication instead of the `localhost:3000/callback` browser flow.

Detailed Azure / Microsoft Entra setup instructions are in `docs/AZURE_APP_REGISTRATION.md`.

Temporary diagnostic login, without creating an Azure App Registration:

```powershell
corepack pnpm run auth:device -- --diagnostic-public-client --start-only
```

The script prints a Microsoft URL and short code, saves a temporary device session, and exits. Open the URL on the iPhone, enter the code, and sign in to the Microsoft account used for To Do.

After signing in on the iPhone, complete token retrieval on the PC:

```powershell
corepack pnpm run auth:device -- --complete
```

After login:

```powershell
corepack pnpm run doctor
```

Diagnostic mode uses Microsoft's well-known Graph Command Line Tools public client ID. This is acceptable only for proving whether the To Do API works with the account. Long-term use should create a dedicated app registration and run:

```powershell
$env:CLIENT_ID = "<your app client id>"
$env:TENANT_ID = "consumers"
corepack pnpm run auth:device -- --start-only
corepack pnpm run auth:device -- --complete
```

JSON report:

```powershell
corepack pnpm run doctor -- --json
```

The doctor checks:

1. OAuth token availability.
2. `GET /me`.
3. `GET /me/todo/lists`.
4. Visible lists.
5. Per-list task counts.
6. Temporary test list creation.
7. Temporary test task creation.
8. Temporary test task read.
9. Temporary test task update.
10. Temporary test task completion.
11. Temporary test task deletion.
12. Temporary test list deletion.

The doctor redacts tokens, refresh tokens, client secrets, authorization headers, and token-like text from reports.

## OAuth Configuration

Use a Microsoft Entra app registration with delegated permissions. For a personal Microsoft account, prefer:

```powershell
$env:TENANT_ID = "consumers"
```

or:

```powershell
$env:TENANT_ID = "common"
```

Required environment variables for the existing auth flow:

```powershell
$env:CLIENT_ID = "<app-client-id>"
$env:CLIENT_SECRET = "<app-client-secret>"
$env:REDIRECT_URI = "http://localhost:3000/callback"
$env:TENANT_ID = "consumers"
```

Required delegated permissions:

- `offline_access`
- `openid`
- `profile`
- `User.Read`
- `Tasks.Read`
- `Tasks.Read.Shared`
- `Tasks.ReadWrite`
- `Tasks.ReadWrite.Shared`

Authenticate with the existing server flow:

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm run auth
```

Then open the local auth URL, complete consent, and run:

```powershell
corepack pnpm run doctor
```

Token storage note: the current base stores tokens in plain JSON. Treat the token file as sensitive. Do not paste it into chat or commit it.

## Local Running Notes

This repository declares `packageManager: pnpm@10.21.0`. On this machine, `pnpm` was not directly on PATH, but `corepack pnpm --version` returned `10.21.0`.

Use `corepack pnpm ...` commands unless `pnpm` is installed globally.

No VPS, GUI, SQLite, or web service was added in this phase.

## Safety Risk List

- Direct destructive MCP tools are currently registered.
- `archive-completed-tasks` is not just archive metadata; it creates a copy and deletes the source task.
- Token files may include client secrets.
- The auth server has historically verbose logs and must not be used to publish token data.
- There is no backup-before-write guarantee yet.
- There is no JSON Lines audit log yet.
- There is no plan validation or source-list mismatch protection yet.
- There is no explicit user confirmation gate for bulk changes yet.
- There is no restore preview yet.
- There is no hard-delete protection except by convention.

## Next Decision Gate

Run `pnpm run doctor` against the real personal account.

Choose:

- Scheme A: if Jordan reads all personal lists and all doctor write/delete checks pass.
- Scheme B: if custom list enumeration is incomplete. Only then port the minimum local registry idea from Akkilesh, without requiring VPS.
- Scheme C: if Jordan's architecture blocks safe extension after live test. Consider Vexxhost, but first resolve the client ID risk.
- Scheme D: only if all MCP bases are unsuitable. Extract only a minimal Graph client from reviewed code; do not rewrite from scratch without evidence.

## Next Minimal Implementation Plan

Completed in the current phase:

1. Added a default safety filter for legacy direct tools. Unless `MSTODO_ENABLE_UNSAFE_TOOLS=1`, direct create/update/delete/checklist-write/archive/exploration tools are not registered.
2. Added `setup_safe_lists` to create or bind Archive, Someday, and Needs Review.
3. Added `export_backup` to dump all visible lists, tasks, and checklist items to timestamped JSON under local `safe-data/backups/`.
4. Added strict Zod schema validation for plan version `1.0`.
5. Added `validate_plan` and `preview_plan`; preview does not write to Microsoft To Do.
6. Added tests for schema rejection, source list mismatch, missing task, preview behavior, backup envelope shape, and audit redaction.

Completed in the second phase:

1. Added `apply_plan` as the only safe write path for AI-generated plans.
2. `preview_plan` now writes a local preview record and returns a `preview_id` plus exact confirmation phrase.
3. `apply_plan` refuses to run unless the matching preview record exists and the caller supplies the exact confirmation phrase.
4. `apply_plan` automatically validates again, creates a full backup before writing, writes JSON Lines audit events, and defaults to fail-fast.
5. Soft move operations use copy-to-safe-list plus complete-original. They do not delete the original task.
6. Soft move copies checklist items when the source task data includes them.
7. Added `restore_preview` as a read-only backup summary tool. Restore apply remains unsupported.

Detailed usage is in `docs/SAFE_PLAN_WORKFLOW.md`.

Deferred:

1. Actual restore apply is not implemented.
2. Permanent delete remains unsupported.

## Non-Goals For This Phase

- No GUI.
- No VPS deployment.
- No new web service.
- No SQLite until proven necessary.
- No arbitrary Graph request tool.
- No permanent delete implementation.
