# Local visual review

Reviewed September 28, 2026 with bundled Chromium/Playwright. All displayed identities and totals are fictional.

- Desktop: 1366 × 820.
- Landscape mobile fixture: 844 × 390, touch and mobile emulation.
- Small landscape fixture: 568 × 320, touch and mobile emulation.
- All three tabs render three podium entries and 97 rows. Visual order is second, first, third; list starts at fourth.
- 33 viewport/category/state combinations checked, including first-place standing, long labels/large totals, absent standing, only two published entries, loading, empty, failure/retry and signed out.
- No script exceptions, failed asset requests or horizontal overflow in the checked views. Local-only network interception is enabled during review.
- Find my rank scrolls to and focuses the existing entry, including a podium entry. Arrow keys/Home/End switch tabs. Escape dismisses ranking notes before the main modal. Close/reopen restores Kingdoms.
- Desktop and landscape screenshots were inspected. Compact layout keeps Find my rank accessible; the short-screen title is omitted and the podium scrolls with the list.
- The outer review page is a separate design tool. Its labels identify the sample data; it has no game/account integration.

Evidence (ignored local files): `release-artifacts/leaderboard-podium/checks.json`, `desktop-players.png`, `desktop-clans.png`, `desktop-glory.png`, and matching `landscape-*` / `small-*` screenshots.

These original review checks apply to the isolated prototype. They are not physical-device or production-load validation.

## Live game integration

The approved layout and seasonal scoring are now implemented; release verification is separate. `tools/validate-leaderboard-podium-browser.js` exercises the actual game using the repository's CDP browser harness at the same three sizes. It checks initial podium and Find my rank visibility, full scores, 100 unique entries, 2/1/3 order, all tabs, scrolling/focus, keyboard, refresh, empty/failure/retry/two-entry results and detached-modal responses. Screenshots are saved to `release-artifacts/leaderboard-live/`. The smaller layout keeps Refresh beside the tabs and reserves space for standing actions.

Pure accounting/client-loader tests and three local emulator suites passed: city combat/recovery, Clan Tower reports, and the new PvP ledger trigger/concurrency/season/rules suite. The affected CI plan additionally exercises rally/royal-holding and Camp lifecycle dependencies. No synthetic production battles, player changes or historical backfill are part of validation. Final-season archives remain planned.
