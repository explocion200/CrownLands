# Rallies draft review

Reviewed September 14, 2026, in the Codex in-app browser against the local preview. These are controlled browser viewports and synthetic examples, not physical-device or production-gameplay tests.

## Layout coverage

All eleven review examples were inspected at 1440 × 900, 844 × 390 and 568 × 320. The final small-screen adjustments were repeated at 568 × 320. Each window stayed inside its viewport, the checked content had no horizontal overflow, enabled buttons and profile links were at least 44 × 44 CSS pixels, and all available command buttons stayed inside the fixed window without scrolling. The 844-pixel layout condenses creator, assembly and troop totals into one band. Long names wrap; full troop values including 999,999,999 and the 1,012,499,999 assembled total remain intact.

- Mixed rallies: forming, launched and returning selections retain target/region/type, creator, assembly, force totals, participants and state.
- Ready creator and Clan Leader: Launch and Cancel shown, with manual readiness wording.
- Open rally: Join shown; member example: Withdraw shown.
- Full rally: twenty participants, no Join control, and explicit capacity notice.
- Five rallies: last rally selectable through the left scroll area; selected detail updates correctly. Non-creator launched rally has no Recall control.
- No Recall Horns: Recall disabled with an explanation.
- Pending: both relevant commands disabled and the sending state visible.
- Empty: compact horizontal composition keeps the return-to-map button fully inside the smallest window.

The final twentieth participant was reached by keyboard at 568 × 320. The roster scrolled to 1,376 pixels; the last row was fully inside the 90-pixel content viewport while the action area remained below it. The fifth rally was reached and selected with the sidebar scrolled to 290 pixels. Images were visibly loaded, and the final empty-state image check reported no incomplete or broken assets.

## Draft interaction checks

- Launch changes a ready forming example to Launched after simulated acknowledgement. Both forming commands disable immediately while pending.
- Recall changes the launched example to Returning, updates all four participant labels, and consumes exactly one sample horn (2 → 1).
- Join adds the disclosed fixed contribution (4 → 5 participants) and changes Join to Withdraw. Withdraw removes that sample contribution (5 → 4), then restores Join.
- Cancel reaches the no-active-rallies state. Return to map closes the draft, and Open Kingdom Activity reopens it.
- Close/Reopen, review viewport/example selection and Reset were checked in the review shell.

JavaScript syntax and whitespace checks passed. The complete change is confined to this new draft directory. No game runtime, backend, shared art, build files, Master Specification or live data was changed. Production integration, release gates, PR creation and deployment follow design approval.
