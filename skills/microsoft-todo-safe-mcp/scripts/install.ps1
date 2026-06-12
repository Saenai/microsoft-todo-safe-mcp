param(
  [string]$DestinationRoot = (Join-Path $env:USERPROFILE ".codex\skills"),
  [string]$CodexConfig = (Join-Path $env:USERPROFILE ".codex\config.toml"),
  [switch]$SkipBuild,
  [switch]$SkipSmoke,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  @"
Install or refresh the Microsoft To Do Safe MCP Agent Skill.

Usage:
  powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [options]

Options:
  -DestinationRoot <path>  Skills directory. Default: %USERPROFILE%\.codex\skills
  -CodexConfig <path>      Codex config.toml path. Default: %USERPROFILE%\.codex\config.toml
  -SkipBuild               Copy/configure only; do not run pnpm install/build.
  -SkipSmoke               Do not run the MCP initialize/tools-list smoke test.
  -Help                    Show this help.

This script does not read or print token values. Tokens stay under:
  %APPDATA%\microsoft-todo-mcp\tokens.json
"@
  exit 0
}

function Escape-TomlBasicString([string]$Value) {
  return $Value.Replace("\", "\\").Replace('"', '\"')
}

function Copy-SkillTree([string]$Source, [string]$Destination) {
  $sourcePath = [System.IO.Path]::GetFullPath($Source).TrimEnd("\")
  $destinationPath = [System.IO.Path]::GetFullPath($Destination).TrimEnd("\")
  if ([string]::Equals($sourcePath, $destinationPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
    if ($item.Name -eq ".git") { continue }
    if ($item.Name -eq "node_modules") { continue }
    if ($item.FullName -match "\\server\\(node_modules|dist|safe-data|\.tmp)(\\|$)") { continue }

    $target = Join-Path $Destination $item.Name
    if ($item.PSIsContainer) {
      Copy-SkillTree -Source $item.FullName -Destination $target
    } else {
      Copy-Item -LiteralPath $item.FullName -Destination $target -Force
    }
  }
}

function Update-CodexConfig([string]$ConfigPath, [string]$ServerDir) {
  $configDir = Split-Path -Parent $ConfigPath
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null

  $backup = $null
  $content = ""
  if (Test-Path -LiteralPath $ConfigPath) {
    $backup = "$ConfigPath.bak-microsoft-todo-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item -LiteralPath $ConfigPath -Destination $backup -Force
    $content = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8
  }

  $serverDirToml = Escape-TomlBasicString $ServerDir
  $nodeToml = Escape-TomlBasicString "C:\Program Files\nodejs\node.exe"
  $commandArg = "Set-Location -LiteralPath '$serverDirToml'; & '$nodeToml' 'dist\\todo-index.js'"

  $block = @"
[mcp_servers.microsoft_todo_safe]
command = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "$commandArg"]
startup_timeout_sec = 20
"@

  $pattern = "(?ms)^\[mcp_servers\.microsoft_todo_safe\]\r?\n.*?(?=^\[|\z)"
  if ($content -match $pattern) {
    $content = [regex]::Replace($content, $pattern, $block + "`n")
  } else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
      $content += "`n"
    }
    $content += "`n$block`n"
  }

  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($ConfigPath, $content, $utf8NoBom)
  return $backup
}

$skillRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$destination = Join-Path $DestinationRoot "microsoft-todo-safe-mcp"

Copy-SkillTree -Source $skillRoot.Path -Destination $destination

$serverDir = Join-Path $destination "server"
if (-not (Test-Path -LiteralPath (Join-Path $serverDir "package.json"))) {
  throw "Installed server package.json not found: $serverDir"
}

$backup = Update-CodexConfig -ConfigPath $CodexConfig -ServerDir $serverDir

if (-not $SkipBuild) {
  Push-Location $serverDir
  try {
    corepack pnpm install
    corepack pnpm run build
  } finally {
    Pop-Location
  }
}

if (-not $SkipSmoke) {
  node (Join-Path $destination "scripts\mcp_smoke.mjs")
}

[pscustomobject]@{
  Status = "installed"
  Source = $skillRoot.Path
  Destination = $destination
  Server = $serverDir
  CodexConfig = $CodexConfig
  ConfigBackup = $backup
}
