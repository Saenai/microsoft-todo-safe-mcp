#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

import { buildRefreshTokenRequest } from "../src/oauth-refresh.ts"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const USER_AGENT = "microsoft-todo-mcp-server-doctor/0.1"

export const DOCTOR_STEP_NAMES = [
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
] as const

type DoctorStepName = (typeof DOCTOR_STEP_NAMES)[number]

interface StoredTokens {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  clientId?: string
  clientSecret?: string
  tenantId?: string
}

interface GraphErrorInfo {
  status?: number
  code?: string
  message: string
  guidance: string
}

interface DoctorStep {
  name: DoctorStepName
  ok: boolean
  detail?: unknown
  error?: GraphErrorInfo
}

interface DoctorList {
  id: string
  displayName: string
  taskCount: number
}

interface DoctorReport {
  startedAt: string
  finishedAt: string
  ok: boolean
  account?: {
    id?: string
    displayName?: string
    userPrincipalName?: string
    mail?: string
  }
  lists: DoctorList[]
  temp?: {
    listId?: string
    taskId?: string
  }
  steps: DoctorStep[]
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE"

const SECRET_KEY_PATTERN = /(access|refresh|id)_?token|client_?secret|authorization|password|secret/i
const SECRET_TEXT_PATTERN = /\b(access|refresh|id)?_?token\s+[^,\s;]+/gi

function configTokenPath(): string {
  const configDir =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(homedir(), "AppData", "Roaming"), "microsoft-todo-mcp")
      : path.join(homedir(), ".config", "microsoft-todo-mcp")
  return path.join(configDir, "tokens.json")
}

function tokenFileCandidates(): string[] {
  return [process.env.MSTODO_TOKEN_FILE, configTokenPath(), path.join(process.cwd(), "tokens.json")].filter(
    (value): value is string => Boolean(value),
  )
}

function readStoredTokens(): StoredTokens | null {
  for (const candidate of tokenFileCandidates()) {
    if (!existsSync(candidate)) continue
    const parsed = JSON.parse(readFileSync(candidate, "utf8")) as StoredTokens
    return parsed
  }
  if (process.env.MS_TODO_ACCESS_TOKEN) {
    return {
      accessToken: process.env.MS_TODO_ACCESS_TOKEN,
      refreshToken: process.env.MS_TODO_REFRESH_TOKEN,
      expiresAt: Date.now() + 60 * 60 * 1000,
    }
  }
  return null
}

function activeTokenFile(): string | undefined {
  return tokenFileCandidates().find((candidate) => existsSync(candidate))
}

async function refreshAccessToken(tokens: StoredTokens): Promise<StoredTokens | null> {
  const clientId = tokens.clientId || process.env.CLIENT_ID
  const clientSecret = tokens.clientSecret || process.env.CLIENT_SECRET
  const tenantId = tokens.tenantId || process.env.TENANT_ID || "organizations"
  if (!clientId || !tokens.refreshToken) return null

  const refreshRequest = buildRefreshTokenRequest({
    tenantId,
    clientId,
    clientSecret,
    refreshToken: tokens.refreshToken,
  })

  const response = await fetch(refreshRequest.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: refreshRequest.body,
  })

  if (!response.ok) return null
  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  const refreshed: StoredTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 5 * 60 * 1000,
    clientId,
    tenantId,
  }
  if (clientSecret) {
    refreshed.clientSecret = clientSecret
  }

  const tokenPath = activeTokenFile()
  if (tokenPath) writeFileSync(tokenPath, JSON.stringify(refreshed, null, 2), "utf8")
  return refreshed
}

async function getAccessToken(): Promise<string | null> {
  const tokens = readStoredTokens()
  if (!tokens?.accessToken) return null
  if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
    const refreshed = await refreshAccessToken(tokens)
    return refreshed?.accessToken ?? null
  }
  return tokens.accessToken
}

