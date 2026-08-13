# Crownlands UI Contrast Correction QA

This gallery is a presentation-only comparison fixture. It does not connect to Firebase, mutate player data, or exercise gameplay mechanics.

## Scope represented

- Global selected and unselected tabs: Profile, Clan, Skills, Settings, Reports, Achievements, Camps / Strongholds, and Rewards.
- Flag Editor color dyes, selected state, and corrected heraldic horse silhouette.
- Clan selected tab, War Room Rally, Rewards, Members, and Disband Clan action.
- Skill preset assignment message and Save Current Build action.
- Music / Effects, Notifications, and Privacy settings.
- Battle Report Victory, Scout, and Defeat badges; Location alignment; approved Report artwork on its corrected button surface.
- City List Owned Across Maps summary and Outgoing / Incoming HUD states.

## Comparison method

The **Before** column recreates the observed contrast failures: selected burgundy tabs with brown text, dark information panels with dark wording, flag dyes overwritten by a generic parchment button face, and identical brown operation states.

The **After** column uses the centralized production tokens from `ui-contrast-correction.css`. This allows the same fixture to expose token or cascade regressions without authenticating into a live account.

## Responsive test matrix

| Viewport | Result | Checks |
| --- | --- | --- |
| Desktop 1440×900 | Pass | 7 sections rendered; no horizontal overflow; no failed images; Location and Report icons centered |
| Android landscape 844×390 | Pass | No page/component horizontal overflow; no failed images; minimum fixture control height 34px; selected/unselected tabs remain readable |

Captures are stored in `screenshots/` and embedded at the end of `index.html`:

- `desktop-flag-clan-skills.jpg` — 1440×900
- `desktop-settings-reports-hud.jpg` — 1440×900
- `android-landscape-tabs.jpg` — 844×390

The responsive browser override uses those exact viewport sizes. The in-app browser capture API returns the content raster after its scrollbar and viewport chrome are excluded: 1425×891 for desktop and 829×383 for Android landscape.

## Manual review standard

Each corrected label must be readable immediately without concentrating. Selected state continues to use wording, position, border, and surface treatment in addition to color. Victory, Scout, Defeat, Outgoing, and Incoming retain their explicit wording and existing iconography.

## Guardrails

- Existing Cinzel, Cinzel Decorative, and IM Fell English fonts are preserved.
- The approved Report artwork is embedded from the production asset and is not recreated.
- Only the horse heraldry symbol is changed.
- No maps, city art, officers, items, gameplay, Firebase, authentication, multiplayer, or server behavior is included in this pass.

## Validation results

- Pass: `validate-ui-contrast-correction.js`, including 4.5:1 representative state pairs, stylesheet order, release delivery, and screenshot dimensions.
- Pass: UI readability, manuscript prototype, asset/performance budgets, random flag, Clan, Rally, War Room, skill preset, audio contract, Report, City List, leaderboard, and Seasonal Achievement validators.
- Pass: project lint, including `game.js` syntax and ESLint.
- Pass: real game shell loaded the correction stylesheet at 1440×900 and 844×390 with no horizontal overflow or failed critical images.
- Environment limitation: the full `pnpm test` chain reaches and passes validators through economy balance, then the open game editor's current `economy-config.js` state stops `audit-season-balance.js` because `rewardConfig` is absent. The same in-progress editor state prevents the daily-login validator from finding its schedule. These unrelated user-owned edits were preserved rather than overwritten.
