# PC and mobile stability audit

This audit implements the approved September 24 plan. The baseline is `a01303edf61d350cdd3a9363d308edf2945acbdc`; the development branch is `codex/stability-audit-baseline`. The Master Specification remains authoritative. This document records testing, not new game rules or a deployment.

## Boundaries

Use the current Core topology and verify `realmConfig/current` before interpreting production evidence. Synthetic clients run against the loopback fixture or Firebase emulators. Production access is limited to public assets, deployment metadata and aggregate read-only logs. Do not load test production, create player actions, repair balances, change archived realms, or infer permission to deploy.

Keep gameplay fixes on their own current-main branches. Reproduce a problem, distinguish game defects from fixture/environment failures, add a meaningful regression, measure the same scenario before/after, and run `prepare-pr`. Merging and deploying require separate authorization.

## Reproduce

Use Node 22 and `pnpm`. Install root development tools with `pnpm install --frozen-lockfile`. Install backend tools from the `functions` working directory using the pnpm version pinned in its `package.json` (11.9.0 at this audit), rather than passing a different root pnpm version through `--dir`. The safe-update helpers resolve the existing pinned backend executable. For compatibility runs install the pinned browser engines using `pnpm exec playwright install chromium firefox webkit`. Installed Chrome and Edge are used when selected; record their actual versions.

Run from the repository root, with a **new output directory** each time:

```powershell
pnpm audit:stability --output-directory=release-artifacts/audit-startup
pnpm audit:compatibility --output-directory=release-artifacts/audit-compatibility
pnpm audit:soak --output-directory=release-artifacts/audit-soak
pnpm audit:production --output-directory=release-artifacts/audit-production
pnpm audit:request-counts --output-directory=release-artifacts/audit-request-counts
pnpm audit:stability:full --soak-minutes=0 --output-directory=release-artifacts/audit-matrix
```

The final command performs three complete map-matrix repetitions and the startup cases; the separate soak command supplies the long duration coverage. Run the map matrix alone, on the same machine/browser/power configuration before and after a fix. Concurrent browser validators or load jobs invalidate comparative frame-rate evidence. `audit:soak --parallel` is permitted only as an explicitly labeled concurrent lifecycle/memory stress test. A `--minutes` override is a probe, not the required long soak.

To compare an isolated feature worktree with the exact same harness, set `CROWNLANDS_BENCHMARK_ROOT` to that worktree's absolute path and invoke these tools from the harness checkout. Client files, fixture catalogs and the authoritative contract come from the selected worktree; measurement instrumentation stays in the harness checkout. The audit records and checks both identities. Remove the environment override before measuring the baseline again.

Do not edit executable inputs during a final measurement. Reports record source identity and detect changed inputs. Historical tracked reports are immutable. Tool exits distinguish a successful partial startup probe from a complete matrix; read the coverage statuses, not only the exit code. Unavailable browsers and truncated production logs are never healthy results.

Production collectors use the existing authorized Firebase CLI login. The log collector accepts `--days=1` or `--days=1,7`, `--queries=http,errors,timings`, and an optional comma-separated `--revisions` list. A revision filter must match freshly observed deployed revisions; it cannot silently select an old release. HTTP latency queries include POST only. Error queries include known application failures logged at DEFAULT severity; one failed request may produce several records. Raw messages, player payloads and request/response debug bodies are excluded from exports.

When invoking `pnpm` from PowerShell, quote comma-separated options, for example `'--days=1,7'` and `'--queries=http,errors,timings'`. Otherwise the PowerShell shim can turn the comma-separated value into a space-separated array. Invalid revision values are rejected rather than broadening the query.

The separate request-count collector uses Cloud Monitoring hourly aggregates, all methods/triggers, and complete pagination where available. Its windows end at a completed hour with an availability delay. Counts are not latency distributions or a POST-only error rate. A current revision younger than seven days does not acquire seven days of exposure by querying a seven-day window. Late telemetry backfill can change previously read totals. Both collectors return a failing exit status for partial/unavailable coverage and refuse to overwrite earlier evidence.

## Required evidence