function guidanceFor(status: number | undefined, code: string | undefined): string {
  if (code === "MailboxNotEnabledForRESTAPI") {
    return "Likely personal Microsoft account mailbox/API compatibility. Confirm TENANT_ID=consumers or common, then record the result in docs/PERSONAL_ACCOUNT_COMPATIBILITY.md."
  }
  if (status === 401 || code === "InvalidAuthenticationToken") {
    return "Re-authenticate with the repository auth flow and confirm the token file path. Do not paste tokens into logs."
  }
  if (status === 403) {
    return "Check delegated Graph scopes and Microsoft app consent. Required To Do scopes include Tasks.ReadWrite and User.Read."
  }
  if (status === 404) {
    return "Check whether the list/task still exists and whether the account can see it."
  }
  if (status === 429) {
    return "Graph throttled the request. Retry later and reduce batch size."
  }
  return "Inspect the Graph error code/message, OAuth tenant, scopes, and whether the account has Microsoft To Do enabled."
}

export function describeGraphError(status: number | undefined, body: unknown): GraphErrorInfo {
  const bodyObject = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const graphError =
    bodyObject.error && typeof bodyObject.error === "object"
      ? (bodyObject.error as Record<string, unknown>)
      : bodyObject
  const code = typeof graphError.code === "string" ? graphError.code : undefined
  const message =
    typeof graphError.message === "string"
      ? graphError.message
      : typeof body === "string"
        ? body
        : JSON.stringify(redactSecrets(body))

  return {
    status,
    code,
    message: String(message),
    guidance: guidanceFor(status, code),
  }
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item)) as T
  if (typeof value === "string") return value.replace(SECRET_TEXT_PATTERN, "token [REDACTED]") as T
  if (!value || typeof value !== "object") return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSecrets(item)
  }
  return output as T
}

class GraphRequestError extends Error {
  info: GraphErrorInfo

  constructor(info: GraphErrorInfo) {
    super(info.message)
    this.info = info
  }
}

async function graphRequest<T>(token: string, url: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  const parsed = text.length > 0 ? safeJsonParse(text) : null

  if (!response.ok) {
    throw new GraphRequestError(describeGraphError(response.status, parsed ?? text))
  }

  return (parsed ?? {}) as T
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function id(value: string): string {
  return encodeURIComponent(value)
}

async function countTasks(token: string, listId: string): Promise<number> {
  let nextUrl: string | undefined = `${GRAPH_BASE}/me/todo/lists/${id(listId)}/tasks?$top=100`
  let count = 0
  while (nextUrl) {
    const page: { value?: unknown[]; "@odata.nextLink"?: string } = await graphRequest(token, nextUrl)
    count += page.value?.length ?? 0
    nextUrl = page["@odata.nextLink"]
  }
  return count
}

async function runStep<T>(report: DoctorReport, name: DoctorStepName, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn()
    report.steps.push({ name, ok: true, detail: redactSecrets(result) })
    return result
  } catch (error) {
    const graphError =
      error instanceof GraphRequestError
        ? error.info
        : describeGraphError(undefined, error instanceof Error ? error.message : String(error))
    report.steps.push({ name, ok: false, error: redactSecrets(graphError) })
    return undefined
  }
}

