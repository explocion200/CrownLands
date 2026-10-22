"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));

async function check(source) {
  const timers = new Map(), events = new Map(), calls = [];
  let nextTimer = 0, failure = null, deliveries = 0, state;
  const value = { textContent: "" }, fill = { style: {} }, classes = new Set(), attributes = {};
  const card = { querySelector: selector => selector === "[data-stamina-value]" ? value : fill,
    classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
    setAttribute: (key, text) => { attributes[key] = text; } };
  const listen = (name, fn) => events.set(name, fn), unlisten = name => events.delete(name);
  const root = { location: { origin: "https://playcrownlands.com", pathname: "/api/local-game/rehearsal/" },
    document: { hidden: false, getElementById: id => id === "staminaButton" ? card : null, querySelectorAll: () => [],
      addEventListener: listen, removeEventListener: unlisten }, addEventListener: listen, removeEventListener: unlisten,
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++nextTimer, clearInterval() {}, CrownlandsMarauders: require("../functions/marauder-rules"),
    fetch: async (url, options = {}) => {
      if (url === "/local-auth/v1/session") return Response.json({ csrf: "fixture", user: { uid: "fixture" }, authTime: 1 });
      const input = JSON.parse(options.body); calls.push({ url, input });
      if (url.endsWith("/watch")) {
        if (failure === "network") throw TypeError("Synthetic network interruption");
        if (failure) return Response.json({ error: { code: "functions/" + failure } }, { status: failure === "permission-denied" ? 403 : 503 });
        return Response.json({ result: input.targets.map(target => ({ document: true, documents: [{ path: target.path,
          body: { updateTime: "2026-10-16T00:00:00Z", fields: Object.fromEntries(Object.entries(state).map(([key, item]) =>
            [key, typeof item === "number" ? { integerValue: String(item) } : { stringValue: item }])) } }] })) });
      }
      assert(url.endsWith("/call/getStaminaState"), "Recovery must not purchase stamina or send troops");
      return Response.json({ result: { state: { ...state, serverNowMs: Date.now() }, crowns: 120, walletRevision: 1, huntingEnabled: true } });
    } };
  new Function("window", source)(root);
  new Function("globalThis", read("cosmetics-client.js"))(root);
  new Function("globalThis", "document", read("stamina-ui.js"))(root, root.document);
  const client = root.CrownlandsLocalBackend.create(), f = client.firestore, ui = root.CrownlandsStaminaUI;
  const api = root.CrownlandsCosmeticsClient.create({
    client: { db: f.getFirestore(), user: { uid: "fixture" }, modules: { firestore: f } },
    callServerFunction: async (name, input) => (await client.functions.httpsCallable({}, name)(input)).data,
    subscribeScopedSnapshot: (target, onState, onError) => f.onSnapshot(target, snapshot => { deliveries++; onState(snapshot); }, onError),
  });
  const tick = async () => {
    const [id, timer] = timers.entries().next().value || [];
    assert(timer, "Expected a recovery poll"); timers.delete(id); await timer.fn(); await flush();
  };
  try {
    state = { version: 1, value: 70, recoveredAtMs: Date.now(), revision: 1, paidDay: "" };
    await client.auth.reload(); ui.sync({ uid: "fixture", api }); await flush(); await tick();
    assert.equal(value.textContent, "70/100"); assert.equal(fill.style.width, "70%");
    const initial = deliveries; await tick(); assert.equal(deliveries, initial, "Healthy unchanged snapshots stay deduplicated");
    for (const error of ["network", "unavailable", "deadline-exceeded", "resource-exhausted"]) {
      failure = error; await tick(); assert.equal(value.textContent, "—/100");
      assert.equal([...timers.values()][0].delay, 10000, "Failures retain bounded backoff");
      failure = null; events.get("online")(); assert.equal([...timers.values()][0].delay, 0);
      await tick(); assert.equal(value.textContent, "70/100", "An unchanged authorized snapshot must restore stamina after " + error);
      assert.equal(fill.style.width, "70%"); assert(attributes["aria-label"].includes("Stamina 70 of 100"));
      const restored = deliveries; await tick(); assert.equal(deliveries, restored, "Recovery must not disable normal deduplication");
    }
    // A successful hunt changes the authoritative state; there is no optimistic refill.
    state = { ...state, value: 9, revision: 2 }; await tick();
    assert.equal(value.textContent, "9/100"); assert.equal(fill.style.width, "9%"); assert(classes.has("stamina-low"));
    state = { ...state, recoveredAtMs: Date.now() - 12 * 60 * 1000 }; await tick();
    assert.equal(value.textContent, "9/100"); assert(classes.has("stamina-low"), "Elapsed time must not replenish the HUD");
    failure = "permission-denied"; await tick(); assert.equal(value.textContent, "—/100");
    assert.equal(timers.size, 0, "Permission revocation still stops the listener");
    assert.equal(calls.filter(call => call.url.endsWith("/call/getStaminaState")).length, 1, "Recovery uses the existing subscription, not extra callable polling");
    ui.sync({ uid: "" }); assert.equal(value.textContent, "—/100");
    console.log("Stamina recovery: actual HUD/transport subscription, unchanged snapshot replay, retry backoff, authoritative hunt/recovery values, permission revocation and no extra callables passed.");
  } finally { ui.sync({ uid: "" }); client.dispose(); }
}
(async () => { const source = read("local-client.js"); await check(source); await check(require("./estate-delivery").minifyEstate(source)); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
