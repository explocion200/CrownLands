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

No Firebase calls, production claims, live inventory grants, or emulator suites were run for this isolated draft. The daily chest server award remains the documented pre-integration issue. Production integration must validate real claim/reroll/status responses, day rollover, duplicate requests, and the intended chest grant before release. No portrait view was created or reviewed.
