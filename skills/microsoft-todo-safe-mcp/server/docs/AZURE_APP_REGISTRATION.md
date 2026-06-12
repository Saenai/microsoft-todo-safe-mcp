# Azure App Registration Setup

Date: 2026-06-10

This project does not need Azure hosting, a VPS, a database, or a new web service. The Azure / Microsoft Entra app registration is only an OAuth identity that lets this local tool ask Microsoft for delegated access to your own Microsoft To Do data.

## Recommended Setup For iPhone + Remote Codex

Use a public-client device-code flow.

This is the right fit when Codex is running on the home PC but the login browser is on the ChatGPT iOS client. The old localhost callback flow is awkward in that setup because `localhost` on the phone is not the home PC.

Do not create a client secret for this recommended path.

## Create The App Registration

1. Open the Microsoft Entra admin center or Azure Portal.
2. Go to **Microsoft Entra ID** > **App registrations** > **New registration**.
3. Name it, for example:

   ```text
   Local Microsoft To Do Safe MCP
   ```

4. For **Supported account types**, choose an option that includes personal Microsoft accounts.

   Preferred:

   ```text
   Accounts in any organizational directory and personal Microsoft accounts
   ```

   If the portal shows a personal-only option, that is also acceptable for this personal To Do use case.

5. Leave **Redirect URI** empty for the device-code flow.

   Only add `http://localhost:3000/callback` if you later decide to use the legacy local browser callback flow.

6. Create the app.
7. Copy **Application (client) ID**. This is the value for `CLIENT_ID`.

## Enable Public Client Flow

1. Open the new app registration.
2. Go to **Authentication**.
3. Find **Advanced settings**.
4. Set **Allow public client flows** to **Yes**.
5. Save.

Without this setting, device-code login can fail with `invalid_client` or similar OAuth errors.

## Graph API Permissions

Open **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**.

Add:

- `User.Read`
- `Tasks.Read`
- `Tasks.ReadWrite`
- `Tasks.Read.Shared`
- `Tasks.ReadWrite.Shared`
- `offline_access`
- `openid`
- `profile`

Notes:

- `offline_access` is needed so the local token file can receive a refresh token.
- `openid` and `profile` are normal sign-in scopes used by the device-code script.
- These are delegated permissions, meaning the tool acts as the signed-in user. They are not application permissions.

For a personal app, you normally consent during login. You do not need tenant-wide admin consent for a personal Microsoft account scenario.

## Local Environment Variables

From the repository root:

```powershell
$env:CLIENT_ID = "<application-client-id>"
$env:TENANT_ID = "consumers"
```

Use `consumers` for a personal Outlook / Microsoft account. `common` can also work, but `consumers` is more explicit for this project.

Do not set `CLIENT_SECRET` for the recommended device-code path.

## Login From iPhone, Complete On PC

Start the device session on the PC:

```powershell
corepack pnpm run auth:device -- --start-only
```

The command prints a Microsoft URL and a short code. On the iPhone:

1. Open the printed URL.
2. Enter the code.
3. Sign in with the Microsoft account used for To Do.
4. Approve the requested permissions.

Then complete token retrieval on the PC:

```powershell
corepack pnpm run auth:device -- --complete
```

Verify Graph and To Do access:

```powershell
corepack pnpm run doctor
```

## Diagnostic Public Client

The repository also supports a temporary diagnostic mode:

```powershell
corepack pnpm run auth:device -- --diagnostic-public-client --start-only
corepack pnpm run auth:device -- --complete
corepack pnpm run doctor
```

This uses Microsoft's well-known Graph Command Line Tools public client ID. It is useful only to prove that the personal account and Graph To Do endpoints work. For continued use, replace it with your own app registration and `CLIENT_ID`.

## Legacy Local Callback Flow

The upstream project also has a local browser callback flow:

```powershell
$env:CLIENT_ID = "<application-client-id>"
$env:CLIENT_SECRET = "<client-secret>"
$env:REDIRECT_URI = "http://localhost:3000/callback"
$env:TENANT_ID = "consumers"
corepack pnpm run build
corepack pnpm run auth
```

Use this only when you are operating directly on the PC browser. It is not the recommended path for ChatGPT iOS remote operation.

If you use this legacy flow, add this redirect URI in the app registration:

```text
http://localhost:3000/callback
```

The legacy flow is the only path here that needs a client secret.

## Token Storage

Tokens are stored locally in:

```text
%APPDATA%\microsoft-todo-mcp\tokens.json
```

Treat this file as sensitive. Do not paste it into chat, screenshots, issue reports, or commits. It may contain an access token, a refresh token, and sometimes OAuth client metadata.

## Troubleshooting

`authorization_pending`

The iPhone login is not finished yet. Complete the code login and run `auth:device -- --complete` again.

`expired_token`

The device code expired. Start over with `auth:device -- --start-only`.

`AADSTS700016`

The `CLIENT_ID` is wrong, copied from the wrong app, or the app registration was deleted.

`invalid_client`

For device-code login, confirm **Allow public client flows** is set to **Yes** and do not send `CLIENT_SECRET`.

Personal Microsoft account cannot sign in

The app registration probably does not include personal Microsoft accounts in **Supported account types**. Create a new registration or change the supported account setting if the portal allows it.

`insufficient privileges` or HTTP 403 from Graph

Check that the delegated Microsoft Graph To Do permissions were added and consented:

- `Tasks.Read`
- `Tasks.ReadWrite`
- `Tasks.Read.Shared`
- `Tasks.ReadWrite.Shared`
- `User.Read`

`MailboxNotEnabledForRESTAPI`

This can indicate a Microsoft account / mailbox compatibility issue. Re-run:

```powershell
$env:TENANT_ID = "consumers"
corepack pnpm run auth:device -- --start-only
corepack pnpm run auth:device -- --complete
corepack pnpm run doctor
```

If the issue persists, document the result in `docs/PERSONAL_ACCOUNT_COMPATIBILITY.md` before changing architecture.
