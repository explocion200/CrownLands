# Attack / Send Troops draft

Status: **DRAFT — awaiting design approval**. Prepared September 15, 2026 as the next UI draft requested during the current batched review. No production integration, PR, merge or deployment.

Branch: `codex/kingdom-activity-camps-strongholds`.
Base: `81a35aed85301606fc4147294bef57ef0f297d9c` (Reinforcements release, PR #305).

## Review

Open `/docs/visual-qa/troop-orders/index.html?viewport=desktop&sample=attack` on the loopback preview server. Desktop is 1440 × 900, landscape is 844 × 390, and small landscape is 568 × 320. No portrait game design is included.

The parchment military order sheet uses current city, Stronghold, Camp, skill and item artwork. Attack and Transfer now lead with a full-width troop slider and prominent selected count, using a 48px handle: crossed swords for Attack and existing leather-boot artwork for Transfer. Attack power and the enemy forecast/travel summary sit beneath it. Transfer groups its arrival troop total, journey time/bonus, and eligible Swift March control into three matching panels below selection. Reinforcement and Rally retain their two-column layout. Desktop and mobile landscape keep the same window sizes; long content scrolls inside the window. Close, Cancel and the primary order action stay fixed. The shield-loss summary remains beside Reinforce even when the detailed warning is scrolled away.

Eighteen samples cover a scouted attack, no buffs/equipped weapon, a stored unequipped sword, maximum Swordmastery/weapon, one-troop rounding, likely wall hold, missing intelligence, obsolete scout model, wall-free Camp, eligible friendly Transfer, unavailable Swift March Order, Reinforcement with shield warning, Rally creation, Rally joining, route calculation, failed route, protected home base, and long labels/large numbers.

Troop selection updates the displayed amount and source remainder. Transfer arrival, personally stationed support and Rally contribution reflect that selection. Swift March uses the existing 0.5 time multiplier and one-second floor on the sample route. Try again restores a mock route result. Cancel, Close, Escape and Reopen are supported. Confirm only announces a disclosed draft order; it never sends troops or consumes an item.

**Simulation boundary:** own-army attack power uses the current additive formula with a synthetic loadout and responds to the slider. Enemy outcome forecasts and base travel times remain fixed sample snapshots, explicitly disclosed above the preview. This draft does not implement battle resolution, protection calculation, troop travel bands, pathfinding, network requests, game storage or account state. The production integration must call existing helpers with current authoritative state; never copy these fixtures or fixed values into runtime logic.

## Requested attack-power breakdown

Attack route headers also show the origin and destination city levels in compact badges (sample Level 64 keep → Level 82 castle). Levels remain visible when enemy scout intelligence is unavailable. Camp targets omit a city-level badge. Integration must read levels from the current source and target city state, separately from scout-time combat snapshots; the displayed fixture levels are not runtime defaults.

The user requested an attack preparation breakdown and then narrowed it to bonuses affecting the battle forecast. The draft therefore shows base troop power, Swordmastery and equipped attack-strength gear. This requirement is recorded in the Master Specification; the revised layout is still a draft for approval.

- `functions/index.js` `createAttackCombatSnapshot` and both client/server `getAttackPower` apply `1.25 × (1 + Swordmastery% / 100 + equipped attack-strength% / 100)` per troop. Multiply by selected troops, then floor the final total. Skill and Gear bonuses both apply to base power; Gear does not multiply already skill-boosted power.
- The three source rows display raw base contribution and added skill/weapon power. Fractional contributions use up to two decimals, or six below one point; an approximation mark identifies a display-rounded contribution. The final total is always rounded down once to whole points, matching launch-snapshot arithmetic.
- The default 750,000-troop sample has 937,500 base power, +375,000 from Level 20 Swordmastery (40%), and +10,781.25 from the equipped Level 4 Officer Sword (1.15%). Final power is 1,323,281; combined bonus is 41.15% and per-troop power is 1.764375.
- Current Common Gear definitions and level values are read from the pure `common-gear.js` module. Only the equipped Barracks weapon grants `attackStrength`. War Captain armor supplies troop production, and the necklace supplies casualty recovery; ownership alone grants no equipped bonus.
- The previous Other buffs & items list is removed. Production, gold, travel, scouting protection, casualty recovery and stored/inactive inventory do not change the displayed attack-power/capture forecast and are excluded from this breakdown. The stored-sword example still grants no weapon power. Travel bonus/time remain in their existing summary, and Swift March remains an actionable control only on eligible Transfers.
- Own-army information remains visible for unknown or obsolete enemy intelligence and route errors. Enemy hidden statistics remain unknown. This new requested section does not reintroduce detailed enemy-wall/loss forecasts or minimum-capture-force advice removed by the earlier compact forecast decision.
- Integration must use the latest authoritative attack snapshot/forecast where available, reconcile the selected force and protection cap, and avoid treating unavailable sources as known zero. Equipped identities and active-effect/inventory state must be read fresh; no fixture counts, percentages or expired item effects can leak into production. Existing launch, item-use, inventory, protection and Rally rules remain authoritative.

## Inspected sources and preserved contracts

- Master Specification sections 5 (movement, combat and scouting), 9 (Rallies), 10 (items), 17 (desktop/mobile landscape), and the Art Bible. The older Visual Migration Matrix identifies combat preparation as partially migrated; current runtime code is the implementation authority.
- `game.js`: `getTroopOrderKind`, `showTroopSliderModalAsync`, `showTroopSliderModalWithRoute`, `updateTroopSliderModal`, `getTroopSliderSendLimit`, `isOrderRouteReady`, `canUseSwiftMarchOrderOnLaunch`, `showMainCityProtectedAttackModal`, and the existing confirmation/submission handlers.
- The shared dialog covers Attack, Transfer, Reinforce, Create Rally and Join Rally. Only Rally currently has a numeric contribution input. The draft retains that distinction rather than adding new troop controls to other orders.
- Forecast retains the compact current fields: scouted siege/total defense and outcome at scout time, or explicit missing/obsolete intelligence. Travel retains only Travel bonus and Travel time. Do not add loss estimates, minimum-capture-force forecasts, detailed wall statistics, or hidden defense values; the existing `tools/validate-combat-forecast.js` expressly guards the compact presentation.
- Production must preserve legal/protected send limits, Protected max labeling, attack-protection notices, Main City and Peace Shield blockers, shield-removal warnings, clan support permissions, two assignments per recipient and five ordinary-city slots, authoritative route readiness/retry, troop-band refresh, fresh source/target reconciliation and existing onboarding tips.
- Ordinary Rally samples use the current 2–20 participants and manual Ready/launch behavior. Target-specific Holding Tower rules remain separate; this draft does not introduce or alter them. Rally commitment preserves an active Royal Peace Shield.
- Swift March appears only on the eligible owned-to-owned Transfer sample. Preserve all current eligibility, inventory, online-authority, floor and actual effective-speed rules during integration. Never add it to attacks or clan reinforcements based on this draft.
- Names and numeric snapshots are synthetic. Displayed regional labels and reused packaged objective art relate to the active `core-expansion-v1` topology. Both release-config files still identify the September monthly shared-realm contract. No world data, release configuration or production pointer was modified.

## Batch status

Camps and Strongholds are approved. The user approved the Attack presentation, then requested the Transfer boots and summary-panel refinement, which remains under review. Design approval does not authorize a merge or deployment. Retain the existing branch as the current UI review batch, with no unrelated feature work.

After the batch's designs and implementation scope are confirmed, integrate the approved presentation, commit and run `pnpm run prepare-pr` on the final combined change. Required checks are deferred at this draft checkpoint, not waived. This draft is not ready to merge. Confirmed presentation requirements are recorded in the Master Specification; the latest Transfer refinement and release authorization remain separate.

See [visual-checks.md](visual-checks.md) for focused evidence.
