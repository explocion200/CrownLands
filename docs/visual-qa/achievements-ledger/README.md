# Achievements ledger — approval draft

Status: awaiting design approval. This is an isolated interactive preview; it does not change the production Achievements panel or contact the backend.

Open `/docs/visual-qa/achievements-ledger/index.html?viewport=landscape` on the repository preview server. Desktop, Mobile landscape, and Small landscape controls render 1440×900, 844×390, and 568×320 game viewports. The wrapper may scale the preview to fit the browser. There is no portrait design.

## Proposed presentation

- Parchment window matching the approved Daily Login and Quests panels.
- Eight category badges in the existing olive, brass, ink, and burgundy palette.
- Compact achievement rows with claimable rewards first, progress, difficulty, objective, and reward.
- Selected requirements and reward in the right pane, with a fixed Claim button. List and details scroll independently.
- Existing reward-panel navigation icons and current gold, troops, Swift March Order, Recall Horn, and Royal Peace Shield artwork.
- Explicit seasonal expiry wording and completion-locked production reward amounts.

All 40 achievements, eight categories, targets, descriptions, reward specifications, and requirement notes are copied from current game sources. The draft adds no achievements, rewards, permanent honors, or progression rules. The Master Specification remains unchanged pending approval of the presentation.

## Review controls

Use category and status filters, select a row, and try Claim. All claims are local simulations. Reset example restores the sample. Arrow keys and Home/End navigate the list. Close and Reopen exercise dialog presentation.

Examples cover mixed progress, an earned item, continuous Crown reign, large reward values, a fresh season, all rewards collected, loading, reconnecting, and an ended season. Try a failed claim preserves the reward and allows retry. Load new season resets only synthetic review data.

## Source and scope

`capture-samples.cjs` uses `functions/seasonalAchievements.js` to construct synthetic examples and reads current requirement notes and item metadata from `game.js`. Regenerate with `node docs/visual-qa/achievements-ledger/capture-samples.cjs` from the repository root. The fixture records source revision `bed364debc710d8323a65d386bc65233f663d6ba` and uses a fixed review clock of September 13, 2026, 12:00 UTC.

Every file in this update is confined to this directory. Production integration, focused gameplay validation, the required PR checks, merging, and deployment belong to the approved implementation step. No PR or deployment is part of this draft.

See [visual-checks.md](visual-checks.md) for completed draft checks and remaining integration work.
