const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const manifest = JSON.parse(read("manifest.webmanifest"));
const netlify = read("netlify.toml");
const index = read("index.html");
const home = read("home.html");
const game = read("game.js");
const serviceWorker = read("service-worker.js");

assert.equal(manifest.start_url, "/play/", "Installed Crownlands must launch the existing game-entry route.");
assert.equal(manifest.id, "/play/", "The installed-app identity must remain anchored to the game entry.");
assert.equal(manifest.scope, "/", "The installed app must keep the full Crownlands origin in scope.");
assert.equal(manifest.display, "standalone", "Crownlands must launch as a standalone installed app.");
assert.equal(manifest.orientation, "landscape", "The game PWA must retain landscape orientation.");
assert.deepEqual(
  manifest.icons.map(icon => icon.src),
  [
    "/assets/icons/crownlands-icon-192.png",
    "/assets/icons/crownlands-icon-512.png",
    "/assets/icons/crownlands-maskable-192.png",
    "/assets/icons/crownlands-maskable-512.png",
  ],
  "The manifest must keep the approved Crownlands icon family.",
);

assert.match(netlify, /from = "\/play\/"\s+to = "\/index\.html"\s+status = 200\s+force = true/);
assert.match(netlify, /from = "\/"\s+to = "\/home\.html"\s+status = 200\s+force = true/);
assert.ok(netlify.indexOf('from = "/play/"') < netlify.indexOf('from = "/"'), "The game rewrite must precede the public-root rewrite.");
assert.match(index, /rel="canonical" href="https:\/\/playcrownlands\.com\/play\/"/);
assert.match(index, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(index, /apple-mobile-web-app-capable" content="yes"/);
assert.match(index, /apple-mobile-web-app-title" content="Crownlands"/);
assert.equal((index.match(/name="apple-mobile-web-app-capable"/g) || []).length, 1, "iOS install metadata must not be duplicated.");
assert.match(home, /rel="canonical" href="https:\/\/playcrownlands\.com\/"/);
assert.doesNotMatch(home, /rel="manifest"/, "The public homepage must not become the iOS install entry surface.");
assert.match(game, /new URL\("\/play\/", window\.location\.origin\)/, "Game update checks must use the canonical game-entry route.");

const listeners = new Map();
const cacheEntries = new Map([
  ["https://playcrownlands.com/index.html", new Response("GAME ENTRY", { status: 200 })],
  ["https://playcrownlands.com/", new Response("PUBLIC WEBSITE", { status: 200 })],
]);
const caches = {
  async delete() { return true; },
  async keys() { return []; },
  async open() {
    return {
      async match(request) {
        const url = typeof request === "string" ? request : request.url;
        return cacheEntries.get(url)?.clone();
      },
      async put(request, response) {
        const url = typeof request === "string" ? request : request.url;
        cacheEntries.set(url, response.clone());
      },
    };
  },
};
const self = {
  clients: { async claim() {}, async matchAll() { return []; }, async openWindow() {} },
  location: { href: "https://playcrownlands.com/service-worker.js", origin: "https://playcrownlands.com" },
  registration: { async showNotification() {} },
  addEventListener(type, handler) { listeners.set(type, handler); },
  async skipWaiting() {},
};
self.self = self;

vm.runInNewContext(serviceWorker, {
  URL,
  Request,
  Response,
  caches,
  clients: self.clients,
  console,
  fetch: async () => { throw new Error("Synthetic offline navigation"); },
  importScripts() {},
  self,
});

async function dispatchNavigation(url) {
  let responsePromise = null;
  listeners.get("fetch")({
    request: {
      destination: "document",
      headers: new Headers(),
      method: "GET",
      mode: "navigate",
      url,
    },
    respondWith(value) { responsePromise = Promise.resolve(value); },
  });
  return responsePromise;
}

async function run() {
  const publicResponse = await dispatchNavigation("https://playcrownlands.com/");
  assert.equal(await publicResponse.text(), "PUBLIC WEBSITE", "Offline public root must remain the public website.");

  cacheEntries.delete("https://playcrownlands.com/");
  await assert.rejects(
    dispatchNavigation("https://playcrownlands.com/"),
    /Synthetic offline navigation/,
    "An uncached public root must never fall back to the game shell.",
  );

  const gameResponse = await dispatchNavigation("https://playcrownlands.com/play/");
  assert.equal(await gameResponse.text(), "GAME ENTRY", "The installed game route must fall back to the cached game shell.");

  const publicPageResponse = dispatchNavigation("https://playcrownlands.com/about.html");
  await assert.rejects(
    publicPageResponse,
    /Synthetic offline navigation/,
    "Public pages must not fall back to the game shell.",
  );

  assert.match(serviceWorker, /notificationData\.url \|\| "play\/"/, "Push launches must default to the game entry.");
  console.log("Validated separate public-root and installed-PWA entry routing, including route-aware offline fallback.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
