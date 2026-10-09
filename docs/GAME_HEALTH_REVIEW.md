# Game health and performance review

Base: `3e8ea124c20307b6e919a2a8cd73b3b770b223ab` (main through PR #499).
Branch: `codex/game-health-performance-review`.
PR [#500](https://github.com/explocion200/CrownLands/pull/500) is merged and its
owner-authorized web deployment is verified at build
`74645db3f91693ac1239d8509acd29e2071a1c4f`. The measurements below remain source
and isolated-browser evidence, rather than production frame-rate claims.

## Verified web publication

Netlify deploy `6ac8706c706414000862f1b1` was published on October 9, 2026 at
`04:44:26.782 UTC`. The manual publication hold remains enabled. All 56 staged
file comparisons and 168 public comparisons across the primary `/play/` entry
and both game hosts matched the merged artifact, including the changed runtime
scripts and HUD stylesheet. Exact staged estate interactions and both performance
regressions passed; public anonymous startup passed at desktop and landscape
sizes without uncaught errors. Required GitHub checks passed in
[run 37883732613](https://github.com/explocion200/CrownLands/actions/runs/37883732613).

The release contract, server fingerprint and 144-callable manifest match the
preceding web release; no backend or production data was changed. itch.io was
not republished and its public manifest still identifies build `27965d4...`.
Publication evidence is retained locally under
`release-artifacts/game-health-performance-review/deployment/` and recorded in
[the Master Specification](CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md).

## Corrections

### Repeated Inner Castle refreshes invalidate unchanged UI

Resource refreshes rewrote every balance and accessibility label. Construction
timers and management filters also repeated unchanged attribute/text writes.
Estate snapshots updated all 20 building captions, rebuilt the selected detail
copy and ran the complete map layout even when building levels and states had
not changed. This generated unnecessary style/layout work and replaced detail
nodes during background refreshes.

The renderer now retains resource nodes, writes only changed values, and updates
building presentation only when levels or construction states change. Timers and
management continue consuming every fresh receipt, with writes limited to their
changed values. Replaced deadlines, live production, exact accessible balances,
construction completion, building controls and disposal retain coverage.

The same local Chromium fixture, 20 synchronous refreshes per measurement:

| Viewport | Operation | Before DOM mutations | After DOM mutations |
| --- | --- | ---: | ---: |
| 1440×900 | Unchanged resource/timer refresh | 1,400 | 0 |
| 844×390 | Unchanged resource/timer refresh | 1,400 | 0 |
| 1440×900 | Unchanged estate snapshot | 9,920 | 0 |
| 844×390 | Unchanged estate snapshot | 10,000 | 0 |

The initial comparison measured approximately 104.5 ms for 20 unchanged snapshots
before the correction and 7–13 ms afterward. Timing varies across runs; the
regression assertions use actual DOM mutations and preserved nodes/focus, rather
than a machine-dependent timing threshold. The complete estate browser suite
also checks the real management controller at 1440×900, 844×390 and 568×320.

### Short-screen combat timer CSS recalculates the whole page

`main-screen-art-ui.css` used `body:has(#combatTimers:not([hidden]))` to arrange
Incoming, Outgoing and Reports on landscape screens up to 360 pixels high.
Ordinary unrelated Gold text changes triggered style recalculation across most
of the document. The replacement uses the existing header's direct timer
descendant and its sibling menu; it requires no extra JavaScript or observer.

Chromium tracing at 568×320, isolated scenario A with two marches, ten ordinary
Gold text changes with a style flush after each:

| Measurement | Before | After |
| --- | ---: | ---: |
| Largest style update, elements | 1,492 | 92 |
| Total traced style work | 647.3 ms | 41.5 ms |

The browser regression requires ten measured style updates and bounds the
largest update to the small HUD subtree. Visibility transitions for timers and
both alerts retain the existing compact arrangement; desktop and taller
landscape views retain their normal arrangement. Crowns/HUD integration coverage
checks balances, timer placement, reachable controls, dropdowns and pickups.
These are controlled measurements, not production FPS or phone latency promises.

## Wider health checks

- All eight isolated stability cases passed: cold/warm startup, delayed realm and
  city responses, rejected/lost realm responses, 4× CPU/network-throttled mobile
  startup and session replacement. Reconnect, stale snapshots and lifecycle
  checks passed, with 18 active listeners, zero duplicate listeners and no
  unexpected runtime errors or synthetic production-backend requests.
- Performance invariants passed for bounded route caches, reduced simulation
  scans and army snapshot reuse. March-frame browser checks passed for bounded
  position error, fewer transform writes and covered-map resume.
- Realm refresh checks passed for deduplication, forced freshness, failure/retry,
  session isolation and stale expansion responses.
- Estate economy and Common Gear checks passed. Server authority, costs,
  cooldowns, progression and realm configuration were not changed.
- The production Functions dependency audit reported no known vulnerabilities,
  using Node.js 22 and the repository's pnpm installation.
- The quick map benchmark completed city-info and neighboring-region
  switch/return checks without runtime failures or listener duplication.

Local raw evidence and screenshots are ignored artifacts under
`release-artifacts/health-review-before-2026-10-09/`,
`release-artifacts/hud-style-health/`, `release-artifacts/estate-economy/` and
`benchmark-results/map/quick-latest.json`. The retained baseline was measured
before the runtime corrections; the focused regressions cover their final state.

## Remaining limits and improvement opportunities

- The throttled mobile startup took about 49.9 seconds in the artificial 3G/4×
  profile. Prioritize a network waterfall and cold-load payload review before
  proposing additional code splitting or asset changes. This is not a measured
  physical-phone or production startup time.
- The short map smoke sample showed inconsistent headless idle frame delivery,
  so its idle FPS is not a release-performance conclusion. Full crowded-map
  capacity runs and a long soak were not performed in this review.
- City-info transitions and region switches still generated long tasks in the
  quick map sample. Capture targeted traces to attribute those costs before
  changing shared modal CSS or map loading. The short-screen CSS finding above
  was independently reproduced with forced style updates.
- The main game runtime and accumulated styles remain large. Extract coherent
  subsystems only with explicit dependency coverage; a broad rewrite would make
  these focused fixes harder to verify.
- Authenticated production play, real Firebase latency, physical phones and
  release-channel parity require separate verification. The web publication was
  verified after the owner authorized merge and deployment; no production
  gameplay orders or data edits were submitted.
