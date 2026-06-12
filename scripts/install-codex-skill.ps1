param(
  [string]$DestinationRoot = (Join-Path $env:USERPROFILE ".codex\skills")
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$source = Join-Path $projectRoot ".codex\skills\microsoft-todo-safe-mcp"
$destination = Join-Path $DestinationRoot "microsoft-todo-safe-mcp"

if (-not (Test-Path -LiteralPath $source)) {
  throw "Skill source not found: $source"
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item -LiteralPath (Join-Path $source "SKILL.md") -Destination (Join-Path $destination "SKILL.md") -Force

foreach ($dir in @("agents", "references", "scripts")) {
  $srcDir = Join-Path $source $dir
  if (Test-Path -LiteralPath $srcDir) {
    $dstDir = Join-Path $destination $dir
    New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $srcDir "*") -Destination $dstDir -Recurse -Force
  }
}

[pscustomobject]@{
  Source = $source
  Destination = $destination
}
