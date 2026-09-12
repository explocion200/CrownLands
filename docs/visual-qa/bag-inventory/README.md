# Item Bag presentation draft

Status: **APPROVED — runtime integration complete; release validation in progress.** The user approved the Bag and requested the new Gear Box image, merge, and deployment on 12 September 2026. Work remains on `codex/bag-inventory-draft`. This folder is an isolated review; the live game uses the new `item-bag-ui.js` and `item-bag-ui.css` instead. A merge or deployment will be reported only after it is verified.

Open `index.html` through the repository preview server:

http://127.0.0.1:61703/docs/visual-qa/bag-inventory/index.html?viewport=landscape

## Proposed presentation

- Continue the approved parchment, olive, muted brass, dark ink, and burgundy selection palette. Engraved category symbols follow the previous equipment drafts.
- Retain the eight-position, four-by-two item grid. Seven current item types occupy seven positions in the All example; the last position is decorative empty space, not a new item or a capacity restriction.
- Place the item grid on the left and a larger selected-item illustration, full name, category, description, and effect on the right. Selection uses a burgundy border and diamond marker.
- Fix owned quantity and Use/Open at the bottom of the selected pane. Active time remains visible in the pane heading as well as its details. Long details scroll independently of the actions.
- Match the recent Common Gear Box window dimensions: up to 1200 × 790, with 12px outer clearance on smaller screens. Review targets are desktop 1440 × 900, landscape 844 × 390, and small landscape 568 × 320. No portrait layout is proposed.
- On the smallest landscape screen, the selected illustration sits beside its title to leave room for the description. Category labels remain; decorative category glyphs are omitted at that size. All active controls retain at least 44 × 44 CSS pixels.
- The Common Gear Box now uses `assets/icons/common-gear-chest-r1.svg`, a static export of the approved animated chest's closed pose. The same item definition updates its existing Shop icon. Other item illustrations carry forward. No new raster artwork is included. Bag consumables and unopened boxes have parchment wells, with no invented rarity classification. The approved gray Common-equipment backgrounds in other screens are unaffected.
- Quantity badges use the existing game's compact number format. The selected pane and accessible tile names show the exact sample quantity.

## Existing information and actions retained

`snapshot.json` records all seven current item definitions and the source commit. Labels, descriptions, category membership, icon paths, duration values, and boost percentages come from `game.js`, `instant-economy-actions.js`, and `economy-config.js`. For example, the current War Drums value is 30%, not the 5% fallback in the client definition.

The Master Specification's Shop and Items / Item behavior section requires All, Boosts, War, Defense, Utility; identical-item quantity grouping; eight visible positions; and paging/navigation. Those rules are preserved. The confirmed Item Bag presentation is recorded in the Master Specification alongside this approved integration.

| Item | Category | Existing Bag action |
| --- | --- | --- |
| Common Gear Box | Utility | Open leads to the approved box screen; the chest action there spends one box |
| Royal Peace Shield | Defense | Use; unavailable while already active |
| War Drums | Boosts | Use; another copy adds duration to the active timer |
| Royal Tax Decree | Boosts | Use; another copy adds duration to the active timer |
| Veil of Silence | Defense | Use; unavailable while already active |
| Swift March Order | War | Use leads to Outgoing Marches to choose an eligible march |
| Recall Horn | War | Use leads to Outgoing Marches to choose an eligible march |

The runtime's eligibility checks, server authority, optimistic quantity reconciliation, retry behavior, and outgoing-march selection remain implementation requirements after approval. This draft does not replace them.

## Review interactions

- Click a tile to inspect it. Category changes clear the selection, matching the current Bag. Left/right keys change category tabs; Home/End also work in this draft.
- Paging arrows, horizontal wheel, swipe, and viewport arrow keys retain page navigation. Current canonical data has seven unique stacks, so ordinary examples correctly have one page. No extra item types are invented to populate another page.
- Use simulates one quantity change and the matching duration. A second use of a stackable boost extends its timer. Using the last copy removes its tile and moves to the next available selection, or the empty state.
- Open and the two march items report their existing destination in the review status beneath the preview, without consuming a sample item. Open also exposes a link to the already approved Common Gear Box draft. Those handoff notices belong to review controls, not the proposed game UI.
- The Example control includes all items, unselected, active Shield, active boost, last item, empty category, empty Bag, large quantities, slow use, and a failed-use/retry example. Reset restores synthetic data. Closing/reopening the draft retains its sample state.
- No game scripts, account integration, storage persistence, production mutations, or new gameplay are involved. Fetch is limited to the local reference snapshot and existing presentation assets.

## Validation completed

Focused checks on Node.js 22 and disposable Chromium passed:

- JavaScript syntax and 30 layout combinations across the three review sizes.
- Window and control bounds, 44px controls, four-by-two positions, complete item names, no page/dialog overflow, and no browser exceptions or missing assets.
- Full descriptions and effect strings for all seven items; correct category filtering and selection clearing.
- Active non-stackable item disabling; active-boost duration addition; last-item removal; empty states; failure and retry; duplicate-click prevention; cancellation of an old sample action after reset.
- Non-consuming box/march handoffs, close/reopen, keyboard category navigation, and review controls.
- Page capacity was checked using explicitly labelled QA-only duplicates in a disposable browser. These are not in the committed snapshot or normal review examples.
- Desktop and landscape screenshots were visually inspected. Inspection caught and corrected artwork/label overlap that simple bounding checks did not detect, and confirmed the smallest-screen layout and large quantity badges.

Local screenshots and detailed verification output are kept in the ignored `release-artifacts/bag-inventory/` folder. Physical-device touch remains a manual check.

## Runtime integration

The new renderer preserves the existing `showInventoryModal`, item definitions, quantity grouping, category/paging state, activation queue, server reconciliation, and Gear Box/march handoffs. New CSS is scoped to the Bag modal. A one-second presentation refresh runs only while that Bag view is active and is disposed on close, replacement, or account-state change.

Actual-game browser coverage is in `tools/validate-item-bag-browser.js`: 24 desktop/landscape states, image loading, artwork/label bounds, 44px actions, category/paging/keyboard use, exact descriptions, active-timer expiry, queued quantity/time updates, repeated boosts, last-copy use, rejected last-copy restoration/retry, non-consuming march handoffs, Bag → Gear Box → Bag, and cleanup. All account/API inputs are synthetic. The test server's unrelated public `/play/?updateCheck` probe is excluded from missing-asset checks; actual presentation resources must load successfully.

Release preparation must pass the repository's required local and GitHub gates before merging. Publication requires exact-build and actual-screen verification on web and itch.io. No backend code or production data is changed by this update.
