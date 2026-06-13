import { join } from "node:path"

import type { SafePlan, SafePlanAction } from "./safe-plan.js"

export interface BackupEnvelope {
  schema_version?: string
  created_at?: string
  lists?: Array<{ id?: string; displayName?: string }>
  tasks_by_list?: Record<string, BackupTask[]>
}

export interface BackupTask {
  id?: string
  title?: string
  status?: string
  dueDateTime?: {
    dateTime?: string
    timeZone?: string
  }
}

export interface ProposePlanOptions {
  limit?: number
  now?: string | Date
}

export interface ProposePlanCliArgs {
  backupPath: string
  limit: number
  outputPath?: string
}

const defaultLimit = 5
const nearDueDays = 2

export function proposePlanFromBackup(backup: BackupEnvelope, options: ProposePlanOptions = {}): SafePlan {
  const limit = Math.max(1, Math.min(options.limit ?? defaultLimit, 50))
  const now = options.now ? new Date(options.now) : new Date()
  const actions: SafePlanAction[] = []
  const listNames = new Map((backup.lists ?? []).map((list) => [list.id, list.displayName]))

  for (const [listId, tasks] of Object.entries(backup.tasks_by_list ?? {})) {
    for (const task of tasks) {
      if (actions.length >= limit) break
      const action = proposeActionForTask(task, listId, listNames.get(listId), actions.length + 1, now)
      if (action) actions.push(action)
    }
    if (actions.length >= limit) break
  }

  return {
    schema_version: "1.0",
    summary: "整理积压任务",
    actions,
  }
}

function proposeActionForTask(
  task: BackupTask,
  sourceListId: string,
  sourceListName: string | undefined,
  actionNumber: number,
  now: Date,
): SafePlanAction | undefined {
  if (!task.id || !task.title) return undefined
  if (task.status === "completed") return undefined
  if (isDueSoon(task, now)) return undefined
  if (isSafeTargetList(sourceListName)) return undefined

  const base = {
    action_id: `a${String(actionNumber).padStart(3, "0")}`,
    task_id: task.id,
    source_list_id: sourceListId,
  }

  if (looksSomeday(task.title)) {
    return {
      ...base,
      operation: "move_to_someday",
      reason: "标题显示这是未来、愿望或非近期事项，适合先放入 Someday。",
    }
  }

  if (looksLikeProject(task.title)) {
    return {
      ...base,
      operation: "create_checklist_item",
      reason: "标题像一个多步骤事项，先补一个 checklist item 明确下一步，而不移动任务本体。",
      checklist_item: {
        display_name: "Define the next concrete step",
      },
    }
  }

  if (looksNeedsReview(task.title, sourceListName)) {
    return {
      ...base,
      operation: "move_to_needs_review",
      reason: "标题不够具体或可能需要判断上下文，适合先放入 Needs Review。",
    }
  }

  return undefined
}

function isSafeTargetList(name: string | undefined): boolean {
  return /^(🎞️\s*)?(archive|needs review|someday)$/i.test((name ?? "").trim())
}

function isDueSoon(task: BackupTask, now: Date): boolean {
  const value = task.dueDateTime?.dateTime
  if (!value) return false
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return false
  const diffMs = due.getTime() - now.getTime()
  return diffMs >= 0 && diffMs <= nearDueDays * 24 * 60 * 60 * 1000
}

function looksSomeday(title: string): boolean {
  return /\b(someday|maybe|wishlist|wish list|future|later|eventually|one day)\b/i.test(title)
}

function looksLikeProject(title: string): boolean {
  return /\b(plan|organize|research|prepare|build|migrate|setup|set up|refactor|review)\b.+\b(and|then|with|for)\b/i.test(
    title,
  )
}

function looksNeedsReview(title: string, sourceListName: string | undefined): boolean {
  return (
    (isInboxLikeList(sourceListName) &&
      /^\[(?:review(?::[^\]]+)?|tool|goal\?|rule|event|creative|learn(?:\/tool)?|place|study|media|agent)\]/i.test(
        title.trim(),
      )) ||
    /\b(figure out|decide|check|look into|investigate|think about|review|confirm|maybe|整理|確認|検討)\b/i.test(title)
  )
}

function isInboxLikeList(name: string | undefined): boolean {
  return /^(tasks?|タスク|to-resolve|inbox)$/i.test((name ?? "").trim())
}

export function parseProposePlanArgs(argv: string[]): ProposePlanCliArgs {
  const backupPath = valueAfter(argv, "--backup")
  if (!backupPath) {
    throw new Error("--backup is required")
  }
  const limitValue = valueAfter(argv, "--limit")
  const limit = limitValue ? Number.parseInt(limitValue, 10) : defaultLimit
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer")
  }

  return {
    backupPath,
    limit,
    outputPath: valueAfter(argv, "--output"),
  }
}

function valueAfter(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  return argv[index + 1]
}

export function defaultPlanOutputPath(now: string | Date = new Date()): string {
  const timestamp = new Date(now).toISOString().replace(/[:.]/g, "-")
  return join("safe-data", "plans", `proposed-plan-${timestamp}.json`)
}

export function summarizePlanProposal(plan: SafePlan): {
  action_count: number
  operations: Record<string, number>
} {
  const operations: Record<string, number> = {}
  for (const action of plan.actions) {
    operations[action.operation] = (operations[action.operation] ?? 0) + 1
  }
  return {
    action_count: plan.actions.length,
    operations,
  }
}
