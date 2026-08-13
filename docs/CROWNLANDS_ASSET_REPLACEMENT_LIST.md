# Crownlands Asset Replacement List

Workflow: replace or update the source master first, validate it, regenerate optimized derivatives with `tools/optimize-game-art.py` or the appropriate thumbnail tool, update `assets/optimized/manifest.json` or `assets/worlds/world_01/thumbnail-manifest.json`, then verify references. Do not edit optimized derivatives directly.

Statuses:

- `Keep for now`: usable during CSS foundation pass.
- `Awaiting production art`: needs a true replacement master.
- `Derived after source`: regenerate only after source art is replaced.
- `Completed in Pass 3A`: source master replaced, optimized derivative regenerated, and QA recorded.
- `Completed in Pass 3B`: source master replaced, optimized derivative regenerated, and QA recorded.
- `Completed in Pass 3C`: source master replaced, fixed-canvas derivative regenerated, and QA recorded.
- `Completed in Pass 3D`: Inner Castle source master replaced, optimized derivative regenerated, and QA recorded.
- `Completed in Pass 3E`: officer/Common Gear source master replaced, optimized derivative regenerated, and QA recorded.
- `Completed in Pass 3F`: high-frequency item source master replaced, optimized derivative regenerated, and context QA recorded.
- `Completed in Pass 3G`: global HUD/loading/PWA source master replaced, optimized derivative regenerated, and responsive context QA recorded.

## Shared Production Rules

All new raster assets should use grounded 14th-15th century Crownlands materials: fieldstone, timber, wattle and daub, limewash, thatch, clay tile, iron, brass, leather, wool, linen, parchment, wax, rope, soot, mud, smoke, and weathering. Avoid neon, glowing magic, glossy mobile-game bevels, polished navy/gold fantasy borders, impossible architecture, modern vector logo styling, and clean factory-perfect surfaces.

## Pass 2 Raster Priority Ranking

Priority definitions:

- `P0`: blocks the new visual identity on screens players constantly see.
- `P1`: highly visible and should be recreated soon after P0.
- `P2`: important but secondary or partly masked by Pass 2 UI.
- `P3`: lower-frequency cleanup or acceptable short-term.

| Priority | Asset category | Current files | Why this priority | Current status |
| --- | --- | --- | --- | --- |
| P0 | Login background | `assets/game-menu-background.jpg` | First impression for every player. Pass 2 UI now fits the Art Bible, so the remaining mixed raster background is the most obvious identity gap. | Completed in Pass 3A. |
| P0 | City progression stages | `assets/castles/shack.png`, `assets/castles/fort.png`, `assets/castles/keep.png`, `assets/castles/castle.png`, `assets/castles/city.png` | Cities are always visible on the map, repeat constantly, and define player ownership at a glance. | Completed in Pass 3A. |
| P0 | Crown Citadel | `assets/crown-citadel.png` | Central objective and royal focal point; must anchor the Crownlands identity. | Completed in Pass 3A. |
| P1 | Strongholds | `assets/gold-stronghold.png`, `assets/training-stronghold.png`, `assets/speed-stronghold.png`, `assets/defense-stronghold.png` | High-value map objectives players inspect and contest often. | Completed in Pass 3B. |
| P1 | Camps | `assets/camps/gold.png`, `assets/camps/troops.png`, `assets/camps/items.png`, `assets/camps/deed.png` | Frequent map objectives and reward destinations; current UI frames them better but art still needs a shared world language. | Completed in Pass 3C. |
| P1 | Inner Castle hub/buildings | `assets/inner-castle/inner-castle-hub.png`, `assets/inner-castle/treasury.png`, `assets/inner-castle/great-hall.png`, `assets/inner-castle/barracks.png`, `assets/inner-castle/alehouse.png`, `assets/inner-castle/gatehouse.png`, `assets/inner-castle/royal-stables.png` | A major progression hub. Less constant than map cities, but strong identity pressure once opened. | Completed in Pass 3D. |
| P1 | Officer portraits and Common Gear | `assets/gear/war-captain.png`, `assets/gear/master-of-coin.png`, `assets/gear/cavalry-master.png`, `assets/gear/defensive-commander.png`, and 32 building gear masters | Direct continuation of the Inner Castle; high-frequency character and equipment identity. | Completed in Pass 3E. |
| P1 | Consumable item icons and shield field | `assets/royal-peace-shield-icon.webp`, `assets/royal-peace-shield-field.png`, `assets/war-drums-icon.webp`, `assets/royal-tax-decree-icon.webp`, `assets/veil-of-silence-icon.webp`, `assets/swift-march-order-icon.webp`, `assets/recall-horn-icon.webp` | Shop, Bag, effects, and notification surfaces are common; these need historically grounded objects and no glowing-magic language. | Completed in Pass 3F. |
| P1 | HUD raster icons if SVG is insufficient | `assets/leaderboard-icon.png`, `assets/city-list-icon.png`, `assets/map-icon.png`, `assets/shop-icon.png`, `assets/bag-icon.png`, `assets/report-icon.png`, `assets/achievement-icon.png`, `assets/profile-hud-frame.png`, `assets/map-switch-arrow.png` | Pass 2 SVG covers core command icons, but any remaining bitmap HUD marks should match the new stamped/woodcut family. | Completed in Pass 3G. |
| P2 | World map backgrounds | `assets/worlds/world_01/maps/*.webp` | The map is always visible, but current terrain supports the new overlays well enough for this phase. Replace after P0 identity blockers. | Completed in Pass 4A. |
| P2 | Map thumbnails | `assets/worlds/world_01/thumbnails/*.webp` | Derived from the maps; should be regenerated after map masters. | Completed in Pass 4A from final sources. |
| P2 | Gear item icons and common gear box | `assets/gear/*/*.png`, `assets/gear/common-gear-box.png`, `assets/gear/common-gear-box-open.png` | Important progression surfaces but lower frequency than map and primary objectives. | Gear completed in Pass 3E; box/reveal completed in Pass 3F. |
| P3 | PWA/app icons | `assets/icons/*.png` | Installed identity should match the same restrained Crownlands crown used by loading and royal status. | Completed in Pass 3G. |
| P3 | Map transition cloud raster | `assets/map-transition-clouds.png` | CSS now pushes it toward mist; replace only when the map-art phase supplies a better texture. | Completed in Pass 4A. |

