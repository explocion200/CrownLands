# Gameplay responsiveness, October 23, 2026

The owner approved four ordered updates: incremental rendering, transport/UI,
backend execution, and dry-run-first retention tooling. Preserve current art,
controls, zoom limits, movement rules and privacy. The mixed-load target is 100
simultaneous players, with 25/50-player checkpoints. Seven-day retention applies
only to completed internal debug history; production cleanup needs separate approval.

## Verified starting deployment

PR #714's separately authorized season-isolation installation completed at
19:35 UTC on October 23. Public `local-live` build
`5d3c4bddebbffe8b666b02b904b70bf97e692e43-local-eb42105515725a411c24e48612d9d789`
and publisher status matched, game/worker were healthy, and installed-dependency
PostgreSQL access/reset fixtures passed. The installer made no player-data rewrite.
The current topology is `core-expansion-v1`, realm `realm-2026-10`, world
`main-realm-2026-10`, shard `shard_0001`. Historical Firebase descriptions are not
the current runtime: the installed backend is PostgreSQL with shared game logic.

## Update 1: incremental rendering

Implementation branch: `codex/map-incremental-rendering`. Not yet verified deployed.

Nonempty deltas preserve unrelated section, object, march and route identities.
The spatial index supports additions/removals and replaces changed data without
rebuilding unchanged geometry buckets. Tower children refresh only when their
authorized completed levels, project, ownership or parent geometry changes.
Evicted objects and ownership/session changes retain existing cache-clearing rules.

The world presentation root is bounded to the viewport plus a 192-pixel margin
on each side. Its local origin rebases at 96 pixels of movement or on zoom/resize;
container transforms avoid rewriting every marker's position. SVG routes retain
canonical coordinates through the matching viewBox. Terrain, object identities,
camera projection, gameplay positions and hit targets are unchanged. Paint
containment clips the surface outside its overscan, not inside the viewport.

Scenery content signatures are reused until geometry or loaded artwork changes.
Stationary march candidate sets are reused; moving positions stay frame-synchronous.
Repeated label, pickup and route style assignments are skipped. Existing asset,
label and detached-node limits remain. There are no new assets or precache entries;
the lazy module allowance increases by 4 KiB for the incremental data/index and
bounded-surface logic (initial candidate: 79,792 bytes total).

Opaque native dialogs/profile windows and hidden documents suspend presentation,
while existing area polling and authorization continue. Resuming reconciles fresh
data and authoritative time. No hidden-window elapsed time enters FPS samples.

### Validation and measurements

Pure checks cover ordered incremental index parity, count-only updates, movement,
deletion, unrelated section identity, expired access, asset replacement/eviction,
scenery cache invalidation and pickup clearance. The authenticated browser checks
exact projected coordinates, bounded surface dimensions, retained returning nodes,
single-city updates and pause/resume with continued authorization requests.
The production-world suite covers desktop and both landscape sizes, input,
selection, castle stages, flags, pickups, routes, commands and shields.

The initial untraced source diagnostic (DPR 2, Chromium 153, warmed crowded route)
measured:

| Size / CPU | Home FPS / p95 frame | Minimum zoom FPS / p95 frame |
|---|---|---|
| 844×390 / 4× | 25.4 / 100 ms | 6.7 / 266.7 ms |
| 568×320 / 4× | 35.1 / 83.3 ms | 11.1 / 216.6 ms |
| 1440×900 / 1× | 59.7 / 16.8 ms | 55.1 / 33.3 ms |

The crowded mobile target is **not met**. Browser paint/style work still dominates
at distant zoom. These are software-rendered, CPU-throttled diagnostics on the
server desktop, not physical-phone FPS or proof of multiplayer capacity.
An initial home sample was invalid because a late daily dialog obscured the map;
the benchmark now dismisses startup dialogs and rejects zero-frame samples.
The map interaction fixture also dismisses startup dialogs before map selections.

The packaged untraced repeat and fresh base-commit comparison measured:

| Size / CPU | Crowded base home/min FPS | Crowded candidate home/min FPS | Candidate min p95 | Normal candidate home/min FPS |
|---|---|---|---|---|
| 844×390 / 4× | 23.7 / 6.6 | 24.9 / 7.2 | 300 ms | 39.8 / 14.0 |
| 568×320 / 4× | 34.4 / 9.2 | 36.3 / 10.8 | 216.8 ms | 47.6 / 20.1 |
| 1440×900 / 1× | 60.0 / 56.6 | 59.8 / 55.4 | 33.3 ms | 60.0 / 59.2 |

The small desktop difference is within observed run variation; this is not a
claim of a general FPS increase. The source and packaged repeats both miss the
crowded-mobile target. No visual reduction was used to conceal that limitation.

The 30-minute packaged soak passed 60 samples: 394–412 active markers, 348–372
retained markers, 19 renderer listeners and 337 total browser listeners, four
full terrain images, at most 16 thumbnails and two asset requests. The heap
cycled between 15.0 and 47.1 MB and ended at 15.7 MB; labels stayed within their
2,048-entry measurement cache. Other isolated test work ran during the long
retention soak, after the FPS samples. This validates resource bounds, not a
30-minute latency benchmark. Authorization revocation while obscured cleared
the map. Reports/screenshots are under ignored
`release-artifacts/map-pan-performance/`. Required PR checks are still pending.

## Remaining ordered updates

Transport/UI, backend execution, and retention tooling are not implemented by this
rendering update. Each requires its own clean feature branch, exact-base validation
plan and reviewed merge. Backend changes require tested installation and a
compatible client release; automatic publisher holds must remain intact.
