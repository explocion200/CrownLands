# Faster troop selection — review and integration

Status: **APPROVED AND INTEGRATED; NOT DEPLOYED**. The September 25 design draft was approved for implementation on September 27, 2026. This folder remains an isolated synthetic review; the actual game implements the controls in `troop-orders-ui.js`, `troop-orders-ui.css` and the existing `game.js` order handlers. The confirmed rule is recorded in the Master Development Specification under Movement.

Open `docs/visual-qa/troop-selection/index.html` through a local HTTP server. The review offers desktop (1440 × 900), landscape (844 × 390), and small landscape (568 × 320), with Attack, Transfer, Reinforce, protected force limits, large armies, unknown intelligence, one troop, blocked targets, and unavailable routes.

## Interaction

- Tap the displayed count to enter an exact integer. Valid edits update the slider, source remainder, own attack power, and friendly arrival counts. Enter formats the count without submitting; Escape restores the count from the start of editing.
- 25%, 50%, and Max use the permitted troop limit, rounded down with a one-troop minimum. The protected-limit sample has 1,250,000 at source but permits 350,000; Max leaves 900,000 at source.
- Empty, malformed, fractional, negative, or excessive entries keep the last valid selection and disable the action until corrected. No silent clamping on typed input. A shortcut or slider movement recovers the input.
- Keep the existing parchment and illustrations, battle-power breakdown, scout-time disclosure, travel bonus/time, Swift March example, reinforcement warnings and fixed action footer. Landscape puts the shortcuts beside the count, retaining 44px minimum entry/button targets. Supporting detail scrolls inside the window.

## Scope and dependencies

The preview reuses `../troop-orders/preview.js`, its draft CSS, the pure Common Gear/attack-power helpers and approved asset files. `selection.js` extends their synthetic examples only. Sample routes and enemy forecasts remain fixed, as disclosed in the review. No Firebase, accounts, player data, troop dispatch, report generation or item consumption occurs. Native mobile keyboard behavior still needs physical-device review.

The integration uses the actual order's permitted send limit, refreshes routes for changed troop bands, preserves current warnings and source state, and routes controls through the existing selection/confirmation handlers. Shared Tower orders use the player's own stationed troops and existing permission checks. Live availability changes preserve the typed count and focus; an invalid count blocks dispatch, and recovery restores the intended count. Combat, travel, visibility, default-force, Rally and resource rules remain unchanged. The sample protected limit, destinations, counts, forecasts and timings are never used by the actual game.

## Verification

`node tools/validate-troop-selection-draft-browser.js` checks all three viewports, ten scenarios, exact/pasted input, Enter/Escape, invalid entry recovery, permitted-limit presets, slider synchronization, route retry, the non-submitting action and review controls. It verifies fixed action visibility, minimum hit-target sizes, horizontal fit, asset loads and zero external HTTP requests. Screenshots and JSON results are generated under ignored `release-artifacts/troop-selection/`.

`node tools/validate-troop-selection-browser.js` exercises the actual game with isolated benchmark data at the same three sizes: all three modes, exact input, presets, live limits and recovery, direct-submit guards, route-band refreshes and Rally compatibility. `node tools/validate-clan-tower-orders-browser.js` covers shared Tower controls, form Enter behavior, personal-garrison changes, permissions, dispatch payloads and retry protection. Browser tests use fixtures and block external HTTP requests. Actual-game screenshots are generated under ignored `release-artifacts/troop-selection-live/` and `release-artifacts/clan-tower-orders/`.

Visual review includes desktop Attack/Reinforce and landscape layouts. Native mobile keyboard behavior still requires physical-device review. Integration and passing checks do not establish a merge or live release; deployment remains a separate authorized step.

The broader `validate-rally-assembly-browser.js` is included in the pre-merge checks. Its previous hidden-button failure came from selecting War Room before optional Clan styles finished loading; first-render clan initialization then restored Overview. The fixture now waits for rendered navigation and clicks the visible tabs and assembly shortcut. It checks both first-load and already-loaded styles at all three sizes, retaining 44px hit-target and assembly-map assertions. The shared deferred-style loader is also validated. No runtime navigation or Rally rule change was needed.

Payload: the controls add about 11 KiB to the military presentation source, approximately 2.3 KiB gzipped, with no new artwork, dependencies or server capacity. Its module-specific artifact allowance increases from 128 to 140 KiB; overall offline-shell and asset performance limits remain unchanged and are validated.

September 27 reconciliation: refreshed the validation base after the Gear and stability updates. The shared troop-order preview now supplies the equipped weapon's `gearKey` to the revised Gear helper. Fixed arithmetic examples cover equipped, unequipped, stored, maximum-level and unknown-intelligence cases so the draft cannot silently lose its weapon bonus.
