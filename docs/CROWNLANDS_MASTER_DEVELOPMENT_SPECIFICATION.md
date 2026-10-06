# Crownlands Master Development Specification

**Version:** 1.39
**Effective date:** September 7, 2026
**Document status:** Authoritative baseline with implementation and release verification
**Evidence reviewed through:** September 7, 2026

> [!IMPORTANT]
> This specification is the authority for intended Crownlands behavior and confirmed design decisions. The current Git repository and backend are the authority for current technical implementation. A verified production build is the authority for what players can actually use in that release channel. These states must never be silently conflated.

This document records confirmed rules, verified deployment status, unresolved conflicts, and planned direction for Crownlands. An old conversation, prompt, roadmap entry, implementation report, commit, or pull request does not become an authoritative design rule merely because it exists.

---

# Part I — Document Control

## FM-1. Authority and Source Precedence

### Intended behavior and design authority

1. This Master Development Specification is the planning source of truth for confirmed Crownlands behavior.
2. A later decision supersedes an existing rule only when the decision is explicitly confirmed and the affected rule is updated here.
3. If a new decision conflicts with this specification, the conflict must be identified before the specification is changed.
4. Brainstorms, questions, mockups, old prompts, roadmap ideas, and unapproved implementation suggestions are not authoritative rules.
5. Important replaced decisions should remain in the superseded-decision record when the history prevents future confusion.

### Technical implementation authority

1. The current Crownlands Git repository and backend are authoritative for how the game is technically implemented.
2. Codex must inspect the current repository before modifying anything. Prompts must not invent filenames, functions, Firebase collections, APIs, deployment topology, or architecture.
3. A local checkout that is behind current `main` is historical evidence, not current implementation authority.
4. A compiled distribution artifact can prove what that artifact contains, but it does not replace inspection of current source code.

### Deployment authority

1. `https://playcrownlands.com` is the single player-facing website. The normal browser homepage remains the public website; the canonical game and installed-app entry is `https://playcrownlands.com/play/`. This September 20, 2026 decision supersedes the separate `game.playcrownlands.com` game address. The website and game may retain separate build repositories behind same-origin routing; both publications must be verified together when entry routing changes.
2. itch.io is a secondary published distribution channel and may temporarily lag web production.
3. A feature is not LIVE merely because it was implemented, committed, pushed, reviewed, or merged.
4. LIVE status requires a verified deployment to the named channel. When risk warrants it, production smoke-test evidence is also required.
5. A feature present on web but absent from the published itch.io build must be recorded as `LIVE — WEB`, not `LIVE — ALL PUBLISHED CHANNELS`.

### Confirmed installed-game launch behavior — September 20, 2026

- Opening an installed Crownlands app must lead to the game at `/play/`, never leave the player on the public homepage. Existing homepage shortcuts need a standalone/iOS launch redirect; ordinary browser visits to `/` retain the homepage.
- Keep the manifest identity and launch path `/play/`. Serve the manifest, game resources and active game service worker from `playcrownlands.com`; the website must no longer retire that worker. Preserve notification query parameters and fragments during entry redirects.
- Old game-host entry links lead to the primary domain. Browser-managed install identities and authentication storage are origin-bound: old subdomain installations may require reinstalling from the primary domain and signing in again. Do not describe redirects as a silent transfer of the installed app or session.
- Keep the current public website and its guides. Route game resources to the independently validated game publication without bundling game logic into public pages. A game worker must not substitute the game shell for ordinary public-page navigation.
- The historical production snapshots below predate this domain decision. Verify the named website and game deployments, installed launch, worker update, offline shell, and sign-in domain configuration before reporting the new routing as deployed.

### Confirmed installed-game icon artwork — September 28, 2026

The installed-game icon uses the approved hand-painted atlas illustration: a floating antique-gold crown above a pale stone castle with three slate roofs, burgundy flags and banners, olive terrain, and a muted blue river. This branding illustration does not change playable-map terrain rules. Keep the approved social-media artwork separate. Deliver opaque square launcher PNGs, a companion with extra space for Android masks, an Apple touch icon, and a small game favicon. Keep the manifest URL, application identity, entry route and landscape behavior unchanged. Artwork and preparation details are in [the installed-icon notes](art-prompts/installed-icon-atlas/README.md); this decision is not deployment evidence.

### Evidence precedence

When sources disagree, use the following evidence order for the specific question being answered:

1. Explicit confirmed design decision recorded in this specification — intended behavior.
2. Current repository/backend inspection — technical implementation.
3. Verified release manifest and production smoke result — deployed behavior for that channel.
4. Current player-facing rules and guides — documented player-facing behavior.
5. Merged PR and completion report — implemented behavior, subject to deployment verification.
6. Open PR or development branch — work in progress or implemented but not live.
7. Roadmap entry — planned direction only.
8. Old conversations, prompts, prototypes, and brainstorms — historical or proposed material only.

## FM-2. Current Production Snapshot

### Current verified web release — Four knight-order city skins

