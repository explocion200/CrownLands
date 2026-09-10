# Treasury equipment — layout draft

Open `index.html` through the repository's local static server. The review contains desktop (1440 × 900), mobile landscape (844 × 390), and small mobile landscape (568 × 320) views. Portrait gameplay is not a design target.

This is an isolated design proposal for **Treasury → Master of Coin → Manage Gear**. It has not been integrated into the game. The production UI, other officers, equipment rules, inventory, and account APIs are untouched. The repository's production builder excludes this documentation folder.

## Proposed layout

- A parchment header connects the Treasury to the Inner Castle, with the current gold balance, Back, and Close controls.
- The Master of Coin appears between the existing eight equipment slots. The selected slot and available upgrade-material markers remain distinct.
- A separate equipment bag retains slot filtering, owned-item and stack counts, item levels, stacked quantities, equipped and new markers, and matching-slot emphasis.
- The selected-item panel collects the existing information: full item identity, officer, rarity, category, slot, level, current bonus and scope, next bonus and increase, matching-copy requirement and availability, gold cost, raw-production hours, current gold, description, full progression path, binding, and equipped state. Repeated information is consolidated here.
- Equip/Unequip and Upgrade remain at the bottom of the selected-item panel. Long item records and large inventories scroll independently; actions stay visible on the reviewed desktop and landscape screens.
- The upgrade confirmation retains the existing two-to-one requirement, consumption of both inputs, next-level result, gold charge and irreversible-action wording. Cancel and Escape return focus to Upgrade.

The draft uses the approved Inner Castle parchment/moss palette, readable serif headings, plain text for dense numbers, and engraved SVG symbols. Existing Master of Coin and equipment artwork is retained for this layout review. No new officer or item artwork is proposed in this pass.

Confirmed rarity treatment: **Common, the current lowest rarity, uses a light gray item background** (`#d9dad6`) in filled equipment slots, bag tiles, the selected-item illustration, and the upgrade confirmation. Selection uses a burgundy border while retaining the gray rarity surface. Empty slots retain parchment. The treatment reads each item's existing rarity value; future rarity colors and rules are not defined in this draft.

## Review interactions

Select equipment slots or bag items; filter by slot; open and cancel the upgrade confirmation. Example controls cover an available upgrade, missing material, maximum level, an empty slot, and insufficient gold. Equip, confirm-upgrade, Back and Close only report preview feedback in the review toolbar; they never submit gameplay actions.

The comparison uses captured runtime markup, including a separate low-gold capture. The shared stylesheets are enabled for the current layout and disabled for the draft. They remain live repository styles, so the comparison is not a complete archival rendering snapshot.

## Source and evidence

`snapshot.json` was captured from `createCommonGearViewModel` and `renderCommonGearBuilding` at source commit `5bd8ad4499c32a39a8b97291c31e7dbebafe0376`, using the local benchmark fixture with a synthetic inventory. It includes 16 Treasury items, 13 stacks, seven equipped slots, a 128,400-gold sample balance, and 48,000 gold/hour raw production. The low-gold example uses 12,000 gold. No production account was read.

Values follow the current Common Gear implementation and Master Specification Section 11. The first selected cap is Level 2, grants +0.50% Main City gold production, and has a Level 3 upgrade to +0.80% requiring one matching unequipped Level 2 copy plus 48,000 gold. The Treasury Chain preserves its distinct **all owned cities** scope. No balance or progression changes are part of the draft.

Focused browser review covers 15 combinations of five example states at three supported sizes, image decoding, eight reachable equipment slots with 44-pixel targets, visible 44-pixel action controls, disabled states, selection/filter behavior, empty slots, confirmation/Escape/focus and current-layout switching. Interactive browser review also checked the landscape upgrade confirmation and the low-gold comparison. Screenshots and the local checks are retained under ignored `release-artifacts/treasury-gear/`.

Physical-phone checks and actual game integration remain future work after design approval.
