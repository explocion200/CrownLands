# Core v2 QA-1 evidence index

QA-1 ran through the actual Crownlands runtime renderer in the supported in-app Browser against the isolated Firebase staging preview. No Core art or locked gameplay geometry changed.

## Primary receipts

- `benchmark-results/map/core-v2-qa-1/browser-permission-receipt.json` — local-origin permission diagnosis and staging safety proof.
- `benchmark-results/map/core-v2-qa-1/runtime/qa-1-summary.json` — consolidated runtime decision.
- `benchmark-results/map/core-v2-qa-1/runtime/browser-results.json` — per-map low/normal/close, collision, interaction, route, and density measurements.
- `benchmark-results/map/core-v2-qa-1/runtime/travel-summary.json` — complete 80-directed-side / 40-reciprocal-pair circuit result.
- `benchmark-results/map/core-v2-qa-1/runtime/travel-tail.json` — retained raw final 24 travel interactions.
- `benchmark-results/map/core-v2-qa-1/runtime/performance.json` — cold observations and nine representative warm performance samples.
- `benchmark-results/map/core-v2-qa-1/staging-site/__core_b1__/build-receipt.json` — isolated staging build receipt and project guard.

## Screenshot set

The runtime screenshot directory contains 65 PNGs plus four early diagnostic captures without an extension. It includes:

- normal runtime presentation for every one of the 25 Core maps;
- low/normal/close views for the Citadel, all four Supports, all four Strongholds, and all four Tower-reservation territories;
- the 25-tile Core Map UI (`map-ui-25-core.png`);
- the North-East Tower reservation overlap probe;
- selected-city, objective, route, label, banner, and troop-presentation evidence embedded in the per-map runtime views.

Directory: `benchmark-results/map/core-v2-qa-1/runtime/screenshots/`

Representative files:

- `core-v2-crown-citadel-p0-p0-low.png`
- `core-v2-crown-citadel-p0-p0-normal.png`
- `core-v2-crown-citadel-p0-p0-close.png`
- `core-v2-north-support-p0-m2-normal.png`
- `core-v2-east-support-p2-p0-normal.png`
- `core-v2-south-support-p0-p2-normal.png`
- `core-v2-west-support-m2-p0-normal.png`
- `core-v2-greybanner-hold-p0-m1-normal.png`
- `core-v2-swiftgate-p1-p0-normal.png`
- `core-v2-north-east-holding-tower-p1-m1-reservation-overlap-probe.png`
- `map-ui-25-core.png`

## Decision

`interactiveRuntimeQA = PASS_STAGING_SUPPORTED_BROWSER`

The external localhost permission defect remains recorded, but it no longer leaves Core QA unexecuted. The isolated staging preview supplied the supported Browser surface, and the full 25-map runtime pass completed. Production integration was not started.
