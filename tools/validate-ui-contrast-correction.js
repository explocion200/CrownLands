const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("ui-contrast-correction.css");
const baseCss = read("styles.css");
const paletteCss = read("crownlands-palette.css");
const profileCss = read("profile-theme.css");
const index = read("index.html");
const flagRuntimeSprite = read("assets/flag-symbols/runtime.svg");
const game = read("game.js");
const serviceWorker = read("service-worker.js");
const uiLayoutRuntime = read("ui-layout-runtime.js");
const productionBuilder = read("tools/build-production-client.js");
const releaseManifest = read("tools/generate-release-manifest.js");
const productionValidator = read("tools/validate-production-artifact.js");
const assetBudget = read("tools/validate-asset-performance-budgets.js");
const gallery = read("docs/visual-qa/ui-contrast-correction/index.html");
const notes = read("docs/visual-qa/ui-contrast-correction/QA_NOTES.md");
const readBytes = relativePath => fs.readFileSync(path.join(root, relativePath));

function jpegDimensions(bytes) {
  assert.equal(bytes[0], 0xff, "Screenshot must be a JPEG image.");
  assert.equal(bytes[1], 0xd8, "Screenshot must be a JPEG image.");
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("Could not read JPEG dimensions.");
}

assert.ok(Buffer.byteLength(css) <= 64 * 1024, "The UI contrast correction must stay within its 64 KiB budget.");
const braces = [...css].reduce((state, character) => {
  if (character === "{") state.open += 1;
  if (character === "}") state.close += 1;
  return state;
}, { open: 0, close: 0 });
assert.equal(braces.open, braces.close, "ui-contrast-correction.css has unbalanced braces.");
assert.doesNotMatch(css, /font-family\s*:|@font-face|@import/i, "The correction pass must preserve the approved font system.");
assert.doesNotMatch(css, /url\s*\(/i, "The correction pass must not replace approved artwork.");

for (const token of [
  "--cl-tab-selected-bg",
  "--cl-tab-selected-text",
  "--cl-tab-unselected-bg",
  "--cl-tab-unselected-text",
  "--cl-danger-bg",
  "--cl-state-outgoing: #153f5d",
  "--cl-state-incoming: #681e25",
  "--cl-state-victory: #355e7a",
  "--cl-state-scout: #b88a32",
  "--cl-state-defeat: #8a3333",
  "--cl-dark-surface-text",
  "--cl-paper-surface-text",
]) assert.ok(css.includes(token), `Missing centralized contrast token ${token}.`);

for (const selector of [
  ".profile-tabs",
  ".clan-section-nav",
  ".skill-preset-tabs",
  ".push-alerts-toggle",
  ".battle-report-filters",
  ".seasonal-achievement-filters",
  ".camp-info-tab",
  ".leaderboard-tab",
  ".daily-reward-tabs",
  ".clan-rallies-panel",
  ".clan-rewards-panel",
  ".clan-member-row",
  ".clan-leave.danger-action",
  ".skill-preset-points",
  "[data-save-skill-preset]",
  ".audio-settings-section",
  ".notification-settings-section",
  ".privacy-settings-link",
  ".battle-report-locate-btn",
  ".report-nav-btn",
  ".city-list-summary",
  ".outgoing-attack-btn",
  ".incoming-attack-btn",
]) assert.ok(css.includes(selector), `Missing contrast coverage for ${selector}.`);

assert.match(
  css,
  /\.effect-status-badge,[\s\S]*?width:\s*var\(--effect-badge-size\);[\s\S]*?height:\s*var\(--effect-badge-size\);[\s\S]*?background:\s*transparent;/,
  "Active timed items must render as compact square artwork instead of side panels."
);
assert.match(
  css,
  /\.effect-status-badge strong,[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?bottom:\s*7px;[\s\S]*?transform:\s*translateX\(-50%\);/,
  "Active timed-item countdowns must remain overlaid on their artwork."
);
assert.match(css, /\.profile-screen \.profile-tabs button,[\s\S]*?var\(--cl-tab-unselected-bg\)/, "Profile tabs do not share the achievement-tab surface treatment.");
assert.match(css, /\.profile-screen \.profile-tabs button\.active,[\s\S]*?var\(--cl-tab-selected-bg\)/, "The active Profile tab is not visually distinct.");
assert.match(css, /\.audio-channel-card \.audio-channel-glyph\s*\{[\s\S]*?color:\s*#fff !important/, "Music and Effects channel glyphs are not white.");
assert.match(css, /\.audio-channel-card \.audio-channel-glyph \.cl-icon\s*\{[\s\S]*?color:\s*#fff !important;[\s\S]*?fill:\s*currentColor !important;/, "Music and Effects SVG artwork does not inherit the white icon color.");
assert.match(css, /\.audio-channel-card \.audio-channel-header\s*\{[\s\S]*?--audio-toggle-width:\s*58px;[\s\S]*?grid-template-columns:[^;]*var\(--audio-toggle-width\);/, "Audio setting rows do not reserve the full On/Off control width.");
assert.match(css, /\.audio-channel-card \.audio-mute-button\s*\{[\s\S]*?width:\s*var\(--audio-toggle-width\);[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;/, "Audio On/Off controls can overflow their reserved grid column.");
assert.match(css, /\.audio-channel-card \.audio-mute-button \[data-audio-mute-icon\] \.cl-icon\s*\{[\s\S]*?color:\s*#fff !important;[\s\S]*?fill:\s*currentColor !important;/, "Audio On/Off SVG artwork is not white.");
assert.match(css, /\.audio-channel-card \.audio-mute-button::after[\s\S]*?content:\s*"On"/, "Audio controls do not expose a visible On state.");
assert.match(css, /\.audio-channel-card \.audio-mute-button\[aria-pressed="true"\]::after[\s\S]*?content:\s*"Off"/, "Audio controls do not expose a visible Off state.");
assert.match(css, /\.clan-member-selection \.clan-member-profile-link\s*\{[\s\S]*?color:\s*#fff8ea !important;[\s\S]*?background:\s*linear-gradient\(180deg, #315f78, #183b50\) !important;/, "The selected clan member's View Profile action is not high contrast.");
assert.match(css, /\.clan-member-selection \.clan-member-profile-link:hover,[\s\S]*?\.clan-member-selection \.clan-member-profile-link:focus-visible[\s\S]*?color:\s*#fff !important;/, "The clan View Profile action loses contrast while hovered or focused.");
assert.match(css, /\.city-list-modal \.city-list-toolbar button\s*\{[\s\S]*?color:\s*#fff8ea !important;[\s\S]*?background:\s*linear-gradient\(180deg, #4d5961, #272d31\) !important;/, "City-list sort buttons do not have a readable default treatment.");
assert.match(css, /\.city-list-modal \.city-list-toolbar button :is\(span, small, \.cl-icon\)[\s\S]*?color:\s*inherit !important;/, "City-list sort labels and icons can still inherit paper-brown text.");
assert.match(css, /\.city-list-modal \.city-list-toolbar button\.active,[\s\S]*?button\[aria-pressed="true"\][\s\S]*?color:\s*#fff !important;[\s\S]*?background:\s*linear-gradient\(180deg, #834149, #57262c\) !important;/, "The active city-list sort button is not high contrast.");
assert.match(css, /\.gold-camp-info-panel \.camp-public-status > div\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f5e9cd, #dec79a\) !important;/, "Camp controller and status cards still combine low-contrast text and backgrounds.");
assert.match(css, /\.gold-camp-info-panel \.camp-stats-source\s*\{[\s\S]*?color:\s*#473728 !important;[\s\S]*?linear-gradient\(180deg, #eadcba, #cbb585\) !important;/, "The camp scout-source caption is not readable against the modal background.");
assert.match(css, /\.gold-camp-info-panel \.gold-camp-info-grid > div\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f6ead0, #dfc99e\) !important;/, "Camp defense statistics are not readable on their cards.");
assert.match(css, /\.gold-camp-info-panel \.camp-stats-locked\s*\{[\s\S]*?color:\s*#3f3429 !important;[\s\S]*?linear-gradient\(180deg, #eadcba, #cbb585\) !important;/, "Unscouted camp text is not readable.");
assert.match(css, /\.gold-camp-info-panel \.camp-reward-overview > div\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f5e8c8, #dcc394\) !important;/, "Gold, Warband, or Relic reward summaries are not readable.");
assert.match(css, /\.gold-camp-info-panel \.camp-reward-row\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f4e8cb, #ddc79c\) !important;/, "Camp reward ladder rows still combine low-contrast text and backgrounds.");
assert.match(css, /\.gold-camp-info-panel \.relic-drop-row\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f3e7ca, #dbc599\) !important;/, "Relic Camp drop chances are not readable.");
assert.match(css, /\.gold-camp-info-panel \.relic-reward-heading\s*\{[\s\S]*?color:\s*#fff0bd !important;/, "Relic Camp section headings disappear against the navy modal background.");
assert.match(css, /\.gold-camp-info-panel \.camp-reward-reset\s*\{[\s\S]*?color:\s*#f5e6c3 !important;/, "Camp reward reset notes disappear against the navy modal background.");
assert.match(css, /\.gold-camp-info-panel \.camp-reward-loading,[\s\S]*?\.camp-reward-loading\.error[\s\S]*?color:\s*#3f2523 !important;[\s\S]*?linear-gradient\(180deg, #eadcba, #cbb585\) !important;/, "Camp loading and unavailable states are not readable.");
assert.match(css, /\.gold-camp-info-panel \.holding-reinforcement-panel\s*\{[\s\S]*?color:\s*#fff8e8 !important;[\s\S]*?linear-gradient\(180deg, #295f54, #153c35\) !important;/, "Camp reinforcement information is not readable.");
assert.match(css, /\.gold-camp-info-panel \.deed-camp-history-row\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f4e8c9, #dbc395\) !important;/, "Deed Camp reward rows still combine dark surfaces with unreadable text.");
assert.match(css, /\.gold-camp-info-panel \.deed-history-copy small\s*\{[\s\S]*?color:\s*#574938 !important;[\s\S]*?opacity:\s*1;/, "Deed Camp recipient and award-time text is not readable.");
assert.match(css, /\.gold-camp-info-panel \.deed-history-player-link\s*\{[\s\S]*?color:\s*#155b7e !important;[\s\S]*?background:\s*transparent !important;/, "Deed Camp winner profile links lack a readable treatment.");
assert.match(css, /\.gold-camp-info-panel \.deed-history-locate\s*\{[\s\S]*?color:\s*#fff8e8 !important;[\s\S]*?background:\s*linear-gradient\(180deg, #315f78, #183b50\) !important;/, "Deed Camp location controls are not high contrast.");
assert.match(css, /\.gold-camp-info-panel #campRulesPanel \.gold-camp-description\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f7edda, #e2cda4\) !important;/, "Camp help cards still combine brown text with a brown surface.");
assert.match(css, /\.gold-camp-info-panel #campRulesPanel \.gold-camp-description > strong\s*\{[\s\S]*?color:\s*#52232a !important;[\s\S]*?text-shadow:\s*none !important;/, "Camp help headings are not clearly readable.");
assert.match(css, /\.gold-camp-info-panel #campRulesPanel \.gold-camp-description p\s*\{[\s\S]*?color:\s*#352b21 !important;[\s\S]*?opacity:\s*1;[\s\S]*?text-shadow:\s*none !important;/, "Camp help paragraphs can still blend into their background.");
assert.match(baseCss, /:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.modal-city-stats :is\(\.stat-wide, \.stat-chip\)\s*\{[\s\S]*?color:\s*#fff8e8 !important;[\s\S]*?background:\s*linear-gradient\(180deg, #173f5e, #0b263d\) !important;/, "Stronghold and Citadel stat cards still combine brown text with brown surfaces.");
assert.match(baseCss, /:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.modal-city-stats :is\(\.stat-wide, \.stat-chip\) > span\s*\{[\s\S]*?color:\s*#b9d8e8 !important;/, "Stronghold and Citadel stat labels are not readable on the new objective surface.");
assert.match(baseCss, /:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.modal-city-stats :is\(\.stat-wide, \.stat-chip\) > strong\s*\{[\s\S]*?color:\s*#fff8e8 !important;/, "Stronghold and Citadel values are not explicitly readable.");
assert.match(baseCss, /:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.citadel-info-tabs \.camp-info-tab:not\(\.active\):not\(\[aria-selected="true"\]\)[\s\S]*?color:\s*#eef8fd !important;[\s\S]*?background:\s*linear-gradient\(180deg, #315f78, #183b50\) !important;/, "Stronghold and Citadel inactive tabs still use low-contrast brown styling.");
assert.match(baseCss, /:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.citadel-reign-heading\s*\{[\s\S]*?color:\s*#c6ddea !important;[\s\S]*?background:\s*linear-gradient\(180deg, #173f5e, #0b263d\) !important;/, "The Citadel and Stronghold ledger header is not readable on its surrounding paper surface.");
assert.match(baseCss, /:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.citadel-reign-row\.current[\s\S]*?background:\s*linear-gradient\(180deg, #285c79, #153a53\) !important;/, "The current Citadel or Stronghold ledger entry still uses a brown surface.");
assert.match(baseCss, /@media \(max-width: 540px\)[\s\S]*?:is\(\.stronghold-legacy-info-panel, \.crown-citadel-info-panel\) \.modal-city-stats \.stat-wide[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/, "Wide Stronghold and Citadel stats do not stack on narrow mobile screens.");
assert.match(css, /\.realm-activity-card,[\s\S]*?\.realm-activity-card\.citadel[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f5e8ca, #dcc391\) !important;/, "Realm Activity still uses a dark surface behind brown text.");
assert.match(css, /\.realm-activity-card \.realm-activity-proclamation p,[\s\S]*?\.realm-activity-card\.citadel \.realm-activity-proclamation p[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?text-shadow:\s*none !important;/, "Realm Activity proclamation copy is not readable on its parchment surface.");
assert.match(css, /\.realm-activity-card \.realm-activity-proclamation \.player-name-link,[\s\S]*?color:\s*#175776 !important;/, "Realm Activity player links are not visibly distinguished.");
assert.match(css, /\.realm-activity-card \.realm-activity-location-btn,[\s\S]*?color:\s*#fff8e8 !important;[\s\S]*?background:\s*linear-gradient\(180deg, #315f78, #183b50\) !important;/, "Realm Activity's location action is not high contrast.");
assert.match(css, /\.battle-report-card \.battle-report-city>span\{color:#fff8ea!important\}/, "Battle report city-level badges can still inherit brown lettering.");
assert.match(baseCss, /\.battle-report-card\.scout\s*\{[\s\S]*?border-left-color:\s*#355e7a !important;[\s\S]*?linear-gradient\(180deg, #f5e7c8, #d8c18f\) !important;/, "Scout report cards do not share the attack-report parchment and blue accent theme.");
assert.match(baseCss, /\.battle-report-card\.scout \.battle-report-city > span\s*\{[\s\S]*?background:\s*linear-gradient\(#2376c8, #145391\) !important;/, "Scout report city-level badges do not use the standard attack blue.");
assert.match(css, /\.battle-report-card\.scout \.battle-report-result\s*\{[\s\S]*?color:\s*var\(--cl-contrast-ivory-bright\);[\s\S]*?background:\s*var\(--cl-state-victory\) !important;/, "Scout report result badges do not use the readable attack-report blue theme.");
assert.doesNotMatch(css, /\.modal\.scout-report-modal[\s\S]{0,500}#(?:123b56|071b2a|0a2b40|0b3147)/i, "The contrast layer still forces Scout reports into the retired navy theme.");
assert.doesNotMatch(profileCss, /\.modal\.scout-report-modal \.detailed-scout-report[\s\S]{0,250}#(?:123b56|071b2a)/i, "The Profile theme still overrides Scout reports with a navy surface.");
assert.match(paletteCss, /Scout intelligence uses the shared parchment report family[\s\S]*?var\(--cl-card-bg\) !important;/, "Scout reports are not owned by the shared parchment report palette.");
assert.match(paletteCss, /\.scout-report-mark strong,[\s\S]*?\.scout-report-section h3,[\s\S]*?color:\s*var\(--cl-burgundy\) !important;/, "Scout headings do not use the report family's burgundy hierarchy.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome,[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/, "Detailed battle outcomes still paint the full center column red.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome > span\s*\{[\s\S]*?color:\s*#fffdf5 !important;[\s\S]*?border-radius:\s*999px;[\s\S]*?background:\s*linear-gradient\(180deg, #58735f, #2f4939\) !important;/, "Victory does not use a compact readable outcome badge.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome\.defeat > span\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, #62504d, #382d2c\) !important;/, "Defeat still uses the harsh red outcome block.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome > strong,[\s\S]*?color:\s*#3e3328 !important;[\s\S]*?text-shadow:\s*none !important;/, "The detailed outcome explanation is unreadable after removing the center background.");
assert.match(css, /\.leaderboard-modal \.leaderboard-toolbar strong\s*\{[\s\S]*?color:\s*#1c4055 !important;[\s\S]*?text-shadow:\s*none !important;/, "Leaderboard section headings still use gold shadowed text.");
assert.match(css, /\.leaderboard-modal \.modal-card #modalBody\s*\{[\s\S]*?overflow-y:\s*auto !important;/, "Leaderboard rows can still be clipped by a leaked modal overflow rule.");
assert.match(css, /\.leaderboard-modal \.leaderboard-row,[\s\S]*?border-left:\s*4px solid #8eb9cf !important;[\s\S]*?background:\s*linear-gradient\(180deg, #31566d, #1b394c\) !important;/, "Leaderboard rows do not use the high-contrast slate treatment.");
assert.match(css, /\.leaderboard-modal \.leaderboard-row :is\(\.player-name-link, \.clan-leaderboard-name\)[\s\S]*?color:\s*#fff8e8 !important;/, "Player and clan leaderboard names are not explicitly readable.");
assert.match(css, /\.leaderboard-modal \.leaderboard-row :is\([\s\S]*?\.player-name-link,[\s\S]*?\.clan-leaderboard-name,[\s\S]*?\.leaderboard-clan-link,[\s\S]*?\.clan-leaderboard-tag[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/, "Leaderboard name links still inherit a light button face behind their ivory text.");
assert.match(css, /\.leaderboard-modal \.leaderboard-row :is\(\.leaderboard-ruler small, \.leaderboard-power small\)[\s\S]*?color:\s*#d3e3eb !important;/, "Leaderboard supporting text can still render brown on slate rows.");
assert.match(css, /\.profile-screen \.kingdom-stat \.profile-production-bonus[\s\S]*?color:\s*#9a6714 !important/, "Kingdom production bonuses are not gold-highlighted.");
assert.match(css, /\.profile-screen \.flag-option-grid button[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/, "Player flag pattern names can still overflow their buttons.");
assert.match(css, /\.clan-shield-editor \.clan-shield-choice-grid button[\s\S]*?color:\s*#f8e9c4 !important/, "Clan shield choices remain low contrast.");
assert.match(css, /\.clan-shield-editor \.clan-shield-choice-grid button small[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/, "Clan shield labels can still overflow their choices.");
assert.match(game, /data-skill-preset-slot="\$\{slot\.slot\}"[\s\S]{0,500}aria-disabled="\$\{!slotUnlocked\}"[\s\S]{0,100}disabled/, "Locked skill preset tabs are not disabled.");
assert.match(game, /if \(!requestedSlot \|\| !isSkillPresetUnlocked\(requestedSlot, state\?\.character\)\)/, "Locked preset click handling lacks an interaction guard.");
assert.match(css, /\.profile-screen \.skill-preset-tabs button\.locked[\s\S]*?cursor:\s*not-allowed/, "Locked presets do not have a readable disabled treatment.");
assert.match(css, /\.profile-screen \.skill-preset-tabs button\.active\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, #7d3941, var\(--cl-tab-selected-bg\)\)/, "The currently applied skill preset must retain its red active treatment.");
assert.match(css, /\.profile-screen \.skill-preset-tabs button\.selected:not\(\.active\),[\s\S]*?button\[aria-selected="true"\]:not\(\.active\)[\s\S]*?background:\s*linear-gradient\(180deg, #285f86, #123c5c\)/, "A previewed non-active skill preset must use a distinct blue treatment.");
assert.match(css, /\.toast\.map-location-announcement\s*\{[\s\S]*?top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 64px\);[\s\S]*?bottom:\s*auto !important;[\s\S]*?grid-template-columns:\s*44px minmax\(0, 1fr\);/, "The map location announcement is not anchored below the top safe area in a compact banner.");
assert.match(css, /\.toast\.map-location-announcement\.visible[\s\S]*?translate3d\(-50%, 0, 0\)[\s\S]*?\.map-location-announcement-mark[\s\S]*?\.map-location-announcement-copy strong/, "The map location announcement is missing its entrance state or heraldic presentation.");
assert.match(game, /class="battle-report-detail-btn"[\s\S]{0,220}aria-label="View full report" title="View full report"/, "The full-report action lacks a clear label.");
assert.match(game, /aria-label="View full report" title="View full report">\$\{renderCrownlandsIcon\("forward"\)\}/, "The full-report action does not use the visible forward icon.");
assert.match(css, /\.battle-report-card \.battle-report-detail-btn[\s\S]*?background:\s*linear-gradient\(180deg, #fff0c7, #d5ae67\) !important/, "The full-report action is not visibly styled.");

assert.match(baseCss, /\.flag-swatch-grid \.flag-color-swatch[\s\S]*?background-color:\s*var\(--flag-swatch\)/, "Flag swatches do not paint their actual heraldic colors.");
assert.match(profileCss, /:not\(\.flag-color-swatch\):not\(\[data-flag-color\]\)/, "The Profile button theme can still overwrite inactive flag swatches.");
assert.match(paletteCss, /:not\(\.flag-color-swatch\):not\(\[data-flag-color\]\)/, "The Crownlands palette can still overwrite inactive flag swatches.");
assert.match(game, /data-flag-color[\s\S]{0,400}aria-pressed="\$\{selected\}"/, "Flag swatches must expose their selected state.");
assert.match(flagRuntimeSprite, /id="cl-icon-flag-horse"[\s\S]*?<path\b[^>]*\bd="[^"]+"/, "The dedicated heraldic horse charge is missing from the runtime sprite.");
assert.match(index, /hud-report-192x192-21644b7390fb\.webp/, "The approved Report artwork changed.");
assert.match(index, /id="logBtn"[\s\S]{0,520}class="nav-btn-heading">Reports<\/strong>[\s\S]{0,160}nav-btn-timer-placeholder/, "Reports is missing the aligned heading and reserved timer row.");
assert.match(index, /id="outgoingAttackBtn"[\s\S]{0,260}class="nav-btn-heading">[\s\S]{0,100}id="outgoingAttackCount"[\s\S]{0,100}Outgoing<\/strong>[\s\S]{0,160}id="outgoingAttackTime"/, "Troop Movements is missing its aligned count, label, and timer treatment.");
assert.match(index, /id="incomingAttackBtn"[\s\S]{0,260}class="nav-btn-heading">[\s\S]{0,100}id="incomingAttackCount"[\s\S]{0,100}Incoming<\/strong>[\s\S]{0,160}id="incomingAttackTime"/, "Incoming Attacks is missing its aligned count, label, and timer treatment.");
assert.match(css, /--cl-operation-button-width:\s*clamp\(78px,[\s\S]{0,120}98px\)/, "The shared bottom-nav button width is not responsive.");
assert.match(css, /\.bottom-nav \{[\s\S]*?--cl-operation-stack-gap:\s*9px;[\s\S]*?display:\s*flex !important;[\s\S]*?flex-direction:\s*column;[\s\S]*?gap:\s*var\(--cl-operation-stack-gap\) !important;[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/, "The operation controls are not a compact, transparent vertical stack.");
assert.match(css, /\.bottom-nav \.incoming-attack-btn\s*\{\s*order:\s*1;[\s\S]*?\.bottom-nav \.outgoing-attack-btn\s*\{\s*order:\s*2;[\s\S]*?\.bottom-nav \.report-nav-btn\s*\{\s*order:\s*3;/, "The operation controls no longer enforce Incoming, Outgoing, Reports order.");
assert.doesNotMatch(css, /\.bottom-nav:has\(\.(?:incoming|outgoing)-attack-btn:not\(\[hidden\]\)\)[\s\S]{0,180}?width:/, "Operation visibility still expands the Reports group horizontally.");
assert.match(css, /\.bottom-nav \.report-nav-btn,\s*\.outgoing-attack-btn,\s*\.incoming-attack-btn \{[\s\S]*?width:\s*var\(--cl-operation-button-width\);[\s\S]*?height:\s*46px;[\s\S]*?padding:\s*3px 5px;[\s\S]*?border-width:\s*3px !important;/, "The three operation controls do not share one frame and sizing contract after runtime repositioning.");
assert.match(css, /grid-template-rows:\s*22px 10px 9px;[\s\S]*?\.bottom-nav \.nav-btn-heading[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/, "The operation labels and timers do not share aligned grid rows.");
assert.match(css, /\.bottom-nav \.report-nav-btn\[hidden\],\s*\.outgoing-attack-btn\[hidden\],\s*\.incoming-attack-btn\[hidden\] \{\s*display:\s*none !important;/, "Shared operation-control styles can override dynamic hidden states.");
assert.match(css, /\.bottom-nav \.report-nav-btn \{[\s\S]*?border-color:\s*#4a2c1a !important;[\s\S]*?var\(--cl-contrast-paper-light\), var\(--cl-contrast-paper\)/, "Reports is missing its dark-brown frame or beige inner surface.");
assert.match(css, /\.bottom-nav \.report-nav-btn :is\(\.nav-btn-heading, \.nav-btn-label\) \{[\s\S]*?color:\s*#15100b !important;/, "The Reports label is not explicitly rendered in black ink.");
assert.match(css, /--cl-state-outgoing:\s*#153f5d;[\s\S]{0,100}--cl-state-incoming:\s*#681e25;/, "Operation alert surfaces are not using the high-contrast blue and red palette.");
assert.match(css, /\.outgoing-attack-btn,[\s\S]{0,240}border-color:\s*#8ed8ff !important;[\s\S]{0,120}background:\s*var\(--cl-state-outgoing\) !important;/, "Troop Movements is missing its bright blue frame or dark blue surface.");
assert.match(css, /\.incoming-attack-btn,[\s\S]{0,240}border-color:\s*#ffb49d !important;[\s\S]{0,120}background:\s*var\(--cl-state-incoming\) !important;/, "Incoming Attacks is missing its bright red frame or dark red surface.");
assert.match(css, /\.bottom-nav :is\(\.outgoing-attack-btn, \.incoming-attack-btn\) :is\(\.cl-icon, span, strong, small\)[\s\S]{0,180}color:\s*#fffdf2 !important;[\s\S]{0,180}text-shadow:\s*0 1px 2px #000/, "Operation alert text is not forced above the global muted-text rule with the high-contrast ivory treatment.");
assert.match(uiLayoutRuntime, /function restoreOperationAlertStack\(\)[\s\S]*?nav\.appendChild\(incoming\);[\s\S]*?nav\.appendChild\(outgoing\);[\s\S]*?nav\.appendChild\(reports\);/, "The layout runtime does not restore Incoming and Outgoing above Reports in deterministic order.");
assert.match(uiLayoutRuntime, /restoreOperationAlertStack\(\);[\s\S]{0,400}?id === "outgoingMarch" \|\| id === "incomingMarch"\) return;/, "The layout runtime can still detach operation alerts into independent HUD positions.");
assert.match(game, /incomingAttackBtn\.hidden\s*=\s*incoming\.length === 0;/, "Incoming Attacks no longer preserves dynamic visibility.");
assert.match(game, /outgoingAttackBtn\.hidden\s*=\s*total === 0;/, "Troop Movements no longer preserves dynamic visibility.");

const manuscriptIndex = index.indexOf("manuscript-prototype.css");
const correctionIndex = index.indexOf("ui-contrast-correction.css?v=20260819-player-flags-v2-r1");
assert.ok(manuscriptIndex >= 0 && correctionIndex > manuscriptIndex, "The contrast correction must load after every existing stylesheet.");
for (const source of [serviceWorker, productionBuilder, releaseManifest, productionValidator, assetBudget]) {
  assert.ok(source.includes("ui-contrast-correction.css"), "The contrast correction is missing from release packaging or validation.");
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16));
  return .2126 * channel(channels[0]) + .7152 * channel(channels[1]) + .0722 * channel(channels[2]);
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + .05) / (values[1] + .05);
}

for (const [label, foreground, background] of [
  ["selected tab", "#f4e8ce", "#6e2f35"],
  ["unselected tab", "#2b2118", "#ead8b3"],
  ["danger action", "#fff8ea", "#742a2e"],
  ["outgoing alert", "#fffdf2", "#153f5d"],
  ["incoming alert", "#fffdf2", "#681e25"],
  ["scout", "#261b0d", "#b88a32"],
  ["camp status supporting text", "#594936", "#dec79a"],
  ["camp defense value", "#41262a", "#dfc99e"],
  ["camp reward value", "#52232a", "#dcc394"],
  ["claimed camp reward", "#3f2523", "#bdd2b3"],
  ["next camp reward", "#3f2523", "#dcbf77"],
  ["Relic Camp supporting text", "#574938", "#dbc599"],
  ["camp standalone note", "#f5e6c3", "#173e57"],
  ["camp reinforcement note", "#d5e9dd", "#153c35"],
  ["camp rules paragraph", "#352b21", "#e2cda4"],
  ["camp map label", "#ffe29a", "#071b30"],
  ["camp active timer", "#fff4c7", "#691f1b"],
  ["Stronghold and Citadel label", "#b9d8e8", "#0b263d"],
  ["Stronghold and Citadel value", "#fff8e8", "#0b263d"],
  ["Stronghold and Citadel inactive tab", "#eef8fd", "#183b50"],
  ["Stronghold and Citadel active tab", "#261a0d", "#d9a83e"],
  ["scout report primary text", "#fff8e8", "#071b2a"],
  ["scout report supporting text", "#c5dfeb", "#0a2b40"],
  ["scout report label", "#a9d4e8", "#0a2b40"],
]) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)}:1 is below 4.5:1.`);
}

for (const required of [
  "Global tab system",
  "Flag Editor",
  "War Room",
  "Skills preset",
  "Settings",
  "Battle Reports",
  "City List and operation alerts",
  "Desktop 1440×900",
  "Android landscape 844×390",
]) {
  assert.ok(gallery.includes(required) || notes.includes(required), `QA coverage is missing ${required}.`);
}
assert.match(gallery, /qa-before/);
assert.match(gallery, /qa-after/);

for (const [file, width, height] of [
  ["desktop-flag-clan-skills.jpg", 1425, 891],
  ["desktop-settings-reports-hud.jpg", 1425, 891],
  ["android-landscape-tabs.jpg", 829, 383],
]) {
  const relativePath = `docs/visual-qa/ui-contrast-correction/screenshots/${file}`;
  const bytes = readBytes(relativePath);
  const dimensions = jpegDimensions(bytes);
  assert.equal(dimensions.width, width, `${file} has the wrong width.`);
  assert.equal(dimensions.height, height, `${file} has the wrong height.`);
  assert.ok(gallery.includes(`screenshots/${file}`), `${file} is not embedded in the QA gallery.`);
}

console.log("UI contrast correction validated: centralized states, complete screen coverage, release delivery, QA fixture, and WCAG contrast pairs.");
