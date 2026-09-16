# Camp draft checks

## Relic chest image correction — 2026-09-16

The initial variant used an older dark WebP chest despite describing it as updated. Corrected the reference to `assets/icons/common-gear-chest-r1.svg`, the approved oak-and-iron chest used by the current game's `COMMON_GEAR_BOX_ITEM.icon` and Daily Login draft. Confirmed successful image loading and visually checked the replacement on desktop and mobile landscape, with no overflow in the bonus strip. No layout or reward rule changed.

## Warband, Relic and Deed extension — 2026-09-16

- Node.js syntax checks passed for all three scripts. Fixture checks matched every hold duration, daily allowance and production minimum against `functions/economy-config.json`. All four Core camp IDs/map names were found in the active layout; all camp artwork, map backdrops, icons, item illustrations and the updated chest file exist. Relic base item odds sum to 100%; the independent 1% chest roll was verified in the existing Functions code.
- Browser geometry checks passed for all four camps × three tabs × three sizes: 36 combinations, including long names and large numbers. Windows/footer actions remained within the viewport; cards and content panes had no horizontal overflow; visible controls retained 44px minimum height. All referenced images loaded.
- All 40 shared camp/example combinations passed checks for correct private defense visibility, completed allowance (zero further rewards), pending resolution and horizontal overflow. Owned fixtures correctly displayed Gold 92,480 gold / 6m 42s, Warband 46,240 troops / 10m 03s, Relic one usable item / 20m 06s, and Deed one neutral city / 40m 12s. Timers are intentionally frozen, proportional review examples.
- Deed's additional reserved, empty-history, loading-history and failed-history examples rendered correctly at small landscape size. History retained ten private city awards. The last city's map action opened the local explanation and Escape dismissed it. Changing from a Deed-only example to Warband restored the Owned example.
- Visually inspected all three new landscape Overviews, Relic's desktop/landscape drop ledger with the updated bonus chest, and the bottom of Deed's scrollable city history. Adjusted Relic/Deed mobile art framing to prevent tent roofs being cropped.
- No browser console warnings or errors were observed. These are local prototype checks only; no multiplayer, backend mutation, PR gate or deployment ran.

## Original Gold layout

Checked locally on 2026-09-16 with Node.js 22.23.2 and the Codex in-app browser, using the static preview at `127.0.0.1:61703`.

- All three scripts passed `node --check`. Static page returned HTTP 200.
- Desktop 1440 × 900, landscape 844 × 390 and small landscape 568 × 320: inspected dialog layout; Overview, Your Rewards and Camp Rules passed DOM geometry checks with the long-name/large-number fixture. The dialog and fixed footer remained within the viewport; cards and scroll panes had no horizontal overflow. Visible buttons/disclosures met 44px minimum height. Packaged images loaded successfully.
- Visually reviewed the complete desktop Overview and reward ladder, normal landscape Overview, and small-landscape Overview and Camp Rules. The mobile art frame enlarges the existing illustration without replacing the asset. Main contents scroll; no portrait variant is provided.
- All ten sample states rendered the expected reward heading, amount, public timer and authorized defense visibility. Neutral, enemy and ally samples kept total troops and defense Unknown. Scouted showed the report snapshot. Loading/error withheld reward estimates. Completed allowance showed zero; payout pending showed Resolving without awarding anything.
- Default ladder showed 46,240 / 92,480 / 138,720 / 184,960, matching the current formula and fictional production rate. The long example retained 351,851,835 next-reward gold and 124,567,890 troops/defense without horizontal overflow.
- Your Rewards and Camp Rules scroll to the bottom at small landscape size while footer actions remain available. Tabs work by click and keyboard. Reset and a reload preserve the chosen fixture correctly. Send Home and Recall open local explanatory dialogs, with a return button and Escape dismissal. Back to Map closes the preview and Open Gold Camp restores it.
- No browser console warnings or errors were observed in the reviewed draft. No gameplay, backend, release or world files were changed.

This validates the local prototype only. No emulator suite, production transaction, multiplayer session or deployment was run for this draft. Integration validation and required GitHub checks remain for an approved implementation.
