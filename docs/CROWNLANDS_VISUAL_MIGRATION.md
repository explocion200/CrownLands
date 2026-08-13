# Crownlands Visual Migration Matrix

This table tracks every major visual system. "Completed" means visually migrated in code and/or asset replacement verified. CSS-only groundwork is not a completed raster-art replacement.

| System | Existing asset/component | Existing file | Current visual problem | New Crownlands treatment | Implementation method | Replacement asset required? | Code dependency risk | Completed? | QA result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Global tokens | `:root` UI variables | `styles.css` | Navy/gold fantasy palette dominates. | Central parchment, wood, iron, cloth, moss, oxblood, muted brass tokens. | CSS token override. | No | Low | In progress | Static CSS QA pending. |
| Typography | Cinzel/Cinzel Decorative/IM Fell English | `index.html`, `styles.css` | Display fonts overused and feel fantasy ceremonial. | Restrained headings, readable body, tabular numbers. | CSS hierarchy. | No | Low | In progress | Static CSS QA pending. |
| Login screen | Background and login card | `index.html`, `styles.css`, `assets/game-menu-background.jpg` | Glossy fantasy panel and blue overlay. | Frontier kingdom presentation with parchment/wood controls and lived-in Crownlands landscape art. | CSS plus Pass 3A background replacement. | No for current background; future refinements optional. | Medium | Pass 3A complete | Desktop and mobile-landscape screenshot QA passed. |
| Loading | Ring/crown spinner | `styles.css`, `assets/loading-ring.png`, `assets/loading-crown.png` | Bright polished ceremonial spinner. | Stamped seal/engraving/compass medallion motion. | CSS now; source art later. | Yes | Low | Partial | Static CSS QA pending. |
| HUD profile/gold | Top HUD buttons and gold pill | `index.html`, `styles.css` | Rounded glossy controls, gold common everywhere. | Leather/wood HUD board, coin ledger counter, cloth flag. | CSS. | HUD icons later. | Medium | Partial | Static CSS QA pending. |
| HUD icons | Leaderboard, bag, shop, city list, map, report | `assets/*.png`, `assets/optimized/manifest.json` | Polished fantasy icon family, inconsistent physical story. | Woodcut/stamped metal/manuscript icon family. | Source asset replacement then optimize. | Yes | Low | No | Awaiting art. |
| Fullscreen/music arrows | Unicode symbols | `index.html`, `game.js`, `styles.css` | Browser/emoji-like symbols. | Ink/stamped utility icons. | Inline SVG or icon font replacement later. | No | Medium | No | Awaiting icon system. |
| Modal architecture | Generic dark cards | `styles.css`, `game.js` render functions | Modern rounded fantasy panels. | Parchment/wood/iron family by screen purpose. | CSS shared classes first. | No | Medium | Partial | Static CSS QA pending. |
| Commander panel | Selected city panel and action buttons | `styles.css`, `game.js` | Glossy button strip. | Military order board with iron-edged wood buttons. | CSS. | No | Medium | Partial | Static CSS QA pending. |
| Action wheel | City/camp wheel buttons | `styles.css`, `game.js` | Floating modern circles and generic glyphs. | Brass/ink action tokens with physical command marks. | CSS now; glyph replacement later. | No | Medium | Partial | Static CSS QA pending. |
| Bottom nav | Reports/marches/incoming | `index.html`, `styles.css` | Rounded dark UI with bright blue/red. | Campaign dispatch board, oxblood warning, moss/ink state. | CSS. | Icons later. | Medium | Partial | Static CSS QA pending. |
| Toasts | Toast banner | `styles.css`, `game.js` | Generic dark notification. | Wax-stamped parchment/wood notice. | CSS. | No | Low | Partial | Static CSS QA pending. |
| Realm announcements | Herald banner | `styles.css`, `game.js` | Gold ceremonial for common events. | Royal proclamation only when royal; normal events as parchment dispatch. | CSS. | Icon later. | Low | Partial | Static CSS QA pending. |
| World map backgrounds | 15 region WebPs | `assets/worlds/world_01/maps/` | Existing art not governed by shared world rules. | Unified continent lighting, terrain scale, roads, water, farms. | Production map-art replacement. | Yes | High | No | Awaiting art. |
| Map thumbnails | 15 thumbnails | `assets/worlds/world_01/thumbnails/` | Derivative visual mismatch if maps change. | Cropped/optimized previews from new maps. | Generate after map masters. | Yes | Medium | No | Awaiting map art. |
| Map picker | Island switcher | `styles.css`, `game.js` | Cool blue grid/fantasy selector. | Surveyor map table with parchment grid and map pins. | CSS. | Thumbnails later. | Medium | Partial | Static CSS QA pending. |
| Route lines | SVG paths | `styles.css`, `game.js`, `route-worker.js` | Bright game-color route ribbons. | Ink/chalk/wax route strokes with dust motion. | CSS only; logic untouched. | No | Medium | Partial | Static CSS QA pending. |
| City markers | DOM city nodes | `styles.css`, `game.js` | Neon/game state colors and shield panels. | Banners, painted shields, ink rings, stitched state patterns. | CSS now; marker art later. | Yes | High | Partial | Static CSS QA pending. |
| City stages | `shack`, `fort`, `keep`, `castle`, `city` | `assets/castles/` | Needs organic settlement growth and grounded architecture. | Five believable settlement stages that read as one settlement growing over time. | Pass 3A source art replacement and optimized WebP regeneration. | No for city stages. | Low | Pass 3A complete | Cohesion, gameplay-size, and map-composite QA passed. |
| Strongholds | Gold/training/speed/defense/citadel | `assets/*.png` | Role differences risk being decorative/fantasy. | Function-led architecture with shared Crownlands culture. | Crown Citadel replaced in Pass 3A; four role Strongholds replaced in Pass 3B, then optimized. | No for current Strongholds. | Low | Pass 3B complete | Hierarchy, gameplay-size, and actual-map QA passed. |
| Camps | Gold/items/troops/deed camp art | `assets/camps/` | Generic reward camp language. | Merchant tax convoy, warband, relic shrine, charter camp. | Source art replacement, fixed-canvas optimization, and runtime scale standard. | No for current camps. | Low | Pass 3C complete | Objective hierarchy and actual-map QA passed. |
| Harvest pickups | Gold/troop pickups | `assets/gold-pickup.png`, `assets/troop-pickup.png` | Glowing reward pickup language. | Physical coin purse and military muster kit with restrained map notation. | Pass 3F source art replacement and CSS VFX tuning. | No | Low | Pass 3F complete | Alpha, fixed-layout, map-context, and reward-flight QA passed. |
| Peace shield field | Shield status VFX | `assets/royal-peace-shield-field.png`, `styles.css` | Energy-field risk. | Thin royal authority seal with wax markers and transparent center. | Pass 3F asset and CSS VFX replacement. | No | Medium | Pass 3F complete | City visibility, selection compatibility, and mobile QA passed. |
| Consumable items | Peace shield, drums, tax, veil, march, horn | `assets/*icon.webp` | Mixed generated item language. | Real medieval objects with consistent Pass 3D/3E lighting and materials. | Pass 3F source art replacement then optimization. | No | Low | Pass 3F complete | Shop, Bag, effects, alpha, and gameplay-size QA passed. |
| Shop | Item shop modal | `styles.css`, `game.js` | Glossy collectible-card feel. | Merchant ledger and quartermaster store. | Pass 3F CSS and item-art integration. | No | Medium | Pass 3F complete | Desktop/mobile QA passed. |
| Inventory | Bag modal and item slots | `styles.css`, `game.js` | Modern slot grid. | Storehouse ledger/quartermaster chest grid. | Pass 3F CSS and item-art integration. | No | Medium | Pass 3F complete | Desktop/mobile QA passed. |
| Common gear box | Loot box item | `assets/gear/common-gear-box.png`, `assets/gear/common-gear-box-open.png`, `styles.css`, `game.js` | Magical loot-box risk. | Iron-latched supply chest with physical closed/open reveal and three settling cards. | Pass 3F source art, support state, and animation update. | No | Medium | Pass 3F complete | Reveal-state and server-call contract QA passed. |
| Gear characters | Four officer portraits | `assets/gear/*.png`, `common-gear.js` | Fantasy officer risk. | Believable Crownlands officers by role. | Source art replacement then optimize. | Yes | Medium | No | Awaiting art. |
| Gear items | 32 item icons | `assets/gear/*/*.png`, `common-gear.js` | Generic gear sets; Treasury weapon issue. | Role-specific equipment; Treasury weapon becomes admin tool. | Source art replacement then optimize; data labels maybe later. | Yes | Medium | No | Awaiting art. |
| Inner Castle | Hub and seven building images | `assets/inner-castle/`, `styles.css`, `game.js` | Needs coherent compound. | Same stone/timber/lighting/camera treatment. | Source art replacement; CSS frame tuning. | Yes | Medium | No | Awaiting art. |
| Profile | Kingdom record, stats, achievements | `index.html`, `styles.css`, `game.js` | Generic panel/card layout. | Parchment record, heraldic banner, clan shield, wax sections. | CSS. | Flag/portrait later. | Medium | Partial | Static CSS QA pending. |
| Flag editor | Generated flag CSS/SVG | `styles.css`, `game.js` | Modern vector rectangles. | Cloth texture, seams, hand-painted symbols, wear. | CSS/SVG generation update later. | No | High | Partial | Static CSS QA pending. |
| Clan shields | Generated shield CSS/SVG | `styles.css`, `game.js` | Modern vector/corporate risk. | Painted wood/cloth heraldic shields. | CSS/SVG generation update later. | No | High | Partial | Static CSS QA pending. |
| Skills | Skill rows/presets | `styles.css`, `game.js` | RPG talent-tree feel. | Training doctrines, manuals, policies, administrative knowledge. | CSS and copy/icon tuning. | No | Medium | Partial | Static CSS QA pending. |
| Clan system | Clan tabs, roster, gifts, quests | `styles.css`, `game.js` | Generic social UI. | Noble alliance records, banners, rolls, seals. | CSS. | Shield icons later. | Medium | Partial | Static CSS QA pending. |
| War Room | Clan rally/objective UI | `styles.css`, `game.js` | Needs stronger military room language. | Campaign map, pins, tokens, dispatches. | CSS now; art later. | Maybe | Medium | Partial | Static CSS QA pending. |
| Combat prep | Attack/transfer/scout modals | `styles.css`, `game.js` | Sliders and forecasts feel modern. | Military orders, campaign parchment, troop tokens, route notes. | CSS; no formula changes. | Icons later. | High | Partial | Static CSS QA pending. |
| Scouting | Scout UI/reports | `styles.css`, `game.js` | Telescope/generic report risk. | Intelligence report, field sketches, stale faded info. | CSS now; icon replacement later. | Maybe | Medium | Partial | Static CSS QA pending. |
| Battle reports | Report list/detail | `styles.css`, `game.js` | Modern battle cards. | Military chronicles and after-action reports. | CSS. | No | Medium | Partial | Static CSS QA pending. |
| Operations | Incoming/outgoing/rally/reinforce | `styles.css`, `game.js` | Bright alert cards. | Active dispatches, red wax urgent warnings. | CSS. | Icons later. | High | Partial | Static CSS QA pending. |
| Daily rewards | Calendar/rewards modal | `daily-rewards.css`, `game.js` | Glossy blue mobile reward board. | Steward ledger/calendar, wax stamps, tied cords. | CSS. | Reward icon already acceptable; more art later. | Medium | Partial | Static CSS QA pending. |
| Daily missions | Mission rows/detail | `styles.css`, `game.js` | Game quest list. | Posted notices, steward assignments, military dispatches. | CSS. | Icons later. | Medium | Partial | Static CSS QA pending. |
| Seasonal achievements | Achievement rows | `daily-rewards.css`, `game.js` | Mobile achievement cards. | Deeds, proclamations, chronicle entries, seals. | CSS. | Icons later. | Medium | Partial | Static CSS QA pending. |
| Level-up rewards | Reward modal | `styles.css`, `index.html`, `game.js` | Ceremonial glow and reward sparkle. | Royal reward charter, wax seal, coin/supply presentation. | CSS now; animation later. | Crown/loading art later. | Medium | Partial | Static CSS QA pending. |
| Offline rewards | Offline modal | `styles.css`, `game.js` | Generic modal. | Steward's return ledger. | CSS. | No | Low | Partial | Static CSS QA pending. |
| Public guide pages | Site pages | `site-info.css`, HTML guide files | May use separate public-site look. | Same grounded brand palette but less game-HUD heavy. | Not in this pass. | Maybe | Low | No | Pending. |
| PWA icons/logo | Crown app icons | `assets/icons/` | Polished royal crown still acceptable but gold-heavy. | Keep for now; later weathered crafted crown badge. | Asset replacement later. | Yes | Low | No | Existing retained. |
| Service worker/PWA | Cached assets | `service-worker.js`, `manifest.webmanifest` | Must update after asset changes. | Cache only verified optimized outputs. | Cache version and preloaded login art updated for Pass 3A. | No | High | Pass 3A complete | Validator pending final pass run. |

