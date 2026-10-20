"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto"), http = require("node:http");
const { createStageThreeServer, ENTRY } = require("./map-benchmark/seamless/stage-three-server");
const { applyPacket, DeltaFeed } = require("./map-benchmark/seamless/delta-feed");
const empty = () => ({ revision: -1, sections: [], marches: [], routes: [] });
const settle = async feed => { for (let i = 0; i < 100 && feed.pending; i++) await new Promise(r => setTimeout(r, 5)); assert.equal(feed.pending, null); };
async function main() {
  let now = 100000;
  const server = await createStageThreeServer({ clock: () => now, scripted: false });
  try {
    const address = await server.listen(), origin = address.url;
    const request = (route, options = {}) => fetch(origin + route, { redirect: "manual", ...options });
    const login = async credential => {
      const response = await request(ENTRY + "login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(credential) });
      assert.equal(response.status, 200); const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly; SameSite=Strict/); assert.ok(!cookie.includes("__Host-crownlands_session")); return cookie.split(";")[0];
    };
    const query = (ids, cursor) => ENTRY + "changes?" + new URLSearchParams({ realm: server.realm.manifest.realmId, ids: ids.join(","), ...(cursor ? { epoch: cursor.epoch, revision: cursor.revision } : {}) });
    for (const route of [ENTRY + "catalog", query([server.realm.manifest.homeSectionId])]) assert.equal((await request(route)).status, 401);
    assert.equal((await request(ENTRY)).status, 302);
    const badHost = await new Promise((resolve, reject) => { http.get(origin + ENTRY + "login", { headers: { host: "attacker.test" } }, res => { res.resume(); resolve(res.statusCode); }).on("error", reject); });
    assert.equal(badHost, 403);
    assert.equal((await request(ENTRY + "login", { headers: { origin: "https://attacker.test" } })).status, 403);
    assert.equal((await request(ENTRY + "login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403);
    for (const route of ["/local-game/read", "/local-auth/session", "/local-backend/auth.js", "/.git/config", ENTRY + "fixture", ENTRY + "areas"]) assert.equal((await request(route)).status, 404);
    assert.equal((await request(ENTRY + "changes", { method: "POST" })).status, 405);
    const a = await login(server.credentials[0]), b = await login(server.credentials[1]);
    const read = async (ids, cursor, cookie = a) => { const r = await request(query(ids, cursor), { headers: { cookie } }); assert.equal(r.status, 200); return r.json(); };
    const ids = server.realm.manifest.sections.slice(0, 16).map(s => s.id).sort();
    for (const bad of [[], [...ids, server.realm.manifest.sections[16].id], [ids[0], ids[0]], ["production"]]) assert.equal((await request(query(bad), { headers: { cookie: a } })).status, 400);
    assert.equal((await request(query(ids).replace("private-world-stage-three", "live"), { headers: { cookie: a } })).status, 400);
    const first = await read(ids), other = await read(ids, null, b);
    assert.equal(first.kind, "snapshot"); assert.ok(first.objects.upsert.length > 500); assert.ok(first.marches.upsert.length > 0);
    assert.ok(first.marches.upsert.every(m => !other.marches.upsert.some(o => o.key === m.key)), "Another player's army was exposed");
    assert.ok(!JSON.stringify(first).match(/"(?:viewers|localPassword|passwordHash|email|token)"/));
    let data = applyPacket(empty(), first, ids, null), cursor = { epoch: first.epoch, revision: first.revision };
    const switched = await read(ids, cursor, b); assert.equal(switched.kind, "snapshot"); assert.notEqual(switched.epoch, first.epoch);
    assert.ok(switched.marches.upsert.every(m => !first.marches.upsert.some(o => o.key === m.key)));
    assert.equal(applyPacket(data, switched, ids, cursor).viewer, "sample-alder");
    const unchanged = await read(ids, cursor); assert.equal(unchanged.kind, "delta"); assert.equal(unchanged.objects.upsert.length + unchanged.marches.upsert.length + unchanged.routes.length, 0);
    const castle = server.realm.initial.find(r => r.kind === "object" && r.body.kind === "castle" && ids.includes(r.sections[0]));
    const stationary = data.sections.flatMap(s => s.objects).find(o => o.key !== castle.key);
    const ownedMarch = server.realm.initial.find(r => r.kind === "march" && r.viewers.includes("sample-rowan") && r.sections.some(id => ids.includes(id)));
    const excludedMarch = server.realm.initial.find(r => r.kind === "march" && r.viewers.includes("sample-alder") && r.sections.some(id => ids.includes(id)));
    now += 5000;
    await server.realm.change([{ key: castle.key, row: { ...castle, body: { ...castle.body, owner: "Changed sample owner", troops: 123 } } },
      { key: ownedMarch.key, row: { ...ownedMarch, viewers: ["sample-alder"] } }, { key: excludedMarch.key, row: { ...excludedMarch, viewers: ["sample-rowan"] } }]);
    const delta = await read(ids, cursor); assert.equal(delta.kind, "delta"); assert.ok(delta.marches.remove.includes(ownedMarch.key));
    data = applyPacket(data, delta, ids, cursor); cursor = { epoch: delta.epoch, revision: delta.revision };
    assert.equal(data.sections.flatMap(s => s.objects).find(o => o.key === castle.key).owner, "Changed sample owner");
    assert.equal(data.sections.flatMap(s => s.objects).find(o => o.key === stationary.key), stationary, "Unchanged object was rebuilt");
    assert.ok(!data.marches.some(m => m.key === ownedMarch.key)); assert.ok(data.marches.some(m => m.key === excludedMarch.key));
    assert.ok(Buffer.byteLength(JSON.stringify(delta)) < Buffer.byteLength(JSON.stringify(first)) / 10, "Delta did not reduce transport");
    await server.realm.change([{ key: castle.key }]);
    let packet = await read(ids, cursor); data = applyPacket(data, packet, ids, cursor); cursor = { epoch: packet.epoch, revision: packet.revision };
    assert.ok(data.removed.includes(castle.key)); assert.ok(!data.sections.flatMap(s => s.objects).some(o => o.key === castle.key));
    // A lost connection resumes after several mutations, collapsing each key.
    await server.realm.change([{ key: castle.key, row: castle }]);
    await server.realm.change([{ key: castle.key, row: { ...castle, body: { ...castle.body, troops: 777 } } }]);
    packet = await read(ids, cursor); assert.equal(packet.kind, "delta"); assert.equal(packet.objects.upsert.filter(o => o.key === castle.key).length, 1);
    data = applyPacket(data, packet, ids, cursor); cursor = { epoch: packet.epoch, revision: packet.revision };
    assert.equal(data.sections.flatMap(s => s.objects).find(o => o.key === castle.key).troops, 777);
    // A large missed burst also falls back before constructing an unbounded delta.
    for (let i = 0; i < 4; i++) await server.realm.tick(i);
    assert.equal((await read(ids, cursor)).kind, "snapshot");
    // Journal retention and response work are bounded; old cursors resnapshot.
    for (let i = 0; i < 62; i++) await server.realm.change([{ key: castle.key, row: castle }]);
    packet = await read(ids, cursor); assert.equal(packet.kind, "snapshot");
    assert.ok(Number((await server.store.pool.query(`SELECT count(*) FROM ${server.store.schema}.world_events`)).rows[0].count) <= 60);
    const oldEpoch = server.realm.epoch; server.realm.epoch = crypto.randomUUID();
    assert.equal((await read(ids, { epoch: oldEpoch, revision: packet.revision })).kind, "snapshot");
    // Atomic parsing rejects malformed data without mutating the old cache.
    const before = JSON.stringify(data);
    assert.throws(() => applyPacket(data, { ...packet, kind: "delta", epoch: cursor.epoch, fromRevision: cursor.revision + 1 }, ids, cursor));
    assert.throws(() => applyPacket(data, { ...packet, objects: { upsert: [{ key: "outside", sectionId: "outside" }], remove: [] } }, ids, cursor));
    assert.equal(JSON.stringify(data), before);
    // Out-of-order area requests cannot overwrite the camera's newer area.
    let release, call = 0;
    const staleFeed = new DeltaFeed(() => {}, async selected => {
      const result = await server.realm.read("sample-rowan", selected);
      if (++call === 1) await new Promise(resolve => { release = resolve; }); return result;
    });
    staleFeed.set([ids[0]]); while (!release) await new Promise(r => setTimeout(r, 5));
    staleFeed.set([ids[1]]); await settle(staleFeed); release(); await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(staleFeed.data.sections.map(s => s.id), [ids[1]]); assert.equal(staleFeed.staleResults, 1); staleFeed.dispose();
    // Revoke during the in-flight database read, not just before the request.
    const originalRead = server.realm.read.bind(server.realm);
    server.realm.read = async (...args) => { const value = await originalRead(...args); await server.auth.signOut(a.slice(a.indexOf("=") + 1)); return value; };
    assert.equal((await request(query(ids), { headers: { cookie: a } })).status, 401); server.realm.read = originalRead;
    assert.equal((await request(ENTRY + "catalog", { headers: { cookie: a } })).status, 401);
    const revoked = new DeltaFeed(() => {}, async () => { throw Object.assign(Error("Revoked"), { status: 401 }); });
    revoked.data = data; revoked.set(ids); await settle(revoked); assert.equal(revoked.authExpired, true); assert.equal(revoked.data.marches.length, 0); assert.equal(revoked.data.sections.length, 0); revoked.dispose();
    assert.equal(Number((await server.store.pool.query(`SELECT count(*) FROM ${server.store.schema}.auth_mail`)).rows[0].count), 0);
    const expiring = await createStageThreeServer({ scripted: false, maxAgeMs: 100 });
    try {
      const temporary = await expiring.listen();
      await new Promise(resolve => setTimeout(resolve, 250)); await expiring.close();
      await assert.rejects(fetch(temporary.entry));
      assert.equal((await server.store.pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [expiring.store.schema])).rowCount, 0);
    } finally { await expiring.close(); }
    console.log(`Private realm passed: PostgreSQL isolation, existing auth sessions, same-origin routes, visibility removals, atomic snapshots/deltas, epoch recovery, bounded journal, stale results and in-flight revocation. Snapshot ${Buffer.byteLength(JSON.stringify(first))} B; three-change delta ${Buffer.byteLength(JSON.stringify(delta))} B.`);
  } finally { await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
