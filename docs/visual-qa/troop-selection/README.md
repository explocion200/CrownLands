# Faster troop selection — interactive draft

Status: **DRAFT FOR REVIEW**. Requested September 25, 2026. This is an isolated design proposal; no production entry point imports it and no game behavior or approved design rule is changed.

Open `docs/visual-qa/troop-selection/index.html` through a local HTTP server. The review offers desktop (1440 × 900), landscape (844 × 390), and small landscape (568 × 320), with Attack, Transfer, Reinforce, protected force limits, large armies, unknown intelligence, one troop, blocked targets, and unavailable routes.

## Interaction

- Tap the displayed count to enter an exact integer. Valid edits update the slider, source remainder, own attack power, and friendly arrival counts. Enter formats the count without submitting; Escape restores the count from the start of editing.
- 25%, 50%, and Max use the permitted troop limit, rounded down with a one-troop minimum. The protected-limit sample has 1,250,000 at source but permits 350,000; Max leaves 900,000 at source.
- Empty, malformed, fractional, negative, or excessive entries keep the last valid selection and disable the action until corrected. No silent clamping on typed input. A shortcut or slider movement recovers the input.
- Keep the existing parchment and illustrations, battle-power breakdown, scout-time disclosure, travel bonus/time, Swift March example, reinforcement warnings and fixed action footer. Landscape puts the shortcuts beside the count, retaining 44px minimum entry/button targets. Supporting detail scrolls inside the window.

## Scope and dependencies

The preview reuses `../troop-orders/preview.js`, its draft CSS, the pure Common Gear/attack-power helpers and approved asset files. `selection.js` extends their synthetic examples only. Sample routes and enemy forecasts remain fixed, as disclosed in the review. No Firebase, accounts, player data, troop dispatch, report generation or item consumption occurs. Native mobile keyboard behavior still needs physical-device review.

If approved for integration, use the actual order's authoritative send limit, refresh routes for changed troop bands, preserve current warnings and source state, and route all controls through the existing production selection/confirmation handlers. The draft does not establish new combat, travel, visibility, default-force or resource rules. Do not promote the sample protected limit, destinations, counts, forecasts or timings to production.

## Verification

`node tools/validate-troop-selection-draft-browser.js` checks all three viewports, ten scenarios, exact/pasted input, Enter/Escape, invalid entry recovery, permitted-limit presets, slider synchronization, route retry, the non-submitting action and review controls. It verifies fixed action visibility, minimum hit-target sizes, horizontal fit, asset loads and zero external HTTP requests. Screenshots and JSON results are generated under ignored `release-artifacts/troop-selection/`.

Visual review includes desktop Attack/Reinforce and landscape Attack/large counts. No Master Specification change, production integration, merge, or release is included in this draft.