## Current Pass Notes

The first implementation pass focuses on design tokens, panel families, buttons, controls, modal framing, HUD materials, map overlays, generated flags/shields, daily systems, reports, operations, and reward panels through CSS. It deliberately does not replace production raster art yet.

## Pass 2 Update - Core Player Experience

Pass 2 continues from the existing Art Bible and Pass 1 foundation. It keeps the parchment, timber, iron, burgundy, moss, oxblood, faded indigo, muted brass, wax, ledger, and heraldic language as the source of truth.

| System | Pass 2 implementation | Completion | QA status |
| --- | --- | --- | --- |
| Pass 1 review cleanup | Kept successful Pass 1 material language, fixed remaining core glyph use, and avoided removing older low-risk CSS that is now overridden by the Pass 2 layer. | Complete for high-frequency UI. | Static audit plus login screenshot QA. |
| Login / entry | Reframed sign-in, realm, install, patch notes, public navigation, music, Discord, and fullscreen controls as parchment, wood, iron, burgundy seal, and stamped navigation. Existing raster background retained. | Complete CSS treatment; raster replacement still required. | Desktop and mobile landscape screenshots captured. |
| Global HUD | Added compact ruler-interface treatment for portrait area, kingdom flag, level/rank, gold ledger, daily reward, Citadel countdown, fullscreen, bag, shop, city list, map, reports, marches, incoming alerts, badges, and counters. | Complete CSS treatment. | Authenticated visual screenshot blocked by Firebase auth in headless QA. |
| Global panels/components | Added shared `.panel`, modal card, button, tab, input, select, slider, badge, tooltip, timer, progress, row, header, separator, and close-button rules in the Pass 2 layer. | Complete for reused live surfaces. | Static audit. |
| Core iconography | Added a Crownlands-specific inline SVG sprite and renderer helpers. Replaced visible emoji/Unicode gameplay icons for attack, transfer, scout, crown, shield, city, reports, gold, troops, map, bag, shop, clan, leaderboard, daily rewards, achievements, incoming, outgoing, rally, reinforcement, locate, information, upgrade, close, back, forward, fullscreen, sound, install, check, edit, and replace. | Complete for runtime hotspots audited this pass. | Static icon audit. |
| Historical icon cleanup | Removed telescope/spyglass scouting visuals. Scouting now uses a readable eye/observer pictogram. | Complete for audited runtime. | Static icon audit. |
| Map overlays | Reworked city rings, target states, route lines, march paths, scout/regroup radii, labels, owner flags, army tokens, capture/camp/stronghold/Citadel/protection states toward campaign-map marks, banners, ink, cloth, and wax. Map backgrounds were not repainted. | Complete CSS/SVG treatment. | Authenticated screenshot blocked; route and runtime validators cover logic. |
| Route lines | Attack routes use oxblood/rust, transfers use moss, scout routes use faded blue/charcoal dotted notation, and active marches read as drawn campaign paths instead of energy trails. | Complete styling pass. | Static audit. |
| Kingdom flags | Preserved saved flag colors, patterns, and symbols while adding cloth texture, stitched edges, subtle wear, hand-painted SVG symbols, and cross/saltire-safe layering. | Complete CSS/SVG treatment. | Static audit. |
| Clan shields | Preserved shield customization while adding painted wood/cloth, worn paint, subdued rim depth, and non-glowing heraldic treatment. | Complete CSS/SVG treatment. | Static audit. |
| Loading / transitions | Reduced glow and moved loading toward stamped seal/crown medallion treatment; map transition clouds now read as mist/dust/parchment movement instead of magical smoke. Existing raster pieces retained. | Complete CSS treatment; raster replacement still required. | Static audit. |
| Toasts / announcements | Added separate visual weights for normal notices, success, warning, incoming attack/scout, royal proclamation, and Citadel/Stronghold events. | Complete CSS treatment. | Static audit. |
| Daily rewards / missions / achievements | Extended Pass 1 daily system with stronger parchment calendar cards, wax claimed marks, steward-ledger tabs, and SVG mission/achievement icons. | Complete CSS/SVG treatment. | Existing daily rewards validator plus screenshot blocked by auth. |
| Achievement and Home City rollback | Restored the earlier crowned-laurel Achievement raster and the compact arrow/house Home City return marker. PWA install icon assets and return behavior remain unchanged. | Complete player-requested correction. | Desktop 1440x900 and Android landscape 844x390 screenshot QA passed. |
| CSS architecture | Added a clearly labeled Pass 2 layer with shared material variables and grouped component families. Avoided risky broad refactors of legacy CSS because the app is highly stateful. | Complete for this pass. | `git diff --check` pending. |

