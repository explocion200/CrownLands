"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const M = require("../functions/marauder-rules");
const flush = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  let now = Date.UTC(2026, 9, 22, 23, 59, 59), serverNow = now, calls = 0, stops = 0;
  let hold = null, fail = false, callback;
  let saved = { version: 1, value: 80, revision: 1, recoveredAtMs: now, paidDay: M.day(now), dailyResetDay: M.day(now) };
  const listeners = new Map(), shown = { textContent: "" }, fill = { style: {} };
  const listen = (name, fn) => { assert(!listeners.has(name), "No accumulating listeners"); listeners.set(name, fn); };
  const card = { querySelector: selector => selector === "[data-stamina-value]" ? shown : fill,
    classList: { toggle() {} }, setAttribute() {} };
  const document = { hidden: false, getElementById: () => card, querySelectorAll: () => [], addEventListener: listen };
  const context = { CrownlandsMarauders: M, document, addEventListener: listen,
    Date: class extends Date { static now() { return now; } },
    sessionStorage: { getItem: () => null, removeItem() {} } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../stamina-ui.js"), "utf8"), context);
  const ui = context.CrownlandsStaminaUI;
  const response = () => {
    saved = M.dailyStamina(saved, serverNow);
    return { state: M.view(saved, serverNow), crowns: 120, walletRevision: 1, huntingEnabled: true };
  };
  const api = {
    getStaminaState: async () => { calls++; if (hold) return hold; if (fail) throw Error("Offline"); return response(); },
    subscribeStamina: handlers => { callback = handlers; return () => { stops++; }; },
    refillStamina: () => assert.fail("A daily reset must never purchase stamina"),
  };
  const advance = ms => { now += ms; serverNow += ms; };
  const spend = value => { saved = { ...saved, value, revision: saved.revision + 1 }; callback.onState(saved); };
  ui.sync({ uid: "first", api }); await flush();
  assert.equal(shown.textContent, "80/100"); assert.equal(calls, 1);
  let release;
  hold = new Promise(resolve => { release = resolve; }); advance(1000);
  for (let i = 0; i < 100; i++) ui.tick();
  assert.equal(calls, 2, "One in-flight reset request despite repeated HUD ticks");
  assert.equal(shown.textContent, "80/100", "Wait for the authoritative response");
  release(response()); hold = null; await flush();
  assert.equal(shown.textContent, "100/100"); assert.equal(ui.value().paidRefillsToday, 0);
  callback.onState({ ...saved, value: 80, revision: 1 });
  assert.equal(shown.textContent, "100/100", "A late pre-reset snapshot cannot overwrite the reset");
  spend(70); advance(12 * 60000); ui.tick(); await flush();
  assert.equal(shown.textContent, "70/100"); assert.equal(calls, 2, "No gradual recovery or periodic callable polling");

  advance(86400000); fail = true; ui.tick(); await flush();
  assert.equal(shown.textContent, "70/100"); assert.equal(calls, 3);
  for (let i = 0; i < 100; i++) ui.tick();
  assert.equal(calls, 3, "Failures use bounded backoff");
  advance(30000); fail = false; listeners.get("online")(); await flush();
  assert.equal(calls, 4); assert.equal(shown.textContent, "100/100");

  spend(20); document.hidden = true; advance(3 * 86400000); ui.tick();
  assert.equal(calls, 4); assert.equal(shown.textContent, "20/100");
  document.hidden = false; listeners.get("visibilitychange")(); await flush();
  assert.equal(calls, 5); assert.equal(shown.textContent, "100/100", "Missed days never accumulate above 100");

  spend(60); now += 5 * 86400000; ui.tick(); await flush();
  assert.equal(shown.textContent, "60/100", "An incorrect device clock cannot grant stamina");
  assert.equal(calls, 6); ui.tick(); assert.equal(calls, 6, "Server clock correction prevents repeat refresh");

  advance(86400000); hold = new Promise(resolve => { release = resolve; }); ui.tick();
  const oldResponse = response(); ui.sync({ uid: "" });
  assert.equal(shown.textContent, "—/100"); assert.equal(stops, 1);
  hold = null; saved = { ...saved, value: 40, revision: 1 };
  ui.sync({ uid: "second", api }); await flush(); release(oldResponse); await flush();
  assert.equal(shown.textContent, "40/100", "A late response cannot overwrite another account");
  ui.sync({ uid: "" }); advance(86400000); const signedOutCalls = calls; ui.tick();
  assert.equal(calls, signedOutCalls); assert.equal(stops, 2);
  fail = true; ui.sync({ uid: "third", api }); await flush();
  const initialFailureCalls = calls; ui.tick(); assert.equal(calls, initialFailureCalls);
  fail = false; advance(30000); ui.tick(); await flush();
  assert.equal(calls, initialFailureCalls + 1, "An initial failure also recovers without reopening the panel");
  assert.equal(shown.textContent, "100/100"); ui.sync({ uid: "" });
  assert.equal(listeners.size, 3, "Only the fixed click, visibility and online handlers exist");
  console.log("Daily stamina UI: midnight, delayed/failed loads, bounded retry, offline catch-up, clock skew, stale snapshots and account isolation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
