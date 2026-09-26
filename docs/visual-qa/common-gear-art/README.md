# Common equipment artwork

The approved Common set replaces all 32 gear item illustrations in the current game. A shared SVG viewport displays each original WebP bitmap at a consistent visible size across slots, bag tiles, selected-item details, upgrade confirmation and chest rewards. This is bitmap presentation, not vector replacement art.

## Scope and delivery

- Four officers × eight slots; Common remains the only implemented rarity, with its existing five levels.
- Small views use 192px WebPs. Only the selected-item detail view requests its 384px image. No gear bitmap is added to startup preloading or the service-worker installation list.
- The source PNGs are copied unchanged from the selected generated masters. Source checksums and derivative checksums are recorded in `assets/optimized/manifest.json`.
- The complete source canvas, including its alpha, is retained in the delivery encoding with safety padding. The shared viewport fits the visible bounds to 84% of a square; extremely faint exterior alpha can lie outside the viewport. This keeps framing consistent in rectangular equipment controls as well as square cards.
- Production ships exactly 64 current gear derivatives. Older comparison derivatives remain in the repository but are excluded from the production build. Higher-rarity artwork remains in the external review collection.
- Battle-report gear emblems and the unequipped troop-order fallback reference the new icons too; the release validator checks every packaged asset reference.
- Existing bonuses, costs, upgrade behavior and authority logic are unchanged. `functions/common-gear.js` receives only the same artwork-path replacements as the browser's shared definitions.

The refreshed icons and details add 1,232,808 bytes to the optimized-art manifest compared with `c66fd0f`. This is an increase in available artwork, with detail images loaded on selection; it is not a claimed loading-speed or FPS improvement. PNG source masters are not deployed.

The release budget allows 1216 KiB for that image increment and 16 KiB for framing/metadata, with a separate 1376 KiB ceiling on the complete set of 64 gear images.

## Visual review

| Surface | Desktop | Short landscape |
|---|---|---|
| Barracks | [1440 × 900](barracks-desktop.png) | [568 × 320](barracks-mobile.png) |
| Treasury | [1440 × 900](treasury-desktop.png) | [568 × 320](treasury-mobile.png) |
| Gatehouse | [1440 × 900](gatehouse-desktop.png) | [568 × 320](gatehouse-mobile.png) |
| Royal Stables | [1440 × 900](royal-stables-desktop.png) | [568 × 320](royal-stables-mobile.png) |
| Chest rewards | [1440 × 900](rewards-desktop.png) | [568 × 320](rewards-mobile.png) |

The existing browser suites passed 25 states per officer plus 20 chest states (120 total) at 1440×900, 1024×768, 844×390, 667×375 and 568×320. They cover selection, bag filtering/scroll, empty/max/pending/error states, upgrade confirmation and focus, equipment actions, character containment, motion preferences, and visible controls. Tests use synthetic accounts and local API stubs. Representative desktop and landscape captures were visually inspected after integration.

At the smallest icon sizes, fine details and the thin Lance remain difficult to read from the picture alone; the existing equipment names and slot labels remain visible. These are Chromium viewport checks, not physical Android/iOS device measurements.

## Validation

`validation-plan.json` records the exact base, complete changed-path coverage and focused tests. Local checks include the five browser suites, Common Gear definitions/gameplay, the new image/frame integrity validator, asset budgets and the production build. GitHub runs the selected battle-report gear emulator suite to guard shared-definition consumers. All three mandatory GitHub checks must pass before merge.

The first validation pass also found stale baseline assertions on `main`: the Barracks test still expected the old 75% cap instead of the existing 90% rule; the asset reference check omitted public pages and three already-replaced HUD images; cache and several entrypoint budgets had not accounted for merged work since `eb6c5ac`. Those test expectations now reflect the existing implementation with bounded allowances. No cap, HUD art, startup list, `game.js`, `styles.css`, Skills stylesheet or Firebase client behavior was changed to address them.

## Updating the artwork

`node tools/import-common-gear-art.js <reviewed-package-directory>` validates and copies the selected Common source and delivery files, updates both shared definition copies, the asset manifest and the generated framing table. It does no image processing and never imports higher rarities. The manifest's prepared-delivery entries protect accepted padding/framing from being replaced by the legacy optimizer path; changed source or output hashes require a reviewed reimport.

Implementation branch: `codex/common-gear-artwork`. Merge and deployment are separate, authorized release steps. This document does not mark the artwork live.
