import assert from "node:assert/strict"
import test from "node:test"

import { DOCTOR_STEP_NAMES, describeGraphError, isDirectRun, redactSecrets, summarizeReport } from "./doctor.ts"

test("redactSecrets removes token and client secret values from nested data", () => {
  const redacted = redactSecrets({
    accessToken: "access-value",
    refresh_token: "refresh-value",
    nested: {
      clientSecret: "secret-value",
      title: "safe",
    },
  })

  assert.deepEqual(redacted, {
    accessToken: "[REDACTED]",
    refresh_token: "[REDACTED]",
    nested: {
      clientSecret: "[REDACTED]",
      title: "safe",
    },
  })
})

test("describeGraphError extracts status, code, message, and guidance", () => {
  const result = describeGraphError(403, {
    error: {
      code: "MailboxNotEnabledForRESTAPI",
      message: "REST API is not yet supported for this mailbox.",
    },
  })

  assert.equal(result.status, 403)
  assert.equal(result.code, "MailboxNotEnabledForRESTAPI")
  assert.match(result.message, /REST API/)
  assert.match(result.guidance, /personal Microsoft account|mailbox/i)
})

test("doctor steps cover the requested destructive cleanup sequence", () => {
  assert.deepEqual(DOCTOR_STEP_NAMES, [
    "oauth_token_available",
    "get_me",
    "list_task_lists",
    "count_tasks",
    "create_temp_list",
    "create_temp_task",
    "read_temp_task",
    "update_temp_task",
    "complete_temp_task",
    "delete_temp_task",
    "delete_temp_list",
  ])
})

test("summarizeReport reports failures without leaking tokens", () => {
  const summary = summarizeReport({
    startedAt: "2026-06-10T00:00:00.000Z",
    finishedAt: "2026-06-10T00:00:01.000Z",
    ok: false,
    account: { id: "user-id", displayName: "Example", userPrincipalName: "u@example.com" },
    lists: [{ id: "list-1", displayName: "Tasks", taskCount: 2 }],
    steps: [
      { name: "oauth_token_available", ok: true },
      {
        name: "get_me",
        ok: false,
        error: {
          status: 401,
          code: "InvalidAuthenticationToken",
          message: "token access-value failed",
          guidance: "Re-authenticate.",
        },
      },
    ],
  })

  assert.match(summary, /FAILED/)
  assert.match(summary, /InvalidAuthenticationToken/)
  assert.doesNotMatch(summary, /access-value/)
})

test("isDirectRun handles Windows-style argv paths", () => {
  if (process.platform === "win32") {
    assert.equal(isDirectRun("file:///C:/repo/scripts/doctor.ts", "C:\\repo\\scripts\\doctor.ts"), true)
  } else {
    assert.equal(isDirectRun("file:///repo/scripts/doctor.ts", "/repo/scripts/doctor.ts"), true)
  }
})
