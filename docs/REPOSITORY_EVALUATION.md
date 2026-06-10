# Repository Evaluation: Safe AI Microsoft To Do Management

Date: 2026-06-10

Scope: source review of the requested community repositories plus a local build/test smoke check of the selected base. This is not yet a live Microsoft account verification.

## Summary

Recommendation for the first implementation base: use `jordanburke/microsoft-todo-mcp-server` with a safety wrapper and doctor script first.

Rationale:

- It is Microsoft To Do specific, TypeScript, small enough to audit, and already implements lists, tasks, checklist items, auth setup, token refresh, and stdio MCP.
- It exposes dangerous tools by default, so it is not safe as-is for AI-assisted bulk cleanup.
- It does not have built-in backup, structured plan validation, audit logging, or confirmation-gated apply.
- `akkilesh-a/microsoft-todo-mcp-server-self-hosted` should be treated as a targeted fallback for local list registry logic only if personal account list enumeration is proven incomplete.
- `vexxhost/microsoft-todo-mcp-server` is cleaner and uses official SDKs, but its reuse of the well-known Microsoft Graph Command Line Tools client ID is a security/product risk for a personal safety tool.
- `Softeria/ms-365-mcp-server` is mature and useful as a reference for filtering, audit log shape, and OAuth hardening, but it is much broader than this task and exposes generic Graph capabilities.
- `pnp/cli-microsoft365-mcp-server` and `pappde/todo-sync` are useful references, not good bases for this MCP safety layer.

## Comparison Matrix

