# Recommended map-scaling phases

Audit date: 2026-08-13

Audited revision: `6ce0d48` (`origin/main`)

Purpose: ordered implementation roadmap based on the read-only audit.

## Recommended direction

Keep Crownlands' one-region-at-a-time DOM/SVG renderer and baked raster maps for the next scale step. The current renderer has the right optimizations and does not justify a risky Canvas/WebGL rewrite. First remove work that grows with the total world: the synchronous all-region layout, deploy-embedded catalog, all-starter account seeding, broad presence/activity windows, and unbounded region-cache behavior.

Build dynamic expansion as a controlled content lifecycle: generate deterministic drafts offline, validate and review them, pre-seed standby regions, then atomically activate capacity through a server-owned catalog. Add semantic LOD and deeper realtime interest management before raising visible density.

## Decision summary

| Decision | Recommendation | Reason |
|---|---|---|
| Renderer | Retain DOM/SVG | Current density, keyed reuse, culling, and throttling are adequate; rewrite lacks evidence |
| Map imagery | Retain one baked raster per region | 1,448 × 1,086 maps are small enough; one active map avoids tile complexity |
| Static data | Split catalog and lazy region layout | Client boot should not grow with 60+ regions |
| Region creation | Offline/admin deterministic pipeline | Reproducible, reviewable, style-preserving, no runtime device cost |
| Asset strategy | Hybrid curated modules + offline composition | Best balance of visual quality, reuse, and runtime speed |
| Activation | Pre-generated/seeded standby lifecycle | Avoid incomplete synchronous creation during signup |
| Spawn | Select and claim one active starter | Constant-cost with world size |
| Realtime | Active-region/player interest plus on-demand social feeds | Avoid concurrency-driven broad read fan-out |
| LOD | Add semantic entity/label clustering | Existing low-zoom mode only removes effects |
| Canvas/tiles | Conditional future optimization | Use only after measured DOM or region-size thresholds are exceeded |

## Phase 0 — Instrumentation and release gates

Goal: make current behavior measurable before changing data boundaries.

Deliverables:

- Authenticated deterministic benchmark accounts/fixtures for 50, 100, and 150 cities and 25, 50, and 100 visible marches.
- Automated desktop 1,440 × 900 and mobile 844 × 390 pan/zoom/region-switch scenarios.
- Capture p50/p95 frame duration, long tasks, DOM/SVG counts, image transfer/decode, heap/GPU proxy metrics, listener/read/write counts, callable latency, resolver lag, and cache size.
- Production dashboards/alerts for overdue armies, callable errors, region subscription failures, new-player claim failures, and presence/activity read volume.
- Existing asset, animation, realtime, rules/index, subscription-scope, and runtime validators remain blocking.
- Budgets from [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md) become CI checks.

Exit gate:

- Baseline captured on at least one target desktop and representative mid-tier mobile device.
- A regression can fail CI or release review.
- Current daily/weekly quest capture-event tests cover city, ordinary camp, gold/deed camp, and objective variants so region-schema work cannot break progression events.

Risk: telemetry itself can add cost. Sample performance data, avoid player identifiers, and make diagnostics removable/feature-flagged.

## Phase 1 — Lazy world catalog and region payloads

Goal: make client boot independent of total city count.

Deliverables:

- Generate a small world manifest with region summary, graph, lifecycle, bounds, and content-hashed URLs.
- Generate one immutable layout JSON per region.
- Load only the selected region layout; optionally warm neighbor summaries/layouts within policy.
- Keep the current embedded `map-editor-data.js` as a temporary rollback path behind a release flag.
- Move immutable city geometry/static configuration out of mutable live city snapshots where compatibility permits.
- Service-worker install precache contains shell and minimal manifest only; region content enters a bounded runtime cache.
- Virtualize/filter the region picker before it exceeds the current 15-tile design.

Exit gate:

- Adding 45 synthetic catalog regions changes initial boot transfer/parse by no more than the manifest budget.
- Region entry works cold, warm, offline from cache, during version rollover, and after a failed asset decode.
- Existing 15 region/city identities and in-flight orders remain unchanged.

