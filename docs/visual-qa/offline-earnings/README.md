# Welcome Back / Offline Earnings draft

Status: local approval draft on `codex/offline-earnings-draft`. No PR, merge, or deployment.

Open `index.html?viewport=landscape&sample=standard` through the existing repository preview server. Review modes: desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). Portrait is outside the agreed game scope.

## Presentation

- Parchment ledger with burgundy framing, ink headings, and muted olive city status.
- Exact Gold and troop totals preview proposed atlas-style versions of the shared pickup illustrations. The original compositions are preserved.
- Time away in the header; earnings on the left; city status on the right.
- Collect remains outside the scrolling content, with a 44px minimum landscape target.
- Five fictional examples: intact kingdom, lost cities, long lists / large earnings, losses without earnings, and the existing inactivity notice.
- City names expand within the right ledger; totals beyond available names are explicitly retained.
- Preview imports no game code and makes no game API or storage writes. Collect only dismisses a fixture.

## Correctness work included

The existing `mergeOfflineRewardsSummaries` in `game.js` combined distinct names but added their counts. Repeating one named city in two queued summaries therefore displayed one name with a count of two.

The scoped fix counts the union of known cities using region plus ID, then preserves each summary's unlisted count. Production amounts and elapsed intervals still add exactly as before. No server economy, ownership, production, balance, or inactivity rule changed.

`tools/validate-welcome-back-summary.js` now executes the real server summary builders, client display gate, queued-summary merger, and collection callable with isolated fixtures. See `verification.md` for evidence and limits.

## Integration after approval

The new visuals are not yet wired into the runtime modal. Apply the approved markup and styles to `showOfflineRewardsModal`, retaining the existing production payload, login presentation queue, inactivity notice, Collect animation anchors, and reward sequencing. Include normal asset versioning / packaging and required PR validation at that stage.

The Hero Level-Up draft remains saved separately on `codex/hero-level-up-rewards-draft`.

## Shared pickup artwork revision

The user requested restyled Gold and troop images and a shared rollout after approval. See [the comparison](art-review.html) and [saved assets, prompts, and rollout audit](art-notes.md). The artwork is approved and its shared production references are integrated locally. The Welcome Back layout remains a draft. The shared art update still requires PR gates and separate merge/deployment authorization.
