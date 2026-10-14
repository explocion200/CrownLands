# Report and military action artwork — October 14, 2026

[PR #571](https://github.com/explocion200/CrownLands/pull/571), from `codex/report-action-artwork`, is **LIVE — WEB** at [the canonical game entry](https://playcrownlands.com/play/). Reports, Attack, Defense, Scout and Realm Activity use five coordinated illustrations matching the approved medieval map reference: sealed dispatch and quill, crossed swords, shield, hooded scout and a stone castle.

The shared artwork appears in the Reports HUD button, report headings/tabs/rows, battle and scouting details, incoming threats, troop orders and relevant Help illustrations. Report notifications use the new dispatch image. Existing report filtering, target navigation, privacy, combat values and order behavior remain unchanged. Heraldry, named skill/equipment art and map units retain their own imagery.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `1565e3013b060f9860ad5c524ab42eef07e96842` |
| Netlify deployment | `6ad01302037d0f578982afbc` |
| Published | October 14, 7:43 p.m. Eastern (`2026-10-14T23:43:54.858Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `a5b8abbe7901a27c3c748ed3898b202d3f0fb2547bf45bec400fabc4ec23369b` |
| Prior published web build | `643bf16766e69c12dc28e110d7c7782202fe3de6` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `572e8bc85a2110084d526c45ae7f95e25b09b5ff` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38653508219](https://github.com/explocion200/CrownLands/actions/runs/38653508219). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed eight selected validators for report artwork, report behavior, battle details, scouting, incoming threats, Help, distant-city orders and asset budgets. Syntax, lint, runtime-data consistency and production packaging passed. The five transparent 384×384 WebP images total 177,970 bytes; the aggregate install-cache budget is unchanged. Sources and provenance are recorded in [the artwork notes](art-sources/report-actions/README.md).
- Thirty-six local, thirty-six staged and thirty-six public-asset report views passed: six report views at 1440×900, 844×390 and 568×320, in and out of fullscreen. Checks cover shared image identity, decoded artwork and alpha, tab filtering, frame and close-button bounds, and native mouse/touch dismissal. No uncaught runtime exceptions occurred.
- The merged Git tree exactly matched the validated feature tree. Rebuilding with Netlify's full commit identifier passed artifact validation and asset budgets: 1,167 files including the inventory and 179 resources per entry. All 1,166 staged inventory entries matched. Nineteen selected staged files matched byte-for-byte; the bundled homepage matched after normalizing Netlify's existing anchor pretty-URL processing.
- All 57 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`. The game-host bundled homepage also passed its normalized comparison, for 58 public checks. The canonical website homepage is maintained by a separate publication and was not replaced or treated as this repository's bundled `home.html`.
- The canonical `/play/` entry and release manifest identify the merged build. Six anonymous public startup/reload cases passed at the three sizes without uncaught runtime exceptions.
- Release ID, API contract and server source fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed. Local `main` was clean and equal to `origin/main`, with divergence `0 0`, before publication.

## Limits and evidence

Report-window checks use isolated synthetic fixtures with delivered assets, not a signed-in production account. Public startup checks bypass the service worker. Physical-device review, authenticated gameplay, native notification display and installed-app cache recovery remain manual checks.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, file comparisons, measured window bounds and screenshots are retained under ignored `release-artifacts/report-artwork/deployment/`.
