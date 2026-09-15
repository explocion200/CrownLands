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

JavaScript syntax and whitespace checks passed for the isolated draft before approval.

## Approved runtime integration

The actual game renderer was checked through the local benchmark's mock services after approval, at the same three sizes and all eleven examples (33 cases). All windows fitted their viewport; checked panels had no horizontal overflow; command and profile targets retained at least 44 pixels of height; no images were broken. Available commands remained fixed and visible. This includes no-horn, pending, empty, long-name and large-force cases.

- At 568 × 320 the twentieth participant was reached by scrolling to 1,398 pixels. Its full row was visible inside the 76-pixel roster viewport. Refresh preserved that scroll position. The fifth rally was selectable with the picker scrolled to 304 pixels; refresh preserved selection and scroll. Removing that selected rally fell back to the first remaining rally.
- Creator and Clan Leader controls, member withdrawal, joining, full capacity, non-creator launched and no-horn states displayed the appropriate existing actions. The live Launch control opened the existing confirmation; Keep Forming closed it and cleared the activity styling.
- Withdrawal reached the mock API through the real action handler, displayed “Sending your order…” and disabled the command. Recall reached the selected army's local boundary, retained the updated horn image and disabled the action while pending. Join passed the selected rally to the existing join entry boundary and closed the modal.
- Switching to Marches restored the Marches class/header. Switching to Reinforcements removed both ledger classes and retained its existing empty-state view. Returning to Rallies restored the selected detail. Browser warning/error logs were empty.
- Focused existing Clan ledger, Clan War Room, rally, active-operations and instant-economy validation passed. JavaScript/ESLint, asset budgets and production artifact validation passed. Full required release gates and GitHub checks are recorded separately with the release receipt.

These are synthetic local renderer/binding checks, not production army mutations or physical-device tests. Actual server authorization, contribution settlement and failure handling remain covered by the existing required multiplayer gate.
