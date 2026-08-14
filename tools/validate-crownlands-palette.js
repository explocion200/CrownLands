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

const releaseId = "20260814-crownlands-palette-r34";
const paletteTag = `crownlands-palette.css?v=${releaseId}`;

assert.ok(Buffer.byteLength(css) <= 32 * 1024, "The Crownlands palette exceeds its 32 KiB delivery budget.");
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
  ".resource-pill", ".profile-screen", ".clan-panel", ".leaderboard-row",
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
assert.match(styles, /\.city-node\.clan-ally \.foreign-city-shield\s*\{[\s\S]*?background:\s*#667a4a;/, "Clan-city labels do not use moss green.");
assert.match(styles, /\.city-node\.neutral \.foreign-city-shield\s*\{\s*background:\s*#77736a;/, "Neutral city labels do not use stone gray.");

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
assert.ok(worker.includes(`CACHE_VERSION = "${releaseId}"`), "The palette release does not restart stale clients.");
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
]) assert.ok(contrast(foreground, background) >= 4.5, `${label} does not meet 4.5:1 contrast.`);

console.log("Validated the centralized Crownlands palette, game-wide UI coverage, exact map semantics, persistent hex actions, release delivery, and readable contrast.");
