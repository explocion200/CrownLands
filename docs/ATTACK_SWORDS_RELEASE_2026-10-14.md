# Shared attack swords — October 14, 2026

[PR #556](https://github.com/explocion200/CrownLands/pull/556), from `codex/universal-attack-sword-clashes`, is **LIVE — WEB**. Every confirmed attack uses the capture effect's three sword clashes, contact sparks and dust. Flags and ownership pulses remain exclusive to eligible captures. Battle receipts and ownership updates share one sword sequence in either delivery order.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `ec42a351bd72d45f697da950b0b63648d5a9eeb4` |
| Netlify deployment | `6acf989fced2cf4068af825c` |
| Published | October 14, 11:02 a.m. Eastern (`2026-10-14T15:02:13.557Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `054d5b1073c0d4882a46ab116303ba836a29493f2f51642b567ff1e3ef450df5` |
| Prior published web build | `eb0be0ec339aef412210e0977337c5b070f1f364` |
| Manual publication hold | Preserved; new published deployment locked |

## Validation and publication

- Final feature head `f1e86bfa4f9b49e5405686b91685e4eb8c8af1e3` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38583402232](https://github.com/explocion200/CrownLands/actions/runs/38583402232). The multiplayer gate passed without emulator suites because this change only affects client presentation.
- Node.js 22 and `pnpm run prepare-pr` passed syntax/lint, runtime-data consistency, production packaging, existing asset budgets and the selected animation, browser, report and Citadel validators. An earlier CI failure exposed a fixed-delay assumption in the new browser test; the final test awaits the rendered capture effect and still verifies that sword progress does not restart.
- The merged build passed runtime-data consistency and production artifact validation: 1,162 files including its inventory, with 179 resources per entry. The staged deployment matched all 1,161 inventory entries and ten selected delivered files: release manifest/configuration, game script, animation manager, capture and main styles, flag renderer, service worker, game entry and application manifest.
- The staged and public copies of combat assets passed the existing isolated browser fixture suite at 1440×900, 844×390 and 568×320. Coverage includes city, Camp, Holding Tower, defeated Marauder and boss renderers; three sword contacts; no attack flag; report/callable deduplication; Legion defense; both attack/capture delivery orders; reduced/off motion; stale spawn, session and map guards; friendly/blocked/scout/historical-event exclusions; and watchdog cleanup. Capture heraldry, timing and eligibility checks remain intact.
- Thirty selected-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`. Public manifests and game-entry metadata identify the exact merged build. Six anonymous startup/reload cases passed at the three desktop/landscape sizes without uncaught runtime exceptions.
- Publication promoted the verified staged deployment and restored its manual hold. Release ID, contract and server fingerprint match the prior published client. No Firebase Functions, rules, indexes, realm configuration or player data were deployed or changed.
- Local `main` was clean, equal to `origin/main` at the merged runtime, and verified at divergence `0 0` before publication. This release-record follow-up changes documentation only.

## Limits and evidence

Combat interaction checks use synthetic fixtures with the delivered assets. They do not establish authenticated production combat, installed-app cache recovery or physical-device behavior. The public startup checks bypass the service worker. No production attack or ongoing monitor was initiated.

itch.io was not republished and retains its previously recorded incompatible release identity; matching publication remains separate work.

Sanitized deployment receipts, file hashes, validation results and screenshots are retained under ignored `release-artifacts/attack-swords/deployment/`.