Remaining known visual inconsistencies after Pass 2:

- Older raster art still carries mixed fantasy polish in city stages, strongholds, camps, item art, officer portraits, inner castle scenes, loading art, and the login background.
- Some legacy CSS remains earlier in `styles.css` and `daily-rewards.css`; high-frequency surfaces are overridden by the Pass 2 layer, but later cleanup should delete dead rules after visual regression QA is easier.
- Authenticated map/profile/shop/daily screenshots were not available in this headless QA profile, so those screens still need manual production review or an authenticated browser automation session.

## Screenshot QA Limitation

Pass 2 captured login screenshots through a temporary local static server and headless Edge. Authenticated screens could not be captured from the clean headless profile because Firebase sign-in was not available there. The Browser automation surface also returned no readable control output in this session, so deeper authenticated visual QA is marked as limited until a signed-in browser session or dedicated visual QA harness is available.

## Pass 3A Update - Core World Raster Art

Pass 3A replaces only the seven highest-priority world raster assets: login background, five city stages, and Crown Citadel. It deliberately does not repaint the 15 regional maps, four role Strongholds, camps, Inner Castle, officer portraits, HUD bitmaps, items, loading art, or map transition art.

| Asset/System | Pass 3A implementation | Completion | QA status |
| --- | --- | --- | --- |
| Shared world art spec | Added `docs/art-prompts/pass-3a/SHARED_VISUAL_SPEC.md` and production prompts defining common camera, lighting, material, palette, settlement-growth DNA, transparency, and negative rules. | Complete | Reviewed against Art Bible. |
| Login background | Replaced `assets/game-menu-background.jpg` with a lived-in Crownlands frontier kingdom landscape and updated preload/public-site references. | Complete | Desktop and mobile-landscape screenshot QA passed. |
| City Stage 1 | Replaced `assets/castles/shack.png` with a defensible frontier holding with timber hall, palisade, dirt approach, stores, and work-yard cues. | Complete | Cohesion and map-composite QA passed. |
| City Stage 2 | Replaced `assets/castles/fort.png` with the evolved fortified village stage. | Complete | Cohesion and map-composite QA passed. |
| City Stage 3 | Replaced `assets/castles/keep.png` with the first stone keep settlement stage. | Complete | Cohesion and map-composite QA passed. |
| City Stage 4 | Replaced `assets/castles/castle.png` with a larger fortified town with walls, gatehouse, towers, and dense internal structures. | Complete | Cohesion and map-composite QA passed. |
| City Stage 5 | Replaced `assets/castles/city.png` with a major regional Crownlands city. | Complete | Cohesion and map-composite QA passed. |
| Crown Citadel | Replaced `assets/crown-citadel.png` with a stronger royal Citadel using the same material language at a richer scale. | Complete | Stage 5 to Citadel comparison and map-composite QA passed. |
| Optimized derivatives | Regenerated `assets/optimized/manifest.json` and content-hashed WebPs for all seven new masters. | Complete | Map image loading and production artifact validation passed. |
| Cache/PWA | Updated `service-worker.js` cache version and cached login background URL for Pass 3A; removed `daily-rewards.css` from install-time cache per budget validator. | Complete | Service-worker coverage passed through map, public-site, animation, audio-delivery, and login-resilience validators. |
| Development QA gallery | Added `docs/visual-qa/pass-3a/index.html` with old/new, optimized gameplay, and map-composite views. | Complete | Local file gallery created outside production assets. |