## Login, Loading, HUD, Pickups

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/game-menu-background.jpg` | Login background | Lived-in frontier kingdom with road, farms, smoke, trade, modest fortification, people and banners. | 1448x1086 derivative | No | Wide environmental, first-screen safe area | Overcast or late-afternoon natural light | Stone, timber, fields, cloth, smoke, dirt roads | Fantasy mountain castle, neon, empty terrain | Completed in Pass 3A |
| `assets/loading-ring.png` | Loading ring | Stamped seal, compass ring, or engraved medallion. | 1254x1254 source; 256x256 fixed derivative | Yes | Centered icon | Soft candle/metal highlight | Wax, brass, ink, engraved metal | Bright spinner, blue glow | Completed in Pass 3G |
| `assets/loading-crown.png` | Loading crown | Modest hammered crown/circlet. | 1254x1254 source; 256x256 fixed derivative | Yes | Centered object | Warm restrained highlight | Gilt, brass, small gems | Oversized fantasy crown, glow | Completed in Pass 3G |
| `assets/map-transition-clouds.png` | Map transition clouds | Low mist/dust/cloud bank for natural map travel. | 1254x1254 RGBA source; 448x448 derivative | Yes | Overlay texture | Diffuse daylight | Mist, dust | Magical fog, particles | Completed in Pass 4A |
| `assets/leaderboard-icon.png` | HUD leaderboard | Chronicle rank standards on a parchment record. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Ink, parchment, muted brass | Esports medal, shiny gold | Completed in Pass 3G |
| `assets/city-list-icon.png` | HUD city list | Compact town gate on a steward's record. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Parchment, ink, timber | Generic fantasy castle icon | Completed in Pass 3G |
| `assets/map-icon.png` | HUD map | Folded campaign map with roads and settlement marks. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Parchment, ink, muted brass | Modern map pin, blue glow | Completed in Pass 3G |
| `assets/shop-icon.png` | HUD shop | Merchant scales and market goods. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Wood, iron, cloth, brass | Mobile shop gem/chest gloss | Completed in Pass 3G |
| `assets/bag-icon.png` | HUD bag | Leather quartermaster satchel. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Leather, canvas, iron | Glossy loot bag | Completed in Pass 3G |
| `assets/report-icon.png` | HUD reports | Folded military dispatch with dark wax seal. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Parchment, wax, ink | Emoji scroll, bright gold | Completed in Pass 3G |
| `assets/achievement-icon.png` | HUD achievements | Crowned laurel medallion restored from the pre-Pass-3G artwork by player request. | 1254x1254 source; 192x192 fixed derivative | Yes | Flat readable icon | Warm neutral | Aged gold, faded blue enamel | Sealed deed replacement | Restored after Pass 3G |
| `assets/profile-hud-frame.png` | Profile HUD frame | Compact carved-oak ruler plaque with iron corners. | 1419x1108 source; 256x200 fixed derivative | Yes | HUD frame | Warm neutral | Oak, iron, muted brass | Shiny ornate fantasy frame | Completed in Pass 3G |
| `assets/map-switch-arrow.png` | Map switch arrow | Light carved directional sign with iron fastening. | 654x720 source; 192x212 fixed derivative | Yes | Flat readable icon | Warm neutral | Painted wood, iron | Modern UI arrow, glow | Completed in Pass 3G |
| `assets/gold-pickup.png` | Gold pickup | Physical coin spill, tied purse, and wax tax token. | 1254x1254 RGBA source; 192x192 fixed derivative | Yes | Small pickup | Warm daylight | Coins, leather, wax | Sparkly gold orb | Completed in Pass 3F |
| `assets/troop-pickup.png` | Troop pickup | Helmet, small burgundy banner, spear points, and muster roll. | 1254x1254 RGBA source; 192x192 fixed derivative | Yes | Small pickup | Natural | Cloth, iron, spear, parchment | Glowing troop symbol | Completed in Pass 3F |
| `assets/daily-reward-icon-cutout.webp` | Daily reward HUD | Steward calendar and burgundy wax claim mark. | 1254x1254 source; 160x160 fixed derivative | Yes | HUD icon | Warm | Parchment, wax, ink, muted brass | Square backing, glowing reward | Completed in Pass 3G |

## Consumables And Status Effects

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/royal-peace-shield-icon.webp` | Peace shield item | Painted burgundy shield, royal protection proclamation, and wax seal. | 1254x1254 RGBA source; 160x160 fixed derivative | Yes | Object icon | Warm | Parchment, wax, wood, dull metal | Sci-fi force field | Completed in Pass 3F |
| `assets/royal-peace-shield-field.png` | Active shield field | Thin royal-seal perimeter with four wax markers and transparent center. | 1254x1254 RGBA source; 192x192 fixed derivative | Yes | Overlay | Soft natural | Wax, muted gilt, parchment line | Blue energy bubble | Completed in Pass 3F |
| `assets/war-drums-icon.webp` | War drums item | Hide drum with hand-painted bands, rope, and sticks. | 1254x1254 RGBA source; 160x160 fixed derivative | Yes | Object icon | Natural | Hide, wood, rope, faded paint | Fantasy glowing war icon | Completed in Pass 3F |
| `assets/royal-tax-decree-icon.webp` | Tax decree item | Folded charter, royal wax seal, treasury stamp, ink, and few coins. | 1254x1254 RGBA source; 160x160 fixed derivative | Yes | Object icon | Warm desk light | Parchment, wax, ink, brass | Shiny gold pile | Completed in Pass 3F |
| `assets/veil-of-silence-icon.webp` | Veil item | Dark folded cloth, coded packet, sealed thread, and leather case. | 1254x1254 RGBA source; 160x160 fixed derivative | Yes | Object icon | Low natural | Cloth, parchment, wax, leather | Purple magic veil | Completed in Pass 3F |
| `assets/swift-march-order-icon.webp` | Swift March item | Courier dispatch in leather case with road seal and small iron key. | 1254x1254 RGBA source; 160x160 fixed derivative | Yes | Object icon | Natural | Parchment, leather, wax, iron | Blue speed streaks | Completed in Pass 3F |
| `assets/recall-horn-icon.webp` | Recall Horn item | Practical horn with leather cord and muted brass fittings. | 1254x1254 RGBA source; 160x160 fixed derivative | Yes | Object icon | Natural | Horn, leather cord, brass | Magical horn glow | Completed in Pass 3F |

