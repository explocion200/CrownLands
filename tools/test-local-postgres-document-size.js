"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { encode } = require("../local-backend/values");
const { documentSize } = require("../local-backend/document-size");
const limit = 1024 * 1024;
const body = (name, data) => ({ name, fields: encode(data).mapValue.fields });

(async () => {
  // Published storage example; typed wrappers and timestamps are not data size.
  assert.equal(documentSize(body("users/jeff/tasks/my_task_id", {
    type: "Personal", done: false, priority: 1, description: "Learn Cloud Firestore",
  })), 147);
  const types = { name: "projects/p/databases/(default)/documents/tests/types", fields: {
    a: { nullValue: null }, b: { booleanValue: true }, c: { integerValue: "9223372036854775807" },
    d: { doubleValue: "NaN" }, e: { timestampValue: "2026-10-16T12:00:00Z" },
    f: { geoPointValue: { latitude: 0, longitude: 0 } }, g: { bytesValue: Buffer.alloc(9).toString("base64") },
    h: { referenceValue: "projects/p/databases/(default)/documents/tests/ref" },
    i: { stringValue: "👑" }, j: { arrayValue: { values: [{ integerValue: "1" }, { nullValue: null }] } },
    k: { mapValue: { fields: { nested: { stringValue: "é" } } } },
  } };
  assert.equal(documentSize(types), 12 + 16 + 32 + 22 + 1 + 1 + 8 + 8 + 8 + 16 + 9 + 26 + 5 + 9 + 42);
  assert.throws(() => documentSize({ name: "tests/bad", fields: { a: { unknown: 1 } } }), /Unsupported/);

  const schema = "migration_size_" + crypto.randomBytes(6).toString("hex");
  const db = new Store({ schema });
  try {
    await db.initialize();
    const ref = db.doc("players/report-fixture"), army = db.doc("armies/fixture");
    // Bounded synthetic report history exceeds 1 MiB only after type wrapping.
    const reports = Array.from({ length: 120 }, (_, i) => ({ id: String(i),
      contributions: Array.from({ length: 100 }, () => ({ troops: 1, lost: 0, won: true })) }));
    const profile = { battleReports: reports, gold: 0 };
    assert(Buffer.byteLength(JSON.stringify(body(ref.name, profile))) > limit);
    assert(documentSize(body(ref.name, profile)) < limit);
    await ref.set(profile); await army.set({ status: "active" });
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      tx.update(ref, { gold: current.data().gold + 1 });
      tx.update(army, { status: "resolved" });
    });
    assert.equal((await ref.get()).data().gold, 1);
    assert.equal((await army.get()).data().status, "resolved");
    assert.deepEqual((await ref.get()).data().battleReports, reports, "No report pruning to fit wire JSON");
    const edge = db.doc("limits/boundary");
    const overhead = documentSize(body(edge.name, { text: "" }));
    const exact = "\\".repeat(limit - overhead);
    assert(Buffer.byteLength(JSON.stringify(body(edge.name, { text: exact }))) > limit);
    await edge.set({ text: exact });
    const beforeChanges = (await db.pool.query(`SELECT count(*) FROM ${schema}.changes`)).rows[0].count;
    await assert.rejects(db.runTransaction(async tx => {
      tx.update(ref, { gold: 100 });
      tx.update(edge, { text: exact + "x" });
    }), /Document exceeds supported size/);
    assert.equal((await ref.get()).data().gold, 1, "Oversize multi-document write rolls back completely");
    assert.equal((await edge.get()).data().text, exact);
    assert.equal((await db.pool.query(`SELECT count(*) FROM ${schema}.changes`)).rows[0].count, beforeChanges);
    console.log("Document size: published example, all supported value types, UTF-8, nested maps/arrays, large report resolution, exact limit, escaped strings and oversize transaction rollback passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
