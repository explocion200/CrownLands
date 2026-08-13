# Crownlands Pass 4B QA Notes

## Scope

- Audited active public pages, signed-out entry, flag and clan-shield customization, empty/error/help states, tooltips, editor-only presentation, old branding, duplicate art and optimized history.
- Rebuilt the public page shell in `site-info.css` without changing article facts, authentication or navigation targets.
- Added persistence-compatible dye presentation and cloth treatment to generated kingdom flags.
- Added wood grain, plank joints, worn paint, scratches and forged edge depth to generated clan shields.
- Retuned the retained map/HUD editor toward a restrained administrative palette while preserving every coordinate, object ID, saved format and diagnostic interaction.
- Created no new production raster assets and removed no referenced source master.

The complete audit and A-D disposition are in `docs/CROWNLANDS_REMAINING_VISUAL_GAPS.md`.

## Public Pages

| Surface | Crownlands treatment | QA result |
| --- | --- | --- |
| Signed-out entry | Approved Pass 3A settlement art retained beneath compact timber/parchment/iron realm controls. | Desktop and 844x390 landscape pass. |
| Home | Full-bleed approved settlement background, direct hero text, timber navigation and burgundy commands. | Desktop and landscape pass after heading-size correction. |
| Guides and guide articles | Practical field-library and ledger reading system with parchment surfaces, ink rules and responsive cards. | Desktop and 390px portrait pass. |
| Updates | Royal chronicle treatment sharing the same page system. | Desktop pass. |
| Rules | Realm charter treatment; readable headings, callouts and tables. | Desktop pass. |
| Support | Petition-desk/FAQ treatment with clear recovery language. | Desktop pass. |
| Privacy, Terms and About | Administrative charter/record treatment rather than a separate marketing theme. | Desktop pass. |
| Patch Notes | Existing functional modal inherits the grounded global panel, tab, close and announcement system. | Signed-out desktop modal reviewed. |

No horizontal overflow was observed at 1440x900, 844x390 or 390x844. Tables retain horizontal scrolling only where their data cannot collapse safely. Native Google authentication and browser permission surfaces remain functional-modern exceptions.

## Login Background Decision

`assets/game-menu-background.jpg` and its optimized derivative are retained. The image already shows a maintained late-medieval settlement, walls, fields, worn roads, river/bridge, wagon traffic, soldiers, banners and natural daylight. Its architecture and land-use language remain coherent with the approved Pass 4A world maps, and its composition preserves the live login safe zone. Replacing it would add inconsistency rather than remove it.

## Heraldry

### Kingdom flags

- Stored `primary`, `accent`, `pattern` and `symbol` values remain unchanged.
- Approved stored colors receive presentation-only faded-blue, burgundy-red, moss-green, faded-indigo, ochre, charcoal, unbleached-linen and walnut-brown dye treatments.
- Cloth uses woven shading, seam/stitch detail, slight edge irregularity and restrained wear without continuous map animation.
- Existing Crownlands SVG charges remain readable in editor, map, profile and compact HUD contexts.
- Save continues through the existing `updatePlayerProfile({ flag: ... })` path.

### Clan shields

- Existing shape, field division, colors, charge layout, border and finish schema remains unchanged.
- The generated SVG now reads as painted wood through grain texture, plank joints, scratches, wear and forged edge depth.
- Editor, roster and War Room contexts preserve small-scale charge readability.
- Save continues through the existing `updateClanProfile({ shield: ... })` path.

Authenticated Firebase submission was not available in the unsigned local QA browser. The persistence validator therefore verifies the unchanged schema fields and both production update call chains; no serialization or database code changed.

## Secondary And Editor QA

- Representative reports, operations, city, inventory, clan and reward empty states inherit parchment dispatch/ledger treatment.
- Errors retain direct language and receive an oxblood/rust warning edge. Warnings use ochre/iron distinction.
- Tooltips and popovers use compact timber notices with warm high-contrast focus treatment rather than glass blur.
- The map/HUD editor opened with its existing world-layout data and interactions. Toolbar, inspector, fields, buttons and object footprints received a quieter timber/parchment/iron/burgundy shell.
- Diagnostic owner colors, resize handles, overlap indicators and grid feedback remain intentionally modern because they communicate state rather than brand.

## Brand And Asset Audit

- Active PWA/browser branding is the approved Pass 3G crown-over-gate burgundy family.
- The five root `*-island.webp` files remain active editor fallbacks and match approved Pass 4A regional art.
- Dated `promo-screenshots/` remain editorial evidence, not active runtime art.
- Old/new images under `docs/visual-qa/` remain development-only rollback and comparison evidence.
- Superseded content-hashed optimized files remain absent from active manifest references.
- No active player-facing navy/gold legacy crest or obsolete loading raster was found.

## Screenshot Review

- `01-login-desktop.png`: signed-out entry at 1440x900.
- `02-home-desktop.png` through `07-privacy-desktop.png`: representative public surfaces at 1440x900.
- `08-patch-notes.png`: signed-out Patch Notes modal.
- `09-public-android-landscape.png`: 844x390 public landscape.
- `10-public-portrait.png`: 390x844 guide reading layout.
- `11-editor-admin.png`: retained world-layout editor at 1440x900. The deeper HUD-layout workbench was also opened after its final material retune; its bright grid, selection and resize diagnostics remain intentional.
- `index.html`: contextual flag/shield editor, generated family, map/profile/roster/War Room and secondary-state review board.

## Visual Questions

1. Late-medieval identity: pass; public surfaces read as records, charters and practical campaign material.
2. Shiny gold: pass; brass/gilt is restrained to emphasis and existing approved art.
3. Modern glass: pass; public and audited secondary surfaces use opaque physical materials.
4. Rounded cards: pass; shared public controls use 2-4px corners.
5. Physical materials: pass; parchment, timber, iron, cloth, painted wood and wax are legible.
6. Icon/heraldry cohesion: pass; existing Crownlands SVG pictograms are retained and shields/flags share dye and wear language.
7. Fantasy-mobile-game regressions: no meaningful player-facing Category A examples remain.
8. Text readability: pass at desktop, Android landscape and portrait widths.
9. Obvious controls: pass; burgundy commands and iron secondary actions remain distinct.
10. Mobile landscape: pass after compact heading and navigation adjustments.

## Performance And Cache

- Pass 4B adds CSS, HTML documentation and a small visual validator; it adds no production raster payload.
- Production artifact before Pass 4B rebuild: 236 files / 17,660,252 bytes.
- Production artifact after Pass 4B rebuild: 236 source files / 17,670,060 source bytes. The production validator reports 237 files / 16.87 MiB after deployment stamping. Source payload changed by +9,808 bytes (+0.06%), entirely in HTML/CSS/JS; raster payload is unchanged.
- PWA cache/build ID: `20260812-public-heraldry-pass-4b-r1`.

## Remaining

- Category A: none.
- Category B: active public/login/heraldry/world/PWA families and clearly dated editorial screenshots.
- Category C: editor diagnostics, native browser/Google controls, and high-contrast gameplay ownership colors.
- Category D: QA archives, compatibility map aliases and superseded optimized hashes outside active references.
- Known unrelated technical debt remains the `game.js` source-entry budget: 1606.3 KiB versus the 1600 KiB guardrail. The 1.7 KiB increase from the previously documented 1604.6 KiB is the persistence-compatible Pass 4B flag dye table and shield texture markup. The two unused route-helper warnings remain unchanged.

No further broad visual redesign pass is recommended. Continue with targeted QA, maintenance, accessibility, performance and new-feature art against the established system.