## City Progression

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/castles/shack.png` | City stage 1 | Compact frontier holding with timber hall, crude palisade, and no detached exterior foliage. | 768x768 source; fixed 256x256 derivative | Yes | Isometric/top-down token | Same as map daylight | Timber, thatch, mud | Exterior bushes; fantasy tower | Corrected in City Progression Correction Pass |
| `assets/castles/fort.png` | City stage 2 | Larger fortified village with stronger palisade, gate tower, workshop, and early stone. | 768x768 source; fixed 256x256 derivative | Yes | Isometric/top-down token | Same as map daylight | Timber, palisade, fieldstone | Detached scenery; perfect castle icon | Corrected in City Progression Correction Pass |
| `assets/castles/keep.png` | City stage 3 | Taller keep settlement with stone keep, towers, dense housing, and market yard. | 768x768 source; fixed 256x256 derivative | Yes | Isometric/top-down token | Same as map daylight | Stone, timber, tile accents | Detached foliage; giant fantasy keep | Corrected in City Progression Correction Pass |
| `assets/castles/castle.png` | City stage 4 | Prosperous fortified town with tall towers, substantial walls, trade yard, and civic hall. | 768x768 source; fixed 256x256 derivative | Yes | Isometric/top-down token | Same as map daylight | Stone, timber, smoke, banners | Exterior shrubs; pristine palace | Corrected in City Progression Correction Pass |
| `assets/castles/city.png` | City stage 5 | Dominant major city with layered fortifications, elevated royal core, dense roofs, and strongest vertical silhouette. | 768x768 source; fixed 256x256 derivative | Yes | Isometric/top-down token | Same as map daylight | Stone, timber, tile, smoke | Detached scenery; fantasy megacity | Corrected in City Progression Correction Pass |

## Strongholds And Citadel

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/gold-stronghold.png` | Gold Stronghold | Protected treasury/trade center with storehouses, merchant yards, guarded gates. | 640x640 source; 384x384 fixed derivative; 154px runtime | Yes | Objective token | Natural daylight | Stone, timber, carts, brass lockwork | Literal gold castle | Completed in Pass 3B; normalized in Pass 3C |
| `assets/training-stronghold.png` | Training Stronghold | Barracks, drill yard, archery range, armory, tents, weapon racks. | 640x640 source; 384x384 fixed derivative; 154px runtime | Yes | Objective token | Natural daylight | Timber, canvas, iron, earth | Fantasy arena | Completed in Pass 3B; normalized in Pass 3C |
| `assets/speed-stronghold.png` | Speed Stronghold | Stables, courier relay, horse yards, road junction. | 640x640 source; 384x384 fixed derivative; 154px runtime | Yes | Objective token | Natural daylight | Timber, horse gear, road dirt | Magical speed tower | Completed in Pass 3B; normalized in Pass 3C |
| `assets/defense-stronghold.png` | Defense Stronghold | Layered fortification, thick walls, earthworks, towers, gatehouse. | 640x640 source; 384x384 fixed derivative; 154px runtime | Yes | Objective token | Natural daylight | Stone, iron, timber hoarding | Oversized fantasy fortress | Completed in Pass 3B; normalized in Pass 3C |
| `assets/crown-citadel.png` | Crown Citadel | Richer ceremonial fortress, largest and most carefully built Crown authority site. | 384px max derivative | Yes | Objective token | Warm ceremonial daylight | Dressed stone, burgundy banners, restrained gilt | Glowing magic palace | Completed in Pass 3A |

