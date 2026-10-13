# NPC controls and inset respawns — October 13, 2026

The authorized coordinated release of [PR #543](https://github.com/explocion200/CrownLands/pull/543) and [PR #544](https://github.com/explocion200/CrownLands/pull/544) is **LIVE — WEB AND FIREBASE**. NPC selection opens the city's Scout / Info / Attack wheel. Info opens enemy details; Scout keeps pending/travelling feedback and spawn-specific Rescout/Report. Attack prepares solo troops or an eligible boss rally. Explicit Send/Launch and the two-member boss minimum remain required.

New/replacement centers stay 20% inside each map edge. Solo markers are 90px square; bosses are 115px. Active targets retain their locations, identities and defenders until defeated, then replacements adopt the inset. Stamina, proportional Crown pricing, rewards, combat and payment availability are unchanged.

## Verified identity

| Item | Value |
|---|---|
| Placement branch / merged PR | `codex/marauder-placement-and-size`, #543 |
| Controls branch / merged PR | `codex/marauder-city-action-controls`, #544 |
| Game build | `a3f0b09033c8cfd7562d711d937397b30d9e7bc5` |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `88506dea93a2490e9d37b8f6dfa8fc0ffb1d690e5417109267305ed87e7dd9c4` |
| Client source SHA-256 | `408d2e3e02f1a1855a4d636cd23e4541243386a0c86d107e62e5eccb362cd226` |
| Netlify deployment | `6acdf4c2e5dccf338bc35c0d` |
| Web publication | October 13, 5:24 a.m. Eastern (`2026-10-13T09:24:52.514Z`) |
| Firebase project | `crown-land-b15e0` |
| World / generation / shard | `main-realm-2026-10` / `realm-2026-10` / `shard_0001` |
| Population flag | Existing `marauderPopulation/realm-2026-10--shard_0001` remains enabled |

The manual web publication hold remains enabled. The [initial release ledger](MARAUDER_STAMINA_RELEASE_2026-10-12.md) retains activation, balance, wallet and paid-refill evidence. The separately hosted website retains its verified PR #29 disclosures.

## Validation and deployment

- All three required checks passed in [placement run 38343460632](https://github.com/explocion200/CrownLands/actions/runs/38343460632), including the population emulator and all 81 terrain/route layouts, and [controls run 38373289679](https://github.com/explocion200/CrownLands/actions/runs/38373289679). Controls change no server authority, so no additional emulator suite applies.
- Both `prepare-pr` runs passed their affected-test plans. Controls coverage includes keyboard Info, three screen sizes with chat/HUD, duplicate and travelling scouts, replaced-spawn cancellation, private intelligence, Rescout/Report, solo/boss preparation, city/objective controls, report expiry, map input and preserved troop/refill drafts. The existing scout motion test now reads the position wrapper and allows a normal render tick. Added cache growth is bounded at 4 KiB with no new art or polling.
- Clean local `main` was synchronized and verified after both merges. The exact artifact passed validation: 1,158 files including inventory and 179 resources per entry. All 1,157 inventory entries matched staging; 19 staged and 55 public file comparisons passed across all three game hosts.
- Six staged and six public cold-load/reload cases passed with an isolated browser profile per viewport (1440×900, 844×390, 568×320). They loaded the exact HTML/build stamp and required scripts/styles without exceptions or failed assets. Earlier reused cross-size browser sessions recorded a 403 navigation response despite the expected page loading; those attempts remain failed evidence. No hosting/security configuration was changed.
- All 149 Functions are ACTIVE on Node 22. Fifteen retained the old version after the initial quota-limited batch; a targeted retry completed them. All six source-hash cohorts match the merged manifest and shared/changed sources. The 29-callable access audit and realm/stamina/refill unauthenticated guards passed.
- Existing rules match SHA-256 `17f686a05f6f92676dc5ce93345cbe609b19c4754dd94461907304052dd58b0a`; both NPC indexes remain READY. No rules/index change was required or deployed.
- Authenticated `getRealmInfo` matched the October pointer, topology, release and build. The temporary Auth account was deleted without creating a player profile or assignment. No administrative target relocation/defeat, live purchase or hunt was performed.
- At `2026-10-13T09:23:58.555Z`, read-only inspection found 25 bosses in 25 Core maps and 672 solos in 56 active New Lands, including 30 closed-admission maps. All 81 maps were initialized with correct territory. All 697 targets were earlier stationary spawns; no version-2 replacement had yet appeared. The inset assertion applies to new version-2 records.
- Initial post-publication monitoring observed seven service-log entries, successful stamina/scheduler requests, and zero server errors or error-severity entries. The bounded settlement sample had no new battle/refill; it does not establish long-term economy or cost.

## Channel and verification limits

Web and Firebase are verified at the build above. itch.io was not republished and retains the older incompatible release from the initial ledger; its matching publication requires separate authorization.

Actual signed-in dispatch/refill, physical devices, repeated existing-profile navigation, naturally spawned version-2 targets and long-term loss/reward/refund/backend-cost monitoring remain follow-up checks. Release verification spent no player's Crowns and initiated no battle. The new placement rule is present in the verified deployed source and takes effect through ordinary replacement.