| Repository                                         | Language / dependencies                                                  |                                                          Activity checked on 2026-06-10 | License                                             | OAuth flow                                                                                                                               | Token cache                                                                                                                                      | Personal Outlook account support                                                                                                     | Graph scopes                                                                                                                       | MCP transport             | Tools                                                                                                                                    | Checklist support                                                                             | Backup                   | Dry-run                                                              | Audit log                                      | Delete exposed by default                                                                                | Local fit                                              | VPS needed                                 | Main risks                                                                                                                                                                | Reuse                                                                                  | Avoid                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------: | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `jordanburke/microsoft-todo-mcp-server`            | TypeScript, pnpm, `@azure/msal-node`, MCP SDK, Express, Zod              |    Latest commit `4a2e3df` on 2025-11-10; GitHub API: 79 stars, 29 forks, 5 open issues | MIT in `LICENSE`; GitHub API returned `NOASSERTION` | Express auth server, confidential client auth-code flow, default tenant `organizations`; can use `common` or `consumers` via `TENANT_ID` | Plain JSON token file in app config dir or cwd; can store `clientSecret`; also env vars; `token-manager.ts` may update Claude config with tokens | Source has warnings for personal accounts; not live verified here                                                                    | `offline_access`, `openid`, `profile`, `Tasks.Read`, `Tasks.Read.Shared`, `Tasks.ReadWrite`, `Tasks.ReadWrite.Shared`, `User.Read` | stdio                     | 16 source-registered tools: auth status, list/get/create/update/delete lists/tasks, checklist CRUD, archive completed, Graph exploration | Yes                                                                                           | No full backup tool      | Only `archive-completed-tasks` has `dryRun`; no general plan dry-run | No                                             | Yes: `delete-task-list`, `delete-task`, `delete-checklist-item`; archive copies then deletes source task | Good: small To Do-specific server                      | No                                         | Plain token storage; verbose auth logging; dangerous CRUD exposed; archive is destructive; no plan schema; no backup/audit; default org tenant may confuse personal users | Graph request helper, auth setup, task/list/checklist tool code, stdio MCP wiring      | Direct delete tools as AI-facing tools; token logging/storage behavior; `test-graph-api-exploration` as default AI tool |
| `akkilesh-a/microsoft-todo-mcp-server-self-hosted` | TypeScript, npm, MSAL, Express, MCP SDK, `better-sqlite3`                |                     Latest commit `d76ad0b` on 2026-03-13; GitHub API: 4 stars, 0 forks | MIT                                                 | HTTP dashboard and auth-code flow, default tenant `consumers`                                                                            | Plain `tokens.json`, includes client credentials; local `lists.db` registry                                                                      | README claims it fixes personal account custom list omission; source merges Graph lists with SQLite registry; not live verified here | Same To Do delegated scopes as Jordan                                                                                              | Streamable HTTP           | Similar full To Do CRUD plus organized list view and archive                                                                             | Yes                                                                                           | No full backup tool      | Only archive dry-run                                                 | No                                             | Yes: delete list/task/checklist; archive deletes source task                                             | Good locally, but less aligned with current stdio base | No, despite "self-hosted"; can run locally | HTTP server surface, optional API key disabled by default, dashboard auth optional, SQLite registry only tracks lists seen/created through server                         | `list-registry.ts` if personal list omission is proven; paged request helper           | VPS/dashboard/API-key surface for first phase; importing SQLite before proof                                            |
| `vexxhost/microsoft-todo-mcp-server`               | Python 3.11, `mcp[cli]`, `msgraph-sdk`, `azure-identity`, `platformdirs` |       Latest commit `3f8f11d` on 2026-06-10; GitHub API: 0 stars, 1 fork, 2 open issues | Apache-2.0                                          | `InteractiveBrowserCredential` with `AZURE_TENANT_ID` default `common`                                                                   | Azure Identity persistent token cache under platform config; `allow_unencrypted_storage=True`; stores auth record                                | Likely supports personal via `common`; not live verified                                                                             | `Tasks.ReadWrite`, `User.Read`                                                                                                     | stdio                     | 13 typed CRUD tools for lists, tasks, checklist                                                                                          | Yes                                                                                           | No                       | No                                                                   | No                                             | Yes: delete task list/task/checklist                                                                     | Good local footprint                                   | No                                         | Uses well-known Graph CLI client ID `14d82eec-204b-4c2f-b7e8-296a70dab67e`; less control over app identity/consent; destructive tools exposed                             | Typed result models; official SDK usage; tool annotations                              | Reusing the well-known client ID for a safety-sensitive personal tool without explicit acceptance                       |
| `pappde/todo-sync`                                 | C#/.NET, Microsoft Graph SDK, MSAL.NET                                   |                      Latest commit `26384f9` on 2023-07-13; GitHub API: 1 star, 0 forks | No LICENSE file found                               | MSAL public client interactive flow with loopback redirect                                                                               | MSAL V3 cache protected with Windows DPAPI next to app assembly                                                                                  | Historical source examples use Hotmail-style personal account data; not live verified                                                | `user.read`, `tasks.read`; config says `SupportsWrite=false`                                                                       | None; CLI only            | Export/sync/list commands, not MCP                                                                                                       | Export model includes checklist items                                                         | Yes: JSON export by list | Sync has preview mode                                                | No                                             | File-side hard delete option for exported files, not Graph deletes                                       | Useful as backup reference, not as MCP base            | No                                         | Old, no MCP, read-only Graph config, no license, .NET project overhead                                                                                                    | Export folder layout, deleted-file staging ideas, pagination issue notes               | As a base for MCP server                                                                                                |
| `Softeria/ms-365-mcp-server`                       | TypeScript/npm, MSAL, MCP SDK, Express, Winston, generated Graph tools   | Latest commit `a004cee` on 2026-06-09; GitHub API: 771 stars, 301 forks, 13 open issues | MIT                                                 | Public client for stdio/device/browser flows; HTTP OAuth 2.1 mode; custom client support                                                 | Keytar optional; file fallback; custom cache command; selected-account pinning                                                                   | Broad "personal" preset includes To Do endpoints; not live verified for this task                                                    | Dynamic from enabled tools; To Do endpoints use Tasks scopes; supports `--allowed-scopes`                                          | stdio and Streamable HTTP | Broad generated Graph tools plus discovery/search/execute; To Do list/task tools present                                                 | No first-class To Do checklist endpoint found in reviewed endpoints; Planner checklist exists | No To Do backup          | No plan dry-run                                                      | Yes: structured audit log for tool invocations | Yes unless `--read-only` or filtering used                                                               | Local possible                                         | No, but HTTP deployment supported          | Too broad; generic Graph execution is dangerous for AI cleanup; high complexity                                                                                           | Audit log patterns, read-only/tool filtering, scope diagnostics, token redaction ideas | Using generic `execute-tool` / arbitrary Graph surface as the default To Do organizer                                   |
| `pnp/cli-microsoft365-mcp-server`                  | TypeScript/npm, MCP SDK, Fuse; depends on global `@pnp/cli-microsoft365` |   Latest commit `b722a26` on 2026-05-22; GitHub API: 111 stars, 25 forks, 6 open issues | MIT                                                 | Delegates auth to CLI for Microsoft 365                                                                                                  | CLI-owned token cache                                                                                                                            | Depends on CLI command support and login; not To Do specific                                                                         | CLI-owned                                                                                                                          | stdio                     | Search CLI commands, get command docs, run CLI command, best practices                                                                   | Depends on CLI command availability                                                           | Not To Do-specific       | No                                                                   | No                                             | Can run arbitrary allowed `m365 ...` commands; not delete-specific                                       | Good for M365 admin tasks, not this                    | No                                         | Shell execution surface, global CLI dependency, not To Do-specific                                                                                                        | Command allowlist pattern and docs-before-run workflow                                 | As base for personal task cleanup                                                                                       |

