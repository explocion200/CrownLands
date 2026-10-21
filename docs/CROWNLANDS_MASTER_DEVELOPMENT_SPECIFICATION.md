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

### Confirmed local publication direction — October 15, 2026

The owner requested automatic publication of validated GitHub main-branch merges
to the Crownlands computer. The target is local hosting of the whole game,
retaining external Google Cloud uptime monitoring. During migration the local
publisher may automatically activate compatible static game packages, while
holding changes that require an uninstalled backend. This decision authorizes
the publication workflow; it is not evidence that the backend migration or the
publisher installation is complete. See [the publication runbook](AUTOMATIC_LOCAL_DEPLOYMENT.md).

### Confirmed local backup schedule — October 18, 2026

The owner requested one scheduled encrypted server backup 24 hours before each
new monthly season, replacing daily local-server backups. Seasons start at
00:00 UTC on the first; backups run at 00:00 UTC on the last day of the previous
month. Ordinary updates do not trigger extra backups or full restore drills;
additional manual backups require a separate owner request. Existing encrypted
local/cloud copies and retention remain unchanged. Failed or missed seasonal
backups must still alert, with freshness measured against the seasonal deadline
rather than a daily threshold. Recovery can lose progress since the previous
copy, potentially most of a season. See [the backup runbook](LOCAL_BACKUPS.md)
for timing, missed-run behavior and installation verification. This decision is
not evidence that the host schedule has been installed.

### Confirmed installed-game launch behavior — September 20, 2026

- Opening an installed Crownlands app must lead to the game at `/play/`, never leave the player on the public homepage. Existing homepage shortcuts need a standalone/iOS launch redirect; ordinary browser visits to `/` retain the homepage.
- Keep the manifest identity and launch path `/play/`. Serve the manifest, game resources and active game service worker from `playcrownlands.com`; the website must no longer retire that worker. Preserve notification query parameters and fragments during entry redirects.
- Old game-host entry links lead to the primary domain. Browser-managed install identities and authentication storage are origin-bound: old subdomain installations may require reinstalling from the primary domain and signing in again. Do not describe redirects as a silent transfer of the installed app or session.
- Confirmed October 18, 2026: the home server redirects entry pages on `game.playcrownlands.com`, including its root and old game-entry aliases, to `https://playcrownlands.com/play/`, preserving query parameters and browser fragments. Compatibility asset/cache requests remain available for existing installations and publication verification. The primary-domain homepage remains the public website.
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

### Current verified web backend — Local production transfer

The owner-authorized transfer completed October 16, 2026 at 07:09 UTC. `playcrownlands.com/play/` now uses the computer's PostgreSQL database, account service, game APIs and background services. The verified client is `72c325f0be954b7053e685d15e70b80606a23e51`, backend `postgres-local`. Existing gameplay and the current `main-realm-2026-10 / realm-2026-10 / shard_0001` are preserved.

All 918,090 source documents and 318 accounts were copied and verified. Production Google sign-in, the owner's 43 cities, Inner Castle artwork and refresh passed; the owner also confirmed a normal phone gameplay change remained saved after refresh. Encrypted off-site backup and full database restore checks passed. Google sign-in, Translation, Resend, Stripe, external uptime monitoring and encrypted off-site storage remain external services. Firebase game authority is fenced and its historical data retained; local writes must be reconciled before any authority reversal.

The worker catch-up and transaction-contention repair `121bca612622ac1698de96aa9d7bedf446e8f694` was installed at 11:43 UTC; repeated service and current-realm queue checks passed. Its validation, recovery evidence and retained diagnostics are in [the local production transfer record](LOCAL_BACKEND_RELEASE_2026-10-16.md). This deployment record does not claim every gameplay path, native notification or installed-app variant was observed in production. PR #577 remains separate from deployment: its merge status does not determine the already-active local authority.

### Previous verified web release — Reward windows and leaderboard artwork

