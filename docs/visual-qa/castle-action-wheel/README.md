# Castle action menu — approval draft

Status: local draft, awaiting owner approval. Do not merge or deploy this proposal yet.

Open `index.html` through the loopback-only map benchmark server:

```sh
node tools/map-benchmark/server.js --port=8802
```

Visit `http://127.0.0.1:8802/docs/visual-qa/castle-action-wheel/index.html`.

The owner requested larger, less cramped castle controls, with the half-circle outside the castle artwork. This isolated sample reuses current Core terrain, all five city stage paintings, current action-button CSS, and existing icons. All city names/owners/costs are fictional examples. No live game code boots, no credentials or player data load, and no action sends a command. Only local assets and icon definitions are fetched. No assets are regenerated.

Proposed treatment:

- Revised after owner feedback that the first draft was too large: desktop buttons are 56 px with 10 px labels; landscape phone buttons are 44 px with 8 px labels. Keep the existing hexagon, colors, icons and costs. Add an Info label for clarity.
- Restore the original open ellipse (142:118 aspect ratio), gold stroke, Level/Send at the sides, Info below, and Regroup/Nearby above the sides. The arc clears actual opaque castle artwork by 6 px on PC or 4 px on phone; transparent image corners no longer force it outward. Buttons retain that clearance from the entire sprite box and at least 2 px between their hit areas. The local draft reads its existing sprite alpha pixels only to calculate clearance; no artwork is edited.
- Castle stages retain their existing 60/70/80/90/100% footprint progression. The sample uses current close/middle/widest map zoom ratios.
- Selected buttons remain readable at lower zoom. This is a **proposed exception** to the Master Specification's October 21 proportional selected-control sizing rule, not a confirmed change. The specification is intentionally unchanged pending approval.
- Owned, enemy and ally menus can be inspected. Escape or a background tap dismisses the draft menu; clicking the castle selects it again. Buttons only display a preview message.

This is a layout draft, not an integration test. It does not implement game camera anchoring, edge-of-screen camera adjustment, crowded-map occlusion or real action permissions. After approval those need validation in the actual renderer, preserving zoom/deselection behavior and all gameplay rules.

Validation: `node tools/validate-castle-action-wheel-draft.js`. Covers 135 combinations (three viewport sizes, three ownership types, five city stages and three zoom fractions), image loading, painted-arc/sprite clearance, original elliptical shape and action positions, castle/button clearance, label bounds, hit targets, local-only requests, mouse/touch/keyboard interaction, review controls and resize. Screenshots and measurements are written to ignored `release-artifacts/castle-action-wheel-original/`.
