# Audit findings and evidence — September 24, 2026

Baseline: `a01303edf61d350cdd3a9363d308edf2945acbdc`. Work is in progress. Nothing in this audit is merged or deployed. Runtime code and player data are unchanged by the tooling branch.

## Confirmed tooling corrections

- Historical audit prose incorrectly treated the former 17-listener limit as a current failure. The current Core budget is 18. Recovery probes now use the shared current budget and still reject duplicate subscriptions.
- Reports previously carried old conclusions and could omit a failed matrix while appearing successful. New reports derive findings from current evidence, require all eight cases and all 45 matrix profiles, preserve skipped/unverified states and fail incomplete required checks. Public deployed assets are compared to their deployed manifest, not an unreleased audit commit.
- Node-side idle waits produced near-zero headless idle frame samples while the same fixture rendered normally during a browser-side sample. Sampling now waits in the browser and records visibility/focus. A short diagnostic changed from 0–1.9 FPS to 60.9 FPS; it is not a game optimization or a final isolated performance claim.
- The fixture server rebuilt large world data for every asset request. It now reuses immutable scenario fixtures and clones visual overrides. Regression coverage checks scenario isolation and cache reuse.
- Two old static fixtures blocked the full gate: Gear route preview lacked the production target-type helper; Holding Towers searched old Treasury markup inside `game.js` after the UI moved to its own module. Tests now exercise the existing implementation without relaxing its authority or UI assertions.
- New compatibility/soak runners retain failures and use bounded browser actions. Production timing parsing handles structured and Node console text using an allowlist of numeric fields; no payload text or identities are exported.

## Open runtime and environment findings

| ID | Evidence | Interpretation / next action |
|---|---|---|
| CACHE-01 | `remaining-static.json`: install precache 4.42 MiB, existing limit 4.15 MiB; two validators fail for the same excess. | Confirmed budget regression. Review optional precache membership and offline dependencies in a separate fix; preserve the budget and current-world behavior. |
| ROUTE-01 | Partial current-revision timing sample: sendArmyOrder n=10, max 21,836 ms with routePlanning max 20,121 ms; previewArmyRoute n=51, p95 2,758 ms, max 9,613 ms, routePlanning max 8,920 ms. | Slow server route planning is a real lead; these are small, truncated samples. Synthetic opposite-Core-corner route: cold ~2,895 ms, repeated ~51 ms, 287 terrain legs. Existing bounded caches already work; do not add a duplicate cache or change travel rules without profiling. |
| ERRORS-01 | Complete 1-day ERROR query had 71 records across revisions; five were current revisions: one Daily Mission HTTP 500 and four translation HTTP 503. Those five had no application exception payload. | Root causes unproven. Current mission worker already has 512 MiB/concurrency 8. Do not reapply an older memory fix or claim OOM from status codes. Seven-day error and HTTP queries were incomplete after Cloud Logging errors. |
| ENV-01 | Firefox launch failed with `spawn UNKNOWN` before gameplay. | Browser coverage unverified on this Windows host. Do not mark a game crash or bypass host security controls. |
| HARNESS-01 | City List functional assertions completed, then browser-profile cleanup failed with Windows EBUSY. Legacy route-parity command exceeded a 240-second audit watchdog under concurrent work. | Retain as failed execution receipts; rerun in isolation to separate host contention/cleanup from game behavior. |
| SOAK-01 | Initial 4× probe timed out on a combined lifecycle + ten-dialog evaluation. | Split timing/watchdogs per action before interpreting this as a game freeze. Long 4× result pending. |

## Evidence index

All local paths below are relative to `release-artifacts/stability-audit-baseline/`.

| Artifact | Coverage / status |
|---|---|
| `baseline-ci.log` | Manual full baseline [GitHub run 36012723093](https://github.com/explocion200/CrownLands/actions/runs/36012723093): all 49 emulator suites passed; static job stopped at the stale Gear fixture. The first checkout attempt timed out before tests; the rerun supplied the emulator evidence. |
| `remaining-static.json` and `.log` | 89 static validators completed: 87 passed, two failed on the same install-cache budget. |
| `browser-static.json` and `.log` | Continuation of the full static/browser gate, retaining independent failures instead of stopping at the first. Final summary pending. |
| `startup-final/audit.json` | All eight startup/fault cases passed with 18 listeners, zero duplicates/errors/backend requests and consistent public build identity. Source-change guard correctly failed because tools were edited during this development probe. Final frozen-input run pending. |
| `compatibility/compatibility.json` | Chrome, Edge, WebKit: four layouts each passed. Firefox did not launch. Physical Android/iOS and actual OS suspension/fullscreen are unverified. |
| `calibration/` | Idle measurement diagnostics; concurrent development workload, not acceptance FPS. |
| `soak-full/` | Concurrent 60-minute PC/mobile lifecycle and memory stress, in progress; not reference FPS. |
| `soak-probe/`, `soak-probe-4x/` | Short/development probes, including interrupted and timed-out runs. Never substitute for full duration evidence. |
| `production-final/production.json` | Read-only current realm and 120 deployed ACTIVE Node22 functions. HTTP sample includes OPTIONS and must not be used for POST-only operation latency. Explicit partial query flags. |
| `operation-timings/production.json` | 10,000 allowlisted timing records; query incomplete after API failure. Current revisions separated. No overall error rate or seven-day SLO claimed. |
| `route-profile.json` | Diagnostic synthetic Core route cold/warm measurements under concurrent workload; no production writes. |

Observed current realm: `main-realm-2026-09`, generation `realm-2026-09`, shared realm `shard_0001`, topology `core-expansion-v1`. Public web build matched `a01303edf61d350cdd3a9363d308edf2945acbdc`; backend source label was `4ff04191079d2f98205240d588deb958a2b18a6e`. These are observations at audit time, not deployment by this task.

## Completion criteria

Complete the isolated repeated map matrix and long soaks, reconcile the remaining execution failures, and record matching evidence for each focused fix. Required PR checks and the audit result are separate. No claim that every PC/mobile device is crash-free is possible from synthetic tests; the physical checklist in [RUNBOOK.md](RUNBOOK.md) remains a named verification boundary.
