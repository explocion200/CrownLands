# Crown Lands Stability, Login, and Performance Audit

Generated from commit `f1187b58c6484f40fb2644deb27a4e15f488b3fb` on 2026-08-29T21:58:24.271Z. This report distinguishes repository-verified behavior from deployed behavior.

## Decision summary

The isolated canonical-web fixture completed deterministic startup, slow-call, delayed-snapshot, bounded-failure, stale-callback, lifecycle, mobile-throttling, and second-session cases with zero uncaught errors, unhandled rejections, duplicate listener keys, or production-backend requests. It does **not** pass the exact listener acceptance budget: successful sessions settle at 18 active listeners because `chat.global` is always on in addition to the established 17 gameplay streams.

Two audit-tool defects were confirmed and fixed. The audit also confirms that always-on global chat has raised the base authenticated session from the established 17-listener budget to 18; lifecycle cleanup still prevents duplicates. One session-heartbeat timeout risk remains suspected and should be reproduced in a focused branch before changing game code. Authenticated production and itch.io gameplay remain blocked because this audit did not receive an approved QA account or control the published itch.io session.

## Scope and safety

- Canonical web game first; itch.io compatibility is limited to repository artifact and contract checks.
- Local browser runs use a loopback-only simulated backend. They contain no player credentials and must make zero production-backend requests.
- Anonymous production verification reads only public resources. No city, resource, progression, membership, presence, or account data is changed.
- The audit PR contains tooling, baseline evidence, and documentation only. Gameplay fixes belong on separate synchronized branches.

## Repository and contract identity

| Field | Value |
| --- | --- |
| Release | crownlands-2026-09-monthly-sharded-realms-v1 |
| Reset generation | fresh-2026-07-26-server-reset |
| World | main-fresh-2026-07-26-server-reset |
| API contract | 86fc7b17ba028d02ee0ef6131f291f6673d5fdef4178a3463e04cf220bc35dbd |
| Client build / service-worker cache | 20260827-instant-cross-map-city-upgrades-r1 / 20260827-instant-cross-map-city-upgrades-r1 |
| Skill-point system version | 2 |

## Deterministic browser matrix

| Case | Environment | Expected | Result | Startup |
| --- | --- | --- | --- | ---: |
| cold-desktop | 1440×900, normal, 1× CPU | ready | FAIL | 1454 ms |
| warm-desktop | 1440×900, normal, 1× CPU | ready | PASS | 1919 ms |
| slow-realm-call | 1440×900, normal, 1× CPU | ready | PASS | 2414 ms |
| delayed-city-snapshot | 1440×900, normal, 1× CPU | ready | PASS | 2419 ms |
| rejected-realm-call | 1440×900, normal, 1× CPU | failed | PASS | 580 ms |
| lost-realm-response | 1440×900, normal, 1× CPU | failed | PASS | 496 ms |
| mobile-throttled-4x | 844×390, throttled, 4× CPU | ready | PASS | 32401 ms |
| session-replacement | 1440×900, normal, 1× CPU | ready | PASS | 1450 ms |

The cold run completed 50 map switches, 20 background/foreground cycles, and 10 listener-failure/reconnect cycles in 61.0 measured minutes. Active intervals and pending animation frames returned to baseline, duplicate listener keys stayed at zero, and no stale-region callback changed the selected map. The sole local acceptance failure is the stable 18-listener count described in STAB-003.

## Public production resources

| Check | Status | Result | Identity / final location / error |
| --- | ---: | --- | --- |
| marketing-root | 200 | PASS | https://playcrownlands.com/ |
| canonical-play-redirect | 200 | PASS | f1187b58c6484f40fb2644deb27a4e15f488b3fb |
| game-entry | 200 | PASS | f1187b58c6484f40fb2644deb27a4e15f488b3fb |
| manifest | 200 | PASS | https://game.playcrownlands.com/manifest.webmanifest |
| service-worker | 200 | PASS | f1187b58c6484f40fb2644deb27a4e15f488b3fb |
| release-config | 200 | PASS | crownlands-2026-09-monthly-sharded-realms-v1 |
| release-manifest | 200 | PASS | f1187b58c6484f40fb2644deb27a4e15f488b3fb |

These checks do not prove authenticated login, membership, presence, gameplay loading, second-tab replacement, or reconnect behavior in production.

## Acceptance scorecard

| Check | Result |
| --- | --- |
| allDeterministicCasesPassed | BLOCKED / FAIL |
| zeroUncaughtErrors | PASS |
| zeroDuplicateListenerKeys | PASS |
| listenerBaselineRestored | BLOCKED / FAIL |
| zeroProductionBackendRequestsFromFixtures | PASS |
| configurationParity | PASS |
| mapMatrixComplete | PASS |
| mapMatrixSafety | PASS |
| anonymousProductionResourcesReachable | PASS |
| anonymousProductionIdentityMatches | PASS |
| authenticatedProductionVerified | BLOCKED / FAIL |
| itchAuthenticatedVerified | BLOCKED / FAIL |

## Findings

### STAB-001 — Benchmark realm capabilities drifted behind the authoritative server contract

