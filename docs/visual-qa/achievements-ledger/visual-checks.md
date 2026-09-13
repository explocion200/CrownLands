# Achievements draft review

Reviewed locally in the Codex browser against synthetic data. No production player data or rewards were changed.

## Layout

| Game viewport | Result |
| --- | --- |
| Desktop 1440×900 | Parchment layout and eight category badges inspected. Standard Conqueror III details and reward fit in the 448px detail area without scrolling. Claim is 44px high and inside the window. |
| Landscape 844×390 | Category selector, compact rows, current item art, and separate detail scrolling inspected. Claim stays visible at 44px high. No horizontal page overflow. |
| Small landscape 568×320 | Header, filters, large reward amounts, and fixed action inspected. Claim stays visible at 44px high. Details require contained scrolling; no horizontal page overflow. |

No broken image references were reported on the rendered draft. No browser errors or warnings were captured during these interactions.

## Data and interactions

- All 40 IDs, titles, categories, difficulties, descriptions, metrics, targets, and reward specifications match current definitions.
- Category controls expose Conquest 8, Combat 6, Camps 6, Growth 6, Strongholds 5, Crown 4, Clan 2, and Daily 3 entries.
- Requirement notes exist for every metric. All three item reward assets exist at their current paths.
- Fresh entries have zero progress. Mixed completed rewards match difficulty hours multiplied by the sample raw production at completion.
- Eight generated SVG category badges are present.
- Mixed state begins with 19 completed, 16 collected, and 3 ready. Claim failure preserves 3 ready and 16 collected; retry produces 2 ready and 17 collected. Claim is disabled during the request and after successful collection.
- Empty Ready filter offers Show all achievements. It restores the full list.
- Keyboard End reaches Dedicated Lord, the final achievement, and scrolls it fully into view.
- Master of Strongholds shows all four required types and the current Swift March Order reward. Long Reign shows its continuous-hold requirement and the reset-on-loss note.
- Loading, reconnecting, expired, fresh, all-collected, and large-value examples render. Reconnection retry restores the 40-entry list.
- An ended season says Rewards expired. Load new season produces 0/40 complete and 0 ready.
- Close and Reopen preserve the local preview and restore the dialog.
- JavaScript syntax and whitespace checks pass.

## Remaining before release

Design approval is pending. The real game still uses its existing Achievements implementation. Backend claims, live season transitions, real account navigation, production integration, and required release/PR checks have not been exercised by this design-only preview. This branch is not release-ready and has not been merged or deployed.
