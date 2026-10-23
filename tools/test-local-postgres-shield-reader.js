"use strict";
const assert = require("node:assert/strict");
const { createFixture } = require("./map-benchmark/seamless/live-test-fixture");
const { LiveReader } = require("../local-backend/world/reader");
(async () => {
  const fixture = await createFixture({ players: 3, appearances: true });
  let now = Date.now(), ownerBatches = 0;
  const pool = { async connect() {
    const client = await fixture.reader.pool.connect();
    return { async query(sql, parameters) {
      const result = await client.query(sql, parameters);
      if (sql.includes("AS owner(uid)")) {
        ownerBatches++;
        assert(!JSON.stringify(result.rows).includes("private-shield-marker"), "Owner projection must not fetch unrelated account fields");
        assert.equal(result.rows.length, parameters[0].length);
      }
      return result;
    }, release: () => client.release() };
  } };
  const reader = new LiveReader({ pool, schema: fixture.store.schema, clock: () => now });
  try {
    const [owner, viewer] = fixture.grants.map(g => g.uid), manifest = await reader.initialize(viewer);
    const ids = manifest.sections.slice(0, 16).map(s => s.id), section = ids[0];
    const cities = await fixture.store.collection(fixture.island(section) + "/cities").get();
    const city = cities.docs.find(d => d.data().ownerUid === owner && d.data().kind !== "stronghold" && !d.data().strongholdType);
    const key = section + ":" + city.id, profile = fixture.store.doc("players/" + owner), expiry = now + 60_000;
    await profile.update({ itemEffects: { shieldExpiresAtMs: expiry, privateSecret: "private-shield-marker" },
      inventory: { secret: "private-shield-marker".repeat(10000) } });
    await city.ref.update({ ownerShieldExpiresAtMs: 0, fortificationState: { version: 1, integrityBps: 9999, repairAtMs: now + 2000 } });
    let cursor;
    const read = async expected => {
      now += 800;
      const packet = await reader.read(viewer, ids, cursor);
      cursor = { epoch: packet.epoch, revision: packet.revision };
      assert.equal(packet.objects.upsert.find(o => o.key === key)?.peaceShieldExpiresAtMs, expected);
      assert(!/private-shield-marker|itemEffects|fortificationState|inventory/.test(JSON.stringify(packet)));
      return packet;
    };
    await read(0);
    now += 2000; await read(expiry);
    assert.equal((await city.ref.get()).data().ownerShieldExpiresAtMs, 0, "Read-only repair must not rewrite player data");
    assert.equal((await reader.read(owner, ids)).objects.upsert.find(o => o.key === key).peaceShieldExpiresAtMs, expiry);
    await profile.update({ "itemEffects.shieldExpiresAtMs": 0 }); await read(0);
    await profile.update({ "itemEffects.shieldExpiresAtMs": expiry }); await read(expiry);
    for (const field of ["worldId", "resetGeneration", "realmShardId"]) {
      await profile.update({ [field]: "retired" }); await read(0);
      await profile.update({ [field]: fixture.realm[field] }); await read(expiry);
    }
    await city.ref.update({ ownerUid: viewer, ownerShieldExpiresAtMs: expiry }); await read(0);
    await fixture.store.doc("players/" + viewer).update({ itemEffects: { shieldExpiresAtMs: expiry } }); await read(expiry);
    now = expiry; await read(0);
    const builds = reader.stats.dtoBuilds, samples = [];
    for (let i = 0; i < 20; i++) {
      now += 800; const batches = ownerBatches, start = performance.now();
      const packet = await reader.read(viewer, ids, cursor); samples.push(performance.now() - start);
      assert.equal(ownerBatches - batches, 1, "All visible owners must use one bounded batch, not per-city reads");
      assert.deepEqual(packet.objects.upsert, []); assert.deepEqual(packet.marches.upsert, []);
      cursor = { epoch: packet.epoch, revision: packet.revision };
    }
    assert.equal(reader.stats.dtoBuilds, builds, "Unchanged shields must preserve DTO reuse");
    samples.sort((a, b) => a - b);
    console.log("Shield reader passed: two viewers, repair without writes, owner cancellation, scope, capture, expiry, private field projection and cache reuse.",
      JSON.stringify({ sections: ids.length, owners: 3, p50Ms: samples[9], p95Ms: samples[18], ownerBatchesPerRefresh: 1 }));
  } finally { await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
