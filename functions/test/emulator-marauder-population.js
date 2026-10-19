"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app"), { getFirestore } = require("firebase-admin/firestore");
const { createMarauderPopulation, isClear, minimumEnemySeparation, placementBounds, roadPlacementPoints } = require("../marauder-population");
const M = require("../marauder-rules"), topology = require("../coreExpansionTopology");
const catalog = require("../core-expansion-region-catalog.json");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator only");
initializeApp({ projectId: process.env.GCLOUD_PROJECT || "crown-land-b15e0" });
const db = getFirestore(), token = crypto.randomBytes(6).toString("hex");
const world = { worldId: `population_${token}`, resetGeneration: `generation_${token}`, realmShardId: "shard_0001", storageId: `population_${token}` };
const regions = new Map(catalog.regions.map(row => [row.id, row]));
let active = [...regions.keys()], blocked = false, roadsAvailable = true;
const roads = Array.from({ length: 6 }, (_, y) => Array.from({ length: 31 }, (_, x) => ({ x: 1000 + x * 100, y: 1000 + y * 600 }))).flat();
const geometry = () => ({ bounds: { left: 0, top: 0, right: 5000, bottom: 5000 },
  roadPoints: roadsAvailable ? roads : [],
  structures: [{ x: 2500, y: 2500, clearance: 132 }], rectangles: [{ left: 200, top: 200, right: 1200, bottom: 800 }],
  walkable: point => !blocked && point.x > 1000, accessible: point => point.y > 1000 });
const population = createMarauderPopulation({ db, runTransaction: operation => db.runTransaction(operation), context: () => world,
  activeRegions: async () => active, descriptor: id => regions.get(id), layout: geometry, islandId: id => `${world.worldId}--${id}` });
