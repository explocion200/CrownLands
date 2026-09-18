# Welcome Back verification

Date: 2026-09-17. Baseline: `309a2ad11d710163f32d45e965ad0cf336b00485`.

## Evidence from current implementation

- `functions/index.js:createWelcomeBackSession` derives time away from the prior membership heartbeat, requires a new browser session and at least 60 seconds, and preserves an existing session receipt.
- `prepareEconomyCollection`, `addPendingAwayProduction`, and `getIntegerProductionGain` account for production against server checkpoints and integer balance changes.
- `consumePendingAwayCityTroops` reduces pending troops after defensive losses and removes captured-city pending troops.
- `createWelcomeBackSummary` reports recorded Gold and surviving away-produced troops in currently owned cities, bounded by their garrisons.
- `createWelcomeBackLostCityList` reads captured-city history, deduplicates by region/ID, and excludes cities currently owned again. Inactivity surrender is a separate notice.
- `normalizeWelcomeBackSummary` retains the total when names are limited to 50.
- `collectEconomy` stores the receipt with consumed eligibility, clears pending production, and returns the stored receipt on retry for the matching session.
- `game.js:applyServerEconomyResult` uses that receipt, requires the display permission / minimum duration, and can show losses with zero earnings.
- Collect in the current runtime closes the receipt and launches feedback animations; production has already been credited.

These are repository implementation facts, not a new balance specification or proof of deployed backend parity. The Master Specification's unresolved offline-production policy was not changed.

## Bug reproduced and fixed

A regression test against the original queued-summary merger failed: repeating Ashford in the same region yielded a city count of 2 with one named row. After the scoped `game.js` fix, it yields 1. Identical local IDs on different maps remain distinct. Missing-name counts are preserved, as are summed Gold, troop totals, and elapsed time.

A server response does not include identities beyond its name limit, so overlap among unlisted cities cannot be resolved locally. This fix removes identifiable duplicates without inventing missing names or changing the server contract.

## Focused checks passed

- `node --check game.js`
- `node --check docs/visual-qa/offline-earnings/review.js`
- `node --check docs/visual-qa/offline-earnings/preview.js`
- `node tools/validate-welcome-back-summary.js`: session threshold, fractional production carry, retained totals, surviving / lost-city troops, defensive casualties, captured / retaken cities, cross-map identity, 50-name truncation, zero-earnings losses, display gates, queued loss deduplication, and stored-receipt retries.
- `node tools/validate-foreground-resume.js`: coalesced resume, timeout/retry recovery, authoritative catch-up, and deferred summaries.
- `node tools/validate-login-realm-sequence.js`: Daily Login, Welcome Back, realm catch-up, and Citadel priority.
- `node tools/validate-economy-balance.js`
- `node tools/validate-inactive-player-lifecycle.js`
- `git diff --check`

The callable tests use an in-memory transaction boundary and the real callable body; they do not test Firestore concurrency. No production player data was read or changed. No emulator suite or release gates have been run for this unapproved presentation draft.

## Browser review

- Desktop 1440 × 900: 900 × 576 modal, both columns visible.
- Landscape 844 × 390: 828 × 374 modal; earnings and ordinary two-city loss ledger fit without scrolling. Collect is 44px high and wholly visible.
- Small landscape 568 × 320: 552 × 304 modal; Gold +23,497,686,072 and troops +12,564,390 fit without horizontal overflow.
- Long city names wrap. Many-city content scrolls inside the city ledger; Show all exposes all 12 supplied names, preserves the two-name-unavailable notice, and can collapse again.
- The expanded example can be collected and replayed; dismissing it does not modify game rewards.
- Zero Gold / troops still displays the lost-city count and an enabled Collect.
- The inactivity example fits on the smallest landscape size and does not display a contradictory all-safe notice.
- Both current pickup images load successfully.

## Remaining release work

Design approval, production UI integration, required PR checks, and emulator / live-channel verification are still pending. Nothing from this branch is described as live.