## Camps

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/camps/gold.png` | Gold camp | Merchant/tax convoy camp with wagons, chests, scale, guards, and goods. | 640x640 source; 384x384 fixed derivative; 132px runtime | Yes | Objective token | Natural daylight | Canvas, wood, coin chest, wax record | Gold pile shrine | Completed in Pass 3C |
| `assets/camps/troops.png` | Warband camp | Temporary military encampment with tents, banners, weapon racks, cookfire. | 640x640 source; 384x384 fixed derivative; 132px runtime | Yes | Objective token | Natural daylight/smoke | Canvas, wood, iron, leather | Fantasy war altar | Completed in Pass 3C |
| `assets/camps/items.png` | Relic camp | Guarded shrine/reliquary pavilion with candles and cloth. | 640x640 source; 384x384 fixed derivative; 132px runtime | Yes | Objective token | Candle and daylight mix | Cloth, wood, wax, restrained gilt | Neon relic glow | Completed in Pass 3C |
| `assets/camps/deed.png` | Deed camp | Charter camp with land records chest, survey stakes, herald, wax seal. | 640x640 source; 384x384 fixed derivative; 132px runtime | Yes | Objective token | Natural daylight | Parchment, wax, wood, canvas | Generic scroll glow | Completed in Pass 3C |

## Inner Castle

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/inner-castle/inner-castle-hub.png` | Inner Castle hub | Coherent royal bailey with Treasury, Great Hall, Barracks, Alehouse, Gatehouse, and Royal Stables in the existing hotspot zones. | 1448x1086 source; 1280x960 derivative | No | Slight top-down scene | Consistent daylight | Stone, timber, roofs, flags, working courtyard | Disconnected building collage | Completed in Pass 3D |
| `assets/inner-castle/treasury.png` | Treasury | Secure counting room/storehouse with ledgers, scales, chests, locks, clerks, and guards. | 1254x1254 source; 512x512 derivative | No | Building/location scene | Warm interior | Stone, wood, iron, parchment, wax | Gold vault fantasy | Completed in Pass 3D |
| `assets/inner-castle/great-hall.png` | Great Hall | Noble hall with trestle tables, raised dais, banners, hearth, and human-scale authority. | 1254x1254 source; 512x512 derivative | No | Building/location scene | Fire/daylight | Timber, stone, cloth | Palace fantasy hall | Completed in Pass 3D |
| `assets/inner-castle/barracks.png` | Barracks | Practical muster room/yard connection with racks, shields, soldiers, benches, and stores. | 1254x1254 source; 512x512 derivative | No | Building/location scene | Natural | Wood, iron, wool, leather | Fantasy armory glow | Completed in Pass 3D |
| `assets/inner-castle/alehouse.png` | Alehouse | Practical castle alehouse with benches, barrels, hearth, retainers, food, and worn timber. | 1254x1254 source; 512x512 derivative | No | Building/location scene | Fire/daylight | Wood, barrel, clay, linen | Tavern fantasy excess | Completed in Pass 3D |
| `assets/inner-castle/gatehouse.png` | Gatehouse | Defensive command point with oak gate, portcullis, guards, chains, bell, and wall tools. | 1254x1254 source; 512x512 derivative | No | Building/location scene | Natural/torch | Stone, iron, timber | Impossible gate tower | Completed in Pass 3D |
| `assets/inner-castle/royal-stables.png` | Royal Stables | Working stables with horses, tack, courier gear, hay, troughs, and stable hands. | 1254x1254 source; 512x512 derivative | No | Building/location scene | Natural | Timber, straw, leather | Polished fantasy stable | Completed in Pass 3D |

