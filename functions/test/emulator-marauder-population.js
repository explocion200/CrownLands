"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app"), { getFirestore } = require("firebase-admin/firestore");
const { createMarauderPopulation, isClear } = require("../marauder-population");
const M = require("../marauder-rules"), topology = require("../coreExpansionTopology");
const catalog = require("../core-expansion-region-catalog.json");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator only");
initializeApp({ projectId: process.env.GCLOUD_PROJECT || "crown-land-b15e0" });
const db = getFirestore(), token = crypto.randomBytes(6).toString("hex");
const world = { worldId: `population_${token}`, resetGeneration: `generation_${token}`, realmShardId: "shard_0001", storageId: `population_${token}` };
const regions = new Map(catalog.regions.map(row => [row.id, row]));
let active = [...regions.keys()], blocked = false;
const geometry = () => ({ bounds: { left: 0, top: 0, right: 5000, bottom: 5000 },
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
      assert.equal(row.troops, M.balance(row.level).defenders);
      assert(isClear(row, { ...geometry(), enemies: rows.filter(other => other.id !== row.id) }));
      assert(geometry().accessible(row));
    });
    const publicRows = await island(region).collection("marauders").get();
    assert(publicRows.docs.every(doc => !Object.hasOwn(doc.data(), "troops")), "No public current defender intelligence");
    assert.equal((await population.populate(region, now + 1)).spawned, 0, "No auto expiry or duplicate spawn");
  }
  const bosses = await db.collectionGroup("marauderCombat").where("worldId", "==", world.worldId).where("classification", "==", "boss").get();
  assert.equal(bosses.size, 25);
  // Newly activated, generated New Lands must populate even when closed to claims.
  const future = topology.getRegionAtActivationOrdinal(120);
  regions.set(future.id, { ...future, permanentCore: false, spawnEligible: false }); active = [future.id];
  await island(future.id).set({ ...world }); blocked = true;
  const unavailable = await population.maintain(now); assert.equal(unavailable.spawned, 0); assert.equal(unavailable.blocked, 12);
  blocked = false; assert.equal((await population.maintain(now + 60000)).spawned, 12);
  for (const row of [(await island(future.id).collection("marauderCombat").get()).docs[0], bosses.docs[0]]) {
    const before = row.data(), delay = before.classification === "boss" ? 1800000 : 120000;
    await row.ref.set({ status: "defeated", respawnAtMs: now + delay }, { merge: true });
    active = [before.regionId];
    assert.equal((await population.populate(before.regionId, now + delay - 1)).spawned, 0);
    assert.equal((await population.populate(before.regionId, now + delay)).spawned, 1);
    const after = (await row.ref.get()).data();
    assert.notEqual(after.spawnId, before.spawnId); assert.equal(after.regionId, before.regionId);
    assert(Math.hypot(after.x - before.x, after.y - before.y) >= 128, "Replacement gets a new clear location");
  }
  const area = geometry();
  assert.equal(isClear({ x: 50, y: 50 }, area), false);
  assert.equal(isClear({ x: 1100, y: 300 }, area), false);
  assert.equal(isClear({ x: 2500, y: 2500 }, area), false);
  await population.rolloutRef().set({ enabled: false }, { merge: true });
  assert.equal((await population.maintain(now)).enabled, false);
  console.log("Population passed: all 25 Core maps and prepared New Lands, 12-slot distribution, generated closed-admission maps, clearance/terrain/routes, blocked retry, idempotent slots, immutable replacements, two/30-minute cooldowns and rollout gate.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