export async function runDoctor(): Promise<DoctorReport> {
  const report: DoctorReport = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    ok: false,
    lists: [],
    steps: [],
  }

  let token: string | null = null
  let tempListId: string | undefined
  let tempTaskId: string | undefined

  token =
    (await runStep(report, "oauth_token_available", async () => {
      const accessToken = await getAccessToken()
      if (!accessToken) {
        throw new Error("No usable OAuth access token found.")
      }
      return accessToken
    })) ?? null

  if (!token) {
    report.finishedAt = new Date().toISOString()
    return report
  }

  const me = await runStep(report, "get_me", async () =>
    graphRequest<Record<string, string | undefined>>(token, `${GRAPH_BASE}/me`),
  )
  if (me) {
    report.account = {
      id: me.id,
      displayName: me.displayName,
      userPrincipalName: me.userPrincipalName,
      mail: me.mail,
    }
  }

  const listsResponse = await runStep(report, "list_task_lists", async () =>
    graphRequest<{ value?: Array<{ id: string; displayName: string }> }>(token, `${GRAPH_BASE}/me/todo/lists`),
  )
  const lists = listsResponse?.value ?? []

  await runStep(report, "count_tasks", async () => {
    const counted: DoctorList[] = []
    for (const list of lists) {
      counted.push({
        id: list.id,
        displayName: list.displayName,
        taskCount: await countTasks(token, list.id),
      })
    }
    report.lists = counted
    return counted
  })

  const tempName = `__mstodo_doctor_${new Date().toISOString().replace(/[:.]/g, "-")}`
  const tempList = await runStep(report, "create_temp_list", async () =>
    graphRequest<{ id: string; displayName: string }>(token, `${GRAPH_BASE}/me/todo/lists`, "POST", {
      displayName: tempName,
    }),
  )
  tempListId = tempList?.id

  const tempTask = tempListId
    ? await runStep(report, "create_temp_task", async () =>
        graphRequest<{ id: string; title: string }>(
          token,
          `${GRAPH_BASE}/me/todo/lists/${id(tempListId)}/tasks`,
          "POST",
          { title: "Microsoft To Do MCP doctor temporary task" },
        ),
      )
    : undefined
  tempTaskId = tempTask?.id

  if (tempListId && tempTaskId) {
    await runStep(report, "read_temp_task", async () =>
      graphRequest(token, `${GRAPH_BASE}/me/todo/lists/${id(tempListId)}/tasks/${id(tempTaskId)}`),
    )
    await runStep(report, "update_temp_task", async () =>
      graphRequest(token, `${GRAPH_BASE}/me/todo/lists/${id(tempListId)}/tasks/${id(tempTaskId)}`, "PATCH", {
        title: "Microsoft To Do MCP doctor temporary task updated",
      }),
    )
    await runStep(report, "complete_temp_task", async () =>
      graphRequest(token, `${GRAPH_BASE}/me/todo/lists/${id(tempListId)}/tasks/${id(tempTaskId)}`, "PATCH", {
        status: "completed",
      }),
    )
  }

  if (tempListId && tempTaskId) {
    await runStep(report, "delete_temp_task", async () =>
      graphRequest(token, `${GRAPH_BASE}/me/todo/lists/${id(tempListId)}/tasks/${id(tempTaskId)}`, "DELETE"),
    )
  }

  if (tempListId) {
    await runStep(report, "delete_temp_list", async () =>
      graphRequest(token, `${GRAPH_BASE}/me/todo/lists/${id(tempListId)}`, "DELETE"),
    )
  }

  report.temp = { listId: tempListId, taskId: tempTaskId }
  report.finishedAt = new Date().toISOString()
  report.ok = DOCTOR_STEP_NAMES.every((name) => report.steps.some((step) => step.name === name && step.ok))
  return redactSecrets(report)
}

export function summarizeReport(report: DoctorReport): string {
  const lines: string[] = []
  lines.push(`Microsoft To Do doctor: ${report.ok ? "PASSED" : "FAILED"}`)
  lines.push(`Started: ${report.startedAt}`)
  lines.push(`Finished: ${report.finishedAt}`)
  if (report.account) {
    lines.push(
      `Account: ${report.account.displayName ?? "unknown"} <${report.account.userPrincipalName ?? report.account.mail ?? "unknown"}>`,
    )
  }
  lines.push(`Visible lists: ${report.lists.length}`)
  for (const list of report.lists) {
    lines.push(`- ${list.displayName} (${list.id}): ${list.taskCount} tasks`)
  }
  lines.push("")
  lines.push("Steps:")
  for (const step of report.steps) {
    lines.push(`- ${step.ok ? "OK" : "FAIL"} ${step.name}`)
    if (step.error) {
      lines.push(`  HTTP status: ${step.error.status ?? "n/a"}`)
      lines.push(`  Graph code: ${step.error.code ?? "n/a"}`)
      lines.push(`  Message: ${step.error.message}`)
      lines.push(`  Guidance: ${step.error.guidance}`)
    }
  }
  return JSON.stringify(redactSecrets(lines.join("\n")))
    .slice(1, -1)
    .replaceAll("\\n", "\n")
}

export function isDirectRun(importMetaUrl: string, argvPath: string | undefined): boolean {
  return Boolean(argvPath && importMetaUrl === pathToFileURL(path.resolve(argvPath)).href)
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json")
  const report = await runDoctor()
  if (json) {
    console.log(JSON.stringify(redactSecrets(report), null, 2))
  } else {
    console.log(summarizeReport(report))
  }
  process.exitCode = report.ok ? 0 : 1
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    const info = describeGraphError(undefined, error instanceof Error ? error.message : String(error))
    console.error(
      summarizeReport({
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        ok: false,
        lists: [],
        steps: [{ name: "oauth_token_available", ok: false, error: redactSecrets(info) }],
      }),
    )
    process.exit(1)
  })
}