The authorized deployment of [PR #458](https://github.com/explocion200/CrownLands/pull/458), from `codex/knight-order-city-skins`, is verified at build `d21f6579c3b36e4f150e064f05cab930c597aa6f`. Templar Dawnwatch, Hospitaller Night Sanctuary, Teutonic Frost Citadel and Santiago Emberward each cost 600 Crowns, include all five established city appearances and use bounded medieval animation outside the walls.

| Channel / validation | Verified result |
|---|---|
| Primary web game and both game hosts | `LIVE — WEB`; Netlify production deploy `6ac474910af8860008283d3f`, published October 6, 2026 at `04:21:59.228 UTC` (12:21 a.m. Eastern). Release manifest, game entry and service worker identify the merged build on `playcrownlands.com`, `crownland.netlify.app` and `game.playcrownlands.com`. Catalog, painter and UI sources match the merged files; all twenty artwork hashes match on all three hosts. The manual publication hold remains enabled. |
| Firebase backend | `purchaseCosmetic`, `equipCosmetic`, `collectHarvestBonus` and `reserveHarvestBonusSpawn` were updated before `getCosmeticsState` advertised the new offers. All five are ACTIVE on Node.js 22 with source hash `de020abc8baad743f77e05cba5c19bf53053784f`. Downloaded deployed source confirms the exact build and catalog/service/index/release configuration. The other 134 functions retain their baseline revisions and source metadata. All five authentication guards and the deployment hook's 29 callable-access checks passed. |
| Active realm | Release `crownlands-2026-10-03-city-wall-midpoint-v4`, world `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`; identity unchanged. Configured live world topology remains `core-expansion-v1`. No world, rules, indexes or gameplay records were edited for this deployment. |
| Required validation | Static validation, Multiplayer emulator validation and Validate passed in [run 37411998371](https://github.com/explocion200/CrownLands/actions/runs/37411998371). Nine focused validators, production artifact/asset budgets and affected purchase/ownership/pickup emulator coverage passed. Local desktop/landscape stress tests used 60 cities under 4× CPU slowdown, with bounded slots and no material measured frame-time regression. These are tested Chromium conditions, not a physical-device guarantee. |
| Production interaction limits | Public artifact and callable-access smoke passed. The signed-in Shop check remains pending because the existing browser session had signed out and Google redirect did not restore it. No production cosmetic purchase or Apply was performed; those transactions passed in the emulator. |
| itch.io | Client not republished or verified for this release; shared backend updated. Knight-order skin delivery is verified as `LIVE — WEB` only. |

Sanitized deployment evidence is retained locally under `release-artifacts/knight-order-city-skins/deployment/`. Local `main` was clean and synchronized at the implementation build before deployment; later documentation-only descendants do not alter this published runtime.

### October 4 approved troops helmet artwork release

The authorized release of [PR #449](https://github.com/explocion200/CrownLands/pull/449), from `codex/troops-helmet-artwork`, is verified at build `af766bd731c764b9c0d9de86a1c72c916563b20d`. The approved painted steel helmet replaces 27 generic troop, garrison, production and Barracks icon references across 18 active presentation files. Shared sprites, reports, holdings, rewards, troop orders, profiles and Inner Castle use the same transparent image. Existing explicit reward art, officer equipment, troop bundles, army/scout tokens and heraldry retain their roles. Troop values, combat, progression and server authority are unchanged.

| Channel / validation | Verified result |
|---|---|
| Primary web game at `https://playcrownlands.com/play/` and both game hosts | `LIVE — WEB`; Netlify production deploy `6ac2c94bf80d710008ea359e`, published October 4, 2026 at `21:48:06.015 UTC` (5:48 p.m. Eastern). Sixty-nine live asset comparisons passed across `playcrownlands.com`, `crownland.netlify.app` and `game.playcrownlands.com`: game entry, all affected presentation files, styles, manifest, release configuration, service worker and approved delivery image match the merged artifact. The existing manual publication hold remains enabled. |
| Approved image delivery | The 192×192 transparent WebP is 7,338 bytes, SHA-256 `8c144647d31b38a1b8734ba370e5ba73efab1bddc8f41ea7b6bd587047287f91`. The full 40-character merged build passed production artifact validation, including the bounded 8 KiB helmet allowance. Approved source pixels remain unchanged in `docs/visual-qa/troops-helmet/art/`. |
| Firebase backend and current realm | Existing deployment retained. All 131 Node.js 22 functions remain ACTIVE at their baseline source hashes and revisions; the release contract is unchanged. The October realm remains `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`, ready. No Functions, rules, indexes or production records were changed by this release. |
| Required validation | Static validation, Multiplayer emulator validation and Validate passed in [run 37234170460](https://github.com/explocion200/CrownLands/actions/runs/37234170460). Thirteen focused validators, syntax/lint, asset budgets and production artifact validation passed. No emulator suite was required for this presentation-only change. |
| Production browser verification | Six cold-load/reload cases passed at 1440×900, 844×390 and 568×320. Both profile image sources and six deployed presentation helpers use the approved helmet: troops glyph, helmet alias, City stats, Barracks, Inner Castle and reward image. SVG images decode at 192×192, and 20–64 px samples fit each viewport. No uncaught runtime errors, missing first-party assets or production gameplay mutations occurred. Authenticated gameplay and physical-device checks were not performed. |
| itch.io | The existing publication hold remains in effect; this release was not uploaded there. The approved helmet is verified as `LIVE — WEB` only. |

Release evidence is retained locally under `release-artifacts/troops-helmet/deployment/`, including baseline, publication, live asset/backend verification, browser results and screenshots. Local `main` was synchronized with and verified against `origin/main` at the implementation build after merging PR #449. Later documentation-only descendants may carry another commit without changing this published runtime build.

### October 4 approved Gold coin artwork release

The authorized release of [PR #447](https://github.com/explocion200/CrownLands/pull/447), from `codex/gold-coin-artwork`, is verified at build `5c595a9316b852193378008a63eba70e3d17866f`. The approved antique Gold coin replaces all 32 active Gold coin references across 22 presentation files, including the HUD, Shop, rewards, reports, city costs, Common Gear and default Gold particles. The separate purple Crowns artwork and illustrated Gold purses retain their existing role. Currency values, prices and gameplay rules are unchanged.

| Channel / validation | Verified result |
|---|---|
| Primary web game at `https://playcrownlands.com/play/` and both game hosts | `LIVE — WEB`; Netlify production deploy `6ac2af9ff8213b000873457f`, published October 4, 2026 at `19:59:26.791 UTC` (3:59 p.m. Eastern). Eighty-one live asset comparisons passed across `playcrownlands.com`, `crownland.netlify.app` and `game.playcrownlands.com`: game entry, affected presentation files, styles, manifest, release configuration, service worker and the exact approved delivery image match the merged artifact. The existing manual publication hold remains enabled. |
| Approved image delivery | The 192×192 transparent WebP is 12,526 bytes, SHA-256 `f2620b39eb0da997039aeaba064d70d41bba673c1e05c263924b14999d146299`. The full 40-character merged build ID passed production artifact validation within the existing size limits. The approved source PNG is retained in `docs/visual-qa/gold-coin/art/`. |
| Firebase backend and current realm | Existing deployment retained. All 131 Node.js 22 functions remain ACTIVE at their baseline source hashes and revisions; the release contract is unchanged. The October realm remains `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`, ready. No Functions, rules, indexes or production records were changed by this release. |
| Required validation | Static validation, Multiplayer emulator validation and Validate passed in [run 37229557961](https://github.com/explocion200/CrownLands/actions/runs/37229557961). Thirteen focused validators, syntax/lint, asset budgets and production artifact validation passed. No emulator suite was required for this presentation-only change. |
| Production browser verification | Six cold-load/reload cases passed at 1440×900, 844×390 and 568×320. The live HUD references the approved asset; seven deployed currency helpers render it, including Shop and city/gear SVG images. Images decode at the intended dimensions and the synthetic presentation fits each viewport. No uncaught runtime errors, missing first-party assets or production gameplay mutations occurred. Authenticated gameplay and physical-device checks were not performed. |
| itch.io | The existing publication hold remains in effect; this release was not uploaded there. The approved coin is verified as `LIVE — WEB` only. |

Release evidence is retained locally under `release-artifacts/gold-coin/deployment/`, including baseline, publication, live asset/backend verification, browser results and screenshots. Local `main` was synchronized with `origin/main` at the implementation build after merging PR #447. Later documentation-only descendants may carry another commit without changing this published runtime build.

### October 4 Shield activation confirmation release

The authorized release of [PR #445](https://github.com/explocion200/CrownLands/pull/445), from `codex/shield-activation-confirmation`, is verified at build `218dd88092230197e9d8f0ec20dece20a01b9c9c`. Using a Royal Peace Shield from the Item Bag now asks for **Activate Shield** or **Cancel** before consuming or queueing the item. Dismissal preserves the item; approval rechecks inventory, active effects, offensive cooldown and the current account/realm. Existing protection and march-return rules remain unchanged.

| Channel / validation | Verified result |
|---|---|
| Primary web game at `https://playcrownlands.com/play/` and both game hosts | `LIVE — WEB`; Netlify production deploy `6ac28b6331efc10008da5eae`, published October 4, 2026 at `17:23:56.786 UTC` (1:23 p.m. Eastern). Twenty-one live asset comparisons passed across `playcrownlands.com`, `crownland.netlify.app` and `game.playcrownlands.com`: entry, manifest, Bag code, activation pipeline, styles, release configuration and service worker match the merged artifact. The existing manual publication hold remains enabled. |
| Firebase backend and current realm | Existing deployment retained. All 131 Node.js 22 functions remain ACTIVE at their baseline source hashes and revisions; the release contract is unchanged. The October realm remains `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`, ready. No Functions, rules, indexes or production records were changed by this release. |
| Required validation | Static validation, Multiplayer emulator validation and Validate passed in [run 37218710979](https://github.com/explocion200/CrownLands/actions/runs/37218710979). Six focused validators, production artifact validation, syntax/lint and asset budgets passed. No emulator suite was required for this client-only change. |
| Production browser verification | Six cold-load/reload cases passed at 1440×900, 844×390 and 568×320. The live optional Bag module loaded, and the deployed confirmation fit each viewport with 44 px controls. Synthetic UI decisions verified Cancel and one-time approval, with no uncaught runtime errors or failed first-party assets. No authenticated production Shield item was consumed. |
| itch.io | The existing publication hold remains in effect; this release was not uploaded there. The activation confirmation is verified as `LIVE — WEB` only. |

Release evidence is retained locally under `release-artifacts/shield-activation/deployment/`, including baseline, publication, asset/backend verification, browser results and screenshots. Local `main` was synchronized with `origin/main` at the implementation build after merging PR #445. Later documentation-only descendants may carry another commit without changing these runtime sources.

### October 3/4 troop production and midpoint city walls baseline

The authorized deployment of [PR #441](https://github.com/explocion200/CrownLands/pull/441) is verified at build `90a48656eb4f2f39ab917ca67840e92beb2836aa`, release `crownlands-2026-10-03-city-wall-midpoint-v4`. Web and Firebase use the midpoint regular-city wall curve. The preceding [PR #440](https://github.com/explocion200/CrownLands/pull/440) supplied the approved 25% troop-production increase and both timed account exceptions; it replaced draft PR #437. The earlier attack-departure, retaliation and former-clan protections remain included.

| Channel | Verified publication | Evidence and limits |
|---|---|---|
| Firebase Functions and Firestore rules | `LIVE`; all 131 Node.js 22 functions ACTIVE at build `90a48656...`, verified October 4 at 00:43:17 UTC | All functions share source hash `86155a95bff052cdf3339793f5a1abd3ef1a44e9`. Downloaded deployed sources and the release manifest match the merged commit; production rules match. The existing October Core realm remains `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`, ready. |
| Primary web game at `https://playcrownlands.com/play/` | `LIVE`; Netlify deploy `6ac19a4d5928250008a2ba31`, published October 4 at 00:43:19 UTC (October 3, 8:43 p.m. Eastern) | Entry, client, economy, release configuration, Help and service worker match the deployed build on the primary domain and both game hosts. Live calculator values are 85,279 at Level 25, 853,335 at Level 50 and 1,614,168 at Level 75. The manual publication hold remains enabled. |
| Public itch.io client | Held at PR #440 build `02accfa4ff9a1c29c9beebd7b3c52e0348e33c88`; upload `19546590`, last verified October 3 at 22:57:21 UTC | All 995 packaged files were verified at that publication. The client includes the troop increase and departure snapshots but retains wall model 3. The user explicitly held subsequent itch.io updates, so PR #441 was not uploaded there. This older client does not match the current backend release contract; use the web game for the current release. |
| Primary-domain public battle guide | Earlier text remains published | The separate `explocion200/crownlands-website` repository still needs its guide updated. In-game Help and the game-host guides match the current release. |

PR #440 was verified on web and Firebase at build `02accfa4...`; its Netlify deploy `6ac1846d5b191500081e25af` was published October 3 at 22:55:43 UTC. Sir Prize and Sir Render's production and production-scaled reward exceptions began October 3 at `22:46:45.236 UTC` and expire automatically October 23 at `22:46:45.236 UTC` (6:46 p.m. Eastern). The midpoint-wall deployment did not restart these windows or perform a player-data migration.

Required checks passed for both PRs. PR #441 also passed 16 focused validators, desktop and landscape-mobile browser checks, production artifact validation, deployed source/rules parity, 29 callable-access probes and five combat/realm authentication guards. No authenticated player battle was initiated during deployment verification. Local evidence is retained under `release-artifacts/troop-production-440/` and `release-artifacts/city-wall-441/`, including the deployment records, backend and web verification, and live wall values.

### Historical October 3 attack-departure release

The authorized release of [PR #438](https://github.com/explocion200/CrownLands/pull/438) was verified at build `5292ae522fe7d08ab0db1a098bb0172cf66868ad`. Production previously used `dc5e18fa3c61207f3db3c9970888089f5c18e16f`, so this publication also included merged PRs #434 (single-use 24-hour retaliation), #435 (former-clan city capture protection), and #436 (five-stage regular-city walls). PR #437 was excluded from this publication; the troop increase was subsequently released through PR #440. The table below records verification at the time of PR #438's publication; the current channel versions are listed above.

| Channel | Verified release | Evidence |
|---|---|---|
| Firebase Functions and Firestore rules | `LIVE`; 131 active Node.js 22 functions at build `5292ae5...` | All functions share source hash `b7b84d2253956d4e4ada80b85f13cd9203f262ad`; deployed source files and rules match the merged release. The existing October Core realm remains `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`, ready. |
| Primary web game at `https://playcrownlands.com/play/` | `LIVE`; Netlify deploy `6ac169fa15b2cb00084c6f0d`, published October 3 at 21:33:11 UTC | Live manifest, entry, Help and service worker match the release on the primary domain and game host. The existing manual publication hold remains enabled. |
| Public itch.io game | `LIVE`; upload `19545534`, verified October 3 at 21:35:42 UTC | Manifest matches the backend and web. All 995 packaged files passed: 993 exact matches and two HTML files with itch's embed script. The sign-in screen loaded with Google and email controls. The existing packaging omits 31 duplicate OGG fallbacks and six unused icons to meet itch's file limit while retaining all 39 primary audio sources. |
| Primary-domain public battle guide | Earlier text remains published | This page belongs to the separate `explocion200/crownlands-website` repository. The in-game Help and game-host battle guide include the departure rule; the separate public-site guide was not changed by this deployment. |

All three required checks passed for PR #438 in [run 37152155906](https://github.com/explocion200/CrownLands/actions/runs/37152155906), including five affected emulator suites; 16 local validators also passed. Production verification checked source/rules parity, 29 callable authentication guards and five attack-related guards. No production battle, troop grant, account creation or other gameplay mutation was performed for testing. New attacks retain their departure skills and gear; older individual marches without recorded recovery keep the prior fallback, and completed battles remain unchanged. Local evidence is retained in `release-artifacts/attack-departure-438/release-channel-matrix.json`.

### Historical August 31 snapshot

Snapshot verified on August 31, 2026.

| Item | Verified state |
|---|---|
| Canonical game web production | Build `fdf326a9462fab2982cbdd2cf9c8326060217159` |
| Canonical game deployment time | August 31, 2026 at 00:05:05 UTC / August 30 at 8:05:05 PM EDT |
| Canonical game Netlify production deploy | `6a94c517ebd65700085b9ad3` |
| Primary-domain public site | Separately published surface; exact build and deployment ownership remain **NEEDS VERIFICATION**. Its Rally guide is current, but its beginner guide still exposes the superseded three-ruler Rally rules. |
| Web world | 20 connected regions |
| Web release ID | `crownlands-2026-09-monthly-sharded-realms-v1` |
| Web reset generation | `fresh-2026-07-26-server-reset` |
| Web world ID | `main-fresh-2026-07-26-server-reset` |
| Web API contract hash | `86fc7b17ba028d02ee0ef6131f291f6673d5fdef4178a3463e04cf220bc35dbd` |
| Web manifest server-source fingerprint | `d69fb16ed79924c1721d818c88e6fccb9b37094da557f068132410a8cc09aa81` |
| Web manifest client-source fingerprint | `2a20d12227d8d41b7879e34101ad2865d786f1226e993da2abe9173cd11c9ef2` |
| Web manifest callable count | 109 |
| Published itch.io client | Build `fdf326a9462fab2982cbdd2cf9c8326060217159` on public HTML5 upload `#19037216`; the older Butler `html5` channel remains attached to upload `#18590779` and reports user version `2026-08-30-city-list-off-map-ownership-3390c83c` |
| itch.io client date | August 31, 2026 at 00:15 UTC; public iframe and exact build extraction verified after publication |
| itch.io world | 20 connected regions |
| Authoritative repository commit inspected | `origin/main` at `fdf326a9462fab2982cbdd2cf9c8326060217159` |
| Remote `origin/main` verification | Local `main`, remote-tracking `origin/main`, and merged PR #220 build matched with `0 0` divergence during the August 30 release audit |
| Starting-player initialization | 100 Gold, 1,000 troops, one Level 1 Main City; the September 9 troop increase is pending merge and authorized deployment |
| City XP and instant-upgrade release baseline | PR #199 merged as `a561374b93b5a31849ddddbb4cfbfabf9be1dc94` |
| Skill controls and free-refund web release baseline | PR #201 merged as `291e5657594bc8d0e3e91b6b25af79f4e88cf5e5` |
| Session heartbeat recovery release baseline | PR #220 merged as `fdf326a9462fab2982cbdd2cf9c8326060217159`; the client bounds heartbeat responses at 15 seconds and invalidates stopped lifecycle generations before applying late responses or clearing replacement locks |
| Current Cloud Functions deployment | 109 active Node.js 22 functions deployed from clean build `291e5657594bc8d0e3e91b6b25af79f4e88cf5e5`; source generations span 16:08:33–16:15:57 UTC on August 27, 2026; shared Firebase Functions hash `322ab24baed05968ce263db586c2a6cacccfc018` |
| Exact current Cloud Functions build ID | Deployment provenance, generated manifest, post-deploy 29-callable access audit, production rules parity check, and refreshed inventory verify build `291e5657...`; `adjustSkillLevels` is ACTIVE and the obsolete `enforceSkillPointSystemState` trigger is absent. Authenticated skill mutation and `getRealmInfo` remain manual smoke checks. |

The web and itch.io clients now use the same exact client build `fdf326a...`, release ID, reset generation, world ID, and API contract hash. The locally packaged itch.io ZIP contains 279 files, passed all 57 relative-resource checks, and has SHA-256 `973137A3CC90023AF9340AFFC2D8B40FBA7A93B8DCE97F9FD0F9D1E9892A2C2D`. The public iframe serves upload `19037216`; its index, release manifest, service worker, heartbeat generation guard, and stale-response guard returned HTTP 200 and matched build `fdf326a...`. The older Butler `html5` channel metadata still reports build `3390c83c...`, so the latest-build API is not authoritative for the current web-uploaded public iframe.

The August 24 through August 27 audits remain historical evidence. The August 30 release audit records current `origin/main`, web production, and the public itch.io iframe at build `fdf326a...`; the existing Firebase Functions deployment was not changed by this client-only release. Repository and public-asset facts are not proof that authenticated production state follows the same path. Login, interrupted-connection recovery, and second-tab replacement remain manual production smoke tests because no approved QA account was used. The primary-domain public site remains a separate publication surface and is not proven current by the game Netlify deployment.

### August 31 cross-channel release ledger (historical)

| Channel / artifact | Build and deployment time | Validation result | Known difference |
|---|---|---|---|
| Firebase Functions and Firestore release | Build `291e5657594bc8d0e3e91b6b25af79f4e88cf5e5`; deployed August 27, 2026 | 109 Node.js 22 functions ACTIVE with shared hash `322ab24b...`; generated manifest recorded contract `86fc7b17...` and server source `ea28d763...`; 29 callable-access checks and production rules parity passed; `adjustSkillLevels` is active and the obsolete skill-state trigger is absent | Firestore rules and configured indexes deployed without deleting eight additional production indexes. A transient Functions mutation quota required automatic and narrow retries; final inventory is consistent. Authenticated skill and city mutations remain manual smoke checks. |
| Current canonical game production | Build `fdf326a9462fab2982cbdd2cf9c8326060217159`; deploy `6a94c517ebd65700085b9ad3`; published August 31, 2026 at 00:05:05 UTC | PR #220 and the post-merge `main` run passed Static validation, all 33 multiplayer emulator files, and Validate; live manifest, index, service worker, game code, heartbeat generation counter, and stale-response guard passed direct HTTP checks on both canonical hostnames | Client-only heartbeat lifecycle release; no Functions, Firestore, schema, contract, or gameplay formula deployment was required. |
| Primary-domain public pages | Exact build and deployment ownership **NEEDS VERIFICATION** | `clans-rallies-guide.html` exposes the current 2–20-player rules, but `how-to-play.html` still says a Rally holds up to three rulers, can target Reward Camps, removes the shield, may launch with inbound contributions, and uses the leader's march bonuses | The corrected beginner-guide source is merged and present on the canonical game host, but is not deployed to this separate public-site surface. Do not treat the game Netlify deploy as proof that these pages were refreshed. |
| itch.io published client | Build `fdf326a9462fab2982cbdd2cf9c8326060217159`; public HTML5 upload `#19037216`; published August 31, 2026 at 00:15 UTC | Production artifact validation passed 279 files and 57 itch-relative resources; the public page points to `html-classic.itch.zone/html/19037216/`, whose manifest, index, service worker, heartbeat generation counter, and stale-response guard matched `fdf326a...` over HTTP | Authenticated itch.io gameplay was not exercised. The older Butler `html5` channel and latest-build API remain labeled `2026-08-30-city-list-off-map-ownership-3390c83c`, but they do not control the verified public iframe. Local ZIP SHA-256: `973137A3CC90023AF9340AFFC2D8B40FBA7A93B8DCE97F9FD0F9D1E9892A2C2D`. |

### September 30 mobile fixes web release

[PR #404](https://github.com/explocion200/CrownLands/pull/404) merged the foreground server-clock refresh, connected City List scroll-container preservation, and compact upgrade-button Gold costs from `codex/mobile-marches-city-scroll`. This verified web release supersedes the historical web build above for these capabilities.

| Channel / artifact | Verified build and publication | Validation and limits |
|---|---|---|
| Primary web game at `https://playcrownlands.com/play/` | Build `5c47de7d5da6fec86c70a7324ae400bb65a6f641`; Netlify deploy `6abcee2fa5024d0008e5cca5`; published September 30, 2026 at 11:11:12 UTC | All three required checks passed for the exact PR head in [run 36705217692](https://github.com/explocion200/CrownLands/actions/runs/36705217692). Eleven focused local validators, the production build, artifact checks, lint, runtime-data consistency, and asset budgets passed. Live entry, manifest, service worker and affected source hashes matched the merged build on the primary domain and `crownland.netlify.app`. |
| Production browser verification | Same verified web build; September 30, 2026 | Cold load and reload passed at 1440×900, 844×390, 568×320 and 390×844. Signed-out presentation probes confirmed `10.3Bg` captions, exact tooltip/accessibility prices, a stable scrolling container, and the deployed foreground clock-refresh path. The final eight cases had no uncaught script errors or failed first-party requests. Initial rapid reloads recorded a temporary HTTP 403; an isolated reload and the final run with completed navigation and settling passed. Authenticated gameplay and physical Android sleep/resume remain manual checks. |
| Firebase Functions / Firestore | Existing deployment retained | PR #404 changes client behavior only. The server-source hash and API contract hash match the pre-release production manifest. No Functions, rules, indexes, or production data were changed in this release. |
| itch.io | Not republished by this release | These three fixes are verified as `LIVE — WEB`; this record makes no claim that the current itch.io client contains them. |

The release evidence is saved locally under `release-artifacts/mobile-marches-city-scroll/deployment/`, including deployment metadata, source/hash checks, browser results, the initial reload observation and screenshots. The PR release record provides the web deployment identity. This is an audit of the named build; later documentation-only descendants can have a different build ID without changing these runtime sources.

### September 30 runtime cleanup release

[PR #406](https://github.com/explocion200/CrownLands/pull/406), from `codex/runtime-audit-cleanup`, is verified as **LIVE — WEB** with its coordinated Firebase backend. Clan power uses current transactional stats and membership; completed inventory migrations avoid redundant writes. Seventeen optional screen scripts load when opened, cached assets recover from slow or temporary failed network responses, and ten unused UI helpers are removed. Training Grounds and Infirmary preserve their artwork and saved levels while new combat contributions and new upgrades are retired. Already-paid construction and launched attack snapshots retain their existing rules. Replacement clan mechanics remain undecided.

| Channel / artifact | Verified publication | Evidence and limits |
|---|---|---|
| Primary web game and canonical Netlify host | Build `f12191d9228660477c389dcdfcf1afb54790d5ae`; Netlify deploy `6abd2addc86c4b000831d8ad`; published 2026-09-30T15:30:22.449Z | Live entry, manifest, service worker and all affected source assets match the merged production artifact on `playcrownlands.com` and `crownland.netlify.app`. |
| Firebase Functions | Project `crown-land-b15e0`; same embedded release build; verified 2026-09-30T15:48:12.157Z | All 127 Node.js 22 functions are ACTIVE with one new source fingerprint. The deployed archive matches merged backend source and configuration. Server capacities, Firestore rules and the current realm pointer remain unchanged. Provider quota and package-download failures were resolved by retrying the affected functions. Authentication-guard probes passed. |
| Production browser verification | Six cold/reload cases at 1440×900, 844×390 and 568×320 | No optional screen scripts download at startup; all 17 load successfully on request. Twelve synthetic, signed-out clan-panel checks preserve Level 4 artwork/progress, show zero combat bonus and disabled upgrades, and fit the viewport. No uncaught script errors or failed first-party assets appeared. Authenticated gameplay and physical-device checks remain manual. |
| Required validation | [Passing checks for the exact PR head](https://github.com/explocion200/CrownLands/actions/runs/36721414084) | Static validation, Multiplayer emulator validation and Validate passed. Four selected emulator suites cover clan-power events, Tower battle reports, economy concurrency and Holding Tower lifecycle. Focused local tests, dependency audit, build and artifact checks passed. Production latency and frame-rate gains were not measured. |
| itch.io | Client not republished by this release | This record verifies the web client and shared backend. It does not establish that the published itch.io client contains the new presentation or loading behavior. |

Release evidence is retained locally under `release-artifacts/runtime-cleanup/deployment/`; PR #406 records the verified publication. This identifies the tested runtime build. Later documentation-only descendants may carry a different web build ID without changing these runtime sources.

### October 1 player camp defense release

[PR #411](https://github.com/explocion200/CrownLands/pull/411), from `codex/player-camp-defense-bonuses`, is verified as **LIVE — WEB** with the coordinated Firebase backend. Player camp garrisons and reinforcements receive each army owner's live Shieldwall Discipline, equipped soldier-defense gear and objective support. Neutral NPC troops retain 1.00 defense without bonuses. Camps have no wall layer.

| Channel / artifact | Verified publication | Evidence and limits |
|---|---|---|
| Primary web game and canonical Netlify host | Build `32a44761353f6728dec52c36477d078c9ee48857`; Netlify deploy `6abe572dd670390008fa0a72`; published 2026-10-01T12:59:28.505Z | Entry, manifest, service worker and affected client assets match the production artifact on `playcrownlands.com` and `crownland.netlify.app`. |
| Firebase Functions | Project `crown-land-b15e0`; same embedded build; verified 2026-10-01T12:59:21.525Z | All 128 Node.js 22 functions are ACTIVE with source fingerprint `6db3dbef5add894cb1de7609a6a1a71067a4af9e`. Deployed source and configuration match the tested checkout. Firestore rules and the active October realm pointer are unchanged. A targeted retry completed nine updates delayed by provider quota limits. The new private camp inspection endpoint and combat endpoints passed authentication-guard probes. |
| Required validation | [Passing checks for the exact PR head](https://github.com/explocion200/CrownLands/actions/runs/36862268221) | All 21 selected local validators, production build, asset budgets and lint passed. Static validation, Multiplayer emulator validation and Validate passed. Four emulator suites cover camp defense, camp rewards, scouting and battle gear. |
| Production browser verification | Six cold/reload cases at 1440×900, 844×390 and 568×320; verified 2026-10-01T13:00:43.512Z | Entry and private callable availability passed. Synthetic camp reports rendered correct player/ally bonuses and historical NPC values. No uncaught runtime errors or failed first-party assets. A real authenticated production battle was not performed; combat settlement passed in the emulators. |
| itch.io | Client not republished by this release | Shared backend combat uses the new rule. Current itch.io client presentation has not been verified for this release. |

Evidence is retained locally under `release-artifacts/player-camp-defense-release/`. This records the verified implementation build; later documentation-only descendants may carry another web build ID with identical runtime sources.

### October 2 Shop cooldown release

[PR #422](https://github.com/explocion200/CrownLands/pull/422), from `codex/shop-cooldown-validation`, is verified as **LIVE — WEB**. An open Shop updates purchase countdowns and unlocks daily limits at midnight UTC. The shared Gold/Troop ad timer resumes after confirmation, refreshes server eligibility at expiry and day rollover, and retries failed checks at a bounded rate. Prices, limits, rewards and backend authority are unchanged.

| Channel / artifact | Verified publication | Evidence and limits |
|---|---|---|
| Primary web game and canonical Netlify host | Build `5d7bbb0b3e66a19042195408b4c4be0437e4fe23`; Netlify deploy `6abfa5a9f081bb0008bc809a`; published 2026-10-02T12:38:43.165Z | Entry, release manifest, game code, Shop module and service worker match the merged production artifact on `playcrownlands.com` and `crownland.netlify.app`. |
| Firebase backend | Existing deployment retained; verified 2026-10-02T12:42:38.264Z | All 131 Node.js 22 functions are ACTIVE with the previously verified source fingerprint `fc25b865333e4e762bdae94503bcc6b1f82344d5`. Release ID, API contract and server-source fingerprint match the compatible backend. The current realm is `main-realm-2026-10`. No Functions, rules, indexes or production records were changed. |
| Required validation | [Passing checks for the exact PR head](https://github.com/explocion200/CrownLands/actions/runs/37007024184) | Five selected local validators, production build, artifact checks, asset budgets and lint passed. Static validation, Multiplayer emulator validation and Validate passed; no server emulator suite was required for this client change. |
| Production browser verification | Cold and reload checks at 1440×900 and 844×390; verified 2026-10-02T12:42:38.264Z | Game entry, build identity, styles and lazy Shop module loading passed with no uncaught runtime errors or failed first-party assets. Authenticated purchases and live ad completion were not performed. The production ad unit remains unconfigured in the repository; cooldown regression tests use synthetic responses. |
| itch.io | Not republished or verified by this release | No all-channel deployment claim. |

Evidence is retained locally under `release-artifacts/shop-cooldowns-deployment/5d7bbb0b3e66a19042195408b4c4be0437e4fe23/`. This records the verified implementation build; later documentation-only descendants may carry another web build ID with identical runtime sources.

## FM-3. Release Channel Matrix

| Capability | Web production | itch.io published client | Specification status |
|---|---|---|---|
| Four 600-Crown knight-order city skins with five stages and bounded medieval outskirts | Verified web/backend build `d21f6579...` from PR #458 | Shared backend updated; client not republished | `LIVE — WEB`; artifact and callable smoke passed, signed-in Shop verification pending |
| Approved painted steel troops helmet across troop, garrison, production and Barracks presentation | Verified in web build `af766bd7...` from PR #449 | Not republished; existing publication hold retained | `LIVE — WEB`; exact image and affected assets verified on all game hosts, with desktop/mobile browser checks |
| Approved antique Gold coin artwork across currency presentation and default Gold particles | Verified in web build `5c595a93...` from PR #447 | Not republished; existing publication hold retained | `LIVE — WEB`; exact image and affected assets verified on all game hosts, with desktop/mobile browser checks |
| Royal Peace Shield activation confirmation in the Item Bag | Verified in web build `218dd880...` from PR #445 | Not republished; existing publication hold retained | `LIVE — WEB`; synthetic production UI checks passed, authenticated item consumption remains untested |
| Shop purchase countdowns, midnight unlock and shared ad cooldown recovery | Verified in web build `5d7bbb0...` from PR #422 | Not republished or verified for this release | `LIVE — WEB`; authenticated purchases and live ad completion remain manual checks |
| Player camp defense bonuses and private holder inspection | Verified in web/backend build `32a4476...` from PR #411 | Shared backend updated; client not republished or verified for this release | `LIVE — WEB`; production combat smoke remains manual |
| Transactional clan power, deferred optional screens and current-build cache recovery | Verified in web/backend build `f12191d...` from PR #406 | Client not republished or verified for this release | `LIVE — WEB`; shared backend verified |
| Retired Training Grounds attack and Infirmary recovery, preserved visuals/levels and paused new upgrades | Verified in web/backend build `f12191d...` from PR #406 | Client presentation not republished; shared backend uses the new rules | `LIVE — WEB`; replacement mechanics remain undecided |
| Foreground troop-clock recovery, City List scroll preservation, and compact Gold upgrade costs | Verified in web build `5c47de7...` from PR #404 | Not republished or verified for this release | `LIVE — WEB`; authenticated gameplay and physical Android sleep/resume remain manual checks |
| Core cities, economy, armies, combat, objectives, clans, rallies, chat, missions, achievements, Shop, Bag, and Common Gear foundation | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Ordinary Rally lifecycle correction: 2–20 participants, deterministic participant settlement, safe returns, and creator-departure recall | Present; primary-domain beginner guide remains stale | Present in exact build `fdf326a...` | `LIVE — ALL PUBLISHED CHANNELS` |
| Connected world size | 20 regions | 20 regions | `LIVE — ALL PUBLISHED CHANNELS` |
| Gear skill stacking and same-level upgrade availability | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Gear Effects in battle reports | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Inner Castle entry from Profile | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Stronghold/Citadel contrast restoration | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Scalable Shop pricing | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Clan Heraldry v2 and live-editor fixes | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Reworked Item Bag presentation | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Identical Bag-item quantity stacking | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Shop ad-layout and carousel-stability fix | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| Touch map-selection Shop/Bag guard | Present | Present | `LIVE — ALL PUBLISHED CHANNELS` |
| City XP model v2, uncapped 1% awards, ordered optimistic upgrades, and selected-city gold arrow action | Present | Present in exact build `fdf326a...` | `LIVE — ALL PUBLISHED CHANNELS`; authenticated mutation smoke remains pending |
| Unified `− | cost | +` skill controls, free live refunds, free Reset Skills, signed optimistic adjustments, and revised Skills readability | Present in build `fdf326a...` | Present in build `fdf326a...` | `LIVE — ALL PUBLISHED CHANNELS`; authenticated mutation smoke remains pending |
| Bounded session heartbeat responses and lifecycle-safe late-response recovery | Present in build `fdf326a...` | Present in build `fdf326a...` | `LIVE — ALL PUBLISHED CHANNELS`; public assets and 120-session emulator admission passed, while authenticated interrupted-connection smoke remains pending |
| Next-reset regular-city Gold production curve | Absent from the audited production build | Absent from the audited published build | `IN DEVELOPMENT`; coordinated backend, web, and itch.io release required |
| Holding Towers and Clan Treasury | Absent | Absent | `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`; not live on either published channel |
| Pending 5×5 Core world | Deployed behind the UTC activation boundary | Not yet republished for this reset | `DEPLOYED — SCHEDULED ACTIVATION` on web |
| Dynamic automatic map expansion | Deployed behind the UTC activation boundary | Not yet republished for this reset | `DEPLOYED — SCHEDULED ACTIVATION` on web |
| Exact-nine Main City map restriction and five-map red trim | Present in the repository implementation | No verified published-channel deployment | `IMPLEMENTED BUT NOT LIVE`; coordinated backend, web, and itch.io release required |

The Release Channel Matrix must be updated whenever either published channel changes.

## FM-4. Status Definitions

| Status | Meaning |
|---|---|
| `LIVE — WEB` | Verified in the primary `playcrownlands.com` production build, but not verified in the current itch.io build. |
| `LIVE — ITCH.IO` | Verified in the published itch.io build, but not verified in current web production. This should be unusual and investigated. |
| `LIVE — ALL PUBLISHED CHANNELS` | Verified in both current web production and the current published itch.io build. |
| `IMPLEMENTED BUT NOT LIVE` | Implementation exists and may be review-ready or merged in a non-production state, but deployment has not been verified. |
| `IN DEVELOPMENT` | Active design, coding, integration, migration, or testing work remains. |
| `PLANNED` | Direction is accepted for future work, but implementation and/or detailed rules are incomplete. |
| `PROPOSED` | An idea under consideration; it is not an authoritative Crownlands rule. |
| `NEEDS VERIFICATION` | Available evidence is insufficient, stale, contradictory, or requires current repository/backend or production inspection. |

Status describes implementation and deployment state. It does not replace the distinction between confirmed design intent and current behavior.

## FM-5. Release Compatibility Policy

1. Web production is the primary LIVE channel.
2. itch.io may temporarily lag during release work, but the intended normal state is parity with the latest verified production-compatible web build.
3. The itch.io client must not be described as containing a feature until that feature is verified in the published itch.io artifact.
4. Before updating itch.io, validate artifact integrity, relative/subpath asset loading, authentication, backend contract compatibility, service-worker behavior where applicable, and representative gameplay flows.
5. A release must record build ID, channel, deployment time, artifact hash when applicable, validation result, and any known channel differences.
6. If the web and itch.io clients use the same backend while their source fingerprints differ, compatibility must be tested rather than assumed.
7. The target maximum duration for ordinary web/itch.io release lag is **NEEDS VERIFICATION**.

## FM-6. Terminology Glossary

| Term | Meaning |
|---|---|
| Crownlands | The shared real-time medieval strategy game and its connected realm. |
| Region / map | A connected, handcrafted world area containing cities, routes, and configured objectives. |
| City | A capturable holding that produces resources and contributes to progression. |
| Regular city | A normal player- or neutral-owned city, excluding Camps, Strongholds, the Crown Citadel, and Holding Towers. |
| Main City | The player’s primary city and home destination for system-specific returns and progression access. |
| Camp | A timed neutral reward objective: Gold, Warband/Troop, Relic, or Deed. |
| Stronghold | One of four major regional objectives that grants a specialized realm bonus. |
| Crown Citadel | The central prestige objective with a Reign Ledger and scheduled Citadel Legion pressure. |
| Holding Tower | A clan-owned military objective with shared, personally attributed garrisons and no passive bonus. The implementation is pending merge and authorized deployment and is not currently LIVE. |
| Clan Treasury | The generation-scoped clan-owned Gold balance used for Holding Tower services. The implementation is pending merge and authorized deployment and is not currently LIVE. |
| Rally | A coordinated clan attack formed under the rules for its target type. |
| Reinforcement | Troops sent to support a valid friendly destination without transferring ownership. |
| Raw production | Base production used for scaling before temporary items, Gear, skills, objectives, or similar bonuses unless a rule explicitly says otherwise. Exact calculation scope must be configuration-backed. |
| Common Gear | Persistent officer equipment currently available at Common rarity. |
| Bag item / consumable | A normal consumable item held in the player’s Bag. These do not persist across seasons. |
| King Power | The ranking measure for individual kingdoms and aggregate clan strength. The `origin/main` implementation uses version 11; exact production runtime parity remains **NEEDS VERIFICATION**. |
| Season | A competitive period intended to end in a controlled reset and persistence process. Current cadence is not yet confirmed. |
| Reset | A controlled transition that clears normal world progression while preserving only explicitly allowlisted data. |

## FM-7. Conflict and Superseded-Decision Rules

1. Do not silently select one of two conflicting sources.
2. Record the conflict, affected section, evidence, and required resolution.
3. Do not mark a conflict resolved until the applicable implementation is inspected or a design decision is explicitly confirmed.
4. Later dates alone do not prove that one design decision superseded another. Supersession must be explicit or directly evidenced by an approved replacement.
5. Deployment never supersedes intended design automatically. A deployed defect remains a defect, not a new rule.
6. Implementation status and design intent must be edited independently.
7. The conflict register in Appendix B is part of this specification.

---

# Part II — System Specification

## 1. Game Vision & Design Principles

### Confirmed design

- Crownlands is a real-time, online-first medieval strategy game centered on building armies, capturing and developing cities, contesting objectives, joining clans, and expanding across a connected persistent realm.
- The strategic value of cities, armies, geography, timing, information, and clan coordination must remain central.
- Progression systems such as skills, items, Gear, and objectives should create meaningful choices without making the core city-and-army game irrelevant.
- Shared gameplay is server-authoritative. Client presentation must not determine authoritative outcomes.
- The game should remain understandable during time-sensitive decisions. Medieval atmosphere must not make text, actions, reports, timers, or state unreadable.
- The game experience is designed for landscape mobile play and PC.

**Status:** `LIVE — ALL PUBLISHED CHANNELS`

### Boundaries

- Crownlands is not defined by the superseded single-island, five-island, portal, or disconnected-world concepts.
- Public roadmap concepts remain non-authoritative until promoted to confirmed design.

### Open information

- Formal target audience, session-length goals, retention goals, accessibility standard, and product success metrics: **NEEDS VERIFICATION**.

## 2. Current World & Map Structure

### Confirmed illustrated map presentation — September 6, 2026

The approved art direction is a hand-painted medieval atlas with fine dark outlines, soft painted shading, moss-green land, ochre details, angular mountains and rounded forest clusters. Terrain fills all four image edges, leaves clear city space and contains no rivers. Roads have individual shapes, worn dirt edges and wagon marks. All structures face south; objective entrances meet their roads. Player cities do not require individual approach roads.

The current `core-expansion-v1` release receives this artwork across all 81 prepared maps: 25 Core maps, 24 first-layer New Lands and 32 second-layer New Lands. Only the authoritative expansion state controls which maps are playable. The September 6 pre-release backend check found 53 active maps, including four second-layer maps. Archived topologies and prior realm generations are excluded from this update.

City identities, ownership, Main City designation, progression and troops are preserved. Only coordinates may move to clear roads, decorations and the full height of Clan Towers. The game and server use matching city coordinates. Existing marches keep their recorded timing and align their displayed endpoints to the current city markers. Gameplay structures and scenery remain separate from the playable background. The map picker displays Camps, Strongholds, the Citadel and Clan Towers at their actual image coordinates.

Prepared maps have 81 distinct road networks. Future generated regions inherit the revised art and city clearance of their selected prepared template. This does not change map activation, capacity, adjacency, travel bonuses or combat rules. Implementation and release verification are recorded in [the illustrated map release notes](illustrated-map-release.md); the older production snapshot below is historical evidence, not this update's deployment status.

### Confirmed Halloween map decoration direction — October 3, 2026

Halloween decorations use the supplied painted medieval atlas as art inspiration. Place them on a separate scenery layer in clear ground, preserving existing trees, rocks, cities and other map objects. Increase the decoration density and variety while preserving these clearances and limiting rendering work during map movement. This is environmental artwork, separate from the city skin collection. Production deployment has not been verified. Draft assets, placement rules and validation are recorded in [the Halloween map decoration notes](art-sources/halloween-map-decorations/README.md).

### Current production

- Web production and the published itch.io client contain the same 20 connected regions. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Regions connect through defined north, south, east, and west edge routes. Portals are not part of the current map model. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Map artwork is a visual background; cities and objective markers are placed from gameplay data. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Region capacity is configured per region rather than treated as one universal capacity value. **Status:** `LIVE — ALL PUBLISHED CHANNELS` and documented as actively balanced.

### Current region names

Confirmed named regions include:

- Crownlands Heart
- North Frontier
- West Marches
- East Reach
- Southfields
- Bandit Wastes
- Ironfall Hills
- Redbanner Fields
- Ashenfen March
- Relic Vale
- Graywood Hollow
- Greenrook Vale
- Lowroad Vale
- Stonebrook Farms
- Goldmere Plains

The web world also contains Regions 16, 17, 19, 21, and 22. These are temporary identifiers.

**Confirmed design rule:** Every Crownlands region should ultimately have a medieval-authentic name consistent with the established world. Final names for Regions 16, 17, 19, 21, and 22 are **NEEDS VERIFICATION** and must not be invented in implementation work.

### Core world and automatic New Lands

- A 5×5 Core layout containing 25 maps, approximately 1,480 cities, 17 configured objectives, 40 reciprocal internal connections, and 20 gated outward edges is deployed behind the scheduled activation boundary. The Core is never a new-player spawn pool. **Status:** `DEPLOYED — SCHEDULED ACTIVATION`.
- The first expansion layer contains exactly 24 maps: five maps along each cardinal side of the Core plus the four corner maps. Together with the 25-map Core, this forms a complete 7×7 footprint.
- The authoritative clockwise Layer 1 map order is Northgate March, Frostmere, Highwatch Vale, Ravenstone, Eastwall Reach, Kingsroad March, Redwych, Ashford Vale, Emberfield, Sunward Ford, Goldbarrow, Southwatch, Dunmere, Blackthorn Reach, Westervale, Stoneford, Greyfen, Oakshield, Briar March, Wolfpine, Alderwatch, Moorhaven, Crownsward, and Ironwood Vale.
- The current monthly realm must expose the complete 24-map first layer. Completing a partially activated first layer is a create-only, idempotent rollout: existing islands and cities are verified in place; player-owned city documents are never overwritten; missing neutral cities are seeded at Level 1; all 24 maps are verified before the expansion-state activation is committed with a version precondition.
- Beginning with the next monthly reset, the entire first two New Lands layers open with the 25-map Core: Layer 1 has 24 maps and Layer 2 has 32 maps, producing an 81-map, 9×9 starting world with 3,720 regular cities. This confirmed reset change does not reinitialize an already active generation. **Status:** `IMPLEMENTED — PENDING VALIDATION AND DEPLOYMENT`.
- New-player admission allocates positions in clockwise order independently of which maps are already playable. Every layer begins at its north-center cardinal position, never at a corner, so its first map has a direct south road into the immediately inner layer. Only Northgate March admits starting players initially. The next two positions become admitting together at each capacity threshold; pre-opening both layers must not skip their admission order or spread initial players across all 56 maps. Layer 3 and later maps are prepared and verified as their positions are reached by the same admission sequence.
- Every player-facing Core and New Lands map label uses a unique medieval-authentic place name. Numbered `New Lands` labels are internal planning identifiers only and must not appear as map names in the game.
- Each generated New Lands map begins with 40 neutral NPC cities, and every newly seeded or returned-to-neutral regular NPC city starts at exactly Level 1. When the currently admitting map reaches 20 remaining neutral NPC cities, the server activates the next two maps in clockwise allocation order for new-player placement. The threshold transition must be transactional, idempotent, and safe under concurrent claims.
- The Core is non-spawnable. New and returning accounts without current-generation progression spawn only in the currently admitting New Lands maps. **Status:** `DEPLOYED — SCHEDULED ACTIVATION`.
- Future outward player regions are materialized deterministically from validated New Lands templates, retain cardinal-only connections, receive unique medieval-authentic names, and are added to connected clients through the authoritative expansion-state subscription without requiring a frontend redeploy. The supported release envelope is 4,095 New Lands maps, or 81,900 threshold-managed starting placements. **Status:** `DEPLOYED — SCHEDULED ACTIVATION`.
- Reset activation fails closed: all 25 Core maps and all 56 New Lands maps in Layers 1 and 2 must be seeded and verified for the scheduled generation before the public realm pointer changes. A partial or failed preparation keeps the previous pointer; retrying must preserve existing city data and admission progress. Existing completed readiness receipts and existing generations retain their original policy. The previous generation remains intact and inaccessible for pointer-based rollback. **Status:** `IMPLEMENTED — PENDING VALIDATION AND DEPLOYMENT` for the two-layer reset policy.
- Production migration is scheduled for September 2, 2026 at 00:00 UTC and has not occurred at the time of this specification update.

### Needs verification

- Exact 20-region production topology, city capacities, total city count, reserved positions, and connection graph: **NEEDS VERIFICATION** against current production data.
- Exact rollback behavior remains **NEEDS VERIFICATION** before promotion from development design. The confirmed capacity trigger activates two additional maps when the current admitting map has 20 neutral NPC cities remaining; generation follows the complete 24-map first ring and then north-origin, clockwise allocation in later layers.

## 3. Cities & Progression

### Cities

- A player begins with one Main City. **Status:** `LIVE — ALL PUBLISHED CHANNELS` for the starting-city flow.
- Cities produce Gold and troops over time, contribute progression value, and can be captured and developed. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- City levels contribute victory points used by progression and production systems. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Captured regular cities lose one level and never fall below Level 1. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Neutral regular NPC cities are always Level 1. A repair may set a current neutral regular city back to Level 1, but it must never alter a player-owned city or an archived realm.
- Neutral captures are limited to 30 per player-local day, and neutral capture is blocked after the player owns 30 cities. Expansion beyond that ownership threshold must come from players. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Anti-Handoff Policy v2 applies only when Player A captures a regular neutral city, still owns it at resolution, and Player B successfully takes ownership no later than 20 minutes after A's server-recorded neutral capture. The claim must carry a unique server-generated event ID. The battle-resolution timestamp, not launch time or a client timestamp, determines qualification.
- Qualifying handoffs are counted as the directed pair `A → B` across all maps in a rolling 24-hour window. Events 1-3 are allowed; event 4 is allowed and warns both players; events 5-6 are allowed with the updated count; event 7 is allowed with a final warning to both players; an eighth distinct qualifying transfer is canceled while seven events remain in the window. Expiry naturally frees a slot, and blocked or failed attempts never extend the window.
- Failed attacks, non-capturing battles, duplicate use of the same neutral-claim event for the same direction, Main Cities, Camps, Strongholds, Holding Towers, the Crown Citadel, other objectives, scouts, reinforcements, recalls, friendly transfers, and captures resolved after the 20-minute window do not count. Established-city combat, older-city captures, unrelated combat, and the reverse player direction remain available.
- Launch performs a server-authoritative precheck using the projected arrival time, and arrival repeats the check atomically with the ownership transfer and counter record. A march that becomes disallowed in transit resolves no combat or casualties, safely returns its troops, refunds an applicable march consumable, preserves or restores an otherwise incorrectly deactivated Peace Shield, and creates a persistent explanatory report. Regular-city attacks from Holding Towers use the same server helper.
- A regular city's neutral lineage records the immutable neutral-claim event ID, server capture time, claimant, current and previous owner, ownership-change time, and policy version. Player-to-player ownership changes preserve that lineage through its 20-minute eligibility window; a new claim ID is created only after legitimate neutralization and reclamation. Directed operational counters expire after their rolling window, while bounded minimal audit records remain available for support.
- The independent same-installation/shared-device restriction retains its existing 30-day behavior and is not weakened by Policy v2 or its legacy cleanup. **Status:** `IMPLEMENTED`; live status additionally requires a matching merged build, production cleanup receipt, coordinated backend/client deployment, and controlled-account verification.
- A city remains owned, productive, and defensible across the connected realm regardless of the region currently displayed. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- A regular city may become the player's Main City in any eligible Core or New Lands map, subject to the existing ownership, reinforcement, and cooldown rules. The only map-level exclusions are Stoneward, Greybanner Hold, Lionwatch, Swiftgate, Crown Citadel, Aurum Keep, Oakwatch, Ironwatch, and Roseguard. This placement rule is independent from new-player spawning: all 25 Core maps remain excluded from the new-player spawn pool. **Status:** `IMPLEMENTED BUT NOT LIVE`.
- The server must enforce Main City map eligibility from the authoritative city document path. Stored city metadata and a client-supplied region cannot override the city path. Direct selection, ordinary gameplay participation, canonical fallback, and repair/recovery must all reject or exclude a Main City in one of the nine restricted maps. Recovery relocates the Main City to an eligible owned regular city when one exists; otherwise it clears invalid Main City flags and projections before returning the normal starting-city claim requirement. No production repair is implied or authorized by this rule. **Status:** `IMPLEMENTED BUT NOT LIVE`.
- City Info must omit the entire Move/Change Main City action for every city in the nine restricted maps rather than presenting a disabled control. Other city gameplay and information remain unchanged. In the map switcher, Greybanner Hold, Crown Citadel, Swiftgate, Ironwatch, and Aurum Keep alone receive the red trim; active-map and home-map states remain independently visible. **Status:** `IMPLEMENTED BUT NOT LIVE`.
- Map-switcher tiles containing a Clan Holding Tower use a green outer trim, and tiles containing a reward Camp use a light-gold inner trim. A tile containing both keeps both trims visible. Compact `Tower` and `Camp` badges plus the map legend provide non-color-only identification while trim weight remains visible across the supported zoom range.

### Hero and skill progression

- Settings uses the approved parchment ledger with medieval emblems, Music/Effects and Help in the left column, and Animations/Notifications/Privacy in the right column. Desktop and mobile landscape retain both columns with a shared scroll area beneath the fixed navigation. Existing volume/mute persistence, Full/Reduced/Off motion preferences, browser-alert permission and connection states, Help, and Privacy remain unchanged. Confirmed September 13, 2026; approval does not establish deployment status.
- **Continuous music playlist — confirmed September 27, 2026:** The eight owner-supplied Medieval Vol. 2 loop tracks replace the previous music. Shuffle all eight songs, play each to completion, then reshuffle with no immediate repeat across rounds. Keep the current song and position through map changes, menus, danger, battles and victories. Retain independent effects, saved volume/mute settings, browser gesture requirements and background pause/resume. Stream the music on demand without adding the playlist to the startup/offline cache. This confirmation authorizes implementation; LIVE status requires verified deployment.

- **Gold spending audio — confirmed September 27, 2026:** Use the owner-supplied `RPG Sound Pack/inventory/coin.wav` for successful Gold purchases, spending and donations, including personal and Clan Treasury payments and outgoing Gold Gifts. Play the cue after confirmation, once per settled action or batch; rejected, duplicate/replayed and stale-session responses stay silent. Free equipment changes, skill resets and zero-cost purchases stay silent; successful Gold Gift donations retain their existing zero personal-Gold charge. Retain existing Effects volume/mute and independent music playback. This changes audio feedback only, with no change to prices, balances, permissions or payment authority. Production deployment requires verification.

- The Player Profile overview uses the approved parchment layout with ruler identity and existing saved heraldry on the left, all six kingdom statistics in the center, and seasonal Achievements on the right. Desktop and mobile landscape retain name/flag editing, public player/clan links, Hero level/XP, total and included-bonus production, Inner Castle entry through the existing Main City selection, and the existing Profile/Clan/Skills/Settings navigation. Inner Castle and View Achievements remain reachable at the bottom of their columns. A production detail dialog shows base, included bonus, and total without changing the calculation. Confirmed September 13, 2026; design approval does not establish deployment status.

- The Skills screen uses the approved parchment ledger with eight medieval skill emblems. Desktop and mobile landscape retain three columns headed only Attack, Defense, and Utility. Mobile keeps the header, preset tabs, points, and actions above one shared vertical scrolling area with sticky discipline names. Each card shows its description, current bonus, cap, level, next bonus, and one-point upgrade controls. Existing live adjustments, free Reset, preset unlocks, isolated editing, Save/Apply distinction, and Gold pricing are preserved. Confirmed September 13, 2026; approval does not establish deployment status.
- Hero XP awards Hero Levels. Players start at Hero Level 1 with zero skill points and earn one point per subsequent level. Every skill upgrade costs one point, including the final five levels. Removing a live level freely returns one point. Reset Skills freely returns all spent points, preserves saved presets and Gold, and consumes no stored legacy reset credit. Existing legacy credit data remains stored and harmless. **Uniform point cost confirmed September 29, 2026; status:** `IN DEVELOPMENT`, replacing the previously deployed double-cost final tier.
- **Skill point efficiency — confirmed September 29, 2026:** Match the comparable per-point rates in the community [MLCLord Skill Optimizer](https://mlclord.com/skill-optimizer). Swordmastery and Field Medics grant +2% per point; Shieldwall Discipline, Tax Stewardship and Royal Granaries grant +3%; March Orders grants +5%. Stoneworks remains +3% and Guild Charters remains 2% upgrade-cost reduction per point. The September 29 skill-cap confirmation sets Swordmastery, Shieldwall Discipline, Stoneworks, Tax Stewardship, Royal Granaries and March Orders to 100%; Field Medics and Guild Charters remain 50%. Swordmastery requires 50 points; each 3%-per-point skill requires 34 points, with its final point increasing 99% to exactly 100%; March Orders requires 20 points; Field Medics and Guild Charters require 25 points each. All eight skills together cost 256 points, available at Hero Level 257. Hero points remain one per level; Gear, Clan bonuses, total bonus caps and base combat power retain their current rules. **Status:** `IN DEVELOPMENT`; design confirmation does not establish deployment.
- Existing builds retain all valid purchased levels under the increased caps. The higher Shieldwall and March increments apply to those retained levels; removing the old final-tier surcharge returns surplus points. Available points are recalculated as Hero Level minus one minus the retained levels, so repeated synchronization cannot issue duplicate refunds. Preset model 6 recalculates spent points at one per level while retaining allocations, names, saved timestamps and the active slot. For example, an existing Hero Level 100 build with Shieldwall 30, March Orders 20 and Guild Charters 25 keeps those levels, spends 75 points and has 24 unspent points; its old 15-point surcharge is returned once. This update preserves current version-2 player builds and does not trigger the historical clear-all skill reset. Publish the matching client and backend together under the new skill-cap release contract; older clients in the active realm must refresh before spending. **Status:** `IN DEVELOPMENT`.
- The current skill groups are Attack, Defense, and Utility. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Current skills include Swordmastery, March Orders, Field Medics, Shieldwall Discipline, Stoneworks, Tax Stewardship, Royal Granaries, and Guild Charters. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Four private skill presets unlock at Hero Levels 25, 50, 75, and 100. The Skills screen always opens on Current Build. Selecting an unlocked preset opens an isolated, all-zero draft for an empty slot or the stored allocation for a saved slot; draft names and point changes remain local until Save, and Apply remains the only preset action that changes the live build. The confirmed Apply price is one hour of base Gold production, calculated before applying the preset, excluding temporary bonuses and shop city premiums. Apply is disabled while the player has insufficient Gold. **Hourly pricing and affordability state:** `IN DEVELOPMENT`; requires client and backend deployment. **Status:** preset unlocks, isolated drafts, free saving, paid application, compact `− | cost | +` controls, replay-safe signed adjustments, and live refunds are `LIVE — ALL PUBLISHED CHANNELS` in build `fdf326a...`.
- Applied preset tabs use the established red treatment. The viewed tab uses Crownlands gold with dark readable text; a viewed applied preset remains red with a gold outline, inactive tabs remain tan, locked tabs remain distinct, and skill headings, descriptions, costs, and controls use explicit high-contrast colors. The repeated final-tier explanatory banner and card text are omitted because the segmented control exposes each next-level cost directly. **Status:** `LIVE — ALL PUBLISHED CHANNELS` in build `fdf326a...`.

### Confirmed Hero level-up Gold rewards

The following Hero-progression Gold reward curve is confirmed design. The 27-hour endgame ceiling is **IN DEVELOPMENT** until the implementation pull request is merged and the authoritative backend, web client, and itch.io client are deployed and verified together:

- For the new Hero level `L`, the minimum Gold floor is `500 + 250L + 40 × L^1.25`.
- Upgrade relief uses the authoritative Gold cost of upgrading a reference regular city at Level `max(1, L - 1)`. Its allowed share is 75% through Level 50, interpolates linearly from 75% to 40% across Levels 51-100, and remains 40% from Level 101 onward.
- Production relief uses the raw base Gold per hour of a reference regular city at Level `L`. Its allowance is six production hours through Level 50, interpolates linearly from six to 16 hours across Levels 51-100, and is 27 hours from Level 101 onward.
- The Gold reward is `floor(max(minimumGoldFloor, min(upgradeRelief, productionRelief)))` and is credited once by the authoritative Hero level-up transaction.
- The 27-hour ceiling leaves every Gold reward through Hero Level 116 unchanged because upgrade relief remains the binding limit. Level 117 is the first reduced reward. With the confirmed current city-production curve, the anchors are 1,762,483,914 Gold at Level 120, 2,577,700,098 at Level 125, and 17,249,182,092 at Level 150. Cumulative Gold from Levels 2-150 is 228,530,487,042, a 23.59% reduction from the current 36-hour curve.
- These are standardized reference calculations. They do not inspect the player's cities, balance, skills, Gear, objectives, production bonuses, timed items, or other Gold sources. Previously claimed rewards and existing balances are not recalculated.

### Confirmed Hero level-up troop rewards

The following Hero-progression reward curve is confirmed design and is `LIVE — ALL PUBLISHED CHANNELS`, beginning with verified cross-channel baseline build `a561374b...`:

- For the new Hero level `L`, reference victory points are `floor(6 + 4L + 2 × L^1.35)` and reference troop production is `floor(referenceVictoryPoints × 10.815)` troops per hour under the approved September 27 balance revision below. The increase from 10.3 is pending coordinated deployment.
- The troop reward is `floor(max(50, referenceTroopsPerHour × rewardHours))`.
- Reward hours are `4 + 0.40L` through Level 50, `24 + 0.60(L - 50)` from Levels 51 through 100, and `min(108, 54 + 0.40(L - 100))` from Level 101 onward. The 108-hour maximum first binds at Level 235.
- This is standardized reference production, not the player's actual raw city or kingdom production. The calculation does not inspect owned cities, the receiving city, buildings, city count, skills, Gear, objectives, production bonuses, timed items, or casualty recovery. Every player reaching the same Hero level receives the same calculated base reward.
- The resulting troops continue to be credited once to the player's canonical Main City through the authoritative Hero reward transaction. Main City selection and fallback behavior are unchanged by this balance update.

### Confirmed city-upgrade Hero XP

The following city-progression reward model is confirmed design. The original model-v2 baseline at 1% is `LIVE — ALL PUBLISHED CHANNELS` beginning with verified cross-channel build `a561374b...`; this release changes only future eligible city upgrades to the 0.5% award below, without altering stored Hero XP or any other XP source:

- City-upgrade XP model version 2 is the confirmed model. Upgrading a regular owned city from Level `L` to Level `L + 1` offers `max(1, floor(HeroXpRequired(L) × 0.005))` Hero XP. This is exactly 50% of the previous fixed rate before the existing floor and minimum-one rounding are applied. The source city level is the only balance input; Gold cost, discounts, skills, Gear, objectives, items, production, and the receiving Hero level do not change the raw award.
- A bulk upgrade evaluates every crossed city level independently and sums those fixed awards.
- Each player has a seasonal high-watermark for each region-and-city identity. On the first encounter with this feature, the current pre-upgrade city level becomes the baseline and grants no retroactive XP. Only newly developed levels above the stored high-watermark are eligible. Capture, loss, relinquishment, recapture, or rebuilding does not reset the high-watermark. The high-watermark is generation-scoped and server-protected.
- Every eligible city-upgrade XP award is uncapped at every Hero level. Model version 2 does not read or write daily city-XP allowance state. Existing model-version-1 allowance data remains harmless stored data and is not migrated or deleted.
- XP from rebuilding levels at or below the high-watermark is discarded, not banked. Rebuild suppression is applied silently and does not block, reduce, or cancel an otherwise valid city upgrade.
- City-upgrade controls, accessibility text, confirmations, toasts, and logs do not display XP estimates, awards, or suppression. The authoritative response retains its XP receipt for progression, replay safety, compatibility, and validation.
- City XP uses the normal Hero-level reward path. Every crossed Hero level continues to grant its skill point, Gold, and approved standardized Main City troop reward exactly once; the city-XP feature does not independently alter those rewards.
- Upgrade affordability is resolved using the player's Gold before city XP and Hero-level rewards are applied. Gold awarded by a Hero level-up cannot fund more city levels within the same request.
- The authoritative response records raw XP, awarded XP, rebuild suppression, eligible and ineligible levels, UTC day key, and model version. Compatibility fields such as `capSuppressedXp`, daily-cap activity, allowance, usage, remainder, and cap-reference Hero level remain present with zero, false, or null values. Upgrade requests are replay-safe under retry and concurrency.

### Confirmed instant city-upgrade feedback

- The City List represents every regular city and Stronghold the signed-in player owns throughout the current server world, reset generation, and realm shard, independent of the region currently displayed. The roster is obtained through one bounded owner-scoped cross-region read rather than one persistent listener per region. The city document's island path supplies canonical region identity; stale stored region metadata cannot override it.
- A canonical current-realm island path is sufficient to recognize an opaque generated Core city ID even when that map's lazy-loaded definition has not entered the client cache. Large portfolios spanning unloaded maps must not be filtered down to the active map; the UI paginates the complete verified roster.
- A timed-out, denied, invalid, duplicate, or count-mismatched roster read must not be reported as complete. The City List may retain verified or previously saved rows while clearly reporting that the full roster is unavailable and offering a retry; a later verified complete read replaces the cache and removes cities no longer owned.
- Every accepted map, City Info, or City List upgrade action immediately reserves its projected Gold and displays its projected city level without changing persisted authoritative state. The active-map city, castle presentation, map label, selected-city controls, City Info, and City List must agree on the projected or confirmed level.
- Additional `+1` and `+5` actions remain available while earlier requests are processing and use projected Gold and projected levels for cost and affordability. `+5` is exact and all-or-nothing. `MAX` reserves every level affordable with projected Gold, while the server remains authoritative for its final result.
- Each accepted input reserves its projected levels and Gold immediately. Adjacent undispatched exact `+1` and `+5` inputs for the same region-and-city key compact into one request-ID-backed exact batch of no more than 25 levels. The active request is immutable, overflow remains in global input order, and `MAX` is always a standalone authoritative request. City batches dispatch without the shared economy coalescing delay or a routine city-XP preview request.
- If the server rejects an action, dependent queued actions for that city are cleared, authoritative Gold and city data are refreshed, and the projection rolls back. Unrelated actions are revalidated against the refreshed state.
- After each confirmation, the owned-city cache and active-map city receive the authoritative update before any remaining projection is reapplied. Gameplay calculations continue to use confirmed server state.
- During one open City List session, each surviving row keeps its ordinal position, page, scroll, focus, and sort position through projection, authoritative settlement, rejection recovery, and automatic roster or economy synchronization. Newly discovered cities append in deterministic current-sort order, while cities no longer owned disappear without changing the relative order of surviving rows. Clicking either sort control, including reapplying the current sort, creates a fresh ordering; closing and reopening the City List also applies the selected sort to the latest roster. Only affected visible rows and Gold are patched during queued upgrades, with heavy presentation work limited to one update per animation frame before any required active-map redraw. The nonblocking state reports projected levels syncing without disabling affordable upgrade controls.
- Confirmed city-upgrade feedback is emitted once per settled server batch. A presentation, sound, toast, log, or animation failure cannot reject an authoritative settlement, freeze the queue, or prevent later actions from draining.
- City List upgrades are map-independent. Region-and-city is the canonical identity for owned-city caching, pending actions, incoming-attack blockers, authoritative requests, and reconciliation. The city document's island path is authoritative when stored region metadata disagrees, and an off-map upgrade never requires a map switch.
- Only the selected-city map Level action uses the dedicated simple arrow-up glyph and Crownlands gold treatment. Its accessible `Level up` label and Gold cost remain visible. City Info and City List controls retain the `+1`, `+5`, and `MAX` labels.

#### Confirmed City List presentation

- City List uses the approved wide parchment ledger, serif headings, woodcut icons, muted moss and ochre colors, and the active map's city-stage and Stronghold illustrations. Each holding shows its name, map, Main City status, level, exact garrison, and confirmed hourly production; Strongholds show their owner bonus and omit regular-city upgrades.
- Direct `+1`, `+5`, and `MAX` controls show compact Gold costs using K/M/B/T suffixes and at most one decimal place; the exact cost remains in each button's tooltip and accessible label. Cost captions stay within their buttons on narrow screens. The header shows projected available Gold. City names open information and locate controls navigate to the holding. Existing authoritative affordability, queue, roster completeness, sorting and five-holding pagination rules remain unchanged. The roster scrolls between the fixed summary and footer; compact screens retain at least 44px controls.
- The approved compact arrangement places city art, level, stationed troops, Gold/hour, and troops/hour in one band on phones, with the name/location above and `+1`, `+5`, `MAX`, and Locate directly below. Desktop and landscape use compact columns. All existing information remains visible or scrollable.
- City List and regular City Details share matching window dimensions: up to 1040px wide and 790px tall, bounded by 12px viewport margins. The standalone review prototype uses illustrative data and is excluded from production. Design confirmation does not establish deployment.

#### Confirmed City Details presentation

- Regular City Details uses the approved parchment ledger, muted moss and ochre palette, serif headings, woodcut pictograms, and the active map's city-stage illustration. Owned cities organize their information into Overview and Defences on the left, with development controls on the right, including on phones. Both columns scroll independently when needed. Narrow-phone amount choices place `+1` and `+5` above a full-width `MAX`; all existing information and at least 44px action heights remain.
- City Details uses the same window dimensions as City List. Only the player's owned regular-city information panels offer an Enter Inner Castle shortcut above the tabs when the player's Main City is available. It always opens the player's own Main City Inner Castle and returns to the inspected owned city with focus restored. Neutral, allied and rival cities do not display this shortcut; foreign-city access and intelligence rules are unchanged.
- The footer retains `+1`, `+5`, and `MAX` as amount choices and shows the resulting level and exact Gold cost on the upgrade action. Choosing an amount does not spend Gold; activating the upgrade action uses the existing authoritative queue and projected affordability. Affordable upgrades remain usable while earlier levels sync.
- The panel retains owner/profile links, main-city and Inner Castle entry controls, relinquishing, reinforcement actions, production and defense bonus details, and existing foreign-city/scouting visibility rules. Recovery feedback waits for authoritative synchronization before presenting the available balance; it must not claim that Gold was unchanged after an uncertain request.
- This design update is limited to City List and regular City Details. The map, HUD, Stronghold details, Citadel, Inner Castle, and other dialogs retain their existing presentation. This confirmed design does not establish that the integration has been deployed.

#### City-upgrade XP compatibility rollout

- During the temporary cross-channel compatibility window, the server accepts an otherwise valid legacy city-upgrade request that omits the new request ID. The city upgrade, Gold spend, invested-Gold accounting, production collection, and city-upgrade progression event remain authoritative and atomic.
- A legacy request awards zero city-upgrade Hero XP and therefore cannot trigger a Hero level, skill point, level-up Gold reward, or level-up troop reward.
- Every successful legacy request advances the seasonal per-player, per-region, per-city high-watermark through the highest city level completed by that request. Changing to an updated client cannot reclaim XP for those levels later. Legacy retries, duplicate calls, rebuilding, or client switching therefore cannot duplicate Hero XP.
- Requests carrying a valid request ID remain on the complete updated path: replay receipt, city XP, silent rebuild suppression, high-watermark, and normal Hero-level rewards all retain the confirmed behavior above. The preview endpoint and suppression acknowledgement fields remain accepted for older clients but are not required by the current server. A current client silently retries if an older compatible backend still returns the former suppression-warning precondition.
- The server economy setting `cityUpgradeXp.legacyRequestsEnabled` controls the compatibility window and defaults to an explicit configured value. Once set to `false`, a request without an ID is rejected before any transaction writes with reason `city-upgrade-client-update-required` and a player-facing instruction to update Crownlands.
- Required rollout order is: (1) deploy the compatibility-capable backend; (2) publish the updated client to every supported web and itch.io channel; (3) verify adoption and successful request-ID-backed upgrades on every channel; (4) disable legacy requests through the server setting; and (5) remove the temporary legacy path in a later cleanup release. Functions or clients must not be released independently in the opposite order.

**Confirmed season rule:** Hero level, Hero XP, unspent skill points, acquired skill upgrades, and saved skill presets reset each season. Hero progression is normal seasonal world progression and is not part of permanent Gear progression.

### Starting-player initialization

On September 9, 2026, the starting troop grant was confirmed to increase from 200 to 1,000. The server initializes a fresh/reset player on their first Main City claim with:

- 100 Gold (`TEST_STARTING_GOLD`)
- 1,000 troops in the starting city (`PLAYER_STARTING_TROOPS`), with matching global statistics and leaderboard totals
- one Level 1 Main City with defense `1`, invested Gold `0`, and current production timestamps
- Hero Level 1, XP `0`, and skill points `0`
- empty skill upgrades and default presets
- an empty normal Bag, no active item effects or purchase cooldowns, and default Common Gear state
- no battle or scout reports
- a default march percentage of 50%

The 1,000-troop starting grant is a **confirmed balance rule**, implemented pending merge and authorized deployment. Replaying a completed claim preserves the player's current troops. The remaining listed values are existing implementation facts, not independent balance-design confirmations. The August 24 audit at commit `27105ae...` recorded the previous 200-troop grant; the older 500 Gold/50 troops observation is not present in this initialization path.

### Needs verification

- Verify that production Cloud Functions apply the confirmed 1,000-troop starting grant after authorized deployment.
- Whether 100 Gold should be promoted from the current implementation value to an explicitly confirmed long-term balance rule: **NEEDS VERIFICATION** by design decision.
- Current Hero XP curve, per-battle XP caps, inactivity release rules, city level maximum, and every city-upgrade cost/time value: **NEEDS VERIFICATION** against current configuration.

## 4. Economy & Resources

### Confirmed current rules

- Gold and troops are the primary normal world resources. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- City production continues across the owned kingdom and must be resolved authoritatively. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Troop production is based on city progression value plus applicable production bonuses. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gold production follows its configured production curve plus applicable skills, items, Gear, and objective effects. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gold Camp, Troop/Warband Camp, world-pickup, Daily Mission, and Achievement production-scaled rewards use raw production rather than already-boosted production. **Status:** `LIVE — ALL PUBLISHED CHANNELS` for the August 22 and later clients.
- Raw production must exclude temporary bonuses and other multipliers unless a specific rule explicitly includes them.

### Verified `origin/main` production implementation

At commit `27105ae...`, regular-city production is server-authoritative and mirrored client-side for presentation:

- Gold production units at city level `L` are `floor(20 × 1.115^(L - 1) + 0.000001)`.
- Base Gold per hour through Level 100 is `production units × 15`.
- Above Level 100, the Level 100 base is multiplied by `1.08^(L - 100)` and floored.
- Level 1 therefore produces 300 base Gold per hour.
- City progression value for troop production is `floor(6 + 4L + 2 × L^1.35)`.
- Base troops per hour are `city progression value × 10`.
- Level 1 therefore produces 120 base troops per hour.
- Strongholds and the Crown Citadel produce zero base Gold and zero base troops themselves.

### Confirmed next-reset city balance

The following balance is confirmed for the next coordinated client and Functions release. It is **IN DEVELOPMENT** until the implementation pull request is merged and is not LIVE until deployment to each named release channel is verified:

- Base troops per hour become `floor(city progression value × 10.3)`, a 3% increase before bonuses. Level 1 becomes 123 troops per hour, Level 100 becomes 14,502, and Level 150 becomes 24,081.
- For regular-city Gold production, `U(L) = floor(19 × 1.1155^(min(L, 100) - 1) + 0.000001)` and base Gold per hour is `floor(U(L) × 15 × 1.079^max(0, L - 100))`.
- The confirmed Gold anchors are 285 per hour at Level 1, 3,915 at Level 25, 60,360 at Level 50, 928,095 at Level 75, 14,266,995 at Level 100, 638,858,596 at Level 150, and 28,607,307,045 at Level 200.
- The existing upgrade target-hour curve is unchanged. Absolute upgrade prices and other raw-production-scaled Gold amounts follow the lower curve, while the intended one-city production-hour cost of an upgrade stays unchanged.
- Regular-city base walls use staged, monotonic growth with anchors of 200 at Level 1, 600 at Level 2, 1,456,669 at Level 50, 3,000,000 at Level 100, and 6,200,000 at Level 150.
- Levels 1-25 use `round(200 + 400 × (level - 1)^1.8550607303011009)`. The Level 1-to-2 increase is exactly 3×, and no adjacent level through Level 25 may exceed 3×.
- Levels 26-50 use a shape-preserving cubic bridge from the Level 25 curve to the Level 50 anchor. Levels 51-100 interpolate evenly to the Level 100 anchor.
- Levels 101-150 add wall power according to the relative Gold upgrade cost raised to exponent `0.22881653173769995`, normalized at Level 100. This re-anchors the Gold-linked segment to the exact 6,200,000 Level 150 wall after the Gold-curve change without changing the post-Level-150 troop-production rule.
- Above Level 150, base wall power transitions to a base troop-production replacement ratio. That ratio begins at the Level 150 anchor, reaches 240 production hours at Level 200, and remains at 240 hours thereafter so the wall continues increasing with troop production without a fixed level cap.
- Stoneworks remains the only skill that strengthens the wall. Soldier defense, wall repair, objective support, reward-camp behavior, and the two-stage siege model do not change.
- The Level 150 siege benchmark retains 59-62 million maximum-Swordmastery attackers. Under the September 27 production revision and current pickup caps, the existing apex portfolio requires 61,975,001 attackers against 50 million supported defenders, or approximately 2.625 maximum-activity production days (previously 2.756). The production-time regression budget scales down by 1 / 1.05 with the approved production increase.

### Approved five-stage regular-city walls — October 3, 2026

**Status: HISTORICAL — SUPERSEDED ON WEB AND FIREBASE BY WALL MODEL 4.** This curve first shipped at build `5292ae5...` in [PR #438's deployment record](https://github.com/explocion200/CrownLands/pull/438) and remains in the held PR #440 itch.io client. The midpoint revision below governs current web/backend walls. The five-stage revision replaced the preceding regular-city progression through Level 100 for owned, neutral and Main Cities in the active Core realm. Existing Main City attack protection remains in force.

- Levels 1–25 have minor walls: 200 at Level 1, 600 at Level 2, and 25,000 at Level 25. Use `round(200 + 400 × (level - 1)^1.2986357706197937)`; no adjacent increase in this stage exceeds 3×.
- Levels 26–50 reach 250,000, Levels 51–75 reach 1,000,000, and Levels 76–100 reach 3,000,000 base wall power. Interpolate geometrically between the endpoints at Levels 25, 50, 75 and 100: `round(startWall × (endWall / startWall)^((level - startLevel) / 25))`. Every level gains strength; entering a new stage does not apply a separate multiplier.
- Level 101 and above retain the existing Gold-linked and production-linked curve exactly, including 6,200,000 at Level 150 and 11,340,888 at Level 200. Towers, Strongholds and the Citadel retain the entire existing objective wall curve. Camps remain wall-free.
- Stoneworks and equipped wall gear apply to the new regular-city base with the existing combined cap. Troop defense, production, upgrade prices, damage rules, repair duration and Shield eligibility retain their current rules. Existing integrity and repair deadlines carry over; the release does not refill walls or rewrite player records. Arriving armies use the live defensive wall curve; historical battle and scout records retain their saved values.
- King Power retains its current formula and naturally reflects the lower base walls when authoritative economy/stat calculations refresh. Previews, city details, the public calculator and editor preview use the same values. Publish the matching client and backend together under `crownlands-2026-10-03-city-wall-stages-v3`; older clients must refresh before gameplay requests.

### Intermediate regular-city wall strength — October 3, 2026

**Status: LIVE — WEB AND FIREBASE**, verified at PR #441 build `90a48656...` in the current release ledger. The user requested city walls between the earlier stronger curve and the five-stage curve. The implementation uses a 50/50 midpoint at every level, revising the five-stage regular-city balance above. itch.io remains held at PR #440's older client.

- For regular cities at Levels 1–100, calculate both the version-2 wall and version-3 wall with their existing whole-number rounding, then use round((v2Wall + v3Wall) / 2). This applies to owned, neutral and Main Cities in the active Core realm.
- Base wall anchors become 200 at Level 1, 600 at Level 2, 85,279 at Level 25, 853,335 at Level 50, 1,614,168 at Level 75 and 3,000,000 at Level 100. Every level gains strength; the average stays between both earlier curves at every level.
- Level 100+ walls, Towers, Strongholds, the Citadel, camp behavior, wall-bonus caps, repair timing, integrity and Shield eligibility retain their existing rules. Existing damage and repair deadlines carry forward; this revision performs no wall refill or production-data rewrite. Troop production, including both 20-day account exceptions, retains the deployed 25% production release behavior.
- King Power's wall component and current attack forecasts use the revised walls on authoritative refresh. Arriving armies face the current defensive wall curve; saved battle and scout reports keep their recorded values. The client, Functions, battle calculator and editor preview must agree.
- Use wall model 4 and matching client/backend release crownlands-2026-10-03-city-wall-midpoint-v4; existing clients must refresh before gameplay requests. Merge and deployment require authorization. The user has explicitly held future itch.io updates until separately requested.

### Approved flat 25% troop-production increase — October 3, 2026

**Status: LIVE — WEB AND FIREBASE; INCLUDED IN THE HELD ITCH.IO CLIENT.** The increase first shipped in PR #440 at build `02accfa4...` and remains in the current PR #441 web/backend release. The user selected a flat 25% increase at every city level, replacing the unchanged-production scope of the five-stage wall revision. This applies to the active Core realm's regular cities, including Main Cities.

- Base troops/hour become `floor(floor(6 + 4L + 2 × L^1.35) × 13.51875)`. The factor is 10.815 × 1.25; apply the increase before whole-troop rounding. Anchors: Level 1 = 162, Level 25 = 3,514, Level 50 = 8,097, Level 75 = 13,315, Level 100 = 19,034, Level 150 = 31,606 and Level 200 = 45,436. Growth continues above Level 200.
- Royal Granaries, Gear, objectives and War Drums retain their stacking and caps. Strongholds and the Citadel retain zero base production. Gold, prices and starting troop grants are unchanged.
- Raw-production-scaled troop rewards, including Warband Camps, pickups and standardized Hero rewards, follow the higher base under existing hours, tiers, caps and minimums. Hero Level 100 awards 1,027,836 troops and Level 150 awards 2,338,844. Previously claimed rewards are not recalculated; no retroactive grant is included.
- **Confirmed account exceptions:** Sir Prize and Sir Render retain the previous `10.815` base factor for 20 consecutive days beginning at coordinated deployment. This covers their city production and all production-scaled troop rewards, including Hero levels, camps, pickups, daily rewards and rewarded ads. Existing bonuses and reward caps still apply. Their sustainable-production King Power uses the same applicable base. The new rate starts automatically at the exact expiry timestamp; uncollected production is split at expiry, including timed War Drums overlap. Production accrued before deployment keeps the previous rate for these accounts.
- Store the exception on the two verified account IDs as a server-owned `troopProduction25Exclusion` window. A rename, city capture, city reassignment, reconnect or fresh realm profile cannot restart or evade it. Clients cannot create, edit or delete it. No other accounts receive an exception. Both windows were activated together using `tools/admin-troop-production-exclusions.js`: October 3, 2026 at `22:46:45.236 UTC` through October 23 at `22:46:45.236 UTC`. Follow `docs/TROOP_PRODUCTION_EXCLUSION_DEPLOYMENT.md` for the activation procedure; later deployments must preserve these original deadlines. Preparation and dry runs do not start the timer.
- The troop-production change itself preserves wall values, including objectives and Level 101+. The separate midpoint revision above changes regular-city walls. Above Level 150, use the fixed `wallTroopsPerVictoryPoint = 10.815` reference instead of the new production factor. The established 240-hour wall reference remains based on pre-increase production, roughly 192 hours at the new rate. Wall repair, troop combat power and protection rules are unchanged.
- King Power's production component follows the higher sustainable rate through normal authoritative refresh. The fixed 30-city audit portfolio produces 362,347 base troops/hour; its unchanged Level-150 capture threshold takes about 1.913 maximum-activity production days. No production records are rewritten by this code change.
- The first matching client/Functions release was `crownlands-2026-10-03-troop-production-25-v1`, including the wall stages. The current web/backend release carries this production policy under `crownlands-2026-10-03-city-wall-midpoint-v4`. Older clients must refresh; the held itch.io client requires a separately authorized update. Merge and deployment require separate authorization.

### Approved smooth protection, production and travel revision — September 27, 2026

**Status: IN DEVELOPMENT — NOT DEPLOYED.** The user approved implementation, testing and pull-request preparation. Merge and deployment require separate authorization. This revision supersedes the fixed 2×/2.5× protection thresholds and the 10.3 troop-production factor above.

- All regular cities, including Main Cities at every level, produce `floor(floor(6 + 4L + 2 × L^1.35) × 10.815)` base troops per hour: a further 5% increase before whole-troop rounding. Production bonuses retain their existing stacking. Strongholds and the Citadel continue to have zero base production.
- Per-city base troop anchors are 129/hour at Level 1, 973 at Level 10, 2,811 at Level 25, 6,478 at Level 50, 10,652 at Level 75, 15,227 at Level 100, 25,285 at Level 150 and 36,349 at Level 200, continuing above Level 200 without a new cap.
- Existing raw-production-scaled troop rewards and standardized Hero troop rewards follow the higher factor. Fixed minimums still apply. Hero Level 100 awards 822,258 troops and Level 150 awards 1,871,090. Previously claimed rewards are not recalculated.
- King Power replacement production follows the higher base. Wall anchors through Level 150 remain fixed; the existing production-linked formula above Level 150 yields 8,553,927 base wall power at Level 175 and 11,340,888 at Level 200, retaining the 240-hour ratio from Level 200 onward.
- Base travel duration decreases by 10%: 0.13 becomes 0.117 seconds per map unit. Apply this to newly calculated routes, including attacks, transfers, reinforcements, scouts, rally movement and new returns. Preserve order-kind and troop-band multipliers, skills, Gear, objectives, Swift eligibility/reductions, the 30-second army and 10-second scout minimums, and uncapped long-distance travel. Accepted arrival timestamps and idempotent launch replays retain their committed duration.

The **attacker's** authoritative King Power selects regular-city protection thresholds. Compare attacker power divided by defender power with these anchors:

| Attacker King Power | Capped assault begins | Raid-only begins |
| --- | --- | --- |
| 1M or less | 3× | 4× |
| 10M | 2.75× | 3.5× |
| 100M | 2.5× | 3× |
| 1B and above | 2× | 2.5× |

- Between adjacent anchors, interpolate each threshold independently using `t = log10(power / lowerPower) / log10(upperPower / lowerPower)`. Clamp at the first and last anchors. Classification uses full precision; equality enters the more protected mode.
- Below the assault threshold, use normal combat. From the assault threshold up to the raid threshold, use capped two-stage assaults. At or above the raid threshold, use capped non-capturing raids with at most 10% defender losses and no persistent wall damage.
- First-breach force remains rounded up to the capture-safe break-even force. Follow-up assault allowance tapers from 125% to 105% of break-even across the current assault band, retaining capture-safe rounding. Raid allowance tapers from 50% of break-even at the current raid threshold to 25% at twice that threshold, then holds its floor.
- Apply the same thresholds to server previews and dispatch, city and Tower origins, converted hostile returns/reinforcements, local forecasts, map power colors/labels, daily safe-target eligibility and exact-city retaliation qualification. Retaliation qualification uses the displaced stronger ruler's power as the prospective attacker.
- Saved attack-protection schema-v2 marches retain their committed mode and troop cap; the current breach stage is still checked at arrival. Normal launched attacks retain their normal commitment. Existing protected XP, ordinary battle XP anti-farming, Main City, shield, clan, route and objective rules remain in force.

Permanent/untimed and temporary production additions are calculated separately against base production:

- Gold per hour = `base × (1 + (Tax Stewardship + Gear + objective Gold bonus) / 100) + base × Royal Tax Decree / 100`.
- Troops per hour = `base × (1 + (Royal Granaries + Gear + objective troop bonus) / 100) + base × War Drums / 100`.
- Royal Tax Decree is configured at 50%.
- War Drums is configured at 30%. The server code has a 5% fallback, but the active executable economy configuration at the inspected commit overrides it with 30%.

These formulas are verified repository implementation. Exact deployed backend parity remains **NEEDS VERIFICATION**.

### Web Shop scaling

- Paid consumable pricing scales from raw regular-city Gold production. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The confirmed pricing model uses the following production-hour multipliers: Royal Tax Decree `0.18`, Swift March Order `1.0`, Recall Horn `1.25`, War Drums `1.5`, Veil of Silence `2.0`, and Royal Peace Shield `3.5`.
- The city-count premium is `1 + min(cityCount / 500, 0.35)`.
- The minimum calculated price is 50 Gold.
- Common Gear Box pricing remains separate at 1 billion Gold.
- The server calculates raw price as `raw regular-city base Gold per hour × item multiplier × city-count premium`.
- The premium uses floored non-negative city count: `1 + min(floor(cityCount) / 500, 0.35)`.
- Rounding uses `step = 10^max(1, floor(log10(raw price)) - 1)`, rounds to the nearest step, and enforces the 50-Gold minimum.
- The server recalculates pricing in the purchase transaction and rejects a stale client quote. These are verified `origin/main` facts; exact production runtime parity remains **NEEDS VERIFICATION**.

### Needs verification

- Resource caps, offline-production behavior, collection timing, upgrade costs, repair costs, gift limits, and economic sinks not listed above: **NEEDS VERIFICATION** against current configuration.
- Formal inflation targets and season-level economy budgets: **NEEDS VERIFICATION**.

## 5. Armies, Movement & Combat

### Movement

- **Precise troop selection — approved September 27, 2026:** Attack, Transfer and Reinforce keep their slider and add editable full troop counts plus 25%, 50% and Max shortcuts. Percentages use the current permitted send limit, round down, and select at least one troop when any are available. The shared Tower order controls follow their existing ownership and stationed-troop limits. Exact input accepts whole counts and grouped thousands; empty, malformed or out-of-range input blocks submission until corrected. Enter completes editing without sending; Escape restores the previous selection. Selection updates the remaining force, own attack power and existing route preview, including troop-band refreshes. Live changes must preserve typed input/focus and revalidate it; they cannot send a silently substituted amount. Desktop and landscape mobile retain fixed actions, existing warnings, scout visibility, Swift eligibility and server confirmation. Rally controls, default force, travel, costs and combat rules remain unchanged. Approval covers implementation; LIVE status requires deployment verification.

- The travel section of attack and troop movement dialogs shows only **Travel bonus** and **Travel time**. The bonus comes from the authoritative speed multiplier, with the established skill/objective multiplication and additive Gear contribution; a selected valid Swift March Order uses its actual time reduction. No bonus displays as 0%. Routing, troop bands, minimum durations, and attack eligibility remain unchanged. Blocking errors stay beside the action controls. Active march countdowns retain their accepted arrival timestamp. Release verification is recorded in `docs/COORDINATED_TRAVEL_SCOUT_DEED_CHAT_RELEASE.md`.
- Armies move in real time along valid routes for attacks, scouting, transfers, support, regrouping, and rallies. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Clanmates see other current clan members' movement and transfer routes and army markers in light green. Allied attacks, including launched Rally attacks, use a distinct medium green that remains visible on the map. Support, Rally assembly, and safe returns use the light movement shade. Current clan membership determines the relationship; personal and enemy colors retain their existing behavior. **Status:** `IN DEVELOPMENT` until merged and deployed.
- Cross-region movement must use configured region connections. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Connected travel must work regardless of how many map definitions are currently cached. The current Core/New Lands network uses the lowest total terrain-route distance across its active reciprocal roads; new Layer 2/3 maps join through their authoritative configuration. Troop bands and existing speed modifiers still determine duration. There is no fixed 20-map journey limit. The cross-map routing audit records implementation and release evidence in `docs/WORLD_TRAVEL_ROUTING_AUDIT.md`.
- Normal troop-march duration has no maximum cap. The authoritative route distance continues through every traversed map, and the existing distance, order-kind, troop-band, speed-skill, Gear, Stronghold, and minimum-duration rules calculate the full travel time even when it exceeds 30 minutes. The server rebuilds the route and duration from trusted endpoints and modifiers; client-provided geometry, distance, ETA, or duration cannot shorten an authoritative march.
- The attacking army’s launch-time attack value is locked when dispatched. Defender troops, reinforcements, ownership, wall repair, and applicable live defensive state may change until arrival. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

- Attack preparation must show the selected army's own attack-power total and a source breakdown: base troop power, Swordmastery percentage and added power, and the equipped War Captain weapon's percentage and added power. Values respond to the selected troop count and preserve the current additive-to-base stacking and final whole-power rounding. The user narrowed this presentation to bonuses affecting the battle forecast: unrelated production, gold, travel, scouting protection, casualty recovery and stored/inactive-item listings are omitted from the attack-power breakdown. Unequipped/stored gear does not grant its bonus. Own-army information remains available without enemy scout intelligence. Attack and Transfer use a prominent full-width troop slider with supporting information below. Attack uses a crossed-swords handle; Transfer uses three aligned panels for destination troops, journey time/bonus and the eligible Swift March option. Transfer uses the approved olive marching-banner handle. Existing travel and item rules remain unchanged. These presentation requests were confirmed September 15, 2026; the [Troop Orders design](./visual-qa/troop-orders/README.md) is approved for integration and release with Camps and Strongholds. Deployment requires separate verification. No item, skill, Gear or combat-balance rule changes.

- Attack preparation must display the origin and destination city levels beside their route headings, using current city state independently of scout-time combat intelligence. Non-city Camp targets omit a city-level badge. This presentation request was confirmed September 15, 2026; the Troop Orders design is approved for integration and release; deployment requires separate verification.

### Combat

- **Battle impact audio — confirmed September 27, 2026:** Use the owner-supplied `504979_10868231-hq.mp3` for ordinary battle and siege impacts. Retain the full clip with safe playback levels, the existing 150 ms impact delay, active-map gating, duplicate suppression and Effects controls. Arrival and victory/defeat feedback retain their own cues; the shuffled background music continues. Scouting, friendly reinforcements and viewing historical reports do not trigger battle impacts. This changes audio feedback only. Production deployment requires verification.
- Combat uses a two-stage siege: attack power damages one physical wall, then remaining attack power fights the garrison. Capture requires remaining attack power to exceed garrison defense. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Wall-only hits cause zero casualties to defending soldiers, including allied reinforcements. An exact breach with no attack power left also causes zero defender casualties. This applies to normal attacks, protected assaults, protected raids, and Rallies; only attack power remaining after the wall is depleted can damage the garrison. Protected raids retain their casualty cap and do not persist wall damage. The Citadel Legion's explicit wall-bypass rule remains separate. **Status:** `IN DEVELOPMENT` pending merge and deployment of the wall-first casualty correction confirmed September 8, 2026.
- Each attacking troop has `1.25` base attack power. Under the September 29 skill-cap revision, maximum Swordmastery raises it by 100% to `2.5` before the combined attack cap. **Skill-cap revision status:** `IN DEVELOPMENT`; the previous 60% skill ceiling remains the last audited published rule until deployment is verified.
- Each defending troop has `1.30` base defense power before Shieldwall and other valid support. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Shieldwall Discipline adds 3% per point up to exactly 100%, reached at 34 points. City level does not increase per-soldier defense. The existing combined defense cap still applies to skill, gear and objective support. **September 29 rate and cap revision status:** `IN DEVELOPMENT`; replaces the previously published 2% per level / 60% skill ceiling when deployed.
- The currently published regular-city wall curve is `200 + 28,858 × (level - 1)`. Stoneworks is the wall-strength skill multiplier. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules. The confirmed staged replacement is specified in Section 4 and remains **IN DEVELOPMENT** until merged and deployed.
- Full-breach repair time is `round(15 + 0.3 × city level)` minutes. Wall damage below 5% does not persist. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Failed attacks and lost defenses award reduced XP according to current configuration. Exact current award calculation is **NEEDS VERIFICATION**.
- Field Medics returns a configured share of losses to the Main City. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

- **Confirmed October 3, 2026 — attack departure snapshots:** Every new attack locks all skill and equipped-gear effects applicable to that army when it departs: Swordmastery and attack gear, March Orders and travel bonuses, and Field Medics and casualty-recovery gear. Later point resets, reallocations, equipment swaps or upgrades cannot change the traveling army's effects. This replaces the former arrival-time attacker recovery rule. Each Rally participant is snapshotted when the combined attack leaves its assembly, including Tower Rallies; forming contributions are not yet a launched attack. City-origin and Tower-origin attacks, Camp attacks, protected assaults and new hostile return marches use the same policy. Existing capture restrictions and protected-raid recovery exclusions remain in force. Defenders and stationed reinforcements retain their live defense and recovery rules. Recovery goes to the owner's current eligible Main City, and reports retain the departure skill and item sources. Existing individual marches without recorded departure recovery retain their former fallback; do not reconstruct missing history or rewrite completed battles. **Status:** `LIVE — ALL PUBLISHED CHANNELS` at build `5292ae5...`; see the October 3 release ledger above.

### Offensive shield cooldown and city retaliation

- **Confirmed October 3, 2026 — 24-hour retaliation, LIVE — ALL PUBLISHED CHANNELS at build `5292ae5...`:** Replace the previous 30-minute window for new qualifying captures with 24 hours from capture, including the capturer’s matching no-abandon lock. Each exact captured city grants one retaliation launch for that qualifying loss. Successful dispatch consumes the opportunity immediately and atomically with march creation; a lost battle, recall or forced return never restores it. Repeated or concurrent sends cannot create another retaliation from the same opportunity. Failed dispatches consume nothing. A successful send consumes all currently valid pending grants for that same city, including older overlapping capture records. Other cities retain their independent opportunities. Existing saved grants and locks keep their stored deadlines; used and expired opportunities are not renewed. The 15-minute offensive Shield activation cooldown is unchanged.

- **Confirmed October 3, 2026 — implementation pending release:** Pressing Send/Attack for an order that removes an active Royal Peace Shield opens a warning with **Continue sending** and **Cancel** before any dispatch. Show the destination, troop count and remaining Shield time. Cancel, close and Escape preserve the Shield and send no troops. Apply the same confirmation to shield-removing reinforcements and attacks from Holding Towers; keep existing Shield removal rules, harmless transfers, neutral-city attacks and Rally commitments unchanged. Continue rechecks the current order and account/realm before dispatch; repeated clicks cannot send duplicates.

Confirmed September 19, 2026. **Status:** `IN DEVELOPMENT` until the authorized release is independently verified.

- A successful player-initiated PvP attack dispatch starts a 15-minute Peace Shield activation cooldown. Each later qualifying dispatch restarts it. This includes player-held Camps, Strongholds, the Crown Citadel, and clan-held Towers. Every contributing ruler receives the cooldown when a combined PvP Rally actually launches; forming/joining a Rally does not start it. Existing active-shield removal/retention rules remain unchanged.
- Incoming attacks, defending, casualties, losing cities, scouting, friendly transfers/reinforcements, automatic return combat, and attacks on neutral/NPC objectives do not start the cooldown. The server persists the expiration and rejects activation without consuming an item while it is active.
- Regular-city King Power protection uses the attacker-power thresholds in the approved September 27 revision (previously fixed at 2× for Protected Assault and 2.5× for Protected Raid). If a ruler protected by those rules captures a stronger ruler's regular city, the displaced ruler receives one independent 24-hour launch authorization for that exact immutable city and map. This lifts only that city's King Power attack limits for the authorized march. It does not remove anyone's global protection, enable ordinary-city Rallies, grant scouting rights, or bypass Main City, Peace Shield, clan, route, troop, or anti-farming rules.
- The right survives changes of ownership. A launch before expiration remains authorized throughout travel and arrival, even after the window ends. Successful march creation and consumption of that capture's right are atomic; failed or concurrent duplicate attempts cannot consume an additional right.
- The capturing ruler cannot relinquish that city until the original capture window ends, even if retaliation has already launched. The lock applies only while that capturer owns the city. Another owner does not inherit it; their own qualifying capture may create a separate lock.
- Server records restore the timers across refresh, login, reconnect, device, and map changes. Directly beneath Gold, a compact Shield Cooldown row precedes Retaliation. One opportunity shows its countdown; several show an expandable count with every city, map/ID, and independent countdown. Expired/used opportunities disappear. Desktop and mobile landscape are supported. Attack, Bag, and relinquishment provide contextual feedback.
- Implementation, schema, and validation evidence are recorded in [Combat authorization release notes](./COMBAT_AUTHORIZATION_RELEASE.md).

### Wall integrity and Peace Shield eligibility

Confirmed September 27, 2026. **Status:** `IN DEVELOPMENT`; merge and deployment require separate authorization.

- The September 27 rule granted 30 minutes for retaliation and the capturer's matching no-abandon lock; the confirmed October 3 revision above supersedes that duration with 24 hours for new qualifying captures. The offensive Peace Shield activation cooldown remains 15 minutes. Existing saved grants and locks retain their original expiration; there is no retroactive extension.
- A Royal Peace Shield remains active for 12 hours, but protects each owned regular city only when its walls reach exactly 100% integrity. A partially repaired city remains attackable even if its owner has an active Shield. Full repair automatically activates protection for the remaining item duration, provided that ruler still owns the city. Repair does not restart or extend the item timer.
- **Confirmed October 4, 2026 — LIVE — WEB at build `218dd880...` from PR #445; itch.io remains held:** Using a Royal Peace Shield from the Item Bag opens a confirmation with **Activate Shield** and **Cancel** before consuming or queueing the item. Explain that one item grants 12 hours, only fully repaired cities are protected, and eligible incoming/outgoing rival attacks turn back. Cancel, close, backdrop dismissal and Escape leave the item and marches unchanged. Activation rechecks inventory, active Shield, offensive cooldown and the current account/realm; repeated confirmation clicks activate at most once.
- Eligibility is derived from the authoritative wall repair deadline at dispatch and arrival, including while the owner is offline. Capture clears the former owner's Shield metadata. The same eligibility check governs the map's shield appearance and attack feedback. Existing active Shields use the new city eligibility rule after deployment; no player data migration is required.
- On item activation, eligible incoming rival marches reverse only when their target city is already fully repaired and still owned by the shield user. Eligible outgoing rival attacks still reverse. A march left travelling toward a damaged city is blocked by the existing arrival check if that city repairs before arrival. Full repair does not introduce a separate mid-route reversal event.
- Main City protection, Stronghold/Camp/Tower exclusions, Citadel Legion behavior, ordinary attack restrictions and existing Shield cancellation rules remain unchanged.

### Scouting and reports

- Marches, automatic scouts, and Scout Nearby provide immediate pending feedback. A provisional departure is presentation only: it uses the recoverable request identity, is visibly marked pending, stops near its origin while confirmation is uncertain, and reconciles with the authoritative route and timestamps. It cannot spend resources, resolve combat, or reveal scouting intelligence. Rejected previews disappear; session and realm changes discard their presentation. Accepted travel remains unchanged. Automatic scouts still choose the exact shortest eligible route, with City before Tower and region/ID tie-breaking. Report generation remains server-authoritative at arrival, with independent live delivery and the existing offline scheduler. Confirmed September 25, 2026; implementation evidence is in [Responsive marches and scouts](./RESPONSIVE_MARCHES_AND_SCOUTS.md), and deployment requires separate authorization.

- Incoming Threats uses the approved parchment ledger on desktop and mobile landscape, with fixed All / Attacks / Scouts filters, a soonest-arrival summary, and a scrolling list. Each row preserves its arrival countdown, threat type, attacking ruler/profile link, origin, target/map, available own troop and defense totals, and the existing incoming troop disclosure. Citadel Legion uses an ochre Realm emblem and remains under Attacks; scouts use olive and attacks burgundy. Missing intelligence stays unknown. Non-city targets omit city levels and use holding/location labels. Locate uses the recorded target and map, retains the panel on navigation failure, and avoids duplicate requests. Countdown updates preserve focus and scroll. Current notification eligibility, automatic closure when no threats remain, subscriptions, combat, shields and retaliation rules remain unchanged. Approved September 22, 2026; deployment is verified separately.

- The Battle Reports list uses the approved parchment ledger with medieval Attack, Defense, Scout, and Realm Activity emblems. Defensive losses use a red shield; successful defenses retain olive. Desktop and mobile landscape preserve all report fields in five compact columns beneath fixed filters, with a vertically scrolling list and Realm Activity proclamations. Existing outcomes, report/scout retention, navigation, reconnection/Retry, and account read watermark remain unchanged. New-this-visit highlights are presentation only. Scout detail presentation is specified separately below. Confirmed September 14, 2026; approval does not establish deployment status.
- Full attack and defense reports use the approved matching parchment window on desktop and mobile landscape. A fixed header and section shortcuts keep Back, map, and close accessible above one scrolling report. The viewer's side stays on the left; saved ruler flags and profile links, participant counts, battle-time powers, troops and losses, skill/objective bonuses, separate Gear effects, wall results, conditional rewards, rally participant results, and the existing forecast disclosure remain available. Defensive losses and Citadel city loss use the red shield; successful defenses use olive. Wall-free camps omit wall details, and historical or unavailable snapshots retain recorded values with explicit unknown-statistics labels. This changes presentation only, preserving authoritative combat, reward rules, permissions, retention, and read marking. Confirmed September 14, 2026; approval does not establish deployment status.

- Every resolved hostile Clan Tower battle saves a private battle-time snapshot for every participating attacker and defender, including offline players and defenders with zero casualties. Each receives an individual report linked to the same complete roster. The recipient is the first participant at the top of the report, followed by all other involved players with saved names/flags, side, starting troops, actual attack or defense power, casualties before recovery, and survivors. Shared Tower wall power is separate from player power. Delivery retries must not duplicate reports or rewards; existing report privacy and 24-hour retention apply. Older reports without a complete snapshot remain explicitly incomplete. Confirmed September 22, 2026; deployment is verified separately.

- Scout Reports use the approved matching parchment window on desktop and mobile landscape. Back, map, close, section shortcuts, age, and intelligence expiry remain above one scrolling report. Successful intelligence keeps saved ruler flags/profile links, troop and defense totals, separate owner/reinforcement counts and powers, recorded defense sources, wall integrity/repair details, and eight skill levels/bonuses plus base attack. Troop and power values are shown in full. “You were scouted” retains the source, exact time, and only the information recorded in the disclosure. Camps omit city-only wall/skill details; unavailable intelligence and missing historical fields never invent hidden statistics. Existing scout costs, permissions, ownership/availability checks, report read marking, replacement, and ten-minute expiry remain unchanged. Confirmed September 14, 2026; approval does not establish deployment status.
- Reports distinguish loading or reconnecting from a successfully synchronized empty history. Saved reports remain visible during recovery, and Retry requests a fresh authoritative read and live subscription. Release verification for report delivery includes an authenticated server read and authoritative live snapshot from the exact published build. Confirmed September 9, 2026; implementation and verification scope are recorded in `docs/MULTIPLAYER_SYNC_AUDIT.md`.
- Completed scout reports are delivered independently through the account's live report subscription, including across map changes and reopening Reports. Client arrival settlement permits two concurrent scout resolutions to reduce contention on shared player economy documents. A slow or failed target does not hold the completed reports of other targets. Intended scout travel, costs, cooldowns, permissions, ten-minute intelligence, and idempotent launch/arrival receipts remain unchanged. The one-minute backend arrival scheduler remains the offline fallback.
- Scout action-button eye icons stay upright instead of spinning during pending orders and scout travel, including City, Camp, Stronghold, Clan Tower and Nearby controls. Existing status labels, disabled states and march movement remain unchanged. Confirmed September 25, 2026; deployment is verified separately.
- A normal scout sends one troop and produces a ten-minute intelligence snapshot. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- A newer successful scout replaces the earlier snapshot for that target and restarts the timer. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Attack and defense reports remain available for 24 hours; successful scout entries expire with their ten-minute intelligence. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Forecasts must explain wall and garrison stages and distinguish launch-time attack state from live arrival-time defense state. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Needs verification

- Complete loss formulas, tie behavior, protected-raid rules, reinforcement limits, march-speed formula, route calculation, cancellation behavior, and every combat modifier order: **NEEDS VERIFICATION** against current client/server configuration.

## 6. Camps & World Objectives

### Camps

- Four Camp categories are live: Gold, Warband/Troop, Relic, and Deed. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- A neutral Camp starts with 20,000 defenders, has no wall, and gives each defender `1.00` defense with no personal skill or objective bonus. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- **Player camp defense — confirmed October 1, 2026:** The no-bonus 1.00 camp-defense rule applies only to neutral NPC troops. Player-held camp garrisons and allied reinforcements use the normal 1.30 player soldier-defense base and each troop owner’s live Shieldwall Discipline, equipped soldier-defense gear, and applicable personal or shared clan objective support. Add bonuses against that base and apply the existing +200% defense cap separately to each army. Allied camp troops use their sender’s equipment, not the holder’s equipment. Camps still have no level or walls; Stoneworks and armor that grants wall strength cannot create wall defense. Other equipment retains its existing effect (including casualty recovery); no unrelated item effect becomes soldier defense. Resolve these bonuses from current ownership and profiles at arrival, including marches already traveling. Camp inspection, scouting, forecasts and battle reports must use the same packages; historical reports retain their recorded values. Camp reward rules, troop accounting and King Power remain unchanged. This supersedes the blanket player-camp exclusion in earlier code and guides. **Status:** `LIVE — WEB`; PR #411 was deployed and verified October 1 with the shared backend. See the dated release record above; the itch.io client was not republished.
- Camps are timed contestable objectives. A ruler must defeat defenders and hold the Camp through its public resolution timer to receive the applicable reward. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- All locations of the same Camp category share the player's daily reward allowance and personal reward information within the current realm. Rewards earned at one location must appear when that player checks another location of the same category, including unvisited maps; for example, all four Deed Camps show the same private latest-10 city award history and one shared daily allowance. Other players see their own reward progress and history. Each physical Camp retains its own holder and public hold timer. **Status:** confirmed behavior for the shared Camp reward update; deployment remains to be verified.
- Gold and troop production-based Camp rewards use raw production. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Relic Camp payouts can include the configured Common Gear Box chance. Current audited value is 1%. **Status:** `LIVE — ALL PUBLISHED CHANNELS`; backend value should be verified before balance changes.

### Verified `origin/main` reward implementation

- A Gold Camp hold uses a 10-minute timer. The first four UTC-day rewards use: 20,000 minimum/0.5 production hour; 40,000/1 hour; 60,000/1.5 hours; and 80,000/2 hours. Later daily claims pay zero.
- A Warband/Troop Camp hold uses a 15-minute timer. The first four UTC-day rewards use: 10,000 minimum/0.5 production hour; 20,000/1 hour; 30,000/1.5 hours; and 40,000/2 hours. Later daily claims pay zero.
- **Camp power tiers — confirmed October 1, 2026; implementation pending validation and deployment:** Gold and Warband payouts use `max(minimum reward, floor(raw kingdom production per hour × reward hours × power-tier multiplier))`. Weak kingdoms (0–7,813,452 current King Power) receive 3× hours; middle kingdoms (7,813,453–192,405,409) receive 1×; strong kingdoms (192,405,410+) receive 0.5×. The four claims therefore award 1.5/3/4.5/6, 0.5/1/1.5/2, or 0.25/0.5/0.75/1 hours, respectively. Existing minimum rewards, hold timers, shared UTC-day limits and ordinary hourly production stay the same.
- The server recalculates the holder's current King Power within the payout transaction, before granting rewards or returning troops. City, Camp, marching, reinforcement, Rally and Tower troops and applicable objective support follow the authoritative King Power formula. Missing current kingdom data requires a retry; it must not imply weak-tier eligibility. Camp details show the tier, multiplier, effective hours and estimated reward; final payout uses power and raw production at resolution. Private reward progress, completion receipts and payout responses retain the applied tier and hours.
- These configurable cutoffs are fixed for the first release; later recalibration is a separate balance decision. They divide the September final recorded span from the lowest-power 30-city kingdom (317,299) to the strongest kingdom (4,737,961,920; 101 cities) into equal proportional thirds: `floor(L × (H/L)^(1/3))` and `floor(L × (H/L)^(2/3))`. Extend the lowest band to zero and the highest without a cap. Of all 143 recorded kingdoms, 116/15/12 fall into the bands. The 30-city benchmark's last score update was about 4.5 days before closing. City count and a player's own past-season score are not runtime eligibility requirements.
- A Relic Camp uses a 30-minute hold and permits five item rewards per player per UTC day. Its item weights are War Drums 35, Veil of Silence 25, Swift March Order 18, Royal Tax Decree 12, Recall Horn 8, and Royal Peace Shield 2, plus a separate 1% Common Gear Box chance.
- A Deed Camp uses a 60-minute hold and permits one reward per player per UTC day. It grants one eligible neutral regular non-center city at that city’s existing level with zero troops.
- Deed city selection has equal probability per eligible city across the complete active realm/server, discovered from the authoritative world configuration and current expansion state inside the payout transaction. It does not choose a map first or cap the per-map candidate list. The legacy `center` (former Crownlands Heart) exclusion remains; that map is absent from the current Core/New Lands topology. Every current active map can contribute eligible regular cities, including ordinary cities in the Crown Citadel map. Main Cities, objectives, occupied cities, noncanonical targets, other realms/generations, and inactive/future maps are excluded.
- An earned Deed reward with no eligible city reserves that day's reward in a durable receipt. The garrison returns and the Camp resets normally; the original holder receives the city automatically when the pool permits. The reservation counts against the original earning day's one-reward limit. A later holder cannot cancel or receive it. Transactional selection and receipts prevent duplicate awards and ownership overwrites; an explanatory report identifies the reservation and another report identifies the recovered city.
- A ruler's first world pickup appears after two minutes. Each successful collection starts a two-minute respawn, while rejected or failed collections preserve the active pickup and its existing deadline. Pickups favor terrain-safe positions toward the center of the active map, expire after 20 minutes, and grant 30 minutes of raw, non-boosted Gold or troop production with a minimum of 125. The per-player UTC-day caps are 80 total: 30 Gold, 30 troop and 20 Crown pickups. Pickups rotate Gold → Troops → Crowns, skipping exhausted types; at most one pickup is active per player. Each Crown pickup grants exactly one Crown, independent of production or bonuses. Crowns are earned all year, and their per-account UTC-day allowance survives season resets. **Crown extension confirmed October 1, 2026; implementation pending validation and authorized deployment.** Failed placement attempts retry after five seconds. Camps, Relics, Deeds, Daily Missions, Achievements, advertisements, and Shop rewards are unchanged by this pickup balance rule. **Status:** the balance change is confirmed for this release and becomes live only after coordinated backend/client deployment verification.

- **Pickup placement clarification — September 21, 2026:** Gold and troop pickups must occupy empty space toward the active map's center. Their full image and click area must clear cities, Camps, Strongholds, the Citadel, Clan Towers and separate scenery images, including trees, bushes and rocks. If the central search has no clear position, retry after five seconds instead of placing a pickup behind artwork. Reward amounts, timing, caps and collection authority remain unchanged. Deployment of this placement correction requires verification.

- **Map Gold pickup audio — September 27, 2026:** Successful map Gold collections use the owner-supplied `RPG Sound Pack/inventory/money.wav` recording. The cue follows the existing active-map, Effects volume and mute controls. Other Gold reward sources retain their existing sounds. Production deployment of this audio change requires verification.
- **Map soldier pickup audio — confirmed September 27, 2026:** Successful map troop collections use the owner-supplied `RPG Sound Pack/battle/sword-unsheathe.wav`. Play after positive server confirmation or local troop credit, using the existing active-map, Effects mute/volume and session guards. Pending, repeated, failed, zero-reward and stale-session collections stay silent. Troop rewards from Camps, missions, achievements and other sources retain their existing cue; background music continues independently. No reward amounts, pickup rules or production behavior change. Production deployment requires verification.

These are verified repository facts for commit `27105ae...`; exact deployed backend parity remains **NEEDS VERIFICATION**.

### Needs verification

- Camp respawn cadence, eligible rally behavior, contention edge cases, and production runtime parity for the verified values above: **NEEDS VERIFICATION**.

## 7. Strongholds & Crown Citadel

### Strongholds

- Four regional Stronghold types are live: Gold, Training, Movement, and Defense. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- A newly seeded neutral Stronghold starts with exactly 50,000,000 defensive troops. A newly seeded neutral Crown Citadel starts with exactly 100,000,000 defensive troops. These values apply only to a pristine neutral spawn: layout reconciliation and data repair must never overwrite a player-controlled or previously conquered objective's maintained troop state.
- Strongholds provide specialized realm bonuses and serve as clan rally targets. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Stronghold ownership and relevant support must be represented in combat, scouting, and reports without double-counting. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Restored Stronghold information contrast is `LIVE — ALL PUBLISHED CHANNELS`.

### Verified `origin/main` objective bonuses

- Direct control grants 8% for the objective’s specialization: Gold, troop training, march speed, or city defense.
- Clan-shared Stronghold benefit is half of the direct value: 4%.
- Direct Crown Citadel control grants 10% each to base Gold production, base troop production, march speed, city defense, and upgrade-cost reduction.
- Clan-shared Crown Citadel benefit is half of the direct value: 5%.
- Clan-aware calculation prevents an ordinary Stronghold holder from receiving its own full benefit plus its own shared half a second time.
- The Citadel controller receives the 10% Citadel benefit plus half of personally held non-Citadel Strongholds. For example, holding the Citadel and a Gold Stronghold yields 14% Gold production benefit.
- Another Gold Stronghold holder in the Citadel controller’s clan receives 8% from the held Gold Stronghold plus 5% shared Citadel benefit, for 13%.

The objective logic and explicit validator coverage are verified in `origin/main`; exact production runtime parity remains **NEEDS VERIFICATION**.

### Crown Citadel

- The Crown Citadel is the central prestige objective. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Citadel control is recorded in a Reign Ledger. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The Citadel Legion selects up to 20 eligible regular non-main cities in the Citadel region at 9:45 AM and 6:15 PM America/New_York time and attacks at 10:00 AM and 6:30 PM with 100,000 NPC troops per target. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Citadel Legion attacks ignore walls without damaging them. If the defenders are defeated, the city loses five levels; Level 5-or-lower cities return to neutral at Level 1 with 10 troops. Peace Shields do not block the event, and defenders receive no XP. **Status:** `LIVE — ALL PUBLISHED CHANNELS` based on current audited rules.
- Restored Citadel information contrast is `LIVE — ALL PUBLISHED CHANNELS`. The separate Inner Castle entry from Profile is tracked in Section 16.

### Needs verification

- Capture safeguards, reset behavior, Legion target exclusions, scheduling failure recovery, complete Reign Ledger retention rules, and production runtime parity for the verified bonuses: **NEEDS VERIFICATION**.

## 8. Holding Towers

### Player-facing terminology

The confirmed player-facing name is **Clan Tower** (plural **Clan Towers**). The approved objective-details draft uses this name, and runtime UI integration must carry that terminology forward. Existing technical identifiers and historical references may retain `Holding Tower`. This is a naming clarification, not a change to ownership, eligibility, combat rules or deployment status.

### Deployment status

Holding Towers and Clan Treasury are `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`. The current synchronized implementation is reconciled with the current world, economy, clan, Rally, scouting, reset, security, and release contracts, but it is not live on either published channel. Historical [PR #159](https://github.com/explocion200/CrownLands/pull/159) at commit `e1abf11b46ab66d0586faeab06da083363fd565c` remains archived, unmerged, and not live; it must not be merged into current `main`.

Holding Towers are hard-gated to the dynamically resolved current Core world, current reset generation, and current shared realm shard. Current-world maintenance may reconcile only the 25 permanent Core maps and current Tower records; it must not scan or mutate archived or inactive worlds. No merge by itself authorizes production seeding, a world reset, a world switch, or deployment.

### Confirmed design specification

- Four Holding Towers are confirmed:
  - Ravenwatch — northwest
  - Highguard — northeast
  - Blackthorn — southwest
  - Stoneward — southeast
The current Core mappings are fixed:

| Tower | Stable ID | Region | Grid | Coordinate |
|---|---|---|---:|---:|
| Ravenwatch Tower | `core-v2-holding-tower-1` | `core-v2-north-west-holding-tower-m1-m1` | `(-1,-1)` | `(736,552)` |
| Highguard Tower | `core-v2-holding-tower-2` | `core-v2-north-east-holding-tower-p1-m1` | `(1,-1)` | `(734,555)` |
| Blackthorn Tower | `core-v2-holding-tower-3` | `core-v2-south-west-holding-tower-m1-p1` | `(-1,1)` | `(724,543)` |
| Stoneward Tower | `core-v2-holding-tower-4` | `core-v2-south-east-holding-tower-p1-p1` | `(1,1)` | `(736,555)` |

- Holding Towers are clan-owned military objectives and grant no passive realm bonus.
- **Confirmed September 22, 2026:** A clan may own only **one Clan Tower** in the current realm and generation. This supersedes the previous allowance to control all four. A clan that already owns one may still attack any other neutral or rival Tower through the normal eligible Rally flow, but cannot capture it. Resolve ordinary wall damage, casualties, recovery, XP and individual reports; leave the target's ownership unchanged and return surviving attackers through the existing return flow. A non-capturing victory does not apply capture-only wall/building level losses or cancel construction as a capture. Reports distinguish victory from ownership transfer. Check ownership atomically at battle resolution, including simultaneous victories and ownership changes during travel. A clan with no Tower may capture one normally. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.
- Neutral Towers begin at Wall Level 1 with full integrity and 10,000,000 NPC defenders.
- Attacking or capturing a neutral or clan-owned Tower is rally-only and requires at least three unique eligible clan members in total, including the rally leader, each contributing at least one troop. At least three contributors must be Ready at launch; additional inbound contributions turn back on early launch under the October 1 revision. Confirmed September 21, 2026; this replaces the previous five-member minimum.
- **Confirmed October 3, 2026:** A new clan member has a **1-hour** Tower participation probation, measured from joining the current clan. This replaces the previous 24-hour wait for Tower-target and Tower-origin Rallies, reinforcements, outgoing troop orders, scouting from Towers and Clan Shop purchases. Existing members use their saved join time, so those already past one hour qualify when the updated backend is deployed. Existing clan roles, ownership and troop requirements still apply. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.
- Each contributor’s troops remain personally attributed inside the shared clan garrison.
- Surviving attackers remain in the Tower after capture.
- All valid defenders fight together.
- A Tower may launch solo attacks, rallies, and scouting against normal valid targets. Tower conquest itself remains rally-only.
- Tower-origin attacks on regular neutral NPC cities use the same expansion limits as city-origin attacks: block launch at 30 or more owned regular cities or after 30 neutral captures that player-local day. Recheck at arrival if eligibility changes during travel. Player-owned city attacks, scouting, troop transfers and objective targets retain their existing rules.
- When a member leaves or is removed from the clan, that member’s surviving Tower troops return to the member’s Main City.
- Clan disbanding neutralizes and resets controlled Towers.

### Tower walls and construction

- Tower wall levels have no maximum.
- A Tower wall upgrade costs five times the equivalent regular-city wall upgrade cost.
- New wall levels use the scaling duration and Workshop reduction in the Clan Tower buildings revision below; already-paid legacy jobs retain ten minutes.
- A Tower may queue up to ten wall levels.
- Capture reduces the Tower wall by five levels, never below Level 1, and sets wall integrity to zero.
- A wall must be fully repaired before another upgrade begins.
- Repair cost equals five times the equivalent regular-city wall cost multiplied by the damaged percentage.
- Repairs are manually initiated and paid from the Clan Treasury.
- Repairs use the regular-city base repair rate with the completed Engineers’ Workshop reduction. Player speed items and other modifiers do not apply.
- Only the completed Engineers’ Workshop accelerates Tower wall construction; player items and modifiers do not.
- Repair and upgrade cannot be started while the Tower is under attack.
- An existing repair continues through an attack.
- Construction pauses during an attack.
- Queued construction is lost without refund when the Tower is captured.

### Clan Tower buildings (confirmed September 21, 2026)

**Status: IN DEVELOPMENT — not deployed.** This revision supersedes the earlier fixed ten-minute wall timer and 75% combined recovery cap. It applies to the dynamically resolved current Core realm and generation. Existing ownership, garrisons and Treasury balances are preserved; existing Towers begin with all four buildings unbuilt. War Hall is removed; players have no gameplay cap on troops stationed in Clan Towers.

The four buildings each have ten levels:

| Building | Completed-level benefit |
| --- | --- |
| Clan Shop | Extra personal item purchases, with the catalogue and quantities below. |
| Engineers’ Workshop | Wall construction and paid repair durations reduced by 5% per level, up to 50%. Does not accelerate building projects. |
| Infirmary | Combat recovery bonus retired September 30. Artwork and completed levels remain; new upgrades are paused while replacement mechanics are designed. |
| Training Grounds | Rally attack bonus retired September 30. Artwork and completed levels remain; new upgrades are paused while replacement mechanics are designed. |

**Confirmed September 30, 2026 — IN DEVELOPMENT, NOT DEPLOYED:** Retire Training Grounds attack and Infirmary recovery effects while preserving the approved clan visuals and saved building levels. New Rallies receive no Training Grounds bonus, and newly resolved Tower defense receives no Infirmary recovery. New upgrades for these two buildings are rejected before charging Gold. Already-paid projects may finish under their existing timers and pause rules; completed levels remain saved. Launched marches keep their recorded attack snapshots, and historical reports retain recorded contributions. Clan Shop and Engineers’ Workshop mechanics remain active. Replacement mechanics have not been selected.

Combined casualty recovery is capped at **90%**, following the September 29 revision. Field Medics supplies up to 50% and equipped casualty gear up to 40%. The September 30 retirement removes Infirmary contributions from new resolutions. Recovered troops return through the existing recovery system to their owner’s Main City, with no wounded storage. Historical reports preserve their recorded skill, gear and clan contributions.

| Target building level | Treasury Gold paid upfront | Construction time |
| --- | ---: | ---: |
| 1 | 5,000,000 | 30 minutes |
| 2 | 10,000,000 | 1 hour |
| 3 | 20,000,000 | 2 hours |
| 4 | 40,000,000 | 4 hours |
| 5 | 80,000,000 | 6 hours |
| 6 | 160,000,000 | 8 hours |
| 7 | 320,000,000 | 10 hours |
| 8 | 640,000,000 | 12 hours |
| 9 | 1,280,000,000 | 18 hours |
| 10 | 2,560,000,000 | 24 hours |

All four buildings to Level 10 cost 20.46 billion donated Gold and 14 days 6 hours of uninterrupted construction. Leaders and Officers use existing Treasury permissions. Each Tower has one building project at a time, no waiting queue and no cancellation/refund. Its independent wall queue may run concurrently. Starting requires fully repaired walls and no incoming attack. Attacks or damage pause projects without losing progress; they resume automatically once those conditions clear. Completed benefits remain active during upgrades, attacks and repairs. Level 0 has no benefit.

Capture cancels unfinished construction without refund and lowers each completed building by one level, with a floor of Level 1; unbuilt stays Level 0. Inherited benefits apply immediately, including Workshop assistance with the initial repair. Seasonal reset and clan disband/neutralization clear buildings through the existing Tower reset lifecycle.

New wall jobs targeting level T use `10 + 2 × (T − 2)` base minutes, multiplied by the completed Workshop reduction. Each job locks its duration when it starts. Queued new jobs use the Workshop level when their own turn begins. Already-paid wall jobs from before this update retain their original ten-minute durations. Active construction and repair timers never change retroactively. Existing wall Gold costs, unlimited wall levels and ten-entry queue are unchanged. Repairs retain the existing proportional regular-city base calculation and Gold cost, with only the Workshop time reduction added; an existing repair continues under attack but a new repair cannot start then.

#### Clan Shop catalogue and allowances

The Shop is accessible through an owned Tower’s Store map button, Shop building or Buildings tab; no personal garrison is required. The Store map button is enabled only after that selected Tower completes its Shop building. The selected Tower must have a completed Shop to buy. Members can browse immediately and buy after 1 hour in the clan (October 3 revision). Every built Shop uses the highest completed Shop level among Towers currently owned by that clan. Losing the highest-level Shop lowers the catalogue and stock limits immediately.

| Item | Unlock level | Initial allowance | Increased allowance |
| --- | ---: | --- | --- |
| Recall Horn | 1 | 1 daily | — |
| Swift March Order | 1 | 1 daily | 2 daily at Level 4 |
| Royal Tax Decree | 2 | 1 daily | 2 daily at Level 6 |
| War Drums | 3 | 1 daily | 2 daily at Level 7 |
| Veil of Silence | 5 | 1 daily | 2 daily at Level 8 |
| Common Gear Box | 9 | 1 daily | — |
| Royal Peace Shield | 10 | 1 per rolling 72 hours | — |

Prices use the same current personal production-based calculation as the main shop. Purchases use personal Gold and give ordinary inventory items or unopened Gear Boxes. Main-shop allowances are independent. Clan Shop usage belongs to the player and is shared across all Clan Shops, remaining spent after leaving, rejoining, switching clans, upgrading or losing a Shop. A lower limit never erases or clamps the number already purchased. Normal allowances reset at 00:00 UTC. The Shield’s 72-hour wait starts only on a successful purchase. Seasonal usage resets with the existing seasonal purchase reset; owned gear and unopened Gear Boxes remain preserved. Transactions and receipts prevent duplicate charges or concurrent purchases exceeding stock.

Locked items show their unlock level; quantity upgrades show their required level. The Shop displays personal Gold, prices, remaining quantities and reset timers. Building details show completed/current and next-level benefits, construction cost/time, Treasury balance, permissions and pause reasons.

#### Consistent building layout (confirmed September 27, 2026)

All four Clan Tower buildings share one parchment frame: Clan Treasury in the header; building artwork, completed level and building navigation on the left; Overview / All levels on the right; and construction cost, time, action and restriction in a fixed footer. Use consistent Current / Next labels and keep details independently scrollable on desktop and landscape mobile. The Clan Shop uses the same overview and a ten-level table showing each unlock or allowance increase, Treasury cost and construction time. Its Items tab shows personal Gold and purchases. Opening the Shop building starts on Overview; the map's Store action opens Items directly. Preserve selected tabs and scroll through live updates. Existing building benefits, prices, permissions, pauses, purchase rules and server-authoritative completion remain unchanged. **Status:** `IMPLEMENTED — PENDING RELEASE` on `codex/clan-tower-building-layout`.

**Size and theme clarification (confirmed September 27, 2026):** Building details must use the same window dimensions and visual theme as Overview, Garrison, Walls & Veil and Tower Rules. Share the 1040 × 790 desktop maximum, viewport-fitting dimensions, compact layout at 1000px width or 600px height, burgundy frame, parchment surfaces, header typography and footer colors. Opening Buildings, changing buildings or returning to Tower Info must not resize the window or change its theme. Preserve the building-specific benefits, level tables, Shop Items view and fixed construction controls described above. **Status:** `IMPLEMENTED — PENDING RELEASE` on `codex/clan-tower-building-theme`.

#### Engineers’ Workshop presentation (confirmed September 23, 2026)

Use the approved parchment layout with the existing staged building illustration and completed level on the left, and Overview / All levels tabs on the right. Compare the current and next level's wall construction and paid repair time reduction. Explain that building projects are not accelerated and existing wall/repair timers remain unchanged. Keep Clan Treasury in the header; fix upgrade cost, duration/countdown and the primary action in a visible footer. Scroll the details independently on desktop and landscape mobile. Show active construction, pauses, permission/balance restrictions and failed requests clearly before secondary details. Retain Tower Info and other-building navigation. Use authoritative Tower and Treasury snapshots; a countdown reaching zero requests fresh state and never grants a level locally. This presentation does not change any construction rule, permission, cost or duration above.

#### Infirmary presentation (confirmed September 23, 2026)

Use the approved Workshop-style parchment layout: staged Infirmary artwork and completed level on the left, Overview / All levels on the right, Clan Treasury in the header, and a fixed footer on desktop and landscape mobile. Under the September 30 retirement, show preserved levels, zero current combat bonus, a disabled upgrade action and a clear explanation that replacement mechanics are being designed. Keep the original level costs/times available as historical construction information. Preserve open tabs, scroll positions, Tower navigation, authoritative balances and completion of previously paid projects. The active recovery cap is 90% from Field Medics and equipped gear.

#### Training Grounds presentation (confirmed September 23, 2026)

Use the approved Workshop/Infirmary parchment layout: staged Training Grounds artwork and completed level on the left, Overview / All levels on the right, Clan Treasury in the header, and a fixed footer on desktop and landscape mobile. Under the September 30 retirement, show preserved levels, zero current combat bonus and paused upgrades. Keep original construction costs/times as historical information, tab and scroll state, Tower navigation, and completion of paid projects. Explain that already-launched armies retain the attack snapshot saved at departure.

#### Building artwork and map layout

Use the approved settlement and Tower concepts in `docs/art-prompts/clan-buildings/approved-settlement.png` and `approved-tower.png`: dark brown ink outlines, muted ochre roofs, pale olive-grey stone and aged timber in one consistent elevated map view. Every Tower doorway, building entrance and Training Grounds gate faces south. All four active Core Towers use the same approved Tower design and share sixteen building sprites: four visual stages for Levels 1–3, 4–6, 7–9 and 10. Upgrades add architectural detail while retaining the same materials, orientation and recognisable building design. Exact image-generation prompts are recorded with the references.

Place the Shop left of the Tower, Workshop right, Infirmary lower-left and Training Grounds lower-right, forming a compact horseshoe with softly connected dirt clearings and an open central approach to the Tower entrance. Transparent artwork must expose the original map grass between structures: no broad ground tile, contrasting grass patch, platform or heavy drop shadow. Show the connecting paths once the first building is built or under construction. Artwork scales with the world map. **Confirmed September 22, 2026:** retain existing Tower/building sizes and name/level labels; place Shop and Workshop at x ±0.40, y −0.34 and Infirmary and Training Grounds at x ±0.40, y +0.26 using the Tower-width placement convention. Replace courtyard road arcs with five transparent dirt patches joined by faint worn earth. Action icons form one compact row below the building labels, with Info centered, 4px gaps and an 8px gap above the row. Every button remains 56 × 56 CSS pixels on desktop and mobile at every map zoom. Keep the Tower name directly below its entrance. Construction shows scaffolding, and unbuilt buildings remain accessible in the Buildings tab. Reserve the entire compound in pickup exclusion checks. Verify mouse and touch entry points at desktop and landscape-mobile sizes.


**Confirmed September 28, 2026:** rearrange nearby regular cities on all four active Core Clan Tower maps to clear the complete four-building compound, including city banners, building labels and Tower action buttons. Keep the approved Tower/building placement and sizes. Preserve all 55 cities per map and their identities, ownership, Main City status, levels and troops; only coordinates change, with matching client/server layouts and coordinate-only alignment of the current live realm. See `docs/clan-tower-city-clearance.md` for the reviewed positions and release procedure.

### Tower Veil

- Tower Veil is a Tower-specific Clan Treasury service, not a normal Bag item.
- **Confirmed revision (2026-09-17): purchase and activation are separate actions.** A Clan Leader or Officer may purchase Veil from the Clan Treasury through a daily purchase allowance and keep it available for later activation. A Leader or Officer may activate a purchased Veil when needed; purchase does not start its protection timer.
- Each activation protects only the selected Clan Tower. It does not protect the clan's other Towers or cities.
- Duration is ten minutes.
- Cost is one times the equivalent regular-city wall cost at the Tower’s current wall level.
- **Pending clarification:** the number of purchases allowed per day, the scope of that purchase allowance, and unused-charge carryover across daily/season boundaries. Do not infer a new numeric purchase limit from the superseded activation limit.

**Implementation status:** the user explicitly deferred Veil mechanics on 2026-09-17 so the Clan Tower UI can be completed first. The local draft presents separate Purchase and Activate controls, synthetic stored counts and single-tower protection, without assigning a numeric daily purchase limit. The existing server still spends gold immediately on activation and enforces three activations per Tower per UTC day. That describes the existing implementation, not the final rule for the revised purchase flow. Stored purchases require separate authoritative inventory, purchase and activation handling, allowance clarification and validation in a later mechanics update before this revision can be considered implemented or released. The deferred mechanics do not block the approved UI release. Runtime integration retains the existing immediate-payment activation service and its existing server limit until the separately deferred purchase/inventory mechanics are implemented. This client presentation release does not activate or seed Tower gameplay.

### Tower scouting and presentation

- Clan Tower troop orders are initiated from map controls, outside the Clan Tower details window: Send from the Tower for outgoing troops, or Send from an owned city for incoming troops. Do not place Attack, Move, Reinforce or Rally controls or an embedded troop-order composer inside the details UI. Map orders use the normal city troop-order design adapted to the Tower; outgoing orders select only the player's personally stationed troops, never the combined clan garrison. The details garrison displays each player's name, saved personal flag and stationed troop count.
- **September 21, 2026; size reaffirmed September 23, 2026:** Clan Tower map action buttons use a compact 56 × 56 CSS pixel size, reduced from 64px, and keep a constant screen size throughout zooming on desktop and mobile landscape. The user selected 56px after the actual-size comparison of 56px, 64px and 72px. Use the established city action-button treatment. The September 22 approved layout groups them beneath the compound with fixed spacing, as described above.
- **Owned-Tower controls, revised September 21, 2026:** Show Store–Info–Send below the Tower compound on the map; rival controls retain Scout–Info–Rally Attack. Send works like city Send: select a destination on the map, then choose a troop count using the city troop-order presentation. An owned city means transfer; a valid enemy city or reward Camp means attack. Do not show Move/Attack/Rally mode choices or a separate Reinforce button. To send troops into an owned clan Tower, use Send from an owned city and select the Tower. Outgoing orders use only the member's personally stationed troops. Preserve the 1-hour military participation probation (October 3 revision), normal attack restrictions and neutral expansion limits. Store opens that Tower's Clan Shop and stays disabled with an explanation until its local Shop building is complete; no garrison is required to browse. Info opens the existing details window; troop orders remain outside it. Neutral and rival Tower controls retain their existing conquest rules.
- Show the controlling clan's full name and saved heraldry above every owned Tower, even when unselected, using the city-label treatment. Keep the Tower name at its base. Ownership changes, neutralization and membership changes must refresh the banner and clear stale order permissions. Neutral Towers show no clan banner. This presentation update does not change troop ownership, balance or building rules.
- Display the controlling clan's saved flag/heraldry beside the Clan Tower name in the persistent window header, visible on every tab, and beside the controlling clan's name in Overview. Both the map banner and window flags follow the current owning clan's saved heraldry, including later flag edits; never substitute the viewer's clan or an outdated capture-time design. Neutral towers have no clan flag.
- **Confirmed September 22, 2026:** In the map selector, replace an owned Clan Tower map's green center crest with that Tower owner's complete saved clan flag. Keep the decorative frame, map art and other map information. Ownership changes, neutralization, session changes and published heraldry edits refresh the flag in place without resetting pan or zoom; neutral or unknown ownership retains the neutral Tower crest. Support desktop and mobile landscape, including the whole-realm overview. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.
- Map-card icons and clan flags sit in front of all decorative borders. Remove the Camp/Clan Tower text badges inside map cards; retain the top color legend with its names and the accessible map descriptions.
- There is no separate `Scout From Tower` action and no manual Tower-origin selector.
- The normal target-driven Scout action automatically selects the closest eligible origin from either the player's personally owned Cities or a clan Holding Tower where that player has personally stationed troops and remains Tower-eligible.
- Tower screens use the established Crownlands burgundy manuscript headers, parchment and ivory surfaces, tan information boxes, dark readable ink, and existing action-button treatments. Desktop and 844×390 landscape layouts must remain readable.

### Implementation verification before deployment

- The implementation includes deterministic unit/static coverage, Firestore Rules emulator coverage, Treasury concurrency coverage, current-world Camp/Tower reconciliation checks, and the existing complete multiplayer emulator gate. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
- Authenticated production smoke testing, production runtime parity, notification delivery, and rollback rehearsal remain required before the feature may be described as live.
- Deployment must target only the current Core world and current generation. Archived and inactive worlds remain untouched.

## 9. Clans, Rallies & Clan Treasury

### Clans

- **Confirmed October 3, 2026 — former-clan city capture protection, revised:** Leaving, removal, or clan disbanding starts 24 hours during which the clanmates present at departure may attack the departing ruler, but cannot capture their regular cities. This replaces the earlier full attack block. Battles retain existing wall damage, casualties, King Power limits, XP, casualty recovery and offensive Shield rules. Successful dispatch consumes any retaliation opportunity normally; retaliation does not bypass this capture restriction. On a victory during protection, the city keeps its owner, level and investment, surviving attackers return through the existing safe-return rules, and no capture rewards, capture mission credit, ownership event or new retaliation grant is created. The server checks the current owner and deadline at arrival, including Tower-origin attacks, converted support and hostile Rally returns. An attack arriving after expiry can capture under the normal rules. Preview and battle reports explain capture protection separately from battle victory.
  The server snapshots clanmate player IDs at departure. Either side later changing clans does not cancel protection; subsequent departures retain earlier unexpired restrictions. Disbanding protects each member from the others. Protection is directional, excludes unrelated rulers and later joiners, and covers all regular cities currently owned by the departing ruler. Camps, Strongholds, Citadels and Towers retain their existing objective rules. The separate one-hour clan-joining and Tower eligibility cooldowns remain unchanged. Protection is server-owned, scoped to the active realm generation and shard, and starts with departures processed after deployment; historical departures are not backfilled. **Status:** `LIVE — ALL PUBLISHED CHANNELS` at build `5292ae5...`; see the October 3 release ledger above.

- **Confirmed October 3, 2026:** The cooldown after leaving or being removed from a clan is **1 hour**, during which joining, applying to, or creating a clan remains unavailable. A disbanding Leader receives the same wait; other members released by disbanding remain immediately eligible to join elsewhere. Saved 24-hour departures with their matching authoritative clan-change timestamp are shortened from their original departure time without restarting the wait. Records lacking that matching timestamp retain their saved deadline. Joining another clan starts its separate 1-hour Tower participation probation. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.

- The approved Clan UI uses the parchment, olive, brass, and burgundy style for desktop and mobile landscape. Overview, War Room, Rewards, and Members share one window; Rewards separates Gold Gifts, Weekly Conquest, and Treasury. Discovery, creation, public clan profiles, heraldry, renaming, Rally orders, and confirmations follow the same design. Existing information, server permissions, rewards, costs, and Rally rules remain authoritative. **Status:** `APPROVED — IMPLEMENTED, PENDING RELEASE VERIFICATION`.
- Players may create or join clans, hold clan roles, coordinate through Clan Chat, send clan gifts, complete weekly clan goals, reinforce allies, and participate in rallies. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Current operative roles include Leader, Officer, and Member. Exact permission tables are **NEEDS VERIFICATION** against current backend rules.
- **Confirmed September 22, 2026:** Leaders and Officers see a persistent pending-application count on the clan HUD icon and Clan tab. Opening or reading the clan menu does not dismiss pending applications; the count changes only when authoritative pending applications change, including acceptance, denial or applicant cancellation. Regular Members do not receive application alerts. The existing active-Rally count remains included in the shared badge, with both counts described in its accessible label. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
- Clan ID, clan name, clan tag, clan heraldry, member roster, and each member’s current role—including Leader, Officer, and Member—persist across seasons.
- Every current-season clan root, roster member, benefit, gift, quest, Rally, Treasury, and related seasonal record carries the active realm-shard identity. Clan membership and clanmate/allied map relationships are derived from that authoritative roster; missing shard metadata must be repaired without changing membership, roles, heraldry, resources, or player-controlled world state.
- Clan Treasury balance and ledger, seasonal statistics, weekly-goal progress, rallies, reinforcements, donations/gifts activity, and ownership of Holding Towers, Strongholds, the Crown Citadel, or other world objectives reset each season.

The current reset path preserves clan identity, roster, membership, roles, name, tag, and heraldry while rebuilding generation-scoped clan state. The rollover is transactional and fails without partial season changes when a preserved clan record is incomplete or inconsistent. Clan Treasury/ledger, seasonal statistics, goals, rallies, reinforcements, gifts activity, benefits, leaderboards, and objective ownership are reset for the new generation. Emulator coverage includes concurrent member claims, replay safety, invalid rosters, missing records, disbanded clans, removed members, and the 30-member limit. **Status:** `IMPLEMENTED — PENDING SCHEDULED RESET VERIFICATION`.

### Clan Heraldry

- Legacy v1 clan heraldry remains compatible in both clients.
- Clan Heraldry v2, its approved catalog, landscape scrolling fix, and live-editor correction are `LIVE — ALL PUBLISHED CHANNELS`.
- Existing v1 clans must not be visually changed merely because v2 exists; migration occurs when the authorized clan leader deliberately saves v2 heraldry. This is a confirmed design compatibility rule.
- **Confirmed September 22, 2026:** The clan HUD icon, own-profile clan icon, editor's map-size preview and owned Tower map/header/Overview flags display the complete saved design, including its charge arrangement, colours, border and finish. Small display size must not substitute a simplified arrangement. A confirmed edit updates the owning clan's flags immediately; an older listener revision must not overwrite it. Unpublished drafts do not change published flags, and legacy v1 rendering stays unchanged. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.

### Rallies

- The confirmed ordinary Rally design supports 2–20 unique clan members, with one army from one city per participant. A clan may have no more than five active Rallies. There is no formation expiry or automatic launch timer.
- Any active clan member may join. Only Clan Leaders and Officers may create a Rally. Only the Rally creator or the Clan Leader may manually launch or cancel a forming Rally; only the creator may recall the launched combined army.
- Clan War Room and Kingdom Activity → Rallies expose Join Rally to members who have not contributed, including a Clan Leader managing another ruler's rally. Join opens the troop picker from the last selected owned city and shows that source before confirmation. If the source is missing, no longer owned, empty, or unreachable, ask the ruler to select an eligible city; never silently substitute another. The existing one-contribution limit and troop confirmation remain in effect. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
- Selecting Rally on a hostile Clan Tower, Stronghold, or Crown Citadel opens the contribution UI directly from the last selected owned city, limited to its available troops. If that city is no longer owned, has no available troops, or cannot reach the target, ask the ruler to select an eligible city instead of silently choosing another source.
- Clan War Room and Kingdom Activity Rally cards show the assembly city with a map shortcut. While forming, Ready contributions remain visible at that city on the map and in its information panel; inbound contributions are labeled separately until arrival. Ready troops remain reserved for the rally and unavailable for separate orders, but defend their assembly city or Tower until the combined army launches. They are never counted twice in King Power. **Confirmed October 1, 2026 — implementation pending validation and deployment:** all arrived contributions, including the creator’s, take part in live defense. Resolve losses against each ruler’s stationed force, reduce each affected rally and its committed-troop counter atomically, and retain only surviving troops for a later launch, withdrawal or cancellation. Troops still inbound do not defend the assembly. A defeated creator contribution cancels the forming rally and returns remaining contributions through the existing return rules. Scouting and battle reports include arrived troops; private rally targets remain clan-only.
- If the creator of a launched Rally leaves the clan, is removed from it, or changes clans, the server automatically recalls the complete combined Rally army. This automatic safety recall preserves the committed combined force for participant settlement, consumes no Recall Horn, and records `rally_creator_clan_departure` as the reason. A non-creator leaving the clan does not recall another creator's launched Rally.
- A launch is atomic and requires eligible Ready contributors including the creator, continued ownership of the assembly, an eligible hostile objective, and the existing minimum of two Ready participants (three for Tower targets). **Confirmed October 1, 2026:** additional inbound contributions no longer block launch. The Ready survivors depart together; every still-inbound contribution turns back from its current position in the same transaction. Arrival and launch races must commit exactly one outcome per contribution, and a repeated launch must not create another attack or return. The confirmation lists incoming contributors who will return. An invalid non-creator contribution is removed and returned; an invalid creator cancels the Rally.
- Ordinary Rallies may target only Strongholds and the Crown Citadel. Reward Camps and ordinary cities are not Rally targets. The four Holding Towers are Rally targets under their separate Tower rules once this implementation is authorized and deployed.
- A launched Rally travels at its slowest participant's march speed, locked at launch. Under the confirmed October 3 departure policy, each participant also keeps their attack and casualty-recovery skill and equipped-gear snapshot from that launch. Combat and later receipt settlement use those saved values against live arrival-time defense. Troop ownership stays with each contributor.
- Attacker losses are allocated proportionally to troops contributed, with deterministic whole-troop rounding. A defeated Rally has no surviving attackers.
- On victory, the Rally creator becomes the personal controller of a Stronghold or Crown Citadel and the clan receives its shared benefit. The creator's survivors hold the objective; allied survivors remain there as individually attributable reinforcements their owners may recall. Holding Towers remain clan-owned and all eligible survivors are stationed as attributed clan garrison troops rather than creating a personal owner.
- Every participant receives the same Rally battle outcome snapshot with a clearly labeled breakdown of each participant's committed troops, losses, survivors, and contribution.
- If a Rally return's original city is still owned by the participant, the army returns there. If it is neutral or clan-owned, the army returns to the participant's Main City. If an enemy owns it, the returning army attacks that city.
- Ordinary objective Rallies are not restricted by ordinary-city attack protection, neutral-city caps, or anti-farming gates. Committing Rally troops does not remove a Royal Peace Shield.
- The ordinary Rally lifecycle correction above is `LIVE — ALL PUBLISHED CHANNELS`. PR #171 merged as `1e5cdad...`, PR #180 merged the stale Rally-ownership correction as `1a0efbcb...`, and descendant build `a561374b...` established the first verified cross-channel baseline. Current web and itch.io build `fdf326a...` retains the correction. The corrected beginner guide remains live on the canonical game host and itch artifact but not on the separately published primary-domain public site.
- The three-member Holding Tower attack and conquest rule documented in Section 8 is target-specific and `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`; its three-member minimum does not replace the ordinary Rally minimum globally.

### Clan Treasury

- Clan Treasury is `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT` as part of Holding Towers.
- Treasury funds are donated personal Gold and cannot be withdrawn.
- All members may donate; only Leaders and Officers may spend.
- Treasury balance resets each season and when the clan disbands.
- The UI and ledger record seasonal total donated and total spent values.
- A member’s daily donation cap is 12 hours of raw base Gold production. That raw Gold/hour value is atomically snapshotted on the first successful donation of each UTC day and remains fixed until the next UTC day.

#### Confirmed Treasury presentation (2026-09-23)

Use the approved parchment Treasury view inside Clan Rewards, with existing Gold artwork, Treasury balance and seasonal donated/spent totals on the left, and personal Gold, an exact amount input, Gold slider and Max control on the right. Max is the lower of personal Gold and the remaining daily allowance. Show the personal and Treasury balances after the selected donation, the daily cap and its locked/preview status, donated/remaining amounts, raw production basis and 00:00 UTC reset. Keep the review action visible while the two detail columns scroll on desktop and landscape mobile. Confirmed September 29, 2026: Treasury stays beneath the shared Clan and Rewards tabs, just like Gold Gifts and Weekly Conquest. Keep both navigation rows visible and highlight the selected Treasury tab; they replace the separate Back to Rewards control. On short landscape screens, omit the duplicate Treasury heading and scroll the detail columns beneath the tabs while keeping the review action visible. This navigation update is pending merge and release verification. Confirmation shows the exact amount, resulting balances, allowance impact and the finality warning. Live refreshes preserve the typed amount, expanded rules and scroll position within the current clan/session. Donation responses remain authoritative, retries reuse the operation ID, and personal Gold is refreshed from the existing economy endpoint after acceptance. No donation limit, permission, reset or spending rule changes.

### Needs verification

- Maximum clan size, invitation rules, role-change cooldowns, gift values and limits, weekly-goal configuration, inactivity handling, clan-name rules, disband recovery, and moderation controls: **NEEDS VERIFICATION**.

## 10. Items, Shop & Monetization

### Current items

Current strategic consumables include:

- War Drums
- Royal Peace Shield
- Royal Tax Decree
- Veil of Silence
- Swift March Order
- Recall Horn

Common Gear Boxes are Shop/Bag objects connected to Gear progression. Unopened Common Gear Boxes are persistent Gear-system assets and are not normal consumable Bag items for season persistence.

**Core item status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Item behavior

- Items support attack, protection, production, concealment, movement, or recall according to their server-authoritative rules.
- Normal consumable Bag items do not persist across seasons.
- Identical Bag items are grouped by quantity. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The Bag uses All, Boosts, War, Defense, and Utility categories with an eight-item, four-by-two visible layout and supported paging/navigation. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The Shop uses scalable pricing described in Section 4. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.

### Cosmetic skins and Crowns — confirmed October 1, 2026

**Revised October 2, 2026 — city skins only:** The user retired troop skins, city flag borders, paid Halloween flag icons and the collection bundle. This supersedes the earlier seven-item catalog and troop/frame approvals. Implementation requires validation, merge and authorized deployment. Cash Crown packs remain a separate future update.

- Shop → Skins offers Halloween City for 600 Crowns. Profile → Skins offers owned city skins and Default City with separate selection and **Apply**. Purchases unlock a city skin without equipping it and never enter the consumable Bag.
- Remove troop, flag-border, paid flag-icon and bundle choices from Shop/Profile. The flag editor retains its normal free symbols; existing saved flag designs remain compatible. Map troops and city flags use their standard markers, even if an old equipped appearance record names a retired cosmetic.
- Reject new purchases and Apply requests for retired cosmetics on the server, including stale clients. Preserve Crown balances, ownership records and purchase receipts; this update performs no bulk account migration or automatic refunds. Historical purchase retries retain their existing receipt protection. A normal city Apply publishes the city selection and empty legacy troop/border fields.
- Crowns purchase cosmetics only; no gameplay benefit, resource conversion, player transfers or trading. Daily Missions and their existing Common Gear Box completion reward grant no Crowns. Earn Crowns through the map pickups specified in Section 6.
- Halloween City sales recur October 1 at 00:00 UTC through November 1 at 00:00 UTC, exclusive. Ownership and free switching remain permanent. Show the exact cost and resulting balance before purchase; reject stale quotes and never charge again for owned items or replayed purchases.
- City skins follow the current owner across all regular cities, including captured cities, and remain visible to all players. Strongholds and other objectives retain their art. Keep independently changing ownership/King Power marker colors, player heraldry, city levels, hit areas and intelligence rules intact.
- Wallets, ownership and purchase/collection receipts remain permanent private account records outside seasonal profiles. Only equipped appearance data is public. Server transactions control rewards, pricing and equipment; duplicate claims and season changes cannot restore a spent Crown allowance.
- Support desktop, keyboard navigation and landscape mobile. Missing city art falls back to the standard city stage while retaining ownership. City bats retain bounded, visible-only animation and existing motion preferences.

#### Approved Halloween city skin and bats — October 2, 2026

- Use the approved restrained Halloween cities: timber settlements progressing into stone keeps and castles, with pumpkins, warm windows and muted purple details. Supply the five existing visual stages: levels 1–24, 25–49, 50–74, 75–99 and 100+.
- Shop → Skins sells the existing Halloween City unlock for 600 Crowns under the established October sale and permanent ownership rules. Show the actual artwork and previews for all five level ranges. Purchase adds it to Profile → Skins → Cities without applying it automatically.
- Profile → Skins lets players select an owned skin to preview it, then press the fixed **Apply** button to equip it. Selection alone does not change the equipped appearance. Once applied, the owner's appearance changes across every regular city and is visible to all other players through the public equipped appearance record. Newly captured cities adopt their current owner's skin. Selecting Default City and pressing Apply restores the original artwork and removes the bats. Strongholds and objectives retain their established appearance.
- Add two visible flapping bats circling smaller city stages and three around the two larger stages. Keep the movement restrained, preserve map hit areas and labels, and respect reduced/off animation preferences. Pause decorative motion during camera movement; crowded and distant views may omit the bats to preserve map readability and performance.
- Missing city art uses the standard stage image without changing ownership or the equipped choice. This replaces the city placeholder only. **Status:** approved for implementation; not yet verified deployed.

#### Approved knight-order city skins — October 5, 2026

- Add Templar Dawnwatch, Hospitaller Night Sanctuary, Teutonic Frost Citadel and Santiago Emberward to Shop → Skins for **600 Crowns each**. Each unlock includes all five existing appearance stages: levels 1–24, 25–49, 50–74, 75–99 and 100+. These nonseasonal orders are available year-round; Halloween retains its October sale window.
- Preserve permanent ownership, free switching through Profile → Skins → Apply, server-authoritative prices and receipts, purchase without auto-equip, current-owner appearance across regular cities, and visibility to other players. Strongholds and gameplay stats remain unchanged.
- Use the approved paintings and medieval activity outside the walls: standards, patrols, campfires, smoke and birds, with snow for Teutonic cities. Runtime artwork must be optimized and loaded only when used. Share the existing city-animation budget, pause during camera movement and behind overlays, omit distant/crowded effects, and respect reduced/off motion settings. Validate desktop and landscape-mobile performance before merge.
- **Status:** `LIVE — WEB` as of October 6, 2026 at build `d21f6579...`; exact backend/web deployment verified. Signed-in Shop smoke remains pending; purchases and Apply passed in the emulator. Artwork, performance and deployment details are recorded in [the knight-order city notes](visual-qa/knight-order-city-skins/README.md).

#### Approved Crowns counter and pickup presentation — October 1, 2026

- Show the permanent Crowns wallet directly beneath Gold under the player profile. Both counters share a burgundy panel treatment, width, aligned icons and amounts. Crowns use the approved muted purple coin with an antique silver rim and a pale crown; Gold uses the approved antique Gold coin described below.
- Display the confirmed wallet balance, updating after collection, spending and wallet snapshots. Show an unavailable/loading mark while the current account's wallet is unknown, and clear the previous account's balance on sign-out or account changes. The compact number exposes its exact amount through accessible text and a tooltip.
- Place Shield Cooldown and Retaliation below the Crowns counter, aligned to the same left edge with consistent spacing. Preserve existing deadlines, city identities, expandable retaliation details and map-location actions. Keep the stack and nearby controls usable on desktop and landscape mobile.
- Crown pickups use the approved purple pouch with matching silver-and-purple coins inside the same circular marker as Gold and troop pickups. Tint its ring, radial glow and artwork halo purple. Retain existing pickup sizing, hit area, motion preferences, collection authority, timing and the one-Crown reward.
- This approval covers the currency artwork and HUD layout; the city-only cosmetic catalog is governed by the revision above. Sources, prompts and visual checks: [Crowns currency artwork](./visual-qa/crowns-currency/README.md). Status: approved for implementation; production deployment requires separate authorization and verification.

#### Stripe Crown purchases — confirmed October 4, 2026

- The user requested payment support for buying Crowns and selected Stripe while creating a merchant account. The existing cosmetics-only, non-transferable Crown wallet and seasonal persistence rules remain in force.
- Prepare hosted checkout and server-verified, replay-safe purchase receipts in Stripe test mode. Test payments must not add playable Crowns. On October 5, 2026, the user confirmed the first one-time pack: **1,000 Crowns for US$4.99**. Halloween City remains 600 Crowns. Additional packs and live refund/dispute policy remain unconfirmed; do not treat test fixtures as approved offers.
- The initial implementation is restricted to designated test accounts. On October 5, 2026, the user authorized connecting the Stripe sandbox, initially with checkout disabled, then designated one game account for the first sandbox purchase. The four sandbox payment functions were deployed from merged commit `83424189a3e82bf8cf2a02dcecbe1c207b72b0c1`; test credentials, webhook configuration, endpoint authentication and webhook signatures were verified. The private configuration enables only the designated account for the approved 1,000-Crown / US$4.99 sandbox pack. A signed-in hosted test payment was verified complete and paid at `2026-10-05T20:28:01Z`; automatic webhook fulfillment credited exactly 1,000 test Crowns before manual status checks. Repeated status checks and a signed completion-event replay added no duplicate credit, and the playable wallet remained unchanged. Status: `SANDBOX PURCHASE VERIFIED — ONE TESTER ENABLED`. Live payments require separate implementation/release approval, completed merchant setup and remaining provider failure-scenario tests. Evidence and remaining launch work: [Crown payments](./CROWN_PAYMENTS.md).
- The first signed-in sandbox attempt exposed a Stripe API compatibility failure before payment: the installed SDK's Endive version rejects the existing card-only Checkout parameter. Checkout creation now pins the supported Dahlia contract, retaining the sandbox's payment methods and order protection. Only `createCrownCheckout` was updated from commit `6208eb0f3e7d4952adb2a85a57e4d504a78b9eaa` and verified active on October 5; all other functions and the current-realm pointer were unchanged. The original provider-cached failed attempt was retained as an expired receipt after proving it had no Stripe session; a fresh in-game order completed the successful test.

#### Live Crown purchase setup — confirmed October 5, 2026

- The owner requested live purchase setup and confirmed **crownlandsmail@gmail.com** for private support, **manual review** of refunds, and **all countries allowed**, subject to Stripe availability and applicable law. The approved pack remains **1,000 Crowns for US$4.99**; Halloween City remains 600 Crowns.
- Add a separate live Checkout path that credits the permanent playable cosmetics wallet only after server verification of a completed, paid Stripe order. Keep sandbox keys, orders, webhooks and test wallets separate. Repeated or concurrent payment notifications must not credit twice, and concurrent cosmetic purchases or map pickups must retain their balances and receipts.
- Purchase support and refund requests use the private support email. Requests require manual review; this approval does not establish an automatic refund entitlement, automatic Crown deductions, removal of owned skins, negative Crown balances or a spent-Crowns recovery rule. Refund and dispute notifications are retained for manual handling. A case received before fulfillment requires review before delivery.
- Prepare purchase, refund and payment-privacy information and distinguish live checkout from sandbox checkout. Worldwide availability does not establish that tax registrations or other merchant obligations are complete.
- The owner confirmed a dedicated **Buy Crowns** Shop tab immediately after **Skins**. Show the existing Crown coin artwork, the server-provided pack quantity and US-dollar price, and a **Buy** button that opens the existing purchase review and hosted checkout. Remove **Earn Crowns** from the shared skin panels and move Crown purchases out of the Skins tab. Crown map pickups and their established rewards remain unchanged.
- **Status: IMPLEMENTED — PENDING VALIDATION AND RELEASE** on `codex/live-crown-purchases`. Live launch remains gated on verified merchant/tax setup, live credentials and signed webhook configuration, required checks and separate release approval. Deployment alone must not enable real-money purchases.

### Monetization

- Optional rewarded-ad pathways exist. **Status:** `LIVE — ALL PUBLISHED CHANNELS` for the foundation; exact availability may depend on channel configuration.
- Rewarded ads must not bypass server authority or grant a reward more than once for one validated completion.
- Shop rewarded-ad layout and carousel-stability fixes are `LIVE — ALL PUBLISHED CHANNELS`.
- Formal monetization principles, paid-product policy, premium currency policy, ad-frequency limits, regional compliance, and player-protection rules: **NEEDS VERIFICATION**.

### Needs verification

- Exact duration, limits, stacking, cancellation, target eligibility, and interaction priority for every consumable.
- Exact deployed reset behavior for unopened Common Gear Boxes. The confirmed design requires persistence, while the current `origin/main` reset implementation resets them to zero.

## 11. Gear & Persistent Progression

### Current Common Gear

- Common Gear is the live persistent equipment foundation. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gear is organized around War Captain, Master of Coin, Cavalry Master, and Defensive Commander roles.
- **Officer armor upgrade audio — confirmed September 27, 2026:** Successful armor upgrades and rarity promotions for the War Captain, Cavalry Master and Defensive Commander use the owner-supplied `RPG Sound Pack/inventory/chainmail1.wav`. The Master of Coin retains `cloth-heavy.wav`. Apply the appropriate cue to all six armor slots at every rarity, 150 ms after the Gold payment cue, using the gear item's officer. Play only after a newly confirmed upgrade in the current session; rejected, duplicate/replayed and missing-receipt results stay silent. Weapons, tools, necklaces and Equip/Unequip do not trigger armor sounds. Existing Effects mute/volume and music remain independent, and audio failure cannot reject an accepted upgrade. This changes no upgrade rules or costs. Production deployment requires verification.
- Each role has eight equipment slots, for 32 Common Gear definitions in the current foundation.
- Common Gear progresses from Level 1 through Level 5.
- A Common Gear Box reveals exactly three server-rolled Level 1 Common pieces.
- **Confirmed September 28, 2026 — Uncommon Gear Box:** Day 30 of each new Daily Login cycle grants an unopened green chest to the Bag. It uses the Common chest's shape, the existing Uncommon gear greens, and the same opening animation and `gear_box_open` sound. Opening grants exactly one random Level 1 Uncommon piece and two random Level 1 Common pieces. The count is separate from Common Boxes and persists across seasons. Claims and openings are server-authoritative, replay-safe and subject to the existing inventory capacity guard. This chest is a Daily Login reward; Common Box purchasing remains unchanged. Status: `IMPLEMENTED — PENDING RELEASE` on `codex/uncommon-login-gear-chest`.
- Each upgrade combines two matching items at the target's current level into one newly identified next-level item. Both input identities are consumed, inventory count falls by exactly one, and an equipped target transfers its slot to the result. Upgrade request IDs are replay-safe. The pre-rarity release charges 0.5, 1, 2, or 4 hours of current raw regular-city Gold production for Levels 1→2 through 4→5. Its complete Level 5 path represents 16 Level 1 copies and 16 cumulative raw-production hours. The confirmed September 27 fixed-Gold revision below supersedes production-hour pricing upon deployment.
- Common Gear bonuses by level are 0.25%, 0.50%, 0.80%, 1.15%, and 1.50%.
- Current Box sources include weekly daily-login milestones, completion of all three Daily Missions, the configured Relic Camp bonus chance, and one 1-billion-Gold purchase per UTC day.
- Gear inventory, Box opening, purchasing, equipping, and upgrading are server-authoritative and must not be writable through ordinary profile saves.
- Equipped bonuses apply additively to their applicable base systems.
- Common Gear bonuses stack with skills and may raise an effective result above the skill-only cap where the implemented rule allows. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Gear Effects appear in battle reports. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- **Individual battle items — confirmed September 29, 2026:** Attack and defense reports identify each equipped item that contributed attack power, soldier defense, wall power, casualty recovery or new wall repair reduction. Show its saved name, rarity, level, owner and applied contribution on the appropriate side, including Rally members and allied defenders. Under the October 3 departure policy, attack power and attacker recovery items use the departure snapshot; defender equipment and recovery use their resolution-time state. Apply existing caps and rounding to the recorded contribution. Historical reports retain their recorded totals and explicitly mark unavailable item identities. Production, travel and scouting items retain their own scopes. This adds no new combat bonus or balance rule. **Status:** `IN DEVELOPMENT` on `codex/battle-item-effects`; publication requires separate verification.

### Confirmed season persistence

The following Common Gear data persists across seasons/resets:

- Owned Common Gear
- Equipped Common Gear
- Common Gear levels
- Common Gear upgrades
- Associated Common Gear progression that belongs to the Gear system
- Unopened Common Gear Boxes
- Unopened Uncommon Gear Boxes (September 28 confirmed addition; pending release)

The reset initializer now applies an explicit Common Gear persistence allowlist covering unopened Boxes, instances, equipped slots, levels/upgrades, and new-item markers. Normal Bag consumables, timed item effects, and purchase cooldowns still reset. Emulator coverage verifies the preserved Gear can be viewed, equipped, unequipped, upgraded, and opened after the new-generation starting-city claim. **Status:** `IMPLEMENTED — PENDING SCHEDULED RESET VERIFICATION`.

### Confirmed rarity progression — implemented, pending release

- Five-tier Gear progression is `IMPLEMENTED — PENDING RELEASE` on `codex/gear-rarity-progression`; no deployment is claimed.
- Confirmed progression direction (September 26, 2026): Common (gray/white) → Uncommon (green) → Rare (blue) → Epic (purple) → Legendary (orange/gold), with five levels per rarity. Two matching pieces of the same family, rarity and level combine into one next-level piece; two Level 5 pieces become Level 1 of the next rarity. Legendary Level 5 is the endpoint. Poor and Unique are alternate labels, not additional tiers.
- Higher rarities are earned by upgrading the current gear upward, with the September 28 confirmed exception of one Level 1 Uncommon piece in the day-30 Uncommon Gear Box. Continue from players' existing items and levels. Keep Common Boxes at three Level 1 Common pieces. Existing Common items retain their levels, IDs and equipped state until the player upgrades them. The resulting item receives a new identity and inherits the target’s equipped slot.
- The user explicitly confirmed retaining two matching inputs for every level and promotion after reviewing the material requirements and declining Gold-only leveling at higher rarities. Gold remains an additional cost. Duplicate requirements are settled, not an outstanding balance choice.
- The accepted per-item curves and Gold prices are detailed in the [gear progression tables](gear-rarity-progression/README.md). Non-production caps are implemented; total production caps remain deferred. Requiring two matching copies at every step implies 1,048,576 Common Level 1 equivalents for one Legendary Level 1 and 16,777,216 for Legendary Level 5. Retain these figures for transparency without replacing the confirmed rule. See the [working progression review](gear-rarity-progression/README.md). **Status:** `IMPLEMENTED — PENDING RELEASE`.

- September 27 fixed-Gold cost revision: the user approved the table below, replacing the September 26 production-hour curve. These are exact Gold fees per upgrade or promotion, identical for every family, slot and officer and independent of production, city count or bonuses. Common Level 1 is acquired separately. Two matching inputs remain required for every step, and Legendary Level 5 remains terminal. **Status:** `IMPLEMENTED — PENDING RELEASE` on `codex/gear-fixed-gold-pricing`.

| Rarity being upgraded | 1→2 | 2→3 | 3→4 | 4→5 | 5→next rarity 1 |
|---|---:|---:|---:|---:|---:|
| Common | 100,000 | 170,000 | 300,000 | 500,000 | 850,000 |
| Uncommon | 1,500,000 | 2,500,000 | 4,000,000 | 7,000,000 | 50,000,000 |
| Rare | 100,000,000 | 200,000,000 | 350,000,000 | 600,000,000 | 1,000,000,000 |
| Epic | 1,500,000,000 | 2,500,000,000 | 4,000,000,000 | 6,000,000,000 | 9,000,000,000 |
| Legendary | 14,000,000,000 | 22,000,000,000 | 34,000,000,000 | 50,000,000,000 | Maximum |

- Full-path totals include crafting both inputs at every prior step and exclude acquiring Common Level 1 pieces. Existing gear, bonuses, progression and historical charges remain intact; this update adds no refund or migration. New upgrades require the exact quoted price; missing, malformed and outdated quotes fail before spending Gold or consuming items. Historical committed requests still replay their original receipt with no new charge. Publish the matching client and upgrade Function together; existing three-piece Common Box acquisition and Box prices are unchanged.

- September 29 confirmed gear revision: each rarity and level improves its intrinsic bonus, with each item maximum reached only at Legendary Level 5. The [per-item rarity table](gear-rarity-progression/README.md#2-per-piece-and-complete-loadout-bonuses) defines all curves. Legendary maxima: sword 100%, medallion 40%, troop armor 15% each (90% set), Treasury armor 15% each plus Ledger 10% (100% Main City only) and chain 70% all-city (170% Main City gear total), friendly-speed armor 10% each (60% set), lance 60%, scout pendant 110%, shield 60%, repair seal 50%. Wall chest/pants give 20% each and the other four armor slots 15% each, totaling 100%. Existing item identity, levels, equipment, Common bonuses, crafting prices and materials are preserved. No item bonus decreases. **Status:** `IMPLEMENTED — PENDING RELEASE` on `codex/skill-point-efficiency`.
- Combined bonus caps for this revision: attack +200%, city soldier defense +200% per army, city walls +200%, new army march speed +200%, new scout speed +250%, casualty recovery 90%, new regular-city wall repair reduction 50%. March Orders, objective speed and the applicable gear speed now add as percentage points before the cap. The locked skill values/costs remain unchanged. Field Medics 50% plus Legendary Level 5 medallion 40% reaches 90% without clan recovery. Existing march snapshots and repair deadlines remain intact; city shield scope and troop/King Power accounting remain unchanged.
- September 30 supersedes the temporary retention of Training Grounds/Infirmary effects: retire new combat contributions and pause new upgrades while retaining artwork, completed levels, already-paid construction and launched attack snapshots. Replacement clan mechanics and proposed objective bonus budgets remain undecided; this cleanup invents no replacement bonuses. **Status:** `LIVE — WEB`, verified with the coordinated Firebase backend at build `f12191d9228660477c389dcdfcf1afb54790d5ae` from PR #406; see the September 30 runtime cleanup release record.
- Higher-rarity production bonuses use existing additive production and offline accounting. Proposed troop/Main City Gold/other-city Gold total caps (250/350/250%) are deferred, not active rules.
- All earned rarity levels and equipped gear remain permanent through season changes, along with unopened Common Boxes. Inventory normalization must never truncate owned items; full inventory rejects opening before spending the box. Old clients must refresh for the new gear contract; future schemas fail closed without destructive writes.

### Needs verification

- Complete Common Gear definition table, upgrade material quantities, Gold costs, bonus values, rounding, slot restrictions, duplicate handling, and reset field allowlist.
- Exact deployed production reset behavior; repository inspection alone does not prove which server code is deployed.

## 12. Daily Missions & Achievements

### Daily Login

**Approved 12 September 2026; revised September 28, 2026.** Deployment is verified separately in release evidence. The September 28 fixed 30-day cycle is implemented pending release and supersedes the randomized 28-day schedule for new cycles. Existing saved cycles finish without changing their rewards.

- A personal cycle lasts 30 login days. Missed days pause progress. Up to two earned rewards and their arrangement carry across months and server/season resets.
- Each cycle grants 111 hours of base Gold production, 111 hours of base troop production, one of each of the six existing items, four Common Gear Boxes and one Uncommon Gear Box. Common Boxes give three Level 1 Common pieces. The Uncommon Box gives one Level 1 Uncommon and two Level 1 Common pieces.
- Use the existing 30-day production track: alternating Gold and troop rewards on non-item days, each with the hours sequence 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24. Days 5, 15, 20 and 25 give War Drums, Royal Tax Decree, Swift March Order and Recall Horn respectively. Day 10 gives both Veil of Silence (cloak) and Royal Peace Shield. Days 7, 14, 21 and 28 also give one Common Gear Box. Day 30 gives one Uncommon Gear Box.
- The server stores the complete fixed schedule on the global player account. Reopening, realm selection and season reset cannot change it or repeat an already collected reward.
- Attendance is credited once per UTC date, without retroactive credit for missed dates. Preserve attendance, deferred attendance, claim ordinal and receipt guards across resets. Claims collect the oldest earned reward atomically. A same-day deferred visit can fill a slot freed by a claim, including at cycle rollover; rollover itself grants no additional attendance.
- Claims require an owned current-world main city. Resource amounts use current base production at claim time. Unopened Boxes retain their existing season persistence.
- Migration freezes existing randomized 28-day cycles and saved 28-31-day monthly tracks, including queued Days 29-31, until finished. The next cycle uses the fixed 30-day schedule. Read saved progress before any old month-reset normalization; do not restore rewards already expired before this release. Fresh accounts start with the new schedule immediately.
- The approved parchment UI shows weekly milestones and the complete selected bundle with the shared updated chest illustration. Desktop and mobile landscape are supported. Quests and Achievements retain their existing presentation and rules.
- Older clients must refresh before claiming. Requests must identify the current cycle and expected claim ordinal. See [Daily Login implementation notes](./visual-qa/daily-login-cycle/README.md).

### Daily Missions

- Three missions are assigned at 00:00 UTC. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Missions are server-locked, capacity-scaled, and based on validated gameplay events.
- One unfinished mission may be rerolled each day.
- Rewards are claimed manually and remain visibly completed until reset.
- Production-scaled rewards use raw production.

The verified `origin/main` reward values are 0.5 production hour for Easy, 1 hour for Medium, and 2 hours for Hard. Camp-capture and Clan Gift special missions always use 0.5 hour. Production rewards are locked when missions are generated from the then-current raw production snapshot. A non-special Hard mission has a 20% item-substitution chance subject to the configured price constraint. Claiming all three daily missions grants one Common Gear Box.

**Quests presentation approved 12 September 2026.** The parchment ledger keeps three quests visible beside the selected objective, progress, fixed reward, and any recommended target. Claim/Replace remains visible in a fixed action area on desktop and mobile landscape. The shared Daily Login, Daily Quests, and Achievements navigation uses the approved calendar/sun-seal, scroll/quill, and crowned-shield illustrations. Objectives, reward values, UTC renewal, and the one unfinished replacement limit are unchanged. The completion chest is awarded atomically with the final reward claim; retain any earlier completion-time award marker to prevent a duplicate. See [Quests implementation notes](./visual-qa/quests-ledger/README.md). Deployment status is verified separately.

### Achievements

- Crownlands currently has 40 seasonal Achievements. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Achievement presentation supports scrolling and prioritizes claimable information in the corrected interface.
- Production-scaled Achievement rewards use raw production.
- The earlier proposed count of 50 is superseded.

**Confirmed season rule:** Achievement progress, completed state, claimed state, unclaimed rewards, and completion history reset each season. No Achievement completion record persists as permanent progression or prestige history.

The verified `origin/main` production-reward hours are 0.5 for Easy, 1 for Medium, 2 for Hard, 3 for Very Hard, and 6 for Prestige. Achievement production rewards are locked when the completion event is processed using the stored global-stat base rates, not when the monthly achievement set is generated. The achievement cycle identifier combines the reset generation and UTC year-month, and unclaimed rewards expire at monthly rollover.

**Achievements presentation approved 13 September 2026.** The parchment ledger retains all 40 achievements in eight categories with matching medieval badges, category/status filters, and claimable rewards first. Selecting a compact row shows its full requirement and reward in a separate pane with a fixed Claim action. Desktop and mobile landscape use the same window dimensions as Daily Login and Quests. Existing reward art, values, completion-time reward locking, manual claims, and seasonal expiry remain unchanged. See [Achievements implementation notes](./visual-qa/achievements-ledger/README.md). Deployment is verified separately.

### Needs verification

- Complete mission pool, scaling ranges, reroll exclusions, all 40 Achievement definitions, category behavior, and production runtime parity for the verified reward and reset logic.

## 13. Leaderboards & Rankings

### Approved season rewards — September 28, 2026

**Status: implemented; release validation, deployment and the first scheduled payout require separate verification.** This policy supersedes the older unresolved reward, tie and archive questions below. First rewarded season: September 2026, closing October 1 at 00:00 UTC (September 30 at 8:00 PM EDT). September Glory includes only battles recorded since Glory scoring deployment; no historical backfill.

| Final rank | Kingdom reward | Glory reward | Clan reward per closing-roster member |
|---|---|---|---|
| 1 | 8 Common + 2 Uncommon Boxes | 8 Common + 2 Uncommon Boxes | 3 Common + 1 Uncommon Boxes |
| 2 | 6 Common + 1 Uncommon Boxes | 6 Common + 1 Uncommon Boxes | 2 Common + 1 Uncommon Boxes |
| 3 | 5 Common + 1 Uncommon Boxes | 5 Common + 1 Uncommon Boxes | 2 Common + 1 Uncommon Boxes |
| 4–10 | 4 Common Boxes | 4 Common Boxes | 1 Common Box |
| 11–25 | 3 Common Boxes | 3 Common Boxes | 1 Common Box |
| 26–50 | 2 Common Boxes | 2 Common Boxes | None |
| 51–100 | 1 Common Box | 1 Common Box | None |

- All three rewards stack: maximum 19 Common and 5 Uncommon Boxes per player. Existing box contents are unchanged. Leaderboards are an approved additional source of Uncommon Boxes.
- Personal rewards require a positive published score. Every member of a rewarded clan at closing qualifies, with no membership duration or activity requirement. Leaving/removal before closing removes Clan eligibility; later membership changes cannot change an earned reward. Clan rewards go directly to members.
- Kingdom and Clan scores are the authoritative published leaderboard values at closing; no additional economy settlement is performed. Ties use stable player/clan ID ascending, with unique places. Glory retains its approved kill/time/ID ordering and casualty rules.
- Fence outgoing score, battle-event and membership changes, preserve closing standings and rosters before reset can replace clan data, and finish every eligible recorded Glory event in its original season. A launched but unresolved march does not itself earn kills. Keep the existing 81-map readiness and normal admission requirements. The new realm waits for durable capture; reward verification may finish afterward.
- Final Top 100 standings for all three boards persist indefinitely as read-only history. Version the season's reward policy; later balance changes never reprice earned awards. Payouts are server-authoritative and exactly-once under retries and concurrent requests.
- At the first login after reset, Last Season Rewards appears before Daily Login and Welcome Back, after the kingdom loads. Show final placements, each board's rewards, totals and honors, with Claim rewards and Later. Pending finalization is explicit and refreshable. Claims collect both kinds of unopened boxes atomically; full gear inventory does not prevent collecting boxes. Unclaimed awards never expire and survive all resets. Personal reward claims and receipts remain accessible from Leaderboards; the public final-standings archive is on the website as confirmed below.
- Each board has an info button with scoring, ties, local/UTC deadline, countdown, rewards, provisional standing/payout, eligibility, stacking, box contents and claim rules. Unavailable rankings never become a local reward estimate.
- **Season Rewards overview confirmed September 29, 2026; implementation pending validation and deployment:** opening Season Rewards from any leaderboard shows current Kingdom, Clan and Glory standings and projected gear boxes together, with a combined potential reward and all three reward schedules by rank. Use the existing server-published standings and versioned reward tiers. Keep unavailable standings distinct from zero rewards, and withhold the combined total if any board is unavailable. Positive-score and closing-roster eligibility rules, earned claims and the website archive remain unchanged.
- Every rewarded placement earns a permanent dated medal with board, season and rank. Clan recipients retain their medal after leaving; the clan also retains its medal. Top-three decorations use gold/silver/bronze crowns (Kingdom), crossed swords (Glory), or laurels (Clan). First-place titles are Sovereign of the Realm, Champion of the Battlefield, and The Crown’s Vanguard respectively.
- Decorations and first-place titles last through the following season, activate at finalization and do not depend on box claiming. September decorations expire November 1 at 00:00 UTC. Each board shows its own decoration; a public player profile uses the best personal placing, preferring Kingdom for equal placements, while showing all earned titles. Preserve saved flags and heraldry. Honors grant no gameplay benefit.
- Add permanent season reward entitlements/receipts and player/clan medals to the persistence allowlist. These remain separate from seasonal Achievements, whose reset rules are unchanged. Temporary honors expire on their specified calendar boundary even when claimed late.
- If pre-deadline capture was not armed, stop and report the missing evidence rather than reconstructing winners from later state. Merging this implementation does not authorize or prove deployment.

### Current state

- Crownlands provides a Top 100 Kingdoms leaderboard based on King Power. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Crownlands provides a Top Clans leaderboard based on combined clan strength. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Public ruler and clan identity are part of ranking presentation.

### Approved podium and Field of Glory — September 28, 2026

**Status: implemented pending deployment verification.** The user approved the draft and requested implementation, merge and deployment. Release evidence determines which channel is live.

- All three boards use a parchment podium for the first three entries (visual order 2 / 1 / 3), saved flags or clan heraldry, full score totals, a personal standing card and a list beginning at fourth place. Tabs are Top 100 Kingdoms, Top Clans, then **Field of Glory**. Existing Kingdom and Clan scoring is unchanged.
- Field of Glory ranks up to 100 players by enemy player-owned troops defeated during the current season. Credit attack and defense, win or loss, using authoritative casualties **before recovery**. Neutral troops, self/friendly battles, wall damage, travel, donations and production do not award kills. Recovery never subtracts or adds kills.
- Eligible battles use the existing city/royal-holding, occupied Camp and Clan Tower resolution snapshots. Shared attack and defense divide the opposing player-casualty pool by effective combat contribution, with deterministic largest-remainder integer rounding. City owners receive their wall contribution; clan Tower walls are not assigned to one member. Never award the entire shared pool to every participant.
- Order by kills descending, then earliest battle time reaching the total, then stable player key. Late deliveries use the original battle time. Keep each battle's world, reset generation and shard; delayed or repeated delivery cannot move or duplicate credit across seasons.
- A separate server-only seasonal ledger accumulates these totals. It does not change Gold, troop counts, King Power, attack eligibility, XP or rewards. Totals follow player IDs; the UI reads current public names, flags and clan identity. Inactive/missing public identity uses a generic ruler label without deleting the score.
- Each new season starts at zero. The first partial season includes only battles resolved after scoring deployment and explicitly labels the first recorded battle date; earlier battles are excluded. No historical backfill or hidden per-opponent scoring cap is introduced. Final-season locking and archives remain planned.
- Loading, unavailable and empty standings are distinct from published ranks. Find my rank navigates an actual Top 100 entry and never inserts an unpublished local estimate. Rankings refresh on demand; scoring is asynchronous after the battle transaction.

See [implementation and verification notes](visual-qa/leaderboard-podium/README.md).

### Confirmed season history policy

- **Presentation confirmed September 29, 2026; in development pending validation and deployment:** move completed-season rankings to `https://playcrownlands.com/season-rankings.html`. Keep current-season standings and potential rewards in the game, plus access to earned reward claims and receipts. Replace the in-game final-standings browser with a link that opens the website without leaving the game.
- The website archive is readable without signing in. Show only finalized Top 100 Kingdoms, Top Clans and Field of Glory, with a completed-season selector. Publish rank, public display name and score only; account identifiers, rosters, private profiles, awards and claim receipts remain private. Loading, no finalized seasons, pending finalization and unavailable results have distinct states. Never substitute current or provisional standings for a missing archive.
- Active Kingdom and Clan leaderboard entries reset each season.
- At season finalization, the final Kingdom Top 100 and final Clan leaderboard must be locked and preserved as read-only historical records.
- Historical leaderboard records do not directly contribute power, resources, eligibility, or progression in later seasons. The confirmed October 1 Camp balance exception permits aggregate historical power benchmarks to inform fixed reward thresholds; each player's current power determines their tier, without carrying over their historical score or rank.
- The older `PLANNED` archive status is superseded by the season-rewards implementation above. The website presentation remains in development; this move does not alter stored final results.

### Verified `origin/main` implementation

- King Power uses implementation version 11.
- Every controlled troop contributes 2 power. The count includes city and Camp garrisons, marching troops, stationed reinforcements, and committed rally troops, with implementation safeguards against double-counting.
- Replacement power is `floor(objective-supported sustainable base troop production per hour × 12)`.
- Defensive power is `floor(max(0, total defense - garrison troop count) × 0.25)`.
- Total King Power is army power plus replacement power plus defensive power. Territory, city-count, Gold-production, and separate Stronghold score fields contribute zero in the current formula.
- Personal skills, Common Gear, and timed items are excluded from infrastructure power. Objective production and defense benefits are included.
- Kingdom entries are generation-scoped under the current reset generation, filtered to the current generation/world, sorted by King Power descending, and limited to 100.
- Clan entries are generation-scoped and sorted by total King Power descending, limited to 100.
- Clan power reconciliation reads current player stats and membership in the same transaction as the clan aggregate. Delayed or repeated events must not regress totals; legitimate decreases remain valid. Already-current contributions perform no writes.
- Player entries are queried from the current realm-storage board with reset, world, and realm-shard authorization constraints, sorted by authoritative King Power descending, and limited to 100. Client-local unpublished estimates must not be inserted into or rerank the saved global results.
- No explicit secondary tie-break, final leaderboard lock, final-rank rewards, historical archive, or automatic season rollover was found.

These are verified repository facts for commit `27105ae...`; exact deployed backend data and runtime parity remain **NEEDS VERIFICATION**.

### Needs verification

- Production runtime parity for King Power version 11 and live leaderboard contents.
- Update frequency, tie-breaking, eligibility, cheater removal, inactive-player treatment, caching, season-finalization trigger, archive fields and retention, final-rank rewards, and privacy controls.

## 14. Chat, Social & Announcements

### Chat

- Global Chat and Clan Chat are server-authoritative live systems. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The send cooldown remains three seconds. Global messages have a rolling 24-hour visible lifetime measured from authoritative server creation timestamps. Initial queries, live updates, open-client expiry timers, pagination, reconnects, and cached views exclude expired messages; a five-minute backend cleanup removes expired Global messages independently of database TTL deletion.
- Clan messages have no automatic age-based expiry and remain until explicitly deleted through the existing authorized deletion/moderation flow. Shared message TTL is disabled, and the coordinated release migration removes legacy Clan expiry fields while preserving message contents and access controls. The same migration removes Global messages already older than 24 hours. These confirmed rules replace the previous shared seven-day policy; deployment evidence belongs in the coordinated release record.
- Clan Chat visibility follows clan membership and authorization.
- Chat must not allow client-side impersonation or unauthorized clan-channel access.
- Confirmed chat translation, revised September 19, 2026: a small Translate action appears beneath each message confidently detected to use a different language from the player's device/browser preference. Translation is requested only for the chosen message; new messages remain original. There is no channel-wide translation switch or automatic-translation preference. Show original, loading and manual Retry belong to that message and are shared between full and mini views. Same-language, language-neutral and uncertain messages have no Translate action. Detection uses authoritative message text, not the sender's device locale. Reading older messages keeps its position and shows a New messages jump instead of scrolling automatically.
- On September 18, 2026, the user approved Google Cloud Translation and a project-wide application limit of 500,000 source characters per UTC calendar month. This counter persists independently of seasons. Only authoritative, visible messages accessible to the caller may be translated; the browser submits message IDs, and the backend sends message text to Google without separate player or clan identifiers. Cache hits do not consume the allowance. Reservations are atomic; failed or uncertain external requests retain their reservation to prevent exceeding the cap. This application cap does not replace Google's billing terms or account-wide free-tier accounting. **Status:** `IN DEVELOPMENT` until backend and web deployment verification. See [Google chat translation implementation and release notes](google-chat-translation.md).
- Language detection and requested translations share that existing allowance and private cache protections. Only visible chat rows need detection; hidden chat does not request it. Original text remains usable if detection is unavailable. Account, membership, channel and device-language changes invalidate pending work appropriately. Google attribution accompanies each displayed translation.

### Social identity

- Player flags, profiles, clan identity, public leaderboard identity, and clan heraldry form the current social identity layer.
- Player flags on the Kingdom and Field of Glory leaderboards (podium, rows and personal standing) and public player profiles use the editable profile's pointed hanging banner, mounting rod and proportional crest. Preserve each player's saved colors, pattern and symbol. Approved September 28, 2026; deployment status is verified separately.
- Public player profiles use the approved parchment dossier on desktop and mobile landscape: ruler flag/name and public King Power, city count, estimated troop range, stronghold count/names, and clan heraldry/link. Compact columns scroll as needed while the Main City action stays reachable. Locate resolves the recorded map before selecting an unloaded Core city, returns to the map from the own-profile overlay, preserves unsaved profile edits through existing exit confirmations, and retains retry feedback on navigation failure. Existing public-information privacy, identity and gameplay rules remain unchanged. Approved September 23, 2026; merge and deployment authorized subject to required checks, with live status verified separately.
- Player name, complete player flag design, account creation date, and notification preferences persist across seasons.
- Clan ID, name, tag, heraldry, member roster, and member roles persist across seasons.
- Authentication and active-session data may carry forward as technical account state, but they are not seasonal progression or player customization.
- Current reset source preserves the confirmed player identity fields and transactionally carries clan identity, membership, roster, and roles into the new generation while resetting clan-season activity.
- Player Flag save reliability after the reported production issue is **NEEDS VERIFICATION** through a current production smoke test.

### Announcements and moderation

- Profanity filtering, spam controls beyond current rate limits, message reporting, moderator workflows, sanctions, announcement authoring, scheduled announcements, and audit retention are **NEEDS VERIFICATION**.
- Earlier discussion deferred several moderation features. Deferred discussion is not a confirmed rejection or permanent rule.

## 15. Seasons, Resets & Persistence

### Confirmed design policy

The persistence allowlist is explicit. The following are intended to persist across seasons/resets:

1. Player name
2. Complete player flag design
3. Account creation date
4. Notification preferences
5. Clan ID, clan name, clan tag, and clan heraldry
6. Clan member roster and each member’s current Leader, Officer, or Member role
7. Owned Common Gear
8. Equipped Common Gear
9. Common Gear levels
10. Common Gear upgrades
11. Associated Common Gear progression that belongs to the Gear system
12. Unopened Common Gear Boxes
13. Read-only final-season Kingdom Top 100 and Clan leaderboard archives
14. Crown balances, owned cosmetic skins, equipped selections, purchase/collection receipts and the current UTC-day Crown pickup allowance

Authentication and active-session data may carry forward as technical account state. They are not part of the player-facing persistence allowlist and confer no seasonal progression.

Normal consumable Bag items do not persist.

Hero level, Hero XP, unspent skill points, acquired skill upgrades, and saved skill presets reset each season.

Achievement progress, completed/claimed state, unclaimed rewards, and completion history reset each season.

Active Kingdom and Clan leaderboards reset each season. Their locked final-season archives persist as read-only history and do not count as active progression.

Clan Treasury balance and ledger, seasonal statistics, weekly-goal progress, rallies, reinforcements, donations/gifts activity, and world-objective ownership reset each season.

Normal world progression resets unless another system is explicitly added to the persistence allowlist.

The earlier broad statement that “items persist” is superseded by this allowlist.

### Confirmed monthly realm topology

- Every player in an active monthly generation belongs to one shared realm and may interact with every other player in that generation. A 50-player population split is not permitted.
- The implementation may retain `shard_0001` as an internal canonical storage partition so existing generation-scoped paths, rules, and indexes remain isolated. It does not represent a separate player realm, and no `shard_0002` may be opened when player 51 joins.
- New and returning players without current-generation world progression claim one server-authoritative starting city on an active, admitting New Lands map before gameplay subscriptions open. The 25-map Core is excluded from starting placement.
- Starting placement selects among the least-populated admitting New Lands maps with random tie breaking and remains replay-safe. Each New Lands map contains 40 neutral regular cities; when one reaches 20 neutral cities, it closes to new-player admission and the next two cardinally connected maps are prepared, verified, and admitted together in clockwise order. Both initial layers are playable from reset, but only the first north-center map initially accepts starting players. Opening maps ahead of their admission turn must not skip either layer's normal placement order.
- Scheduled work, leaderboards, clans, activity, combat, armies, reports, presence, and world reads execute once against the shared current-generation partition. Archived generations remain inaccessible and inactive but intact for rollback and historical retention.
- Monthly generation and world identifiers remain `realm-YYYY-MM` and `main-realm-YYYY-MM`. Realm generation isolation remains mandatory even though population sharding is removed.

**Status:** The shared-realm and Core-expansion foundation is deployed; the September 2, 2026 activation boundary is historical. The next-reset change to open two initial New Lands layers is implemented pending validation and deployment. Both the scheduler and first eligible client handshake must seed and verify all 81 initial maps before the current-realm pointer may change. This change does not rewrite the current realm, archived realms, or player/clan persistence rules.

### Implementation state

- Season/reset persistence policy is confirmed design.
- One shared monthly realm and removal of the 50-player split are implemented. The temporary five-island starter placement remains the legacy fallback only and is not used after the scheduled Core-expansion activation.
- The approved reset target is the 25-map Core plus the complete 24-map first ring and 32-map second ring, all available at reset. Later New Lands layers begin at the north-center cardinal entrance and allocate clockwise. A layer may never begin on a corner because inter-map roads connect only north, east, south, and west. Every player-facing map label uses a unique medieval-authentic place name. Each New Lands map starts with 40 neutral NPC cities; at 20 remaining neutral cities on the current admitting map, the next two maps become admitting for incoming players. The independent admission cursor applies only to newly initialized generations; existing realms keep their existing expansion cursor. Deterministic Layer 3+ generation, routing, live client discovery, and player/clan reset persistence remain unchanged.
- Production reset enforcement for the explicit player/clan/Common Gear allowlist is `IMPLEMENTED — PENDING SCHEDULED RESET VERIFICATION`.
- The current executable reset path and reset emulator preserve flags, clans, and Common Gear while resetting world and seasonal progression. Exact post-boundary production behavior remains to be verified after activation.
- The production reset has not been verified as executed under this policy.

### Verified current reset behavior

The reset path uses explicit Common Gear and clan persistence helpers around `createFreshResetPlayerProfile`, while the fresh profile replaces seasonal and world progression.

| Data/system | Confirmed intended policy | Inspected `origin/main` behavior | Result |
|---|---|---|---|
| Player name | Persist | Preserved | Matches design in source |
| Complete player flag design | Persist | Preserved and normalized | Matches design in source |
| Account creation date | Persist | `createdAt` is carried forward | Matches design in source |
| Notification preferences | Persist | Carried forward when present | Matches design in source |
| Authentication and active-session state | May carry forward as technical state | Selected authentication fallbacks and active-session state are carried forward | Technical carry-forward; not progression |
| Clan ID/name/tag/heraldry, roster, membership, and roles | Persist | Transactionally migrated to the new generation; invalid/incomplete records fail without partial reset writes | Matches design in source and emulator coverage |
| Clan Treasury/ledger, seasonal statistics, goals, rallies, reinforcements, donations/gifts activity, and objective ownership | Reset | Rebuilt or cleared for the new generation | Matches the reset direction in source; the generation-scoped Treasury implementation is pending merge and authorized deployment |
| Owned Common Gear | Persist | Preserved through the explicit Gear reset helper | Matches design in source and emulator coverage |
| Equipped Common Gear | Persist | Preserved with normalized slot state | Matches design in source and emulator coverage |
| Common Gear levels/upgrades/progression | Persist | Instance and upgrade state is preserved | Matches design in source and emulator coverage |
| Unopened Common Gear Boxes | Persist | Box count is preserved | Matches design in source and emulator coverage |
| Normal Bag consumables | Reset | Counts reset to zero; effects and purchase cooldowns reset | Matches design in source |
| Hero progression and skill presets | Reset | Hero returns to Level 1/XP 0/skill points 0; skill upgrades and presets return to defaults | Matches design in source |
| Achievement progress, state, rewards, and history | Reset | Achievement cycles are reset-generation/month scoped; no permanent completion archive was found | Matches design in source |
| Active Kingdom and Clan leaderboards | Reset | Entries are reset-generation scoped | Matches the active-reset portion of the design |
| Final-season leaderboard archives | Persist read-only | No final lock or historical archive implementation was found | `PLANNED` |
| Normal world progression | Reset | Gold, cities, reports, Camps, armies, and related generation state are rebuilt/reset | Matches the default-reset rule unless a field is later allowlisted |

The initializer also carries forward selected authentication display/email/photo fallbacks and active-session state. These are technical implementation facts, not additions to player-facing seasonal progression.

The reset emulator now verifies preserved player identity, clan identity/roster/roles, and Common Gear together with reset reports, normal consumables, Hero progression, skills, resources, cities, and other seasonal world state.

### Verified generation/versioning behavior

- Current release ID: `crownlands-2026-09-monthly-sharded-realms-v1`.
- Current reset generation: `fresh-2026-07-26-server-reset`.
- Current world ID: `main-fresh-2026-07-26-server-reset`.
- Current API contract hash: `86fc7b17ba028d02ee0ef6131f291f6673d5fdef4178a3463e04cf220bc35dbd`.
- Client/server admission checks gate release ID, reset generation, and world ID; the client also checks the API contract through realm information.
- The armed configuration advances to `realm-2026-09` / `main-realm-2026-09` at September 2, 2026 00:00 UTC. `activateMonthlyRealm` runs at 00:00 UTC daily, while authenticated realm initialization also reconciles the pointer. Both paths use the same fail-closed Core readiness gate.
- Achievement cycles are monthly within a reset generation, using `{resetGeneration}_{YYYY-MM}`.

The held Core-expansion Functions, rules, indexes, and web client were deployed from build `8d80b6a...` before the activation controls were armed. Exact post-reset production execution remains **NEEDS VERIFICATION** until the scheduled boundary passes.

### Operational gate

- Production has a daily Firestore backup schedule with 35-day retention. Backup `3fb979ab-34ff-4c63-ab8a-abe49e8fd7bd`, snapshot time August 31, 2026 at 22:10:07 UTC, was verified `READY` and expires October 5, 2026.
- The previous realm generation remains intact and inaccessible after the pointer switch. Pointer rollback is the first recovery action; full database restore remains available from the verified managed backup if pointer rollback is insufficient.

### Needs verification

- Season length, start/end time, automatic versus manual reset, player notice period, leaderboard finalization trigger, tie handling, archive fields/retention, rewards, legacy records, rollback, and exact production reset procedure.
- Authenticated production evidence for the deployed reset implementation and any administrative migration code or data process outside the repository.

## 16. UI/UX Standards

### Confirmed standards

- **Login presentation — confirmed September 27, 2026:** Replace the photographic, framed login background with an original medieval ink-and-watercolor kingdom illustration based on the owner's map-art reference. Remove the right-hand promotional panel. Fill the viewport with responsive artwork and present a readable Crownlands title above one parchment account panel. Support desktop and mobile login layouts, retaining existing account, realm, audio, fullscreen, community, and information controls. Gameplay rules are unchanged. Implementation and artwork provenance: [Illustrated login](./visual-qa/illustrated-login/README.md). Production deployment requires verification.
- **UI transition audio — confirmed September 27, 2026:** Use the owner-supplied `RPG Sound Pack/interface/interface2.wav` for UI opening and closing, including menus, reports, city details, dialogs and Profile. Keyboard and backdrop closes use the same cue. Retain ordinary button-click audio and Effects controls; music continues independently. Emit one interface sound per transition, suppress duplicates and content-refresh noise, and preserve contextual action feedback. Production deployment requires verification.
- The game must remain readable and operable in landscape mobile layouts and on PC.
- Critical actions, timers, troop counts, resource values, reports, warnings, and state changes must have sufficient contrast and must not depend on decorative texture alone.
- Medieval presentation should use parchment, wood, leather, rope, wax, stone, and worn metal without sacrificing clarity.
- Modal content must remain reachable on supported short landscape screens.
- Touch and pointer targets must not overlap or retarget to unrelated controls.
- Map switching must not open Shop or Bag unintentionally. The current fix is `LIVE — ALL PUBLISHED CHANNELS`.
- Movement HUD, Reports, Chat, and modal layers must stack predictably.
- Reduced-motion and performance-sensitive behavior must be respected where animation exists.

### Confirmed troops helmet artwork — October 4, 2026

The approved troops icon is a frontal medieval helmet with worn steel, a broad dark brim, two eye slots, an angular face guard, subtle brass rivets and a transparent background. Use the same image across shared troop statistics, production, rewards, reports, troop orders, city and objective panels, Barracks icon controls, and default troop reward particles. Retain existing icon sizes, accessible labels and explicit reward artwork. Map army/scout tokens, heraldry, troop pickup bundles, officers and equippable item illustrations retain their existing designs. Troop counts, production, combat, progression and server authority are unchanged. The approved source and prompt are retained in `docs/visual-qa/troops-helmet/`; the 192 × 192 WebP is recorded as `troops-helmet` in `assets/optimized/manifest.json`. Approval and integration do not establish a live deployment.

### Confirmed Inner Castle overview presentation

- The approved overview uses parchment, muted moss, dark ink, and medieval engraved symbols. Desktop pairs the full Royal Bailey scene and six-building directory with a selected-building pane; the window is capped at 1040 × 790 pixels and fits the viewport.
- The Royal Bailey and all six interiors follow the approved illustrated map direction: thin umber outlines, restrained hatching, pale stone, ochre timber, olive vegetation, burgundy pennants, and subtle paper texture. Source artwork remains intact; the browser uses optimized WebP derivatives.
- The six decorative hanging signs retain their established percentage anchors: Treasury 19/24, Great Hall 50/20, Barracks 81/25, Alehouse 19/57, Gatehouse 50/75, and Royal Stables 81/58. Labels remain accessible HTML text over decorative SVG boards; touch targets remain at least 44 pixels high.
- Mobile landscape places Back to City Details in the top bar beside Close. It shows the full 4:3 Bailey and a right-hand pane with the building name, centered square illustration, existing information, then Manage Gear where available. Image size yields to text and action space so the information and Manage Gear are visible without scrolling at the reviewed landscape sizes. Desktop restores the same Back control to its footer. Portrait is not a design target.
- The generic future-update announcement is removed. Treasury, Barracks, Gatehouse, and Royal Stables retain their existing officer gear actions and new-gear indicators. Great Hall and Alehouse retain their descriptions and Not yet available status. This presentation introduces no new building functions, upgrades, costs, or progression.
- Existing entry rules remain: only owned-city details show the shortcut, it opens the player's Main City, and Back returns to the inspected city. The Profile shortcut continues to support an off-map Main City. Equipment subpanels and server authority are unchanged.

Status: `IN DEVELOPMENT` on the Inner Castle feature branch; visual direction and runtime integration were confirmed on 10 September 2026. Merge and deployment require separate authorization and verification. Review and validation details: [Inner Castle overview](./visual-qa/inner-castle-overview/README.md).

### Confirmed Treasury equipment presentation

- **Armor upgrade audio — confirmed September 27, 2026:** Successful Master of Coin armor upgrades and rarity promotions use the owner-supplied `RPG Sound Pack/inventory/cloth-heavy.wav`, following the existing Gold payment cue. Apply it to the six armor slots at all rarities, with existing Effects mute/volume controls. Other officers use the chainmail cue described in Section 11. Tools, necklaces and Equip/Unequip actions retain their existing audio. Play only for a newly confirmed upgrade in the current session; no change to upgrade rules or costs. Production deployment requires verification.

- The approved Treasury Manage Gear screen uses parchment, muted moss, dark ink, and engraved medieval symbols. It supports desktop and mobile landscape, with a desktop cap of 1200 × 790 pixels and viewport-fitting dimensions on smaller screens.
- The Master of Coin portrait sits between the existing eight equipment slots. The equipment bag occupies the middle pane, with the selected item's information on the right. Bag and item information scroll independently; Equip/Unequip and Upgrade remain visible at the bottom of the selected pane.
- The approved Master of Coin illustration uses the map's medieval ink-and-wash direction, with a transparent background and a subtle breathing/blinking idle loop. It animates in Full mode while the Treasury is visible; Reduced/Off mode, background visibility, and upgrade confirmation use the still illustration. The existing animation preference and automatic performance rules remain authoritative. This artwork affects only the Treasury officer, not the equipment items or other officers.
- Common is the current lowest rarity and uses a light gray item background (`#d9dad6`) in filled slots, bag tiles, selected-item artwork, and upgrade confirmation. Burgundy borders identify selected items while retaining the gray background. Empty slots retain parchment. The higher-rarity colors and upgrade path are confirmed as planned in Section 11; their implementation is pending release.
- Existing levels, exact Gold amounts, production scope, matching-copy requirements, next bonuses, descriptions, binding, stack counts, equipped/new indicators, and progression-path information are retained. The Treasury Chain retains its all-owned-cities scope. No equipment rule, cost, bonus, API, or server-authority change is introduced.
- Upgrade confirmation retains the two-to-one consumption and irreversible-action wording, confines keyboard focus, and returns focus to Upgrade on Cancel or Escape. Pending requests disable equipment actions; Back returns to the Inner Castle. Other officers retain their existing presentation.

Status: `IN DEVELOPMENT` on `codex/treasury-gear-draft`, with user-approved design and runtime integration. Merge and deployment require separate authorization and verification. Review and validation details: [Treasury equipment](./visual-qa/treasury-gear/README.md).

### Confirmed Barracks equipment presentation

- The approved Barracks Manage Gear screen follows the Treasury parchment layout and matching dimensions: up to 1200 × 790 pixels on desktop, fitting the viewport on mobile landscape. Portrait is not a design target.
- The War Captain is a static, transparent full-body illustration in the approved medieval ink-and-wash style, centered between the eight equipped slots. It has no animation in any motion setting. The equipment bag occupies the middle pane; selected-item details occupy the right, with Equip/Unequip and Upgrade kept visible.
- Common items retain the light gray `#d9dad6` background and burgundy selected borders. The Gold icon reuses the approved crown-stamped coin. All existing information, quantities, levels, costs, matching-copy requirements, and upgrade confirmation behavior are retained.
- Armor retains troop production in all owned cities; the Officer Sword retains attack strength for all attacks; the Valor Medallion retains casualty recovery with Field Medics, the combined recovery cap (90% under the September 29 gear revision, pending release), and recovery to the Main City. Shared server-authoritative equipment actions remain unchanged. Gatehouse and Royal Stables retain their existing presentation.

Status: `IN DEVELOPMENT` on `codex/barracks-gear-draft`; the user approved the layout, static character, merge, and deployment on 11 September 2026. Runtime integration is complete; release status requires separate channel verification. Review details: [Barracks equipment](./visual-qa/barracks-gear/README.md).

### Confirmed Gatehouse equipment presentation

- The approved Gatehouse Manage Gear screen follows the Treasury/Barracks parchment layout and matching dimensions: up to 1200 × 790 pixels on desktop, fitting mobile landscape. Portrait is not a design target.
- The Defensive Commander is a static, transparent full-body illustration in worn steel and a moss-green cloak, with fortress keys and a shield. He is centered between the existing eight equipment slots and has no animation in any motion setting.
- The equipment bag occupies the middle pane; complete selected-item details occupy the right. Bag and details scroll independently while Equip/Unequip and Upgrade remain visible. Common items retain light gray `#d9dad6` backgrounds and burgundy selection borders. The approved crown-stamped Gold coin and engraved Gatehouse symbol are retained.
- Armor retains wall strength in all owned cities. The Fortress Shield retains defending soldier strength in all owned cities. The Masonry Seal retains reduction to repair time added by new wall damage. Existing values, costs, matching-copy requirements, progression, binding, quantities, and server-authoritative actions remain unchanged.
- Upgrade confirmation preserves the two-to-one consumption warning, keyboard focus containment, and focus restoration. Treasury and Barracks retain their approved presentations; Royal Stables retains its existing presentation.

Status: `IN DEVELOPMENT` on `codex/gatehouse-gear-draft`; the user approved the layout, static character, merge, and deployment. Runtime integration is complete; publication requires separate channel verification. Review details: [Gatehouse equipment](./visual-qa/gatehouse-gear/README.md).

### Confirmed Royal Stables equipment presentation

- The approved Royal Stables Manage Gear screen follows the Treasury, Barracks, and Gatehouse parchment layout and matching dimensions: up to 1200 × 790 pixels on desktop, fitting mobile landscape. Portrait is not a design target.
- The Cavalry Master is a static, transparent full-body illustration in riding armor and a slate-blue cloak, holding an upright lance. A saddled bay horse stands behind him. Both fit between the existing eight equipment slots, with the officer in front and no animation in any motion setting.
- The equipment bag occupies the middle pane and complete selected-item details occupy the right. Both scroll independently while Equip/Unequip and Upgrade remain visible. Common items retain light gray `#d9dad6` backgrounds and burgundy selected borders. The approved crown-stamped Gold coin and engraved horseshoe seal are retained.
- Armor retains owned-city transfer and reinforcement speed. The Lance retains attack and rally march speed. The Wayfinder Pendant retains scout speed. Existing bonuses, levels, Gold costs, matching-copy requirements, descriptions, progression paths, binding, quantities, equipped/new indicators, and server-authoritative actions remain unchanged.
- Upgrade confirmation retains the two-to-one consumption warning, keyboard focus containment, and focus restoration. Treasury, Barracks, and Gatehouse retain their approved presentations.

Status: `IN DEVELOPMENT` on `codex/royal-stables-gear-draft`; the user approved the layout, officer with horse, merge, and deployment on 12 September 2026. Runtime integration is complete; publication requires separate channel verification. Review details: [Royal Stables equipment](./visual-qa/royal-stables-gear/README.md).

### Confirmed Common Gear Box presentation

- **Gear Box opening audio — confirmed September 28, 2026:** Use the owner-supplied `chest.mp3` wooden creak when a confirmed opening begins its 0.9-second lid animation. Retain the full clip and the existing Effects volume/mute controls; music continues independently. Reduced/Off motion still permits the sound. Pending or failed requests and openings completed in a hidden or dismissed panel stay silent. A recovered lost response may play when its opening is first presented. Audio failure must not interrupt accepted rewards. Production deployment requires verification.
- The approved opening and reward screen uses parchment, muted olive actions, an illustrated oak-and-iron chest, and gray Common item cards. It shares the officer panels' maximum 1200 × 790 desktop dimensions and fits mobile landscape. Portrait is not a design target.
- Clicking or tapping the chest and pressing Open Box perform the same single-box action. The chest is also keyboard-operable. Full motion animates unsealing, the hinged lid, and the three reward cards. Reduced/Off preferences, system reduced motion, background visibility, and automatic performance settings are respected.
- After a confirmed opening, Open Another Box remains available while unopened boxes remain. Each deliberate click opens one box, with no automatic batch opening. The remaining count is visible; at zero, Equip Later and Go to Inner Castle remain available. Primary actions stay visible on short landscape screens while long item details can scroll within their cards.
- Exactly three server-rolled Common Level 1 pieces are retained, including their existing item art, officer, building, slot, level, and bonus scope. The server's inventory and count remain authoritative; animation never grants rewards or spends a box.
- Pending chest and button controls share one request guard. An uncertain opening retains its request identity for retry and across closing/reopening the panel. Accepted results must not reopen a dismissed panel or replace a different screen. Failures preserve prior rewards, and old responses must not overwrite a newer profile snapshot or another account.

Status: `IN DEVELOPMENT` on `codex/common-gear-box-draft`; the user approved the design, clickable chest, push, merge, and deployment on 12 September 2026. Runtime integration is undergoing release validation; LIVE status requires channel verification. Review details: [Common Gear Box](./visual-qa/common-gear-box/README.md).

### Confirmed Item Bag presentation

- The approved Bag uses the same parchment, olive actions, engraved symbols, and burgundy selection treatment as the city and officer panels. Its window shares the maximum 1200 × 790 dimensions and fits desktop and mobile landscape; portrait is not a design target.
- All, Boosts, War, Defense, and Utility remain in their existing order. Identical items retain one quantity stack. The grid keeps eight positions in four columns and two rows, with paging and existing keyboard, swipe, and horizontal-wheel navigation. The seven current item types and their full descriptions, effects, and eligibility rules are preserved.
- The item grid is on the left. The selected item's larger illustration, name, category, description, and effect are on the right. On the smallest landscape screen, the illustration sits beside its name to make room for the details. Long details scroll independently while owned quantity and Use/Open remain visible. Active time also stays visible in the selected-pane heading.
- Quantity badges use the existing compact number format. The selected pane and accessible item names expose the exact quantity. Consumable and unopened-box wells retain parchment without assigning new rarities; equipped Common items elsewhere retain their approved gray backgrounds.
- The Common Gear Box uses a static export of the approved oak-and-iron opening chest in the Bag, its selected preview, and other existing shared item-icon uses. The animated opening screen is unchanged. Other Bag item artwork is retained.
- Use and Open keep their current actions: timed items follow the existing server-backed activation/stacking rules, march items lead to eligible outgoing-march selection, and Open leads to the Gear Box screen without spending a box in the Bag. The projected UI refresh restores a tile when a rejected last-copy use returns its quantity. Category and item selection retain keyboard focus after rerendering.

Status: `IN DEVELOPMENT` on `codex/bag-inventory-draft`; the user approved the Bag design, updated chest, merge, and deployment on 12 September 2026. Runtime integration is complete and release validation is in progress. LIVE status requires separate channel verification. Review details: [Item Bag](./visual-qa/bag-inventory/README.md).

### Confirmed Shop presentation

#### Confirmed Gold coin artwork — October 4, 2026

The approved Gold currency icon is a worn antique gold coin with a bold embossed crown, fine dark outlines, painted metal shading, and a transparent background. Use the same approved image throughout Gold balances, prices, production, rewards, City Details and City List, equipment screens, clan screens, objective icons, and default Gold coin particles. Keep the distinct purple Crowns currency artwork and existing illustrated purses, structures, and officers. The approved master and generation prompt are retained in `docs/visual-qa/gold-coin/`; the shared 192 × 192 WebP is recorded as `gold-coin` in `assets/optimized/manifest.json`.

#### Shop layout and illustrations

- The Shop uses the approved parchment, olive actions, engraved Gold coin and burgundy selection treatment. It shares the Bag's maximum 1200 × 790 window dimensions, with desktop and mobile landscape layouts. Portrait is not a design target.
- Provisions, Skins, Buy Crowns and Free boosts share one Shop frame, market header, Gold balance and full-width tab bar. Switching sections changes only the content below; header height, tab positions, labels/count badges, typography and close control stay consistent at each viewport size.
- Provisions and Free boosts are separate tabs. The seven current provisions use a four-column, two-row grid, with full names and current prices beneath their illustrations. The selected item's illustration, full description, owned quantity, daily allowance and single-item purchase action are shown on the right. Long details scroll independently; purchase controls remain visible on short landscape screens.
- Royal Peace Shield, War Drums, Royal Tax Decree, Veil of Silence, Swift March Order and Recall Horn use the six approved hand-inked medieval illustrations. Shared item references use the same art in the Shop, Bag and existing item presentations. The previously approved oak-and-iron Common Gear Box remains unchanged. This does not assign new rarity behavior.
- Purchases retain existing scalable quotes, server authority, pending reservations, repeat-buy behavior, daily limits and rejected-action recovery. Full descriptions come from the existing item definitions. This presentation approval does not change item balance or resolve the older Section 4 pricing statements, which differ from the current client/server implementation.
- Optional advertisements retain their existing estimates, watched counts, availability, shared cooldown, disclosure and server-backed completion flow. Countdown updates preserve the item controls. A pending Common Gear Box purchase remains disabled across item selection, and its completion does not replace a different open panel.

Status: approved for integration, merge and deployment on 12 September 2026 on `codex/shop-ui-art-draft`. Publication requires separate channel verification. Review and validation details: [Shop UI and artwork](./visual-qa/shop-ui/README.md).

### Confirmed interaction performance requirements

- Pending action feedback must appear promptly without changing server authority, eligibility, costs, cooldowns, or intended march duration. Presentation failures must not prevent a request from completing or leave a request lock stuck.
- Pinch zoom applies its camera transform in the same coalesced animation frame. Lifting one finger continues the gesture as a drag; cancellation must not become a city or action tap.
- Chat updates preserve unchanged message rows, focus, and reading position. Hidden previews avoid presentation work; expiry, moderation, channel access, unread indicators, and reconnect behavior remain authoritative. A queued close event cannot collapse newly reopened chat.
- Shop countdowns update their text without replacing the item controls. Initial loading overlaps independent saved-state reads while retaining the skill-migration-before-profile dependency. Map readiness requires verified map art and city data, but does not wait for background presence delivery.
- On returning to the foreground, fresh authoritative economy is presented without waiting for unrelated presence and roster refreshes. Existing synchronization, retries, and stale-account/region guards remain in force.
- With no explicit animation preference, sustained frame pressure may reduce decorative effects and sustained recovery may restore them. Explicit Full, Reduced, and Off settings and the system reduced-motion preference take precedence.
- Performance evidence must distinguish controlled browser/emulator results from production measurements. Local diagnostics retain only a bounded set of operation names, durations, and outcomes, without request payloads, identities, or results.

Implementation and measurement detail: [Responsive gameplay performance review](./RESPONSIVE_GAMEPLAY_PERFORMANCE.md). Release-channel verification is recorded in the release handoff; these requirements alone do not establish deployment.

- Route previews must preserve useful in-flight results for unchanged selections, reflect acknowledged speed-modifier changes, and avoid unnecessary write locks. Actual launch remains authoritative for current eligibility, resources, route, modifiers, and duration.
- An interrupted scout or army response must retain its original request ID across retries and reloads. Reconnect recovers accepted orders independently by reading canonical receipts; it must never automatically send an unconfirmed action. Completed orders refresh their results without creating another march or charge.
- Account and realm changes invalidate outstanding results. Failed foreground report or city reads must trigger the existing recovery retries, while successful unchanged snapshots count as synchronized. Presence delivery must not prevent prompt confirmation recovery.

Implementation and controlled evidence: [Server response and connection reliability](./SERVER_CONNECTION_RELIABILITY.md). Physical phone checks were excluded from this update by the user; deployment status must still be verified separately.

### Contextual first steps

- New starting-city claims enable short, dismissible guidance for editing the ruler name and kingdom flag, then the first city upgrade, scout, and city attack. Existing players may enable or replay it through Profile → Settings → First steps & help. Camp attacks and capture are excluded from beginner guidance because new rulers lack the troops for them; normal Camp gameplay and information remain available.
- Guidance appears beside the relevant Profile controls, map selection, or action dialog. It explains the existing name and flag editors, upgrade cost and production benefit, one-troop scouting and Reports, and the city attack confirmation and arrival result. Name and flag saves retain their existing confirmation, persistence, and unsaved-change behavior.
- Arrows point at the actual visible controls, following panel, scroll, resize, and camera changes. They do not intercept input, point at disabled or obscured controls, or submit actions. Profile editing guidance begins with the portrait; name editing uses the pencil, name field, and save check mark; flag editing uses customization choices and Save Flag.
- Tips are optional reading aids. “Got it” dismisses a topic; it does not claim that an action succeeded. “Hide tips” hides all guidance. These preferences are local to the browser, account, and realm, survive reload where browser storage is available, and never gate or submit gameplay actions.
- Copy uses existing costs and report lifetime. Guidance preserves server authority, balance, hidden intelligence, action blockers, and the compact travel section. Existing opt-outs survive the addition of name and flag topics. Implementation and release verification are recorded in `docs/CONTEXTUAL_NEW_PLAYER_ONBOARDING.md`.

### Confirmed Kingdom Activity Marches presentation

- The approved Marches tab uses the parchment ledger style, engraved order symbols, and current shared Swift March Order and Recall Horn art. Desktop is capped at 1200 × 700 pixels; desktop and mobile landscape fit the viewport, with fixed header, category tabs, and summary above one scrolling list. Small landscape places force and commands beneath the route. Portrait is not a design target.
- Each row retains its order type, origin, destination and map, available target ruler and troop information, own troop count, and arrival state. Full known counts are displayed without abbreviation; unknown or estimated values retain their existing disclosure rules. Returning armies retain their original target and home destination. List scroll position and keyboard focus survive snapshot updates.
- Existing current-position Map, ruler-profile navigation, server-derived timing, Swift and Recall eligibility, inventory accounting, request IDs, and pending/checking/resolving states remain authoritative. The image buttons and inventory header update together during pending item actions. This is a presentation change, with no new travel or item rules.
- Rallies, Reinforcements, Camps, and Strongholds remain functional and retain their current panel designs for separate reviews.

Status: approved for implementation and release on September 14, 2026; deployment must be verified separately. Design and controlled runtime evidence: [Kingdom Activity Marches](./visual-qa/kingdom-activity-marches/README.md).

### Confirmed Kingdom Activity Rallies presentation

- The approved Rallies tab shares the Marches parchment frame and 1200 × 700 pixel desktop cap. Desktop and mobile landscape fit the viewport. A scrolling clan-rally selector sits beside the selected target; its title and commands stay fixed while creator, assembly city, full troop totals and all participants scroll between them. Small landscape retains access to all twenty participants and all five active rallies. Portrait is not a design target.
- The roster retains ruler-profile links, leader/ally and own-ruler labels, troop counts, Ready/inbound/Arriving/Marching/Returning/Stationed/Settled states, readiness and capacity. Selection, scroll position and keyboard focus survive snapshot updates; account/clan changes reset the selected rally. Existing March Orders, fortress/crown heraldry and shared Recall Horn art are reused.
- The existing readiness, role checks, join entry, launch/cancel confirmation, withdrawal, Recall Horn eligibility and inventory, pending requests and server results remain authoritative. This changes presentation only: formation has no expiry or automatic launch timer, and no rally rule, cost, capacity or target rule changes. Clan War Room retains its existing presentation.

Status: approved for implementation and release on September 14, 2026; deployment must be verified separately. Design and controlled runtime evidence: [Kingdom Activity Rallies](./visual-qa/kingdom-activity-rallies/README.md).

### Approved Kingdom Activity Reinforcements presentation

- The Reinforcements tab uses the approved parchment frame with the same 1200 × 700 pixel desktop cap and viewport-fitting desktop/mobile landscape layouts. Three fixed section shortcuts lead to Traveling, Stationed with allies, and Defending your holdings in one scrolling ledger. Portrait is not a design target.
- Preserve known routes and maps, ruler-profile links, full visible troop counts, explicit estimates or syncing states, arrival status, return destinations and Main City fallback details. Small landscape moves return information and commands below each holding. Scroll position and keyboard focus survive snapshot updates; countdown-only updates preserve control identity.
- Contributors use Recall and holding owners use Send Home for stationed troops. Existing confirmation, permissions, pending-request guards, fallback routing and server acknowledgements remain authoritative. Failed returns retain the assignment and expose retry feedback. These stationed returns do not use Recall Horns; no cost, capacity, visibility or return rule changes. The draft's HTML confirmation is a review aid; production retains its existing confirmation.

Status: approved for integration and release on September 15, 2026; deployment requires separate verification. Design and evidence: [Kingdom Activity Reinforcements](./visual-qa/kingdom-activity-reinforcements/README.md).

### Approved Kingdom Activity Camps presentation

- The approved Camps tab shares the Kingdom Activity parchment frame and 1200 × 700 pixel desktop cap, with viewport-fitting desktop and mobile landscape layouts. A fixed heading, activity tabs and camp summary sit above one scrolling ledger. Portrait is not a design target.
- Rows preserve the current camp artwork, name and map, hold reward, full garrison, controlled/contested state, countdown, Resolving/Syncing states and Map action. Small landscape places rewards and garrisons beneath identity/timing. Gold and troop values from the existing base configuration are labeled Base hold reward; random city and item rewards remain explicit. No new payout calculation or guaranteed reward is introduced.
- Preserve held-camp discovery across unvisited maps, deduplication, loss/removal handling, independent hold timers, daily allowances, production scaling, reward privacy and server resolution. Map retains the existing close-and-locate behavior. The draft's map preview is only a review aid. No Claim, Recall, abandon or balance change is included.

Status: design and combined integration approved September 15, 2026 with Strongholds and Troop Orders. The combined update requires release validation and deployment verification. Design and controlled evidence: [Kingdom Activity Camps](./visual-qa/kingdom-activity-camps/README.md).

### Approved Kingdom Activity Strongholds presentation

- The Strongholds tab uses the matching parchment frame on desktop and mobile landscape, with a fixed header, category tabs and summary above one scrolling ledger.
- Each holding preserves its current illustration, name/map, specialization, full garrison, defense level and Map action. The Crown Citadel shows its five existing bonuses together. Bonuses come from current runtime configuration; ownership filtering and Citadel authority remain unchanged.
- No new gameplay action, reward, objective bonus or defense rule is introduced. Map continues to close the window and locate the holding. Production integration is approved as one release with Camps and Troop Orders; deployment requires separate verification.

### Approved Leaderboards, Map Atlas, and objective details — September 16, 2026

- Leaderboards use the parchment ledger with fixed category tabs, standing summary, column headings and footer, and a scrolling Top 100 list. Ruler/clan profiles, flags/heraldry, home map, city/member counts, score age and full power values remain available. Find my rank locates an existing published entry; it never inserts an unpublished local score.
- Map Atlas uses larger, uncropped thumbnails within the existing tile footprint, compact captions, Current/Home shortcuts, Whole realm and zoom controls. Tower maps have green masonry frames; Camp maps have brass fittings; regional Strongholds have crimson/gold frames with their bonus icons. Crown Citadel retains the crown. Decorations do not intercept selection or gestures. The existing camera supports a whole-realm fit and keyboard neighbor navigation while preserving live activation, registered landmarks, open connections and drag-click suppression.
- Gold, Training, Movement and Defense Strongholds and Crown Citadel share the approved royal frame. A fortress portrait and ownership sit beside the bonus strip, full garrison/defense values, wall status, collapsible Defense & repair and Holding benefits, and existing reinforcements. Management actions stay in a fixed footer. Stronghold Legacy and the Crown Reign Ledger retain authoritative cumulative scores and current-holder timers.
- Exact enemy troops/defense remain scout-gated; clan garrison sharing and existing return/relinquishment permissions are unchanged. No objective balance, combat formula, season retention, map topology, or multiplayer authority is changed.
- Desktop and mobile landscape are the supported game views. This batch is approved for integration, merge and web deployment; LIVE status requires verification of the resulting production build.

### Approved compact map HUD and mini Chat — September 20, 2026

- The September 20 approval supersedes the September 19 Active Boosts & Protection overview. Remove that dialog and its entry points. Shield, War Drums, Royal Tax Decree and Veil return to passive, vertically stacked indicators at the right-center of the map, using the original burgundy backgrounds and the newer approved shared artwork. Expired effects disappear. Short landscape screens keep the stack clear of map navigation. Existing effect deadlines, values, scopes, per-order consumables and deferred Clan Tower Veil mechanics remain unchanged.
- Mini Chat restores its original fixed 64 px height and 360 px width cap, the previous `cl-icon-back` arrow (reversed while expanded), and original burgundy toggle colors. Preserve the exact previous brown background: a 72%-opacity gradient from `rgba(49,33,23,.72)` to `rgba(22,16,12,.72)`, with the original subtle repeating grain. Recent messages and their individual Google Translate actions scroll within the fixed preview. Open chat opens the real conversation; there is no channel-wide translation action. The September 20 follow-up removes the separate Realm Chat shortcut, superseding its earlier approval while retaining the mini Chat toggle and Open chat control.
- Shield Cooldown and Retaliation use one compact card below Gold, 156 px wide on desktop and 148 px in mobile landscape. The scrollable list retains every city name, saved map/ID and independent countdown. Each city has a Map button that navigates using its recorded city and map, including an uncached destination. Viewing a location never consumes retaliation. Failed travel preserves the list with recovery feedback; account changes cancel stale selection. The card displays the separate 15-minute Shield activation cooldown and 24-hour retaliation launch window specified above.
- The user approved auditing and integrating all remaining approved conversation drafts, followed by required checks, merge and production deployment. [The integration audit](APPROVED_UI_COMPLETION_AUDIT.md) records prior releases, remaining gaps, preserved combat behavior and verification boundaries. A source integration or stale draft status is not deployment proof.

### Current presentation status

- **Approved September 23, 2026 — Reports-aligned HUD inset:** Move the already-aligned player row and Gold together to the same 12 CSS pixel left inset as Reports on desktop and mobile landscape. This follow-up supersedes the prior instruction to keep Gold in its existing position; keep the row and Gold aligned with each other. Preserve sizes, artwork, colors, vertical placement, internal spacing and independence from map zoom. Compact combat timers move with their parent. Preserve the top header's safe-area inset when a notch requires more than 12px; Reports and other HUD controls are unchanged. The edge guide remains review-only. Release status requires deployment verification.

- **Approved September 23, 2026 — top HUD alignment:** Move the player frame and the three adjacent top icons 7 CSS pixels left as one row, aligning the row with the existing Gold panel. Keep Gold in place and preserve control dimensions, artwork, red backgrounds, vertical placement, spacing, safe-area behavior and independence from map zoom. The alignment guide belongs only to the review page. Release status requires deployment verification.

- **Approved September 23, 2026 — main-screen artwork:** Preserve the original red/burgundy HUD backgrounds, borders, label colors, layout and control sizes. Restyle the Bag, Shop, Cities and Map images as matte ink-and-wash illustrations matching the current map. Keep the original crown medallion, ornate Daily Login reward calendar and decorated player flag frame designs, redrawing their materials and outlines in that same illustrated style. The Reports button uses the existing illustrated dispatch emblem. Preserve actual saved player/clan heraldry, the player level badge, compact combat timers, active-item indicators, chat arrow, exact mini-chat transparency and zoom-independent controls. This approval supersedes the initial parchment-background and simplified-top-icon draft; release status requires deployment verification.

- Broad medieval UI theme and readability corrections: `LIVE — ALL PUBLISHED CHANNELS`.
- Inner Castle Profile entry, current Stronghold/Citadel contrast, scalable Shop presentation, reworked Bag, Clan Heraldry v2, and latest map-touch guard: `LIVE — ALL PUBLISHED CHANNELS`.
- UI polish remains ongoing: `IN DEVELOPMENT`.

### Needs verification

- Formal contrast target, keyboard-navigation requirements, screen-reader scope, localization, minimum supported resolution, text-scaling behavior, and accessibility acceptance criteria.

## 17. Mobile Landscape & PC Requirements

### Confirmed requirements

- The game is landscape-oriented on mobile. Portrait gameplay is not a supported target requirement.
- A landscape-orientation prompt may block or redirect unsupported portrait play.
- PC/browser play is supported.
- PWA installation and launcher support are live where the browser/platform supports them.
- Installed game launches request fullscreen landscape. Mobile entry requests fullscreen and a landscape lock from the entry gesture where supported; declined or unavailable browser APIs must not block login, repeatedly reopen fullscreen after exit, or rotate the page with CSS. The portrait fallback offers a fullscreen/landscape action and manual rotation guidance. Existing installations from a different origin may require reinstalling from `https://playcrownlands.com/play/` to remove browser-owned out-of-scope chrome. Confirmed September 21, 2026; this enhancement requires deployment and physical-device verification before it is described as live.
- **September 22, 2026 revision:** Restore visible fullscreen entry and X exit controls. Use a standalone installed window and request DOM fullscreen from the entry gesture, retaining landscape orientation and the existing `/play/` identity and route. This supersedes manifest-owned fullscreen because browser-owned fullscreen has no game-controlled exit API. An older native fullscreen installation retains a visible help control until its browser applies the updated manifest; it must not advertise a working DOM exit when none is available. Unsupported or rejected requests leave gameplay usable.
- Public informational pages may remain portrait-responsive; the landscape-only rule applies to the game experience.

**Status:** `LIVE — ALL PUBLISHED CHANNELS` for the landscape/PC/PWA foundation.

### Superseded direction

- Earlier portrait Gear QA does not establish portrait gameplay support and is superseded by the landscape game requirement.

### Needs verification

- Supported browser/version matrix, minimum device performance, minimum viewport, tablet behavior, notch/safe-area requirements, input methods, memory budget, real-device regression suite, and offline/PWA limitations.

## 18. Art & Medieval Visual Direction

### Authority

The [Crownlands Art Bible](./CROWNLANDS_ART_BIBLE.md) is the detailed visual authority and is incorporated by reference. If this section and the Art Bible conflict, record the conflict and obtain an explicit design decision before changing either source.

### Confirmed direction

- Grounded 14th–15th century frontier-kingdom character.
- Rough stone, timber framing, limewash, thatch, worn iron, leather, rope, parchment, wax, and hammered metal.
- Earthy ochre, rust, charcoal, moss, faded blue, and burgundy palettes.
- Natural light, readable silhouettes, functional fortification, and lived-in construction.
- Avoid neon, glossy game-show surfaces, generic high-fantasy excess, interchangeable Gothic decoration, and unreadable texture.
- Regional and objective art should communicate gameplay role at practical map sizes.
- Region names and world language should be medieval-authentic and consistent with Crownlands.

**Status:** Established direction, with the current migrated visual foundation `LIVE — ALL PUBLISHED CHANNELS` and continuing polish `IN DEVELOPMENT`.

### Approved shared Gold and troop pickup artwork — September 17, 2026

- Keep the existing coin pouch, coins, cord and wax seal, and the existing helmet, banner, spears and sealed orders. Restyle the pair with sepia ink outlines, painted shading, muted earthy colors and transparent backgrounds to match the illustrated maps.
- Use the approved pair everywhere those shared raster images appear, including map pickups, reward feedback, Hero Level-Up, Daily Login, shop boosts and the rewards guide. Existing generic vector resource symbols remain separate assets.
- Preserve pickup click areas, collection rules, reward quantities and timing. Artwork approval authorizes integration; merge and deployment require separate authorization and verification. Approved sources and reference audit: [shared pickup artwork](./visual-qa/offline-earnings/art-notes.md).

### Approved Chat and reward ledgers — September 18, 2026

- Global/Clan Chat, Hero Level-Up, and Welcome Back use the approved parchment, burgundy and olive layouts on desktop and mobile landscape. Chat keeps its compact map preview, readable history, unread jump, channel controls and fixed composer. Hero rewards retain the level banner and exact reward totals; Welcome Back retains time away, exact production, city losses and inactivity notices, with a fixed Collect action and independently scrolling contents.
- These are presentation changes. Chat authorization, retention, cooldowns and moderation, Hero rewards, offline production and authoritative receipts remain unchanged. Collect acknowledges rewards already credited and does not award them again. Both reward screens use the approved shared Gold and troop artwork.
- **Status:** `LIVE — WEB` at verified build `fab92d3867bb1782a0a2c0c72cdb54d325fbbba8` from PR #311. Google translation was separately approved on September 18 and remains `IN DEVELOPMENT` until its backend and web release are verified; the sample phrase dictionary stays confined to the development draft.

### Needs verification

- Final art production pipeline, asset licensing register, source-file ownership, generation provenance, animation style guide, audio art direction, and approval criteria for new regional art.

## 19. Backend, Performance & Scalability

### Current verified foundation

- Crownlands is online-first and uses Firebase Authentication, Firestore, and callable Functions for shared gameplay authority. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- The audited release contract exposes 102 callable operations and the API contract hash recorded in FM-2. These are implementation snapshots, not permanent design requirements.
- Authoritative mutations must be validated on the server.
- Multi-step economic and batch operations should be atomic or idempotent so retrying cannot duplicate charges, rewards, or launches.
- The current world is connected across 20 web regions; scaling work must preserve route parity, state integrity, and acceptable crowded-map performance.

### Scalability direction

- Pending Core and dynamic region expansion are `IN DEVELOPMENT`.
- World expansion must mature together with connection rules, player placement, capacity controls, backend performance, and rollback safeguards.

### Needs verification

- Service-level objectives, concurrent-player targets, per-region capacity targets, query budgets, latency budgets, callable quotas, indexing strategy, observability, alerting, cost budgets, rate limits, degradation behavior, incident response, backup success monitoring, and demonstrated restore time.

## 20. Security / Anti-Exploit Requirements

### Confirmed requirements

- The server, not the client, determines authoritative resources, ownership, movement, combat, rewards, Gear, clan access, and protected actions.
- Authentication identity must be bound to every protected operation.
- Players may sign in with Google or email/password. New password accounts must verify their email before gameplay or kingdom creation; the client, callable entry points, and Firestore rules enforce that gate. Existing Google players may add a password for the same verified email after Google reauthentication, retaining their Firebase UID, kingdom, name, flag, and progression. The login offers separate Google and email entry buttons, with email sign-in, registration, and password recovery in a compact form. Email actions return to the canonical `/play/` address. Passwords require at least 12 characters, and email-enumeration protection remains enabled. Confirmed September 25, 2026. **Status:** `IN DEVELOPMENT`; requires coordinated Auth configuration, backend/rules, and web publication. See [email account release notes](email-password-auth.md).
- A client must not be able to alter Gear inventory, Box outcomes, equipment, upgrades, resource balances, or clan permissions through ordinary profile saves.
- Economic transactions, batch scouts, regroup actions, donations, purchases, claims, and rewarded-ad grants must resist replay, retry duplication, partial charging, and race conditions.
- One game session per account is active at a time. A successful new sign-in takes over and signs the previous device or tab out of gameplay. The server accepts the session and realm membership together; old login retries and background heartbeats must not take the account back. Cached snapshots, unsent writes, device-clock differences, and stopped listeners must not reject the winning login. Tabs sharing Firebase authentication must retire only the old game client, preserving authentication for the winning tab. **Status:** Confirmed September 7, 2026; the takeover correction is implemented with client and emulator coverage, pending release verification. See `docs/LOGIN_SESSION_TAKEOVER.md`.
- Release/backend parity must be checked for security-sensitive changes such as player flags and server rules.
- Sensitive anti-exploit details should be documented for developers without exposing actionable abuse instructions in player-facing material.

### Needs verification

- Formal threat model, App Check production status, device attestation, bot/automation controls, abuse rate limits, administrator permissions, audit-log retention, secret management, dependency scanning, vulnerability response, account recovery, sanctions, and data-deletion workflow.

## 21. Testing & QA Standards

### Existing foundation

- The current `origin/main` repository contains static and emulator-backed validators for the audited economy, scalable Shop, Camps, pickups, Daily Missions, Achievements, Common Gear, objective bonuses, King Power, leaderboards, and reset-gate behavior, in addition to broader combat, city, clan, rally, chat, security, release-artifact, and UI coverage. This is verified repository evidence, not player-facing LIVE status.
- Production artifacts are validated for file inventory, size, asset integrity, release metadata, and channel-specific path behavior.
- Balance-affecting changes must run the season-balance audit and relevant configuration-backed tests.
- Visual changes must be checked at supported desktop and landscape-mobile viewports.
- Server-authoritative changes require emulator or equivalent integration coverage, not client-only validation.

The August 24 implementation verification did not execute tests or builds because the task was strictly read-only and repository scripts could generate artifacts. Test presence and assertions were inspected; passing CI/runtime status remains **NEEDS VERIFICATION**.

### Confirmed targeted release validation policy

Confirmed by the user on September 21, 2026: ordinary changes test changed or added behavior and affected shared dependencies, not every feature in the game. This supersedes the earlier filename-based Fast/Standard/Full policy.

- Local `prepare-pr` and GitHub Actions use the same committed `validation-plan.json` against the complete `origin/main...HEAD` branch difference. Looking only at the last commit is prohibited.
- The plan identifies the exact base commit and covers every changed path with selected tests and reasons. Authors and reviewers inspect shared dependencies and the adequacy of assertions; automated file coverage does not prove semantic test coverage. Missing or stale coverage stops preparation rather than silently skipping checks.
- Known server/authority changes require relevant emulator suites. Balance changes retain their focused balance audits. Visual changes require checks of affected behavior at desktop and landscape-mobile sizes. A small edit in `game.js`, Functions or the Master Specification does not by itself require unrelated suites.
- Local preparation runs selected static tests, changed-file syntax/lint and applicable build/artifact or dependency checks. Selected emulator suites run in GitHub before merge and do not need to be duplicated locally. New or edited tests run, and workflow changes retain workflow-protection tests.
- The required GitHub checks remain `Static validation`, `Multiplayer emulator validation`, and `Validate`. If no emulator suite applies, that required job succeeds with an explicit explanation.
- Successful local checks can be reused only for identical tested inputs on a clean tree. CI checks run independently; disposable build artifacts are rebuilt when required. Changed implementation or base requires review of the plan and fresh affected validation.
- Full regression remains available through the nightly schedule, manual workflow runs, `pnpm run validation:full`, preparation's explicit full override and the `validation:full` PR label. Merging does not automatically repeat the full game suite. Authorized releases still verify the deployed build and smoke-test affected production behavior.

### Verified test gap

`tools/validate-king-power.js` hardcodes three troops per city progression point in its local calculation, while executable economy configuration uses ten. The validator can therefore disagree with live King Power replacement-power calculation and must be corrected with the implementation work. Reset emulator coverage also codifies clan reset and does not cover the confirmed Common Gear/clan persistence policy.

### Release acceptance

Before a status becomes LIVE:

1. Inspect current source and affected tests.
2. Run the proportionate static and integration suites.
3. Build and validate the production artifact.
4. Deploy only when authorized.
5. Verify the release manifest/build ID.
6. Smoke-test affected production behavior.
7. Update the Release Channel Matrix.

### Needs verification

- Acceptable flaky-test policy, production smoke ownership, supported real-device matrix, accessibility QA, load-test thresholds, rollback drills, backup restore drills, and defect severity/release-blocking policy.

## 22. Git, PR & Deployment Workflow

### Required workflow

1. Work defines and confirms intended behavior in this specification.
2. A Codex implementation prompt must instruct Codex to inspect the current repository before modifying anything.
3. Implementation occurs on an appropriately scoped branch.
4. Relevant automated and manual tests must pass.
5. The change is reviewed against this specification.
6. Commits and PRs record implementation evidence.
7. Merge does not imply deployment.
8. Deployment occurs only with explicit authorization.
9. Production build and smoke evidence determine LIVE status.
10. itch.io is updated to a verified production-compatible artifact as a separate channel action.
11. This specification and its deployment ledger are updated after verified results.

### Safety rules

- Preserve unrelated user changes and dirty worktrees.
- Do not reset, overwrite, or deploy without authorization.
- Do not infer Firebase schema, functions, files, APIs, or hosting architecture from an old prompt.
- A Codex completion report must be compared against intended design, tests, deployment evidence, remaining work, regressions, and specification impact.

### Current workflow issues

- The historical August 24 audit used a local working branch behind GitHub `main`; that audit inspected the exact remote Git object without mutating the user's worktree. The August 25 Rally release audit used an isolated, current worktree.
- The rebuilt local `dist`, canonical game production, and public itch.io iframe match build `fdf326a...`. The public itch upload is `#19037216`; the locally retained 279-file ZIP has SHA-256 `973137A3CC90023AF9340AFFC2D8B40FBA7A93B8DCE97F9FD0F9D1E9892A2C2D`.
- Exact deployment ownership of the primary-domain public pages and the target parity interval between web and itch.io are **NEEDS VERIFICATION**.

## 23. Current Development Status

Status verified through August 31, 2026.

| System | Status | Notes |
|---|---|---|
| Core city/economy/army/combat game | `LIVE — ALL PUBLISHED CHANNELS` | Web and the public itch.io iframe are exact client build `fdf326a...`. |
| 20-region connected world | `LIVE — ALL PUBLISHED CHANNELS` | Five regions retain placeholder numeric names. |
| Camps, Strongholds, Crown Citadel | `LIVE — ALL PUBLISHED CHANNELS` | Current contrast fixes are present on both channels. |
| Clans and ordinary Rally foundation | `LIVE — ALL PUBLISHED CHANNELS` | Web and itch.io now share the corrected lifecycle. |
| Ordinary Rally lifecycle correction | `LIVE — ALL PUBLISHED CHANNELS` | 2–20 participants, deterministic settlement and safe returns, plus automatic complete-army recall when the creator leaves, is removed, or changes clans. Holding Tower Rally rules remain separate and are implemented but not live. |
| Global and Clan Chat | `LIVE — ALL PUBLISHED CHANNELS` | Moderation expansion is unresolved. |
| Daily Login, Daily Missions, 40 Achievements | `LIVE — ALL PUBLISHED CHANNELS` | Reward calculations are verified in source; complete definitions and production runtime parity remain open. |
| Common Gear foundation and upgrades | `LIVE — ALL PUBLISHED CHANNELS` | Future rarities are planned. |
| Scalable Shop pricing | `LIVE — ALL PUBLISHED CHANNELS` | Present in both current channel builds. |
| Reworked/stacked Item Bag | `LIVE — ALL PUBLISHED CHANNELS` | Present in both current channel builds. |
| Clan Heraldry v2 | `LIVE — ALL PUBLISHED CHANNELS` | v1 compatibility remains; v2 presentation is available on both channels. |
| Hero reward curve, city XP model v2, and instant city upgrades | `LIVE — ALL PUBLISHED CHANNELS` | Published channels now use descendant build `fdf326a...`; authenticated production mutation smoke remains pending. |
| Hero level-up Gold 27-hour endgame ceiling | `IN DEVELOPMENT` | Levels 2-116 remain unchanged; Level 117 is the first reduced reward. Coordinated backend, web, and itch.io deployment is required before this balance is live. |
| Unified skill controls, free live refunds, free Reset Skills, and Skills readability update | `LIVE — ALL PUBLISHED CHANNELS` | Web and the public itch.io iframe now use exact client build `fdf326a...`; authenticated mutation smoke remains pending. |
| Session heartbeat timeout and lifecycle recovery | `LIVE — ALL PUBLISHED CHANNELS` | Web and itch.io bound an individual heartbeat response at 15 seconds and ignore late responses from stopped lifecycle generations. Static, all 33 emulator files, the 120-session realm admission case, and direct public asset checks passed; authenticated interrupted-connection recovery remains manual QA. |
| Holding Towers and Clan Treasury | `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT` | Current-Core-only implementation covers the four Towers, attributed garrisons, target-specific Rallies, scouting, walls, repairs, Veil, Treasury, reset/departure handling, security, and current-map reconciliation. It is not live. |
| Pending 5×5 Core | `DEPLOYED — SCHEDULED ACTIVATION` | Held production build `8d80b6a...` contains the complete fail-closed Core seed/readiness path; repository activation is scheduled for September 2 at 00:00 UTC. |
| Production reset/persistence enforcement | `IMPLEMENTED — PENDING SCHEDULED RESET VERIFICATION` | Explicit identity, clan, and Common Gear persistence is covered by emulator tests; a READY managed backup and pointer rollback path are verified. |
| Dynamic map expansion | `DEPLOYED — SCHEDULED ACTIVATION` | Held production build includes deterministic Layer 3+ growth and live client discovery; post-boundary production verification remains. |
| Seasons | `PLANNED` | Cadence and reward policy unresolved. |
| More Gear rarities | `IMPLEMENTED — PENDING RELEASE` | Five rarities, matching duplicates plus Gold; total production caps deferred. |
| Clan Wars / regional control / more world events | `PROPOSED` or roadmap-level `PLANNED` only | No authoritative detailed rules. |

## 24. Known Issues / Technical Debt

### Verified current issues

- The historical August 24 audit branch was behind GitHub `main`; the August 25 Rally release audit used an isolated branch containing current `origin/main`.
- The locally rebuilt `dist`, web production, and the public itch.io iframe represent exact build `fdf326a...`. The current itch artifact is upload `#19037216`; previous locally retained ZIPs remain historical artifacts.
- Deployment provenance, the generated release manifest, and the post-deploy inventory verify all 109 Node.js 22 Functions were refreshed from clean build `291e5657...` with shared Firebase source hash `322ab24b...`. `adjustSkillLevels` is active and the obsolete skill-state trigger is absent. Authenticated `getRealmInfo`, skill, and city mutations were not performed.
- The primary-domain `how-to-play.html` still documents superseded three-ruler Rally behavior even though corrected source is merged and published on the canonical game host. The public-site deployment owner and refresh path remain **NEEDS VERIFICATION**; no manual Netlify deployment was authorized in this audit.
- The legacy direct `https://playcrownlands.com/play/` route serves the game shell while root game assets on that host return 404. Normal public Play actions point to the working canonical `https://game.playcrownlands.com/play/` route.
- Web roadmap copy contains an internal 20-versus-15-region contradiction.
- The descriptive release ID remains dated August 2 despite newer builds.
- The itch.io Butler `html5` channel and latest-build API remain labeled `2026-08-30-city-list-off-map-ownership-3390c83c`, while the verified public iframe is web upload `#19037216` at build `fdf326a...`. This is release-metadata debt, not a playable-build mismatch.
- Five web regions use placeholder numeric names.
- The September 9 starting-troop decision replaces the earlier 200-troop initialization with 1,000 troops. Starting Gold remains 100; deployment verification of the troop increase is pending.
- Production Player Flag saving needs a current smoke test.
- Holding Towers/Clan Treasury are implemented on a synchronized feature branch but remain pending merge, authorized deployment, and authenticated production verification. Historical PR #159 remains archived and must not be merged.
- The latest verified managed Firestore backup is `READY`, and pointer rollback is implemented by retaining the previous realm generation. A full production restore has not been rehearsed during this release window.
- Authenticated browser smoke testing remains manual because the local in-app browser-control runtime was unavailable during the reset-arming audit.
- The King Power validator uses a hardcoded troop-production factor of 3 while executable economy configuration uses 10.
- The Codex implementation audit reported War Drums at 5%, but executable economy configuration sets 30%; 5% is only a fallback. The specification records 30% as the current repository fact.
- No automatic season-generation advance, final leaderboard lock/rewards, or historical leaderboard archive was found. Final-season leaderboard archival is now confirmed design with status `PLANNED`.

### Technical debt requiring current-source confirmation

- Main runtime concentration in large client files and accumulated style overrides.
- Potential baseline issues involving line endings and specific validators.
- Transient emulator timing/port failures reported during development.
- Duplicated or competing readability/contrast overrides.

These source-level items are **NEEDS VERIFICATION** against current `main` before remediation is planned.

## 25. Planned Features / Roadmap

### Confirmed active direction

- Complete review and validation of the clean synchronized Holding Tower implementation, then perform an explicitly authorized rollout with current-Core-only production verification. Current status: `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
- Prepare the pending 5×5 Core and safe reset path. Current status: `IN DEVELOPMENT`.
- Develop scalable outward map expansion. Current status: `IN DEVELOPMENT`.
- Define and deliver Seasons using the persistence policy in Section 15. Current status: `PLANNED`.
- Implement final-season locking and read-only archives for the Kingdom Top 100 and final Clan leaderboard. Current status: `PLANNED`.
- Expand Gear through five confirmed rarities using matching duplicates and Gold. Current status: `IMPLEMENTED — PENDING RELEASE`.
- Replace placeholder region identifiers with confirmed medieval-authentic names. Naming decision: `NEEDS VERIFICATION`.
- Maintain itch.io compatibility and restore channel parity after web releases. This is a release-policy requirement, not a gameplay feature.

### Roadmap concepts not yet authoritative

- Broader Clan Wars
- Regional-control scoring
- Additional scheduled or reactive world events
- Additional animation and sound systems
- Deeper objective history

These remain `PROPOSED` or roadmap-level `PLANNED` directions. Their detailed mechanics are not authoritative.

### Needs verification

- Priority order, milestones, owners, target dates, dependencies, release trains, and go/no-go gates.

## 26. Open Design Decisions

### Highest-priority unresolved design decisions

1. Final medieval-authentic names for Regions 16, 17, 19, 21, and 22.
2. Season length, reset schedule, notice period, end-of-season resolution, and rewards.
3. Leaderboard tie-breaking, eligibility, season rewards, finalization trigger, archive fields, and archive retention.
4. Formal monetization principles, rewarded-ad frequency/limits, and whether premium products or currency are permitted.
5. Chat moderation, player reporting, announcements, sanctions, and administrator policy.
6. Release the implemented rarity progression after validation; total production caps and exact capped offline accounting remain a separate design decision.
7. Final triggers and player-facing behavior for dynamic world expansion.
8. Whether roadmap concepts such as Clan Wars and regional control should become committed features.

### Highest-priority verification decisions

1. Verify through production runtime/deployment evidence that the new-player path applies the confirmed 1,000-troop grant and existing 100 Gold initialization after authorized release.
2. The maximum intended web/itch.io release lag and channel-parity service level.
3. Current production Player Flag save behavior.
4. Exact deployed Functions parity for King Power version 11, production/reward configuration, and reset logic.
5. Backup completion and proven restore readiness before a production reset.

---

# Appendix A — Consolidated Status Register

| Status | Major systems/features |
|---|---|
| `LIVE — ALL PUBLISHED CHANNELS` | 20-region world, core game, cities, economy, movement, combat, scouting, Camps, Strongholds, Citadel, clans, corrected ordinary Rally lifecycle, Global/Clan Chat, Daily Login, Daily Missions, 40 Achievements, Common Gear, Profile Inner Castle, Stronghold/Citadel contrast, scalable Shop, reworked/stacked Bag, Clan Heraldry v2, current Shop/map guards, Hero reward curve, city XP model v2, optimistic city upgrades, and the gold arrow Level action |
| `LIVE — ALL PUBLISHED CHANNELS` | Build `fdf326a...`: unified `− | cost | +` skill controls, free live refunds, free Reset Skills, signed optimistic adjustments, and updated Skills tab/card readability. The separately hosted primary-domain public pages remain outside this client statement. |
| `LIVE — ITCH.IO` | No feature is known to be uniquely newer on itch.io |
| `IMPLEMENTED BUT NOT LIVE` | Uniform two-minute pickup cadence and center-biased pickup placement |
| `IMPLEMENTED BUT NOT LIVE` | Armed 5×5 Core reset, clan/Common Gear persistence enforcement, deterministic dynamic map expansion pending the September 2 UTC boundary and post-reset verification, Holding Towers/Clan Treasury, and five-tier Gear progression pending merge and authorized deployment |
| `IN DEVELOPMENT` | Continuing UI/performance/onboarding work |
| `PLANNED` | Seasons, final-season Kingdom/Clan leaderboard archives, total production caps |
| `PROPOSED` | Detailed Clan Wars, regional-control scoring, unconfirmed world-event concepts, unconfirmed expanded sound/animation mechanics |
| `NEEDS VERIFICATION` | Exact production runtime parity for repository-verified starting resources/formulas/reset behavior, ranking policy, monetization policy, moderation, SLOs, security posture, device matrix, and channel parity target |

# Appendix B — Conflict and Superseded-Decision Register

| Topic | Earlier or conflicting source | Current ruling |
|---|---|---|
| Primary production authority | Web and itch.io could both be described broadly as published | Web is primary LIVE authority; itch.io is separately tracked and may lag |
| World size | Earlier itch artifact contained 15 regions while web contained 20 | Both published game clients contain the same 20-region world. Build `a561374b...` established the verified cross-channel baseline, and current build `fdf326a...` retains it on web and itch.io. |
| Starting resources | Historical 100 Gold/200 troops versus 500 Gold/50 troops | Confirmed September 9: 1,000 starting troops. Starting Gold remains 100 in the implementation. The troop increase requires merge and deployment verification; long-term Gold balance remains **NEEDS VERIFICATION**. |
| World structure | Single island, five islands, portals, disconnected or 100-city-map concepts | Superseded by connected regions and edge-route model |
| Achievement count | Earlier proposal of 50 | Superseded; current confirmed count is 40 |
| Season item persistence | Earlier broad statement that items persist | Superseded by explicit player identity, clan, and Common Gear allowlist; normal consumables do not persist |
| Bag stacking | Earlier limited-stacking discussion versus all-identical-item request | Both published clients group identical Bag items by quantity |
| Rally size | Ordinary Rallies require two members; Tower Rallies previously required five | Confirmed September 21: attacks on and capture of neutral or clan-owned Towers require three eligible contributors including the leader. Ordinary Rally minimum remains two. Pending merge and authorized deployment. |
| Mobile portrait | Earlier portrait Gear QA | Does not establish portrait game support; landscape is authoritative |
| Item pricing | Older fixed prices versus scalable pricing | Scalable formula is confirmed and `LIVE — ALL PUBLISHED CHANNELS` |
| Clan heraldry | v1 compatibility versus v2 presentation | v1 remains unchanged until deliberate v2 save; v2 is `LIVE — ALL PUBLISHED CHANNELS` |
| Ordinary Rally lifecycle deployment | Older published behavior could limit ordinary Rallies to three participants and lacked the creator-departure safety recall | Corrected 2–20-player lifecycle and creator-departure recall are `LIVE — ALL PUBLISHED CHANNELS`, beginning with verified cross-channel baseline build `a561374b...`. |
| Merge versus deployment | Completion reports sometimes implied live status | Merge never proves deployment; release evidence controls LIVE status |
| Common Gear reset persistence | Earlier reset initializer created an empty Gear state | Superseded by the explicit Common Gear persistence helper and reset-emulator coverage; production verification is scheduled with the reset |
| Clan reset persistence | Earlier reset path omitted clan identity and generation rollover | Superseded by transactional clan identity/roster/role migration with failure-safe and concurrency emulator coverage |
| War Drums production bonus | Codex audit summary said 5%; executable config says 30% while server fallback is 5% | Repository fact is 30% at `27105ae...`; exact production runtime parity remains **NEEDS VERIFICATION** |
| King Power replacement-power validator | Validator hardcodes three troops per progression point; executable config uses ten | Executable implementation uses ten; validator is stale technical debt |
| City-upgrade XP warnings | Earlier model required a preview and confirmation before rebuilt-level suppression | Superseded by silent suppression and direct replay-safe submission; XP progression remains authoritative but city-upgrade XP messaging is hidden |
| Season leaderboard history | Current rankings are generation-scoped and no final lock/archive exists | Active rankings reset; final Kingdom Top 100 and Clan leaderboard must persist as read-only archives. Implementation is `PLANNED`. |

# Appendix C — Evidence Register

| Source | Purpose | Audit note |
|---|---|---|
| [Canonical game release manifest](https://game.playcrownlands.com/release-manifest.js) | Deployed game build identity | Verified current build `fdf326a...`, contract `86fc7b17...`, server fingerprint `d69fb16e...`, client fingerprint `2a20d122...`, and 109 callables |
| [Live world](https://playcrownlands.com/world) | Current player-facing web world | Verified 20 regions; five placeholder names |
| [Game rules](https://playcrownlands.com/game-rules) | Current player-facing rules | Used for live rules baseline |
| [Roadmap](https://playcrownlands.com/roadmap) | Public direction and status | Planning evidence only; contains stale 15-region copy |
| [Updates](https://playcrownlands.com/updates) | Public release narrative | Used with release manifests, not alone |
| [itch.io](https://crownlands.itch.io/crownlands) | Secondary published channel | Public HTML5 iframe upload `#19037216`, exact source build `fdf326a...`, published August 31, 2026 at 00:15 UTC |
| [itch.io latest-build API](https://api.itch.io/wharf/latest?target=crownlands/crownlands&channel_name=html5) | Legacy Butler channel-version evidence | Still returns `2026-08-30-city-list-off-map-ownership-3390c83c`; it does not identify the current web-uploaded public iframe and must not be used alone as playable-build evidence |
| [GitHub commit `289a9d82f167...`](https://github.com/explocion200/CrownLands/commit/289a9d82f16739fac8d73376a5c4c85e08aeadc5) | Historical itch.io artifact source point | Superseded by exact current build `fdf326a...`; retained as the earlier subpath-fix baseline |
| [GitHub commit `27105ae76fbb...`](https://github.com/explocion200/CrownLands/commit/27105ae76fbb329559151030ebbac652a9ee8119) | August 24 broad implementation audit source point | Historical audit baseline; no longer current web/main |
| August 24 read-only implementation verification | Exact `origin/main` source audit of initialization, economy, King Power, objectives, Shop, rewards, reset persistence, rankings, and version gates | No checkout, code/config/data change, test run, build, commit, push, merge, deployment, or production mutation; deployed Functions parity remains unverified |
| [GitHub PR #171](https://github.com/explocion200/CrownLands/pull/171) | Ordinary Rally lifecycle correction | Merged August 25, 2026 as `1e5cdad...`; records 2–20-player lifecycle, deterministic settlement, safe returns, and creator-departure recall |
| [Rally merge release-gate run](https://github.com/explocion200/CrownLands/actions/runs/32844321201) | Static and multiplayer Rally validation | Passed all three jobs, including the full multiplayer emulator gate |
| [GitHub commit `1e5cdad50ba5...`](https://github.com/explocion200/CrownLands/commit/1e5cdad50ba52878b504243cd9edf4ac8ec4a894) | Exact Rally deployment baseline | Functions, Firestore rules/indexes, and Netlify web artifact deployed and smoke-tested August 25, 2026 |
| [Netlify Rally deploy metadata](https://api.netlify.com/api/v1/deploys/6a8d830f79ae0d9195aa50b1) | Exact Rally web publication evidence | Ready production deploy of `1e5cdad...`, published at 11:57:35 UTC |
| [GitHub PR #180](https://github.com/explocion200/CrownLands/pull/180) | Rally ownership-sync stability and player-guide correction | Merged August 25, 2026 as `1a0efbcb...`; clears stale Rally ownership during identity sync and aligns both guides with the shipped Rally rules |
| [Rally stability release-gate run](https://github.com/explocion200/CrownLands/actions/runs/32868326745) | Post-merge validation of PR #180 | Static, all 26 multiplayer emulator files, and final validation passed |
| [GitHub commit `054aac0aadfc...`](https://github.com/explocion200/CrownLands/commit/054aac0aadfc353c762fb444102fd62af76153af) | Audited application and Functions source point | Descends from both Rally merges and is the exact source used for the verified Functions refresh |
| [GitHub PR #181](https://github.com/explocion200/CrownLands/pull/181) | Verified deployment-ledger update | Merged August 25, 2026 as docs-only descendant `09328e60...`; its PR and post-merge release gates passed |
| [Current-main release-gate run](https://github.com/explocion200/CrownLands/actions/runs/32875771534) | Current descendant-build validation | Static, all 26 multiplayer emulator files, and final validation jobs passed for exact build `09328e60...` |
| [PR #199](https://github.com/explocion200/CrownLands/pull/199) | City XP model v2, optimistic city upgrades, and gold arrow Level action | Merged August 27, 2026 as `a561374b...`; Static validation, all 33 multiplayer emulator files, and Validate passed |
| [PR #201](https://github.com/explocion200/CrownLands/pull/201) | Unified skill controls, live refunds, free Reset Skills, and Skills readability | Merged August 27, 2026 as `291e5657...`; Static validation, all 33 multiplayer emulator files, and Validate passed |
| [PR #220](https://github.com/explocion200/CrownLands/pull/220) | Session heartbeat timeout and lifecycle-safe late-response recovery | Merged August 30, 2026 as `fdf326a...`; Static validation, all 33 multiplayer emulator files, Validate, and the 120-session realm-admission case passed |
| [Post-merge `main` release-gate run](https://github.com/explocion200/CrownLands/actions/runs/33343482121) | Exact merged heartbeat-build validation | Static validation, all 33 multiplayer emulator files, and Validate passed for build `fdf326a...` |
| [Current canonical game Netlify deploy](https://api.netlify.com/api/v1/deploys/6a94c517ebd65700085b9ad3) | Current game production evidence | Ready production deploy of exact build `fdf326a...`, published August 31, 2026 at 00:05:05 UTC; canonical manifest, index, service worker, heartbeat generation counter, and stale-response guard passed direct HTTP checks on both canonical hostnames |
| [Primary-domain beginner guide](https://playcrownlands.com/how-to-play.html) | Separately published player-facing documentation | Live response still contains the superseded three-ruler, Reward Camp, shield-removal, inbound-launch, and leader-speed rules; refresh ownership and deployment remain **NEEDS VERIFICATION** |
| August 27 post-deploy Firebase Functions listing | Current backend deployment metadata | Authorized full refresh from clean build `291e5657...`; 109 active Node.js 22 Functions share source hash `322ab24b...`, with source generations spanning 16:08:33–16:15:57 UTC. `adjustSkillLevels` is active, the obsolete skill-state trigger is absent, and the 29-callable access audit and production rules parity check passed; authenticated `getRealmInfo`, skill, and city mutations were not performed. |
| [GitHub PR #159](https://github.com/explocion200/CrownLands/pull/159) | Historical Holding Towers/Clan Treasury implementation and design evidence | Archived, unmerged, not live, and not a merge candidate; the current synchronized implementation supersedes it while preserving the confirmed Section 8 design |
| `README.md` | Historical mechanics and implementation documentation | Detailed but stale on world/build state |
| `docs/CROWNLANDS_ART_BIBLE.md` | Visual direction | Incorporated by reference |
| `docs/CROWNLANDS_VISUAL_MIGRATION.md` | Visual migration history | Historical implementation evidence |
| Local `dist`, `Crownlands-current-build/crownlands-html5-fdf326a9462f.zip`, and public itch.io upload `#19037216` | itch.io artifact inspection | Production validator passed 279 files and 57 itch-relative index resources; the public iframe's index, manifest, service worker, heartbeat generation counter, and stale-response guard matched build `fdf326a...`; ZIP SHA-256 `973137A3CC90023AF9340AFFC2D8B40FBA7A93B8DCE97F9FD0F9D1E9892A2C2D` |
| Crownlands Work conversations and Codex completion reports | Design and implementation history | Decisions used only when confirmed; reports do not prove deployment |

# Appendix D — Change Log

## v1.37 — September 6, 2026

- Removed Camp attacks and capture from beginner guidance at the user's direction; new rulers do not have the troops for these objectives.
- Added contextual ruler-name and kingdom-flag editing steps and arrows at visible, usable controls. Guidance keeps action submission and save confirmation under the player's control.

## v1.36 — September 5, 2026

- Confirmed short, optional contextual guidance for a player's first upgrade, scout, attack, and Camp capture.
- Added dismissal and replay through First steps & help, with browser-local account/realm isolation and configuration-backed copy. Tips do not submit or gate gameplay actions.

## v1.35 — September 5, 2026

- Confirmed durable scout/army confirmation recovery without automatic resubmission on reconnect, stale-session isolation, and retrying failed foreground reads.
- Recorded read-only route previews, retained in-flight preview results, and request-phase diagnostics without changing gameplay balance or authority.
- Added controlled browser/emulator evidence and the explicit physical-phone testing exclusion. Production release verification remains a separate release step.

## v1.34 — September 4, 2026

- Replaced the legacy fresh-neutral 24-hour/two-event/seven-day pair block with Anti-Handoff Policy v2: a 20-minute neutral lineage window and seven successful directed handoffs per rolling 24 hours.
- Required warnings to both players at counts 4 and 7, arrival-time authority, atomic launch/arrival enforcement, replay-safe claim IDs, safe troop/item/shield cancellation behavior, Holding Tower origin coverage, bounded counter cleanup, and an auditable fail-closed legacy cleanup.
- Preserved the independent 30-day same-installation protection and all player progress.

## v1.33 — September 4, 2026

- Confirmed the complete 24-map Layer 1 first ring as the current monthly-realm target and required a create-only, version-checked rollout that verifies all maps before activation and never overwrites player cities.
- Removed the 30-minute troop-travel maximum while preserving the existing formula, bonuses, minimums, server-generated routes, and server-authoritative arrival validation.
- Reduced future city-upgrade Hero XP from 1% to 0.5% of the matching Hero XP requirement under the existing floor/minimum rule without changing stored player XP.
- Reduced regular Gold and troop world pickups from one raw-production hour to 30 minutes, reduced their minimums from 250 to 125, and increased independent per-type UTC-day caps from 25 to 30 with an aggregate cap of 60.

## v1.32 — September 4, 2026

- Replaced the proposed blanket Core Main City exclusion with the exact confirmed nine-map restriction: Stoneward, Greybanner Hold, Lionwatch, Swiftgate, Crown Citadel, Aurum Keep, Oakwatch, Ironwatch, and Roseguard.
- Kept every other Core and New Lands map eligible under existing Main City rules while preserving the separate rule that all 25 Core maps remain new-player spawn-ineligible.
- Required authoritative-path server enforcement, safe canonical repair/recovery, complete omission of the restricted-map City Info action, and red map-switcher trim only on Greybanner Hold, Crown Citadel, Swiftgate, Ironwatch, and Aurum Keep.
- Classified the implementation as `IMPLEMENTED BUT NOT LIVE`; no production repair, deployment, or published-channel verification occurred as part of this decision.

## v1.31 — September 2, 2026

- Confirmed one fail-closed risk classifier shared by local `prepare-pr` and GitHub Actions over the complete branch difference from `origin/main`.
- Defined Fast, Standard, and Full validation requirements, with critical, mixed, unknown, reset, backend, release-contract, and production-data-affecting work always selecting Full.
- Preserved the three required GitHub check names, added upgrade-only Full overrides and explicit safe emulator-skip evidence, and required a nightly Full validation run.

## v1.30 — September 1, 2026

- Armed the one shared `realm-2026-09` Core-expansion reset for September 2, 2026 at 00:00 UTC while keeping the legacy world active before the boundary.
- Recorded successful held deployment of build `8d80b6a...`, mirrored client/server release identity, and fail-closed seeding of all 25 Core maps plus the first New Lands map before pointer publication.
- Reconciled stale reset-audit text with the current explicit Common Gear persistence helper and transactional clan rollover implementation and emulator coverage.
- Verified the daily managed Firestore backup schedule, 35-day retention, and READY August 31 snapshot; retained the previous generation for pointer rollback.

## v1.29 — September 1, 2026

- Implemented deterministic New Lands generation beyond the two prepared outer layers, preserving north-center layer starts, clockwise allocation, cardinal-only roads, and unique medieval-authentic map names.
- Required each threshold transition to prepare and verify the next two maps before exposing them, with queued concurrent triggers, bounded idempotency receipts, scheduled retry, and live client catalog refresh.
- Added a fail-closed reset-readiness gate that seeds and verifies the 25-map Core plus the first New Lands map before publishing the scheduled realm pointer.
- Removed the shared assignment counter bottleneck so simultaneous players enter the one canonical shared realm without contending on a global sequence document.
- Defined the supported automatic-expansion envelope as 4,095 New Lands maps and 81,900 threshold-managed starting placements; this is an implementation safety bound, not a 50-player realm split.

## v1.28 — August 31, 2026

- Confirmed that every player in a monthly generation belongs to one shared interactive realm; the previous 50-player split and automatic creation of additional player shards are superseded.
- Retained `shard_0001` only as the canonical internal generation partition so query, rule, and archived-generation isolation remain intact.
- Limited server-authoritative starting placement to `region_11` through `region_15`, whose current layouts provide 363 neutral regular cities, and required explicit exhaustion instead of creating another realm.
- Classified the shared-realm implementation as `IN DEVELOPMENT` pending full release validation, merge, coordinated deployment, and post-reset verification.

## v1.27 — August 30, 2026

- Recorded PR #220 and merged build `fdf326a...` as the session-heartbeat recovery baseline, retaining the 15-second response bound and invalidating stopped lifecycle generations before late responses can mutate state or clear replacement in-flight locks.
- Recorded Netlify deploy `6a94c517ebd65700085b9ad3`, published August 31 at 00:05:05 UTC, and public itch.io iframe upload `#19037216`, published at 00:15 UTC, as exact cross-channel build `fdf326a...`.
- Verified the canonical and itch.io public manifests, indexes, service workers, heartbeat generation counters, and stale-response guards; the local itch.io artifact passed 279-file validation and 57 relative-resource checks with ZIP SHA-256 `973137A3CC90023AF9340AFFC2D8B40FBA7A93B8DCE97F9FD0F9D1E9892A2C2D`.
- Promoted bounded heartbeat response handling, lifecycle-safe recovery, and the unified Skills controls to `LIVE — ALL PUBLISHED CHANNELS`.
- Recorded the stale legacy Butler `html5` latest-build metadata as release-metadata debt and retained authenticated login, interrupted-connection recovery, and second-tab replacement as manual QA because no approved production QA account was used.

## v1.26 — August 30, 2026

- Confirmed that the City List must represent the complete owner-scoped roster across the current world, generation, and realm shard, independent of the displayed map, with canonical region identity taken from each city document's island path.
- Required roster failures or reconciliation mismatches to remain explicitly incomplete and retryable instead of silently replacing the cache as complete.
- Extended City List position stability from pending queues to the full open-modal session, with deterministic append-only discovery, relative-order-preserving removals, explicit-sort resets, and fresh ordering on reopen.
- Classified the City List reliability correction as `IN DEVELOPMENT` pending validation, merge, and coordinated publication; no deployment status changed.

## v1.25 — August 30, 2026

- Confirmed a 27-hour raw-production ceiling for Hero level-up Gold from Level 101 onward while retaining the existing Gold floor and upgrade-relief limits.
- Recorded Level 117 as the first reduced payout under the current city-production curve, 17,249,182,092 Gold at Level 150, and 228,530,487,042 cumulative Gold through Level 150.
- Documented the complete standardized Gold reward formula and corrected the Hero troop-reward production scalar to the confirmed 10.3 value.
- Required the season audit to floor the authoritative reference upgrade cost and apply the ten-Gold minimum before calculating its reward share.

## v1.24 — August 29, 2026

- Confirmed adjacent undispatched `+1` and `+5` city inputs compact into exact same-city batches of up to 25 levels while preserving global input order, immediate projections, immutable active request IDs, and standalone authoritative `MAX` requests.
- Limited projected City List and map presentation to affected cities and one animation-frame update, with one confirmation sequence per settled batch.
- Required queue lifecycle cleanup and recovery to remain independent from presentation failures, and required unrelated city actions to wait for authoritative synchronization rather than cascade after an offline rejection.
- Classified the queue-stability correction as `IN DEVELOPMENT` pending validation, merge, and coordinated web and itch.io publication.

## v1.23 — August 28, 2026

- Confirmed a uniform two-minute pickup cadence for the first pickup and every successful post-collection respawn.
- Preserved Gold/troop alternation, the one-active-pickup limit, 20-minute expiration, and five-second failed-placement retry.
- Confirmed rejected or failed claims preserve the active pickup and its existing deadline, while legacy pending waits longer than two minutes normalize to the new maximum when synchronized.
- Classified the cadence as `IN DEVELOPMENT` pending validation, merge, and coordinated backend, web, and itch.io deployment.

## v1.22 — August 28, 2026

- Confirmed regular-city base Gold production at 285 per hour at Level 1, 11.55% unit growth through Level 100, and 7.9% Gold growth per level afterward.
- Preserved the upgrade target-hour curve, so Gold production and nominal upgrade costs change together without changing the intended one-city production-hour pacing.
- Re-anchored the Gold-cost-linked wall exponent to `0.22881653173769995`, preserving the exact 6,200,000 Level 150 wall and the existing post-Level-150 troop-production continuation.
- Classified the curve as `IN DEVELOPMENT` pending validation, merge, and coordinated backend, web, and itch.io deployment.

## v1.21 — August 27, 2026

- Confirmed direct replay-safe city-upgrade submission with synchronous projected level and Gold, targeted City List row patching, and a subtle nonblocking syncing state.
- Confirmed map-independent City List upgrades keyed by region and city, with the city document's island path authoritative over stale stored region metadata.
- Removed all player-facing city-upgrade XP estimates, warnings, logs, and toast text while retaining authoritative XP awards, seasonal high-watermarks, silent rebuild suppression, and compatibility receipts.
- Retained the preview callable and acknowledgement fields for older clients, plus a silent current-client retry against an older warning-enforcing backend. Classified the refinement as `IN DEVELOPMENT` pending merge and coordinated backend, web, and itch.io deployment.

## v1.20 — August 27, 2026

- Confirmed a 3% regular-city troop-production increase to `floor(city progression value × 10.3)` for the next reset.
- Confirmed the staged regular-city wall curve through Level 150, including its exact anchors, early 3× ceiling, Gold-cost-linked Level 101-150 gains, and unlimited post-150 production-ratio continuation.
- Preserved the current published linear wall rule as LIVE deployment history and classified the replacement as IN DEVELOPMENT pending merge and coordinated deployment.
- Preserved the existing Level 150 apex siege and replacement-time guardrails.

## v1.19 — August 27, 2026

- Recorded PR #201 web production at build `291e5657...`, Netlify deploy `6a90631243ff84feec4291b2`, and 109 active Functions sharing source hash `322ab24b...`.
- Verified `adjustSkillLevels` is active, the obsolete skill-state trigger is absent, Firestore rules and indexes are current, and the live manifest and core assets match the deployed build.
- Promoted unified skill controls, free live refunds, free Reset Skills, signed optimistic adjustments, and the Skills readability update to `LIVE — WEB`.
- Recorded itch.io HTML5 build `#1920417` at `a561374b...` as one client build behind web while retaining compatibility with the current backend.

## v1.18 — August 27, 2026

- Recorded exact web, Firebase, and itch.io deployment parity at build `a561374b...`, including Netlify deploy `6a9036cdeae2b200087f6a99`, 109 active Functions, and itch.io HTML5 build `#1920417`.
- Verified the published itch.io artifact as an exact 279-file byte match, confirmed all 57 relative resource paths, loaded the public embed without console or asset errors, and recorded the local archive hash.
- Promoted the 20-region client, corrected ordinary Rally lifecycle, current Shop/Bag/Heraldry presentation, Hero reward curve, city XP model v2, optimistic city upgrades, and gold arrow Level action to `LIVE — ALL PUBLISHED CHANNELS`.
- Retained legacy city-upgrade requests because authenticated request-ID-backed adoption and production city mutation remain manual verification steps.
- Confirmed free, exact weighted live-skill refunds and a free Reset Skills clear-all action that neither changes Gold nor consumes stored legacy credits.
- Confirmed replay-safe signed skill adjustments, ordered optimistic projections, net-zero coalescing, authoritative rollback, and active-preset clearing for every live adjustment.
- Standardized Current Build and preset drafts on compact `− | cost | +` controls, removed repeated final-tier explanatory text, and fixed applied, viewed, inactive, locked, and combined tab colors in the final palette layer.

## v1.17 — August 27, 2026

- Confirmed city-upgrade XP model version 2 at 1% of the matching Hero XP requirement with no daily allowance at any Hero level.
- Retained seasonal high-watermarks, zero-XP legacy requests, replay receipts, normal Hero rewards, and neutral cap receipt fields while ending daily allowance reads and writes.
- Confirmed ordered optimistic city-upgrade actions with immediate projected Gold and levels, exact `+5`, projected `MAX`, dispatch-time XP previews, same-city rollback, stable pending rows, and authoritative cache reconciliation.
- Confirmed a dedicated gold arrow-up treatment only for the selected-city map Level action while City Info and City List retain `+1`, `+5`, and `MAX`.

## v1.16 — August 26, 2026

- Confirmed Current Build as the default live skill editor and unlocked presets as isolated named drafts with weighted `+`/`−` controls.
- Required explicit free preset saving to preserve the live build, Gold, and active identity; only the existing paid Apply action may activate or switch a preset.
- Confirmed zero-point initialization for empty drafts, default preset-name support, dirty-exit Save/Discard/Cancel choices, and an Active · Apply changes state for saved edits to the active preset.

## v1.15 — August 25, 2026

- Confirmed one-point skill costs before each skill's final five levels and two-point costs for every final-tier level.
- Added one replay-safe Reset Skills migration credit for existing rulers while preventing fresh profiles from receiving a migration credit.
- Required client, server, preset, and queued-spend accounting to use the same weighted skill-point ledger.
- Confirmed a three-minute first pickup, one-minute post-collection respawns, preserved state after rejected claims, and center-biased terrain-safe placement.

## v1.14 — August 25, 2026

- Corrected Common Gear upgrades to consume both same-level input identities, create one next-level identity, transfer equipment state, and settle retries idempotently.

## v1.13 — August 25, 2026

- Confirmed the temporary request-ID-free city-upgrade compatibility window for coordinated backend, web, and itch.io rollout.
- Required legacy upgrades to award zero Hero XP while advancing the seasonal city high-watermark through every completed level.
- Added the server-controlled legacy shutdown setting, stable update-required rejection, and phased deployment order.

## v1.12 — August 25, 2026

- Confirmed the stronger post-Level-50 Hero troop-reward curve, including the 108-hour maximum that first binds at Level 235.
- Confirmed that Hero level-up troops use standardized reference production at the new Hero level and never use the player's actual city or kingdom production.
- Retained authoritative one-time credit to the canonical Main City and classified the balance update as `IN DEVELOPMENT` pending merge, deployment, and channel verification.

## v1.11 — August 25, 2026

- Confirmed fixed Hero XP for each regular-city level upgraded, based on 5% of the matching Hero XP requirement.
- Confirmed seasonal per-player, per-region, per-city high-watermarks with no retroactive or rebuild farming awards.
- Confirmed uncapped city-upgrade XP below Hero Level 50, a linear one-to-two level-equivalent daily allowance through Level 100, and a two-equivalent allowance thereafter.
- Confirmed UTC cap freezing, exact successive-level calculations, discarded excess XP, pre-upgrade suppression warnings, normal Hero-level rewards, and Gold-affordability ordering.
- Required the authoritative upgrade to reject unacknowledged or increased XP suppression caused by preview-to-commit state changes.
- Classified the feature as `IN DEVELOPMENT` pending merge, deployment, and channel verification.

## v1.10 — August 25, 2026

- Distinguished the primary-domain public pages from the separately published canonical game application at `game.playcrownlands.com`.
- Recorded canonical game build `09328e60...`, Netlify deploy `6a8dcb383450a500086cedcd`, and successful post-merge release gate `32875771534` while retaining exact Functions source provenance at `054aac0...`.
- Corrected the earlier smoke conclusion: the beginner-guide source and canonical game-host copy contain the current Rally rules, but the primary-domain copy still exposes superseded behavior and requires a separate deployment path.
- Recorded the broken legacy direct `playcrownlands.com/play/` asset route while confirming that public Play actions use the working canonical game host.
- Kept authenticated `getRealmInfo`, primary public-site deployment ownership, and itch.io Rally parity as **NEEDS VERIFICATION**.

## v1.9 — August 25, 2026

- Updated the primary web snapshot to exact build `054aac0...`, Netlify deploy `6a8dbe456280b500084541ab`, current release-gate run `32870265000`, and manifest fingerprints `d90184eb...` server and `9bdafbd3...` client.
- Recorded PR #180's stale Rally-ownership identity-sync correction and matching guide fixes, merged as `1a0efbcb...`, plus its green release gate.
- Recorded the authorized refresh of all 102 Node.js 22 Functions from clean build `054aac0...`, shared Firebase source hash `0fc34326...`, source-generation interval, 29-callable access audit, and production rules parity check. Firestore rules and indexes were unchanged and were not redeployed.
- Preserved the authenticated `getRealmInfo` runtime response as **NEEDS VERIFICATION** because no pre-existing safe signed-in player session was available.
- Left itch.io unchanged and unverified for the corrected Rally lifecycle.

## v1.8 — August 25, 2026

- Updated the primary web snapshot to current build `998ebbd...` and recorded its deployment time, Netlify deploy ID, contract, source fingerprints, callable count, current repository commit, and smoke evidence.
- Added the exact `1e5cdad...` Rally release baseline, PR #171, green release-gate run, Functions/Firestore deployment evidence, Netlify publication, and current descendant-build evidence.
- Recorded automatic complete-army Rally recall when the creator leaves, is removed, or changes clans; confirmed that it consumes no Recall Horn, records a specific reason, and does not recall another creator's Rally for a non-creator departure.
- Reclassified the ordinary Rally lifecycle correction from `IN DEVELOPMENT` to `LIVE — WEB` without changing the all-channel status of the older Rally foundation.
- Preserved the five-member Holding Tower minimum as a separate target-specific, not-live rule.
- Recorded that itch.io was not republished and that the exact embedded build ID of the latest Functions deployment still requires authenticated runtime verification.

## v1.7 — August 24, 2026

- Confirmed persistence for clan ID, name, tag, heraldry, member roster, and each member’s Leader/Officer/Member role.
- Confirmed seasonal reset of Clan Treasury balance/ledger, seasonal statistics, weekly-goal progress, rallies, reinforcements, donations/gifts activity, and world-objective ownership.
- Expanded the documented implementation conflict to include clan presentation, roster, and roles.
- Removed clan-role persistence from unresolved season decisions.

## v1.6 — August 24, 2026

- Replaced the vague player-customization persistence entry with an exact allowlist.
- Confirmed persistence for player name, complete player flag design, account creation date, and notification preferences.
- Classified authentication and active-session carry-forward as technical account state rather than seasonal progression.
- Recorded that the inspected current reset implementation matches the confirmed player-identity persistence set.
- Removed player-identity field scope from Open Design Decisions.

## v1.5 — August 24, 2026

- Confirmed that active Kingdom and Clan leaderboards reset each season.
- Confirmed that the final Kingdom Top 100 and final Clan leaderboard are locked and preserved as read-only historical records.
- Added final-season leaderboard archives to the persistence allowlist without treating them as active progression.
- Recorded final leaderboard locking and archival as `PLANNED` because no current implementation was found.
- Removed the foundational leaderboard-history question from Open Design Decisions while retaining finalization, tie, field, retention, eligibility, and reward details as unresolved.

## v1.4 — August 24, 2026

- Confirmed that Achievement progress, completed/claimed state, unclaimed rewards, and completion history fully reset each season.
- Confirmed that no Achievement completion ledger persists as permanent progression or prestige history.
- Recorded that the inspected generation/month-scoped implementation matches the full-reset design.
- Removed Achievement persistence from Open Design Decisions.

## v1.3 — August 24, 2026

- Confirmed that Hero level, Hero XP, unspent skill points, acquired skill upgrades, and saved skill presets reset each season.
- Distinguished seasonal Hero progression from permanent Common Gear progression.
- Recorded that the inspected current reset implementation matches this Hero-reset rule.
- Removed Hero progression persistence from Open Design Decisions.

## v1.2 — August 24, 2026

- Confirmed that unopened Common Gear Boxes persist across seasons/resets as part of permanent Gear progression.
- Added unopened Common Gear Boxes to the explicit season-persistence allowlist.
- Reclassified the current reset-to-zero behavior for unopened Gear Boxes as an implementation conflict.
- Removed unopened Gear Box persistence from Open Design Decisions and retained production enforcement as `IN DEVELOPMENT`.

## v1.1 — August 24, 2026

- Recorded the read-only implementation verification against exact `origin/main` commit `27105ae76fbb...`.
- Verified repository initialization at 100 Gold, 200 troops, and one Level 1 Main City while retaining production-runtime verification as an open gate.
- Added exact repository formulas for Gold production, troop production, city-level scaling, objective bonuses, scalable Shop pricing, Camps, pickups, Daily Missions, Achievements, and King Power.
- Recorded current leaderboard generation/versioning behavior and missing season-finalization systems.
- Documented that current reset code preserves flags/names and resets normal Bag consumables but conflicts with confirmed Common Gear and clan persistence policy.
- Recorded that unopened Gear Boxes currently reset while their intended persistence remains unresolved.
- Corrected the audit’s War Drums value: executable configuration is 30%, while 5% is only a fallback.
- Added the stale King Power validator and reset-emulator expectations to technical debt.
- Preserved all LIVE statuses because repository inspection alone did not verify a new deployment.

## v1.0 — August 24, 2026

- Initial authoritative Crownlands development specification created.
- Established web production as primary LIVE authority.
- Added separate itch.io release-channel tracking.
- Established explicit implementation/deployment status model.
- Recorded confirmed season-persistence design policy.
- Preserved unresolved starting-resource conflict for technical verification.

---

# Ongoing Change-Management Procedure

When a Crownlands design decision is explicitly confirmed:

1. Identify every affected section and appendix entry.
2. Check for conflicts with confirmed rules.
3. Update intended behavior independently from implementation and deployment status.
4. Preserve useful superseded history.
5. Never mark the change LIVE without verified channel deployment.
6. Update the Release Channel Matrix if channel behavior changed.
7. Add a dated Change Log entry.

When a Codex completion report is returned:

1. Compare completed work with this specification.
2. Identify what matches, remains incomplete, or diverges.
3. Review tests, regressions, security, performance, and channel compatibility.
4. Keep implementation status separate from LIVE deployment status.
5. Recommend the next scoped Codex prompt.
6. Update this document only when design, verified implementation status, or verified deployment status changed.
