export const defaultTodoScopes = [
  "offline_access",
  "User.Read",
  "Tasks.Read",
  "Tasks.ReadWrite",
  "Tasks.Read.Shared",
  "Tasks.ReadWrite.Shared",
]

export interface RefreshTokenRequestOptions {
  tenantId: string
  clientId: string
  clientSecret?: string
  refreshToken: string
  scopes?: string[]
}

export function buildRefreshTokenRequest(options: RefreshTokenRequestOptions): { url: string; body: URLSearchParams } {
  const body = new URLSearchParams({
    client_id: options.clientId,
    refresh_token: options.refreshToken,
    grant_type: "refresh_token",
    scope: (options.scopes ?? defaultTodoScopes).join(" "),
  })

  if (options.clientSecret) {
    body.set("client_secret", options.clientSecret)
  }

  return {
    url: `https://login.microsoftonline.com/${options.tenantId}/oauth2/v2.0/token`,
    body,
  }
}
