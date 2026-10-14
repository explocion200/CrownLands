# Map Atlas ownership counts — October 14, 2026

[PR #558](https://github.com/explocion200/CrownLands/pull/558), from `codex/map-city-ownership-indicators`, is **LIVE — WEB**. The Atlas uses current active-map ownership and refreshes off-map counts with an owner-scoped server query when opened. Confirmed zero-city results clear stale counts; older caches and responses from a replaced session cannot restore them. Unloaded Core cities retain their canonical map identity. Strongholds and Citadels remain excluded from regular city totals.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `ed933caca8e67869c27f0b1da108d8116a0d869f` |
| Netlify deployment | `6acfac49800dda7ddba97930` |
| Published | October 14, 12:28 p.m. Eastern (`2026-10-14T16:28:51.572Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `996b0163afc95bebb03c79b4a3444bd207568996b9d6d4b6a31aaa93a63b2345` |
| Prior published web build | `ec42a351bd72d45f697da950b0b63648d5a9eeb4` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `9f4c58589d30f93299e21388f612b9c45533a900` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38592846520](https://github.com/explocion200/CrownLands/actions/runs/38592846520). The selected realm-shard suite verified the cross-map owner query and access isolation.
- Node 22 preparation passed syntax/lint, runtime-data consistency, production packaging, existing asset budgets and five focused validators. Regression coverage includes capture/loss, empty results, stale aggregates and visited maps, unloaded Core IDs, malformed/failed reads, freshness, concurrency and session replacement. City-list behavior and city-marker ownership transitions also passed.
- The merged artifact passed validation: 1,162 files including its inventory and 179 resources per entry. The staged deployment matched the complete 1,161-entry path/size inventory and nine selected files byte for byte. The local build used the full merge SHA to match hosting's build stamps.
- Staged and public delivered assets passed the Atlas browser suite at 1200×800, 844×390 and 568×320. Counts and accessibility labels update in place while focus, camera, mouse/keyboard/touch input, pan and zoom remain intact. These checks use synthetic ownership fixtures and delivered client files; they do not perform production ownership changes.
- Twenty-seven exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`. The canonical game entry and manifests identify the merged build. Six anonymous public startup/reload cases passed at 1440×900, 844×390 and 568×320 without uncaught runtime exceptions.
- Read-only realm verification retained `main-realm-2026-10` / `realm-2026-10` / `shard_0001`; client/server configuration retains `core-expansion-v1`. Release ID, contract and server fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed.
- Local `main` was clean and equal to `origin/main` at the merged runtime, with divergence `0 0`, before publication. This follow-up records deployment evidence only.

## Limits and evidence

Failed/offline Atlas queries preserve the last known counts instead of inventing zeroes. Successful server refreshes are cached for 15 seconds. Authenticated production ownership changes, installed-app cache recovery and physical-device behavior remain manual verification limits; public startup checks bypass the service worker.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized receipts, file comparisons and screenshots are retained under ignored `release-artifacts/map-ownership/deployment/`.
