# Holding Towers

This document describes the server-authoritative Holding Tower implementation prepared for the Pending Core 5×5 reset. It is intentionally dormant in the current live world.

## Activation boundary

`functions/index.js` derives `SERVER_HOLDING_TOWER_WORLD_ACTIVE` from the authoritative server region catalog. All four immutable Tower region IDs must exist before any Tower callable or scheduled maintenance can read or write Tower gameplay state. The current `assets/worlds/world_01/region-catalog.json` contains none of those regions, so the current live-world Tower count remains zero.

The four permanent identities are:

| ID | Name | Quadrant | Reserved map coordinates |
| --- | --- | --- | --- |
| `core-v2-holding-tower-1` | Ravenwatch Tower | North-West | `736, 552` |
| `core-v2-holding-tower-2` | Highguard Tower | North-East | `734, 555` |
| `core-v2-holding-tower-3` | Blackthorn Tower | South-West | `724, 543` |
| `core-v2-holding-tower-4` | Stoneward Tower | South-East | `736, 555` |

Their IDs, regions, coordinates, art, width, anchors, and visible-pixel bounds remain the approved visual values from commit `8b2d03409fb8282aebbd707aec8034e9cecd7063`.

## Existing authoritative systems reused

The implementation was built on these existing server paths instead of parallel client formulas:

| Concern | Existing authority reused |
| --- | --- |
| City Wall power/durability | `getBaseCityWalls`, `createCityFortificationState`, the siege fortification payload, and basis-point integrity |
| Wall damage and additional repair time | `calculateCombatResult`, the siege result fortification data, and `getSiegeRepairWindowMinutes` |
| Wall construction/cost curve | `getCityUpgradeCost({ level }, {})` through the `getEquivalentCityWallCost` adapter |
| Unmodified repair rate | `getSiegeRepairWindowMinutes(level)` with no profile, Skill, Gear, objective, item, or timed modifier inputs |
| Raw Gold production | `getCityProductionStats().baseGoldProductionPerHour`, aggregated by `createGlobalStatsSnapshot().baseGoldPerHour` |
| Clan roles | Existing member document `role` values: `leader`, `officer`, and `member` |
| Membership age | Existing authoritative clan member `joinedAtMs`/`joinedAt` timestamps |
| Leave, kick, and disband | Existing clan departure/disband transactions, extended with safe Tower-garrison returns and Tower neutralization |
| Rally lifecycle | Existing `createClanRally`, join/withdraw, `launchClanRally`, movement copies, recall, and settlement paths |
| Combat/casualties | Existing `calculateCombatResult`, `allocateDefenderLosses`, and `allocateRallyAttackerLosses` |
| Troop movement | Existing authoritative route construction, travel timing, army copies, troop deduction, and safe Main-City return helpers |
| Scouting | Existing scout march/report lifecycle; Veil is evaluated only when the scout resolves |
| Seasonal reset | Pending Core reset architecture candidate state and validation in `tools/core-v2-reset-2/architecture.js` |

No passive Tower production, attack, defense, march, scouting, XP, territory, Stronghold, Citadel, or economy bonuses are introduced.

## State model

### `holdingTowers/{towerId}`

Server-owned Tower aggregate:

- immutable identity: `id`, `name`, `quadrant`, `regionId`, `x`, `y`
- realm scope: `worldId`, `resetGeneration`, `modelVersion`
- ownership: `ownerKind`, `clanId`, `clanName`, `clanTag`, `clanEmblem`, `ownershipRevision`, `capturedAtMs`
- defense: `wallLevel`, `wallIntegrityBps`, `neutralDefenders`
- construction: `upgradeQueue[]` with paid cost, level transition, fixed remaining time, and progress start
- repair: paid cost, starting integrity, base repair window, start/completion times, actor, and clan
- Veil: activation/expiry, actor, clan, and paid cost
- Veil daily use: `veilUsage.utcDate`, `veilUsage.count`
- attack lock: `incomingRallyIds[]`, `attackBlocked`

Clients may read current-generation public Tower state but cannot write it.

### `holdingTowers/{towerId}/garrison/{uid}`

One server-owned attribution record per player: `uid`, `clanId`, `troops`, display identity, reset scope, and station/update timestamps. An owning-clan member may read the shared garrison; another player may read only their own record. No client may write garrison documents.

