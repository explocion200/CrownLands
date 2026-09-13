# Clan Overview draft checks

Reviewed locally on 2026-09-13 in the in-app Chromium browser. This is design QA with synthetic data, not a live clan integration or multiplayer validation.

- Desktop, 1440 × 900: centered 1200 × 700 window; identity, description, leader controls, totals, and all four shortcuts fit. Activity region has no overflow.
- Mobile landscape, 844 × 390: compact shield beside the clan name. All four activity shortcuts fit without scrolling; activity region measured 178px high with 178px of content. Leader controls remain visible.
- Small landscape, 568 × 320: two activity columns scroll within the panel. Keyboard scrolling reaches Weekly Conquest and Roster; a 276-character description has its own scroll area. Clan navigation and leader controls remain in place. Cooldown text fits without horizontal overflow.
- Leader / Officer / Member: only Leader sees Edit Heraldry and Rename Clan. Officer can see pending-application status; Member sees member count and no pending-application details.
- New clan, cooldown, full clan, and long-description examples render the intended text and state. No horizontal overflow found in the inspected cards, identity, or clan name.
- Current and original heraldry both render through the existing production renderer. Loaded image elements have valid natural dimensions; no browser warnings or errors were reported during review.
- Four activity cards, three other clan tabs, three other kingdom tabs, shield/name profile actions, and both leadership buttons open their corresponding action previews (14 controls checked). Back to Overview closes the preview.
- Escape closes an action preview and restores focus to its source control. Closing and reopening Clan Overview works.
- `node --check` passes for `preview.js` and `review.js`.

Production integration, server permissions, multiplayer behavior, and release gates remain for the implementation after design approval. No backend or gameplay code is part of this draft.
