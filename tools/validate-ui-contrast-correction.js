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

assert.match(css, /\.profile-screen \.flag-swatch-grid button[\s\S]*?var\(--flag-swatch\) !important;/, "Flag dyes can still be overwritten by the shared button face.");
assert.match(game, /data-flag-color[\s\S]{0,400}aria-pressed="\$\{selected\}"/, "Flag swatches must expose their selected state.");
assert.doesNotMatch(index, /M8 27h18v3H6v-5c1-5 3-9 7-12/, "The ambiguous legacy horse charge remains in the production sprite.");
assert.match(index, /id="cl-icon-flag-horse"[\s\S]{0,260}M6 29h21v-4/, "The corrected heraldic horse charge is missing.");
assert.match(index, /hud-report-192x192-21644b7390fb\.webp/, "The approved Report artwork changed.");

const manuscriptIndex = index.indexOf("manuscript-prototype.css");
const correctionIndex = index.indexOf("ui-contrast-correction.css?v=20260813-ui-contrast-correction-r1");
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