Remaining known visual inconsistencies after Pass 3A:

- Four role Strongholds still use older production art and should be the first Pass 3B target.
- Camps, Inner Castle, officer portraits, consumables, pickups, and loading raster remain older style.
- Regional map backgrounds were intentionally retained; the new city art fits, but future map repainting should harmonize terrain brushwork, road scale, and settlement integration.
- Authenticated live HUD/profile/shop screenshots still require a signed-in QA harness or manual review session.
- `tools/validate-asset-performance-budgets.js` still fails on the existing `game.js` source-entry budget: 1604.2 KiB vs 1600 KiB. The Pass 3A art outputs are under their per-category budgets and the production artifact is under the 25 MiB artifact budget.

## Pass 3B Update - Four Strongholds

Pass 3B replaces only the four role Strongholds. It does not alter camps, Inner Castle, characters, gear, consumables, pickups, or regional maps.

| Asset/System | Pass 3B implementation | Completion | QA status |
| --- | --- | --- | --- |
| Performance guardrail precheck | Inspected `game.js` before art work. It remains 1604.2 KiB against the 1600 KiB source budget. No safe no-behavior cleanup was identified. | Documented; not changed | Budget validator expected to keep reporting this separate issue. |
| Gold Stronghold | Replaced `assets/gold-stronghold.png` with a fortified merchant yard and treasury complex. | Complete | West Marches map QA passed. |
| Training Stronghold | Replaced `assets/training-stronghold.png` with a fortified barracks and drill-yard complex. | Complete | North Frontier map QA passed. |
| Speed Stronghold | Replaced `assets/speed-stronghold.png` with a fortified cavalry/courier relay and stable complex. | Complete | East Reach map QA passed. |
| Defense Stronghold | Replaced `assets/defense-stronghold.png` with a layered practical fortress. | Complete | Southfields map QA passed. |
| Optimized derivatives | Regenerated `assets/optimized/manifest.json` and content-hashed WebPs for the four role Strongholds. | Complete | Runtime, production-artifact, map-loading, and stale-reference validation passed; asset-budget validator still stops on the pre-existing `game.js` source-size guardrail. |
| Development QA gallery | Added `docs/visual-qa/pass-3b/index.html`, map composites, old/new comparisons, gameplay-size preview, and QA notes. | Complete | Local file gallery created outside production assets. |

Remaining known visual inconsistencies after Pass 3B:

- Camps are now the most visible old map-objective raster family.
- Inner Castle hub/buildings, officer portraits, consumables, pickups, loading ring/crown, and map transition raster still need future passes.
- Regional maps were intentionally retained and should receive their own dedicated pass later.
- `tools/validate-asset-performance-budgets.js` still fails on the existing `game.js` source-entry budget: 1604.2 KiB vs 1600 KiB.

## Pass 3C Update - Objective Scale And Camps

Pass 3C locks permanent map-object scale classes and replaces only the four Camp assets. It does not alter Inner Castle, officers, gear, consumables, pickups, loading raster, transition raster, or regional maps.

| Asset/System | Pass 3C implementation | Completion | QA status |
| --- | --- | --- | --- |
| Map objective scale standard | Added Art Bible rules for City, Camp, Stronghold, and Crown Citadel scale classes. Camps now use 640x640 source masters, 384x384 optimized canvases, and 132px runtime render boxes. Strongholds now use 640x640 source masters, 384x384 optimized canvases, and 154px runtime render boxes. Crown Citadel keeps a 384x384 optimized canvas and 260px runtime render box. | Complete | `tools/validate-map-object-scale.js` passed. |
| Stronghold normalization | Reframed all four Pass 3B Stronghold masters on identical 640x640 transparent canvases and regenerated 384x384 optimized derivatives without tight transparent trimming. Runtime/editor/server sizing now treats all normal Strongholds as one fixed class. | Complete | Objective scale sheet passed; all four normal Strongholds read as equal class below Crown Citadel. |
| Gold Camp | Replaced `assets/camps/gold.png` with a merchant/tax convoy camp using wagons, guarded goods, a counting table, chests, and restrained Crownlands banners. | Complete | Graywood Hollow actual-map QA passed. |
| Warband Camp | Replaced `assets/camps/troops.png` with a temporary military encampment using tents, racks, banners, soldiers, and campfire activity. | Complete | Goldmere Plains actual-map QA passed. |
| Relic Camp | Replaced `assets/camps/items.png` with a guarded shrine/pavilion camp using candles, pale cloth, reliquary cues, guards, and no magical glow. | Complete | Greenrook Vale actual-map QA passed. |
| Deed Camp | Replaced `assets/camps/deed.png` with a charter/herald camp using documents, wax seals, survey stakes, records, and a Crownlands pavilion. | Complete | Stonebrook Farms actual-map QA passed. |
| Optimized derivatives | Updated `tools/optimize-game-art.py` with fixed-layout asset categories so Camps, Strongholds, and the Crown Citadel preserve transparent padding. Regenerated `assets/optimized/manifest.json` and content-hashed WebPs. | Complete | Fixed-size optimized alpha canvases validated. |
| Development QA gallery | Added `docs/visual-qa/pass-3c/objective-scale.html`, objective-scale sheet, old/new camp comparison, actual-map camp composites, and QA notes. | Complete | Local file gallery created outside production assets. |

Remaining known visual inconsistencies after Pass 3C:

