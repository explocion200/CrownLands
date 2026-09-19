# Focused draft verification — September 19, 2026

Passed against the loopback preview with an isolated headless Chrome profile:

- 1440×900 desktop, 844×390 landscape and 568×320 small landscape.
- No runtime errors, failed asset requests, broken images or horizontal dialog overflow.
- Boost footer remains visible; all four effect rows fit in the smallest landscape view.
- Each effect selects its correct description; expiry removes the expired effect and updates the count; the empty state remains usable.
- Arrow closes and reopens mini chat and updates its accessible state.
- Per-message translation updates only the selected message; full and mini views agree.
- Same-language and coordinate/time examples have no translation action.
- Show original, failed-request Retry, loading originals, and language-change cancellation work.
- Incoming messages preserve the current reading position and expose New messages.
- Review toolbar, iframe sizing, view selector and preview-language selector work.
- JavaScript syntax and whitespace checks passed.

Desktop, landscape and small-landscape Boosts, map preview and Chat screenshots were inspected. Smaller layouts were tightened after the first visual check. Evidence is saved locally under `release-artifacts/boosts-and-chat/` (ignored, not production assets).

These are presentation-fixture checks. Real message language detection, Google calls, production chat integration and authenticated gameplay were not exercised or changed. No full emulator/release gate was run for this approval-only draft. No PR or deployment.
