const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("crownlands-palette.css");
const styles = read("styles.css");
const actions = read("action-buttons.css");
const index = read("index.html");
const worker = read("service-worker.js");
const builder = read("tools/build-production-client.js");
const manifestBuilder = read("tools/generate-release-manifest.js");
const artifactValidator = read("tools/validate-production-artifact.js");
const budgetValidator = read("tools/validate-asset-performance-budgets.js");

const releaseId = "20260822-scalable-shop-ui-r2";
const cacheVersion = "20260822-scalable-shop-ui-r2";
const paletteTag = `crownlands-palette.css?v=${releaseId}`;

assert.ok(Buffer.byteLength(css.replace(/\r\n/g, "\n"), "utf8") <= 40 * 1024, "The Crownlands palette exceeds its 40 KiB delivery budget.");
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, "The Crownlands palette has unbalanced braces.");
assert.doesNotMatch(css, /font-family\s*:/i, "The palette pass must preserve the existing Crownlands typefaces.");
assert.doesNotMatch(css, /url\s*\(/i, "The palette pass must not recolor or replace visual assets.");
assert.doesNotMatch(css, /#(?:fff|ffffff|000|000000)\b/i, "The palette layer uses pure white or black instead of the approved earthy palette.");

const exactTokens = {
  "--cl-bg": "#d7c49d",
  "--cl-panel": "#eedebe",
  "--cl-panel-secondary": "#e7d6b4",
  "--cl-panel-raised": "#dbc8a2",
  "--cl-panel-inset": "#d0b98e",
  "--cl-input-bg": "#f1e2c5",
  "--cl-burgundy": "#72363a",
  "--cl-burgundy-dark": "#542728",
  "--cl-brass": "#997643",
  "--cl-gold": "#b58a3b",
  "--cl-gold-highlight": "#c69a45",
  "--cl-gold-bonus": "#a87624",
  "--cl-text": "#2f2113",
  "--cl-text-secondary": "#5a4632",
  "--cl-text-muted": "#756550",
  "--cl-text-light": "#f2e2bf",
  "--cl-text-bright": "#fff8e8",
  "--cl-border-dark": "#542f24",
  "--cl-border-faded": "#a59070",
  "--cl-player-owned": "#b68a43",
  "--cl-clan": "#667a4a",
  "--cl-enemy-weaker": "#c9786f",
  "--cl-enemy-equal": "#b3261e",
  "--cl-enemy-stronger": "#4b1418",
  "--cl-neutral": "#77736a",
  "--cl-success": "#64754a",
  "--cl-blue": "#4d6575",
  "--cl-info": "#526a78",
  "--cl-warning": "#a46e32",
  "--cl-red": "#8a3934",
  "--cl-critical": "#9b302a",
  "--cl-negative": "#91443d",
  "--cl-purple": "#66536f",
  "--cl-purple-light": "#786581",
  "--cl-scout-top": "#a63b30",
  "--cl-scout-bottom": "#4f1515",
  "--cl-scout-border": "#d66b64",
  "--cl-disabled-bg": "#c7b99b",
  "--cl-disabled-border": "#a59070",
  "--cl-disabled-text": "#8c8373",
};
for (const [name, value] of Object.entries(exactTokens)) {
  assert.ok(css.includes(`${name}: ${value};`), `Missing exact Crownlands token ${name}: ${value}.`);
}

for (const family of [
  ".resource-pill", ".profile-screen", ".clan-panel",
  ".city-list-row", ".shop-item", ".inventory-slot", ".battle-report-card",
  ".profile-achievement-summary", ".daily-reward-card", ".daily-mission-row",
  ".seasonal-achievement-row", ".camp-info-tab-panel", ".stronghold-info",
  ".citadel-info", ".inner-castle-shell", ".inner-castle-preview",
  ".common-gear-building-shell", ".common-gear-detail-panel", ".common-gear-slot",
  ".realm-announcement-banner", ".toast", "[role=\"tooltip\"]",
]) assert.ok(css.includes(family), `The game-wide palette does not cover ${family}.`);

assert.match(css, /\.profile-screen-header,[\s\S]*?background:\s*var\(--cl-header-bg\) !important;/, "Major headers are not using the burgundy title treatment.");
assert.match(css, /\.profile-tabs button,[\s\S]*?:is\(\.active,[\s\S]*?background:\s*var\(--cl-header-bg\) !important;/, "Active tabs are not burgundy with the shared tab treatment.");
assert.match(css, /input:not\(\[type="range"\]\)[\s\S]*?background:\s*var\(--cl-input-bg\) !important;/, "Inputs do not use the aged input surface.");
assert.match(css, /:disabled,[\s\S]*?color:\s*var\(--cl-disabled-text\) !important;[\s\S]*?background:\s*var\(--cl-disabled-bg\) !important;/, "Disabled controls do not use the exact shared disabled palette.");
assert.match(css, /\.bottom-nav \.report-nav-btn[\s\S]*?background:\s*#d8c59f !important;/, "The Reports HUD control does not use its parchment interior.");
assert.match(css, /\.outgoing-attack-btn[\s\S]*?background:\s*var\(--cl-blue\) !important;/, "The movement HUD control does not use movement blue.");
assert.match(css, /\.incoming-attack-btn[\s\S]*?background:\s*var\(--cl-red\) !important;/, "The incoming HUD control does not use attack red.");

for (const [selector, color] of [
  ["enemy-power-protected", "#c9786f"],
  ["enemy-power-in-range", "#b3261e"],
  ["enemy-power-overpowering", "#4b1418"],
]) {
  assert.match(styles, new RegExp(`\\.city-node\\.enemy\\.${selector}\\s*\\{[\\s\\S]*?--enemy-city-ui:\\s*${color};`), `${selector} does not use ${color}.`);
}
assert.match(styles, /\.city-owner-column\s*\{[\s\S]*?background:\s*#b68a43;/, "Owned-city labels do not use player gold.");
assert.match(styles, /\.city-node\.player\.main-city-node \.city-owner-column,[\s\S]*?\.city-node\.player\.main-city-node \.city-army-count[\s\S]*?background:\s*#454b54;/, "The player's protected main-city label does not use the shared dark gray identity.");
assert.match(css, /--cl-main-city:\s*#454b54;/, "The final palette is missing the protected main-city gray token.");
assert.match(css, /\.city-node\.player\.main-city-node :is\(\.city-owner-column, \.city-army-count\)[\s\S]*?background:\s*var\(--cl-main-city\) !important;/, "The final palette does not keep the player's main city dark gray.");
assert.match(styles, /\.city-army-count\s*\{[\s\S]*?text-shadow:\s*none;/, "Owned-city troop counts can inherit the multi-layer map-label shadow.");
assert.match(css, /\.city-node\.player \.city-army-count\s*\{[\s\S]*?filter:\s*none !important;[\s\S]*?text-shadow:\s*none !important;/, "The final palette does not guarantee one crisp owned-city troop text layer.");
assert.match(styles, /\.city-node\.clan-ally \.foreign-city-shield\s*\{[\s\S]*?background:\s*#667a4a;/, "Clan-city labels do not use moss green.");
assert.match(styles, /\.city-node\.neutral \.foreign-city-shield\s*\{\s*background:\s*#77736a;/, "Neutral city labels do not use stone gray.");
assert.match(styles, /:is\(\.gold-camp-info-panel\.stronghold-legacy-info-panel, \.gold-camp-info-panel\.crown-citadel-info-panel\)[\s\S]*?\.modal-city-stats :is\(\.stat-wide, \.stat-chip\) > span\s*\{[\s\S]*?color:\s*#e7d6b4 !important;/, "Shared Stronghold/Citadel labels are not protected from generic parchment typography.");
assert.match(styles, /\.modal-city-stats :is\(\.stat-wide, \.stat-chip\) > small\s*\{[\s\S]*?color:\s*#f2e2bf !important;/, "Shared Stronghold/Citadel supporting copy is not readable on blue cards.");
assert.match(styles, /\.citadel-reign-row\.current \.citadel-reign-ruler :is\(\.player-name-link, strong\),[\s\S]*?\.citadel-reign-row\.current \.citadel-reign-time\s*\{[\s\S]*?color:\s*#fff8e8 !important;/, "The highlighted Stronghold/Citadel ruler row does not retain light foreground text.");
assert.match(styles, /\.island-map-picker \.island-map-name\s*\{[\s\S]*?color:\s*#fff8e8;[\s\S]*?text-shadow:/, "The 15-map selector does not keep map names readable over map thumbnails.");
assert.match(styles, /\.island-map-owned\s*\{[\s\S]*?color:\s*#d3e3eb;[\s\S]*?text-shadow:/, "The 15-map selector does not keep owned-city counts readable over map thumbnails.");
for (const themeCss of [read("profile-theme.css"), css]) {
  assert.match(themeCss, /:not\(\.island-map-icon\)/, "A generic modal button rule can still replace the 15-map selector tile colors.");
  assert.match(themeCss, /:not\(\.leaderboard-modal, \.island-switcher-modal, \.battle-report-modal\)/, "Generic modal typography can still recolor the 15-map selector labels or detailed report outcomes.");
}

assert.match(css, /Scout intelligence uses the shared parchment report family[\s\S]*?\.modal\.scout-report-modal \.scout-report-identities[\s\S]*?border:\s*1px solid var\(--cl-brass\) !important;[\s\S]*?background:\s*var\(--cl-card-bg\) !important;/, "Scout intelligence is not using the standard parchment report card construction.");
assert.match(css, /\.modal\.scout-report-modal :is\(\.scout-breakdown-row, \.scout-skill-row\)[\s\S]*?background:\s*transparent !important;[\s\S]*?box-shadow:\s*none !important;/, "Scout list rows retain a conflicting legacy surface.");
assert.match(css, /\.modal\.battle-report-modal \.battle-report-card \.battle-report-city > span,[\s\S]*?\.battle-report-result :is\(strong, small\)[\s\S]*?color:\s*var\(--cl-text-bright\) !important;/, "Battle report result and level text can still disappear into semantic badges.");
for (const themeCss of [read("profile-theme.css"), css]) {
  assert.match(themeCss, /\.modal:where\(:not\(\.leaderboard-modal, \.island-switcher-modal, \.battle-report-modal\)\) \.modal-card/, "Generic modal typography can still repaint detailed report outcomes with parchment ink.");
  assert.match(themeCss, /:not\(\.offline-collect-btn\)/, "Generic modal controls can still repaint Welcome Back Collect as a secondary action.");
}
assert.doesNotMatch(css, /\.leaderboard-toolbar,\s*\.leaderboard-row,/, "The generic parchment card palette still overrides the dedicated slate leaderboard surface.");
assert.match(css, /\.modal:where\(:not\(\.leaderboard-modal\)\) \.modal-card/, "Generic parchment typography still overrides dedicated leaderboard text colors or gained excess specificity.");
assert.match(css, /:not\(\.player-name-link\):not\(\.clan-identity-link\)/, "Generic controls still give leaderboard identity links an opaque button surface.");

for (const exactAction of [
  "--cl-action-size: 64px",
  "--cl-action-shape: polygon(50% 0, 94% 23%, 94% 76%, 50% 100%, 6% 76%, 6% 23%)",
  "--cl-action-scout-bg: linear-gradient(180deg, #a63b30, #4f1515)",
  "--cl-action-scout-border: #d66b64",
  "--cl-action-scout-text: #fff8e8",
  "--cl-action-disabled-bg: #c7b99b",
]) assert.ok(actions.includes(exactAction), `The hard-rule action system is missing ${exactAction}.`);

assert.ok(index.includes(paletteTag), "The game does not load the Crownlands palette.");
assert.ok(index.indexOf(paletteTag) > index.indexOf("profile-theme.css"), "The Crownlands palette must load after legacy theme layers.");
assert.ok(index.indexOf("action-buttons.css") > index.indexOf(paletteTag), "The exact objective-action layer must remain authoritative after the palette.");
assert.ok(index.indexOf("mobile-viewport.css") > index.indexOf("action-buttons.css"), "Mobile reachability must remain the final stylesheet.");
assert.ok(worker.includes(`/${paletteTag}`), "The Crownlands palette is missing from the offline shell.");
assert.ok(worker.includes(`CACHE_VERSION = "${cacheVersion}"`), "The palette release does not restart stale clients.");
for (const source of [builder, manifestBuilder, artifactValidator, budgetValidator]) {
  assert.ok(source.includes("crownlands-palette.css"), "The Crownlands palette is missing from production delivery or budgets.");
}

function luminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

for (const [foreground, background, label] of [
  ["2f2113", "eedebe", "primary parchment copy"],
  ["5a4632", "e7d6b4", "secondary parchment copy"],
  ["2f2113", "b68a43", "owned-city map labels"],
  ["f2e2bf", "72363a", "burgundy headers"],
  ["f2e2bf", "4d6575", "movement controls"],
  ["f2e2bf", "8a3934", "attack controls"],
  ["f2e2bf", "66536f", "rally controls"],
  ["fff8e8", "a63b30", "scouting controls"],
  ["fff8e8", "64754a", "success feedback"],
  ["fff8e8", "526a78", "scout report result"],
  ["fff8e8", "8a3934", "defeat report result"],
  ["fff8e8", "31566d", "leaderboard names"],
  ["d3e3eb", "31566d", "leaderboard metadata"],
  ["fff0bc", "31566d", "leaderboard power"],
  ["e7d6b4", "173f5e", "Stronghold/Citadel blue-card labels"],
  ["f2e2bf", "173f5e", "Stronghold/Citadel blue-card descriptions"],
  ["fff8e8", "285c79", "current ruler name and time"],
  ["ffe39a", "285c79", "current ruler rank"],
]) assert.ok(contrast(foreground, background) >= 4.5, `${label} does not meet 4.5:1 contrast.`);

console.log("Validated the centralized Crownlands palette, game-wide UI coverage, exact map semantics, persistent hex actions, release delivery, and readable contrast.");
