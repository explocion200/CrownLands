$ErrorActionPreference = "Stop"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCommand) {
  & $nodeCommand.Source (Join-Path $PSScriptRoot "validate-world-routes.js")
  exit $LASTEXITCODE
}

if (Test-Path $bundledNode) {
  & $bundledNode (Join-Path $PSScriptRoot "validate-world-routes.js")
  exit $LASTEXITCODE
}

throw "Node.js was not found. Run this from Codex or install Node.js to use the route validator."
