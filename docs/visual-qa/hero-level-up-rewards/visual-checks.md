# Hero Level-Up draft checks

Reviewed September 17, 2026, using the local in-app browser and fictional receipts.

| Check | Result |
| --- | --- |
| Desktop 1440 × 900 | Crowned banner, all three rewards, exact amounts, Main City destination and footer visible in the 890 × 614 window. |
| Landscape 844 × 390 | Same two-column structure; reward rows, city destination and Collect Rewards visible. |
| Small landscape 568 × 320 | 552 × 304 window. Large-number/long-city fixture fits; ledger client height and content height both 195px after compact spacing refinement. |
| Large amounts | Full `+23,497,686,072` Gold and `+4,285,960` troops fit without truncation or horizontal overflow. These are synthetic layout examples. |
| Reward artwork | Crown SVG, current achievement seal, Gold pickup and troop pickup all load successfully. |
| Multiple levels | Level 47 → 50 displays `3 levels gained` and `+3` skill points. |
| Separate destinations | First Collect advances from the Stoneward receipt to the separate Ravenwatch receipt, with the corresponding level and amounts. Second Collect dismisses; Replay/reopen restores the selected example. |
| Keyboard dismissal | Escape retains the reward modal, matching current behavior. Initial focus goes to the heading; Collect Rewards is keyboard reachable. |
| Mobile action | Collect Rewards stays outside the scrolling ledger and is at least 44px high on both landscape sizes. |
| Static checks | Preview/review JavaScript syntax, SVG XML validity, local asset references and Git whitespace checks passed. |

No emulator suite is needed for this isolated presentation draft. No runtime code or server logic changed. Before integration/release, verify actual authoritative receipts, queued rewards, original reward animation anchors, focus/lifecycle and the appropriate required release checks. No PR or deployment is created by this draft.
