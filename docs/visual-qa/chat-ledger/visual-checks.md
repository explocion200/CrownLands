# Chat ledger draft checks

Reviewed September 17, 2026 on `codex/chat-ledger-draft`, based on production source `309a2ad11`.

## Presentation

| Screen | Dialog | History height | Send | Result |
| --- | --- | --- | --- | --- |
| Desktop 1440 × 900 | 1040 × 790 | 419 px | 100 × 60 | Passed |
| Landscape 844 × 390 | 828 × 374 | 133 px | 88 × 44 | Passed |
| Small landscape 568 × 320 | 552 × 304 | 72 px | 88 × 44 | Passed |

- All three sizes retain a visible composer and 44 × 44 close/minimize controls. Dialog and message history have no horizontal overflow.
- Desktop uses two-line entries; landscape aligns sender, message, and time in compact columns. Long and multiline text wraps within the scrolling history.
- Global/Clan tabs, unread indicators, older history, counter, send state, and local error feedback were inspected.
- The 844px compact preview shows three messages fully inside its 64px height. Both movement controls suppress the preview when space is insufficient. The 568px view retains the existing suppression behavior; the Chat button stays available.

## Local interaction checks

- Sent a synthetic message through the production controller and local API adapter; message appeared once, text cleared, and Send (3) was disabled during the existing cooldown.
- Arrow-key channel navigation worked. An unsent draft survived switching to Clan, minimizing, and reopening.
- With history at scroll position 0, a new local incoming message retained position 0 and displayed New messages. The jump control returned to the latest entries.
- Loading older messages added eight fixture entries and removed the exhausted history control.
- Empty history remains readable; no-clan mode disables the composer and shows the membership message.
- Reconnecting retains history with a visible connection label. Simulated send failure retains the complete draft and permits retry. Even the small landscape error state retains its visible composer and a 55px history area.
- JavaScript syntax checks passed for `preview.js` and `review.js`.
- All 17 local HTML/CSS references resolve. Git whitespace check passed.

## Release boundary

This is an approval draft, not live integration. The real chat controller is loaded unchanged with fictional data; no player messages or game state were written. Production CSS, markup, chat authority, cooldown, retention, and permissions are unchanged. Backend tests are not required for this documentation-only preview. Required release gates will run when approved implementation is prepared for a pull request.

Pending: user visual approval, production integration, and integration checks for real subscriptions, profile navigation, connection transitions, and actual mobile keyboard behavior. The desktop browser's landscape frames do not simulate an on-screen phone keyboard.
