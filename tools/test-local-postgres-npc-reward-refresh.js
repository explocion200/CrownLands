"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { audit, retireCandidate } = require("./local-migration/refresh-npc-rewards");
const { createMarauderPopulation } = require("../functions/marauder-population");
const M = require("../functions/marauder-rules"), catalog = require("../functions/core-expansion-region-catalog.json");

(async () => {
  const db = new Store({ schema: "migration_npc_refresh_" + crypto.randomBytes(5).toString("hex") });
  const realm = { worldId: "refresh-test", resetGeneration: "refresh-test", sharedRealmId: "shard_0001" };
  const solo = catalog.regions.find(r => r.permanentCore === false).id;
  const boss = catalog.regions.find(r => r.permanentCore === true).id;
  const other = catalog.regions.filter(r => r.permanentCore === true)[1].id;
  const islandId = id => `${realm.worldId}--${realm.sharedRealmId}--${id}`;
  const root = db.doc(`marauderPopulation/${realm.resetGeneration}--${realm.sharedRealmId}`);
  const area = { bounds: { left: 0, top: 0, right: 5000, bottom: 5000 }, structures: [], rectangles: [],
    roadPoints: [{ x: 1200, y: 1200 }, { x: 1300, y: 1300 }, { x: 3600, y: 3600 }, { x: 3500, y: 3500 }],
    walkable: () => true, accessible: () => true };
  const population = createMarauderPopulation({ db, runTransaction: cb => db.runTransaction(cb),
    context: () => ({ ...realm, realmShardId: realm.sharedRealmId, storageId: `${realm.resetGeneration}--${realm.sharedRealmId}` }),
    activeRegions: async () => [solo, boss, other], descriptor: id => catalog.regions.find(r => r.id === id),
    layout: () => area, islandId });
  const rows = async region => (await db.collection(`islands/${islandId(region)}/marauderCombat`).get()).docs;
  const visible = ref => db.doc(ref.path.replace("/marauderCombat/", "/marauders/"));
  const snapshot = async () => (await db.pool.query(`SELECT path,body FROM ${db.schema}.documents ORDER BY path`)).rows;
  const legacy = async ref => {
    const row = (await ref.get()).data(), spawnId = crypto.randomUUID();
    const patch = { balanceVersion: 1, status: "active", spawnId, respawnAtMs: 0 };
    await db.batch().set(ref, { ...patch, troops: M.balance(row.level, 1).defenders }, { merge: true })
      .set(visible(ref), patch, { merge: true }).commit();
    return spawnId;
  };
  const candidate = async ref => {
    const plan = await audit(db, realm), item = plan.candidates.find(c => c.path === ref.path);
    assert(item); return { plan, item };
  };
  try {
    await db.initialize();
    await db.doc("realmConfig/current").set(realm);
    await db.doc(`realmGenerations/${realm.resetGeneration}/expansion/current`).set({ activeRegionIds: [solo] });
    await root.set({ enabled: true, cursor: 0 });
    for (const id of [solo, boss, other]) {
      await db.doc(`islands/${islandId(id)}`).set({ regionId: id });
      await population.populate(id, Date.now());
    }
    const solos = await rows(solo), bossRef = (await rows(boss))[0].ref, cooldown = (await rows(other))[0].ref;
    await legacy(solos[0].ref); await legacy(bossRef); await legacy(cooldown);
    await db.batch().set(cooldown, { status: "defeated", respawnAtMs: Date.now() + 1800000 }, { merge: true })
      .set(visible(cooldown), { status: "defeated", respawnAtMs: Date.now() + 1800000 }, { merge: true }).commit();
    // Inactive, retired and archived documents cannot enter the operator plan.
    const source = (await bossRef.get()).data();
    await db.doc("islands/archived/marauderCombat/archived").set({ ...source, worldId: "archived" });
    await db.doc("islands/inactive/marauderCombat/inactive").set({ ...source, regionId: "unknown-map" });
    await db.doc("islands/retired/marauderCombat/retired").set({ ...source, status: "retired" });
    await db.doc("players/unchanged").set({ gold: 123, gear: { boxes: 5 } });
    const before = await snapshot(), plan = await audit(db, realm);
    assert.deepEqual(await snapshot(), before, "Planning is read-only");
    assert.equal(plan.candidates.length, 2); assert.equal(plan.counts.current, 1);
    const item = plan.candidates.find(c => c.path === bossRef.path);
    const race = await Promise.all([retireCandidate(db, plan, item), retireCandidate(db, plan, item)]);
    assert.equal(race.filter(r => r.status === "retired").length, 1);
    assert.equal((await bossRef.get()).data().status, "retired");
    assert.equal((await visible(bossRef).get()).data().status, "retired");
    assert.equal((await root.collection("maps").doc(boss).get()).data().initialized, false);
    await population.maintain(Date.now());
    const replacement = (await bossRef.get()).data();
    assert.equal(replacement.balanceVersion, 2); assert.equal(replacement.status, "active");
    assert.notEqual(replacement.spawnId, item.spawnId);
    assert(replacement.x !== source.x || replacement.y !== source.y);
    assert.equal(replacement.troops, M.balance(replacement.level, 2).defenders);
    assert.equal((await visible(bossRef).get()).data().spawnId, replacement.spawnId);
    assert.equal((await retireCandidate(db, plan, item)).status, "changed");
    const allowed = new Set([bossRef.path, visible(bossRef).path, root.path, root.collection("maps").doc(boss).path]);
    const after = new Map((await snapshot()).map(r => [r.path, r.body]));
    for (const row of before) if (!allowed.has(row.path)) assert.deepEqual(after.get(row.path), row.body, row.path);
    assert.equal((await root.collection("balanceRefresh").get()).size, 1);

    // A launch after the dry run is protected, including scouts and forming rallies.
    for (const kind of ["attack", "scout", "forming", "launched", "recalling"]) {
      const spawnId = await legacy(bossRef), { plan: p, item: c } = await candidate(bossRef);
      const activity = db.doc(["attack", "scout"].includes(kind) ? "armies/protected" : "clans/test/rallies/protected");
      await activity.set({ targetSpawnId: spawnId, status: ["attack", "scout"].includes(kind) ? "active" : kind, returning: false, kind });
      const unchanged = await snapshot();
      assert.equal((await retireCandidate(db, p, c)).status, "busy");
      assert.deepEqual(await snapshot(), unchanged);
      assert.equal((await audit(db, realm)).counts.busy, 1);
      await activity.delete();
    }
    // Actual SERIALIZABLE phantom protection: an army commits after the refresh
    // reads an empty army query. Retry must see it and leave the target intact.
    const spawnId = await legacy(bossRef), pending = await candidate(bossRef);
    let signal, resume, intercepted = false;
    const reached = new Promise(r => { signal = r; }), continueRead = new Promise(r => { resume = r; });
    const racingDb = { doc: db.doc.bind(db), collection: db.collection.bind(db), collectionGroup: db.collectionGroup.bind(db) };
    racingDb.runTransaction = cb => db.runTransaction(async tx => {
      const get = tx.get.bind(tx);
      tx.get = async target => {
        const result = await get(target);
        if (!intercepted && target.scope?.collection === "armies") {
          intercepted = true; signal(); await continueRead;
        }
        return result;
      };
      return cb(tx);
    });
    const retirement = retireCandidate(racingDb, pending.plan, pending.item);
    await reached;
    await db.runTransaction(async tx => {
      assert.equal((await tx.get(bossRef)).data().status, "active");
      tx.create(db.doc("armies/racing"), { targetSpawnId: spawnId, status: "active", returning: false });
    });
    resume(); assert.equal((await retirement).status, "busy");
    assert.equal((await bossRef.get()).data().status, "active");
    await db.doc("armies/racing").delete();
    const checked = await candidate(bossRef);
    await bossRef.update({ troops: 1 });
    assert.equal((await retireCandidate(db, checked.plan, checked.item)).status, "changed", "A battle after review cannot be overwritten");
    const changedRealm = await candidate(bossRef);
    await db.doc("realmConfig/current").update({ resetGeneration: "next-season" });
    await assert.rejects(retireCandidate(db, changedRealm.plan, changedRealm.item), /Current realm changed/);
    await assert.rejects(audit(db, realm), /Current realm changed/);
    console.log("NPC refresh passed: read-only review, scoped retirement, protected active armies/rallies, real concurrent-launch serialization, stale-plan rejection, idempotent receipts, untouched cooldowns/player/archive data and ordinary version-2 respawn.");
  } finally {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