- Inner Castle hub/buildings, officer portraits, consumables, pickups, loading ring/crown, peace shield field, HUD bitmap icons, and map transition raster still need future passes.
- Regional maps were intentionally retained; the new Camp art fits, but the older terrain brushwork and road integration should be addressed in a dedicated map pass later.
- `tools/validate-asset-performance-budgets.js` still fails on the existing `game.js` source-entry budget: 1604.2 KiB vs 1600 KiB.

## Pass 3D Update - Inner Castle

Pass 3D replaces only the Inner Castle hub and six building-location scenes. It preserves Firebase, gameplay, economy, combat, Common Gear behavior, city ownership, hotspot interaction, and the Pass 3C map-object scale system.

| Asset/System | Pass 3D implementation | Completion | QA status |
| --- | --- | --- | --- |
| Inner Castle standards | Added permanent Art Bible rules for hub/building dimensions, camera, safe zones, shared masonry/timber, lighting, functional identity, and officer inheritance. | Complete | Static doc review passed. |
| Inner Castle hub | Replaced `assets/inner-castle/inner-castle-hub.png` with a single working royal bailey: Treasury upper-left, Great Hall upper-center, Barracks upper-right, Alehouse lower-left, Gatehouse lower-center, Royal Stables lower-right. | Complete | Hotspot overlay QA passed. |
| Treasury | Replaced `assets/inner-castle/treasury.png` with a secure counting chamber/storehouse using ledgers, scales, chests, clerks, locks, and restrained coins. | Complete | Contact-sheet and runtime-size QA passed. |
| Great Hall | Replaced `assets/inner-castle/great-hall.png` with a human-scale ruler's hall using timber roof beams, dais, long tables, hearth, tapestries, and banners. | Complete | Contact-sheet and runtime-size QA passed. |
| Barracks | Replaced `assets/inner-castle/barracks.png` with a practical military room/yard connection using racks, shields, soldiers, benches, and equipment stores. | Complete | Contact-sheet and runtime-size QA passed. |
| Alehouse | Replaced `assets/inner-castle/alehouse.png` with a warm castle gathering room using benches, trestle tables, barrels, hearth, mugs, and retainers. | Complete | Contact-sheet and runtime-size QA passed. |
| Gatehouse | Replaced `assets/inner-castle/gatehouse.png` with a defensive command point using oak gate, portcullis, chains, guards, bell, and wall tools. | Complete | Contact-sheet and runtime-size QA passed. |
| Royal Stables | Replaced `assets/inner-castle/royal-stables.png` with working stables using horses, tack, hay, troughs, stable hands, and courier/cavalry cues. | Complete | Contact-sheet and runtime-size QA passed. |
| Inner Castle CSS frame | Tuned the existing Inner Castle modal, hotspot plaques, preview tray, and navigation buttons away from blue/gold fantasy styling toward parchment, timber, iron, burgundy, and muted brass. | Complete | Desktop and mobile-landscape screenshot QA passed through the Pass 3D harness. |
| Optimized derivatives | Regenerated the six 512x512 building WebPs and the 1280x960 hub WebP through `tools/optimize-game-art.py`; updated `assets/optimized/manifest.json` and `game.js` references. | Complete | `tools/validate-inner-castle.js` locks dimensions and asset paths. |

Remaining known visual inconsistencies after Pass 3D:

- Officer portraits are now the most immediate mismatch because Common Gear opens from the refreshed Barracks, Treasury, Gatehouse, and Stables scenes.
- Consumable item icons, common gear box, pickups, loading crown/ring, peace shield field, HUD bitmap icons, and map transition raster still need future passes.
- Regional maps were intentionally retained and should receive a dedicated terrain/map repaint pass later.
- `tools/validate-asset-performance-budgets.js` still fails on the existing `game.js` source-entry budget: approximately 1604 KiB vs 1600 KiB.

## Pass 3E Update - Officer Portraits And Common Gear

Pass 3E replaces the four Inner Castle officer portraits and all 32 Common Gear item masters. It preserves Common Gear IDs, names, statistics, bonuses, upgrade requirements, inventory/equipment behavior, server authority, Firebase data, and the Pass 3C map-object scale system.

| Asset/System | Pass 3E implementation | Completion | QA status |
| --- | --- | --- | --- |
| Officer standard | Added a permanent male-only character rule, canonical 1086x1448 source and 768x1024 runtime portrait dimensions, shared camera/lighting/material rules, and role-specific identity guidance. | Complete | Four-officer contact and building-inheritance review passed. |
| War Captain | Replaced `assets/gear/war-captain.png` with an adult male field commander in grounded campaign equipment inside the Pass 3D Barracks. | Complete | Old/new, role readability, desktop, and mobile-landscape QA passed. |
| Master of Coin | Replaced `assets/gear/master-of-coin.png` with an adult male royal financial administrator carrying a sealed ledger and keys in the Pass 3D Treasury. | Complete | Male-only requirement and non-weapon identity passed. |
| Cavalry Master | Replaced `assets/gear/cavalry-master.png` with an adult male horse/logistics officer using riding kit, reins, dispatch case, and stable context. | Complete | Officer-to-Stables inheritance passed. |
| Defensive Commander | Replaced `assets/gear/defensive-commander.png` with an adult male fortress commander using practical heavy armor, gate keys, and shield in the Pass 3D Gatehouse. | Complete | Gatehouse inheritance and human-scale armor review passed. |
| 32 Common Gear pieces | Replaced all four eight-piece source sets with profession-specific late-medieval equipment. Treasury's weapon-slot art is a sealed ledger with attached counting scale, not a weapon. | Complete | Four role contact sheets and all-item alpha review passed. |
| Gear dimensions | Normalized every item to 1254x1254 RGBA source and 192x192 RGBA runtime. Added fixed-layout `gear-item` optimization so transparent padding cannot be trimmed. | Complete | Manifest and source metadata validation passed. |
| Common Gear UI shell | Retuned reveal, equipped-slot, detail, action, back, and inventory surfaces from blue glass/fantasy styling to timber, iron, parchment, burgundy, and muted brass. | Complete | Desktop and mobile-landscape screenshot QA passed. |
| Optimized derivatives | Regenerated portrait and item WebPs through `tools/optimize-game-art.py`; updated manifest and both browser/server Common Gear references. | Complete | Runtime/Common Gear/production validators passed. |
| Development QA gallery | Added `docs/visual-qa/pass-3e/index.html`, old/new officer comparison, building pairings, all 32 items, equipped UI, and QA notes/screenshots. | Complete | Local gallery tested with no missing images. |

Remaining known visual inconsistencies after Pass 3E:

- The Common Gear Box itself remains old-style and should be replaced with the consumable/supply-item family.
- Consumables, pickups, loading crown/ring, peace shield field, remaining HUD bitmap icons, and map transition raster remain visibly older than the officer/Inner Castle family.
- Regional maps were intentionally retained and should receive a dedicated terrain/map repaint pass later.
- `tools/validate-asset-performance-budgets.js` still reports the existing `game.js` source-entry budget issue at approximately 1604 KiB vs 1600 KiB.

