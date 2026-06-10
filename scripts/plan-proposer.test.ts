import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"

import {
  defaultPlanOutputPath,
  parseProposePlanArgs,
  proposePlanFromBackup,
  summarizePlanProposal,
} from "../src/plan-proposer.ts"
import { isDirectRun, parseBackupJson } from "./propose-plan.ts"

const backup = {
  schema_version: "1.0",
  created_at: "2026-06-10T00:00:00.000Z",
  lists: [
    { id: "list-active", displayName: "Tasks" },
    { id: "list-someday", displayName: "Someday" },
  ],
  tasks_by_list: {
    "list-active": [
      {
        id: "task-vague",
        title: "Figure out home network",
        status: "notStarted",
      },
      {
        id: "task-future",
        title: "Someday build a home lab dashboard",
        status: "notStarted",
      },
      {
        id: "task-project",
        title: "Plan Japan trip and book hotels",
        status: "notStarted",
      },
      {
        id: "task-completed",
        title: "Already done",
        status: "completed",
      },
      {
        id: "task-due-soon",
        title: "Pay electricity bill",
        status: "notStarted",
        dueDateTime: {
          dateTime: "2026-06-11T00:00:00.000Z",
          timeZone: "UTC",
        },
      },
    ],
  },
}

test("proposePlanFromBackup emits only conservative operations", () => {
  const plan = proposePlanFromBackup(backup, {
    limit: 5,
    now: "2026-06-10T00:00:00.000Z",
  })

  assert.equal(plan.schema_version, "1.0")
  assert.equal(plan.actions.length, 3)
  assert.deepEqual(
    plan.actions.map((action) => [action.task_id, action.operation]),
    [
      ["task-vague", "move_to_needs_review"],
      ["task-future", "move_to_someday"],
      ["task-project", "create_checklist_item"],
    ],
  )
  assert.equal(
    plan.actions.every((action) => action.source_list_id === "list-active"),
    true,
  )
  assert.equal(
    plan.actions.every((action) => action.reason.length > 0),
    true,
  )
  assert.equal(plan.actions[2].checklist_item?.display_name, "Define the next concrete step")
})

test("proposePlanFromBackup respects the action limit", () => {
  const plan = proposePlanFromBackup(backup, {
    limit: 2,
    now: "2026-06-10T00:00:00.000Z",
  })

  assert.equal(plan.actions.length, 2)
  assert.deepEqual(
    plan.actions.map((action) => action.action_id),
    ["a001", "a002"],
  )
})

test("parseProposePlanArgs reads backup, limit, and output", () => {
  assert.deepEqual(parseProposePlanArgs(["--backup", "backup.json", "--limit", "3", "--output", "plan.json"]), {
    backupPath: "backup.json",
    limit: 3,
    outputPath: "plan.json",
  })
})

test("defaultPlanOutputPath writes under safe-data plans", () => {
  assert.equal(
    defaultPlanOutputPath("2026-06-10T00:00:00.000Z"),
    join("safe-data", "plans", "proposed-plan-2026-06-10T00-00-00-000Z.json"),
  )
})

test("summarizePlanProposal reports operation counts", () => {
  const plan = proposePlanFromBackup(backup, {
    limit: 5,
    now: "2026-06-10T00:00:00.000Z",
  })

  assert.deepEqual(summarizePlanProposal(plan), {
    action_count: 3,
    operations: {
      move_to_needs_review: 1,
      move_to_someday: 1,
      create_checklist_item: 1,
    },
  })
})

test("propose-plan isDirectRun handles current platform paths", () => {
  if (process.platform === "win32") {
    assert.equal(isDirectRun("file:///C:/repo/scripts/propose-plan.ts", "C:\\repo\\scripts\\propose-plan.ts"), true)
  } else {
    assert.equal(isDirectRun("file:///repo/scripts/propose-plan.ts", "/repo/scripts/propose-plan.ts"), true)
  }
})

test("parseBackupJson accepts UTF-8 text with BOM", () => {
  const parsed = parseBackupJson('\uFEFF{"schema_version":"1.0","tasks_by_list":{}}')

  assert.equal(parsed.schema_version, "1.0")
})
