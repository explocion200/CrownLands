# Matching window header icons — October 14, 2026

[PR #568](https://github.com/explocion200/CrownLands/pull/568), from `codex/match-window-header-icons`, is **LIVE — WEB** at [the canonical game entry](https://playcrownlands.com/play/). Item Bag, Shop, City List and Map display their corresponding illustrated HUD button image to the left of the window title, uncropped and vertically centered on desktop and landscape mobile.

Shared responsive image sizing replaces the old Bag/Shop seals and adds matching artwork to City List and Map. Titles, header balances and the boxed X remain clear. Unused seal styles and the old Shop glyph are removed. Existing colors, gameplay and backend behavior are preserved.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `643bf16766e69c12dc28e110d7c7782202fe3de6` |
| Netlify deployment | `6acfff5f5a5b928eb776ce2a` |
| Published | October 14, 6:18 p.m. Eastern (`2026-10-14T22:18:40.853Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `4fd26d1441342151f51ec53d914dd3405ce012401f90ca93d082e588bfe335d1` |
| Prior published web build | `1c8d8ad3ccfafa07ebccf4772d6981ea1db54d7d` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `2af5e4b7d09ded2a9c0e60f0a66f089113270351` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38645717469](https://github.com/explocion200/CrownLands/actions/runs/38645717469). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed six selected validators covering Bag, Shop, City List, Kingdom ledgers, the common four-tab Shop frame and asset budgets. Syntax, lint, runtime-data consistency and production packaging passed. The City List test now expects the already-approved parchment palette. Bounded source ceilings account for the new markup and shared styles; the eight changed runtime files total 23 bytes less than the base and aggregate shell/image/request limits are unchanged.
- Twelve local, twelve staged and twelve public header cases passed: all four windows at 1440×900, 844×390 and 568×320. Checks verify exact matching HUD image URLs, decoded images, uncropped placement, vertical alignment, title/close separation, contained X buttons and native mouse/touch dismissal. Delivered runs had no uncaught runtime exceptions.
- The merged Git tree exactly matched the validated feature tree. Rebuilding with Netlify's full commit identifier passed artifact validation and asset budgets: 1,162 files including the inventory and 179 resources per entry. All 1,161 staged inventory entries and 17 selected staged files matched.
- All 51 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`, covering eight changed runtime files, five release/entry assets and the four reused illustrations. The canonical `/play/` entry and manifest identify the merged build. Six anonymous public startup/reload cases passed at the three sizes without uncaught runtime exceptions.
- Release ID, API contract and server source fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed. Local `main` was clean and equal to `origin/main`, with divergence `0 0`, before publication.

## Limits and evidence

Header checks use isolated synthetic fixtures with the delivered assets, not a signed-in production account. Public startup checks bypass the service worker. Physical-device review, authenticated gameplay and installed-app cache recovery remain manual checks.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, exact-file comparisons, measured header coordinates and screenshots are retained under ignored `release-artifacts/window-title-icons/deployment/`.
