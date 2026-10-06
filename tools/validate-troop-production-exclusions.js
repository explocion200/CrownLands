"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const policy = require("../functions/troop-production-policy");
const { buildPlan, FIELD, NAMES } = require("./admin-troop-production-exclusions");
const root = path.resolve(__dirname, "..");
const server = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const client = fs.readFileSync(path.join(root, "game.js"), "utf8");
const config = require("../functions/economy-config.json");
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  let index = source.indexOf("(", start), depth = 0;
  do { if (source[index] === "(") depth++; if (source[index] === ")") depth--; index++; } while (depth);
  index = source.indexOf("{", index);
  do { if (source[index] === "{") depth++; if (source[index] === "}") depth--; index++; } while (depth);
  return source.slice(start, index);
}
const now = Date.UTC(2026, 9, 3), window = { startsAtMs: now, expiresAtMs: now + 20 * 86400000 };
const factor = config.cityEconomy.troopsPerVictoryPoint;
assert.equal(policy.DURATION_MS, 1728000000);
const c = vm.createContext({ CITY_LEVEL_STATS: { troopProductionPerVictoryPoint: factor } });
vm.runInContext(extract(client, "getTroopBaseFactor"), c);
for (const value of [null, {}, window, { ...window, expiresAtMs: window.expiresAtMs + 1 }, { startsAtMs: 0, expiresAtMs: policy.DURATION_MS }]) {
  for (const time of [now - 1, now, window.expiresAtMs - 1, window.expiresAtMs, window.expiresAtMs + 1]) {
    assert.equal(c.getTroopBaseFactor(value, time), policy.factorAt(value, time, factor));
  }
}
assert.equal(policy.factorAt(window, now - 1, factor), 10.815, "Pre-deployment production must retain its old rate.");
assert.equal(policy.factorAt(window, window.expiresAtMs - 1, factor), 10.815);
assert.equal(policy.factorAt(window, window.expiresAtMs, factor), factor);
const ratesAt = time => {
  const base = policy.factorAt(window, time, factor) === 10.815 ? 129 : 162;
  return { troopProductionPerSecond: base * 1.75 / 3600, baseTroopProductionPerHour: base };
};
const end = window.expiresAtMs, hour = 3600000;
const close = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
close(policy.integrate(window, end - hour, end + hour, ratesAt), (129 + 162) * 1.75);
close(policy.integrate(window, end - hour, end + hour, ratesAt, {
  startsAtMs: end - hour / 2, expiresAtMs: end + hour / 2, percent: 30,
}), (129 + 162) * (1.75 + 0.15));
close(policy.integrate(window, now - hour, now + hour, ratesAt), 129 * 1.75 * 2);
for (const boost of [{}, { expiresAtMs: end + hour, percent: 30 }, { startsAtMs: end + hour, expiresAtMs: end, percent: 30 }]) {
  close(policy.integrate(window, end - hour, end + hour, ratesAt, boost), (129 + 162) * 1.75);
}
assert.equal(policy.integrate(window, end, end, ratesAt), 0);

