# Marauders and stamina release — October 12, 2026

The user authorized merging and deploying the approved feature, then explicitly authorized enabling population and paid refills after verification. The release is **LIVE — WEB AND FIREBASE** in October's current shared realm. itch.io has not been republished and requires a matching client update.

## Release identity

| Item | Verified value |
|---|---|
| Feature branch / PR | `codex/marauders-and-clan-bosses`, [CrownLands #541](https://github.com/explocion200/CrownLands/pull/541), merged |
| Game build | `2adcd7c03ddf07b6a3f9c4ee092e45efc35a42a8` |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| Contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `5b4855a41cd2a31bf48e353fc9a8d45168226ca0c2f962ed03a7dc71a5342d45` |
| Client source SHA-256 | `5ab223c2a7dc1a0e2a51b995ae0fd9df6cce516d3f77c9b4950dfa96a3e2174c` |
| Netlify game deployment | `6acd91630f4b5e910b62d8a6` |
| Web publication | October 12, 2026, 10:17 p.m. Eastern (`2026-10-13T02:17:37.292Z`) |
| Firebase project | `crown-land-b15e0` |
| Current world / generation / shared realm | `main-realm-2026-10` / `realm-2026-10` / `shard_0001` |
| Population flag | `marauderPopulation/realm-2026-10--shard_0001`, `enabled: true` |
| Activation | October 12, 2026, 10:28 p.m. Eastern (`2026-10-13T02:28:11.750964Z`) |

The compact burgundy stamina card has a yellow progress bar, no Low label, and a refill icon beside the value. The bar ends at the icon's edge and the background fits its contents. Refills restore to 100 at `ceil((100 - stamina) * 30 / 100)` Crowns, with one successful purchase per UTC day.

## Deployment and validation

- Required **Static validation**, **Multiplayer emulator validation**, and **Validate** passed for the reviewed feature head in [run 38333562970](https://github.com/explocion200/CrownLands/actions/runs/38333562970). The affected validation plan selected 33 local validators and seven emulator suites. Balance, combat, population, stamina, wallet concurrency, replay/stale offers, refunds and rally lifecycle were covered before merge.
- The merged production artifact passed validation: 1,158 files including its inventory, 179 resources per game entry. The staged artifact's 1,157-file inventory matched. Nineteen staged comparisons and 55 public game-host comparisons passed, including NPC art, stamina UI, checkout/help changes, manifests and service-worker delivery. Known Netlify rewriting of static HTML links was normalized only for those comparisons. Public-site pages use the separate website repository and were checked separately.
- Desktop 1440×900 and landscape 844×390 / 568×320 cold-load and reload checks passed on the staged and public game. Each loaded the exact release manifest, HTML build stamp, stamina and marauder scripts/styles without uncaught exceptions or failed game assets. Pre-merge fixture checks covered the authenticated HUD, keyboard/focus behavior and preserved drafts.
- Rules and indexes deployed before the client. Both new indexes reached **READY**: the realm-scoped `marauderCombat` respawn index and `armies` spawn/arrival index. Eight pre-existing indexes absent from the local file were preserved.
- All 149 deployed Functions were verified ACTIVE on Node.js 22. Firebase's project mutation quota interrupted ten updates; a targeted retry completed them. Every deployed source-hash cohort was checked against the merged manifest and changed server sources. The deployed rules match SHA-256 `17f686a05f6f92676dc5ce93345cbe609b19c4754dd94461907304052dd58b0a`. The 29-callable public-access check and existing production flag-backend validator passed.
- Authenticated `getRealmInfo` matched `realmConfig/current`, the current shared realm, `core-expansion-v1`, build and contract immediately before activation. Temporary verification Auth accounts were deleted; they created neither player profiles nor realm assignments.
- The realm flag was enabled in a transaction after publication and verification. No archived generation, merchant configuration or payment-availability control was changed. The manual game publication hold remains enabled.

## Public purchase disclosures

The primary website is deployed from a separate repository. Live verification found its older cosmetic-only Crown claim, so [website PR #29](https://github.com/explocion200/crownlands-website/pull/29), branch `codex/stamina-refill-disclosures`, corrected the terms and three relevant guides. Its merged build is `e6a45e704458d9f0c285210c8822a2ecc4375d23`, Netlify deployment `6acd96b23b65a8a8af26783b`.

All three required checks passed in [website run 38336690981](https://github.com/explocion200/crownlands-website/actions/runs/38336690981); multiplayer validation passed as explicitly inapplicable to the isolated static website. Live verification confirmed all 50 website pages, same-origin game routing, HTTPS redirects and installed-game entry. The four updated public pages were confirmed before activation. Crown pack pricing, merchant settings and checkout availability were retained.

## Initial population and monitoring

At `2026-10-13T02:33:30.166Z`, all 81 current maps were initialized: exactly 25 bosses in the 25 Core maps and 672 solo marauders across 56 active New Lands maps. This included all 30 active New Lands maps closed to new-player admission. There were zero solos in the Core, zero bosses in New Lands, valid level bands and no duplicate spawn identities. Population filled over the scheduled bounded sweeps.

The first six-minute observation contained successful maintenance, stamina-state and army requests with no HTTP 5xx or ERROR-severity entries in the monitored services. The bounded settlement sample contained two scout encounters, no stamina refunds and no successful paid refill receipts. No release verification initiated a player battle or purchase. This is initial operational evidence, not a long-term balance, billing or cost conclusion.

Sanitized local receipts and screenshots are retained under ignored `release-artifacts/marauders/deployment/`. No credentials, raw player records or deployed source archives are committed.

## Channel difference and remaining verification

The public itch.io embed still selects upload `19696818`, build `24cfa4e7dcecbf76175697097335091f26f5df59`, release `crownlands-2026-10-10-guild-missions-v2`. A non-mutating authenticated compatibility probe using that release identity received the server's update-required `FAILED_PRECONDITION`. This older client is not compatible with the new backend contract; refreshing the unchanged itch upload cannot install the new release. Players should use the verified [web game](https://playcrownlands.com/play/) until a separately authorized matching itch.io publication is completed. No itch.io upload or publication was performed.

Physical devices, installed-app upgrades, live paid purchases, actual combat losses and reward payouts, long-term balance, and backend cost remain subject to ongoing operational monitoring. Emulator validation does not replace those live observations. Disabling population would stop new spawns and paid refills while preserving valid targets and committed marches; do not delete NPCs or settlement state with armies in flight. A future season requires its own authorized activation.

Both game and website repositories were clean and synchronized with `origin/main` after their implementation merges; deployment documentation does not change the published game build.
