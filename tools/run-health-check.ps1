param(
  [switch]$IncludeEmulators,
  [switch]$AllowNodeMismatch
)

$ErrorActionPreference = "Stop"
$healthRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$functionsRoot = Join-Path $healthRoot "functions"
$nodeMajor = [int]((& pnpm --dir $functionsRoot exec node -p "process.versions.node.split('.')[0]").Trim())

if ($nodeMajor -ne 22 -and -not $AllowNodeMismatch) {
  throw "Crownlands release checks require Node 22. This shell is using Node $nodeMajor. Re-run with Node 22 or pass -AllowNodeMismatch for a non-release diagnostic run."
}

Push-Location $functionsRoot
try {
  if ($IncludeEmulators) {
    pnpm run gate:release
  } else {
    pnpm run gate:static
  }
  if ($LASTEXITCODE -ne 0) { throw "The canonical Crownlands release gate failed." }
} finally {
  Pop-Location
}

Write-Host "Crownlands health check passed." -ForegroundColor Green
