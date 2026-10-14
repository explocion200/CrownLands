# Shared Guild Master UI theme — October 14, 2026

[PR #560](https://github.com/explocion200/CrownLands/pull/560), from `codex/consistent-window-close-controls`, is **LIVE — WEB**. The approved Guild Master reference now supplies dark-oak headers and HUD, parchment surfaces, muted-gold borders, brown body text and cream header text. Close controls share one centered X in a thin square frame with a 44 × 44 px target. Tabs have inset gold frames separating adjacent choices, a burgundy selection underline and stronger keyboard focus.

Shared theme rules replace conflicting component paint, including Item Bag categories and flag/shield navigation. Artwork, saved heraldry, semantic indicators, layout geometry, pending-action guards and required reward collection retain their behavior.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `16d282a35c9764e6cc7ca11b6d28b3ffa5021252` |
| Netlify deployment | `6acfd84065ed98dd45e940d6` |
| Published | October 14, 3:32 p.m. Eastern (`2026-10-14T19:32:28.989Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `626e3b3850dc1e1766b30a65a1a9422596e9fd5fed00f4916fb899096fdb729d` |
| Prior published web build | `ed933caca8e67869c27f0b1da108d8116a0d869f` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `82ed7983d92419a8aa99f9f7bde93f6112a20884` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38622192636](https://github.com/explocion200/CrownLands/actions/runs/38622192636). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed syntax/lint, runtime-data consistency, production packaging, asset budgets and all 14 selected validators. The window suite covered 63 states at three sizes (189 combinations), header colors/contrast, framed X geometry, accessible names, clearances, hover, mouse/touch dismissal and keyboard activation. Additional suites covered Guild, Clan buildings, authentication, identities, rewards, modal cleanup, HUD artwork, Marauders/stamina and checkout.
- Tab review covered desktop and short landscape layouts, Bag and heraldry navigation, and real keyboard navigation with a stronger inset focus border and unchanged tab geometry. The Master Specification records the explicitly confirmed visual direction.
- The merged Git tree exactly matched the validated feature tree. The rebuilt artifact passed validation: 1,162 files including its inventory and 179 resources per entry. The complete staged inventory of 1,161 entries and all 51 selected files matched the tested artifact. Existing asset ceilings passed.
- Staged delivered files passed 42 window cases: Shop, Profile, Skills, Clan, Dailies, Guild Hall/Members, Chat, Reports, Leaderboards, Bag, flag editor, checkout and stamina at 1440×900, 844×390 and 568×320. Public delivered files passed 18 cases: Shop, Profile, Bag, flag editor, stamina and Guild Hall at those three sizes. These use synthetic game fixtures and delivered client assets, not production player actions.
- All 153 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`. The canonical game entry and manifest identify the merged build. Six anonymous public cold/reload cases passed at the three sizes without uncaught runtime exceptions.
- Release ID, API contract and server fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed.
- Local `main` was clean and equal to `origin/main` at the merged runtime, with divergence `0 0`, before publication. This follow-up records deployment evidence only.

## Limits and evidence

Authenticated gameplay, installed-app cache recovery and physical-device behavior remain manual verification limits. Public startup checks bypass the service worker; the UI fixtures do not establish behavior in a signed-in production account.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, file comparisons and screenshots are retained under ignored `release-artifacts/guild-theme/deployment/`.
