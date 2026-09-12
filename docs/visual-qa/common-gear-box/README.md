# Common Gear Box · Opening and reward draft

Status: **design and clickable chest approved; runtime integrated, release validation pending** on `codex/common-gear-box-draft`. The user authorized push, merge, and deployment on 12 September 2026. This folder remains an isolated demonstration with sample inventory. The live-game implementation is in `common-gear-box-ui.js` and `common-gear-box-ui.css`; publication requires separate verification.

Open `index.html` through the local preview server. The review offers Desktop (1440 × 900), Mobile landscape (844 × 390), and Small landscape (568 × 320). Portrait is not a design target. Examples cover five unopened boxes, existing rewards with more boxes, the last box, an empty inventory, a slow response, and an initial or repeated opening that fails once. Replay resets the demonstration to five boxes and opens the first one.

## Presentation and interaction

- Parchment, muted olive actions, oak and iron chest details, and light gray Common reward cards follow the approved officer screens. The dialog uses their maximum 1200 × 790 desktop dimensions and fits both landscape viewports. Footer actions remain visible; long item details can scroll within their cards on the smallest viewport.
- `chest.js` contains an original code-native SVG illustration. The chest lid rotates about its back hinge, with wood grain, iron bands and rivets following the geometry. Full motion uses a brief unsealing movement, a 900 ms eased lid opening after the simulated response, and a staggered reward reveal. Reduced motion replaces movement with a short fade; Off displays the result directly. System reduced-motion preferences are honored, including when Full is selected. No perpetual animation is used.
- Clicking or tapping the chest, using Enter/Space on the focused chest, and pressing Open Box accept the same single opening. Pending controls prevent duplicate submissions. Each successful demonstration receipt yields exactly three Common Level 1 pieces. The next action is **Open Another Box**, with the remaining count visible in both the header and button.
- Each subsequent click opens exactly one more box. At zero, Open Another Box is removed; Equip Later and Go to Inner Castle remain available. A failed attempt does not spend a box or replace prior rewards and offers Try Again. Closing and reopening retains any accepted demonstration receipt without opening another box. Reset explicitly restores synthetic examples and cancels stale demonstration callbacks.
- The native dialog supports keyboard focus and Escape. Navigation buttons only dismiss the preview and identify the selected destination; they do not navigate the game.

## Sources and preserved rules

Based on repository commit `71b58173d054d04bb8ac46f035c94459437f6164`. The draft loads the existing `common-gear.js` definitions read-only and uses deterministic sample groups, existing item art, officer names, building names, slots, stat scopes and the Level 1 +0.25% bonus. The officer name is shown above the item name, preserving the information in the current reveal cards. Common backgrounds remain `#d9dad6`.

The Master Development Specification remains authoritative: actual opening is server-authoritative and produces exactly three server-rolled Common Level 1 pieces. This draft does not alter rewards, probabilities, levels, balance, acquisition, progression, or persistence. It does not perform random rolls or call the account API.

The approved runtime integration uses the existing `openCommonGearBox` action and the returned authoritative inventory/count. Presentation must never create items or decrement real inventory independently. Each deliberate new opening needs its own request identity; retries after uncertain responses must preserve the existing idempotency contract. Repeated opening should remain one user-requested box at a time, with pending/error handling and the accepted receipt independent of the animation or dialog lifetime. The current runtime animation preferences also need to drive the integrated presentation.

## Focused draft verification

Passed 12 layout states across desktop and both landscape sizes, checking viewport containment, no page/dialog overflow, visible actions at least 44 pixels wide and high, three gray reward cards, and real item images/details. Interaction checks covered five sequential openings down to zero, duplicate-click guarding, initial and repeated failure/retry, last-box focus, close/reopen, pending reset cancellation, actual hinged-lid geometry, Reduced/Off/system reduced motion, and review-page controls. No browser exceptions were observed.

Visual review included desktop opening, landscape opening mid-animation and rewards, and small-landscape ready/reward/error states. Disposable browser helpers, screenshots, and results are stored locally under ignored `release-artifacts/common-gear-box/`. Physical-device touch and the live server-backed flow remain untested because this is a synthetic draft. The isolated draft checks do not establish release readiness or deployment.

## Runtime integration and release verification

The scoped runtime consumes the existing server action and authoritative gear snapshots. Both chest and footer controls share one pending lock. Confirmed results display the returned three item identities; the count comes from the current authoritative gear state. Interrupted responses retain the original request identity for explicit retry, including after closing/reopening, and can recover a last-box result when the latest profile count is already zero. A confirmed operation clears its identity before a subsequent deliberate opening. Closing or navigating away never reopens the result panel; account changes and newer profile snapshots are protected from stale results. No new API or backend rule is introduced.

The actual-game browser check passed 20 states across 1440 × 900, 1024 × 768, 844 × 390, 667 × 375, and 568 × 320. It covers chest and button input, keyboard activation, five openings to zero, exactly three pieces per receipt, duplicate input, lost-response replay, repeated failure feedback, closing and navigation during a request, account/snapshot freshness, motion modes, gray cards, and visible 44-pixel controls. Common Gear, Inner Castle, item-art, and asset-budget checks passed. Release validation also runs syntax/lint on the new module and includes the integrated browser check.

Production packaging includes only the two new runtime files, bounded at 24 KiB each, with no new raster assets. Original item art and the isolated review stay intact. A release receipt under ignored `release-artifacts/common-gear-box/` will record required checks, merged commit, synchronized main, and verified web/itch.io publication. Physical-device touch and real production-account box consumption remain manual; automated browser checks use synthetic receipts.
