# Map Selector atlas draft

Status: **DRAFT — awaiting design approval**. Continues the user-requested Leaderboards + Map Selector UI review batch on `codex/leaderboard-ledger-draft`. The Leaderboards design is approved; neither panel is integrated or released.

Review `/docs/visual-qa/map-selector-atlas/index.html?viewport=desktop&sample=standard`. Desktop is 1440 × 900; mobile landscape 844 × 390 and small landscape 568 × 320. No portrait game layout.

## Current-world evidence

Client and Functions release contracts identify `crownlands-2026-09-monthly-sharded-realms-v1` / `core-expansion-v1`. Read-only Firebase CLI authenticated GETs verified `realmConfig/current` and `realmGenerations/realm-2026-09/expansion/current`: `main-realm-2026-09`, shared realm `shard_0001`, 25 Core maps plus 36 activated New Lands maps, including the first 12 maps of layer 2. No player data was read or changed. `snapshot.js` records the activation ID allowlist and verification time.

Only those 61 active catalog maps render. Their names, coordinates, thumbnails, landmark sprite registrations and reciprocal open edges come directly from the packaged current-world catalog. Inactive prepared maps are excluded. Counts, current-map and home-map assignments are fictional preview fixtures. The snapshot is review evidence, not a new production activation source; runtime integration must continue consuming the authoritative expansion subscription and dynamically materialized catalog.

## Presentation and interactions

The parchment frame matches the 1200 × 700 desktop ledger cap. A pan/zoom canvas sits beneath fixed Current/Home shortcuts, Whole realm, zoom controls and a Tower/Camp/Stronghold legend. Current-map olive labels and home labels remain independent of royal red trim, Tower green outer trim and Camp light-gold inner trim. Existing thumbnail composition preserves the 1448 × 1086 landmark registration.

The revised tiles enlarge the thumbnail area from 100 to 126 pixels at normal detail zoom, with tighter name/count rows inside the same 238 × 179 tile footprint. The complete map remains visible without cropping or stretching. Dark green outer Tower frames, light-gold inner Camp frames with brown keylines, and stronger red royal frames pair with matching text badges and legend swatches. Trim weight increases as the atlas zooms out; keyboard focus uses a separate dashed outline and does not replace the Tower frame.

The ornamental revision adds original SVG frames in `frames.js`: green masonry with battlement corners and a tower shield; riveted brass Camp fittings with a tent seal; crimson royal frames with gold scroll corners. Each Stronghold crest uses its specialization icon from the approved Strongholds ledger: a troop helmet for Greybanner Hold (Training), a gold coin for Aurum Keep (Gold), a marching standard for Swiftgate (Movement), and a shield for Ironwatch (Defense). Only Crown Citadel retains the gold crown crest. Lower corners stay clear of captions. Overlays are decorative and ignore pointer input; the established color trims remain visible when fine ornament is hidden at Whole realm overview scale. Tile positions, artwork registration, caption space and window dimensions are unchanged.

Map selection retains direct entry; the draft opens a disclosed local map preview with a return button. Dragging does not select a map, and a subsequent distinct tap/click can select. Wheel/pinch zoom, button zoom, mouse/touch pan, keyboard neighbor navigation, Enter selection, Close/Escape/Reopen and responsive resizing are included. Mobile opens closer for readable names; Whole realm fits the current footprint, with labels intended to be inspected at closer zoom. Header/footer summaries keep full names and details available at overview scale.

The camera here is a standalone mock: closer mobile framing, explicit navigation buttons and a fit-to-all overview below the current runtime’s 0.18 zoom floor are proposed presentation behavior for approval. Runtime integration must use and carefully extend the existing tested camera controller, preserving anchored gestures, clamping, drag-click suppression, direct selection, live activation and map-load authority. No draft camera code or snapshot data should be copied into the game unchanged.

Examples: Heartlands, current Home map, outer New Lands frontier, unknown city counts labeled Syncing, and failed map opening. The failure example retains the current map and displays retry guidance. The page never imports `game.js`, Firebase, player state or any persistence API.

## Inspected contracts

- Master Specification Core world/automatic New Lands, map feature trims, and section 17; Art Bible material/color language.
- `game.js`: `getIslandTileSummaryText`, grid coordinates/layout/positions, `renderIslandMapConnections`, `renderIllustratedMapThumbnail`, `renderIslandMapTile`, `renderIslandSwitcherModalContent`, camera/gesture functions and `switchOnlineIsland`.
- `holding-tower-ui.js` map feature badges and `tools/validate-map-picker-input.js` drag, tap, post-drag click, keyboard and zoom contracts.

Production implementation, Master Specification presentation updates, `prepare-pr` and required release gates remain deferred until approval. This draft is not ready to merge and no deployment is authorized by it.
