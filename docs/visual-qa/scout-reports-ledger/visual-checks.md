# Local draft review

September 14, 2026. Synthetic examples only; no production account or gameplay actions were used.

- JavaScript syntax checks passed for `preview.js` and `review.js` under Node 22.
- The local preview returned HTTP 200.
- Browser geometry checks covered all 14 examples at 1440 × 900, 844 × 390, and 568 × 320 (42 combinations). No horizontal overflow; header controls and section navigation stayed inside the window and above the report body. Every draft button retained at least 44 CSS pixels of height.
- All successful city samples retain eight skills. Failed, blocked, expired, replaced, and unavailable-disclosure samples render zero troop/defense metrics and zero skill rows.
- Desktop overview and defender disclosure, compact mobile overview, and small landscape disclosure/skills were visually inspected. The standard mobile summary keeps its three primary metrics visible. Longer content scrolls; small landscape was scrolled to its final skill rows while the header remained visible.
- Close and Reopen worked. Section shortcuts reached the corresponding content. Sample selection and desktop/landscape size controls updated the draft and review URL.
- Rapid switching briefly observed pending image loads in two combinations. Subsequent inspection confirmed the SVGs loaded; these were loading observations, not missing resources.

## Approved integration review

September 14, 2026. The approved presentation is mounted through the actual game entry points using the loopback-only runtime fixture. All data in this review is synthetic.

- All 14 report examples passed geometry and disclosure checks at 1440 × 900, 844 × 390, and 568 × 320 (42 combinations). No horizontal overflow or missing images; fixed controls remain above the scrolling body.
- Actual saved flags render for both rulers. City success reports retain all eight skills and complete integer values; unavailable intelligence contains no troop, defense, or skill rows.
- A four-second expiry returned to Reports automatically and removed the intelligence. The two wall repair labels counted down together and both changed to “Fully repaired — wall integrity restored.”
- Back and Close returned correctly and removed the scoped presentation. View map closed the report and returned to the target holding. The Skills shortcut reached the section, and small landscape scrolling exposed the final skill rows and base attack while retaining the header.
- Focused report validation passed: snapshot values, zero power, breached walls, historical fields, camp rules, disclosure boundaries, escaping, saved flags, navigation, mirrored timers, authoritative recovery, retention, and account isolation.

Release gates and published-build verification are recorded separately in the release receipt; these local checks alone do not establish deployment.
