# Crownlands - Medieval Browser Strategy Prototype

Landscape / horizontal medieval island-conquest game inspired by the core loop of Million Lords. The current online-first build includes XP, troops, city levels, attack, defense, economy, skills, items, camps, clans, a rally-focused Clan War Room, scouting, and battle reports.

## Current Mechanics Pass

- Player starts with 1 main city, 200 troops, and 100 gold.
- Google sign-in connects the account first; the player enters the live kingdom with a separate Enter Kingdom button.
- Each account can have one active browser session; signing in on another device signs out the older device.
- The current world contains 15 connected regional maps.
- The current map reset is `fresh-2026-07-26-server-reset`, with world ID `main-fresh-2026-07-26-server-reset`.
- New online players claim starting cities from the available starter regions first; the center Crownlands region is intended as the main battleground.
- Cities produce troops and gold in real time while the game is active.
- Reopening Crownlands after at least one minute starts a one-use Welcome back summary. Server-authoritative gold is collected across every owned map, troop production is reported only when it remains in cities still owned, and captured cities, Strongholds, and the Crown Citadel are listed from ownership history. Switching maps never opens the summary.
- City level creates victory points.
- Victory points drive troop production, gold production, and capture XP value.
- The city counter opens a city list with the main city pinned first and level/troop sorting.
- A small floating home indicator appears when the main city is off-screen and recenters the map on click.
- Troop production uses configured production VP multiplied by 10, plus Royal Granaries and objective bonuses.
- Gold production uses configured production VP multiplied by 15, the level-100+ growth curve, Tax Stewardship, item effects, and objective bonuses.
- City defense gives stationed soldiers `city level x 2%`, then adds city walls; Stoneworks strengthens the wall portion.
- Neutral captures are limited to 30 per local day.
- Neutral captures are also blocked once the player owns 30 cities; after that, expansion must come from player-owned cities.
- Hero XP keeps the early progression curve through level 25, then each level requires 10% more XP. A single battle can award up to 100% of a level through level 50, declining smoothly to 50% at level 100 and 35% at level 150.
- Hero levels award skill points.
- The skill tree includes Swordmastery, Stoneworks, Tax Stewardship, Royal Granaries, Guild Charters, March Orders, and Field Medics.
- Field Medics returns a percentage of battle losses to the main city.
- Failed player attacks and lost defenses still award one-third of the matching victory XP.
- The Citadel Legion selects up to 20 random regular non-main cities in the Crown Citadel region at 9:45 AM and 6:15 PM Eastern Time, then attacks each with 100,000 NPC troops at 10:00 AM and 6:30 PM Eastern. The `America/New_York` schedule follows daylight-saving changes. Peace Shields do not block the event. Held defenses preserve city level and award no XP; failed defenses remove five levels, with Level 5-or-lower cities returning to neutral at Level 1 with 10 troops.
- Captured cities lose 1 level on takeover, but never drop below Level 1.
- Combat preview shows attack power, defense power, estimated losses/survivors, capture or defeat XP, and XP efficiency.
- The bottom `Reports` button opens battle reports filtered by attack, defense, and scout results.
- Attack reports show victory or defeat based on the final combat result.
- Defense reports show held defenses or lost cities.
- Scout reports show the latest revealed troop and defense totals.

## Map Rules

- The editor source of truth is now JSON under `assets/worlds/world_01/`.
- `assets/map-editor-data.js` is still generated as a compatibility file so the current game can load exported placements normally.
- Regional maps are decorative backgrounds only; cities, strongholds, camps, and gameplay markers are overlaid from data.
- Regions connect through north, south, east, and west edge connection zones. These zones create map-switch icons in the game.
- Portals are no longer part of the editor data model.
- Cities are placed manually on open land or clearings, with resource strongholds and the Crown Citadel configured as separate marker types.
- Cities are not placed on ocean, lakes, mountains, dense forests, or swamp.
- Troops should cross between maps through edge connection zones where the maps naturally meet.
- Troops can walk through forests and swamp at normal speed.
- Active army route markers appear only after troops are sent.
- Selecting a non-owned city opens Scout, Attack, and Info actions around that city.
- Scouting dispatches one troop from the nearest reachable owned city; its report reveals a troop and defense snapshot for two minutes after arrival.
- Owned cities have a Scout Nearby action. The first click previews the nearby radius and highlights targets; pressing Send All costs 10,000 gold and dispatches one troop from that city to every reachable highlighted non-owned city.
- A completed scout report adds a Report action to the selected city and shows the reported troop count in its banner.
- Detailed reports include city level, troop and wall defense contributions, total defense, and level/percentage rows for relevant defense and attack skills.

## Testing Locally

Open the Netlify site, sign in with Google, then use the live map to scout, attack, defend, and confirm reports in the bottom `Reports` menu.

## Online Multiplayer Foundation

