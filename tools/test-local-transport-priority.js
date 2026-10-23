"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const flush = () => new Promise(resolve => setImmediate(resolve));
async function check(source, capable) {
  const timers = new Map(), calls = [], pending = [];
  let hold = false, timerId = 0, uid = "fixture", fail = false, token = "a".repeat(64), value = 1;
  const root = { location: { origin: "https://playcrownlands.com", pathname: "/play/" },
    CROWNLANDS_LOCAL_BACKEND: { mode: "production", protocol: 1, ready: true, epoch: "a".repeat(32) },
    document: { hidden: false }, AbortController,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval() {}, clearInterval() {},
    fetch: async (url, options = {}) => {
      if (url.endsWith("/health")) return Response.json({ ready: true, rehearsal: false, protocol: 1, epoch: "a".repeat(32), ...(capable ? { capabilities: ["watch-revisions-v1"] } : {}) });
      if (url.endsWith("/session")) return Response.json({ csrf: "fixture", user: { uid }, authTime: 1 });
      const input = JSON.parse(options.body); calls.push({ url, input });
      if (hold) await new Promise(resolve => pending.push(resolve));
      if (fail) return Response.json({ error: { code: "functions/resource-exhausted" } }, { status: 429, headers: { "Retry-After": "20" } });
      if (url.endsWith("/watch")) return Response.json({ result: input.targets.map(target => input.revisions?.[0] === token ? { unchanged: true, revision: token }
        : { document: true, documents: [{ path: target.path, body: { updateTime: String(value), fields: { value: { integerValue: String(value) } } } }], ...(capable ? { revision: token } : {}) }) });
      return Response.json({ result: url.endsWith("/read") ? input.targets.map(target => ({ document: true, documents: [{ path: target.path, body: null }] })) : { ok: true } });
    } };
  new Function("window", source)(root); const client = root.CrownlandsLocalBackend.create(), f = client.firestore, db = f.getFirestore();
  const read = () => f.getDoc(f.doc(db, "players/fixture")), command = () => client.functions.httpsCallable({}, "sendArmyOrder")({ requestId: "same-operation" });
  const tick = async () => { const [id, timer] = timers.entries().next().value; timers.delete(id); await timer.fn(); };
  try {
    await client.auth.reload(); hold = true;
    const background = Array.from({ length: 8 }, read); await flush(); assert.equal(pending.length, 4, "Background work occupied reserved action slots");
    const foreground = [command(), client.world.read("options", { key: "fixture" })]; await flush(); assert.equal(pending.length, 6);
    const queuedAction = command(), cancel = new AbortController(), obsolete = client.world.read("areas", {}, cancel.signal);
    cancel.abort(); await assert.rejects(obsolete, { name: "AbortError" });
    pending.shift()(); await flush(); assert(calls.at(-1).url.endsWith("/call/sendArmyOrder"), "A command waited behind queued reads");
    hold = false; for (const resolve of pending.splice(0)) resolve(); await Promise.all([...background, ...foreground, queuedAction]);
    assert(!calls.some(call => call.url.endsWith("/world/areas")), "Superseded queued read was sent");
    hold = true; const blockers = Array.from({ length: 4 }, read); await flush();
    const stop = f.onSnapshot(f.doc(db, "players/obsolete"), () => { throw Error("Obsolete subscription delivered"); });
    const watchCount = calls.filter(call => call.url.endsWith("/watch")).length, queuedWatch = tick();
    await flush(); stop(); await queuedWatch;
    assert.equal(calls.filter(call => call.url.endsWith("/watch")).length, watchCount, "Unsubscribed queued read was sent");
    hold = false; for (const resolve of pending.splice(0)) resolve(); await Promise.all(blockers);
    const snapshots = [], errors = []; f.onSnapshot(f.doc(db, "players/fixture"), snap => snapshots.push(snap.get("value")), error => errors.push(error));
    await tick(); await tick(); assert.deepEqual(snapshots, [1]);
    const watch = calls.filter(call => call.url.endsWith("/watch"));
    assert.equal(Boolean(watch.at(-1).input.revisions), capable, "Watch capabilities were not negotiated");
    if (capable) assert.equal(watch.at(-1).input.revisions[0], token);
    value = 2; token = "b".repeat(64); await command(); assert([...timers.values()][0].delay <= 75, "Successful command waited for the ordinary poll");
    await tick(); assert.deepEqual(snapshots, [1, 2]);
    fail = true; await tick(); assert.equal(errors.length, 1); assert(errors[0].retryAfterMs === 20000); assert([...timers.values()][0].delay >= 20000);
    const before = calls.length; await assert.rejects(command(), { status: 429 }); assert.equal(calls.length, before + 1, "Failed commands must not be blindly retried");
    fail = false; await tick(); assert.equal(snapshots.length, 3, "After error-cleared UI, unchanged data must be delivered in full");
    if (capable) assert.deepEqual(calls.at(-1).input.revisions, [null]);
    uid = "another-fixture"; await client.auth.reload(); await tick(); if (capable) assert.deepEqual(calls.at(-1).input.revisions, [null]);
  } finally { client.dispose(); }
}
(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../local-client.js"), "utf8");
  for (const code of [source, require("./estate-delivery").minifyEstate(source)]) for (const capable of [false, true]) await check(code, capable);
  const { DeltaFeed } = require("../world/delta-feed"), actualNow = Date.now; let now = actualNow(), requests = 0;
  Date.now = () => now;
  const feed = new DeltaFeed(() => {}, async () => { requests++; throw Object.assign(Error("Busy"), { status: 429, retryAfterMs: 20000 }); });
  try {
    feed.set(["a"]); await flush(); await feed.refresh(); feed.set(["b"]); await flush(); assert.equal(requests, 1);
    now += 20001; await feed.refresh(); assert.equal(requests, 2); assert(feed.stats().retryAt >= now + 20000);
  } finally { feed.dispose(); Date.now = actualNow; }
  console.log("Transport priority: six total/four background, queued command priority, cancellation, capability/legacy compatibility, unchanged snapshots, command refresh, bounded Retry-After backoff and session recovery passed (source + minified).");
})().catch(error => { console.error(error); process.exitCode = 1; });
