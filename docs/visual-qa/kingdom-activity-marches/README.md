# Kingdom Activity: Marches draft

Status: design approved and integrated for release, September 14, 2026. Deployment is recorded separately after verification.

Branch: `codex/kingdom-activity-marches-draft`.
Base: `35c7390e95fe6accfbe7e66702512543112a5fdd` (Scout Reports).

Open `/docs/visual-qa/kingdom-activity-marches/index.html?viewport=desktop&sample=standard` through the existing local server. Review controls provide desktop (1440 x 900), mobile landscape (844 x 390), and small landscape (568 x 320). Portrait is outside this game's design scope.

## Scope

This draft covers the Marches tab of Kingdom Activity, reached from Outgoing. The Rallies, Reinforcements, Camps, and Strongholds tabs are disabled context for separate reviews. The parchment window, existing medieval icons, full troop counts, and grouped item commands follow the approved ledger designs. A fixed header, tabs, and summary stay above the scrolling march list. Small landscape places force and commands beneath the route.

The draft retains order type, origin, destination and map, available target ruler and troop information, own troop count, arrival or server-pending status, current-position Map, and eligible Swift March Order and Recall Horn controls. Returning armies retain the original target and home destination. Large troop counts receive enough space to remain on one line without abbreviation.

Eight synthetic examples cover mixed marches, transfers and item controls, returning armies, pending states, long names and large forces, 18 marches, no items, and no marches. Timers are intentionally fixed. Item actions reserve a sample item immediately and simulate completion after 450 ms; Reset restores the example and invalidates unfinished callbacks. Profile and map controls explain their intended destinations. No account, storage, game runtime, or backend is connected.

## Integration references

- `game.js`: `showOutgoingAttacksModal`, `renderMarchesOperationPanel`, and `renderOutgoingAttackCard` provide the current modal, summary, and row information.
- `isSwiftMarchOrderEligible` and `isRecallHornEligible` remain authoritative for item eligibility. Fixture booleans only illustrate eligible and ineligible states; they must not replace those helpers during integration.
- Existing pending, checking, resolving, item-in-flight, and unknown troop-count states remain distinct. Swift uses the current remaining-time multiplier of 0.5. Recall timers and map names in this preview are fixtures, not travel calculations.
- `docs/CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md`: travel display, item definitions, and UI standards inform the draft. No gameplay rule or confirmed specification has changed.

## Reused art and styling

Shared approved assets: `assets/icons/battle-reports-ledger-r1.svg`, `assets/icons/skills/marchOrders.svg`, `assets/icons/daily-login-troops-r1.svg`, `assets/optimized/item-swift-march-160x160-e857cc4d8977.webp`, and `assets/optimized/item-recall-horn-160x160-b261d10e9c8b.webp`.

The isolated styles import the existing Battle Report Detail draft's frame and review styling. No shared stylesheet, image, game file, or build output was modified.

## Approved runtime integration

The game now renders the approved Marches structure through the existing `renderOutgoingAttacksModalContent`, `renderMarchesOperationPanel`, and `renderOutgoingAttackCard` functions. The header and scroll/focus helpers live in `marches-activity-ui.js` to keep the main game script within its size budget. The helper and scoped `marches-activity-ui.css` are included in the entry point, production artifact, and client fingerprint. They use the existing service-worker runtime cache rather than expanding the install-time cache. The other operation tabs and profile navigation retain their existing layouts.

The renderer uses current shared Shop item art (the 384-pixel Swift and Recall assets), projected inventory counts, and the existing eligibility and dispatch handlers. `patchMarchItemActionUi` refreshes the ledger so pending updates retain images, disable both item actions on the affected army, and refresh the inventory header. The list retains scroll and focused controls through snapshot replacement.

Run `node tools/prepare-marches-preview.js` against the existing loopback benchmark server to prepare an actual-game preview under ignored `release-artifacts/marches/`. Its `runtime-fixture.js` supplies synthetic snapshots and intercepts item dispatch without contacting production. Existing location interpolation is exercised with incomplete fixture routes only; its syncing fallback is expected. A held Stronghold keeps the empty Marches example valid while the existing all-operations-empty auto-close rule remains unchanged.

See [visual-checks.md](visual-checks.md) for completed local checks. The release handoff records required gates, PR, merge, synchronized main, and verified deployment channels.
