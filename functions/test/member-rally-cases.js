"use strict";
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const layout = require("../core-expansion-world-layout.json");
const towers = require("../holding-towers");

// Real current-world callables; only disposable fixture accounts and documents.
module.exports = async function memberRallyCases({ db, actor, call }) {
  const users = [];
  for (const name of ["Clan Leader", "Member Creator", "Member Ally", "Outsider"]) users.push(await actor(name));
  const [leader, creator, ally, outsider] = users;
  const realm = await call("getRealmInfo", creator);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  const identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId,
    resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
  const clanId = `member_rally_${randomUUID()}`;
  const profile = user => db.doc(`players/${user.uid}`);
  const member = user => db.doc(`clans/${clanId}/members/${user.uid}`);
  const island = region => `islands/${identity.worldId}--${identity.realmShardId}--${region}`;
  const city = value => db.doc(`${island(value.regionId)}/cities/${value.id}`);
  const read = async ref => (await ref.get()).data();
  const clan = db.doc(`clans/${clanId}`);
  await clan.set({ ...identity, status: "active", leaderUid: leader.uid, name: "Member Rally Clan", tag: "MRC", memberCount: 3 });
  for (const user of users) {
    const claim = await call("claimStartingCity", user, { playerName: user.label });
    user.home = { id: claim.cityId, regionId: claim.mainRegionId };
    await city(user.home).update({ troops: 1000000, troopFloat: 1000000, productionUpdatedAtMs: Date.now() });
    if (user === outsider) continue;
    const role = user === leader ? "leader" : "member";
    await profile(user).update({ clanId, clanRole: role, itemEffects: {} });
    await member(user).set({ ...identity, clanId, uid: user.uid, status: "active", role, joinedAtMs: Date.now() - 172800000 });
  }
  const targets = [];
  for (const type of ["gold", "crown"]) {
    const map = layout.maps.find(row => row.objectives.some(entry => entry.strongholdType === type || entry.type === type));
    assert(map, `Missing live ${type} objective`);
    const seed = map.objectives.find(entry => entry.strongholdType === type || entry.type === type);
    const target = { ...seed, ...identity, regionId: map.id, kind: "stronghold",
      ownerKind: "neutral", ownerUid: "", troops: 1000000, troopFloat: 1000000, productionUpdatedAtMs: Date.now() };
    await city(target).set(target);
    targets.push(target);
  }
  const regionId = targets[0].regionId;
  const source = layout.maps.find(map => map.id === regionId).region;
  const boss = { ...identity, id: `marauder_${createHash("sha256").update(regionId).digest("hex").slice(0, 12)}_00`,
    regionId, spawnId: randomUUID(), targetType: "marauder", classification: "boss", status: "active", level: 80,
    slot: 0, balanceVersion: 1, name: "Member Rally Boss", ownerKind: "neutral", ownerUid: "",
    x: source.x, y: source.y, troops: 20000000 };
  await db.doc(`${island(regionId)}/marauderCombat/${boss.id}`).set(boss);
  const tower = { ...towers.TOWERS[0], targetType: "tower" };
  targets.push(boss, tower);
  function order(target = targets[0], user = creator) {
    const id = `member_${randomUUID()}`;
    return { rallyId: id, sourceRegionId: user.home.regionId, targetRegionId: target.regionId,
      army: { id, fromId: user.home.id, toId: target.id, targetType: target.targetType || "city", targetSpawnId: target.spawnId,
        sourceRegionId: user.home.regionId, targetRegionId: target.regionId, troops: 1000, requestedTroops: 1000 } };
  }
  const params = id => ({ clanId, rallyId: id });
  const rallyRef = id => db.doc(`clans/${clanId}/rallies/${id}`);
  async function form(target = targets[0]) {
    const payload = order(target);
    const result = await call("createClanRally", creator, payload);
    assert.equal(result.rally.leaderUid, creator.uid);
    assert.equal(result.rally.status, "forming");
    const replay = await call("createClanRally", creator, payload);
    assert.equal(replay.duplicate, true);
    return payload.rallyId;
  }
  async function join(id, user = ally) {
    const armyId = `join_${randomUUID()}`;
    const { movement } = await call("joinClanRally", user, { ...params(id), armyId, sourceRegionId: user.home.regionId,
      army: { id: armyId, fromId: user.home.id, sourceRegionId: user.home.regionId, troops: 500, requestedTroops: 500 } });
    await db.doc(`armies/${movement.id}`).update({ arrivesAtMs: Date.now() - 1000 });
    await call("resolveArmyOrder", user, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
  }
  // A normal member can form each target type and manually launch their own force.
  for (const target of targets) {
    const id = await form(target);
    for (const action of ["launchClanRally", "cancelClanRally"]) {
      for (const user of [ally, outsider]) await assert.rejects(call(action, user, params(id)), /creator|Clan Leader|clan/i);
    }
    await assert.rejects(call("launchClanRally", creator, params(id)), /least|Ready|ready/);
    await join(id);
    if (target.targetType === "tower") {
      await assert.rejects(call("launchClanRally", creator, params(id)), /least|Ready|ready/);
      await join(id, leader);
    }
    const result = await call("launchClanRally", creator, params(id));
    assert.equal(result.rally.status, "launched");
    assert.equal(result.movement.ownerUid, creator.uid);
    const replay = await call("launchClanRally", creator, params(id));
    assert.equal(replay.duplicate, true);
    assert.equal(replay.movement.id, result.movement.id);
    // End the fixture without resolving combat; no reward rules are being changed.
    await rallyRef(id).update({ status: "settled" });
  }
  await call("promoteClanMember", leader, { targetUid: creator.uid });
  const demoted = await form();
  await call("demoteClanOfficer", leader, { targetUid: creator.uid });
  assert.equal((await read(rallyRef(demoted))).status, "forming", "Demotion must preserve the rally");
  await join(demoted);
  assert.equal((await call("launchClanRally", leader, params(demoted))).rally.status, "launched", "Clan leader may still launch member-created rallies");
  await rallyRef(demoted).update({ status: "settled" });

  // Denied creation cannot reserve troops or trust a forged client role.
  const savedMember = await read(member(creator));
  for (const mode of ["no-clan", "missing", "removed", "invalid-role", "stale", "inactive-clan", "tower-probation"]) {
    const target = mode === "tower-probation" ? tower : targets[0];
    if (mode === "no-clan") await profile(creator).update({ clanId: "" });
    if (mode === "missing") await member(creator).delete();
    if (mode === "removed") await member(creator).update({ status: "removed" });
    if (mode === "invalid-role") await member(creator).update({ role: "visitor" });
    if (mode === "stale") await member(creator).update({ resetGeneration: "archived-test" });
    if (mode === "inactive-clan") await clan.update({ status: "disbanded" });
    if (mode === "tower-probation") await member(creator).update({ joinedAtMs: Date.now() });
    const payload = order(target), before = await read(city(creator.home));
    await assert.rejects(call("createClanRally", creator, { ...payload, clanRole: "leader" }), /clan|member|role|hour|generation/i, mode);
    assert.equal((await read(city(creator.home))).troops, before.troops, mode);
    assert.equal((await rallyRef(payload.rallyId).get()).exists, false, mode);
    await member(creator).set(savedMember);
    await profile(creator).update({ clanId });
    await clan.update({ status: "active" });
  }
  const active = [];
  for (let i = 0; i < 5; i++) active.push(await form());
  await assert.rejects(form(), /5 active rallies/);
  for (const id of active) await call("cancelClanRally", creator, params(id));

  const removed = await form();
  await member(creator).update({ status: "removed" });
  await assert.rejects(call("launchClanRally", leader, params(removed)), /cancelled|active/);
  assert.equal((await read(rallyRef(removed))).status, "cancelled");
  console.log("Validated all-member rallies for Stronghold, Citadel, Boss and Tower; launch ownership, demotion, current membership, Tower probation, quorum, cap and replay safety.");
};
