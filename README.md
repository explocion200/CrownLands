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
- Victory points drive troop production, capture XP value, and city-value components of King Power. Gold production follows its separate configured city curve.
- The city counter opens a city list with the main city pinned first and level/troop sorting.
- A small floating home indicator appears when the main city is off-screen and recenters the map on click.
- Troop production uses the city's victory points multiplied by 10, plus Royal Granaries and objective bonuses.
- Gold production uses configured production VP multiplied by 15, the level-100+ growth curve, Tax Stewardship, item effects, and objective bonuses.
- City combat uses a two-phase siege model. Attack power first damages the holding's single physical wall; only power left after breaching it fights the garrison. Capturing requires the remaining attack power to exceed garrison defense.
- Each troop contributes `1.25` base attack power. Maximum Swordmastery adds 60%, raising that to `2.0` attack power per troop; an army's value is locked when it launches.
- City defense gives stationed soldiers `city level x 2%`; Stoneworks strengthens the wall layer. Reinforcements add troop defense but do not duplicate the destination wall or Stoneworks.
- Every city level uses the same linear wall curve: `200 + 28,858 x (level - 1)`. Wall power rises by the same amount at every level, and maximum Stoneworks produces approximately 5 million wall power at Level 100. `round(15 + city level x 0.3)` minutes is the full-breach repair window. Wall damage of at least 5% persists and adds its exact share of that window to the running deadline; later meaningful hits preserve elapsed progress and add only their own damage time. Combat captures, relinquishment, inactivity release, neutralization, neutral claims, ownership changes, and capture level drops preserve the active wall integrity and deadline. Breached walls provide zero defense until repaired. If an intact wall holds, defender troop losses are capped at 10%; protected raids never persist wall damage.
- Realm information advertises `siegeCombatVersion: 1`. Newly launched city and objective armies use it, while unversioned armies already in flight settle with the legacy formula; reward camps remain legacy combat.
- Neutral captures are limited to 30 per local day.
- Neutral captures are also blocked once the player owns 30 cities; after that, expansion must come from player-owned cities.
- Hero XP keeps the early progression curve through level 25, then each level requires 10% more XP. A single battle can award up to 100% of a level through level 50, declining smoothly to 50% at level 100 and 35% at level 150.
- Hero levels award skill points.
- The skill tree includes Swordmastery, Stoneworks, Tax Stewardship, Royal Granaries, Guild Charters, March Orders, and Field Medics.
- Field Medics returns a percentage of battle losses to the main city.
- Failed player attacks and lost defenses still award one-third of the matching victory XP.
- The Citadel Legion selects up to 20 random regular non-main cities in the Crown Citadel region at 9:45 AM and 6:15 PM Eastern Time, then attacks each with 100,000 NPC troops at 10:00 AM and 6:30 PM Eastern. The `America/New_York` schedule follows daylight-saving changes. Peace Shields do not block the event. Held defenses preserve city level and award no XP; failed defenses remove five levels, with Level 5-or-lower cities returning to neutral at Level 1 with 10 troops.
- Captured cities lose 1 level on takeover, but never drop below Level 1.
- Combat forecasts use the scout report's authoritative current wall integrity, wall power, garrison power, objective bonuses, and allied reinforcement troops. They show whether the wall or garrison is expected to hold, how much attack reaches the garrison, and likely survivors. The attacker's per-troop power is locked when the march launches; defender production, reinforcements, wall repairs, bonuses, and ownership remain live until arrival.
- Forecast strength labels use the same resolved power values as combat: defeat at or below the capture threshold, costly victory below 1.5x defense, advantage below 2x, strong advantage below 3x, and overwhelming only at 3x defense or higher. The send panel also shows projected losses, the minimum force needed to capture, any shortfall, and the minimum force needed to cause persistent wall damage.
- Daily login rewards use the current UTC calendar month rather than a fixed 30-day loop. February and 29-, 30-, and 31-day months each distribute the same monthly budget: 111 hours of gold production, 111 hours of troop production, and six rotating items. Missed days pause progress, at most two earned rewards wait for collection, and unclaimed rewards expire at month rollover.
- The public Battle and Economy Guide provides config-backed city charts, a two-stage siege explorer, skill references, economy flows, and wall-repair timelines without affecting live game state.
- The bottom `Reports` button opens battle reports filtered by attack, defense, and scout results.
- Attack reports distinguish captures, protected wall breaches, protected raids, and defeats. Detailed reports explain the applicable capture rule and compare the launch forecast with live arrival power when scout intelligence was available.
- Defense reports show held defenses or lost cities.
- Scout reports show the latest revealed troop and defense totals for ten minutes after arrival. A newer successful scout replaces the snapshot for that target and restarts its timer.

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
- Scouting dispatches one troop from the nearest reachable owned city; its report reveals a troop and defense snapshot for ten minutes after arrival.
- Owned cities have a Scout Nearby action. The first click previews the nearby radius and highlights targets; pressing Send All atomically charges the current Economy-configured cost and dispatches one troop from that city to every reachable highlighted non-owned city. Online batches are validated and charged by Firebase Functions, so a failed or retried request cannot partially charge or duplicate scouts.
- Regroup follows the same server-authoritative batch policy: it charges the configured cost once and either launches every confirmed nearby transfer or launches none.
- A completed scout report adds a Report action to the selected city and shows the reported troop count in its banner.
- Detailed reports show the wall and garrison phases, starting and ending wall integrity, absorbed and penetrating power, repair status, troop losses, and relevant defense and attack skills.

