# Defeated NPC artwork and respawn timers — October 13, 2026

The authorized merge and deployment of [PR #552](https://github.com/explocion200/CrownLands/pull/552) is **LIVE — WEB AND FIREBASE**. Defeated normal marauders and bosses show the approved fallen artwork at their previous location, using the same 90px/115px map boxes and anchor as their living counterparts. The server-clock countdown uses the existing two-minute solo and thirty-minute boss deadlines. The old marker disappears when the server supplies its replacement at a new road position; blocked placement retains inactive remains labeled “Awaiting respawn.” Defeated markers cannot be selected, scouted or attacked and do not appear in nearby enemy search.

## Verified identity

| Item | Value |
|---|---|
| Feature branch / merged PR | `codex/defeated-npc-artwork`, #552 |
| Runtime build | `1c3faf7f062b0173fd09ae34575df1c1f1accac0` |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `1b73610ca3eba4cb4a38af32190a69ffe9785d6b1adc028d4355d6d33aeb5abe` |
| Netlify deployment | `6acea2914271d1fce274a840` |
| Web publication | October 13, 5:36 p.m. Eastern (`2026-10-13T21:36:10.614Z`) |
| Firebase project | `crown-land-b15e0` |
| Updated revisions | `getrealminfo-00207-yiv`, `maintainmarauders-00005-kud`, `refreshmarauderrespawn-00001-xap` |
| World / generation / shard | `main-realm-2026-10` / `realm-2026-10` / `shard_0001` |
| Population/refill availability | Existing October flag remained enabled |

## Validation and deployment

- `Static validation`, `Multiplayer emulator validation` and `Validate` passed for feature head `b7534f3f21de1783241d2f8fe9c8799474b38578` in [run 38462301206](https://github.com/explocion200/CrownLands/actions/runs/38462301206). Focused browser, asset-budget, artifact, marauder-rule and terrain validators passed. Selected population and real-combat emulator suites passed.
- Population tests cover exact-spawn and server-time guards, inactive/foreign/retired/stale requests, concurrent viewers and minute maintenance, blocked-placement retry throttling, and atomic replacement. Combat tests verify the existing solo/boss deadlines, retained defeat positions, failed encounters, rewards and refunds. Existing road-only placement, cap, inset, spacing, troop combat and reward rules remain intact.
- Source and built UI passed at 1440×900, 844×390 and 568×320, including transparent matching-size fallen art, countdown, inactive targets, nearby-search exclusion, bounded wake requests, replacement movement/removal and account scoping. Existing Info, Scout Report and refill-draft interactions also passed. The fallen assets load on demand, outside the install precache, within the approved 80 KiB pair budget.
- Clean local `main` was synchronized and equal to `origin/main`, divergence `0 0`, after the feature merge. The full-commit-stamped artifact passed validation: 1,160 files including inventory and 179 resources per entry. The entire 1,159-entry staged inventory and 27 staged/79 public selected-file comparisons passed. An initial local/staged service-worker comparison differed only because the local stamp used a shortened commit; rebuilding with Netlify's full commit setting restored exact parity without a source change.
- Six staged and six public cold-load/reload checks passed at the three sizes using isolated browser profiles, with no uncaught exceptions or missing game assets. NPC interactions passed using the exact scripts/styles fetched from the staged and published hosts; the fixture harness exercised the defeated lifecycle without production gameplay writes. Staged and public fallen-art screenshots were inspected. Public comparisons cover the canonical game at `https://playcrownlands.com/play/` and both compatibility hosts.
- Added `refreshMarauderRespawn`, updated `maintainMarauders` for shared population logic, and updated `getRealmInfo` for build identity. Their stored source archives match all 65 tracked runtime files and the merged manifest. All 150 Functions are ACTIVE on Node 22; the other 147 retain their exact baseline hashes, archives, revisions and update times. The 29-callable access audit and four unauthenticated realm/stamina/refill/respawn guards passed.
- Release ID and API contract remain unchanged. Existing rules match SHA-256 `17f686a05f6f92676dc5ce93345cbe609b19c4754dd94461907304052dd58b0a`; both NPC indexes remain READY. No rules/index deployment was needed. Authenticated realm lookup before and after publication verified the exact runtime, contract, October identity and `core-expansion-v1` topology, including 57 active New Lands. Temporary Auth probe accounts were deleted and created no player profiles or assignments.
- The previous web release stayed published under the existing manual hold until backend and staged-client verification passed. The exact merged Netlify deploy was then published and locked again. Population/refills remained enabled. No administrative population rewrite, realm reset, player-data edit or payment-setting change was performed.

## Observation and limits

Initial bounded monitoring through `2026-10-13T21:37:16.020Z` found zero HTTP server errors and zero error-severity entries in 13 service-log entries. The 101-record battle sample was truncated and found no new sampled settlement; the refill sample found no new purchase. This short observation does not establish long-term availability, balance, traffic or billing behavior.

Actual production defeat-to-respawn cycles, signed-in gameplay delivery, existing-profile navigation, installed apps/physical phones and long-term monitoring remain verification limits. No production scout, hunt or purchase was initiated for verification, and no continuing monitor was scheduled. Sanitized receipts and screenshots remain under ignored `release-artifacts/marauders/defeated-deployment/`.

Web and Firebase are verified at the runtime above. itch.io was not republished and needs separate authorization for matching publication. This release-record follow-up changes documentation only and does not redeploy the runtime.
