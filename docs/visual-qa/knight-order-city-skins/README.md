# The Four Orders — animated city concepts

Owner request: four animated city skins inspired by the Templars, Hospitallers, Teutonic Knights and Santiago. The owner chose **animated previews first**. These are mature-city art concepts, outside the game and Shop catalog; prices, availability and production integration have not been selected.

## Open the preview

Open `index.html` directly in a modern browser, or run the existing local server from the repository root:

```sh
node tools/map-benchmark/server.js --port=8798
```

Then visit <http://127.0.0.1:8798/docs/visual-qa/knight-order-city-skins/index.html>. No account or connection to the game backend is needed. All preview resources are local.

| Order | Concept | Visual identity | Effects |
| --- | --- | --- | --- |
| Templars | Dawnwatch | Ivory fortress, red crosses, tall keep | Gold light sweep, rising embers, glowing braziers |
| Hospitallers | Night Sanctuary | Charcoal roofs, white crosses on black, chapel and cloisters | Silver motes, sanctuary wisps, lantern shimmer |
| Teutonic Knights | Frost Citadel | Gothic towers, snowy blue roofs, black crosses on white | Drifting snow, icy wind, frost glints |
| Santiago | Emberward | Sandstone, terracotta, red sword-cross, scallop gate | Ember trails, gold shimmer, gatefire |

Architecture and magical lighting are artistic interpretations. These are four distinct medieval military orders, rather than four branches of the Templars. The heraldic references come from the [Museum of the Order of St John](https://museumstjohn.org.uk/our-story/history-of-the-order/), [Order of Malta](https://www.orderofmalta.int/government/flags-emblems/), [Metropolitan Museum of Art arms and armor bulletin](https://resources.metmuseum.org/resources/metpublications/pdf/Arms_and_Armor_The_Metropolitan_Museum_of_Art_Bulletin_v_32_no_4_1973_1974.pdf), and [Cross of Saint James reference](https://www.blason.es/heraldry/crossofsaintjames.html). They are inspiration, not period-uniform reconstructions.

## Controls and motion

- **Inspect** shows one city, **Compare four** shows the collection, and **City scale** displays a 160 CSS-pixel art tile for readability review. Actual map-marker sizing is not changed.
- **Full** runs particles and lighting; **Subtle** uses static ambient details; **Off** shows the painted city alone. **Pause motion** freezes particles and CSS lighting.
- Reduced-motion preference defaults to Subtle. A manual selection takes precedence for the current visit.
- Particles and trails extend beyond the artwork into the surrounding stage: outward-fanning Templar embers, broad Hospitaller orbits, scene-wide Teutonic snowfall, and Santiago ember spirals. Expanded halos and ground light soften the silhouette. Effects fade at the stage edges and stay clear of controls and descriptions.
- One shared animation loop paints at most 30 times per second, with 60 particles per city (80 for snow), a maximum canvas pixel ratio of 2, and no particle DOM nodes. Hidden pages and offscreen cities pause motion.

The transparent PNGs in `art/` were generated with the built-in `image_gen` tool. Exact generation prompts are preserved in `prompts.json`; originals were copied without resizing or alpha changes. The gallery adds CSS lighting and Canvas particles over these static paintings.

## Validation and release boundary

```sh
node tools/validate-knight-order-preview.js
```

The focused browser validator covers all four assets and choices, transparent corners, desktop 1440×900, landscape 844×390, portrait 390×844, moving pixels outside every artwork rectangle, outer effects at 160px city scale, motion controls, comparison, reduced-motion default, and absence of external requests/runtime errors. Screenshots are written to ignored `release-artifacts/knight-order-city-skins/` for visual inspection.

This directory is not an input to the production web build. No city ownership, purchase, equip, Crown balance, release contract, live-world data, or Master Specification rule is changed. Before a game release, approved designs still need the five progression stages, optimized runtime assets, integration with the existing cosmetic motion budget, approved catalog terms and release validation.