## Testing Locally

Open the Netlify site, sign in with Google, then use the live map to scout, attack, defend, and confirm reports in the bottom `Reports` menu.

Run `node tools/audit-season-balance.js --check` after changing production, reward, skill, pickup, camp, item, wall, or repair values. Its 30-day modeling horizon uses a 30-city apex portfolio (1 Level 150, 4 Level 100, 10 Level 75, and 15 Level 50 cities) and guards the Level 150 siege benchmark. The horizon is a balance model only; it does not schedule or imply an automatic world reset.

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
- Online route previews and launches use the same authoritative route policy. The server validates region transitions, endpoints, distance, troop-speed bands, and arrival time instead of trusting client-supplied travel geometry.
- Incoming and outgoing army listeners are realm-scoped and recover independently with bounded backoff; a failure in one stream no longer removes the other stream's last known marches.
- Clan rallies are server-authoritative three-player attacks against Strongholds, the Crown Citadel, and reward camps. Forming targets live in clan-private Firestore documents; public `rally_join` marches reveal only the contribution route to the assembly city. The leader controls launch, cancellation, and the combined army's Recall Horn, while ally casualties, XP, Field Medics recovery, and survivor returns settle separately through idempotent receipts.
- Clan reinforcements are capped per relationship rather than globally: a ruler may maintain two assignments with each clanmate, with only one assignment per supported holding. Ordinary cities reserve at most five contributor slots transactionally when marches launch; Strongholds and reward camps remain uncapped. Returning troops go back to their snapshotted source holding while it remains owned, otherwise they redirect to the sender's current Main City.
- The Clan War Room is the clan home for rallies. Members can form, join, inspect, withdraw from, launch, and cancel the same server-authoritative rallies available under Kingdom Activity, without a separate operation-planning system.
- Server-written reports are stored under `players/{uid}/serverReports/{reportId}` and merged into the in-game Reports UI.
- Kingdom-wide totals are server-derived in `players/{uid}/stats/global`. King Power, total city count, marching troops, gold/hour, troop/hour, per-island owned counts, and leaderboard rows should read this aggregate instead of scanning every island during normal login.
- King Power v10 is a server-authoritative military-readiness score made from controlled troops, 12 hours of sustainable troop replacement, and 25% of defensive advantage above the base troop count. City, Stronghold, camp, active-march, stationed reinforcement, and committed rally troops count exactly once. Combined rally armies are excluded from the leader's personal marching count so committed troops are never double-counted. Training, Defense, and Crown Citadel bonuses affect their matching military components; gold, raw city count, skills, and temporary items do not change King Power.
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

`Save to Game` writes the canonical sources first, then regenerates their browser/server compatibility files:

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/map-editor-data.js` and `functions/world-layout.json` from the canonical world JSON
- `functions/economy-config.json` as the canonical economy source
- `economy-config.js` generated for the browser

`functions/release-config.json` is the canonical realm source; `release-config.js` is generated from it. Run `node tools/sync-runtime-data.js --check` to reject drift, or omit `--check` to regenerate all compatibility files.

Gold and Warband Camps can override their default daily reward schedules per placed camp. Relic Camps can override their daily item reward count. Economy changes take effect on Netlify after pushing, and server-side values take effect after deploying Firebase Functions.

The editor also serves the game at `/game/` for a quick browser preview.

To check that troop travel can move through every regional edge connection, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\validate-world-routes.ps1
```

