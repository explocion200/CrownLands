# Kingdom Activity: Strongholds draft

Status: **DRAFT — awaiting design approval**. Isolated preview prepared September 15, 2026. No runtime integration, pull request, merge or deployment.

Branch: `codex/kingdom-activity-camps-strongholds`.
Base: `81a35aed85301606fc4147294bef57ef0f297d9c` (Reinforcements release, PR #305).

## Combined update

The user confirmed one combined release for Camps and Strongholds, reviewing one panel at a time. [Camps](../kingdom-activity-camps/README.md) is design approved. This is the second draft on the same branch. After Strongholds approval, integrate both panels and run `prepare-pr` on the final combined change. The full release gate is deferred until that update is ready; this checkpoint is not ready to merge.

The subsequent “next update” request continues design review with [Attack / Send Troops](../troop-orders/README.md) on the current batch branch. No runtime integration or release was requested by that message. The new draft is also pending approval; finalize the approved batch scope before integration.

## Preview

Open `/docs/visual-qa/kingdom-activity-strongholds/index.html?viewport=desktop&sample=standard` on the loopback review server. Controls provide desktop 1440 × 900, mobile landscape 844 × 390, and small landscape 568 × 320. Portrait is outside the supported design target.

The draft reuses the approved Camps parchment frame, capped at 1200 × 700 on desktop. The heading, category tabs and holding summary remain fixed above a scrolling ledger. Each row preserves current Stronghold art, type, name, map, specialization, full garrison, held state, defense level and Map action. The Crown Citadel has its own current art, restrained gold trim and all five existing bonus labels. Small landscape arranges identity and garrison above specialization and defense; every field remains reachable through vertical scrolling.

Seven examples: four regional Strongholds, all four with the Crown Citadel, Citadel only, long names and large garrisons, zero garrisons, one holding, and no holdings. Owned garrisons are synthetic; long names deliberately stress wrapping. Other category tabs are disabled review context.

Map opens a disclosed mock location card with the selected Stronghold and map. Back to Strongholds restores the originating button's focus and list position. Close/Reopen, Escape and the empty Return to map action are supported. No production game script, account, backend, storage or private player data is connected.

## Sources and integration constraints

- Master Specification sections 7 (Strongholds/Citadel), 8 (separate Holding Towers), 16 (UI), and 17 (desktop/mobile landscape).
- Current `game.js`: `getHeldStrongholdsForActiveOperations`, `renderHeldStrongholdsOperationPanel`, `renderHeldStrongholdOperationCard`, `getStrongholdArtSrc`, `getStrongholdDefenseLevel`, `getStrongholdBonusLabel`, `getCrownCitadelBonusLabel`, and `focusActiveOperationLocation`.
- Current Core/New Lands objective identities, art and levels come from `functions/core-expansion-world-layout.json`; map labels come from the corresponding `assets/worlds/core-expansion-v1/region-catalog.json`. Reuse the packaged content-hashed artwork, including the Crown Citadel. No new art generation or world-file change is included.
- **Use the current display helpers and Specification values: 8% regional, 10% Crown.** Layout metadata still contains older 20%/25% bonus values; the fixture deliberately excludes that metadata. Do not copy it into the UI or alter world balance during integration.
- Regional labels: base gold production, base troop production, march speed, and defending-soldier power. Crown labels: +10% base gold, +10% base troops, +10% speed, +10% soldier defense, and −10% upgrade cost. Defense levels remain 50 regional / 100 Crown.
- These labels describe objective specializations, not a new personal or clan total. Preserve existing control and clan-sharing rules, including half-strength sharing and the Citadel holder's treatment of personally held regional Strongholds. Do not sum row labels into an invented total.
- Preserve owned-only discovery, cross-map discovery, deduplication, authoritative Crown-holder filtering, removal after ownership loss, zero garrisons, full numbers, map/name sorting, and the validated close-and-locate Map action.
- Holding Towers and the Reign Ledger are separate systems. No tower expansion, new management action, timer, reward claim, combat, ownership or balance change is included.
- The Master Specification records Camps approval only. Strongholds presentation remains pending the user's review.

Focused evidence is in [visual-checks.md](visual-checks.md). Runtime behavior and required release checks belong to the final combined integration.
