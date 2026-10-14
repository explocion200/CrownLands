# Centered leaderboard crowns — October 13, 2026

[PR #554](https://github.com/explocion200/CrownLands/pull/554), from `codex/leaderboard-medal-crowns`, is **LIVE — WEB**. Gold, silver and bronze crowns identify first, second and third on Top 100 Kingdoms, Top Clans and Field of Glory. Each crown is centered above its visible rank and saved flag or clan heraldry. Short landscape screens use compact spacing to retain the entire podium.

## Verified identity

| Item | Value |
|---|---|
| Merged runtime build | `eb0be0ec339aef412210e0977337c5b070f1f364` |
| Netlify deployment | `6aceebc75283c7596bff5353` |
| Published | October 13, 10:44 p.m. Eastern (`2026-10-14T02:44:24.817Z`) |
| Release | `crownlands-2026-10-12-marauder-hunts-v1` |
| API contract SHA-256 | `ee7ab57bcca5a5af5728e915ffa8b3ce6b2716356295f0d73260bbe188aa71ad` |
| Server source SHA-256 | `9485752ef1081967b0dcd37b118c8f0252df43f00adf2b1704587db574fd505f` |
| Prior published web build | `1c3faf7f062b0173fd09ae34575df1c1f1accac0` |
| Manual publication hold | Preserved; new published deployment locked |

## Validation and publication

- Feature head `b36c537f46ab65781fcc9921302986128cdb76fe` passed `Static validation`, `Multiplayer emulator validation` and `Validate` in [run 38501855151](https://github.com/explocion200/CrownLands/actions/runs/38501855151). The multiplayer gate explicitly passed without emulator suites because this presentation change has no server-authoritative behavior.
- Node.js 22 and `pnpm run prepare-pr` passed the selected leaderboard, asset-budget and production checks. The crown selectors remain within the bounded 31.5 KiB stylesheet allowance. The clean merged build passed runtime-data consistency and production artifact validation: 1,162 files including its inventory and 179 resources per entry.
- The exact staged deployment matched the complete 1,161-entry artifact inventory and ten selected files, including the game entry, release manifest/configuration, game script, service worker, ledger script/styles and all three crown SVGs. The prior public manifest matched release ID, contract and server fingerprint before publication.
- Staged and public asset copies were served through the existing isolated leaderboard fixture harness. All three boards passed at 1366×820, 1200×688, 844×390 and 568×320, including refresh, 100 unique ranks, full totals, scrolling/focus, keyboard navigation, saved player flags, clan heraldry, previous-season decorations, empty/failure/few-entry states and stale-modal guards. Desktop and short-landscape screenshots were inspected for crown centering, medal colors and clipping.
- Thirty selected-file comparisons passed across `https://playcrownlands.com`, `https://crownland.netlify.app` and `https://game.playcrownlands.com`. Public manifests and entry metadata identify the exact merged runtime. Six anonymous startup/reload cases passed at 1440×900, 844×390 and 568×320 without uncaught runtime exceptions.
- Publication promoted the exact verified deployment and restored its manual hold. No Firebase Functions, rules, indexes, realm configuration or player records were deployed or changed by this release. Existing scores, reward eligibility and seasonal honors are preserved.
- Local `main` was clean, equal to `origin/main` at the merged runtime, and verified at divergence `0 0` before publication. This release-record follow-up changes documentation only.

## Limits and evidence

Leaderboard interaction verification uses synthetic data with the exact delivered presentation assets. It does not establish authenticated production standings, installed-app cache recovery or physical-device behavior. The startup smoke checks bypass the service worker. No production gameplay action or ongoing monitor was initiated.

itch.io was not republished and retains its previously recorded incompatible release identity; matching publication remains separate work. The public website's completed-season archive is outside this in-game podium update.

Sanitized deployment receipts, per-file hashes and screenshots are retained under ignored `release-artifacts/leaderboard-crowns/deployment/`. The legacy manifest's client source fingerprint does not cover the ledger stylesheet/new crown SVGs; exact selected-file and artifact-inventory comparisons provide their delivery evidence.
