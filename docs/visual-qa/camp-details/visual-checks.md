# Gold Camp draft checks

Checked locally on 2026-09-16 with Node.js 22.23.2 and the Codex in-app browser, using the static preview at `127.0.0.1:61703`.

- All three scripts passed `node --check`. Static page returned HTTP 200.
- Desktop 1440 × 900, landscape 844 × 390 and small landscape 568 × 320: inspected dialog layout; Overview, Your Rewards and Camp Rules passed DOM geometry checks with the long-name/large-number fixture. The dialog and fixed footer remained within the viewport; cards and scroll panes had no horizontal overflow. Visible buttons/disclosures met 44px minimum height. Packaged images loaded successfully.
- Visually reviewed the complete desktop Overview and reward ladder, normal landscape Overview, and small-landscape Overview and Camp Rules. The mobile art frame enlarges the existing illustration without replacing the asset. Main contents scroll; no portrait variant is provided.
- All ten sample states rendered the expected reward heading, amount, public timer and authorized defense visibility. Neutral, enemy and ally samples kept total troops and defense Unknown. Scouted showed the report snapshot. Loading/error withheld reward estimates. Completed allowance showed zero; payout pending showed Resolving without awarding anything.
- Default ladder showed 46,240 / 92,480 / 138,720 / 184,960, matching the current formula and fictional production rate. The long example retained 351,851,835 next-reward gold and 124,567,890 troops/defense without horizontal overflow.
- Your Rewards and Camp Rules scroll to the bottom at small landscape size while footer actions remain available. Tabs work by click and keyboard. Reset and a reload preserve the chosen fixture correctly. Send Home and Recall open local explanatory dialogs, with a return button and Escape dismissal. Back to Map closes the preview and Open Gold Camp restores it.
- No browser console warnings or errors were observed in the reviewed draft. No gameplay, backend, release or world files were changed.

This validates the local prototype only. No emulator suite, production transaction, multiplayer session or deployment was run for this draft. Integration validation and required GitHub checks remain for an approved implementation.