### Clan Treasury

- `clans/{clanId}/treasury/{resetGeneration}`: `balance`, seasonal `totalDonated`, seasonal `totalSpent`, and `revision`
- `clans/{clanId}/treasuryUsage/{resetGeneration}_{utcDate}_{uid}`: private per-player UTC donation usage with canonical `donationDayUtc`, `rawGoldPerHourSnapshot`, `dailyDonationCap`, `donatedToday`, and `snapshotEstablishedAtMs` fields
- `clans/{clanId}/treasuryReceipts/{operationId}`: server-only idempotency and troubleshooting receipt containing the operation result
- existing clan audit records receive concise donation/spend/Rally events

Treasury summaries are readable only by current clan members. A member may read only their own donation usage. Receipts are not client-readable.

### Existing documents extended

- player profiles/global stats: current-generation `towerGarrisonTroops` and `towerGarrisonResetGeneration` ensure stationed troops are counted once
- army movements: `targetType: "tower"`, `sourceType: "tower"`, `sourceTowerId`, and `holdingTowerMovement`
- clan rallies: Tower target support and `assemblyType: "tower"`; Tower-target rallies may use up to the clan member limit while other rallies retain their established limit
- battle/scout reports: Tower identity, wall state, casualties/intelligence result, and Veil-blocked status

## Server entry points

New callable functions:

- `getHoldingTowerState`
- `getClanTreasuryStatus`
- `donateClanTreasuryGold`
- `queueHoldingTowerWallUpgrades`
- `startHoldingTowerRepair`
- `activateHoldingTowerVeil`
- `sendHoldingTowerArmyOrder`

Existing paths extended:

- Rally creation, joining, launch validation, incoming notifications, and settlement
- normal army resolution dispatch and Tower-origin return handling
- clan leave, kick, and disband cleanup
- scheduled `maintainHoldingTowers`, which is a no-op until the Pending Core region gate opens
- reset candidate generation/validation

Every money or troop mutation executes in a Firestore transaction. Operation IDs produce immutable server-only receipts so retries return the prior result rather than charging twice. Ownership, clan membership, membership age, role, Gold rate/balance, Treasury, queue, wall, Veil use, garrison, route, and target legality are read from authoritative documents inside the transaction.

For a Treasury donation, that one transaction reads the operation receipt, member/profile, Treasury, and current UTC usage; rejects invalid or unaffordable donations before creating a snapshot; reuses an existing locked snapshot when present; otherwise derives the raw rate from the existing prepared economy snapshot; validates the amount against the resulting allowance; writes personal Gold, Treasury totals, canonical usage, receipt, and audit atomically. Concurrent first-donation attempts therefore serialize on the same usage document. A retry with the same operation ID returns the receipt instead of charging or crediting twice.

## Exact rules and formulas

Let `C(L)` be the existing canonical normal-city upgrade cost returned by `getCityUpgradeCost({ level: L }, {})` for the current completed Tower Wall Level `L`.

- Wall upgrade `L → L+1`: `5 × C(L)` Clan Treasury Gold
- Veil at Level `L`: `C(L)` Clan Treasury Gold
- Repair at Level `L`: `ceil(5 × C(L) × (10,000 - integrityBps) / 10,000)`, bounded to `0…5 × C(L)`
- One queued Wall Level: exactly `600,000 ms`; entries run sequentially, with at most ten pending entries
- Conquest: `newLevel = max(1, previousCompletedLevel - 5)`, integrity becomes zero, and paid queue/repair/Veil state is destroyed without refund
- Veil: exactly `600,000 ms`, no overlap, at most three activations per Tower per UTC date
- Membership probation: eligible when `serverNow - authoritativeJoinedAt >= 86,400,000 ms`
- Tower-target Rally: at least five unique, current, eligible clan members, each with at least one assembled troop, revalidated immediately before launch
- Donation cap: the first successful donation of the UTC day locks `rawGoldPerHourSnapshot = authoritativeCurrentRawBaseGoldPerHour` and `dailyDonationCap = rawGoldPerHourSnapshot × 12`; subsequent production changes do not change the cap. Before that success, status is an unlocked preview only. Invalid, rejected, and unaffordable attempts create no snapshot. A new UTC day starts with no lock until its first successful donation.
- Neutral reset: Level 1, 10,000 integrity basis points, 10,000,000 NPC troops, no clan/garrison/queue/repair/Veil, zero daily Veil use

