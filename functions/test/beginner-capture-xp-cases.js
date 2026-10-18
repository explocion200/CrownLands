"use strict";
const assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
module.exports = async function beginnerCaptureCases({ db, actor, call }) {
  const claim = await call("claimStartingCity", { playerName: "Beginner XP" });
  const profileRef = db.doc(`players/${actor.uid}`), initial = (await profileRef.get()).data();
  assert.equal(initial.character.level, 1); assert.equal(initial.character.xp, 0); assert.equal(initial.character.beginnerNpcCaptures, 0);
  const sourceRef = db.doc(`islands/${claim.islandId}/cities/${claim.cityId}`), source = (await sourceRef.get()).data();
  const targets = (await sourceRef.parent.get()).docs.filter(doc => doc.id !== sourceRef.id && !doc.data().kind).slice(0, 30);
  assert(targets.length >= 30, "Current New Lands fixture must contain 30 regular targets");
  const prepare = async (doc, patch = {}) => {
    const city = doc.data();
    await doc.ref.set({ ...city, ownerUid: null, ownerKind: "neutral", ownerName: "", ownerFlag: null,
      ownerKingPower: 0, ownerShieldExpiresAtMs: 0, isMainCity: false, level: 1, troops: 0, troopFloat: 0,
      investedGold: 0, productionUpdatedAtMs: Date.now(), relinquishedAtMs: 0, relocatedAtMs: 0,
      neutralClaimOpen: false, neutralClaimedByUid: "", neutralClaimEventId: "", fortification: null, ...patch });
  };
  const dispatch = async (doc, troops = 1000) => {
    // Exercise the real launch limiter without overwhelming its rolling window.
    await new Promise(resolve => setTimeout(resolve, 600));
    await sourceRef.update({ troops: 1000000, troopFloat: 1000000, productionUpdatedAtMs: Date.now() });
    const result = await call("sendArmyOrder", { sourceRegionId: initial.mainRegionId, targetRegionId: initial.mainRegionId,
      army: { id: `beginner_${randomUUID()}`, kind: "attack", fromId: sourceRef.id, toId: doc.id, troops, requestedTroops: troops } });
    await db.doc(`armies/${result.movement.id}`).update({ arrivesAtMs: Date.now() - 1000 });
    return { armyId: result.movement.id, routeRegionIds: result.movement.routeRegionIds };
  };
  const report = result => { const row = result.reports?.find(item => item.type === "attack"); assert(row); return row; };
  // Actual failures and abandoned-city recaptures cannot earn the beginner floor.
  await prepare(targets[29]);
  const failed = await call("resolveArmyOrder", await dispatch(targets[29], 1));
  assert.equal(failed.cityCaptured, false); assert(report(failed).xpAwarded < 125);
  assert.equal((await profileRef.get()).data().character.beginnerNpcCaptures,0);
  await profileRef.set(initial); await prepare(targets[29], { relinquishedAtMs: Date.now() - 1000 });
  const abandoned = await call("resolveArmyOrder", await dispatch(targets[29]));
  assert.equal(abandoned.cityCaptured, true); assert.equal(report(abandoned).xpAwarded, 0);
  assert.equal((await profileRef.get()).data().character.beginnerNpcCaptures,0);
  // Reaching Level 15 through other activities must not consume capture bonuses.
  await profileRef.set({...initial,character:{level:20,xp:0,skillPoints:19,beginnerNpcCaptures:0}});
  await prepare(targets[29]);
  const early=await call("resolveArmyOrder",await dispatch(targets[29]));
  assert(report(early).xpAwarded>=120);
  assert.equal((await profileRef.get()).data().character.beginnerNpcCaptures,1);
  await call("spendSkillPoint", {skillId:"swordmastery"});
  await call("resetSkills");
  assert.equal((await profileRef.get()).data().character.beginnerNpcCaptures,1,"Skill reset erased capture bonus progress");
  await profileRef.set(initial); await sourceRef.set(source);
  for (const doc of targets) await prepare(doc);
  let totalXp = 0, skillPoints = 0, gold = 0, troopRewards = 0;
  const accept = async (doc, result) => {
    assert.equal(result.cityCaptured, true);
    assert.equal((await doc.ref.get()).data().ownerUid, actor.uid);
    const row = report(result); totalXp += row.xpAwarded;
    if (row.levelUpReward) { skillPoints += row.levelUpReward.skillPointsAwarded; gold += row.levelUpReward.goldAwarded; troopRewards += row.levelUpReward.troopsAwarded; }
  };
  for (let index = 0; index < 27; index++) {
    const request = await dispatch(targets[index]);
    const result = await call("resolveArmyOrder", request); await accept(targets[index], result);
    if ([1, 13, 26].includes(index)) {
      const before = (await profileRef.get()).data().character;
      await Promise.all([call("resolveArmyOrder", request), call("resolveArmyOrder", request)]);
      assert.deepEqual((await profileRef.get()).data().character, before, "Repeated resolution granted XP/skills twice");
    }
  }
  // Different arrivals must observe the latest Hero level after transaction retries.
  const requests = [await dispatch(targets[27]), await dispatch(targets[28])];
  const results = await Promise.all(requests.map(request => call("resolveArmyOrder", request)));
  for (let i = 0; i < results.length; i++) await accept(targets[27 + i], results[i]);
  const final = (await profileRef.get()).data();
  assert.equal(final.character.beginnerNpcCaptures,29); assert.equal(final.character.level, 15); assert.equal(final.character.skillPoints, 14);
  assert.equal(skillPoints, 14); assert(gold > 0 && troopRewards > 0);
  assert.equal(totalXp, 48859 + final.character.xp); assert(final.character.xp > 0 && final.character.xp < 3000);
  assert.equal((await sourceRef.parent.get()).docs.filter(doc => doc.data().ownerUid === actor.uid).length, 30);
  const stable = structuredClone(final.character);
  await Promise.all(requests.map(request => call("resolveArmyOrder", request)));
  assert.deepEqual((await profileRef.get()).data().character, stable);
  await assert.rejects(dispatch(targets[29]), /30|neutral capture|city limit/i);
  assert.deepEqual((await profileRef.get()).data().character, stable);
  // Losing a city must not replenish the already-used 29 rewards.
  await prepare(targets[0]);
  const exhausted=await call("resolveArmyOrder",await dispatch(targets[29]));
  assert.equal(exhausted.cityCaptured,true);assert(report(exhausted).xpAwarded<100);
  assert.equal((await profileRef.get()).data().character.beginnerNpcCaptures,29);
  console.log("Beginner capture integration passed: current realm, 29 one-time bonuses to Level 15, extra XP retained, 14 skill points, normal rewards, failure/abandonment, duplicate/concurrent arrivals and city cap.");
};
