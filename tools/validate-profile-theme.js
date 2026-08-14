const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const css = read("profile-theme.css");
const index = read("index.html");
const worker = read("service-worker.js");
const builder = read("tools/build-production-client.js");
const manifestBuilder = read("tools/generate-release-manifest.js");
const artifactValidator = read("tools/validate-production-artifact.js");

assert.ok(Buffer.byteLength(css) <= 32 * 1024, "The unified Profile theme exceeds its 32 KiB budget.");
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, "The unified Profile theme has unbalanced braces.");
assert.doesNotMatch(css, /#(?:211a13|2b2118|5c4933|ead8b3|f5e7c8|d8c18f|54371f|5a3b21|72502f)\b/i, "The unified theme reintroduces a prohibited brown or parchment color.");

for (const token of [
  "--cl-profile-canvas: #061926",
  "--cl-profile-surface: #0a2b40",
  "--cl-profile-surface-raised: #123b56",
  "--cl-profile-border: #507b92",
  "--cl-profile-ivory: #fff8e8",
  "--cl-profile-muted: #c5dfeb",
  "--cl-profile-gold: #ffe29a",
]) assert.ok(css.includes(token), `Missing Profile palette token ${token}.`);

for (const family of [
  ".setup-card", ".commander-panel", ".profile-screen", ".modal .modal-card",
  ".kingdom-stat", ".shop-item", ".inventory-slot", ".city-list-row",
  ".leaderboard-row", ".battle-report-card", ".incoming-attack-card",
  ".scout-report-city", ".camp-info-tab-panel", ".clan-panel",
  ".public-profile-section", ".daily-reward-card", ".daily-mission-row",
  ".seasonal-achievement-row", ".offline-reward-grid > div",
  ".realm-activity-card", ".bottom-nav .report-nav-btn",
]) assert.ok(css.includes(family), `The Profile theme does not cover ${family}.`);

assert.match(css, /:is\(\.setup-card, \.commander-panel, \.profile-screen, \.modal \.modal-card\)[\s\S]*?:is\(h1, h2, h3, h4,[\s\S]*?color:\s*var\(--cl-profile-gold\) !important;/, "Interface headings do not use the Profile gold treatment.");
assert.match(css, /:is\(\.setup-card, \.commander-panel, \.profile-screen, \.modal \.modal-card\)[\s\S]*?:is\(p, li, dd, dt, label, span, small, em\)[\s\S]*?color:\s*var\(--cl-profile-muted\) !important;/, "Supporting interface copy does not use the Profile muted treatment.");
assert.match(css, /\.profile-screen-header\s*\{[\s\S]*?background:\s*linear-gradient\(180deg, #173f5e, #071b2a\) !important;/, "The Profile header itself is not using the unified navy shell.");
assert.match(css, /\.modal \.modal-card > h2,[\s\S]*?background:\s*transparent !important;[\s\S]*?clip-path:\s*none !important;/, "Modal titles still use a legacy colored banner instead of the Profile heading treatment.");
assert.match(css, /\.profile-screen \.kingdom-stat \.profile-production-bonus\s*\{[\s\S]*?color:\s*var\(--cl-profile-gold\) !important;/, "Profile production bonuses do not use the unified bright-gold text.");
assert.match(css, /\.city-list-modal \.city-list-toolbar button\.active,[\s\S]*?background:\s*linear-gradient\(180deg, var\(--cl-profile-gold\), var\(--cl-profile-gold-deep\)\) !important;/, "City-list sort controls can fall back to the legacy burgundy active state.");
assert.match(css, /\.battle-report-card \.battle-report-city > span\s*\{[\s\S]*?color:\s*var\(--cl-profile-ivory\) !important;/, "Battle report level markers are not protected by the unified ivory treatment.");
assert.match(css, /\.battle-report-card\.scout \.battle-report-result\s*\{[\s\S]*?linear-gradient\(180deg, #315f78, #183b50\) !important;/, "Scout reports are not part of the common blue report family.");
assert.match(css, /\.battle-report-card\.defeat \.battle-report-result[\s\S]*?var\(--cl-profile-danger\)/, "Defeat state meaning was lost during theme unification.");
assert.match(css, /\.clan-member-row\.selected[\s\S]*?var\(--cl-profile-success\)/, "Ally or success state meaning was lost during theme unification.");

const themeTag = "profile-theme.css?v=20260814-main-city-r36";
assert.ok(index.includes(themeTag), "The game does not load the unified Profile theme.");
assert.ok(index.indexOf(themeTag) > index.indexOf("ui-contrast-correction.css"), "The unified Profile theme must load after every legacy color layer.");
assert.ok(worker.includes(`/profile-theme.css?v=20260814-main-city-r36`), "The unified Profile theme is missing from the offline shell.");
for (const source of [builder, manifestBuilder, artifactValidator]) {
  assert.ok(source.includes("profile-theme.css"), "The unified Profile theme is missing from release packaging.");
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

assert.ok(contrast("fff8e8", "0a2b40") >= 7, "Ivory Profile text does not meet enhanced contrast on navy cards.");
assert.ok(contrast("c5dfeb", "0a2b40") >= 4.5, "Muted Profile text does not meet body-text contrast on navy cards.");
assert.ok(contrast("122333", "ffe29a") >= 7, "Selected Profile tabs do not meet enhanced contrast.");

console.log("Validated the global Profile palette, complete UI-family coverage, semantic states, release delivery, and contrast.");
