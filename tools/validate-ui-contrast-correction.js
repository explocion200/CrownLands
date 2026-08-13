const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("ui-contrast-correction.css");
const index = read("index.html");
const game = read("game.js");
const serviceWorker = read("service-worker.js");
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
assert.match(css, /\.audio-channel-card \.audio-channel-glyph[\s\S]*?color:\s*#fff2c7 !important/, "Music and Effects channel glyphs are not contrast-safe.");
assert.match(css, /\.audio-channel-card \.audio-mute-button::after[\s\S]*?content:\s*"On"/, "Audio controls do not expose a visible On state.");
assert.match(css, /\.audio-channel-card \.audio-mute-button\[aria-pressed="true"\]::after[\s\S]*?content:\s*"Off"/, "Audio controls do not expose a visible Off state.");
assert.match(css, /\.profile-screen \.kingdom-stat \.profile-production-bonus[\s\S]*?color:\s*#9a6714 !important/, "Kingdom production bonuses are not gold-highlighted.");
assert.match(css, /\.profile-screen \.flag-option-grid button[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/, "Player flag pattern names can still overflow their buttons.");
assert.match(css, /\.clan-shield-editor \.clan-shield-choice-grid button[\s\S]*?color:\s*#f8e9c4 !important/, "Clan shield choices remain low contrast.");
assert.match(css, /\.clan-shield-editor \.clan-shield-choice-grid button small[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;/, "Clan shield labels can still overflow their choices.");
assert.match(game, /data-skill-preset-slot="\$\{slot\.slot\}"[\s\S]{0,500}aria-disabled="\$\{!slotUnlocked\}"[\s\S]{0,100}disabled/, "Locked skill preset tabs are not disabled.");
assert.match(game, /if \(!requestedSlot \|\| !isSkillPresetUnlocked\(requestedSlot, state\?\.character\)\)/, "Locked preset click handling lacks an interaction guard.");
assert.match(css, /\.profile-screen \.skill-preset-tabs button\.locked[\s\S]*?cursor:\s*not-allowed/, "Locked presets do not have a readable disabled treatment.");
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
assert.match(css, /\.bottom-nav :is\(\.report-nav-btn, \.outgoing-attack-btn, \.incoming-attack-btn\) \{[\s\S]*?width:\s*var\(--cl-operation-button-width\);[\s\S]*?height:\s*46px;[\s\S]*?padding:\s*3px 5px;[\s\S]*?border:\s*3px solid #b28c58 !important;/, "The three bottom-nav controls do not share one frame and sizing contract.");
assert.match(css, /\.bottom-nav :is\(\.report-nav-btn, \.outgoing-attack-btn, \.incoming-attack-btn\)\[hidden\] \{\s*display:\s*none !important;/, "Shared bottom-nav styles can override dynamic hidden states.");
assert.match(css, /\.bottom-nav \.report-nav-btn \{[\s\S]*?var\(--cl-contrast-paper-light\), var\(--cl-contrast-paper\)/, "Reports is missing its beige inner surface.");
assert.match(css, /\.bottom-nav \.outgoing-attack-btn,[\s\S]{0,180}background:\s*var\(--cl-state-outgoing\) !important;/, "Troop Movements is missing its muted medieval-blue inner surface.");
assert.match(css, /\.bottom-nav \.incoming-attack-btn,[\s\S]{0,180}background:\s*var\(--cl-state-incoming\) !important;/, "Incoming Attacks is missing its muted medieval-red inner surface.");
assert.match(game, /incomingAttackBtn\.hidden\s*=\s*incoming\.length === 0;/, "Incoming Attacks no longer preserves dynamic visibility.");
assert.match(game, /outgoingAttackBtn\.hidden\s*=\s*total === 0;/, "Troop Movements no longer preserves dynamic visibility.");

const manuscriptIndex = index.indexOf("manuscript-prototype.css");
const correctionIndex = index.indexOf("ui-contrast-correction.css?v=20260813-bottom-nav-family-r1");
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
