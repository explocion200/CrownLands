# Leaderboards draft review checks

Checked September 15, 2026, using the local draft in the in-app browser.

- Desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320) render both Kingdom and Clan tabs. No horizontal list overflow in the inspected standard and long-label/large-number cases.
- All 100 clan crests render through the existing heraldry renderer. Inspected images loaded successfully; browser error/warning log was empty.
- Full power numbers remain visible in separate aligned columns, including 987,654,321,012 Kingdom Power and 9,876,543,210,123 Clan Power fixtures. Small landscape retains home-map/city details and member counts below identity.
- Find my rank/clan scrolls to the highlighted entry. Its full row is visible, including at 568 × 320. Keyboard End reaches rank 100; the list remains independently scrollable with header and controls visible.
- Top 100 Kingdoms and Top Clans selection and keyboard ArrowRight navigation update accessible selected states. Refresh completes and re-enables the control. Close, Escape and Reopen work; Reopen returns to Top 100 Kingdoms.
- Player/clan links produce a disclosed draft-only profile notice. No real profile, account, order, score, API or storage action is performed.
- Unranked, loading, empty, error and signed-out examples display the intended distinct states. Unranked does not inject a fabricated current row; loading and signed-out disable Refresh; error retains Refresh for recovery.
- Syntax checks passed for all three JavaScript files. The staged scope and whitespace audit are limited to this draft directory.

This is visual and interaction QA for a mock draft, not production integration or backend validation. Required release gates and `prepare-pr` remain deferred until approval and implementation. No PR, merge or deployment was performed for this draft.
