const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const client = read("game.js");
const api = read("firebaseClient.js");
const server = read("functions/index.js");
const rules = read("firestore.rules");
const markup = read("index.html");
const styles = `${read("styles.css")}\n${read("interface-theme.css")}\n${read("ui-contrast-correction.css")}`;

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
assert.doesNotMatch(
  rules.slice(rules.indexOf("function validPlayerProfileUpdate"), rules.indexOf("function ownsCityOwnerIdentity")),
  /'reportsViewedAtMs'/,
  "Players can write their own authoritative report read marker."
);
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
assert.match(battleDetail, /getDetailedBattleViewerRole[\s\S]*?renderBattleReportNavigation[\s\S]*?renderBattleReportHero[\s\S]*?renderBattleComparisonSections[\s\S]*?renderBattleRewards/, "Detailed reports do not use the viewer-oriented visual report layout.");
assert.doesNotMatch(battleDetail, /Why this battle ended this way|Siege phases|Launch intelligence compared with arrival/, "Detailed reports still render verbose explanatory sections.");
assert.match(battleDetail, /viewerRole === "defender" \? defender : attacker[\s\S]*?viewerRole === "defender" \? attacker : defender/, "Defense reports do not place the viewer's side on the left.");
const visualDetails = functionBody(client, "renderBattleSideDetails");
assert.match(visualDetails, /Starting troops[\s\S]*?Base troop power[\s\S]*?Wall power at battle[\s\S]*?Final resolved power[\s\S]*?Troops lost[\s\S]*?Troops surviving/, "The visual comparison omits required battle-time values.");
const visualBonuses = functionBody(client, "getBattleSideBonusEntries");
assert.match(visualBonuses, /skillBonusPower[\s\S]*?Personal objective support[\s\S]*?Clan objective support[\s\S]*?Stoneworks[\s\S]*?wall power/, "The visual bonus cards do not separate troop, objective, and wall bonuses.");
const sideModel = functionBody(client, "getBattleSidePresentationModel");
assert.match(sideModel, /getDetailedBattleSideParticipants[\s\S]*?sumDetailedBattleParticipantPower/, "Battle participant power is not aggregated into visual side totals.");
assert.match(sideModel, /reinforcementCount[\s\S]*?reinforcementTroops/, "The visual defender summary omits reinforcement counts or troops.");
assert.match(functionBody(client, "formatBattleWallAfterStatus"), /Intact — 100%[\s\S]*?Breached — 0%[\s\S]*?Damaged —/, "Post-battle wall status labels are incomplete.");
assert.match(functionBody(client, "renderLegacyBattleReportDetail"), /renderBattleReportNavigation[\s\S]*?renderBattleReportHero[\s\S]*?renderLegacyBattleComparison[\s\S]*?renderBattleRewards/, "Historical battle reports do not use the visual fallback.");
assert.match(functionBody(client, "renderBattleRewards"), /getBattleReportCampReward[\s\S]*?renderCampReportRewardMetrics[\s\S]*?: \[/, "Camp payout reports do not replace generic battle rewards with their typed reward.");
assert.match(functionBody(client, "renderCampReportRewardMetrics"), /"Gold"[\s\S]*?"Troops"[\s\S]*?"City"[\s\S]*?"Location"[\s\S]*?"Item"[\s\S]*?"Amount"/, "Camp report rewards do not cover gold, troops, cities with locations, and item quantities.");
assert.match(functionBody(client, "getLegacyBattleSides"), /Not recorded/, "Historical reports fabricate unavailable power details.");
assert.match(functionBody(client, "showBattleReportDetail"), /!report\.battleId[\s\S]*?applyLegacyBattleFlags[\s\S]*?catch[\s\S]*?applyLegacyBattleFlags/, "Legacy and unavailable snapshot reports do not hydrate their side flags.");
assert.match(styles, /\.battle-visual-hero\s*\{[\s\S]*?grid-template-columns:[\s\S]*?\.battle-visual-two-column\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/, "Visual battle sides are not presented in aligned columns.");
assert.match(styles, /\.battle-report-hero-flag\.kingdom-flag-large[\s\S]*?width:\s*116px[\s\S]*?@media \(max-width: 760px\)[\s\S]*?\.battle-visual-hero/, "Large flags or the responsive visual report layout are missing.");
assert.match(styles, /\.battle-report-modal \.battle-visual-outcome,[\s\S]*?background:\s*transparent !important;[\s\S]*?\.battle-report-modal \.battle-visual-outcome > span[\s\S]*?color:\s*#fffdf5 !important;[\s\S]*?background:\s*linear-gradient\(180deg, #58735f, #2f4939\) !important;/, "Detailed Victory remains unreadable or retains the full red center block.");
assert.match(styles, /\.battle-report-modal \.battle-visual-outcome\.defeat > span[\s\S]*?background:\s*linear-gradient\(180deg, #62504d, #382d2c\) !important;/, "Detailed Defeat does not use the restrained outcome badge.");

const battleSandbox = {
  DEFENSE_COMBAT_VERSION: 1,
  currentUid: "attack-ally",
  Math,
  Number,
  formatNumber(value) {
    return String(Math.max(0, Math.floor(Number(value) || 0)));
  },
  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  },
  formatWallIntegrity(value) {
    return `${Math.floor((Number(value) || 0) / 100)}%`;
  },
  getCurrentOnlineUid() {
    return battleSandbox.currentUid;
  },
};
vm.createContext(battleSandbox);
[
  "splitBattleBonusPower",
  "normalizeBattlePowerBreakdown",
  "getDetailedBattleSideParticipants",
  "sumDetailedBattleParticipantPower",
  "formatBattleBasePowerHelp",
  "formatBattleWallAfterStatus",
  "getBattleSidePresentationModel",
  "getDetailedBattleViewerRole",
].forEach(name => vm.runInContext(`${functionBody(client, name)}; this.${name} = ${name};`, battleSandbox));
const battleSnapshot = {
  defenseCombatVersion: 1,
  attacker: { ownerUid: "attack-leader", ownerName: "Leader" },
  attackers: [
    { ownerUid: "attack-leader", powerBreakdown: { baseAttackPower: 125, swordmasteryBonusPower: 75 } },
    { ownerUid: "attack-ally", powerBreakdown: { baseAttackPower: 62, swordmasteryBonusPower: 38 } },
  ],
  defender: {
    ownerUid: "defender",
    ownerName: "Defender",
    powerBreakdown: {
      baseTroopDefensePower: 100,
      baseDefenseBonusPower: 30,
      shieldwallDisciplineBonusPower: 60,
      personalObjectiveBonusPower: 10,
      sharedClanBonusPower: 5,
    },
  },
  reinforcements: [{
    ownerUid: "defense-ally",
    powerBreakdown: {
      baseTroopDefensePower: 50,
      baseDefenseBonusPower: 15,
      shieldwallDisciplineBonusPower: 30,
      personalObjectiveBonusPower: 4,
      sharedClanBonusPower: 2,
    },
  }],
  totals: {
    attackers: 150,
    defenders: 150,
    attackPower: 300,
    defensePower: 506,
    attackerLosses: 100,
    defenderLosses: 60,
    attackerSurvivors: 50,
    defenderSurvivors: 90,
    attackPowerBreakdown: { baseAttackPower: 187, swordmasteryBonusPower: 113 },
    defensePowerBreakdown: { stoneworksWallBonusPower: 75, otherDefensePower: 0 },
  },
  siege: { startingWallPower: 200, endingIntegrityBps: 5_000 },
};
const attackerSide = battleSandbox.getBattleSidePresentationModel(battleSnapshot, "attacker");
const defenderSide = battleSandbox.getBattleSidePresentationModel(battleSnapshot, "defender");
const shieldwallOnlyBreakdown = battleSandbox.normalizeBattlePowerBreakdown({
  baseTroopDefensePower: 50,
  baseDefenseBonusPower: 15,
  shieldwallDisciplineBonusPower: 30,
  totalDefensePower: 95,
}, {
  startingTroops: 50,
  basePower: 65,
  effectivePower: 95,
  defenseCombatVersion: 1,
  personalDefenseBonusPercent: 0,
  sharedDefenseBonusPercent: 0,
}, "defender");
assert.equal(shieldwallOnlyBreakdown.personalObjectiveBonusPower, 0, "Shieldwall power is mislabeled as personal objective support.");
assert.equal(shieldwallOnlyBreakdown.sharedClanBonusPower, 0, "Shieldwall power is mislabeled as clan objective support.");
assert.equal(attackerSide.basePower, 187, "Rally base attack power is not aggregated.");
assert.equal(attackerSide.skillBonusPower, 113, "Rally Swordmastery power is not aggregated.");
assert.equal(defenderSide.basePower, 195, "Owner and reinforcement base defense are not aggregated.");
assert.equal(defenderSide.skillBonusPower, 90, "Owner and reinforcement Shieldwall power is not aggregated.");
assert.equal(defenderSide.personalObjectiveBonusPower, 14, "Personal objective support is not aggregated.");
assert.equal(defenderSide.sharedClanBonusPower, 7, "Shared objective support is not aggregated.");
assert.equal(defenderSide.wallPower, 200, "The visual defender side lost its battle-time wall power.");
assert.equal(defenderSide.wallStoneworksPower, 75, "Stoneworks is not isolated as wall power.");
assert.equal(defenderSide.wallAfter, "Damaged — 50% intact", "The compact defender side lost its post-battle wall status.");
assert.equal(battleSandbox.getDetailedBattleViewerRole(battleSnapshot, { type: "attack" }), "attacker", "A rally ally does not see the attacking side on the left.");
battleSandbox.currentUid = "defense-ally";
assert.equal(battleSandbox.getDetailedBattleViewerRole(battleSnapshot, { type: "defense" }), "defender", "A reinforcing ally does not see the defending side on the left.");
assert.equal(battleSandbox.formatBattleWallAfterStatus({ endingIntegrityBps: 10_000 }), "Intact — 100%");
assert.equal(battleSandbox.formatBattleWallAfterStatus({ endingIntegrityBps: 0 }), "Breached — 0%");
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

assert.match(client, /function showBattleReportDetail[\s\S]*?showScoutReportModal\(report\.cityId\)/, "Successful Scout entries do not open the detailed scout presentation.");
assert.doesNotMatch(client, /fixed intelligence snapshot from when the scout arrived/i, "Scout details still show the removed fixed-snapshot warning.");
assert.doesNotMatch(styles, /\.scout-report-snapshot-note/, "Removed scout snapshot-note styling is still present.");
assert.match(functionBody(client, "showScoutReportModal"), /data-scout-report-age[\s\S]*?data-scout-report-expires/, "Scout details lost their age or expiration timer.");
assert.match(functionBody(client, "showScoutReportModal"), /scout-report-city[\s\S]*?renderBattleReportLocateButton\([\s\S]*?cityId[\s\S]*?regionId:[\s\S]*?cityName:[\s\S]*?bindBattleReportJumpButtons\(\)/, "Successful Scout details do not render and bind the shared target-location button beside the city name.");
assert.match(client, /function renderScoutAttemptReportDetail[\s\S]*?Failed, blocked, replaced, or expired scouts/, "Unavailable scout intelligence is not explained safely.");
assert.match(client, /function updateScoutReportLifecycle[\s\S]*?delete modal\.dataset\.scoutReportCityId;[\s\S]*?showLogModal\(\{ silentAudio: true \}\)/, "Expired scout details do not return the player to Reports.");
assert.match(client, /function normalizeBattleReports[\s\S]*?historyExpiresAtMs && historyExpiresAtMs <= nowMs\) return;/, "Expired reports are not removed from the Reports list.");
assert.match(server, /function cleanupExpiredReportDocuments[\s\S]*?reportDeletions[\s\S]*?battleSnapshotDeletions/, "Expired report documents and detailed battle snapshots are not cleaned.");

console.log("Validated server-timed unread Reports, heraldic side comparisons, bonus separation, wall outcomes, and bounded report history.");