Rollback: switch the catalog loader flag back to the embedded layout. Do not delete lazy artifacts.

## Phase 2 — Authoritative region registry, lifecycle, and spawn service

Goal: remove deploy/account coupling from region capacity.

Deliverables:

- Server-owned registry with planned, generating, review, standby, active, draining, and retired states.
- Authoritative capacity semantics: city count, claimable count, player capacity, player count, neutral count, and reserve target.
- Version-aware server catalog cache with atomic active catalog pointer and audit events.
- Stable opaque IDs for new regions; legacy aliases for all current IDs.
- Resumable, chunked, lease-protected region seeding with progress and checksum.
- New-player service selects one active starter with capacity and claims one city.
- Remove “ensure every starter region” from account creation; retain only an idempotent selected-region compatibility check during migration.
- Standby inventory and capacity alerts.

Exit gate:

- New-player claim read/write work stays bounded when the catalog is expanded to 60 test regions.
- A seeded standby can be activated and catalog pointer rolled back without a client or Functions code deploy.
- Race/load tests prove reservations, player/neutral summaries, and retries remain coherent.

Rollback: disable new spawns into the new region and restore the previous catalog pointer. Existing players/orders continue reading their pinned versions.

## Phase 3 — Hybrid asset library and generator

Goal: produce reviewable region content faster without increasing runtime cost.

Deliverables:

- Versioned source/module manifests, palettes, biome rules, masks, and hero landmarks.
- Deterministic layout generator for terrain masks, city placement, graph/roads, portals, camps, objectives, and difficulty roles.
- Offline compositor producing gameplay raster, thumbnail, optional high-res derivative, layout JSON, and diagnostics.
- Automated schema, identity, spacing, connectivity, gameplay, quest-event, asset-size, and viewport validators.
- Editor import/export and overlays for manual correction and approval.
- Dedicated draft/standby storage identities and separate activation authority.

Exit gate:

- Same seed and pinned dependencies reproduce output hashes.
- One existing region can be reconstructed within accepted visual/topology tolerances.
- One new test region passes all gates, is edited/reviewed, and completes a standby smoke test.
- Runtime measurements remain within current map/image/DOM budgets.

Rollback: generator outputs are immutable drafts; rejection has no live effect.

## Phase 4 — Controlled dynamic expansion

Goal: activate prepared capacity safely based on measured demand.

Deliverables:

- Maintain at least one approved/seeded standby starter region.
- Capacity evaluator with sustained thresholds, hysteresis, cooldown, lease, and alerts.
- Atomic activation procedure that revalidates hashes, seed checksum, graph links, catalog, and rollback pointer.
- Canary routing for a small fraction of new players when policy permits.
- Automated stop-spawn/rollback thresholds for load errors, claim failures, subscription failures, or unexpected costs.
- Drain/retire procedure that preserves in-flight orders, reports, and player access.

Suggested first thresholds:

- Prepare more capacity before standby inventory reaches zero.
- Activate after starter occupancy stays at or above 75% or neutral supply stays below a 20% reserve for 15 minutes.
- Enforce a conservative activation cooldown and require operational notification.

Exit gate:

- Manual activation and rollback drill succeeds in a production-like realm.
- Multiple manual/canary expansions show stable spawn fairness, performance, Firestore cost, and support outcomes.
- Only then enable automatic activation.

## Phase 5 — Semantic LOD and realtime interest management

Goal: make 100–150-city regions and high-concurrency battles predictable.

Deliverables:

- Three semantic zoom tiers: full detail, priority detail, and clustered overview.
- Low zoom removes ordinary labels/actions and shows clusters plus owned/threat/objective entities.
- Army aggregation or prioritization beyond the visible-token budget; routes simplified by tier.
- Presence split into relevant players plus aggregate counts; eliminate periodic 200-record rebind.
- Realm activity split into region/clan/personal/world-event topics, with a small live head and paged history.
- Reports use unread/live summary plus paged history.
- Social/clan/application listeners are view-scoped unless a compact summary is necessary.
- Long-route projections are segmented/repairable if graph size makes fan-out material.

