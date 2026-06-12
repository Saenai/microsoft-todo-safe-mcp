import assert from "node:assert/strict"
import test from "node:test"

import { buildRefreshTokenRequest } from "../src/oauth-refresh.ts"

test("buildRefreshTokenRequest omits client_secret for public clients", () => {
  const request = buildRefreshTokenRequest({
    tenantId: "consumers",
    clientId: "client-id",
    refreshToken: "refresh-token",
    scopes: ["offline_access", "User.Read", "Tasks.ReadWrite"],
  })

  assert.equal(request.url, "https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
  assert.equal(request.body.get("client_id"), "client-id")
  assert.equal(request.body.get("refresh_token"), "refresh-token")
  assert.equal(request.body.get("grant_type"), "refresh_token")
  assert.equal(request.body.get("scope"), "offline_access User.Read Tasks.ReadWrite")
  assert.equal(request.body.has("client_secret"), false)
})

test("buildRefreshTokenRequest includes client_secret only when provided", () => {
  const request = buildRefreshTokenRequest({
    tenantId: "common",
    clientId: "client-id",
    clientSecret: "secret",
    refreshToken: "refresh-token",
    scopes: ["User.Read"],
  })

  assert.equal(request.body.get("client_secret"), "secret")
})
