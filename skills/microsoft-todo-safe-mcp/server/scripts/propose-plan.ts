#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"
import path from "node:path"

import {
  defaultPlanOutputPath,
  parseProposePlanArgs,
  proposePlanFromBackup,
  summarizePlanProposal,
  type BackupEnvelope,
} from "../src/plan-proposer.ts"

export function isDirectRun(importMetaUrl: string, argvPath: string | undefined): boolean {
  return Boolean(argvPath && importMetaUrl === pathToFileURL(path.resolve(argvPath)).href)
}

export function parseBackupJson(text: string): BackupEnvelope {
  return JSON.parse(text.replace(/^\uFEFF/, "")) as BackupEnvelope
}

async function main(): Promise<void> {
  const args = parseProposePlanArgs(process.argv.slice(2))
  const backup = parseBackupJson(readFileSync(args.backupPath, "utf8"))
  const plan = proposePlanFromBackup(backup, { limit: args.limit })
  const outputPath = args.outputPath ?? defaultPlanOutputPath()

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(plan, null, 2), "utf8")

  console.log(
    JSON.stringify(
      {
        ok: true,
        output_path: outputPath,
        ...summarizePlanProposal(plan),
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