Exit gate:

- 150-city and 100-army fixtures meet frame budgets at both target viewports.
- Base gameplay stays at or below the listener/read targets.
- Presence/activity read volume grows roughly linearly with active users rather than each user receiving broad realm windows.
- Scheduled army resolution meets an explicit overdue-army SLO under arrival bursts.

## Phase 6 — Conditional rendering or tiling escalation

Goal: introduce more complex rendering only if measurements require it.

Triggers for a Canvas/WebGL layer:

- More than 300 entities must be simultaneously visible after semantic LOD.
- Route/particle layers alone cause repeated >50 ms long tasks or miss frame budgets.
- DOM/SVG node counts cannot stay within budgets without losing required information.

Preferred first step is hybrid rendering: keep interactive cities/camps in DOM for accessibility and input, while moving dense non-interactive routes/particles to one Canvas layer.

Triggers for raster tiling:

- Region rasters grow several times beyond current dimensions.
- Users navigate a continuous multi-region world rather than discrete region entry.
- High-resolution zoom requires fetching only a subset of source pixels.
- Captured transfer/decode/memory data proves one bounded raster is no longer viable.

Canvas and tiling are independent decisions. Neither should block Phases 1–5.

## Cross-phase invariants

- Combat, arrival timing, capture, troop deductions, and route legality remain server-authoritative.
- Static generation output never grants ownership/resources by itself.
- Every catalog/layout/asset version is immutable and rollback-readable.
- Existing region/city IDs are never reassigned.
- In-flight armies retain the route/catalog version under which they were accepted.
- Daily and clan quest progress consume the same authoritative capture event taxonomy, including camps and typed special camps.
- Only one skill preset can be active; map/region migration must not duplicate player-active state across projections.
- No region activates before assets, layout, Firestore seed, indexes/rules, and smoke tests are complete.
- Service-worker install size, client boot, and listener count do not scale with total regions.

## Suggested ownership

| Workstream | Primary responsibility |
|---|---|
| Catalog/lazy loader/cache | Client/platform engineering |
| Registry/lifecycle/spawn/army compatibility | Backend engineering |
| Generator/topology validators | Tools/game-systems engineering |
| Asset modules/compositor/art review | Art + tools engineering |
| Performance/realtime benchmarks | Client + backend performance owner |
| Activation/rollback/alerts | Operations/backend owner |
| Spawn fairness and generated difficulty | Game design/analytics |

One accountable owner should approve each phase exit, while catalog activation remains separately authorized from content generation.

## Overall success criteria

The program is complete when:

1. A 60-region catalog and 9,000 static city definitions do not materially increase initial client payload, parse work, listeners, or service-worker install size.
2. A representative 150-city region meets desktop/mobile pan, zoom, and battle frame budgets.
3. New-player spawn is bounded to one selected active starter and succeeds under concurrency.
4. Presence/activity cost is interest-scoped and observable.
5. A deterministic generated region can move from request to reviewed standby to active and back through an audited, deploy-independent lifecycle.
6. Existing players, quests, skills, captures, and in-flight armies remain compatible throughout migration.

## Document map

- [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md): present world, client, server, rendering, and PWA shape.
- [PERFORMANCE_AUDIT.md](./PERFORMANCE_AUDIT.md): measurements, memory/DOM/network analysis, and budgets.
- [REALTIME_AUDIT.md](./REALTIME_AUDIT.md): listener topology, writes, interest management, and army authority.
- [DYNAMIC_REGION_READINESS.md](./DYNAMIC_REGION_READINESS.md): blockers and target registry/lifecycle.
- [MAP_GENERATOR_PLAN.md](./MAP_GENERATOR_PLAN.md): deterministic generation, validation, review, and activation.
- [ASSET_LIBRARY_PLAN.md](./ASSET_LIBRARY_PLAN.md): hybrid art strategy, formats, caching, and asset governance.
