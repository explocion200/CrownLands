# Inner Castle overview — approved presentation

Status: **runtime integration on the feature branch**. The user approved the layout and seven illustrations, then requested integration on 10 September 2026. Merge and deployment remain separate steps; this document does not establish a live release.

## Review

Run `node tools/map-benchmark/start-server.js 61703` and open <http://127.0.0.1:61703/docs/visual-qa/inner-castle-overview/index.html>.

The standalone comparison retains **Parchment draft / Current layout** and **Desktop / Mobile landscape**. The optional `building` query selects any of the six registered building keys; unknown values fall back to Great Hall. Its controls remain inert, and the synthetic Treasury new-gear marker is for visual review only. Portrait is not supported.

The integrated game uses `common-gear-ui.js`, the scoped `inner-castle-ui.css`, and the existing `game.js` building registry. The production build includes the new stylesheet; deployment stamping gives scripts and styles the commit's cache version. The stylesheet uses the existing network-first CSS cache, and illustrations use content-hashed runtime-cached WebP assets. This preserves the installation and optimized-art budgets.

## Approved design

- Parchment, muted moss, dark ink, thin rules, and engraved symbols extend the approved City List and City Details direction.
- Desktop uses a maximum 1040 × 790 window with viewport margins, pairing the full Royal Bailey scene and six-building directory with the selected-building pane.
- Decorative wooden signs use SVG hangers, shaped boards, brass trim/rivets, and real HTML lettering. Burgundy and pressed states identify the selection. New-gear badges remain visible beside the lettering.
- Mobile landscape moves the same Back to City Details control into the header beside Close and hides the desktop directory/footer. The full 4:3 Bailey remains visible, and all scene targets are at least 44 pixels high.
- The right pane stacks the building name, centered square artwork, existing information, and Manage Gear where available. Text and the 44-pixel action receive space before the image, which scales to the remaining height up to 160 pixels wide. Reviewed landscape sizes require no detail scrolling.
- The generic exploration/future-update announcement is removed. Gear subpanels, costs, progression, and backend actions are unchanged.

## Preserved behavior and information

| Building | Existing role | Existing availability |
| --- | --- | --- |
| Treasury | Gold storage / gold production | Master of Coin gear and bonuses; Manage Gear |
| Great Hall | Ruler power / kingdom upgrades | Not yet available |
| Barracks | Troop production / military strength | War Captain gear and bonuses; Manage Gear |
| Alehouse | Morale / recovery / small boosts | Not yet available |
| Gatehouse | City defense / wall strength | Defensive Commander gear and bonuses; Manage Gear |
| Royal Stables | Movement / march speed | Cavalry Master gear and bonuses; Manage Gear |

The overview preserves the fixed anchors (left/top percentages): Treasury **19/24**, Great Hall **50/20**, Barracks **81/25**, Alehouse **19/57**, Gatehouse **50/75**, Royal Stables **81/58**. Selecting a scene sign or desktop directory control updates the same preview and accessible pressed states. Manage Gear opens the existing equipment screen; returning preserves the selected building and reflects the existing new-marker state.

Only owned-city details expose the entry shortcut. It opens the player's Main City, and Back restores the inspected city and entry-button focus. Profile continues to support an off-map Main City. Close/Escape clean up the shared dialog's Inner Castle state and theme.

## Artwork and provenance

All seven source PNGs were generated with the built-in image tool using the user's map reference and successively approved interior references. Original room arrangements and the Bailey anchors remain intact. Exact prompts and reference roles are recorded beside the images:

- [Royal Bailey](art/royal-bailey-prompt.md): opaque 1448 × 1086 source, 1280 × 960 runtime WebP.
- [Great Hall](art/great-hall-prompt.md): raised throne, long tables, arched windows, timber roof and hearth.
- [Treasury](art/treasury-prompt.md): counting desk, scales, ledger, guarded door, shelves and chests.
- [Barracks](art/barracks-prompt.md): equipment racks, workbenches, soldiers and training courtyard.
- [Alehouse](art/alehouse-prompt.md): large hearth, serving counter, barrels and patrons at wooden tables.
- [Gatehouse](art/gatehouse-prompt.md): portcullis, chains, operating gallery, threshold and guards.
- [Royal Stables](art/royal-stables-prompt.md): stalls, horses, grooms, tack and daylight courtyard.

The six interiors use opaque 1254 × 1254 source PNGs and 512 × 512 WebP derivatives. Approved PNGs are copied intact into `assets/inner-castle/`; `tools/optimize-game-art.py` produces the fingerprinted manifest entries. The hub uses quality 76 and interiors quality 84, preserving dimensions and framing within the existing performance budgets. Runtime art totals **946,436 bytes**, about 96% smaller than these source masters. Previous optimized derivatives remain available for the historical comparison and are excluded from the production build, which ships exactly the seven current manifest entries.

## Source isolation

`snapshot.json` retains the original capture from `92e45124469842e8b19974807aa13f01b4bead02`. Its city name and gear marker are synthetic. `preview.js` loads only captured data and local styles/assets, without game/account APIs. Current layout uses original markup and artwork with shared repository styles; the styles are not frozen. The standalone folder and source PNG masters are excluded from the production client build.

## Validation

`node tools/validate-inner-castle-browser.js` exercises the actual game through the isolated benchmark fixture, with no production account access. It checks all six buildings at **1440 × 900**, **1280 × 720**, **844 × 390**, **667 × 375**, **568 × 320**, and **932 × 430**: fixed scene anchors, real pointer selection, centered full illustrations, readable sign colors, preserved descriptions/availability, visible 44-pixel gear actions, and no detail scrolling. It also covers 24 equipment round trips, directory selection, responsive Back placement, focus/Close cleanup, entry guards, off-map Profile entry, the accessible dialog name, and keyboard selection/Escape.

`node tools/validate-city-details-browser.js` checks owned Main City and other owned-city shortcuts, omission on foreign cities, and return-city focus in the existing City Details flow. Static Inner Castle/Common Gear validators cover registry data, unchanged source artwork, gameplay guards, modal lifecycle, art delivery, and existing gear authority. Asset-budget validation checks the optimized manifest and installation budget. The normal `prepare-pr` workflow selects **Full** validation because the complete branch touches shared game code and the Master Specification.

Screenshots and measurements are local under ignored `release-artifacts/inner-castle-overview/`. Browser checks use desktop Chrome emulation; physical-device and production verification are separate from this integration.
