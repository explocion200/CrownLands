# Stronghold and Crown Citadel details drafts

Status: **Regional Stronghold designs APPROVED; Crown Citadel DRAFT awaits approval**. After reviewing the three regional variants, the user continued to the next planned Crown Citadel draft. This continues the Leaderboards + Map Selector + objective-details review batch on `codex/leaderboard-ledger-draft`. Leaderboards and Map Selector are also approved. This batch is not integrated or released.

Review `/docs/visual-qa/stronghold-details/index.html?viewport=desktop&sample=owned&holding=crown`. The Holding selector switches between `gold`, `training`, `movement`, `defense` and `crown`. The URL preserves holding, viewport and example; existing links without `holding` still show the approved Gold design. Desktop is 1440 × 900; mobile landscape 844 × 390 and small landscape 568 × 320. No portrait game layout. The window uses the City Details envelope, up to 1040 × 790 pixels, and fits within the landscape viewport with eight-pixel margins.

## Presentation

The revised overview keeps a framed fortress portrait, defense-level badge, owner and clan together on the left. On the right, a compact benefit strip separates the controller's 8% from the clan's 4%; two adjacent cards show stationed troops and estimated defense, followed by wall integrity and repair status. The parchment, crimson and gilt treatment follows the approved atlas royal maps. Existing art is reused unchanged. Training has an olive benefit accent, Movement a slate accent, and Defense an iron accent; the shared royal frame and layout remain consistent.

| Holding | Specialization | Icon | Effect |
| --- | --- | --- | --- |
| Aurum Keep | Gold | Gold coin | Base gold production |
| Greybanner Hold | Training | Helmet | Base troop production |
| Swiftgate | Movement | March banner | March speed / travel time |
| Ironwatch | Defense | Shield | Defending-soldier power; walls unchanged |
| Crown Citadel | Royal seat | Crown emblem from the Strongholds ledger | Five Crown benefits and Reign Ledger |

Defense & repair and Holding benefits are keyboard-accessible disclosure sections, initially collapsed. They retain the detailed wall values, bonus sources, repair rules, effect target and Citadel precedence explanation. Reinforcement contributions and their existing actions remain below. Both columns can scroll; the management footer stays visible. The relinquishment explanation is retained in its local action preview. At normal mobile landscape size the portrait, owner, clan and primary statistics fit in the initial view. At the smallest landscape size, secondary card captions are omitted in favor of their fuller explanations in the expandable section. Legacy keeps its existing layout.

Overview and Stronghold Legacy retain their existing purposes. The Legacy view contains 100 fictional ranked rulers, cumulative holding time and a current-holder marker. Tabs work with clicks and Left/Right/Home/End keys. Owner/clan names, reinforcement returns and relinquishment open disclosed local action previews. Close, Escape, Reopen and return focus are supported. No game action is dispatched.

The Crown variant retains the grand Citadel artwork and crown emblem, a current-reign duration beneath controller/clan identity, level-100 defenses, and a dedicated five-benefit group. It shows +10% base gold, base troops, march speed and defending-soldier power, plus −10% upgrade cost. Holding benefits expands to a controller/clanmate comparison, the 1.30 soldier-base explanation, and confirmed regional Stronghold interactions. The main example assumes the ruler holds the Citadel alone. Current reign measures the present tenure; Reign Ledger scores are cumulative and mark the Current Citadel ruler.

This pass covers all four regional Strongholds and the Crown Citadel. No attack, scout, Rally, city upgrade, wall upgrade or Inner Castle button has been invented for this information dialog. The Holding selector belongs to the review toolbar, not the proposed in-game window. Citadel Legion behavior is outside this detail-window presentation.

## Information and visibility contracts

- Owned: controlled bonus, Holding clan, active objective benefit with Citadel precedence, estimated live defense, wall integrity/power/repair, owner, stationed troops, wall/defense level, base-plus-bonus City walls and sources, unlimited garrison, effect target, relinquishment allowance and reinforcement controls.
- Foreign: owner/clan, specialization, defense level, report-gated garrison and total defense, wall condition, and scout availability/expiry. Unscouted enemy numbers stay unknown. Regional scouted defense is presented as base plus bonus; Crown scouted defense remains a single reported wall-plus-garrison value, matching its distinct runtime view.
- Allied: exact owner garrison is visible, defense remains report-gated, and only the viewer's own reinforcement contribution and Recall action are exposed. The existing restriction on scouting/attacking clan allies is retained as explanatory text.
- Neutral: 50,000,000 for regional Strongholds and 100,000,000 for Crown Citadel are labeled **one-time starting defenders**, not the current garrison. Current troops and total defense require scouting; public neutral wall power remains visible as in the current implementation. A neutral Citadel's current reign is Unclaimed. Historical placeholder rankings use ruler names, never Neutral defenders as a ruler.
- Owned support shows contributions and Send Home; allied support shows the viewer's contribution and Recall. Return behavior describes the original holding / Main City fallback. The draft does not remove troops or imply a successful return.
- Relinquish Castle preserves the once-per-UTC-day rule, disabled cooldown state, and the existing nearest-friendly-city/neutralization explanation. Its preview cannot authorize or perform the real action.

