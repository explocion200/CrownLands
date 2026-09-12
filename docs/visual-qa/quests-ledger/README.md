# Quests approval draft

Prepared 2026-09-12 on `codex/quests-ledger-draft`, based on main `57fbf8b6f209ce438ec66910ed3e1b27c9d23fbd`.

Open `/docs/visual-qa/quests-ledger/index.html?viewport=landscape` on the existing local preview server. `index.html` contains review controls; `preview.html` is the isolated game-window design.

## Scope

This is a design for approval, with local simulated actions. It changes no production renderer, stylesheet, backend, reward rules, or player data. Daily Login and Achievements navigation buttons explain their destinations in the review status rather than opening those panels. View on map also reports its intended destination without connecting to the game.

- Parchment ledger with the three daily quests on the left and selected details on the right.
- Fixed Claim/Replace area; full objective, difficulty, progress, assigned reward, and suggested target details remain available.
- Desktop 1440 × 900, mobile landscape 844 × 390, and small landscape 568 × 320. No portrait design.
- Window dimensions follow Daily Login: maximum 1200 × 790 with at least 12px screen margins.
- Reuses approved City Details engravings, Shop item illustrations, gold/troop art, and `assets/icons/common-gear-chest-r1.svg`.
- Simulates progress, claiming, collection, one daily replacement with confirmation, loading/retry, a new UTC day, and a failed claim with retry.

## Behavior and source evidence

The Daily Missions section of `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md` defines the existing three-quest system, UTC refresh, one unfinished quest replacement per day, fixed assignment-time rewards, manual claims, and the intended chest milestone. Quest titles, descriptions, targets, difficulties, rewards, and eligible replacement examples are generated directly by `functions/dailyMissions.js`.

Run `node docs/visual-qa/quests-ledger/capture-samples.cjs` to regenerate the deterministic synthetic fixtures and copied approved icon paths. Standard, item, and large-production fixtures use the actual generator. Only their progress/claimed states are adjusted locally to demonstrate the review scenarios. The sample region label, city names, clock, and target recommendation are illustrative and are not live player data.

### Existing chest award discrepancy

The specification calls for one Common Gear Box after all three quest rewards have been claimed. Inspection of `claimDailyMissionReward` in `functions/index.js` found ordinary mission payouts and claimed-count updates, but no daily-completion Common Gear Box award. The current renderer in `game.js` also has no corresponding completion-chest strip.

The draft shows the specified milestone: progress follows **claimed rewards**, and the third claim simulates one chest added to the Bag. The wrapper explicitly identifies this as an intended-behavior preview. It is not evidence that production awards a chest.

Before integration, resolve this gap against the authoritative specification. If implementing the specified award, include an atomic, retry-safe, once-per-daily-cycle grant in the final claim flow, server status/receipt support, and focused backend coverage for concurrent/retried final claims. Also verify the existing gear-box inventory grant helper and cycle/reset behavior rather than inventing a second inventory path. Do not ship a UI that promises an award the server does not grant. No specification change or backend fix is included in this draft.

## Reviewing

Select an example in the outer toolbar. Click a quest or the chest strip to inspect details. Use Claim or Replace inside the window; the outer Complete selected quest button simulates gameplay progress. Try a failed claim demonstrates an error and retry without incrementing claimed rewards. Final reward & chest starts with two rewards already collected.

Claim and replacement actions do not persist beyond this page. The clock is a fixed review value; New UTC day demonstrates the expired-state presentation. Arrow Up/Down and Home/End select quests. Escape dismisses the active dialog, and closing the main panel offers Reopen Quests.

See `visual-checks.md` for the focused checks performed. Design approval and production integration are still pending; no PR, merge, or deployment is part of this draft.
