# Crownlands - Medieval Browser Strategy Prototype

Landscape / horizontal medieval island-conquest prototype inspired by the core loop of Million Lords. This pass focuses on XP, troops, city levels, attack, defense, economy, skills, saves, scouting, and battle reports. Items and advisors are intentionally excluded.

## Current Mechanics Pass

- Player starts with 1 main city, 50 troops, and 500 gold.
- Google sign-in connects the account first; the player enters the live kingdom with a separate Enter Kingdom button.
- Each account can have one active browser session; signing in on another device signs out the older device.
- The current placeholder world contains 5 regional maps arranged on a square grid: center, west, east, north, and south.
- The current map reset is `fresh-2026-07-05-server-reset`, so online players start fresh in a new Firebase world slot.
- New online players claim starting cities from the available starter regions first; the center Crownlands region is intended as the main battleground.
- Cities produce troops and gold in real time while the game is active.
- Offline production catches up when the player returns: troops stay in the cities that produced them, while troops from cities lost offline rally to the main city.
- City level creates victory points.
- Victory points drive troop production, gold production, and capture XP value.
- The city counter opens a city list with the main city pinned first and level/troop sorting.
- A small floating home indicator appears when the main city is off-screen and recenters the map on click.
- Troop production uses `VP x 3`, plus Recruiter skill bonus.
- Gold production uses `VP x 8`, plus Prosperous skill bonus.
- City defense gives stationed soldiers `city level x 2%`, then adds city walls; Stoneworks strengthens the wall portion.
- Neutral captures are limited to 30 per local day.
- Neutral captures are also blocked once the player owns 30 cities; after that, expansion must come from player-owned cities.
- Captured cities enter a 1-hour XP cooldown. Attacking still works, but capture XP is reduced during cooldown.
- Hero levels award skill points.
- Skill tree now includes Striker, Fearless, Brave, Guardian, Prosperous, Recruiter, Rusher, Scavenger, Salvager, and Cautious.
- Fearless and Brave return some losses to the main city.
- Scavenger and Salvager recover gold from kills.
- Cautious refunds part of invested city upgrade gold when a player city is lost.
- Failed player attacks and lost defenses still award one-third of the matching victory XP.
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

This build has Firebase Auth, Firestore, and callable Functions added without breaking guest play.

- `firebase-config.js` holds the Firebase web app config placeholders.
- `firebaseClient.js` loads Firebase Auth, Firestore, and Functions only after real config values are pasted in.
- The setup screen now uses Google sign-in as the only entry button.
- Signed-in players save a private cloud snapshot to the current reset slot, `players/{uid}/saves/default-fresh-2026-07-05-server-reset`.
- After sign-in, the game automatically checks the current reset slot in Firebase first, then falls back to the current browser save key.
- `firestore.rules` allows private player saves and shared city setup, but blocks browser writes to army movement and report collections.
- Phase 2 now shards the world into one Firestore island per region, such as `islands/main-fresh-2026-07-05-server-reset-west`.
- The browser loads and subscribes to one active island at a time, starting with the player's home island.
- The island switcher lets signed-in players load a different island, unsubscribing from the previous island before opening the next one.
- While online, the browser syncs the signed-in player's owned cities back to Firestore for the currently loaded island.
- Online troop orders now call Firebase Functions: `sendArmyOrder` creates and validates marches server-side, and `resolveArmyOrder` resolves scouts, transfers, attacks, defenses, city capture, level drops, XP, gold rewards, and battle reports in Firestore transactions.
- Server-written reports are stored under `players/{uid}/serverReports/{reportId}` and merged into the in-game Reports UI.
- Kingdom-wide totals are server-derived in `players/{uid}/stats/global`. King Power, total city count, marching troops, gold/hour, troop/hour, per-island owned counts, and leaderboard rows should read this aggregate instead of scanning every island during normal login.
- King Power v5 is a server-authoritative military-readiness score made from controlled troops, 12 hours of sustainable troop replacement, and 25% of defensive advantage above the base troop count. City, stronghold, camp, and active-march troops count exactly once. Training, Defense, and Crown Citadel bonuses affect their matching military components; gold, raw city count, skills, and temporary items do not change King Power.
- Admin-only callables `recalculatePlayerGlobalStats` and `recalculateAllPlayerGlobalStats` rebuild the aggregate and leaderboard rows when old player data needs repair.

See `FIREBASE_SETUP.md` for the Firebase project steps and the planned shared-world collections.

Deploy Firebase rules and Functions after changing server multiplayer code:

```powershell
firebase deploy --only functions,firestore:rules,firestore:indexes
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

Upload the full folder or zip to Netlify Drop. Keep `index.html`, `styles.css`, `world-config.js`, `game.js`, `manifest.webmanifest`, and the `assets` folder together.

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

To update the PWA cache after changing cached assets, change `CACHE_VERSION` in `service-worker.js` and update any changed version query strings in `index.html` and `STATIC_CACHE_URLS`. Add new static art paths to `STATIC_CACHE_URLS` only when they are safe to cache as files. Do not add server data endpoints, player data, army orders, reports, or auth URLs to the cache list.

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
- Pan and pinch movement schedule camera transforms through `requestAnimationFrame` to reduce mobile pointer-event work.
- Press `F8` or open the game with `?perf=1` to show the developer performance panel with FPS, active region, visible marker counts, active army tokens, loaded image count, neighbor preload status, and service-worker state.
- Map art remains lazy-loaded and cache-first. The service worker should cache app shell and core art, while live Firebase/Auth/Functions/server requests remain uncached.
