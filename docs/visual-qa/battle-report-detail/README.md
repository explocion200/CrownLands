# Full Battle Report design draft

Status: isolated draft for approval, created September 14, 2026 on `codex/battle-report-detail-draft`, based on `c90f47b8ed19dbcc754d6cea53620435102a1b70`. It is not integrated, merged, or deployed. No production game files or Master Specification rules are changed.

Open `/docs/visual-qa/battle-report-detail/index.html?viewport=desktop&sample=victory` on the existing local preview server. If needed, start it from the repository root with `node tools/map-benchmark/start-server.js 61703`. The wrapper provides desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). Portrait is outside this design.

## Design

The parchment window shares the Reports list's maximum 1200 × 700 dimensions. Back to reports, title, age, map, and close remain in its header. Section shortcuts stay visible above one vertically scrolling report; they navigate within the same full account rather than hide its information. Your side remains left on both desktop and landscape.

The summary contains the target metadata, exact outcome wording, ruler links and flags, side roles, participant counts, resolved power, starting troops, casualties, and survivors. A three-column table aligns both forces for comparison. Bonuses, recorded Gear effects, walls, and rewards follow; rally reports add every participant's results. The existing red shield represents a defensive defeat or Citadel city loss; a held defense uses the approved olive shield. Result text carries the outcome independently of color.

Reuses the shipped report emblems, approved skills art, Gold and troop icons, Common equipment, and updated Common Gear Box. No new image-generation service is used. Example flags are explicitly illustrative heraldry; integration must use each report's saved player flags and the existing FlagRenderer.

## Existing sources and retained fields

Read the Master Specification's Combat and Scouting and reports sections. Runtime source mapping:

| Draft section/state | Existing source | Information retained |
| --- | --- | --- |
| Header and target | `game.js`: `renderBattleReportNavigation`, `getBattleTargetTypeLabel` | Report type, age, Back, map action, holding name, city/camp/objective type, level or no-level/no-wall labels, region |
| Result and armies | `renderBattleReportHero`, `renderBattleHeroSide`, `getBattleSidePresentationModel`, `getViewerBattleResultLabel`, `getBattleReportBadge` | Viewer/opponent order, roles, flags, rulers, participant summaries, powers, starting troops, losses, survivors, outcome and special capture/breach wording |
| Force comparison | `renderBattleSideDetails` | Base power and per-troop help; wall power and contributors; final power and included sources; reinforcement troops and supporting-ruler count |
| Bonuses | `common-gear-ui.js`: `getBattleSideBonusEntries`, `renderBattleBonusCard` | Swordmastery, Shieldwall, personal/clan objective support, Stoneworks, other recorded defense, percentages and mixed rates, no-bonus/unknown states |
| Gear | `renderBattleGearEffectsSection` | Source names, combat power and percentages, separate Gatehouse wall Gear, Gear casualty recovery and main-city destination |
| Walls | `game.js`: `renderBattleWallResult`, `formatBattleWallAfterStatus` | Before/after integrity, starting wall power, breached/damaged/intact/bypassed wording, recorded repair window; no wall section for camps |
| Rewards | `renderBattleRewards`, `renderCampReportRewardMetrics` | XP, Gold, casualty recovery, level-up troops; recorded Camp item/name/quantity example. Integration must preserve all conditional Camp reward metrics, including Gold, troops, and Deed city/location, through the same metric layout |
| Rally | `renderRallyParticipantResults` | Ruler links, creator/participant role, committed troops, losses, survivors, attack power |
| Scout changes | `renderBattleForecastChanges` | Existing expandable notice and recorded before/after changes; existing explanation of arrival-time defenses |
| Loading/history/fallback | `showBattleReportDetail`, `renderLegacyBattleReportDetail`, `getLegacyBattleSides` | Loading participant snapshot; unavailable-statistics notice; retained summary values; “Not recorded” for missing historical values |

The 13 examples cover attack victory, defensive defeat, held defense, protected breach, protected raid, rally, wall-free camp, recorded Camp item reward, Citadel Legion city loss, long names/large values, older report, unavailable detail, and loading.

## Scope and integration boundary

The examples use synthetic presentation values, not combat calculations, current production balance, real accounts, or promised rewards. For illustration, resolved losses and rewards are supplied directly. No state is persisted. The draft imports no game/backend modules and makes no service calls. Reports, map, and ruler actions announce their intended navigation in the outer review footer; Close, Reopen, section scrolling, and the forecast disclosure work locally.

After design approval, integrate through the existing detail renderers, snapshot loading, late-response guard, flag rendering, rule/outcome helpers, fallback and navigation handlers. Do not alter battle resolution, rewards, recovery caps, permissions, retention, read marking, or scout intelligence. Scout detail pages remain a separate review.

See `visual-checks.md` for local draft verification. Production integration and its release gates remain pending approval.
