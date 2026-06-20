# Crownlands - Medieval Browser Strategy Prototype

Landscape / horizontal medieval island-conquest prototype inspired by the core loop of Million Lords. This pass focuses on XP, troops, city levels, attack, defense, economy, skills, saves, and testing tools. Items and advisors are intentionally excluded.

## Current Mechanics Pass

- Player starts with 1 main city, 50 troops, and 500 gold.
- The island contains 70 evenly spaced cities on the generated medieval map.
- Cities produce troops and gold in real time while unpaused.
- City level creates victory points.
- Victory points drive troop production, gold production, and capture XP value.
- Troop production uses `VP x 3`, plus Recruiter skill bonus.
- Gold production uses `VP x 8`, plus Prosperous skill bonus.
- City defense uses `city level x 3%`, city walls, troop count, and Guardian skill.
- Neutral captures are limited to 30 per local day.
- Neutral captures are also blocked once the player owns 30 cities; after that, expansion must come from NPC/player-owned cities.
- Captured cities enter a 1-hour XP cooldown. Attacking still works, but capture XP is reduced during cooldown.
- Hero levels award skill points.
- Skill tree now includes Striker, Fearless, Brave, Guardian, Prosperous, Recruiter, Rusher, Scavenger, Salvager, and Cautious.
- Fearless and Brave return some losses to the main city.
- Scavenger and Salvager recover gold from kills.
- Cautious refunds part of invested city upgrade gold when a player city is lost.
- Combat preview shows attack power, defense power, estimated losses/survivors, capture XP, and XP efficiency.

## Developer Test Panel

- Dev tools can be toggled on/off from the bottom `Dev` button.
- Grants gold.
- Grants troops to the main city.
- Grants hero skill points for testing skills.
- Instantly levels the selected city.

## Map Rules

- The map uses the generated medieval island image as the playable background.
- Cities are placed on open land or clearings only.
- Cities are not placed on ocean, lakes, mountains, dense forests, or swamp.
- Troops cannot walk through ocean, lakes, or mountains.
- Troops can walk through forests and swamp at normal speed.
- Active army route markers appear only after troops are sent.
- Selecting a non-owned city opens Scout, Attack, and Info actions around that city.
- Scouting dispatches one troop from the nearest reachable owned city; its report reveals a troop and defense snapshot for two minutes after arrival.
- Owned cities have a Scout Nearby action. The first click previews a 300-distance radius and highlights targets; pressing Send All costs 1,000 gold and dispatches one troop from that city to every reachable highlighted non-owned city.
- A completed scout report adds a Report action to the selected city and shows the reported troop count in its banner.
- Detailed reports include city level, troop and wall defense contributions, total defense, and level/percentage rows for relevant defense and attack skills.

## Testing Locally

Open `index.html` in a browser, choose `Fresh New Map`, then use the `Dev` panel to grant gold, troops, skill points, or city levels.

## Online Multiplayer Foundation

This build has the first Firebase layer added without breaking guest play.

- `firebase-config.js` holds the Firebase web app config placeholders.
- `firebaseClient.js` loads Firebase Auth and Firestore only after real config values are pasted in.
- The setup screen now uses Google sign-in as the only entry button.
- Signed-in players save a private cloud snapshot to `players/{uid}/saves/default`.
- After sign-in, the game automatically checks Firebase first, then falls back to the browser's local save.
- `firestore.rules` currently allows private player saves and keeps shared island writes locked until combat/city transactions are implemented.

See `FIREBASE_SETUP.md` for the Firebase project steps and the planned shared-world collections.

## Deploy on Netlify

Upload the full folder or zip to Netlify Drop. Keep `index.html`, `styles.css`, `game.js`, `manifest.webmanifest`, and the `assets` folder together.

For GitHub + Netlify, push this full folder to GitHub, then create a Netlify site from that repo. Netlify can publish the folder directly with the included `netlify.toml`.
