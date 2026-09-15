# Attack / Send Troops draft

Status: **DRAFT — awaiting design approval**. Prepared September 15, 2026 as the next UI draft requested during the current batched review. No production integration, PR, merge or deployment.

Branch: `codex/kingdom-activity-camps-strongholds`.
Base: `81a35aed85301606fc4147294bef57ef0f297d9c` (Reinforcements release, PR #305).

## Review

Open `/docs/visual-qa/troop-orders/index.html?viewport=desktop&sample=attack` on the loopback preview server. Desktop is 1440 × 900, landscape is 844 × 390, and small landscape is 568 × 320. No portrait game design is included.

The parchment military order sheet uses current city, Stronghold, Camp, skill and Swift March artwork. Source and destination sit above two columns: troop selection on the left, the existing forecast and travel summary on the right. Long content scrolls inside the window. Close, Cancel and the primary order action stay fixed. The shield-loss summary remains beside Reinforce even when the detailed warning is scrolled away.

Fourteen samples cover a scouted attack, likely wall hold, missing intelligence, obsolete scout model, wall-free Camp, eligible friendly Transfer, unavailable Swift March Order, Reinforcement with shield warning, Rally creation, Rally joining, route calculation, failed route, protected home base, and long labels/large numbers.

Troop selection updates the displayed amount and source remainder. Transfer arrival, personally stationed support and Rally contribution reflect that selection. Swift March uses the existing 0.5 time multiplier and one-second floor on the sample route. Try again restores a mock route result. Cancel, Close, Escape and Reopen are supported. Confirm only announces a disclosed draft order; it never sends troops or consumes an item.

**Simulation boundary:** combat forecasts and base travel times are fixed sample snapshots, explicitly disclosed above the preview. This draft does not implement combat, protection calculation, troop travel bands, pathfinding, network requests, game storage or account state. The production integration must call existing helpers with current authoritative state; never copy these fixtures or fixed values into runtime logic.

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

After the batch's designs and implementation scope are confirmed, integrate the approved presentation, commit and run `pnpm run prepare-pr` on the final combined change. Required checks are deferred at this draft checkpoint, not waived. This draft is not ready to merge and creates no new Master Specification design decision.

See [visual-checks.md](visual-checks.md) for focused evidence.
