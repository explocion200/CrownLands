# The Four Orders — animated city concepts

Owner request: four animated city skins inspired by the Templars, Hospitallers, Teutonic Knights and Santiago, each with all five growth appearances. After reviewing the 20 paintings, the owner requested game performance validation and **600 Crowns per skin**, then push and merge. Each permanent unlock includes all five stages; switching remains free and requires Apply.

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

## Runtime integration and performance

The gallery and source PNGs in this directory remain outside the production web build. `tools/build-knight-city-assets.js` encodes 20 transparent 512×512 WebPs into `assets/optimized/`; `runtime-assets.json` records paths, sizes and source/output hashes. The set totals 1,597,190 bytes, with each five-stage order below 512 KiB. These images are requested only when used and are excluded from service-worker install precaching. Existing camp art is reused.

The game catalog offers each order for 600 Crowns year-round, retaining Halloween's October-only sale. Server transactions still control balances, purchases, replay protection and Apply. Public equipped appearances follow current city owners and stages; default, capture, missing art and strongholds retain their established behavior. No world data, seasonal reset or payment behavior changes.

`knight-city-effects.js` adapts the approved scenery to the existing cosmetic scheduler. Halloween and knight cities share four map slots on desktop and three at widths ≤1000px, with one selected detail preview. One shared painter runs at most 20fps, with no per-frame layout reads. Map canvases are capped at 256×256 and the selected preview at 384×384; inactive buffers shrink to 1×1. Camera movement, zooming, low/crowded zoom, covered maps, offscreen layers, hidden pages and reduced/off preferences stop painting. Thumbnails are static; removing the last skin stops the loop.

```sh
node tools/validate-cosmetics.js
node tools/validate-knight-city-browser.js
node tools/validate-cosmetics-browser.js
node tools/validate-halloween-city-skin-browser.js
node tools/validate-skin-motion-browser.js
```

`runtime-performance.json` records a local 60-city stress test (40 visible, 20 offscreen) under 4× CPU slowdown. Desktop and landscape-mobile checks compare the same scene with effects Off and Full, bound active canvases, paint frequency, memory and per-city paint duration, then verify every stop/resume condition. The real game fixture also covers four purchases and Apply actions, all twenty stage mappings, current/remote ownership and missing-art recovery. These measurements cover tested desktop Chromium conditions, not every physical phone or live network condition. Emulator coverage checks concurrent receipts, exact prices, permanent ownership and public Apply for all four orders.

## Rollout

The frontend waits for `getCosmeticsState.availableOfferIds` before exposing the four new offers. An older backend continues showing its supported Halloween offer. Deploy the updated `purchaseCosmetic`, `equipCosmetic` and `collectHarvestBonus` before `getCosmeticsState` advertises availability; Crown pickups must use the new catalog to retain equipped knight appearances. Deploy `reserveHarvestBonusSpawn` with the same catalog for consistent pickup reads. Then deploy `getCosmeticsState` with the validated client to activate sales. Push/merge alone does not verify deployment; the authorized production result is recorded below.

## Verified production deployment — October 6, 2026

The owner authorized deployment after PR #458 merged. Web build `d21f6579c3b36e4f150e064f05cab930c597aa6f` was published through Netlify deploy `6ac474910af8860008283d3f` at `04:21:59.228 UTC` (12:21 a.m. Eastern), with the manual publication hold retained. The manifest, game entry and service worker match on all three game hosts; catalog/painter/UI source and all twenty artwork hashes match the merged files.

The five functions named above are ACTIVE on Node.js 22 with shared source hash `de020abc8baad743f77e05cba5c19bf53053784f`. The four purchase/equip/pickup functions deployed first, followed by catalog advertisement. The downloaded source package contains the exact merged build and matching runtime sources. The other 134 function revisions and October realm identity remained unchanged. All five callable authentication guards and the deployment hook's 29 callable-access checks passed.

The required GitHub checks passed in run `37411998371`. Exact-source emulator coverage includes the four 600-Crown purchases, replay/ownership/Apply and Crown pickup preservation. No production purchase or Apply was made. The final signed-in Shop check remains pending: the old session was signed out, and Google redirect did not restore it. Physical-device performance and itch.io client parity remain unverified.

Deployment receipts are retained locally in `release-artifacts/knight-order-city-skins/deployment/`. This release is **LIVE — WEB**; the preceding rollout instructions describe the dependency order for future deployments.
