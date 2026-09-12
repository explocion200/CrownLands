# Royal Stables · Cavalry Master equipment draft

Status: **layout draft awaiting user approval** on `codex/royal-stables-gear-draft`. This is an isolated presentation preview. It has not been integrated into the game, pushed, merged, or deployed. The next step after layout approval is the new static Cavalry Master illustration.

Open `index.html` through the local preview server. The review provides Parchment draft and Current layout, with Desktop (1440 × 900), Mobile landscape (844 × 390), and Small landscape (568 × 320). Portrait orientation is not a design target.

## Presentation

- Follows the approved Treasury, Barracks, and Gatehouse arrangement and matching dimensions: up to 1200 × 790 pixels on desktop, fitting mobile landscape. Eight equipped slots surround the officer, the equipment bag occupies the middle pane, and selected-item details appear on the right. Equip/Unequip and Upgrade stay visible while inventory and item details scroll independently.
- Uses the existing Cavalry Master portrait and existing equipment illustrations for layout review. No new character art or animation is included. The surrounding review note identifies the portrait as temporary pending the separate art step.
- Common items retain light gray backgrounds (`#d9dad6`) and burgundy selection borders; empty slots remain parchment. Gold uses the approved crown-stamped coin. The Royal Stables seal reuses the engraved horseshoe from the Inner Castle overview.
- Interactive examples include an upgrade-ready Riding Helm, Riding Breeches without a matching copy, the maximum-level Wayfinder Pendant, the Lance, an empty Gloves slot, and insufficient Gold. Equipment actions and confirmation are previews and never change inventory or Gold.

## Source and preserved information

`snapshot.json` was captured from the current `createCommonGearViewModel('royal-stables')` and `renderCommonGearBuilding('royal-stables')` at commit `b54706b8c6308e62f466bb2922d40b1ad2e77873`, using a disposable local benchmark inventory. The sample includes 16 items in 13 stacks, seven equipped slots, 128,400 Gold, and 48,000 raw Gold production per hour. The low-Gold example uses 12,000. No account or production data is included.

Armor retains owned-city transfer and reinforcement speed. The Lance retains attack and rally march speed. The Wayfinder Pendant retains scout speed. Bonuses, levels, costs, matching-copy counts, full progression paths, descriptions, category, binding, stack counts, and equipped/new indicators come from the current game model. No gameplay or balance changes are proposed.

Upgrade confirmation retains the two-to-one consumption and irreversible-action wording. Cancel and Escape restore keyboard focus to Upgrade. The review page identifies all actions as previews.

## Focused draft verification

Passed 18 states across desktop and both mobile landscape sizes, covering six examples per size. Checks verified image decoding and containment, eight reachable equipment slots at least 44 pixels high and wide, visible 44-pixel actions, viewport containment, correct disabled states, and all three Royal Stables bonus scopes. Bag selection, filtering, the empty slot, confirmation, Escape/focus restoration, and switching to the current-layout comparison passed without browser exceptions.

Visual review checked the desktop layout, landscape Lance view, and small-landscape Wayfinder Pendant view. Physical-device touch remains untested. Capture/check helpers, screenshots, and results remain under ignored `release-artifacts/royal-stables-gear/`. Runtime integration and release gates remain part of the later approved implementation.
