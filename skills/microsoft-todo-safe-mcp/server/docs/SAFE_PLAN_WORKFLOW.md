# Safe Plan Workflow

Date: 2026-06-10

This workflow is the only supported AI-assisted write path.

## 1. Prepare Safe Lists

```powershell
corepack pnpm run doctor
```

Then call the MCP tool:

```text
setup_safe_lists
```

This creates or binds:

- Archive
- Someday
- Needs Review

## 2. Export Backup

Before asking an AI to propose changes, export a full backup:

```text
export_backup
```

For a terminal-only read backup, run:

```powershell
corepack pnpm run export:backup
```

Backups are written under:

```text
safe-data/backups/
```

## 3. Generate A Plan

For a conservative starter plan from MCP, call:

```text
propose_plan
```

Required input:

- `backup_path`, under `safe-data/backups/`

Optional input:

- `limit`, default `5`, maximum `50`

For the same local-only workflow from a terminal, run:

```powershell
corepack pnpm run propose:plan -- --backup safe-data/backups/<backup>.json --limit 5
```

Both paths only read a local backup and write a local plan file under:

```text
safe-data/plans/
```

They do not call Microsoft Graph and perform no Microsoft To Do writes.

The first strategy version only proposes:

- `move_to_needs_review`
- `move_to_someday`
- `create_checklist_item`

Review the generated plan before validation and preview.

The first plan schema is:

```json
{
  "schema_version": "1.0",
  "summary": "整理积压任务",
  "actions": [
    {
      "action_id": "a001",
      "operation": "move_to_someday",
      "task_id": "...",
      "source_list_id": "...",
      "reason": "未来两周没有执行必要"
    }
  ]
}
```

Allowed operations:

- `move_to_archive`
- `move_to_someday`
- `move_to_needs_review`
- `complete`
- `update`
- `create_checklist_item`

Forbidden in version `1.0`:

- `delete`
- `delete_task_list`
- silent overwrite
- applying without preview
- writing when `source_list_id` does not match the current task list
- writing when `task_id` is missing

## 4. Validate

Call:

```text
validate_plan
```

This performs schema validation, task existence checks, source-list checks, and safe-list checks. It performs no writes.

## 5. Preview

Call:

```text
preview_plan
```

This performs no Microsoft To Do writes. It writes a local preview record under:

```text
safe-data/previews/
```

The response includes:

- `preview_id`
- `confirmation_phrase`
- a human-readable effect summary
- `writes_performed: 0`

## 6. Apply

Call:

```text
apply_plan
```

Required inputs:

- the same plan
- `preview_id` from `preview_plan`
- exact `confirmation_phrase` from `preview_plan`
- optional `fail_fast`, default `true`

`apply_plan` always:

- validates again
- requires a previously saved preview
- requires exact confirmation
- creates a full backup before writing
- writes JSON Lines audit events
- avoids logging tokens and full task bodies
- preserves success mappings on partial failure
- defaults to fail-fast

Soft move semantics:

- `move_to_archive`
- `move_to_someday`
- `move_to_needs_review`

These create a copy in the target safe list, copy checklist items when available, then mark the original task completed. They do not permanently delete the original task.

Audit logs are written under:

```text
safe-data/audit/
```

## 7. Restore Preview

Call:

```text
restore_preview
```

This reads a backup file under `safe-data/backups/` and returns counts and metadata. It performs no writes. Actual restore apply is intentionally not implemented in this phase.
