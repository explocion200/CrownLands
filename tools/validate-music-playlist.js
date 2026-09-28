"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "audio/manifest.json"), "utf8"));
const tracks = manifest.assets.filter(asset => asset.category === "music");
const source = fs.readFileSync(path.join(root, "audio-manager.js"), "utf8");
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness(random = Math.random, blocked = false) {
  const instances = [], attempts = [], timers = new Map(), storage = new Map();
  let failure = blocked ? "NotAllowedError" : "", nextTimer = 1, deferred = null;
  class Audio {
    constructor() {
      Object.assign(this, { dataset: {}, paused: true, ended: false, error: null, currentTime: 0, duration: 180, readyState: 2, src: "", volume: 1 });
      instances.push(this);
    }
    setAttribute() {}
    addEventListener() {}
    pause() { this.paused = true; }
    load() { this.currentTime = 0; this.ended = false; this.error = null; }
    play() {
      attempts.push(this.src);
      if (failure) { this.paused = true; return Promise.reject(Object.assign(new Error(failure), { name: failure })); }
      if (deferred) {
        const next = deferred; deferred = null;
        return new Promise(resolve => { next.resolve = () => { this.paused = false; resolve(); }; });
      }
      this.paused = false;
      return Promise.resolve();
    }
  }
  const document = { visibilityState: "visible", readyState: "complete", body: { appendChild() {} },
    querySelector: () => null, getElementById: () => null, addEventListener() {} };
  const window = { addEventListener() {}, setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(source, { Audio, document, window, navigator: { userActivation: { isActive: false } },
    Math: Object.assign(Object.create(Math), { random }), console: { warn() {} },
    fetch: async () => ({ ok: true, json: async () => manifest }),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  const manager = window.CrownlandsAudio;
  return { manager, instances, attempts, timers, storage, setFailure(value) { failure = value; },
    deferPlay() { deferred = {}; return deferred; },
    async end() { const audio = manager.currentMusic; audio.ended = true; audio.paused = true; audio.currentTime = audio.duration; audio.onended(); await flush(); } };
}

async function main() {
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const cached = JSON.parse(worker.match(/const STATIC_CACHE_URLS\s*=\s*(\[[\s\S]*?\]);/)[1]);
  assert(cached.every(url => !url.startsWith("/audio/")), "Music must stay outside the startup cache");
  const installBytes = cached.reduce((sum, url) => {
    const file = url.split("?")[0].replace(/^\//, "");
    const buffer = fs.readFileSync(path.join(root, file === "play/index.html" ? "index.html" : file));
    return sum + (/\.(css|html|js|json|webmanifest)$/.test(file) ? Buffer.byteLength(buffer.toString("utf8").replace(/\r\n/g, "\n")) : buffer.length) + (file === "play/index.html" ? 1 : 0);
  }, 0);
  assert(installBytes <= require("./asset-performance-budgets").MAX_INSTALL_PRECACHE_BYTES, "Keep the existing offline shell budget");
  assert(Buffer.byteLength(source) <= 80 * 1024, "Keep the existing audio manager size cap");
  assert.equal(tracks.length, 8);
  assert(tracks.every(track => track.music_state === "soundtrack" && track.loop === false && track.mp3 && !track.ogg && !track.wav));
  for (const track of tracks) {
    const bytes = fs.readFileSync(path.join(root, "audio", track.mp3));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), track.source_sha256, "Keep the supplied recording intact");
    assert(track.recommended_volume > 0 && track.recommended_volume <= 0.85);
  }

  // Exercise deterministic shuffle extremes and a repeatable pseudorandom stream.
  let seed = 12345;
  for (const random of [() => 0, () => 0.999999, () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646]) {
    const h = harness(random, true), m = h.manager;
    await m.manifestPromise; await flush();
    assert.equal(m.musicUnlocked, false);
    assert.equal(h.attempts.length, 1, "Autoplay rejection must not spin through the playlist");
    const blockedSource = h.attempts[0];
    h.setFailure(""); await m.unlock({ musicGesture: true });
    assert.equal(m.currentMusic.src, blockedSource, "A blocked autoplay must not consume a song from the shuffled round");
    const audio = m.currentMusic, initialId = audio.dataset.audioId;
    audio.currentTime = 37.25;
    const playCount = h.attempts.length;
    for (const state of ["world_map", "danger", "battle", "victory", "main_menu", "contested", "world_map"]) {
      await m.setMusicState(state, { returnState: "world_map" });
      m.pulseMusic("battle", 3500, state);
      assert.equal(m.currentMusic, audio);
      assert.equal(audio.dataset.audioId, initialId);
      assert.equal(audio.currentTime, 37.25, "Map and combat context must preserve the song position");
      assert.equal(m.currentMusicReturnState, "");
    }
    assert.equal(h.attempts.length, playCount, "Context updates must not even call play() on an already playing song");
    assert.equal(h.timers.size, 0, "Songs must finish naturally without cutoff or combat pulse timers");
    await m.setMusicMuted(true); assert.equal(audio.paused, true);
    await m.setMusicMuted(false); assert.equal(audio.currentTime, 37.25);
    m.pauseForLifecycle("test-background"); assert.equal(audio.paused, true);
    await m.setMusicState("battle"); await m.resumeFromLifecycle();
    assert.equal(audio.currentTime, 37.25); assert.equal(audio.paused, false);
    const sequence = [];
    for (let i = 0; i < 32; i++) {
      sequence.push(m.currentMusic.dataset.audioId);
      assert.equal(m.currentMusic.loop, false);
      await h.end();
    }
    assert.equal(h.instances.length, 1, "All songs must reuse the gesture-authorized music element");
    for (let i = 0; i < 32; i += 8) assert.equal(new Set(sequence.slice(i, i + 8)).size, 8, "Every shuffled round must contain all eight songs");
    for (let i = 1; i < sequence.length; i++) assert.notEqual(sequence[i], sequence[i - 1], "Avoid immediate repeats, including between rounds");

    const beforeError = m.currentMusic.dataset.audioId;
    m.currentMusic.error = { code: 3 }; m.currentMusic.onerror(); await flush();
    assert.notEqual(m.currentMusic.dataset.audioId, beforeError, "Skip an undecodable MP3 instead of stopping the playlist");
    const beforeFailure = h.attempts.length;
    h.setFailure("NotSupportedError"); await h.end();
    assert.equal(h.attempts.length - beforeFailure, 8, "An unavailable playlist must stop after one bounded pass");
    assert.equal(m.musicUnlocked, false);
    h.setFailure(""); await m.unlock({ musicGesture: true });
    assert.equal(m.musicUnlocked, true, "A later gesture can recover after delivery returns");
    const loading = h.deferPlay(), beforeLoading = h.attempts.length;
    const start = m.setMusicState("soundtrack", { forceNext: true });
    const contextChanges = ["world_map", "battle", "danger"].map(state => m.setMusicState(state));
    assert.equal(h.attempts.length, beforeLoading + 1, "Rapid context updates must not reload a song that is still loading");
    loading.resolve(); await start; await Promise.all(contextChanges);
    assert(m.currentMusic && !m.currentMusic.paused);
    const mutedLoad = h.deferPlay();
    const pendingStart = m.setMusicState("soundtrack", { forceNext: true });
    await m.setMusicMuted(true); mutedLoad.resolve(); await pendingStart;
    assert.equal(m.persistentMusic.paused, true, "Late play completion must respect mute during loading");
    await m.setMusicMuted(false); assert.equal(m.currentMusic.paused, false);
    const backgroundLoad = h.deferPlay();
    const pendingBackground = m.setMusicState("soundtrack", { forceNext: true });
    m.pauseForLifecycle("loading-background"); backgroundLoad.resolve(); await pendingBackground;
    assert.equal(m.persistentMusic.paused, true);
    await m.resumeFromLifecycle(); assert.equal(m.currentMusic.paused, false, "Resume a song interrupted while loading");
    await m.setMusicMuted(true); m.pauseForLifecycle(); await m.resumeFromLifecycle();
    assert.equal(m.persistentMusic.paused, true, "Returning to the game must respect Music Mute");
  }
  console.log("Music playlist validation passed: eight unchanged sources, shuffled rounds, continuous contexts, natural completion after mute/background, bounded failures and gesture recovery.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
