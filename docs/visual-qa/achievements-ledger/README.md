# Achievements ledger — approval draft

Status: approved for implementation, merge, and deployment. The isolated review remains available; production integration now lives in `achievements-ui.js` and `achievements-ui.css`, mounted by `game.js` using the existing authoritative achievement state and claim handler.

Open `/docs/visual-qa/achievements-ledger/index.html?viewport=landscape` on the repository preview server. Desktop, Mobile landscape, and Small landscape controls render 1440×900, 844×390, and 568×320 game viewports. The wrapper may scale the preview to fit the browser. There is no portrait design.

## Proposed presentation

- Parchment window matching the approved Daily Login and Quests panels.
- Eight category badges in the existing olive, brass, ink, and burgundy palette.
- Compact achievement rows with claimable rewards first, progress, difficulty, objective, and reward.
- Selected requirements and reward in the right pane, with a fixed Claim button. List and details scroll independently.
- Existing reward-panel navigation icons and current gold, troops, Swift March Order, Recall Horn, and Royal Peace Shield artwork.
- Explicit seasonal expiry wording and completion-locked production reward amounts.

All 40 achievements, eight categories, targets, descriptions, reward specifications, and requirement notes come from current game sources. This update adds no achievements, rewards, permanent honors, or progression rules. The approved presentation is recorded in the Master Specification.

## Review controls

Use category and status filters, select a row, and try Claim. All claims are local simulations. Reset example restores the sample. Arrow keys and Home/End navigate the list. Close and Reopen exercise dialog presentation.

Examples cover mixed progress, an earned item, continuous Crown reign, large reward values, a fresh season, all rewards collected, loading, reconnecting, and an ended season. Try a failed claim preserves the reward and allows retry. Load new season resets only synthetic review data.

## Source and scope

`capture-samples.cjs` uses `functions/seasonalAchievements.js` to construct synthetic examples and reads current requirement notes and item metadata from `game.js`. Regenerate with `node docs/visual-qa/achievements-ledger/capture-samples.cjs` from the repository root. The fixture records source revision `bed364debc710d8323a65d386bc65233f663d6ba` and uses a fixed review clock of September 13, 2026, 12:00 UTC.

The production component receives normalized server status, category labels, requirement notes, current item metadata, and the existing claim/retry callbacks. It never loads review fixtures or writes progress. It retains the selected row and independent scroll positions on status updates, resets its selection when session/season scope changes, and disables claims during a pending action or after expiry. Shared reward tabs and the existing close control stay connected. Closing or leaving the panel disposes its countdown and event handlers.

The existing claim handler, APIs, backend achievement definitions, reward formulas, realm configuration, and season reset rules are unchanged. Client packaging and manifest inputs include the new component and stylesheet. No backend deployment or production-data migration is required for this presentation update.

Run `node tools/prepare-achievements-preview.js` to prepare an actual-game page on the local benchmark server. `runtime-fixture.js` uses its mock Firebase adapter, synthetic state, and synthetic claim receipts. It exercises the real renderer and action wiring without touching production player data. Query options include `?fail=1`, `?sample=item`, and `?sample=expired`.

Required merge checks and verified deployment evidence are recorded separately; design approval and a merged pull request alone do not prove a live release.

See [visual-checks.md](visual-checks.md) for completed draft checks and remaining integration work.
