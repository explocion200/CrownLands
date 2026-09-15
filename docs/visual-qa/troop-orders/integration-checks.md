# Combined military UI integration — September 15, 2026

Branch: `codex/kingdom-activity-camps-strongholds`. The user approved Camps, Strongholds, Attack and Transfer, including the olive marching-banner handle, and authorized merge/deployment.

## Implementation

- Held objectives use existing ownership snapshots, sorting, current bonus configuration, timer authority, and close-and-locate handlers. The ledger preserves focus/scroll after structural refreshes. Zero current garrison does not fall back to a stale troop count.
- Troop Orders moves the existing DOM controls into the approved shell before their original event listeners are attached. Existing send, protection limits, route refresh/retry, item eligibility, reinforcement capacity and Rally contribution paths remain authoritative. No server or gameplay formula changes.
- Own attack power uses the authoritative forecast even when enemy intelligence is unavailable, falling back to a clearly labeled local estimate when needed. Only base power, Swordmastery and equipped attack Gear contribute. A local item whose percentage differs from the forecast is not misidentified as its source.
- Production assets, source fingerprints and artifact requirements include both modules/styles and the two slider SVGs. Drafts and mock fixtures are excluded from the production client.

## Focused evidence

- `node tools/validate-military-ui.js`: 200 rendered totals match the actual server launch-snapshot function across troop sizes, Swordmastery levels, all five weapon levels, and equipped/stored states. Stale local item labels and estimate disclosure pass.
- `node tools/validate-active-operations.js`: all four camp types before map loading, cross-map deduplication, loss/removal, ownership filtering, active/Syncing/Resolving states, and authoritative zero garrison pass.
- Existing combat-forecast, coordinated-release and interaction-health validators pass.
- Actual-game loopback harness (`node tools/prepare-military-ui-preview.js`) verified at 1280×720, 844×390 and 568×320 through the browser. Artwork loads, the held-objective list scrolls without horizontal overflow, and order actions remain fixed. Transfer range input and Swift March toggle update values; route failure disables Confirm; missing Swift March inventory disables its switch; Rally contribution input updates the slider and summary.
- No real player order was sent or production item consumed during local verification. The harness intercepts only final actions and uses synthetic snapshots/mock services.

Required release validation, PR checks and the production build identity must still pass and be recorded before claiming deployment. The local harness does not establish authenticated production mutation results or itch.io parity.
