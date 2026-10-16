"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store, FieldPath } = require("../local-backend/store");
const { definitions, inspect, apply } = require("./local-postgres-army-indexes");
const flatten = p => [p, ...(p.Plans || []).flatMap(flatten)];
(async () => {
  const schema = "migration_army_index_" + crypto.randomBytes(5).toString("hex");
  const db = new Store({ schema }); let client;
  const scope = { worldId: "fixture-world", resetGeneration: "fixture-generation", realmShardId: "fixture-shard" };
  const scoped = q => q.where("worldId", "==", scope.worldId).where("resetGeneration", "==", scope.resetGeneration);
  const owned = (uid = "fixture-owner") => scoped(db.collection("armies").where("ownerUid", "==", uid))
    .where("realmShardId", "==", scope.realmShardId).where("status", "==", "active");
  const due = () => scoped(db.collection("armies").where("status", "==", "active"))
    .where("arrivesAtMs", "<=", 200).orderBy("arrivesAtMs").limit(3);
  const explain = async q => { const { text, values } = db.compile(q);
    return (await db.pool.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + text, values)).rows[0]["QUERY PLAN"][0]; };
  const snapshot = async q => (await q.get()).docs.map(d => ({ path: d.ref.path, data: d.data() }));
  try {
    await db.initialize();
    assert.throws(() => definitions("public;DROP SCHEMA public"), /Invalid/);
    // Production-sized synthetic history, no exported player records or events.
    await db.pool.query(`INSERT INTO ${schema}.documents(path,collection_id,parent_path,body,source_sha256)
      SELECT 'armies/history-'||n,'armies','',jsonb_build_object('fields',jsonb_build_object(
        'ownerUid',jsonb_build_object('stringValue','old-owner-'||(n%300)),
        'status',jsonb_build_object('stringValue','resolved'),
        'worldId',jsonb_build_object('stringValue','old-world'),
        'resetGeneration',jsonb_build_object('stringValue','old-generation'),
        'arrivesAtMs',jsonb_build_object('integerValue',n::text))), 'synthetic'
      FROM generate_series(1,90000) n`);
    const army = { ...scope, ownerUid: "fixture-owner", targetOwnerUid: "fixture-target", status: "active", arrivesAtMs: 100 };
    await db.pool.query(`INSERT INTO ${schema}.documents(path,collection_id,parent_path,body,source_sha256)
      SELECT 'armies/busy-'||n,'armies','',jsonb_build_object('fields',jsonb_build_object(
        'ownerUid',jsonb_build_object('stringValue','busy-owner-'||n),
        'status',jsonb_build_object('stringValue','active'),
        'worldId',jsonb_build_object('stringValue','fixture-world'),
        'resetGeneration',jsonb_build_object('stringValue','fixture-generation'),
        'realmShardId',jsonb_build_object('stringValue','fixture-shard'),
        'arrivesAtMs',jsonb_build_object('integerValue','10000'))), 'synthetic'
      FROM generate_series(1,1000) n`);
    for (const [id, patch] of [["a", {}], ["b", { arrivesAtMs: 100.5 }], ["c", { arrivesAtMs: 100 }],
      ["later", { arrivesAtMs: 300 }], ["other", { ownerUid: "other-owner", arrivesAtMs: 120 }],
      ["other-world", { worldId: "other-world" }], ["other-generation", { resetGeneration: "other-generation" }],
      ["other-shard", { realmShardId: "other-shard", arrivesAtMs: 150 }], ["resolved", { status: "resolved" }]]) {
      await db.doc("armies/" + id).set({ ...army, ...patch });
    }
    await db.doc("islands/fixture/armies/projection").set(army);
    await db.pool.query(`ANALYZE ${schema}.documents`);
    const queries = { owned: owned(), absent: owned("absent-owner"), due: due(),
      incoming: scoped(db.collection("armies").where("targetOwnerUid", "==", "fixture-target")).where("status", "==", "active"),
      ordered: owned().orderBy(FieldPath.documentId(), "desc").startAfter("later") };
    const before = Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([name,q]) => [name, await snapshot(q)])));
    assert.deepEqual(before.owned.map(r => r.path), ["armies/a", "armies/b", "armies/c", "armies/later"]);
    assert.deepEqual(before.due.map(r => r.path), ["armies/a", "armies/c", "armies/b"]);
    const oldPlan = await explain(owned());
    assert(flatten(oldPlan.Plan).some(p => p["Rows Removed by Filter"] >= 90000), "Fixture must reproduce the history scan");
    const countBefore = (await db.pool.query(`SELECT count(*)::int AS n FROM ${schema}.changes`)).rows[0].n;
    client = await db.pool.connect();
    assert((await inspect(client, schema)).every(i => !i.present));
    const competing = await db.pool.connect();
    try {
      await competing.query("SELECT pg_advisory_lock(hashtext($1),hashtext($2))", [schema, "army-query-indexes-v1"]);
      await assert.rejects(apply(client, schema), /Another army index/);
    } finally {
      await competing.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))", [schema, "army-query-indexes-v1"]);
      competing.release();
    }
    assert((await apply(client, schema)).every(i => i.present));
    assert((await apply(client, schema)).every(i => i.present), "Installation must be restartable without rewriting indexes");
    for (const [name,q] of Object.entries(queries)) assert.deepEqual(await snapshot(q), before[name], name + " changed results");
    const newPlan = await explain(owned()), duePlan = await explain(due());
    assert(flatten(newPlan.Plan).some(p => p["Index Name"] === "armies_owner_status_v1"));
    assert(flatten(duePlan.Plan).some(p => p["Index Name"] === "armies_due_v1"));
    assert(newPlan.Plan["Shared Hit Blocks"] + newPlan.Plan["Shared Read Blocks"] <
      (oldPlan.Plan["Shared Hit Blocks"] + oldPlan.Plan["Shared Read Blocks"]) / 100, "Owner reads must stop scanning history");
    assert(flatten(duePlan.Plan).every(p => (p["Rows Removed by Filter"] || 0) < 20), "Due scans must skip historical armies");
    assert.equal((await db.pool.query(`SELECT count(*)::int AS n FROM ${schema}.changes`)).rows[0].n, countBefore);
    const page = await due().get();
    assert.deepEqual((await due().startAfter(page.docs.at(-1)).get()).docs.map(d => d.id), ["other", "other-shard"]);
    // Real concurrent launch/arrival writes remain serializable and idempotent.
    await db.doc("wallets/owner").set({ troops: 100 });
    await Promise.all(Array.from({ length: 6 }, () => db.runTransaction(async tx => {
      const receipt = db.doc("receipts/launch"), wallet = db.doc("wallets/owner");
      const [done, balance, armies] = await Promise.all([tx.get(receipt),tx.get(wallet),tx.get(owned())]);
      if (done.exists) return;
      assert.equal(armies.size, 4);
      tx.update(wallet, { troops: balance.data().troops - 10 });
      tx.create(db.doc("armies/new"), { ...army, arrivesAtMs: 130 }); tx.create(receipt, { applied: true });
    }, { maxAttempts: 32 })));
    assert.equal((await db.doc("wallets/owner").get()).data().troops, 90);
    assert.equal((await owned().get()).size, 5);
    await db.doc("armies/new").update({ status: "resolved" });
    assert.equal((await owned().get()).size, 4);
    // A name collision must stop instead of accepting an unrelated index.
    await client.query(`DROP INDEX ${schema}.armies_owner_status_v1`);
    await client.query(`CREATE INDEX armies_owner_status_v1 ON ${schema}.documents(path)`);
    await assert.rejects(apply(client, schema), /unexpected definition/);
    console.log(JSON.stringify({ beforeMs: oldPlan["Execution Time"], afterMs: newPlan["Execution Time"], dueMs: duePlan["Execution Time"] }));
    console.log("Army indexes: 90,000-row history skipped; owner/realm/status/cursors/numeric ordering, projections, concurrent exact-once writes and installer collision checks passed.");
  } finally { client?.release(); await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error("Army index fixture failed:", error.message); process.exitCode = 1; });
