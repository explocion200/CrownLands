const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const styles = `${fs.readFileSync(path.join(root, "styles.css"), "utf8")}\n${fs.readFileSync(path.join(root, "interface-theme.css"), "utf8")}\n${fs.readFileSync(path.join(root, "ui-contrast-correction.css"), "utf8")}`;
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

console.log("Validated Top 100 default selection, Top Clans tab loading, active-tab refresh, accessibility state, and responsive tab styling.");
