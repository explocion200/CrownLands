"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Disposable fictional fixtures only; used against both supported adapters.
module.exports = async ({ db, call, owner, rival, source, target, enemySource, cityRef }) => {
  const expires = Date.now() + 3_600_000;
  const profile = db.doc(`players/${owner.uid}`), targetRef = cityRef(target);
  await profile.set({ clanId: "", itemEffects: { shieldExpiresAtMs: expires } }, { merge: true });
  await db.doc(`players/${rival.uid}`).set({ clanId: "", itemEffects: { shieldExpiresAtMs: 0 } }, { merge: true });
  for (const c of [source, enemySource]) await cityRef(c).set({ troops: 100_000, troopFloat: 100_000, productionUpdatedAtMs: Date.now() }, { merge: true });
  await targetRef.set({ ownerKind: "neutral", ownerUid: null, isMainCity: false, troops: 0, troopFloat: 0,
    ownerShieldExpiresAtMs: 0, fortificationState: null }, { merge: true });
  const order = (from, to) => {
    const id = `shield_capture_${randomUUID()}`;
    return { armyId: id, sourceRegionId: from.regionId, targetRegionId: to.regionId,
      army: { id, kind: "attack", fromId: from.id, toId: to.id, troops: 50_000, requestedTroops: 50_000,
        sourceRegionId: from.regionId, targetRegionId: to.regionId } };
  };
  const resolve = async (actor, movement) => {
    await db.doc(`armies/${movement.id}`).update({ arrivesAtMs: Date.now() - 1000 });
    return call("resolveArmyOrder", actor, { armyId: movement.id, routeRegionIds: movement.routeRegionIds });
  };
  const request = order(source, target);
  const sent = await call("sendArmyOrder", owner, request);
  assert.equal((await profile.get()).data().itemEffects.shieldExpiresAtMs, expires, "Neutral attack must preserve the owner's shield");
  await resolve(owner, sent.movement);
  let captured = (await targetRef.get()).data();
  assert.equal(captured.ownerUid, owner.uid);
  assert.equal(captured.ownerShieldExpiresAtMs, expires, "A newly captured city must retain the new owner's remaining shield timer");
  await call("resolveArmyOrder", owner, { armyId: sent.movement.id, routeRegionIds: sent.movement.routeRegionIds });
  assert.equal((await targetRef.get()).data().ownerShieldExpiresAtMs, expires, "Settlement retry must not extend protection");

  // Reproduce a city saved by the previous implementation. The defender need
  // not log in or perform an economy write for dispatch/arrival protection.
  await targetRef.update({ ownerShieldExpiresAtMs: 0,
    fortificationState: { version: 1, integrityBps: 0, lastDamagedAtMs: Date.now() - 60_000, repairAtMs: Date.now() - 1 } });
  await assert.rejects(call("sendArmyOrder", rival, order(enemySource, target)), /Royal Peace Shield/);
  await targetRef.update({ fortificationState: { version: 1, integrityBps: 9999, lastDamagedAtMs: Date.now(), repairAtMs: Date.now() + 60_000 } });
  const incoming = await call("sendArmyOrder", rival, order(enemySource, target));
  await targetRef.update({ "fortificationState.repairAtMs": Date.now() - 1 });
  const blocked = await resolve(rival, incoming.movement);
  const savedArmy = (await db.doc(`armies/${incoming.movement.id}`).get()).data();
  assert.equal(savedArmy.result.blocked, "shield");
  assert(blocked.reports.some(report => /Royal Peace Shield/.test(report.summary)));
  assert.equal((await targetRef.get()).data().ownerUid, owner.uid);
  assert.equal((await profile.get()).data().itemEffects.shieldExpiresAtMs, expires);

  // Conversely, stale city metadata cannot revive a cancelled account shield.
  await profile.update({ "itemEffects.shieldExpiresAtMs": 0 });
  await targetRef.update({ ownerShieldExpiresAtMs: expires });
  const unshielded = await call("sendArmyOrder", rival, order(enemySource, target));
  assert(unshielded.movement.id);
  console.log("Shield capture cases passed: neutral capture, retry, offline repaired city, damaged dispatch, repaired arrival and cancellation.");
};