The authorized merge and web deployment of [PR #573](https://github.com/explocion200/CrownLands/pull/573), from `codex/rewards-leaderboard-artwork-current`, is **LIVE — WEB** at build `2ce492c5cab315ba308cd55cee4e688709eaf612`. Leaderboards and Daily Login display their matching HUD image beside the title. Reward tabs use matching illustrations and retain identical frame, header, navigation and boxed-X geometry when switching. The compact leaderboard podium fits short landscape screens. PR #570 was closed as superseded by this merged replacement.

- Netlify deploy `6ad023011d5f39c5a604d4a8` published October 14 at 8:52 p.m. Eastern (`2026-10-15T00:52:11.978Z`); the manual publication hold remains enabled. All three required GitHub checks and eight selected local validators passed.
- The merged artifact and asset budgets passed. All 1,168 staged inventory entries and 19 staged files matched. Reward/leaderboard windows passed 24 local, 24 staged and 24 public-asset desktop/mobile/fullscreen cases. All 57 public exact-file comparisons and six anonymous startup/reload cases passed. The existing report artwork also passed its 36-view integration check.
- Reward rules, rankings, API contract and server source fingerprint are preserved. No backend or player data changed. itch.io was not republished; physical-device behavior, authenticated gameplay and installed-app cache recovery remain manual limits.

See [the reward windows release record](REWARD_WINDOWS_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — Report and military action artwork

The authorized merge and web deployment of [PR #571](https://github.com/explocion200/CrownLands/pull/571), from `codex/report-action-artwork`, is **LIVE — WEB** at build `1565e3013b060f9860ad5c524ab42eef07e96842`. Reports, Attack, Defense, Scout and Realm Activity use matching illustrated artwork inspired by the approved medieval map reference. Shared icons cover report windows, HUD, incoming threats, troop orders and relevant Help content; combat and report behavior are preserved.

- Netlify deploy `6ad01302037d0f578982afbc` published October 14 at 7:43 p.m. Eastern (`2026-10-14T23:43:54.858Z`); the manual publication hold remains enabled. All three required GitHub checks and eight selected local validators passed.
- The merged artifact and asset budgets passed. All 1,166 staged inventory entries and 19 selected staged files matched; the bundled homepage passed after normalizing existing Netlify anchor processing. Report windows passed 36 local, 36 staged and 36 public-asset desktop/mobile/fullscreen cases. All 57 public exact-file comparisons, the game-host homepage comparison and six anonymous startup/reload cases passed.
- Release ID, API contract and server source fingerprint match the preceding publication. No backend or player data changed. itch.io was not republished; physical-device behavior, authenticated gameplay, native notifications and installed-app cache recovery remain manual limits.

See [the report artwork release record](REPORT_ARTWORK_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — Matching window header icons

The authorized merge and web deployment of [PR #568](https://github.com/explocion200/CrownLands/pull/568), from `codex/match-window-header-icons`, is **LIVE — WEB** at build `643bf16766e69c12dc28e110d7c7782202fe3de6`. Item Bag, Shop, City List and Map show their corresponding illustrated HUD image to the left of the title. Artwork remains uncropped and vertically centered, with readable titles, header balances and aligned boxed X controls on desktop and landscape mobile.

- Netlify deploy `6acfff5f5a5b928eb776ce2a` published October 14 at 6:18 p.m. Eastern (`2026-10-14T22:18:40.853Z`); the manual publication hold remains enabled. All three required GitHub checks and six selected local validators passed.
- The merged artifact and asset budgets passed. All 1,161 staged inventory entries and 17 staged files matched. All four headers passed 12 local, 12 staged and 12 public desktop/mobile cases, including artwork identity, title/close placement and mouse/touch dismissal. All 51 public file comparisons and six anonymous startup/reload cases passed.
- Release ID, API contract and server source fingerprint match the preceding publication. No backend or player data changed. itch.io was not republished; physical-device behavior, authenticated gameplay and installed-app cache recovery remain manual limits.

See [the header icons release record](HEADER_ICONS_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — HUD left-edge alignment

The authorized merge and web deployment of [PR #566](https://github.com/explocion200/CrownLands/pull/566), from `codex/align-top-hud-left-edge`, is **LIVE — WEB** at build `1c8d8ad3ccfafa07ebccf4772d6981ea1db54d7d`. The profile/action row, resources and combat timers share Reports' existing 12px left screen inset across desktop, landscape mobile and fullscreen transitions. The header-only left safe-area gutter is removed; vertical placement, right-side inset, control sizes, artwork, burgundy colors and actions are preserved.

- Netlify deploy `6acff7820bae52e8c1996a16` published October 14 at 5:45 p.m. Eastern (`2026-10-14T21:45:05.382Z`); the manual publication hold remains enabled. All three required GitHub checks and four selected local validators passed.
- The merged artifact and asset budgets passed. All 1,161 staged inventory entries and eight staged files matched. The desktop/mobile fullscreen matrix passed 18 local, 18 staged and 18 public cases, including left/right and changing screen insets, compact layouts, map zoom and mouse/touch actions. All 24 public file comparisons and six anonymous startup/reload cases passed.
- Release ID, API contract and server source fingerprint match the preceding publication. No backend or player data changed. itch.io was not republished; physical-device behavior, authenticated gameplay and installed-app cache recovery remain manual limits.

See [the HUD alignment release record](HUD_ALIGNMENT_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — Window alignment and readable labels

The authorized merge and web deployment of [PR #564](https://github.com/explocion200/CrownLands/pull/564), from `codex/window-alignment-and-label-contrast`, is **LIVE — WEB** at build `b7b2a2584dd4f727be4a581c1ebbe11201f24ee7`. Boxed X controls align within their headers and remain stable when opening animations finish. Clan reward/member badges and the View Main City label are readable. The approved burgundy theme and framed tabs are preserved.

- Netlify deploy `6acff0411fe6ead9aaa02eea` published October 14 at 5:16 p.m. Eastern (`2026-10-14T21:16:36.520Z`); the manual publication hold remains enabled. All three required GitHub checks passed. Local preparation passed five selected validators, including 198 window/viewport combinations and 12 public-profile layouts.
- The merged artifact and asset budgets passed. All 1,161 staged inventory entries and 15 staged files matched. Delivered assets passed 33 staged/18 public window cases and 12 profile layouts at each stage. All 45 public file comparisons and six anonymous startup/reload cases passed.
- Release ID, API contract and server source fingerprint match the preceding publication. No backend or player data changed. itch.io was not republished; authenticated gameplay, installed-app cache recovery and physical-device review remain manual limits.

See [the window controls release record](WINDOW_CONTROLS_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — Restored burgundy UI colors

The authorized merge and web deployment of [PR #562](https://github.com/explocion200/CrownLands/pull/562), from `codex/restore-burgundy-ui-colors`, is **LIVE — WEB** at build `7ff2ab69a2bee3c00b7d2a4febcad38b5e49df3f`. Headers, HUD controls and boxed X buttons again use the previous burgundy (`#72363a`, with `#542728` hover). Parchment surfaces, gold borders, inset tab frames, alignment, artwork and interactions retain the preceding release's design.

- Netlify deploy `6acfe006a891a1c7f1dd9534` published October 14 at 4:05 p.m. Eastern (`2026-10-14T20:05:24.478Z`); the manual publication hold remains enabled. All three required GitHub checks passed. Local preparation passed seven selected validators, including 189 window/viewport combinations.
- The merged artifact and asset budgets passed. The complete 1,161-entry staged inventory and nine staged files matched; 42 staged and 18 public window checks passed at 1440×900, 844×390 and 568×320. All 27 public file comparisons and six anonymous public startup/reload cases passed.
- Release ID, API contract and server source fingerprint match the preceding publication. No backend or player data was deployed or changed. itch.io was not republished; authenticated gameplay, installed-app cache recovery and physical-device review remain manual limits.

See [the burgundy color release record](BURGUNDY_UI_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — Shared Guild Master theme and framed tabs

The authorized merge and web deployment of [PR #560](https://github.com/explocion200/CrownLands/pull/560), from `codex/consistent-window-close-controls`, is **LIVE — WEB** at build `16d282a35c9764e6cc7ca11b6d28b3ffa5021252`. Game windows and HUD use the approved dark-oak, parchment and muted-gold palette. Window headers share a centered cream X in a thin square frame; adjacent tabs have inset gold frames, a burgundy selection underline and stronger keyboard focus. Superseded close and tab paint is removed while layout, artwork, saved heraldry and guarded dismissal are preserved.

- Netlify deploy `6acfd84065ed98dd45e940d6` published October 14 at 3:32 p.m. Eastern (`2026-10-14T19:32:28.989Z`); the manual publication hold remains enabled. All three required GitHub checks passed. Local preparation passed all 14 selected validators, including 189 window/viewport combinations.
- The merged production artifact and existing asset budgets passed. Its complete 1,161-entry staged inventory and 51 staged files matched. Delivered assets passed 42 staged and 18 public window checks at 1440×900, 844×390 and 568×320. All 153 public file comparisons and six anonymous public startup/reload cases passed.
- Release ID, API contract and server source fingerprint match the prior published client. No backend or player data was deployed or changed. itch.io was not republished. Authenticated gameplay, installed-app cache recovery and physical-device review remain manual verification limits.

See [the shared UI theme release record](GUILD_THEME_RELEASE_2026-10-14.md) for exact identity, coverage and evidence. Earlier releases below remain historical.

### Previous verified web release — Map Atlas ownership counts

The authorized merge and web deployment of [PR #558](https://github.com/explocion200/CrownLands/pull/558), from `codex/map-city-ownership-indicators`, is **LIVE — WEB** at build `ed933caca8e67869c27f0b1da108d8116a0d869f`. The Atlas uses current active-map ownership and a bounded server-only owner query for off-map counts. Confirmed zero-city results clear stale counts; older caches and session responses cannot restore them. Unloaded Core cities retain canonical map identity. This corrects presentation without changing authoritative ownership or gameplay rules.

- Netlify deploy `6acfac49800dda7ddba97930` published October 14 at 12:28 p.m. Eastern (`2026-10-14T16:28:51.572Z`); the manual publication hold remains enabled. All three required GitHub checks passed, including the owner-query/shard emulator suite. The merged artifact, complete staged path/size inventory, nine staged and 27 public file comparisons, and six public startup/reload cases passed.
- Staged and public delivered assets passed desktop/landscape Atlas fixtures for ownership loss, zero counts, accessibility labels, focus, camera and input stability. City-list and map-marker ownership tests also passed. Current realm identity and backend contract/source fingerprint are unchanged; no backend or player data was deployed or changed.
- itch.io was not republished. Authenticated live ownership changes, installed apps and physical devices remain manual verification limits. Failed/offline lookups retain the last known counts; successful server refreshes are cached for 15 seconds.

See [the map ownership release record](MAP_OWNERSHIP_RELEASE_2026-10-14.md) for exact identity and evidence. Earlier releases below remain historical.

### Previous verified web release — Shared swords for every attack

The authorized merge and web deployment of [PR #556](https://github.com/explocion200/CrownLands/pull/556), from `codex/universal-attack-sword-clashes`, is **LIVE — WEB** at build `ec42a351bd72d45f697da950b0b63648d5a9eeb4`. Confirmed attacks use the capture animation's three sword clashes, sparks and dust across city, objective and NPC targets. The saved-flag drape and ownership pulse remain exclusive to eligible captures; attack and capture receipts for the same battle share one sword sequence.

- Netlify deploy `6acf989fced2cf4068af825c` published October 14 at 11:02 a.m. Eastern (`2026-10-14T15:02:13.557Z`); the manual publication hold remains enabled. All three required GitHub checks passed. The merged production artifact, complete 1,161-entry staged inventory, ten staged and thirty public file comparisons, and six public startup/reload cases passed.
- Staged and public combat assets passed the existing browser fixture suite at 1440×900, 844×390 and 568×320. Coverage includes all target families, three sword contacts, capture-only flags, receipt deduplication, attack/capture delivery in either order, Citadel Legion reports, motion modes, NPC spawn identity, stale-map/session guards and cleanup. These checks use synthetic game fixtures, not production combat actions.
- Release ID, API contract and server source fingerprint match the preceding published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed. itch.io was not republished. Authenticated production combat, installed apps and physical-device review remain manual limits.

See [the attack swords release record](ATTACK_SWORDS_RELEASE_2026-10-14.md) for exact identity and verification evidence. Earlier releases below remain historical.

### Previous verified web release — Centered leaderboard podium crowns

The authorized merge and web deployment of [PR #554](https://github.com/explocion200/CrownLands/pull/554), from `codex/leaderboard-medal-crowns`, is **LIVE — WEB** at build `eb0be0ec339aef412210e0977337c5b070f1f364`. Top 100 Kingdoms, Top Clans and Field of Glory show gold, silver and bronze crowns for first, second and third place, centered above the numeric ranks and saved flags or clan heraldry. Compact spacing keeps the complete podium visible on short landscape screens.

- Netlify deploy `6aceebc75283c7596bff5353` published October 13 at 10:44 p.m. Eastern (`2026-10-14T02:44:24.817Z`); the manual publication hold remains enabled. All three required GitHub checks passed. The merged production artifact, 1,161-entry staged inventory, ten staged and thirty public file comparisons, and six public startup/reload cases passed.
- Staged and public leaderboard assets passed the existing podium browser suite at 1366×820, 1200×688, 844×390 and 568×320. Screenshots verify centered crowns and distinct medal colors; checks preserve full scores, 100 ranks, saved identity, seasonal decorations, refresh, keyboard/scroll behavior and empty/failure/few-entry states. These interactions use isolated fixtures, not production player records.
- Release ID, API contract and server source fingerprint match the preceding published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed by this release. itch.io was not republished. Authenticated production standings, installed apps and physical-device review remain manual limits.

See [the leaderboard crowns release record](LEADERBOARD_CROWNS_RELEASE_2026-10-13.md) for exact identity and verification evidence. Earlier releases below remain historical.

### Previous verified release — Defeated NPC artwork and respawn timers

The authorized merge and deployment of [PR #552](https://github.com/explocion200/CrownLands/pull/552), from `codex/defeated-npc-artwork`, is **LIVE — WEB AND FIREBASE** at build `1c3faf7f062b0173fd09ae34575df1c1f1accac0`. Defeated marauders and bosses retain their matching-size fallen artwork at the old position with a two-minute/thirty-minute server-clock countdown. They disappear when the authoritative replacement appears at its new road position. Blocked placement retains inactive remains labeled “Awaiting respawn.”

- Netlify deploy `6acea2914271d1fce274a840` published October 13 at 5:36 p.m. Eastern (`2026-10-13T21:36:10.614Z`); the manual publication hold remains enabled. All three required feature checks passed, including the population and real-combat emulator suites. The 1,159-entry staged inventory, 27 staged/79 public file comparisons, six staged/six public startup and reload cases, and NPC interactions using delivered assets passed at 1440×900, 844×390 and 568×320.
- Added `refreshMarauderRespawn` and updated `maintainMarauders` and `getRealmInfo`; their deployed archives match all 65 tracked runtime files and the merged manifest. All 150 Functions are ACTIVE on Node 22; the other 147 are unchanged. Existing rules match and both NPC indexes remain READY. Release ID and API contract are unchanged.
- Authenticated realm checks before and after publication retained `main-realm-2026-10` / `realm-2026-10` / `shard_0001` and Core-expansion topology. Population/refills stayed enabled, without an administrative population rewrite. Initial bounded monitoring found zero server errors. Actual production defeat-to-respawn cycles, installed apps/physical devices and long-term monitoring remain verification limits; itch.io was not republished.

See [the defeated NPC release ledger](MARAUDER_DEFEATED_RELEASE_2026-10-13.md) for deployment identity, evidence and limits. Earlier releases below remain historical.

### Previous verified release — Matching NPC Info and Scout Reports

The authorized merge and deployment of [PR #550](https://github.com/explocion200/CrownLands/pull/550), from `codex/npc-info-panel-layout`, is **LIVE — WEB AND FIREBASE** at build `f57b5604b14df112d8a87d47af0d4fea631c3a49`. Marauder and clan-boss Info uses the city parchment frame, stat ledger and independently scrolling action column. NPC Scout Reports use the city scout heading, identity strip, troop/defense cards and neutral defender table. Contained controls fix the oversized action decoration; scout privacy, navigation, timers and refill drafts are preserved.

- Netlify deploy `6ace7f2089fb4f3b77b70e27` published October 13 at 3:02 p.m. Eastern (`2026-10-13T19:02:05.084Z`); the manual publication hold remains enabled. All three required feature checks passed. All 1,157 staged inventory entries, 25 staged and 73 public file comparisons, six staged/six public startup/reload cases and panel interactions using the exact delivered assets passed at 1440×900, 844×390 and 568×320. Asset ceilings remain unchanged.
- Only `getRealmInfo` was redeployed for build identity. Its archive matches all 65 tracked runtime files and the merged manifest. All 149 Functions are ACTIVE on Node 22; the other 148 retain source hashes, archives, revisions and update times. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `d6bd0ca857cc5ddea55366f9451cf7a5808d74e5786a805a35be7580fe5fb99a`. Existing rules match and both NPC indexes remain READY.
- Authenticated realm checks before and after publication retained `main-realm-2026-10` / `realm-2026-10` / `shard_0001` and Core-expansion topology. Population/refills stayed enabled. Initial bounded monitoring found zero server errors. Signed-in production delivery, installed apps/physical devices and long-term monitoring remain limits; itch.io was not republished.

See [the NPC Info/Scout release ledger](MARAUDER_INFO_SCOUT_RELEASE_2026-10-13.md) for evidence. Earlier releases below remain historical.

### Previous verified release — Matching NPC attack reports

The authorized merge and coordinated deployment of [PR #548](https://github.com/explocion200/CrownLands/pull/548), from `codex/marauder-matching-battle-reports`, is **LIVE — WEB AND FIREBASE** at build `b372622f7a20ecf2a74e5854621f6bf579125e1b`. Solo marauder and clan-boss attacks use the ordinary parchment attack-report window, with neutral NPC artwork, saved battle-time forces and bonuses, rally results and each recipient's own rewards. Actual encounters save one private participant-only snapshot; canceled encounters retain their return/refund explanation, and historical reports label missing statistics.

- Netlify deploy `6ace5905f5efd8609987f114` published October 13 at 12:24 p.m. Eastern (`2026-10-13T16:24:11.914Z`); the manual publication hold remains enabled. All 149 Functions are ACTIVE on Node 22, and all six deployed source cohorts match the merged manifest and inspected runtime sources. Existing rules match and both NPC indexes remain READY.
- All three required checks passed for the exact feature head. Source/built report validation covered 48 cases at three desktop/landscape sizes. All 1,157 staged inventory entries, 21 staged and 61 public file comparisons, six staged/six public startup/reload cases and 24 isolated report cases using the exact published report assets passed. Emulator settlement tests covered private recipient histories, participant-only snapshots, replay immutability and no PvP credit; asset ceilings remain unchanged.
- Authenticated realm checks retained `main-realm-2026-10` / `realm-2026-10` / `shard_0001`. The existing population/refill flag was held during verification and restored at `2026-10-13T16:25:09.101Z`. Read-only inspection of all 82 current maps found 25 bosses and 114 solos, including 28 closed-admission New Lands maps, with policy-4 caps, territory and spacing satisfied and no blocked slots. All 62 current road spawns passed placement checks; 77 retained legacy targets preserved their identities and positions from this release's baseline. No administrative population rewrite, verification battle or purchase was performed.
- Initial bounded monitoring found zero server errors. Live player report delivery/settlement, physical devices, existing-profile navigation and long-term economy/backend-cost checks remain verification limits. itch.io was not republished and still requires separate authorization for a matching client.

See [the NPC report release ledger](MARAUDER_REPORTS_RELEASE_2026-10-13.md) for deployment identity and evidence. Earlier releases below remain historical.

### Previous verified release — Separated road marauder respawns

The authorized merge and coordinated deployment of [PR #546](https://github.com/explocion200/CrownLands/pull/546), from `codex/marauder-road-only-spawns`, is **LIVE — WEB AND FIREBASE** at build `6946e9bd78a0a7d97a12fefe746bd8b44be26926`. New and replacement NPCs use many possible painted-road locations inside the 20% edge inset, preserving clearance and routes. Each New Lands map has at most two active solos: one beginner and one alternating medium/high slot. Active camps remain at least 25% of the shorter map side apart, with a 128-unit minimum. Core maps retain one boss slot each.

- Netlify deploy `6ace3ae0b097d0dbb6f2ad07` published October 13 at 10:27 a.m. Eastern (`2026-10-13T14:27:52.200Z`); the publication hold remains enabled. All 149 Functions and six source cohorts match the merged build after two targeted retries completed 24 quota-limited updates. Existing rules match and both NPC indexes remain READY.
- All three required checks passed. Focused terrain, rules and browser validation plus population and real-combat emulators passed. All 1,157 staged inventory entries, 19 staged and 55 public comparisons, and six staged/six public desktop and landscape-mobile startup/reload cases passed. Authenticated realm lookup retained October's world, generation and shard.
- The existing October population/refill flag was paused for deployment and restored after client/backend verification at `2026-10-13T14:28:59.208Z`. Bounded maintenance reconciled all 81 maps to policy 4. At `2026-10-13T14:32:28.202Z`, inspection found 25 bosses and 110 solos, including 30 closed-admission New Lands; two solo slots remained blocked. All cap, territory and spacing checks passed. All 56 new road spawns passed placement checks, and 79 retained legacy targets preserved their identities and positions. The approved retirement exception uses existing exact-once invalid-encounter refunds; no verification battle or purchase was initiated.
- Initial monitoring found zero server errors. itch.io remains at its preceding incompatible release and requires separately authorized publication. Actual production refund/refill settlement, natural defeat-to-replacement cycles, existing-profile/physical-device checks and long-term economy/backend-cost monitoring remain verification limits.

See [the road respawn release ledger](MARAUDER_ROAD_RESPAWN_RELEASE_2026-10-13.md) for identity, transition and verification evidence. Earlier releases below remain historical.

### Previous verified release — NPC city controls and inset respawns

The authorized coordinated release of [PR #543](https://github.com/explocion200/CrownLands/pull/543) (`codex/marauder-placement-and-size`) and [PR #544](https://github.com/explocion200/CrownLands/pull/544) (`codex/marauder-city-action-controls`) is **LIVE — WEB AND FIREBASE** at build `a3f0b09033c8cfd7562d711d937397b30d9e7bc5`. NPCs use the city's Scout / Info / Attack wheel; solo Attack prepares troops and boss Attack prepares an eligible rally. New/replacement centers stay 20% inside edges, with 90px solos and 115px bosses. Existing targets retain their locations and identities until defeated.

- Netlify deploy `6acdf4c2e5dccf338bc35c0d` published October 13 at 5:24 a.m. Eastern (`2026-10-13T09:24:52.514Z`); the manual publication hold remains enabled. All 149 Functions and six source cohorts match the merged build after a targeted retry of fifteen quota-limited updates. Existing rules match and both NPC indexes remain READY.
- Required CI checks, focused plans, the placement emulator and all 81 terrain layouts passed. Nineteen staged and 55 public comparisons plus six staged/six public startup/reload cases passed with a separate browser profile per viewport. Authenticated realm lookup retained October's world/generation/shard; the 81-map population remained 25 bosses and 672 solos. Initial monitoring had no server errors.
- Stamina, Crown pricing, combat, rewards, payment availability and population activation are unchanged. itch.io still needs a separately authorized matching publication. Actual production dispatch/refill, physical devices, repeated existing-profile navigation, natural inset respawns and long-term monitoring remain verification limits.

See [the October 13 release ledger](MARAUDER_CONTROLS_RELEASE_2026-10-13.md) for hashes and browser/population observations. The initial activation below remains historical.

### Previous verified release — Marauders, clan bosses and stamina

The authorized merge and coordinated deployment of [PR #541](https://github.com/explocion200/CrownLands/pull/541), from `codex/marauders-and-clan-bosses`, is **LIVE — WEB AND FIREBASE** at build `2adcd7c03ddf07b6a3f9c4ee092e45efc35a42a8`, release `crownlands-2026-10-12-marauder-hunts-v1`. The compact yellow stamina bar, proportional Crown refill review and NPC hunts are deployed. The user separately approved population activation after verification.

- **Web and backend:** Netlify deployment `6acd91630f4b5e910b62d8a6` published October 12 at 10:17 p.m. Eastern (`2026-10-13T02:17:37.292Z`); the manual publication hold remains enabled. All 149 Functions are ACTIVE on Node 22, deployed rules match, and both NPC indexes are READY. All three required CI checks, focused validation and seven emulator suites passed. Nineteen staged and 55 public artifact comparisons plus cold/reload checks at 1440×900, 844×390 and 568×320 passed.
- **Current realm population:** authenticated `getRealmInfo` matched the authoritative October pointer before activation. Only `marauderPopulation/realm-2026-10--shard_0001` was enabled at 10:28 p.m. Eastern. All 81 maps initialized: 25 bosses in the 25 Core maps and 672 solos across 56 active New Lands, including 30 closed-admission maps. Territory, levels and spawn identities passed inspection. Initial monitored requests had no server errors.
- **Purchase disclosures:** [website PR #29](https://github.com/explocion200/crownlands-website/pull/29), build `e6a45e704458d9f0c285210c8822a2ecc4375d23`, corrected the separately hosted terms and relevant guides before activation. Both website CI and all 50 live page/routing checks passed. Merchant configuration and payment availability were preserved.
- **Channel limitation:** itch.io still serves build `24cfa4e...` from upload `19696818`. An authenticated non-mutating probe confirmed that its old release identity receives the new backend’s update-required guard. It needs a separately authorized matching publication; the web game is the verified playable channel.

See [the release ledger](MARAUDER_STAMINA_RELEASE_2026-10-12.md) for hashes, authorization, validation, scoped activation, initial monitoring and live-verification limits. Earlier snapshots below remain historical.

### Previous verified web release — Sword-clash captures and player flag draping

The authorized merge and web deployment of [PR #530](https://github.com/explocion200/CrownLands/pull/530), from `codex/castle-capture-battle-drape`, is verified at build `7406e0a929e6c2114f9db359b80b012aa317f406`. Newly confirmed castle captures play three sword clashes, then drape the capturing player's saved colors, pattern, crest and crest color over the castle front. Full motion lasts four seconds; Reduced uses a brief opacity-only confirmation and Off preserves immediate authoritative ownership. Capture rules, ordinary ownership markers and audio cues are retained.

- **LIVE — WEB:** Netlify deploy `6acc51b90a75ee0008714c44`, published `2026-10-12T03:20:47.434Z` (October 11, 11:20 p.m. Eastern). Ten staged file comparisons and the 1,149-file inventory match the tested artifact. All thirty public comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`; the publication hold remains enabled.
- **Validation:** `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run 38199019495](https://github.com/explocion200/CrownLands/actions/runs/38199019495). Source and delivered animation checks passed at 1440×900, 844×390 and 568×320, covering saved heraldry, timing, zoom-aware anchoring, duplicate/stale events, map guards, motion modes and cleanup. Shared animation, player-flag, city reconciliation and audio checks, syntax/lint, production artifact and asset budgets passed. No authoritative server changes required emulator suites; the named multiplayer gate explicitly passed as inapplicable. The unchanged installation limit remains 4.28 MiB; the delivered cache is 4.26 MiB.
- **Release identity:** release `crownlands-2026-10-10-guild-missions-v2`, contract `4473ca88e829899fabbdf909b9fe4c009f48473e3b52488c027a16734538c132` and server source `36077855ca6f6462096be1726c69d71772b02dd44bba47f6dd91b2b0cf9e8e5e` match the preceding published web manifest. The new client source is `a1360f45266eee30905fab7436c944b2df24031df489b106e06ca7ac2d6333ea`. No Functions, rules, indexes, realm configuration or player data were deployed or changed.
- **Limits and evidence:** six anonymous public cold/reload cases passed at the three sizes without runtime exceptions. Capture interactions used isolated game fixtures; authenticated production captures and installed-app/physical-device review remain manual. itch.io was not republished and remains at its preceding verified build `24cfa4e...`. Sanitized receipts and screenshots are retained under `release-artifacts/castle-capture/`. Local main and origin/main were clean, equal to the merged build and at divergence `0 0` before publication.

### Previous verified release and current itch.io baseline — Guild Master responsive alignment

The authorized merge of [PR #528](https://github.com/explocion200/CrownLands/pull/528), from `codex/guild-responsive-alignment`, is verified on backend, web and itch.io at build `24cfa4e7dcecbf76175697097335091f26f5df59`. Guild member/recruit stats and actions align across card rows. Mission planning uses wider cards and stacks columns on smaller screens; its outcome panel fits its contents. Room actions, field spacing and phone confirmation footers align consistently. The active room tab stays visible and refreshes retain the navigation strip's scroll position. Approved artwork, game balance, progression and outside-realm presentation are retained.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6acbbb34b27b490008b0d04a` published `2026-10-11T16:43:39.771Z`. All 103 staged and 309 public file comparisons match across primary /play/ and both retained game hosts; the manual publication hold remains enabled. The first public comparison hit a transient fetch failure; a bounded retry completed all 309 comparisons successfully. itch.io upload `19696818` is selected/saved at the same build; actual [Run game iframe](https://html-classic.itch.zone/html/19696818/index.html?v=1791737204). All 1,000 files match (998 exact, two known HTML embed/newline normalizations); all 27 earlier uploads remain.
- **Validation:** Static validation, Multiplayer emulator validation and Validate passed in [run 38146586801](https://github.com/explocion200/CrownLands/actions/runs/38146586801). Focused source/built Guild checks use the actual shared game CSS cascade at 1440×900, 1024×768, 844×390, 568×320, 390×844 and 320×568. They cover all rooms, card-row alignment, comparison/history, planning, departure/improvement/recruit reviews, large balances, reports, 44px controls and touch/mouse/keyboard navigation. The production Guild flow suite covers mentoring, saved parties, recruitment lost-response retries, report/claim safety, refresh/reentry and cleanup. No server-authoritative behavior changed, so no new emulator suite applies. Merged artifact validation, staged/public anonymous startup at three sizes and six local/six public itch cold/reload checks passed without runtime errors or failed game assets. Unchanged premerge responsive inputs were not redundantly retested after merge.
- **Targeted backend:** only `getRealmInfo` was redeployed for release identity. Its stored archive matches all 60 tracked runtime files and the merged manifest; all 145 Functions are ACTIVE on Node 22 and the other 144 retain source hashes, archives and revisions. The unauthenticated guard and 29-callable access audit passed. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `e60720a3e630ba6ce1dd25a93003b7a38fdeafc4cf72d82bf0b45a1cec3e2597`. Read-only verification retained the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Package:** `crownlands-html5-24cfa4e7dcec.zip`, 63,752,633 bytes, SHA-256 `e2cbf9116ac57acc2163a9e452fb3611167f36653da5321f641b63a4c9c9718c`. The established channel-only packaging embeds the same 46 stylesheets at their original immediate/deferred positions, preserving all gameplay JavaScript, all 42 Guild images and 81 active/prepared Core payloads. Web assets remain separate and the Guild remains absent from initial/install preload.
- **Limits and evidence:** responsive interactions used disposable fixtures; this release's public startup/reload checks were anonymous. Current authenticated, installed-app and physical-phone alignment remains manual, as do real seasonal rollover and long-term pacing checks. Sanitized receipts and screenshots are under `release-artifacts/guild-responsive-alignment/deployment/`. Local main and origin/main were clean, equal to the merged runtime and at divergence 0 0 before publication; the release-record follow-up changes documentation only.

### Previous verified release — Full Guild Master expansion

The authorized merge of [PR #526](https://github.com/explocion200/CrownLands/pull/526), from `codex/guild-master-missions`, is verified on backend, web and itch.io at build `4a367c1a656f96d6c27a19a2738cbf58c983cb94`. All three approved balance groups are integrated: persistent individually rolled champions, rarity ceilings and protected legacy progression, mission-first planning, additive party forecasts, server-private outcomes and reports, bounded rewards, mentoring, saved parties, recovery and five independently improved rooms. The approved Hall, mission and facility scenes and 21 Common peasant portraits are included. Existing estate entry/camera behavior and outside-realm presentation are preserved.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6acb030ea11c5500084d6cb7` published `2026-10-11T03:42:31.831Z` (October 10 EDT). All 103 staged and 309 public file comparisons match across primary /play/ and both retained game hosts; the manual publication hold remains enabled. itch.io upload `19686122` is selected/saved at the same build; actual [Run game iframe](https://html-classic.itch.zone/html/19686122/index.html?v=1791690314). All 1,000 files match (998 exact, two known HTML embed/newline normalizations); all 26 earlier uploads remain.
- **Validation:** Static validation, Multiplayer emulator validation and Validate passed in [run 38108230870](https://github.com/explocion200/CrownLands/actions/runs/38108230870). Focused rules/emulators cover 90,720 additive forecast cases, saved stat rolls and legacy levels/XP, all 25 room bills, mentor/member locks, report privacy, retry/concurrent payment and claim safety, Main City troop credit, separate reward ceilings, seasonal expiry, permanent rewards and reset preservation. Source/built Guild and existing estate UI checks pass at 1440×900, 844×390 and 568×320. Mission-first flows, quote/claim/report/replay, recruitment lost-response retries, rooms, saved parties, roster filtering/comparison, recovery, keyboard return and cleanup are covered with disposable fixtures. Optional bundles, artwork inventory, production artifact and asset budgets pass. Fresh staged/public anonymous startup passes at three sizes; exact merged itch packaging passes six local and six public cold/reload cases without runtime errors or missing game assets.
- **Coordinated backend:** all 145 Functions are ACTIVE on Node 22. Stored deployment archives match all 60 tracked runtime files and the merged manifest. New owner-readable Guild report rules match the deployed ruleset; private pending outcomes remain server-only. Six unauthenticated guards and the 29-callable access audit passed. Release ID is `crownlands-2026-10-10-guild-missions-v2`, contract `4473ca88e829899fabbdf909b9fe4c009f48473e3b52488c027a16734538c132`, server fingerprint `36077855ca6f6462096be1726c69d71772b02dd44bba47f6dd91b2b0cf9e8e5e`, client fingerprint `27cabf2fdeb9408c75d6a210a78d2207be845d35f9218eb4dd2d92413664474d`. Final read-only verification retained the ready October realm/generation and shared shard; no administrative player-data edits or reset were performed.
- **Package:** `crownlands-html5-4a367c1a656f.zip`, 63,737,861 bytes, SHA-256 `2b04d402c58116ca524fdb26aa0a04da621215b2f6b5f8881b41005339ff0d56`. To fit itch.io's 1,000-file limit, its package embeds 45 unchanged immediate styles at their original cascade positions and the deferred Guild style at its original lazy link, retaining all gameplay JavaScript, all 42 Guild images and 81 active/prepared Core payloads. Earlier package-only omissions are unchanged. Normal web assets remain separate; the Guild remains absent from initial/install preload.
- **Limits and evidence:** gameplay interactions used disposable fixtures and emulators; public startup/reloads were anonymous. Current authenticated production spending awaits clarification of the dedicated QA account; no private account address is recorded here. Installed-app/physical-device play, real seasonal rollover and long-term human pacing remain manual. Sanitized receipts and screenshots are under `release-artifacts/guild-master-missions/deployment/`. Local main and origin/main were clean, equal to the merged runtime and at divergence 0 0 before publication; later release-record commits are documentation only.

### Previous verified release — Inner Castle overview building selection

The authorized merge of [PR #524](https://github.com/explocion200/CrownLands/pull/524), from `codex/estate-building-tap-zoom`, is verified on backend, web and itch.io at build `03c952837b28a819e2b8eadd5c22d803ec0a41a3`. Within Inner Castle, clicking or tapping exposed building/plot artwork below inspection zoom selects the site, centers its artwork within map bounds and zooms to 2.5×. Selected-site details appear without automatically entering Gear or a service. Visible district captions retain district navigation; painted structures take priority over transparent district-button padding. The outside realm map, artwork, fixed captions, construction and economy rules are retained.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6aca820bc1a92c000898a96b` published `2026-10-10T18:25:34.308Z`. All 57 staged and 171 public file comparisons match across primary /play/ and both retained game hosts; the manual publication hold remains enabled. itch.io upload `19678273` is selected/saved at the same build; actual [Run game iframe](https://html-classic.itch.zone/html/19678273/index.html?v=1791656811). All 1,000 files match (998 exact, two known HTML embed/newline normalizations), with earlier uploads preserved.
- **Validation:** Static validation, Multiplayer emulator validation and Validate passed in [run 38074759464](https://github.com/explocion200/CrownLands/actions/runs/38074759464). Node 22 syntax/lint, runtime synchronization, production artifact and unchanged asset budgets passed. Native source/built checks cover all twenty sites in unbuilt/construction/completed states at 1440×900, 844×390 and 568×320: 60 mouse and 60 touch overview selections per case, intermediate zoom, original pointer position under touch click snapping, captions, actions, drag/cancel, pinch/wheel/keyboard, empty-terrain deselection, directory and remount. Fully covered southern artwork at the smallest fitted view is tested after reframing below inspection; visible panels keep their hit areas and the directory remains available. Actual-game integration at 1440×900, 1280×590, 844×390 and 568×320 verifies overview selection without automatic Gear entry or realm-camera changes, all twenty sites and existing Gear returns/cleanup. No server-authoritative behavior changed, so no new emulator suite applies. Fresh merged built native-input checks at three sizes, exact staged parity, staged/public anonymous primary startup, and six local/six public itch cold/reload cases passed without runtime errors or failed game assets. Actual-game integration passed before merge on identical runtime inputs; it was not rerun after merge.
- **Targeted backend:** only `getRealmInfo` was redeployed for release identity. Stored source matches all 56 tracked runtime files and the manifest; all 144 Functions are ACTIVE on Node 22 and the other 143 retain source hashes, archives and revisions. The unauthenticated guard and 29-callable access audit passed. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `35e29326e31286b14f3027bd697727a5e30195d7d01657764522146a69a7a4b3`. Read-only verification retained the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Package:** `crownlands-html5-03c952837b28.zip`, 60,108,200 bytes, SHA-256 `69a02879031ff14f4ac0a06ef3fc3f65f0a1d95b51fef27dc4a012c3c1f04bf2`. Established channel-only omissions are unchanged; all estate/HUD artwork and 81 active/prepared Core paths are retained.
- **Limits:** interactions used disposable QA fixtures; public startup/reloads were anonymous. Authenticated current-release, installed-app and physical-device review remain manual, along with earlier payment-interruption, commission-deadline, seasonal-rollover and pacing checks. Sanitized receipts are under `release-artifacts/estate-building-tap-zoom/deployment/`. Local main and origin/main were clean, equal to the merged build and at divergence 0 0 before publication; later release-record commits are documentation only.

### Previous verified release — Unframed Inner Castle map buildings

The authorized merge of [PR #522](https://github.com/explocion200/CrownLands/pull/522), from `codex/isolate-building-window-art`, is verified on backend, web and itch.io at build `ccb14772152e5083d00e4f16196f687f7adcadef`. All twenty estate map buildings again use their original unframed transparent sprites, dimensions and anchors. Service/construction window portraits use a separate styling class, retaining the illustrated folio presentation without leaking borders, backgrounds, margins or minimum heights onto the map. Terrain, artwork, fixed captions, selection controls and economy rules are retained.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6aca710d4c48b8000818d5a1` published `2026-10-10T17:13:29.269Z`. All 57 staged and 171 public file comparisons passed across the primary /play/ entry and both retained game hosts; the manual publication hold remains enabled. itch.io upload `19676962` is selected/saved at the same build; actual [Run game iframe](https://html-classic.itch.zone/html/19676962/index.html?v=1791652480). All 1,000 files match (998 exact, two known HTML embed/newline normalizations), and earlier uploads remain preserved.
- **Validation:** Static validation, Multiplayer emulator validation and Validate passed in [run 38069374534](https://github.com/explocion200/CrownLands/actions/runs/38069374534). Node 22 syntax/lint, runtime synchronization, production artifact and unchanged asset budgets passed. The regression check reproduced the 1px map frame before the correction. Source and built checks verify all twenty map sprites retain zero border/margins/minimum height, transparent backgrounds and original registry dimensions, while service portraits retain their frame. All twenty services, four processors and six construction states remain usable at 1440×900, 844×390 and 568×320. Native input checks cover all twenty sites in three states, mouse/touch selection and deselection, drag/cancel, pinch/wheel/keyboard camera controls, directory and remount. No server-authoritative behavior changed, so no new emulator suite applies. A fresh merged built map/portrait smoke at three sizes, exact staged artifact parity, anonymous primary startup and six local/six public itch cold/reload cases passed without runtime or failed game-asset errors. Earlier actual-game integration evidence remains in the preceding release record; it was not rerun after merge.
- **Targeted backend:** only `getRealmInfo` was redeployed for release identity. Its stored source matches all 56 tracked runtime files and the manifest; all 144 Functions are ACTIVE on Node 22, and the other 143 retain their sources, hashes and revisions. The unauthenticated guard and 29-callable access audit passed. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `20e808d85fbe3810b004ac490557328c31737abd2b2e930c61a424de92a0b48f`. Read-only verification retained the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Package:** `crownlands-html5-ccb14772152e.zip`, 60,107,948 bytes, SHA-256 `4df1e77427b4d8548fefe83d0d3ba3567918aee15846e35718d2b5b26d0eb39b`. The established channel-only packaging omissions are unchanged; all estate/HUD artwork and 81 active/prepared Core paths are retained.
- **Limits:** interaction checks used disposable QA fixtures; public startup/reloads were anonymous. Authenticated current-release, installed-app and physical-device review remain manual, as do the existing payment-interruption, commission-deadline, seasonal-rollover and pacing checks. Sanitized receipts are under `release-artifacts/estate-map-unframed/deployment/`. Local main and origin/main were clean, equal to the merged build and at divergence 0 0 before publication; later release-record commits are documentation only.

### Previous verified release — Illustrated building service interface

The authorized merge of [PR #520](https://github.com/explocion200/CrownLands/pull/520), from `codex/inner-castle-building-ui-polish`, is verified on backend, web and itch.io at build `df655aaa4f3adc35d77859abaf1bda570586894b`. Building service and construction windows now share illustrated identity columns, dark oak headers, parchment ledgers and burgundy primary actions. Production keeps recipe/quantity first and advanced details collapsed. Time, material shortfalls and current/next benefits are distinct; Start, Build/Upgrade and review decisions remain visible in the footer. Existing map artwork, officer equipment screens and economy rules are retained.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6aca6449cd8e360008e33572` published `2026-10-10T16:18:10.616Z`. All 57 staged and 171 public file comparisons passed across the primary /play/ entry and both retained game hosts. The manual publication hold remains enabled. itch.io upload `19676056` is selected/saved at the same build; actual [Run game iframe](https://html-classic.itch.zone/html/19676056/index.html?v=1791649212). All 1,000 files match (998 exact, two known HTML embed/newline normalizations), and earlier uploads remain preserved.
- **Validation:** Static validation, Multiplayer emulator validation and Validate passed in [run 38066471909](https://github.com/explocion200/CrownLands/actions/runs/38066471909). Node 22 syntax/lint, runtime synchronization, production artifact and unchanged asset budgets passed. Source and built folio checks cover all twenty services, four manual processors and six construction states at 1440×900, 844×390 and 568×320; actions remain visible and at least 44px, with no horizontal overflow. The existing actual-game suite covers quotes, single payment/legacy credit/retry, quantity/draft/focus restoration, prerequisites/sources, Gear returns, champions, camera and cleanup. No server-authoritative behavior changed, so no new emulator suite applies. The first CI run's test-only Playwright dependency was replaced by the existing Chromium harness; the corrected head passed. Exact staged artifact parity and merged built layouts, primary anonymous startup and six local/six public itch cold/reload cases passed without runtime or failed game-asset errors.
- **Targeted backend:** only getRealmInfo was redeployed for release identity. Its stored source matches all 56 tracked runtime files and the manifest; all 144 Functions are ACTIVE on Node 22, and the other 143 retain their sources, hashes and revisions. The unauthenticated guard and callable access audit passed. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `a7557800ea7d3b74ec7882607ebf8e9a3e412cc3a5d7f14ac58d0f5c071e95d5`. Read-only verification retained the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Limits:** interaction checks used disposable QA fixtures; public startup/reloads were anonymous. Authenticated current-release, installed-app and physical-device review remain manual, as do the existing payment-interruption, commission-deadline, seasonal-rollover and pacing checks. Sanitized receipts are under release-artifacts/estate-building-ui/deployment/. Local main and origin/main were clean, equal to the merged build and at divergence 0 0 before publication; later release-record commits are documentation only.

### Previous verified release — Inner Castle terrain deselection

The authorized merge of [PR #518](https://github.com/explocion200/CrownLands/pull/518), from `codex/estate-tap-deselect`, is verified on backend, web and itch.io at build `43e051ddabe58ccabc8ff8917b086d8064ee9e12`. Clicking or tapping bare estate terrain clears the selected building, its marker, details, directory highlight and map actions. The camera stays in place and the empty selection survives remounting. Building taps select again; dragging and interactions with panels or camera controls retain selection. Construction countdowns remain visible.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6ac9d8f08227150008b8e0f3` published `2026-10-10T06:27:03.556Z`. All 57 staged and 171 public file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`; manual publication hold remains enabled. itch.io upload `19667640` is selected/saved with actual Run game iframe `https://html-classic.itch.zone/html/19667640/index.html?v=1791613700`. At `2026-10-10T06:29:41.638Z`, 998 files matched exactly and 2 entry HTML files matched with the established itch embed/newline normalization. Earlier uploads remain preserved.
- **Validation:** required Static validation, Multiplayer emulator validation and Validate passed in [run 38030068202](https://github.com/explocion200/CrownLands/actions/runs/38030068202). Four affected native-input, actual-game estate/Gear integration, overview-timer and production-artifact validators, Node 22 syntax/lint, runtime synchronization and artifact/budget checks passed. Source/built input fixtures cover all twenty sites in three states, mouse/touch deselection and reselection, panel/action preservation, camera and directory state, remount, drag/cancel/pinch/wheel/keyboard behavior and selection-independent timers. No server-authoritative behavior changed, so no new emulator suite applies. Exact staged JavaScript/CSS parity and a narrow merged fixture passed at 1440×900, 844×390 and 568×320. Primary anonymous startup and six local/six public itch cold/reload cases passed, including sign-in bounds, upload-relative worker scope and all 81 active/prepared Core paths, with no uncaught runtime or failed game-asset errors.
- **Targeted backend:** only `getRealmInfo` was updated for release identity. Its stored archive matches all 56 tracked runtime files and the manifest; all 144 Functions are ACTIVE on Node 22, and the other 143 retain source references, hashes and revisions. Its guard and the 29-callable access audit passed. The deploy follow-up audit initially failed on a non-callable response from unchanged `leaveClan`; the standalone retry passed before publication. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `515d2f9e81dac2e7e7b4fa18ab82dafea560764935f757b26a3108d5ddab1014`. Read-only checks retained the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Budgets and package:** deselection adds 293 shipped bytes; only the combined estate renderer/styles allowance increases from 40 to 41 KiB, with existing art and global caps retained. Package `crownlands-html5-43e051ddabe5.zip` is 60,091,452 bytes, SHA-256 `e724f0b93652423706998cb9e01bc0570b94adceaba6bf5a588922c37058106e`. Its 1,000 files preserve current estate/HUD art and active/prepared Core payloads using the preceding release’s channel-only omissions; source and archived world data are untouched.
- **Limits:** interaction verification used isolated QA fixtures; public startup/reloads were anonymous. Current signed-in, installed-app and physical-device deselection remain manual, along with existing interrupted-payment, real commission-deadline, seasonal-rollover and pacing checks in [the playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md).

Sanitized receipts are under `release-artifacts/estate-tap-deselect/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`. Later release-record changes are documentation only; production remains on this tested runtime build.

### Previous verified release — Illustrated Inner Castle HUD entry

The authorized merge of [PR #516](https://github.com/explocion200/CrownLands/pull/516), from `codex/inner-city-hud-entry`, is verified on backend, web and itch.io at build `2de0506f18b43a9bea5e0b41ce1fdcd90eb81974`. A transparent illustrated castle immediately beside Dailies opens the player's existing Main City estate, including from another region. It inherits the shared burgundy HUD controls and keeps at least 44px targets. Mouse, touch, Enter and Space navigation preserve unsaved Profile flag/skill-preset guards; Back to Realm retains the realm region and camera and cleans up the estate.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6ac9ca81e1c3c9000899c0f9` published `2026-10-10T05:23:59.228Z`. All 57 staged and 171 public file comparisons passed, including the new icon, on the primary `playcrownlands.com/play/` entry and both retained game hosts. Manual publication hold remains enabled. itch.io upload `19667179` is selected/saved with actual Run game iframe `https://html-classic.itch.zone/html/19667179/index.html?v=1791610606`. At `2026-10-10T05:38:20.549Z`, 998 public files matched exactly and 2 entry HTML files matched using the established itch embed/newline normalization. Earlier uploads remain preserved.
- **Validation:** required Static validation, Multiplayer emulator validation and Validate passed; [Static validation run 38025976062](https://github.com/explocion200/CrownLands/actions/runs/38025976062) records the affected-test plan. Five selected main-screen navigation, shared Crowns HUD, estate integration, asset-budget and production-artifact validators, Node 22 syntax/lint, runtime synchronization and build checks passed. No server change requires new emulator suites. After exact staged parity, the merged built runtime repeated the narrow shortcut fixture at 1440×900, 844×390 and 568×320: adjacency/target bounds, alpha, shared colors/geometry, native mouse/keyboard/touch, unavailable/off-map Main City, exposed desktop Profile entry, cancel/discard guards, realm-camera return and teardown. Primary anonymous startup and six local/six public itch cold/reload cases passed, including exact stamps, sign-in bounds, upload-relative worker scope and all 81 active/prepared Core paths, without uncaught runtime or failed game-asset errors.
- **Targeted backend:** only `getRealmInfo` was redeployed for the merged release identity. Its stored archive matches all 56 tracked runtime files and the manifest; all 144 Functions are ACTIVE on Node 22, and the other 143 retain their source references, hashes and revisions. Its unauthenticated guard and the 29-callable access audit passed. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `1aa739ebcf89e1e22cea483847bffe77d9958ebfb1794e5162cb3dc6a2c5458a`. Read-only checks retain the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Artwork and packaging:** the generated 1254×1254 RGBA master and prompt/provenance are retained under `docs/art-sources/inner-city-hud/`. The transparent runtime derivative is 192×192, 9,222 bytes, SHA-256 `677dc563cdd2ae30a8585c16f9dcb54cf0ad0ac488e614b825a6935d8a6967a8`; it uses existing runtime caching. Package `crownlands-html5-2de0506f18b4.zip` is 60,091,372 bytes, SHA-256 `e4c86165eb564ccba85e8acf8fd12a07735d9c92340ccce92e2d3681b72901d1`. Its 1,000 files retain current estate/HUD art and active/prepared Core payloads. Besides established optional/inactive omissions, this itch-only package omits unreferenced web-domain `ads.txt`; the source and web artifact retain it.
- **Limits:** navigation used isolated QA fixtures; public startup/reloads were anonymous. No current-build signed-in production or actual installed-app/physical-device shortcut check is claimed. Existing interrupted-payment, commission-deadline, seasonal-rollover and pacing checks remain manual in [the playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md).

Sanitized receipts are under `release-artifacts/inner-city-hud-entry/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified release — Overview construction countdowns

The authorized merge of [PR #514](https://github.com/explocion200/CrownLands/pull/514), from `codex/estate-overview-construction-timers`, is verified on backend, web and itch.io at build `17494c17bc60f1ee7b92b91b946c9d3f167469f3`. Active construction arcs and remaining-time counters stay visible at the fitted estate overview. Timers take priority over scenery and district captions; covered captions are temporarily hidden at their unchanged anchors. Northern counters fit inside the viewport, and concurrent counters separate horizontally with a thin leader linking each shifted counter to its site. Inspection anchors, zoom-dependent fixed bottom building captions, input, artwork and gameplay rules remain unchanged.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6ac9b8e03d7cf70008acd162` published `2026-10-10T04:23:40.580Z`. All 56 staged and 168 public file comparisons passed on the primary `playcrownlands.com/play/` entry and both retained game hosts; manual publication hold remains enabled. itch.io upload `19666640` is selected/saved with actual Run game iframe `https://html-classic.itch.zone/html/19666640/index.html?v=1791606313`. At `2026-10-10T04:26:17.203Z`, 998 public files matched exactly and two entry HTML files matched using the established itch embed/newline normalization. Previous uploads remain preserved.
- **Validation:** required Static validation, Multiplayer emulator validation and Validate passed in [run 38022065505](https://github.com/explocion200/CrownLands/actions/runs/38022065505). Four selected overview-timer, estate-economy/integration, refresh and native-input validators, Node 22 syntax/lint, runtime sync, production artifact and asset budgets passed; no new emulator suite applies to this client-only change. Source and built fixtures cover each of all twenty sites and three concurrent groups at 1440×900, 844×390 and 568×320, including visible 88×40px overview counters, viewport bounds, spacing, ticking, authoritative completion, district-caption restoration, zoom/fit, offscreen handling, nonblocking overlays and cleanup. Exact merged/staged runtime parity was established before repeating the narrow timer checks at these sizes. Primary anonymous startup and six local/six public itch cold/reload cases passed, with exact stamps, sign-in bounds, upload-relative worker scope and all 81 active/prepared Core paths, without uncaught runtime or failed game-asset errors.
- **Targeted backend:** only `getRealmInfo` was redeployed for the merged release identity; its stored archive matches all 56 tracked runtime files and the manifest. All 144 Functions are ACTIVE on Node 22; the other 143 retain their source references, hashes and revisions. Its unauthenticated guard and the 29-callable access audit passed. Release ID, API contract and server fingerprint are unchanged; client fingerprint is `941cfda447b3de16d50aaa7879aeca972de99b9b0eb36cef648cc550d038b40f`. Read-only checks retain the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Limits:** verification used isolated estate fixtures and anonymous public startup. No current-build signed-in gameplay or actual installed-app/physical-device timer check is claimed. The earlier unreproduced freeze, live interrupted-payment replay, real commission deadline claim, seasonal rollover and human pacing remain separate manual checks in [the playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md).

Package `crownlands-html5-17494c17bc60.zip` is 60,093,861 bytes, SHA-256 `3e8fcb8d4a9ca5dea5079fd59701225e08ea28bc0272169c9b81c6ef042d3308`; its 1,000 files retain all current estate artwork and active/prepared Core payloads using established optional/inactive omissions. Sanitized receipts are under `release-artifacts/estate-overview-construction-timers/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified release — Whole-building selection and estate dragging

The authorized merge of [PR #512](https://github.com/explocion200/CrownLands/pull/512), from `codex/estate-building-hit-areas`, is verified on backend, web and itch.io at build `4680341ee82f4cc5cfb3a687cdbb07e43b6ddeed`. At inspection zoom, the full building artwork or surveyed/construction plot selects its site, including the offset Gatehouse. Mouse/touch drags can start on buildings or terrain; early pointer capture retains fast off-viewport movement and releases, while small click jitter still selects. Existing 2.5× inspection/directory behavior, fixed bottom captions, 1448×1086 map, artwork, gameplay and economy are retained.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6ac9aa919a691d0008277095` published `2026-10-10T03:05:15.312Z` (October 9, 11:05 PM Eastern). All 56 staged and 168 public comparisons passed on the primary `playcrownlands.com/play/` entry and both retained game hosts; manual publication hold remains enabled. itch.io upload `19665869` is selected/saved, with actual Run game iframe `https://html-classic.itch.zone/html/19665869/index.html?v=1791601574`. Public parity at `2026-10-10T03:07:27.103Z` matched 998 files exactly and two entry HTML files using the established itch embed/newline normalization; previous uploads remain preserved.
- **Validation:** all required Static validation, Multiplayer emulator validation and Validate checks passed in [run 38018277646](https://github.com/explocion200/CrownLands/actions/runs/38018277646). Four selected input/estate/integration/refresh validators, Node 22 syntax/lint, runtime sync, production artifact and asset budgets passed. No emulator suite applies to this client-only update. Source and built fixtures cover all twenty sites in all three visual states at 1440×900, 844×390 and 568×320, with 1,440 native edge clicks, including 1,344 outside the prior center target, plus mouse/touch drags, fast off-viewport release, jitter, slow drag, cancellation, pinch, keyboard and map action callbacks. The newly stamped merged artifact repeated the built input checks at these sizes after staged-file parity was established. Primary anonymous startup and six local/six public itch cold/reload cases passed, including exact stamps, sign-in bounds, upload-relative worker scope and all 81 active/prepared Core paths, without uncaught runtime or failed game-asset errors.
- **Targeted backend:** only `getRealmInfo` was redeployed to match the merged identity; the archive matches all 56 tracked runtime files and manifest. All 144 Functions are ACTIVE on Node 22, and the other 143 retain their source references, hashes and revisions. Its unauthenticated guard and the 29-callable access audit passed. Release ID, API contract and server fingerprint remain unchanged; client fingerprint is `fbfcbd23e44faeb60d8a309d0626048a673373b91fcdfc01e4f7936dd8394bf7`. Read-only checks retain the ready October realm and published rules. No rules/indexes, realm configuration or player records were administratively changed.
- **Limits:** this publication used anonymous startup and isolated input fixtures. A new signed-in session was unavailable because the QA browser was signed out; no current-build authenticated gameplay or actual installed-app/physical-device input check is claimed. The earlier unreproduced freeze, live interrupted-payment replay, real commission deadline claim, seasonal rollover and human pacing remain separate manual checks in [the playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md).

Package `crownlands-html5-4680341ee82f.zip` is 60,093,476 bytes, SHA-256 `f3be1377cd663dd3fb5717f84cc6882a71450ff128d4725be44aa19b91f4bf32`; its 1,000 files retain the current estate artwork and all active/prepared Core payloads with the established optional/inactive omissions. Sanitized receipts are under `release-artifacts/estate-building-hit-areas/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified release — Estate refresh action lock

The authorized merge of [PR #510](https://github.com/explocion200/CrownLands/pull/510), from `codex/estate-refresh-action-lock`, and matching backend, web and itch.io publication are verified at build `969e1ba9c508aeeae39a77a0bd56ab4165862e88`. Opening or refreshing an estate service immediately renders its busy state, visibly disabling submissions while retaining usable Close. Controls recover after the response; production quantity, expanded details and focus remain preserved. Prices, resource payment, timers, persistence, artwork and server rules are unchanged.

- **LIVE — ALL PUBLISHED CHANNELS:** Netlify deploy `6ac97b52aef43d0008b7ac04`, published `2026-10-09T23:44:19.987Z` (October 9, 7:44 PM Eastern), serves the merged artifact on the primary `playcrownlands.com/play/` entry and both retained game hosts. All 56 staged and 168 public file comparisons passed; the manual publication hold remains enabled. itch.io upload `19663396` was selected and saved; the actual Run game iframe is `https://html-classic.itch.zone/html/19663396/index.html?v=1791589510`. Public parity at `2026-10-09T23:46:25.770Z` verified 998 byte-exact files and two entry HTML files differing only by established itch embed-script/newline normalization. Earlier uploads are preserved.
- **Validation:** required Static validation, Multiplayer emulator validation and Validate passed in [run 38004096130](https://github.com/explocion200/CrownLands/actions/runs/38004096130). Three selected estate UI/refresh/integration validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. No new emulator suite applied to this client-only repair. Exact staged estate interactions passed at 1440×900, 844×390 and 568×320, including deferred opening/background refresh, disabled submissions, Close during loading, late-response cleanup and restored drafts/focus/details. Primary-domain anonymous startup and six local/six public itch cold/reload cases passed at these sizes, with exact build stamps, sign-in bounds, relative worker scope, all 81 active/prepared Core paths and no uncaught runtime or failed game-asset errors.
- **Targeted backend:** only `getRealmInfo` was redeployed for merged identity; its stored archive matches all 56 tracked runtime files and the manifest. All 144 Functions are ACTIVE on Node 22; the other 143 retain their source references, hashes and revisions. Its authentication guard and the 29-callable access audit passed. Release ID `crownlands-2026-10-08-estate-economy-v1`, API contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58` and server fingerprint `6fa89d29820d025ee43aa0eff65a9ba2796b111e4c0d5dcc322da858b2e3be60` remain unchanged; client fingerprint is `acb8169a19e8d8c52c6d9b1df5348ead8e078984e5ca2390a1932e21fefba392`. Read-only checks retain ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and rules SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. No rules, indexes, realm configuration or player records were administratively changed.
- **Signed-in smoke and limits:** the owner-authorized QA account entered the exact new build normally and reopened the estate. Guild opening controls were visibly disabled during refresh, Close stayed enabled and Review recovered after response. Forester Level 2 and Storehouse Level 1 remained saved. No gameplay order was submitted during this release smoke. The earlier optional-resource/reload interruption has no established cause and is not claimed fixed. Physical-phone/system-Back, live interrupted-payment replay, actual seven-day commission claim (approximately October 16 at 23:06 UTC), monthly rollover and human pacing remain separate checks in [the playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md).

Package `crownlands-html5-969e1ba9c508.zip` is 60,093,566 bytes, SHA-256 `eb6dfae9db35f9e24c80cfac5d97127c89b07a46a79cbde69dbb9aaa77ea1e08`; its 1,000 files retain current estate art and all active/prepared Core assets with the established optional/inactive channel omissions only. Sanitized receipts are under `release-artifacts/estate-refresh-action-lock/deployment/`. Before publication local `main` and `origin/main` were clean, equal to the merged build, with divergence `0 0`.

### Previous verified release — Guild training clarity and Inner Castle channel catch-up

The authorized merge of [PR #508](https://github.com/explocion200/CrownLands/pull/508), from `codex/estate-release-readiness`, and matching backend, web and itch.io publication are verified at build `39af6d9480cd330c9bc837e4e9c5f81a0f9d1cdd`. Guild screens explain partial/full next-level XP banks, zero new XP before paying for a capped quest, retained existing XP and the external Guild Upgrade route. Recruitment guidance connects the Alehouse and Guild. This clarifies existing rules; prices, rates, accepted timers, caps, persistence and artwork are unchanged. Current direct construction payment, prerequisite navigation, finite manual batches and Focused production UI are now available on both published channels.

- **`LIVE — ALL PUBLISHED CHANNELS`:** Netlify deploy `6ac963f12ec4390008d70b36`, published `2026-10-09T22:14:10.851Z` (October 9, 6:14 PM Eastern), serves the exact merged artifact. All 56 staged-file and 168 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`; the manual publication hold remains enabled. itch.io upload `19662086` was selected and saved, then its actual Run game iframe was observed at `https://html-classic.itch.zone/html/19662086/index.html?v=1791584119`. Public parity at `2026-10-09T22:16:37.319Z` verified all 1,000 files: 998 byte-exact and two entry HTML files differing only by known itch embed-script/newline normalization. Previous uploads remain preserved.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37993911834`](https://github.com/explocion200/CrownLands/actions/runs/37993911834). Seven selected validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. No new emulator suite applied to this presentation/documentation change. Exact staged estate interactions passed at 1440×900, 844×390 and 568×320, including all twenty sites, direct payment/Cancel/retry, prerequisite Back navigation, construction timers, Gear returns, finite production, partial/full/legacy XP banks, capped quest reviews, recruitment guidance and lifecycle cleanup. Primary-domain anonymous startup passed at all three sizes. Six local and six public itch.io cold/reload cases passed at those sizes, including exact full build stamps, sign-in form bounds, upload-relative workers, all 81 active/prepared Core paths and no uncaught runtime or failed game-asset errors.
- **Targeted backend:** only `getRealmInfo` was redeployed in `crown-land-b15e0` to carry the merged build identity. Its stored source matches all 56 tracked runtime files and the merged manifest. All 144 Functions are ACTIVE on Node.js 22; the other 143 retain their source references, hashes and revisions. The affected unauthenticated callable guard and the 29-callable postdeploy access audit passed. Release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `6fa89d29820d025ee43aa0eff65a9ba2796b111e4c0d5dcc322da858b2e3be60`, client fingerprint `0729d544495fb87e10afa56f277ac28dcc2aaa8bac9afa626f9e6d46a9f86d88` and 144-callable manifest are verified. Read-only checks retain ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and published Firestore rules SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. No rules, indexes, realm configuration or player records were administratively changed; no production gameplay orders were submitted.
- **Package and limits:** `crownlands-html5-39af6d9480cd.zip` is 60,093,549 bytes, SHA-256 `ce1d33f8e33bc3edeb6e7715f15ad7b6ebb1fb35dfed8840f5ddc28e296ea459`. Channel-only optional audio/guide omissions, inactive topology bitmaps and unreferenced obsolete art keep the package at 1,000 files; current runtime, estate art and active/prepared Core assets remain intact. [Progression journeys](estate-economy/PROGRESSION_PLAYTEST.md) and [the channel/playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md) distinguish isolated models, historical signed-in evidence and pending current-policy gameplay, physical-phone/system-Back, actual commission deadline claims and long-term human pacing. PR #497 was closed as superseded with its branch preserved; its conflicting older implementation was not merged. PR #466's stale open metadata was closed after verifying its earlier squash was already deployed; this release does not redeploy that work.

Sanitized receipts are retained under `release-artifacts/estate-release-readiness/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`. The following release entries describe their original publication scope, not the current channel gap.

**Subsequent signed-in QA — October 9, 2026:** the owner confirmed the dedicated account and authorized ordinary game spending. Current build `39af6d...` verified direct upgrade payment/Cancel, the natural Forester Level 2 completion and 116/hour benefit, one finite Food batch and delivery without repeat, retained older building credit, earlier quest completion/recovery/one-time reward claim and a funded 168-hour Treasury commission. Reload preserved the paid timer, Food and claimed-reward state; Gear return preserved the selected site and camera. The [playtest record](estate-economy/PLAYTEST_RELEASE_RECORD.md) records costs, evidence and limits. No administrative edits or Crown spending occurred. A refresh could leave service actions visibly enabled while its busy guard ignored clicks; the targeted action-lock repair on `codex/estate-refresh-action-lock` is now **LIVE — ALL PUBLISHED CHANNELS** at build `969e1ba...`, with release evidence above. Physical devices, live interrupted-response replay, real commission claim, seasonal rollover and human pacing remain separate checks. This QA does not alter approved gameplay or the published identity above.

### Previous verified web release — Manual production and Focused UI

The authorized merge and coordinated backend/web deployment of [PR #506](https://github.com/explocion200/CrownLands/pull/506), from `codex/estate-manual-production`, is verified at build `101d435ef095abcb392631dca1d28f908839337f`. Sawmill, Smithy, Workshop and Windmill require a chosen quantity and explicit **Start production** for each finite batch. The Focused UI puts the recipe, 1-to-Max slider, exact amount, step controls and **Material / Needed / You have** table first; production time and Start stay visible in the footer on small landscape screens. Building benefits, speed and protected-material settings are collapsed under **Production details**. Raw sources explain **Gathering automatically**. Missing-material and storage links select the supplying site and offer Back without spending.

- **`LIVE — WEB`:** Netlify deploy `6ac94efaa11c55000812cdb9`, published `2026-10-09T20:35:31.404Z` (October 9, 4:35 PM Eastern). All 56 staged-file and 168 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The exact merged artifact, manifest and full build stamp match; the manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37986910555`](https://github.com/explocion200/CrownLands/actions/runs/37986910555). Seven selected validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. The two selected economy emulator suites covered atomic payments, replay/concurrent starts, output reservations, frozen timers, delivery, migration and season persistence. Exact staged interactions passed at 1440×900, 844×390 and 568×320 for all four recipes, slider/step/Max/exact inputs, keyboard/touch, protected materials, full storage, source navigation/Back, confirmed completion notices, retained drafts/focus, lost-response retry, all twenty sites, construction/prerequisites, Gear, services and cleanup. Public anonymous startup passed at all three sizes without uncaught runtime errors.
- **Backend deployed:** `getEstateState`, `getEstateQuote`, `commitEstateAction`, `getEstateChampions`, `upgradeCommonGear` and `getRealmInfo` were updated in `crown-land-b15e0`. Stored source archives match all 56 tracked runtime files and the merged release manifest. All 144 Functions are ACTIVE on Node.js 22; the other 138 retain their source references, hashes and revisions. Five affected authenticated-callable guards and the 29-callable postdeploy access audit passed.
- **Identity and retained realm:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `6fa89d29820d025ee43aa0eff65a9ba2796b111e4c0d5dcc322da858b2e3be60`, client fingerprint `dce2447601aa7a7d7b097ad424f55f0abc39335253b07cef5a8566b09ccff9f5` and 144-callable manifest are verified. Read-only checks retain ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and published Firestore rules SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. No rules, indexes, realm configuration or player records were administratively deployed/edited; no production gameplay orders or migration writes were submitted. Legacy estates switch through their normal settlement, honoring already-accrued automatic production once.
- **Rules and limits:** ingredients are paid once, output storage is reserved, accepted timers and orders persist offline/across seasons, and completed output is delivered once with no repeat or queue. Recipes, capacity rates, construction prices, Gear and artwork are unchanged. itch.io retains upload `19646406` / build `27965d48b00b1067c3e622e222753f5338c8c0a6`; this channel was not republished and its preceding estate client needs the current web policy/client. Staged gameplay uses isolated fixtures. Authenticated production play, physical-phone/system-back checks and long-term human pacing remain manual; mathematical checks do not establish player satisfaction. The shared ledger alternative is not included.

Sanitized evidence is retained under `release-artifacts/estate-manual-production/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified web release — Building prerequisite navigation

The authorized merge and coordinated backend/web deployment of [PR #504](https://github.com/explocion200/CrownLands/pull/504), from `codex/estate-prerequisite-navigation`, is verified at build `11847639516e7dcef1af5d07e1add779699b95c9`. Blocked external Build/Upgrade panels list every unmet required building with its required and completed levels. **Build [building]** or **Upgrade [building]** selects and centers that site and opens its requirements. Players can follow branched dependencies, including Workshop → Sawmill → Forester’s Lodge, and use the visited trail and **Back to [building]** to return. Navigation spends nothing and starts no work. Only completed levels satisfy a requirement; running prerequisites show their existing paid project. Confirmed completion removes the blocker on refresh. Costs, durations, Gold/material payment, legacy paid credit, builders, Gear, fixed artwork, persistence and the no-queue rule remain unchanged.

- **`LIVE — WEB`:** Netlify deploy `6ac9239a4c742b000807123f`, published `2026-10-09T17:33:25.504Z` (October 9, 1:33 p.m. Eastern). All 56 staged-file and 168 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The exact merged artifact, manifest and full build stamp match; the manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37964734840`](https://github.com/explocion200/CrownLands/actions/runs/37964734840). Five selected validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. Estate economy and shared-economy concurrency emulator suites passed, covering authoritative prerequisite metadata, completion, rejected unusable quotes, atomic payment and retained receipts. Exact staged interactions passed at 1440×900, 844×390 and 568×320, covering branched chains, required/completed levels, Hall gates, in-progress prerequisites, touch/mouse/keyboard, 44-pixel targets, map centering, Back, heading and Cancel focus, no navigation payment, all twenty sites, direct payment/legacy credit, Gear, services and cleanup. Public anonymous startup passed at all three sizes without uncaught runtime errors.
- **Backend deployed:** `getEstateState`, `getEstateQuote`, `commitEstateAction`, `getEstateChampions`, `upgradeCommonGear` and `getRealmInfo` were updated in `crown-land-b15e0`. Their stored source archive matches all 56 tracked runtime files and the merged release manifest. All 144 Functions are ACTIVE on Node.js 22; the other 138 retain their source references, hashes and revisions. Five affected authenticated-callable guards and the 29-callable postdeploy access audit passed.
- **Identity and retained realm:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `ad4ae7fcff3e85575089f4564bb8b1721de677b956ea24a3a493b391521557d1`, client fingerprint `83dbe86232c6498a6d26bb1a300280367b2279745ecba22f928e2f22d905af9c` and 144-callable manifest are verified. Read-only checks retain ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and published Firestore rules SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. No rules, indexes, realm configuration or player records were administratively deployed/edited, and no production gameplay orders or data migration were submitted.
- **itch.io and limits:** its fresh public manifest still identifies upload `19646406` / build `27965d48b00b1067c3e622e222753f5338c8c0a6`; this channel was not republished. Use the current web build for estate construction because the preceding construction-policy client waits for a matching policy. This feature is `LIVE — WEB`. Staged gameplay used isolated fixtures; authenticated production starts, physical-phone/system-back checks and long-term human pacing remain manual. PR #497 remains separately unmerged and is not included.

Sanitized evidence is retained under `release-artifacts/estate-prerequisite-navigation/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified web release — Build/Upgrade material payment

The authorized merge and coordinated backend/web deployment of [PR #502](https://github.com/explocion200/CrownLands/pull/502), from `codex/estate-build-upgrade-material-payment`, is verified at build `f7c063eb33c43c583debd334bbc036832955a5cc`. The external requirements panel shows resources, available stocks, exact Gold, construction time and current/next benefits. **Build Level 1** or **Upgrade to Level N** pays Gold and outstanding materials atomically and starts that one quoted level; **Cancel** returns to the estate without spending. New material deposits are removed. Previously accepted credit, bills and receipts remain honored without duplicate charges. Approved costs, timers, rewards, seasonal persistence, Hall gates, builders, fixed artwork and the no-queue rule are retained.

- **`LIVE — WEB`:** Netlify deploy `6ac91198e89cc0000893d7a7`, published `2026-10-09T16:13:44.738Z` (October 9, 12:13 p.m. Eastern). All 56 staged-file and 168 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The exact merged artifact, manifest and full build stamp match; the manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37902556940`](https://github.com/explocion200/CrownLands/actions/runs/37902556940). Eight selected validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. Estate economy, shared-economy concurrency and coordinated-release emulator suites passed, including direct material/Gold payment, insufficient-resource and builder rejections without partial charges, legacy credit/deposit receipt replay, lost-response recovery, duplicate and conflicting starts, and reset persistence. Exact staged estate interaction checks passed at 1440×900, 844×390 and 568×320; Cancel, available-stock readiness, legacy credit, old-server policy waiting, all twenty sites, services, Gear returns and cleanup were covered. Public anonymous startup passed at all three sizes without uncaught runtime errors.
- **Backend deployed:** `getEstateState`, `getEstateQuote`, `commitEstateAction`, `getEstateChampions`, `upgradeCommonGear` and `getRealmInfo` were updated in `crown-land-b15e0`. Their stored source archive matches all 56 tracked runtime files and the merged release manifest. All 144 Functions are ACTIVE on Node.js 22; the other 138 retain their source references, hashes and revisions. Five affected authenticated-callable guards and the 29-callable postdeploy access audit passed.
- **Identity and retained realm:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `46c6437f2bdd31cb95826990b202ed8e11fc90f696796792225b7b4c4fc99efd`, client fingerprint `d05a47c4a67cd6019077cb7134da41dde6f9c404d6841a722b904486414bbc48` and 144-callable manifest are verified. Read-only checks retain ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and published Firestore rules SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. No rules, indexes, realm configuration or player records were administratively deployed/edited, and no production gameplay orders or data migration were submitted.
- **itch.io and limits:** its fresh public manifest still identifies upload `19646406` / build `27965d48b00b1067c3e622e222753f5338c8c0a6`; this channel was not republished. Construction policy guards make older clients wait for a matching client/backend rather than submit the retired deposit flow; use the current web build for estate construction. The change is `LIVE — WEB`. Staged gameplay used isolated fixtures; authenticated production starts, physical-phone/system-back checks and long-term human pacing remain manual. PR #497 remains separately unmerged and is not included.

Sanitized evidence is retained under `release-artifacts/estate-material-payment/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified web release — Estate refresh and short-screen HUD performance

The authorized merge and web deployment of [PR #500](https://github.com/explocion200/CrownLands/pull/500), from `codex/game-health-performance-review`, is verified at build `74645db3f91693ac1239d8509acd29e2071a1c4f`. Unchanged estate resource, timer and management refreshes avoid redundant DOM writes, and unchanged building levels/states preserve detail nodes and skip repeated map layout. Fresh receipts, balances, construction deadlines and confirmed completions continue to update. The short-landscape combat-timer selector limits style invalidation to the existing HUD subtree. Approved gameplay, economy, artwork and the preceding direct building-start behavior are retained.

- **`LIVE — WEB`:** Netlify deploy `6ac8706c706414000862f1b1`, published `2026-10-09T04:44:26.782Z` (October 9, 12:44 a.m. Eastern). All 56 staged-file and 168 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`, including both estate scripts and the changed HUD stylesheet. The exact merged artifact and full build stamp match; the manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37883732613`](https://github.com/explocion200/CrownLands/actions/runs/37883732613). Seven selected local validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. Exact staged estate interactions passed at 1440×900, 844×390 and 568×320. Staged refresh checks retained zero mutations for unchanged resources and estate snapshots, fresh receipts and construction completion. The staged short-screen trace recorded ten style updates with a maximum of 92 affected elements, and timer/alert visibility checks passed at all three sizes. Public anonymous desktop/mobile startup passed without uncaught runtime errors. Emulator suites were not required for this client-only update.
- **Backend compatibility:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `0f18ff66712056e19ad0f4d4ac74459a6519321fbddf33918013d7cbc0ee564c` and 144-callable manifest match the preceding verified web release. The client fingerprint is `4b04716241a69aa0a648501cad9f45e19b10fd2654665fab4362ea5b10001d8a`. Backend/rules/indexes/Firebase deployment source is unchanged from that release. No Functions, rules, indexes, realm configuration or player records were deployed or edited, and no production gameplay orders were submitted.
- **itch.io and limits:** a fresh public manifest check retained upload `19646406` and build `27965d48b00b1067c3e622e222753f5338c8c0a6`; this channel was not republished. The performance correction is `LIVE — WEB`. Staged gameplay used isolated fixtures; authenticated production play, physical-phone checks, crowded-map capacity and long soaks remain unverified. The broader review and remaining performance opportunities are recorded in [the game health review](GAME_HEALTH_REVIEW.md). PR #497 remains separately unmerged and is not included.

Sanitized evidence is retained under `release-artifacts/game-health-performance-review/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified web release — Direct building starts

The authorized merge and web deployment of [PR #498](https://github.com/explocion200/CrownLands/pull/498), from `codex/estate-upgrade-payment-confirmation`, is verified at build `f49871ade7b09702541782b011efff820a5cc342`. The external requirements panel displays the next target, material credit, Gold, duration and benefits. Selecting **Build Level 1** or **Upgrade to Level N** starts that exact quoted level directly, without a second payment review or checkbox. Material deposits retain their separate permanent-credit review. Duplicate-click guards, original-request replay, authoritative quote rejection and the no-queue rule remain in force. Costs, timers, benefits, persistence, artwork and fixed captions are unchanged.

- **`LIVE — WEB`:** Netlify deploy `6ac85e4543f7880008c31cf9`, published `2026-10-09T03:29:52.391Z` (October 8, 11:29 p.m. Eastern). All 55 staged-file and 165 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled. The local artifact used Netlify's full commit stamp for exact comparison.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37878173214`](https://github.com/explocion200/CrownLands/actions/runs/37878173214). Four focused validators, Node 22 syntax/lint, runtime synchronization, production artifact and asset budgets passed. Exact staged interaction checks passed at 1440×900, 844×390 and 568×320: direct deposited upgrades and Gold-only first construction, duplicate clicks, expired quote rejection with no automatic retry/start, original-request recovery after a lost response, unchanged deposit consent, all twenty sites, camera/touch/keyboard, timers, Gear returns, services and cleanup. Public anonymous desktop/mobile startup passed without uncaught runtime errors. No server change required new emulator suites.
- **Backend retained:** all 144 Node.js 22 Functions remain ACTIVE with their exact prepublication source references, hashes and revisions. Four estate callable authentication guards passed. Release ID remains `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `0f18ff66712056e19ad0f4d4ac74459a6519321fbddf33918013d7cbc0ee564c`. The new client fingerprint is `6ad6d40ac46b1c92ba4b1568baba33a63ea1362d160152e5565c7b48915e4acf`.
- **Realm and rules:** read-only verification retained ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and published Firestore rules SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. Functions, rules, indexes, realm configuration and player records were not deployed or edited; no production gameplay orders or data migration were submitted.
- **itch.io:** its public manifest still identifies upload `19646406` and the preceding verified build `27965d48b00b1067c3e622e222753f5338c8c0a6`. The matching new `crownlands-html5-f49871ade7b0.zip` is prepared with 1,000 files, all active/prepared Core payloads and estate artwork, and all six local cold/reload checks passed. It is **not published**: the Chrome publishing connection is unavailable. ZIP SHA-256 is `4bc2fe68d4bc19871d47d35546c58e4e20e6923a3b19bb59359984ba8a3968b6`. This direct-start change is `LIVE — WEB`, not all channels.
- **Limits:** staged gameplay used isolated synthetic fixtures; public startup and guard probes were anonymous. Signed-in production starts and physical-phone/system-back checks remain manual. PR #497's Guild XP/pacing follow-up remains separately unmerged and is not included in this release.

Sanitized evidence is retained under `release-artifacts/estate-upgrade-payment-confirmation/deployment/` and the sibling `itch/` directory. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Previous verified web release — Inner Castle management and Build labels

The authorized merge and coordinated backend/web deployment of [PR #495](https://github.com/explocion200/CrownLands/pull/495), from `codex/estate-management-polish`, is verified at build `27965d48b00b1067c3e622e222753f5338c8c0a6`. The Estate overview shows builders, projects and rewards with explicit service navigation and a reopenable starter guide. District-preserving directory filters use authoritative upgrade readiness; production help links to sources, storage and reserves. Existing unlock previews, confirmed completion notices and champion/recruit/expedition cards improve management. First construction reads **Build** on the map, in details, in the directory and in accessible descriptions; it changes to **Upgrade** after the server confirms Level 1. Approved costs, timers, rewards, persistence, artwork, fixed captions and explicit deposit/start/claim flows are retained.

- **`LIVE — WEB`:** Netlify deploy `6ac836f5ea6c2e00084a2a17`, published `2026-10-09T00:43:51.306Z`. All 55 staged-file and 165 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37863415157`](https://github.com/explocion200/CrownLands/actions/runs/37863415157). Six selected local validators, syntax/lint, production artifact and asset budgets passed; estate, shared-economy concurrency and coordinated-release emulator suites passed. Exact staged runtime checks passed at 1440×900, 844×390 and 568×320, covering all twenty sites, Gold-only first construction, focused Build→Upgrade transitions, deposits/retry, timers, map/camera/touch/keyboard, Gear returns, overview/filters, blocker guidance, milestones, guide preferences, champion XP/availability, confirmed feedback and scene cleanup. Public anonymous desktop/mobile startup passed without uncaught runtime errors.
- **Targeted backend:** `getEstateState` and `getRealmInfo` are ACTIVE on Node.js 22 with the merged source and release manifest; their stored archive matches all 56 checked runtime files. The other 142 functions retain their exact predeployment source references and revisions; all 144 remain ACTIVE. The deployment hook's 29-callable access audit and nine authentication-guard probes passed. Release ID remains `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`. The updated bundle's server fingerprint is `0f18ff66712056e19ad0f4d4ac74459a6519321fbddf33918013d7cbc0ee564c`; the client fingerprint is `ec42241879ec4cc1e615fcdfa5f1c682f9390f5735410bbbb8516b80548bffd2`. Optional readiness uses existing construction quotes and prepared Gold; ordinary reads retain their lightweight path.
- **Realm and rules:** read-only postdeployment verification retained ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and matching published Firestore rules. Rules, indexes, realm configuration and player records were not edited for this deployment; no gameplay orders or data migration were submitted.
- **Limits:** itch.io was not republished. Signed-in production play, physical-device review and human long-term pacing remain manual. Staged interactions used isolated synthetic fixtures, while public startup and guard probes used anonymous requests.

Sanitized evidence is retained under `release-artifacts/estate-management-polish/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — Inner Castle building service polish

The authorized merge and web deployment of [PR #493](https://github.com/explocion200/CrownLands/pull/493), from `codex/estate-building-mechanics-polish`, is verified at build `50a795d98beb55c276f2c1c55ff02778bb6db4a4`. All twenty building roles describe their implemented benefits. Service screens show ingredient recipes, individual storage, champion power and party requirements, availability and unlocks. Refreshes preserve drafts, consent, scroll and exact-control focus. Deposit review names its building/target, Back refreshes requirements, daily services refresh at the UTC boundary, and open commission windows settle their deadline over suspended Gear with focus restored to the current opener. Approved costs, timers, rewards, persistence, artwork and fixed map positions remain unchanged.

- **`LIVE — WEB`:** Netlify deploy `6ac820fc75ca410008642d8b`, published October 8 at `23:05:43.010 UTC` (7:05 p.m. Eastern). All 55 staged-file and 165 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37853098246`](https://github.com/explocion200/CrownLands/actions/runs/37853098246). Six selected local rule/arithmetic/cohort/browser/registry/integration validators, syntax/lint, production artifact and asset budgets passed. No server change required emulator suites. The exact staged runtime passed at 1440×900, 844×390 and 568×320: all twenty sites, deposits/retry, map actions, construction timers, Gear returns, service unlocks, party power/busy champions, recipes/storage ledgers, shared supplies, field/consent/focus preservation, UTC refresh and commission readiness/cleanup. Public anonymous startup passed at desktop and landscape-mobile sizes without uncaught errors.
- **Backend retained:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `b44708b2d69f25282b7eb78272d4e04e6286fef9a2d325130cb39459355106f5` and the 144-callable manifest match the preceding verified release. Backend/rules source is unchanged. Read-only checks retained ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and matching published Firestore rules. Functions, rules, indexes, realm configuration and player records were not redeployed or modified. The client fingerprint is `dac5a9160fee7024f69365245c51798954c1c3ee36a347aa18a336efe4e960a6`.
- **Limits:** itch.io was not republished. Signed-in production play, physical-device review and human long-term pacing remain manual. Synthetic interactions used isolated fixtures and submitted no production gameplay actions. The individual-building reference-season budgets do not promise a complete twenty-building estate in ten seasons; see [the mechanics review](estate-economy/BUILDING_MECHANICS_REVIEW.md).

Sanitized evidence is retained under `release-artifacts/estate-building-mechanics-polish/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — Compact map actions and normal UI buttons

The authorized merge and web deployment of [PR #491](https://github.com/explocion200/CrownLands/pull/491), from `codex/estate-smaller-action-buttons`, is verified at build `db317e04fe9962e29a3c5fe3c3544e8bb388a77e`. Selecting an estate building shows compact 48px Upgrade-left and Enter-right hex controls beside its artwork when space permits. Details and all twenty directory rows use normal parchment text buttons; building interiors retain normal UI controls. Both styles preserve touch/keyboard access, disabled Enter before Level 1 completion, services/Gear returns and the existing deposit-then-start rules.

- **`LIVE — WEB`:** Netlify deploy `6ac806d86f6e56000879ec09`, published October 8 at `21:15:55.555 UTC` (5:15 p.m. Eastern). All 55 staged-file and 165 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37843621907`](https://github.com/explocion200/CrownLands/actions/runs/37843621907). Two selected local validators, JavaScript lint/syntax, production artifact and asset budgets passed; no server change required emulator suites. The exact staged runtime passed at 1440×900, 844×390 and 568×320: compact map geometry and label bounds, normal details/directory styling with at least 44px targets, all twenty menu/upgrade paths, four Gear destinations/returns, disabled/unbuilt states, deposits and explicit starts, lost-acknowledgment retry, camera/focus preservation, keyboard/touch and construction-timer lifecycle. Public anonymous startup passed at desktop and landscape-mobile sizes without uncaught errors.
- **Backend retained:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `b44708b2d69f25282b7eb78272d4e04e6286fef9a2d325130cb39459355106f5` and 144-callable manifest match the preceding verified release. Backend/rules source is unchanged. Read-only checks retained ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and matching published Firestore rules. Functions, rules, indexes, realm configuration and player records were not redeployed or modified. The client fingerprint is `ccbbcea19aabf2c6e3d010bf8c15decea4f279b1306f5e3efcbe5716599532d3`.
- **Limits:** itch.io was not republished. Signed-in production play and physical-device review remain manual. Synthetic interactions used isolated fixtures and submitted no production gameplay actions. Economy costs, timers, persistence and rewards are unchanged.

Sanitized evidence is retained under `release-artifacts/estate-smaller-action-buttons/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — Curved construction timers

The authorized merge and web deployment of [PR #489](https://github.com/explocion200/CrownLands/pull/489), from `codex/estate-curved-construction-timers`, is verified at build `5163ac1b2d4d6b75c9f680ebdab69f90669f59e2`. Running first builds and upgrades show an ochre-gold arc above their artwork, filling toward completion with remaining time. The arc keeps its screen size and fixed top anchor through pan, zoom and resize; building names/levels remain below. Crowded or offscreen timers retain directory countdowns. At zero, Finishing… waits for authoritative completion.

- **`LIVE — WEB`:** Netlify deploy `6ac7f5fee4ace3000851cac7`, published October 8 at `20:04:36.947 UTC` (4:04 p.m. Eastern). All 55 staged-file and 165 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37832477572`](https://github.com/explocion200/CrownLands/actions/runs/37832477572). Five selected local validators, production artifact and asset budgets passed; no server change required emulator suites. The exact staged runtime passed at 1440×900, 844×390 and 568×320: all twenty sites, first builds and concurrent jobs, independent arcs/countdowns, stopped-production ticking without polling, fixed top geometry, server-only completion, legacy paused work, hidden-document pausing, directory fallback and Gear/scene cleanup. Existing deposits, explicit starts, left/right actions, services, camera and keyboard/touch returns passed. Public anonymous startup passed at desktop and landscape-mobile sizes without uncaught errors.
- **Backend retained:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `b44708b2d69f25282b7eb78272d4e04e6286fef9a2d325130cb39459355106f5` and 144-callable manifest match the preceding verified release. Backend/rules source is unchanged. Read-only checks retained ready `realm-2026-10 / main-realm-2026-10 / shard_0001` and matching published Firestore rules. Functions, rules, indexes, realm configuration and player records were not redeployed or modified. The client fingerprint is `c1c081d6fe901972565b991d856f076d66e01db6978bf0f5dd4829f9f6fd2c92`.
- **Limits:** itch.io was not republished. Signed-in production play and physical-device review remain manual. Synthetic interactions used isolated fixtures and submitted no production gameplay actions. Economy costs, timers, persistence and rewards are unchanged.

Sanitized evidence is retained under `release-artifacts/estate-construction-timers/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — City-style estate Upgrade and Enter

The authorized merge and web deployment of [PR #487](https://github.com/explocion200/CrownLands/pull/487), from `codex/estate-upgrade-enter-buttons`, is verified at build `786781dd1dab50bce4f14e034835d8e3015e5a7f`. Selecting a building stays on the estate. Upgrade appears on the left in the city map's gold hex style; Enter appears on the right and opens services or the appropriate officer Gear screen. Both actions retain 64px targets with selected-site and directory access. Unbuilt sites disable Enter; later upgrades retain completed services. Fixed bottom captions, permanent deposits and explicit single-level starts are preserved.

- **`LIVE — WEB`:** Netlify deploy `6ac7e5700533f200083bd1c9`, published October 8 at `18:52:18.200 UTC` (2:52 p.m. Eastern). All 55 staged-file and 165 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37825498131`](https://github.com/explocion200/CrownLands/actions/runs/37825498131). Six selected local validators, the production artifact and asset budgets passed; no server change required emulator suites. The exact staged runtime passed at 1440×900, 844×390 and 568×320: all twenty menus and external upgrades, four Gear destinations/returns, left/right geometry and city styling, deposits/no queues, busy builders, lost-acknowledgment retry, keyboard/touch, focus returns and cleanup. Public anonymous startup passed at desktop and landscape-mobile sizes without uncaught errors.
- **Backend retained:** release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `b44708b2d69f25282b7eb78272d4e04e6286fef9a2d325130cb39459355106f5` and 144-callable manifest match the preceding verified release. Backend/rules source is unchanged from that release. Functions, rules, indexes, realm configuration and player records were not redeployed or modified. The client fingerprint is `9b2c89ba072e0c052f16f3bc4630f772f48f24947647da7fff445565a2ddd320`.
- **Limits:** itch.io was not republished. Signed-in production play and physical-device review remain manual. Synthetic interactions used isolated fixtures and submitted no production gameplay actions. Economy costs, timers and rewards are unchanged.

Sanitized evidence is retained under `release-artifacts/estate-action-buttons/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — External building upgrades

The authorized merge and coordinated backend/web deployment of [PR #485](https://github.com/explocion200/CrownLands/pull/485), from `codex/estate-map-upgrades-no-queue`, is verified at build `b000ba0f9eac589406d2b815a6cea251487b1417`. Every estate building has a separate map/directory requirements action. Players deposit materials toward that building, then explicitly start its next single level after full material credit, enough Gold and a free builder. New batches and queues are rejected by the server. Existing paid work retains its saved terms and pause/resume rights. Interiors retain their services and officer commissions; prices, timers, rewards, artwork and fixed captions are unchanged.

- **`LIVE — WEB`:** Netlify deploy `6ac7d33e656c520008e41a30`, published October 8 at `17:42:21.867 UTC` (1:42 p.m. Eastern). All 54 staged-file and 162 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37815523137`](https://github.com/explocion200/CrownLands/actions/runs/37815523137). Seven selected local validators, production artifact and asset budgets passed. The exact staged runtime passed at 1440×900, 844×390 and 568×320: all twenty external upgrade actions, partial/full deposits, no new queues, busy builders, lost-acknowledgment retry, keyboard/touch input, camera, construction artwork, resource ledgers, Gear services and cleanup. Public anonymous startup passed at desktop and landscape-mobile sizes without uncaught errors.
- **Backend:** all 144 functions are active on Node.js 22. Deployed source archives match all 56 checked runtime files and the merged manifest in each of six deployment source groups. Release ID remains `crownlands-2026-10-08-estate-economy-v1`; contract remains `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`. Server fingerprint is `b44708b2d69f25282b7eb78272d4e04e6286fef9a2d325130cb39459355106f5`; client fingerprint is `0a0e50531d3bfe081ce624797e01ce65c32872cfcb0e5b480ef7a72f3baa738d`. Postdeploy callable-access checks and eight targeted authentication-guard probes passed.
- **Realm and rules:** read-only verification retained ready `realm-2026-10 / main-realm-2026-10 / shard_0001`. Published Firestore rules match the repository and were not redeployed; indexes, realm configuration and player records received no manual migration or reset.
- **Limits:** itch.io was not republished. Signed-in production gameplay and physical-device feel remain manual checks. Synthetic interaction tests submitted no production gameplay actions. Manual starts can leave builders idle between visits; the shared-account review documents this pacing effect without changing material or timer budgets.

Sanitized evidence is retained under `release-artifacts/estate-map-upgrades/deployment/`. Before deployment, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — Fixed western district labels

The authorized merge and web deployment of [PR #483](https://github.com/explocion200/CrownLands/pull/483), from `codex/estate-fixed-western-districts`, is verified at build `75a5829d3077432ad44cc486bc37a80d273e6de5`. Quarry Hills and Woodland stay anchored beneath their actual quarry and forestry sites through pan, zoom and resize. Obstructed labels hide instead of relocating into decorative scenery. The layout keeps all seven district controls separate on small landscape screens and avoids offsets left by the opening transition. Existing building captions, district destinations, artwork, economy and equipment returns are retained.

- **`LIVE — WEB`:** Netlify deploy `6ac7c4a2b94adf0008422c0b`, published October 8 at `16:31:56.190 UTC` (12:31 p.m. Eastern). All 54 staged-file and 162 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37808243789`](https://github.com/explocion200/CrownLands/actions/runs/37808243789). Emulator suites were correctly inapplicable to this presentation-only change. Production artifact validation and the exact staged-runtime estate checks passed at 1440×900, 1280×590, 844×390 and 568×320, covering fixed anchors, resize, seven district controls, twenty sites, pan/zoom, building captions, equipment returns and cleanup. Public anonymous startup passed at desktop and landscape-mobile sizes without uncaught errors.
- **Backend retained:** release `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `cf9e87c3f63fca55afba6108899b5aa94a4b24496563f84df0bfb78afbdb2f64` and 144-callable manifest match the preceding release. Functions, rules, indexes and player data were not redeployed or changed. The client fingerprint is `fcf1d7fb421eff3f479650e2cbba233bcacd6f4788ed8033948f97046ab0b476`.
- **Limits:** itch.io was not republished. Signed-in production play and physical-device review remain manual. The existing economy pacing limitation is unchanged. Synthetic smoke used isolated fixtures and submitted no production gameplay actions.

Sanitized evidence is retained under `release-artifacts/estate-fixed-western-districts/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build, with divergence `0 0`.

### Previous verified web release — Fixed building captions

The authorized merge and web deployment of [PR #481](https://github.com/explocion200/CrownLands/pull/481), from `codex/estate-labels-below-buildings`, is verified at build `8ebe5abe21b05f24fab7701cc62f4f617c447d74`. Building names and levels stay centered beneath their artwork through pan, zoom and selection; hover and keyboard-focus text uses the same bottom anchor. Crowded/offscreen captions hide instead of moving above or beside buildings. The district zoom threshold, approved artwork, economy and equipment behavior are retained.

- **`LIVE — WEB`:** Netlify deploy `6ac7b2e65b9f420008107e7e`, published October 8 at `15:16:55.080 UTC` (11:16 a.m. Eastern). All 54 staged-file and 162 public-file comparisons passed across `playcrownlands.com/play/`, `crownland.netlify.app` and `game.playcrownlands.com`. The manual publication hold remains enabled.
- **Validation:** required `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37796858792`](https://github.com/explocion200/CrownLands/actions/runs/37796858792). Focused estate geometry/artwork, desktop/landscape browser and economy UI checks, syntax/lint, production artifact and asset budgets passed. No server change required a new emulator suite; the multiplayer check explicitly passed without one.
- **Delivered runtime:** the exact staged artifact passed all twenty sites at 1440 × 900, 1280 × 590, 844 × 390 and 568 × 320, including below-building caption/focus geometry, pan/zoom, construction states, target access and equipment returns. Public anonymous startup passed at desktop and mobile landscape with zero runtime exceptions.
- **Backend retained:** release `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server fingerprint `cf9e87c3f63fca55afba6108899b5aa94a4b24496563f84df0bfb78afbdb2f64` and 144-callable manifest match the preceding verified production release. Functions, rules, indexes and player data were not redeployed or changed. The new client fingerprint is `a1cbd1ab3400739e6170b462d8d10b23c95661c960f1aa591bbb62213cdf034e`.
- **Limits:** itch.io was not republished. Signed-in production play and physical-device checks remain manual; the existing long-term economy pacing limitation remains as recorded below. Synthetic smoke used isolated fixtures and submitted no production gameplay actions.

Sanitized evidence is retained under `release-artifacts/estate-fixed-captions/deployment/`. Before publication, local `main` and `origin/main` were clean and equal to the merged build with divergence `0 0`.

### Current verified backend and preceding web release — Permanent Inner Castle economy

The user-authorized merge and deployment of [PR #479](https://github.com/explocion200/CrownLands/pull/479), from `codex/estate-economy-readiness`, is verified at build `a4cd34668464d047818f2663da38a3eb76bf6004`. All twenty estate buildings now support permanent Level 1–100 progression, material production and processing, storage, deposits and funded construction, officer Gear commissions and rarity access, champions, quests, recovery, meals and bounded Crown supplies. The centered material counters use authoritative state with local display projections. Approved estate artwork, dimensions, camera and equipment returns are preserved.

| Channel / validation | Verified result |
|---|---|
| Primary web game and both game hosts | **`LIVE — WEB`**; Netlify deploy `6ac721be63a8f1000877ff5d`, published October 8 at `05:02:53 UTC` (1:02 a.m. Eastern). The primary `https://playcrownlands.com/play/` entry, `crownland.netlify.app` and `game.playcrownlands.com` match the merged artifact. The existing manual publication hold remains enabled. |
| Release gates and artifact parity | Nineteen focused local validators and required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37726274458`](https://github.com/explocion200/CrownLands/actions/runs/37726274458). All five selected emulator suites passed: reset, coordinated release, cosmetics, economy concurrency and estate economy. The merged production artifact passed validation; all 54 staged-file and 162 public-file comparisons across three hosts match. The local artifact was rebuilt with Netlify's full commit stamp before comparison. |
| Firebase Functions and rules | All 144 Node.js 22 Functions are ACTIVE. All six uploaded source groups match the merged manifest and 56 tracked runtime files per group, including dependency locks. The first rollout hit mutation-rate limits and left 23 old revisions; a targeted retry completed, followed by a complete source inventory. Deployed Firestore rules match source SHA-256 `5aeab4b633883e5cb18a913b3f2dea74eafb3a8e8c977c5db95848298864a945`. No indexes changed. The 29-callable access audit and eight affected authentication guards passed, including all four estate endpoints. |
| Release identity and realm | Release ID `crownlands-2026-10-08-estate-economy-v1`, contract `c22b238945d99fc34e6d3b713e4711266f73320dc8a4f79ca5e4fe89bcfd2c58`, server source `cf9e87c3f63fca55afba6108899b5aa94a4b24496563f84df0bfb78afbdb2f64`, client source `30a60d9fb8c6afdc428383deb519d13a55fafe4d2b1fc045e1ecb66bff9e9d7e`. The October pointer was read-only verified as ready at `realm-2026-10 / main-realm-2026-10 / shard_0001`; its stored release label still reflects the previous release and is not the deployed source identity. No reset or manual player-data repair was performed. |
| Runtime smoke | The exact staged runtime passed economy quotes, confirmation, lost-acknowledgement retry, material ledgers, construction artwork, camera preservation, equipment returns, keyboard dismissal and scene cleanup at 1440 × 900 and 844 × 390. Twenty additional equipment-return cases and public anonymous startup passed with zero runtime exceptions. Synthetic actions used isolated fixtures, never production accounts or spending. |
| Persistence and balance evidence | Emulator coverage includes concurrent spending, replay, owner-only estate reads and server-only writes, Gear migration, permanent champions/rewards, and a real monthly realm-entry path preserving estate records while seasonal Gold resets. Reproducible reference and shared-account simulations passed. The cumulative 1/3/6/10-season material targets apply to each chosen building at 50% reference production, not all twenty together; modeled balanced whole-estate routes take roughly six years to complete all twenty Level 100 buildings. Human pacing review remains necessary. |
| itch.io and manual review | itch.io was not republished; the estate economy is verified as `LIVE — WEB` only. Authenticated production gameplay, physical-device/system-back behavior and long-term reward pacing remain manual checks. |

Sanitized deployment, source, rules, public-file and browser evidence is retained under `release-artifacts/estate-economy-readiness/deployment/`. Before publication, local `main` and `origin/main` were clean, equal to the merged build, with divergence `0 0`.

### Previous verified web/backend release — Estate labels, resources and navigation

The user-authorized merge and deployment of [PR #477](https://github.com/explocion200/CrownLands/pull/477), from `codex/estate-building-labels`, is verified at build `d84754fc1f92fb45f89e6518b0672f6bbca49d29`. The estate now shows compact building names/levels at district zoom, a centered resource ledger, geographically anchored district labels and **Back to Realm**. Drag/pinch gestures also work when started on building or district targets. Approved artwork, map size and equipment returns are preserved.

| Channel / validation | Verified result |
|---|---|
| Primary web game and both game hosts | **`LIVE — WEB`**; Netlify deploy `6ac6eb41ac83e300087c1f52`, published October 8 at `01:10:21.508 UTC` (October 7, 9:10 p.m. Eastern). The primary `https://playcrownlands.com/play/` entry, `crownland.netlify.app` and `game.playcrownlands.com` match the merged artifact. The existing manual publication hold remains enabled. |
| Release gates and artifact parity | All eleven focused local validators and required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37706592308`](https://github.com/explocion200/CrownLands/actions/runs/37706592308). Relevant authentication and economy-concurrency emulator suites passed. The merged production build passed artifact validation; 51 staged files and 153 public-file comparisons across three hosts match. |
| Firebase Functions | All 140 existing Node.js 22 Functions are ACTIVE on the merged release. All six deployment-source groups were downloaded and checked against the merged manifest and 52 tracked runtime files per group, including the approved `proxy-addr 2.0.8` and `@fastify/busboy 3.2.2` dependency locks. Two endpoints initially failed during the rate-limited rollout; the narrow retry succeeded. The 29-callable access audit and six affected Gear/cosmetic/checkout authentication guards passed. |
| Release identity and current realm | Release ID `crownlands-2026-10-06-linked-account-capture-v1` and contract `637489cef89975fd10483831aeb70298f7243fab39db343ed5c062386c4d312c` are retained; server source is `52102d866701bf631cd33e1a30de22d6730719cc1d0523b4e472ebd1f17b5cf5`. The October pointer was read-only verified as `realm-2026-10 / main-realm-2026-10 / shard_0001`, ready. No rules/index deployment, reset or production-data migration was performed. |
| Runtime smoke | The delivered estate passed all twenty-site checks at desktop and three landscape sizes, including counters, labels, directory, mouse/touch/keyboard controls, 32 Back and 36 X/touch/Escape/backdrop equipment returns. The exact public artifact also passed twenty equipment returns at 1440 × 900 and 844 × 390, plus anonymous startup at the primary game entry with no runtime exceptions. |
| Economy implementation | **Still `PLANNED`.** Gold/Crowns use existing balances; unavailable materials display unknown values, not granted resources. Gathering, construction, deposits, queues, saved building levels, champion systems, supply purchases and rarity gates are not implemented by this release. The [reward review](estate-economy/REWARD_REVIEW.md) documents unresolved balance/reward gaps; passing arithmetic checks does not approve those proposed values. |
| itch.io and manual review | itch.io was not republished. Authenticated production gameplay and physical-device/system-back verification remain manual. Synthetic smoke actions never submitted production gear mutations, orders or account creation. |

Sanitized publication, backend verification, public-file comparisons and browser evidence are retained under `release-artifacts/estate-building-labels/deployment/`. Before deployment, local `main` was clean and synchronized with `origin/main` at the merged build, with equal hashes and divergence `0 0`.

### Previous verified web release — Inner Castle equipment dismissal

The user-authorized merge and web deployment of [PR #474](https://github.com/explocion200/CrownLands/pull/474), from `codex/gear-close-to-inner-castle`, is verified at build `36b889f9fb8e0320a6e3de7418359ddcf4a72ca8`. Closing Treasury, Barracks, Gatehouse or Royal Stables equipment through X, touch, Escape/native cancel or the backdrop returns to the Inner Castle with its camera, selected building and keyboard focus preserved. Upgrade-confirmation Escape stays in equipment; closing the estate itself exits normally.

| Channel / validation | Verified result |
|---|---|
| Primary web game and both game hosts | **`LIVE — WEB`**; Netlify deploy `6ac65329585c0d00091bacd5`, published October 7 at `14:16:29.988 UTC` (10:16 a.m. Eastern). The primary `/play/` entry, `crownland.netlify.app` and `game.playcrownlands.com` match the merged release. The existing manual publication hold remains enabled. |
| Release gates | Node 22 syntax/ESLint, production artifact and asset budgets, all ten focused validators, and required GitHub `Static validation`, `Multiplayer emulator validation` and `Validate` passed in [run `37633255630`](https://github.com/explocion200/CrownLands/actions/runs/37633255630). No server-authoritative change required an emulator suite. |
| Public artifact verification | All 51 staged files and all 153 comparisons across the three public hosts passed, covering the entry, estate artwork, four officer screens, changed runtime, styles, manifest, release configuration and service worker. |
| Runtime smoke | The exact verified production runtime passed twenty X/touch/Escape/backdrop equipment returns in the isolated synthetic realm at 1440 × 900 and 844 × 390, preserving camera, selection and focus. Public anonymous startup at the primary `/play/` entry loaded the exact build and changed scripts with no runtime exceptions. |
| Backend | Release ID `crownlands-2026-10-06-linked-account-capture-v1`, contract hash `637489cef89975fd10483831aeb70298f7243fab39db343ed5c062386c4d312c`, server source hash `010e15912d8c3112f9e8e5354b18b3658d64423bdba53ab0581d0d8340ab529e` and 140-callable manifest match the preceding published web release. No backend or production-data deployment occurred. |
| itch.io | Not republished for this web update; this estate release is verified as `LIVE — WEB` only. |
| Remaining manual review | Authenticated production equipment interactions and physical-device/system-back behavior were not exercised. Synthetic actions never submitted production gear mutations, orders or account creation. |

Sanitized staging, publication, public-file comparisons, production-runtime smoke and screenshots are retained under `release-artifacts/gear-close/deployment/`. Local `main` was clean, synchronized with `origin/main` at the implementation build and verified with equal hashes and divergence `0 0` before publication. The approved 1448 × 1086 estate, buildings, walls and background coverage remain unchanged.

### Previous verified web release — Content-sized desktop troop orders

The user-authorized merge and web deployment of [PR #464](https://github.com/explocion200/CrownLands/pull/464), from `codex/desktop-troop-order-window-space`, is verified at build `8572f2959d5e12218f37599db48debf9acc6e745`. Desktop Attack, Transfer and Reinforce retain their existing width of up to 1100 pixels and fit the window height to their displayed information. Shorter screens retain scrolling above fixed action buttons; compact/mobile sizing remains in place.

| Channel / validation | Verified result |
|---|---|
| Primary web game and both game hosts | **`LIVE — WEB`**; Netlify production deploy `6ac538a171dbc800084c7474`, published October 6 at `18:13:31.699 UTC` (2:13 p.m. Eastern). The primary `/play/` entry, `crownland.netlify.app` and `game.playcrownlands.com` match the merged release. The existing manual publication hold remains enabled. |
| Public artifact verification | Twelve staged entry/runtime files matched the merged artifact before publication; all 36 comparisons then passed across the three public hosts, including the order CSS/JS, game code, shared styles, release manifest/configuration and service worker. The signed-in primary game browser loaded the exact build stamp and order stylesheet. |
| Layout and required checks | The real-game browser validator passed full Attack, Transfer and Reinforce information without scrolling or large unused areas at 1440×900 and 1920×1080, and reachable details/fixed actions at 1280×720, 1024×768, 844×390 and 568×320. Exact counts, live limits, route refresh, dispatch guards, Rally compatibility and shared Tower order checks passed. Static validation, Multiplayer emulator validation and Validate passed in [run 37507888102](https://github.com/explocion200/CrownLands/actions/runs/37507888102). The merged production artifact passed validation. |
| Backend compatibility | The release ID, API contract hash, server source hash and 139-callable inventory match the preceding published client manifest. This deployment changes frontend presentation; it does not require a backend deployment or production-data migration. |
| itch.io | The playable upload remains build `390ed49899da47a3f39e39d431b16386aeb57ffe`; the desktop sizing change has not been republished there. |

Sanitized staging/publication and public-file verification records are retained under `release-artifacts/desktop-troop-order-window-space/deployment/`. Layout interactions were validated in isolated local browser fixtures; no production march, battle or purchase was submitted. Local `main` was clean, synchronized with `origin/main` at the implementation build, and verified with equal hashes and divergence `0 0` before publication.

### October 6 itch.io release and weekly dev blog — verified

The user authorized updating itch.io and publishing the past week's dev blog on both itch.io and the Crownlands website. The former itch publication hold is lifted for this update. The package comes from the exact verified October 6 web build `390ed49899da47a3f39e39d431b16386aeb57ffe`; it adds no gameplay change or production-data migration.

| Channel / validation | Observed result |
|---|---|
| Playable upload selection | ZIP `crownlands-html5-390ed49899da.zip`, upload `19600336`, uploaded successfully and saved as **This file will be played in the browser**. The official Embed game page selects this file and provides `https://itch.io/embed-upload/19600336?color=55613D`. The public project’s **Run game** button now launches `https://html-classic.itch.zone/html/19600336/index.html?v=1791304326`; the build stamp and rendered sign-in screen match the selected release. |
| Butler channel | `html5` upload `18590779`, build `2076674`, user version `2026-10-06-weekly-390ed498`, reports ACTIVE. The separate ZIP is the selected browser-play upload; Butler status alone remains insufficient proof of the playable page. |
| Packaging | The full 1,060-file source passed production validation and exact Netlify deployment SHA-1/size checks. The itch ZIP contains exactly 1,000 files, SHA-256 `1c7b98f483c32baf21c7fce4c843ecaca07f07a926a9e18e4a1d5defc9ebc1ac`. It retains the identical playable entries, gameplay scripts, styles, service worker, manifest, world data, current launcher icons and all 39 primary audio sources. To meet the channel limit it omits 31 duplicate OGG fallbacks, unused icons, redundant public artwork/framework and unused metadata. Nineteen informational HTML pages forward to the verified game-host pages; audio and artifact inventories describe the package. |
| Pre-publication checks | Backend contract/source fingerprints match the verified web release; all 139 Functions remain ACTIVE, the itch authentication domain is authorized and the current Core realm is ready. The package passed 5,143 asset-reference checks, 344 root/Play entry resource checks and all 74 service-worker precache resources. Desktop and landscape-mobile cold/reload startup passed six cases at 1440×900, 844×390 and 568×320, including sign-in form navigation and correctly scoped workers. No authenticated production battle, purchase or account creation was performed. |
| Public playable verification | **LIVE — ALL PUBLISHED CHANNELS.** Initial Cloudflare 522/525 and first-upload processing errors recovered. The actual public iframe was discovered through **Run game**. All 1,000 public files match the package: 998 exact SHA-256 matches and two HTML matches after removing itch.io’s injected script and normalizing line endings. Requests use the release’s existing `v=390ed498...` asset version, avoiding earlier cached 404 responses. The complete release manifest and artifact tree match. Six public cold/reload cases passed at 1440×900, 844×390 and 568×320, including Google/email controls, email-dialog navigation, viewport fit, and active workers scoped to this upload; no uncaught errors or failed game resources. Authenticated gameplay and purchase smoke remain manual. |
| Weekly devlog | [Weekly Dispatch: King Power, Combat & Halloween — September 29–October 6](https://crownlands.itch.io/crownlands/devlog/1694127/weekly-dispatch-king-power-combat-halloween-september-29october-6), post `1694127`, confirmed **Published** in the creator dashboard on October 6 at 16:11 UTC. It covers the final current rules and shipped web features, retains server-controlled Crown checkout availability, and attaches the final ZIP. Public reading, the complete rendered article and its link from the project’s Development log were verified after hosting recovered. |

| Crownlands website blog | [The same weekly dispatch](https://playcrownlands.com/updates.html#weekly-dispatch-2026-10-06) is published from [website PR #28](https://github.com/explocion200/crownlands-website/pull/28), branch `codex/weekly-devblog-2026-10-06`, merged commit `82ca5645206634f74032bd4d3b8061b0ea2b4661`. Netlify deploy `6ac524100fa6be0008e7f740` published October 6 at `16:38:54.314 UTC`. All three required GitHub checks and website preview/production gates passed. The live verifier passed all 50 website pages, redirects, primary-origin game assets and PWA routes. Article prose matches the itch source; public desktop/mobile reading, anchors, topic filters and no-JavaScript reading passed. Website local `main` is clean, equal to `origin/main`, with divergence `0 0`. |

Sanitized package, runtime/reference audit, browser results, upload records, blog source and dashboard screenshot are retained under `release-artifacts/itch-weekly-2026-10-06/`. The gameplay web artifact, Firebase backend, realm identity and production records retain the preceding verified release. The independent website was republished only for the weekly article. Its existing game proxy still serves build `390ed498...`, and the game Netlify deployment’s manual publication hold remains enabled. Website evidence is retained under its ignored `.artifacts/weekly-devblog-2026-10-06/`.

### October 6 troop-only King Power release

The user-authorized merge and deployment of [PR #460](https://github.com/explocion200/CrownLands/pull/460), from `codex/king-power-troops-only`, is verified at build `390ed49899da47a3f39e39d431b16386aeb57ffe`. Version 13 King Power is exclusively the complete controlled troop count × 2. Existing action/economy transactions and pushed stats snapshots maintain the score; production keeps its existing lazy settlement and 120-second refresh. No scoring polling timer was added.

| Channel / validation | Verified result |
|---|---|
| Primary web game and both game hosts | `LIVE — WEB`; Netlify production deploy `6ac50b7be98ca00007cad7a6`, published October 6, 2026 at `15:18:15.268 UTC` (11:18 a.m. Eastern). The game entry, client, manifest, release configuration and service worker match the merged artifact on the primary `/play/` route, `crownland.netlify.app` and `game.playcrownlands.com`. The existing manual publication hold remains enabled. |
| Firebase backend | All 139 existing Node.js 22 Functions are ACTIVE with the merged scoring source and manifest. Each deployment source-hash group was verified from its stored source archive; no older scoring group remains. The initial quota/internal-error failures were resolved by retrying the 11 remaining functions. All six affected authentication guards and the post-deployment 29-callable access audit passed. |
| Active realm | Release `crownlands-2026-10-03-city-wall-midpoint-v4`, world `main-realm-2026-10`, generation `realm-2026-10`, shard `shard_0001`; current pointer and `core-expansion-v1` release configuration verified. Realm identity, Firestore rules and indexes were retained. |
| Current score conversion | The existing authoritative rebuild converted all 54 current-realm player projections and refreshed 1,089 city and five march identity projections, with zero Main City repairs. Transaction-consistent verification found player/global/Kingdom leaderboard scores equal to twice the complete troop totals. Two clan aggregate mismatches were reconciled from their guarded current rosters and stats; all three active clan boards and 24 members then matched, including four preserved inactive zero-score members. Archived profiles and final-season standings were excluded. |
| Required validation | Static validation, Multiplayer emulator validation and Validate passed in [run 37477361115](https://github.com/explocion200/CrownLands/actions/runs/37477361115). All 24 selected local checks and 15 affected multiplayer suites passed. The season balance audit, production artifact checks, deployed-source parity and callable-access checks passed. |
| Public production smoke | Nineteen artifact/content comparisons passed across the three game entry/runtime hosts. Game-host guides match the new rule after normalizing Netlify's anchor-only pretty-URL processing; the separately maintained primary website guides were not republished by this game release. Live signed-out startup and scoring arithmetic passed at 1440×900, 844×390 and 568×320, including zero troops and zero infrastructure power. No production battle or purchase was used for smoke testing. |
| itch.io | October 6 upload `19600336` is verified at the same build: complete public manifest/file parity and six desktop/mobile startup cases passed. Troop-only King Power is `LIVE — ALL PUBLISHED CHANNELS`; see the release record above. |

Sanitized release evidence is retained locally under `release-artifacts/king-power/deployment/`. Local `main` was synchronized and verified at the implementation build before deployment. Existing Camp tier thresholds, protection/XP policies and earned rewards were retained; lower scores can change Camp reward tiers, so observed payout balance remains a release-monitoring consideration.

### October 6 four knight-order city skins release

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
| Previous verified itch.io client (October 3 baseline) | Held at PR #440 build `02accfa4ff9a1c29c9beebd7b3c52e0348e33c88`; upload `19546590`, last verified October 3 at 22:57:21 UTC | All 995 packaged files were verified at that publication. The client includes the troop increase and departure snapshots but retains wall model 3. The user explicitly held subsequent itch.io updates, so PR #441 was not uploaded there. The October 6 request lifted that hold; upload `19600336` now replaces this earlier client with exact public artifact and desktop/mobile startup verification at build `390ed498...`, matching the current backend contract. See the latest release record above. |
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

Current web serves build `643bf16...`, with the existing backend and authorized October NPC population retained. itch.io remains at its previously audited `24cfa4e...` build; the current backend rejects that older release identity with an update-required response. Its matching publication is pending separate authorization. Older matrix rows preserve historical feature-delivery evidence and do not establish present backend compatibility.

| Capability | Web production | itch.io published client | Specification status |
|---|---|---|---|
| Matching illustrated HUD icons beside the Item Bag, Shop, City List and Map titles | PR #568 build `643bf16...`; exact staged/public assets, desktop/mobile title and X placement, mouse/touch dismissal and startup verified | Not republished | `LIVE — WEB`; physical-device, authenticated gameplay and installed-app review remain manual |
| Top-left HUD shares Reports' 12px left edge across desktop/mobile and fullscreen transitions | PR #566 build `1c8d8ad...`; exact staged/public assets, native fullscreen, emulated screen insets, mouse/touch actions and startup verified | Not republished | `LIVE — WEB`; physical-device, authenticated gameplay and installed-app review remain manual |
| Boxed X header alignment and animation stability; readable Clan counts and View Main City label | PR #564 build `b7b2a25...`; exact staged/public assets, desktop/landscape windows, profiles and startup verified | Not republished | `LIVE — WEB`; authenticated gameplay, installed-app and physical-device review remain manual |
| Restored burgundy headers, HUD and boxed X buttons; existing parchment, frames and alignment retained | PR #562 build `7ff2ab6...`; exact staged/public assets, desktop/landscape windows and startup verified | Not republished | `LIVE — WEB`; authenticated gameplay, installed-app and physical-device review remain manual |
| Shared Guild Master colors, aligned framed X controls and inset tab frames | PR #560 build `16d282a...`; exact staged/public assets, desktop/landscape windows and startup verified | Not republished | `LIVE — WEB`; authenticated gameplay, installed-app and physical-device review remain manual |
| Map Atlas counts clear lost cities and confirmed empty holdings while retaining unloaded Core city identity | PR #558 build `ed933ca...`; exact assets, staged/public desktop/mobile Atlas fixtures and public startup verified | Not republished | `LIVE — WEB`; authenticated ownership changes, installed-app and physical-device review remain manual |
| Three shared sword clashes for every confirmed attack; saved-flag drape only for eligible captures | PR #556 build `ec42a35...`; exact staged/public assets, desktop/landscape combat fixtures and public startup verified | Not republished | `LIVE — WEB`; authenticated combat, installed-app and physical-device review remain manual |
| Centered gold, silver and bronze crowns for the top three on Kingdom, Clan and Glory podiums | PR #554 build `eb0be0e...`; exact assets, desktop/landscape-mobile fixture interactions and public startup verified | Not republished | `LIVE — WEB`; authenticated standings, installed-app and physical-device review remain manual |
| Matching-size defeated marauder/boss art, server respawn countdown and atomic replacement at a new road position | PR #552 build `1c3faf7...`; client/backend identity, authoritative realm and delivered desktop/mobile UI verified | Not republished | `LIVE — WEB AND FIREBASE`; actual production defeat/respawn and physical-device checks remain manual |
| Solo marauders in active New Lands, Core-only clan bosses, permanent stamina and proportional daily Crown refill | PR #541 build `2adcd7c...`; 25 bosses / 672 solos across all 81 current maps; backend, UI and scoped activation verified | Not republished; old release identity fails the current backend version guard | `LIVE — WEB AND FIREBASE`; matching itch.io publication required |
| NPC city Scout / Info / Attack controls; 20% inset for new/replacement spawns; 90px solos and 115px bosses | PRs #543/#544 build `a3f0b09...`; exact client/backend, current realm and isolated desktop/mobile startup verified; active targets retain their locations until defeated | Not republished; older incompatible client remains | `LIVE — WEB AND FIREBASE`; matching itch.io publication required |
| Public Crown purchase disclosures include stamina’s gameplay benefit and reviewed proportional price | Separate website PR #29 build `e6a45e7...`; terms and relevant guides verified | New game disclosure not included in the old upload | `LIVE — WEB` |
| Three sword-clash castle captures followed by the capturing player's saved flag draping over the city | PR #530 build `7406e0a...`; source/built animation and public delivery verified | Not republished; retains preceding capture effect | `LIVE — WEB`; authenticated capture and physical-device review remain manual |
| Guild card rows, planning columns, room controls and phone review footers align; active tab remains visible | PR #528 build `24cfa4e...`; source/built checks at six desktop/phone sizes with actual game styles | Same-build upload `19696818`; all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; current authenticated, installed-app and physical-phone alignment remains manual |
| Full Guild: persistent rolled champions, contracts, reports, five facilities, mentoring and approved art | Verified build `24cfa4e...` retaining PR #526; its coordinated 145-function backend, report rules and original focused emulator evidence remain in FM-2 | Same-build upload `19696818`; all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; authenticated spending, installed-app/physical-device and long-term pacing remain manual |
| Inner Castle overview artwork taps select and zoom to 2.5× | Verified build `24cfa4e...` retaining PR #524; original native-input and actual-game evidence is in FM-2; Guild release rechecks estate UI at three sizes | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; outside realm unchanged; current authenticated/installed-app/physical-device review remains manual |
| Original unframed estate map buildings with window-only portrait styling | Verified build `24cfa4e...` with PR #522 retained; earlier sprite/window checks remain in FM-2 and original native inputs passed at three sizes | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; authenticated/installed-app/physical-device review remains manual |
| Illustrated building service and construction folio, clear requirements and persistent actions | Verified build `24cfa4e...` with PR #520 retained; earlier source/built service, production and construction checks remain in FM-2 | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; authenticated/installed-app/physical-device review remains manual |
| Bare-terrain taps clear building selection while dragging and construction timers retain their behavior | Verified build `24cfa4e...` with PR #518 retained; original mouse/touch, drag, camera and remount evidence remains in FM-2; original native-input checks passed | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; current signed-in/installed-app/physical-device input remains manual |
| Illustrated Inner Castle shortcut immediately beside Dailies | Verified build `24cfa4e...` with PR #516 retained; original exact built mouse/touch/keyboard, off-map entry, Profile guards and camera-return fixtures at three sizes | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; current authenticated/installed-app/physical-device shortcut remains manual |
| Active construction countdowns visible in the fitted estate overview | Verified build `24cfa4e...` with PR #514 retained; original timer fixtures remain in FM-2 | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; current signed-in/installed-app/physical-device timers remain manual |
| Full building/plot selection and reliable estate pointer dragging | Verified build `24cfa4e...` with PR #512 retained; original native-input checks passed at three sizes; original evidence remains in FM-2 | Same-build upload `19696818`, all 1,000 files and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; actual installed-app/physical-device and current authenticated input remain manual |
| Estate service controls visibly lock during refresh and recover afterward | Verified build `24cfa4e...` with PR #510 retained; its earlier signed-in Guild opening/Close/recovery evidence remains in FM-2 | Exact same-build upload `19696818`, public file parity and six cold/reload cases verified | `LIVE — ALL PUBLISHED CHANNELS`; earlier refresh checks remain in FM-2; current exact channel artifacts and startup verified |
| Guild next-level XP-bank guidance, capped quest review and linked Alehouse recruitment | Verified build `24cfa4e...`; PR #508 legacy progress protected; approved Guild expansion supersedes training and contract flows | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; full Guild checks and migration evidence are in FM-2; exact channel artifacts and startup verified; signed-in/device limits remain |
| Player-started finite material batches and Focused production UI | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Follow unmet building prerequisites from external Build/Upgrade panels | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Build/Upgrade pays materials at explicit start; new deposits removed | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Estate refresh DOM preservation and short-landscape HUD style invalidation | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Direct estate Build/Upgrade starts from displayed requirements without a second payment confirmation | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Inner Castle management overview, readiness filters, production guidance, unlock previews, completion notices, champion cards, starter guide and Build/Upgrade wording | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Inner Castle building service clarity, availability and refresh/deadline preservation | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Compact selected-building map hexes and normal estate UI buttons | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Curved construction progress/countdowns above estate buildings | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| City-style estate Upgrade-left and Enter-right controls | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Permanent twenty-building Inner Castle economy, materials, direct construction payment and retained legacy contracts, Gear commissions and rarity gates, champions/quests/meals and Crown supplies | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Illustrated twenty-site Inner Castle estate, fixed western district labels, district-zoom building captions, resource counters, Back to Realm and preserved equipment returns | Included in verified build `24cfa4e...`; original release evidence remains in FM-2 | Exact same-build upload `19696818`, actual iframe and all 1,000 files verified | `LIVE — ALL PUBLISHED CHANNELS`; original estate checks remain in FM-2; current exact channel artifacts and startup verified; signed-in/device limits remain |
| Version 13 King Power: complete controlled troops × 2 | Verified web/backend build `390ed498...`, including current score conversion | Exact same-build upload `19600336`, manifest/file parity and six public startup cases verified | `LIVE — ALL PUBLISHED CHANNELS`; shared backend and public client verified |
| October 6 weekly client catch-up (including knight skins, approved Gold/troop artwork and Shield confirmations) | Included in verified build `390ed498...` | 1,000-file ZIP and actual public iframe verified; six cold/reload cases passed | `LIVE — ALL PUBLISHED CHANNELS` |
| Four 600-Crown knight-order city skins with five stages and bounded medieval outskirts | Verified web/backend build `d21f6579...` from PR #458 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; artifact and callable smoke passed, signed-in Shop verification pending |
| Approved painted steel troops helmet across troop, garrison, production and Barracks presentation | Verified in web build `af766bd7...` from PR #449 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; exact image and affected assets verified on all game hosts, with desktop/mobile browser checks |
| Approved antique Gold coin artwork across currency presentation and default Gold particles | Verified in web build `5c595a93...` from PR #447 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; exact image and affected assets verified on all game hosts, with desktop/mobile browser checks |
| Royal Peace Shield activation confirmation in the Item Bag | Verified in web build `218dd880...` from PR #445 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; synthetic production UI checks passed, authenticated item consumption remains untested |
| Shop purchase countdowns, midnight unlock and shared ad cooldown recovery | Verified in web build `5d7bbb0...` from PR #422 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; authenticated purchases and live ad completion remain manual checks |
| Player camp defense bonuses and private holder inspection | Verified in web/backend build `32a4476...` from PR #411 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; production combat smoke remains manual |
| Transactional clan power, deferred optional screens and current-build cache recovery | Verified in web/backend build `f12191d...` from PR #406 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; shared backend verified |
| Retired Training Grounds attack and Infirmary recovery, preserved visuals/levels and paused new upgrades | Verified in web/backend build `f12191d...` from PR #406 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; replacement mechanics remain undecided |
| Foreground troop-clock recovery, City List scroll preservation, and compact Gold upgrade costs | Verified in web build `5c47de7...` from PR #404 | Included in exact verified upload `19600336` | `LIVE — ALL PUBLISHED CHANNELS`; authenticated gameplay and physical Android sleep/resume remain manual checks |
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
| King Power | The ranking measure for individual kingdoms and aggregate clan strength. The October 6, 2026 confirmed rule is total controlled troop count × 2; see Section 13 for snapshot, migration and release requirements. |
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

**Ground cleanup confirmed October 20, 2026:** Use the supplied medieval atlas theme for a quiet meadow ground layer with clear, connected ochre roads. Remove decorations baked into that background; retain existing independently layered scenery and seasonal decorations. Preserve all 81 road geometries, edge connections, city/objective positions and NPC placement inputs. Camp paintings retain their recognizable type-specific buildings and equipment, with transparent ground between them and only small matching contact patches, so the actual map terrain shows through. Apply the same revised camp images in every existing map and UI surface, without enlarging their footprint. See [the ground cleanup notes](art-sources/clean-map-ground/README.md) for validation and publication status.

**Same-day dirt-road refinement:** Roads should read as worn earth within the meadow, matching the supplied atlas reference. Use painted soil texture, irregular grass-to-dirt shoulders and subtle broken wear marks instead of a flat fill with a continuous border. Keep their existing connected centerlines, widths and gameplay clearances. See [the dirt-road refinement](art-sources/blended-dirt-roads/README.md).

### Private continuous-world prototype — confirmed October 20, 2026

Stage 1 is a loopback-only, inspect-and-navigate preview under `tools/map-benchmark/`, using the existing nine Core sections at grid positions −2 through 0 on both axes. Retain catalog identities, local positions and current artwork; use deterministic fictional owners and troops. Join 1448 × 1086 section footprints into one camera plane with continuous pan/zoom, persistent object selection and six road-following sample marches. Start at Stoneward; provide Home, Fit preview and optional troop following. Limit full terrain residency to four images and asset concurrency to two, use thumbnails/viewport culling, and keep a clear private sample-data label. Exclude the preview from production entry points and game packages. No gameplay commands, live accounts, backend feeds, travel rules or data migrations are authorized by this stage. DOM/CSS rendering remains in use; WebGL and live multiplayer integration are deferred. See [the Stage 1 prototype](CONTINUOUS_WORLD_PROTOTYPE.md) for access, validation and limits. A validated merge does not activate a continuous map in the live game.

**Same-day preview refinement:** The owner requested using the empty section-edge space and removing visible terrain joins. This amends the initial display-position restriction for the private prototype: spread the existing 540 fictional cities within their original sections, retaining each catalog ID and original local coordinate separately from its preview coordinate. Preserve city counts, objective/scenery positions and road routes, and avoid overlaps. Show cities at overview zoom. Recompose the approved meadow and road artwork with matching ground orientation, continuous road material and shared edge samples into private terrain/thumbnail files under `tools/`. Do not move live cities or replace production artwork. Recheck all joins/corners, selection, asset bounds and desktop/mobile performance before proposing Stage 2 integration.

**Preview castle visibility refinement:** Make castles moderately larger so their existing artwork is easier to recognize: increase the private marker footprint from 42 to 56 logical pixels, expanding road and scenery clearances accordingly. Preserve original catalog centers separately from preview placement. Render sprites and labels at the current zoom instead of enlarging a cached low-scale world layer. Recheck sharpness at ordinary and high-density display scales, mobile navigation and frame timing; this is still a private Stage 1 change, with no live city or artwork changes.

**Private Stage 2 testing — confirmed October 20, 2026:** The owner approved testing the next recommendations: crowded rendering, full-catalog exploration, bounded area loading with simulated ownership/troop updates, slow/disconnected network recovery and longer memory stress. Add a separate `?catalog=full` mode covering all 81 prepared Core catalog sections with fictional data only; this is not a claim that 81 sections are active in the live realm. Keep the original nine-section preview. Load at most 16 nearby section datasets and thumbnails, four full terrain images and two concurrent image requests; use a small overview atlas when zoomed out. Preserve selection across area eviction and reject obsolete responses. Retain inspect/navigation-only controls, existing IDs and original coordinates, and production-package exclusion. Reuse the existing outer-section terrain and record remaining painted joins rather than changing live artwork. Physical-phone review and the authoritative authenticated multiplayer feed remain gates before any live continuous-world integration. See [the Stage 2 test report](CONTINUOUS_WORLD_STAGE_TWO_TESTS.md). For the owner’s selected Android phone on home Wi-Fi, permit an explicitly started, separate preview endpoint bound to the home-network interface. It serves only allowlisted preview files and fictional read-only scene data, rejects other sources/routes, and expires within one hour. Keep the unrestricted benchmark server loopback-only; add no public router forward or live-game route.

**Private Stage 3 start — confirmed October 20, 2026:** Following the owner’s successful Android Stage 2 check, begin authenticated area-feed integration in a separate local fixture realm. Reuse the existing local authentication/session implementation with temporary fictional accounts in a fresh isolated rehearsal schema; load bounded area snapshots followed by versioned changes, with explicit removals, visibility-loss handling, epoch recovery and resumable reconnect. Keep the current fictional display placements and original catalog coordinates, inspect/navigation-only controls, image residency limits and production-package exclusion. Do not connect live accounts or change gameplay, production routes, data or travel rules. This is the first Stage 3 milestone; full live visibility parity, constrained-device rendering, remaining terrain joins and rollout controls are still gates. See [the Stage 3 implementation and validation](CONTINUOUS_WORLD_STAGE_THREE.md).

**Private Stage 3 completion work — confirmed October 20, 2026:** Improve mobile rendering and area-window stability, match all 81 prepared preview terrain joins, and test current game-data visibility before any live release. Use existing access rules and public army projections against fictional isolated data; preserve exact/estimated/hidden troop disclosure and clear cached private selections on permission changes. An explicitly started, one-hour, allowlisted home-network test may use an automatically created fictional session so the Android check needs no real account credentials. Keep the continuous map private, read-only and excluded from published packages; successful tests or a merge do not authorize connecting production accounts or enabling it for players.

**Private current-game reader — confirmed October 20, 2026:** The owner approved the next step: connect read-only current game data and test simultaneous players before going live. This extends the preceding fixture-only boundary to an owner-only loopback preview with an expiring local operator grant, a restricted database read role, current realm/active-section checks and the existing game access rules. Preserve saved city coordinates and recorded movement routes/times; include currently active generated New Lands, not just prepared artwork sections. Public map data may be shared briefly between readers; exact own counts require fresh ownership checks and must never enter a shared public cache. Keep commands, account mutations, production routes and the public continuous-world rollout disabled. Run concurrent-viewer/load and revocation tests against isolated fictional data; limit production verification to bounded owner-authorized reads. A merged reader does not make the continuous map live. See [the private reader report](CONTINUOUS_WORLD_LIVE_READER.md).

**Private reader follow-up — confirmed October 21, 2026:** Proceed with the recommended refresh optimization, generated-section seam repair, visibility/appearance checks, longer moving-viewer tests and preparation for a small authenticated player pilot. Preserve current saved city positions, road geometry, active-realm checks, exact-count isolation and read-only behavior. Recompose existing approved terrain only inside private development outputs; display publicly readable equipped castle skins and existing owner flags. Prepare normal game-session verification for an explicitly selected cohort of at most five accounts behind a one-hour, private-network HTTPS proxy, without installing that route or granting authentication access automatically. Hands-on cohort testing remains pending identified testers and deliberate activation; public rollout and gameplay commands remain disabled. See the follow-up results and pilot boundary in [the private reader report](CONTINUOUS_WORLD_LIVE_READER.md).

**Private open-world routing draft — confirmed October 21, 2026:** The owner approved developing wider city spacing and unrestricted passable crossings together. For the proposed continuous world, ordinary travel may cross anywhere along adjoining active section edges instead of using the old arrow/connection points. Roads are artwork, not mandatory gates; structures and inactive land remain obstacles. This supersedes the connection-point restriction for the proposed continuous-world rules, not the current live release. Extend the private read-only reader with an explicitly enabled draft: reuse stable template slots to spread current cities toward the edges, preserve original IDs and saved game coordinates, and calculate proposed routes on the private server from freshly authorized object identities. Use a bounded background pathfinder and test distances with the existing speed formula. Existing dispatched marches retain their original routes and accepted timestamps, clearly distinguished from hypothetical route animations. Do not install new gameplay routing, move production cities, change travel speeds or rewrite in-flight orders in this step. Public activation and authoritative command integration remain separate gates. See [the open-world routing draft](CONTINUOUS_WORLD_OPEN_ROUTING.md).

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
- Each generated New Lands map begins with 40 neutral NPC cities, and every newly seeded or returned-to-neutral regular NPC city starts at exactly Level 1. When the currently admitting map reaches 10 remaining neutral NPC cities, the server activates the next two maps in clockwise allocation order for new-player placement. The threshold transition must be transactional, idempotent, and safe under concurrent claims.
- **Threshold revision confirmed October 18, 2026:** New-player placement requires more than 10 authoritative neutral regular cities before the claim; the final eligible claim leaves 10 and closes that map to admission. Gameplay depletion to 10 or fewer is reconciled on the next starting-city request. This replaces the former 20-city threshold. New maps still contain 40 Level 1 neutral cities and open in verified pairs. Already closed maps, existing cities, admission cursors, and historical or pending activation receipts are preserved; this rule does not reopen maps or rewind expansion. **Status:** implementation pending validation and authorized backend installation.
- The Core is non-spawnable. New and returning accounts without current-generation progression spawn only in the currently admitting New Lands maps. **Status:** `DEPLOYED — SCHEDULED ACTIVATION`.
- Future outward player regions are materialized deterministically from validated New Lands templates, retain cardinal-only connections, receive unique medieval-authentic names, and are added to connected clients through the authoritative expansion-state subscription without requiring a frontend redeploy. The supported release envelope is 4,095 New Lands maps, or 122,850 theoretical threshold-managed starting placements (30 per map before captures). **Status:** `DEPLOYED — SCHEDULED ACTIVATION`.
- Reset activation fails closed: all 25 Core maps and all 56 New Lands maps in Layers 1 and 2 must be seeded and verified for the scheduled generation before the public realm pointer changes. A partial or failed preparation keeps the previous pointer; retrying must preserve existing city data and admission progress. Existing completed readiness receipts and existing generations retain their original policy. The previous generation remains intact and inaccessible for pointer-based rollback. **Status:** `IMPLEMENTED — PENDING VALIDATION AND DEPLOYMENT` for the two-layer reset policy.
- Production migration is scheduled for September 2, 2026 at 00:00 UTC and has not occurred at the time of this specification update.

### Needs verification

- Exact 20-region production topology, city capacities, total city count, reserved positions, and connection graph: **NEEDS VERIFICATION** against current production data.
- Exact rollback behavior remains **NEEDS VERIFICATION** before promotion from development design. The confirmed capacity trigger activates two additional maps when the current admitting map has 10 neutral NPC cities remaining; generation follows the complete 24-map first ring and then north-origin, clockwise allocation in later layers.

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
- **Linked-account city-capture protection — confirmed October 6, 2026:** Regular-city battles remain available between accounts linked by a shared browser installation within the existing 30-day restriction, any exact public IP used by both accounts within the preceding 30 days, or an administrator-confirmed account pair. A victorious battle applies normal damage, casualties, battle XP and rewards, retains the defender’s ownership and city level, and returns surviving attackers. It creates no ownership event, capture quest credit, capture retaliation entitlement or Anti-Handoff count. Capture-only victories are not canceled attacks and do not refund consumed march items or restore an offensively deactivated Shield. The current owner and links are rechecked atomically at arrival, including Tower origins and hostile converted support/returns. Objective and rally rules retain their existing behavior.
- IP observations use server timestamps and normalized exact IPv4/IPv6 HMAC fingerprints, including IPv4-mapped IPv6 equivalence. Both accounts’ observations must be inside the rolling 30-day window; activity by one account cannot renew the other account’s observation. Collection starts only after reviewed spoof-resistant ingress verification from two different public networks. No subnet match, device fingerprinting, IP backfill or automatic inference of common ownership from a shared network is introduced. Shared household, carrier and VPN addresses receive the same capture restriction.
- IP observations and administrator-confirmed pairs persist independently of monthly realm resets. A confirmed pair restricts capture until an administrator explicitly removes it; automatic IP/device evidence remains independently effective after removal. Installation identifiers are browser-installation signals, not attested physical-device identities. Security records are server-only. Prevented-capture evidence is retained for 90 days; temporary observations expire after their eligibility window.
- The on-demand five-day feeding audit traces current holdings for accounts above 35 regular cities, reconciles ownership chains, reports direct transfer counts across all players and lists possible intermediary/neutral routes for review. Present-day links are labeled separately from evidence recorded at resolution. The report does not reverse ownership or automatically restrict indirect routes. **Status:** `IMPLEMENTED — PENDING VALIDATION, MERGE AND AUTHORIZED DEPLOYMENT`; verified ingress and controlled-account verification remain release gates.
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

- The Skills screen uses the approved parchment ledger with eight medieval skill emblems. Desktop and mobile landscape retain three columns headed only Attack, Defense, and Utility. Mobile keeps the header, preset tabs, points, and actions above one shared vertical scrolling area with sticky discipline names. Each card shows its description, current bonus, cap, level, next bonus, and one-point upgrade controls. Existing live adjustments, free Reset, preset unlocks, isolated editing, Save/Apply distinction, and pricing behavior are preserved; the October 16 Crown price below supersedes the original Gold price. Confirmed September 13, 2026; approval does not establish deployment status.
- **Skill emblem artwork — confirmed October 6, 2026:** Use the approved hand-painted atlas set wherever the existing eight skill emblems appear in the game, including Skills, orders, reports, clan/activity views, buildings and Help. March Orders depicts a horse's head reaching forward with its mane and reins flowing backward; Shieldwall Discipline depicts adult soldiers with natural proportions in a defensive formation; Royal Granaries includes soldiers relaxing and eating outside the granary. The remaining approved emblems depict a sword, stone walls, a tax chest, a guild charter and medical supplies. Ship compact transparent WebP derivatives on versioned asset paths; retain the full-size approved sources and generation prompts in [the artwork notes](art-sources/skill-atlas-icons/README.md). This changes presentation only. **Status:** `IN DEVELOPMENT`; user approval does not establish deployment.
- Hero XP awards Hero Levels. Players start at Hero Level 1 with zero skill points and earn one point per subsequent level. Every skill upgrade costs one point, including the final five levels. Removing a live level freely returns one point. Reset Skills freely returns all spent points, preserves saved presets and Gold, and consumes no stored legacy reset credit. Existing legacy credit data remains stored and harmless. **Uniform point cost confirmed September 29, 2026; status:** `IN DEVELOPMENT`, replacing the previously deployed double-cost final tier.
- **Skill point efficiency — confirmed September 29, 2026:** Match the comparable per-point rates in the community [MLCLord Skill Optimizer](https://mlclord.com/skill-optimizer). Swordmastery and Field Medics grant +2% per point; Shieldwall Discipline, Tax Stewardship and Royal Granaries grant +3%; March Orders grants +5%. Stoneworks remains +3% and Guild Charters remains 2% upgrade-cost reduction per point. The September 29 skill-cap confirmation sets Swordmastery, Shieldwall Discipline, Stoneworks, Tax Stewardship, Royal Granaries and March Orders to 100%; Field Medics and Guild Charters remain 50%. Swordmastery requires 50 points; each 3%-per-point skill requires 34 points, with its final point increasing 99% to exactly 100%; March Orders requires 20 points; Field Medics and Guild Charters require 25 points each. All eight skills together cost 256 points, available at Hero Level 257. Hero points remain one per level; Gear, Clan bonuses, total bonus caps and base combat power retain their current rules. **Status:** `IN DEVELOPMENT`; design confirmation does not establish deployment.
- Existing builds retain all valid purchased levels under the increased caps. The higher Shieldwall and March increments apply to those retained levels; removing the old final-tier surcharge returns surplus points. Available points are recalculated as Hero Level minus one minus the retained levels, so repeated synchronization cannot issue duplicate refunds. Preset model 6 recalculates spent points at one per level while retaining allocations, names, saved timestamps and the active slot. For example, an existing Hero Level 100 build with Shieldwall 30, March Orders 20 and Guild Charters 25 keeps those levels, spends 75 points and has 24 unspent points; its old 15-point surcharge is returned once. This update preserves current version-2 player builds and does not trigger the historical clear-all skill reset. Publish the matching client and backend together under the new skill-cap release contract; older clients in the active realm must refresh before spending. **Status:** `IN DEVELOPMENT`.
- The current skill groups are Attack, Defense, and Utility. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Current skills include Swordmastery, March Orders, Field Medics, Shieldwall Discipline, Stoneworks, Tax Stewardship, Royal Granaries, and Guild Charters. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Four private skill presets unlock at Hero Levels 25, 50, 75, and 100. The Skills screen always opens on Current Build. Selecting an unlocked preset opens an isolated, all-zero draft for an empty slot or the stored allocation for a saved slot; draft names and point changes remain local until Save, and Apply remains the only preset action that changes the live build. **October 16, 2026 confirmed price change:** each confirmed Apply costs exactly **10 Crowns**, replacing the former one-hour base-Gold price. This also applies to active presets and identical allocations. Saving, renaming, inspecting presets, live point adjustments and Reset Skills remain free. Apply uses the permanent Crown wallet and is unavailable until the balance is known and sufficient. Confirm the exact Crown cost and resulting balance before spending; charge the wallet and activate the saved build atomically. Retrying the same request must not charge or apply again. Reject old Gold confirmations and changed saved builds without spending Crowns. Gold is not debited. **Crown pricing state:** `LIVE — WEB` on the local server at build `16512ad423ae6bc37f07ff6b326056e6347c1b9c`, verified October 16 at 20:00 UTC; [deployment evidence](LOCAL_RELEASE_2026-10-16_PRESETS_HUD.md). **Status:** preset unlocks, isolated drafts, free saving, paid application, compact `− | cost | +` controls, replay-safe signed adjustments, and live refunds are `LIVE — ALL PUBLISHED CHANNELS` in build `fdf326a...`.
- Applied preset tabs use the established red treatment. The viewed tab uses Crownlands gold with dark readable text; a viewed applied preset remains red with a gold outline, inactive tabs remain tan, locked tabs remain distinct, and skill headings, descriptions, costs, and controls use explicit high-contrast colors. The repeated final-tier explanatory banner and card text are omitted because the segmented control exposes each next-level cost directly. **Status:** `LIVE — ALL PUBLISHED CHANNELS` in build `fdf326a...`.

### Confirmed beginner capture progression — October 18, 2026

- A fresh player must reach at least Hero Level 15 from capturing ordinary NPC cities by the time they own 30 cities total: one starting Main City plus 29 captures. The owner clarified that this is a **bonus for the first 29 eligible NPC-city captures**, independent of Hero level. Normal battle XP, city upgrades and other earned XP are additional progress. The 30-owned-city and daily neutral-capture limits are unchanged.
- The 29 beginner bonuses total exactly 48,859 XP, the unchanged cumulative requirement for Level 15. Increase the bonus gradually by distributing the Level 1–15 curve over 29 captures: cumulative bonus after `n` captures is the XP for `14*n/29` levels above Level 1, interpolating within the current level and flooring the cumulative amount. Each bonus is the difference between consecutive cumulative amounts. Award the normal capped battle XP plus that bonus; reaching Level 15 early does not cancel remaining bonuses.
- Track consumed bonuses in the server-owned seasonal character field `beginnerNpcCaptures`, initialized to zero on a fresh starting-city claim. Increment it atomically with the actual eligible ownership transfer and XP; stop at 29. Failed, canceled, protected or non-capturing attacks, player-owned targets, objectives, hunts, relinquished cities and relocated cities neither award nor consume a bonus. Replayed settlement, logout, skill changes and loss of owned cities must not replenish the counter. Clients cannot create or alter it.
- Existing profiles without this counter retain their saved progress and normal XP; this implementation does not infer historical captures from currently owned cities or grant retroactive rewards. Fresh players and fresh season claims receive the counter. Level thresholds, the post-25 10% XP growth curve and the 0.5% city-upgrade XP rule remain unchanged pending the separate pacing review. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.

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
- City Details uses the same window dimensions as City List. Only the player's owned regular-city information panels offer an Enter Inner Castle shortcut above the tabs when the player's Main City is available. It always opens the player's own Main City Inner Castle. The October 7 navigation refinement replaces returning to the inspected city with **Back to Realm**, which closes the estate, reveals the current realm map and restores map focus without changing the realm or map camera; this refinement is `LIVE — WEB` at verified build `d84754fc...` from PR #477. Neutral, allied and rival cities do not display this shortcut; foreign-city access and intelligence rules are unchanged.
- The footer retains `+1`, `+5`, and `MAX` as amount choices and shows the resulting level and exact Gold cost on the upgrade action. Choosing an amount does not spend Gold; activating the upgrade action uses the existing authoritative queue and projected affordability. Affordable upgrades remain usable while earlier levels sync.
- The panel retains owner/profile links, main-city and Inner Castle entry controls, relinquishing, reinforcement actions, production and defense bonus details, and existing foreign-city/scouting visibility rules. Recovery feedback waits for authoritative synchronization before presenting the available balance; it must not claim that Gold was unchanged after an uncertain request.
- This City List/Details design update is limited to those panels. The October 13 NPC Info refinement below explicitly extends their shared ledger to marauders and bosses. The map, HUD, Stronghold details, Citadel, Inner Castle, and other dialogs retain their existing presentation. A confirmed design does not establish deployment.

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

- **Desktop order-window space — confirmed October 6, 2026:** Keep the shared Attack, Transfer and Reinforce window's existing desktop width of up to 1100 pixels and fit its height to the displayed contents, providing only enough space for the full information rather than a large fixed window. The height grows or shrinks with the order's details and warnings, bounded by a 12-pixel viewport margin on each side. At 1440 × 900 and 1920 × 1080, the troop selector, own attack-power breakdown, known scout forecast, travel details, eligible Swift March panel and applicable shield/reinforcement notes must fit without internal scrolling or a large empty area. Smaller viewports and unusually long content retain a scrollable detail area with fixed, visible actions; the existing compact/mobile presentation remains in place. This changes presentation only. **Status:** `LIVE — WEB` at build `8572f295...`; itch.io retains its preceding build. See the current web release record above.

- The travel section of attack and troop movement dialogs shows only **Travel bonus** and **Travel time**. The bonus comes from the authoritative speed multiplier, with the established skill/objective multiplication and additive Gear contribution; a selected valid Swift March Order uses its actual time reduction. No bonus displays as 0%. Routing, troop bands, minimum durations, and attack eligibility remain unchanged. Blocking errors stay beside the action controls. Active march countdowns retain their accepted arrival timestamp. Release verification is recorded in `docs/COORDINATED_TRAVEL_SCOUT_DEED_CHAT_RELEASE.md`.
- Armies move in real time along valid routes for attacks, scouting, transfers, support, regrouping, and rallies. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Clanmates see other current clan members' movement and transfer routes and army markers in light green. Allied attacks, including launched Rally attacks, use a distinct medium green that remains visible on the map. Support, Rally assembly, and safe returns use the light movement shade. Current clan membership determines the relationship; personal and enemy colors retain their existing behavior. **Status:** `IN DEVELOPMENT` until merged and deployed.
- Cross-region movement must use configured region connections. **Status:** `LIVE — ALL PUBLISHED CHANNELS`. The October 21 private continuous-world draft proposes any passable adjoining-edge crossing; that replacement is not live and does not alter already-dispatched marches.
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

- **Confirmed October 18, 2026 — retaliation consumed at combat; implementation pending release:** This supersedes the October 3 consumption-on-dispatch rule. A qualifying regular-city loss grants 24 hours from capture to launch retaliation at that exact city. Successful dispatch atomically reserves all currently valid pending grants for the same city; only one retaliation army for that city can be outbound at a time. The opportunity is consumed atomically with actual combat, win or lose, including combat where a separate rule prevents capture. A shield reversal, arrival shield block, recall, or other return without combat releases the reservation without extending the original deadline. Failed dispatches consume nothing. Third-party ownership changes preserve the right, but clan ownership never permits an attack. Recovering the city ends all outstanding opportunities for that loss and removes their alerts, including when a different army recaptures it. Independent cities retain independent opportunities. Launches before expiration remain authorized during travel and arrival. Previously used grants remain spent, expired grants remain expired, and legacy already-launched attacks retain their existing exact-city authorization. The capturer’s original 24-hour no-abandon lock and separate 15-minute offensive Shield activation cooldown are unchanged.

- **Confirmed October 3, 2026 — implementation pending release:** Pressing Send/Attack for an order that removes an active Royal Peace Shield opens a warning with **Continue sending** and **Cancel** before any dispatch. Show the destination, troop count and remaining Shield time. Cancel, close and Escape preserve the Shield and send no troops. Apply the same confirmation to shield-removing reinforcements and attacks from Holding Towers; keep existing Shield removal rules, harmless transfers, neutral-city attacks and Rally commitments unchanged. Continue rechecks the current order and account/realm before dispatch; repeated clicks cannot send duplicates.

Confirmed September 19, 2026. **Status:** `IN DEVELOPMENT` until the authorized release is independently verified.

- A successful player-initiated PvP attack dispatch starts a 15-minute Peace Shield activation cooldown. Each later qualifying dispatch restarts it. This includes player-held Camps, Strongholds, the Crown Citadel, and clan-held Towers. Every contributing ruler receives the cooldown when a combined PvP Rally actually launches; forming/joining a Rally does not start it. Existing active-shield removal/retention rules remain unchanged.
- Incoming attacks, defending, casualties, losing cities, scouting, friendly transfers/reinforcements, automatic return combat, and attacks on neutral/NPC objectives do not start the cooldown. The server persists the expiration and rejects activation without consuming an item while it is active.
- Regular-city King Power protection uses the attacker-power thresholds in the approved September 27 revision (previously fixed at 2× for Protected Assault and 2.5× for Protected Raid). If a ruler protected by those rules captures a stronger ruler's regular city, the displaced ruler receives one independent 24-hour launch authorization for that exact immutable city and map. This lifts only that city's King Power attack limits for the authorized march. It does not remove anyone's global protection, enable ordinary-city Rallies, grant scouting rights, or bypass Main City, Peace Shield, clan, route, troop, or anti-farming rules.
- The right survives changes of ownership. A launch before expiration remains authorized throughout travel and arrival, even after the window ends. Successful march creation and reservation are atomic; actual combat and consumption are atomic. Failed or concurrent duplicate attempts cannot spend or reserve an additional right.
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

### Marauders, Clan Bosses and permanent stamina — approved October 12, 2026

#### Approved October 19 balance version 2 — live on the home server

The owner approved the revised complete package and requested implementation. PR #630 was installed and verified on the local live server at build `99781080a81715611cbf31d687ac4bc3beedf883` on October 19; later compatible client releases retain these rules. These rules supersede the historical version-1 balance, boss party limit, capped NPC XP, shared consumable and persistent boss wounds **only for new/replacement version-2 spawns**. The complete immutable level lookup and derivations are in [the approved balance table](MARAUDER_REWARD_BALANCE_DRAFT.md); future economy/progression changes must not silently recalculate these values.

- Solo levels 1–79: fixed Gold and XP chosen as one fifth of the same-level undiscounted regular-city upgrade cost and full Hero XP requirement. Preserve defenders at levels 1–10; use geometric segments through 885 at level 10, 5,000 at 20, 50,000 at 40 and 1,000,000 at 79, freezing all integers. One personal consumable roll rises from 1% to 70% (`100 + round(6900*(L-1)/78)` basis points); no solo Gear Boxes. Solo wounds persist after defeat.
- Boss levels 80–100: fixed defenders from 5,000,000 to 40,000,000 (`floor(5000000*8**((L-80)/20))`). Fixed shared Gold is `floor(5439559*D*5/4000000)`; fixed shared XP is `floor(5*sameLevelHeroRequirement/4)`. Five players including the leader are the design reference; party size never rescales the enemy or reward pools. Version-2 NPC payouts bypass the recipient-level battle XP cap while retaining ordinary level-up rewards. Other battle caps remain unchanged.
- New boss rallies have 2–5 unique current clan members, including their creator; inbound and assembled contributions share five slots. Before charging stamina, each assembled member must provide at least 10% of full configured defense and 10% of assembled effective attack power. Maximum individual shares for 2/3/4/5 assembled members are 70%/55%/45%/40%, compared with exact integer arithmetic. Explain rejection, current/required power and shares, scout-gated casualty forecasts and reward estimates. Changed contributions invalidate prior readiness. A losing forecast warns but does not itself block launch. Freeze eligibility and effective attack power at departure; later losses or gear changes cannot disqualify a member or alter shares. Other rally types retain their existing limits.
- On victory, divide each fixed Gold/XP pool by departure power with deterministic largest remainders. Each participant separately rolls for one consumable at L% and one Gear Box at `60 + 1.5*(L-80)` percent. Preserve the six existing consumable weights. If a box drops, a conditional `0.5*(L-80)` percent chance replaces Common with Uncommon, never adding another box. Common contains three level-1 Common pieces; Uncommon contains one level-1 Uncommon and two level-1 Common pieces. No direct Rare/Epic/Legendary box. At level 100 each member has 81% Common, 9% Uncommon and 10% no box, independently of their guaranteed consumable. Store unopened boxes even when equipment inventory prevents opening.
- After a failed, non-canceled version-2 boss battle, atomically restore that same immutable boss to full configured defense before the next arrival resolves. The report preserves actual combat losses and explains the recovery; failed fights pay no loot. Scouts, cancellations, retries and stale-spawn refunds cannot heal another target. No exclusive claims or historical damage payouts. Preserve ordinary combat, casualty recovery, returns, 10 stamina, two-minute solo and thirty-minute boss respawns.
- Rollout is versioned, with no bulk rewrite: existing targets and committed armies retain version 1 through resolution. Missing saved balance version means 1; unsupported versions fail closed. New spawns explicitly store version 2, copied into rally and march records. Server-owned random draws are reused across transaction retries and saved with atomic once-only settlement and reports. Deploy the tested home-server backend first, then verify the matching automatic publisher release; merging alone is not proof of deployment. Do not create an update-triggered database backup.

**Owner-requested October 19 population refresh:** The owner subsequently requested refreshing existing NPCs to receive the new rewards. This authorizes a one-time retirement of idle, active version-1 spawns in the authoritative current Core/active New Lands realm, followed by normal version-2 replacement. Preserve version-2 targets, defeated targets' cooldowns, inactive/archived maps and any target with a committed scout/attack or forming/launched/recalling rally. Recheck realm, exact reviewed document version, both NPC projections and active commitments transactionally before retiring each identity; concurrent launches must either preserve that target or reject a stale identity before spending. Do not rewrite an existing encounter's balance, award retirement loot, alter player documents or create an update-triggered backup. Atomically hide both old projections and mark the corresponding population map uninitialized so the existing bounded scheduler chooses the replacement's fresh identity, level and valid road position under unchanged caps/clearance. Leave crowded slots pending normal retries; do not loosen placement. Keep an idempotent retirement receipt. This exception does not add automatic expiry for other existing targets.

#### Confirmed October 19 equal boss rewards — implementation approved, deployment pending

The owner explicitly removed troop-contribution minimums and confirmed that **every participating member receives the full listed Gold and XP**, rather than dividing the listed amount. This supersedes the contribution gates and shared Gold/XP rules above for new departures against balance-version-2 bosses.

- Retain two to five unique current clan members including the leader, the shared five inbound/assembled slots, existing rally permissions and 10 stamina per launched member. Each participating member must send at least one troop. Remove the minimum share of boss defense, minimum share of rally attack power and maximum individual contribution share. A known losing forecast still warns; participation eligibility does not guarantee victory.
- On victory every member in the frozen departure roster receives the boss level's **full** listed Gold and XP, regardless of troop count, damage share or surviving troops. Keep the immutable balance table and NPC XP-cap exemption. For example level 80 pays 33,997,243 Gold and 6,491,581 XP to each member; level 100 pays 271,977,950 Gold and 43,672,116 XP each. A five-member win pays five times the old total pool. Ordinary Hero level-up rewards remain additional and can differ between members.
- Consumables, Gear Boxes and conditional box rarity still roll separately for each member with the existing probabilities and weights. Preserve combat, casualties, recovery, respawn, failed-boss recovery, cancellation/refund behavior and atomic once-only payout. Defeat pays no victory loot.
- Freeze `bossRewardVersion: 2` in the rally and canonical army at departure, separately from NPC `balanceVersion`. Forming balance-version-2 rallies adopt the new terms when they launch. Already-launched rallies without this field retain policy 1: their original contribution gates and shared Gold/XP allocation. Unsupported or inconsistent saved policies fail closed. Existing balance-version-1 encounters remain unchanged; no population rewrite or archive changes are needed.
- Show Gold/XP **per member** and explain the one-troop minimum in boss information. New readiness shows full personal rewards without contribution percentages or power thresholds; historical launched rallies retain their original readiness terms. Verify desktop and landscape mobile layout. Install and verify the matching local backend before releasing the client; no update-triggered backup.

The historical release evidence and version-1 rules below remain relevant to retained spawns.

**Confirmed October 13 defeated NPC presentation — LIVE — WEB AND FIREBASE at build `1c3faf7...`:** After victory, show the approved fallen normal/boss artwork at the defeated spawn's existing position, with the same 90px/115px map boxes and anchor as its living counterpart. Display a server-clock respawn countdown using the existing two-minute solo or thirty-minute boss deadline. Defeated markers cannot be selected, scouted or attacked and are excluded from nearby enemy search. At the deadline, an authenticated, realm-guarded request may wake that exact due spawn once per viewing session; the bounded minute scheduler remains the offline/retry fallback. The server alone chooses a fresh identity and a new road position under the existing cap, inset, spacing and clearance rules. Atomically replace the public/private slot so the old artwork disappears when the new target appears. If safe placement is blocked, keep the defeated artwork with “Awaiting respawn” until replacement succeeds; do not relax placement or fabricate a client target. Retired targets leave no remains, and failed attacks retain living defenders. Countdown updates reuse the existing UI timer without network polling. Deployment evidence and verification limits are recorded in [the release ledger](MARAUDER_DEFEATED_RELEASE_2026-10-13.md).

**Status: LIVE — WEB AND FIREBASE**, at build `1c3faf7...` with defeated artwork/respawn timers, matching NPC Info, Scout Reports and attack reports; the authorized October-realm policy-4 population remains enabled. These confirmed rules extend neutral PvE, boss rally eligibility and Crown spending. See [the initial October 12 release ledger](MARAUDER_STAMINA_RELEASE_2026-10-12.md), [the controls/placement release](MARAUDER_CONTROLS_RELEASE_2026-10-13.md), [the road respawn release](MARAUDER_ROAD_RESPAWN_RELEASE_2026-10-13.md), [the matching-report release](MARAUDER_REPORTS_RELEASE_2026-10-13.md), [the Info/Scout release](MARAUDER_INFO_SCOUT_RELEASE_2026-10-13.md) and [the defeated NPC release](MARAUDER_DEFEATED_RELEASE_2026-10-13.md); itch.io requires a matching client publication.

- Authoritative current Core topology metadata determines eligibility. Active New Lands with `permanentCore: false` receive solo marauders (levels 1–79). Only the 25 central 5×5 Core maps with `permanentCore: true` receive bosses (80–100), never solo enemies. Newly activated and closed-admission New Lands receive solo enemies. Armies may march from New Lands to Core bosses.
- The original v1 population had 12 slots per New Lands map: four uniform levels 1–10, four 11–39, four 40–79. The deployed October 13 two-slot revision below supersedes that population. Each Core map has one uniform level 80–100 slot, at most 25 bosses. Defeated solo enemies become eligible for replacement after two minutes; bosses after thirty minutes. A bounded minute scheduler places replacements at new valid points on the same map, retrying blocked terrain, routes, buildings, scenery, objectives and NPC clearance. No launch reservations or automatic target expiry.
- NPCs are shared, stationary, non-aggressive and cannot be captured or occupied. Each spawn has an immutable identity. Server arrival time then army ID determines encounter order. Later armies never attack a replacement spawn. Ordinary departure bonuses, combat, losses, casualty recovery and return rules apply; NPCs have no walls and exactly 1 defense per defender. Failed attacks leave surviving defenders and award no marauder Gold or XP. Victory awards loot immediately and returns survivors. Encounters create no ownership, objective bonuses, capture credit or PvP credit. Preserve neutral-PvE Peace Shield behavior.
- Solo attacks use one army with optional clan membership. Boss attacks require a clan rally with 2–20 unique participants including its creator. Retain five active rallies per clan, officer/leader permissions, membership validation, assembly defense, withdrawal, recall and return rules. Tower rallies retain their separate three-member minimum.
- **Confirmed October 13 matching NPC Info and Scout Reports — LIVE — WEB AND FIREBASE at build `f57b560...`:** Marauder and clan-boss Info uses the regular-city parchment window, dimensions, typography, portrait/level presentation, stat rows and independently scrolling information/action columns on desktop and landscape mobile. Show the NPC's illustration, neutral identity, scout-gated defenders/defense, victory reward pools, item chance and stamina/hunt actions. Keep NPC controls contained, with at least 44px touch targets. Preserve Scout, solo Attack or eligible boss rally preparation and refill draft behavior; show no city upgrades, production, walls, ownership or player-profile link for an NPC. Successful NPC Scout Reports use the regular-city scout window, heading, own-ruler identity, neutral NPC illustration, troop/defense summary cards and wall-free defender table. Preserve Back/map/close, section navigation, age/expiry timers, spawn-specific intelligence and refill access without an automatic attack. Replaced, expired or unavailable intelligence never fabricates NPC statistics, skills, walls or player reinforcements. Scout costs, permissions, delivery and ten-minute expiry remain unchanged. This later confirmed request extends the original city-only presentation scope; authorized publication and delivered-asset verification are recorded in the Info/Scout release ledger.
- NPC artwork follows the supplied medieval-atlas inspiration: fine brown ink outlines, restrained painted shading, muted olive/ochre terrain and burgundy cloth. Both marauders and bosses face south toward the bottom of the map, viewed from above to match cities and buildings.
- **Confirmed October 12 placement refinement — LIVE — WEB AND FIREBASE at build `a3f0b09...`:** New and replacement NPC centers stay within the central 60% of each map, with a 20% inset from every edge in each axis. Retain terrain, scenery, building/objective clearance and reachable-route checks. Solo map markers are 90px square (10% smaller); bosses are 115px square (15% larger). Retain the 64-world-unit ground-clearance radius, which accommodates both marker widths. Boss placement uses at most 512 candidate checks per slot, while solo placement retains 48; continue retrying blocked slots in bounded maintenance sweeps. Keep existing active targets stationary with their current spawn identity and defenders until defeated; their replacement adopts the inset. Never move a target underneath a committed march or rewrite its current encounter.
- **Confirmed October 13 road-only and two-enemy refinement — LIVE — WEB AND FIREBASE at build `6946e9b...`:** New and replacement NPC centers must lie on the existing painted road surface from the approved illustrated map template. Preserve current building, scenery, terrain and objective clearance, reachable-route checks and the 20% edge inset. NPC centers on the same map must be separated by at least 25% of that map's shorter side, with a minimum of 128 world units; the existing 64-unit ground-clearance radius remains. Each New Lands map has at most two active solo marauders: one uniform level 1–10 beginner slot and one slot alternating uniform levels 11–39 and 40–79 on replacement. Choose the latter slot's initial medium/high band with equal probability. Each Core map retains one uniform level 80–100 boss slot. The user explicitly accepts fewer enemies when roads are crowded: leave blocked slots empty and retry through bounded maintenance sweeps, without an open-ground fallback or reduced building clearance. Generated and closed-admission New Lands use their authoritative `templateRegionId` road geometry; missing geometry fails closed. Replacements retain two/30-minute cooldowns, same-map eligibility and fresh immutable identities. Placement version 4 records these rules; combat and balance version 1 remain unchanged.
- **Confirmed population transition exception — verified October 13:** The authorized rollout reconciled formerly initialized maps to placement policy 4. Retire obsolete solo slots, incompatible slot levels and targets violating the new separation, retaining the eligible beginner first. Hide retired public targets and remove retired defeated slots from due-respawn scheduling; do not award retirement loot or XP. Surviving eligible targets remain stationary with their original identity and defenders. A committed march to a retired/replaced identity settles through the existing invalid-encounter path: no combat losses, return all committed troops, refund stamina up to 100 and applicable march consumables exactly once. The user expressly chose removal of extras and refunds over waiting for all old enemies to be defeated; this is a one-time population-policy exception to prior active-target preservation, not automatic expiry. Verify the current realm and the two-solo/one-boss cap plus spacing after bounded reconciliation before declaring the revised population live. This rollout received explicit merge/deploy authorization and the previously confirmed retire-extras/refund choice. All 81 current October maps passed policy-4 reconciliation, cap, territory and spacing checks; future production changes still require separate authorization.

| Level | Defenders | Gold pool | Hero XP pool |
|---|---:|---:|---:|
| 1 | 100 | 100 | 20 |
| 20 | 10,000 | 5,000 | 500 |
| 40 | 100,000 | 50,000 | 2,500 |
| 60 | 1,000,000 | 500,000 | 10,000 |
| 79 | 10,000,000 | 5,000,000 | 25,000 |
| 80 | 20,000,000 | 10,000,000 | 50,000 |
| 90 | 50,000,000 | 25,000,000 | 100,000 |
| 100 | 100,000,000 | 50,000,000 | 200,000 |

- Balance version 1 interpolates geometrically between anchors, rounding downward. Rewards depend only on enemy level, with no King Power penalty or production scaling. Configured XP replaces ordinary battle/capture XP; existing Hero XP caps and indirect level-up Gold/troop rewards apply.
- Only the victorious rally receives a boss pool. Damage is proportional to departure-snapshotted effective attack, capped at remaining defense. Deterministic whole-number allocation preserves Gold and XP pools before individual XP caps; capped XP is not redistributed. Failed earlier rallies earn nothing. Extra participants cannot multiply pools.
- Roll once per enemy for at most one consumable, with a damage-weighted recipient draw for bosses. Solo chance grows linearly from 2% at level 1 to 10% at 79; boss chance grows from 20% at 80 to 30% at 100. Relic weights: War Drums 35%, Veil of Silence 25%, Swift March Order 18%, Royal Tax Decree 12%, Recall Horn 8%, Peace Shield 2%. No Crowns, deeds, gear boxes, direct troop rewards or refill-item drops. Persist rolls and settlement exactly once.
- Stamina is permanent private account state, initialized once at 100, capped at 100, with offline recovery of 1 every 12 minutes from server timestamps. Cost is 10 per participant, charged atomically at solo departure or combined rally launch. Formation and joining are free. If another army defeats the target first or the server cancels an invalid encounter, refund stamina up to 100 and applicable march consumables. Actual defeats and voluntary recalls consume stamina. Maps, devices, sign-outs and season resets do not reset stamina or refill usage.
- **Confirmed paid-refill exception:** Earned or purchased Crowns from the existing playable wallet restore stamina to 100 immediately, never as a Bag item. The October 12 proportional-price revision supersedes the flat charge: charge `ceil((100 - current stamina) × 30 / 100)` whole Crowns, calculated after server-timestamp recovery. A completely empty bar costs 30 Crowns; 70 stamina costs 9, 99 stamina costs 1, and 100 stamina is unavailable with a zero quote. Permit one successful refill per account per UTC day, resetting at 00:00 UTC. Round up to the next whole Crown when needed; never overfill or charge at 100. Version the refill offer independently of permanent stamina state, reject old flat-price or stale offers without spending or consuming the allowance, and preserve retries of already committed receipts. Idempotent request IDs and reviewed stamina/wallet revisions protect retries, stale reviews and concurrent spending. Failed, canceled or duplicate requests consume neither Crowns nor an additional daily allowance. One transaction reconciles recovery, checks availability and price, debits the wallet, fills stamina, marks the day and writes a permanent receipt. Preserve merchant and payment availability controls.
- Display a compact burgundy stamina button, sized to its content and 52px high, beside and top-aligned with the stacked Gold/Crowns counters. The background ends after the refill icon with 5px of inner padding, without an empty trailing column. Place the circular-arrow refill icon closely beside the value and align the progress track's right edge with the icon's right edge; the whole card remains one accessible button opening the cost review. Retain Shield Cooldown and Retaliation vertical placement. Use exact values, a yellow bar (also in the refill review), an amber bar below 10 without a Low label and unknown —/100. Minimum touch height 44px; include the wider group in HUD collision and safe-area measurements on desktop and landscape mobile.
- The parchment refill section shows before/after stamina, exact restoration, Crown balance/debit, daily availability and an explicit “Refill to 100 — {cost} Crowns” button using the calculated price (singular Crown when 1). Keep available hunts `floor(stamina / 10)`, recovery text and next-point/full countdowns inside a collapsed Recovery & hunts section. Opening never purchases. Explain Stamina full and Refill used today. When the wallet is below the calculated refill price, show that exact shortfall and use a Buy Crowns action to open the existing Shop's Crown tab only when the server enables live purchases; explain unavailable purchases otherwise. Closing the Shop returns to the review and preserves the original hunt/rally draft. Crown credits never automatically refill stamina or launch an army.
- Enemy details and solo/boss preparation show stamina and cost. Open the same panel over a preserved target, source, troops and rally draft; require explicit Send/Launch after refill. Clan members see readiness only, never another account’s exact stamina. Reuse existing UI ticks without network polling. Use distinct NPC artwork, level search across active maps, spawn-specific scout intelligence and forecasts only when intelligence permits.
- **Confirmed October 18 stamina and enemy finder:** Move Find enemies out of City List into a full-size Stamina & hunts window. Keep the compact HUD card unchanged. Show stamina/refill review alongside an organized enemy finder, with independently scrollable content and visible actions on desktop and landscape phones. Players choose inclusive minimum/maximum whole levels from 1–100 and explicitly press Search. Read fresh available NPCs across all active maps in the current realm/shard, including unvisited New Lands; omit defeated, retired and previous-generation targets. Display enemy name, level, solo/boss type and map in compact rows with the shared square location-art button. Search does not scout, reveal defender counts, purchase stamina or launch attacks. Explain loading, no matches and failed reads; never present an incomplete search as complete. Verify the immutable spawn is still available when locating it, open its map and select that enemy. Closing a refill review still preserves the original hunt/rally draft; explicitly locating another enemy leaves that draft for the selected map target. Recovery details, refill pricing, daily allowance, Shop return and explicit purchase/launch requirements above remain unchanged.
- **Confirmed October 13 target controls — LIVE — WEB AND FIREBASE at build `a3f0b09...`:** Selecting a marauder or boss on the map opens the same Scout / Info / Attack action wheel as a foreign city. Info opens enemy details; Scout uses one troop with no stamina and retains pending/travelling feedback and spawn-specific Rescout / Report availability. Attack opens the existing solo troop draft, or boss rally formation for eligible clan leaders/officers; retain the two-member boss launch minimum and explicit Send/Launch. A replaced spawn cannot inherit the old selection, scouting intelligence or prepared encounter.
- **Confirmed October 13 NPC attack report presentation — LIVE — WEB AND FIREBASE at build `b372622...`:** Solo marauder and clan-boss attacks use the same parchment attack-report window as ordinary battles: fixed Back/map/close controls, section shortcuts, one scrolling body, forces, bonuses, Gear effects, conditional rewards and rally participant results. Use NPC artwork for the neutral defending side, retain enemy type/level and immutable spawn identity, and never describe a hunt as capture or PvP credit. New actual encounters save one private battle-time snapshot shared only by their participating attackers, with departure attack power/gear, complete rally losses and survivors, and wall-free 1.00 NPC defense. Each recipient keeps their own credited Gold, capped XP, consumable, recovery and level-up receipt; extra participants never duplicate loot. Canceled/unavailable targets retain return/refund explanations without fabricating a battle snapshot or enemy statistics. Older/missing snapshots use recorded values and explicitly label unavailable attack statistics. Report permissions, delivery/retries, 24-hour retention, read marking, navigation, stamina and combat/reward rules remain unchanged. Authorized merge and matching web/backend deployment are verified in the [release ledger](MARAUDER_REPORTS_RELEASE_2026-10-13.md), with live player settlement/delivery and physical-device limits disclosed.
- Natural recovery supports 12 fights per day; a paid refill adds up to 10, and an initially full bank contributes up to 10 separately. At level 79 the respective maximum Gold pools are 60M / 50M / 50M; at level 100 they are 600M / 500M / 500M per winning rally, shared among participants. These theoretical maxima exclude travel, availability, losses, XP caps and indirect level-up rewards. They are monitoring baselines, not guaranteed player income.
- Prepare one coordinated client/backend release including rules/indexes and checkout/help disclosures. Before enabling population, reverify the current realm pointer and generation; never target archived or legacy maps. Population/refills remain disabled until the realm-scoped rollout document is explicitly enabled. Merge, deployment, production population and publication each require separate authorization. Monitor defeated troops, credited loot/XP and level-up rewards, receipts/refunds, target availability/blocked slots, query reads, transaction retries and scheduler cost.

#### Coordinated release and population runbook

1. After separately authorized merge, build the coordinated `crownlands-2026-10-12-marauder-hunts-v1` release. Deploy backend, rules and both NPC indexes; wait for ready indexes before publishing the matching client. Keep population disabled during verification. Preserve merchant/payment controls.
2. Immediately before authorized population activation, read `realmConfig/current` and compare world, generation, topology and shared realm with `getRealmInfo`. Resolve `getRealmStorageId()` from that current context. Development inspection observed `main-realm-2026-10` / `realm-2026-10`; reverify at rollout. With separate population authorization, enable only `marauderPopulation/{currentRealmStorageId}` with `enabled: true`. Never enable archived generations.
3. Each minute sweep visits at most 24 initialization candidates and 36 due-slot records, populating at most 36 maps. Initial/future map activation fills over bounded sweeps; replacements occur on a sweep after cooldown. Inspect map metadata for blocked slots and verify zero solos in the 25 Core maps and zero bosses in active New Lands, including closed-admission maps.
4. Reconcile private `marauderBattles` settlements, per-player `staminaReceipts`, normal battle reports and structured population-maintenance logs for casualties, credited loot/XP, indirect level-up rewards, refunds, daily purchases and target availability. Group battles by current world/generation and immutable spawn. Use existing operation timing, Firestore usage and function metrics to monitor query reads, transaction attempts, arrival latency and scheduler cost. Keep private stamina and wallet values out of public reports.
5. A separately authorized disable sets the current realm flag false, stopping new population and paid refills. Existing targets and committed marches remain valid and settle normally; disabling does not cancel armies or issue refunds. Do not delete active NPCs or remove settlement code with armies in flight. Preserve stamina and receipt subcollections through season operations; each new generation requires its own reviewed population activation.

### Camps

- **Confirmed October 20, 2026 — camp map banners:** Place the camp name, controller identity and existing public hold timer above the camp artwork using the compact player-castle banner layout. Give Gold, Warband, Relic and Deed camps distinct heraldic type flags so category remains recognizable in neutral and held states. Keep the holder’s personal flag separate from the fixed type emblem. Preserve camp selection, scouting, orders, timer authority, Deed progress, rewards and map positions. This presentation change requires verified client publication before it is called live.
- **Same-day display clarification:** Copy the actual player-castle name display, including its shared name typography and spacing: ruler identity above the smaller location name, with the camp hold timer using the castle information-bar style. Retain the camp-type flag and existing camp artwork anchor; do not maintain separate camp name sizes or padding. The initial banner release was verified live as PR #646; this exact-style correction requires its own publication verification.
- **Same-day flag refinement:** Remove the small holder flag on the camp artwork; ownership remains identified by the ruler-name row. This supersedes the earlier request to keep a separate personal flag. Replace the simple type emblems with painted medieval banners for Gold (coins), Warband (crossed swords), Relic (treasure chest) and Deed (sealed parchment), keeping the existing 42 × 53-pixel label slot and castle typography. The exact castle display was verified live as PR #647; the artwork refinement requires separate publication verification.
- **Same-day holder-flag clarification:** Neutral camps display their painted camp-type banner. While a player holds a camp, replace that banner with the holder's personal flag using the same identity and flag renderer as player castles. Update it when ownership or the holder's flag changes, and restore the type banner when the camp returns to neutral. Keep the same 42 × 53-pixel slot, ruler/name/timer rows and removed small pole flag. This supersedes the earlier fixed-type-banner rule for held camps. PR #648's artwork was verified live; this ownership-driven display requires separate publication verification.
- **Same-day castle flag styling:** Held camps use the castle's shared pointed owner-banner frame and normal inset personal-flag proportions instead of stretching the flag across the full slot. The frame follows the existing camp relationship color and keeps the same compact footprint; do not add a city level to camps. Neutral camps retain their painted type banners. Holder switching was verified live as PR #649; this styling refinement requires separate publication verification.
- **Same-day approved camp scene artwork:** Replace all four active Core camp paintings with the approved medieval atlas illustrations: Gold counting pavilion, burgundy Warband encampment, purple Relic collectors' camp and green Deed surveyors' camp. Use the same type-specific artwork on the map, atlas previews, camp windows, held-camp lists and troop-order previews, including snapshots received before map loading. Preserve transparent backgrounds, existing sizes/anchors, the castle-style owner/type banners and all gameplay values. Delete the four superseded active-world sprite files; historical world artwork and the separate castle-skin encampment decoration are outside this replacement. Publication requires verification.

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

- **Pickup placement clarification — September 21, 2026; random open-area enforcement confirmed October 6, 2026:** Gold, troop and Crown pickups must occupy a random open position around the active map's center, rather than always trying the exact center first. Search the existing central zones (15%, 25%, then 35% of the map's shorter dimension), staying inside that area. Their full image and largest click area must clear canonical and relocated cities, maximum city/skin artwork, Camps, Strongholds, the Citadel, Clan Tower compounds and separate scenery images, including trees, bushes, rocks and seasonal decorations. Wait for pending seasonal layout data before reserving a location. If the central search has no clear position, retry after five seconds instead of placing a pickup behind artwork. Obstructed or off-center saved pickups are hidden until the existing reservation can move to clear space, including within the same map; retain its identity, type, expiry, daily allowance and collection deadline. Reuse unchanged placement validation between map/city/art changes, with a bounded search and no new polling timer. Reward amounts, timing, caps and collection authority remain unchanged. **Status:** implementation in development; deployment requires verification.

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
- **Confirmed October 12, 2026 — restore the ruler crown:** Show a gold crown above the current Citadel holder's regular-city labels on every map, for the holder and other viewers. Keep it visible when zooming out collapses city details. Transfer the marker when control changes and remove it when the Citadel is unclaimed; the crown must not intercept city selection or map gestures. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
- **Confirmed October 12, 2026 — illustrated Citadel crown:** Use one transparent, painted antique-gold crown for the Map Atlas Citadel crest and the current holder's city markers, matching the owner's uploaded landscape reference with dark ink outlines and muted colors. Preserve the existing ownership, zoom and input behavior. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
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

- **Confirmed October 6, 2026:** Clan access is available at every Hero level, starting at Level 1. Players may discover clans, join open clans, apply to approval-required clans, and create clans without a Hero-level requirement. This replaces the previous implemented Level 10 gate in the client and backend. Existing creation cost, membership capacity, approval and role permissions, current-realm requirements, departure cooldown and Tower participation probation retain their rules. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.

- **Confirmed October 3, 2026 — former-clan city capture protection, revised:** Leaving, removal, or clan disbanding starts 24 hours during which the clanmates present at departure may attack the departing ruler, but cannot capture their regular cities. This replaces the earlier full attack block. Battles retain existing wall damage, casualties, King Power limits, XP, casualty recovery and offensive Shield rules. Actual combat consumes any retaliation opportunity normally; retaliation does not bypass this capture restriction. On a victory during protection, the city keeps its owner, level and investment, surviving attackers return through the existing safe-return rules, and no capture rewards, capture mission credit, ownership event or new retaliation grant is created. The server checks the current owner and deadline at arrival, including Tower-origin attacks, converted support and hostile Rally returns. An attack arriving after expiry can capture under the normal rules. Preview and battle reports explain capture protection separately from battle victory.
  The server snapshots clanmate player IDs at departure. Either side later changing clans does not cancel protection; subsequent departures retain earlier unexpired restrictions. Disbanding protects each member from the others. Protection is directional, excludes unrelated rulers and later joiners, and covers all regular cities currently owned by the departing ruler. Camps, Strongholds, Citadels and Towers retain their existing objective rules. The separate one-hour clan-joining and Tower eligibility cooldowns remain unchanged. Protection is server-owned, scoped to the active realm generation and shard, and starts with departures processed after deployment; historical departures are not backfilled. **Status:** `LIVE — ALL PUBLISHED CHANNELS` at build `5292ae5...`; see the October 3 release ledger above.

- **Confirmed October 3, 2026:** The cooldown after leaving or being removed from a clan is **1 hour**, during which joining, applying to, or creating a clan remains unavailable. A disbanding Leader receives the same wait; other members released by disbanding remain immediately eligible to join elsewhere. Saved 24-hour departures with their matching authoritative clan-change timestamp are shortened from their original departure time without restarting the wait. Records lacking that matching timestamp retain their saved deadline. Joining another clan starts its separate 1-hour Tower participation probation. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.

- The approved Clan UI uses the parchment, olive, brass, and burgundy style for desktop and mobile landscape. Overview, War Room, Rewards, and Members share one window; Rewards separates Gold Gifts, Weekly Conquest, and Treasury. Discovery, creation, public clan profiles, heraldry, renaming, Rally orders, and confirmations follow the same design. Existing information, server permissions, rewards, costs, and Rally rules remain authoritative. **Status:** `APPROVED — IMPLEMENTED, PENDING RELEASE VERIFICATION`.
- Players may create or join clans, hold clan roles, coordinate through Clan Chat, send clan gifts, complete weekly clan goals, reinforce allies, and participate in rallies. **Status:** `LIVE — ALL PUBLISHED CHANNELS`.
- Current operative roles include Leader, Officer, and Member. Exact permission tables are **NEEDS VERIFICATION** against current backend rules.
- **Confirmed September 22, 2026:** Leaders and Officers see a persistent pending-application count on the clan HUD icon and Clan tab. Opening or reading the clan menu does not dismiss pending applications; the count changes only when authoritative pending applications change, including acceptance, denial or applicant cancellation. Regular Members do not receive application alerts. The existing active-Rally count remains included in the shared badge, with both counts described in its accessible label. **Status:** `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`.
- Clan ID, clan name, clan tag, clan heraldry, member roster, and each member’s current role—including Leader, Officer, and Member—persist across seasons.
- Every current-season clan root, roster member, benefit, gift, quest, Rally, Treasury, and related seasonal record carries the active realm-shard identity. Clan membership and clanmate/allied map relationships are derived from that authoritative roster; missing shard metadata must be repaired without changing membership, roles, heraldry, resources, or player-controlled world state.
- **Current-season consistency clarified October 12, 2026:** Active clan rosters and rankings must use the current season. A preserved member who has not entered that season retains their membership and role with zero current-season power until their normal starting-city claim initializes the new world profile. Their older profile/stats and historical standings must not contribute to the active clan total. Power reconciliation must recover an incorrect clan aggregate from its current roster, including when the triggering member's score is already correct; identity refreshes must not update member power separately from the clan aggregate. **Status:** `IN DEVELOPMENT — NOT DEPLOYED`.
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
- Selecting Rally on a Clan Boss or hostile Clan Tower, Stronghold, or Crown Citadel opens the contribution UI directly from the last selected owned city, limited to its available troops. If that city is no longer owned, has no available troops, or cannot reach the target, ask the ruler to select an eligible city instead of silently choosing another source.
- Clan War Room and Kingdom Activity Rally cards show the assembly city with a map shortcut. While forming, Ready contributions remain visible at that city on the map and in its information panel; inbound contributions are labeled separately until arrival. Ready troops remain reserved for the rally and unavailable for separate orders, but defend their assembly city or Tower until the combined army launches. They are never counted twice in King Power. **Confirmed October 1, 2026 — implementation pending validation and deployment:** all arrived contributions, including the creator’s, take part in live defense. Resolve losses against each ruler’s stationed force, reduce each affected rally and its committed-troop counter atomically, and retain only surviving troops for a later launch, withdrawal or cancellation. Troops still inbound do not defend the assembly. A defeated creator contribution cancels the forming rally and returns remaining contributions through the existing return rules. Scouting and battle reports include arrived troops; private rally targets remain clan-only.
- If the creator of a launched Rally leaves the clan, is removed from it, or changes clans, the server automatically recalls the complete combined Rally army. This automatic safety recall preserves the committed combined force for participant settlement, consumes no Recall Horn, and records `rally_creator_clan_departure` as the reason. A non-creator leaving the clan does not recall another creator's launched Rally.
- A launch is atomic and requires eligible Ready contributors including the creator, continued ownership of the assembly, an eligible hostile objective, and the existing minimum of two Ready participants (three for Tower targets). **Confirmed October 1, 2026:** additional inbound contributions no longer block launch. The Ready survivors depart together; every still-inbound contribution turns back from its current position in the same transaction. Arrival and launch races must commit exactly one outcome per contribution, and a repeated launch must not create another attack or return. The confirmation lists incoming contributors who will return. An invalid non-creator contribution is removed and returned; an invalid creator cancels the Rally.
- Ordinary Rallies may target only Strongholds and the Crown Citadel. Reward Camps and ordinary cities are not Rally targets. The four Holding Towers are Rally targets under their separate Tower rules once this implementation is authorized and deployed.
- A launched Rally travels at its slowest participant's march speed, locked at launch. Under the confirmed October 3 departure policy, each participant also keeps their attack and casualty-recovery skill and equipped-gear snapshot from that launch. Combat and later receipt settlement use those saved values against live arrival-time defense. Troop ownership stays with each contributor.
- Attacker losses are allocated proportionally to troops contributed, with deterministic whole-troop rounding. A defeated Rally has no surviving attackers.
- On victory, the Rally creator becomes the personal controller of a Stronghold or Crown Citadel and the clan receives its shared benefit. The creator's survivors hold the objective; allied survivors remain there as individually attributable reinforcements their owners may recall. Holding Towers remain clan-owned and all eligible survivors are stationed as attributed clan garrison troops rather than creating a personal owner.
- Every participant receives the same Rally battle outcome snapshot with a clearly labeled breakdown of each participant's committed troops, losses, survivors, and contribution.
- If a Rally return's original city is still owned by the participant, the army returns there. If it is neutral or clan-owned, the army returns to the participant's Main City. If an enemy owns it, the returning army attacks that city.
- **Confirmed October 18, 2026 — pending validation and authorized deployment:** an ally who withdraws a Ready contribution from a city-assembled Rally may use the existing Recall Horn on that withdrawal to turn back. On arrival at the same assembly city, the army rejoins the same Rally as Ready if it is still forming in the current realm, has a free participant slot, still belongs to the same active clan, the ally has no other contribution, and the creator still owns the assembly city. Both rulers must retain current clan membership; Tower-target eligibility still applies. Preserve the contribution's original home city for later returns. If any check fails, use the existing recalled-army safe return without adding a contribution. Repeated withdrawals use distinct marches; simultaneous arrival, launch or cancellation must never duplicate troops, committed troop totals, King Power or return settlement. This exception changes no item cost or ordinary Rally limits.
- Ordinary objective Rallies are not restricted by ordinary-city attack protection, neutral-city caps, or anti-farming gates. Committing Rally troops does not remove a Royal Peace Shield.
- The ordinary Rally lifecycle correction above is `LIVE — ALL PUBLISHED CHANNELS`. PR #171 merged as `1e5cdad...`, PR #180 merged the stale Rally-ownership correction as `1a0efbcb...`, and descendant build `a561374b...` established the first verified cross-channel baseline. Current web and itch.io build `fdf326a...` retains the correction. The corrected beginner guide remains live on the canonical game host and itch artifact but not on the separately published primary-domain public site.
- The three-member Holding Tower attack and conquest rule documented in Section 8 is target-specific and `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT`; its three-member minimum does not replace the ordinary Rally minimum globally.

### Clan Treasury

- Clan Treasury is `IMPLEMENTED — PENDING MERGE AND AUTHORIZED DEPLOYMENT` as part of Holding Towers.
- Treasury funds are donated personal Gold and cannot be withdrawn.
- All members may donate; only Leaders and Officers may spend.
- Treasury balance resets each season and when the clan disbands.
- The UI and ledger record seasonal total donated and total spent values.
- **Confirmed October 20, 2026 — pending validation and authorized backend deployment:** replace the 12-hour raw-production allowance with a fixed **250,000,000 Gold per player per UTC day**, independent of income. Members may donate smaller amounts up to their personal Gold and remaining allowance. Reset at 00:00 UTC with no carryover. Track usage per player across all clans; leaving, removal, rejoining or disbanding does not replenish that day's allowance. Retain the same player/day counter across a season change within that UTC day.
- Count existing current-day/current-realm clan donation records toward the new limit on first use. Preserve actual donated totals, including totals above 250 million; those players have zero remaining allowance until the next UTC day. Never refund, confiscate or rewrite Treasury balances to introduce the cap. Ignore other days and archived realms when importing old counters. Donation receipts, personal Gold, allowance and Treasury credit remain atomic and replay-safe, including retries after a clan change.
- Show donated today, remaining allowance, the fixed daily cap and a server-aligned reset countdown. Max remains the lower of personal Gold and remaining allowance. Keep role permissions, finality, seasonal Treasury reset, upgrade prices and construction timers unchanged.

#### Confirmed Treasury presentation (2026-09-23)

Use the approved parchment Treasury view inside Clan Rewards, with existing Gold artwork, Treasury balance and seasonal donated/spent totals on the left, and personal Gold, an exact amount input, Gold slider and Max control on the right. Max is the lower of personal Gold and the remaining daily allowance. Show the personal and Treasury balances after the selected donation, the daily cap, donated/remaining amounts and 00:00 UTC reset countdown. The October 20 fixed allowance supersedes the former raw-production basis and locked/preview labels. Keep the review action visible while the two detail columns scroll on desktop and landscape mobile. Confirmed September 29, 2026: Treasury stays beneath the shared Clan and Rewards tabs, just like Gold Gifts and Weekly Conquest. Keep both navigation rows visible and highlight the selected Treasury tab; they replace the separate Back to Rewards control. On short landscape screens, omit the duplicate Treasury heading and scroll the detail columns beneath the tabs while keeping the review action visible. This navigation update is pending merge and release verification. Confirmation shows the exact amount, resulting balances, allowance impact and the finality warning. Live refreshes preserve the typed amount, expanded rules and scroll position within the current clan/session. Donation responses remain authoritative, retries reuse the operation ID, and personal Gold is refreshed from the existing economy endpoint after acceptance. This presentation preserves permissions and spending rules; the October 20 amendment above replaces the donation-limit rule.

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
- Crowns purchase cosmetic city skins. **October 16 confirmed extension:** applying a saved skill preset costs 10 Crowns per confirmed application under Section 6; saving and renaming remain free. **October 12 confirmed extension:** one daily stamina refill to 100, priced proportionally to missing stamina at 30 Crowns per 100 points and rounded up to whole Crowns, is approved under Section 6; it grants extra hunting opportunities and supersedes cosmetic-only/no-gameplay-benefit wording. **October 7 confirmed extension:** the estate Wagon Yard will sell building supplies for Crowns and the Market will sell food supplies for Crowns. This explicitly supersedes the cosmetics-only/no-resource-conversion restriction for these two supply catalogs; prices, quantities, limits and gameplay implementation remain `PLANNED`, as specified in Section 16. Player transfers and player-to-player Crown trading remain prohibited. Daily Missions and their existing Common Gear Box completion reward grant no Crowns. Earn Crowns through the map pickups specified in Section 6.
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

- The user requested payment support for buying Crowns and selected Stripe while creating a merchant account. The permanent, non-transferable Crown wallet and seasonal persistence rules remain in force; the October 7 estate supply extension is planned separately from payment setup.
- Prepare hosted checkout and server-verified, replay-safe purchase receipts in Stripe test mode. Test payments must not add playable Crowns. On October 5, 2026, the user confirmed the first one-time pack: **1,000 Crowns for US$4.99**. Halloween City remains 600 Crowns. Additional packs and live refund/dispute policy remain unconfirmed; do not treat test fixtures as approved offers.
- The initial implementation is restricted to designated test accounts. On October 5, 2026, the user authorized connecting the Stripe sandbox, initially with checkout disabled, then designated one game account for the first sandbox purchase. The four sandbox payment functions were deployed from merged commit `83424189a3e82bf8cf2a02dcecbe1c207b72b0c1`; test credentials, webhook configuration, endpoint authentication and webhook signatures were verified. The private configuration enables only the designated account for the approved 1,000-Crown / US$4.99 sandbox pack. A signed-in hosted test payment was verified complete and paid at `2026-10-05T20:28:01Z`; automatic webhook fulfillment credited exactly 1,000 test Crowns before manual status checks. Repeated status checks and a signed completion-event replay added no duplicate credit, and the playable wallet remained unchanged. Status: `SANDBOX PURCHASE VERIFIED — ONE TESTER ENABLED`. Live payments require separate implementation/release approval, completed merchant setup and remaining provider failure-scenario tests. Evidence and remaining launch work: [Crown payments](./CROWN_PAYMENTS.md).
- The first signed-in sandbox attempt exposed a Stripe API compatibility failure before payment: the installed SDK's Endive version rejects the existing card-only Checkout parameter. Checkout creation now pins the supported Dahlia contract, retaining the sandbox's payment methods and order protection. Only `createCrownCheckout` was updated from commit `6208eb0f3e7d4952adb2a85a57e4d504a78b9eaa` and verified active on October 5; all other functions and the current-realm pointer were unchanged. The original provider-cached failed attempt was retained as an expired receipt after proving it had no Stripe session; a fresh in-game order completed the successful test.

#### Live Crown purchase setup — confirmed October 5, 2026

- The owner requested live purchase setup and confirmed **crownlandsmail@gmail.com** for private support, **manual review** of refunds, and **all countries allowed**, subject to Stripe availability and applicable law. The approved pack remains **1,000 Crowns for US$4.99**; Halloween City remains 600 Crowns.
- Add a separate live Checkout path that credits the permanent playable Crown wallet only after server verification of a completed, paid Stripe order. Keep sandbox keys, orders, webhooks and test wallets separate. Repeated or concurrent payment notifications must not credit twice, and concurrent cosmetic purchases or map pickups must retain their balances and receipts.
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
- **First-login reminder clarified October 16, 2026:** Automatically show Last Season Rewards at most once per signed-in player and current season in the same browser, after the kingdom loads. Remember the presentation when the panel actually opens, including pending/error results; Later, Close, unclaimed rewards, subsequent logins, refreshes and foreground resumes must not reopen it. A new season or another player has its own reminder. Use persistent browser storage with a page-memory fallback when storage is unavailable; another browser/device or cleared site data can show the reminder again. Manual Leaderboards → Season Rewards access, retry/refresh, claims, receipts and non-expiring entitlements remain unchanged. This reminder is presentation state, not a reward claim.
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
- **Podium crowns confirmed October 13, 2026; LIVE — WEB:** current first, second and third place use gold, silver and bronze crowns respectively on all three boards. Center each crown above its visible numeric rank and flag/heraldry. These current-rank markers are separate from the previous season's earned crowns, crossed swords and laurels; reward eligibility, scores and saved flags/heraldry are unchanged. PR #554 publication and verification are recorded in FM-2; itch.io was not republished.
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

### Approved troop-only King Power — October 6, 2026

**Status: `LIVE — ALL PUBLISHED CHANNELS` with the shared Firebase backend, verified October 6, 2026 at build `390ed498...`; current-realm player and clan scores converted. Itch upload `19600336` passed exact public artifact parity and six desktop/mobile startup cases.** This rule supersedes the earlier replacement-production and defensive-power formula below.

- King Power is exclusively **total controlled troops × 2**. Count city/royal-holding and occupied Camp garrisons, active non-rally marches, stationed reinforcements, committed rally troops and personally owned Tower garrisons once, across the current realm. Duplicate march mirrors and rally movement copies must not double-count troops. Preserve current world, generation, shard and ownership guards.
- Moving troops among these locations preserves the complete score. Production/rewards add two power per credited troop; casualties and other actual troop removals subtract two. City levels, walls, VP, Gold, production rates, objectives, skills, gear and timed items have no direct score contribution. Their existing production and combat effects continue. Keep numeric overflow guards.
- A confirmed zero troop count means zero King Power. Missing, old-version or unavailable enemy scores remain unverified until authoritative repair; zero must neither revive an older positive cache nor repeatedly request a repair.
- Derive power from the same committed troop snapshot used by existing economy/action transactions. The client consumes the existing global-stats subscription. Production remains lazily settled through existing player actions and the normal 120-second economy refresh, with fractional accrual retained; there is no new per-second polling or kingdom scan. A pending production estimate is not an additional committed army.
- Camp payouts publish reward troops, returning marches, the emptied Camp and player/global/leaderboard power in one transaction, reusing its reads. Determine the Camp reward tier before crediting that reward. Delayed/repeated clan events reconcile against current membership and current published stats; clan projections remain asynchronous.
- Existing attack-protection thresholds/caps, XP multipliers, retaliation rules, daily safe-target selection, Camp tier cutoffs/multipliers and ranking/reward rules remain unchanged. Their power inputs now use troop-only scores. Map classifications, public profiles and Kingdom/Clan standings can consequently change. Zero-score kingdoms remain ineligible for the existing positive-score personal season rewards.
- Preserve saved launch/attack-protection commitments, already earned awards and historical final standings. Do not reinterpret old-season data using the new formula.
- A coordinated release must update backend and client versions and rebuild only current-realm published player/clan scores using the existing guarded repair/reconciliation paths. Old own-player v12 troop snapshots can supply the new arithmetic while scores migrate; old enemy score projections cannot authorize a classification. Deployment and any production rebuild require separate explicit authorization and verification. Until migration finishes, published standings can contain old scores and must not be represented as fully converted.

### Historical verified implementation (superseded King Power formula)

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

### Friends and private messages — approved October 17, 2026

- Friends and Messages share the existing parchment Chat window. The tab order is Global, Clan, Messages, Friends, with Friends immediately to the right of Messages (confirmed October 17, 2026). Player-profile actions are the entry points; no new search directory or HUD button is added. Friendship is social only and never changes combat, scouting, clan membership, or rewards.
- Switching between Global, Clan, Messages and Friends preserves the same window, header and tab sizes. Messages and Friends use Global/Clan's compact content and player-name typography at each screen size (confirmed October 18, 2026).
- Messages conversation and message-request rows are single accessible tap targets: the name, flag, metadata and remaining row area open the private conversation, never a player profile, and there is no separate Open button (confirmed October 18, 2026). Desktop uses a compact conversation sidebar; phones and short landscape windows show the selected thread across the available width, with Back returning to the list. Compact controls leave the remaining height to scrollable, readable message history and keep the composer visible.
- Private messages match Global chat's compact row padding and text sizing, with the text beside the sender's name and the time on the same line at the right (confirmed October 18, 2026). Long names and messages wrap within their columns; the full date and time remain available to assistive technology and on hover. A compact message-actions menu stays at the right without forcing a tall row.
- Friendship requires an accepted request. Friends can message directly. Other players may send one introductory message request, and must wait for acceptance before sending more. Accepting a conversation does not create friendship. Crossed requests must not duplicate relationships.
- Friendships, blocks, preferences and conversation contacts persist across seasons, renames, clan changes and world-slot cleanup. Private text has a rolling 90-day lifetime. Global and Clan retention rules remain unchanged.
- Friends automatically see Online/Offline, with no enable switch, location, or last-seen display. Presence derives from server heartbeats and becomes Offline after three minutes without a heartbeat.
- **Confirmed October 18, 2026 — compact friend actions:** Message and Remove friend sit beside the player's name on the same line. Use smaller buttons within the existing name-line height; never enlarge that line or the containing panel. Keep the flag, clan tag and Online/Offline status visible. Long names may truncate visually, retaining their full accessible name and hover text. Messaging, profile navigation and removal retain their existing behavior.
- Removing a friend leaves accepted conversations available. Blocking removes friendship, cancels requests and stops private contact and friend-presence access. Unblocking does not restore friendship or accepted conversation state. Blocks do not affect combat or public chat.
- First version: one-to-one plain text, unread-conversation badges, request management, blocking and reporting. No attachments, groups, read receipts, typing indicators or link previews. Private text stays out of the public mini-chat preview and persistent browser caches.
- Limits: 1,000 characters per private message, three seconds between private sends, 200 accepted friends, and 20 new friend/message requests per account per UTC day. Pending requests expire after seven days; declined/expired/cancelled requests cannot be resent by that sender to the recipient for 30 days.
- Private browser alerts have a separate opt-in, default Off. Notifications hide message text, combine repeated alerts, and never alert for unsolicited message requests. Existing attack alerts keep priority.
- Manual Translate sends only the selected authoritative message text to the existing Google service after the player clicks. Explain this alongside the control. No automatic detection or translation runs for private messages; the existing shared monthly allowance and authorization checks apply.
- Reporting retains the selected message and up to five preceding, still-visible messages for 90 days from the report. Only the protected server operator tool can review evidence, dismiss reports or apply an audited private-messaging restriction. Reports alone never trigger automatic sanctions.
- Runtime changes require a coordinated local service and client release, including access-control, recovery, retention, performance, and desktop/landscape checks. **Status:** `LIVE` on the home server’s `local-live` channel. PR #603, build `9d89c4f3cdc15a0c2369b98596b8a0e888b83b15`, was installed and its backend, feature gate, public files and six health endpoints verified on both web game domains on October 17, 2026. The new indexes and isolated installed-runtime tests passed; approval or merge alone did not establish deployment.

### Shared map locations — approved October 20, 2026

- Share location in target details supports NPC cities, Marauders, clan bosses, player castles, Clan Towers, Strongholds, the Crown Citadel and reward camps on active Core maps. Choose Global, Clan or a specific friend/existing private conversation and optionally add a note. One location per message; a note is optional. This narrowly extends the first-version text-only rule above: arbitrary files, external link previews and group messages remain out of scope.
- Use the existing map-and-flag artwork beside a compact target-name/map link in the normal chat line, with the same typography in Global, Clan, private messages and the public mini-chat. No large location cards or additional HUD button.
- Confirmed October 20, 2026: location links use readable dark ink on full-chat parchment and light ink in the dark mini-chat, without filled button backgrounds. Private recipients appear as selectable rows in a scrollable game-styled list inside Share location, never the phone's native select popup. Selection is explicit; the Share and Cancel actions remain reachable in short landscape windows.
- The server creates the public snapshot and checks it again when opened. Sharing never includes troop counts, scout reports or other private information. Opening changes the viewed map, centers and highlights the location, and minimizes chat while preserving its conversation, scroll position and draft. It never dispatches troops or completes an armed order.
- Marauder and boss links identify the exact spawn; defeated, retired or replaced spawns become unavailable. Castle links retain their recorded position and report a move rather than tracking a relocation. Ownership changes do not invalidate the public location; the map shows current ownership. Previous-season links remain historical text and cannot navigate into another season.
- Existing message visibility, clan membership, blocks, requests, send cooldowns, retention and reporting apply unchanged. Private alerts continue hiding content. Translation covers the optional note only. A failed send can retry the same request without duplicating its location message.
- Store one bounded snapshot per message and resolve on click; no per-message polling, extra subscriptions, or loading target details while scrolling history. Runtime installation and matching client publication must be coordinated. **Status:** base sharing is `LIVE` on `local-live`: PR #644, build `acd46e5307295af63ce88998a8a274e02664be1a`, had its installed runtime, public files, anonymous startup and all six services verified October 20, 2026. The readability/recipient-list refinement above is pending its separately verified static release; a merge does not establish live deployment.

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
15. All twenty Inner Castle estate buildings, their completed levels and earned benefits, including officer Gear rarity entitlements — confirmed October 7, 2026; persistence implementation is `PLANNED` and distinct from the existing Gear reset helper
16. Acquired expedition champions, quality, levels, accumulated XP and recovery deadlines, active estate expeditions and earned/unclaimed estate rewards — confirmed October 7, 2026; `PLANNED`. This is separate from seasonal Hero progression.
17. All estate material stockpiles and fractional production, processor preferences, partial building deposits, funded construction/queues, quotes, timers and transaction receipts, plus estate recruitment/catalog state and applicable daily allowance history — confirmed October 7, 2026; `PLANNED`. The complete Inner Castle persists; a realm rollover must not erase progress, restart a timer, duplicate settlement or refresh a daily allowance. Existing world Gold, world-city and Hero reset rules remain separate; the shared Gold counter is not a new permanent estate currency.

18. Accepted friendships, social blocks, private-alert preferences, and private conversation contacts; message text expires after 90 days independently of season boundaries — confirmed October 17, 2026.

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
- Starting placement selects among the least-populated admitting New Lands maps with random tie breaking and remains replay-safe. Each New Lands map contains 40 neutral regular cities; when one reaches 10 neutral cities, it closes to new-player admission and the next two cardinally connected maps are prepared, verified, and admitted together in clockwise order. Both initial layers are playable from reset, but only the first north-center map initially accepts starting players. Opening maps ahead of their admission turn must not skip either layer's normal placement order.
- Scheduled work, leaderboards, clans, activity, combat, armies, reports, presence, and world reads execute once against the shared current-generation partition. Archived generations remain inaccessible and inactive but intact for rollback and historical retention.
- Monthly generation and world identifiers remain `realm-YYYY-MM` and `main-realm-YYYY-MM`. Realm generation isolation remains mandatory even though population sharding is removed.

**Status:** The shared-realm and Core-expansion foundation is deployed; the September 2, 2026 activation boundary is historical. The next-reset change to open two initial New Lands layers is implemented pending validation and deployment. Both the scheduler and first eligible client handshake must seed and verify all 81 initial maps before the current-realm pointer may change. This change does not rewrite the current realm, archived realms, or player/clan persistence rules.

### Implementation state

- Season/reset persistence policy is confirmed design.
- One shared monthly realm and removal of the 50-player split are implemented. The temporary five-island starter placement remains the legacy fallback only and is not used after the scheduled Core-expansion activation.
- The approved reset target is the 25-map Core plus the complete 24-map first ring and 32-map second ring, all available at reset. Later New Lands layers begin at the north-center cardinal entrance and allocate clockwise. A layer may never begin on a corner because inter-map roads connect only north, east, south, and west. Every player-facing map label uses a unique medieval-authentic place name. Each New Lands map starts with 40 neutral NPC cities; at 10 remaining neutral cities on the current admitting map, the next two maps become admitting for incoming players. The independent admission cursor applies only to newly initialized generations; existing realms keep their existing expansion cursor. Deterministic Layer 3+ generation, routing, live client discovery, and player/clan reset persistence remain unchanged.
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
| All twenty Inner Castle building levels and earned benefits | Persist | No authoritative estate building progression or reset persistence exists yet | `PLANNED` — confirmed October 7; supersedes the former six-building subset |
| Champions, estate expeditions, recovery and earned rewards | Persist | No authoritative champion or estate progression persistence exists yet | `PLANNED` — confirmed October 7; distinct from seasonal Hero progression |
| Estate materials, deposits, production state, construction/queues and receipts | Persist, including loose stocks and partial progress | No authoritative estate economy or migration implementation exists yet | `PLANNED` — confirmed October 7; active work continues across seasons |
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

- **Parchment resources and display controls — confirmed October 16, 2026:** Extend the restored Reports/Incoming/Outgoing parchment style to the Gold and Crowns balances, Stamina card, fullscreen entry and exit controls (including the login-screen toggle), and Home City return button in both corner and map-edge modes. Use the same warm paper, gold-brown border, inset shading and dark readable text/icons. This supersedes burgundy paint for these controls only. Preserve their existing dimensions, placement, responsive layout, currency icons/values, stamina amount/bar and low-stamina state, refill review, accessible labels, keyboard focus, fullscreen switching and Home navigation. Do not change payment, stamina, travel or game-state rules. Implementation and merge do not establish deployment.
- **Movement notice style restored — revised October 16, 2026:** Restore the previous flat warm parchment surfaces, gold-brown borders and inset shading for Reports, Incoming and Outgoing. Keep the new March Orders horse for Outgoing and crossed-swords report artwork for Incoming; Reports retains its existing emblem. This supersedes the same-day illustrated name-ribbon backgrounds only. Preserve target sizes, placement, live counts/timers, report unread badge, burgundy Incoming and blue Outgoing text, and mouse/touch/keyboard actions. The holding-notice rules below and transparent Chat remain unchanged. [Retired ribbon artwork and provenance](art-sources/movement-ribbons/README.md) are retained as source history, outside the production package. Implementation and merge do not establish deployment.
- **Parchment movement notices and transparent Chat — confirmed October 16, 2026:** Reports, Incoming and Outgoing use warm parchment surfaces with dark readable labels; Incoming retains a burgundy cue and Outgoing a blue cue. Preserve their target sizes, placement, live counts/timers, report unread badge and mouse/touch/keyboard actions. Remove the Chat button's inherited backdrop blur so the map remains clear through its transparent artwork; keep its parchment label and visible keyboard focus. Held Camps, Strongholds and the Crown Citadel do not activate Outgoing, increase its count, or replace its status with holding timers. Marches, rallies and clan support retain their existing notifications. The complete Kingdom Activity snapshot and its holding tabs retain owned-objective information; an already-open holding view stays available and updates when the last march ends. This supersedes the earlier colored notice surfaces and held-objective Outgoing indicator behavior only. No ownership, travel, combat, reward or payout rules change. Implementation and merge do not establish deployment.
- **Named Chat toggle image — confirmed October 16, 2026:** Use the approved revision 2 cream-and-gold chevrons above a parchment **Chat** ribbon, matching the named HUD buttons. The arrows are slightly smaller than the initial draft while the ribbon and text retain their original size. Keep the 56 × 56 px target, position, spacing, unread dot, accessible labels, keyboard focus and show/hide behavior. The left chevron opens mini Chat; the right chevron collapses it. Separate images keep the ribbon text upright. This approval supersedes the earlier burgundy toggle surface and SVG arrow requirement only; mini Chat's dimensions, transparency, messages and translation controls remain unchanged. Deliver compressed transparent images through the existing runtime cache. [Approved artwork and prompts](visual-qa/chat-toggle-image-draft/README.md). Implementation and merge do not establish deployment.
- **Named bottom-right HUD images — confirmed October 16, 2026:** Extend the approved top HUD treatment to **Bag**, **Shop**, **Cities** and **Map**. Keep their existing satchel, merchant scales, castle/scroll and map illustrations recognizable and draw each name on a matching parchment ribbon. Preserve the current bottom-right target sizes, positions, spacing and actions, including responsive dimensions, city-count accessibility, current-region tooltip and Map visibility. These four controls also use transparent image surfaces instead of burgundy rectangles. Keep keyboard focus visible, preserve the unlabeled window-header artwork, and cache compressed delivery images through the existing runtime cache. Artwork and exact prompts: [bottom-right HUD images](art-sources/labeled-bottom-hud/README.md). Implementation and merge do not establish live deployment.
- **Named top HUD images — confirmed October 16, 2026:** Use the approved illustrated image buttons labeled **Leaderboard**, **Clan**, **Daily** and **Inner Castle**, with names drawn on parchment ribbons. Preserve the existing 56 × 56 px buttons (46 × 46 px on small landscape screens), positions, spacing, accessible names, notification badges and actions. The Clan ribbon is a separate image below the player's actual saved clan shield, which remains dynamic; players without a clan retain clan discovery. For these four buttons only, the approved transparent image treatment supersedes the earlier requirement for burgundy rectangular surfaces. Window headers retain their existing unlabeled illustrations. Keep keyboard focus visible and deliver compressed artwork through the runtime image cache. **Status:** `LIVE — WEB` at verified local-server build `16512ad423ae6bc37f07ff6b326056e6347c1b9c` on October 16 at 20:00 UTC; [deployment evidence](LOCAL_RELEASE_2026-10-16_PRESETS_HUD.md). Artwork and exact prompts are in [the approved HUD review](visual-qa/labeled-hud-buttons/README.md).
- **Shared Guild Master UI theme — revised October 14, 2026:** Apply the owner's Guild Master screenshot reference throughout the game: flat burgundy headers and HUD controls (`#72363a`, with darker `#542728` hover), warm parchment panels (`#ede1c2`), muted gold rules, brown body text and cream header text. Tabs use parchment with a subtle inset gold frame separating adjacent choices, a restrained burgundy selection underline, and a stronger inset border for keyboard focus. Window dismissal uses one centered cream X in a dark square with a thin gold-brown border and at least a 44 × 44 px target, aligned clear of titles and neighboring controls. The owner's later same-day color correction restores the previous burgundy in place of dark oak while preserving the approved parchment, boxed X, inset tab frames, alignment, geometry and artwork. The earlier plain-X/no-box direction remains superseded. Retain readable semantic attack, ownership, warning, success and rarity indicators, saved heraldry, keyboard focus, dismissal guards, pending-action locks and required reward collection. Remove superseded close-button paint and connect component palettes to shared tokens. Verify desktop and short landscape layouts. Preview, implementation and merge do not establish a production deployment.
- **Login presentation — confirmed September 27, 2026:** Replace the photographic, framed login background with an original medieval ink-and-watercolor kingdom illustration based on the owner's map-art reference. Remove the right-hand promotional panel. Fill the viewport with responsive artwork and present a readable Crownlands title above one parchment account panel. Support desktop and mobile login layouts, retaining existing account, realm, audio, fullscreen, community, and information controls. Gameplay rules are unchanged. Implementation and artwork provenance: [Illustrated login](./visual-qa/illustrated-login/README.md). Production deployment requires verification.
- **UI transition audio — confirmed September 27, 2026:** Use the owner-supplied `RPG Sound Pack/interface/interface2.wav` for UI opening and closing, including menus, reports, city details, dialogs and Profile. Keyboard and backdrop closes use the same cue. Retain ordinary button-click audio and Effects controls; music continues independently. Emit one interface sound per transition, suppress duplicates and content-refresh noise, and preserve contextual action feedback. Production deployment requires verification.
- The game must remain readable and operable in landscape mobile layouts and on PC.
- **Matching window title artwork — confirmed October 14, 2026:** Item Bag, Shop, City List, Map, Leaderboards and Daily Login show their corresponding illustrated HUD button image to the left of the window title. Use the same existing artwork, uncropped and vertically centered, with consistent responsive sizing on desktop and landscape mobile. Daily Login's navigation tab also uses its HUD image. Quests and Achievements use original scroll/quill and crowned-shield illustrations in the owner's medieval map ink-and-wash style, matching their respective navigation tabs and window headers. All three reward tabs retain Daily Login's outer dimensions and share identical panel, header, tab and boxed-X placement when switching, including fullscreen. Longer content scrolls within that frame. Preserve title readability, header balances, window actions and gameplay behavior. Artwork provenance: [Reward navigation](art-sources/reward-navigation/README.md). This confirmed presentation does not establish deployment.
- **Top-left HUD alignment — confirmed October 14, 2026:** Align the profile/action row, resources and combat timers with the Reports button's 12px left screen inset on desktop and landscape mobile, both in and out of fullscreen. Do not add the header's former left safe-area gutter to this group. Preserve control sizes, internal spacing, vertical placement, right-side controls and existing actions. This confirmed correction does not establish deployment.
- Critical actions, timers, troop counts, resource values, reports, warnings, and state changes must have sufficient contrast and must not depend on decorative texture alone.
- Medieval presentation should use parchment, wood, leather, rope, wax, stone, and worn metal without sacrificing clarity.
- Modal content must remain reachable on supported short landscape screens.
- Touch and pointer targets must not overlap or retarget to unrelated controls.
- Map switching must not open Shop or Bag unintentionally. The current fix is `LIVE — ALL PUBLISHED CHANNELS`.
- Movement HUD, Reports, Chat, and modal layers must stack predictably.
- Reduced-motion and performance-sensitive behavior must be respected where animation exists.

### Confirmed shared notification badges — October 19, 2026

The owner selected the chat's compact burgundy circle with a white number as the notification style throughout the game. Use one shared 20 px circular treatment with a thin muted-gold border for HUD alerts, chat channels/private conversations, reports, clan alerts, claimable rewards and new-equipment/upgrade-ready markers. Cap displayed counts at `99+`; retain the underlying count and descriptive accessible label. **Confirmed follow-up October 19:** use a white `!` for unquantified availability notices, including upgrade-ready equipment and building-level new-gear flags, instead of inventing a count of one. Actual unread report/conversation counts and new-item quantities remain numeric. Hide badges when no alert remains. Preserve button targets, panel dimensions, existing notification eligibility, role restrictions, read/claim clearing and gameplay rules.

**Confirmed report refinement October 19:** show the unread-report circle on the Reports tab/button only, not on each battle report row. Keep the existing new-this-visit row highlighting, summary and account read watermark behavior.

Show `!` for sending a Clan Gold Gift when current membership, another active recipient and the existing five-hour cooldown permit it, and for Clan Tower donations through Clan Treasury when current-day allowance and personal Gold permit a positive donation. Surface these notices on the Clan HUD/Profile Clan tab, Rewards navigation and corresponding gift/Treasury controls. Existing pending-application, active-rally and claimable-reward counts take precedence on shared parent badges; availability remains described and marked in the relevant child controls. Use confirmed current-session/clan data, hide unknown or expired availability and refresh at cooldown/day rollover with the existing tick and scoped Treasury read. Opening a menu does not dismiss an action that remains available. No costs, donation caps, cooldowns, recipient rules or server authority change.

The Chat HUD combines unread Global/Clan messages and unread private conversations in one badge so indicators cannot overlap. Keep separate descriptive counts in its accessible label and each channel's own badge. The existing text-free chat dots, reward exclamation marks and notification-only New labels are superseded by the shared circle treatment. Resource quantities, player/building levels, combat timers, item rarity and equipped/locked status, decorative achievement emblems and operating-system notifications retain their own presentation. This approval does not establish deployment.

### Confirmed report and action artwork — October 14, 2026

Use five matching transparent ink-and-watercolor illustrations based on the owner's medieval kingdom map: sealed dispatch for Reports, crossed swords for Attack, shield for Defense, hooded Scout and castle for Realm Activity. Apply them throughout the corresponding HUD, tabs, report rows and details, action controls, troop-order headings, incoming threats, Help and report notification artwork. Preserve dimensions, accessible names, outcome text/colors and controls. Saved heraldry, map units, objective artwork, named skills and equipment keep their distinct identities. This presentation change does not alter combat or report rules and does not establish deployment. Prompts and asset hashes are recorded in `docs/art-sources/report-actions/`.

### Confirmed troops helmet artwork — October 4, 2026

The approved troops icon is a frontal medieval helmet with worn steel, a broad dark brim, two eye slots, an angular face guard, subtle brass rivets and a transparent background. Use the same image across shared troop statistics, production, rewards, reports, troop orders, city and objective panels, Barracks icon controls, and default troop reward particles. Retain existing icon sizes, accessible labels and explicit reward artwork. Map army/scout tokens, heraldry, troop pickup bundles, officers and equippable item illustrations retain their existing designs. Troop counts, production, combat, progression and server authority are unchanged. The approved source and prompt are retained in `docs/visual-qa/troops-helmet/`; the 192 × 192 WebP is recorded as `troops-helmet` in `assets/optimized/manifest.json`. Approval and integration do not establish a live deployment.

### Confirmed estate economy repair — October 8, 2026

**Status: `LIVE — WEB`**, verified October 8 at build `a4cd34668464d047818f2663da38a3eb76bf6004` from PR #479; see FM-2 for deployment evidence and manual-review limits. The owner explicitly approved the repair after reviewing PR #479. The approved [repair contract](estate-economy/READINESS_PLAN.md) and its versioned [parameters](estate-economy/readiness-proposal.json) supersede conflicting proposed values in the earlier estate draft. All twenty buildings, materials, fractional production, deposits, funded jobs, champions, XP, expeditions, recovery and receipts persist across seasons. World Gold retains its existing seasonal authority.

- Preserve the exact 1/3/6/10 reference-season material budgets for each individual building at 50% production, Level 100 maximum and Gold-only first construction. Adopt the squared first-band material ramp and nine-minute first upgrade, with unchanged 6/12/18/24-day base timer budgets. These are resource equivalents with paid supporting infrastructure, not a guaranteed calendar for all twenty buildings.
- Other buildings may only fund levels at or below the completed Great Hall level. The Hall's original absence of building dependencies is superseded by the October 19 requirements below. Every completed level keeps its benefit during upgrading.
- Wagon Yard adds 15L + 8L² capacity per non-food material; Market adds 12L + 6L² per Grain/Food stock. These benefits do not require Crown spending. Existing stocks are never truncated. Paid supplies keep the shared one-hour UTC-day allowance and 20 Crowns/hour pricing.
- **New Gear acquisition exception:** each officer building may run one material-funded commission for a selected existing item family. It returns one Level 1 item at the highest completed building milestone rarity (1/25/50/75/100). Duration decreases from 168 to 72 hours over building Levels 1–100; the non-food recipe totals four fixed reference material-production hours. Snapshot the recipe, output, entitlement and duration on acceptance. Keep completed orders claimable if inventory is full. This explicitly supplements the Section 11 upgrade and day-30 chest acquisition rules; the two matching inputs and fixed item Gold fees remain unchanged. Veterans retain existing item access. The October 19 requirements below replace the previous account-wide entitlement exception for future promotions and newly granted items; previously owned items, unopened chests, pending grants and existing entitlements must remain stored without loss.
- Quest resource-hour rewards per elapsed hour are 0.009/0.0135/0.018/0.0225/0.027 by tier. Food costs ceil(0.01 × duration × quoted net Food/hour); no additional Tool fee. Keep 2/4/8-hour quests, up to three parties, and one shared 2.4-resource-hour UTC-day allowance including meals. Reserve at launch; retain quotes and originating-day receipts across resets. Reject zero-output selections. Do not sell a reward-only meal with no rounded payout improvement.
- Champion XP to advance from L is 4L, with 20 XP/hour and tier multipliers 1/1.1/1.2/1.3/1.4. Recruit starting level is min(GuildLevel, 1 + floor((AlehouseLevel−1)/10)). Bank at most one next level at the Guild ceiling, disclose exact credit, and never delete previously earned XP. Ownership is permanent and unbounded on a paginated bench; the 6→24 limit applies only to the active roster. Idle champions may move freely; recovery and quest identities/deadlines persist.
- Funding purchases a **permanent, nonrefundable building contract**. Quote the exact target, version, material credit, additional materials, seasonal Gold and duration before acceptance. Debit once atomically. Removing unstarted work pauses its paid contract; resuming costs nothing. No withdrawal, wallet refund or transfer to another project is allowed. Started work cannot be cancelled. Matching retries return the original receipt even after a world reset; new expired-world spending is rejected. Honor funded prices and durations through balance revisions; complete each target once.

Runtime, combined-account simulation and selected emulator validation passed before merge. The matching backend, rules and web client are verified deployed; signed-in production play and human long-term pacing remain manual checks. The approved presentation and Gear entry/return behavior remain unchanged.

### Confirmed Hall and officer Gear requirements — October 19, 2026

**Status: implementation in progress; not yet deployed.** The owner confirmed the building requirements and explicitly chose to keep existing gear usable while requiring building levels for future rarity promotions.

- To start Great Hall Level L+1, all eight resource producers/processors must have completed Level L: Forester's Lodge, Quarry, Mine, Farmstead, Sawmill, Smithy, Workshop and Windmill. Required levels are minimums; higher completed levels qualify. Storage and support buildings are not resource producers. Unfinished jobs do not count. Requiring L+1 would conflict with the existing Hall ceiling and is not allowed. Existing completed levels and paid/running contracts remain intact; new quotes and starts enforce the rule before spending.
- Treasury, Barracks, Royal Stables and Gatehouse independently unlock Common/Uncommon/Rare/Epic/Legendary Gear at completed building Levels 1/25/50/75/100. Every new rarity promotion requires the destination rarity's building level, including promotions for veterans who already own that rarity. Owning an item, unopened chest, pending reward or historical entitlement does not substitute for that completed level.
- Items already owned when this backend update activates retain equip, unequip and same-rarity upgrade access. A same-rarity upgrade carries the selected target's existing access forward; a rarity promotion always uses the new requirement. No automatic unequip, item deletion, building downgrade or bonus reduction is performed.
- Newly issued items from opened chests, officer commissions and Guild claims carry the building requirement. They remain owned and visible in the Bag but cannot be equipped or upgraded until the matching completed level is met. Unopened chests and pending grants retain their contents and claim rights; receiving or opening them does not grant a building-level exception. All new promotion results carry the requirement. Ordinary profile saves cannot edit these server-owned item fields, and the marker persists through seasons and normalization.
- Show the required and current building levels in equipment, disable unavailable Equip/Upgrade actions and retain Unequip. Unknown building state must not imply permission. Hall prerequisite panels use the same server-computed requirements and existing navigation to the blocking buildings. Preserve prices, matching-copy quantities, rarity colors, icon sizes and building timers. Successful historical request receipts remain replayable without another charge.

### Confirmed external building upgrades — October 8, 2026

**Status: `LIVE — WEB`**, verified October 8 at build `b000ba0f9eac589406d2b815a6cea251487b1417` from PR #485; see FM-2 for coordinated deployment evidence and manual-review limits. This owner-confirmed follow-up supersedes new construction batches and upgrade queues from the preceding estate release. Keep permanent deposits; each building exposes a separate Upgrade requirements button on the estate map and in the building directory. Interior service and Gear screens no longer contain construction controls. Preserve fixed bottom name/level captions, artwork, camera and equipment returns.

- Show the next target's materials, required/deposited/remaining/available amounts, Gold, timer and current/next benefit. Players may deposit positive whole units toward that building only; deposits survive seasons and do not start work automatically. They remain nonrefundable and nontransferable.
- Only the next single level may start. Enable Upgrade after its entire material bill is deposited, with enough authoritative Gold, a free builder and the existing prerequisites satisfied. Charge Gold once when the player confirms; consume the credited deposit once without deducting the same materials again. First construction remains Gold-only.
- Do not create new queued work or fund future levels while a building has paid work outstanding. Keep the existing one/two/three builder slots, so separate buildings may start concurrently when slots are free. A fully deposited project waits for the player's explicit start; becoming affordable or freeing a builder never starts it automatically.
- Honor previously purchased contracts with their saved targets, prices, timers, completion order and pause/resume rights. Do not delete, refund, reprice or recharge those legacy commitments. Retain once-only action receipts across resets.
- Level 100 caps, material budgets, production, benefits, Hall gates and construction durations are unchanged. The [economy guide](estate-economy/README.md) and regenerated [shared-account review](estate-economy/REWARD_REVIEW.md) describe manual starts and visit-dependent pacing. Deploy matching backend and client together after authorization; the new panel waits for the server's deposit-then-start policy signal.

### Direct building start — confirmed October 8, 2026

**Status: `LIVE — WEB`**, verified at build `f49871ade7b09702541782b011efff820a5cc342` from PR #498; see FM-2 for publication evidence and channel/manual-review limits. The owner requested removal of the payment confirmation when leveling an estate building. This supersedes the extra confirmation screen and permanent-credit checkbox for starting first construction or a later upgrade. The external requirements panel already shows the target, required/deposited/remaining materials, Gold, duration and benefits. Selecting its enabled **Build Level 1** or **Upgrade to Level N** starts that one quoted level directly and accepts its permanent contract terms; retain the visible notice that started work cannot be cancelled.

- Submit the exact server quote displayed in the requirements panel. Keep authoritative affordability, full material credit, prerequisites, free-builder and single-level checks. An expired or changed quote is rejected without starting work; refreshing shows current requirements and still requires a deliberate start click.
- Disable repeated starts while the request is pending. Recover an interrupted response by retrying the same request ID and quote, retaining the original permanent-credit acceptance and once-only Gold/material-credit consumption. Do not auto-start work on refresh, resource gathering or builder completion.
- Material deposits retain their separate review and permanent-credit acceptance. Other estate services, commissions, recruitment, quests and equipment upgrade confirmations keep their existing flows. Costs, timers, benefits, persistence and the no-queue rule are unchanged.

### Build/Upgrade pays materials at start — confirmed October 9, 2026

**Status: `LIVE — WEB`**, verified October 9 at build `f7c063eb33c43c583debd334bbc036832955a5cc` from PR #502; see FM-2 for coordinated backend/web deployment evidence and channel/manual-review limits. The owner removed material deposits and confirmed an external Build/Upgrade requirements panel with required resources, construction time, next-level benefits, a **Build** or **Upgrade** button and **Cancel**. This supersedes the deposit controls and full-deposit start requirement in the October 8 releases above. The approved map presentation, costs, timers, Level 100 cap and rewards remain unchanged.

- Selecting the map or directory Build/Upgrade action opens the next single level's requirements. Show each material's exact required quantity and available stock, exact Gold, duration and current/next benefit. Cancel dismisses the panel and returns to the estate without spending or starting work. No payment confirmation screen or checkbox is added.
- Enable the start button only with sufficient loose materials after any older credit, enough authoritative seasonal Gold, completed Hall/prerequisite gates and a free builder. Selecting it atomically pays Gold and the remaining materials, consumes older credit once and starts the quoted timer. New materials stay in shared persistent stocks until that explicit start. No deposits, new queues, batches or future-level funding are available. First construction remains Gold-only.
- Preserve all previously accepted building credit, including its target, price version and original material bill. Show **Already paid** and **Due now** only for such older projects; never recharge credited materials or erase partial progress. New deposit requests and unaccepted older deposit quotes are rejected. Matching retries of already accepted deposit receipts still return their original receipt, including after a realm reset.
- Keep exact-quote revalidation, once-only receipts, pending-request locking and same-request retry after a lost response. Insufficient resources, busy builders, expired/changed quotes and conflicting starts cannot partially charge Gold/materials or erase older credit. Refreshing requirements, gathering resources, returning from a season reset or freeing a builder never starts construction automatically.
- Started construction cannot be cancelled or refunded. Previously purchased running/waiting/paused contracts retain their accepted prices, durations, completion order and pause/resume rights. Building services, Gear, champion quests, supply purchases and their confirmations are unchanged. Loose estate stocks and progress continue across seasons; world Gold retains its seasonal wallet.
- The matching backend and web client are verified deployed after authorization and validation. The new client waits for the server's `pay-on-start` construction-policy signal; older clients wait for their former policy. itch.io remains on its older build and requires publication of a matching client. See FM-2, the [economy guide](estate-economy/README.md) and [shared-account review](estate-economy/REWARD_REVIEW.md).

### Player-started material production — confirmed October 9, 2026

**Building service presentation — interface polish requested October 10:** the shared service/construction window uses an illustrated building identity column, dark oak header, parchment ledgers and restrained burgundy primary actions. The main work area preserves the Focused production task and its collapsed advanced details. Construction shows current/next benefit, distinct time/Gold totals and explicit missing-material counts; its Build/Upgrade and Cancel controls stay visible in the footer. Other service types use the same framing; order-review Confirm/Back also remain visible. Preserve all approved payment, quote, retry, prerequisite, production, champion, Gear and persistence rules, refresh drafts and estate-return behavior. Existing map art and controls are unchanged. **Status: `LIVE — ALL PUBLISHED CHANNELS`** at verified build `df655aaa4f3adc35d77859abaf1bda570586894b` from PR #520; FM-2 records publication and manual-review limits.

**Map artwork frame correction — confirmed October 10:** restore the original unframed transparent building sprites on the estate map. The service window's framed illustration must use its own styling class so borders, parchment backgrounds, margins and minimum heights cannot leak onto map buildings. Preserve the registry's original sprite dimensions, placements, fixed captions, selection targets and service/construction window presentation. **Correction status: `LIVE — ALL PUBLISHED CHANNELS`** at verified build `ccb14772152e5083d00e4f16196f687f7adcadef` from [PR #522](https://github.com/explocion200/CrownLands/pull/522); see FM-2 for publication evidence and manual-review limits. The preceding release record remains historical evidence.

**Status: `LIVE — WEB`**, verified October 9 at build `101d435ef095abcb392631dca1d28f908839337f` from [PR #506](https://github.com/explocion200/CrownLands/pull/506); see FM-2 for matching backend/web deployment evidence and channel/manual-review limits. The owner requires choosing what to make and how much at resource-processing buildings, rather than automatically consuming materials. This supersedes continuous automatic processing and On/Pause controls for the Sawmill, Smithy, Workshop and Windmill. Raw Timber, Stone, Iron Ore and Grain gathering remains automatic. Existing Gear commissions already require explicit orders and keep their one-item rules.

- Each processor lists its existing output and per-unit recipe: Sawmill **2 Timber → 1 Plank**, Smithy **3 Iron Ore + 1 Timber → 1 Iron**, Workshop **1 Plank + 1 Iron → 1 Tool**, Windmill **2 Grain → 1 Food**. Show a quantity slider from **1 to Max**, an exact amount field and Max button, ingredient totals, output quantity, production time and **Start production**. Max is the whole-unit amount supported by current ingredients above shared protected reserves and unreserved output storage. At Max zero, disable quantity/start controls and explain missing ingredients or storage, with relevant building links.
- **Focused UI — owner confirmed October 9:** Enter opens the production task before building descriptions or level benefits. Show Ready / Working / Needs attention, a short recipe and purpose, the 1-to-Max slider with exact amount, minus/plus and Max controls, a **Material / Needed / You have** table, and storage after completion. Keep production time and the normal **Start production · [quantity and output]** button visible in the dialog footer on short landscape screens. Put level benefits, speed and protected-material settings in collapsed **Production details**; preserve drafts, expanded sections and focus on refresh. Raw sources say **Gathering automatically**, show stock/capacity and never offer a manual Start. Blocked recipes link to their source or storage building, select that site and provide a source trail with Back that spends nothing. Confirmed batch delivery shows an in-visit notice; running work shows quantity, progress and time remaining without offering another start. The shared Production Ledger mockup is not included in this approved layout.
- Starting explicitly obtains and validates a server quote, pays that batch’s ingredients once and reserves its complete output space. There is no Gold fee, repeat, automatic downstream conversion or production queue. One batch may run per processor, with separate processors working concurrently when their ingredients are available. A refresh, finished timer or newly gathered resource must never start another batch. Use normal parchment buttons with at least 44-pixel targets, keyboard/touch slider controls and refresh-safe amount/focus restoration.
- Keep the approved recipes and Level 1 capacities of 20 Planks, 16 Iron, 4 Tools and 24 Food per hour, multiplied by `1 + 0.16 × (completed level − 1)`. Accepted duration is `ceil(quantity / hourly capacity × 3,600,000)` milliseconds. A building upgrade improves new batches only; accepted quantities, payments and timers remain fixed. Display running quantity, progress and time left. Ingredients belong to that started batch; no cancellation/refund or automatic second batch is offered. Completed output enters storage once. Reserved space is unavailable to Crown deliveries and quest claims; unexpected lack of storage retains paid output safely until room exists.
- Production orders and reserved outputs belong to the permanent account estate and continue offline and across seasons. Preserve existing stock fractions, preferences, credits and receipts. At a legacy account’s first normal settlement, honor its previously accrued automatic interval once, then mark manual production active without starting a batch. New estates begin directly in manual mode. Retire new automatic processor actions; already accepted receipts continue replaying safely. The client requires the server’s `manual-batches` production-policy signal before exposing Start.
- Construction prices, reference seasonal material budgets, Gold, timers, builders, champions, Gear and map artwork remain unchanged. Reference throughput is a capacity estimate; manual batches and idle time affect actual calendar pacing. The [shared-account review](estate-economy/REWARD_REVIEW.md) explicitly models production starts at visits using current ingredients, with no future-income spending. The matching backend and Focused web client passed the runtime/emulator and desktop/landscape release gates and are verified deployed in FM-2. itch.io retains its preceding build; signed-in production and physical-device play remain manual.

### Building prerequisite navigation — confirmed October 9, 2026

**Status: `LIVE — WEB`**, verified October 9 at build `11847639516e7dcef1af5d07e1add779699b95c9` from [PR #504](https://github.com/explocion200/CrownLands/pull/504); see FM-2 for matching backend/web publication evidence and channel/manual-review limits. When first construction or the next upgrade requires another building, show each unmet building requirement with its required and completed levels and a **Build [building]** or **Upgrade [building]** button in the external requirements panel. Use the same authoritative completed-level rules that approve construction: other buildings need the Great Hall at the target level, and the existing first-build dependencies remain unchanged.

- A prerequisite button selects and centers that building on the estate and opens its external Build/Upgrade panel. Players may follow further prerequisites, such as Workshop → Sawmill → Forester’s Lodge, including multiple unmet branches. Show the visited chain and a Back button to the preceding building. Navigation never pays for or starts construction.
- Only completed levels satisfy a requirement. Following an in-progress prerequisite shows its existing project; it cannot queue or buy another level. After the server confirms the required level, refreshing the original building removes that blocker and exposes its normal resource/time/benefit quote.
- Keep normal parchment buttons with at least 44-pixel touch targets, keyboard focus inside the current panel and Cancel/Close back to the selected estate building. Reset the chain when opening an unrelated building. Preserve costs, Gold/material payment, paid credit, timers, builders, Gear, saved progression and the no-queue rule. The matching metadata-producing backend and web client are verified deployed after authorization. itch.io remains on its preceding client; isolated staged checks do not prove authenticated production or physical-device play.

### Curved building construction timers — confirmed October 8, 2026

**Compact overview refinement — confirmed October 19, 2026:** construction arcs/countdowns become smaller as the estate zooms out, retaining the existing close-up size. Use a half-width arc within a compact 52 × 28 CSS-pixel footprint at fitted 100% zoom, smoothly reaching 88 × 40 at the existing 250% inspection threshold and staying capped there through maximum zoom. Keep countdown text readable at 8–10px rather than scaling it down with the artwork indefinitely. Preserve the six-pixel gap above each building, centered attachment, obstruction/directory fallback, independent concurrent progress, server deadlines and completion confirmation. This supersedes the October 16 constant-size timer requirement only; district labels, camera behavior, building positions and gameplay rules remain unchanged. Deployment must be verified separately.

**Fixed zoom presentation — confirmed October 16, 2026:** District titles keep their original map anchors at all overview zooms, with transparent touch-target padding around their compact parchment text strips. Disable collision-based relocation for every district; crowded, clipped or panel-obscured captions hide at their own anchor and remain accessible through Buildings. This supersedes the older adaptive placement/all-seven-visible requirement on cramped views; district camera destinations, inspection thresholds and building name/level anchors remain unchanged. Construction arcs/countdowns use one **88 × 40 screen-pixel** size at every zoom, centered **six screen pixels above their own artwork**. Remove sideways/edge relocation and leader lines. A timer whose anchored position cannot fit or is obstructed hides without detaching; its live directory status and accessible description remain. Correct positioning during dialog opening, pan, zoom and resize. This supersedes the earlier 88/112px size split and overview collision shifting only. Preserve server-clock progress, completion confirmation, timing, costs, jobs, selection and cleanup. Implementation and merge do not establish deployment.

**Status: `LIVE — WEB`**, verified in build `5163ac1b2d4d6b75c9f680ebdab69f90669f59e2` from PR #489; see FM-2 for publication, staged/public checks and manual-review limits. Display a curved progress bar centered six screen pixels above each building's construction artwork, with its remaining time tucked below the arc. Fill left to right from the accepted construction duration and server-synchronized completion deadline. Use compact days/hours or hours/minutes for long projects and minutes/seconds for the final hour. Update once per second through the estate's existing resource-display loop, including when production is stopped; do not add per-building animation loops or server polling.

- Keep the timer's readable screen size through pan, zoom and resize: 88px wide in the overview, 112px at district zoom, 40px tall. Keep name/level captions fixed below the building and retain the approved Upgrade-left/Enter-right actions. **Overview refinement, confirmed October 9, 2026 — LIVE — ALL PUBLISHED CHANNELS at verified build `17494c17bc60f1ee7b92b91b946c9d3f167469f3` from PR #514 (FM-2):** running construction countdowns remain visible when zoomed out. They take priority over scenery and district captions; temporarily hide a district caption they cover without moving its fixed anchor. Keep timers near the top of their own construction artwork, constrain them within the viewport and separate concurrent counters horizontally when needed, with a thin umber line connecting a shifted timer to its site. At inspection zoom retain the existing fixed six-pixel art anchor and obstruction rules. Offscreen sites and timers covered by panels remain hidden; their countdown remains available in the Buildings directory and accessible target description. This supersedes overview crowd-hiding only; individual building name/level captions still require inspection zoom.
- Show running construction only. Partial deposits and unstarted legacy work do not fill an arc; legacy waiting/paused contracts retain a directory status. Separate concurrent jobs use their own saved duration/deadline. At zero show a full arc and **Finishing…**, retaining the current completed level and construction art until the authoritative snapshot confirms completion.
- Stop display ticking while the estate is closed, replaced by Gear or the document is hidden. Resume from the synchronized clock; remove timer elements and descriptions on scene disposal. This changes presentation only: no costs, build durations, builder slots, queue rules, resource balances, persistence or rewards change. The web deployment is verified; signed-in production play and physical-device review remain manual.

### Confirmed estate management polish — October 8, 2026

**Status: `LIVE — WEB`**, verified at build `27965d48b00b1067c3e622e222753f5338c8c0a6` from [PR #495](https://github.com/explocion200/CrownLands/pull/495), with matching targeted backend and Netlify deploy `6ac836f5ea6c2e00084a2a17`. See FM-2 for exact-source, staged/public evidence and manual-review limits. The owner approved all seven management suggestions after reviewing the deployed twenty-building estate. Preserve the approved costs, timers, deposits, explicit starts, level/rarity gates, season persistence, painted map, fixed captions and external Upgrade-left / Enter-right controls.

- Add an Estate overview showing free builders, active construction, claimable officer commissions and quest parcels. Links open the relevant project/service; they never start or claim automatically.
- Label the left construction action **Build** when the authoritative completed level is zero, including a first build already running; use **Upgrade** after Level 1 completes. Apply this wording to the map, selected-site details, directory, accessible descriptions and requirements heading, with **Build Level 1** for the first-start button. This owner-confirmed refinement supersedes the earlier all-Upgrade label rule. Preserve the action's position, icon, size and spending flow; update existing controls in place to retain focus.
- Filter the Buildings directory by All, Ready to upgrade, Under construction, Needs materials and Not built, retaining district grouping and all twenty sites. Ready means the server’s next-level rules, full permanent material credit, Gold and builder availability are satisfied at the latest summary; the explicit spending quote revalidates everything. Needs materials includes an unfunded material bill even when stock is available to deposit. Keep Gold/prerequisite/legacy-work/max-level explanations in All. An optional `includeUpgradeOverview` estate-state request uses the existing quote rules and prepared authoritative economy without creating quotes or contracts. Ordinary clock refreshes retain their previous lightweight path; richer summaries are requested for open management views.
- Explain production blockers with navigation to their source, storage or reserve controls. Do not invent a single bottleneck when the shared processing chain may be constrained in several places. Preserve processor preferences and shared input reserves.
- Show the next existing service unlock and level progress, including officer rarity, Alehouse meals/recruits, Guild party/expedition/quest gates, builders and Crown pack access. Buildings with continuous rewards explain that each level improves them; their current/next benefit remains in external Upgrade requirements.
- Briefly acknowledge a server-confirmed level increase and its new benefit, with dismissal and recent completions for the current visit. Do not announce the initial snapshot as new construction or grant completion from a local countdown. Feedback occupies the header’s title space without refitting or covering the painted map.
- Present active/bench champions and recruits as readable cards with quality, level, power and availability. Owned champions show XP progress, retained XP above the Guild training ceiling and maximum-level status. Keep selection and Bench controls separate; busy champions cannot transfer. Expeditions/reward parcels remain separate cards with explicit claims.
- Add a dismissible, reopenable seven-step starter checklist for raw materials, storage, processing, Food, the guild, parties and deposit-then-start construction. Derive setup state from the current estate. Save guide dismissal as an optional account-scoped preference on the device; it creates no gameplay progress or currency award. All links respect the same prerequisites and confirmation flows.

The overview, directory and service screens must remain usable with mouse, touch and keyboard at desktop and 844×390 / 568×320 landscape sizes. Keep drafts/focus across refresh, Gear camera/selection returns, hidden-document scheduling and scene cleanup. Signed-in production, physical-device and long-term pacing review are separate from automated validation.

### Confirmed Inner Castle estate presentation — October 6, 2026

**Action layout refinement, confirmed October 8, 2026 — `LIVE — WEB` at verified build `786781dd1dab50bce4f14e034835d8e3015e5a7f` from PR #487:** selecting an online estate building stays on the estate. Show **Upgrade on the left** using the city map's gold arrow-up hex button, and **Enter on the right** using the matching movement hex button. Enter opens that building's services, or the existing Gear screen for Treasury, Barracks, Gatehouse and Royal Stables. This supersedes direct equipment entry on building selection for the online estate. Use 64px controls; expose the pair beside the selected building at district zoom when both fit without covering art, labels or controls. Retain the same left/right actions in selected-site details and all twenty directory rows as the crowded-screen fallback. Enter is unavailable before Level 1 completes, but remains available during later upgrades. Preserve camera/selection on menu return, fixed bottom captions and the existing deposit-then-start rules. See FM-2 for publication, staged/public verification and manual-review limits.

**Compact action refinement, confirmed October 8, 2026 — `LIVE — WEB` at verified build `db317e04fe9962e29a3c5fe3c3544e8bb388a77e` from PR #491:** reduce the estate's Upgrade and Enter hex controls from 64px to 48px square, shown only beside the selected building on the map. Retain their gold/blue-gray styling, readable action labels, left/right order, keyboard focus and minimum 44px touch targets. Selected-site details and all twenty directory rows use normal parchment text buttons labeled Upgrade and Enter, with the same left/right order, focus and minimum touch size. Building interiors also retain their normal UI buttons. This supersedes both the estate map size and the panel hex styling in the preceding refinement. Map placement uses the compact size to keep both actions clear of artwork and fixed bottom captions. Shared realm city/objective controls retain their existing size. No construction timer, economy, artwork or building-position changes.

The approved estate supersedes the compact six-building Royal Bailey overview and its old hanging-sign anchors. It opens as a full-screen 4:3 illustrated estate with the entire map fitted, a small inhabited walled city in the middle third, northern rocky hills, western woodland and southern farmland. This estate has no river. All buildings face south. Thin umber outlines, painted shading, olive grass, ochre timber, pale stone and burgundy pennants follow the user-provided illustrated atlas reference.

Twenty permanent sites retain their positions and finished footprints through all visual states. The existing Treasury, Great Hall, Barracks, Alehouse, Gatehouse and Royal Stables begin completed. Guild Master and thirteen outer buildings begin as surveyed plots. Gatehouse, Royal Stables and Wagon Yard are distinct structures. Cottages, gardens and service yards provide decorative town life.

**Terrain deselection, confirmed October 10, 2026 — LIVE — ALL PUBLISHED CHANNELS at build `43e051ddabe58ccabc8ff8917b086d8064ee9e12` from PR #518 (FM-2):** clicking or tapping empty estate terrain clears the selected building, its selection marker, selected-site details and map Build/Upgrade/Enter controls without moving the camera. Preserve the cleared selection when the estate is remounted. Dragging, pinching, wheel zoom, keyboard exploration, directory and camera controls, building actions and clicks inside panels do not deselect a building. Selecting another site replaces the selection normally. Construction countdowns remain visible independently of selection.

**Overview building selection, confirmed October 10, 2026 — `LIVE — ALL PUBLISHED CHANNELS`:** within the Inner Castle only, clicking or tapping a painted building or surveyed/construction plot below 2.5× fitted zoom selects that site, raises the camera to 2.5× and centers its artwork within the existing map bounds. Show its selected-site details and normal Build/Upgrade/Enter choices; do not enter a service or Gear screen automatically. Use the actual building/plot rectangle, including Gatehouse artwork offsets, rather than adding overlapping overview buttons. Preserve the original physical tap position when a touch browser snaps the click toward a nearby control. Visible district captions still zoom into their district; artwork takes priority over transparent district-button padding. Building name/level captions remain hidden until inspection zoom, and the existing nonoverlapping 44px inspection targets and directory remain available. Dragging, pinching, cancellation and empty-terrain deselection retain their existing behavior. The outside realm map, camera and controls are unchanged. This adds direct artwork selection to the earlier inspection-threshold rule. Verified build `03c952837b28a819e2b8eadd5c22d803ec0a41a3` from PR #524 is published on both channels; FM-2 records evidence and manual-review limits.

| Building | Center: left / top percent | District |
|---|---|---|
| Treasury | 39 / 33 | city |
| Great Hall | 50 / 31 | city |
| Barracks | 61 / 34 | city |
| Alehouse | 40 / 46 | city |
| Gatehouse | 50 / 60 | city |
| Royal Stables | 60 / 48 | city |
| Guild Master | 40 / 54 | city |
| Quarry | 29 / 18 | quarry |
| Mine | 73 / 19 | mine |
| Forester’s Lodge | 17 / 33 | woodland |
| Sawmill | 23 / 45 | woodland |
| Smithy | 27 / 61 | crafts |
| Workshop | 37 / 70 | crafts |
| Builders’ Yard | 43 / 83 | farmland |
| Windmill | 12 / 64 | farmland |
| Farmstead | 18 / 79 | farmland |
| Granary | 29 / 87 | farmland |
| Storehouse | 69 / 63 | trade |
| Wagon Yard | 87 / 69 | trade |
| Market | 83 / 44 | trade |

- Connected roads exist before construction. The royal road enters from the south, passes through the Gatehouse and reaches the square and Great Hall; the outer circuit connects extraction, woodland, crafts and trade; a farm lane serves southern agriculture and construction. Every functional site has a south-facing approach.
- Mouse/touch dragging pans; wheel/pinch, keyboard and explicit controls zoom from the fitted overview to 4×. Camera bounds stay within the estate. District targets zoom into a quarter when individual building targets would overlap. A collapsible directory reaches all twenty sites. Building selection refinement, confirmed October 9: clickable targets cover the full rendered building rectangle, including the Gatehouse wall offset, or the reserved surveyed/construction plot rectangle, with a minimum 44px touch target. Keep the existing 2.5× inspection threshold, separate targets and directory fallback for crowded/offscreen sites. Tapping any part of that building or plot selects it; dragging from either buildings or terrain pans without opening a building. Capture gestures from pointer-down so fast moves beyond the viewport, release and cancellation do not leave input stuck. Small click jitter keeps tap behavior. Selected, hovered and focused buildings expose their names at the existing fixed bottom position. This refinement is **LIVE — ALL PUBLISHED CHANNELS** at build `4680341...`; FM-2 records exact publication and input-check evidence.
- Cohesive artwork revision, confirmed October 6: use the same 1448 × 1086 canvas as a normal regional map. Terrain, worn dirt roads, weathered walls, decorative cottages and gardens are painted together in one opaque illustration. Roads have natural bends, ruts and grassy shoulders; geometric road and masonry overlays are removed. The fixed road graph remains the development layout guide. Finished buildings use matching transparent artwork at a common physical scale, preserving natural proportions instead of fitting every building into an equal-sized icon. The Great Hall remains tallest; the Gatehouse has short wall connectors, and the Royal Stables and Wagon Yard retain distinct silhouettes.
- Ground and Gatehouse refinement, confirmed October 6: keep all twenty approved centers. Paint modest worn earth, courtyard paving and service-yard ground into the terrain at the actual building bases and entrances; remove the repeated independent oval soil layer. Center freestanding completed artwork within its reservation. Paint the Gatehouse into the actual wall junction first, then extract its original masonry pixels with a transparent arch for the road. Its square slate-roofed towers match the enclosure. The Gatehouse reserves 10.5% × 10.5% around its unchanged 50 / 60 center. Its contextual cutout is approximately 140.26 × 57.80 logical pixels, offset 5.70px east and 27.18px south, recovering the painted wall location without stretching. Preserve native building detail at at least 3.2× logical density. Four matching overlapping close-up terrain tiles load only when visible camera density requires them, without changing the 1448 × 1086 logical canvas. Avoid caching the transformed world as a fitted-resolution bitmap. Validate estate dimensions against the active topology catalog and an actual regional map asset. This replaces the earlier separate-ground and round-tower Gatehouse treatment.
- Unbuilt sites show painted earth, stakes, rope and a small blank timber sign; construction shows matching foundations, scaffolding and supplies; completed sites show finished buildings and service yards. These building-state layers stay independent and within the same twenty reserved footprints. Names appear through the accessible map targets, directory and selection panel.
- Character animation and other ambient movement are deferred for this visual pass at the user's direction. The estate is still in Full, Reduced and Off modes, allocates no ambient actors and schedules no animation loop. Camera input remains interactive. Closing or covering the estate disposes its input/resize listeners; returning from equipment recreates the scene with its previous camera and selection.
- Main City and Profile access, off-map Main City resolution, keyboard focus, existing four gear screens and new-gear markers remain authoritative. Returning from gear restores the selected building and camera. The estate's own Back destination is superseded by the October 7 **Back to Realm** refinement below.
- Main-map entry refinement, confirmed October 10: add an illustrated **Inner Castle** button immediately to the right of Dailies in the existing HUD row. Use the same navigation-button treatment and at least 44px mouse/touch/keyboard targets. Its miniature pale-stone castle follows the uploaded ink-and-wash map reference, with ochre timber, olive/slate roofs and burgundy pennants. It resolves the player's own Main City through the existing Profile entry, including when that city is in another region. Preserve unsaved Profile flag and skill-preset exit guards. **Back to Realm** retains the underlying region and map camera; equipment return behavior is unchanged. Status: **LIVE — ALL PUBLISHED CHANNELS** at verified build `2de0506f18b43a9bea5e0b41ce1fdcd90eb81974` from PR #516 (FM-2).
- Building activation refinement, confirmed October 7: clicking a completed Treasury, Barracks, Gatehouse or Royal Stables map target or directory entry opens its existing equipment UI directly. Back restores the selected building, camera and keyboard focus without reopening a description panel. Other sites retain their description/planned-function panels; surveyed and construction fixtures cannot open equipment. Remove dotted plot-selection boundaries from the map while preserving building names and accessible keyboard focus indicators.
- Equipment dismissal refinement, confirmed October 7: the close X, Escape/system cancel and backdrop dismissal in all four equipment windows return to the Inner Castle with the same camera, selected building and keyboard focus, just like Back. Escape during an upgrade confirmation cancels that confirmation and stays in equipment. Closing the estate itself exits normally; forced session cleanup and Main City ownership/access guards remain unchanged.
- Background coverage refinement, confirmed October 7: preserve the approved city, buildings, walls, roads, controls and entire fitted estate. The background and playable coordinates remain 1448 × 1086, matching normal game maps. Replace flat olive side gutters on wide landscape screens with matching decorative woodland, hills, fields and meadow scenery. These extensions contain no additional sites or gameplay area and do not enlarge the camera bounds. They load only when the fitted map leaves side space and disappear from close-up views that fill it. Blend only the outer terrain edges; retain the approved center artwork and native zoom detail.
- Western district-label refinement, confirmed October 8: fix **Quarry Hills** to the quarry reservation's southern edge at **29 / 22** and **Woodland** to the western forestry area at **19 / 49**, beneath the Sawmill reservation. These are label anchors in map percentages; their text begins six screen pixels below the anchor. They follow the map during pan, zoom and resize, never searching surrounding scenery for a different position. This supersedes adaptive collision placement for these two labels. Preserve the existing district camera destinations and 2.5× building-label threshold. Viewport edges or open panels may hide an obstructed label rather than move it; the directory remains accessible. Other district targets avoid these fixed positions, and all seven remain separate and selectable in the fitted desktop and small landscape overview. No artwork, site positions or gameplay changes. Status: **LIVE — WEB** at verified build `75a5829d3077432ad44cc486bc37a80d273e6de5` from PR #483; see the current release verification above.
- This is presentation only: new building roles are marked planned. It adds no costs, resource generation, timers, construction queue, saved building progression or champion quest rules. Review fixtures for initial, completed and construction scenes are development-only and excluded from production.

Status: `LIVE — WEB` in verified build `36b889f9fb8e0320a6e3de7418359ddcf4a72ca8`, including the approved estate from PR #472, background coverage from PR #473 and equipment dismissal from PR #474. Public artifacts and controlled production-runtime checks passed; authenticated and physical-device review remain manual. itch.io was not republished for this estate update. Development review: [Estate visual draft](./visual-qa/inner-city-estate/README.md).

### Guild Master expansion — confirmed decisions, October 10, 2026

**Status: LIVE — ALL PUBLISHED CHANNELS at verified PR #526 build `4a367c1a656f96d6c27a19a2738cbf58c983cb94`; see FM-2 for channel, backend and validation evidence.** The owner approved Groups 1 and 2 as displayed on October 10, after the earlier Group 3 approval, and requested completion of the entire expansion before merge and deployment. The exact values, tables, preparation costs and compatibility policies in the [approved balance review](estate-economy/guild-master-balance-review.html) are authoritative for this expansion. Visual previews still use isolated sample data; their presence does not establish deployment.

- **Confirmed champion balance:** Common/Uncommon/Rare/Epic/Legendary ceilings are 20/40/60/80/100. Each initial stat is an independent uniform integer roll within ±2 of its type's listed center; the approved per-level growth and signature milestones apply. Advancing from level L costs 4 × L XP; mission XP is 20 × nominal hours × the approved difficulty multiplier. Preserve every legacy level and banked XP balance, and protect any higher level already promised by an accepted old mission. At the protected ceiling, new XP stops. Save offers and identities server-side before purchase; retries never reroll them.
- **Confirmed missions:** one five-minute, one-member, one-Food introduction grants 10 XP and one discovery, with two minutes' recovery. Further contract durations are 1/2/4/8 nominal hours according to the approved difficulty table; Gear recovery has eight nominal hours. Contributions use 60% primary + 30% supporting stats per member, plus the fixed-required-party Leadership contribution. Use the approved risk tables and route/approach/supply/secondary-objective modifiers; clamp displayed risk to 5–75%, to one decimal, and sample exactly the displayed full/partial/failure probabilities. One secondary objective and one relevant optional supply choice per mission; preparation terms lock on acceptance.
- **Confirmed rewards:** separate account-wide daily reservations of 1 unboosted Main City Gold-production hour, 0.5 troop-production hours, and the existing shared 2.4 material-production hours (including accepted legacy quests). Reserve full potential rewards and every multiplier at launch. Gear recovery allows one attempt per rolling 72 hours, a 40% find chance after full success, and only existing Common/Uncommon officer items under the approved 90/10 eligibility rule. This is an explicit acquisition exception to earlier Gear restrictions. Full success pays full primary rewards/XP; partial pays half fungible rewards and 75% XP; failure pays no primary reward and 50% XP. Discoveries, objectives and Gear require full success. No champion is killed or removed.
- **Confirmed recovery transition:** capture the earned Alehouse recovery reduction as a permanent minimum; use the greater of that minimum and Infirmary improvement, then add approved meal/Medic reductions up to 55%, with a ten-minute minimum except the introduction. Base rest is 15 minutes per nominal hour with approved difficulty and outcome multipliers. Recovery starts at the accepted finish time even while offline or before claiming; room/level/meal changes cannot rewrite an accepted mission.
- **Confirmed seasonal boundary:** Gold/troop missions must finish before the current realm's reset. These rewards can be claimed only into their original, still-current realm and Main City; unclaimed seasonal portions expire at reset. Champion progression, reports, materials, Gear, discoveries, reputation, paid room improvements, saved parties, daily reservations and Gear cooldown persist. Legacy quests settle their original training, recovery and material rewards. Server-only outcomes and transactional receipts prevent retries, concurrent devices, report replay or reset from duplicating rewards.
- **Visuals approved:** the owner approved the Guild visual set at `guild-hall-r3`: the grand Guild Hall, eight mission-specific contract illustrations, five room illustrations and their matching improvement views, and the member portraits shown in the preview. Preserve this art direction during gameplay implementation. The later balance approvals are recorded above; visual approval alone does not establish deployment.
- **Common champion art direction, subsequent refinement:** provide a varied Common set of ordinary medieval peasants with simple peasant weapons and subtle practical cues to their specialty, matching the supplied atlas reference. The October 10 refinement specifies medieval Europeans, mostly men, with lean or wiry builds, serious stern expressions and signs of poverty: these people undertake dangerous paid adventures to survive. Use worn linen/wool, improvised wooden weapons, farm or work tools, and restrained trade accessories rather than armored or noble presentation. The local revision contains 18 men and 3 women, three individual portraits for each of seven specialties, with a stable portrait retained from offer through recruitment. This artwork refinement does not change stats, rarity, recruitment prices or approved balance; other rarity artwork is outside this request.
- **Mission-first planning:** players select a contract before planning its party, leader, route and supplies. Do not silently preselect a mission. Planning is contextual to the selected contract, with a clear return to the contract board and a way to resume the plan after adjusting members. Reading an archived report must not replace the selected contract or preparation. This flow applies to production; the local preview alone does not establish implementation.
- **Additive party contributions:** every champion adds a positive contribution against a fixed mission difficulty, with stronger relevant stats and matching specialties helping more. Never average stats by the selected party size. With the same leader, mission and preparation, adding a member cannot lower success and removing a non-leader cannot raise it. Caps may leave the displayed odds unchanged. Changing the leader can change the Leadership bonus. This direction is confirmed; the exact weights, difficulty targets and other Groups 1–2 numbers were subsequently approved above. Accepted production missions retain their original terms.
- **Individual starting stats:** recruits must have random starting values, with higher ranges in the stats favored by their type. Do not assign every member of a type identical stats. Generate and store each offer's individual values authoritatively before purchase; hired members keep those exact rolls permanently. Refreshes and retries must not reroll an offer. The owner subsequently approved the preview's ±2 integer ranges. Preserve existing member IDs, names, ownership, earned levels/XP, recovery and accepted mission terms.
- **Five interior facilities:** Contract board, Planning table, Infirmary, Training area and Archive have five internal improvement levels, separate from the Guild Master's 100 estate levels. Basic mission browsing, forecasts, recovery and report/history access are available without paid room upgrades. Room levels 1/2/3/4/5 require Guild levels 1/10/25/50/75, cost 0.25/0.5/1/2/4 unboosted Main City Gold-production hours (whole-unit prices rounded up), and take 10 minutes/1 hour/4 hours/12 hours/24 hours.
- **Room material costs:** level 1 has no material cost. Levels 2/3/4/5 use 0.5/1/2/4 reference material-production hours, valued at their required Guild level. Split each total equally between Timber/Stone at level 2, Planks/Stone at 3, Planks/Iron at 4 and Iron/Tools at 5. Round each material portion up and require the relevant production chains. One separate Guild improvement slot runs at a time, with full payment at start, no queue and no deposits. Accepted costs, timers and mission benefits remain fixed.
- **Benefits:** each Contract board level adds one named client contract subject to client reputation; required base reward families remain accessible without these upgrades. Planning table levels add one saved-party slot each to three basic slots. Each Infirmary level reduces rest by 7%, up to 35%, retaining the greater of this improvement and a protected existing Alehouse benefit; the complete approved recovery migration is recorded above. Training enables mentoring at room level 1 and adds 5% mentored XP per level, up to 25%. Each Archive level unlocks a discovery chapter at the corresponding Guild reputation milestone. All members can recover concurrently.
- **Mentoring:** one assignment at a time. A ready mentor must be Level 10 or higher and at least five levels above the pupil. The mentor stays in the Guild and is unavailable for missions until the pupil's accepted mission ends. It adds the Training area's XP bonus to that pupil, without party stats, extra reward rolls or a second mission reward. The mentor does not need recovery. Idle assignments can change; accepted assignments retain their benefits.
- **Personal goals and stories:** type-themed ambition chains advance at 1/3/6 cumulative successful matching assignments and grant one-time 20/60/120 XP plus personal history/title entries. XP must respect the approved ceiling compatibility policy. Guild/client thresholds of 1/10/30/60/100 successes combine with matching room improvements to unlock five additional contracts and five discovery chapters. Completed-contract titles arrive at 10/25/50/100 successes. Story progression adds no passive world combat bonus or new currency. Full successes grant one Guild reputation and one point with the named client; the introduction grants neither.

The production Guild uses the existing estate renderer and entry/return flow, keeping building positions, footprints, camera behavior and outside-realm presentation unchanged. Server-authoritative recruitment, migration, contracts, outcomes, claims, five facilities, mentoring, saved parties and reports are implemented in the verified production release. Focused rules and emulator checks cover legacy progression, privacy, payment/reward retries, seasonal expiry and permanent rewards; browser checks cover desktop and landscape layouts. Restrained departure, return and level-up feedback respects audio/motion preferences, visibility and cleanup. Required pull-request gates, merge and coordinated backend/client publication are verified in FM-2; the disclosed signed-in production and physical-device limits still apply.

### Confirmed estate economy direction and labels — October 7, 2026

**Historical October 7 planning record, superseded by the approved October 8 repair and its verified `LIVE — WEB` release above.** The following owner decisions established the construction-economy direction; references below to undecided values and unavailable gameplay describe that earlier draft, not the current deployed implementation.

- All twenty estate buildings have a maximum of **Level 100**. This supersedes the unconfirmed ten-level proposal and does not cap regular world-city levels or Gear item levels.
- Constructing any building at Level 1 requires **Gold only**. Subsequent building upgrades require gathered estate materials. Exact Gold/material amounts, production rates, recipes, timers, queue rules and level curves remain open balance decisions; the earlier proposed percentages are not approved for ninety-nine upgrades.
- **Wagon Yard:** purchase building supplies with the existing permanent **Crowns** currency. **Market:** purchase food supplies with Crowns. These replace the earlier proposed delivery/merchant-exchange emphasis and explicitly revise Section 10's cosmetics-only restriction for these supply purchases. Supply pack contents, prices, purchase limits and refund/overflow handling remain undefined; no playable spending endpoint is added by the label update.
- **Treasury, Barracks, Gatehouse and Royal Stables:** building progression unlocks the next Gear set for the corresponding officer. The owner clarified on October 7 that this means the **existing Common → Uncommon → Rare → Epic → Legendary rarity tiers**, not new equipment sets. Their building levels and earned Gear-set unlocks are long-term account progression and survive season restarts. This replaces the proposed passive building-level Gold/troop/wall/march bonuses. Existing item upgrade prices, matching-copy requirements, bonuses, equipped items and earned Gear progression remain governed by Section 11. Required building milestones and handling of already-earned higher tiers must be approved before enforcing gates; do not retroactively revoke equipment.
- **Alehouse:** higher levels provide stronger champions available for recruitment into the Guild Master's roster, faster champion recovery between quests and better preparation meals. Champion tiers, recruitment fees, offers, recovery curves and meal effects remain to be designed.
- **Full Inner Castle persistence — October 7 follow-up:** everything belonging to the estate carries over. All twenty buildings retain their construction state, completed levels and earned benefits; none resets to Level 1 or a surveyed plot. Material stocks, processing progress/preferences, partial deposits, funded projects and queues, champions, recovery, expeditions, earned rewards and their receipts persist. Timers continue and elapsed production/work settles once across the boundary. This supersedes the earlier six-permanent/fourteen-seasonal split. It does not change the existing seasonal rules for world Gold, realm cities, armies or Hero progression.
- **Material pacing and deposits:** each building individually targets one season's resource investment to reach Level 25, another two to reach 50, another three to reach 75 and another four to reach 100: cumulative 1 / 3 / 6 / 10 seasons. The owner selected **50% of material production toward the chosen building**, then extended that long-term progression to all twenty buildings and requested higher materials and timers. This replaces the old seasonal/double-cost formulas. Level 1 remains Gold-only. Players can deposit required building materials in installments and retain all credited progress. Ordinary estate stocks now persist too. Exact reference production, quantities, per-level distribution, deposit commitment/refund rules and timer allocation remain proposed; these are resource-equivalent targets, not an enforced calendar lock or a promise that all twenty buildings finish together.
- Display compact parchment **building name and level** captions only in the zoomed district view, at **2.5× fitted zoom and above**, matching a click on Farmland, Crafts Quarter, Walled City or another district. The full-estate and intermediate views show district names without individual map captions; zooming out or Fit Estate hides them again. October 8 refinement: keep the name and level together in a tight single-line strip centered beneath the visible building base. Pan, zoom, selection and nearby controls must never flip the caption above or beside the building. If the bottom position is crowded or offscreen, hide the regular caption instead of relocating it; hover/focus text also stays beneath its building. This refinement is LIVE — WEB at verified build 8ebe5abe21b05f24fab7701cc62f4f617c447d74 from PR #481. Keep text in screen pixels through zoom; avoid covering building art, neighboring captions, controls and open panels. Dense or offscreen captions may defer to the directory and focused/hovered target, preserving all twenty sites and existing 44px targets. The directory and building detail also show level/status. Unbuilt sites say **Not built** and construction sites identify the construction state instead of implying completion.
- Until authoritative construction progression is introduced, the live renderer's six existing completed sites display their starting **Level 1** and fourteen surveyed plots remain unbuilt. Optional review levels through 100 are local presentation inputs only, not saved progression or gameplay grants. The development-only milestone fixture is excluded from production.
- The estate header uses **Back to Realm** instead of Back to City Details. It closes the estate, disposes the scene and returns keyboard focus to the underlying realm map, retaining the current region, map camera and zoom. The same behavior applies after entering through City Details or Profile. Equipment Back, X, Escape/system cancel and backdrop dismissal still return to the Inner Castle with its camera and selected building restored.

**Label and estate navigation implementation status: `LIVE — WEB`** at verified build `d84754fc1f92fb45f89e6518b0672f6bbca49d29` from PR #477. Approved artwork, fixed centers, camera bounds and equipment entry/return behavior remain as specified above. All twenty site interactions, district geography and target-origin drag/pinch passed browser validation. This status does not implement the planned building economy.

### Estate economy detailed draft and resource ledger — October 7, 2026

- The owner requested a complete detailed economy draft, level/building requirements, a balance review and centered resource counters at the top of the estate. The [estate economy reference](estate-economy/README.md) records eight materials, recipes, all twenty building roles/prerequisites, all 100 level formulas, storage, queues, officer rarity milestones, recruitment/quests/meals, Crown supply caps and reset handling. The October 7 draft was superseded by the explicitly approved October 8 repair and its verified web/backend/rules release above. The remaining bullets describe the earlier counter-only publication.
- The [reproducible balance review](estate-economy/BALANCE_REVIEW.md) checks all twenty permanent building bills, all 100 levels, production conservation, storage, partial-deposit/reset invariants and focused collection-plus-construction timing without player data. Supporting production references, Gold, bootstrap, whole-account project allocation, champion sinks, Gear acquisition, payment concentration and human playtesting remain limitations; no complete-economy balance claim is established.
- The centered resource ledger is **LIVE — WEB** at verified build `d84754fc...` from PR #477. It presents Gold, Crowns and the draft's Timber, Stone, Iron Ore, Grain, Planks, Iron, Tools and Food. It uses one centered row on wider screens and two on narrow screens, retains exact quantities/status on hover/focus, and keeps the approved map fitted beneath it. Real available Gold/Crowns use existing presentation snapshots; no material balance is fabricated when estate production has not been implemented. Development-only sample balances are explicitly labeled and excluded from production. Currency observation ends when the scene is disposed; no new polling loop is added.
- This draft/counter update does not enable construction, harvesting, saving resource balances, Crown spending, recruitment or equipment gates. Existing Gear behavior and seasonal persistence implementations remain unchanged. Rates, fees, prerequisites, quest rewards, paid-expiry/refund handling and tier entitlement migration require explicit acceptance before gameplay implementation.

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
- **Confirmed October 18, 2026 — reinforcement locations:** Every reinforcement row has a Location button. Traveling support opens its current position along the displayed route, including incoming and returning support. Stationed with allies opens the holding where your troops are stationed; Defending your holdings opens your reinforced holding. Switch to the recorded map when necessary, recheck the current assignment after loading, and keep the ledger available for retry if the location is unavailable. Location only navigates; it never sends, recalls or transfers troops.
- **Confirmed October 18, 2026 — shared location artwork:** Location/map-jump buttons throughout the game use the approved parchment-map and burgundy-flag artwork in square buttons. Fit the existing control slots without enlarging their rows or panels, retaining smaller slots where already present. Keep city/map context visible, accessible action names, keyboard focus, disabled/loading states and existing destination behavior. This includes troop movement, all reinforcement sections, held objectives, rally assembly, reports/activity, city/deed lists, quest targets, public profiles and the atlas’s current/home-map shortcuts.
- **Confirmed October 18, 2026 — compact reinforcement rows:** Traveling, Stationed with allies and Defending your holdings use tighter information rows. Place the square Location button immediately left of Recall or Send Home on the same horizontal action line, including narrow landscape layouts and pending states. Traveling rows keep their existing Location-only action beside arrival information. Preserve full troop counts, routes, ruler links, return/fallback details, touch targets, scroll/focus and all existing action rules.
- Contributors use Recall and holding owners use Send Home for stationed troops. **Confirmed October 19, 2026 — immediate Recall:** Clicking Recall for your own stationed reinforcements immediately submits the return command, without a browser confirmation, in both Kingdom Activity and holding details. This replaces the previous confirmation requirement for Recall. Send Home for another player's troops retains its confirmation. Preserve permissions, pending-request guards, fallback routing and server acknowledgements; failed returns retain the assignment and expose retry feedback. These stationed returns do not use Recall Horns; no cost, capacity, visibility or return rule changes.

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

### Shared attack swords — confirmed October 14, 2026

- Every confirmed combat impact uses the capture animation's same three sword strikes, contact sparks and dust, including attacks on regular cities, Strongholds, the Crown Citadel, Camps, Holding Towers, Marauders and Clan Bosses, as well as Citadel Legion defenses and Rally battles. Attacks without a capture do not show the flag drape or ownership pulse.
- Confirmed eligible city captures continue into the existing saved-flag drape. The battle receipt and ownership update share one sword sequence when they describe the same combat. Existing capture eligibility, other objective rewards, combat results and sound cues remain unchanged.
- Reduced motion uses a brief opacity-only crossed-sword confirmation for attacks; Off skips the effect. Active-map/session gating, NPC spawn identity, hydration, event deduplication, performance limits and cleanup remain in force. Scouting, friendly movement, blocked orders and historical report viewing do not trigger combat effects.
- **Status:** `LIVE — WEB` at build `ec42a35...` from PR #556; see FM-2 and [the release record](ATTACK_SWORDS_RELEASE_2026-10-14.md) for exact public-delivery evidence. itch.io was not republished; authenticated combat and installed-app/physical-device review remain manual.

### Approved castle capture animation — October 11, 2026

- A newly confirmed combat capture plays three clashing sword strikes, contact sparks and a small dust impact, followed by the capturing player's own flag unfurling from the roofline and draping down the castle front. Preserve that player's saved colors, pattern, crest and crest color; use the existing flag renderer. Outer towers remain visible and the map camera stays fixed.
- Full motion lasts four seconds, including a short still hold and clean removal; the ordinary ownership marker remains afterward. Reduced motion uses a brief opacity-only flag confirmation. Off mode shows the authoritative ownership state immediately. Existing automatic performance limits, event deduplication, active-map visibility, capture eligibility, sound preferences and cleanup remain authoritative. The animation never postpones or changes capture results.
- **Status:** `LIVE — WEB` at build `7406e0a...` from PR #530; see FM-2 for release evidence and verification limits. itch.io retains its preceding capture effect.

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

The historical replacement-power validator mismatch (three versus ten troops per city progression point) was resolved by PR #460: the approved version 13 score has no replacement-production contribution, and the affected validators assert exact troop-only power and zero infrastructure power. Reset emulator coverage also codifies clan reset and does not cover the confirmed Common Gear/clan persistence policy.

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
| King Power replacement-power validator | Historical validator/config mismatch under the superseded infrastructure formula | Resolved by PR #460 and the October 6 troop-only release; replacement and defensive power are zero, with validated two-power-per-troop accounting |
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

## October 14, 2026 — Window header icons release verification

- Recorded the authorized PR #568 merge and verified web publication at `643bf16...`, Netlify deploy `6acfff5f5a5b928eb776ce2a`, published `2026-10-14T22:18:40.853Z` (6:18 p.m. Eastern).
- Marked matching Bag/Shop/City List/Map header artwork `LIVE — WEB`, with required CI, six local validators, 12 local/12 staged/12 public header cases, exact artifact comparisons and six public startup/reload checks. Preserved colors and gameplay, publication hold, backend, itch.io distinction and authenticated/device verification limits.

## October 14, 2026 — HUD alignment release verification

- Recorded the authorized PR #566 merge and verified web publication at `1c8d8ad...`, Netlify deploy `6acff7820bae52e8c1996a16`, published `2026-10-14T21:45:05.382Z` (5:45 p.m. Eastern).
- Marked the shared HUD/Reports left edge `LIVE — WEB`, with required CI, four local validators, 18 local/18 staged/18 public desktop/mobile fullscreen cases, exact artifact comparisons and six public startup/reload checks. Preserved existing colors, sizes and actions, publication hold, backend, itch.io distinction and authenticated/device verification limits.

## October 14, 2026 — Window controls and label release verification

- Recorded the authorized PR #564 merge and verified web publication at `b7b2a25...`, Netlify deploy `6acff0411fe6ead9aaa02eea`, published `2026-10-14T21:16:36.520Z` (5:16 p.m. Eastern).
- Marked the X alignment and label-contrast fixes `LIVE — WEB`, with required CI, five local validators, 198 local/33 staged/18 public window cases, 12 profile layouts at each stage, exact artifact comparisons and six public startup/reload checks. Preserved the burgundy theme, publication hold, backend, itch.io distinction and authenticated/device verification limits.

## October 14, 2026 — Burgundy UI color release verification

- Recorded the authorized PR #562 merge and verified web publication at `7ff2ab6...`, Netlify deploy `6acfe006a891a1c7f1dd9534`, published `2026-10-14T20:05:24.478Z` (4:05 p.m. Eastern).
- Marked the restored burgundy colors `LIVE — WEB`, with required CI, seven local validators, 189 local/42 staged/18 public window cases, exact artifact comparisons and six public startup/reload checks. Preserved the existing framing/layout, publication hold, backend, itch.io distinction and authenticated/device verification limits.

## October 14, 2026 — Shared UI theme release verification

- Recorded the authorized PR #560 merge and verified web publication at `16d282a...`, Netlify deploy `6acfd84065ed98dd45e940d6`, published `2026-10-14T19:32:28.989Z` (3:32 p.m. Eastern).
- Marked the shared Guild palette, framed close controls and inset tab frames `LIVE — WEB`, with required CI, 189 local window cases, 42 staged/18 public window cases, exact artifact comparisons and six public startup/reload checks. Preserved the publication hold, backend, itch.io distinction and authenticated/device verification limits.

## October 14, 2026 — Map Atlas ownership release verification

- Recorded authorized PR #558 merge and verified web publication at `ed933ca...`, Netlify deploy `6acfac49800dda7ddba97930`, published `2026-10-14T16:28:51.572Z` (12:28 p.m. Eastern).
- Marked the stale ownership-count correction `LIVE — WEB`, with required CI, delivered desktop/mobile Atlas checks and six public startup/reload cases. Preserved the publication hold, existing backend, itch.io distinction and authenticated/device verification limits.

## October 14, 2026 — Shared attack swords release verification

- Recorded authorized PR #556 merge and verified web publication at `ec42a35...`, Netlify deploy `6acf989fced2cf4068af825c`, published `2026-10-14T15:02:13.557Z` (11:02 a.m. Eastern).
- Marked universal attack swords and capture-only flags `LIVE — WEB`, with exact artifact comparisons, staged/public combat fixture checks and six public startup/reload cases. Preserved the manual publication hold, existing backend, itch.io channel distinction and authenticated/device verification limits.

## October 13, 2026 — Matching NPC Info and Scout Report publication

- Recorded authorized PR #550 merge and verified web/Firebase build `f57b560...`, city-style NPC panels, contained action buttons, exact published assets and desktop/landscape checks.
- Marked the confirmed Info/Scout presentation LIVE. Recorded targeted build-identity deployment, 148 unchanged Functions, retained October realm/population/refills and publication hold, plus signed-in/physical-device, long-term and itch.io limits.

## October 13, 2026 — Matching NPC attack report publication

- Recorded authorized PR #548 merge and verified web/Firebase build `b372622...`, matching source cohorts, published report assets, desktop/landscape checks and October realm identity.
- Marked the approved shared NPC attack report presentation LIVE on web/Firebase, retained population/refill activation after verification, and recorded all 82 current maps' policy-4 checks. Preserved live player settlement/delivery, physical-device, long-term monitoring and itch.io publication limits.

## October 13, 2026 — Separated road respawn publication

- Recorded authorized PR #546 merge and coordinated web/Firebase release `6946e9b...`, exact six source cohorts, verified October realm, retained publication hold, and deployment pause/resume of the existing population/refill flag.
- Marked policy 4 LIVE: max two separated solos, beginner/alternating medium-high levels, many possible road respawn sites, accepted blocked slots and approved extras retirement/refunds. All 81 maps reconciled; inspection found 25 bosses, 110 solos, 56 valid new road spawns and 79 stationary retained targets. Preserved actual-refund, natural-respawn, physical-device, long-term and itch.io verification limits.

## October 13, 2026 — NPC city controls and inset respawn release

- Recorded authorized PR #543/#544 merges and coordinated web/Firebase release `a3f0b09...`, exact source cohorts, 81-map population, retained activation and publication hold, and successful focused/staged/public checks.
- Marked city-style NPC controls and new/replacement 20% edge insets with 90px solos/115px bosses LIVE on web. Preserved active target locations and disclosed natural-respawn, authenticated transaction, existing-browser, physical-device, long-term monitoring and itch.io verification limits.

## October 11, 2026 — Guild responsive alignment publication

- Recorded authorized PR #528 merge at `24cfa4e7dcecbf76175697097335091f26f5df59`, targeted backend identity, Netlify `6acbbb34b27b490008b0d04a` and actual itch.io upload `19696818`. Required CI, focused responsive/production Guild checks, exact channel parity and public startup/reloads passed.
- Published card-row, planning, room/phone-control and navigation alignment without balance, artwork or backend rule changes. Retained the October realm/rules, 144 other Functions, publication hold and 27 earlier itch uploads. Physical-device and current signed-in review remain manual.

## October 10, 2026 — Full Guild expansion publication (October 11 UTC)

- Recorded the approved complete expansion from PR #526, exact merged build `4a367c1a656f96d6c27a19a2738cbf58c983cb94`, all 145 backend Functions, new report rules, Netlify `6acb030ea11c5500084d6cb7` and itch.io `19686122`. Required CI, focused emulators/UI, exact public file parity and startup/reloads passed.
- Updated Guild implementation/art status and the release matrix to `LIVE — ALL PUBLISHED CHANNELS`. Preserved the active October realm, prior uploads and manual publication hold; disclosed anonymous production verification and the remaining account/device/pacing checks. This record changes no runtime or approved balance values.

## October 10, 2026 — Inner Castle overview building selection publication

- Recorded authorized PR #524 merge at `03c952837b28a819e2b8eadd5c22d803ec0a41a3`, targeted backend identity, Netlify `6aca820bc1a92c000898a96b` and actual itch.io upload `19678273`. Required CI, native source/built selection/drag checks, actual-game integration, fresh merged input checks, channel parity and startup/reloads passed.
- Inner Castle artwork taps select and zoom to 2.5×; visible district captions and panels retain their controls. Outside realm, art, economy, 143 other Functions, October realm/rules, publication hold and prior uploads are retained. Current authenticated/installed-app/physical-device input and existing long-term checks remain manual.

## October 10, 2026 — Inner Castle terrain deselection publication

- Recorded authorized PR #518 merge at `43e051ddabe58ccabc8ff8917b086d8064ee9e12`, targeted backend identity, Netlify `6ac9d8f08227150008b8e0f3` and actual itch.io upload `19667640`. Required CI, selected validators, exact merged interaction checks, public file parity and startup/reloads passed.
- Terrain taps clear the selected site without moving the camera; drag gestures and construction counters retain their behavior. Artwork, economy rules, 143 other Functions, October realm/rules and earlier uploads are preserved. Signed-in/installed-app/physical-device input remains manual.

## October 10, 2026 — Illustrated Inner Castle HUD publication

- Recorded authorized PR #516 merge at `2de0506f18b43a9bea5e0b41ce1fdcd90eb81974`, targeted backend identity, Netlify `6ac9ca81e1c3c9000899c0f9` and itch.io upload `19667179`. The merged built shortcut fixtures, file parity and startup/reloads passed.
- The castle next to Dailies opens Main City with mouse, touch or keyboard, preserving Profile draft guards and realm camera. Generated artwork/provenance and all current estate/Core payloads are retained. Current authenticated/installed-app/physical-device checks remain manual.

## October 10, 2026 — Inner Castle HUD entry

- Confirmed a miniature illustrated castle immediately beside Dailies, opening the existing Main City estate with mouse, touch, Enter or Space. Recorded preserved off-map resolution, unsaved Profile draft guards, realm-camera return and shared HUD styling. Implementation is pending release; this entry does not establish publication.

## October 10, 2026 — Overview construction countdown publication

- Recorded authorized PR #514 merge at `17494c17bc60f1ee7b92b91b946c9d3f167469f3`, targeted backend identity, Netlify `6ac9b8e03d7cf70008acd162` and actual itch.io upload `19666640`. Exact merged/staged timer fixtures, channel parity and public startup/reloads passed.
- Overview counters stay visible, fit the viewport and separate with site leaders; district captions restore after completion. Gameplay, inspection captions, art, 143 other Functions, October realm/rules and previous uploads are retained. Authenticated/installed-app/physical-device timers and existing long-term playtests remain manual.

## October 9, 2026 — Whole-building selection and drag publication

- Recorded authorized PR #512 merge at `4680341ee82f4cc5cfb3a687cdbb07e43b6ddeed`, targeted backend identity, Netlify `6ac9aa919a691d0008277095` and actual itch.io upload `19665869`. Staged/public file parity, three-size native input fixtures and public startup/reloads passed.
- Retained approved art, economy, 143 other Functions, October realm/rules, manual publication hold and previous uploads. Current authenticated/installed-app/physical input and the earlier unreproduced freeze remain distinct manual limits.

## October 9, 2026 — Estate refresh action-lock publication

- Recorded authorized PR #510 merge at `969e1ba9c508aeeae39a77a0bd56ab4165862e88`, targeted build-identity deployment, Netlify deploy `6ac97b52aef43d0008b7ac04` and actual itch.io upload `19663396`. Exact files, staged UI, public startup, backend scope and signed-in Guild locks/recovery verified.
- Retained gameplay rules, other 143 Functions, realm/rules, publication hold and previous uploads. Actual commission claim, physical devices and the separate earlier reload interruption remain disclosed limits.

## October 9, 2026 — Guild guidance and Inner Castle cross-channel release verification

- Recorded authorized PR #508 merge at `39af6d...`, targeted `getRealmInfo` identity deployment, Netlify deploy `6ac963f12ec4390008d70b36` published `2026-10-09T22:14:10.851Z`, and actual itch.io upload `19662086` publication.
- Required CI, seven selected validators, 56 staged and 168 public-file comparisons, exact three-size estate interactions and startup, 1,000-file itch parity, six local/six public itch startup/reload cases, source verification and callable access checks passed. Retained 143 other Functions, ready October realm, published rules and web publication hold.
- Marked current estate functionality `LIVE — ALL PUBLISHED CHANNELS`, including direct construction payment, prerequisite links, manual batches/Focused UI and existing-rule Guild guidance. No prices, rates, timers, XP rules or artwork changed. Preserved earlier release history and disclosed pending signed-in current-policy gameplay, physical-device checks, actual commission claims and human pacing.

## October 9, 2026 — Manual production and Focused UI release verification

- Recorded authorized PR #506 merge and matching six-Function/web deployment at `101d435...`, Netlify deploy `6ac94efaa11c55000812cdb9`, published `2026-10-09T20:35:31.404Z` (4:35 PM Eastern).
- Required CI, seven focused validators, two selected emulator suites, 56 staged and 168 public-file comparisons, three-size exact-runtime production/source-Back/focus and public startup, and deployed-source/authentication checks passed. Retained 138 other Function sources/revisions, the ready October realm, Firestore rules and publication hold.
- Marked manual production and Focused UI `LIVE — WEB`; current guides and the reproducible reward report point to verified release evidence. Approved recipes, rates, construction rules, Gear and artwork are unchanged. itch.io retains its previous build; authenticated production, physical-device and long-term pacing review remain manual.

## October 9, 2026 — Manual material production confirmed

- Replaced automatic recipe processing with player-chosen finite batches at the Sawmill, Smithy, Workshop and Windmill, using item recipes, a 1-to-Max slider, exact quantities, material totals, timers and Start production. Raw gathering stays automatic.
- Recorded atomic ingredient payment, protected reserves, reserved output storage, fixed accepted timers, one batch per processor, persistence, safe legacy accrual and no repeat/queue. Regenerated the shared-account model with explicit production choices; no recipe ratios, rates or construction prices changed. Implementation remains `IN DEVELOPMENT — NOT DEPLOYED`.

## October 9, 2026 — Building prerequisite navigation release verification

- Recorded authorized PR #504 merge and matching six-Function/web deployment at `1184763...`, Netlify deploy `6ac9239a4c742b000807123f`, published `2026-10-09T17:33:25.504Z` (1:33 p.m. Eastern).
- Required CI, five focused validators, two selected emulator suites, 56 staged and 168 public-file comparisons, three-size chains/Back/map/focus interactions and public startup, and deployed-source/authentication checks passed. Retained 138 other Function sources/revisions, the ready October realm, Firestore rules and publication hold.
- Marked prerequisite navigation `LIVE — WEB` with required/completed levels, branched dependencies, running-work handling and non-spending links. itch.io retains its previous build. Authenticated production and physical-device checks remain separate from isolated browser QA; economy values and construction rules are unchanged.

## October 9, 2026 — Build/Upgrade material payment release verification

- Recorded authorized PR #502 merge and matching six-Function/web deployment at `f7c063e...`, Netlify deploy `6ac91198e89cc0000893d7a7`, published `2026-10-09T16:13:44.738Z` (12:13 p.m. Eastern).
- Required CI, eight focused validators, three selected emulator suites, 56 staged and 168 public-file comparisons, three-size exact-runtime interactions/public startup and deployed-source/authentication checks passed. Retained 138 other Function sources/revisions, the ready October realm, Firestore rules and publication hold.
- Marked the deposit removal and atomic Build/Upgrade payment `LIVE — WEB`, honoring older paid credit and receipts. itch.io retains its previous build and policy guards require the current web client for construction. Authenticated production and physical-device checks remain distinct from isolated browser QA; no cost, duration or reward values changed.

## October 9, 2026 — Game health performance release verification

- Recorded authorized PR #500 merge and verified web publication at `74645db...`, Netlify deploy `6ac8706c706414000862f1b1`, published `2026-10-09T04:44:26.782Z` (12:44 a.m. Eastern).
- Required CI, seven selected validators, production artifact, 56 staged and 168 public-file comparisons, exact-runtime estate/performance checks and public desktop/mobile startup passed. Unchanged refreshes retained zero DOM mutations; the staged short-screen trace affected at most 92 elements. These controlled measurements do not establish production FPS or physical-phone latency.
- Updated the current snapshot and Release Channel Matrix to `LIVE — WEB`; the manual publication hold, backend and approved gameplay remain unchanged. itch.io retains its preceding build. Authenticated play, physical devices, crowded-map capacity and long soaks retain their stated limits.

## October 8, 2026 — Direct building start release verification

- Recorded authorized PR #498 merge and verified web publication at `f49871a...`, Netlify deploy `6ac85e4543f7880008c31cf9`, published October 8 at 11:29 p.m. Eastern (`2026-10-09T03:29:52.391Z`).
- Required CI, four focused validators, 55 staged and 165 public-file comparisons, exact-runtime direct build/upgrade/deposit/retry checks and public startup passed. Retained all 144 Function sources/revisions, the publication hold, ready October realm and matching Firestore rules.
- Marked the direct-start refinement `LIVE — WEB`. Prepared and locally verified the matching itch.io ZIP, while recording its unavailable Chrome publishing connection and unchanged public build. Signed-in production starts and physical-device checks remain distinct from isolated browser QA; no economy or artwork values changed.

## October 8, 2026 UTC — Building service polish release verification

- Recorded authorized PR #493 merge and verified web publication at `50a795d98beb55c276f2c1c55ff02778bb6db4a4`, Netlify deploy `6ac820fc75ca410008642d8b`, published `23:05:43.010 UTC` (7:05 p.m. Eastern).
- Required CI, six focused validators, production artifact, 55 staged and 165 public-file comparisons, exact-runtime service/deposit/Gear interactions and public startup passed. Retained the publication hold, backend contract/source, ready October realm and matching Firestore rules.
- Updated the current snapshot, Release Channel Matrix, economy guide and building mechanics review to `LIVE — WEB`. No approved economy values or artwork changed. itch.io, authenticated production, physical-device and long-term human pacing retain their stated limits.

## October 8, 2026 UTC — Compact estate action release verification

- Recorded authorized PR #491 merge and verified web publication at `db317e0...`, Netlify deploy `6ac806d86f6e56000879ec09`, published `21:15:55.555 UTC` (5:15 p.m. Eastern).
- Required CI, 55 staged and 165 public-file comparisons, exact-runtime compact-map/normal-panel interactions and public desktop/mobile startup passed. Retained the publication hold and existing backend contract/source, ready October realm and matching Firestore rules.
- Updated the current snapshot, Release Channel Matrix, compact action rule, Art Bible and economy guide to `LIVE — WEB`. itch.io was not republished; authenticated production and physical-device review remain manual.

## October 8, 2026 — Smaller estate action buttons

- Confirmed the requested reduction of the selected building's map Upgrade/Enter hex controls to 48px square, preserving shared colors, left/right order, readable labels and touch/keyboard access.
- Clarified that hex buttons appear only beside the selected building. Details and directory actions use normal parchment text buttons; interiors retain normal UI controls. Supersedes the estate's prior map sizing and panel hex styling. Construction timers, fixed captions, realm controls and gameplay are unchanged. This refinement is verified `LIVE — WEB` in PR #491's published build, as recorded in FM-2.

## October 8, 2026 UTC — Curved construction timer release verification

- Recorded authorized PR #489 merge and verified web publication at `5163ac1...`, Netlify deploy `6ac7f5fee4ace3000851cac7`, published `20:04:36.947 UTC`.
- Required CI, 55 staged and 165 public-file comparisons, exact-runtime timer/camera/lifecycle interactions and public desktop/mobile startup passed. Retained the publication hold and existing backend contract/source, ready October realm and matching Firestore rules.
- Updated the current snapshot, Release Channel Matrix, timer rule, Art Bible and economy guide to `LIVE — WEB`. itch.io was not republished; authenticated production and physical-device review remain manual.

## October 8, 2026 — Curved construction progress above buildings

- Added the owner-requested curved timer/countdown above running estate construction, anchored independently of the fixed bottom name/level caption and existing Upgrade/Enter controls.
- Reused accepted job deadlines and the shared visible-estate tick loop; kept authoritative completion, directory fallback, hidden-scene pausing and scene cleanup. Recorded the visual treatment in the Art Bible and economy guide. This presentation update is pending release; the verified live estate remains unchanged.

## October 8, 2026 UTC — Estate action-button release verification

- Recorded authorized PR #487 merge and verified web publication at `786781dd1dab50bce4f14e034835d8e3015e5a7f`, Netlify deploy `6ac7e5700533f200083bd1c9`, published `18:52:18.200 UTC`.
- Verified required CI, 55 staged and 165 public file matches, all twenty menu/upgrade paths at desktop and landscape sizes, and public startup. Retained the existing backend and manual publication hold.
- Updated the action layout, Art Bible and economy guide to LIVE — WEB. itch.io was not republished; signed-in production play and physical-device checks remain manual.

## October 8, 2026 — Left Upgrade and right Enter estate controls

- Confirmed the shared city-style gold Upgrade button on the left and matching Enter on the right, with map, selected-site and directory access.
- Online building selection now stays outside; Enter opens services or the appropriate officer Gear UI. Preserve deposits, explicit starts, no new queues, fixed captions and camera returns.
- Implemented on `codex/estate-upgrade-enter-buttons`, merged as PR #487 and verified published to web at `786781d...`; see the release-verification entry above.

## October 8, 2026 UTC — External building upgrade release verification

- Recorded authorized PR #485 merge and coordinated backend/web publication at `b000ba0f9eac589406d2b815a6cea251487b1417`, Netlify deploy `6ac7d33e656c520008e41a30`, published `17:42:21.867 UTC`.
- Verified all required CI gates, 144 active Node 22 functions and their exact source archives, unchanged rules/current realm, 54 staged and 162 public file comparisons, staged desktop/mobile deposit/start interactions and public startup.
- Retained the manual web publication hold, legacy paid work and all existing costs/rewards. itch.io was not republished; signed-in production play and physical-device review remain manual.

## October 8, 2026 — External upgrades with permanent deposits

- Confirmed a separate estate-map requirements/deposit action for every building, with services retained inside.
- Replaced new batches/queues with one explicitly started next-level upgrade after full material deposits, Gold and builder availability. Existing paid work is preserved.
- Updated the economy guide, Art Bible, shared-account review and validation for this rule. Implementation is pending PR validation and authorized coordinated deployment; no new live status is claimed.

## October 8, 2026 UTC — Fixed western district release verification

- Recorded PR #483's authorized merge and verified web publication at `75a5829...`, fixed Quarry Hills/Woodland anchors, retained publication hold, 54 staged and 162 public-file comparisons, delivered desktop/landscape interactions and public startup.
- Updated the current snapshot, district refinement and Release Channel Matrix to `LIVE — WEB`. The backend and approved gameplay/artwork remain unchanged; itch.io, authenticated production and physical-device review retain their stated limits.

## October 8, 2026 UTC — Fixed building caption release verification

- Recorded PR #481's authorized merge and verified web publication at `8ebe5ab...`, fixed bottom caption anchors, retained publication hold, 54 staged and 162 public-file comparisons, delivered desktop/landscape behavior and public startup.
- Retained the verified estate economy backend and approved gameplay/artwork. itch.io was not republished; physical-device and authenticated production review remain manual.

## October 8, 2026 UTC — Permanent estate economy release verification

- Recorded PR #479's authorized merge and verified coordinated backend, Firestore rules and web publication at build `a4cd346...`, retaining the manual web publication hold.
- Recorded all 144 ACTIVE Node.js 22 Functions, six source groups matching 56 runtime files each, successful recovery of 23 old revisions after the rate-limited first rollout, rules parity, affected authentication guards, 54 staged and 162 public file comparisons, and desktop/mobile production-artifact smoke.
- Updated the current snapshot, estate implementation status and Release Channel Matrix to `LIVE — WEB`; itch.io was not republished. Preserved manual authenticated/physical-device checks and the disclosed multi-year whole-estate pacing limitation. No gameplay values or artwork changed in this record.

## October 8, 2026 UTC — Estate UI and dependency release verification

- Recorded the authorized PR #477 merge and verified web/backend deployment, exact build and publication, retained manual publication hold, source/dependency parity and current October realm.
- Updated district labels, resource ledger and Back to Realm to `LIVE — WEB`. Recorded desktop/mobile input and equipment-return smoke results; itch.io and physical-device/authenticated gameplay review remain separate.
- Kept estate economy implementation `PLANNED` and proposed balance values unapproved; linked the independent reward review.

## October 7, 2026 — Estate progression decisions and building labels

- Confirmed Level 100 maximum for all twenty estate buildings, Gold-only initial construction and materials for subsequent upgrades.
- Confirmed Crown building supplies at Wagon Yard and Crown food supplies at Market, explicitly superseding the cosmetics-only restriction for those planned catalogs.
- Confirmed permanent levels/Gear-set unlocks for Treasury, Barracks, Gatehouse and Royal Stables, and Alehouse recruitment quality, quest recovery and preparation meals. Gameplay gates, costs and persistence remain planned.
- Added name/level captions, initial Level 1 presentation and development-only milestone review without changing artwork, construction state, resource balances, Gear or backend persistence.
- Refined the estate's Back action to **Back to Realm**, closing the estate to the current map with focus restored while preserving equipment returns to Inner Castle. This navigation change remains in development with the label update.
- Clarified that the four permanent buildings unlock existing Gear rarity tiers. Added a detailed proposed estate economy and reproducible 100-level/session/reset review, plus the centered resource ledger. Gameplay values remain proposed; counters do not establish resource production, purchases or saved progression.
- Confirmed Guild Master, Alehouse and acquired champion progression also persist across seasons, giving six permanent estate buildings and fourteen seasonal sites. Updated the proposed cost/reset model and future authority contracts; no playable progression or reset migration is implemented by this documentation update.
- Confirmed per-building permanent material targets of 1 / 3 / 6 / 10 cumulative seasons at Levels 25 / 50 / 75 / 100, using a 50% seasonal production budget. Added permanent partial building deposits to the persistence allowlist and replaced the proposed double-material formula with a fixed season-equivalent review model.
- The final October 7 follow-up superseded the six-building persistence split: the entire Inner Castle now persists, including all twenty buildings, all estate materials, deposits and ongoing estate work. Redrafted resource bills and longer timers for every level; the per-building calibration assumes developed supporting production and is not a shared twenty-building completion promise. Gameplay implementation remains planned.

## October 7, 2026 — Inner Castle web release verification

- Recorded the authorized PR #474 merge and web publication, exact build/deploy/time, retained manual publication hold and unchanged backend identity.
- Recorded 51 staged files, 153 public comparisons, twenty controlled equipment returns using the published runtime and anonymous primary-domain startup. Authenticated and physical-device checks remain manual.
- Updated the estate status and Release Channel Matrix to `LIVE — WEB`; itch.io was not republished. No gameplay or artwork rule changed.

## October 6, 2026 — itch.io release and weekly dev blog

- Recorded the authorized 1,000-file same-build itch package, selected upload `19600336`, ACTIVE Butler build `2076674`, complete pre-publication resource checks and six desktop/mobile startup cases.
- Recorded published weekly devlog `1694127` covering September 29–October 6, with the final ZIP attached and public reading verified. Published the same article on the primary website via website PR #28 and verified all 50 live pages plus responsive article reading.
- Recorded recovery from the initial hosting/processing errors, actual public iframe discovery, all 1,000 matching public files and six public desktop/mobile startup cases. Updated affected features to `LIVE — ALL PUBLISHED CHANNELS`; authenticated gameplay and purchase checks remain manual. The former itch publication hold no longer applies to this update; the game web deployment’s existing hold remains enabled.

## October 6, 2026 — King Power release verification

- Recorded the authorized PR #460 merge, exact web/backend build, active October Core realm and retained publication hold.
- Recorded conversion and verification of all 54 current player scores and three active clan rankings, with historical records excluded.
- Verified the 24 local checks, 15 selected emulator suites, season balance audit, exact backend source, public game assets and desktop/landscape startup; itch.io remains unrepublished.
- Marked version 13 troop-only King Power live on web and resolved the obsolete replacement-power validator conflict.

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
