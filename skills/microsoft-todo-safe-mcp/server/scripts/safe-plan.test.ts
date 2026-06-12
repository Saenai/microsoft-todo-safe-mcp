import assert from "node:assert/strict"
import test from "node:test"

import {
  applySafePlan,
  buildPlanPreview,
  createPlanPreviewRecord,
  createAuditEvent,
  createBackupEnvelope,
  confirmationPhraseFor,
  resolveSafeLists,
  validatePlan,
  type SafePlanExecutor,
} from "../src/safe-plan.ts"

const taskIndex = {
  "task-1": { id: "task-1", listId: "list-active", title: "Clean inbox", status: "notStarted" },
  "task-2": { id: "task-2", listId: "list-active", title: "Pay bill", status: "notStarted" },
  "task-3": {
    id: "task-3",
    listId: "list-active",
    title: "Prepare trip",
    status: "notStarted",
    checklistItems: [{ id: "ci-1", displayName: "Book hotel", isChecked: false }],
  },
}

const safeLists = {
  archive: "list-archive",
  someday: "list-someday",
  needsReview: "list-review",
}

test("validatePlan accepts first-version soft archive operations", () => {
  const result = validatePlan(
    {
      schema_version: "1.0",
      summary: "整理积压任务",
      actions: [
        {
          action_id: "a001",
          operation: "move_to_someday",
          task_id: "task-1",
          source_list_id: "list-active",
          reason: "未来两周没有执行必要",
        },
      ],
    },
    { taskIndex, safeLists },
  )

  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
})

test("validatePlan rejects destructive delete operations", () => {
  const result = validatePlan(
    {
      schema_version: "1.0",
      summary: "bad plan",
      actions: [
        {
          action_id: "a001",
          operation: "delete",
          task_id: "task-1",
          source_list_id: "list-active",
          reason: "old",
        },
      ],
    },
    { taskIndex, safeLists },
  )

  assert.equal(result.ok, false)
  assert.match(result.errors.join("\n"), /operation/)
  assert.match(result.errors.join("\n"), /delete/)
})

test("validatePlan rejects source list mismatch and missing task", () => {
  const result = validatePlan(
    {
      schema_version: "1.0",
      summary: "bad plan",
      actions: [
        {
          action_id: "a001",
          operation: "complete",
          task_id: "task-1",
          source_list_id: "other-list",
          reason: "wrong source",
        },
        {
          action_id: "a002",
          operation: "complete",
          task_id: "missing-task",
          source_list_id: "list-active",
          reason: "missing",
        },
      ],
    },
    { taskIndex, safeLists },
  )

  assert.equal(result.ok, false)
  assert.match(result.errors.join("\n"), /source_list_id/)
  assert.match(result.errors.join("\n"), /missing-task/)
})

test("buildPlanPreview maps safe move operations to target lists without writing", () => {
  const validation = validatePlan(
    {
      schema_version: "1.0",
      summary: "preview",
      actions: [
        {
          action_id: "a001",
          operation: "move_to_archive",
          task_id: "task-1",
          source_list_id: "list-active",
          reason: "done enough",
        },
        {
          action_id: "a002",
          operation: "complete",
          task_id: "task-2",
          source_list_id: "list-active",
          reason: "already done",
        },
      ],
    },
    { taskIndex, safeLists },
  )

  assert.equal(validation.ok, true)
  const preview = buildPlanPreview(validation.plan, { taskIndex, safeLists })

  assert.equal(preview.actionCount, 2)
  assert.deepEqual(
    preview.items.map((item) => item.effect),
    ["move task 'Clean inbox' from list-active to list-archive", "mark task 'Pay bill' complete"],
  )
})

test("resolveSafeLists finds existing safe lists case-insensitively", () => {
  const result = resolveSafeLists([
    { id: "a", displayName: "archive" },
    { id: "s", displayName: "Someday" },
    { id: "r", displayName: "Needs Review" },
  ])

  assert.deepEqual(result, {
    archive: "a",
    someday: "s",
    needsReview: "r",
    missing: [],
  })
})

test("createBackupEnvelope stores full task data and metadata", () => {
  const envelope = createBackupEnvelope({
    account: { id: "user-id", displayName: "User" },
    lists: [{ id: "list-active", displayName: "Tasks" }],
    tasksByList: { "list-active": [{ id: "task-1", title: "Clean inbox" }] },
    createdAt: "2026-06-10T00:00:00.000Z",
  })

  assert.equal(envelope.schema_version, "1.0")
  assert.equal(envelope.created_at, "2026-06-10T00:00:00.000Z")
  const task = envelope.tasks_by_list["list-active"][0] as { title?: string }
  assert.equal(task.title, "Clean inbox")
})

test("createAuditEvent omits full task body by default", () => {
  const event = createAuditEvent({
    actionId: "a001",
    operation: "update",
    taskId: "task-1",
    sourceListId: "list-active",
    targetListId: "list-review",
    ok: true,
    taskBefore: { id: "task-1", title: "Clean inbox", body: { content: "secret notes" } },
  })

  assert.equal("taskBefore" in event, false)
  assert.equal(event.task_title, "Clean inbox")
  assert.equal(JSON.stringify(event).includes("secret notes"), false)
})

