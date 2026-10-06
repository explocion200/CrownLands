"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const config = require("../functions/economy-config.json");
function extract(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, `Missing ${name}`);
  const rest = source.slice(start), end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const shared = { ECONOMY_CONFIG: config, safeNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback };
const backend = vm.createContext({ ...shared });
vm.runInContext(extract(server, "getRewardCampPowerTier") + extract(server, "getRewardCampDailyReward"), backend);
const frontend = vm.createContext({ ...shared, state: { globalStats: { uid: "ruler", version: 13, kingPower: 1,
  baseGoldPerHour: 123457, baseTroopPerHour: 234567, goldPerHour: 999999, troopPerHour: 999999 } },
  usesServerEconomyAuthority: () => true, hasUsableGlobalStats: value => Boolean(value),
  getCurrentOnlineUid: () => "ruler", KING_POWER_AUTHORITY_VERSION: 13,
  normalizeGlobalStatsSnapshot: value => value });
for (const name of ["getRewardCampPowerTier", "getCurrentRewardCampPowerTier", "getRewardCampEstimatedRewards"]) {
  vm.runInContext(extract(client, name), frontend);
}
const cases = [[0,"weak",3], [7813452,"weak",3], [7813453,"middle",1],
  [192405409,"middle",1], [192405410,"strong",0.5], [Number.MAX_SAFE_INTEGER,"strong",0.5]];
for (const [power, tier, multiplier] of cases) {
  const result = backend.getRewardCampPowerTier(power);
  assert.equal(result.tier, tier);
  assert.equal(result.multiplier, multiplier);
  assert.equal(JSON.stringify(frontend.getRewardCampPowerTier(power)), JSON.stringify(result));
  frontend.state.globalStats.kingPower = power;
  for (const type of ["gold", "troops"]) {
    const schedule = config.camps[type].rewardSchedule;
    const camp = { rewardType: type, dailyRewards: schedule.map(r => r.minimumReward), rewardHours: schedule.map(r => r.productionHours) };
    const rate = type === "gold" ? 123457 : 234567;
    const estimates = frontend.getRewardCampEstimatedRewards(camp);
    for (let claim = 0; claim < 4; claim++) {
      const expected = Math.max(schedule[claim].minimumReward, Math.floor(rate * [0.5,1,1.5,2][claim] * multiplier));
      assert.equal(backend.getRewardCampDailyReward(camp, claim, frontend.state.globalStats, multiplier), expected);
      assert.equal(estimates[claim], expected, "Preview/payout mismatch");
      assert.equal(backend.getRewardCampDailyReward(camp, claim, {baseGoldPerHour:1,baseTroopPerHour:1}, multiplier), schedule[claim].minimumReward);
    }
    assert.equal(backend.getRewardCampDailyReward(camp, 4, frontend.state.globalStats, multiplier), 0);
  }
}
for (const invalid of [undefined, null, -1, NaN, Infinity, 1.5, "500", Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(backend.getRewardCampPowerTier(invalid), null);
  assert.equal(frontend.getRewardCampPowerTier(invalid), null);
}
for (const stats of [null, {version:11,kingPower:1}, {version:13}, {version:13,uid:"other",kingPower:1}]) {
  frontend.state.globalStats = stats;
  assert.equal(frontend.getCurrentRewardCampPowerTier(), null);
  assert.equal(frontend.getRewardCampEstimatedRewards({ dailyRewards:[20000] }).length, 0);
}
async function main() {
  let calculatedPower = 7813453, seen;
  const transaction = { get: async ref => ({ ref, exists: true, data: () => ({}) }) };
  const reader = vm.createContext({ ...shared, RESET_GENERATION:"season", ONLINE_WORLD_ID:"world",
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code=code; } }, safeString: value => String(value || ""),
    clanWorldBenefitsRef: () => "benefits", activeArmiesQueryForPlayer: () => "armies", heldRewardCampsQueryForPlayer: () => "camps",
    createActiveArmiesFromSnapshot: (_uid, snap) => [snap.ref], createHeldCampEntriesFromSnapshot: (_uid, snap) => [snap.ref],
    combinePlayerObjectiveBonuses: () => ({ troopBonusPercent:8 }),
    createGlobalStatsSnapshot: value => { seen=value; return {kingPower:calculatedPower}; } });
  vm.runInContext(extract(server, "getRewardCampPowerTier") + extract(server, "readRewardCampPowerTier"), reader);
  const profile = {resetGeneration:"season",worldId:"world",kingPower:0}, cities=[{city:{id:"home"}}];
  assert.equal((await reader.readRewardCampPowerTier(transaction,"ruler",profile,cities,123)).tier,"middle");
  assert.equal(seen.activeArmies[0],"armies"); assert.equal(seen.heldCamps[0],"camps");
  assert.equal(seen.bonuses.troopBonusPercent,8); assert.equal(seen.nowMs,123);
  calculatedPower=192405410;
  assert.equal((await reader.readRewardCampPowerTier(transaction,"ruler",profile,cities,124)).tier,"strong");
  calculatedPower=NaN;
  await assert.rejects(reader.readRewardCampPowerTier(transaction,"ruler",profile,cities,125),/unavailable/);
  await assert.rejects(reader.readRewardCampPowerTier(transaction,"ruler",{},cities,125),/unavailable/);
  await assert.rejects(reader.readRewardCampPowerTier(transaction,"ruler",profile,[],125),/unavailable/);
  const payout = extract(server,"resolveRewardCampPayoutByRef");
  assert(payout.indexOf("await readRewardCampPowerTier") < payout.indexOf("transaction.set("), "Power must be read before reward writes");
  assert.match(payout,/powerTier\.multiplier\)/);
  assert.match(payout,/payoutReceiptSnap\?\.exists/);
  console.log("Camp power thresholds, multipliers, raw production, minimums, rounding, preview parity, missing power and transactional power reads passed.");
}
main().catch(error => { console.error(error); process.exitCode=1; });
