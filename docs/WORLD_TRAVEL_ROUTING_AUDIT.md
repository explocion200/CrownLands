# World travel routing audit

Audit date: 2026-09-04. Branch: codex/world-travel-routing-audit.

## Verified scope

Read-only production checks identified current pointer world `main-realm-2026-09`, generation `realm-2026-09`, shared shard `shard_0001`. The expansion state listed all 24 Layer 1 regions (next ordinal 24). The canonical client served build `f5f7ef1103d0db31134cac7dbb196282c8a26e08` before this update. This is a 49-map, 7×7 world: 25 Core maps and 24 Layer 1 maps, joined by 84 reciprocal roads (168 directed edges). Archived generations and inactive map data were not modified.

## Root causes confirmed in code and tests

1. **Client graph disappeared with cache eviction.** `region-catalog.js:buildClientEditorMap` returned a summary immediately when no detailed definition was cached. That summary had `connections`, but lacked the `edgeConnections` consumed by `game.js:getEditorEdgeConnectionDefinitions`. The detailed-definition cache is capped at four maps. Before the fix, the 49-map cold client exposed zero roads. Visiting nearby maps could populate enough consecutive definitions for a short route, while a longer chain crossed uncached or evicted maps and failed the heuristic before any server request.
2. **The screenshot error conflated independent failures.** `attackForeignCity -> findPreferredAttackSource -> findLastSelectedAttackSource -> getRouteHeuristicDistance` rejected a remembered source when it had fewer than one troop, equaled the target, or had no finite graph estimate. The same message described both troop shortage and routing failure. It was not an authoritative backend rejection.
3. **Cached definitions could retain stale/template connections.** The loader cached raw definitions while materializing only its return value. Later map lookups bypassed materialization. Server descriptors for permanent Core maps were also discarded during expansion registration. Current descriptors now supply roads on every lookup, including cached/generated maps and Core boundary updates.
4. **Future backend persistence still assumed a 20-map world.** Both route-region and segment normalization truncated at 20, and authoritative launch explicitly rejected larger paths. These defensive payload bounds now derive from the supported world configuration (Core plus New Lands capacity); graph search has no hop cutoff. A generated Layer 3 corner-to-corner journey persists all 21 map segments.
5. **Route selection and timing could differ.** First-found BFS minimizes map count, not total terrain travel. Active Core/New Lands routing now uses Dijkstra over reciprocal road entrances with actual terrain-leg distances. The request uses the complete active expansion context, including return/arrival and rally lifecycle operations. Search orientation is canonical for each terrain endpoint pair, preventing separate warm/cold Functions instances from choosing slightly different A* paths. The emulator exposed a 222ms rally preview/launch discrepancy before that correction.
6. **Rally join preview lost its order kind.** The client sent `rally_join`, but preview normalization converted it to `attack`. The preview now preserves the contribution order kind, its travel factor, and its existing gear category. Regular attack, transfer, reinforcement, scout, and rally speed formulas were preserved.

## Final routing and action flow

Authoritative active map descriptors -> shared `functions/world-travel-network.js` road definitions and reciprocal-link validation -> client connectivity check -> server terrain-weighted route -> unchanged order/troop/speed duration -> authoritative march transaction -> persisted per-map segments and views -> existing arrival and report resolution.

The troop panel opens immediately, then verifies its route and selected troop-band ETA with `previewArmyRoute`. Confirmation requires a matching authoritative quote. Failed previews show a reason and retry action. Estimated or rejected local geometry cannot enable an online launch. `sendArmyOrder` independently rebuilds the route; client-provided points, distance, and ETA cannot shorten it. Automatic scouting uses server origin selection and the returned authoritative movement.

| Mechanic | Dispatch / route authority | Arrival / return authority |
| --- | --- | --- |
| Attack, owned transfer, reinforcement | `sendArmyOrder`, canonical endpoints, `buildServerGeneratedArmyRoute` | `resolveArmyOrderById`, stored full path segments and canonical movement |
| Scout (including eligible Tower origin) | `launchAutomaticScoutOrder`, server closest-origin selection, same route builder | Existing scout report/arrival lifecycle |
| Scout Nearby / Regroup | `sendNearbyScouts` / `sendRegroupOrders`; existing same-map radius rules retained | Existing individual army resolution |
| Rally formation / contribution / launch | `createClanRally`, `joinClanRally`, `launchClanRally`; routes rebuilt by server; slowest-participant launch rule retained | Existing assembly, combined battle, participant reports and return handling |
| Relinquishment, reinforcement recall, Camp return | Canonical route builder for new journeys; stored reversed segments for existing returns | Existing settlement, replay guards and current-realm checks |

