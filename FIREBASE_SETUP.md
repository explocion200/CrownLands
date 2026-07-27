# Crownlands Online Setup

This build keeps guest/local play working while adding Firebase for Google sign-in, cloud saves, realtime city sync, server-authoritative troop movement, and server-authoritative economy updates.

## Phase 1: Connect Firebase

1. Create a Firebase project.
2. Add a Web app in Firebase project settings.
3. Enable Authentication -> Sign-in method -> Google.
4. Enable Firestore Database.
5. Copy the Firebase web app config into `firebase-config.js`.
6. In Firebase project settings -> Cloud Messaging -> Web Push certificates, generate/copy the public key into `firebase-config.js` as `vapidKey`.
7. Publish the rules from `firestore.rules`.
8. Open the game through Netlify or a local web server and click `Sign in with Google`.

The Firebase web config is not a password. Real protection comes from Firebase Authentication and Firestore rules.

## AdSense Site Review and Public Content

The Crownlands login screen is intentionally ad-free. It must not contain an AdSense display unit, Auto ad loader, Google Publisher Tag loader, or another Google-served placement. Google identifies login pages as screens where publisher-content is not the focus.

Site ownership is verified without requesting an advertisement:

1. `index.html` and the public information pages contain the non-serving `google-adsense-account` meta tag.
2. `ads.txt` contains the authorized seller line for the Crownlands publisher account.
3. `about.html`, `how-to-play.html`, `game-rules.html`, `support.html`, and `privacy.html` provide original, crawlable content without requiring an account.
4. `robots.txt` permits crawling and points to `sitemap.xml`.

Keep AdSense Auto ads disabled for the login/game application. If AdSense display advertising is introduced after the site is approved, add it only to an eligible public content page after a placement-specific policy review. Never add display advertising to login, navigation, queue, alert, modal, error, or other behavioral screens.

## Rewarded Ad Setup

The Shop includes two optional rewarded-web cards: Gold `.5h` and Troop `.5h`. A successful Google reward grants an immediate amount equal to 30 minutes of city-level base production. Both choices share one 30-minute cooldown and a combined limit of 20 successful rewards per UTC day.

Before enabling production rewards:

1. In Firebase Console, enable App Check for the Crownlands web app with the reCAPTCHA Enterprise provider. Add every production and local test domain, then paste the public site key into `firebase-config.js` as `appCheckSiteKey`.
2. Grant the `Firebase App Check Token Verifier` role to the service account used by the Functions, then deploy `getRewardedAdStatus`, `prepareRewardedAd`, and `claimRewardedAd`. All three require authentication, enforced App Check, and consumed limited-use App Check tokens.
3. In Firestore, create `serverConfig/rewardedAds` with `{ "enabled": true }` only after the rest of this checklist is complete. A missing document or `enabled: false` disables only the two ad reward cards without affecting paid Shop items.
4. Enable Firestore TTL for the `rewardedAdIntents` collection group using the `deleteAfter` field. Intent documents are otherwise server-only and retained for claim replay prevention and auditing.
5. In Google Ad Manager, create a rewarded-web ad unit, connect eligible Google demand, and approve the exact Netlify production host. Put its full `/NETWORK_CODE/AD_UNIT_CODE` path into `ads-config.js` as `productionAdUnitPath`, and keep every allowed live hostname in `approvedProductionHosts`.
6. Configure matching Ad Manager frequency caps of one rewarded impression per 30 minutes and 20 per day.
7. Publish a Google-certified consent message for the regions you serve and review `privacy.html` with the final business/contact details before switching the production ad unit on.

Localhost, `127.0.0.1`, and `*.localhost` use Google's rewarded-web sample ad unit. All other hosts fail closed until `productionAdUnitPath` is set. Closing, blocking, skipping, unsupported rendering, and no-fill grant nothing. The client submits the claim only after Google Publisher Tag emits `rewardedSlotGranted`; the server claim is transactional and idempotent.

Google Publisher Tag is loaded on demand only after an eligible signed-in player starts the rewarded flow; it is not loaded by the login page or public content pages. Do not substitute a Google Ads campaign/customer ID: the web rewarded slot needs a Google Ad Manager network and rewarded-web ad unit path.

## Phase 1 Data

The game currently writes private account data here:

- `players/{uid}`: display name, email, ruler name, flag, character, skill data, city count, gold.
- `players/{uid}/notificationTokens/{tokenId}`: browser push tokens for incoming scout/attack alerts.
- `players/{uid}/saves/default-fresh-2026-07-05-server-reset`: the current full game state snapshot for the fresh reset.
- `players/{uid}/serverReports/{reportId}`: server-written attack, defense, and scout reports that survive stale browser saves.

After Google sign-in, the game tries the current reset slot in Firebase first and then falls back to the current local browser storage key.

## Phase 2 Multiplayer Shape

The game now creates one shared island document per world region and subscribes to only one active island at a time:

- `islands/main-fresh-2026-07-05-server-reset-west`: one region metadata document for the current reset.
- `islands/main-fresh-2026-07-05-server-reset-west/cities/{cityId}`: city owner, level, troop count, owner UID, owner name, owner flag, region ID, and production state.
- `islands/{islandId}/armies/{armyId}`: server-written moving troops, route, owner, arrival time, and mission type.
- `islands/{islandId}/reports/{reportId}`: server-written shared report records.
- `islands/{islandId}/presence/{uid}`: who is online.

On first sign-in, the browser chooses a home region, seeds that region island if it does not exist, then claims one unowned starting city for the signed-in player. The active island's city docs are watched in realtime, so ownership changes from Firestore update the loaded island without refreshing. Switching islands unsubscribes from the previous island before loading the next one.

Troop orders and online economy updates now go through Firebase callable functions:

- `sendArmyOrder`: validates source ownership, troop count, target protection, travel timing, deducts troops, and creates visible army docs for every route region.
- `resolveArmyOrder`: can be triggered by any signed-in player who sees an overdue army. It resolves scouts, transfers, attacks, defenses, city capture, level drops, XP, gold rewards, and server reports in one Firestore transaction.
- `collectEconomy`: collects passive/offline gold and troop production for every owned city across all region maps.
- `upgradeCity`: collects production, spends server gold, upgrades the city, records invested gold, and awards upgrade XP in one transaction.
- `purchaseShopItem` and `activateInventoryItem`: spend gold, update inventory, apply Peace Shield/War Drums timers, and sync shield expiry to owned city docs from the server.
- `resolveDueArmyOrders`: runs from Cloud Scheduler once per minute, finds overdue active attack/scout/transfer armies, and resolves them on the server even when every player is offline.

Browsers can read army/report streams, but Firestore rules block direct browser writes to `armies`, `reports`, `serverReports`, player economy fields, and city troop/level/production fields after the initial starting-city claim.

Important: deploy both Functions and rules after this update:

```bash
firebase deploy --only functions,firestore
```

If Functions are not deployed, online troop orders will be rejected instead of falling back to client-side combat. If the Firestore indexes are not deployed, the scheduled resolver may not be able to find overdue armies. Scheduled functions use Cloud Scheduler, so the Firebase project must have Cloud Scheduler enabled and a billing plan that supports scheduled functions.

## Netlify

This remains a static site. Netlify should publish this folder directly. `netlify.toml` is already configured with `publish = "."`.

Firebase Hosting is not the live game frontend anymore. Its hosting config only redirects players to `https://crownland.netlify.app/` so there is not a second playable copy of Crownlands. Keep Firebase for Auth, Firestore, and Functions.
