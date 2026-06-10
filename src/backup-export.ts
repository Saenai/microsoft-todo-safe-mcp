export interface BackupEnvelope {
  schema_version: "1.0"
  created_at: string
  account?: unknown
  lists: Array<Record<string, unknown>>
  tasks_by_list: Record<string, Array<Record<string, unknown>>>
}

export interface ExportGraphBackupOptions {
  token: string
  now?: string | Date
  graphBase?: string
  fetchImpl?: typeof fetch
  checklistConcurrency?: number
  sleepMs?: (milliseconds: number) => Promise<void>
  progress?: (event: ExportProgressEvent) => void
}

export type ExportProgressEvent =
  | { type: "account" }
  | { type: "lists"; listCount: number }
  | { type: "list"; listId: string; listName?: string; index: number; total: number; taskCount: number }
  | { type: "done"; listCount: number; taskCount: number }

const defaultGraphBase = "https://graph.microsoft.com/v1.0"
const defaultChecklistConcurrency = 3
const defaultMaxGraphAttempts = 6

export async function exportGraphBackup(options: ExportGraphBackupOptions): Promise<BackupEnvelope> {
  const graphBase = options.graphBase ?? defaultGraphBase
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepMs = options.sleepMs ?? defaultSleepMs
  const account = await graphRequest<Record<string, unknown>>(`${graphBase}/me`, options.token, fetchImpl, sleepMs)
  options.progress?.({ type: "account" })

  const lists = await fetchPaged<Record<string, unknown>>(
    `${graphBase}/me/todo/lists?$top=100`,
    options.token,
    fetchImpl,
    sleepMs,
  )
  options.progress?.({ type: "lists", listCount: lists.length })

  const tasksByList: Record<string, Array<Record<string, unknown>>> = {}
  const checklistConcurrency = Math.max(1, Math.min(options.checklistConcurrency ?? defaultChecklistConcurrency, 32))

  for (const [index, list] of lists.entries()) {
    if (typeof list.id !== "string") continue
    const listId = list.id
    const tasks = await fetchPaged<Record<string, unknown>>(
      `${graphBase}/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`,
      options.token,
      fetchImpl,
      sleepMs,
    )

    await mapWithConcurrency(tasks, checklistConcurrency, async (task) => {
      if (typeof task.id !== "string") return
      task.checklistItems = await fetchPaged<Record<string, unknown>>(
        `${graphBase}/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(task.id)}/checklistItems`,
        options.token,
        fetchImpl,
        sleepMs,
      )
    })

    tasksByList[listId] = tasks
    options.progress?.({
      type: "list",
      listId,
      listName: typeof list.displayName === "string" ? list.displayName : undefined,
      index: index + 1,
      total: lists.length,
      taskCount: tasks.length,
    })
  }

  options.progress?.({
    type: "done",
    listCount: lists.length,
    taskCount: Object.values(tasksByList).reduce((sum, tasks) => sum + tasks.length, 0),
  })

  return {
    schema_version: "1.0",
    created_at: new Date(options.now ?? Date.now()).toISOString(),
    account,
    lists,
    tasks_by_list: tasksByList,
  }
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  callback: (value: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      await callback(values[currentIndex], currentIndex)
    }
  })
  await Promise.all(workers)
}

async function fetchPaged<T>(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  sleepMs: (milliseconds: number) => Promise<void>,
): Promise<T[]> {
  const results: T[] = []
  let nextUrl: string | undefined = url

  while (nextUrl) {
    const page: { value?: T[]; "@odata.nextLink"?: string } = await graphRequest(nextUrl, token, fetchImpl, sleepMs)
    results.push(...(page.value ?? []))
    nextUrl = page["@odata.nextLink"]
  }

  return results
}

async function graphRequest<T>(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  sleepMs: (milliseconds: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 1; attempt <= defaultMaxGraphAttempts; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
    const text = await response.text()
    const parsed = text.length > 0 ? JSON.parse(text) : {}

    if (response.ok) {
      return parsed as T
    }

    if (attempt < defaultMaxGraphAttempts && shouldRetry(response.status)) {
      await sleepMs(retryDelayMs(response, attempt))
      continue
    }

    const error = parsed?.error ?? parsed
    throw new Error(`Graph request failed (${response.status}): ${error.code ?? "unknown"} ${error.message ?? text}`)
  }

  throw new Error("Graph request failed after retry attempts")
}

function shouldRetry(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After")
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  }
  return Math.min(30_000, 500 * 2 ** (attempt - 1))
}

function defaultSleepMs(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function summarizeBackup(backup: Pick<BackupEnvelope, "lists" | "tasks_by_list">): {
  list_count: number
  task_count: number
} {
  return {
    list_count: backup.lists.length,
    task_count: Object.values(backup.tasks_by_list).reduce((sum, tasks) => sum + tasks.length, 0),
  }
}
