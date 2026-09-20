# Focused draft checks — September 20, 2026

- JavaScript syntax: `node --check` passed for `preview.js` and `review.js`.
- Desktop (1440×900): inspected complete rendered page. Quick chat measured 360×64 px. Original burgundy gradient and ivory arrow verified from computed styles. Four item tiles appear vertically on the right.
- Mobile landscape (844×390): inspected screenshot; quick chat remains 360×64 px before and after an individual translation. Timer stack and navigation stay separate.
- Small landscape (568×320): inspected screenshot; quick chat measured 178×64 px, positioned at x=12, y=240. Open chat, toggle, item timers and navigation remain visible.
- Toggle collapses and restores the mini preview. Opening full chat retains the selected per-message translation. Full chat closes back to the map.
- Translation sample: original → translating → translated → Show original control. Failure sample exposes Retry; retry succeeds without expanding quick chat. These are local prepared samples, not production Google calls.
- Empty sample: zero timer tiles; no placeholder panel. `boostDialog` is absent from the draft DOM, with no View all/Active Boosts entry point.
- Recent messages scroll inside the fixed-height preview. The newer artwork and the existing full conversation remain available.

Only the new `docs/visual-qa/compact-map-hud/` folder changes. Production runtime, backend, combat protections and existing approved previews are untouched. Full release checks and PR preparation are not run for this approval-only draft.
