import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDeviceCodeRequest,
  buildTokenPollRequest,
  diagnosticPublicClientId,
  normalizeTenant,
  redactAuthDeviceOutput,
  sessionPayloadFromDeviceResponse,
  tokenPayloadFromDeviceResponse,
} from "./auth-device.ts"

test("normalizeTenant defaults to consumers for personal Microsoft accounts", () => {
  assert.equal(normalizeTenant(undefined), "consumers")
  assert.equal(normalizeTenant(""), "consumers")
  assert.equal(normalizeTenant("common"), "common")
})

test("buildDeviceCodeRequest uses diagnostic public client when requested", () => {
  const request = buildDeviceCodeRequest({
    diagnosticPublicClient: true,
    scopes: ["User.Read", "Tasks.ReadWrite", "offline_access"],
  })

  assert.equal(request.url, "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
  assert.equal(request.body.get("client_id"), diagnosticPublicClientId)
  assert.equal(request.body.get("scope"), "User.Read Tasks.ReadWrite offline_access")
})

test("buildDeviceCodeRequest rejects missing client id outside diagnostic mode", () => {
  assert.throws(() => buildDeviceCodeRequest({ diagnosticPublicClient: false, scopes: ["User.Read"] }), /CLIENT_ID/)
})

test("buildTokenPollRequest never includes a client secret", () => {
  const request = buildTokenPollRequest({
    tenantId: "consumers",
    clientId: "client-id",
    deviceCode: "device-code",
  })

  assert.equal(request.url, "https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
  assert.equal(request.body.get("client_id"), "client-id")
  assert.equal(request.body.get("device_code"), "device-code")
  assert.equal(request.body.has("client_secret"), false)
})

test("tokenPayloadFromDeviceResponse writes doctor-compatible token fields", () => {
  const now = 1_000_000
  const payload = tokenPayloadFromDeviceResponse(
    {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "User.Read Tasks.ReadWrite",
    },
    {
      clientId: "client-id",
      tenantId: "consumers",
      now,
    },
  )

  assert.equal(payload.accessToken, "access-token")
  assert.equal(payload.refreshToken, "refresh-token")
  assert.equal(payload.expiresAt, now + 3600 * 1000 - 5 * 60 * 1000)
  assert.equal(payload.clientId, "client-id")
  assert.equal(payload.tenantId, "consumers")
  assert.equal("clientSecret" in payload, false)
})

test("redactAuthDeviceOutput hides OAuth tokens", () => {
  assert.deepEqual(redactAuthDeviceOutput({ access_token: "a", refreshToken: "r", ok: true }), {
    access_token: "[REDACTED]",
    refreshToken: "[REDACTED]",
    ok: true,
  })
})

test("sessionPayloadFromDeviceResponse stores enough data to complete later", () => {
  const now = 2_000_000
  const session = sessionPayloadFromDeviceResponse(
    {
      device_code: "device-code",
      user_code: "ABCD-EFGH",
      verification_uri: "https://microsoft.com/devicelogin",
      expires_in: 900,
      interval: 5,
    },
    { clientId: "client-id", tenantId: "consumers", diagnosticPublicClient: true, now },
  )

  assert.equal(session.deviceCode, "device-code")
  assert.equal(session.userCode, "ABCD-EFGH")
  assert.equal(session.verificationUri, "https://microsoft.com/devicelogin")
  assert.equal(session.expiresAt, now + 900 * 1000)
  assert.equal(session.clientId, "client-id")
  assert.equal(session.tenantId, "consumers")
  assert.equal(session.diagnosticPublicClient, true)
})
