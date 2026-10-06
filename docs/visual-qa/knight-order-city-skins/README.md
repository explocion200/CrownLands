# The Four Orders — animated city concepts

Owner request: four animated city skins inspired by the Templars, Hospitallers, Teutonic Knights and Santiago, each with all five growth appearances. The owner chose **animated previews first**. The collection contains 20 city paintings outside the game and Shop catalog; prices, availability and production integration have not been selected.

## Open the preview

Open `index.html` directly in a modern browser, or run the existing local server from the repository root:

```sh
node tools/map-benchmark/server.js --port=8798
```

Then visit <http://127.0.0.1:8798/docs/visual-qa/knight-order-city-skins/index.html>. No account or connection to the game backend is needed. All preview resources are local.

| Order | Concept | Visual identity | Effects |
| --- | --- | --- | --- |
| Templars | Dawnwatch | Ivory fortress, red crosses, tall keep | Waving red-cross standards, torch patrols, smoking campfires |
| Hospitallers | Night Sanctuary | Charcoal roofs, white crosses on black, chapel and cloisters | Waving black-and-white standards, lantern patrols, watchfires |
| Teutonic Knights | Frost Citadel | Gothic towers, snowy blue roofs, black crosses on white | Waving black-cross standards, torch patrols, natural snowfall |
| Santiago | Emberward | Sandstone, terracotta, red sword-cross, scallop gate | Waving sword-cross standards, torch patrols, smoking campfires |

Architecture and camp activity are artistic interpretations. These are four distinct medieval military orders, rather than four branches of the Templars. The heraldic references come from the [Museum of the Order of St John](https://museumstjohn.org.uk/our-story/history-of-the-order/), [Order of Malta](https://www.orderofmalta.int/government/flags-emblems/), [Metropolitan Museum of Art arms and armor bulletin](https://resources.metmuseum.org/resources/metpublications/pdf/Arms_and_Armor_The_Metropolitan_Museum_of_Art_Bulletin_v_32_no_4_1973_1974.pdf), and [Cross of Saint James reference](https://www.blason.es/heraldry/crossofsaintjames.html). They are inspiration, not period-uniform reconstructions.

## Controls and motion

- The level picker follows the existing five-stage city appearance ranges: **1–24 / Outpost**, **25–49 / Township**, **50–74 / Keep**, **75–99 / Fortress**, **100+ / Citadel**. These are five visual bands per skin, not a separate painting for every numeric level. The preview names describe the artwork and do not change gameplay progression.
- **Inspect** shows one order at the selected stage; **Compare four** shows all orders at that stage. **Growth** shows all five paintings for the selected order. Choosing a level while in Growth opens that stage in Inspect. **City scale** displays a 160 CSS-pixel art tile for readability review. Actual map-marker sizing is not changed.
- **Full** animates the medieval outskirts; **Subtle** uses a static scene; **Off** shows the painted city alone. **Pause motion** freezes cloth, guards, birds, smoke, fire, snow and gate lighting.
- Reduced-motion preference defaults to Subtle. A manual selection takes precedence for the current visit.
- The owner clarified that animation outside the city should depict medieval activity. The surrounding scene therefore has waving cloth standards, an existing painted encampment, a watch brazier, smoke plumes, walking guards and birds. The camp grows with the city, patrols and birds increase from one to three, and a second standard appears from stage three. Order colors appear on moving banners and guards. Abstract orbit lines, spark fields, halos and light sweeps are removed; embers originate only from fires and torches.
- One shared animation loop paints at most 30 times per second with fixed scenery counts, 28 additional snowflakes for Teutonic Knights, a maximum canvas pixel ratio of 2, and no particle DOM nodes. Hidden pages and offscreen cities pause motion.

The 20 transparent city PNGs in `art/` were generated with the built-in `image_gen` tool. Exact generation prompts are preserved in `prompts.json` (four original mature cities, now stage five) and `progression-prompts.json` (16 earlier-stage paintings using the corresponding mature city as a style and heraldry reference). Stage five retains `art/<order>.png`; stages one through four use `art/<order>-stage-<number>.png`. Originals were copied without resizing or alpha changes. `art/encampment.webp` is an unchanged copy of the game's existing `assets/optimized/camp-troops-384x384-2f712333e891.webp`. Its painted camp is shared; the animated outer standards and guards use the selected order's colors. `medieval-effects.js` draws the moving miniature scenery and fire over these static paintings.

## Validation and release boundary

```sh
node tools/validate-knight-order-preview.js
```

The focused browser validator covers all 20 distinct assets and their prompt mappings, all order/level choices, transparent corners, unchanged camp-art reuse and loading, removal of abstract overlay elements, desktop 1440×900, landscape 844×390, portrait 390×844, moving pixels outside every artwork rectangle, outer effects at 160px city scale, motion controls, comparison, five-stage Growth views, keyboard stage selection, reduced-motion default, and absence of external requests/runtime errors. Screenshots are written to ignored `release-artifacts/knight-order-city-skins/` for visual inspection.

This directory is not an input to the production web build. No city ownership, purchase, equip, Crown balance, release contract, live-world data, or Master Specification rule is changed. Before a game release, approved designs still need optimized runtime assets, integration with the existing cosmetic motion budget and level mapping, approved catalog terms and release validation.
