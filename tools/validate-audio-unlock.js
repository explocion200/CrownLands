const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "audio-manager.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const gameSource = fs.readFileSync(path.join(projectRoot, "game.js"), "utf8");
const manifestSource = JSON.parse(fs.readFileSync(path.join(projectRoot, "audio", "manifest.json"), "utf8"));
const listeners = new Map();
const audioInstances = [];
const scheduledTimeouts = [];
let resolveManifest;
let playCalls = 0;
let rejectNextPlay = true;

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
  querySelector(selector) {
    return selector === 'meta[name="crownlands-build"]' ? { content: "test-build" } : null;
  },
};

class FakeAudio {
  constructor(url) {
    this.url = url;
    this.dataset = {};
    this.duration = 10;
    this.ended = false;
    this.loop = false;
    this.paused = true;
    this.preload = "";
    this.readyState = 1;
    this.volume = 1;
    this.listeners = new Map();
    audioInstances.push(this);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  play() {
    playCalls += 1;
    if (rejectNextPlay) {
      rejectNextPlay = false;
      const error = new Error("Player interaction required.");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

let nextTimeoutId = 1;
const window = {
  clearInterval,
  clearTimeout(id) {
    const timeout = scheduledTimeouts.find(entry => entry.id === id);
    if (timeout) timeout.cleared = true;
  },
  setInterval,
  setTimeout(callback, delay) {
    const entry = {
      callback,
      cleared: false,
      delay,
      id: nextTimeoutId++,
    };
    scheduledTimeouts.push(entry);
    return entry.id;
  },
};
window.window = window;

vm.runInNewContext(source, {
  Audio: FakeAudio,
  console,
  document,
  encodeURIComponent,
  fetch: () => manifestPromise,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  Math,
  performance: { now: () => 0 },
  requestAnimationFrame: callback => callback(1000),
  window,
});

async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
}

async function run() {
  assert.equal(typeof listeners.get("pointerdown"), "function", "Audio must listen for an ordinary player gesture.");

  listeners.get("pointerdown")();
  await flushPromises();

  assert.equal(playCalls, 0, "An early gesture must not attempt delayed playback before the manifest is ready.");
  assert.equal(typeof listeners.get("pointerdown"), "function", "An early gesture must keep automatic unlock armed.");
  assert.equal(window.CrownlandsAudio.unlocked, false, "An early gesture must not mark audio as unlocked.");

  resolveManifest({
    ok: true,
    json: async () => ({
      assets: [{
        id: "main_menu_loop",
        category: "music",
        music_state: "main_menu",
        wav: "music/main_menu_loop.wav",
        ogg: "music/main_menu_loop.ogg",
        loop: true,
        recommended_volume: 0.42,
      }, {
        id: "world_map_loop_a",
        category: "music",
        music_state: "world_map",
        wav: "music/world_map_loop_a.wav",
        ogg: "music/world_map_loop_a.ogg",
        loop: true,
        recommended_volume: 0.36,
      }, {
        id: "world_map_loop_b",
        category: "music",
        music_state: "world_map",
        wav: "music/world_map_loop_b.wav",
        ogg: "music/world_map_loop_b.ogg",
        loop: true,
        recommended_volume: 0.36,
      }, {
        id: "button_click",
        category: "ui",
        wav: "ui/button_click.wav",
        ogg: "ui/button_click.ogg",
        loop: false,
        recommended_volume: 0.42,
      }],
    }),
  });
  await flushPromises();

  assert.equal(playCalls, 1, "Audio must attempt automatic playback as soon as the manifest is ready.");
  assert.equal(window.CrownlandsAudio.unlocked, false, "A browser autoplay block must leave automatic unlock armed.");
  assert.equal(typeof listeners.get("pointerdown"), "function", "The first normal gesture must remain available after an autoplay block.");

  listeners.get("pointerdown")();
  await flushPromises();

  assert.equal(playCalls, 2, "The first normal gesture must start the requested music.");
  assert.equal(window.CrownlandsAudio.unlocked, true, "Audio must unlock only after playback succeeds.");
  assert.equal(window.CrownlandsAudio.currentMusic.loop, true, "A single-track playlist must loop continuously.");
  assert.match(
    window.CrownlandsAudio.currentMusic.url,
    /\.mp3\?v=test-build$/,
    "Playback must use a versioned MP3 URL that itch serves as audio.",
  );
  assert.equal(listeners.has("pointerdown"), false, "Unlock listeners should be removed after successful playback.");
  assert.equal(listeners.has("touchend"), false, "Touch unlock listeners should be removed after successful playback.");
  assert.equal(listeners.has("keydown"), false, "Keyboard unlock listeners should be removed after successful playback.");

  await window.CrownlandsAudio.setMusicState("world_map", { immediate: true });
  const firstMapTrackId = window.CrownlandsAudio.currentMusic.dataset.audioId;
  assert.equal(window.CrownlandsAudio.currentMusic.loop, false, "Tracks in a multi-track playlist must rotate.");
  const firstRotation = scheduledTimeouts.find(entry => !entry.cleared && entry.delay === 9000);
  assert.ok(firstRotation, "A multi-track playlist must schedule a one-second crossfade.");

  firstRotation.callback();
  await flushPromises();

  assert.notEqual(
    window.CrownlandsAudio.currentMusic.dataset.audioId,
    firstMapTrackId,
    "Random playlist rotation must avoid immediately repeating the same track.",
  );
  assert.doesNotMatch(indexHtml, /setupAudioBtn|testAudioBtn|data-audio-enable/, "Dedicated sound buttons must be removed.");

  const musicAssets = manifestSource.assets.filter(asset => asset.category === "music");
  assert.ok(musicAssets.length > 0, "The production manifest must contain music.");
  assert.ok(
    musicAssets.every(asset => ["main_menu", "world_map", "battle", "danger", "victory"].includes(asset.music_state)),
    "Every production music asset must declare a supported music_state.",
  );
  assert.match(
    gameSource,
    /regionId\s*&&\s*!allowCrossMap[\s\S]*normalizeRegionId\(regionId\)\s*!==\s*getActiveMapRegionId\(\)/,
    "Gameplay effects must be gated to the active map.",
  );
  assert.match(
    gameSource,
    /playGameSound\("city_under_attack",\s*\{\s*cooldownMs:\s*1000,\s*allowCrossMap:\s*true\s*\}\)/,
    "Incoming attack warnings must remain the explicit cross-map exception.",
  );

  console.log("Validated automatic unlock, playlists, map-scoped effects, and button-free audio.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
