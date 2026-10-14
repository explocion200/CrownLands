# HUD left-edge alignment — October 14, 2026

[PR #566](https://github.com/explocion200/CrownLands/pull/566), from `codex/align-top-hud-left-edge`, is **LIVE — WEB** at [the canonical game entry](https://playcrownlands.com/play/). The profile/action row, Gold/Crowns and combat timers share Reports' existing 12px left screen inset on desktop and landscape mobile, before, during and after fullscreen.

The top HUD previously applied a separate left safe-area gutter, shifting it inward on devices with a left screen inset while Reports stayed at 12px. The shared screen-edge rule removes that extra offset. Vertical placement, right-side inset, control sizes, artwork, burgundy colors and actions are preserved. No gameplay or backend behavior changed.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `1c8d8ad3ccfafa07ebccf4772d6981ea1db54d7d` |
| Netlify deployment | `6acff7820bae52e8c1996a16` |
| Published | October 14, 5:45 p.m. Eastern (`2026-10-14T21:45:05.382Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `bbf4e4da480a0efc167604a6a60f270d17febd35c924c1e21015249b9b7d5738` |
| Prior published web build | `b7b2a2584dd4f727be4a581c1ebbe11201f24ee7` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `b46410a2db9280c5f44350063ebaad5612726afe` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38641112905](https://github.com/explocion200/CrownLands/actions/runs/38641112905). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed four selected validators: the new HUD screen-edge matrix, existing main-screen artwork and Crowns HUD browser coverage, and asset performance budgets. Syntax, runtime-data consistency and production packaging passed.
- The new matrix passed 18 cases locally, 18 with staged delivered assets and 18 with public delivered assets. Each run covers six desktop/mobile scenarios in windowed, actual native fullscreen and restored modes. It includes compact 568px layouts, left/right safe-area insets and an inset that changes on fullscreen entry. Assertions check the shared 12px edge, reachable controls without overlap, stable HUD positions when zooming the map, and Profile/Reports mouse or touch actions. Both delivered runs had no uncaught exceptions or failed assets.
- The merged Git tree exactly matched the validated feature tree. Rebuilding with Netlify's full commit identifier passed production artifact validation and existing asset budgets: 1,162 files including the inventory and 179 resources per entry. All 1,161 staged inventory entries and eight selected staged files matched.
- All 24 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`, covering both HUD stylesheets and six release/entry assets. The canonical `/play/` entry and manifest identify the merged build. Six anonymous public startup/reload cases passed at 1440×900, 844×390 and 568×320 without uncaught runtime exceptions.
- Release ID, API contract and server source fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed. Local `main` was clean and equal to `origin/main`, with divergence `0 0`, before publication.

## Limits and evidence

The delivered HUD checks use isolated synthetic fixtures with the actual published assets. They exercise Chromium's fullscreen and mobile/safe-area emulation; they do not establish physical-phone behavior or signed-in production gameplay. Public startup checks bypass the service worker. Physical-device review and installed-app cache recovery remain manual checks.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, exact-file comparisons, measured HUD coordinates and screenshots are retained under ignored `release-artifacts/hud-screen-edge/deployment/`.
