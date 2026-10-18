"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const layout = require("../core-expansion-world-layout.json");

// Shared by the current-realm emulator and an isolated PostgreSQL schema.
module.exports = async function rallyRecallRejoinCases({ db, actor, call }) {
  const users = [await actor("Recall leader"), await actor("Recall ally"), await actor("Recall third")];
  const [leader, ally, third] = users;
  const realm = await call("getRealmInfo", leader);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  const identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId,
    resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
  const clanId = `recall_${randomUUID()}`;
  const profile = user => db.doc(`players/${user.uid}`);
  const member = user => db.doc(`clans/${clanId}/members/${user.uid}`);
  const city = value => db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${value.regionId}/cities/${value.id}`);
  const read = async ref => (await ref.get()).data();
  for (const [index, user] of users.entries()) {
    const claim = await call("claimStartingCity", user, { playerName: user.label });
    user.home = { id: claim.cityId, regionId: claim.mainRegionId };
    user.role = index ? "member" : "leader";
    await profile(user).update({ clanId, clanRole: user.role, gold: 10000000, goldFloat: 10000000,
      itemEffects: {}, shopItems: { recall_horn: 100 } });
    await member(user).set({ ...identity, clanId, uid: user.uid, role: user.role, status: "active", joinedAtMs: Date.now() - 172800000 });
  }
  const clanRef = db.doc(`clans/${clanId}`);
  await clanRef.set({ ...identity, status: "active", leaderUid: leader.uid, name: "Recall clan", tag: "RCL", memberCount: 3 });
  const map = layout.maps.find(row => row.id === leader.home.regionId);
  const assembly = { ...map.cities.find(row => !users.some(user => row.id === user.home.id)), regionId: map.id };
  const objectiveMap = layout.maps.find(row => row.objectives.length);
  const objective = { ...objectiveMap.objectives[0], regionId: objectiveMap.id };
  await city(objective).set({ ...objective, ...identity, kind: "stronghold", ownerKind: "neutral", ownerUid: null,
    troops: 50000000, troopFloat: 50000000, isMainCity: false, productionUpdatedAtMs: Date.now() });
  const params = rally => ({ clanId, rallyId: rally.id });
  const request = movement => ({ armyId: movement.id, routeRegionIds: movement.routeRegionIds });
  const due = async movement => db.doc(`armies/${movement.id}`).update({ arrivesAtMs: Date.now() - 1000 });
  const settle = movement => call("resolveArmyOrder", ally, request(movement));
  async function form() {
    for (const user of users) {
      await city(user.home).update({ troops: 1000000, troopFloat: 1000000, productionUpdatedAtMs: Date.now() });
    }
    await city(assembly).set({ ...assembly, ...identity, ownerKind: "player", ownerUid: leader.uid,
      ownerName: leader.label, ownerClanId: clanId, isMainCity: false, level: 1, troops: 11000,
      troopFloat: 11000, productionUpdatedAtMs: Date.now() });
    const id = `rejoin_${randomUUID()}`, ref = db.doc(`clans/${clanId}/rallies/${id}`);
    await call("createClanRally", leader, { rallyId: id, sourceRegionId: assembly.regionId, targetRegionId: objective.regionId,
      army: { id, fromId: assembly.id, toId: objective.id, targetType: "city", troops: 10000, requestedTroops: 10000,
        sourceRegionId: assembly.regionId, targetRegionId: objective.regionId } });
    return { id, ref };
  }
  async function join(rally, user = ally, troops = 5000, source = user.home) {
    const id = `join_${randomUUID()}`;
    const result = await call("joinClanRally", user, { ...params(rally), armyId: id, sourceRegionId: source.regionId,
      army: { id, fromId: source.id, kind: "rally_join", troops, requestedTroops: troops, sourceRegionId: source.regionId } });
    await due(result.movement);
    await call("resolveArmyOrder", user, request(result.movement));
  }
  async function withdraw(rally, horn = true) {
    const { movement } = await call("withdrawClanRallyContribution", ally, params(rally));
    assert(movement && movement.rallyReturn);
    assert(!(await read(rally.ref)).participants.some(row => row.uid === ally.uid));
    if (!horn) return movement;
    const ref = db.doc(`armies/${movement.id}`), now = Date.now();
    await ref.update({ launchedAtMs: now - 60000, arrivesAtMs: now + 60000, total: 120 });
    const before = (await read(profile(ally))).shopItems.recall_horn;
    await assert.rejects(call("useRecallHorn", third, request(movement)), /own troop marches/);
    await call("useRecallHorn", ally, request(movement));
    await assert.rejects(call("useRecallHorn", ally, request(movement)), /already returning/);
    assert.equal((await read(profile(ally))).shopItems.recall_horn, before - 1);
    await assert.rejects(settle(movement), /not arrived/);
    await due(movement);
    return movement;
  }
  const cancel = rally => call("cancelClanRally", leader, params(rally));
  const first = await form(); await join(first);
  const initialHome = await read(city(ally.home));
  const initialAssembly = await read(city(assembly));
  const committedBefore = (await read(profile(ally))).committedRallyTroops;
  let lastId;
  for (let cycle = 0; cycle < 2; cycle++) {
    const movement = await withdraw(first);
    assert.notEqual(movement.id, lastId, "Every withdrawal needs a fresh march identity"); lastId = movement.id;
    const results = await Promise.all([settle(movement), settle(movement)]);
    assert.equal(results.filter(row => row.outcome === "rejoined").length, 1);
    const rally = await read(first.ref), ruler = await read(profile(ally));
    const entries = rally.participants.filter(row => row.uid === ally.uid);
    assert.equal(entries.length, 1); assert.equal(entries[0].status, "assembled"); assert.equal(entries[0].troops, 5000);
    assert.equal(entries[0].sourceId, ally.home.id); assert.equal(entries[0].sourceRegionId, ally.home.regionId);
    assert.equal(ruler.committedRallyTroops, committedBefore);
    const stats = results.find(row => row.outcome === "rejoined").currentUser.globalStats;
    assert.equal(stats.totalRallyTroops, committedBefore);
    assert.equal(stats.totalMarchingTroops, 0, "Rejoined army cannot count twice in King Power");
    assert.equal((await read(db.doc(`armies/${movement.id}`))).status, "resolved");
    assert.equal((await read(city(assembly))).troops, initialAssembly.troops, "Rally troops must not become host garrison");
    assert((await read(city(ally.home))).troops < initialHome.troops + 100, "Returning army must not also land at home");
    await settle(movement);
    assert.equal((await read(profile(ally))).committedRallyTroops, committedBefore);
  }
  // An ordinary withdrawal still lands at home, with no automatic rejoin.
  const ordinary = await withdraw(first, false); await due(ordinary); await settle(ordinary);
  assert(!(await read(first.ref)).participants.some(row => row.uid === ally.uid));
  await cancel(first);

  // Losing the original city may turn the withdrawal into a recapture attack.
  // A Horn still reverses it toward the assembly and must preserve that source.
  const secondary = { ...map.cities.find(row => row.id !== assembly.id && !users.some(user => row.id === user.home.id)), regionId: map.id };
  await city(secondary).set({ ...secondary, ...identity, ownerKind: "player", ownerUid: ally.uid, ownerClanId: clanId,
    isMainCity: false, level: 1, troops: 10000, troopFloat: 10000, productionUpdatedAtMs: Date.now() });
  const recapture = await form(); await join(recapture, ally, 5000, secondary);
  await city(secondary).update({ ownerUid: "recall_fixture_enemy", ownerClanId: "enemy_fixture" });
  const reversedAttack = await withdraw(recapture);
  assert.equal(reversedAttack.rallyReturnAttack, true);
  const otherCaller = await call("resolveArmyOrder", third, request(reversedAttack));
  assert.equal(otherCaller.outcome, "rejoined");
  assert.equal(otherCaller.currentUser, null, "Another resolver must not receive the contributor's profile");
  assert.equal(otherCaller.rally, null, "Private rally details are not part of another resolver's response");
  assert.equal((await read(db.doc(`armies/${reversedAttack.id}`))).result.troops, undefined,
    "The public movement result must not expose exact contributed troops");
  assert.equal((await read(recapture.ref)).participants.find(row => row.uid === ally.uid).sourceId, secondary.id);
  await cancel(recapture);

  const cases = ["cancelled", "launched", "full", "new contribution", "left clan", "member removed",
    "creator left", "clan inactive", "assembly lost", "old rally generation", "wrong assembly", "no horn"];
  for (const scenario of cases) {
    const rally = await form(); await join(rally);
    const movement = await withdraw(rally), prior = await read(rally.ref);
    const baseCommitted = (await read(profile(ally))).committedRallyTroops;
    const savedClan = await read(clanRef), savedLeader = await read(profile(leader)), savedAlly = await read(profile(ally));
    const savedMember = await read(member(ally));
    if (scenario === "cancelled") await cancel(rally);
    if (scenario === "launched") { await join(rally, third); await call("launchClanRally", leader, params(rally)); }
    if (scenario === "full") await rally.ref.update({ participants: [...prior.participants, ...Array.from({ length: 19 }, (_, i) =>
      ({ ...prior.participants[0], uid: `full_${i}`, role: "ally", troops: 1 }))] });
    if (scenario === "new contribution") await join(rally, ally, 2000);
    if (scenario === "left clan") await profile(ally).update({ clanId: "" });
    if (scenario === "member removed") await member(ally).delete();
    if (scenario === "creator left") await profile(leader).update({ clanId: "" });
    if (scenario === "clan inactive") await clanRef.update({ status: "disbanded" });
    if (scenario === "assembly lost") await city(assembly).update({ ownerUid: third.uid });
    if (scenario === "old rally generation") await rally.ref.update({ resetGeneration: "realm-2000-01" });
    if (scenario === "wrong assembly") await rally.ref.update({ assemblyCityId: leader.home.id });
    if (scenario === "no horn") await db.doc(`armies/${movement.id}`).update({ returnReason: "rally_recall" });
    const homeBefore = await read(city(ally.home));
    const results = await Promise.all([settle(movement), settle(movement)]);
    assert(!results.some(row => row.outcome === "rejoined"), `${scenario} must not rejoin`);
    const homeAfter = await read(city(ally.home));
    assert(homeAfter.troops >= homeBefore.troops + 5000 && homeAfter.troops < homeBefore.troops + 5100, `${scenario}: return exactly once`);
    assert.equal((await read(profile(ally))).committedRallyTroops, baseCommitted + (scenario === "new contribution" ? 2000 : 0));
    assert.equal((await read(db.doc(`armies/${movement.id}`))).status, "resolved", `${scenario}: no stuck march`);
    // Restore only synthetic fixture eligibility, then release this forming slot.
    await profile(leader).update({ clanId: savedLeader.clanId }); await profile(ally).update({ clanId: savedAlly.clanId });
    await member(ally).set(savedMember); await clanRef.set(savedClan);
    if (!["cancelled", "launched"].includes(scenario)) {
      if (["full", "old rally generation", "wrong assembly"].includes(scenario)) await rally.ref.set(prior);
      await cancel(rally);
    }
  }
  // Concurrent cancellation owns the final outcome: either it sees no contribution,
  // or it creates exactly one settlement receipt for the successfully rejoined force.
  const race = await form(); await join(race);
  const movement = await withdraw(race);
  const results = await Promise.all([settle(movement), cancel(race)]);
  const final = await read(race.ref);
  assert.equal(final.status, "cancelled");
  const receipts = await db.collection(`rallyBattleReceipts/${identity.resetGeneration}--${identity.realmShardId}/entries`)
    .where("rallyId", "==", race.id).get();
  const allyReceipts = receipts.docs.filter(doc => doc.data().contributorUid === ally.uid);
  assert.equal(allyReceipts.length, results[0].outcome === "rejoined" ? 1 : 0);
  assert.equal((await read(db.doc(`armies/${movement.id}`))).status, "resolved");
  const launchRace = await form(); await join(launchRace); await join(launchRace, third);
  const turnBack = await withdraw(launchRace);
  const [arrival, launch] = await Promise.all([settle(turnBack), call("launchClanRally", leader, params(launchRace))]);
  assert.equal(launch.movement.rallyParticipantCount, arrival.outcome === "rejoined" ? 3 : 2);
  assert.equal((await read(launchRace.ref)).participants.filter(row => row.uid === ally.uid).length,
    arrival.outcome === "rejoined" ? 1 : 0);
  assert.equal((await read(db.doc(`armies/${turnBack.id}`))).status, "resolved");
  console.log("Rally recall rejoin passed: real join/withdraw/Horn, repeated trips, duplicate arrivals, authorization, King Power, recapture withdrawal, launch/cancellation races and 12 safe-return cases.");
};
