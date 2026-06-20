# Crownlands Online Setup

This build keeps guest/local play working while adding the first Firebase layer for Google sign-in and cloud saves.

## Phase 1: Connect Firebase

1. Create a Firebase project.
2. Add a Web app in Firebase project settings.
3. Enable Authentication -> Sign-in method -> Google.
4. Enable Firestore Database.
5. Copy the Firebase web app config into `firebase-config.js`.
6. Publish the starter rules from `firestore.rules`.
7. Open the game through Netlify or a local web server and click `Sign in with Google`.

The Firebase web config is not a password. Real protection comes from Firebase Authentication and Firestore rules.

## Phase 1 Data

The game currently writes private account data here:

- `players/{uid}`: display name, email, ruler name, flag, character, skill data, city count, gold.
- `players/{uid}/saves/default`: the current full game state snapshot.

Start / Continue tries Firebase first when signed in, then falls back to local browser storage.

## Phase 2 Multiplayer Shape

The shared-world collections are reserved but locked from writes in the starter rules:

- `islands/{islandId}`: island metadata, seed, season, created time.
- `islands/{islandId}/cities/{cityId}`: city owner, level, troop count, production timestamps.
- `islands/{islandId}/armies/{armyId}`: moving troops, route, owner, arrival time, mission type.
- `islands/{islandId}/reports/{reportId}`: attack, defense, and scout reports.
- `islands/{islandId}/presence/{uid}`: who is online.

The next implementation pass should move city ownership, army creation, army arrival, combat, scouting, and production collection into Firestore transactions so two players cannot overwrite the same city at the same time.

## Netlify

This remains a static site. Netlify should publish this folder directly. `netlify.toml` is already configured with `publish = "."`.
