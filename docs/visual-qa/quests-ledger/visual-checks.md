# Focused draft checks — 2026-09-12

Checked in the Codex in-app browser against the local review server. These are checks of the isolated simulation, not production multiplayer validation.

| Screen | Window | Main action | Quest list |
| --- | --- | --- | --- |
| Desktop 1440 × 900 | 1200 × 790, centered | 48px high, inside fixed footer | Three cards visible; 438px content/viewport, no list scroll |
| Mobile landscape 844 × 390 | 820 × 366, 12px margins | 44px high, inside fixed footer | Three cards visible; 182px content/viewport, no list scroll |
| Small landscape 568 × 320 | 544 × 296, 12px margins | 44px high, inside fixed footer | Three cards visible; 153px content/viewport, no list scroll |

The right detail area can scroll for long content and target recommendations. Claim/Replace stays outside that scroll region and visible. Full objectives remain in the detail area when compact quest rows omit the repeated description.

## Passed

- Visually inspected desktop and both landscape layouts; corrected wrapping reward values and a small list overflow found on the first pass.
- Source-generated large-production sample fits 24,000,000 Gold and 32,160,000 / 48,000,000 progress without horizontal card/detail overflow on the smallest landscape size.
- Updated War Drums artwork loads in the item reward sample; gold, troops, chest, and header illustrations load successfully.
- Keep quest preserves progress and the daily replacement. Confirmed replacement changes only the selected mission, removes old progress, and disables further replacements for the day.
- Completing the selected quest enables Claim. Successful claim changes it to Collected with a disabled action.
- Final claim changes the simulated chest milestone from 2/3 to 3/3, showing one Common Gear Box earned. Repeated claims are unavailable. Chest detail shows three collected duties and a disabled Chest added to Bag state.
- Failed claim leaves collection/chest progress unchanged; retry succeeds with one increment.
- Loading, reconnecting, and new UTC day states disable quest actions. Retry/Load today's quests restores the review missions.
- Keyboard Arrow Down selects the next quest and updates its detail panel.
- Target detail includes city, sample region, source city, suggested troops, estimated losses, and a battle-forecast reminder. View on map reports its intended destination in the review status.
- Close and Reopen preserve the local review state.
- Small-landscape collected chest state fits its 44px strip without overflow.
- No browser warning/error logs during the exercised scenarios.
- Node syntax checks passed for `preview.js`, `review.js`, and `capture-samples.cjs`.
- Source-fixture audit passed: three distinct missions, no more than one military mission, positive fixed rewards, eligible zero-progress replacements, and existing artwork paths.

## Boundaries

No Firebase calls, production claims, live inventory grants, or emulator suites were run for this isolated draft. The following integration checks supersede the initial chest-audit limitation. Production integration must validate real claim/reroll/status responses, day rollover, duplicate requests, and the intended chest grant before release. No portrait view was created or reviewed.

## Reward navigation icon revision

- Replaced the three older header illustrations with a matched calendar/sun seal, scroll/quill/wax seal, and crowned shield/laurel set. Added enlarged and active-tab samples below the preview for approval.
- All three new SVG files parse successfully and use a 64 × 64 view box with transparent backgrounds.
- Verified all three header assets load at 1440 × 900, 844 × 390, and 568 × 320. Buttons remain 44 × 44 with Daily Login, Daily Quests, and Achievements accessible labels.
- Visually inspected the icons on parchment and on the burgundy active state. The small landscape header remains within the window.
- The integrated shared reward navigation also uses these assets; channel deployment is verified separately.

## Approved production integration checks

- Actual `game.js` and `quests-ui.js` ran in the isolated mock-Firebase benchmark, rather than the standalone draft renderer.
- Desktop 1440 × 900, landscape 844 × 390, and small landscape 568 × 320 matched the window dimensions above. All three mission rows remained visible without list scrolling. Claim/Replace remained 48px/44px/44px high, within the window. No horizontal panel overflow or broken icons.
- Actual claim wiring changed a completed quest to Collected. Replacement cancel kept the mission; confirmation replaced the selected mission and consumed the one daily replacement.
- Daily Login and Achievements tabs opened correctly; returning to Quests restored three rows and functioning controls.
- Failed final claim preserved 2/3 rewards collected; retry succeeded and displayed one earned chest at 3/3.
- Focused `emulator-daily-missions.js` passed: no chest on objective completion/first claim; concurrent final claims grant exactly one; retries and a saved legacy award marker do not grant a duplicate; expired cycles reject claims. Existing private-state, mission-generation, reroll, event-progress and migration checks also passed.
- Focused ESLint and Daily Missions static validation passed. Full release checks are recorded in PR/release evidence.
