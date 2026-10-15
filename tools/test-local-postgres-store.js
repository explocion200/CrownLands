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
    await Promise.all(Array.from({ length: 30 }, () => db.doc("blind/increments").set({ total: FieldValue.increment(1) }, { merge: true })));
    assert.equal((await db.doc("blind/increments").get()).data().total, 30, "Blind concurrent writes must preserve increments on an initially missing key");
    await Promise.all(Array.from({ length: 20 }, (_, i) => db.doc("blind/merges").set({ ["field" + i]: i }, { merge: true })));
    assert.equal(Object.keys((await db.doc("blind/merges").get()).data()).length, 20);
    const creates = await Promise.allSettled(Array.from({ length: 10 }, () => db.doc("blind/create").create({ fixture: true })));
    assert.equal(creates.filter(result => result.status === "fulfilled").length, 1);
    assert(creates.filter(result => result.status === "rejected").every(result => result.reason.code === 6));
    // Scout reports use a FieldPath because a city ID can contain a literal dot.
    await db.doc("players/a").update(new FieldPath("reports", "city.with.dots"), { seen: true }, "settings.y", 3);
    await db.runTransaction(async tx => {
      tx.update(db.doc("players/a"), new FieldPath("reports", "city.with.dots"), FieldValue.delete());
    });
    assert.deepEqual((await db.doc("players/a").get()).data().reports, {});
    assert.equal((await db.doc("players/a").get()).data().settings.y, 3);
    await assert.rejects(db.doc("players/a").update("settings", {}, "settings.x", 4), /[Cc]onflict/);
    assert.throws(() => db.doc("players/a").update("settings.x"), /pairs/);
    // Cleanup must see direct subcollections, including missing parent documents,
    // while escaped LIKE characters cannot select an unrelated player's data.
    await db.doc("parents/literal_%/direct/a/nested/b").set({ fixture: true });
    await db.doc("parents/literal_%/another/a").set({ fixture: true });
    await db.doc("parents/literal_XX/notMine/a").set({ fixture: true });
    assert.deepEqual((await db.doc("parents/literal_%").listCollections()).map(c => c.id), ["another", "direct"]);
    assert.deepEqual(await db.doc("parents/no-children").listCollections(), []);
    const guarded = db.doc("maintenance/guarded");
    await guarded.set({ revision: 1 });
    // Freeze the clock after a fixture write to prove versions advance even
    // when the wall clock cannot distinguish consecutive commits.
    const now = Timestamp.now;
    Timestamp.now = () => Timestamp.fromString("2099-01-01T00:00:00.999999999Z");
    try {
      await guarded.update({ revision: 2 });
      const oldVersion = (await guarded.get()).updateTime;
      await guarded.update({ revision: 3 }, { lastUpdateTime: oldVersion });
      assert.equal((await guarded.get()).updateTime.toString(), "2099-01-01T00:00:01.000000000Z");
      await assert.rejects(guarded.delete({ lastUpdateTime: oldVersion }), { code: 9 });
      const batch = db.batch();
      batch.set(db.doc("maintenance/must-roll-back"), { fixture: true });
      batch.delete(guarded, { lastUpdateTime: oldVersion });
      await assert.rejects(batch.commit(), { code: 9 });
      assert.equal((await db.doc("maintenance/must-roll-back").get()).exists, false);
      // A stale cleanup candidate must fail independently; other bulk writes finish.
      const bulk = db.bulkWriter();
      const stale = bulk.delete(guarded, { lastUpdateTime: oldVersion }).then(() => false, error => error.code === 9);
      const removed = bulk.delete(db.doc("players/b"));
      await bulk.close();
      assert.equal(await stale, true); await removed;
      assert.equal((await guarded.get()).data().revision, 3);
      assert.equal((await db.doc("players/b").get()).exists, false);
      assert.throws(() => bulk.delete(guarded), /closed/);
      await guarded.delete({ lastUpdateTime: (await guarded.get()).updateTime });
      await guarded.delete();
      await assert.rejects(guarded.delete({ exists: true }), { code: 9 });
    } finally { Timestamp.now = now; }
    assert.throws(() => new Store({ schema: "public" }));
    assert.throws(() => new Store({ schema, host: "remote.example" }));
    console.log("PostgreSQL store: ordering/cursors, missing parents, literal field paths, versioned cleanup, bulk failure isolation, atomic rollback, concurrent idempotency and transactional change records passed.");
  } finally {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.close();
  }
})().catch(error => { console.error("PostgreSQL store integration failed:", error.message); process.exitCode = 1; });
