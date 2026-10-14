# Window alignment and label contrast — October 14, 2026

[PR #564](https://github.com/explocion200/CrownLands/pull/564), from `codex/window-alignment-and-label-contrast`, is **LIVE — WEB**. Boxed X controls sit within their headers in Shop, Item Bag, City List, reward windows, Inner Castle and public player profiles. Clan reward/member badges and the View Main City label retain readable foreground colors. Burgundy colors and framed tabs remain unchanged.

Shop, Bag and reward cards now provide a stable positioning container when an opening animation's transform clears. Public profile titles and close controls share a grid row. The shared tab cascade preserves Clan badges' paired colors, and the Main City label inherits its button state. No gameplay rules or backend behavior changed.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `b7b2a2584dd4f727be4a581c1ebbe11201f24ee7` |
| Netlify deployment | `6acff0411fe6ead9aaa02eea` |
| Published | October 14, 5:16 p.m. Eastern (`2026-10-14T21:16:36.520Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `366cc79ee7a101f16c74d9b8bc572f853fe0c74754f293c28bbe82628d481ff7` |
| Prior published web build | `7ff2ab69a2bee3c00b7d2a4febcad38b5e49df3f` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `085e51ef6f3467c5fabf45e997c63444960a45fe` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38637208858](https://github.com/explocion200/CrownLands/actions/runs/38637208858). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed all five selected validators, syntax/runtime-data checks, production packaging and asset budgets. The local matrix covered 198 window/viewport combinations and 12 public-profile layouts at 1440×900, 844×390 and 568×320. It checks header containment/centering, stable X placement with and without animation transforms, badge/label contrast, 44px targets, focus and mouse/touch dismissal. Profile coverage retains navigation, pending/retry and stale-response checks.
- The merged Git tree exactly matched the validated feature tree. The production artifact was rebuilt with Netlify's full commit identifier and passed validation: 1,162 files including its inventory and 179 resources per entry. All 1,161 staged inventory entries and 15 selected staged files matched. Existing asset ceilings passed.
- Staged delivered assets passed 33 window cases, including Shop, Bag, City List, daily/quest/achievement rewards, populated Clan tabs and Guild Hall. Public delivered assets passed 18 window cases. Both stages also passed all 12 public-profile layouts and their navigation checks. These are isolated synthetic fixtures using delivered assets, not production player actions.
- All 45 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`, including the nine changed stylesheets and six release/entry assets. The canonical `/play/` entry and manifest identify the merged build. Six anonymous public startup/reload cases passed at the three sizes without uncaught runtime exceptions.
- Release ID, API contract and server source fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed. Local `main` was clean and equal to `origin/main`, with divergence `0 0`, before publication.

## Limits and evidence

Authenticated gameplay, installed-app cache recovery and physical-device behavior remain manual verification limits. Public startup checks bypass the service worker; isolated window fixtures do not establish behavior in a signed-in production account.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, file comparisons and screenshots are retained under ignored `release-artifacts/window-fixes/deployment/`.