| Area | Method and acceptance |
|---|---|
| Startup and recovery | Eight cases: cold/warm login, delayed callable, delayed first snapshot, rejected callable, lost response, 4× CPU with slow networking, replacement session. Explicit expected failure/recovery, no unexpected runtime errors, no synthetic production calls. |
| Map rendering | A: 50 cities/25 marches; B: 100/50; C: 150/100; D: 100/0; E: 50/100. Desktop 1440×900, landscape 844×390, landscape 4× CPU; three repetitions = 45 profiles. Existing regression/capacity limits in `tools/map-benchmark/budgets.js` remain unchanged. Preserve failed profiles and null metrics. |
| Long sessions | Desktop 60 minutes, landscape 60 minutes, landscape 4× CPU 30 minutes. Each: 50 requested map transitions, 100 city-dialog cycles, 20 foreground cycles, 10 reconnect cycles and offline periods. Eleven post-GC samples; no duplicate listeners or interval growth; last-half retained-heap growth ≤ the larger of 10 MiB or 10%. Inspect timeout/RAF/DOM series for continued growth as well. |
| Browser compatibility | Chrome, Edge, Firefox and WebKit at 1440×900, 1920×1080, 844×390 and 568×320. Dialog interaction, map travel, stale snapshots, reconnect/offline recovery, landscape/portrait roundtrip and screenshots. WebKit on Windows is not a physical iPhone test. |
| Client boundaries | Existing connection, foreground, session, region, optimistic-action and report tests: lost responses, old snapshots, failed mutations, stopped listeners, double submissions, clock differences and confirmed-state reconciliation. |
| Server mechanics | Full 49-suite emulator baseline/final; focused affected suites per fix. Check resources/troops/tower attribution/King Power, launches and arrivals, combat authorization, capture/returns, rallies, purchases, mission/reward receipts, session takeover and reset isolation. |
| Backend operations | Read 1-day and 7-day request/error/timing windows grouped by operation and deployed revision. Separate POST calls from OPTIONS, 4xx from 5xx, request time from phase time and retry attempts. Show sample sizes and incomplete windows. Do not infer cold starts, whole-game error rates or root causes from a small slow sample. |
| Release compatibility | Validate production file inventory, web `/play/`, installed entry and itch directory-relative artifact paths, cold/reload cases, release metadata and worker identity. Authenticated production gameplay and physical installation are separate coverage. |

Static/emulator baseline failures must be investigated even when a targeted tooling PR passes. A passing required PR check means the selected change is validated, not that every audit finding has been fixed. No weakening of a budget or suppression of an unexplained error to obtain green checks.

The final harness also asserts that each counted lifecycle switch returns success and reaches its requested region, including the return to the starting region. Earlier long-session artifacts made through harness `d7e4182` count resolved requests; preserve that limitation instead of relabeling them as verified transitions. Their retained-heap/listener observations remain useful. Matrix artifacts separately record both switch results, so inspect those directly. Synthetic browsers block live backend URLs, including generation-two `run.app` endpoints, and attempted requests still fail isolation checks.

## Physical-device handoff

For one ordinary and one lower-powered Android phone plus an iPhone, record model, OS, browser, battery/power mode and network. Test both website and installed app:

1. Cold launch, login, landscape entry/exit, declined fullscreen/rotation APIs, portrait fallback, safe areas and browser-owned bars.
2. Pan/pinch, city actions, Tower dialogs, Reports, Chat, Shop, Help, and keyboard opening/closing. Verify targets remain reachable at the shortest supported landscape height.
3. Thirty minutes of play; background for one and five minutes; lock/unlock; switch Wi-Fi/cellular; lose/recover networking; confirm no repeated action or balance/troop drift.
4. Upgrade an existing installed app, reopen a stale tab and follow notification links. Record build IDs before/after. Never clear player storage as a test shortcut.

Real-device coverage remains unverified until those receipts exist. Production smoke uses an explicitly approved QA account and actions only if separately authorized.

## Evidence and release handling

Local raw evidence is retained under the unique `release-artifacts` directories. The committed findings report identifies exact paths, measured state, limitations and outstanding work. Export only sanitized aggregate evidence; never attach private logs, player payloads, credentials or browser profiles.

For each confirmed runtime fix retain a reproduction, regression and matching before/after measurement. After required PR checks pass, a separately authorized release must verify actual backend revisions, web/itch release fingerprints and affected smoke checks. Roll back only the affected release through the established release workflow; do not reset player data. Monitor fresh operation errors, latency, reconnect behavior and gameplay consistency after release before calling the fix live.
