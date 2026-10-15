# Reward windows and leaderboard artwork — October 14, 2026

[PR #573](https://github.com/explocion200/CrownLands/pull/573), from `codex/rewards-leaderboard-artwork-current`, is **LIVE — WEB** at [the canonical game entry](https://playcrownlands.com/play/). Leaderboards and Daily Login show their corresponding illustrated HUD image beside the title. Daily Login uses that same image in its navigation tab; Quests and Achievements use matching scroll/quill and crowned-shield illustrations in their tabs and headers.

Daily Login, Quests and Achievements share the same outer frame, panel, header, navigation and boxed-X positions when switching tabs. Content scrolls within the frame. Shared styles remove the unused scrollbar gutter and duplicated frame rules. The compact leaderboard header and first-place flag fit short landscape screens. Reward amounts, claims, progression, leaderboard rankings and saved heraldry are unchanged.

This release carries the complete feature from [PR #570](https://github.com/explocion200/CrownLands/pull/570) onto current main without rewriting its published branch. PR #570 was closed as superseded after #573 merged; its original branch is retained. The report/action artwork released in #571 is preserved.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `2ce492c5cab315ba308cd55cee4e688709eaf612` |
| Netlify deployment | `6ad023011d5f39c5a604d4a8` |
| Published | October 14, 8:52 p.m. Eastern (`2026-10-15T00:52:11.978Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `ed1b97f1e81636b19dc9525431d0a2250e2dda28b89d909889386ca233557449` |
| Prior published web build | `1565e3013b060f9860ad5c524ab42eef07e96842` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `6295e29a54391b352032e2d2b4d7ba5c0be078ad` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38658782224](https://github.com/explocion200/CrownLands/actions/runs/38658782224). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed eight selected validators: reward-window layouts, leaderboard podiums, Daily Login, seasonal achievements, achievement scrolling/rewards, Kingdom ledgers, asset budgets and report artwork. Syntax, lint, runtime-data consistency and production packaging passed. The report artwork suite retained all 36 desktop/mobile/fullscreen views after integration with current main.
- The two new transparent 384×384 WebP illustrations total 74,954 bytes and load on demand. [Artwork provenance](art-sources/reward-navigation/README.md) records the prompts and asset hashes. Aggregate installation-cache and combined-ledger limits are unchanged.
- Twenty-four local, twenty-four staged and twenty-four public-asset layouts passed: all three reward tabs and Leaderboards at 1440×900, 844×390 and 568×320, in and out of fullscreen. Checks cover matching decoded artwork, stable tab geometry, title and X alignment, scroll reachability, keyboard navigation and native mouse/touch dismissal. No uncaught runtime exceptions occurred.
- The merged Git tree exactly matched the validated feature tree. Rebuilding with Netlify's full commit identifier passed artifact validation and asset budgets: 1,169 files including the inventory and 179 resources per entry. All 1,168 staged inventory entries and 19 selected staged files matched.
- All 57 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`, covering the changed window files, shared styles, release/entry files, new reward illustrations and reused HUD artwork. The canonical `/play/` entry and manifest identify the merged build. Six anonymous public startup/reload cases passed at the three sizes without uncaught runtime exceptions.
- Release ID, API contract and server source fingerprint match the previous published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed. Local `main` was clean and equal to `origin/main`, with divergence `0 0`, before publication.

## Limits and evidence

Window checks use isolated synthetic fixtures with delivered assets, not a signed-in production account. The isolated harness includes its existing Daily Login sample JSON; that review data is excluded from the published build. Public startup checks bypass the service worker. Physical-device review, authenticated gameplay and installed-app cache recovery remain manual checks.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, exact-file comparisons, measured window geometry and screenshots are retained under ignored `release-artifacts/reward-window-layout/deployment/`.
