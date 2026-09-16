# Gold Stronghold draft checks

Checked 2026-09-15 in the Codex in-app browser against the local draft. All data and action dialogs are fictional previews; this is not live-game or backend validation.

- Desktop 1440 × 900, landscape 844 × 390, and small landscape 568 × 320 rendered successfully. Fortress artwork and icons loaded. No portrait layout is included.
- Landscape columns scroll independently without horizontal overflow. The management footer stays within the dialog. At 568 × 320 the initial troop count is fully visible, and the bonus and defense estimate appear near the top. Long names and large numbers retain their content without horizontal overflow.
- Owned, damaged-wall, daily cooldown, allied, enemy, scouted, neutral, and long-content examples were inspected. Enemy garrison and private defense remain unknown without scouting. Allies see owner troops and only their own Recall contribution. Owners see Send Home; the cooldown disables relinquishment.
- Fixture checks preserve 8% direct / 4% clan bonus, level 50 wall values, 60% damaged-wall values, and the separate neutral one-time starting-defender label. These are illustrative displays, not an authoritative combat forecast.
- Overview and Stronghold Legacy switch through the tabs and keyboard. Legacy renders 100 ranked entries with a current-holder marker and a scrollable list reaching the final ranks. Loading, unavailable, and empty states display their respective messages.
- Relinquish and Send Home open disclosed local previews. Dismissal returns to the draft without changing the example. Close and Reopen preserve the selected tab and return keyboard focus to it.
- Final desktop and landscape screenshots were visually reviewed. Browser warning/error logs were empty at the final check.
- `node --check` passed for `fixtures.js`, `preview.js`, and `review.js`. `git diff --check` passed.

Integration, real-device touch testing, live timers, authoritative visibility/permission handling, multiplayer validation, and release checks remain for the approved runtime implementation. No PR, push, merge, or deployment was performed for this draft.

## Overview revision

The user requested a better overview after reviewing the initial draft. Rechecked the revised presentation on 2026-09-15:

- Desktop and 844 × 390 landscape screenshots reviewed. Fortress art stays within its frame; ownership is grouped beneath it, and troops / defense appear together on the right.
- At 568 × 320 the normal owned example exposes both owner/clan and the complete wall-status strip in the initial overview. No horizontal overflow in the identity or details columns. Long names and large values remain scrollable without clipping digits horizontally.
- Defense & repair opened with a click; Holding benefits opened with Enter. Both retained their full fixture values, wall sources, repair information, effect target and Citadel precedence explanation. Send Home remained reachable after expanding both and opened the unchanged local return preview.
- Enemy and neutral examples showed Unknown troops / total defense. Allies retained exact owner troops, private defense and Recall only. Scouted defense retained base-plus-bonus values. Damaged walls showed 60% and 5,238,841 estimated defense. Cooldown disabled relinquishment. Foreign examples had no relinquishment action.
- No fixture math, production files, world data or server behavior changed. The overview styles are isolated in `overview.css`; this remains a design approval checkpoint.
