"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html"), worker = read("service-worker.js");
for (const file of ["index.html", "service-worker.js", "tools/build-production-client.js", "tools/generate-release-manifest.js", "tools/validate-production-artifact.js"]) {
  assert(read(file).includes("optional-ui-styles.js"), `Optional style loader must be included in ${file}`);
}
const sheets = [...index.matchAll(/<link rel="crownlands-optional-stylesheet" data-optional-ui-style="([^"]+)" href="([^"]+)"/g)];
assert.equal(sheets.length, 9);
for (const [, name, href] of sheets) {
  assert(fs.existsSync(path.join(root, href.split("?")[0])), `${name} is shipped`);
  assert(!worker.includes(`"/${href}"`), `${name} must not be downloaded during installation`);
}
function node() {
  return { style: {}, children: [], listeners: new Map(), hidden: false,
    setAttribute() {}, append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }, contains(child) { return this.children.includes(child); },
    addEventListener(name, handler) { this.listeners.set(name, handler); } };
}
function fixture() {
  const links = new Map(), timers = new Map(); let nextTimer = 0;
  for (const [, name] of sheets) {
    const listeners = new Map();
    links.set(name, { dataset: {}, rel: "crownlands-optional-stylesheet", listeners,
      addEventListener(type, handler) { listeners.set(type, handler); },
      removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); } });
  }
  const context = { document: { querySelector: selector => links.get(selector.match(/="([^"]+)"/)?.[1]), createElement: node },
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  vm.createContext(context); vm.runInContext(read("optional-ui-styles.js"), context);
  return { links, timers, ensure: context.ensureOptionalUiStyle };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
(async () => {
  const { links, timers, ensure } = fixture(), host = node(); let oldCalls = 0, latestCalls = 0;
  assert.equal(ensure("help", host, () => oldCalls++), false);
  const panel = host.children[0];
  assert.equal(links.get("help").rel, "stylesheet");
  ensure("help", host, () => latestCalls++);
  assert.equal(host.children[0], panel, "Repeated renders retain the loading controls");
  assert.equal(timers.size, 1, "Repeated renders share a single request");
  links.get("help").listeners.get("load")(); await settle();
  assert.equal(oldCalls, 0); assert.equal(latestCalls, 1);
  assert.equal(timers.size, 0);
  assert.equal(ensure("help", host, () => {}), true);

  let stale = 0;
  ensure("bag", host, () => stale++);
  host.replaceChildren(node());
  links.get("bag").listeners.get("load")(); await settle();
  assert.equal(stale, 0, "A late load cannot replace another screen");

  let retries = 0;
  ensure("shop", host, () => retries++);
  links.get("shop").listeners.get("error")(); await settle();
  const retry = host.children[0].children[1];
  assert.equal(retry.hidden, false, "Offline/error offers explicit retry");
  assert.equal(links.get("shop").rel, "crownlands-optional-stylesheet");
  retry.listeners.get("click")();
  links.get("shop").listeners.get("load")(); await settle();
  assert.equal(retries, 1);

  ensure(["clan", "treasury"], host, () => latestCalls++);
  links.get("clan").listeners.get("load")(); await settle();
  assert.equal(latestCalls, 1, "A grouped view waits for every stylesheet");
  links.get("treasury").listeners.get("load")(); await settle();
  assert.equal(latestCalls, 2);
  ensure("infirmary", host, () => { throw Error("Timeout must not render"); });
  [...timers.values()][0](); await settle();
  assert.equal(host.children[0].children[1].hidden, false);
  assert.equal(timers.size, 0, "Stalled loads are bounded and cleaned up");
  let resume, scope = "first-session", rendered = 0;
  const dialog = { open: true, className: "modal shop-modal" };
  const modalContext = vm.createContext({ modal: dialog, modalBody: {}, getOnlineRequestScope: () => scope,
    ensureOptionalUiStyle(_name, _host, callback) { resume = callback; return false; } });
  const game = read("game.js");
  vm.runInContext(game.slice(game.indexOf("function ensureModalUiStyle("), game.indexOf("function showHelpModal(")), modalContext);
  modalContext.ensureModalUiStyle("shop", () => rendered++);
  scope = "replacement-session"; resume(); assert.equal(rendered, 0, "A prior account cannot rerender after loading");
  scope = "first-session"; dialog.open = false; resume(); assert.equal(rendered, 0, "Loading cannot reopen a closed dialog");
  dialog.open = true; dialog.className = "modal help-handbook-modal"; resume(); assert.equal(rendered, 0);
  dialog.className = "modal shop-modal"; resume(); assert.equal(rendered, 1);

  const handlers = new Map(), stores = new Map(); let offline = false, response;
  const store = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    return { put: async (request, value) => values.set(request.url, value.clone()),
      match: async request => values.get(request.url || request)?.clone(),
      keys: async () => [...values.keys()], delete: async key => values.delete(key) };
  };
  vm.runInNewContext(worker, { URL, Request, Response, Headers, console, importScripts() {},
    self: { location: new URL("https://example.test/service-worker.js"), addEventListener: (name, fn) => handlers.set(name, fn) },
    caches: { open: async name => store(name), match: async request => {
      for (const values of stores.values()) if (values.has(request.url)) return values.get(request.url).clone();
      return undefined;
    } }, fetch: async () => { if (offline) throw Error("offline"); return new Response(".help { color: red; }"); } });
  const background = [];
  const fetchStyle = () => handlers.get("fetch")({ request: new Request("https://example.test/help-handbook-ui.css?v=release"),
    respondWith: promise => { response = promise; }, waitUntil: promise => background.push(promise) });
  fetchStyle(); assert.equal(await (await response).text(), ".help { color: red; }");
  await Promise.all(background); offline = true;
  fetchStyle(); assert.equal(await (await response).text(), ".help { color: red; }", "Visited screen styles remain available from runtime cache offline");
  console.log("Deferred UI styles passed: shared requests, retry, timeouts, current-view ownership, grouped loading and bounded installation.");
})().catch(error => { console.error(error); process.exitCode = 1; });
