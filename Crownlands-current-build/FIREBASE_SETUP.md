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

After Google sign-in, the game tries Firebase first and then falls back to local browser storage.

## Phase 2 Multiplayer Shape

The game now creates and subscribes to a shared island:

- `islands/main`: shared island metadata.
- `islands/main/cities/{cityId}`: city owner, level, troop count, owner UID, owner name, owner flag, and production state.
- `islands/{islandId}/armies/{armyId}`: moving troops, route, owner, arrival time, mission type.
- `islands/{islandId}/reports/{reportId}`: attack, defense, and scout reports.
- `islands/{islandId}/presence/{uid}`: who is online.

On first sign-in, the browser seeds `islands/main` if it does not exist, then claims one unowned starting city for the signed-in player. City docs are watched in realtime, so ownership changes from Firestore update the map without refreshing.

The next implementation pass should move army creation, army arrival, combat, scouting, and production collection into Firestore transactions so two players cannot overwrite the same city at the same time.

Important: publish the latest `firestore.rules` after this update. Older rules block shared island writes.

## Netlify

This remains a static site. Netlify should publish this folder directly. `netlify.toml` is already configured with `publish = "."`.