## Pass 3F Update - High-Frequency Items And Rewards

Pass 3F replaces the Common Gear Box, six consumables, two map/reward pickups, and active Peace Shield field. Gameplay IDs, prices, durations, inventory counts, daily rewards, mission/achievement rewards, server-secured Gear Box contents, Firebase, and multiplayer logic remain unchanged.

| Asset/System | Pass 3F implementation | Completion | QA status |
| --- | --- | --- | --- |
| Item family standard | Added fixed 1254x1254 RGBA source framing plus 160/192/256px runtime classes and grounded object/material rules to the Art Bible. | Complete | `tools/validate-pass-3f-items.js` passed. |
| Common Gear Box | Replaced the glossy box with a scratched oak quartermaster chest and added a matching open state. The reveal now animates latch, closed/open artwork, and three physical parchment gear cards. | Complete | Closed/open/revealed sequence and server call placement passed. |
| Consumables | Replaced Royal Peace Shield, War Drums, Royal Tax Decree, Veil of Silence, Swift March Order, and Recall Horn with readable late-medieval physical objects. | Complete | Shop, Bag, effect HUD, and 34px readability passed. |
| Reward pickups | Replaced Gold and Troop pickups with a coin purse/tax token and helmet/banner/muster roll. Reduced flying token counts and removed neon map rings. | Complete | Map placement, reward flight, mission, achievement, daily, and level-up contexts passed. |
| Peace Shield field | Replaced the energy-bubble art with a thin wax-marked royal authority perimeter and quieter city animation. | Complete | Protected-city readability and overlap checks passed. |
| Shop/Bag/effect UI | Restyled final repeated surfaces as merchant ledger, quartermaster inventory, and compact cloth/iron timer tabs. | Complete | Desktop and mobile-landscape screenshot QA passed. |
| Optimization/cache | Added fixed-layout `item`, `pickup`, `status`, and `gear-box` categories, regenerated hashed derivatives, and advanced the source PWA cache to `20260812-items-pass-3f-r3`; the verified production artifact is stamped `f4604e98824d`. | Complete | Manifest, alpha, reference, production, and cache validators passed. |
| Development QA | Added Pass 3F production prompts, old/new contacts, context gallery, responsive screenshots, and QA notes. | Complete | Local gallery reviewed outside production assets. |

Remaining known visual inconsistencies after Pass 3F:

- Loading crown/ring and several HUD bitmap icons are now the most visible old-style small-raster family.
- Regional maps and their thumbnails remain the largest remaining world-art family and intentionally retain their existing terrain rendering.
- Map-transition clouds remain acceptable under the restrained mist CSS but are not definitive production art.
- `tools/validate-asset-performance-budgets.js` still reports the known `game.js` source-entry budget issue separately.

## Pass 3G Update - Global HUD, Loading, Navigation, And PWA Identity

Pass 3G replaces the remaining high-frequency HUD bitmap family, loading medallion, map-switch marker, Daily Rewards mark, and installed-app identity. It preserves gameplay, Firebase, authentication, economy, map coordinates, operations, item behavior, and the map-object scale system.

| Asset/System | Pass 3G implementation | Completion | QA status |
| --- | --- | --- | --- |
| HUD icon family | Replaced Leaderboard, City List, Map, Shop, Bag, Reports, Achievements, and Daily Rewards with one physical parchment, leather, iron, wax, and muted-brass family. | Complete | Old/new contact, desktop, and 844x390 context QA passed. |
| Ruler identity | Replaced the ornate profile frame with a compact carved-oak and iron plaque while preserving flag and hero-level readability. | Complete | Desktop and Android-landscape framing passed. |
| Map navigation | Replaced the map-switch image with a light carved directional sign and retained clear directional runtime behavior. | Complete | 192x212 alpha canvas and runtime reference passed. |
| Loading identity | Replaced the polished crown/ring with the unified hammered Crownlands crown and engraved iron seal; reduced glow and slowed motion. | Complete | Loading screenshot and reduced-motion rule review passed. |
| Map transition | Retained the existing cloud raster but converted presentation to brief desaturated natural mist with restrained physical map movement. | CSS complete; raster retained | Transition screenshot passed; raster remains a future map-family cleanup item. |
| HUD state language | Consolidated pressed, selected, unread, warning, timer, gold, Citadel, incoming/outgoing, active-effect, and disabled treatments into timber, iron, wax, parchment, oxblood, and faded-indigo states. | Complete | Required desktop/mobile state board passed without overflow or collisions. |
| SVG/glyph cleanup | Updated crown and coin sprite forms, retained historically grounded attack/transfer/scout tokens, replaced the CSS search Unicode mark, and kept familiar fullscreen/sound concepts in the Crownlands SVG family. | Complete | Main runtime emoji audit passed; no telescope or visible emoji gameplay glyph remains. |
| Installed identity | Added one crown-over-gate burgundy emblem for favicon, normal PWA icons, maskable icons, Apple touch use, notification badge, and manifest identity colors. | Complete | 32/192/512 previews, safe-area, manifest path, and source-build checks passed. |
| Optimization/cache | Added fixed-layout HUD/loading categories, regenerated hashed WebPs, excluded the 1254px app-icon master from production, and advanced cache/build id to `20260812-global-hud-pass-3g-r1`. | Complete | Manifest, alpha, runtime-reference, cache, and production-build checks passed. |
| Development QA | Added prompts, archived old assets, generated-candidate records, contact sheets, responsive screenshots, and `docs/visual-qa/pass-3g/index.html`. | Complete | No broken gallery images; live login and state-board screenshots reviewed. |

Remaining known visual inconsistencies after Pass 3G:

- The 15 regional map backgrounds and their generated thumbnails are now the largest remaining high-visibility raster family.
- The existing map-transition cloud texture is acceptable under the new natural-mist CSS but is not definitive Crownlands production art.
- Some low-frequency public/help-page illustrations and editor-only controls still inherit older styling; they do not block the main play loop.
- Authenticated production HUD states were reviewed in a development state board using the actual optimized assets because the QA browser had no signed-in Firebase test account.
- `tools/validate-asset-performance-budgets.js` still reports the unrelated `game.js` source-entry budget issue at approximately 1604.6 KiB versus 1600 KiB. The two pre-existing unused route-helper lint warnings also remain.

## Pass 4A Update - Regional World Maps

Pass 4A replaces the 15 regional map backgrounds, their normal and immutable thumbnails, the five legacy editor fallback maps, and the retained transition-cloud raster. It preserves world IDs, region adjacency, coordinates, cities, Camps, Strongholds, Crown Citadel placement, combat, economy, Firebase, multiplayer, and server behavior.

