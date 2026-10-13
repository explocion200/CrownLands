# Matching NPC Info and Scout Reports — October 13, 2026

The authorized merge and deployment of [PR #550](https://github.com/explocion200/CrownLands/pull/550) is **LIVE — WEB AND FIREBASE**. Marauder and clan-boss Info uses the city parchment frame, portrait/level identity, stat ledger and independently scrolling action column. NPC Scout Reports use the city scout heading, own-ruler/neutral identity strip, full troop and defense cards, and wall-free defender table. Contained controls fix the oversized burgundy decoration in the user's screenshot. Scout-gated intelligence, recorded values, replacement privacy, timers, navigation, hunt preparation and refill drafts remain intact. Gameplay and previously published attack reports are unchanged.

## Verified identity

| Item | Value |
|---|---|
| Feature branch / merged PR | `codex/npc-info-panel-layout`, #550 |
| Runtime build | `f57b5604b14df112d8a87d47af0d4fea631c3a49` |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `1ae77b11fe9c6b65c6ffb574c3010a93f76acf11b978b95c9d408859871b20a7` |
| Client source SHA-256 | `d6bd0ca857cc5ddea55366f9451cf7a5808d74e5786a805a35be7580fe5fb99a` |
| Netlify deployment | `6ace7f2089fb4f3b77b70e27` |
| Web publication | October 13, 3:02 p.m. Eastern (`2026-10-13T19:02:05.084Z`) |
| Firebase project / updated revision | `crown-land-b15e0` / `getrealminfo-00206-tek` |
| World / generation / shard | `main-realm-2026-10` / `realm-2026-10` / `shard_0001` |
| Population/refill flag | Existing October flag remained enabled |

## Validation and deployment

- `Static validation`, `Multiplayer emulator validation` and `Validate` passed for feature head `f0d8316e8b824c4dc8b279b8351d7f45cae93b33` in [run 38446306689](https://github.com/explocion200/CrownLands/actions/runs/38446306689). `prepare-pr` passed six selected validators covering city regression, NPC Info, scout presentation/lifecycle, report integration and asset budgets. The multiplayer aggregate passed with emulator execution explicitly inapplicable to this client-only change.
- Source and exact built panels passed city/NPC comparisons at 1440×900, 844×390 and 568×320: six Info cases and six successful Scout Report cases per variant, plus replacement/unavailability checks. Coverage includes artwork, exact large/zero/missing intelligence, independent scroll, 44px controls, keyboard/focus, map/Back/close, timers, no fabricated city statistics and preserved hunt/refill context. Asset ceilings and dependencies are unchanged.
- Clean local `main` was synchronized and equal to `origin/main`, divergence `0 0`, after merge. The full-commit-stamped artifact passed validation: 1,158 files including inventory and 179 resources per entry. All 1,157 staged inventory entries, 25 staged and 73 public asset comparisons passed across the primary game and two compatibility hosts.
- Six staged and six public cold-load/reload checks passed at the three sizes with isolated browser profiles, no uncaught errors and no missing game assets. The NPC interaction harness also passed using the exact six panel scripts/styles fetched from each staged/public host. Interactions used disposable benchmark fixtures; no production scout, hunt or purchase was initiated. Public Info and Scout Report screenshots were inspected.
- Only `getRealmInfo` was redeployed for build identity. Its stored archive matches the merged manifest and all 65 tracked runtime files. All 149 Functions are ACTIVE on Node 22; the other 148 retain baseline source hashes, archives, revisions and update times. Release ID, API contract and server fingerprint are unchanged. The 29-callable access audit and three unauthenticated realm/stamina/refill guards passed.
- Existing rules match SHA-256 `17f686a05f6f92676dc5ce93345cbe609b19c4754dd94461907304052dd58b0a`; both NPC indexes remain READY. No rules/index or gameplay backend deployment was needed. Authenticated `getRealmInfo` before and after publication verified the exact runtime build, contract, October identity and `core-expansion-v1` topology, with 57 active New Lands. Temporary Auth probe accounts were deleted and created no player profiles or assignments.
- The manual publication hold remains enabled. Population/refills stayed enabled throughout this presentation-only release. No population rewrite, realm reset, player-data administration or payment-setting changes occurred.

## Observation and limits

Initial bounded monitoring through `2026-10-13T19:02:40.377Z` found zero HTTP server errors and zero error-severity entries in 2 service-log entries. The 101-record battle sample was truncated and found no new sampled settlement; the refill sample found no new purchase. This is a short observation, not a long-term economy, availability or billing conclusion.

Signed-in production panel/report delivery, existing-profile navigation, installed apps/physical phones and long-term monitoring remain manual limits. No continuing monitor was scheduled. Sanitized receipts/screenshots remain under ignored `release-artifacts/marauders/info-scout-deployment/`.

Web and Firebase are verified at the runtime build above. itch.io was not republished and requires separately authorized matching publication. This release-record follow-up changes documentation only and does not redeploy the runtime.
