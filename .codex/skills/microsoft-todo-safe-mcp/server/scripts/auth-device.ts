#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

export const diagnosticPublicClientId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"

const defaultScopes = [
  "offline_access",
  "openid",
  "profile",
  "User.Read",
  "Tasks.Read",
  "Tasks.ReadWrite",
  "Tasks.Read.Shared",
  "Tasks.ReadWrite.Shared",
]

const secretKeyPattern = /(access|refresh|id)_?token|client_?secret|authorization|password|secret/i

export interface AuthDeviceOptions {
  tenantId?: string
  clientId?: string
  diagnosticPublicClient?: boolean
  scopes?: string[]
  startOnly?: boolean
  complete?: boolean
}

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval?: number
  message?: string
}

interface StoredDeviceSession {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresAt: number
  intervalSeconds: number
  clientId: string
  tenantId: string
  diagnosticPublicClient: boolean
}

interface DeviceTokenSuccess {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

interface DeviceTokenPending {
  error: "authorization_pending" | "slow_down"
  error_description?: string
  interval?: number
}

interface DeviceTokenFailure {
  error: string
  error_description?: string
}

type DeviceTokenResponse = DeviceTokenSuccess | DeviceTokenPending | DeviceTokenFailure

export interface StoredDeviceTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType?: string
  scopes?: string[]
  clientId: string
  tenantId: string
}

export function normalizeTenant(value: string | undefined): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : "consumers"
}

function resolveClientId(options: AuthDeviceOptions): string {
  if (options.diagnosticPublicClient) return diagnosticPublicClientId
  const clientId = options.clientId || process.env.CLIENT_ID
  if (!clientId) {
    throw new Error("CLIENT_ID is required unless --diagnostic-public-client is used.")
  }
  return clientId
}

export function buildDeviceCodeRequest(options: AuthDeviceOptions): { url: string; body: URLSearchParams } {
  const tenantId = normalizeTenant(options.tenantId || process.env.TENANT_ID)
  const clientId = resolveClientId(options)
  const scopes = options.scopes ?? defaultScopes

  return {
    url: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    body: new URLSearchParams({
      client_id: clientId,
      scope: scopes.join(" "),
    }),
  }
}

export function buildTokenPollRequest(options: { tenantId: string; clientId: string; deviceCode: string }): {
  url: string
  body: URLSearchParams
} {
  return {
    url: `https://login.microsoftonline.com/${options.tenantId}/oauth2/v2.0/token`,
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: options.clientId,
      device_code: options.deviceCode,
    }),
  }
}

export function tokenPayloadFromDeviceResponse(
  response: DeviceTokenSuccess,
  options: { clientId: string; tenantId: string; now?: number },
): StoredDeviceTokens {
  const now = options.now ?? Date.now()
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: now + (response.expires_in ?? 3600) * 1000 - 5 * 60 * 1000,
    tokenType: response.token_type,
    scopes: response.scope?.split(/\s+/).filter(Boolean),
    clientId: options.clientId,
    tenantId: options.tenantId,
  }
}

export function sessionPayloadFromDeviceResponse(
  response: DeviceCodeResponse,
  options: { clientId: string; tenantId: string; diagnosticPublicClient?: boolean; now?: number },
): StoredDeviceSession {
  const now = options.now ?? Date.now()
  return {
    deviceCode: response.device_code,
    userCode: response.user_code,
    verificationUri: response.verification_uri,
    expiresAt: now + response.expires_in * 1000,
    intervalSeconds: response.interval ?? 5,
    clientId: options.clientId,
    tenantId: options.tenantId,
    diagnosticPublicClient: Boolean(options.diagnosticPublicClient),
  }
}

export function redactAuthDeviceOutput<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactAuthDeviceOutput(item)) as T
  if (!value || typeof value !== "object") return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = secretKeyPattern.test(key) ? "[REDACTED]" : redactAuthDeviceOutput(item)
  }
  return output as T
}

function configTokenPath(): string {
  const configDir =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(homedir(), "AppData", "Roaming"), "microsoft-todo-mcp")
      : path.join(homedir(), ".config", "microsoft-todo-mcp")
  return path.join(configDir, "tokens.json")
}

function tokenFilePath(): string {
  return process.env.MSTODO_TOKEN_FILE || configTokenPath()
}

function sessionFilePath(): string {
  return process.env.MSTODO_DEVICE_SESSION_FILE || path.join(process.cwd(), ".mstodo-device-session.json")
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
}

async function postForm<T>(url: string, body: URLSearchParams): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await response.text()
  const data = (text.length > 0 ? JSON.parse(text) : {}) as T
  return { ok: response.ok, status: response.status, data }
}

