import { z } from "zod"
import { createHash } from "node:crypto"

const allowedOperations = [
  "move_to_archive",
  "move_to_someday",
  "move_to_needs_review",
  "complete",
  "update",
  "create_checklist_item",
] as const

const planActionSchema = z.object({
  action_id: z.string().min(1),
  operation: z.enum(allowedOperations),
  task_id: z.string().min(1).optional(),
  source_list_id: z.string().min(1).optional(),
  reason: z.string().min(1),
  update: z
    .object({
      title: z.string().min(1).optional(),
      body: z.string().optional(),
      importance: z.enum(["low", "normal", "high"]).optional(),
      due_date: z.string().optional(),
    })
    .strict()
    .optional(),
  checklist_item: z
    .object({
      display_name: z.string().min(1),
    })
    .strict()
    .optional(),
})

const planSchema = z
  .object({
    schema_version: z.literal("1.0"),
    summary: z.string().min(1),
    actions: z.array(planActionSchema).min(1),
  })
  .strict()

export type SafeOperation = (typeof allowedOperations)[number]
export type SafePlanAction = z.infer<typeof planActionSchema>
export type SafePlan = z.infer<typeof planSchema>

export interface IndexedTask {
  id: string
  listId: string
  title?: string
  status?: string
  body?: unknown
  [key: string]: unknown
}

export interface SafeListIds {
  archive: string
  someday: string
  needsReview: string
}

export interface ValidationContext {
  taskIndex: Record<string, IndexedTask>
  safeLists: SafeListIds
}

export interface ValidationResult {
  ok: boolean
  plan?: SafePlan
  errors: string[]
}

export interface SafePlanExecutor {
  createTask(listId: string, payload: Record<string, unknown>): Promise<{ id?: string }>
  updateTask(listId: string, taskId: string, payload: Record<string, unknown>): Promise<unknown>
  createChecklistItem(listId: string, taskId: string, payload: Record<string, unknown>): Promise<unknown>
}

export interface ApplySafePlanOptions {
  confirmation: string
  failFast?: boolean
}

export interface ApplySafePlanResult {
  ok: boolean
  errors: string[]
  successes: Array<{ action_id: string; task_id?: string; created_task_id?: string }>
  failures: Array<{ action_id: string; task_id?: string; error: string }>
  audit_events: Array<Record<string, unknown>>
  fail_fast_triggered: boolean
}

