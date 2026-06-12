# CLAUDE.md

This repository is a safety-focused fork of `jordanburke/microsoft-todo-mcp-server`.

## Development Commands

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm run typecheck
corepack pnpm run format:check
corepack pnpm run build
```

Doctor and auth helpers:

```bash
corepack pnpm run auth:device
corepack pnpm run doctor
corepack pnpm run typecheck:doctor
```

## Architecture

- `src/todo-index.ts`: MCP server and Microsoft Graph tool wiring.
- `src/safe-plan.ts`: strict safe-plan validation, preview records, confirmation phrase logic, safe apply execution, and audit event shaping.
- `src/oauth-refresh.ts`: refresh-token request builder shared by runtime and doctor scripts.
- `scripts/auth-device.ts`: device-code auth for remote operation.
- `scripts/doctor.ts`: live Microsoft To Do compatibility diagnostics.

## Safety Rules

- The supported AI write path is `validate_plan -> preview_plan -> apply_plan`.
- `apply_plan` must require a matching saved `preview_id` and exact confirmation phrase.
- `apply_plan` must create a backup before any write.
- Audit logs must not include tokens or full task bodies.
- Permanent delete is not part of the safe plan schema.
- Direct upstream destructive tools must stay hidden unless `MSTODO_ENABLE_UNSAFE_TOOLS=1`.

## Local Data

Do not commit:

- `tokens.json`
- `.mstodo-device-session.json`
- `safe-data/`
- `.env`

These may contain tokens or personal task data.