## Gear Characters

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/gear/war-captain.png` | War Captain portrait | Adult male field commander with gambeson, mail, brigandine, officer sword, and muster order in the Barracks. | 1086x1448 source; 768x1024 derivative | No | Character portrait | Natural Barracks light | Wool, leather, iron, mail | Giant pauldrons, glowing armor | Completed in Pass 3E |
| `assets/gear/master-of-coin.png` | Master of Coin portrait | Adult male treasurer with sealed ledger, keys, sober fine clothing, and controlled Treasury context. | 1086x1448 source; 768x1024 derivative | No | Character portrait | Warm natural interior | Wool, linen, parchment, brass | Battle armor, fantasy mage | Completed in Pass 3E |
| `assets/gear/cavalry-master.png` | Cavalry Master portrait | Adult male riding/logistics officer with reins, dispatch case, riding kit, and stable cues. | 1086x1448 source; 768x1024 derivative | No | Character portrait | Natural stable light | Leather, wool, iron, horse gear | Superhero knight | Completed in Pass 3E |
| `assets/gear/defensive-commander.png` | Defensive Commander portrait | Adult male Gatehouse veteran with practical armor, keys, shield, and wall-command context. | 1086x1448 source; 768x1024 derivative | No | Character portrait | Natural gate light | Mail, brigandine, stone, iron | Dark fantasy warden | Completed in Pass 3E |

## Gear Items

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/gear/barracks/head.png` | War Captain head | Kettle helm/bascinet/sallet with wear. | 192x192 derivative | Yes | Object icon | Neutral | Iron, leather liner | Glowing helm | Completed in Pass 3E |
| `assets/gear/barracks/chest.png` | War Captain chest | Gambeson, mail, brigandine, practical straps. | 192x192 derivative | Yes | Object icon | Neutral | Cloth, mail, leather | Fantasy plate torso | Completed in Pass 3E |
| `assets/gear/barracks/pants.png` | War Captain legs | Hose/chausses/padded leg gear. | 192x192 derivative | Yes | Object icon | Neutral | Wool, leather, iron | Modern pants | Completed in Pass 3E |
| `assets/gear/barracks/boots.png` | War Captain boots | Muddy riding/marching boots. | 192x192 derivative | Yes | Object icon | Neutral | Leather, mud | Polished fantasy boots | Completed in Pass 3E |
| `assets/gear/barracks/gloves.png` | War Captain gloves | Leather or mail-reinforced gloves. | 192x192 derivative | Yes | Object icon | Neutral | Leather, iron | Spiked gauntlets | Completed in Pass 3E |
| `assets/gear/barracks/belt.png` | War Captain belt | Campaign belt with pouches and buckle. | 192x192 derivative | Yes | Object icon | Neutral | Leather, brass | Gem belt | Completed in Pass 3E |
| `assets/gear/barracks/weapon.png` | War Captain weapon | Practical sword, polearm, or command baton. | 192x192 derivative | Yes | Object icon | Neutral | Steel, leather, wood | Oversized glowing sword | Completed in Pass 3E |
| `assets/gear/barracks/necklace.png` | War Captain necklace | Command badge, saint token, or officer chain. | 192x192 derivative | Yes | Object icon | Neutral | Brass, iron, cord | Magic amulet | Completed in Pass 3E |
| `assets/gear/treasury/head.png` | Treasury head | Steward cap/hood or modest circlet of office. | 192x192 derivative | Yes | Object icon | Warm interior | Wool, linen, brass | Battle helmet | Completed in Pass 3E |
| `assets/gear/treasury/chest.png` | Treasury chest | Fine but practical robe/doublet, key chain. | 192x192 derivative | Yes | Object icon | Warm interior | Wool, linen, leather | Armor plate | Completed in Pass 3E |
| `assets/gear/treasury/pants.png` | Treasury legs | Hose/robes appropriate to steward. | 192x192 derivative | Yes | Object icon | Warm interior | Wool, linen | Fantasy leggings | Completed in Pass 3E |
| `assets/gear/treasury/boots.png` | Treasury boots | Indoor/outdoor steward shoes. | 192x192 derivative | Yes | Object icon | Warm interior | Leather | Jewel boots | Completed in Pass 3E |
| `assets/gear/treasury/gloves.png` | Treasury gloves | Scribe gloves or coin-handling gloves. | 192x192 derivative | Yes | Object icon | Warm interior | Linen, leather | Gauntlets | Completed in Pass 3E |
| `assets/gear/treasury/belt.png` | Treasury belt | Key ring, purse, tax stamp belt. | 192x192 derivative | Yes | Object icon | Warm interior | Leather, brass, iron | Weapon belt | Completed in Pass 3E |
| `assets/gear/treasury/weapon.png` | Treasury weapon slot | Ledger, abacus, coin scale, royal quill, tax stamp, or counting rod. | 192x192 derivative | Yes | Object icon | Warm interior | Parchment, wood, brass, wax | Actual weapon | Completed in Pass 3E |
| `assets/gear/treasury/necklace.png` | Treasury necklace | Office chain, seal pendant, account token. | 192x192 derivative | Yes | Object icon | Warm interior | Brass, wax, cord | Magic pendant | Completed in Pass 3E |
| `assets/gear/royal-stables/head.png` | Stables head | Riding hood/helmet/cap. | 192x192 derivative | Yes | Object icon | Stable daylight | Wool, leather, iron | Fantasy cavalry helm | Completed in Pass 3E |
| `assets/gear/royal-stables/chest.png` | Stables chest | Riding coat, courier jerkin, saddle straps. | 192x192 derivative | Yes | Object icon | Stable daylight | Leather, wool, linen | Plate cuirass | Completed in Pass 3E |
| `assets/gear/royal-stables/pants.png` | Stables legs | Riding hose/chaps. | 192x192 derivative | Yes | Object icon | Stable daylight | Wool, leather | Modern pants | Completed in Pass 3E |
| `assets/gear/royal-stables/boots.png` | Stables boots | Riding boots with mud/wear. | 192x192 derivative | Yes | Object icon | Stable daylight | Leather, iron spur | Shiny fantasy boots | Completed in Pass 3E |
| `assets/gear/royal-stables/gloves.png` | Stables gloves | Riding gloves. | 192x192 derivative | Yes | Object icon | Stable daylight | Leather | Spiked gauntlets | Completed in Pass 3E |
| `assets/gear/royal-stables/belt.png` | Stables belt | Courier belt, pouch, horse tack fittings. | 192x192 derivative | Yes | Object icon | Stable daylight | Leather, brass | Gem belt | Completed in Pass 3E |
| `assets/gear/royal-stables/weapon.png` | Stables weapon | Courier staff, short sword, riding crop, signal baton. | 192x192 derivative | Yes | Object icon | Stable daylight | Wood, steel, leather | Glowing lance | Completed in Pass 3E |
| `assets/gear/royal-stables/necklace.png` | Stables necklace | Road token, courier seal, horse charm. | 192x192 derivative | Yes | Object icon | Stable daylight | Brass, cord, wax | Magic necklace | Completed in Pass 3E |
| `assets/gear/gatehouse/head.png` | Gatehouse head | Guard helm, sallet/kettle with dents. | 192x192 derivative | Yes | Object icon | Gatehouse light | Iron, leather | Demon helm | Completed in Pass 3E |
| `assets/gear/gatehouse/chest.png` | Gatehouse chest | Reinforced jack/brigandine/gambeson. | 192x192 derivative | Yes | Object icon | Gatehouse light | Cloth, iron, leather | Oversized armor | Completed in Pass 3E |
| `assets/gear/gatehouse/pants.png` | Gatehouse legs | Guard hose/leg armor. | 192x192 derivative | Yes | Object icon | Gatehouse light | Wool, iron, leather | Modern trousers | Completed in Pass 3E |
| `assets/gear/gatehouse/boots.png` | Gatehouse boots | Muddy defensive-duty boots. | 192x192 derivative | Yes | Object icon | Gatehouse light | Leather, mud | Polished boots | Completed in Pass 3E |
| `assets/gear/gatehouse/gloves.png` | Gatehouse gloves | Guard gloves/gauntlets. | 192x192 derivative | Yes | Object icon | Gatehouse light | Leather, iron | Spiked gauntlets | Completed in Pass 3E |
| `assets/gear/gatehouse/belt.png` | Gatehouse belt | Keys, horn, gate tools. | 192x192 derivative | Yes | Object icon | Gatehouse light | Leather, iron, brass | Gem belt | Completed in Pass 3E |
| `assets/gear/gatehouse/weapon.png` | Gatehouse weapon | Polearm, crossbow, gate hook, or guard spear. | 192x192 derivative | Yes | Object icon | Gatehouse light | Wood, steel, leather | Glowing sword | Completed in Pass 3E |
| `assets/gear/gatehouse/necklace.png` | Gatehouse necklace | Watch token, gate seal, command badge. | 192x192 derivative | Yes | Object icon | Gatehouse light | Iron, brass, cord | Magic amulet | Completed in Pass 3E |
| `assets/gear/common-gear-box.png` | Common gear box | Closed scratched-oak quartermaster chest with forged iron latch and restrained burned heraldic mark. | 1254x1254 RGBA source; 192x192 fixed derivative | Yes | Object icon | Neutral | Oak, iron, leather | Magical loot chest | Completed in Pass 3F |
| `assets/gear/common-gear-box-open.png` | Common gear box reveal state | Matching open quartermaster chest with folded cloth and paper gear cards, no magical light. | 1254x1254 RGBA source; 256x256 fixed derivative | Yes | Object icon/reveal | Neutral | Oak, iron, cloth, parchment | Loot beam, glow, treasure | Added in Pass 3F |

