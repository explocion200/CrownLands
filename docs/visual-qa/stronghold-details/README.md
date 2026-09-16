# Regional Stronghold details drafts

Status: **Gold overview APPROVED; Training, Movement and Defense DRAFTS await approval**. The user approved the revised Gold overview and requested the next three regional variants in the same Leaderboards + Map Selector + objective-details review batch, continuing `codex/leaderboard-ledger-draft`. Leaderboards and Map Selector are also approved. This batch is not integrated or released.

Review `/docs/visual-qa/stronghold-details/index.html?viewport=desktop&sample=owned&holding=training`. The Holding selector switches between `gold`, `training`, `movement` and `defense`. The URL preserves holding, viewport and example; existing links without `holding` still show the approved Gold design. Desktop is 1440 × 900; mobile landscape 844 × 390 and small landscape 568 × 320. No portrait game layout. The window uses the City Details envelope, up to 1040 × 790 pixels, and fits within the landscape viewport with eight-pixel margins.

## Presentation

The revised overview keeps a framed fortress portrait, defense-level badge, owner and clan together on the left. On the right, a compact benefit strip separates the controller's 8% from the clan's 4%; two adjacent cards show stationed troops and estimated defense, followed by wall integrity and repair status. The parchment, crimson and gilt treatment follows the approved atlas royal maps. Existing art is reused unchanged. Training has an olive benefit accent, Movement a slate accent, and Defense an iron accent; the shared royal frame and layout remain consistent.

| Holding | Specialization | Approved atlas icon | Effect |
| --- | --- | --- | --- |
| Aurum Keep | Gold | Gold coin | Base gold production |
| Greybanner Hold | Training | Helmet | Base troop production |
| Swiftgate | Movement | March banner | March speed / travel time |
| Ironwatch | Defense | Shield | Defending-soldier power; walls unchanged |

Defense & repair and Holding benefits are keyboard-accessible disclosure sections, initially collapsed. They retain the detailed wall values, bonus sources, repair rules, effect target and Citadel precedence explanation. Reinforcement contributions and their existing actions remain below. Both columns can scroll; the management footer stays visible. The relinquishment explanation is retained in its local action preview. At normal mobile landscape size the portrait, owner, clan and primary statistics fit in the initial view. At the smallest landscape size, secondary card captions are omitted in favor of their fuller explanations in the expandable section. Legacy keeps its existing layout.

Overview and Stronghold Legacy retain their existing purposes. The Legacy view contains 100 fictional ranked rulers, cumulative holding time and a current-holder marker. Tabs work with clicks and Left/Right/Home/End keys. Owner/clan names, reinforcement returns and relinquishment open disclosed local action previews. Close, Escape, Reopen and return focus are supported. No game action is dispatched.

This pass covers the four regional Strongholds. **Crown Citadel and its Reign Ledger remain the next draft**, since its bonuses and identity differ. No attack, scout, Rally, city upgrade, wall upgrade or Inner Castle button has been invented for this information dialog. The Holding selector belongs to the review toolbar, not the proposed in-game window.

## Information and visibility contracts

- Owned: controlled bonus, Holding clan, active objective benefit with Citadel precedence, estimated live defense, wall integrity/power/repair, owner, stationed troops, wall/defense level, base-plus-bonus City walls and sources, unlimited garrison, effect target, relinquishment allowance and reinforcement controls.
- Foreign: owner/clan, specialization, defense level, report-gated garrison and total defense, wall condition, and scout availability/expiry. Unscouted enemy numbers stay unknown. Scouted defense is presented as base plus bonus, preserving the current helper's meaning.
- Allied: exact owner garrison is visible, defense remains report-gated, and only the viewer's own reinforcement contribution and Recall action are exposed. The existing restriction on scouting/attacking clan allies is retained as explanatory text.
- Neutral: 50,000,000 is labeled **one-time starting defenders**, not the current garrison. Current troops and total defense require scouting; public neutral wall power remains visible as in the current implementation.
- Owned support shows contributions and Send Home; allied support shows the viewer's contribution and Recall. Return behavior describes the original holding / Main City fallback. The draft does not remove troops or imply a successful return.
- Relinquish Castle preserves the once-per-UTC-day rule, disabled cooldown state, and the existing nearest-friendly-city/neutralization explanation. Its preview cannot authorize or perform the real action.

## Source evidence and fixture limits

Read current `game.js`: `showCityInfoModal`, `strongholdInfoPanelMarkup`, `bindStrongholdInfoTabs`, `strongholdLegacyLeaderboardMarkup`, `getVisibleCityGarrisonTroops`, `getCityFortificationDisplay`, `renderCityFortificationStatus`, `renderHoldingReinforcementPanel`, `renderObjectiveClanAffiliation`, `getControlledObjectiveBenefitBreakdown`, `canRelinquishCity` and `renderRelinquishCityAction`.

Read Master Specification sections 7, 16 and the relevant ownership/visibility rules; Art Bible panel families. Current client and Functions contracts agree on `crownlands-2026-09-monthly-sharded-realms-v1` / `core-expansion-v1`. Aurum Keep is a permanent Core map included in the current-generation allowlist already verified for the Map Selector draft. This detail view reads no production state and changes no world file.

Current Core objective identity/art is taken from `functions/core-expansion-world-layout.json`, the packaged catalog, and the existing Strongholds ledger fixture. All four IDs, names, levels and art paths were checked against the current Core layout. Icons match the approved Map Selector's specialization mapping. **Do not copy old 20%/25% layout metadata**: current runtime and confirmed bonuses are 8% direct / 4% clan sharing, subject to Citadel precedence. Each main owned example assumes only its selected regional objective; it is not a replacement total-benefit calculator. Effect labels/help follow `getStrongholdProductionLabel` and the owned Stronghold branch in `showCityInfoModal`.

Fixture arithmetic follows `functions/economy-config.json`: Level 50 base walls are 1,456,669; 12% Stoneworks plus 4% Gear gives 1,689,736 full wall power. A 3,250,000 owner garrison at 1.30 base defense gives an intact local estimate of 5,914,736 for Gold, Training and Movement. Their damaged example uses 60% integrity (1,013,841 wall power), giving 5,238,841 estimated defense. Ironwatch adds its 8% bonus against the soldiers' 1.30 base: 338,000 additional power, giving 6,252,736 intact / 5,576,841 damaged. Its walls stay at the same values. The full-breach repair window is 30 minutes. Support is separately attributed; these owner-only illustrative estimates are not authoritative battle forecasts. The Defense fixture follows the soldier-layer objective handling in `getCityStats` and `getCityFortificationDisplay` without importing those runtime functions.

All names, holdings, skills, Gear, garrisons, times and reports are fictional. Timers are frozen for visual review. Runtime integration must retain server-authoritative benefits, fog of war, actual scout/repair/Legacy clocks, live support changes and the existing confirmation/permission handlers.

The preview loads only draft scripts and the existing pure clan-heraldry renderer. It does not import `game.js`, Firebase, authentication, storage, or mutation APIs. Existing game art is reused unchanged. `prepare-pr`, integration tests, required release checks, PR creation, merge and deployment remain deferred until the approved batch is integrated.
