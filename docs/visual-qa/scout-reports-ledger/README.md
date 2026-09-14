# Scout Reports design draft

Status: **design approved September 14, 2026**, integrated on `codex/scout-reports-draft`, based on `afdeb8b7c6bbe376236f3b6b0f7de10b33992e2e`. Production presentation is in `scout-report-ui.js` and its scoped stylesheet. Merge and deployment were authorized; their completion is recorded separately in the release receipt.

Open `/docs/visual-qa/scout-reports-ledger/index.html?viewport=desktop&sample=success` on the existing local server. Start that server if needed with `node tools/map-benchmark/start-server.js 61703` from the repository root.

## Design

The window matches the approved Battle Reports maximum of 1200 × 700, with the same parchment, olive, burgundy, ink, borders, and medieval emblems. Desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320) are provided. Portrait is outside this draft.

Back, map, close, section shortcuts, report age, and intelligence expiry stay above one vertically scrolling report. Successful intelligence starts with the holding, ruler identities, troop count, total defense, and wall integrity. Troops and effective defense have separate table columns; owner and reinforcement rows precede the summed garrison layer and wall layer. The wall section retains repair and strength details. Two compact columns retain all eight skills and base attack, with the approved skill illustrations.

The defender perspective shows who scouted the holding, the source and destination, exact time, and what was disclosed: troop breakdown, defense, wall integrity, reinforcements, and skill levels/bonuses. It does not show the enemy ruler's hidden statistics. Camps omit city wall/skill sections and retain their fixed-power explanation. Failed, blocked, expired, and replaced states contain no troop/defense/skill data. Expired and replaced samples illustrate a fallback when an old view loses valid intelligence; they do not propose retaining expired successful entries in Reports.

## Existing source mapping

Read the Master Specification's Scouting and Reports and UI/UX Standards sections. It records the approved presentation without changing gameplay rules.

| Draft information | Existing implementation |
| --- | --- |
| Successful target, ruler identities, owner/profile links, flags, scout troop, hero/city level, map location | `game.js`: `showScoutReportModal`, `renderPlayerNameLink`, `FlagRenderer.render`, `bindBattleReportJumpButtons` |
| Report age and remaining intelligence | `getScoutReportAgeSeconds`, `getScoutReportRemainingSeconds`, existing `data-scout-report-age` / `data-scout-report-expires` updates |
| Base/bonus/total defense, owner troops, supporting rulers, troop and effective-power breakdown, objective/Shieldwall/Gear sources | `showScoutReportModal`, `normalizeScoutReportReinforcements`, `scoutDefenderRow`, `scoutBreakdownRow`, `formatBaseAndBonusStat` |
| Walls, integrity, full/current power, base walls, Stoneworks, separate Gatehouse wall Gear, repair countdown/window | `normalizeCombatFortificationSnapshot` and the existing wall section in `showScoutReportModal` |
| Eight recorded skill levels/percentages and base attack | `scoutSkillRow` and the two existing scout skill groups |
| Camp fixed troop power and no wall/skill layer | Existing `rewardCampTarget` presentation branches |
| “You were scouted,” source route, exact timestamp, disclosed fields, and missing disclosure | `renderDefenderScoutReportDetail`, `normalizeDefenderScoutDisclosure`, `getBattleReportExactTime` |
| Failed/blocked/replaced/expired explanation and hidden-information boundary | `renderScoutAttemptReportDetail`, `showBattleReportDetail`, current scout availability/expiry checks |
| Report navigation and map actions | `battleReportBackBtn`, `renderBattleReportLocateButton`, existing jump handlers |

## Review and integration boundary

All names, heraldry, numbers, dates, modifiers, and timers are fixed illustrative examples. Values are supplied for presentation; the draft does not resolve battles or reproduce backend balance. Small arithmetic only formats supplied breakdowns. Sample flags are illustrative, and future integration must render the saved game flags and existing player links.

The 14 examples cover a successful city scout, reinforcements, damaged walls, imminent expiry, camp intelligence, city and camp disclosure, unavailable disclosure, blocked/failed/expired/replaced intelligence, older snapshot fields, and long names/large values.

The draft makes no game/backend imports, service calls, writes to storage, or player actions. It reuses the existing Reports draft shell and shipped SVG art. No production entry point imports these files. Navigation/profile actions announce their intended destinations in the review footer; section scrolling, sample selection, viewport controls, Close, Escape, and Reopen work locally.

Integration uses the existing snapshot preparation, exact report summary/outcome helpers, availability and ownership checks, active-realm scoping, read marking, saved flags, player links, and timer updates. The overview and wall-section repair labels stay synchronized. Expired successful intelligence returns to Reports through the existing lifecycle. Opening a Scout Report clears the previous battle-detail request identity so a late battle response cannot overwrite it. Existing contextual onboarding remains supported. No attack/rally/paid-scout action is added.

Historical missing power values are labeled “Not recorded”; a recorded zero stays zero. Troop/power figures are displayed in full instead of abbreviated K/M values. Scout fortification snapshots supply wall totals and modifier percentages, so production displays the recorded Stoneworks/Gear percentages rather than reconstructing power contributions that are absent from the snapshot.

For the actual game with local mock services, run `node tools/prepare-scout-report-preview.js` and open the printed URL. Its 16 synthetic examples exercise the real entry points, flags, scroll controls, and lifecycle; it is excluded from production. See `visual-checks.md` for local review evidence. Release checks and deployment evidence are recorded under the ignored `release-artifacts/scout-reports/` directory.
