# Player Profile ledger

Status: approved September 13, 2026 and integrated with the existing Profile screen. Gameplay rules, calculations, saved heraldry, and backend APIs are unchanged. Deployment status is established by the release receipt, not this document.

Open `/docs/visual-qa/player-profile-ledger/index.html?viewport=desktop` on the repository preview server. The controls render desktop (1440 × 900), mobile landscape (844 × 390), and small landscape (568 × 320). There is no portrait design.

## Design

Three columns keep the ruler's cloth banner and Hero progression on the left, the six kingdom statistics in the center, and seasonal Achievements on the right. The parchment, olive, brass, and burgundy treatments follow the approved reward panels. The current gold, troops, city, crown, and Achievements artwork is reused. Inner Castle and View Achievements have dedicated bottom actions. Main panel height is capped at 700 px on desktop and fits the available landscape viewport.

Production displays preserve both the total and the included bonus. A detail dialog explains base + bonus = total. This is presentation only; no new production source or calculation is introduced. The flag and clan shield are illustrative examples of the framing; the integrated screen uses the existing flag and clan renderers and preserves saved colors, symbols, and patterns.

## Preserved information and actions

Source: `index.html` Profile view and `game.js` functions `renderProfileScreen`, `renderProfileProductionStat`, and `renderProfileClanAffiliation` at base commit `bc4cb66066766c94deb880b61dcef70e76cdfda4`.

- Ruler name/public-profile link, name editing (18-character limit), flag editing, Hero level, current/required XP and XP bar.
- Clan affiliation/public-clan link when the ruler has a clan.
- King Power, Cities, Gold, Troops, Gold production total/bonus, and Troops production total/bonus.
- Inner Castle entry using the existing owned-city selection behavior.
- Seasonal Achievements complete/claimed out of 40, remaining time, and View Achievements with the ready count.
- Profile, Clan, Skills, Settings navigation and Close.

The current `renderProfileScreen` behavior displays zero counts while achievement status is loading and disables the Achievements action when the capability is unavailable. The draft represents those states without inventing stored progress. Existing seasonal reset rules remain unchanged. Skills/presets, Clan, Settings, public profiles, and the full flag editor will retain their current screens; they are represented here by explanatory local action previews.

## Review examples

Use Established kingdom, Large numbers & long names, New ruler/no clan, All rewards collected, Achievements loading, and Achievements unavailable. Values are deliberately synthetic layout examples, not balance calculations or real player data. Name and cloth-color changes exist only in memory. Reset example restores the chosen scenario. Open Achievements draft navigates within the preview iframe; Reset example or browser reload returns to Profile.

## Integrated preview

Run `node tools/prepare-player-profile-preview.js` with the local benchmark server on port 61703, then open the URL it prints. This mounts the actual game against the benchmark mock services. Optional samples: `?sample=large`, `new`, `loading`, or `unavailable`. The fixture is excluded from production packaging.

The production presentation is in `player-profile-ui.css` and `player-profile-ui.js`. Existing element IDs and mutation handlers remain in `game.js`; the helper updates presentation and a read-only production breakdown. Other Profile tabs and the flag editor use their current styles. New runtime files are packaged and fingerprinted with the client. The Profile helper and stylesheet have a combined 44 KiB cap.
