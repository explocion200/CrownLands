const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const server = read("functions/index.js");
const guide = read("how-to-play.html");
const rules = read("game-rules.html");

assert.match(client, /const SCOUT_REPORT_SECONDS = 600;/, "The client scout lifetime is not ten minutes.");
assert.match(server, /const SCOUT_REPORT_SECONDS = 600;/, "The server scout lifetime is not ten minutes.");
assert.match(client, /const LEGACY_SCOUT_REPORT_SECONDS = 120;/, "Legacy scout reports could be retroactively extended.");
assert.match(server, /expiresAtMs:\s*nowMs \+ SCOUT_REPORT_SECONDS \* 1000/, "Server scout snapshots do not expire from arrival time.");

assert.match(server, /function getCurrentScoutReportId[\s\S]*?sha256[\s\S]*?uid[\s\S]*?cityId/, "Successful scout reports lack a stable player-target identity.");
assert.match(server, /function writeReport[\s\S]*?isSuccessfulScoutIntelReport[\s\S]*?existing\.cityId[\s\S]*?report\.cityId[\s\S]*?merge: false/, "New scout intelligence does not atomically replace the existing target report.");
assert.match(server, /function pruneExpiredScoutReportMap[\s\S]*?expiresAtMs <= nowMs/, "Profile scout intelligence is not invalid at the exact expiration boundary.");
assert.match(server, /function deleteRemovedScoutReportEntries[\s\S]*?new FieldPath\("scoutReports", cityId\)[\s\S]*?FieldValue\.delete/, "Expired scout-map entries are not removed from merged Firestore profiles.");
assert.match(server, /function pruneExpiredBattleScoutReports[\s\S]*?expiresAtMs <= nowMs[\s\S]*?successfulScoutIndexByCity/, "Battle Reports do not expire and replace successful intelligence per target.");
assert.match(server, /function cleanupExpiredScoutReportDocuments[\s\S]*?collectionGroup\("serverReports"\)[\s\S]*?where\("scoutReport\.expiresAtMs", "<=", nowMs\)[\s\S]*?lastUpdateTime/, "Scheduled cleanup is missing or can delete a freshly replaced report.");
assert.match(server, /exports\.maintainGameServer[\s\S]*?cleanupExpiredScoutReportDocuments/, "Expired report-document cleanup is not scheduled.");

assert.match(client, /function normalizeBattleReports[\s\S]*?expiresAtMs <= nowMs[\s\S]*?successfulScoutIndexByCity/, "The browser does not hide expired or duplicate scout intelligence.");
assert.match(client, /function mergeServerReports[\s\S]*?appliedServerReportRevisions[\s\S]*?refreshedScoutCityIds[\s\S]*?showScoutReportModal/, "Realtime replacements cannot refresh a currently open report.");
assert.match(client, /function updateScoutReportLifecycle[\s\S]*?modal\.close\(\)[\s\S]*?showLogModal[\s\S]*?renderCities\(true\)/, "Exact client expiration is not removed from all intelligence views.");
assert.match(client, /function renderHudStatusPanels[\s\S]*?updateScoutReportLifecycle\(\)/, "Scout expiration is not checked by the one-second UI lifecycle.");
assert.match(server, /function createIslandReportProjection[\s\S]*?troopCount:\s*0[\s\S]*?scoutReport:\s*null/, "Public island projections expose exact scout intelligence.");

assert.match(guide, /Successful intelligence lasts for ten minutes from arrival[\s\S]*?failed or blocked scouts do not refresh it/i);
assert.match(rules, /Successful scout intelligence expires ten minutes after the scout arrives/i);

console.log("Validated ten-minute scout intelligence, stable replacement, exact expiry, cleanup, and private projections.");