Map transitions carry no separate toll or timer in the existing rules. Distance is the sum of the terrain segment on each visited map, including source-to-exit, every arrival-to-next-exit segment, and final arrival-to-target. Teleporting between corresponding local map coordinate frames adds no fictional world-space gap. Duration is calculated in seconds; persisted arrival uses milliseconds and `ceil(seconds * 1000)`. Existing Swift March, troop bands, skills, Gear, Stronghold bonuses and minimum durations are retained.

## Validation evidence

- `tools/validate-world-travel-network.js`: all 2,401 ordered active-map pairs (including same-map), 168 terrain road legs, actual attack action selection, empty/four-entry/evicted caches, broken and orphaned links, duplicate roads, malformed geometry, invalid IDs, disconnected and circular graphs, a cheaper route with more map hops, quote readiness, generated Layer 3 definitions, and full 21-segment save/reload normalization.
- `functions/test/emulator-world-travel.js`: authenticated actual callables for same-map, one-transition, two-transition and seven-map attacks; seven-map scout; owned transfer and reverse transfer; reinforcement stationing; rally contribution, assembly, combined launch and arrival. Each march verifies preview/launch duration and geometry, forged-ETA rejection, canonical persistence, intermediate map views, early-arrival rejection and idempotent launch/arrival retries. Emulator time advances only after checking the unmodified launch duration.
- Existing route-parity validator passed 1,185 same-map city routes, 1,185 cross-map city routes and 380 legacy map chains. This is retained regression coverage, not the current-world audit.
- Focused interaction, gear/movement, and active expansion release validators passed.
- Complete static, production artifact/browser smoke and all emulator gates are required by `prepare-pr` and the three required GitHub checks before merge. Final release results are recorded in the PR and completion report.

## Map-by-map road inventory

Each listed direction is both the navigational arrow and route edge derived from the same active descriptor. Road IDs are `north_road`, `east_road`, `south_road`, and `west_road`; arrival uses the opposite road on the named destination. All listed roads are reciprocal and have a finite terrain segment. A dash is a gated outer boundary, not a dangling road. There are no deprecated destination IDs or orphaned active roads in this inventory.

