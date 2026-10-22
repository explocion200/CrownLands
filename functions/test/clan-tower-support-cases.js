"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const Support = require("../clan-tower-support"), T = require("../holding-towers"), B = require("../clan-tower-buildings");
module.exports = async function run({ db, access = false }) {
  const token = crypto.randomBytes(5).toString("hex"), realm = { worldId: `support_${token}`, resetGeneration: `support_${token}`, realmShardId: "shard_0001" };
  const clanId = `clan_${token}`, uid = `scout_${token}`, ally = `ally_${token}`, officer = `officer_${token}`, outsider = `outsider_${token}`;
  const now = Date.now(), towerId = T.TOWERS[0].id, towerRef = db.doc(`holdingTowers/${towerId}`);
  const profile = id => db.doc(`players/${id}`), member = id => db.doc(`clans/${clanId}/members/${id}`);
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const service = Support.createService({ db, HttpsError, realm: () => realm, assertWorld() {}, validateProfile(p) { if (!Support.current(p, realm)) throw new HttpsError("permission-denied", "Wrong realm"); }, towerRef: id => db.doc(`holdingTowers/${id}`),
    normalizeTower: (snap, id, at) => T.materializeTowerState({ id, ...snap.data() }, at), transact: callback => db.runTransaction(callback) });
  await db.doc("realmConfig/current").set(realm);
  await db.doc(`clans/${clanId}`).set({ ...realm, status: "active", name: "Fictional Scouts" });
  for (const id of [uid, ally, officer, outsider]) {
    await profile(id).set({ ...realm, playerName: id === uid ? "Fictional Scout" : "Fictional Ally", clanId: id === outsider ? "other_clan" : clanId });
    if (id !== outsider) await member(id).set({ ...realm, uid: id, clanId, role: id === officer ? "officer" : "member", status: "active", joinedAtMs: now - 7200000 });
  }
  const owned = { ...T.createNeutralTowerState(towerId, { nowMs: now }), ...realm, ownerKind: "clan", clanId, ownershipRevision: 4, wallIntegrityBps: 10000, buildings: B.normalizeLevels({ stables: 10, scout_lodge: 1, infirmary: 7, training: 8 }) };
  await towerRef.set(owned);
  const report = async (id, target = id, owner = uid, extra = {}, stamp = now - 1000) => {
    const doc = { ...realm, uid: owner, type: "scout", outcome: "scout", cityId: target, regionId: "core-stoneward", cityName: "Fictional keep", targetType: "city", targetLocation: { x: 120, y: 240 },
      scoutReport: { targetType: "city", troops: 1234, totalDefense: 3456, scoutedAtMs: stamp, expiresAtMs: stamp + Support.INTEL_MS,
        fortification: { startingWallPower: 222 }, hiddenAccountData: "must not copy" }, ...extra };
    await db.doc(`players/${owner}/serverReports/${id}`).set(doc); return doc;
  };
  const share = (id, owner = uid, stamp = now - 1000, operationId = crypto.randomUUID()) => service.intelligence(owner, { action: "share", reportId: id, scoutedAtMs: stamp, operationId });
  const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
  assert.equal((await service.intelligence(uid)).capacity, 5);
  await report("first"); const operationId = crypto.randomUUID(), first = await share("first", uid, now - 1000, operationId);
  const detail = (await service.intelligence(ally, { action: "detail", key: first.key })).entry;
  assert.equal(detail.snapshot.troops, 1234); assert.equal(detail.snapshot.hiddenAccountData, undefined);
  assert.equal(detail.expiresAtMs, now - 1000 + Support.INTEL_MS); assert.equal(detail.location.x, 120);
  assert.equal((await share("first", uid, now - 1000, operationId)).duplicate, true);
  assert.equal((await share("first")).duplicate, true);
  assert.equal((await service.intelligence(uid)).entries.length, 1);
  await denied(service.intelligence(outsider), "permission-denied");
  await denied(share("first", ally), "failed-precondition");
  await denied(share("fabricated"), "failed-precondition");
  await report("wrong", "wrong", uid, { worldId: "another-world" }); await denied(share("wrong"), "failed-precondition");
  await report("failed", "failed", uid, { outcome: "lost" }); await denied(share("failed"), "failed-precondition");
  await report("expired", "expired", uid, {}, now - 700000); await denied(share("expired", uid, now - 700000), "failed-precondition");
  await denied(service.intelligence(uid, { action: "share", reportId: "first", scoutedAtMs: now - 1000, operationId: "forged", troops: 99999 }), "invalid-argument");
  await member(ally).update({ joinedAtMs: Date.now() }); await denied(service.intelligence(ally), "permission-denied");
  await member(ally).update({ joinedAtMs: now - 7200000 });
  await report("newer", "first", ally, {}, now); await share("newer", ally, now);
  await denied(share("first"), "failed-precondition");
  assert.equal((await service.intelligence(uid, { action: "detail", key: first.key })).entry.sharedByUid, ally);
  await denied(service.intelligence(uid, { action: "remove", key: first.key, operationId: crypto.randomUUID() }), "permission-denied");
  await service.intelligence(officer, { action: "remove", key: first.key, operationId: crypto.randomUUID() });
  assert.equal((await share("first", uid, now - 1000, operationId)).duplicate, true);
  assert.equal((await service.intelligence(uid)).entries.length, 0, "A retry resurrected removed intelligence");
  await Promise.all(Array.from({ length: 6 }, (_, i) => report(`capacity_${i}`)));
  const concurrent = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => share(`capacity_${i}`)));
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 5);
  assert.equal(concurrent.find(r => r.status === "rejected").reason.code, "resource-exhausted");
  let board = await service.intelligence(uid); assert.equal(board.entries.length, 5);
  const boardRef = db.doc(`clans/${clanId}/scoutIntelligence/${board.scope}`);
  await boardRef.update({ entries: board.entries.map((e, i) => i ? e : { ...e, expiresAtMs: now - 1 }) });
  await report("reuse_expired"); await share("reuse_expired"); assert.equal((await service.intelligence(uid)).entries.length, 5);
  for (const entry of (await service.intelligence(uid)).entries) await service.intelligence(officer, { action: "remove", key: entry.key, operationId: crypto.randomUUID() });
  for (const spawnId of ["spawn_a", "spawn_b"]) {
    const original = await report(spawnId, "npc-slot");
    await db.doc(`players/${uid}/serverReports/${spawnId}`).update({ scoutReport: { ...original.scoutReport, targetType: "marauder", targetSpawnId: spawnId } });
    await share(spawnId);
  }
  board = await service.intelligence(uid); assert.equal(board.entries.length, 2, "NPC respawns shared a target identity");
  if (access) {
    const { Access } = require("../../local-backend/access");
    const readAccess = async id => db.runTransaction(async tx => {
      const rules = await new Access({ store: db, transaction: tx, auth: { uid: id } }).initialize();
      return { signal: await rules.canRead(`clans/${clanId}/scoutIntelSignals/current`, (await tx.get(db.doc(`clans/${clanId}/scoutIntelSignals/current`))).data()),
        board: await rules.canRead(boardRef.path, (await tx.get(boardRef)).data()),
        original: await rules.canRead(`players/${uid}/serverReports/first`, (await tx.get(db.doc(`players/${uid}/serverReports/first`))).data()) };
    });
    assert.deepEqual(await readAccess(ally), { signal: true, board: false, original: false });
    // Exercise the same bounded reauthorizing read used by /data/watch, not only a rule helper.
    const client = new (require("../../local-backend/client-data").ClientData)(db);
    const signalQuery = { collection: `clans/${clanId}/scoutIntelSignals`, filters: [
      ...Object.entries(realm).map(([field, value]) => ({ field: [field], op: "==", value: { stringValue: value } })),
      { field: ["__name__"], op: "==", value: { stringValue: "current" } }], limit: 1 };
    assert.equal((await client.read({ uid: ally }, [signalQuery], { partial: true }))[0].documents.length, 1);
    await member(ally).update({ status: "removed" });
    assert.equal((await client.read({ uid: ally }, [signalQuery], { partial: true }))[0].error.code, "permission-denied");
    await member(ally).update({ status: "active" });
    await db.doc(`clans/${clanId}`).update({ realmShardId: "wrong" });
    assert.equal((await readAccess(ally)).signal, false);
    await denied(service.intelligence(ally), "permission-denied");
    await db.doc(`clans/${clanId}`).update({ realmShardId: realm.realmShardId });

    await member(ally).update({ status: "removed" });
    assert.equal((await readAccess(ally)).signal, false); await denied(service.intelligence(ally), "permission-denied");
    await member(ally).update({ status: "active" });
    await profile(ally).update({ clanId: "other_clan" }); assert.equal((await readAccess(ally)).signal, false);
    await profile(ally).update({ clanId });
  }
  await towerRef.set({ ...T.conquerTower(owned, { id: "victor" }, now + 10), ...realm });
  await denied(service.intelligence(uid), "permission-denied");
  const captured = (await towerRef.get()).data(); assert.equal(captured.buildings.stables, 9); assert.equal(captured.buildings.scout_lodge, 1);
  await towerRef.set({ ...T.conquerTower(captured, { id: clanId }, now + 20), ...realm });
  assert.equal((await service.intelligence(uid)).entries.length, 0, "Reacquisition resurrected the previous board");
  await denied(service.intelligence(uid, { action: "detail", key: board.entries[0].key }), "not-found");
  const reduced = Support.activeEntries({ entries: Array.from({ length: 9 }, (_, i) => ({ key: String(i), scoutedAtMs: i, expiresAtMs: now + 600000 })) }, now, 5);
  assert.deepEqual(reduced.map(e => e.key), ["8", "7", "6", "5", "4"]);
  await denied(service.intelligence(uid, { action: "detail", key: "../forged" }), "invalid-argument");
  await towerRef.set({ ...owned, ownerKind: "neutral", clanId: "", ownershipRevision: 8, buildings: B.normalizeLevels() });
  await denied(service.intelligence(uid), "permission-denied");
  await towerRef.set(owned);
  await db.doc(`clans/${clanId}`).update({ status: "disbanded" }); await denied(service.intelligence(uid), "permission-denied");
  await db.doc(`clans/${clanId}`).update({ status: "active" });
  const generation = realm.resetGeneration; realm.resetGeneration = "next-season";
  await denied(service.intelligence(uid), "permission-denied"); realm.resetGeneration = generation;
  const move = (kind, target = { ...realm, id: "ally_city", ownerUid: ally }, extra = {}) => db.runTransaction(async tx => service.movement(tx, { uid, profile: (await tx.get(profile(uid))).data(), kind, target, targetType: "city", nowMs: now, ...extra }));
  assert.equal((await move("reinforce")).nominalPercent, 20);
  assert.equal((await move("reinforce", owned, { targetType: "tower" })).nominalPercent, 20);
  const rally = { ...realm, clanId, leaderUid: ally, assemblyCityId: "ally_city", status: "forming" };
  assert.equal((await move("rally_join", undefined, { rally })).nominalPercent, 20);
  assert.equal(await move("rally_join", undefined, { rally: { ...rally, status: "launched" } }), null);
  for (const kind of ["attack", "scout", "transfer", "return", "recall", "rally_attack"]) assert.equal(await move(kind), null);
  assert.equal(await move("reinforce", { ...realm, id: "own", ownerUid: uid }), null);
  assert.equal(await move("reinforce", { ...realm, id: "outside", ownerUid: outsider }), null);
  await member(uid).update({ joinedAtMs: now }); assert.equal((await move("reinforce")).reason, "probation");
  await member(uid).update({ joinedAtMs: now - 7200000 });
  await towerRef.update({ "buildings.stables": 0 }); assert.equal((await move("reinforce")).reason, "unbuilt");
  await towerRef.update({ "buildings.stables": 10, attackBlocked: true, wallIntegrityBps: 5000 }); assert.equal((await move("reinforce")).nominalPercent, 20);
  await db.doc(`holdingTowers/${T.TOWERS[1].id}`).set({ ...owned, id: T.TOWERS[1].id }); assert.equal((await move("reinforce")).nominalPercent, 0);
  await db.doc(`holdingTowers/${T.TOWERS[1].id}`).delete();
  await towerRef.set({ ...owned, resetGeneration: "old" }); assert.equal((await move("reinforce")).nominalPercent, 0);
  assert.equal(Support.applyStables(1, 20).speedMultiplier, 1.2); assert.equal(120 / Support.applyStables(1, 20).speedMultiplier, 100);
  assert.equal(Support.applyStables(2.9, 20).effectivePercent, 10); assert.equal(Support.applyStables(3, 20).effectivePercent, 0);
  await towerRef.set({ ...owned, buildings: B.normalizeLevels() }); await denied(service.intelligence(uid), "failed-precondition");
  const cleaned = await service.cleanup(now + Support.INTEL_MS + 1000); assert(cleaned.deleted > 0);
  console.log("Clan support: concurrent capacity, idempotency, immutable expiry, privacy/revocation, target/spawn identity, capture/reacquisition, cleanup, eligibility and additive caps passed.");
};
