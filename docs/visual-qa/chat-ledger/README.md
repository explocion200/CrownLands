# Realm Chat ledger — approval draft

Development-only presentation draft for Global and Clan Chat. Nothing in this directory is linked from the live game entry or included in the production artifact. No production chat, server, account, or membership writes occur.

Open `index.html?viewport=desktop` or choose Mobile landscape (844 × 390) / Small landscape (568 × 320). Desktop uses the shared 1040 × 790 maximum window. Mobile uses the available landscape screen with fixed navigation and composer, and independently scrolling history.

## Scope

- Parchment reading area, olive channel selection, burgundy Send button, manuscript correspondence emblem.
- Compact sender/message/time columns on desktop and landscape phones. Your messages have a subtle olive edge. The second revision reduces header, row, and composer spacing while retaining the window dimensions.
- Global / Clan tabs, unread indicators, older history, new-message jump, close, minimize, and compact map preview.
- Local examples for long conversations, no messages, no clan, reconnecting, failed sending, and map movement controls.
- Real `chat-ui.js` controller with a local fixture API. Synthetic messages only. The fixture uses its own preview unread-storage namespace.
- Current 250-character limit, three-second send cooldown, Global 24-hour retention, Clan membership restriction, and compact-preview collision logic retained.
- Preview adds standard arrow-key navigation between tabs; runtime integration remains subject to design approval.
- Translate beside the channel tabs chooses the browser-reported preferred language automatically. While enabled, prepared examples in the selected channel and compact preview use that target; Show originals restores the untouched source messages.
- Translation is a clearly labeled local demonstration with English, Spanish, French, German, Portuguese, and Arabic phrase fixtures. It is not machine translation. Unrecognized text is left unchanged and is never marked translated. No provider, model download, API billing, or external message transfer is used.

## Review

1. Switch Global / Clan; send a local sample and observe the cooldown.
2. Scroll above the latest messages, then use Incoming message in the review controls. Check reading position and New messages.
3. Load earlier messages and open a sender link (local acknowledgement only).
4. Minimize, reopen, and close. Try Movement alerts at all three sizes. Compact preview uses the existing 160px minimum readable width and hides when the map controls leave insufficient space.
5. Inspect empty, no-clan, reconnecting, send-failure, and long-message examples. Failed sends must retain the draft text.
6. Choose Multilingual conversation, then Translate inside chat. Add an incoming sample, switch channels, minimize, and restore the originals. Preview language is a review-only override for checking other language lengths and right-to-left text; normal use selects Device default.

This is a draft for visual approval. It does not establish a deployed UI or alter the Master Specification. Remaining validation and review findings belong in `visual-checks.md`.

Language detection uses the most preferred valid language from [`navigator.languages`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages), with `navigator.language` and English as fallbacks. This is the language reported by the browser, which can differ from an independently configured operating-system language. The live translation service and its integration remain pending.
