# Attack / Send Troops draft

Status: **DRAFT — awaiting design approval**. Prepared September 15, 2026 as the next UI draft requested during the current batched review. No production integration, PR, merge or deployment.

Branch: `codex/kingdom-activity-camps-strongholds`.
Base: `81a35aed85301606fc4147294bef57ef0f297d9c` (Reinforcements release, PR #305).

## Review

Open `/docs/visual-qa/troop-orders/index.html?viewport=desktop&sample=attack` on the loopback preview server. Desktop is 1440 × 900, landscape is 844 × 390, and small landscape is 568 × 320. No portrait game design is included.

The parchment military order sheet uses current city, Stronghold, Camp, skill and item artwork. Attacks place troop selection, the requested own-power breakdown and the enemy forecast/travel summary in three desktop columns. Mobile keeps selection and forecast together, followed by the full-width power breakdown and expandable effects/item list. Friendly and Rally orders retain the previous two-column layout. Long content scrolls inside the window. Close, Cancel and the primary order action stay fixed. The shield-loss summary remains beside Reinforce even when the detailed warning is scrolled away.

Eighteen samples cover a scouted attack, no buffs/equipped weapon, a stored unequipped sword, maximum Swordmastery/weapon, one-troop rounding, likely wall hold, missing intelligence, obsolete scout model, wall-free Camp, eligible friendly Transfer, unavailable Swift March Order, Reinforcement with shield warning, Rally creation, Rally joining, route calculation, failed route, protected home base, and long labels/large numbers.

Troop selection updates the displayed amount and source remainder. Transfer arrival, personally stationed support and Rally contribution reflect that selection. Swift March uses the existing 0.5 time multiplier and one-second floor on the sample route. Try again restores a mock route result. Cancel, Close, Escape and Reopen are supported. Confirm only announces a disclosed draft order; it never sends troops or consumes an item.

**Simulation boundary:** own-army attack power uses the current additive formula with a synthetic loadout and responds to the slider. Enemy outcome forecasts and base travel times remain fixed sample snapshots, explicitly disclosed above the preview. Active timers are fixed review values. This draft does not implement battle resolution, protection calculation, troop travel bands, pathfinding, network requests, game storage or account state. The production integration must call existing helpers with current authoritative state; never copy these fixtures or fixed values into runtime logic.

## Requested attack-power breakdown

The user explicitly requested an attack preparation breakdown of player buffs/items and their added power. This requirement is recorded in the Master Specification; the revised layout is still a draft for approval.

- `functions/index.js` `createAttackCombatSnapshot` and both client/server `getAttackPower` apply `1.25 × (1 + Swordmastery% / 100 + equipped attack-strength% / 100)` per troop. Multiply by selected troops, then floor the final total. Skill and Gear bonuses both apply to base power; Gear does not multiply already skill-boosted power.
- The three source rows display raw base contribution and added skill/weapon power. Fractional contributions use up to two decimals, or six below one point; an approximation mark identifies a display-rounded contribution. The final total is always rounded down once to whole points, matching launch-snapshot arithmetic.
- The default 750,000-troop sample has 937,500 base power, +375,000 from Level 20 Swordmastery (40%), and +10,781.25 from the equipped Level 4 Officer Sword (1.15%). Final power is 1,323,281; combined bonus is 41.15% and per-troop power is 1.764375.
- Current Common Gear definitions and level values are read from the pure `common-gear.js` module. Only the equipped Barracks weapon grants `attackStrength`. War Captain armor supplies troop production, and the necklace supplies casualty recovery; ownership alone grants no equipped bonus.
- The expandable sample list distinguishes active March Orders, Field Medics, the equipped Valor Medallion, timed War Drums/Tax Decree/Veil, and inactive carried Swift March/Recall Horn/Peace Shield items. Each shows its actual purpose and +0 direct attack power. War Drums is +30% troop production, not an attack multiplier. The stored-sword example also shows +0 power until equipped.
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

Camps is approved. Strongholds remains recorded as pending explicit design approval. The user's “next update” request moved review to this troop-order draft; it was not a merge/deploy instruction. Retain the existing branch as the current UI review batch, with no unrelated feature work.

After the batch's designs and implementation scope are confirmed, integrate the approved presentation, commit and run `pnpm run prepare-pr` on the final combined change. Required checks are deferred at this draft checkpoint, not waived. This draft is not ready to merge. Only the explicitly requested attack-power breakdown requirement is newly recorded in the Master Specification; full layout approval and release authorization remain separate.

See [visual-checks.md](visual-checks.md) for focused evidence.