All 32 officer gear rows above were completed in Pass 3E. Their authoritative masters are now 1254x1254 RGBA PNGs and optimized derivatives are fixed-layout 192x192 RGBA WebPs. The Treasury weapon-slot row is specifically implemented as a sealed royal ledger with a counting scale, not a conventional weapon.

## World Maps And Thumbnails

All maps are 1448x1086 in `assets/worlds/world_01/world-layout.json`. Map thumbnails are derived previews and must be regenerated only after the matching map is replaced.

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/worlds/world_01/maps/center-crownlands-heart-1783019616021.webp` | Crownlands Heart | Central crown region with developed roads, fields, trade, Citadel influence. | 1448x1086 | No | Top-down painted map | Shared daylight | Terrain, roads, farms, settlements | Different art style | Completed in Pass 4A |
| `assets/worlds/world_01/maps/west-west-2-1783019399438.webp` | West Marches | Connected western frontier with consistent terrain scale and road treatment. | 1448x1086 | No | Top-down painted map | Shared daylight | Terrain, roads, settlements | Fantasy biome isolation | Completed in Pass 4A |
| `assets/worlds/world_01/maps/east-east-4-1783020191215.webp` | East Reach | Eastern frontier with same continent rules. | 1448x1086 | No | Top-down painted map | Shared daylight | Terrain, roads, water | Glossy magical water | Completed in Pass 4A |
| `assets/worlds/world_01/maps/north-north-1-1783019201680.webp` | North Frontier | Northern frontier with natural terrain and connected road network. | 1448x1086 | No | Top-down painted map | Shared daylight | Terrain, forest, hills | Decorative fantasy mountains | Completed in Pass 4A |
| `assets/worlds/world_01/maps/south-south-5-1783020401484.webp` | Southfields | Farm-rich southern region with settlement-altered landscape. | 1448x1086 | No | Top-down painted map | Shared daylight | Fields, roads, villages | Empty token terrain | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_6-6-1783021585258.webp` | Graywood Hollow | Midgame map with shared roads, forest, settlement scale. | 1448x1086 | No | Top-down painted map | Shared daylight | Forest, roads, fields | Inconsistent palette | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_7-7-1783022207943.webp` | Greenrook Vale | Midgame vale, road and water continuity. | 1448x1086 | No | Top-down painted map | Shared daylight | Vale terrain, bridges | Glossy water | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_8-8-1783022783978.webp` | Lowroad Vale | Starter/mid map candidate, low road network and 10+ neutral city capacity visual. | 1448x1086 | No | Top-down painted map | Shared daylight | Roads, fields, villages | Isolated decorative map | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_9-9-1783023202200.webp` | Stonebrook Farms | Agricultural map with believable farms and road wear. | 1448x1086 | No | Top-down painted map | Shared daylight | Fields, stone, brook | Bright fantasy farm map | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_10-10-1783023599661.webp` | Goldmere Plains | Trade plains, not literal gold terrain. | 1448x1086 | No | Top-down painted map | Shared daylight | Plains, markets, roads | Golden fantasy biome | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_11-11-1783024323781.webp` | Bandit Wastes | Starter frontier, harsher but grounded roads and settlements. | 1448x1086 | No | Top-down painted map | Shared daylight | Scrub, roads, camps | Post-apocalyptic fantasy | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_12-12-1783024478267.webp` | Ironfall Hills | Starter hills, mining/iron cues if used, same scale. | 1448x1086 | No | Top-down painted map | Shared daylight | Hills, stone, roads | Giant fantasy cliffs | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_13-13-1783024786859.webp` | Redbanner Fields | Starter field region, hand-made banners and farms. | 1448x1086 | No | Top-down painted map | Shared daylight | Fields, cloth, roads | Red neon treatment | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_14-14-1783024960400.webp` | Ashenfen March | Starter fen/march, natural wetland water. | 1448x1086 | No | Top-down painted map | Shared daylight | Marsh, roads, bridges | Magical swamp glow | Completed in Pass 4A |
| `assets/worlds/world_01/maps/region_15-15-1783025218871.webp` | Relic Vale | Starter vale with restrained shrine/relic history. | 1448x1086 | No | Top-down painted map | Shared daylight | Valley, ruins, roads | Neon sacred glow | Completed in Pass 4A |
| `assets/worlds/world_01/thumbnails/*.webp` | Map picker thumbnails | Derived smaller previews from matching new map art. | 320x240 | No | Full-map preview | Match source map | Same as source map | Hand-edited derivative | Completed in Pass 4A |

