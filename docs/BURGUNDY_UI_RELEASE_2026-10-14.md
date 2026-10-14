# Restored burgundy UI colors — October 14, 2026

[PR #562](https://github.com/explocion200/CrownLands/pull/562), from `codex/restore-burgundy-ui-colors`, is **LIVE — WEB**. Headers, HUD controls and boxed X buttons use the previous burgundy `#72363a`, with darker `#542728` hover. The approved parchment, gold borders, inset tab frames, layout, artwork and interaction behavior remain unchanged.

The shared header tokens replace the oak tokens, and Guild fallback styling uses the same colors. This implements the owner's explicit color correction to the preceding Guild Master theme release.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `7ff2ab69a2bee3c00b7d2a4febcad38b5e49df3f` |
| Netlify deployment | `6acfe006a891a1c7f1dd9534` |
| Published | October 14, 4:05 p.m. Eastern (`2026-10-14T20:05:24.478Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Client source SHA-256 | `2941e32634a179d947e232870298eb7dc8c43ce61ef09334b87657e3a6c0c19b` |
| Prior published web build | `16d282a35c9764e6cc7ca11b6d28b3ffa5021252` |
| Manual publication hold | Preserved; published deployment locked |

## Verification

- Feature head `9712fa8ddac9389cdfbb6f457c7cf364e391dedc` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38626757987](https://github.com/explocion200/CrownLands/actions/runs/38626757987). The multiplayer gate explicitly allowed a safe skip because no server-authoritative behavior changed.
- Node 22 preparation passed syntax/lint, runtime-data consistency, production packaging, asset budgets and all seven selected validators. Coverage includes 189 window/viewport combinations, exact colors and contrast, 44px framed X targets, alignment, hover, keyboard/pointer/touch dismissal, Guild source/built layouts, HUD artwork/zoom/input, chat/rewards and kingdom ledgers.
- The merged Git tree exactly matched the validated feature tree. The rebuilt production artifact passed validation: 1,162 files including its inventory and 179 resources per entry. All 1,161 staged inventory entries and nine selected files matched the validated artifact. Existing asset ceilings passed.
- Staged delivered assets passed 42 window cases: Shop, Profile, Skills, Clan, Dailies, Guild Hall/Members, Chat, Reports, Leaderboards, Bag, flag editor, checkout and stamina at 1440×900, 844×390 and 568×320. Public delivered assets passed 18 cases: Shop, Profile, Bag, flag editor, stamina and Guild Hall at those sizes. These use synthetic game fixtures with delivered assets, not production player actions.
- All 27 exact-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`, including the three changed stylesheets and the release/entry assets. The canonical game entry and manifest identify the merged build. Six anonymous public cold/reload cases passed at the three sizes without uncaught runtime exceptions.
- Release ID, API contract and server source fingerprint match the prior published client. No Functions, Firestore rules/indexes, realm configuration or player data were deployed or changed.
- Local `main` was clean and equal to `origin/main` at the merged runtime, with divergence `0 0`, before publication. This follow-up records deployment evidence only.

## Limits and evidence

Authenticated gameplay, installed-app cache recovery and physical-device behavior remain manual verification limits. Public startup checks bypass the service worker; isolated window fixtures do not establish behavior in a signed-in production account.

itch.io was not republished and retains its previously recorded incompatible release identity. Sanitized publication receipts, comparisons and screenshots are retained under ignored `release-artifacts/burgundy/deployment/`.
