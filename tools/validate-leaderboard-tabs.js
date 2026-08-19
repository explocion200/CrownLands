const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const profileTheme = read("profile-theme.css");
const finalPalette = read("crownlands-palette.css");
const visualQa = read("docs/visual-qa/report-leaderboard-readability/index.html");
const styles = [
  "styles.css",
  "interface-theme.css",
  "readability.css",
  "manuscript-prototype.css",
  "ui-contrast-correction.css",
  "profile-theme.css",
  "crownlands-palette.css",
  "action-buttons.css",
  "mobile-viewport.css",
].map(read).join("\n");
const modalSource = client.slice(
  client.indexOf("function showLeaderboardModal()"),
  client.indexOf("function showLogModal(")
);

assert.match(modalSource, /role="tablist"[\s\S]*?data-leaderboard-tab="players">Top \$\{formatNumber\(KING_POWER_LEADERBOARD_LIMIT\)\}[\s\S]*?data-leaderboard-tab="clans"[\s\S]*?>Top Clans</, "Leaderboard category tabs are missing or out of order.");
assert.match(modalSource, /modal\.className\s*=\s*"modal leaderboard-modal";/, "Opening the leaderboard does not clear stale modal variants that can hide ranks.");
assert.match(modalSource, /leaderboardActiveTab\s*=\s*"players"[\s\S]*?setLeaderboardTab\("players"\)[\s\S]*?refreshLeaderboardRows/, "The leaderboard does not reset to Top 100 every time it opens.");
assert.doesNotMatch(modalSource, /refreshLeaderboardRows\(\{ forcePublish: true \}\);\s*refreshClanLeaderboardRows\(\);/, "Opening the leaderboard still loads both categories at once.");
assert.match(modalSource, /leaderboardActiveTab\s*===\s*"clans"[\s\S]*?refreshClanLeaderboardRows\(\)[\s\S]*?refreshLeaderboardRows/, "Refresh does not follow the selected leaderboard tab.");
assert.match(client, /function setLeaderboardTab[\s\S]*?aria-selected[\s\S]*?data-leaderboard-panel[\s\S]*?panel\.hidden/, "Leaderboard tab selection does not update accessible tab and panel state.");
assert.match(styles, /\.leaderboard-tabs[\s\S]*?\.leaderboard-tab\.active[\s\S]*?\.leaderboard-tab-panel\[hidden\]/, "Leaderboard tabs do not have complete visible, active, and hidden styles.");
assert.match(styles, /\.leaderboard-modal \.leaderboard-toolbar strong\s*\{[\s\S]*?color:\s*#1c4055 !important;[\s\S]*?text-shadow:\s*none !important;/, "Leaderboard headings still use the low-readability gold shadow treatment.");
assert.match(styles, /\.leaderboard-modal \.leaderboard-row,[\s\S]*?background:\s*linear-gradient\(180deg, #31566d, #1b394c\) !important;/, "Player and clan rankings are missing the slate list surface.");
assert.match(styles, /\.leaderboard-modal \.leaderboard-row :is\([\s\S]*?\.player-name-link,[\s\S]*?\.clan-leaderboard-name,[\s\S]*?background:\s*transparent !important;/, "Leaderboard profile links retain a conflicting light button background.");
assert.match(styles, /\.leaderboard-modal \.leaderboard-row :is\(\.leaderboard-ruler small, \.leaderboard-power small\)[\s\S]*?color:\s*#d3e3eb !important;/, "Leaderboard metadata can still blend into its row background.");
assert.match(styles, /\.leaderboard-modal \.modal-card #modalBody\s*\{[\s\S]*?overflow-y:\s*auto !important;/, "Top 100 ranks can be clipped instead of scrolling.");

for (const [label, theme] of [["Profile theme", profileTheme], ["final palette", finalPalette]]) {
  const toolbarIndex = theme.indexOf("  .leaderboard-toolbar,");
  const sharedCardEnd = theme.indexOf("\n) {", toolbarIndex);
  assert.ok(toolbarIndex >= 0 && sharedCardEnd > toolbarIndex, `${label} shared-card block is missing.`);
  assert.doesNotMatch(theme.slice(toolbarIndex, sharedCardEnd), /\.leaderboard-row\b/, `${label} still replaces the dedicated slate ranking surface.`);
  const protectedModalTypography = theme.match(/\.modal:where\(:not\(\.leaderboard-modal(?:, \.island-switcher-modal)?(?:, \.battle-report-modal)?\)\) \.modal-card/g) || [];
  assert.ok(protectedModalTypography.length >= 3, `${label} generic typography still leaks into leaderboard rows or gained unintended specificity.`);
  assert.match(theme, /:not\(\.player-name-link\):not\(\.clan-identity-link\)/, `${label} still paints player or clan identity links as generic buttons.`);
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
  ["fff8e8", "31566d", "leaderboard names"],
  ["d3e3eb", "31566d", "leaderboard metadata"],
  ["fff0bc", "31566d", "leaderboard power"],
  ["b9e8ff", "31566d", "leaderboard clan links"],
]) assert.ok(contrast(foreground, background) >= 4.5, `${label} do not meet 4.5:1 contrast.`);

assert.match(visualQa, /data-qa-list="players"[\s\S]*?data-qa-list="clans"/, "The visual QA page does not compare player and clan rankings.");
assert.match(visualQa, /PASS — final computed colors are readable/, "The visual QA page does not check the winning computed styles.");

console.log("Validated Top 100 default selection, Top Clans tab loading, active-tab refresh, accessibility state, and responsive tab styling.");
