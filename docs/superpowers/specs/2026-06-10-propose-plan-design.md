# Conservative Plan Proposal Design

Date: 2026-06-10

## Goal

Add a local strategy generator that reads an exported Microsoft To Do backup and proposes a small, conservative safe-plan JSON file.

## Scope

The first version only proposes these operations:

- `move_to_needs_review`
- `move_to_someday`
- `create_checklist_item`

It must not propose:

- `complete`
- `move_to_archive`
- `update`
- `delete`
- `delete_task_list`

The proposal script does not write to Microsoft To Do. It only writes a local plan file that must still go through `validate_plan`, `preview_plan`, and `apply_plan`.

## Strategy

The generator reads `schema_version: "1.0"` backup files produced by `export_backup`.

It skips completed tasks and tasks with near due dates. It proposes at most the configured limit, defaulting to 5.

Heuristics:

- Task titles that look vague, blocked, or uncertain become `move_to_needs_review`.
- Task titles that look future-oriented, someday-oriented, wishlist-like, or low urgency become `move_to_someday`.
- Task titles that look like multi-step projects produce one `create_checklist_item` action with a conservative first checklist item.

Every action must include:

- stable `action_id`
- `operation`
- `task_id`
- `source_list_id`
- human-readable `reason`

## Interfaces

Add pure strategy logic to `src/plan-proposer.ts`.

Add CLI wrapper `scripts/propose-plan.ts`.

Add tests in `scripts/plan-proposer.test.ts`.

Add npm script:

```json
"propose:plan": "node --experimental-strip-types scripts/propose-plan.ts"
```

Example:

```powershell
corepack pnpm run propose:plan -- --backup safe-data/backups/mstodo-backup.json --limit 5
```

The script writes:

```text
safe-data/plans/proposed-plan-YYYY-MM-DDTHH-mm-ss.json
```

## Non-Goals

- No LLM call.
- No Microsoft Graph write.
- No restore apply.
- No permanent delete.
- No automatic application of the generated plan.
