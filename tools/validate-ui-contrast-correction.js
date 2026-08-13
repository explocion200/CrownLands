const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("ui-contrast-correction.css");
const index = read("index.html");
const game = read("game.js");
const serviceWorker = read("service-worker.js");
const uiLayoutConfig = read("ui-layout-config.js");
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
  "--cl-state-outgoing: #355e7a",
  "--cl-state-incoming: #8a3333",
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
  ".flag-swatch-grid",
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
assert.match(css, /\.realm-activity-card,[\s\S]*?\.realm-activity-card\.citadel[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?linear-gradient\(180deg, #f5e8ca, #dcc391\) !important;/, "Realm Activity still uses a dark surface behind brown text.");
assert.match(css, /\.realm-activity-card \.realm-activity-proclamation p,[\s\S]*?\.realm-activity-card\.citadel \.realm-activity-proclamation p[\s\S]*?color:\s*var\(--cl-contrast-ink\) !important;[\s\S]*?text-shadow:\s*none !important;/, "Realm Activity proclamation copy is not readable on its parchment surface.");
assert.match(css, /\.realm-activity-card \.realm-activity-proclamation \.player-name-link,[\s\S]*?color:\s*#175776 !important;/, "Realm Activity player links are not visibly distinguished.");
assert.match(css, /\.realm-activity-card \.realm-activity-location-btn,[\s\S]*?color:\s*#fff8e8 !important;[\s\S]*?background:\s*linear-gradient\(180deg, #315f78, #183b50\) !important;/, "Realm Activity's location action is not high contrast.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome,[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/, "Detailed battle outcomes still paint the full center column red.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome > span\s*\{[\s\S]*?color:\s*#fffdf5 !important;[\s\S]*?border-radius:\s*999px;[\s\S]*?background:\s*linear-gradient\(180deg, #58735f, #2f4939\) !important;/, "Victory does not use a compact readable outcome badge.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome\.defeat > span\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, #62504d, #382d2c\) !important;/, "Defeat still uses the harsh red outcome block.");
assert.match(css, /\.battle-report-modal \.battle-visual-outcome > strong,[\s\S]*?color:\s*#3e3328 !important;[\s\S]*?text-shadow:\s*none !important;/, "The detailed outcome explanation is unreadable after removing the center background.");
assert.match(css, /\.leaderboard-modal \.leaderboard-toolbar strong\s*\{[\s\S]*?color:\s*#1c4055 !important;[\s\S]*?text-shadow:\s*none !important;/, "Leaderboard section headings still use gold shadowed text.");
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

assert.match(css, /\.profile-screen \.flag-swatch-grid button[\s\S]*?var\(--flag-swatch\) !important;/, "Flag dyes can still be overwritten by the shared button face.");
assert.match(game, /data-flag-color[\s\S]{0,400}aria-pressed="\$\{selected\}"/, "Flag swatches must expose their selected state.");
assert.doesNotMatch(index, /M8 27h18v3H6v-5c1-5 3-9 7-12/, "The ambiguous legacy horse charge remains in the production sprite.");
assert.match(index, /id="cl-icon-flag-horse"[\s\S]{0,260}M6 29h21v-4/, "The corrected heraldic horse charge is missing.");
assert.match(index, /hud-report-192x192-21644b7390fb\.webp/, "The approved Report artwork changed.");
assert.match(index, /id="logBtn"[\s\S]{0,420}class="nav-btn-label">Reports<\/small>/, "Reports is missing the shared bottom-nav label treatment.");
assert.match(index, /id="outgoingAttackBtn"[\s\S]{0,220}class="nav-btn-icon"[\s\S]{0,260}class="nav-btn-label">Marches<\/small>/, "Troop Movements is missing the shared icon and label treatment.");
assert.match(index, /id="incomingAttackBtn"[\s\S]{0,220}class="nav-btn-icon"[\s\S]{0,260}class="nav-btn-label">Incoming<\/small>/, "Incoming Attacks is missing the shared icon and label treatment.");
assert.match(css, /--cl-operation-button-width:\s*clamp\(78px,[\s\S]{0,120}98px\)/, "The shared bottom-nav button width is not responsive.");
assert.match(css, /\.bottom-nav \{[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/, "The bottom-nav wrapper still paints a dark panel behind the operation controls.");
assert.match(css, /\.bottom-nav \.report-nav-btn,\s*\.outgoing-attack-btn,\s*\.incoming-attack-btn \{[\s\S]*?width:\s*var\(--cl-operation-button-width\);[\s\S]*?height:\s*46px;[\s\S]*?padding:\s*3px 5px;[\s\S]*?border-width:\s*3px !important;/, "The three operation controls do not share one frame and sizing contract after runtime repositioning.");
assert.match(css, /\.bottom-nav \.report-nav-btn\[hidden\],\s*\.outgoing-attack-btn\[hidden\],\s*\.incoming-attack-btn\[hidden\] \{\s*display:\s*none !important;/, "Shared operation-control styles can override dynamic hidden states.");
assert.match(css, /\.bottom-nav \.report-nav-btn \{[\s\S]*?border-color:\s*#4a2c1a !important;[\s\S]*?var\(--cl-contrast-paper-light\), var\(--cl-contrast-paper\)/, "Reports is missing its dark-brown frame or beige inner surface.");
assert.match(css, /\.bottom-nav \.report-nav-btn \.nav-btn-label \{[\s\S]*?color:\s*#15100b !important;/, "The Reports label is not explicitly rendered in black ink.");
assert.match(css, /\.outgoing-attack-btn,[\s\S]{0,240}border-color:\s*#214a68 !important;[\s\S]{0,120}background:\s*var\(--cl-state-outgoing\) !important;/, "Troop Movements is missing its blue frame or inner surface after runtime repositioning.");
assert.match(css, /\.incoming-attack-btn,[\s\S]{0,240}border-color:\s*#642025 !important;[\s\S]{0,120}background:\s*var\(--cl-state-incoming\) !important;/, "Incoming Attacks is missing its red frame or inner surface after runtime repositioning.");
assert.equal((uiLayoutConfig.match(/"outgoingMarch":\s*\{[\s\S]{0,180}?"offsetX":\s*118,[\s\S]{0,100}?"offsetY":\s*12,[\s\S]{0,100}?"width":\s*98,[\s\S]{0,100}?"height":\s*46/g) || []).length, 2, "Troop Movements does not preserve the 8px Reports gap and shared button size in both HUD presets.");
assert.equal((uiLayoutConfig.match(/"incomingMarch":\s*\{[\s\S]{0,180}?"offsetX":\s*224,[\s\S]{0,100}?"offsetY":\s*12,[\s\S]{0,100}?"width":\s*98,[\s\S]{0,100}?"height":\s*46/g) || []).length, 2, "Incoming Threats does not preserve the 8px operation-button gap and shared size in both HUD presets.");
assert.match(game, /incomingAttackBtn\.hidden\s*=\s*incoming\.length === 0;/, "Incoming Attacks no longer preserves dynamic visibility.");
assert.match(game, /outgoingAttackBtn\.hidden\s*=\s*total === 0;/, "Troop Movements no longer preserves dynamic visibility.");

const manuscriptIndex = index.indexOf("manuscript-prototype.css");
const correctionIndex = index.indexOf("ui-contrast-correction.css?v=20260813-map-location-banner-r11");
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
  ["outgoing / victory", "#fff8ea", "#355e7a"],
  ["incoming / defeat", "#fff8ea", "#8a3333"],
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