function parseArgs(argv: string[]): AuthDeviceOptions {
  return {
    diagnosticPublicClient: argv.includes("--diagnostic-public-client"),
    startOnly: argv.includes("--start-only"),
    complete: argv.includes("--complete"),
    tenantId: process.env.TENANT_ID,
    clientId: process.env.CLIENT_ID,
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function isTokenSuccess(value: DeviceTokenResponse): value is DeviceTokenSuccess {
  return "access_token" in value
}

async function runAuthDevice(options: AuthDeviceOptions): Promise<StoredDeviceTokens> {
  if (options.complete) {
    return completeStoredDeviceSession()
  }

  const tenantId = normalizeTenant(options.tenantId || process.env.TENANT_ID)
  const clientId = resolveClientId(options)
  const deviceRequest = buildDeviceCodeRequest({ ...options, tenantId, clientId })

  const device = await postForm<DeviceCodeResponse | DeviceTokenFailure>(deviceRequest.url, deviceRequest.body)
  if (!device.ok || !("device_code" in device.data)) {
    throw new Error(
      `Device authorization failed (${device.status}): ${JSON.stringify(redactAuthDeviceOutput(device.data))}`,
    )
  }

  console.log("")
  console.log("Open this URL on your iPhone and enter the code:")
  console.log(device.data.verification_uri)
  console.log("")
  console.log(`Code: ${device.data.user_code}`)
  if (device.data.message) {
    console.log("")
    console.log(device.data.message)
  }
  console.log("")
  console.log("Waiting for Microsoft login to complete...")

  const session = sessionPayloadFromDeviceResponse(device.data, {
    tenantId,
    clientId,
    diagnosticPublicClient: options.diagnosticPublicClient,
  })
  const outputSessionPath = sessionFilePath()
  ensureParentDirectory(outputSessionPath)
  writeFileSync(outputSessionPath, JSON.stringify(session, null, 2), "utf8")
  console.log(`Device session saved to: ${outputSessionPath}`)

  if (options.startOnly) {
    console.log("Start-only mode: after signing in on the iPhone, run:")
    console.log("corepack pnpm run auth:device -- --complete")
    return {
      accessToken: "",
      expiresAt: 0,
      clientId,
      tenantId,
    }
  }

  return pollAndSaveDeviceToken(session)
}

async function completeStoredDeviceSession(): Promise<StoredDeviceTokens> {
  const inputSessionPath = sessionFilePath()
  if (!existsSync(inputSessionPath)) {
    throw new Error(`No device session found at ${inputSessionPath}. Run auth:device -- --start-only first.`)
  }
  const session = JSON.parse(readFileSync(inputSessionPath, "utf8")) as StoredDeviceSession
  return pollAndSaveDeviceToken(session)
}

async function pollAndSaveDeviceToken(session: StoredDeviceSession): Promise<StoredDeviceTokens> {
  let intervalSeconds = session.intervalSeconds

  while (Date.now() < session.expiresAt) {
    await sleep(intervalSeconds * 1000)
    const pollRequest = buildTokenPollRequest({
      tenantId: session.tenantId,
      clientId: session.clientId,
      deviceCode: session.deviceCode,
    })
    const token = await postForm<DeviceTokenResponse>(pollRequest.url, pollRequest.body)

    if (token.ok && isTokenSuccess(token.data)) {
      const payload = tokenPayloadFromDeviceResponse(token.data, {
        tenantId: session.tenantId,
        clientId: session.clientId,
      })
      const outputPath = tokenFilePath()
      ensureParentDirectory(outputPath)

      const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : {}
      writeFileSync(outputPath, JSON.stringify({ ...existing, ...payload }, null, 2), "utf8")
      console.log(`Token saved to: ${outputPath}`)
      return payload
    }

    if ("error" in token.data) {
      if (token.data.error === "authorization_pending") continue
      if (token.data.error === "slow_down") {
        intervalSeconds += 5
        continue
      }
      throw new Error(
        `Device token polling failed (${token.status}): ${JSON.stringify(redactAuthDeviceOutput(token.data))}`,
      )
    }
  }

  throw new Error("Device code expired before login completed. Run auth:device again.")
}

export function isDirectRun(importMetaUrl: string, argvPath: string | undefined): boolean {
  return Boolean(argvPath && importMetaUrl === pathToFileURL(path.resolve(argvPath)).href)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.diagnosticPublicClient) {
    console.log("Diagnostic mode: using Microsoft Graph Command Line Tools public client id.")
    console.log("Use this only to verify Graph To Do compatibility before creating your own app registration.")
  }
  await runAuthDevice(options)
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
