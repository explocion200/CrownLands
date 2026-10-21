# Continuous-world gameplay pilot

This is a private sample-account pilot on `core-expansion-v1`, extending the command rehearsal. It does not activate open-world gameplay in the installed server. On October 21 the owner chose **prepare now; test later**. The physical two-player session remains pending; automated tests are not a substitute for that review.

## Distance policy

Scout Nearby and Regroup use the same canonical castle projection as the open-edge route planner. Their straight-line ranges remain **420 and 680 map units**, respectively. There is no multiplier applied to travel speed or arbitrary increase in range. The displayed neighbourhood now includes adjoining sections; generated sections sharing an artwork template remain distinct places. The server rechecks membership in the active realm, exact city identity, current ownership, range, troops, eligibility, gold and launch limits. Qualified bulk requests preserve section identity throughout signatures, movement copies, incoming notifications and returned city updates. Existing installed platforms still use the current same-map policy.

The pilot uses the existing configured costs (returned by the server), not hard-coded UI prices. Normal paid batching and idempotency apply. Regroup sends all available troops from selected eligible cities. These are city-neighbourhood controls; the existing all-active-maps NPC level finder and NPC spawning/admission placement are not rewritten by this change.

## Controls and isolation

`gameplay-pilot.js` creates an unpredictable `migration_game_worldtest_<12 hex>` schema, two fictional players, a fictional clan and catalog-based sample cities across 112 sections. Its seed is independent of live player data. Players start with test Gold, troops and Recall Horns. Keys select only these temporary accounts and exchange for port-specific HttpOnly/SameSite cookies. This is not a game-login proxy and never requests a real account password.

The preview connects real server handlers for previews, scouts, attacks, transfers, reinforcement, Scout Nearby, Regroup, Recall Horns, stationed reinforcement returns and rally creation/join/launch/withdrawal/cancellation. Costs, eligibility and failures come from those handlers. Scouts retain the established nearest-eligible-holding selection at launch; the UI identifies a selected-source scout preview as provisional. Camps, Towers, objectives and available NPCs retain their own server target types and checks. A bounded private ticker resolves due marches and rally receipts; travel is not accelerated for human testers.

The production reader remains read-only. A command-enabled server must receive the exact in-process pilot capability paired with its reader and fictional grants; request fields and environment variables cannot enable it. It permits only a small callable allowlist, same-origin JSON, bounded request bodies and one command per player/two overall. Client inputs cannot choose another acting identity. Failed requests keep the same order ID for retry where the game supports it. The browser clears stale drafts on selection/session changes. Old marches retain their stored paths; new routes are labeled as wider-world marches. Recall and Swift progress use the saved timing fields instead of stretching the original trip to a new deadline.

All assets, handlers and schemas used by this launcher are development-only. The published game excludes the pilot. The factory uses the rehearsal platform with external integrations disabled; it cannot send purchase, email or notification requests. No production accounts, saved city coordinates, services, grants, backups or public routes are changed.

## Automated validation

Run `node tools/test-local-postgres-world-pilot.js` with Node 22 and `CHROME_PATH` set to an installed test Chrome. It creates and drops only its own disposable schema. Tests cover cross-edge scouting/Regroup, generated-template separation, range exclusion, paid-request replay, ownership denial/loss, worker-error rollback and retry, real reinforcement and rally operations, two authenticated browser profiles, preview/send, saved return interpolation and no external browser requests.

Desktop 1440×900 and landscape 844×390 / 568×320 use actual browser input; mobile runs use 4× CPU slowdown. Reported measurements are short local moving-camera samples, not a multiplayer capacity estimate. Screenshots and JSON timings are in ignored `release-artifacts/continuous-gameplay-pilot/`. The final local run completed 16 successful command calls and 10 resolutions with zero settlement errors. The 32 handler/options samples measured 19.6 ms median / 58.3 ms p95; these exclude browser/network travel. All three moving-camera runs measured about 60 FPS with 16.7–16.8 ms p95 frame times. Full terrain stayed at four images, thumbnails at fifteen, requests at two, and listeners at 28. There were no browser exceptions or external requests. These measurements are automated emulation, not a new physical-phone result. Existing reader, read-only cohort, open-routing, travel/bulk-order validators and selected multiplayer emulator suites remain required dependencies.

## Starting the hands-on session later

From clean synchronized main, run:

```sh
node tools/run-world-gameplay-pilot.js --start --host=192.168.1.145 --port=8804
```

Use the computer's actual home-network address if it has changed. Without `--host`, the server binds only to loopback. The launcher rejects public interfaces; LAN access is limited to the matching local subnet and expires in **one hour**. No router forward or public Caddy route is installed. This sample-only private HTTP endpoint carries temporary pilot keys, never live game credentials. Share the two freshly generated keys privately with the selected testers; they are saved in a mode-0600 file under `release-artifacts/continuous-gameplay-pilot-session/`, not printed or put in a URL. The session file must not already exist. Do not start the clock until both testers are ready.

The launcher shows the entry URL. Assign Rowan and Alder to separate browsers/devices. On home Wi-Fi, each opens the URL and enters their own temporary key. Test the nearby cross-edge city, a transfer, an attack on a neutral city, allied reinforcement and return, Recall Horn, Scout Nearby, Regroup and a two-player rally. Confirm accepted departure/arrival times, troop conservation, selection/follow across boundaries, visibility after ownership changes, pinch/drag/zoom, failed-request retry and refresh/reconnection. Use **Measure 10s** during camera movement and record FPS/p95, phone model and unexpected messages. Normal combat requirements still apply; a server denial should be visible instead of silently changing the order.

The process removes keys and the disposable schema at expiry or SIGINT/SIGTERM. It creates no backup. If the machine/process is killed before cleanup, review the exact schema recorded in that session file before deleting it; never drop schemas by a broad wildcard. Public rollout, a live-account write pilot, full game UI parity and coordinated backend/client activation/rollback remain separate work after the human findings are resolved.
