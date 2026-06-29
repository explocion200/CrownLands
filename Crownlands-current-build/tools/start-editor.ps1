$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$serverScript = Join-Path $PSScriptRoot "editor-server.js"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { "" }

if (-not $nodePath) {
  $codexNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path -LiteralPath $codexNode) {
    $nodePath = $codexNode
  }
}

if (-not $nodePath) {
  Write-Error "Node.js was not found. Install Node.js or run this from Codex so the bundled runtime is available."
}

Set-Location $repoRoot
& $nodePath $serverScript
