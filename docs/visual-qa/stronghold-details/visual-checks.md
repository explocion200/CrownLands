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

## Training, Movement and Defense variants

Following Gold overview approval, checked the three additional regional drafts on 2026-09-15:

- All three rendered at 1440 × 900, 844 × 390 and 568 × 320 with the correct name, specialization label, artwork and 8% / 4% split. No horizontal overflow in either column; the default owner/clan record and wall-status strip fit the initial overview. Desktop screenshots of all three and landscape screenshots were visually inspected.
- A focused Node check compared all four definition IDs, names, levels and art paths against the current Core layout, verified art/icon files exist, and checked fixed example arithmetic. Gold/Training/Movement remain 5,914,736 intact; Defense is 6,252,736 with identical 1,689,736 wall power. Defense's 60% damaged example is 5,576,841. All assertions passed.
- Ironwatch's expanded defense section identified the 8% soldier bonus and unchanged walls. Its local relinquish preview and return button both named Ironwatch. Enemy troops/defense stayed unknown, allied support exposed Recall only, and the daily cooldown disabled relinquishment.
- Swiftgate's expanded benefits named March time and explained travel-time effects. Its Legacy introduction named Swiftgate and rendered 100 entries. A reload preserved the selected holding and example through the URL.
- Shared styling, data definitions and rendering avoid three separate copies of the approved layout. The Gold default and its existing links are retained; Gold has an approved-design badge and the other variants remain drafts.

Only local draft actions were exercised. Real multiplayer/order handling and deployment remain outside this approval pass.

## Crown Citadel

Checked the Crown variant on 2026-09-15:

- Desktop and both landscape layouts rendered the Citadel art, crown, controller, current reign and five benefits. The smallest normal example fits the five-benefit group, main statistics, wall strip and reign line without horizontal overflow. The small Reign Ledger has space for two initial rows and retains the cumulative-score explanation in its footer.
- Expanded benefits show all five controller/clanmate values, including −10% / −5% upgrade cost. Soldier-only defense and the confirmed regional Stronghold interaction examples are retained. Relinquishment opens the correctly named Crown Citadel local preview.
- Owned estimate is 44,006,200; damaged is 42,614,200 with 18m remaining. Enemy and neutral private values remain Unknown; allies see exact owner troops and Recall only; Crown scout defense is a single reported total. Neutral starts at the labeled one-time 100,000,000, with current reign Unclaimed. Long values do not overflow horizontally, and cooldown disables relinquishment.
- Reign Ledger contains 100 ranked sample rulers, a Current Citadel ruler marker, and cumulative times. The final ruler was reached, its local profile preview opened, and rank 100 was visible after returning. Loading, error and empty states use the correct Reign Ledger text.
- A focused Node check verified Crown identity/art against the current Core layout, level-100 wall constants and 45-minute repair timing against economy configuration, five benefit signs, 10% soldier-layer math, 100-million neutral starting troops, and unchanged Gold/Defense regional fixture values. All passed.

This remains a local design review. Fictional clocks are frozen; production ranking, multiplayer, orders, release checks and deployment await approved runtime integration.
