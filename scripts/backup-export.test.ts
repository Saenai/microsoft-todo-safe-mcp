import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"

import { exportGraphBackup, summarizeBackup } from "../src/backup-export.ts"
import { defaultBackupOutputPath, isDirectRun, parseExportBackupArgs } from "./export-backup.ts"

test("exportGraphBackup fetches account, lists, tasks, and checklist items", async () => {
  const calls: string[] = []
  const responses = new Map<string, unknown>([
    ["https://graph.microsoft.com/v1.0/me", { id: "user-1", displayName: "User" }],
    ["https://graph.microsoft.com/v1.0/me/todo/lists?$top=100", { value: [{ id: "list-1", displayName: "Tasks" }] }],
    [
      "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks?$top=100",
      { value: [{ id: "task-1", title: "Figure out backup" }] },
    ],
    [
      "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks/task-1/checklistItems",
      { value: [{ id: "ci-1", displayName: "Check export", isChecked: false }] },
    ],
  ])

  const backup = await exportGraphBackup({
    token: "token",
    now: "2026-06-10T00:00:00.000Z",
    fetchImpl: async (url) => {
      calls.push(String(url))
      const body = responses.get(String(url))
      if (!body) {
        return new Response(JSON.stringify({ error: { code: "missing", message: String(url) } }), { status: 404 })
      }
      return new Response(JSON.stringify(body), { status: 200 })
    },
  })

  assert.deepEqual(calls, [
    "https://graph.microsoft.com/v1.0/me",
    "https://graph.microsoft.com/v1.0/me/todo/lists?$top=100",
    "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks?$top=100",
    "https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks/task-1/checklistItems",
  ])
  assert.equal(backup.created_at, "2026-06-10T00:00:00.000Z")
  assert.equal(backup.lists.length, 1)
  const checklist = backup.tasks_by_list["list-1"][0].checklistItems as Array<{ displayName?: string }>
  assert.equal(checklist[0].displayName, "Check export")
})

test("exportGraphBackup follows list pagination", async () => {
  const responses = new Map<string, unknown>([
    ["https://graph.microsoft.com/v1.0/me", { id: "user-1" }],
    [
      "https://graph.microsoft.com/v1.0/me/todo/lists?$top=100",
      {
        value: [{ id: "list-1", displayName: "First page" }],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/todo/lists?page=2",
      },
    ],
    [
      "https://graph.microsoft.com/v1.0/me/todo/lists?page=2",
      { value: [{ id: "list-2", displayName: "Second page" }] },
    ],
    ["https://graph.microsoft.com/v1.0/me/todo/lists/list-1/tasks?$top=100", { value: [] }],
    ["https://graph.microsoft.com/v1.0/me/todo/lists/list-2/tasks?$top=100", { value: [] }],
  ])

  const backup = await exportGraphBackup({
    token: "token",
    fetchImpl: async (url) => {
      const body = responses.get(String(url))
      if (!body) {
        return new Response(JSON.stringify({ error: { code: "missing", message: String(url) } }), { status: 404 })
      }
      return new Response(JSON.stringify(body), { status: 200 })
    },
  })

  assert.deepEqual(
    backup.lists.map((list) => list.id),
    ["list-1", "list-2"],
  )
})

test("exportGraphBackup retries throttled Graph requests", async () => {
  let accountAttempts = 0

  const backup = await exportGraphBackup({
    token: "token",
    sleepMs: async () => {},
    fetchImpl: async (url) => {
      if (String(url) === "https://graph.microsoft.com/v1.0/me") {
        accountAttempts += 1
        if (accountAttempts === 1) {
          return new Response(
            JSON.stringify({ error: { code: "activityLimitReached", message: "The app or user has been throttled." } }),
            { status: 429, headers: { "Retry-After": "0" } },
          )
        }
        return new Response(JSON.stringify({ id: "user-1" }), { status: 200 })
      }

      if (String(url) === "https://graph.microsoft.com/v1.0/me/todo/lists?$top=100") {
        return new Response(JSON.stringify({ value: [] }), { status: 200 })
      }

      return new Response(JSON.stringify({ error: { code: "missing", message: String(url) } }), { status: 404 })
    },
  })

  assert.equal(accountAttempts, 2)
  assert.equal(backup.lists.length, 0)
})

test("summarizeBackup reports list and task counts", () => {
  assert.deepEqual(
    summarizeBackup({
      lists: [{ id: "list-1" }, { id: "list-2" }],
      tasks_by_list: {
        "list-1": [{ id: "task-1" }],
        "list-2": [{ id: "task-2" }, { id: "task-3" }],
      },
    }),
    {
      list_count: 2,
      task_count: 3,
    },
  )
})

test("parseExportBackupArgs reads optional output path", () => {
  assert.deepEqual(parseExportBackupArgs(["--output", "backup.json"]), {
    outputPath: "backup.json",
  })
})

test("defaultBackupOutputPath writes under safe-data backups", () => {
  assert.equal(
    defaultBackupOutputPath("2026-06-10T00:00:00.000Z"),
    join("safe-data", "backups", "mstodo-backup-2026-06-10T00-00-00-000Z.json"),
  )
})

test("export-backup isDirectRun handles current platform paths", () => {
  if (process.platform === "win32") {
    assert.equal(isDirectRun("file:///C:/repo/scripts/export-backup.ts", "C:\\repo\\scripts\\export-backup.ts"), true)
  } else {
    assert.equal(isDirectRun("file:///repo/scripts/export-backup.ts", "/repo/scripts/export-backup.ts"), true)
  }
})
