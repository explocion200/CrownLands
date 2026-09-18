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

## Revision 2 — compact rows and device-language translation

Requested September 17, 2026. Production runtime remains unchanged.

| Screen | History, before → after | Composer, before → after | Result |
| --- | --- | --- | --- |
| 1440 × 900 | 419 → 531 px | 130 → 93 px | Passed |
| 844 × 390 | 133 → 148 px | 87 → 83 px | Passed |
| 568 × 320 | 72 → 78 px | 85 → 83 px | Passed |

- All three dialogs keep their prior dimensions. Compact message columns also reduce each short desktop entry from two lines to one row. History has no horizontal overflow; the composer and translation control remain inside the window.
- Device default detected English. Six foreign-language samples displayed their prepared English equivalents after Translate, and Show originals restored every original string exactly.
- A newly added Spanish sample translated while the toggle was enabled; toggling off restored its Spanish original. Translation applies to display text, not stored fixture messages or the outgoing composer.
- Arabic review mode was visually inspected at 568 × 320. Text directions adapt inside the message column while names and times keep their positions.
- Focused Node checks passed for preferred-locale selection, regional tags, invalid-tag fallback, 36 prepared phrase/target combinations, unsupported-target fallback, and preserving arbitrary text without a false translated label.
- Syntax checks passed for all three preview JavaScript files. Whitespace check passed.

The translation button demonstrates the requested interaction with a local phrase table. This does not prove live translation for arbitrary player text; a production translation service, supported-language handling, error states, access controls, and cost/rate limits must be implemented and verified before release.


## Revision 3 — asynchronous translation behavior and unread navigation

- Added a shared translation coordinator and optional production-controller integration. The approval draft supplies a local fixture adapter; production entry/build files do not enable translation yet.
- Translation preference survives reload/reset and applies to Global, Clan, incoming samples, and the compact preview. Preview preference storage is separate from production. Only on/off is persisted; source/translated messages stay in memory.
- Loading leaves the original readable. Failure and timeout keep originals and offer Retry; unchanged refreshes do not repeatedly retry a failing service.
- Fixed the existing New messages button being hidden on unrelated rerenders. Incoming messages and asynchronous translations preserved the first visible message and scroll position. The button remained visible after translation finished and jumped to the latest messages when clicked.
- Verified 844 × 390 landscape and 568 × 320 small landscape loading/failure layouts. Retry and composer remained accessible. Clan without membership disabled translation and sending. The previously saved preference returned after reload, and compact Clan Chat displayed translated sample text.
- `node tools/validate-chat-translation.js` passed: locale selection (including Chinese script/region), account-scoped preference, untouched originals, ID-only request payload, cache reuse, stale account/language response rejection, channel/source isolation, failure/retry, incoming messages, 20-message batching, inactive-chat suppression, and timeout.
- Existing `node tools/validate-chat.js`, JavaScript syntax checks, and `git diff --check` passed. A browser-discovered anchor-lookup initialization error was corrected and the affected flow rechecked.

### Remaining dependency

The user was asked to choose whether to prepare Google Cloud Translation on the existing backend because it introduces external message processing and usage charges. No answer was received during this revision. No paid service was enabled, no messages were sent externally, and no backend, production HTML, build configuration, or deployment was changed. The live callable, authoritative message access checks, provider integration, rate/cost limits, and real-provider verification remain pending. The draft must not be described as live or ready to merge until that work and the required release checks are complete.
