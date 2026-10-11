"use strict";
const assert = require("node:assert/strict");
const E = require("../functions/estate-economy"), S = require("../functions/estate-services"), F = require("../functions/guild-facilities");
const M = require("../functions/guild-missions"), C = require("../guild-config"), R = require("../guild-rules");
const NOW = Date.UTC(2026, 9, 10), H = E.HOUR;
const realm = { resetGeneration: "realm-2026-10", worldId: "main-realm-2026-10", realmShardId: "shard_0001", endsAtMs: Date.UTC(2026, 10, 1), mainCityPath: "islands/test/cities/main", goldRate: 1000, troopRate: 400 };
function setup(level = 100, memberLevel = 10) {
  const state = E.initial(NOW), champions = {};
  for (const key in state.levels) state.levels[key] = level;
  for (const key of E.KEYS) state.stock[key] = 10000;
  for (const key of ["treasury", "barracks", "gatehouse", "royal-stables"]) state.entitlements[key] = 4;
  for (const type of Object.keys(C.types)) {
    const id = "champion_" + type;
    champions[id] = { id, name: C.types[type].name, quality: 4, level: memberLevel, xp: 0, active: true, questId: "", recoveryUntilMs: 0,
      guildVersion: 2, type, base: C.types[type].base.slice(), trait: C.types[type].trait, protectedCeiling: 100, matchingSuccesses: 0, ambitions: [], history: [] };
  }
  state.activeChampionIds = Object.keys(champions); M.initialize(state);
  return { state, champions };
}
const plan = (missionId = "escort", extra = {}) => ({ action: "guildMission", missionId, tier: 0, hours: missionId === "equipment" ? 8 : 2,
  championIds: ["champion_guard", "champion_scout"], leaderId: "champion_guard", route: "direct", approach: "balanced", meal: "none", officer: "treasury", ...extra });