## PWA Icons

| Current filename | Purpose | Target appearance | Dimensions | Alpha | Camera/angle | Lighting | Materials | Prohibited elements | Replacement exists |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `assets/icons/crownlands-icon-192.png` | Browser/app icon | Hammered Crownlands crown over a stone gate on weathered burgundy cloth. | 192x192 opaque PNG | No | Centered app badge | Warm restrained | Hammered gilt, stone, cloth | Overly shiny fantasy logo | Completed in Pass 3G |
| `assets/icons/crownlands-icon-512.png` | Large app icon | Same crown-over-gate family derived from the 1254px master. | 512x512 opaque PNG | No | Centered app badge | Warm restrained | Hammered gilt, stone, cloth | Extra symbols or text | Completed in Pass 3G |
| `assets/icons/crownlands-maskable-192.png` | Maskable app icon | Same emblem held inside the central maskable safe area. | 192x192 opaque PNG | No | Centered app badge | Warm restrained | Hammered gilt, stone, cloth | Cropped crown or gate | Completed in Pass 3G |
| `assets/icons/crownlands-maskable-512.png` | Maskable app icon | Same safe-area composition at install size. | 512x512 opaque PNG | No | Centered app badge | Warm restrained | Hammered gilt, stone, cloth | Cropped crown or gate | Completed in Pass 3G |