The live game is online-first and uses Firebase Auth, Firestore, and callable Functions as the authority for shared gameplay. Local simulation remains for editor and automated-test workflows.

- `firebase-config.js` holds the public Firebase web-app configuration and optional App Check/rewarded-ad settings.
- `firebaseClient.js` initializes Firebase Auth, Firestore, and Functions for signed-in play.
- The setup screen now uses Google sign-in as the only entry button.
- Signed-in players save a private cloud snapshot to the current reset slot, `players/{uid}/saves/default-fresh-2026-07-26-server-reset`.
- After sign-in, the game automatically checks the current reset slot in Firebase first, then falls back to the current browser save key.
- `firestore.rules` allows private player saves and narrowly scoped identity updates, while blocking browser writes to server-owned economy, city, army, rally, and report state.
- The world is sharded into one Firestore island per region, such as `islands/main-fresh-2026-07-26-server-reset-west`.
- The browser loads and subscribes to one active island at a time, starting with the player's home island.
- The island switcher lets signed-in players load a different island, unsubscribing from the previous island before opening the next one.
- While online, the browser subscribes to server-owned city state; gameplay mutations go through callable Functions.
- The Crown Marches admits exactly 50 active players and queues overflow in ticket order. Join, leave, promotion, and stale cleanup share a short server-only admission lease; routine player heartbeats write separate member documents so 50 connected players never hammer one shared capacity document.
- Online troop orders now call Firebase Functions: `sendArmyOrder` creates and validates marches server-side, and `resolveArmyOrder` resolves scouts, transfers, attacks, defenses, city capture, level drops, XP, gold rewards, and battle reports in Firestore transactions.
- Clan rallies are server-authoritative three-player attacks against Strongholds, the Crown Citadel, and reward camps. Forming targets live in clan-private Firestore documents; public `rally_join` marches reveal only the contribution route to the assembly city. The leader controls launch, cancellation, and the combined army's Recall Horn, while ally casualties, XP, Field Medics recovery, and survivor returns settle separately through idempotent receipts.
- Clan reinforcements are capped per relationship rather than globally: a ruler may maintain two assignments with each clanmate, with only one assignment per supported holding. Ordinary cities reserve at most five contributor slots transactionally when marches launch; Strongholds and reward camps remain uncapped. Returning troops go back to their snapshotted source holding while it remains owned, otherwise they redirect to the sender's current Main City.
- The Clan War Room is the clan home for rallies. Members can form, join, inspect, withdraw from, launch, and cancel the same server-authoritative rallies available under Kingdom Activity, without a separate operation-planning system.
- Server-written reports are stored under `players/{uid}/serverReports/{reportId}` and merged into the in-game Reports UI.
- Kingdom-wide totals are server-derived in `players/{uid}/stats/global`. King Power, total city count, marching troops, gold/hour, troop/hour, per-island owned counts, and leaderboard rows should read this aggregate instead of scanning every island during normal login.
- King Power v8 is a server-authoritative military-readiness score made from controlled troops, 12 hours of sustainable troop replacement, and 25% of defensive advantage above the base troop count. City, Stronghold, camp, active-march, stationed reinforcement, and committed rally troops count exactly once. Combined rally armies are excluded from the leader's personal marching count so committed troops are never double-counted. Training, Defense, and Crown Citadel bonuses affect their matching military components; gold, raw city count, skills, and temporary items do not change King Power.
- Admin-only callables `recalculatePlayerGlobalStats` and `recalculateAllPlayerGlobalStats` rebuild the aggregate and leaderboard rows when old player data needs repair.

See `FIREBASE_SETUP.md` for the Firebase project steps and the planned shared-world collections.

Deploy Firebase rules and Functions after changing server multiplayer code:

```powershell
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
```

## Local Game Editor

Run the local editor from PowerShell:

```powershell
.\tools\start-editor.ps1
```

Then open `http://127.0.0.1:8791/editor/`. The Game Editor runs only on this computer. Use World Layout mode to arrange regional maps, Region Edit mode to place cities, strongholds, camps, and edge connections, and Economy mode to configure shop items, pickups, city production, skills, level rewards, action costs, and camp rewards.

`Save to Game` writes:

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/map-editor-data.js` for current game compatibility
- `economy-config.js` for the Netlify/browser game
- `functions/economy-config.json` for server-authoritative Firebase Functions

Gold and Warband Camps can override their default daily reward schedules per placed camp. Relic Camps can override their daily item reward count. Economy changes take effect on Netlify after pushing, and server-side values take effect after deploying Firebase Functions.

The editor also serves the game at `/game/` for a quick browser preview.

To check that troop travel can move through every regional edge connection, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\validate-world-routes.ps1
```

## Deploy on Netlify

Upload the full folder or zip to Netlify Drop. Keep `index.html`, `styles.css`, `world-config.js`, `game.js`, `audio-manager.js`, `service-worker.js`, `manifest.webmanifest`, and the complete `assets/` and `audio/` folders together.

