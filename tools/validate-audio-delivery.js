const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const serviceWorkerSource = fs.readFileSync(path.join(projectRoot, "service-worker.js"), "utf8");
const editorServerSource = fs.readFileSync(path.join(projectRoot, "tools", "editor-server.js"), "utf8");
const listeners = new Map();
const cacheEntries = new Map();
let cachePutCount = 0;
let networkFetchCount = 0;
let cacheWarningCount = 0;

const cache = {
  async put(request, response) {
    cachePutCount += 1;
    const url = typeof request === "string" ? request : request.url;
    if (url.includes("cache-fail")) throw new Error("Synthetic cache quota failure");
    cacheEntries.set(url, response.clone());
  },
};

const caches = {
  async delete() {
    return true;
  },
  async keys() {
    return [];
  },
  async match() {
    return undefined;
  },
  async open() {
    return cache;
  },
};

async function networkFetch(request) {
  networkFetchCount += 1;
  const url = typeof request === "string" ? request : request.url;
  if (url.includes("partial.png")) {
    return new Response("partial", {
      status: 206,
      headers: {
        "Content-Type": "image/png",
        "Content-Range": "bytes 0-6/20",
      },
    });
  }
  return new Response(url.endsWith(".json") ? "{}" : "complete", {
    status: 200,
    headers: {
      "Content-Type": url.endsWith(".json") ? "application/json" : "image/png",
    },
  });
}

const self = {
  clients: {
    async claim() {},
    async matchAll() {
      return [];
    },
    async openWindow() {},
  },
  location: {
    href: "https://crownlands.test/service-worker.js",
    origin: "https://crownlands.test",
  },
  registration: {
    async showNotification() {},
  },
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  async skipWaiting() {},
};
self.self = self;

vm.runInNewContext(serviceWorkerSource, {
  URL,
  Request,
  Response,
  caches,
  clients: self.clients,
  console: {
    ...console,
    warn(message) {
      if (String(message).includes("Static cache write skipped")) cacheWarningCount += 1;
    },
  },
  fetch: networkFetch,
  importScripts() {},
  self,
});

async function dispatchFetch(request) {
  const fetchHandler = listeners.get("fetch");
  assert.equal(typeof fetchHandler, "function", "The service worker must register a fetch handler.");
  let responsePromise = null;
  fetchHandler({
    request,
    respondWith(value) {
      responsePromise = Promise.resolve(value);
    },
  });
  return responsePromise;
}

async function run() {
  const rangeAudioRequest = new Request("https://crownlands.test/audio/music/main_menu_loop.mp3", {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(
    await dispatchFetch(rangeAudioRequest),
    null,
    "Range requests must bypass service-worker response handling.",
  );

  const streamedAudioRequest = new Request("https://crownlands.test/audio/music/main_menu_loop.ogg");
  assert.equal(
    await dispatchFetch(streamedAudioRequest),
    null,
    "Audio media must stream directly instead of passing through Cache Storage.",
  );
  assert.equal(networkFetchCount, 0, "Bypassed audio must be left to the browser network stack.");

  const manifestResponse = await dispatchFetch(
    new Request("https://crownlands.test/audio/manifest.json"),
  );
  assert.ok(manifestResponse, "The audio manifest must remain service-worker managed.");
  assert.equal((await manifestResponse).status, 200, "The audio manifest must load network-first.");
  assert.equal(networkFetchCount, 1, "The audio manifest must reach the network.");
  assert.equal(cachePutCount, 1, "A complete manifest response may be cached.");

  const partialResponse = await dispatchFetch(
    new Request("https://crownlands.test/assets/partial.png"),
  );
  assert.ok(partialResponse, "Static assets must remain service-worker managed.");
  assert.equal((await partialResponse).status, 206, "A successful 206 response must pass through unchanged.");
  assert.equal(cachePutCount, 1, "A 206 response must never be passed to Cache.put().");

  const cacheFailureResponse = await dispatchFetch(
    new Request("https://crownlands.test/assets/cache-fail.png"),
  );
  assert.ok(cacheFailureResponse, "A cache failure must not cancel the network response.");
  const resolvedCacheFailureResponse = await cacheFailureResponse;
  assert.equal(resolvedCacheFailureResponse.status, 200);
  assert.equal(await resolvedCacheFailureResponse.text(), "complete");
  assert.equal(cacheWarningCount, 1, "A skipped cache write should emit one bounded diagnostic.");

  assert.match(editorServerSource, /\["\.mp3",\s*"audio\/mpeg"\]/);
  assert.match(editorServerSource, /\["\.ogg",\s*"audio\/ogg"\]/);
  assert.match(editorServerSource, /\["\.wav",\s*"audio\/wav"\]/);
  assert.match(editorServerSource, /"\/audio-manager\.js"/);
  assert.match(editorServerSource, /pathname\.startsWith\("\/audio\/"\)/);

  console.log("Validated range-safe audio delivery, non-fatal caching, and local audio MIME routing.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
