$ErrorActionPreference = "Stop"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

function Invoke-RouteValidators([string]$nodePath) {
  & $nodePath (Join-Path $PSScriptRoot "validate-world-routes.js")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $nodePath (Join-Path $PSScriptRoot "validate-route-obstacles.js")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $nodePath (Join-Path $PSScriptRoot "validate-all-city-routes.js")
  exit $LASTEXITCODE
}

if ($nodeCommand) { Invoke-RouteValidators $nodeCommand.Source }
if (Test-Path $bundledNode) { Invoke-RouteValidators $bundledNode }

throw "Node.js was not found. Run this from Codex or install Node.js to use the route validator."
