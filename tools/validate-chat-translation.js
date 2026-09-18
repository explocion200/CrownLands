const assert = require("node:assert/strict");
const { create, preferredLanguage } = require("../chat-translation");
const tick = () => new Promise(resolve => setImmediate(resolve));
const message = (id, text = "Bonjour") => ({ id, text });
const view = (messages, channel = "global", clanId = "") => ({ messages, channel, clanId, active: true });

async function main() {
  assert.equal(preferredLanguage(["es-MX", "en"]), "es");
  assert.equal(preferredLanguage(["zh-Hant-HK"]), "zh-TW");
  assert.equal(preferredLanguage(["zh-CN"]), "zh-CN");
  assert.equal(preferredLanguage(["bad_tag", "fr-CA"]), "fr");
  assert.equal(preferredLanguage([], "bad_tag"), "en");
  const storage = new Map();
  storage.getItem = storage.get.bind(storage);
  storage.setItem = storage.set.bind(storage);
  let requests = [], resolveRequest;
  const engine = create({ storage, language: "en", translate: payload => {
    requests.push(payload);
    return new Promise(resolve => { resolveRequest = resolve; });
  } });
  engine.setAccount("alice");
  const original = Object.freeze(message("1"));
  engine.update(view([original]));
  assert.equal(requests.length, 0, "Off must not request translations");
  engine.setEnabled(true);
  await tick();
  assert.equal(engine.display(original, view([])).state, "pending");
  assert.equal(engine.display(original, view([])).text, "Bonjour", "Keep original visible while pending");
  assert.deepEqual(requests[0], { channel: "global", clanId: "", messageIds: ["1"], targetLanguage: "en" }, "Send IDs, never untrusted client text");
  resolveRequest({ translations: [{ id: "1", text: "Hello" }] });
  await tick();
  assert.equal(engine.display(original, view([])).text, "Hello");
  assert.equal(original.text, "Bonjour");
  engine.update(view([original]));
  assert.equal(requests.length, 1, "Reuse session cache");
  engine.setEnabled(false);
  assert.equal(engine.display(original, view([])).text, "Bonjour");
  engine.setEnabled(true);
  await tick();
  const stale = resolveRequest;
  engine.setAccount("bob");
  stale({ translations: [{ id: "1", text: "STALE ALICE" }] });
  await tick();
  assert.equal(engine.status().enabled, false, "Preferences must be account scoped");
  assert.equal(engine.display(original, view([])).text, "Bonjour", "Ignore a previous account's in-flight response");
  engine.setAccount("alice");
  assert.equal(engine.status().enabled, true, "Preference survives revisiting account");
  engine.dispose();

  let fail = true, calls = 0;
  const outage = create({ translate: async payload => {
    calls += 1;
    if (fail) throw new Error("Offline");
    return { translations: payload.messageIds.map(id => ({ id, text: "Hello" })) };
  } });
  outage.setAccount("alice");
  outage.setEnabled(true);
  outage.update(view([original]));
  await tick();
  assert.equal(outage.status().failed, 1);
  assert.equal(outage.display(original, view([])).text, "Bonjour");
  outage.update(view([original]));
  await tick();
  assert.equal(calls, 1, "Do not retry on every render");
  fail = false;
  outage.retry();
  await tick();
  assert.equal(outage.status().failed, 0);
  assert.equal(outage.display(original, view([])).text, "Hello");
  outage.update(view([original, message("2")]));
  await tick();
  assert.equal(calls, 3, "Translate incoming messages automatically");
  outage.clear();
  assert.equal(outage.display(original, view([], "clan", "new-clan")).text, "Bonjour", "Membership changes clear translations");
  outage.dispose();

  let batchSizes = [];
  const batcher = create({ translate: async payload => {
    batchSizes.push(payload.messageIds.length);
    return { translations: payload.messageIds.map(id => ({ id, text: "Hello" })) };
  } });
  batcher.setAccount("a"); batcher.setEnabled(true);
  batcher.update(view(Array.from({ length: 45 }, (_, i) => message(String(i)))));
  await tick(); await tick();
  assert.deepEqual(batchSizes, [20, 20, 5]);
  batcher.dispose();

  let resolvers = [], languageCalls = [];
  const switching = create({ language: "en", translate: payload => {
    languageCalls.push(payload);
    return new Promise(resolve => resolvers.push(resolve));
  } });
  switching.setAccount("a"); switching.setEnabled(true);
  switching.update({ ...view([original]), active: false });
  await tick();
  assert.equal(languageCalls.length, 0, "Hidden chat must not translate");
  switching.update(view([original])); await tick();
  switching.setLanguage("es"); await tick();
  resolvers[0]({ translations: [{ id: "1", text: "English result" }] });
  resolvers[1]({ translations: [{ id: "1", text: "Hola" }] });
  await tick();
  assert.equal(switching.display(original, view([])).text, "Hola", "Stale language response cannot overwrite the current target");
  switching.update(view([message("1", "Salut")], "clan", "c1")); await tick();
  resolvers[2]({ translations: [] }); await tick();
  assert.equal(switching.display(message("1", "Salut"), view([], "clan", "c1")).state, "error", "Missing results must not look translated");
  assert.equal(switching.display(original, view([])).text, "Hola", "Cache must distinguish channels, clans, and source text");
  switching.dispose();

  const timer = create({ timeoutMs: 5, translate: () => new Promise(() => {}) });
  timer.setAccount("a"); timer.setEnabled(true); timer.update(view([original]));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(timer.status().failed, 1, "Timeout must restore usable originals and permit retry");
  timer.dispose();
  console.log("Chat translation validation passed: language, preferences, original preservation, account isolation, caching, failures/retry, incoming messages, batching, timeout.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
