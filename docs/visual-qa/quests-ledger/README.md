# Quests approval draft

**Approved for implementation, push, merge, and deployment.** Prepared 2026-09-12 on `codex/quests-ledger-draft`, based on main `57fbf8b6f209ce438ec66910ed3e1b27c9d23fbd`.

Open `/docs/visual-qa/quests-ledger/index.html?viewport=landscape` on the existing local preview server. `index.html` contains review controls; `preview.html` is the isolated game-window design.

## Scope

The design page uses local simulated actions. The approved production integration now lives in `quests-ui.js` and `quests-ui.css`, mounted by `game.js` with authoritative mission status and the existing claim/reroll APIs. Daily Login and Achievements navigation buttons explain their destinations in the review status rather than opening those panels. View on map also reports its intended destination without connecting to the game.

- Parchment ledger with the three daily quests on the left and selected details on the right.
- Fixed Claim/Replace area; full objective, difficulty, progress, assigned reward, and suggested target details remain available.
- Desktop 1440 × 900, mobile landscape 844 × 390, and small landscape 568 × 320. No portrait design.
- Window dimensions follow Daily Login: maximum 1200 × 790 with at least 12px screen margins.
- Reuses approved City Details engravings, Shop item illustrations, gold/troop art, and `assets/icons/common-gear-chest-r1.svg`.
- Recreates the three reward navigation icons as matching SVG illustrations: `reward-daily-login-r1.svg` (parchment calendar and sun seal), `reward-daily-quests-r1.svg` (scroll, quill, and wax seal), and `reward-achievements-r1.svg` (crowned shield and laurels). Files live in `assets/icons/` and the shared production reward navigation now uses them across Daily Login, Quests, and Achievements. The review page also shows enlarged artwork and active-tab samples below the window.
- Simulates progress, claiming, collection, one daily replacement with confirmation, loading/retry, a new UTC day, and a failed claim with retry.

## Behavior and source evidence

The Daily Missions section of `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md` defines the existing three-quest system, UTC refresh, one unfinished quest replacement per day, fixed assignment-time rewards, manual claims, and the intended chest milestone. Quest titles, descriptions, targets, difficulties, rewards, and eligible replacement examples are generated directly by `functions/dailyMissions.js`.

Run `node docs/visual-qa/quests-ledger/capture-samples.cjs` to regenerate the deterministic synthetic fixtures and copied approved icon paths. Standard, item, and large-production fixtures use the actual generator. Only their progress/claimed states are adjusted locally to demonstrate the review scenarios. The sample region label, city names, clock, and target recommendation are illustrative and are not live player data.

### Completion chest integration

The initial draft audit found no grant in the claim handler. Integration traced the existing grant to `processDailyMissionEvent`: it awarded the chest when all objectives completed, before their rewards were claimed. This corrects the earlier description of a missing award.

The approved behavior now grants one Common Gear Box atomically with the final reward claim in `claimDailyMissionReward`. It uses the existing `normalizeCommonGear` / `writePreparedEconomy` path. The same transaction writes the mission claim receipt, the gear inventory, and `allCompletedGearBoxAwardedAtMs`. Concurrent and repeated claims cannot grant another chest. An existing marker from the old completion-time award is preserved, including on cycles whose rewards have not yet been claimed. Achievement progress continues to be credited at objective completion.

Deploy the claim handler first, then the event handler and `getRealmInfo`, before publishing the new client. During the transition the legacy marker protects earlier awards. No production data migration or retroactive historical awards are included.

### Runtime behavior

The integrated view accepts normalized server mission state; it does not load any review fixtures. Selections and detail scroll survive status updates. All actions disable while a claim/replacement is pending. A new session or cycle invalidates stale actions; the UTC countdown disables expired actions. The replacement confirmation retains the ledger behind it and preserves progress when canceled. Other reward panels retain their existing presentation aside from the three approved navigation illustrations.

`node tools/prepare-quests-preview.js` prepares an isolated actual-game benchmark page using `runtime-fixture.js`. It connects only to the existing mock Firebase adapter, never production player data.

## Reviewing

Select an example in the outer toolbar. Click a quest or the chest strip to inspect details. Use Claim or Replace inside the window; the outer Complete selected quest button simulates gameplay progress. Try a failed claim demonstrates an error and retry without incrementing claimed rewards. Final reward & chest starts with two rewards already collected.

Claim and replacement actions do not persist beyond this page. The clock is a fixed review value; New UTC day demonstrates the expired-state presentation. Arrow Up/Down and Home/End select quests. Escape dismisses the active dialog, and closing the main panel offers Reopen Quests.

See `visual-checks.md` for the focused checks performed. Design approval is complete. Release gates, pull-request status, and verified channel deployment are recorded separately in release evidence; the review page itself is not proof of deployment.
