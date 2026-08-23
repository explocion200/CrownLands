# Item Bag / scalable Shop reconciliation

The approved Item Bag commit `57e90dea` was rebased manually onto the fetched
`origin/main` commit `6c2922c59ff4f69a6cdb511d95f8273d53d74553`.
The prompt's earlier main reference, `a70b8fd1`, had advanced before this work
started. The newer base adds five current-world maps, so its authoritative route
baseline is 20 maps and 1,185 cities.

The reconciliation uses one delivery stamp:
`20260823-item-bag-shop-reconcile-r1`.

## Conflict record

| File | Conflicting concern | Preserved from current `main` | Preserved from approved Bag commit | Final reconciliation |
| --- | --- | --- | --- | --- |
| `functions/package.json` | Overlapping `pretest` command | Scalable Shop validator and all current scripts, including Clan Heraldry | Item Bag validator | Kept both validators in the existing test order without dropping any current script. |
| `game.js` | Shared Shop/Bag state declarations | Shop selection and authoritative scalable-pricing snapshot | Bag category, page, per-copy selection, paging direction, swipe suppression, and horizontal-input state | Declared both state groups; retained current Shop helpers, pricing ingestion, carousel, limits, cooldowns, and availability behavior around the approved Bag renderer. |
| `index.html` | Build stamps in the current page shell | Complete current shell, script order, Clan Heraldry content, and 20-region copy | Cache-busted delivery of the changed Bag CSS/runtime | Kept current main structurally and retagged only the changed delivery assets with the unified build ID. |
| `instant-economy-actions.js` | Purchase settlement and local purchase logging overlap Bag selection resets | Authoritative quoted/returned unit price, scalable reservations, computed local price, current Shop DOM patching, and price revalidation | Clearing stale per-copy Bag selection plus projected item use, rapid queueing, server reconciliation, and rejection rebuild | Kept every scalable-price path; added only the Bag presentation-key reset to purchase settlement and retained the approved item-use projection/rollback additions. |
| `service-worker.js` | Cache version and changed asset URLs | Current cache list, map/runtime strategy, and asset order | Unified Bag asset delivery and removal of `chat-ui.js` from install precache | Retagged only changed assets and omitted chat from install precache; chat remains page-loaded and runtime/network cached. |
| `tools/validate-common-gear.js` | Runtime build-stamp expectation | Current Common Gear validation and stylesheet stamp | Reconciled runtime delivery stamp | Updated only the Common Gear/game runtime stamp assertion. |
| `tools/validate-crownlands-palette.js` | Release/cache IDs | Current validation logic and 40 KiB palette budget | Bag palette changes | Updated release/cache IDs only; retained the raised current budget. |
| `tools/validate-inner-castle.js` | Game build ID | All current Inner Castle checks | Reconciled Bag runtime delivery | Updated only the game build ID. |
| `tools/validate-login-resilience.js` | Game build ID | Current Firebase client build ID and login checks | Reconciled Bag runtime delivery | Updated only the game build ID. |
| `tools/validate-mobile-ui-viewport.js` | Release/cache IDs | All current viewport checks | Bag landscape overrides and delivery | Updated release and cache IDs because the approved Bag changes `mobile-viewport.css`. |
| `tools/validate-objective-action-buttons.js` | Service-worker cache ID | Current objective-action release ID and checks | Reconciled cache generation | Kept its feature release ID and updated only the cache version. |
| `tools/validate-pass-3f-items.js` | Game build ID | Current item definitions, source-size budget, and asset checks | Reconciled Bag runtime delivery | Updated only the game build ID. |
| `tools/validate-ui-readability.js` | Game build ID | Current readability release ID and all checks | Reconciled Bag runtime delivery | Kept its feature release ID and updated only the game build ID. |

## Shared-runtime decision

There is no design incompatibility between the systems. Current main remains
authoritative for scalable Shop pricing, purchase validation, cooldowns, limits,
availability, and Shop selection/purchase behavior. The Bag remains a
presentation and interaction layer over the same seven authoritative item types.
It does not add Gold Boost or Troop Boost inventory records; the existing
`troop_boost_1h` compatibility alias continues to normalize to War Drums.

## Release-gate follow-through

The first reconciled asset-budget check found `game.js` 5,013 normalized bytes
over its fixed 1,620 KiB limit. Without changing Bag behavior or raising a
budget, the Bag's model, card-rendering, and horizontal-input helpers were moved
to the already-loaded `instant-economy-actions.js` controller. The final sizes
are 1,658,353 normalized bytes for `game.js` (limit 1,658,880) and under 39 KiB
for the controller (limit 64 KiB). `showInventoryModal` remains in `game.js`;
all markup, event thresholds, paging, selection, projection, and Shop pricing
paths are unchanged.
