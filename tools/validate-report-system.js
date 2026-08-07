const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const api = read("firebaseClient.js");
const server = read("functions/index.js");
const rules = read("firestore.rules");
const markup = read("index.html");
const styles = read("styles.css");

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing.`);
  const nextFunction = source.indexOf("\nfunction ", start + marker.length);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

assert.match(server, /occurredAtMs:\s*nowMs,[\s\S]*?createdAtMs:\s*nowMs/, "Server reports lack an authoritative occurrence timestamp.");
assert.match(server, /exports\.markReportsViewed\s*=\s*onCall[\s\S]*?reportsViewedAtMs[\s\S]*?Math\.min\(nowMs/, "The server read marker is missing or not bounded by server time.");
assert.match(api, /async function markReportsViewed[\s\S]*?callServerFunction\("markReportsViewed"/, "The report read marker is not exposed by the Firebase client.");
assert.match(rules, /profileFieldUnchanged\('reportsViewedAtMs'\)/, "Players can write their own authoritative report read marker.");
assert.match(markup, /id="reportUnreadBadge"[\s\S]*?report-unread-badge/, "The Reports button unread badge is missing.");
assert.match(styles, /\.report-unread-badge[\s\S]*?position:\s*absolute/, "The unread badge is not positioned on the Reports button.");

["getBattleReportAgeSeconds", "compareBattleReportsNewestFirst", "renderBattleReportCard", "renderDetailedBattleReport", "renderLegacyBattleReportDetail"]
  .forEach(name => assert.doesNotMatch(
    functionBody(client, name),
    /state\.gameSeconds/,
    `${name} must use report timestamps instead of gameSeconds.`
  ));

assert.match(client, /function updateScoutReportLifecycle[\s\S]*?data-report-occurred-at-ms[\s\S]*?toLocaleString/, "Visible report ages are not refreshed from wall-clock time.");
assert.match(client, /function compareBattleReportsNewestFirst[\s\S]*?getBattleReportOccurredAtMs/, "Reports are not sorted by authoritative occurrence time.");
assert.match(client, /function mergeServerReports[\s\S]*?audioServerReportsHydrated[\s\S]*?markLoadedReportsViewed/, "Realtime hydration and open-panel arrivals are not handled by the existing report stream.");
assert.match(client, /reportsViewedPendingAtMs[\s\S]*?while \(reportsViewedPendingAtMs > normalizeTimestampMs\(state\.reportsViewedAtMs\)\)/, "Concurrent report read markers can skip a later report.");
const markViewed = functionBody(client, "markLoadedReportsViewed");
assert.match(markViewed, /confirmedViewedAtMs < requestedViewedAtMs[\s\S]*?reportsViewedPendingAtMs = 0[\s\S]*?break/, "A server-clamped read marker can retry forever.");
assert.doesNotMatch(markViewed, /state\.reportsViewedAtMs\s*=\s*Math\.max\(\s*normalizeTimestampMs\(state\.reportsViewedAtMs\),\s*confirmedViewedAtMs,\s*requestedViewedAtMs/, "The client can advance the read marker beyond the server-confirmed time.");

const battleDetail = functionBody(client, "renderDetailedBattleReport");
assert.match(battleDetail, /Why this battle ended this way/, "Detailed battle reports lack a plain-language outcome summary.");
assert.match(battleDetail, /battle-attacker-column[\s\S]*?battle-defender-column/, "Attacker and defender are not kept in aligned columns.");
assert.match(battleDetail, /Starting forces[\s\S]*?Base power[\s\S]*?Training[\s\S]*?Attack and walls[\s\S]*?Objectives[\s\S]*?Final power[\s\S]*?Losses[\s\S]*?Result/, "The battle comparison omits required battle-time factors.");
assert.doesNotMatch(battleDetail, /Power ratio|Capture threshold|coefficient|formula/i, "The battle report exposes combat formula details.");
assert.match(server, /attackPowerBreakdown/, "Battle snapshots do not preserve named attack-power components.");
const getBattleAttackerBasePower = new Function(
  "safeNumber",
  `${functionBody(server, "getBattleAttackerBasePower")}; return getBattleAttackerBasePower;`
)((value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback);
assert.equal(
  getBattleAttackerBasePower({ troops: 100, effectivePower: 200, bonusPercent: 60, attackPowerPerTroop: 2 }),
  125,
  "New battle reports do not preserve the 1.25 base-power component."
);
assert.equal(
  getBattleAttackerBasePower({ troops: 100, effectivePower: 320, bonusPercent: 60, attackPowerPerTroop: 3.2 }),
  200,
  "Pre-rebalance battle reports rewrite the army's launch-time base power."
);
assert.match(server, /defensePowerBreakdown[\s\S]*?otherDefensePower/, "Battle snapshots do not preserve named defense-power components.");
assert.match(server, /reinforcements:\s*reinforcementRows[\s\S]*?occurredAtMs:\s*nowMs/, "Battle snapshots do not preserve reinforcements and occurrence time.");
assert.match(client, /historicalWallDetailsAvailable:\s*hasHistoricalWallSnapshot/, "Older battle snapshots do not safely normalize wall details.");
assert.match(battleDetail, /defenseBreakdown\.historicalWallDetailsAvailable\s*\?\s*renderBattlePairedRow\("Attack and walls"/, "Battle reports show unavailable historical wall components as zeroes.");

assert.match(client, /function showBattleReportDetail[\s\S]*?showScoutReportModal\(report\.cityId\)/, "Successful Scout entries do not open the detailed scout presentation.");
assert.match(client, /fixed intelligence snapshot from when the scout arrived/i, "Scout details do not explain their snapshot timing.");
assert.match(client, /function renderScoutAttemptReportDetail[\s\S]*?Failed, blocked, replaced, or expired scouts/, "Unavailable scout intelligence is not explained safely.");
assert.match(client, /function updateScoutReportLifecycle[\s\S]*?delete modal\.dataset\.scoutReportCityId;[\s\S]*?showLogModal\(\{ silentAudio: true \}\)/, "Expired scout details do not return the player to Reports.");
assert.match(server, /function pruneExpiredBattleScoutReports[\s\S]*?scoutReport:\s*null[\s\S]*?Scout intelligence expired/, "Expired scout history is not retained with its intelligence redacted.");
assert.match(server, /function cleanupExpiredScoutReportDocuments[\s\S]*?scoutReport:\s*FieldValue\.delete\(\)/, "Expired Firestore scout documents are not redacted.");

console.log("Validated server-timed unread Reports, authoritative ages, detailed battle explanations, and expiring scout intelligence.");
