param(
  [switch]$IncludeEmulators,
  [switch]$AllowNodeMismatch
)

$ErrorActionPreference = "Stop"
$healthRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())

if ($nodeMajor -ne 22 -and -not $AllowNodeMismatch) {
  throw "Crownlands release checks require Node 22. This shell is using Node $nodeMajor. Re-run with Node 22 or pass -AllowNodeMismatch for a non-release diagnostic run."
}

Push-Location (Join-Path $healthRoot "functions")
try {
  pnpm test
  if ($LASTEXITCODE -ne 0) { throw "The Crownlands static validator suite failed." }

  pnpm audit --prod --audit-level high
  if ($LASTEXITCODE -ne 0) { throw "The production dependency audit found a high-severity advisory." }
} finally {
  Pop-Location
}

& node (Join-Path $healthRoot "tools\validate-all-city-routes.js")
if ($LASTEXITCODE -ne 0) { throw "The all-city route gate failed." }

& node (Join-Path $healthRoot "tools\validate-server-route-parity.js")
if ($LASTEXITCODE -ne 0) { throw "The canonical server/client route parity gate failed." }

& node (Join-Path $healthRoot "tools\validate-world-routes.js")
if ($LASTEXITCODE -ne 0) { throw "The world route gate failed." }

& node (Join-Path $healthRoot "tools\validate-asset-performance-budgets.js")
if ($LASTEXITCODE -ne 0) { throw "The asset and installation-cache budgets failed." }

& node (Join-Path $healthRoot "tools\validate-interaction-health.js")
if ($LASTEXITCODE -ne 0) { throw "The interaction responsiveness gate failed." }

if ($IncludeEmulators) {
  if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw "Java 21 is required for Firebase emulator gates."
  }
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    throw "Firebase CLI is required for emulator gates."
  }
  Push-Location $healthRoot
  try {
    firebase emulators:exec --project crown-land-b15e0 --only auth,firestore,functions "node functions/test/emulator-reset-gate.js && node functions/test/emulator-rally-rules.js && node functions/test/emulator-army-listener-rules.js && node functions/test/emulator-clan-war-room-retirement-rules.js && node functions/test/emulator-city-relinquishment-limit.js && node functions/test/emulator-economy-concurrency.js && node functions/test/emulator-bulk-army-orders.js && node functions/test/emulator-peace-shield-returns.js && node functions/test/emulator-skill-presets.js && node functions/test/emulator-scout-report-lifecycle.js"
    if ($LASTEXITCODE -ne 0) { throw "The Firebase emulator gates failed." }
  } finally {
    Pop-Location
  }
}

Write-Host "Crownlands health check passed." -ForegroundColor Green