## Source evidence and fixture limits

Read current `game.js`: `showCityInfoModal`, `strongholdInfoPanelMarkup`, `bindStrongholdInfoTabs`, `strongholdLegacyLeaderboardMarkup`, `getVisibleCityGarrisonTroops`, `getCityFortificationDisplay`, `renderCityFortificationStatus`, `renderHoldingReinforcementPanel`, `renderObjectiveClanAffiliation`, `getControlledObjectiveBenefitBreakdown`, `canRelinquishCity` and `renderRelinquishCityAction`.

Crown evidence: `showCrownCitadelInfoModal`, `getCrownCitadelBonusLabel`, `getRankedCrownCitadelReigns`, `crownCitadelReignLeaderboardMarkup` and `refreshCrownCitadelReignPanel`. Runtime integration must retain the existing current-world/reset filters and accumulation rules. This draft makes no new cross-season retention promise. Master Specification section 7 confirms 10% direct / 5% shared benefits, the upgrade-cost reduction, and examples of 14% Gold for Citadel + personally held Gold Stronghold and 13% for a Gold-holding clanmate.

Read Master Specification sections 7, 16 and the relevant ownership/visibility rules; Art Bible panel families. Current client and Functions contracts agree on `crownlands-2026-09-monthly-sharded-realms-v1` / `core-expansion-v1`. Aurum Keep is a permanent Core map included in the current-generation allowlist already verified for the Map Selector draft. This detail view reads no production state and changes no world file.

Current Core objective identity/art is taken from `functions/core-expansion-world-layout.json`, the packaged catalog, and the existing Strongholds ledger fixture. All five IDs, names, levels and art paths were checked against the current Core layout. Regional icons match the approved Map Selector's specialization mapping; Crown uses the existing crowned-shield emblem from the Strongholds ledger. **Do not copy old 20%/25% layout metadata**: current runtime and confirmed regional bonuses are 8% direct / 4% clan sharing, subject to Citadel precedence. Each main owned example assumes only its selected objective; it is not a replacement total-benefit calculator. Effect labels/help follow `getStrongholdProductionLabel` and the owned Stronghold/Citadel branches in the current client.

Fixture arithmetic follows `functions/economy-config.json`: Level 50 base walls are 1,456,669; 12% Stoneworks plus 4% Gear gives 1,689,736 full wall power. A 3,250,000 owner garrison at 1.30 base defense gives an intact local estimate of 5,914,736 for Gold, Training and Movement. Their damaged example uses 60% integrity (1,013,841 wall power), giving 5,238,841 estimated defense. Ironwatch adds its 8% bonus against the soldiers' 1.30 base: 338,000 additional power, giving 6,252,736 intact / 5,576,841 damaged. Its walls stay at the same values. The full-breach repair window is 30 minutes. Support is separately attributed; these owner-only illustrative estimates are not authoritative battle forecasts. The Defense fixture follows the soldier-layer objective handling in `getCityStats` and `getCityFortificationDisplay` without importing those runtime functions.

Crown fixture: level-100 base walls are 3,000,000. The same 12% Stoneworks + 4% Gear gives 3,480,000 full walls. Its 28,340,000 owner troops at 1.30 base plus 10% Crown soldier defense give 44,006,200 intact / 42,614,200 at 60% walls. The full-breach window is 45 minutes and the 60% example has 18 minutes remaining. Current reign is a frozen 18h 27m; cumulative time for the current ruler is separately shown in the ledger. The shared wall fixture now uses the runtime's additive arithmetic form to avoid a floating-point off-by-one at level 100; regional fixture values are unchanged.

Ruler/clan names, skills, Gear, garrisons, reign times and reports are fictional. Objective identities and art are repository-backed. Timers are frozen for visual review. Runtime integration must retain server-authoritative benefits, fog of war, actual scout/repair/Legacy/Reign clocks, live support changes and the existing confirmation/permission handlers.

The preview loads only draft scripts and the existing pure clan-heraldry renderer. It does not import `game.js`, Firebase, authentication, storage, or mutation APIs. Existing game art is reused unchanged. `prepare-pr`, integration tests, required release checks, PR creation, merge and deployment remain deferred until the approved batch is integrated.
