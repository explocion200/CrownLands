# Treasury equipment — approved layout and integration

Open `index.html` through the repository's local static server. The review contains desktop (1440 × 900), mobile landscape (844 × 390), and small mobile landscape (568 × 320) views. Portrait gameplay is not a design target.

The **Treasury → Master of Coin → Manage Gear** design is approved and integrated into the game on `codex/treasury-gear-draft` (PR #283). It is pending merge and authorized deployment. The interactive review remains a synthetic draft; the repository's production builder excludes this documentation folder. Other officers, equipment rules, inventory authority, and account APIs are unchanged.

## Approved layout

- A parchment header connects the Treasury to the Inner Castle, with the current gold balance, Back, and Close controls.
- The Master of Coin appears between the existing eight equipment slots. The selected slot and available upgrade-material markers remain distinct.
- A separate equipment bag retains slot filtering, owned-item and stack counts, item levels, stacked quantities, equipped and new markers, and matching-slot emphasis.
- The selected-item panel collects the existing information: full item identity, officer, rarity, category, slot, level, current bonus and scope, next bonus and increase, matching-copy requirement and availability, gold cost, raw-production hours, current gold, description, full progression path, binding, and equipped state. Repeated information is consolidated here.
- Equip/Unequip and Upgrade remain at the bottom of the selected-item panel. Long item records and large inventories scroll independently; actions stay visible on the reviewed desktop and landscape screens.
- The upgrade confirmation retains the existing two-to-one requirement, consumption of both inputs, next-level result, gold charge and irreversible-action wording. Cancel and Escape return focus to Upgrade.

The draft uses the approved Inner Castle parchment/moss palette, readable serif headings, plain text for dense numbers, and engraved SVG symbols. Equipment artwork is retained. The approved Master of Coin illustration and idle animation are integrated into the Treasury runtime on this branch, pending merge and authorized deployment. The original portrait remains available as a fallback and review comparison.

Confirmed rarity treatment: **Common, the current lowest rarity, uses a light gray item background** (`#d9dad6`) in filled equipment slots, bag tiles, the selected-item illustration, and the upgrade confirmation. Selection uses a burgundy border while retaining the gray rarity surface. Empty slots retain parchment. The treatment reads each item's existing rarity value; future rarity colors and rules are not defined in this draft.

## Review interactions

Select equipment slots or bag items; filter by slot; open and cancel the upgrade confirmation. Example controls cover an available upgrade, missing material, maximum level, an empty slot, and insufficient gold. Equip, confirm-upgrade, Back and Close only report preview feedback in the review toolbar; they never submit gameplay actions.

The **Character** selector compares Animated sprite, Still illustration, and Original portrait inside the approved layout. The approved artwork has a transparent background and a 6.16-second breathing/blinking loop. The review uses the optimized runtime files. Reduced-motion preferences select the still illustration; opening the upgrade confirmation or hiding the page also selects the still. The Current layout comparison retains its original portrait. Creation provenance, the exact submitted prompt, and packaging details are recorded in [art/README.md](art/README.md).

Focused checks for the artwork draft passed at 1440×900, 844×390, and 568×320: image decoding, portrait containment, eight reachable equipment slots, and visible action buttons with at least 44-pixel heights. The three portrait options, reduced-motion fallback, confirmation pause/resume, and restored Upgrade focus also passed. Physical-device animation smoothness remains a manual follow-up. Nothing has been deployed.

The comparison uses captured runtime markup, including a separate low-gold capture. Its Treasury data attribute is removed to retain the older shared gear styling. The shared stylesheets are enabled for the comparison and disabled for the draft. They remain live repository styles, so the comparison is not a complete archival rendering snapshot.

## Source and evidence

`snapshot.json` was captured from `createCommonGearViewModel` and `renderCommonGearBuilding` at source commit `5bd8ad4499c32a39a8b97291c31e7dbebafe0376`, using the local benchmark fixture with a synthetic inventory. It includes 16 Treasury items, 13 stacks, seven equipped slots, a 128,400-gold sample balance, and 48,000 gold/hour raw production. The low-gold example uses 12,000 gold. No production account was read.

Values follow the current Common Gear implementation and Master Specification Section 11. The first selected cap is Level 2, grants +0.50% Main City gold production, and has a Level 3 upgrade to +0.80% requiring one matching unequipped Level 2 copy plus 48,000 gold. The Treasury Chain preserves its distinct **all owned cities** scope. No balance or progression changes are part of the draft.

Focused browser review covers 15 combinations of five example states at three supported sizes, image decoding, eight reachable equipment slots with 44-pixel targets, visible 44-pixel action controls, disabled states, selection/filter behavior, empty slots, confirmation/Escape/focus and current-layout switching. Interactive browser review also checked the landscape upgrade confirmation and the low-gold comparison. Screenshots and the local checks are retained under ignored `release-artifacts/treasury-gear/`.

## Runtime integration

`common-gear-ui.js` selects the dedicated `treasury-gear-ui.js` renderer only for the Treasury building. Its matching stylesheet is scoped to that building. The renderer consumes the existing `createCommonGearViewModel`, binds the existing equipment action attributes, and uses the existing server-response flow. The native slot filter preserves keyboard focus and bag scroll. Common rarity backgrounds remain gray when selected; the burgundy border shows selection. Long records scroll separately from the fixed action row.

The upgrade confirmation makes the underlying Treasury controls inert, keeps Tab within Cancel/Confirm, and restores Upgrade focus on Cancel or Escape. Pending actions disable both action buttons. Gold values retain exact whole-number display. Production builds include and fingerprint the dedicated renderer and stylesheet. These have bounded 16 KiB and 40 KiB budgets; existing shared gear limits are unchanged. No backend files are changed.

The portrait controller follows the game's effective Full/Reduced/Off mode, including automatic performance adjustments and system preference changes. It selects the still during confirmation and background visibility, removes listeners when the view is replaced or closed, and falls back to the still if the animation fails. Explicit game preferences retain their existing precedence. The 256×512 animation is 289,374 bytes; the 320×640 still is 64,010 bytes. Both are content-hashed, manifest-registered, and loaded when the Treasury opens; source sheets remain outside the production artifact. Their combined lazy payload fits within a bounded 320 KiB increase plus existing optimized-art headroom. The installed shell budget is unchanged.

Run `node tools/validate-treasury-gear-browser.js` for 25 live-renderer states across 1440×900, 1024×768, 844×390, 667×375, and 568×320. It checks control bounds, gray rarity surfaces, disabled and empty states, filter/selection/scroll, keyboard confirmation, mocked action failures and pending guards, an upgraded item response, Back/Close, and other-officer isolation. Screenshots and the report are saved to ignored `release-artifacts/treasury-gear/`.

Physical-phone touch verification remains a manual follow-up. Nothing in this document claims a production deployment.

The packaged base-client allowance increases from 25 MiB by one bounded 352 KiB step for the new animation and still. The measured artifact is 25.27 MiB before the separately measured prepared-world bundle. Source sheets and documentation remain excluded; world, combined-artifact, and installed-shell ceilings are unchanged.