| Map / canonical ID | North | East | South | West |
| --- | --- | --- | --- | --- |
| Frostwolf March (`core-v2-warband-camp-m2-m2`) | Crownsward | Ravenscar | Elderglen | Alderwatch |
| Ravenscar (`core-v2-relic-camp-north-west-m1-m2`) | Ironwood Vale | Highwinter Vale | Stoneward | Frostwolf March |
| Highwinter Vale (`core-v2-north-support-p0-m2`) | Northgate March | Dawncrest | Greybanner Hold | Ravenscar |
| Dawncrest (`core-v2-deed-camp-north-east-p1-m2`) | Frostmere | Gilded Moor | Lionwatch | Highwinter Vale |
| Gilded Moor (`core-v2-gold-camp-north-east-p2-m2`) | Highwatch Vale | Eastwall Reach | Kingsbridge | Dawncrest |
| Elderglen (`core-v2-relic-camp-west-north-m2-m1`) | Frostwolf March | Stoneward | Westwych | Wolfpine |
| Stoneward (`core-v2-north-west-holding-tower-m1-m1`) | Ravenscar | Greybanner Hold | Aurum Keep | Elderglen |
| Greybanner Hold (`core-v2-greybanner-hold-p0-m1`) | Highwinter Vale | Lionwatch | Crown Citadel | Stoneward |
| Lionwatch (`core-v2-north-east-holding-tower-p1-m1`) | Dawncrest | Kingsbridge | Swiftgate | Greybanner Hold |
| Kingsbridge (`core-v2-deed-camp-east-north-p2-m1`) | Gilded Moor | Kingsroad March | Eastmarch | Lionwatch |
| Westwych (`core-v2-west-support-m2-p0`) | Elderglen | Aurum Keep | Thornmere | Briar March |
| Aurum Keep (`core-v2-aurum-keep-m1-p0`) | Stoneward | Crown Citadel | Oakwatch | Westwych |
| Crown Citadel (`core-v2-crown-citadel-p0-p0`) | Greybanner Hold | Swiftgate | Ironwatch | Aurum Keep |
| Swiftgate (`core-v2-swiftgate-p1-p0`) | Lionwatch | Eastmarch | Roseguard | Crown Citadel |
| Eastmarch (`core-v2-east-support-p2-p0`) | Kingsbridge | Redwych | Emberfen | Swiftgate |
| Thornmere (`core-v2-deed-camp-west-south-m2-p1`) | Westwych | Oakwatch | Goldmere | Oakshield |
| Oakwatch (`core-v2-south-west-holding-tower-m1-p1`) | Aurum Keep | Ironwatch | Brambleford | Thornmere |
| Ironwatch (`core-v2-ironwatch-p0-p1`) | Crown Citadel | Roseguard | Southhaven | Oakwatch |
| Roseguard (`core-v2-south-east-holding-tower-p1-p1`) | Swiftgate | Emberfen | Brightmere | Ironwatch |
| Emberfen (`core-v2-relic-camp-east-south-p2-p1`) | Eastmarch | Ashford Vale | Redwolf Reach | Roseguard |
| Goldmere (`core-v2-gold-camp-south-west-m2-p2`) | Thornmere | Brambleford | Westervale | Greyfen |
| Brambleford (`core-v2-deed-camp-south-west-m1-p2`) | Oakwatch | Southhaven | Blackthorn Reach | Goldmere |
| Southhaven (`core-v2-south-support-p0-p2`) | Ironwatch | Brightmere | Dunmere | Brambleford |
| Brightmere (`core-v2-relic-camp-south-east-p1-p2`) | Roseguard | Redwolf Reach | Southwatch | Southhaven |
| Redwolf Reach (`core-v2-warband-camp-south-east-p2-p2`) | Emberfen | Emberfield | Goldbarrow | Brightmere |
| Northgate March (`new-lands-l01-p001`) | — | Frostmere | Highwinter Vale | Ironwood Vale |
| Frostmere (`new-lands-l01-p002`) | — | Highwatch Vale | Dawncrest | Northgate March |
| Highwatch Vale (`new-lands-l01-p003`) | — | Ravenstone | Gilded Moor | Frostmere |
| Ravenstone (`new-lands-l01-p004`) | — | — | Eastwall Reach | Highwatch Vale |
| Eastwall Reach (`new-lands-l01-p005`) | Ravenstone | — | Kingsroad March | Gilded Moor |
| Kingsroad March (`new-lands-l01-p006`) | Eastwall Reach | — | Redwych | Kingsbridge |
| Redwych (`new-lands-l01-p007`) | Kingsroad March | — | Ashford Vale | Eastmarch |
| Ashford Vale (`new-lands-l01-p008`) | Redwych | — | Emberfield | Emberfen |
| Emberfield (`new-lands-l01-p009`) | Ashford Vale | — | Sunward Ford | Redwolf Reach |
| Sunward Ford (`new-lands-l01-p010`) | Emberfield | — | — | Goldbarrow |
| Goldbarrow (`new-lands-l01-p011`) | Redwolf Reach | Sunward Ford | — | Southwatch |
| Southwatch (`new-lands-l01-p012`) | Brightmere | Goldbarrow | — | Dunmere |
| Dunmere (`new-lands-l01-p013`) | Southhaven | Southwatch | — | Blackthorn Reach |
| Blackthorn Reach (`new-lands-l01-p014`) | Brambleford | Dunmere | — | Westervale |
| Westervale (`new-lands-l01-p015`) | Goldmere | Blackthorn Reach | — | Stoneford |
| Stoneford (`new-lands-l01-p016`) | Greyfen | Westervale | — | — |
| Greyfen (`new-lands-l01-p017`) | Oakshield | Goldmere | Stoneford | — |
| Oakshield (`new-lands-l01-p018`) | Briar March | Thornmere | Greyfen | — |
| Briar March (`new-lands-l01-p019`) | Wolfpine | Westwych | Oakshield | — |
| Wolfpine (`new-lands-l01-p020`) | Alderwatch | Elderglen | Briar March | — |
| Alderwatch (`new-lands-l01-p021`) | Moorhaven | Frostwolf March | Wolfpine | — |
| Moorhaven (`new-lands-l01-p022`) | — | Crownsward | Alderwatch | — |
| Crownsward (`new-lands-l01-p023`) | — | Ironwood Vale | Frostwolf March | Moorhaven |
| Ironwood Vale (`new-lands-l01-p024`) | — | Northgate March | Ravenscar | Crownsward |
