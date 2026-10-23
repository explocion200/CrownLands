"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const layout = require("../core-expansion-world-layout.json");

module.exports = async function retaliationImpactCases({ db, actor, call, ownershipEvent }) {
  const users = [await actor("Impact High"), await actor("Impact Low"), await actor("Impact Third")];
  const [high, low, third] = users;
  const realm = await call("getRealmInfo", high);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  const identity = { worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
  const read = async ref => (await ref.get()).data();
  const profile = user => db.doc(`players/${user.uid}`);
  const grants = user => db.collection(`players/${user.uid}/retaliationWindows`);
  const city = value => db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${value.regionId}/cities/${value.id}`);
  const claims = [];
  for (const user of users) {
    claims.push(await call("claimStartingCity", user, { playerName: user.label }));
    await profile(user).update({ itemEffects: {}, shopItems: { recall_horn: 20, shield_12h: 20 } });
  }
  const map = layout.maps.find(row => row.id === claims[0].mainRegionId);
  const seeds = map.cities.filter(row => !claims.some(claim => claim.cityId === row.id)).map(row => ({ ...row, regionId: map.id }));
  async function seed(value, owner, troops) {
    await city(value).set({ ...value, ...identity, ownerKind: "player", ownerUid: owner.uid, ownerName: owner.label,
      level: 1, troops, troopFloat: troops, isMainCity: false, ownerClanId: "", ownerShieldExpiresAtMs: 0,
      productionUpdatedAtMs: Date.now() + 3_600_000, lastCapturedAtMs: Date.now() - 86_400_000, neutralClaimOpen: false });
    return value;
  }
  const source = await seed(seeds[0], high, 10_000_000);
  await seed(seeds[1], low, 100_000);
  await seed(seeds[2], third, 10_000_000);
  for (const user of users) await call("collectEconomy", user);
  const target = seeds[3];
  const armyRef = movement => db.doc(`armies/${movement.id}`);
  const request = movement => ({ armyId: movement.id, routeRegionIds: movement.routeRegionIds });
  const send = (grant, troops = 8000) => call("sendArmyOrder", high, { sourceRegionId: map.id, targetRegionId: map.id,
    army: { id: `impact_${randomUUID()}`, kind: "attack", fromId: source.id, toId: target.id,
      requestedTroops: troops, troops, retaliationId: grant?.id || "" } });
  const resolve = async movement => {
    await armyRef(movement).update({ arrivesAtMs: Date.now() - 1 });
    return call("resolveArmyOrder", high, request(movement));
  };
  async function setup(owner = low) {
    await seed(target, owner, 100);
    for (const user of users) await profile(user).update({ clanId: "", itemEffects: {}, peaceShieldCooldownExpiresAtMs: 0 });
    // Close only synthetic leftovers between independent scenarios.
    for (const doc of (await grants(high).get()).docs) await doc.ref.update({ status: "used", reservedArmyId: "" });
    const ref = grants(high).doc(`impact_${randomUUID()}`), now = Date.now();
    await ref.set({ ...identity, id: ref.id, originalOwnerUid: high.uid, capturerUid: low.uid,
      cityId: target.id, regionId: map.id, cityPath: city(target).path, cityName: target.name,
      capturedAtMs: now, expiresAtMs: now + 86_400_000, status: "available", usedAtMs: 0, usedArmyId: "" });
    return ref;
  }
  async function unspent(ref, expiry) {
    const record = await read(ref);
    assert.equal(record.status, "available"); assert.equal(record.usedArmyId, ""); assert.equal(record.usedAtMs, 0);
    assert(!record.reservedArmyId); assert.equal(record.expiresAtMs, expiry, "Return must never extend the deadline");
  }
  // Activation reverses the outbound army and frees the chance immediately.
  let grant = await setup(), expiry = (await read(grant)).expiresAtMs;
  let launched = (await send(grant)).movement;
  assert.equal((await read(grant)).reservedArmyId, launched.id); assert.equal((await read(grant)).usedAtMs, 0);
  await armyRef(launched).update({ arrivesAtMs: Date.now() + 600_000 });
  await call("activateInventoryItem", low, { itemId: "shield_12h" });
  assert.equal((await read(armyRef(launched))).returning, true);
  await unspent(grant, expiry);
  await assert.rejects(send(grant), /Peace Shield/);
  await city(target).update({ ownerShieldExpiresAtMs: 0 }); await profile(low).update({ itemEffects: {} });
  const retry = (await send(grant)).movement;
  await resolve(launched);
  assert.equal((await read(grant)).reservedArmyId, retry.id, "Old return cleared the newer reservation");
  await resolve(retry);
  assert.equal((await read(grant)).usedArmyId, retry.id);
  await resolve(retry); assert.equal((await read(grant)).usedArmyId, retry.id, "Duplicate resolution changed the spend");

  // Wall repairs after launch can block at arrival without spending the chance.
  grant = await setup(); expiry = (await read(grant)).expiresAtMs;
  launched = (await send(grant)).movement;
  const shieldDeadline = Date.now() + 600_000;
  await profile(low).update({ "itemEffects.shieldExpiresAtMs": shieldDeadline });
  await city(target).update({ ownerShieldExpiresAtMs: shieldDeadline, fortificationState: null });
  const blocked = await resolve(launched);
  assert(blocked.reports.some(row => /Peace Shield blocked/.test(row.summary)));
  await unspent(grant, expiry);
  await profile(low).update({ "itemEffects.shieldExpiresAtMs": 0 });
  await city(target).update({ ownerShieldExpiresAtMs: 0 });
  const loss = (await send(grant, 1)).movement;
  assert.equal((await resolve(loss)).outcome, "defeat");
  assert.equal((await read(grant)).status, "used"); assert.equal((await read(grant)).usedArmyId, loss.id);
  await assert.rejects(send(grant), /already been used/);

  // Recall, and simultaneous alternate grant IDs: one reserved army only.
  grant = await setup(); expiry = (await read(grant)).expiresAtMs;
  const older = grants(high).doc(`older_${randomUUID()}`); await older.set({ ...await read(grant), id: older.id });
  const results = await Promise.allSettled([send(grant), send(older)]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  launched = results.find(row => row.status === "fulfilled").value.movement;
  assert.equal((await read(grant)).reservedArmyId, launched.id); assert.equal((await read(older)).reservedArmyId, launched.id);
  await armyRef(launched).update({ arrivesAtMs: Date.now() + 600_000 });
  await call("useRecallHorn", high, request(launched));
  await unspent(grant, expiry); await unspent(older, expiry);
  await grant.update({ expiresAtMs: Date.now() - 1 }); await older.update({ expiresAtMs: Date.now() - 1 });
  await assert.rejects(send(grant), /Expired/);

  // A different rival can hold the exact city; clan membership blocks dispatch
  // and starts a safe return if it changes in transit.
  grant = await setup(third);
  const clanId = `impact_${randomUUID()}`;
  await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: high.uid, name: "Impact Clan", tag: "IMP" });
  for (const user of [high, third]) await profile(user).update({ clanId });
  await city(target).update({ ownerClanId: clanId });
  await assert.rejects(send(grant), /clan|allied|reinforc/i);
  await profile(third).update({ clanId: "" }); await city(target).update({ ownerClanId: "" });
  launched = (await send(grant)).movement;
  await profile(third).update({ clanId }); await city(target).update({ ownerClanId: clanId });
  assert.equal((await resolve(launched)).outcome, "allied_return_started");
  await unspent(grant, (await read(grant)).expiresAtMs);

  // A normal army recovers the city while retaliation travels. The stale
  // outbound receipt must never authorize combat after a subsequent loss.
  grant = await setup(third);
  launched = (await send(grant)).movement;
  const ordinary = (await send(null)).movement;
  assert.equal((await resolve(ordinary)).outcome, "victory");
  assert.equal((await read(grant)).status, "recovered");
  await seed(target, third, 100);
  const stale = await resolve(launched);
  assert.equal(stale.outcome, "retaliation_unavailable");
  assert.equal((await read(city(target))).ownerUid, third.uid);
  assert.equal((await read(grant)).status, "recovered");

  // Launch on time, arrive after the window: the saved launch time still counts.
  grant = await setup(); launched = (await send(grant)).movement;
  const elapsed = 25 * 3_600_000;
  const aged = { ...launched.retaliationAuthorization,
    capturedAtMs: launched.retaliationAuthorization.capturedAtMs - elapsed,
    expiresAtMs: launched.retaliationAuthorization.expiresAtMs - elapsed,
    reservedAtMs: launched.launchedAtMs - elapsed };
  await grant.update(aged);
  await armyRef(launched).update({ retaliationAuthorization: aged, launchedAtMs: launched.launchedAtMs - elapsed });
  assert.equal((await resolve(launched)).outcome, "victory");
  assert.equal((await read(grant)).usedArmyId, launched.id);

  // Historical used grants remain spent; grandfathered outbound receipts still
  // resolve, while a return cannot restore the pre-deployment spent grant.
  grant = await setup(); launched = (await send(grant)).movement;
  const receipt = { ...launched.retaliationAuthorization, version: 1, status: "used", usedArmyId: launched.id,
    usedAtMs: launched.launchedAtMs, reservedArmyId: "", reservedAtMs: 0 };
  await grant.update(receipt); await armyRef(launched).update({ retaliationAuthorization: receipt });
  assert.equal((await resolve(launched)).outcome, "victory");
  assert.equal((await read(grant)).status, "used");

  // Ownership events arriving late cannot close a grant earned after that event.
  if (ownershipEvent) {
    grant = await setup();
    const before = await read(grant);
    const change = { ...identity, status: "pending", targetType: "city", regionId: map.id, targetId: target.id,
      targetKey: `${map.id}:${target.id}`, beforeOwnerUid: third.uid, afterOwnerUid: high.uid,
      createdAtMs: before.capturedAtMs - 1 };
    await ownershipEvent(change);
    assert.equal((await read(grant)).status, "available");
  }
  console.log("Retaliation impact regression passed: shield activation/arrival, recalls, deadline preservation, duplicate sends/arrivals, stale returns, combat loss, third owner, clan change, recapture revocation and legacy receipt compatibility.");
};
