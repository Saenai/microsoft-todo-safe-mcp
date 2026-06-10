#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import path from "node:path"

import { exportGraphBackup, summarizeBackup } from "../src/backup-export.ts"
import { getAccessToken } from "./doctor.ts"

export function defaultBackupOutputPath(now: string | Date = new Date()): string {
  const timestamp = new Date(now).toISOString().replace(/[:.]/g, "-")
  return join("safe-data", "backups", `mstodo-backup-${timestamp}.json`)
}

export function parseExportBackupArgs(argv: string[]): { outputPath?: string } {
  const outputIndex = argv.indexOf("--output")
  return {
    outputPath: outputIndex === -1 ? undefined : argv[outputIndex + 1],
  }
}

export function isDirectRun(importMetaUrl: string, argvPath: string | undefined): boolean {
  return Boolean(argvPath && importMetaUrl === pathToFileURL(path.resolve(argvPath)).href)
}

async function main(): Promise<void> {
  const args = parseExportBackupArgs(process.argv.slice(2))
  const token = await getAccessToken()
  if (!token) {
    throw new Error("No usable OAuth access token found. Run auth:device first.")
  }

  const backup = await exportGraphBackup({
    token,
    progress: (event) => {
      if (event.type === "account") {
        console.error("Fetched account metadata.")
      } else if (event.type === "lists") {
        console.error(`Found ${event.listCount} visible lists.`)
      } else if (event.type === "list") {
        console.error(
          `Fetched list ${event.index}/${event.total}: ${event.listName ?? event.listId} (${event.taskCount} tasks)`,
        )
      } else if (event.type === "done") {
        console.error(`Backup export read complete: ${event.listCount} lists, ${event.taskCount} tasks.`)
      }
    },
  })
  const outputPath = args.outputPath ?? defaultBackupOutputPath()
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(backup, null, 2), "utf8")

  console.log(
    JSON.stringify(
      {
        ok: true,
        output_path: outputPath,
        ...summarizeBackup(backup),
        writes_performed: 0,
      },
      null,
      2,
    ),
  )
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
