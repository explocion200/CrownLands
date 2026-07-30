const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "audio-manager.js"), "utf8");
const listeners = new Map();
let resolveManifest;
let playCalls = 0;

const manifestPromise = new Promise(resolve => {
  resolveManifest = resolve;
});

const document = {
  activeElement: null,
  readyState: "complete",
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  removeEventListener(type, handler) {
    if (listeners.get(type) === handler) listeners.delete(type);
  },
  getElementById() {
    return null;
  },
};

class FakeAudio {
  constructor(url) {
    this.url = url;
    this.dataset = {};
    this.ended = false;
    this.loop = false;
    this.preload = "";
    this.volume = 1;
  }

  addEventListener() {}

  play() {
    playCalls += 1;
    return Promise.resolve();
  }

  pause() {}
}

const window = {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
};
window.window = window;

vm.runInNewContext(source, {
  Audio: FakeAudio,
  console,
  document,
  fetch: () => manifestPromise,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  performance: { now: () => 0 },
  requestAnimationFrame: callback => callback(1000),
  window,
});

async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
}

async function run() {
  assert.equal(typeof listeners.get("pointerdown"), "function", "Audio unlock must listen for a player gesture.");

  listeners.get("pointerdown")();
  await flushPromises();

  assert.equal(playCalls, 0, "Audio must not attempt delayed playback before the manifest is ready.");
  assert.equal(typeof listeners.get("pointerdown"), "function", "An early gesture must not remove the unlock listener.");
  assert.equal(window.CrownlandsAudio.unlocked, false, "An early gesture must not mark audio as unlocked.");

  resolveManifest({
    ok: true,
    json: async () => ({
      assets: [{
        id: "main_menu_loop",
        category: "music",
        ogg: "music/main_menu_loop.ogg",
        loop: true,
        recommended_volume: 0.42,
      }],
    }),
  });
  await flushPromises();

  listeners.get("pointerdown")();
  await flushPromises();

  assert.equal(playCalls, 1, "The next player gesture must start the requested music.");
  assert.equal(window.CrownlandsAudio.unlocked, true, "Audio must be marked unlocked only after play succeeds.");
  assert.equal(listeners.has("pointerdown"), false, "Unlock listeners should be removed after successful playback.");
  assert.equal(listeners.has("touchend"), false, "Touch unlock listeners should be removed after successful playback.");
  assert.equal(listeners.has("keydown"), false, "Keyboard unlock listeners should be removed after successful playback.");

  console.log("Validated retryable audio unlock before and after manifest readiness.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