| Asset/System | Pass 4A implementation | Completion | QA status |
| --- | --- | --- | --- |
| Regional map standard | Added permanent 1448x1086 canvas, shared camera/daylight/palette, labor-shaped terrain, runtime-safe zones, one-road-per-open-side, and closed-edge rules. | Complete | Art Bible and validator review passed. |
| Royal five | Replaced Crownlands Heart, West Marches, East Reach, North Frontier, and Southfields with one cultivated continental core family. | Complete | World overview, old/new, edge-pair, and overlay QA passed. |
| Midgame belt | Replaced Graywood Hollow, Greenrook Vale, Lowroad Vale, Stonebrook Farms, and Goldmere Plains with function-led forestry, river, low-road, farm, and grain landscapes. | Complete | Connected-edge and runtime-density QA passed. |
| Starter frontiers | Replaced Bandit Wastes, Ironfall Hills, Redbanner Fields, Ashenfen March, and Relic Vale with rough but inhabited scrub, upland, farmland, fen, and wooded-valley regions. | Complete | Closed-edge and 844x390 landscape QA passed. |
| Edge topology | Preserved all authoritative region adjacency and edge intervals: exactly one road for every open side, none for closed sides, and 18 reciprocal connected pairs. | Complete | `tools/validate-pass-4a-maps.js` passed. |
| Legacy compatibility | Retained and synchronized the five `*-island.webp` map-editor fallbacks to the matching new royal-region art. | Complete | Hash parity validation passed. |
| Thumbnails | Regenerated all 15 normal 320x240 thumbnails, produced content-hashed versions, updated references/manifest, and removed stale hashes. | Complete | 15-source/15-versioned dimension and hash checks passed. |
| Transition mist | Replaced the brighter fantasy cloud texture with neutral irregular low mist, preserving 1254x1254 RGBA source and 448x448 RGBA runtime contracts. | Complete | Alpha, manifest, runtime-reference, and contextual preview QA passed. |
| Performance/cache | Reduced regional maps from 8,927,742 to 4,486,884 bytes and thumbnails from 391,236 to 187,148 bytes; advanced source PWA cache to `20260812-regional-maps-pass-4a-r1`. | Complete | Map loading, cache, and Pass 4A validation passed. |
| Development QA | Added old/new gallery, full world layout, all 18 edge pairs, four actual-coordinate overlays, thumbnails, mist, desktop capture, Android-landscape capture, and per-region notes. | Complete | Browser resource tree and screenshots reviewed. |

Remaining known visual inconsistencies after Pass 4A:

- Some low-frequency public/help-page illustrations and editor-only controls still retain earlier styling, outside the active world-map surface.
- Authenticated live multiplayer map state was not available in the local QA browser; runtime overlay review used authoritative production coordinates and current 66/132/154/200px object classes.
- `tools/validate-asset-performance-budgets.js` still reports the unrelated `game.js` source-entry budget issue at approximately 1604.6 KiB versus 1600 KiB. The two pre-existing unused route-helper lint warnings also remain.

## Pass 4B Update - Public Pages, Heraldry, And Remaining Cleanup

Pass 4B closes the secondary public and customization surfaces without changing gameplay, authentication, Firebase, clan mechanics, flag/shield schemas, world data, or maps.

| System | Pass 4B implementation | Completion | QA status |
| --- | --- | --- | --- |
| Remaining visual-gap audit | Added `docs/CROWNLANDS_REMAINING_VISUAL_GAPS.md` with active, compatibility, documentation and obsolete classifications plus A-D final audit. | Complete | No meaningful player-facing Category A system remains. |
| Public component system | Rebuilt `site-info.css` around timber navigation, parchment/ledger sections, burgundy commands, iron secondary controls, readable tables/callouts/FAQ panels and restrained physical depth. | Complete | Home, Guides, Updates, Rules, Support, Privacy and article family reviewed. |
| Public responsiveness | Added explicit 480px treatment and rechecked 1440x900, 844x390 and 390x844. | Complete | No horizontal overflow; menu and article wrapping pass. |
| Login/background audit | Retained the approved Pass 3A login art after comparison with Pass 4A maps: maintained settlement, fields, roads, river, wagons and natural light remain coherent. | Complete | Desktop and Android-landscape entry reviewed. |
| Kingdom flags | Added presentation-only dye mapping, woven cloth, seam/edge and wear treatment. Stored values, patterns, symbols and Firebase sync remain unchanged. | Complete | Static persistence validator passed; editor/map/profile contexts documented in QA. |
| Clan shields | Added wood plank grain, paint texture, scratches and forged-edge depth to generated SVG shields; retuned editor workbench and controls. | Complete | Shield schema/updateClanProfile path unchanged and validated. |
| Empty/error/help states | Consolidated representative city/report/inventory/clan/reward empty states and failures into dispatch/ledger and rust-warning language. | Complete | Runtime markup unchanged; style coverage validated. |
| Retained editor | Recolored map/HUD editor shell and footprints toward restrained timber/parchment/iron admin language; component labels no longer use old icon glyphs. | Complete | Editor opened and reviewed; data/coordinates untouched. |
| Cache and validation | Advanced build/cache to `20260812-public-heraldry-pass-4b-r1`; added `tools/validate-pass-4b-visuals.js`. | Complete | Production and cache checks recorded in Pass 4B QA notes. |

Remaining known technical debt after Pass 4B:

- `tools/validate-asset-performance-budgets.js` reports `game.js` at 1606.3 KiB against the 1600 KiB guardrail. The overage predates this pass; Pass 4B adds approximately 1.7 KiB for persistence-compatible flag dye presentation and shield material texture markup.
- The two known unused route-helper warnings remain unrelated to visual work.
- Authenticated Firebase save submission cannot be exercised by the unsigned local QA browser; both persistence call chains are statically validated and their data formats are unchanged.

Pass 4B production artifact measurement: 17,660,252 -> 17,670,060 source bytes across the same 236 source files (+9,808 bytes / +0.06%). No production raster was added or removed. The deployment-stamped production validator reports 237 files / 16.87 MiB.

## Pass 4A-R Correction - Targeted Art Rollback And UI Polish

Pass 4A-R is a correction pass. It preserves Passes 3D-3F and the successful Pass 3G/4B systems while reversing only the explicitly rejected map, transition, and selected HUD artwork. The exact committed source revision is `f4604e98824d57e1f27fc9a3f8bcb014519366d0` (`Set Gear Box price and fit artwork (#117)`, August 11, 2026).

