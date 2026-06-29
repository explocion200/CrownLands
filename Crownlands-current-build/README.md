# Crownlands - Medieval Browser Strategy Prototype

Landscape / horizontal medieval island-conquest prototype inspired by the core loop of Million Lords. This pass focuses on XP, troops, city levels, attack, defense, economy, skills, saves, scouting, and battle reports. Items and advisors are intentionally excluded.

## Current Mechanics Pass

- Player starts with 1 main city, 50 troops, and 500 gold.
- Google sign-in connects the account first; the player enters the live kingdom with a separate Enter Kingdom button.
- The world contains 5 large islands with 250 total dynamic city slots: 50 on the center island and 50 on each outer island.
- Each island keeps its middle clear for a future island stronghold.
- New online players claim starting cities on the outer islands first; the center island is only used when the outer islands are full.
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

- The game uses individual island maps backed by `assets/map-editor-data.js`.
- The center island is the largest battleground, with north, south, west, and east maps around it.
- Each island has portal markers that switch the active island map and route cross-island movement.
- Cities are placed on open land or clearings only, with island strongholds and the Crown Citadel configured as map objectives.
- Cities are not placed on ocean, lakes, mountains, dense forests, or swamp.
- Troops cannot walk through ocean, lakes, or mountains. All cross-island movement must route through portals.
- Troops can walk through forests and swamp at normal speed.
- Active army route markers appear only after troops are sent.
- Selecting a non-owned city opens Scout, Attack, and Info actions around that city.
- Scouting dispatches one troop from the nearest reachable owned city; its report reveals a troop and defense snapshot for two minutes after arrival.
- Owned cities have a Scout Nearby action. The first click previews a 300-distance radius and highlights targets; pressing Send All costs 1,000 gold and dispatches one troop from that city to every reachable highlighted non-owned city.
- A completed scout report adds a Report action to the selected city and shows the reported troop count in its banner.
- Detailed reports include city level, troop and wall defense contributions, total defense, and level/percentage rows for relevant defense and attack skills.

## Testing Locally

Open the Netlify site, sign in with Google, then use the live map to scout, attack, defend, and confirm reports in the bottom `Reports` menu.

## Online Multiplayer Foundation

This build has the first Firebase layer added without breaking guest play.

- `firebase-config.js` holds the Firebase web app config placeholders.
- `firebaseClient.js` loads Firebase Auth and Firestore only after real config values are pasted in.
- The setup screen now uses Google sign-in as the only entry button.
- Signed-in players save a private cloud snapshot to the current reset slot, `players/{uid}/saves/default-fresh-2026-06-23`.
- After sign-in, the game automatically checks the current reset slot in Firebase first, then falls back to the current browser save key.
- `firestore.rules` allows private player saves and signed-in shared-island writes for this prototype phase.
- Phase 2 now shards the world into one Firestore island per region, such as `islands/main-fresh-2026-06-23-west`.
- The browser loads and subscribes to one active island at a time, starting with the player's home island.
- The island switcher lets signed-in players load a different island, unsubscribing from the previous island before opening the next one.
- While online, the browser syncs the signed-in player's owned cities back to Firestore for the currently loaded island.

See `FIREBASE_SETUP.md` for the Firebase project steps and the planned shared-world collections.

## Local Web Editor

Run the local editor from PowerShell:

```powershell
.\tools\start-editor.ps1
```

Then open `http://127.0.0.1:8791/editor/`. The editor runs only on this computer and opens the current visual map editor for `assets/map-editor-data.js`, including individual island maps, portals, cities, strongholds, and custom map images. It also serves the game at `/game/` for a quick browser preview.

## Deploy on Netlify

Upload the full folder or zip to Netlify Drop. Keep `index.html`, `styles.css`, `world-config.js`, `game.js`, `manifest.webmanifest`, and the `assets` folder together.

For GitHub + Netlify, push this full folder to GitHub, then create a Netlify site from that repo. Netlify can publish the folder directly with the included `netlify.toml`.