## Source Findings By Requirement

### Language and dependencies

- Jordan and Akkilesh are TypeScript MCP servers with `@azure/msal-node`, `@modelcontextprotocol/sdk`, Express, and Zod. Jordan uses pnpm; Akkilesh uses npm and adds `better-sqlite3`.
- Vexxhost is Python and uses Microsoft Graph SDK plus Azure Identity.
- Pappde is a C# CLI, not MCP.
- Softeria and PnP are TypeScript MCP servers, but both target broad Microsoft 365 use rather than To Do-only safety.

### OAuth flow and token cache

- Jordan uses a local Express auth server with `ConfidentialClientApplication` and auth-code flow. The default tenant is `organizations`; personal accounts require explicit `TENANT_ID=consumers` or `common`. The token file is JSON and may include `clientSecret`.
- Akkilesh inlines similar auth into an HTTP server and defaults tenant to `consumers`.
- Vexxhost uses `InteractiveBrowserCredential` and a known Microsoft first-party client ID.
- Pappde uses MSAL public-client interactive login and Windows DPAPI-protected MSAL cache.
- Softeria has the most hardened token/cache design: keytar if available, fallback files, cache adapter option, account pinning, and log redaction.
- PnP delegates all auth to the global CLI for Microsoft 365.

### Personal account compatibility

Verified from source only:

- Jordan warns that personal Microsoft accounts may hit `MailboxNotEnabledForRESTAPI`; it does not implement a registry fallback.
- Akkilesh has a SQLite list registry and merges registry rows with Graph results. This can preserve lists created through the MCP server, but it cannot magically discover existing custom lists that Graph omits unless they were previously registered.
- Pappde has historical notes around list pagination and personal-account-looking sample data.

Not verified:

- Whether this user's personal Outlook account returns all custom lists from `GET /me/todo/lists`.
- Whether `MailboxNotEnabledForRESTAPI` occurs for this account.
- Whether list omission is still present in Microsoft Graph as of the live account test.

### MCP transport

- Jordan and Vexxhost are stdio-only.
- Akkilesh is Streamable HTTP-only.
- Softeria supports stdio and Streamable HTTP with OAuth mode.
- PnP is stdio.
- Pappde is not MCP.

### Tools and safety

Jordan currently registers direct destructive tools. It also registers `archive-completed-tasks`, but that implementation copies tasks to a target list and then deletes the source task. It has a `dryRun` flag, but this is not a general plan preview or safety layer.

No reviewed To Do-specific MCP server already provides the required full chain:

- complete JSON backup
- strict AI plan schema validation
- general dry-run preview
- explicit confirmation-gated apply
- JSON Lines audit log
- default prohibition on permanent delete
- soft archive lists such as Archive, Someday, Needs Review

Softeria has reusable ideas for audit logging, token redaction, read-only mode, scope allowlists, and tool filtering. It is too broad to expose directly for this task.

## Recommended Reuse

From Jordan:

- Existing auth setup and token refresh path, after reducing token exposure.
- Existing task list, task, checklist item endpoint code.
- Stdio MCP entrypoint.
- Existing Zod dependency for plan schema validation later.

From Akkilesh only if needed:

- `list-registry.ts` pattern for a local list registry, after live proof that personal custom list enumeration is incomplete.

From Vexxhost:

- Typed result model shape and clean tool annotations as reference.

From Pappde:

- Backup folder layout and sync/deleted staging concepts.

From Softeria:

- Audit-log event shape, redaction approach, read-only/tool filtering patterns, and scope diagnostics.

## Recommended Avoidance

- Do not expose direct delete/update/list-delete tools to AI by default.
- Do not use arbitrary Graph request or broad command execution as the organizer interface.
- Do not require VPS or HTTP dashboard for the first phase.
- Do not add SQLite until a live account test proves it solves a real issue.
- Do not reuse Vexxhost's well-known first-party client ID without explicit risk acceptance.
- Do not log tokens, refresh tokens, client secrets, or full task bodies by default.
