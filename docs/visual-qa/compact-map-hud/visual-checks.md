# Focused draft checks — September 20, 2026

Runtime integration checks now pass using the actual game fixture at 1440×900, 844×390 and 568×320. The original draft observations below are historical.

- Chat stays 64 px high, with per-message translation controls accessible through its internal scroll area; both full-chat entry points work.
- Original burgundy passive effect indicators retain approved art, disappear at expiry and stay clear of map buttons. Realm Chat sits beside Reports, clear of march controls.
- Combat timers remain below Gold at 156×48 px / 148×48 px. All 12 test cities retain independent deadlines and reachable Map actions; the list adjusts around chat.
- Location checks cover exact saved identity, last-row scrolling, duplicate-click suppression, failure/retry, expiry, account clearing and no permission consumption. The game callback is wired; the shared report loader also passes checks for 1,480 uncached Core cities, other destinations and failed travel/account changes.
- Existing combat policy checks and asset budgets pass. Local browser evidence is in ignored `release-artifacts/combat-timers/` and `release-artifacts/chat-reward-ledgers/`; release checks and live verification are recorded separately.

- JavaScript syntax: `node --check` passed for `preview.js` and `review.js`.
- Desktop (1440×900): inspected complete rendered page. Quick chat measured 360×64 px. Original burgundy gradient and ivory arrow verified from computed styles. Four item tiles appear vertically on the right.
- Mobile landscape (844×390): inspected screenshot; quick chat remains 360×64 px before and after an individual translation. Timer stack and navigation stay separate.
- Small landscape (568×320): inspected screenshot; quick chat measured 178×64 px, positioned at x=12, y=240. Open chat, toggle, item timers and navigation remain visible.
- Toggle collapses and restores the mini preview. Opening full chat retains the selected per-message translation. Full chat closes back to the map.
- Translation sample: original → translating → translated → Show original control. Failure sample exposes Retry; retry succeeds without expanding quick chat. These are local prepared samples, not production Google calls.
- Empty sample: zero timer tiles; no placeholder panel. `boostDialog` is absent from the draft DOM, with no View all/Active Boosts entry point.
- Recent messages scroll inside the fixed-height preview. The newer artwork and the existing full conversation remain available.

Only the new `docs/visual-qa/compact-map-hud/` folder changes. Production runtime, backend, combat protections and existing approved previews are untouched. Full release checks and PR preparation are not run for this approval-only draft.

## Compact combat timer revision

- Uses the actual game markup and `CrownlandsCombatTimersUI` renderer with fictional deadlines.
- Short landscape (568×320): measured card 148×48 px, x=18, y=119; Retaliation tap target 28 px tall. Expanded list is 220×114 px at x=173, y=119, scrolls through five cities and does not overlap quick chat.
- Single-city state shows its countdown. Shield-only state hides Retaliation. No active timers hides the entire card.
- Desktop: card measured 156×48 px; expanded list 224×174 px. Both were visually reviewed. The 12-second Retaliation sample expired independently while Shield Cooldown remained visible.
- JavaScript syntax and Git whitespace checks passed. No backend or gameplay behavior changes.

## Retaliation location actions

- Every one of the five city rows has a named Map button. Selecting Ravenbrook shows its own name and map/ID in the sample location marker, closes the list, and keeps all five retaliation opportunities available.
- At 568×320 the last city's Map button remains reachable by scrolling; selecting Windsor Crossing shows that distinct destination. Buttons remain separate from their countdowns.
- The control uses only local fixture data. Real cross-map loading and recovery must be connected and tested during runtime integration; this draft does not perform a player action.
