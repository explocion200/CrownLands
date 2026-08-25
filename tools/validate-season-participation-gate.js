const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const resetGate = fs.readFileSync(path.join(root, "functions", "test", "emulator-reset-gate.js"), "utf8");

function callableSource(name, nextMarker) {
  const start = server.indexOf(`exports.${name} =`);
  assert.notEqual(start, -1, `Missing ${name} callable.`);
  const end = nextMarker ? server.indexOf(nextMarker, start) : server.length;
  assert.notEqual(end, -1, `Missing end marker for ${name}.`);
  return server.slice(start, end);
}

assert.match(
  server,
  /async function requireCurrentSeasonParticipation[\s\S]*?assertCurrentPlayerProfile[\s\S]*?getCurrentSeasonMainCityContext[\s\S]*?transaction\.get\(mainCityContext\.ref\)[\s\S]*?assertCurrentSeasonMainCity/,
  "The server-authoritative season participation guard is incomplete."
);
assert.match(
  server,
  /function assertCurrentSeasonMainCity[\s\S]*?resetGeneration[\s\S]*?worldId[\s\S]*?ownerKind[\s\S]*?getOwnerUid\(city\) !== uid[\s\S]*?isStronghold/,
  "The season participation guard no longer validates the authoritative main city."
);

const economySource = server.slice(
  server.indexOf("async function prepareEconomyCollection"),
  server.indexOf("function createPatchedCityEntriesForStats")
);
assert.match(
  economySource,
  /requireCurrentSeasonParticipation\(transaction, uid/,
  "The shared economy path is not protected by the season participation guard."
);

for (const [name, nextMarker] of [
  ["markReportsViewed", "exports.markRealmAnnouncementSeen ="],
  ["markRealmAnnouncementSeen", "function createIslandReportProjection"],
  ["openCommonGearBox", "exports.viewCommonGearBuilding ="],
  ["viewCommonGearBuilding", "async function mutateCommonGearLoadout"],
  ["reserveHarvestBonusSpawn", "exports.repairMainCityAssignment ="],
  ["saveSkillPreset", "exports.renameSkillPreset ="],
  ["renameSkillPreset", "exports.applySkillPreset ="],
  ["sendChatMessage", "exports.createClan ="],
]) {
  assert.match(
    callableSource(name, nextMarker),
    /requireCurrentSeasonParticipation\(/,
    `${name} bypasses the season participation guard.`
  );
}

assert.match(
  callableSource("syncPlayerIdentity", "exports.recalculatePlayerGlobalStats ="),
  /verifyCurrentSeasonParticipation\(uid\)/,
  "Identity synchronization can rebuild current-season rankings before claim."
);
assert.match(
  callableSource("getDailyLoginRewardStatus", "exports.claimDailyLoginReward ="),
  /requireCurrentSeasonParticipation\(/,
  "Daily login attendance can mutate before season claim."
);

for (const action of [
  "collectEconomy",
  "getCommonGearStatus",
  "purchaseCommonGearBox",
  "openCommonGearBox",
  "equipCommonGear",
  "unequipCommonGear",
  "upgradeCommonGear",
  "viewCommonGearBuilding",
  "reserveHarvestBonusSpawn",
  "collectHarvestBonus",
  "purchaseShopItem",
  "getDailyLoginRewardStatus",
  "getDailyMissionStatus",
  "getSeasonalAchievementStatus",
  "syncPlayerIdentity",
  "markReportsViewed",
  "markRealmAnnouncementSeen",
]) {
  assert.ok(
    resetGate.includes(`["${action}"`),
    `The reset emulator gate does not exercise pre-claim ${action}.`
  );
}
assert.match(
  resetGate,
  /preclaim_upgrade_target[\s\S]*?spentGold > 0/,
  "The reset emulator gate does not prove that Gear upgrades are blocked before claim and positively priced after claim."
);

console.log("Season participation gate validation passed.");
