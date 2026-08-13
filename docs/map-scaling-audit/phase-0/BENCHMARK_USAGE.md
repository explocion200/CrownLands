# Phase 0 benchmark usage

## Prerequisites

- Run from the Crownlands repository root.
- Node.js 22 or newer; this baseline used v24.19.0.
- Google Chrome or Chromium-compatible Edge.
- `pnpm` is the repository's available package runner on the baseline machine. The root scripts also work with `npm run ...` when npm is installed.

No Firebase login, real Crownlands account, emulator import, production credentials, or development database is required.

## Validate the harness

```powershell
pnpm run validate:map-benchmark
```

This verifies deterministic fixture equality and counts, loopback safety gates, package entry points, and production-source isolation.

## Quick smoke run

```powershell
pnpm run benchmark:map:quick
```

The quick command runs scenario A at 1,440 × 900 with shortened sample windows. It verifies startup, metrics, pan, zoom, City Info, region switching, listener replacement, and output generation. It is not a replacement for the full 10-second/5-second baseline.

Outputs:

- `benchmark-results/map/quick-latest.json`
- `benchmark-results/map/quick-latest.md`

Quick outputs are git-ignored.

## Full benchmark

```powershell
pnpm run benchmark:map
```

Equivalent when npm is available:

```powershell
npm run benchmark:map
```

The full command starts a random-port loopback server, runs A–E across desktop, mobile landscape, and 4× CPU-throttled mobile, then shuts down the server/browser and removes temporary browser profiles.

Outputs:

- `benchmark-results/map/baseline.json` — authoritative machine-readable report.
- `benchmark-results/map/baseline.md` — generated compact human summary.

The full run can take many minutes because pathological profiles are allowed to demonstrate failure up to their watchdog. Normal isolated profiles have a 240-second watchdog; 4× profiles have 180 seconds.

## Enforce budgets

Validate the current supported-load regression floors, listener invariants, network safety, DOM, memory, and latency budgets:

```powershell
pnpm run validate:map-budgets
```

This must pass and writes `benchmark-results/map/budget-assessment.json`.

Evaluate the B/C capacity gates separately:

```powershell
pnpm run validate:map-capacity
```

This intentionally fails on the Phase 0 baseline because B is below the playability thresholds and C is unavailable. Do not weaken the gate to make it green; Phase 1 must improve the measured behavior.

## Resume behavior

After every full profile, the runner writes:

`benchmark-results/map/baseline.partial.json`

If the process is interrupted, rerun `pnpm run benchmark:map`. It resumes completed profiles and recorded failures. After a complete matrix, the partial checkpoint is removed.

To force a completely fresh matrix, stop any benchmark process, verify the exact target, and remove only `benchmark-results/map/baseline.partial.json` before rerunning. Do not reuse a partial checkpoint across code, fixture seed, browser major, or hardware changes.

## Custom Chromium path

The runner checks `CHROME_PATH`, then standard Chrome/Edge Windows locations.

```powershell
$env:CHROME_PATH = 'C:\Path\To\chrome.exe'
pnpm run benchmark:map
```

The environment variable applies only to the command shell; it does not change Crownlands configuration.

## Reading results

Start with `docs/map-scaling-audit/phase-0/BASELINE_RESULTS.md`. In JSON:

- `runs[]` contains successful profiles.
- `failures[]` contains unavailable profiles and their exact reason.
- `runs[].initialRuntime` proves exact initial fixture counts on baselines produced after the Phase 0 fixture-lifetime hardening.
- `runs[].samples` contains idle, pan, zoom, City Info, and switch samples.
- `frame` contains FPS, median/p95/max frame durations, and Long Tasks.
- `browserMainThread` contains task/script/style/layout deltas.
- `runtime` contains DOM/SVG, timers, animations, listener telemetry, image estimates, and final camera state.
- `network` contains request/resource/byte summaries and the production-backend safety count.

An unavailable profile is a failed capacity result. Do not replace it with zero, interpolate it, or omit it from conclusions.

## Reproducibility rules

- Keep seed `crownlands-map-phase-0-v1` unchanged for before/after comparisons.
- Use the same Chrome major, host, power mode, and background-load conditions.
- Run at least three full matrices and compare medians for release decisions.
- Record physical-device results separately; never relabel the mobile emulation as Android hardware.
- Do not compare quick-run values to full-baseline budgets.
- Treat paint/composite and true Firestore billing/network metrics as unavailable until measured with appropriate tooling.

## Safety notes

The harness binds to `127.0.0.1`, rejects non-loopback hosts, replaces Firebase only in the served benchmark page, and makes no production Firebase request. Do not change the host binding or deploy `tools/map-benchmark/` as a public authentication mechanism.

The command does not build or deploy Crownlands, write player data, modify Firebase configuration, or change normal authentication/gameplay.

## Troubleshooting

- **Chrome not found:** set `CHROME_PATH` to a Chromium executable.
- **Ready timeout:** keep the failure; it is meaningful under that load. Inspect `failures[]` and run the quick smoke test to distinguish global setup failure from scenario capacity failure.
- **Unexpected external/backend request:** stop and investigate. `productionBackendRequestCount` must remain zero.
- **Count mismatch:** run `pnpm run validate:map-benchmark`; do not accept a faster result that silently omitted entities.
- **Stale partial result:** use the resume rules above and never combine checkpoints from different code/seed/browser environments.
