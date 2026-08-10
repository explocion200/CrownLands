const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const modalSource = client.slice(
  client.indexOf("function showLeaderboardModal()"),
  client.indexOf("function showLogModal(")
);

assert.match(modalSource, /role="tablist"[\s\S]*?data-leaderboard-tab="players">Top \$\{formatNumber\(KING_POWER_LEADERBOARD_LIMIT\)\}[\s\S]*?data-leaderboard-tab="clans"[\s\S]*?>Top Clans</, "Leaderboard category tabs are missing or out of order.");
assert.match(modalSource, /leaderboardActiveTab\s*=\s*"players"[\s\S]*?setLeaderboardTab\("players"\)[\s\S]*?refreshLeaderboardRows/, "The leaderboard does not reset to Top 100 every time it opens.");
assert.doesNotMatch(modalSource, /refreshLeaderboardRows\(\{ forcePublish: true \}\);\s*refreshClanLeaderboardRows\(\);/, "Opening the leaderboard still loads both categories at once.");
assert.match(modalSource, /leaderboardActiveTab\s*===\s*"clans"[\s\S]*?refreshClanLeaderboardRows\(\)[\s\S]*?refreshLeaderboardRows/, "Refresh does not follow the selected leaderboard tab.");
assert.match(client, /function setLeaderboardTab[\s\S]*?aria-selected[\s\S]*?data-leaderboard-panel[\s\S]*?panel\.hidden/, "Leaderboard tab selection does not update accessible tab and panel state.");
assert.match(styles, /\.leaderboard-tabs[\s\S]*?\.leaderboard-tab\.active[\s\S]*?\.leaderboard-tab-panel\[hidden\]/, "Leaderboard tabs do not have complete visible, active, and hidden styles.");

console.log("Validated Top 100 default selection, Top Clans tab loading, active-tab refresh, accessibility state, and responsive tab styling.");
