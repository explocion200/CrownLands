# Approved camp paintings — October 20, 2026

The owner approved the four generated transparent illustrations and requested
replacement of the map and UI images, including deletion of the superseded art.
`prompts.json` records generation intent. The source PNGs preserve the approved
images; `assets.json` pins their hashes and the four content-hashed WebP outputs.
Delivery uses the original transparent canvas, resized to 384 × 384 with Lanczos
and encoded as WebP quality 86, method 6, exact alpha. The four files total
191,706 bytes, with a maximum of 54,270 bytes. They load on demand.

Gold uses the yellow counting pavilion, Warband the burgundy military tents,
Relic the purple collectors' camp, and Deed the green surveyors' camp. Existing
camp dimensions, positions, ownership flags, timers, interactions and rewards
are preserved. The map, atlas, camp details, held-camp list and troop-order
preview all use the same painting for a camp type.

## Static publication boundary

`tools/sync-core-expansion-assets.js` projects only the four exact retired asset
paths from the canonical server catalog into browser presentation, using this
manifest. Browser asset hashes/version and lazy camp definitions are checked.
The source server catalog/layout and installed backend fingerprint remain
unchanged. The receipt hashes the projected browser catalog and the original
server layout independently. This lets compatible static publication deliver
art without a backend restart or a publisher-policy change.

The client retains the new camp landmark asset during server region-descriptor
refreshes, while accepting server positions and other properties. Held-camp
snapshots also resolve artwork through the current client catalog, including
before a map is loaded. This prevents old server presentation paths from
restoring deleted images after login.

Only the four superseded active Core camp sprite files are deleted. Historical
world images and the separate knight city-skin encampment decoration remain.
No player data or backend gameplay implementation changes are included.

## Verification

- `validate-camp-artwork.js`: approved/source/output hashes, four types, deleted
  files, exact presentation-only projection, canonical lazy camp data, sync
  consistency, unchanged server inputs and production packaging.
- `validate-camp-map-banners-browser.js`: all four map and details images at
  1440 × 900, 844 × 390 and 568 × 320; atlas and repeated old-server refreshes;
  unloaded held snapshots and both compact UI renderers; preserved ownership,
  flag styles, timer reuse, click/touch targets and zoom anchoring.
- Core release/topology and camp lifecycle validators cover shared dependencies;
  production and asset-budget gates remain required.

Screenshots and execution results are written to the ignored
`release-artifacts/camp-map-banners/` directory. Merge alone does not establish
publication; verify the live deployment commit and delivered asset hashes.