For GitHub + Netlify, push this full folder to GitHub, then create a Netlify site from that repo. Netlify can publish the folder directly with the included `netlify.toml`.

Netlify is the only public game frontend. Firebase Hosting is configured as a redirect-only shell that sends Firebase-hosting URLs back to `https://crownland.netlify.app/`; Firebase is still used for Auth, Firestore, and Cloud Functions.

## Progressive Web App

Crownlands can now be installed as a Progressive Web App from the Netlify site. The PWA setup includes:

- `manifest.webmanifest` with standalone landscape display and Crownlands launcher icons.
- `service-worker.js` for repeat-load caching and offline app-shell fallback.
- `firebase-messaging-sw.js` as a compatibility wrapper that loads the main service worker.
- Mobile metadata in `index.html` for Android Chrome, desktop Chrome, and iPhone Safari Add to Home Screen.
- An optional `Install Crownlands` button when the browser exposes the install prompt.

The service worker caches the app shell, core scripts, manifest, loading art, HUD icons, castle images, stronghold images, camp images, item images, thumbnails, and the current starter-region map assets. It does not cache Firebase Auth, Firestore, Cloud Functions, Netlify Functions, API calls, POST requests, or future live multiplayer server state.

The audio manifest is loaded network-first. MP3, OGG, and WAV media files stream directly from the host so browser byte-range requests receive native `206 Partial Content` responses; audio media is intentionally excluded from service-worker Cache Storage.

Netlify runs `tools/stamp-deploy-build.js` for every deployment. It stamps the deployed commit into the HTML build marker, local JavaScript/CSS URLs, and service-worker cache version. Signed-in clients detect that new build within 60 seconds, save current state, activate the new service worker, and restart on the new version. Add new static art paths to `STATIC_CACHE_URLS` only when they are safe to cache as files. Do not add server data endpoints, player data, army orders, reports, or auth URLs to the cache list.

Audio delivery and browser validation:

```powershell
node .\tools\audio-browser-test-server.js --self-test
node .\tools\validate-audio-browser.js
```

The second command requires Playwright to be available to Node. It automatically uses installed Chrome and Edge (or `CROWNLANDS_CHROME_PATH` / `CROWNLANDS_EDGE_PATH`) and checks fresh playback, blocked-autoplay recovery, the first-gesture race, mobile touch recovery, mute persistence, effects while music is muted, background pause/resume with transient-effect cancellation, login control placement, and a service-worker-controlled reload with native ranged media responses.

Local PWA test:

```powershell
& "C:\Users\ricmo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 8787
```

Open `http://127.0.0.1:8787/` in Chrome. Service workers work on `localhost` and `127.0.0.1` for local testing.

Verification checklist:

- Open DevTools > Application > Manifest and confirm the app name, icons, standalone display, and landscape orientation.
- Open DevTools > Application > Service Workers and confirm `/service-worker.js` is registered.
- Open DevTools > Application > Cache Storage and confirm `crownlands-cache-*` exists.
- Reload once online, then switch DevTools to Offline and reload. The shell/loading screen should still open from cache.
- Desktop/Android Chrome: use the browser install icon or the in-game `Install Crownlands` button when it appears.
- iPhone Safari: open `https://crownland.netlify.app/`, tap Share, then tap Add to Home Screen.

Deploying to Netlify still works through GitHub push. `netlify.toml` keeps `index.html`, the manifest, and service workers fresh while allowing longer caching for versioned map/icon assets.

## Performance Notes

- Map backgrounds now replace the visible region image only after the next image is decoded, without crossfading two full map images at once. This avoids blank flicker while keeping mobile GPU memory lower.
- Large map child layers avoid forced 3D compositing, and crowded-map mode disables extra shadows/animations when many city or army markers are visible.
- City marker rebuilds are reserved for structural changes such as owner, level, selection, flag, shield, visibility, or report state. Troop counts update separately on a short interval so normal production does not rebuild every visible city.
- Army tokens are reused and moved with `translate3d` transforms instead of being rebuilt each movement tick.
- Region, camp, route, and city lookups use bounded/indexed caches. Remote and pending army view objects are reused between movement ticks, and repeated owned-city queries share one result inside each display frame to reduce garbage-collection spikes.
- Pan and pinch movement schedule camera transforms through `requestAnimationFrame` to reduce mobile pointer-event work.
- Every completed pan or zoom schedules an immediate visibility refresh, so newly exposed city markers do not wait for the periodic map-render interval.
- Service-worker registration and cached asset URLs resolve from the deployed game folder, including itch.io's nested HTML upload paths.
- Press `F8` or open the game with `?perf=1` to show the developer performance panel with FPS, active region, visible marker counts, active army tokens, loaded image count, neighbor preload status, and service-worker state.
- Map art remains lazy-loaded and cache-first. The service worker should cache app shell and core art, while live Firebase/Auth/Functions/server requests remain uncached.