const island = id => db.doc(`islands/${world.worldId}--${id}`);
async function main() {
  let now = Date.now();
  assert.equal((await population.maintain(now)).enabled, false);
  await population.rolloutRef().set({ enabled: true });
  for (const region of active) await island(region).set({ ...world, regionId: region });
  for (const region of active) {
    const expected = M.slots(regions.get(region));
    const result = await population.populate(region, now); assert.equal(result.spawned, expected.length);
    const rows = (await island(region).collection("marauderCombat").get()).docs.map(doc => doc.data());
    assert.equal(rows.length, expected.length);
    rows.forEach(row => {
      const slot = expected.find(entry => entry.slot === row.slot);
      assert(row.level >= slot.min && row.level <= slot.max);
      assert.equal(row.classification === "boss", regions.get(region).permanentCore);
      assert.equal(row.troops, M.balance(row.level, row.balanceVersion).defenders);
      assert.equal(row.placementVersion, 4);
      assert.equal(row.balanceVersion, 2);
      assert(roadPlacementPoints(geometry()).some(point => point.x === row.x && point.y === row.y), "All new NPCs use a road sample");
      const interior = placementBounds(geometry().bounds);
      assert(row.x >= interior.left && row.x <= interior.right && row.y >= interior.top && row.y <= interior.bottom,
        "Every generated spawn stays inside the inset area");
      assert(isClear(row, { ...geometry(), enemies: rows.filter(other => other.id !== row.id) }));
      assert(geometry().accessible(row));
    });
    const publicRows = await island(region).collection("marauders").get();
    assert(publicRows.docs.every(doc => !Object.hasOwn(doc.data(), "troops")), "No public current defender intelligence");
    assert.equal((await population.populate(region, now + 1)).spawned, 0, "No auto expiry or duplicate spawn");
  }
  const bosses = await db.collectionGroup("marauderCombat").where("worldId", "==", world.worldId).where("classification", "==", "boss").get();
  assert.equal(bosses.size, 25);
  // An old edge spawn remains stationary until defeated, including when a
  // committed army still refers to its immutable spawn identity.
  const oldBoss = bosses.docs[0], oldBossRow = { ...oldBoss.data(), x: 50, y: 50, placementVersion: 1, balanceVersion: 1, troops: M.balance(oldBoss.data().level, 1).defenders };
  await oldBoss.ref.set(oldBossRow);
  const oldPublic = island(oldBossRow.regionId).collection("marauders").doc(oldBoss.id);
  await oldPublic.set({ x: 50, y: 50, placementVersion: 1, balanceVersion: 1 }, { merge: true });
  const marching = db.doc(`armies/placement_${token}`);
  await marching.set({ targetSpawnId: oldBossRow.spawnId, toX: 50, toY: 50, status: "marching" });
  assert.equal((await population.populate(oldBossRow.regionId, now + 1)).spawned, 0);
  assert.deepEqual((await oldBoss.ref.get()).data(), oldBossRow, "Do not move or reset an active old spawn");
  assert.equal((await oldPublic.get()).data().x, 50);
  assert.equal((await marching.get()).data().targetSpawnId, oldBossRow.spawnId);
  // Newly activated, generated New Lands must populate even when closed to claims.
  const future = topology.getRegionAtActivationOrdinal(120);
  regions.set(future.id, { ...future, permanentCore: false, spawnEligible: false }); active = [future.id];
  await island(future.id).set({ ...world }); blocked = true;
  const unavailable = await population.maintain(now); assert.equal(unavailable.spawned, 0); assert.equal(unavailable.blocked, 2);
  blocked = false; assert.equal((await population.maintain(now + 60000)).spawned, 2);
  for (const row of [(await island(future.id).collection("marauderCombat").get()).docs[0], bosses.docs[0]]) {
    const before = (await row.ref.get()).data(), delay = before.classification === "boss" ? 1800000 : 120000;
    await row.ref.set({ status: "defeated", respawnAtMs: now + delay }, { merge: true });
    active = [before.regionId];
    assert.equal((await population.populate(before.regionId, now + delay - 1)).spawned, 0);
    assert.equal((await population.populate(before.regionId, now + delay)).spawned, 1);
    const after = (await row.ref.get()).data();
    assert.equal(after.balanceVersion, 2, "Only replacements receive new balance");
    assert.notEqual(after.spawnId, before.spawnId); assert.equal(after.regionId, before.regionId);
    assert.equal(after.placementVersion, 4);
    assert(roadPlacementPoints(geometry()).some(point => point.x === after.x && point.y === after.y), "Replacements stay on roads");
    const interior = placementBounds(geometry().bounds);
    assert(after.x >= interior.left && after.x <= interior.right && after.y >= interior.top && after.y <= interior.bottom);
    assert(Math.hypot(after.x - before.x, after.y - before.y) > 0, "Replacement gets a new clear location");
  }
  const tinyRegion = topology.getRegionAtActivationOrdinal(121);
  regions.set(tinyRegion.id, { ...tinyRegion, permanentCore: false });
  await island(tinyRegion.id).set({ ...world });
  const tinyPopulation = createMarauderPopulation({ db, runTransaction: operation => db.runTransaction(operation), context: () => world,
    activeRegions: async () => [tinyRegion.id], descriptor: id => regions.get(id),
    layout: () => ({ ...geometry(), bounds: { left: 0, top: 0, right: 100, bottom: 100 } }), islandId: id => `${world.worldId}--${id}` });
  assert.equal((await tinyPopulation.populate(tinyRegion.id, now)).blocked, 2, "An unusable inset retries instead of throwing from randomInt");
  assert.equal((await island(tinyRegion.id).collection("marauders").get()).size, 0);
  // Walkable open ground is not a fallback when roads are missing/blocked.
  roadsAvailable = false;
  assert.equal((await population.populate(tinyRegion.id, now)).blocked, 2);
  assert.equal((await island(tinyRegion.id).collection("marauders").get()).size, 0);
  const roadlessBoss = bosses.docs[1], roadlessBossRow = roadlessBoss.data();
  await roadlessBoss.ref.set({ status: "defeated", respawnAtMs: now }, { merge: true });
  assert.deepEqual(await population.populate(roadlessBossRow.regionId, now), { spawned: 0, blocked: 1, retired: 0 });
  assert.equal((await roadlessBoss.ref.get()).data().spawnId, roadlessBossRow.spawnId, "Blocked boss replacement retains the defeated identity");
  roadsAvailable = true;
  assert.equal((await population.populate(roadlessBossRow.regionId, now + 60000)).spawned, 1);
  assert.equal((await population.populate(tinyRegion.id, now + 60000)).spawned, 2, "Road availability restores blocked slots");
  // A safe road with space for one enemy must leave the other slots empty,
  // even when plenty of walkable open ground is available nearby.
  const crowdedRegion = topology.getRegionAtActivationOrdinal(122);
  regions.set(crowdedRegion.id, { ...crowdedRegion, permanentCore: false });
  await island(crowdedRegion.id).set({ ...world });
  let crowded = true;
  const partialPopulation = createMarauderPopulation({ db, runTransaction: operation => db.runTransaction(operation), context: () => world,
    activeRegions: async () => [crowdedRegion.id], descriptor: id => regions.get(id),
    layout: () => ({ ...geometry(), roadPoints: crowded ? [{ x: 1600, y: 2000 }] : roads }), islandId: id => `${world.worldId}--${id}` });
  assert.deepEqual(await partialPopulation.populate(crowdedRegion.id, now), { spawned: 1, blocked: 1, retired: 0 });
  const partialRows = await island(crowdedRegion.id).collection("marauderCombat").get();
  assert.equal(partialRows.size, 1);
  const retained = partialRows.docs[0].data();
  const concurrent = await Promise.all([partialPopulation.populate(crowdedRegion.id, now + 1), partialPopulation.populate(crowdedRegion.id, now + 1)]);
  assert(concurrent.every(result => result.spawned === 0 && result.blocked === 1));
  assert.deepEqual((await partialRows.docs[0].ref.get()).data(), retained, "Retries retain active road targets");
  const metadata = (await partialPopulation.rolloutRef().collection("maps").doc(crowdedRegion.id).get()).data();
  assert.equal(metadata.initialized, false); assert.equal(metadata.retryAtMs, now + 60001);
  crowded = false;
  assert.equal((await partialPopulation.maintain(now + 60001)).spawned, 1, "Only vacant slots fill when safe road space becomes available");
  const completed = (await island(crowdedRegion.id).collection("marauderCombat").get()).docs.map(doc => doc.data());
  assert.equal(completed.length, 2);
  assert(Math.hypot(completed[0].x - completed[1].x, completed[0].y - completed[1].y) >= minimumEnemySeparation(geometry().bounds));
  // The second slot alternates medium/high bands only after a defeated spawn
  // completes its cooldown. A failed attack cannot change the current level.
  const varied = (await island(crowdedRegion.id).collection("marauderCombat").get()).docs.find(doc => doc.data().slot === 1);
  let previous = varied.data();
  for (let cycle = 1; cycle <= 4; cycle++) {
    await varied.ref.set({ status: "defeated", respawnAtMs: now + cycle * 120000 }, { merge: true });
    assert.equal((await partialPopulation.populate(crowdedRegion.id, now + cycle * 120000 - 1)).spawned, 0);
    assert.equal((await partialPopulation.populate(crowdedRegion.id, now + cycle * 120000)).spawned, 1);
    const next = (await varied.ref.get()).data();
    assert(previous.level <= 39 ? next.level >= 40 && next.level <= 79 : next.level >= 11 && next.level <= 39);
    assert.notEqual(next.spawnId, previous.spawnId); previous = next;
  }
  // The versioned sweep revisits formerly initialized maps. Remove obsolete
  // slots and a close valid slot, preserve the beginner's identity/defenders,
  // and atomically replace the second target at the required distance.
  const beginner = (await island(crowdedRegion.id).collection("marauderCombat").get()).docs.find(doc => doc.data().slot === 0);
  const beginnerBefore = beginner.data();
  const close = { ...(await varied.ref.get()).data(), x: beginnerBefore.x + 150, y: beginnerBefore.y, troops: 321 };
  await varied.ref.set(close);
  for (let slot = 2; slot < 12; slot++) {
    const id = beginner.id.slice(0, -2) + String(slot).padStart(2, "0");
    const row = { ...beginnerBefore, id, slot, status: slot === 11 ? "defeated" : "active", respawnAtMs: now - 1,
      spawnId: `old-spawn-${slot}`, placementVersion: 2 };
    await island(crowdedRegion.id).collection("marauderCombat").doc(id).set(row);
    const { troops, ...publicRow } = row; await island(crowdedRegion.id).collection("marauders").doc(id).set(publicRow);
  }
  await partialPopulation.rolloutRef().collection("maps").doc(crowdedRegion.id).set({ initialized: true, placementVersion: 2 });
  const upgrades = await Promise.all([partialPopulation.maintain(now + 1000000), partialPopulation.maintain(now + 1000000)]);
  assert.equal(upgrades.reduce((sum, result) => sum + result.retired, 0), 11);
  assert.equal(upgrades.reduce((sum, result) => sum + result.spawned, 0), 1);
  const reconciled = (await island(crowdedRegion.id).collection("marauderCombat").get()).docs.map(doc => doc.data());
  assert.equal(reconciled.filter(row => row.status === "active").length, 2);
  assert.equal(reconciled.filter(row => row.status === "retired").length, 10);
  assert.deepEqual((await beginner.ref.get()).data(), beginnerBefore);
  assert.notEqual((await varied.ref.get()).data().spawnId, close.spawnId);
  const removed = reconciled.find(row => row.slot === 2);
  assert.equal(removed.spawnId, "old-spawn-2"); assert.equal(removed.troops, beginnerBefore.troops);
  assert.equal(removed.x, beginnerBefore.x); assert.equal(removed.retirementPolicyVersion, 4);
  assert((await island(crowdedRegion.id).collection("marauders").get()).docs.every(doc => !Object.hasOwn(doc.data(), "troops")));
  assert.equal((await partialPopulation.maintain(now + 1060000)).retired, 0, "Retirement is idempotent and old due slots no longer retry");
  const area = geometry();
  // Deadline wake-ups only replace the named, due identity in an eligible map.
  for (const ref of [beginner.ref, bosses.docs[2].ref]) {
    const before = (await ref.get()).data(), publicRef = island(before.regionId).collection("marauders").doc(ref.id);
    const request = { regionId: before.regionId, id: ref.id, spawnId: before.spawnId };
    active = [before.regionId];
    const due = now + 2000000, patch = { status: "defeated", respawnAtMs: due };
    assert.equal((await population.refresh(request, due)).spawned, 0, "Active targets cannot be reset");
    await ref.set(patch, { merge: true }); await publicRef.set(patch, { merge: true });
    assert.equal((await population.refresh(request, due - 1)).spawned, 0, "Client cannot accelerate the deadline");
    assert.equal((await population.refresh({ ...request, spawnId: "stale" }, due)).spawned, 0);
    active = []; assert.equal((await population.refresh(request, due)).spawned, 0, "Inactive maps cannot respawn");
    active = [before.regionId];
    await ref.set({ resetGeneration: "stale" }, { merge: true });
    assert.equal((await population.refresh(request, due)).spawned, 0, "A foreign realm identity cannot respawn");
    await ref.set({ resetGeneration: world.resetGeneration }, { merge: true });
    roadsAvailable = false;
    assert.equal((await population.refresh(request, due)).blocked, 1);
    assert.equal((await population.refresh(request, due + 1)).blocked, 0, "Concurrent viewers do not repeatedly search blocked roads");
    assert.equal((await publicRef.get()).data().status, "defeated", "Keep the remains until replacement is committed");
    assert.equal((await publicRef.get()).data().spawnId, before.spawnId);
    roadsAvailable = true;
    const results = await Promise.all([population.refresh(request, due + 60000), population.refresh(request, due + 60000), population.maintain(due + 60000)]);
    assert.equal(results.reduce((sum, result) => sum + result.spawned, 0), 1, "Viewers and scheduler create exactly one replacement");
    const after = (await publicRef.get()).data();
    assert.equal(after.status, "active"); assert.equal(after.respawnAtMs, 0);
    assert.notEqual(after.spawnId, before.spawnId);
    assert(Math.hypot(after.x - before.x, after.y - before.y) > 0);
    assert.equal(after.spawnId, (await ref.get()).data().spawnId, "Public corpse removal and private replacement are atomic");
    assert(!Object.hasOwn(after, "troops") && !Object.hasOwn(after, "respawnRetryAtMs"));
    assert.equal((await population.refresh(request, due + 60001)).spawned, 0, "Replayed request cannot replace the new target");
    await ref.set({ status: "retired" }, { merge: true });
    assert.equal((await population.refresh({ ...request, spawnId: after.spawnId }, due + 60001)).spawned, 0);
  }
  assert.equal((await population.refresh({ regionId: "missing", id: "../escape", spawnId: "x" }, now)).spawned, 0);
  assert.equal(isClear({ x: 50, y: 50 }, area), false);
  assert.equal(isClear({ x: 1100, y: 300 }, area), false);
  assert.equal(isClear({ x: 2500, y: 2500 }, area), false);
  await population.rolloutRef().set({ enabled: false }, { merge: true });
  assert.equal((await population.maintain(now)).enabled, false);
  const fixture = require("../../tools/validate-marauder-terrain").createPlacementFixture();
  await require("./marauder-respawn-cases")({ db, geometry: fixture.geometry });
  console.log("Population passed: max two widely separated solo NPCs, beginner/alternating medium-high slots, road-only spawns, no fallback, partial/concurrent retries, versioned/idempotent retirement of old/close targets, retained eligible identities, all Core/prepared/generated closed-admission maps, unchanged building clearance/inset, replacement cooldowns and rollout gate.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