- **Severity / class:** P3 / tooling-only
- **Status:** fixed
- **Affected environment:** Local benchmark fixture
- **Reproduction:** Run the quick map benchmark before this audit branch; startup rejects skill-point capability parity.
- **Evidence:** The fixture previously hand-authored getRealmInfo and omitted the live skillPointSystemVersion capability.
- **Likely owner:** Benchmark tooling
- **Recommended next step:** Keep release identity, contract hashes, realm capabilities, and progression versions derived from authoritative configuration.

### STAB-002 — Missing optional pickup query silently switched ordinary benchmarks to the default region

- **Severity / class:** P3 / tooling-only
- **Status:** fixed
- **Affected environment:** Local benchmark fixture
- **Reproduction:** Launch a benchmark without pickupSoakRegion and compare the active region with the scenario's primary region.
- **Evidence:** normalizeRegionId(null) selected the default map; the runtime now distinguishes a missing parameter from an explicit region.
- **Likely owner:** Benchmark tooling
- **Recommended next step:** Retain the missing-query regression assertion in validate-map-benchmark.

### STAB-003 — Always-on global chat raises base authenticated gameplay from 17 to 18 listeners

- **Severity / class:** P2 / confirmed
- **Status:** open
- **Affected environment:** Canonical web and compatible itch.io client
- **Reproduction:** Start an authenticated-equivalent session without opening a social panel and inspect active logical subscriptions.
- **Evidence:** Every successful isolated browser case settles at 18 listeners: the established 17 gameplay streams plus chat.global. Region switches and recovery do not duplicate it.
- **Likely owner:** Chat and realtime lifecycle
- **Recommended next step:** Decide whether global chat must remain always-on; otherwise make it view-scoped on a separate synchronized branch and restore the exact 17-listener base budget.

### STAB-004 — Heartbeat calls do not have a generic transport timeout

- **Severity / class:** P2 / suspected
- **Status:** open
- **Affected environment:** Web and itch.io session heartbeat
- **Reproduction:** Drop a callable response after the request reaches the transport and observe the in-flight heartbeat guard.
- **Evidence:** Repository inspection found higher-level realm timeouts, but no generic timeout in callServerFunction; a never-settling heartbeat can retain its in-flight state.
- **Likely owner:** Login and session lifecycle
- **Recommended next step:** Confirm with a focused emulator fault test, then fix on a separate synchronized branch if reproduced.

### STAB-005 — Authenticated production login and second-tab recovery are not verified by repository tests

- **Severity / class:** P3 / telemetry-required
- **Status:** blocked
- **Affected environment:** game.playcrownlands.com production
- **Reproduction:** Use the approved pre-seeded QA account for cold login, warm login, refresh, second-tab replacement, interrupted connection, and logout.
- **Evidence:** No QA account identity or authorization was supplied to this audit run, so no authenticated production writes were attempted.
- **Likely owner:** Release QA
- **Recommended next step:** Complete the controlled smoke test before treating production login as verified.

### STAB-006 — Physical device and itch.io authenticated behavior still require release QA

- **Severity / class:** P3 / telemetry-required
- **Status:** open
- **Affected environment:** Physical mobile devices and published itch.io artifact
- **Reproduction:** Run the documented browser/device matrix and inspect the exact published itch.io build.
- **Evidence:** This audit uses desktop Chromium emulation and repository artifact checks; it does not control a published itch.io authenticated session.
- **Likely owner:** Release QA
- **Recommended next step:** Verify relative assets, login entry, cache behavior, and backend compatibility in the published package.

## Login and conflict coverage

Static and emulator validators cover popup and redirect completion, actionable Firebase error mapping, repeated login sequencing, storage errors, refresh/session restoration, logout cleanup, active-session replacement, stale heartbeat handling, realtime listener ownership, reconnect, and foreground recovery. The browser fault matrix injects slow and rejected realm calls, lost responses, delayed city snapshots, stale callbacks, listener errors, mobile throttling, and 4× CPU slowdown.

The local fixture cannot prove browser popup policy, third-party-cookie behavior, provider account selection, or real Firebase transport failures. Those require the controlled QA account and release-channel matrix.

## Performance interpretation

The existing map benchmark remains the capacity authority for the A–E city/march matrix, desktop, 844×390 landscape emulation, and 4× CPU diagnostics. This audit ran that matrix 3 times and recorded 45 isolated scenario/profile results. The stability baseline adds startup phase timing, callable latency, console and network failures, long tasks, frame pacing, heap, timers, listener ownership, stale-callback protection, and recovery outcomes. Machine-readable details are in `benchmark-results/stability/baseline.json`.

## Required release follow-up

1. Confirm the dedicated QA account identity and authorization.
2. Run cold and warm canonical-web login, refresh, second-tab replacement, one interrupted connection, map switching, and logout without gameplay mutations.
3. Inspect the exact published itch.io artifact for relative assets, login entry, manifest, caches, and backend contract compatibility.
4. Decide and implement the STAB-003 chat-listener scope on a separate focused branch.
5. Reproduce STAB-004 with a focused callable-response-loss emulator test; if confirmed, fix and roll out separately.
