# Reinforcements draft verification

September 15, 2026. Local design preview only, based on `190fa25d19429c81623e02a5fdbe231d0fcf4a08`.

## Layout and assets

Inspected in the Codex in-app browser using completed page loads, DOM measurements and screenshots.

| Viewport | Examples | Result |
| --- | --- | --- |
| Desktop 1440 × 900 | All ten | Window fits; no horizontal overflow; every displayed button at least 44 × 44 CSS pixels; all image resources load |
| Landscape 844 × 390 | All ten | Same checks pass; compact columns and fixed section navigation |
| Small landscape 568 × 320 | All ten | Same checks pass; return details and commands move below holding details within each scrollable row |

Examples: mixed support (7), traveling/arriving/estimated/syncing (6), stationed with allies (2), allied defenders (2), fallback (3), long names/large counts (3), many assignments (24), pending (3), retry (2), and empty (0).

Screenshots inspected desktop travel and stationed groups, landscape stationed rows, small landscape defenders, long names with full 999,999,999 and 12,500,000 counts, empty state, the final Send Home action in the long list, the confirmation, and the review shell. The fortress silhouette is tinted in the draft CSS to match the ink palette; its shared source asset is unchanged.

At 568 × 320, the list reached its maximum scroll position (3292 CSS pixels in the 24-assignment example), with the final Send Home button fully visible. Short screens intentionally scroll vertically; they do not compress touch targets below 44 pixels.

## Interactions

- Section shortcuts move to Traveling, Stationed with allies and Defending your holdings. Empty sections have disabled shortcuts.
- Cancel leaves the assignment and retry feedback intact.
- Recall disables its action while pending, clears the retry message, and changes the contributor's stationed entry into a returning march with the same troop count.
- Send Home disables its action while pending and removes the allied stationed entry after acknowledgement. It does not expose a private allied return march.
- Main City fallback confirmation includes the existing fallback wording. Long return destinations fit the confirmation at 568 × 320.
- The pending example has all three return controls disabled.
- Reset restores the selected example. Source inspection confirms generation guards invalidate old return callbacks and Reset cancels an open confirmation.
- Ruler links report the intended existing profile destination in the review status.
- Close and the empty-state Return to map close the preview; Open Kingdom Activity reopens it.
- Review viewport controls, example selector, Reset and iframe status messages work. No warning/error console entries were reported for the final review page.

The original preview used `window.confirm`, which stalled browser automation. It was replaced in this isolated draft with an accessible HTML dialog carrying the same wording; cancellation, pending feedback and both return outcomes were then verified. Production confirmation code is unchanged.

## Scope and release boundary

JavaScript syntax and staged whitespace checks pass. The branch difference contains only the seven files in this draft directory. No production code, gameplay rules, shared assets or backend data are changed.

No production test suite, emulator gate, PR preparation, merge or deployment was run. This is ready for design review, not a release-ready implementation. Integration after approval must retain the existing server return API and the stable refresh/close handling introduced in PR #304, then complete the relevant release checks.