const s = vm.createContext({ TROOP_PRODUCTION_POLICY: policy, Date: class extends Date { static now() { return now; } },
  CITY_LEVEL_STATS: { victoryPointsBase: 6, victoryPointsPerLevel: 4, victoryPointsExponent: 1.35,
    victoryPointsExponentScale: 2, troopProductionPerVictoryPoint: factor },
  WAR_DRUMS_TROOP_PRODUCTION_BONUS_PERCENT: 30, ROYAL_TAX_DECREE_GOLD_PRODUCTION_BONUS_PERCENT: 50,
  safeNumber: (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback,
  safeString: v => String(v || ""), clampCityLevel: v => Math.max(1, Math.floor(Number(v) || 1)),
  isStronghold: city => city.kind === "stronghold", isRewardCamp: city => city.kind === "camp",
  getStrongholdDefenseLevel: () => 1, getCommonGearBonuses: profile => ({ troopProductionAllCities: profile.gearPercent || 0,
    goldProductionAllCities: 0, goldProductionMainCity: 0 }), getSkillPercent: (p, skill) => p[skill] || 0,
  getMillionLordsPassiveGoldPerHour: () => 1000, getCityStats: () => ({ totalDefense: 3000 }),
  getOwnerUid: city => city.ownerUid, getLevelUpTroopRewardHours: () => 54,
  normalizeCharacterProgress: char => ({ ...char }), getXpRequiredForLevel: () => 100,
  getLevelUpGoldReward: () => 123,
});
for (const name of ["getCityVictoryPoints", "getBaseCityTroopProductionPerHour", "calculateTroopProductionRates",
  "calculateGoldProductionRates", "getCityProductionStats", "getCityInfrastructurePowerComponents",
  "getLevelUpTroopReward", "applyXpToCharacter", "getRewardedAdBaseRates"]) vm.runInContext(extract(server, name), s);
for (const [level, oldRate, newRate] of [[1,129,162],[25,2811,3514],[100,15227,19034],[200,36349,45436]]) {
  const city = { level, ownerUid: "fixture" }, profile = { [FIELD]: window, royalGranaries: 75, gearPercent: 5 };
  const stats = s.getCityProductionStats(city, profile, { troopBonusPercent: 20 }, { nowMs: now });
  assert.equal(stats.baseTroopProductionPerHour, oldRate);
  close(stats.troopProductionPerHour, oldRate * 2);
  assert.equal(s.getCityProductionStats(city, profile, {}, { nowMs: end }).baseTroopProductionPerHour, newRate);
  const rewards = s.getRewardedAdBaseRates({ uid: "fixture", cityEntries: [{ city }], profileAfter: profile });
  assert.equal(rewards.troopsPerHour, oldRate, "Rewards must use the old raw base without bonuses.");
  assert.equal(rewards.goldPerHour, 1000);
  assert.equal(s.getLevelUpTroopReward(level, window, now), oldRate * 54);
  assert.equal(s.getLevelUpTroopReward(level, window, end), newRate * 54);
  const oldPower = s.getCityInfrastructurePowerComponents(city, {}, window, now);
  const newPower = s.getCityInfrastructurePowerComponents(city, {}, window, end);
  assert.equal(oldPower.replacementPower, 0);
  assert.equal(newPower.replacementPower, 0);
  assert.equal(oldPower.sustainableTroopPerHour, oldRate);
  assert.equal(newPower.sustainableTroopPerHour, newRate);
  assert.equal(oldPower.defensivePower, newPower.defensivePower);
}
const reward = s.applyXpToCharacter({ level: 99, xp: 0, skillPoints: 0 }, 200, window, now);
assert.equal(reward.levelsGained, 2);
assert.equal(reward.troopReward, s.getLevelUpTroopReward(100, window, now) + s.getLevelUpTroopReward(101, window, now));
assert.equal(reward.goldReward, 246);
assert.match(extract(server, "createFreshResetPlayerProfile"), /profile\.troopProduction25Exclusion = TROOP_PRODUCTION_POLICY\.normalize\(previous\.troopProduction25Exclusion\)/);

// Deployment planning is scoped, atomic, idempotent and never overwrites an existing window.
const value = v => typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } }
  : typeof v === "number" ? { integerValue: String(v) } : { stringValue: v };
const doc = (name, fields) => ({ name, fields: value(fields).mapValue.fields, updateTime: "version-one" });
const identity = { worldId: "main-realm-2026-10", resetGeneration: "realm-2026-10", realmShardId: "shard_0001" };
const pointer = doc("realmConfig/current", { ...identity, sharedRealmId: identity.realmShardId, resetReadinessStatus: "ready" });
const profiles = NAMES.map((playerName, i) => doc(`players/fixture-${i}`, { ...identity, playerName }));
const plan = buildPlan(pointer, profiles, now, identity);
assert.equal(plan.writes.length, 2);
assert(plan.writes.every(write => write.currentDocument.updateTime === "version-one"));
assert(plan.writes.every(write => write.updateMask.fieldPaths.join() === FIELD));
const activated = profiles.map(profile => ({ ...profile, fields: { ...profile.fields, [FIELD]: value(window) } }));
assert.equal(buildPlan(pointer, activated, now, identity).writes.length, 0);
assert.equal(buildPlan(pointer, activated, now, identity).hash, plan.hash);
assert.throws(() => buildPlan(pointer, activated, now + 1, identity), /cannot be changed/);
assert.throws(() => buildPlan(pointer, [profiles[0], profiles[0]], now, identity), /distinct/);
assert.throws(() => buildPlan(pointer, profiles, now, { ...identity, realmShardId: "other" }), /realm changed/);
assert.throws(() => buildPlan(pointer, profiles.slice(0, 1), now, identity), /two accounts/);
console.log("Troop exceptions passed: exact expiry, pre-deployment accrual, timed bonuses, rewards, King Power, client parity and safe deployment planning.");
