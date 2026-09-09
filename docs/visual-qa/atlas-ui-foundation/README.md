# Atlas UI foundation — design study 01

Status: **proposed visual direction for review**, September 9, 2026. This is a disconnected, interactive study of the map HUD and owned City Details. It is not an implementation of the full redesign, an approved Art Bible update, or a deployed game feature.

## Open the study

Open [index.html](index.html) in a browser, or from the repository root run:

```powershell
node tools/map-benchmark/server.js --port=8798
```

Then open `http://127.0.0.1:8798/docs/visual-qa/atlas-ui-foundation/index.html`. Stop the local server with Ctrl+C when finished. The review toolbar switches between 1440 × 900, 844 × 390 and 568 × 320, map/City Details, and five upgrade states. A scaled preview shows composition; use **Open at browser size** for text and touch-size review.

The existing loopback benchmark server serves these files. The frame imports only its local fixture and presentation script. Its Content Security Policy disables connections, forms, plugins and external scripts. It does not load Firebase, service workers, authentication, game runtime, or production data. There is no storage or persistence. The production client builder's allowlist excludes `docs/`.

## What to review

The intended visual language is an illustrated field atlas: pale parchment for information, dark ink for small icons and text, moss for the primary command, ochre for ownership, and burgundy for an attack warning. Existing map and settlement artwork anchors the composition. Fine rules and restrained cloth accents keep the UI related to the map without covering it in heavy ornament.

- The HUD establishes the ruler/treasury hierarchy, readable place labels, map controls, activity alerts, command navigation and a sample chat strip.
- City Details separates its scrolling information from fixed upgrade controls. Desktop uses a side ledger; landscape compacts the command area; short landscape gives information and commands separate columns.
- A native modal provides keyboard dismissal and focus containment. Closing returns focus to the opener. Tabs support arrow keys, Home and End. Reduced-motion preference disables the entrance animation.
- Upgrade states cover ready, pending, success, retry and insufficient gold. Pending blocks duplicate interaction. The retry fixture consistently fails without spending gold; the other fixtures simulate success locally.
- Navigation outside this study opens explanatory notes. It does not imply the reports, clan, inventory, shop, chat or Inner Castle screens have been redesigned.

Review these decisions before expanding the component set: paper/ink balance; icon weight and recognition at actual size; ruler and resource hierarchy; panel density; ownership/attack recognition; and the compact landscape upgrade layout. Physical-device and screen-reader review remain necessary before production adoption.

## Sources and boundaries

Baseline: repository commit `d3a133cbe2304159dfaf2e6eb430bef67b250580` on the current `core-expansion-v1` topology.

- [Master Development Specification](../../CROWNLANDS_MASTER_DEVELOPMENT_SPECIFICATION.md): atlas presentation, sections 16–18 on mobile/readability, orientation and art direction. No authoritative rules or specifications are edited here.
- [Art Bible](../../CROWNLANDS_ART_BIBLE.md): existing guidance and materials. This study proposes a UI treatment; it does not supersede that document.
- [Region catalog](../../../assets/worlds/core-expansion-v1/region-catalog.json) and [Highwinter Vale definition](../../../assets/worlds/core-expansion-v1/regions/core-v2-north-support-p0-m2.json): current map image, city-stage assets, scenery and coordinates. The selected scene displays eight sample city markers; it is not a complete or authoritative world rendering.
- The user's attached illustrated landscape supplies the style reference: muted earth colours, fine outlines, painted terrain and clear settlement silhouettes. Its river is not introduced into the game or this study; the existing no-river map requirement remains.

**All identities, ownership, balances, timers, production values, levels and outcomes are invented layout fixtures.** The constant 640-gold sample price and level-50 stop exercise the controls; they are not proposed balance rules. Opening or resetting the preview restores the fixture. A simulated upgrade changes only the displayed sample level and treasury; it does not model dependent production or wall changes.

The small SVG icons are authored for this study. Fonts use local system fallbacks: Georgia for titles and Segoe UI/Arial for controls. Typography, final icon production and font licensing/package choices remain part of the production design-system work. No new raster artwork is generated in this update.

## Validation

With Node.js 22 and Chrome installed at its standard Windows location, from the repository root:

```powershell
node docs/visual-qa/atlas-ui-foundation/verify-prototype.cjs
```

The check uses the repository's isolated headless Chrome session and loopback server. It writes current captures and [qa-results.json](evidence/qa-results.json) under `evidence/`, tests real pointer clicks and keyboard events, and closes its temporary browser profile. It checks the three landscape layouts, scrolling access, tabs, +1/+5/Max, pending locks, success/error/insufficient-gold states, modal dismissal/focus restoration, map controls, portrait orientation and the responsive review wrapper. It also checks for broken images, runtime failures and external requests. It does not test gameplay or backend correctness.

Useful captures: [desktop city](evidence/desktop-city.png), [landscape city](evidence/landscape-city.png), [short landscape city](evidence/short-city.png), [map HUD](evidence/desktop-map.png), [review page](evidence/review-desktop.png).

## Next implementation boundary

After visual review, confirm the shared tokens, icon treatment and component states. Then build the approved panel, button, tab, ledger and feedback primitives in the existing game architecture and migrate the HUD plus owned City Details as one bounded implementation. Check the live layout runtime and CSS cascade together. Preserve current rules and server-authoritative actions, run the required validation pipeline, and compare before/after captures at the same viewport and game state. Other screens and raster-art families should follow that proven foundation in separate updates.