test("createPlanPreviewRecord creates a stable preview id and confirmation phrase", () => {
  const validation = validatePlan(
    {
      schema_version: "1.0",
      summary: "整理积压任务",
      actions: [
        {
          action_id: "a001",
          operation: "complete",
          task_id: "task-1",
          source_list_id: "list-active",
          reason: "done",
        },
      ],
    },
    { taskIndex, safeLists },
  )

  assert.equal(validation.ok, true)
  const first = createPlanPreviewRecord(validation.plan!, { taskIndex, safeLists }, "2026-06-10T00:00:00.000Z")
  const second = createPlanPreviewRecord(validation.plan!, { taskIndex, safeLists }, "2026-06-10T00:00:00.000Z")

  assert.equal(first.preview_id, second.preview_id)
  assert.equal(first.confirmation_phrase, confirmationPhraseFor(validation.plan!))
  assert.equal(first.writes_performed, 0)
})

test("applySafePlan copies safe move targets, completes originals, and records audit events", async () => {
  const calls: string[] = []
  const executor: SafePlanExecutor = {
    createTask: async (listId, payload) => {
      calls.push(`createTask:${listId}:${payload.title}`)
      return { id: "copied-task-1" }
    },
    updateTask: async (listId, taskId, payload) => {
      calls.push(`updateTask:${listId}:${taskId}:${payload.status ?? payload.title}`)
      return { id: taskId }
    },
    createChecklistItem: async (listId, taskId, payload) => {
      calls.push(`createChecklistItem:${listId}:${taskId}:${payload.displayName}`)
      return { id: "checklist-1" }
    },
  }

  const result = await applySafePlan(
    {
      schema_version: "1.0",
      summary: "整理积压任务",
      actions: [
        {
          action_id: "a001",
          operation: "move_to_someday",
          task_id: "task-1",
          source_list_id: "list-active",
          reason: "later",
        },
        {
          action_id: "a002",
          operation: "create_checklist_item",
          task_id: "task-2",
          source_list_id: "list-active",
          reason: "split",
          checklist_item: { display_name: "Confirm amount" },
        },
      ],
    },
    { taskIndex, safeLists },
    executor,
    { confirmation: "APPLY 整理积压任务", failFast: true },
  )

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [
    "createTask:list-someday:Clean inbox",
    "updateTask:list-active:task-1:completed",
    "createChecklistItem:list-active:task-2:Confirm amount",
  ])
  assert.deepEqual(result.successes, [
    { action_id: "a001", task_id: "task-1", created_task_id: "copied-task-1" },
    { action_id: "a002", task_id: "task-2" },
  ])
  assert.equal(result.audit_events.length, 2)
  assert.equal(JSON.stringify(result.audit_events).includes("secret notes"), false)
})

test("applySafePlan requires explicit confirmation and stops on first failure by default", async () => {
  const executor: SafePlanExecutor = {
    createTask: async () => {
      throw new Error("first write failed")
    },
    updateTask: async () => ({ id: "updated" }),
    createChecklistItem: async () => ({ id: "checklist" }),
  }
  const plan = {
    schema_version: "1.0" as const,
    summary: "整理积压任务",
    actions: [
      {
        action_id: "a001",
        operation: "move_to_archive" as const,
        task_id: "task-1",
        source_list_id: "list-active",
        reason: "archive",
      },
      {
        action_id: "a002",
        operation: "complete" as const,
        task_id: "task-2",
        source_list_id: "list-active",
        reason: "done",
      },
    ],
  }

  const rejected = await applySafePlan(plan, { taskIndex, safeLists }, executor, {
    confirmation: "wrong",
    failFast: true,
  })
  assert.equal(rejected.ok, false)
  assert.match(rejected.errors.join("\n"), /confirmation/)
  assert.equal(rejected.audit_events.length, 0)

  const failed = await applySafePlan(plan, { taskIndex, safeLists }, executor, {
    confirmation: "APPLY 整理积压任务",
    failFast: true,
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.fail_fast_triggered, true)
  assert.equal(failed.audit_events.length, 1)
  assert.equal(failed.audit_events[0].ok, false)
})

test("applySafePlan preserves checklist items when soft-moving a task", async () => {
  const calls: string[] = []
  const executor: SafePlanExecutor = {
    createTask: async () => ({ id: "copied-task-3" }),
    updateTask: async () => ({ id: "updated" }),
    createChecklistItem: async (listId, taskId, payload) => {
      calls.push(`${listId}:${taskId}:${payload.displayName}`)
      return { id: "copied-ci-1" }
    },
  }

  const result = await applySafePlan(
    {
      schema_version: "1.0",
      summary: "整理积压任务",
      actions: [
        {
          action_id: "a001",
          operation: "move_to_archive",
          task_id: "task-3",
          source_list_id: "list-active",
          reason: "archive with details",
        },
      ],
    },
    { taskIndex, safeLists },
    executor,
    { confirmation: "APPLY 整理积压任务", failFast: true },
  )

  assert.equal(result.ok, true)
  assert.deepEqual(calls, ["list-archive:copied-task-3:Book hotel"])
})
