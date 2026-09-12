# Daily Login draft verification — 12 September 2026

Scope: local, synthetic approval page; no live account or backend changes.

## Layout and artwork

All five examples (Day 19 ready, Day 7 weekly chest, two pending rewards, already collected, Day 28 finale) passed in each of these viewports — **15 combinations**:

| Viewport | Modal dimensions | Visible reward tiles | Smallest visible control | Claim and complete resource/bonus bundle |
| --- | --- | --- | --- | --- |
| 1440 × 900 desktop | 1200 × 790 | 28 | 44 × 44 CSS pixels | Visible |
| 844 × 390 landscape | 820 × 366 | 7 in the selected week | 44 × 44 CSS pixels | Visible |
| 568 × 320 landscape | 544 × 296 | 7 in the selected week, with a wider Day 7 card | 44 × 44 CSS pixels | Visible |

All dialog bounds were inside the frame. Every image was decoded in the final 15-state check. No browser warning/error log entries were reported. Desktop, landscape, and the compact weekly-chest example were inspected visually. Supporting explanations may scroll in the selected detail pane; Claim and both resource/bonus rows fit above it in all tested examples.

The initial compact layout partially hid the second bundle row. Final spacing reduces the decorative header on mobile and uses a horizontal hero at 568 × 320. The complete 15-state matrix above was rerun after that repair.

## Interactive checks

- Two queued rewards, Days 6 and 7: season reset preserved Cycle 3 / Day 6, both queued days, and the same schedule. Claim stayed disabled until the sample new main city was established.
- The new sample city used its new base production (75 Gold/hour and 1,200 troops/hour). Day 6 showed 900 Gold for a 12-hour reward.
- Claiming Day 6 then Day 7 granted the two sample bundles in order, including the weekly Common Gear Box, then disabled Claim until the next eligible day.
- Claiming Day 28 in small landscape started Cycle 4 / Day 1 with a new arrangement; Claim stayed disabled on the same attendance day. “Next login day” enabled Day 1.
- ArrowRight selected Day 20 from Day 19; End selected Day 28 and Week 4; “View ready reward” returned to the actual claimable Day 19.
- Close and Reopen worked without resetting the draft state.
- A fresh example cycle had a different resource/art arrangement. A subsequent season reset kept that new arrangement unchanged.
- The standalone draft model checks passed for 200 seeds, schedule totals, all six items, fixed chest days, end-of-week increases, missed days, queue cap/deferred attendance, season and no-city behavior, duplicate same-day attempts, and full 28-day rollover.

These checks are not production persistence, migration, transactional concurrency or live-player purchase tests. Those gates belong to the later approved backend/client implementation.

## Approved chest artwork follow-up

Replaced the old raster thumbnail with `assets/icons/common-gear-chest-r1.svg`, the approved closed chest used by the Bag and Shop. Confirmed all six rendered references (four weekly tiles, selected hero, and bundle row) loaded the SVG. Visually checked the weekly-chest example at 1440 × 900, 844 × 390, and 568 × 320: images decoded, dialog stayed inside the viewport, Claim remained visible, and touch targets remained at least 44 × 44. Both reward rows remained visible on mobile landscape. JavaScript syntax and diff whitespace checks passed; reward logic was unchanged.

## Runtime integration

The actual game was reviewed in the isolated benchmark shell at desktop, 844 x 390 and 568 x 320. Weekly resource and Box rows fit above the fixed 44px Claim action. The real client claim handler sends cycle identity and ordinal, advances from Day 7 to Day 8 after its synthetic receipt, and disables the next claim until attendance is earned. Quests and Achievements open and return to Daily Login without retaining the new tab-specific window styling. All visible compact controls measured at least 44 x 44 and inside the viewport. Build the local runtime page with `node tools/prepare-daily-login-preview.js` while the preview server is running. These fixtures block production writes; emulator results cover the server transactions.