## Pass 4B Audit Disposition

| Asset/family | Active use | Disposition | Reason |
| --- | --- | --- | --- |
| `assets/game-menu-background.jpg` plus optimized derivative | Login and public hero | Retained / acceptable | Already matches post-4A Crownlands: maintained settlement, fields, road, wagon, bridge/river, banners and natural daylight. |
| `assets/icons/crownlands-*.png` | Public brand, PWA, notification, Apple touch | Retained / active | Approved Pass 3G crown-over-gate burgundy identity. |
| `assets/center-island.webp`, `north-island.webp`, `south-island.webp`, `east-island.webp`, `west-island.webp` | Map editor fallbacks | Retained / compatibility | Synchronized to approved Pass 4A art; editor fallback references remain active. |
| `promo-screenshots/*` | Guides, Updates and metadata | Retained / editorial | Dated screenshots document game systems and release history; not active runtime art. |
| `docs/visual-qa/pass-*/old-assets` and comparisons | Development QA | Retained / documentation | Intentionally excluded from production bundle. |
| Superseded content-hashed optimized WebPs | None | Removed from production / obsolete | Active manifest and runtime references point only to current hashes. |

Pass 4B created no new raster production assets and removed no referenced source masters.

## Pass 4A-R Correction Disposition

This correction supersedes the Pass 4A completion status for regional terrain and transition artwork. The assets remain deliberate production art, but their authoritative versions are the exact pre-Pass-4A files rather than the Pass 4A repaint.

| Asset/family | Corrected disposition | Source of truth |
| --- | --- | --- |
| `assets/worlds/world_01/maps/*.webp` | Restored / approved for current production | Pre-Pass-4A bytes from revision `f4604e98824d57e1f27fc9a3f8bcb014519366d0` and `docs/visual-qa/pass-4a/old-assets/`. |
| `assets/worlds/world_01/thumbnails/*.webp` | Restored and fingerprinted / current | Exact pre-Pass-4A 420x315 normal thumbnails plus matching immutable copies. |
| Five root `assets/*-island.webp` maps | Restored / compatibility | Exact pre-Pass-4A legacy archive; do not force parity with the active region files. |
| `assets/map-transition-clouds.png` | Restored / approved | Exact pre-Pass-4A cloud master; 448x448 optimized derivative generated from this source. |
| `assets/leaderboard-icon.png` | Restored / approved | Exact pre-Pass-3G source. |
| `assets/daily-reward-icon-cutout.webp` | Restored / approved | Exact pre-Pass-3G source. |
| `assets/profile-hud-frame.png` | Restored / approved | Exact pre-Pass-3G source. |
| `assets/report-icon.png` | Restored / approved | Exact pre-Pass-3G source. |
| Other Pass 3G art | Retained / approved | City List, Map, Shop, Bag, Achievements, loading identity, PWA identity, and the Crownlands SVG command icon family remain active. |

The Pass 4A repaint is retained only under `docs/visual-qa/pass-4a-r/pass-4a-assets/` for development comparison. It is not production art.

### Live Gameplay Delivery Addendum

All 15 restored masters now have byte-identical immutable gameplay copies under `assets/worlds/world_01/maps/versioned/`. The runtime mapping is recorded by `assets/worlds/world_01/map-manifest.json`; selector thumbnails and live gameplay art derive from the same restored sources. The production artifact excludes mutable map-master URLs, and the source cache id is `20260812-pre-pass-4a-gameplay-maps-r2`.
