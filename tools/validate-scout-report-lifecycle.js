const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const server = read("functions/index.js");
const guide = read("how-to-play.html");
const rules = read("game-rules.html");
const indexes = read("firestore.indexes.json");
const styles = read("styles.css");

function functionBody(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing.`);
  const nextFunction = source.indexOf("\nfunction ", start + marker.length);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

assert.match(client, /const SCOUT_REPORT_SECONDS = 600;/, "The client scout lifetime is not ten minutes.");
assert.match(server, /const SCOUT_REPORT_SECONDS = 600;/, "The server scout lifetime is not ten minutes.");
assert.match(client, /const BATTLE_REPORT_RETENTION_MS = 24 \* 60 \* 60 \* 1000;/, "The client battle-report lifetime is not 24 hours.");
assert.match(server, /const BATTLE_REPORT_RETENTION_MS = 24 \* 60 \* 60 \* 1000;/, "The server battle-report lifetime is not 24 hours.");
assert.match(client, /const LEGACY_SCOUT_REPORT_SECONDS = 120;/, "Legacy scout reports could be retroactively extended.");
assert.match(server, /expiresAtMs:\s*nowMs \+ SCOUT_REPORT_SECONDS \* 1000/, "Server scout snapshots do not expire from arrival time.");

assert.match(server, /function getCurrentScoutReportId[\s\S]*?sha256[\s\S]*?uid[\s\S]*?cityId/, "Successful scout reports lack a stable player-target identity.");
assert.match(server, /function writeReport[\s\S]*?isSuccessfulScoutIntelReport[\s\S]*?existing\.cityId[\s\S]*?report\.cityId[\s\S]*?merge: false/, "New scout intelligence does not atomically replace the existing target report.");
assert.match(server, /function pruneExpiredScoutReportMap[\s\S]*?expiresAtMs <= nowMs/, "Profile scout intelligence is not invalid at the exact expiration boundary.");
assert.match(server, /function deleteRemovedScoutReportEntries[\s\S]*?new FieldPath\("scoutReports", cityId\)[\s\S]*?FieldValue\.delete/, "Expired scout-map entries are not removed from merged Firestore profiles.");
assert.match(server, /function isBattleReportHistoryExpired[\s\S]*?getScoutIntelExpiresAtMs[\s\S]*?BATTLE_REPORT_RETENTION_MS/, "Server report history does not separate scout expiry from the 24-hour battle lifetime.");
assert.match(server, /function pruneExpiredBattleScoutReports[\s\S]*?isBattleReportHistoryExpired[\s\S]*?successfulScoutIndexByCity/, "Battle Reports do not expire and replace successful intelligence per target.");
assert.match(server, /function cleanupExpiredReportDocuments[\s\S]*?where\("scoutReport\.expiresAtMs", "<=", nowMs\)[\s\S]*?where\("createdAtMs", "<=", battleCutoffMs\)[\s\S]*?\.delete\(doc\.ref, \{ lastUpdateTime: doc\.updateTime \}\)/, "Scheduled cleanup does not delete expired reports safely.");
assert.match(server, /function cleanupExpiredReportDocuments[\s\S]*?battleSnapshots[\s\S]*?occurredAtMs[\s\S]*?battleSnapshotDeletions/, "Expired detailed battle snapshots are not cleaned with their report history.");
assert.match(server, /exports\.maintainGameServer[\s\S]*?cleanupExpiredReportDocuments/, "Expired report-document cleanup is not scheduled.");
assert.match(indexes, /"collectionGroup": "serverReports"[\s\S]*?"fieldPath": "createdAtMs"[\s\S]*?"queryScope": "COLLECTION_GROUP"/, "The 24-hour report cleanup query lacks its collection-group index.");
assert.match(indexes, /"collectionGroup": "serverReports"[\s\S]*?"fieldPath": "scoutReport\.expiresAtMs"[\s\S]*?"queryScope": "COLLECTION_GROUP"/, "The scout-expiry cleanup query lacks its collection-group index.");

assert.match(client, /function getBattleReportHistoryExpiresAtMs[\s\S]*?getScoutBattleReportExpiresAtMs[\s\S]*?BATTLE_REPORT_RETENTION_MS/, "The browser does not separate scout expiry from the 24-hour battle lifetime.");
assert.match(client, /function normalizeBattleReports[\s\S]*?historyExpiresAtMs <= nowMs[\s\S]*?successfulScoutIndexByCity/, "The browser does not hide expired report history or duplicate scout intelligence.");
assert.match(client, /function mergeServerReports[\s\S]*?appliedServerReportRevisions[\s\S]*?refreshedScoutCityIds[\s\S]*?showScoutReportModal/, "Realtime replacements cannot refresh a currently open report.");
assert.match(client, /function updateScoutReportLifecycle[\s\S]*?modal\.close\(\)[\s\S]*?showLogModal[\s\S]*?renderCities\(true\)/, "Exact client expiration is not removed from all intelligence views.");
assert.match(client, /function renderHudStatusPanels[\s\S]*?updateScoutReportLifecycle\(\)/, "Scout expiration is not checked by the one-second UI lifecycle.");
assert.match(client, /function isArrivedScoutMission[\s\S]*?army\.kind !== "scout"[\s\S]*?arrivesAtMs <= nowMs[\s\S]*?remaining <= 0/, "Arrived scouts do not have a precise client visibility boundary.");
assert.match(client, /function getRenderableArmies[\s\S]*?state\.attacks\.filter\(army => !isArrivedScoutMission\(army\)\)[\s\S]*?onlineArmies[\s\S]*?filter\(army => !isArrivedScoutMission\(army\)\)[\s\S]*?pendingOutgoingMissions[\s\S]*?filter\(mission => !isArrivedScoutMission\(mission\)\)/, "Arrived scouts can remain visible while their reports settle.");
assert.match(client, /function getPendingScoutMission[\s\S]*?!isArrivedScoutMission\(attack\)/, "An arrived scout can continue blocking a new scout order while its report settles.");
assert.match(client, /async function resolveServerArmyMission[\s\S]*?api\.resolveArmyOrder[\s\S]*?applyServerArmyResult\(result,\s*\{\s*movement:\s*mission\s*\}\)[\s\S]*?loadServerReportsOnce/, "Hidden arrived scouts do not continue through authoritative report settlement.");
assert.match(server, /function createIslandReportProjection[\s\S]*?troopCount:\s*0[\s\S]*?scoutReport:\s*null/, "Public island projections expose exact scout intelligence.");

assert.match(server, /function createDefenderScoutDisclosure[\s\S]*?ownerTroops[\s\S]*?reinforcements[\s\S]*?wallIntegrityBps[\s\S]*?skills/, "Defenders do not receive a complete record of the intelligence exposed.");
assert.match(server, /function createDefenderScoutActivityReport[\s\S]*?scoutPerspective:\s*"defender"[\s\S]*?sourceCityId[\s\S]*?sourceCityName[\s\S]*?sourceRegionId[\s\S]*?scoutDisclosure/, "Defender scout reports do not identify their perspective and source holding.");
assert.equal((server.match(/const defenderReport = createDefenderScoutActivityReport\(/g) || []).length, 2, "Successful city and camp scouts do not both notify their defender.");
assert.equal((server.match(/writeReport\(transaction, defenderUid, defenderReport, defenderProfileSnap\);/g) || []).length >= 2, true, "Defender scout reports are not persisted privately.");
assert.match(client, /function normalizeDefenderScoutDisclosure[\s\S]*?reinforcements[\s\S]*?skills/, "The browser does not normalize the exposed scout snapshot.");
assert.match(client, /function isDefenderScoutReport[\s\S]*?scoutPerspective === "defender"/, "The browser cannot distinguish a defender notice from attacker intelligence.");
const defenderScoutRenderer = functionBody(client, "renderDefenderScoutReportDetail");
["You were scouted", "Scouted from", "When you were scouted", "What they saw", "Reinforcements they saw", "Skill levels and bonuses they saw"].forEach(label => {
  assert.match(defenderScoutRenderer, new RegExp(label), `Defender report details are missing: ${label}.`);
});
assert.match(client, /function getBattleReportBadge[\s\S]*?YOU WERE SCOUTED/, "The defender scout report badge is ambiguous.");
assert.match(styles, /\.scouted-report-alert[\s\S]*?\.scouted-report-route[\s\S]*?\.scouted-report-metrics[\s\S]*?@media \(max-width: 620px\)/, "Defender scout reports lack readable responsive styling.");

const crypto = require("node:crypto");
const defenderReportSandbox = {
  SKILL_ORDER: ["shieldwallDiscipline", "stoneworks"],
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  safeString: (value, max = 80) => String(value || "").slice(0, max),
  normalizePlayerName: (value, fallback = "Ruler") => String(value || fallback),
  normalizeServerFlag: value => value || { symbol: "crown" },
  clampInt: (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0))),
  clampCityLevel: value => Math.max(1, Math.floor(Number(value) || 1)),
  normalizeRegionId: value => String(value || "island_1"),
  crypto,
  makeReport: value => ({ ...value, scoutReport: null, expiresAtMs: 123 }),
};
vm.createContext(defenderReportSandbox);
[
  "createDefenderScoutDisclosure",
  "createDefenderScoutActivityReport",
].forEach(name => vm.runInContext(`${functionBody(server, name)}; this.${name} = ${name};`, defenderReportSandbox));
const defenderNotice = defenderReportSandbox.createDefenderScoutActivityReport({
  army: { id: "army_1", fromId: "city_a", fromName: "Red Keep", sourceRegionId: "island_2" },
  source: { id: "city_a", name: "Red Keep", regionId: "island_2" },
  target: { id: "city_b", name: "Blue Keep", regionId: "island_1" },
  attackerUid: "attacker",
  attackerName: "Red Ruler",
  defenderUid: "defender",
  scoutReport: {
    targetType: "city",
    troops: 1500,
    ownerTroops: 1000,
    reinforcementTroops: 500,
    reinforcements: [{ ownerUid: "ally", ownerName: "Ally", troops: 500 }],
    totalDefense: 3200,
    cityLevel: 20,
    fortification: { integrityBps: 7500 },
    shieldwallDisciplineLevel: 4,
    shieldwallDisciplinePercent: 8,
    stoneworksLevel: 3,
    stoneworksPercent: 9,
  },
  nowMs: 2_000_000_000_000,
});
assert.equal(defenderNotice.scoutPerspective, "defender", "The notice lacks the defender perspective.");
assert.equal(defenderNotice.sourceCityName, "Red Keep", "The notice lost the scout's source city.");
assert.equal(defenderNotice.scoutDisclosure.reinforcements[0].troops, 500, "The defender cannot see which reinforcement amount was exposed.");
assert.equal(defenderNotice.scoutDisclosure.wallIntegrityBps, 7500, "The exposed wall snapshot was lost.");
assert.equal(Object.hasOwn(defenderNotice, "scoutReport"), false, "A defender notice was incorrectly made into expiring attacker intelligence.");

const nowMs = 2_000_000_000_000;
const retentionMs = 24 * 60 * 60 * 1000;
const lifecycleSandbox = {
  BATTLE_REPORT_RETENTION_MS: retentionMs,
  timestampToMs: value => Math.max(0, Number(value) || 0),
};
vm.createContext(lifecycleSandbox);
[
  "isSuccessfulScoutIntelReport",
  "getScoutIntelExpiresAtMs",
  "getBattleReportOccurredAtMs",
  "isBattleReportHistoryExpired",
].forEach(name => vm.runInContext(`${functionBody(server, name)}; this.${name} = ${name};`, lifecycleSandbox));
assert.equal(lifecycleSandbox.isBattleReportHistoryExpired({ type: "attack", occurredAtMs: nowMs - retentionMs + 1 }, nowMs), false, "An attack report expired before 24 hours.");
assert.equal(lifecycleSandbox.isBattleReportHistoryExpired({ type: "defense", occurredAtMs: nowMs - retentionMs }, nowMs), true, "A defense report survived the exact 24-hour boundary.");
assert.equal(lifecycleSandbox.isBattleReportHistoryExpired({ type: "scout", scoutReport: { expiresAtMs: nowMs + 1 }, expiresAtMs: nowMs + 1 }, nowMs), false, "A scout report expired before its intelligence.");
assert.equal(lifecycleSandbox.isBattleReportHistoryExpired({ type: "scout", scoutReport: { expiresAtMs: nowMs }, expiresAtMs: nowMs }, nowMs), true, "A scout report survived the exact intelligence-expiry boundary.");

const arrivalSandbox = {
  normalizeTimestampMs: value => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : 0;
  },
};
vm.createContext(arrivalSandbox);
vm.runInContext(`${functionBody(client, "isArrivedScoutMission")}; this.isArrivedScoutMission = isArrivedScoutMission;`, arrivalSandbox);
assert.equal(arrivalSandbox.isArrivedScoutMission({ kind: "scout", arrivesAtMs: nowMs + 1 }, nowMs), false, "A scout vanished before arrival.");
assert.equal(arrivalSandbox.isArrivedScoutMission({ kind: "scout", arrivesAtMs: nowMs }, nowMs), true, "A scout remained visible at the exact arrival boundary.");
assert.equal(arrivalSandbox.isArrivedScoutMission({ kind: "scout", remaining: 0 }, nowMs), true, "A legacy scout with a zero timer remained visible.");
assert.equal(arrivalSandbox.isArrivedScoutMission({ kind: "attack", arrivesAtMs: nowMs }, nowMs), false, "The scout-only cleanup hid a non-scout army.");

assert.match(guide, /Successful intelligence lasts for ten minutes from arrival[\s\S]*?entry is removed from Reports[\s\S]*?Attack and defense reports remain available for 24 hours/i);
assert.match(rules, /Successful scout intelligence expires ten minutes after the scout arrives[\s\S]*?Reports entry disappears[\s\S]*?Attack and defense reports expire 24 hours/i);

console.log("Validated scout arrival cleanup, ten-minute intelligence, 24-hour history, defender exposure notices, and private projections.");
