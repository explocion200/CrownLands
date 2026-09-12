# Barracks · War Captain equipment draft

Status: **layout and static War Captain approved; runtime integrated, release pending** on `codex/barracks-gear-draft`. The user approved merge and deployment on September 11, 2026. This folder retains the synthetic design preview. Runtime integration uses `barracks-gear-ui.js` and `barracks-gear-ui.css`, the optimized static Captain, and existing shared Common Gear actions. Backend and equipment rules are unchanged. A merge alone does not establish deployment.

Open `index.html` through the local preview server. The review offers the parchment draft and a captured current-layout comparison, with Desktop (1440 × 900), Mobile landscape (844 × 390), and Small landscape (568 × 320). Portrait orientation is outside this review.

## Presentation

- Reuses the approved Treasury layout and dimensions: officer between eight equipped slots, equipment bag in the middle, complete selected-item details on the right, with Equip/Unequip and Upgrade fixed at the bottom.
- Retains the light gray Common backgrounds (`#d9dad6`), burgundy selection borders, parchment, moss, and readable ink. The gold symbol is the existing crown-stamped City Details coin. The Barracks seal and upgrade hammer reuse City Details' engraved helmet and upgrade artwork.
- Uses the new transparent War Captain still, centered between the equipment slots without a portrait frame. The character is static: no animation, sprite sheet, or motion controller. Existing item illustrations remain. Current layout preserves the original portrait for comparison. See `art/README.md` for source, prompt, and provenance.
- Includes upgrade-ready, missing-copy, maximum-level Valor Medallion, Officer Sword attack, empty-slot, and insufficient-gold examples. Selecting a slot or bag item retains all its available information; bag scrolling is preserved on item selection.
- Preview actions do not change inventory or Gold. The upgrade confirmation retains its two-to-one consumption warning and returns focus after Cancel or Escape.

## Source and preserved rules

`snapshot.json` was captured from the actual `createCommonGearViewModel('barracks')` and `renderCommonGearBuilding('barracks')` at commit `410e33aff54c445b8d42ab1c1149feed3db91165`, using a disposable local benchmark inventory. It contains 16 items in 13 stacks, seven equipped slots, 128,400 Gold, and 48,000 raw Gold production per hour. The low-Gold example uses 12,000. It contains no account or production data.

Armor grants troop production in all owned cities. The Officer Sword grants attack strength for all attacks. The Valor Medallion preserves casualty recovery with Field Medics, the 75% combined cap, and the return of recovered troops to the Main City. Levels, exact bonuses and upgrade costs, matching-copy requirements, full progression paths, binding, new/equipped indicators, and stack counts come from the current game model. No rule or balance change is proposed.

## Validation

The focused local draft check passed 15 states across the three supported desktop/landscape sizes: decoded images, eight reachable 44-pixel slots, visible 44-pixel action buttons, viewport containment, empty/disabled/low-Gold states, bag selection and filtering, upgrade confirmation, Escape/focus restoration, and the current-layout comparison. Browser review also verified the Sword's attack description and the Medallion's full recovery-limit text. The character source and WebP have genuine alpha and a single frame; layout checks cover containment between the slots and the absence of character animation. No browser exceptions were reported. Physical-device touch is not validated by this local draft.

Local capture/check scripts, screenshots, and results are retained under ignored `release-artifacts/barracks-gear/`. `tools/validate-barracks-gear-browser.js` covers the actual runtime with synthetic inventory and a local API stub: all five desktop/landscape sizes, equipment selection and filtering, confirmation focus, pending/error guards, upgrade result identity, static character presentation, and Back/Close. It does not mutate a production account. Release-gate and publication evidence are recorded separately in the release handoff.