const q = (s, input = plan(), now = NOW, context = realm) => M.quote(s.state, input, s.champions, now, context);
{
  const old = { id: "champion_old", name: "Original name", quality: 0, level: 61, xp: 255, recoveryUntilMs: 99, questId: "legacy_accepted" };
  const migrated = M.identity(old, { promisedLevel: 64, random: max => max - 1 });
  for (const [key, value] of Object.entries(old)) assert.deepEqual(migrated[key], value);
  assert.equal(migrated.protectedCeiling, 64);
  assert(migrated.base.every((n, i) => n === C.types[migrated.type].base[i] + 2));
  assert.deepEqual(M.identity(migrated, { random: () => { throw Error("Cannot reroll"); } }), migrated);
  const offered = M.identity({ id: "offer_001", quality: 0, name: "Common Champion", level: 1 }, { offer: true, random: () => 0 });
  assert.equal(offered.name, "Mara Stone"); assert.equal(offered.portraitId, "common-guard-01");
  assert(offered.base.every((n, i) => n === C.types.guard.base[i] - 2));
  const capped = { ...migrated, level: 64, xp: 999 };
  assert.deepEqual(R.advance(capped, 1000), { champion: capped, credited: 0 });
  const common = { ...offered, xp: 0, protectedCeiling: 20 };
  assert.equal(R.advance(common, 760).champion.level, 20);
  assert.equal(R.advance(common, 9999).credited, 760);
  const legacy = setup(); legacy.state.quests = [{ training: { [old.id]: { champion: { level: 80, xp: 3 } } } }]; legacy.champions[old.id] = old;
  M.migrate(legacy.state, legacy.champions); assert.equal(legacy.champions[old.id].protectedCeiling, 80);
}
// Adding any non-leader can only increase readiness or leave risk at its cap.
let combinations = 0;
for (const level of [1, 10, 20, 40, 60, 100]) for (const tier of [0, 1, 2, 3, 4]) for (const mission of C.missions) {
  const { champions } = setup(100, level), people = Object.values(champions);
  for (const leader of people) for (const other of people.filter(c => c.id !== leader.id)) {
    for (const route of Object.keys(C.routes)) for (const approach of Object.keys(C.approaches)) {
      const one = R.forecast(mission, tier, [leader], leader.id, { route, approach });
      const two = R.forecast(mission, tier, [leader, other], leader.id, { route, approach });
      assert(two.success >= one.success); assert.equal(two.target, one.target); assert.equal(two.leaderBonus, one.leaderBonus);
      assert(two.risk >= 5 && two.risk <= 75); assert(Math.abs(two.success + two.partial + two.failure - 100) < 1e-9);
      combinations++;
    }
  }
}
{
  const s = setup(1, 1), intro = q(s, plan("introduction", { championIds: ["champion_guard"] }));
  assert.equal(intro.durationMs, 300000); assert.equal(intro.food, 1); assert.equal(intro.forecast.success, 100);
  assert.equal(intro.training.success.champion_guard.credited, 10); assert.equal(intro.recoveryMs.success, 120000);
  const outcome = M.resolve(intro, () => 999); assert.equal(outcome.outcome, "success");
  M.launch(s.state, intro, "intro_once", s.champions, NOW);
  assert.throws(() => q(s, plan("introduction", { championIds: ["champion_scout"] })), /available/);
  assert.deepEqual(M.settle(s.state, s.champions, { intro_once: outcome }, NOW + 299999, realm), []);
  const reports = M.settle(s.state, s.champions, { intro_once: outcome }, NOW + 999999, realm);
  assert.equal(s.champions.champion_guard.recoveryUntilMs, NOW + 420000, "Recovery starts at accepted finish, not late login");
  assert.equal(s.champions.champion_guard.level, 2); assert.equal(s.champions.champion_guard.xp, 6);
  assert.equal(s.state.guild.reputation, 0); assert.deepEqual(s.state.guild.discoveries, ["introduction"]);
  assert.equal(reports.length, 1); assert.equal(s.state.guild.rewards.length, 0);
  const before = structuredClone(s);
  assert.deepEqual(M.settle(s.state, s.champions, { intro_once: outcome }, NOW + 999999, realm), []);
  assert.deepEqual(s, before, "Repeated load/report replay cannot grant XP twice");
}
{
  const s = setup(), base = q(s), prepared = q(s, plan("escort", { route: "patrolled", approach: "cautious", supply: true, meal: "feast" }));
  assert.equal(base.rewards.success.gold, 100); assert.equal(base.rewards.partial.gold, 50);
  assert.equal(base.reservedHours, .1);
  assert.equal(prepared.durationMs, 3 * H);
  assert(prepared.food > base.food);
  assert.equal(base.training.success.champion_scout.missionXp, prepared.training.success.champion_scout.missionXp, "Longer route grants no extra XP");
  assert.equal(prepared.rewards.success.gold, Math.floor(100 * .9 * .9 * 1.12));
  const counts = { success: 0, partial: 0, failure: 0 };
  for (let roll = 0; roll < 1000; roll++) counts[M.resolve(base, () => roll).outcome]++;
  for (const outcome of M.OUTCOMES) assert.equal(counts[outcome], Math.round(base.forecast[outcome] * 10), "Server sampling matches displayed tenths exactly");
  assert.throws(() => q(s, plan("escort", { championIds: ["champion_guard", "champion_guard"] })), /party/);
  assert.throws(() => q(s, plan("escort", { leaderId: "not_owned" })), /leader/);
  assert.throws(() => q(s, plan("escort", { hours: 8 })), /duration/);
  assert.throws(() => q(s, plan("escort", { route: "instant" })), /route/);
  assert.throws(() => q(s, plan("escort", { objective: true, championIds: ["champion_scout", "champion_scholar"], leaderId: "champion_scout" })), /specialty/);
  s.champions.champion_guard.recoveryUntilMs = NOW + 1; assert.throws(() => q(s), /recovering/);
}
{
  const s = setup(); s.state.guild.usage = { day: S.utcDay(NOW), gold: .95, troops: 0 };
  assert.throws(() => q(s), /Gold|gold/);
  assert.equal(q(s, plan("muster")).rewards.success.troops, 20, "Gold allowance cannot consume troop allowance");
  s.state.questUsage = { day: S.utcDay(NOW), hours: 2.39 };
  assert.throws(() => q(s, plan("quarry")), /material/);
  const nextDay = q(s, plan(), NOW + 24 * H);
  assert.equal(nextDay.reservedHours, .1);
  assert.throws(() => q(s, plan(), realm.endsAtMs - 2 * H), /before the realm resets/);
  const beforeReset = q(s, plan(), realm.endsAtMs - 2 * H - 1);
  assert.equal(beforeReset.seasonal.expiresAtMs, realm.endsAtMs);
  M.launch(s.state, beforeReset, "seasonal_accepted", s.champions, realm.endsAtMs - 2 * H - 1);
  const result = M.resolve(beforeReset, () => 0);
  const nextRealm = { ...realm, resetGeneration: "realm-2026-11", worldId: "main-realm-2026-11" };
  M.settle(s.state, s.champions, { seasonal_accepted: result }, realm.endsAtMs + 100, nextRealm);
  assert.equal(s.state.guild.rewards.length, 0, "Expired seasonal Gold cannot enter a new season");
  assert.equal(s.state.guild.reputation, 1, "Permanent progression survives the same boundary");
  assert(s.champions.champion_guard.xp > 0 || s.champions.champion_guard.level > 10);
}
{
  const s = setup(), offer = q(s, plan("equipment"));
  assert.equal(offer.gear.commonPercent, 90); assert.equal(offer.gear.uncommonPercent, 10);
  const rolls = [0, 0, 0, 0], found = M.resolve(offer, () => rolls.shift());
  assert.equal(require("../functions/common-gear").getDefinition(found.rewards.gearKey).rarity, "uncommon");
  const missed = M.resolve(offer, () => 999); assert.equal(missed.rewards.gearKey, "");
  M.launch(s.state, offer, "gear_cooldown", s.champions, NOW);
  assert.equal(s.state.guild.gearAvailableAtMs, NOW + 72 * H);
  M.settle(s.state, s.champions, { gear_cooldown: found }, NOW + 12 * H, realm);
  assert.throws(() => q(s, plan("equipment"), NOW + 24 * H), /Gear recovery attempt/);
  assert.throws(() => M.claimQuote(s.state, "gear_cooldown", realm, false, NOW + 12 * H), /Bag is full/);
  const claim = M.claimQuote(s.state, "gear_cooldown", realm, true, NOW + 12 * H);
  M.claim(s.state, claim); assert.equal(s.state.guild.rewards.length, 0);
  assert.throws(() => M.claimQuote(s.state, "gear_cooldown", realm, true, NOW + 12 * H), /already collected/);
  const unentitled = setup(); unentitled.state.entitlements.treasury = 0;
  assert.equal(q(unentitled, plan("equipment")).gear.uncommonPercent, 0);
  assert.equal(require("../functions/common-gear").getDefinition(M.resolve(q(unentitled, plan("equipment")), () => 0).rewards.gearKey).rarity, "common");
}
{
  const s = setup(), value = q(s, plan("quarry")), result = M.resolve(value, () => 0);
  M.launch(s.state, value, "material_claim", s.champions, NOW);
  M.settle(s.state, s.champions, { material_claim: result }, NOW + 3 * H, { ...realm, resetGeneration: "future" });
  s.state.stock.stone = E.capacity(s.state, "stone") - 1;
  const claim = M.claimQuote(s.state, "material_claim", realm, true, NOW + 3 * H);
  assert.equal(claim.received.materials.stone, 1);
  M.claim(s.state, claim);
  assert.equal(s.state.guild.rewards[0].materials.stone, result.rewards.materials.stone - 1);
  assert.throws(() => M.claimQuote(s.state, "material_claim", realm, true, NOW + 3 * H), /storage space/);
}
{
  const s = setup(100, 1); s.champions.champion_medic.level = 20; s.state.guild.rooms.training = 5;
  F.assignMentor(s.state, F.mentoringQuote(s.state, { mentorId: "champion_medic", pupilId: "champion_guard" }, s.champions, NOW));
  const value = q(s); assert.equal(value.mentor.bonus, .25);
  assert.equal(value.training.success.champion_guard.missionXp, 50);
  assert.equal(value.training.success.champion_guard.ambitionXp, 20);
  assert.equal(value.training.partial.champion_guard.ambitionXp, 0);
  M.launch(s.state, value, "mentored_mission", s.champions, NOW);
  assert(F.busyMentor(s.state, "champion_medic", NOW + 1));
  assert.throws(() => q(s, plan("muster", { championIds: ["champion_envoy", "champion_medic"], leaderId: "champion_envoy" })), /mentoring/);
  const accepted = JSON.stringify(value.training);
  s.state.guild.rooms.training = 1; s.state.guild.rooms.infirmary = 5;
  const report = M.settle(s.state, s.champions, { mentored_mission: M.resolve(value, () => 0) }, NOW + 3 * H, realm)[0];
  assert.deepEqual(report.training, JSON.parse(accepted).success, "Accepted mentoring and XP cannot change during the mission");
  assert.equal(s.champions.champion_medic.recoveryUntilMs, 0, "A stay-home mentor has no recovery");
  assert.equal(s.state.guild.reputation, 1);
  s.state.guild.rooms.contracts = 1;
  assert(M.catalogue(s.state).find(m => m.id === "client-1").available);
  s.state.guild.rooms.archive = 1;
  assert(M.catalogue(s.state).find(m => m.id === "chapter-1").available);
  assert(!M.catalogue(s.state).find(m => m.id === "chapter-2").available);
}
{
  const s = setup(75, 20), protectedReduction = s.state.guild.legacyRecoveryReduction;
  s.state.levels.alehouse = 100; M.initialize(s.state);
  assert.equal(s.state.guild.legacyRecoveryReduction, protectedReduction, "Future Alehouse growth cannot silently extend the protected floor");
  const oldRest = q(s).recoveryMs.success;
  s.state.guild.rooms.infirmary = 1; assert.equal(q(s).recoveryMs.success, oldRest, "Smaller Infirmary benefit does not remove the legacy entitlement");
  s.state.guild.rooms.infirmary = 5; assert(q(s).recoveryMs.success < oldRest);
}
console.log("Guild missions passed: " + combinations + " additive forecasts, saved rolls, protected ceilings, exact outcome sampling, intro, separate quotas, locked mentoring/recovery, one-time settlement, storage-safe claims, Gear cooldown and seasonal expiry.");