export function validatePlan(input: unknown, context: ValidationContext): ValidationResult {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`),
    }
  }

  const errors: string[] = []
  const actionIds = new Set<string>()

  for (const action of parsed.data.actions) {
    if (actionIds.has(action.action_id)) {
      errors.push(`${action.action_id}: duplicate action_id`)
    }
    actionIds.add(action.action_id)

    if (requiresTask(action.operation) && !action.task_id) {
      errors.push(`${action.action_id}: task_id is required for ${action.operation}`)
      continue
    }

    if (action.task_id) {
      const task = context.taskIndex[action.task_id]
      if (!task) {
        errors.push(`${action.action_id}: task_id not found: ${action.task_id}`)
        continue
      }
      if (!action.source_list_id) {
        errors.push(`${action.action_id}: source_list_id is required`)
      } else if (task.listId !== action.source_list_id) {
        errors.push(
          `${action.action_id}: source_list_id mismatch for ${action.task_id}; expected ${task.listId}, got ${action.source_list_id}`,
        )
      }
    }

    if (action.operation === "update" && !action.update) {
      errors.push(`${action.action_id}: update payload is required`)
    }

    if (action.operation === "create_checklist_item" && !action.checklist_item) {
      errors.push(`${action.action_id}: checklist_item payload is required`)
    }
  }

  return {
    ok: errors.length === 0,
    plan: parsed.data,
    errors,
  }
}

function requiresTask(operation: SafeOperation): boolean {
  return [
    "move_to_archive",
    "move_to_someday",
    "move_to_needs_review",
    "complete",
    "update",
    "create_checklist_item",
  ].includes(operation)
}

function targetListFor(operation: SafeOperation, safeLists: SafeListIds): string | undefined {
  if (operation === "move_to_archive") return safeLists.archive
  if (operation === "move_to_someday") return safeLists.someday
  if (operation === "move_to_needs_review") return safeLists.needsReview
  return undefined
}

export function buildPlanPreview(
  plan: SafePlan | undefined,
  context: ValidationContext,
): {
  actionCount: number
  items: Array<{
    action_id: string
    operation: SafeOperation
    task_id?: string
    source_list_id?: string
    target_list_id?: string
    effect: string
    reason: string
  }>
} {
  if (!plan) return { actionCount: 0, items: [] }
  const items = plan.actions.map((action) => {
    const task = action.task_id ? context.taskIndex[action.task_id] : undefined
    const targetListId = targetListFor(action.operation, context.safeLists)
    const title = task?.title ?? action.task_id ?? "unknown task"
    let effect: string

    if (targetListId) {
      effect = `move task '${title}' from ${action.source_list_id} to ${targetListId}`
    } else if (action.operation === "complete") {
      effect = `mark task '${title}' complete`
    } else if (action.operation === "update") {
      effect = `update task '${title}'`
    } else if (action.operation === "create_checklist_item") {
      effect = `create checklist item on task '${title}'`
    } else {
      effect = `${action.operation} task '${title}'`
    }

    return {
      action_id: action.action_id,
      operation: action.operation,
      task_id: action.task_id,
      source_list_id: action.source_list_id,
      target_list_id: targetListId,
      effect,
      reason: action.reason,
    }
  })

  return { actionCount: items.length, items }
}

export function confirmationPhraseFor(plan: SafePlan): string {
  return `APPLY ${plan.summary}`
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`
  if (!value || typeof value !== "object") return JSON.stringify(value)
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`
}

export function createPlanPreviewRecord(
  plan: SafePlan,
  context: ValidationContext,
  createdAt?: string,
): {
  schema_version: "1.0"
  preview_id: string
  created_at: string
  confirmation_phrase: string
  writes_performed: 0
  preview: ReturnType<typeof buildPlanPreview>
} {
  const preview = buildPlanPreview(plan, context)
  const previewHash = createHash("sha256").update(canonicalJson({ plan, preview })).digest("hex").slice(0, 16)

  return {
    schema_version: "1.0",
    preview_id: previewHash,
    created_at: createdAt ?? new Date().toISOString(),
    confirmation_phrase: confirmationPhraseFor(plan),
    writes_performed: 0,
    preview,
  }
}

export async function applySafePlan(
  input: unknown,
  context: ValidationContext,
  executor: SafePlanExecutor,
  options: ApplySafePlanOptions,
): Promise<ApplySafePlanResult> {
  const result: ApplySafePlanResult = {
    ok: false,
    errors: [],
    successes: [],
    failures: [],
    audit_events: [],
    fail_fast_triggered: false,
  }
  const validation = validatePlan(input, context)
  if (!validation.ok || !validation.plan) {
    result.errors.push(...validation.errors)
    return result
  }

  const requiredConfirmation = confirmationPhraseFor(validation.plan)
  if (options.confirmation !== requiredConfirmation) {
    result.errors.push(`confirmation must exactly equal: ${requiredConfirmation}`)
    return result
  }

  for (const action of validation.plan.actions) {
    const task = action.task_id ? context.taskIndex[action.task_id] : undefined
    const targetListId = targetListFor(action.operation, context.safeLists)

    try {
      let createdTaskId: string | undefined

      if (targetListId && task) {
        const created = await executor.createTask(targetListId, taskCreatePayload(task))
        createdTaskId = created.id
        if (createdTaskId) {
          for (const item of checklistItemsFromTask(task)) {
            await executor.createChecklistItem(targetListId, createdTaskId, {
              displayName: item.displayName,
              isChecked: item.isChecked,
            })
          }
        }
        await executor.updateTask(task.listId, task.id, { status: "completed" })
      } else if (action.operation === "complete" && task) {
        await executor.updateTask(task.listId, task.id, { status: "completed" })
      } else if (action.operation === "update" && task && action.update) {
        await executor.updateTask(task.listId, task.id, taskUpdatePayload(action.update))
      } else if (action.operation === "create_checklist_item" && task && action.checklist_item) {
        await executor.createChecklistItem(task.listId, task.id, {
          displayName: action.checklist_item.display_name,
        })
      }

      const success: { action_id: string; task_id?: string; created_task_id?: string } = {
        action_id: action.action_id,
        task_id: action.task_id,
      }
      if (createdTaskId) {
        success.created_task_id = createdTaskId
      }
      result.successes.push(success)
      result.audit_events.push(
        createAuditEvent({
          actionId: action.action_id,
          operation: action.operation,
          taskId: action.task_id,
          sourceListId: action.source_list_id,
          targetListId,
          ok: true,
          taskBefore: task,
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.failures.push({ action_id: action.action_id, task_id: action.task_id, error: message })
      result.audit_events.push(
        createAuditEvent({
          actionId: action.action_id,
          operation: action.operation,
          taskId: action.task_id,
          sourceListId: action.source_list_id,
          targetListId,
          ok: false,
          error: message,
          taskBefore: task,
        }),
      )

      if (options.failFast !== false) {
        result.fail_fast_triggered = true
        break
      }
    }
  }

  result.ok = result.failures.length === 0 && result.errors.length === 0
  return result
}

function checklistItemsFromTask(task: IndexedTask): Array<{ displayName: string; isChecked?: boolean }> {
  if (!Array.isArray(task.checklistItems)) return []
  return task.checklistItems.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as Record<string, unknown>
    return typeof candidate.displayName === "string"
      ? [
          {
            displayName: candidate.displayName,
            isChecked: typeof candidate.isChecked === "boolean" ? candidate.isChecked : undefined,
          },
        ]
      : []
  })
}

function taskCreatePayload(task: IndexedTask): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: task.title ?? "Untitled task",
  }

  for (const key of ["body", "importance", "dueDateTime", "reminderDateTime", "categories"] as const) {
    if (task[key] !== undefined) {
      payload[key] = task[key]
    }
  }

  return payload
}

function taskUpdatePayload(update: NonNullable<SafePlanAction["update"]>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (update.title !== undefined) payload.title = update.title
  if (update.body !== undefined) payload.body = { content: update.body, contentType: "text" }
  if (update.importance !== undefined) payload.importance = update.importance
  if (update.due_date !== undefined) {
    payload.dueDateTime = {
      dateTime: update.due_date,
      timeZone: "UTC",
    }
  }
  return payload
}

export function resolveSafeLists(
  lists: Array<{ id: string; displayName: string }>,
): SafeListIds & { missing: string[] } {
  const normalized = new Map(lists.map((list) => [list.displayName.trim().toLowerCase(), list.id]))
  const archive = normalized.get("archive") ?? normalized.get("🎞️archive") ?? ""
  const someday = normalized.get("someday") ?? ""
  const needsReview = normalized.get("needs review") ?? ""
  const missing: string[] = []
  if (!archive) missing.push("Archive")
  if (!someday) missing.push("Someday")
  if (!needsReview) missing.push("Needs Review")

  return {
    archive,
    someday,
    needsReview,
    missing,
  }
}

export function createBackupEnvelope(input: {
  account?: unknown
  lists: unknown[]
  tasksByList: Record<string, unknown[]>
  createdAt?: string
}): {
  schema_version: "1.0"
  created_at: string
  account?: unknown
  lists: unknown[]
  tasks_by_list: Record<string, unknown[]>
} {
  return {
    schema_version: "1.0",
    created_at: input.createdAt ?? new Date().toISOString(),
    account: input.account,
    lists: input.lists,
    tasks_by_list: input.tasksByList,
  }
}

export function createAuditEvent(input: {
  actionId: string
  operation: string
  taskId?: string
  sourceListId?: string
  targetListId?: string
  ok: boolean
  error?: string
  taskBefore?: { title?: string; [key: string]: unknown }
}): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    action_id: input.actionId,
    operation: input.operation,
    task_id: input.taskId,
    source_list_id: input.sourceListId,
    target_list_id: input.targetListId,
    ok: input.ok,
    error: input.error,
    task_title: input.taskBefore?.title,
  }
}
