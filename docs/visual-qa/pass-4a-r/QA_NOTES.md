# Crownlands Pass 4A-R QA Notes

## Rollback Sources

- Committed baseline immediately before the cumulative visual passes: `f4604e98824d57e1f27fc9a3f8bcb014519366d0`, dated August 11, 2026, `Set Gear Box price and fit artwork (#117)`.
- All 15 restored regional map masters match the files preserved under `docs/visual-qa/pass-4a/old-assets/` byte-for-byte.
- The five root legacy maps and pre-Pass-4A cloud master match their rollback archives byte-for-byte.
- Leaderboard, Daily Rewards, Profile frame, and Reports match their pre-Pass-3G QA sources and the corresponding Git blobs byte-for-byte.
- No broad Git revert or reset was used.

## Art Restored

- Regional maps: Crownlands Heart, West Marches, East Reach, North Frontier, Southfields, Graywood Hollow, Greenrook Vale, Lowroad Vale, Stonebrook Farms, Goldmere Plains, Bandit Wastes, Ironfall Hills, Redbanner Fields, Ashenfen March, and Relic Vale.
- Legacy editor compatibility: `center-island.webp`, `west-island.webp`, `east-island.webp`, `north-island.webp`, and `south-island.webp`.
- Transition: `assets/map-transition-clouds.png` and `assets/optimized/map-transition-clouds-448x448-a17eebc9852d.webp`.
- HUD: `assets/leaderboard-icon.png`, `assets/daily-reward-icon-cutout.webp`, `assets/profile-hud-frame.png`, and `assets/report-icon.png`, plus their current optimized derivatives.

## Map And Thumbnail QA

- All 15 masters remain 1448x1086 opaque WebP and match their exact rollback hashes.
- All 15 normal thumbnails preserve the exact pre-Pass-4A 420x315 contract. All 15 content-hashed thumbnails are byte-identical to their normal counterpart, and every active reference uses the current fingerprint.
- World IDs, dimensions, region JSON paths, adjacency, route intervals, object coordinates, blockers, and gameplay data were not changed.
- Pass 4A art remains only in `pass-4a-assets/` for development comparison.

## HUD And Arrow QA

- Profile, Leaderboard, Clan, and Daily Rewards wrappers now have transparent backgrounds, no border, and no box shadow.
- The restored art provides each control's visible structure. Desktop hit sizes are 100x78 for Profile and 56x56 for the other three controls. Android landscape retains the same practical targets.
- Previous arrow treatment used `scale(1.14)`, blue 9px/16px drop shadows, and a blue/yellow bloom extending beyond the marker.
- Corrected treatment uses `scale(1)`, a 4px `rgba(216,199,161,.58)` highlight, a 2px warm radial bloom using `#D8C7A1` and `#CBB78F`, and an 88% icon inside the unchanged 92x92 hit target.
- Live captures cover dark wet/wooded terrain and lighter field terrain. The arrow remains crisp and readable without a dominant aura.

## Readability QA

Authenticated live data was reviewed for:

- Profile and Overview
- Skills and presets
- Clan overview
- Shop and Bag
- Attack preparation and troop slider
- Battle report list and detailed attacker/defender data
- Daily Login, Daily Missions, and Seasonal Achievements
- World HUD, map navigation, and Reports

Parchment surfaces use dark ink around `#211C16`/`#33291F`. Dark timber, iron, oxblood, and military surfaces use warm ivory `#F1E6CC` with secondary copy at `#D8C8A8`. Decorative font use remains concentrated in headings; detail copy uses the UI font. Major nested-card architecture was retained where it conveys distinct report/command structure, while the four unnecessary top-HUD outer cards were removed.

The live pass found and corrected four specificity conflicts: skill summary text, Clan hero copy, Shop heading/disabled controls, and dark attack/report subpanels. The Attack confirmation icon now uses the Crownlands SVG family. No Attack confirmation was activated during QA.

## Responsive QA

