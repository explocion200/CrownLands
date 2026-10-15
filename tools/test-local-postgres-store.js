"use strict";
// Explicit local PostgreSQL integration test; all fixtures are synthetic.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store, FieldValue, FieldPath, Filter, Timestamp } = require("../local-backend/store");

(async () => {
  const schema = "migration_store_" + crypto.randomBytes(6).toString("hex");
  const db = new Store({ schema });
  try {
    await db.initialize();
    await db.doc("players/a").set({ gold: 100, worldId: "fixture", settings: { x: 1, y: 2 } });
    await db.doc("players/b").set({ gold: 10, worldId: "fixture" });
    await db.doc("players/c").set({ gold: 2.5, worldId: "fixture", tags: ["a", "b"] });
    await db.doc("players/d").set({ worldId: "fixture", gold: null });
    await db.doc("players/e").set({ worldId: "other" });
    assert.equal((await db.doc("players/a").get()).data().gold, 100);
    assert.deepEqual((await db.collection("players").where(FieldPath.documentId(), "==", "a").select("settings.x").get()).docs[0].data(), { settings: { x: 1 } });
    assert.equal((await db.doc("players/missing").get()).exists, false);
    assert.deepEqual((await db.collection("players").where("worldId", "==", "fixture").where("gold", ">", 0).orderBy("gold").get()).docs.map(d => d.id), ["c", "b", "a"]);
    assert.deepEqual((await db.collection("players").where("gold", ">", 0).limit(2).get()).docs.map(d => d.id), ["c", "b"]);
    assert.deepEqual((await db.collection("players").where(Filter.or(Filter.where("gold", "==", 10), Filter.where("gold", "==", 100))).orderBy("gold", "desc").get()).docs.map(d => d.id), ["a", "b"]);
    assert.deepEqual((await db.collection("players").where("tags", "array-contains", "b").get()).docs.map(d => d.id), ["c"]);
    assert.equal((await db.collection("players").where("gold", "not-in", [null]).get()).size, 0);
    const first = await db.collection("players").where("gold", ">", 0).orderBy("gold").limit(1).get();
    const next = await db.collection("players").where("gold", ">", 0).orderBy("gold").startAfter(first.docs[0]).get();
    assert.deepEqual(next.docs.map(d => d.id), ["b", "a"]);
    await db.doc("parents/p/children/a").set({ owner: "a" });
    await db.doc("parents/p-2/children/b").set({ owner: "a" });
    assert.deepEqual((await db.collectionGroup("children").where("owner", "==", "a").orderBy(FieldPath.documentId()).get()).docs.map(d => d.ref.path), ["parents/p/children/a", "parents/p-2/children/b"]);
    await db.doc("events/a").set({ when: Timestamp.fromString("2026-10-15T12:00:00Z") });
    await db.doc("events/b").set({ when: Timestamp.fromString("2026-10-15T12:00:00.000000001Z") });
    assert.deepEqual((await db.collection("events").orderBy("when").get()).docs.map(d => d.id), ["a", "b"]);
    const names = ["é", "aa", "z", "a_", "a-", "a", "Z", "B"];
    for (const name of names) await db.doc("collation/" + name).set({ name });
    const orderedNames = [...names].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    assert.deepEqual((await db.collection("collation").get()).docs.map(d => d.id), orderedNames);
    const orderedDocs = (await db.collection("collation").orderBy("name").get()).docs;
    assert.deepEqual(orderedDocs.map(d => d.data().name), orderedNames);
    assert.deepEqual((await db.collection("collation").orderBy("name").startAfter(orderedDocs[2]).get()).docs.map(d => d.id), orderedNames.slice(3));
    assert.deepEqual((await db.collection("collation").where(FieldPath.documentId(), ">", "a").get()).docs.map(d => d.id), orderedNames.filter(n => Buffer.compare(Buffer.from(n), Buffer.from("a")) > 0));
    await assert.rejects(db.runTransaction(async tx => {
      const ref = db.doc("players/a"); const snap = await tx.get(ref);
      tx.update(ref, { gold: snap.data().gold - 99 });
      tx.create(db.doc("players/b"), { gold: 0 });
    }));
    assert.equal((await db.doc("players/a").get()).data().gold, 100);
    const beforeChanges = Number((await db.pool.query(`SELECT count(*) FROM ${schema}.changes`)).rows[0].count);
    await Promise.all(Array.from({ length: 8 }, () => db.runTransaction(async tx => {
      const player = db.doc("players/a"), receipt = db.doc("receipts/idempotent-purchase");
      const [current, done] = await tx.getAll(player, receipt);
      if (done.exists) return;
      tx.update(player, { gold: current.data().gold - 20 });
      tx.create(receipt, { charged: 20 });
    }, { maxAttempts: 32 })));
    assert.equal((await db.doc("players/a").get()).data().gold, 80);
    assert.equal(Number((await db.pool.query(`SELECT count(*) FROM ${schema}.changes`)).rows[0].count), beforeChanges + 2);
    await Promise.all(Array.from({ length: 8 }, () => db.runTransaction(async tx => {
      const player = db.doc("players/a"), snap = await tx.get(player);
      tx.update(player, { gold: snap.data().gold + 1 });
    }, { maxAttempts: 32 })));
    assert.equal((await db.doc("players/a").get()).data().gold, 88);
    await db.doc("players/a").update({ "settings.x": FieldValue.delete(), gold: FieldValue.increment(2) });
    assert.deepEqual((await db.doc("players/a").get()).data().settings, { y: 2 });
    assert.equal((await db.doc("players/a").get()).data().gold, 90);
    assert.throws(() => new Store({ schema: "public" }));
    assert.throws(() => new Store({ schema, host: "remote.example" }));
    console.log("PostgreSQL store: query ordering/cursors, missing parents, nanoseconds, atomic rollback, concurrent idempotency, lost-update prevention and transactional change records passed.");
  } finally {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.close();
  }
})().catch(error => { console.error("PostgreSQL store integration failed:", error.message); process.exitCode = 1; });
