"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const flush = () => new Promise(resolve => setImmediate(resolve));
async function check(source) {
  const timers = new Map(), events = new Map(), calls = [], chatRequests = [], deliveries = [];
  let next = 0, user = "fixture", version = 1, holdWatch = false, finishWatch;
  const listen = (name, fn) => events.set(name, fn), unlisten = (name, fn) => { if (events.get(name) === fn) events.delete(name); };
  const chatPath = "globalChat/realm--shard/messages";
  const chatResult = () => ({ document: false, documents: [{ path: chatPath + "/one", body: { updateTime: `2026-10-16T00:00:0${version}.000000000Z`, fields: { text: { stringValue: "Message " + version } } } }] });
  const root = { location: { origin: "https://playcrownlands.com", pathname: "/api/local-game/rehearsal/" }, AbortController,
    document: { hidden: false, addEventListener: listen, removeEventListener: unlisten }, addEventListener: listen, removeEventListener: unlisten,
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => ++next, clearInterval() {},
    fetch: async (url, options = {}) => {
      if (url === "/local-auth/v1/session") return Response.json({ csrf: "fixture", user: { uid: user }, authTime: 1 });
      const input = JSON.parse(options.body); calls.push({ url, input });
      if (url.endsWith("/watch-chat")) return new Promise((resolve, reject) => {
        const finish = value => { options.signal.removeEventListener("abort", abort); resolve(Response.json(value)); };
        const abort = () => reject(Object.assign(Error("Aborted"), { name: "AbortError" }));
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) return abort();
        chatRequests.push({ finish, signal: options.signal, input });
      });
      if (url.endsWith("/watch")) {
        const results = input.targets.map(target => target.collection ? chatResult() : { document: true, documents: [{ path: target.path, body: { updateTime: "2026-10-16T00:00:00Z", fields: {} } }] });
        if (holdWatch) await new Promise(resolve => { finishWatch = resolve; });
        return Response.json({ result: results });
      }
      return Response.json({ result: { ok: true } });
    } };
  new Function("window", source)(root);
  const client = root.CrownlandsLocalBackend.create(), f = client.firestore, db = f.getFirestore();
  let pollFunction;
  const timer = name => [...timers.entries()].find(([, item]) => (item.fn === pollFunction) === (name === "poll"));
  const tick = name => { const [id, item] = timer(name) || []; assert(item, "Missing " + name); timers.delete(id); return item.fn(); };
  const reply = (request, count = version) => request.finish({ result: { cursor: String(count).padStart(64, "0"), results: [chatResult()] } });
  try {
    await client.auth.reload();
    f.onSnapshot(f.doc(db, "players", "fixture"), () => {});
    pollFunction = [...timers.values()][0].fn;
    const stop = f.onSnapshot(f.collection(db, ...chatPath.split("/")), value => deliveries.push(value.docs[0]?.data().text));
    const first = tick("pollChat"); await flush();
    assert.equal((await client.functions.httpsCallable({}, "fixtureAction")({})).data.ok, true, "Chat held an action slot");
    reply(chatRequests.at(-1)); await first;
    assert.deepEqual(deliveries, ["Message 1"]);
    await tick("poll"); assert(calls.at(-1).input.targets.every(target => !target.collection), "Fast chat was redundantly polled in the general batch");
    const second = tick("pollChat"); await flush(); version = 2; reply(chatRequests.at(-1)); await second;
    assert.deepEqual(deliveries, ["Message 1", "Message 2"]);

    const background = tick("pollChat"); await flush(); const interrupted = chatRequests.at(-1);
    root.document.hidden = true; events.get("visibilitychange")(); await background;
    assert(interrupted.signal.aborted); assert(!timer("pollChat"));
    await tick("poll"); assert.equal(timer("poll")[1].delay, 10000);
    root.document.hidden = false; events.get("visibilitychange")();
    assert.equal(timer("poll")[1].delay, 0, "Foreground waited for the background timer");
    assert.equal(timer("pollChat")[1].delay, 0);

    // Repeated online/resume signals coalesce behind an in-flight general read.
    holdWatch = true; const held = tick("poll"); await flush();
    events.get("online")(); events.get("online")();
    assert(!timer("poll"));
    const overtaking = tick("pollChat"); await flush(); version = 3; reply(chatRequests.at(-1)); await overtaking;
    const beforeStaleRead = deliveries.length;
    holdWatch = false; finishWatch(); await held;
    assert.equal(deliveries.length, beforeStaleRead, "An older general read replaced newer chat");
    assert.equal(deliveries.at(-1), "Message 3");
    assert.equal(timer("poll")[1].delay, 0);
    await tick("poll");

    const retry = tick("pollChat"); await flush(); chatRequests.at(-1).finish({ error: { code: "functions/unavailable" } }); await retry;
    assert(timer("pollChat")[1].delay >= 10000 && timer("pollChat")[1].delay <= 12000);
    await tick("poll"); assert(calls.at(-1).input.targets.some(target => target.collection), "Fallback lost chat subscription");

    // Old account/channel responses are aborted and cannot repopulate the view.
    const stale = tick("pollChat"); await flush(); const old = chatRequests.at(-1);
    user = "next-account"; await client.auth.reload(); await stale; assert(old.signal.aborted);
    version = 4; reply(old); await flush(); assert(!deliveries.includes("Message 4"));
    const leaving = tick("pollChat"); await flush(); const left = chatRequests.at(-1); stop(); await leaving;
    assert(left.signal.aborted); assert(!timer("pollChat"));
    f.onSnapshot(f.collection(db, ...chatPath.split("/")), () => {});
    const unsupported = tick("pollChat"); await flush(); chatRequests.at(-1).finish({ error: { code: "functions/not-found" } }); await unsupported;
    assert(!timer("pollChat")); await tick("poll"); assert(calls.at(-1).input.targets.some(target => target.collection));
    client.dispose(); assert.equal(events.size, 0); assert.equal(timers.size, 0);
    console.log("Local chat client: immediate foreground/online refresh, coalesced reads, server-delivered snapshots, action-slot independence, hidden-tab abort, fallback, account/channel isolation and disposal passed.");
  } finally { client.dispose(); }
}
(async () => {
  const source = fs.readFileSync(path.join(__dirname, "../local-client.js"), "utf8");
  await check(source); await check(require("./estate-delivery").minifyEstate(source));
})().catch(error => { console.error(error); process.exitCode = 1; });