- Desktop test viewport: 1440x900 CSS pixels. Page scroll width equals viewport width.
- Android landscape: 844x390 CSS pixels. Page scroll width equals viewport width.
- At 844x390, Profile fits within an 828x378 panel, has no horizontal overflow, and scrolls vertically where needed.
- Profile, Leaderboard, Clan, Daily Rewards, Reports, map navigation, Daily Rewards, and Battle Reports remain clickable and readable.
- Close controls remain at least 40x40, and restored top-HUD icon controls remain 56x56.

## Transition QA

- The exact pre-Pass-4A cloud source is active through the optimized manifest and both runtime preload/CSS references.
- A live full-animation capture recorded the transition at the loading phase with cloud-front opacity around 0.57.
- Transition timing, map change logic, and reduced-motion behavior were not modified.

## Performance

- Regional map masters: 4,486,884 bytes in Pass 4A to 8,927,742 bytes restored, an increase of 4,440,858 bytes.
- Normal thumbnails: 187,148 bytes in Pass 4A to 391,236 bytes restored, an increase of 204,088 bytes.
- Four selected HUD masters: 4,262,804 bytes in Pass 3G to 4,514,367 bytes restored, an increase of 251,563 bytes.
- Four selected HUD runtime derivatives: 39,834 bytes to 57,156 bytes, an increase of 17,322 bytes.
- Transition master: 983,257 bytes to 2,271,859 bytes, an increase of 1,288,602 bytes.
- Transition runtime derivative: 60,324 bytes to 59,574 bytes, a decrease of 750 bytes.

The requested exact artwork takes priority over the previous payload reduction. Production build size and validator results are recorded after the final cache/build gate.

## Remaining Manual Review

- Dense live maps can still become visually busy when many high-level city labels overlap; this predates the correction and was not changed because coordinates and map-node behavior are out of scope.
- The visible app viewport in the connected desktop browser can be narrower than 1440 physical pixels because browser chrome/sidebar consumes screen space; DOM layout was still verified at the exact 1440x900 CSS viewport, while all saved Android captures are exact 844x390.
- Low-frequency operations, Stronghold/Citadel ownership combinations, and stale Scout reports depend on live account state and were covered by shared component rules plus static/runtime validators where no matching live record was available.

## Final Build And Test Record

- Source PWA/cache id: `20260812-visual-correction-pass-4a-r1`.
- Pre-correction artifact manifest: 236 source files, 17,670,060 bytes.
- Post-correction artifact manifest: 236 source files, 22,340,016 bytes, a 4,669,956-byte increase.
- Deployment-stamped production validator: 237 files, 21.33 MiB. Build stamp remains `f4604e98824d`.
- Exact rollback/map correction validators: passed.
- Map image loading/runtime/public content/animation/daily rewards/login resilience/audio delivery/patch notes/instant economy: passed.
- Pass 3F/Pass 3G/Inner Castle/Pass 4B/map-object/Common Gear/report/map interaction/interaction health: passed.
- All-city route validation: 1,050 cities, 15 maps, 1,050 city/portal routes, 32 portal transit routes, and 210 cross-map routes passed.
- JavaScript syntax and `git diff --check`: passed.
- QA gallery: 60 of 60 images loaded, no broken references, no horizontal overflow.
- Known failure: `tools/validate-asset-performance-budgets.js` reports `game.js` at 1606.3 KiB against the 1600 KiB source budget.
- Known lint debt: `imageSizeToWorld` and `serverImageSizeToWorld` remain the two existing unused route-helper errors.

## Runtime Revert Addendum

The original Pass 4A-R check restored source maps and selector thumbnails but did not make the live gameplay URL immutable. The follow-up gameplay correction now fingerprints all 15 restored map masters under `assets/worlds/world_01/maps/versioned/`, updates every authoritative runtime map reference, scopes cache lookup to the active PWA cache, and advances the source cache id to `20260812-pre-pass-4a-gameplay-maps-r2`.

Full cause analysis, live desktop/Android captures, and clean installed-PWA QA are in `docs/visual-qa/map-runtime-revert/`.
