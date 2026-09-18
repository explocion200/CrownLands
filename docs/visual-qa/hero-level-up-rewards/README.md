# Hero Level-Up rewards — approval draft

Status: **DRAFT — awaiting visual approval**. No production entry, reward calculation, server action, or release configuration is changed.

Branch: `codex/hero-level-up-rewards-draft`, created through `pnpm run start-feature` from synchronized `origin/main` at `309a2ad11d710163f32d45e965ad0cf336b00485`. The unfinished Chat update remains committed separately on `codex/chat-ledger-draft`.

## Review

Open `/docs/visual-qa/hero-level-up-rewards/index.html?viewport=desktop&sample=standard` on the local preview server.

- Desktop: 1440 × 900, centered 890 × 614 window.
- Mobile landscape: 844 × 390, 828 × 374 window.
- Small landscape: 568 × 320, 552 × 304 window.
- Examples: one level, multiple levels, large amounts/long city name, first level-up with a missing city name, and two receipts with different troop destinations.

The crowned cloth banner displays the new Hero level and the from/to advancement. A parchment ledger shows exact skill point, Gold, and troop totals using the existing achievement seal and current pickup artwork. Troop destination appears once below the rewards. Collect Rewards stays in a fixed footer, with a 44px minimum mobile target. The reward ledger supports scrolling for exceptional content; all supplied receipts fit the three target sizes without horizontal overflow.

The crown is a lightweight, native SVG UI ornament in this draft. It follows the muted gold, ink outlines, olive and burgundy palette and introduces no image service or new production asset.

## Current implementation contract

Inspected `game.js` functions `normalizeLevelUpRewardReceipt`, `renderLevelUpReward`, `queueLevelUpReward`, and `mergeLevelUpRewardBundles`, plus the `levelUpRewardModal` and Collect Rewards handlers in `index.html` / `game.js`.

- Runtime fields: `fromLevel`, `toLevel`, `levelsGained`, `skillPoints`, `gold`, `troops`, `cityId`, `cityName`, and optional `regionId`.
- Actual online amounts must come from the authoritative receipt. No draft values or duplicate balance formulas should enter the game integration.
- Preserve single/multiple-level titles, exact amounts, zero values where supplied, and the Main City name fallback.
- Preserve existing queue/merge destination checks. The two-destination example displays separate receipts; it does not implement or change the queue algorithm.
- The current modal does not dismiss on Escape or backdrop clicks. The draft follows that behavior and retains Collect Rewards as its single dismissal action.
- Runtime Collect Rewards uses the Gold/troop icon anchors for the existing reward presentation. The draft retains `.level-up-reward-item.gold`, `.level-up-reward-item.troops`, and `.level-up-reward-icon` hooks. Existing animations/audio, motion preferences, queue scheduling, and server crediting must stay intact during future integration.

## Simulation boundary

All receipt values and city names are fictional layout fixtures, clearly disclosed in review chrome. The local Collect Rewards button only advances or dismisses a fixture; it never grants currency, troops, XP, or skill points. This page loads no Firebase client or game runtime and sends no account, membership, or gameplay requests. No balance or Master Specification change is proposed.

Validation and remaining integration work are recorded in `visual-checks.md`. Design approval does not establish merge or deployment.