| System | Pass 4A-R implementation | Completion | QA status |
| --- | --- | --- | --- |
| Regional maps | Restored all 15 authoritative 1448x1086 WebPs byte-for-byte from the pre-Pass-4A archive. Region IDs, layout, coordinates, routes, blockers, adjacency, and gameplay data are unchanged. | Complete | Exact SHA-256 parity and all-map loading validation passed. |
| Legacy map compatibility | Restored all five root `*-island.webp` files to their exact pre-Pass-4A compatibility versions. | Complete | Exact archive parity passed. |
| Map thumbnails | Restored the pre-Pass-4A 420x315 normal thumbnail set, regenerated 15 immutable fingerprints, and updated every active reference. | Complete | Source/versioned parity and no-stale-hash checks passed. |
| Map transition | Restored the exact pre-Pass-4A cloud master and regenerated the 448x448 optimized derivative. Transition timing and behavior are unchanged. | Complete | Live full-motion transition captured and alpha/reference checks passed. |
| Selected HUD art | Restored the exact pre-Pass-3G Leaderboard, Daily Rewards, Profile frame, and Reports source masters and regenerated runtime derivatives. | Complete | Exact source parity and live authenticated HUD QA passed. |
| Top HUD surfaces | Removed visible outer card treatments around Profile, Leaderboard, Clan, and Daily Rewards while preserving 56px desktop/mobile icon targets and the profile frame. | Complete | Desktop and Android-landscape live QA passed. |
| Map arrows | Replaced the large blue bloom with a tight parchment/beige halo using `#D8C7A1` and `#CBB78F`; retained a 92x92 hit area while reducing visual scale. | Complete | Light and dark terrain captures plus computed-style checks passed. |
| Readability polish | Applied a shared ink-on-parchment and warm-ivory-on-command-surface contract to Profile, Skills, Clan, Shop, Bag, attack preparation, Reports, missions, achievements, and related high-frequency panels. | Complete | Authenticated data, desktop, and 844x390 checks passed. |
| Functional safety | Limited runtime markup change to the visual Attack button icon wrapper; no command submission, combat, economy, Firebase, route, timer, reward, or multiplayer logic changed. | Complete | Syntax/runtime validators and non-destructive live QA passed. |
| Development QA | Added `docs/visual-qa/pass-4a-r/` with archived Pass 4A art, restored assets, HUD/transition comparisons, responsive screenshots, and exact audit notes. | Complete | Development-only gallery excluded from production. |

Pass 4A-R payload changes intentionally favor the requested art: regional masters increase by 4,440,858 bytes over Pass 4A, normal thumbnails increase by 204,088 bytes, restored selected HUD masters increase by 251,563 bytes, and the restored transition master increases by 1,288,602 bytes. The optimized transition is 750 bytes smaller; the four restored optimized HUD derivatives increase by 17,322 bytes.

Known unrelated technical debt remains tracked separately: `game.js` is slightly above its 1600 KiB source guardrail, and the two legacy unused route-helper warnings remain.

## Pass 4A-R2 Correction - Live Gameplay Map Delivery

Pass 4A-R2 completes the regional revert at the runtime-delivery layer. It preserves every restored source master and all gameplay/world data while preventing installed PWAs from serving Pass 4A bytes through reused mutable gameplay URLs.

| System | Pass 4A-R2 implementation | Completion | QA status |
| --- | --- | --- | --- |
| Gameplay map references | Moved all 15 `imageSrc`/`imagePath` mappings to byte-identical content-fingerprinted files under `assets/worlds/world_01/maps/versioned/`. | Complete | All 15 runtime hashes match restored sources and pre-Pass-4A archives. |
| Map delivery manifest | Added `assets/worlds/world_01/map-manifest.json` with source, output, size, and SHA-256 for every region. | Complete | Manifest count and file parity passed. |
| Build pipeline | Added `tools/fingerprint-world-maps.js`; sync, deployment stamping, and production build enforce current fingerprints. Production ships only immutable gameplay maps. | Complete | Fingerprint check and artifact validation passed. |
| PWA cache isolation | Scoped cache-first/network-first matching to the current Crownlands cache and advanced source cache id to `20260812-pre-pass-4a-gameplay-maps-r2`. | Complete | Clean installed-service-worker QA fetched all 15 expected files; no retired Crownlands cache survived activation. |
| Live gameplay | Confirmed the authenticated renderer requests the restored fingerprinted Ashenfen background behind cities, routes, arrows, and HUD at 1440x900 and 844x390. | Complete | Desktop and Android-landscape captures passed. |

The live realm reached its 50-player capacity during attempts to enter additional regions. Crownlands Heart, North Frontier, and Southfields remain covered by exact source/runtime/archive SHA parity; the account was not forced through the waiting queue for further screenshot capture.

## City Progression Correction Pass

This focused correction replaces only the five main city-stage artworks and their delivery contract. Maps, camps, Strongholds, Crown Citadel, gameplay rules, city coordinates, Firebase, combat, economy, and UI layout remain unchanged.

| Asset/System | Correction | Completion | QA status |
| --- | --- | --- | --- |
| Stage 1 | Replaced with a compact timber frontier holding on a clean self-contained footprint. | Complete | Source, alpha, runtime, desktop, and Android-landscape QA passed. |
| Stage 2 | Replaced with a visibly larger fortified village, stronger gate tower, and denser working yard. | Complete | Source, alpha, runtime, desktop, and Android-landscape QA passed. |
| Stage 3 | Replaced with a taller central stone keep, stronger walls, towers, and denser internal settlement. | Complete | Source, alpha, runtime, desktop, and Android-landscape QA passed. |
| Stage 4 | Replaced with a substantial fortified town, taller towers, civic hall, and dense roofs. | Complete | Source, alpha, runtime, desktop, and Android-landscape QA passed. |
| Stage 5 | Replaced with the dominant final city: layered defenses, a taller upper keep, richer density, and the strongest silhouette. | Complete | Calculated gameplay height is over 15% greater than Stage 4; live QA passed. |
| Silhouette contract | Removed exterior bushes and detached scenery; tiny post-resize alpha fragments are cleaned automatically. | Complete | Every source validates as one connected visible component with clear canvas margins. |
| Scale contract | Standardized 768x768 source masters and fixed 256x256 optimized canvases with stage-specific visible occupancy. Existing CSS wrapper and hit-area sizes are unchanged. | Complete | Strict width, height, and visible-area progression validation passed. |
| Runtime delivery | Regenerated optimized WebPs, updated manifest/game/public references, and advanced the PWA cache to `20260812-city-progression-correction-r1`. | Complete | All five live images load at 256x256; stale city hashes are absent from active references. |
| Development QA | Added `docs/visual-qa/city-progression-correction/` with archived originals, candidate record, old/new comparison, transparent previews, runtime preview, responsive screenshots, and notes. | Complete | Development-only gallery is excluded from production. |