## Deploy on Netlify

Build the production client with `node tools/build-production-client.js`, then upload only `dist/` to Netlify Drop. The generated artifact contains runtime pages, optimized images, world maps, versioned thumbnails, and MP3/OGG audio. It excludes editor tools, Functions source, canonical mutable world JSON, full-resolution art masters, WAV masters, tests, screenshots, logs, and notebooks.

For GitHub + Netlify, push the repository normally. The included `netlify.toml` validates canonical data, generates the release manifest, builds `dist/`, validates its size/references, and publishes only that directory.

Client/server entry compatibility uses the explicit `apiContractHash` in `functions/release-config.json`. Rotate that value only when a client-incompatible callable API change is intentionally released; ordinary implementation, validation, dependency, or line-ending changes must leave it unchanged. Full server and client source hashes remain in the generated manifest for deployment diagnostics.

Netlify is the only public game frontend. Firebase Hosting is configured as a redirect-only shell that sends Firebase-hosting URLs back to `https://crownland.netlify.app/`; Firebase is still used for Auth, Firestore, and Cloud Functions.

## Progressive Web App

Crownlands can now be installed as a Progressive Web App from the Netlify site. The PWA setup includes:

- `manifest.webmanifest` with standalone landscape display and Crownlands launcher icons.
- `service-worker.js` for repeat-load caching and offline app-shell fallback.
- `firebase-messaging-sw.js` as a compatibility wrapper that loads the main service worker.
- Mobile metadata in `index.html` for Android Chrome, desktop Chrome, and iPhone Safari Add to Home Screen.
- An optional `Install Crownlands` button when the browser exposes the install prompt.

The service worker installs only the minimal app shell. Optional HUD, castle, objective, pickup, thumbnail, and map art is cached on first use instead of competing with login and the first map interaction. It does not cache Firebase Auth, Firestore, Cloud Functions, Netlify Functions, API calls, POST requests, or future live multiplayer server state.

The audio manifest is loaded network-first. Production MP3 and OGG media stream directly from the host so browser byte-range requests receive native `206 Partial Content` responses; audio media is intentionally excluded from service-worker Cache Storage. WAV files stay in the repository as editable/validation masters but are not deployed.

Netlify generates a release manifest and runs `tools/stamp-deploy-build.js` for every deployment. The manifest carries the build, realm, callable count, and client/server contract hashes. `getRealmInfo` returns the server build and contract; gameplay blocks on realm/reset/world/contract drift while a source-only build-label difference remains diagnostic. The stamp writes the deployed commit into the HTML build marker, local JavaScript/CSS URLs, and service-worker cache version. Signed-in clients detect a new client build within 60 seconds, save current state, activate the service worker, and restart. Add new static art paths to `STATIC_CACHE_URLS` only when they are safe to cache as files.

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
- Published HUD, city, camp, Stronghold, and inner-castle artwork uses content-hashed browser-sized WebP derivatives; the original full-resolution files remain the editable masters.
- Speculative neighbor-map loading is disabled for Save-Data, slow connections, and background tabs.

## Health Check

Use Node 22 for release-equivalent local checks. Firebase emulator gates additionally require Java 21.

```powershell
.\tools\run-health-check.ps1

# Include Auth, Firestore, and Functions emulator gates:
.\tools\run-health-check.ps1 -IncludeEmulators
```

The equivalent individual commands are:

```powershell
Set-Location .\functions
pnpm test
pnpm audit --prod --audit-level moderate
Set-Location ..
node .\tools\validate-all-city-routes.js
node .\tools\validate-world-routes.js
```

The release workflow repeats the static suite under Node 22 and runs Auth, Firestore, Functions, economy-concurrency, army-listener, travel, scouting, rules, and multiplayer-reset emulator gates under Java 21. Performance budgets cover cold-login preloads, service-worker installation size, map and thumbnail size, and browser-sized gameplay artwork.
