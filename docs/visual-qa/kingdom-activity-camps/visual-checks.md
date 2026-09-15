# Camps draft visual checks

Checked September 15, 2026 against base `81a35aed85301606fc4147294bef57ef0f297d9c`.

This is isolated design QA with synthetic data. No production game, backend or player account was loaded.

## Results

| Review screen | Window | Eight samples | Controls and overflow |
| --- | --- | --- | --- |
| Desktop 1440 × 900 | 1200 × 700 | Passed | All enabled controls at least 44 × 44; no horizontal overflow |
| Landscape 844 × 390 | 820 × 366 | Passed | All enabled controls at least 44 × 44; no horizontal overflow |
| Small landscape 568 × 320 | 556 × 308 | Passed | All enabled controls at least 44 × 44; no horizontal overflow |

- All 24 combinations retained their expected row counts (4 standard/contested/resolving/syncing/long, 12 many, 1 single, 0 empty). Current camp art and reward icons loaded without missing images.
- Final desktop standard: the four 103px rows fit in the 427px ledger without scrolling. Longer lists scroll inside the window.
- Landscape shows two compact rows in its 184px ledger. Small landscape moves rewards and garrisons below identity/timing; all information and Map actions remain reachable by scrolling.
- Long labels wrap; full garrisons up to 4,294,967,295 remain visible without horizontal overflow or abbreviated values.
- Contested, Resolving and Syncing examples retain distinct text. Expired draft timers remain Resolving and never simulate an awarded reward.
- Empty-state layout was refined after initial QA. Rechecked all three sizes: Return to map stays visible without scrolling; its height is 44px. Landscape empty ledger is 186px with no overflow; small landscape is 132px with no overflow.
- Scrolled all twelve camps to the final Warband Camp in Redwolf Reach on small landscape. Map showed the correct camp and map in the disclosed preview. Back to Camps restored the last Map button's focus and the list position (1264px before, 1263px after browser rounding).
- Countdown continued for at least 25 seconds without moving the restored 1263px list position or losing focus. Close/Reopen also retained the list position.
- Visual inspection: desktop full page, mobile landscape standard, and small landscape long-name examples. Browser error/warning log: empty.
- JavaScript syntax checks passed for `preview.js`, `review.js`, and `fixtures.js`.

## Review boundary

Physical-device testing and real server interaction are outside this draft. The draft does not prove production reward, ownership, map-loading or reconciliation behavior. Existing behavior must be preserved and validated during the combined Camps/Strongholds integration. Required PR/release checks are deferred until both designs are approved and that combined update is ready.
