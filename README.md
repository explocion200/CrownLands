# Crownlands - Medieval Browser Strategy Prototype

Landscape / horizontal medieval island-conquest prototype inspired by the core loop of Million Lords. This pass focuses on XP, troops, city levels, attack, defense, economy, skills, saves, scouting, and battle reports. Items and advisors are intentionally excluded.

## Current Mechanics Pass

- Player starts with 1 main city, 50 troops, and 500 gold.
- Google sign-in connects the account first; the player enters the live kingdom with a separate Enter Kingdom button.
- The current placeholder world contains 5 regional maps arranged on a square grid: center, west, east, north, and south.
- The current map reset is `fresh-2026-07-03-profile-reset`, so online players start fresh in a new Firebase world slot.
- New online players claim starting cities from the available starter regions first; the center Crownlands region is intended as the main battleground.
- Cities produce troops and gold in real time while the game is active.
- Offline production catches up when the player returns: troops stay in the cities that produced them, while troops from cities lost offline rally to the main city.
- City level creates victory points.
- Victory points drive troop production, gold production, and capture XP value.
- The city counter opens a city list with the main city pinned first and level/troop sorting.
- A small floating home indicator appears when the main city is off-screen and recenters the map on click.
- Troop production uses `VP x 3`, plus Recruiter skill bonus.
- Gold production uses `VP x 8`, plus Prosperous skill bonus.
- City defense uses `city level x 3%`, city walls, troop count, and Guardian skill.
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
- Signed-in players save a private cloud snapshot to the current reset slot, `players/{uid}/saves/default-fresh-2026-07-03-profile-reset`.
- After sign-in, the game automatically checks the current reset slot in Firebase first, then falls back to the current browser save key.
- `firestore.rules` allows private player saves and shared city setup, but blocks browser writes to army movement and report collections.
- Phase 2 now shards the world into one Firestore island per region, such as `islands/main-fresh-2026-07-03-profile-reset-west`.
- The browser loads and subscribes to one active island at a time, starting with the player's home island.
- The island switcher lets signed-in players load a different island, unsubscribing from the previous island before opening the next one.
- While online, the browser syncs the signed-in player's owned cities back to Firestore for the currently loaded island.
- Online troop orders now call Firebase Functions: `sendArmyOrder` creates and validates marches server-side, and `resolveArmyOrder` resolves scouts, transfers, attacks, defenses, city capture, level drops, XP, gold rewards, and battle reports in Firestore transactions.
- Server-written reports are stored under `players/{uid}/serverReports/{reportId}` and merged into the in-game Reports UI.

See `FIREBASE_SETUP.md` for the Firebase project steps and the planned shared-world collections.

Deploy Firebase rules and Functions after changing server multiplayer code:

```powershell
firebase deploy --only functions,firestore:rules
```

## Local Web Editor

Run the local editor from PowerShell:

```powershell
.\tools\start-editor.ps1
```

Then open `http://127.0.0.1:8791/editor/`. The editor runs only on this computer and opens the developer world editor for `assets/worlds/world_01/`. Use World Layout mode to place regional maps on the grid, and Region Edit mode to place cities, strongholds, and edge connection zones.

`Save to Game` writes:

- `assets/worlds/world_01/world-layout.json`
- `assets/worlds/world_01/regions/*.json`
- `assets/map-editor-data.js` for current game compatibility

The editor also serves the game at `/game/` for a quick browser preview.

To check that troop travel can move through every regional edge connection, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\validate-world-routes.ps1
```

## Deploy on Netlify

Upload the full folder or zip to Netlify Drop. Keep `index.html`, `styles.css`, `world-config.js`, `game.js`, `manifest.webmanifest`, and the `assets` folder together.

For GitHub + Netlify, push this full folder to GitHub, then create a Netlify site from that repo. Netlify can publish the folder directly with the included `netlify.toml`.

Netlify is the only public game frontend. Firebase Hosting is configured as a redirect-only shell that sends Firebase-hosting URLs back to `https://crownland.netlify.app/`; Firebase is still used for Auth, Firestore, and Cloud Functions.