Tower Wall Levels have no gameplay cap. Requests and derived costs must remain positive safe integers; overflow, `NaN`, `Infinity`, malformed transitions, and negative values are rejected.

The raw donation rate is the existing base Gold/hour aggregation. It excludes Skill and Gear tax, Stronghold and Citadel output, objective/item/timed boosts, and every other production modifier. No Tower-only economy formula is duplicated.

## Gameplay behavior

- A Holding Tower is clan-owned and has no ownership-count limit.
- Only a qualifying Clan Rally can attack or conquer one; normal solo Tower attacks are rejected.
- Every attributed garrison entry defends together. Casualties are allocated through the existing combat allocator.
- Victorious eligible participants station their attributed survivors. Ineligible survivors use the existing safe return-to-Main-City flow.
- Eligible members may reinforce from owned cities, withdraw only their own troops to a personally owned city, and use only their own Tower troops as a normal attack/scout or Rally origin.
- Reinforcement remains allowed while a hostile Rally approaches.
- An incoming Rally pauses construction but not a paid repair that began beforehand. New upgrades/repairs are rejected until the attack clears. Construction resumes only for the same owner and a fully repaired Wall.
- Enemy public state never includes exact garrison intelligence. A successful scout can reveal it unless Veil is active at resolution. Veil does not hide normal public identity or Wall information.
- Clan departure immediately removes access and returns that player's stationed troops safely. Clan disband returns all stationed troops and resets every owned Tower to neutral.

## QA and Pending Core preview

Local visual fixtures are available only on localhost with `?towerQa=<scenario>`:

`neutral`, `clan-owned`, `owner`, `enemy`, `scout-success`, `scout-veil`, `damaged`, `repair`, `upgrading`, `queue`, `veil-active`, `treasury-preview`, `treasury-locked`, `treasury`, and `incoming`.

The Tower modal reuses the production Clan hero/shield treatment, city stat panels, Clan section headings, roster rows, quest progress tracks, action buttons, and city level-up controls. Treasury reuses the production Clan gift/form/quest hierarchy. The final layer keeps the existing manuscript parchment, dark-blue Clan surfaces, burgundy actions, ivory text, restrained gold, Cinzel family, borders, shadows, and spacing instead of introducing a separate dashboard vocabulary.

Fresh fix captures and machine-readable dimensions live in `docs/visual-qa/holding-towers-gameplay-fixes/`. Desktop was checked at `1440×900`; mobile was checked at exactly `844×390` landscape. No portrait-specific layout was added. These fixtures do not activate or write live gameplay state.

For the full Pending Core preview, use the existing Crownlands Studio/Core preview workflow against the Pending Core 5×5 candidate. The Studio serializer preserves the permanent Tower names/quadrants along with the approved immutable reservation/art fields. Do not switch the live season pointer, deploy Functions, or run reset activation as part of preview QA.

## Automated coverage

- `node tools/validate-holding-towers.js`: neutral/reset, probation, Rally gate, garrison attribution and safe integer handling, Treasury formulas/roles, Wall queue/pause/resume, repairs, conquest, Veil, server contracts, reset integration, and client/rules integration
- `node tools/validate-holding-tower-visuals.js`: approved art/reservations/assets plus interactive/accessibility integration
- `functions/test/emulator-holding-tower-rules.js`: public state, clan Treasury privacy, own usage privacy, garrison secrecy, hidden receipts, and server-only writes
- `functions/test/emulator-holding-tower-donation-concurrency.js`: simultaneous first donations, locked-snapshot stability, allowance-boundary contention, idempotent accounting, and no Gold/Treasury double mutation
- `node tools/qa-holding-tower-fixes.js`: nine fresh visual captures, horizontal-overflow assertions, browser-console checks, desktop, and exact `844×390` landscape metrics
- the existing Crownlands static and emulator regression suites cover economy transaction retries, normal combat, city Walls, rallies, routes, reports, clan lifecycle, and reset invariants
