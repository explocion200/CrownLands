# Crownlands Online Setup

This build keeps guest/local play working while adding Firebase for Google sign-in, cloud saves, realtime city sync, and server-authoritative troop movement.

## Phase 1: Connect Firebase

1. Create a Firebase project.
2. Add a Web app in Firebase project settings.
3. Enable Authentication -> Sign-in method -> Google.
4. Enable Firestore Database.
5. Copy the Firebase web app config into `firebase-config.js`.
6. Publish the rules from `firestore.rules`.
7. Open the game through Netlify or a local web server and click `Sign in with Google`.

The Firebase web config is not a password. Real protection comes from Firebase Authentication and Firestore rules.

## Phase 1 Data

The game currently writes private account data here:

- `players/{uid}`: display name, email, ruler name, flag, character, skill data, city count, gold.
- `players/{uid}/saves/default-fresh-2026-07-03-profile-reset`: the current full game state snapshot for the fresh reset.
- `players/{uid}/serverReports/{reportId}`: server-written attack, defense, and scout reports that survive stale browser saves.

After Google sign-in, the game tries the current reset slot in Firebase first and then falls back to the current local browser storage key.

## Phase 2 Multiplayer Shape

The game now creates one shared island document per world region and subscribes to only one active island at a time:

- `islands/main-fresh-2026-07-03-profile-reset-west`: one region metadata document for the current reset.
- `islands/main-fresh-2026-07-03-profile-reset-west/cities/{cityId}`: city owner, level, troop count, owner UID, owner name, owner flag, region ID, and production state.
- `islands/{islandId}/armies/{armyId}`: server-written moving troops, route, owner, arrival time, and mission type.
- `islands/{islandId}/reports/{reportId}`: server-written shared report records.
- `islands/{islandId}/presence/{uid}`: who is online.

On first sign-in, the browser chooses a home region, seeds that region island if it does not exist, then claims one unowned starting city for the signed-in player. The active island's city docs are watched in realtime, so ownership changes from Firestore update the loaded island without refreshing. Switching islands unsubscribes from the previous island before loading the next one.

Troop orders now go through Firebase callable functions:

- `sendArmyOrder`: validates source ownership, troop count, target protection, travel timing, deducts troops, and creates visible army docs for every route region.
- `resolveArmyOrder`: can be triggered by any signed-in player who sees an overdue army. It resolves scouts, transfers, attacks, defenses, city capture, level drops, XP, gold rewards, and server reports in one Firestore transaction.

Browsers can read army/report streams, but Firestore rules block direct browser writes to `armies`, `reports`, and `serverReports`. City/economy writes still have a browser-managed migration path for the current prototype; future economy hardening should move upgrades, recruitment, item effects, and production collection into callable functions too.

Important: deploy both Functions and rules after this update:

```bash
firebase deploy --only functions,firestore:rules
```

If Functions are not deployed, online troop orders will be rejected instead of falling back to client-side combat.

## Netlify

This remains a static site. Netlify should publish this folder directly. `netlify.toml` is already configured with `publish = "."`.
