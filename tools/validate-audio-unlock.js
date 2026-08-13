const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "audio-manager.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const gameSource = fs.readFileSync(path.join(projectRoot, "game.js"), "utf8");
const manifestSource = JSON.parse(fs.readFileSync(path.join(projectRoot, "audio", "manifest.json"), "utf8"));

const documentListeners = new Map();
const windowListeners = new Map();
const audioInstances = [];
const appendedNodes = [];
const playRecords = [];
const playBehaviors = [];
const scheduledTimeouts = [];
const storedValues = new Map();
const audioContextInstances = [];
const contextResumeBehaviors = [];
const contextSuspendBehaviors = [];
const contextResumeRecords = [];
const contextSuspendRecords = [];
const effectDecodeFailureExtensions = new Set();
const effectFetchRecords = [];
const effectSourceStarts = [];
const effectCompressorNodes = [];
let resolveManifest;
let now = 1000;
let nextTimeoutId = 1;
let compressorCreationFails = false;

function addListener(registry, type, handler, options = {}) {
  const entries = registry.get(type) || [];
  entries.push({
    capture: options === true || Boolean(options?.capture),
    handler,
  });
  registry.set(type, entries);
}

function removeListener(registry, type, handler, options = {}) {
  const capture = options === true || Boolean(options?.capture);
  const entries = registry.get(type) || [];
  registry.set(type, entries.filter(entry => entry.handler !== handler || entry.capture !== capture));
}

class FakeElement {
  constructor(id, tagName = "div", parent = null) {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.parentElement = parent;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.checked = false;
    this.disabled = false;
    this.textContent = "";
    this.value = "";
    this.icon = null;
    this.visibleLabel = null;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  getAttribute(name) {
    if (name === "id") return this.id;
    if (name === "role" && this.attributes.has(name)) return this.attributes.get(name);
    if (name === "data-audio-control" && this.dataset.audioControl !== undefined) {
      return this.dataset.audioControl;
    }
    if (name === "data-audio-effect" && this.dataset.audioEffect !== undefined) {
      return this.dataset.audioEffect;
    }
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  querySelector(selector) {
    if (selector === "[data-music-icon]") return this.icon;
    if (selector === "[data-music-label]") return this.visibleLabel;
    if (selector === "[data-audio-mute-icon]") return this.icon;
    return null;
  }

  matches(selector) {
    if (selector.includes(`#${this.id}`)) return true;
    if (selector.includes("[data-audio-control]") && this.dataset.audioControl !== undefined) return true;
    if (selector.includes("[data-audio-effect]") && this.dataset.audioEffect !== undefined) return true;
    if (selector === "button, [role='button']") {
      return this.tagName === "BUTTON" || this.getAttribute("role") === "button";
    }
    return false;
  }

  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parentElement?.closest?.(selector) || null;
  }
}

const loginMusicMute = new FakeElement("loginMusicMuteBtn", "button");
loginMusicMute.icon = new FakeElement("loginMusicIcon", "span", loginMusicMute);
loginMusicMute.visibleLabel = new FakeElement("loginMusicLabel", "span", loginMusicMute);
const musicVolume = new FakeElement("musicVolume", "input");
const effectsVolume = new FakeElement("effectsVolume", "input");
const musicMute = new FakeElement("musicMute", "button");
musicMute.icon = new FakeElement("musicMuteIcon", "span", musicMute);
const effectsMute = new FakeElement("effectsMute", "button");
effectsMute.icon = new FakeElement("effectsMuteIcon", "span", effectsMute);
const musicVolumeValue = new FakeElement("musicVolumeValue", "output");
const effectsVolumeValue = new FakeElement("effectsVolumeValue", "output");
const ordinaryTarget = new FakeElement("ordinaryButton", "button");
const elementsById = new Map([
  [loginMusicMute.id, loginMusicMute],
  [musicVolume.id, musicVolume],
  [effectsVolume.id, effectsVolume],
  [musicMute.id, musicMute],
  [effectsMute.id, effectsMute],
  [musicVolumeValue.id, musicVolumeValue],
  [effectsVolumeValue.id, effectsVolumeValue],
]);

const document = {
  activeElement: null,
  body: {
    appendChild(node) {
      appendedNodes.push(node);
      return node;
    },
  },
  readyState: "complete",
  visibilityState: "visible",
  addEventListener(type, handler, options) {
    addListener(documentListeners, type, handler, options);
  },
  removeEventListener(type, handler, options) {
    removeListener(documentListeners, type, handler, options);
  },
  getElementById(id) {
    return elementsById.get(id) || null;
  },
  querySelector(selector) {
    return selector === 'meta[name="crownlands-build"]' ? { content: "test-build" } : null;
  },
};

function dispatchDocumentEvent(type, target, properties = {}) {
  let propagationStopped = false;
  const event = {
    key: "",
    repeat: false,
    stopPropagation() {
      propagationStopped = true;
    },
    target,
    type,
    ...properties,
  };
  const entries = documentListeners.get(type) || [];
  for (const entry of entries.filter(item => item.capture)) entry.handler(event);
  if (!propagationStopped) {
    for (const handler of target?.listeners?.get(type) || []) {
      handler(event);
      if (propagationStopped) break;
    }
  }
  if (!propagationStopped) {
    for (const entry of entries.filter(item => !item.capture)) entry.handler(event);
  }
  return event;
}

function dispatchWindowEvent(type, properties = {}) {
  const event = { type, ...properties };
  for (const entry of windowListeners.get(type) || []) entry.handler(event);
  return event;
}

function makePlaybackError(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function queuePlayRejection(name) {
  playBehaviors.push({ error: makePlaybackError(name), type: "reject" });
}

function queuePlaySuccess() {
  playBehaviors.push({ type: "resolve" });
}

function queueDeferredPlay() {
  const controller = {};
  playBehaviors.push({ controller, type: "defer" });
  return controller;
}

function queueDeferredContextResume() {
  const controller = {};
  contextResumeBehaviors.push({ controller, type: "defer" });
  return controller;
}

function queueContextResumeRejection(name) {
  contextResumeBehaviors.push({ error: makePlaybackError(name), type: "reject" });
}

function queueContextResumeSuccess() {
  contextResumeBehaviors.push({ type: "resolve" });
}

function queueContextSuspendRejection(name) {
  contextSuspendBehaviors.push({ error: makePlaybackError(name), type: "reject" });
}

class FakeAudio {
  constructor(url = "") {
    this.src = url;
    this.dataset = {};
    this.duration = 10;
    this.ended = false;
    this.error = null;
    this.loop = false;
    this.networkState = 1;
    this.paused = true;
    this.preload = "";
    this.readyState = 1;
    this.currentTime = 0;
    this.volume = 1;
    this.listeners = new Map();
    this.onerror = null;
    this.onended = null;
    audioInstances.push(this);
  }

  get currentSrc() {
    return this.src;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  setAttribute() {}

  load() {
    this.paused = true;
    this.currentTime = 0;
    this.error = null;
  }

  play() {
    const behavior = playBehaviors.shift() || { type: "resolve" };
    playRecords.push({ audio: this, src: this.src });
    if (behavior.type === "reject") {
      this.paused = true;
      return Promise.reject(behavior.error);
    }
    if (behavior.type === "defer") {
      return new Promise((resolve, reject) => {
        behavior.controller.resolve = () => {
          this.paused = false;
          resolve();
        };
        behavior.controller.reject = error => {
          this.paused = true;
          reject(error);
        };
      });
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  dispatchMediaEvent(type) {
    const propertyHandler = this[`on${type}`];
    if (typeof propertyHandler === "function") propertyHandler({ target: this, type });
    for (const handler of this.listeners.get(type) || []) handler({ target: this, type });
  }
}

class FakeAudioNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeAudioNode {
  constructor() {
    super();
    this.gain = { value: 1 };
  }
}

class FakeDynamicsCompressorNode extends FakeAudioNode {
  constructor() {
    super();
    this.threshold = { value: -24 };
    this.knee = { value: 30 };
    this.ratio = { value: 12 };
    this.attack = { value: 0.003 };
    this.release = { value: 0.25 };
    effectCompressorNodes.push(this);
  }
}

class FakeBufferSourceNode extends FakeAudioNode {
  constructor(context) {
    super();
    this.context = context;
    this.buffer = null;
    this.loop = false;
    this.onended = null;
    this.started = false;
    this.stopped = false;
  }

  start() {
    if (this.context.state !== "running") throw makePlaybackError("InvalidStateError");
    this.started = true;
    effectSourceStarts.push(this);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.onended?.();
  }
}

class FakeAudioContext {
  constructor() {
    this.destination = new FakeAudioNode();
    this.onstatechange = null;
    this.state = "suspended";
    audioContextInstances.push(this);
  }

  createBufferSource() {
    return new FakeBufferSourceNode(this);
  }

  createGain() {
    return new FakeGainNode();
  }

  createDynamicsCompressor() {
    if (compressorCreationFails) throw makePlaybackError("NotSupportedError");
    return new FakeDynamicsCompressorNode();
  }

  decodeAudioData(arrayBuffer, success, failure) {
    const extension = String(arrayBuffer?.url || "").match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() || "";
    const result = effectDecodeFailureExtensions.has(extension)
      ? Promise.reject(makePlaybackError("EncodingError"))
      : Promise.resolve({ duration: 0.25, url: arrayBuffer?.url || "" });
    result.then(success, failure);
    return result;
  }

  resume() {
    contextResumeRecords.push(this);
    const behavior = contextResumeBehaviors.shift() || { type: "resolve" };
    if (behavior.type === "reject") return Promise.reject(behavior.error);
    if (behavior.type === "defer") {
      return new Promise((resolve, reject) => {
        behavior.controller.resolve = () => {
          this.state = "running";
          this.onstatechange?.();
          resolve();
        };
        behavior.controller.reject = error => {
          this.state = "suspended";
          this.onstatechange?.();
          reject(error);
        };
      });
    }
    this.state = "running";
    this.onstatechange?.();
    return Promise.resolve();
  }

  suspend() {
    contextSuspendRecords.push(this);
    const behavior = contextSuspendBehaviors.shift() || { type: "resolve" };
    if (behavior.type === "reject") return Promise.reject(behavior.error);
    this.state = "suspended";
    this.onstatechange?.();
    return Promise.resolve();
  }

  suspendForTest() {
    this.state = "suspended";
    this.onstatechange?.();
  }
}

const manifestPromise = new Promise(resolve => {
  resolveManifest = resolve;
});

function fakeFetch(resource) {
  const url = String(resource?.url || resource || "");
  if (url === "audio/manifest.json") return manifestPromise;
  effectFetchRecords.push(url);
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: async () => ({ url }),
  });
}

const window = {
  AudioContext: FakeAudioContext,
  addEventListener(type, handler, options) {
    addListener(windowListeners, type, handler, options);
  },
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
const navigator = {
  userActivation: { isActive: false },
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0",
};

vm.runInNewContext(source, {
  Audio: FakeAudio,
  console,
  document,
  encodeURIComponent,
  fetch: fakeFetch,
  localStorage: {
    getItem(key) {
      return storedValues.get(key) || null;
    },
    setItem(key, value) {
      storedValues.set(key, String(value));
    },
  },
  Math,
  navigator,
  performance: { now: () => now },
  requestAnimationFrame: callback => callback(now + 1000),
  window,
});

async function flushPromises(rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

const productionEffectAssets = manifestSource.assets.filter(asset => asset.category !== "music");
const testManifest = {
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
    id: "battle_loop",
    category: "music",
    music_state: "battle",
    wav: "music/battle_loop.wav",
    ogg: "music/battle_loop.ogg",
    loop: true,
    recommended_volume: 0.47,
  }, {
    id: "danger_contested_loop",
    category: "music",
    music_state: "danger",
    wav: "music/danger_contested_loop.wav",
    ogg: "music/danger_contested_loop.ogg",
    loop: true,
    recommended_volume: 0.4,
  }, {
    id: "victory_fanfare",
    category: "music",
    music_state: "victory",
    wav: "music/victory_fanfare.wav",
    ogg: "music/victory_fanfare.ogg",
    loop: false,
    recommended_volume: 0.58,
  }, ...productionEffectAssets],
};

async function run() {
  const manager = window.CrownlandsAudio;
  assert.equal(audioInstances.length, 1, "Every platform must create exactly one persistent music element.");
  assert.equal(appendedNodes[0], manager.persistentMusic, "The persistent music element must be retained in the document.");
  assert.equal(typeof (documentListeners.get("pointerdown") || [])[0]?.handler, "function");
  assert.equal(typeof (windowListeners.get("pageshow") || [])[0]?.handler, "function");
  assert.equal(typeof (windowListeners.get("focus") || [])[0]?.handler, "function");
  assert.equal(typeof (windowListeners.get("pagehide") || [])[0]?.handler, "function");
  assert.equal(typeof (windowListeners.get("blur") || [])[0]?.handler, "function");
  assert.equal(typeof (documentListeners.get("freeze") || [])[0]?.handler, "function");
  assert.equal(typeof (documentListeners.get("resume") || [])[0]?.handler, "function");
  assert.ok(
    (documentListeners.get("click") || []).filter(entry => entry.capture).length >= 2,
    "Unlocking and delegated UI audio must both observe clicks during capture.",
  );

  dispatchDocumentEvent("pointerdown", loginMusicMute);
  assert.equal(playRecords.length, 0, "The login mute control must not trigger generic unlocking.");
  assert.equal(manager.effectsUnlocked, false, "Audio controls must not authorize effects as a side effect.");

  navigator.userActivation.isActive = true;
  dispatchDocumentEvent("pointerdown", ordinaryTarget);
  assert.equal(playRecords.length, 0, "A first gesture before the manifest is ready must be retained.");
  assert.equal(manager.getDebugState().pendingMusicGesture, true);
  queuePlaySuccess();
  resolveManifest({
    ok: true,
    json: async () => testManifest,
  });
  await flushPromises();
  navigator.userActivation.isActive = false;

  assert.equal(playRecords.length, 1, "A retained first gesture must start music as soon as the manifest is ready.");
  assert.equal(manager.musicUnlocked, true);
  assert.equal(manager.effectsUnlocked, true, "The first ordinary gesture must independently authorize effects.");
  assert.equal(manager.getDebugState().pendingMusicGesture, false);

  manager.currentMusic.pause();
  manager.musicUnlocked = false;
  manager.unlocked = false;
  queuePlayRejection("NotAllowedError");
  assert.equal(await manager.unlock({ autoplay: true }), false);
  assert.equal(playRecords.length, 2, "A blocked automatic retry must remain recoverable.");
  assert.equal(manager.musicUnlocked, false, "Autoplay rejection must leave music retryable.");
  assert.equal(manager.effectsUnlocked, true, "A failed music autoplay must not alter effects authorization.");
  assert.equal(manager.getDebugState().lastPlaybackError, "NotAllowedError");

  dispatchDocumentEvent("pointerdown", musicMute);
  assert.equal(playRecords.length, 2, "Profile audio settings must be excluded from generic unlocking.");
  assert.equal(manager.effectsUnlocked, true);

  const pendingUnlock = queueDeferredPlay();
  dispatchDocumentEvent("pointerdown", ordinaryTarget);
  dispatchDocumentEvent("touchend", ordinaryTarget);
  dispatchDocumentEvent("click", ordinaryTarget);
  assert.equal(playRecords.length, 3, "Overlapping events from one gesture must share one in-flight unlock.");
  assert.equal(manager.getDebugState().unlockInFlight, true);
  assert.equal(manager.getDebugState().unlockMode, "gesture");
  assert.equal(audioContextInstances.length, 1, "The first ordinary gesture must create one persistent effects context.");
  assert.equal(effectCompressorNodes.length, 1, "The effects context must create one shared limiter.");
  assert.equal(manager.effectLimiter, effectCompressorNodes[0]);
  assert.equal(manager.effectMasterGain.connections[0], manager.effectLimiter);
  assert.equal(manager.effectLimiter.connections[0], audioContextInstances[0].destination);
  assert.equal(manager.effectLimiter.threshold.value, -3);
  assert.equal(manager.effectLimiter.knee.value, 0);
  assert.equal(manager.effectLimiter.ratio.value, 20);
  assert.equal(manager.effectLimiter.attack.value, 0.003);
  assert.equal(manager.effectLimiter.release.value, 0.12);
  assert.equal(manager.getDebugState().effectsLimiterActive, true);
  assert.equal(manager.effectsUnlocked, true);
  assert.equal(manager.getDebugState().effectsUnlockInFlight, false);
  assert.equal(effectSourceStarts.length, 0, "The first-click button effect must wait for the context resume.");
  assert.equal(
    await manager.setMusicState("world_map", { immediate: true }),
    false,
    "A state change during an in-flight first unlock must queue without starting overlapping playback.",
  );
  assert.equal(manager.requestedMusicState, "world_map");
  queuePlaySuccess();
  pendingUnlock.resolve();
  await flushPromises();

  assert.equal(manager.musicUnlocked, true);
  assert.equal(manager.unlocked, true);
  assert.equal(manager.effectsUnlocked, true, "A running effects context must be reported as unlocked.");
  assert.equal(manager.effectsAuthorized, true);
  assert.equal(effectSourceStarts.length, 1, "The queued first-click effect must start after context authorization.");
  assert.match(effectSourceStarts[0].buffer.url, /button_click\.mp3\?v=test-build$/);
  assert.equal(
    manager.currentMusicState,
    "world_map",
    "A successful first unlock must reconcile a newer requested state before it settles.",
  );
  assert.equal(manager.currentMusic, manager.persistentMusic);
  assert.equal(manager.currentMusic.loop, false, "The reconciled multi-track world playlist must rotate.");
  assert.match(manager.currentMusic.src, /\.mp3\?v=test-build$/);
  assert.equal(manager.getDebugState().unlockInFlight, false);

  manager.currentMusic.pause();
  manager.musicUnlocked = false;
  manager.unlocked = false;
  const staleAutoplay = queueDeferredPlay();
  const staleAutoplayPromise = manager.unlock({ autoplay: true });
  assert.equal(manager.getDebugState().unlockMode, "automatic");
  const promotedGestureStart = playRecords.length;
  queuePlaySuccess();
  dispatchDocumentEvent("pointerdown", ordinaryTarget);
  assert.equal(
    playRecords.length,
    promotedGestureStart + 1,
    "A trusted gesture must supersede an in-flight automatic playback attempt immediately.",
  );
  assert.equal(manager.getDebugState().unlockMode, "gesture");
  staleAutoplay.resolve();
  await staleAutoplayPromise;
  await flushPromises();
  assert.equal(manager.musicUnlocked, true, "The superseding first gesture must remain authoritative.");
  assert.equal(manager.currentMusic.paused, false);
  assert.equal(manager.getDebugState().unlockMode, "idle");

  const persistentMusic = manager.currentMusic;
  await manager.setMusicState("world_map", { immediate: true });
  assert.equal(manager.currentMusic, persistentMusic, "All music transitions must reuse one persistent element.");
  assert.equal(
    audioInstances.filter(audio => !audio.dataset.audioId || audio === persistentMusic).length,
    1,
    "A desktop transition must not allocate another music element.",
  );
  const firstMapTrackId = manager.currentMusic.dataset.audioId;
  assert.equal(manager.currentMusic.loop, false, "Multi-track playlists must rotate rather than loop one track.");
  const firstRotation = scheduledTimeouts.find(entry => !entry.cleared && entry.delay === 9000);
  assert.ok(firstRotation, "A multi-track playlist must schedule its next persistent-element transition.");
  firstRotation.callback();
  await flushPromises();
  assert.notEqual(manager.currentMusic.dataset.audioId, firstMapTrackId);

  dispatchDocumentEvent("click", loginMusicMute);
  assert.equal(manager.preferences.musicMuted, true);
  assert.equal(manager.currentMusic.paused, true, "Muting music must pause rather than silently continue decoding.");
  assert.equal(manager.preferences.effectsMuted, false, "Music mute must not alter the effects preference.");
  assert.equal(musicMute.getAttribute("aria-pressed"), "true", "The profile setting must mirror login mute.");
  assert.equal(musicMute.getAttribute("aria-label"), "Unmute music");
  assert.equal(musicMute.icon.dataset.clIcon, "sound-off");
  assert.match(musicMute.icon.innerHTML, /href="#cl-icon-sound-off"/);
  assert.equal(loginMusicMute.getAttribute("aria-pressed"), "true");
  assert.equal(loginMusicMute.getAttribute("aria-label"), "Unmute music");
  assert.equal(loginMusicMute.icon.dataset.clIcon, "sound-off");
  assert.match(loginMusicMute.icon.innerHTML, /href="#cl-icon-sound-off"/);

  now += 100;
  const mutedMusicEffectStart = effectSourceStarts.length;
  assert.equal(manager.playEffect("button_click"), true, "Effects must remain playable while music is muted.");
  await flushPromises();
  assert.equal(effectSourceStarts.length, mutedMusicEffectStart + 1);
  assert.equal(
    audioInstances.length,
    1,
    "Web Audio effects must not allocate policy-blocked HTML media elements.",
  );

  queuePlaySuccess();
  dispatchDocumentEvent("click", loginMusicMute);
  await flushPromises();
  assert.equal(manager.preferences.musicMuted, false);
  assert.equal(manager.currentMusic.paused, false, "Unmuting must resume music inside the control gesture.");
  assert.equal(loginMusicMute.getAttribute("aria-pressed"), "false");
  assert.equal(loginMusicMute.getAttribute("aria-label"), "Mute music");
  assert.equal(loginMusicMute.icon.dataset.clIcon, "sound");
  assert.match(loginMusicMute.icon.innerHTML, /href="#cl-icon-sound"/);

  dispatchDocumentEvent("click", musicMute);
  assert.equal(manager.preferences.musicMuted, true);
  assert.equal(loginMusicMute.getAttribute("aria-pressed"), "true", "Profile mute must update the login control.");
  assert.equal(manager.preferences.effectsMuted, false);
  queuePlaySuccess();
  dispatchDocumentEvent("click", musicMute);
  await flushPromises();
  assert.equal(manager.preferences.musicMuted, false);
  const savedPreferences = JSON.parse(storedValues.get("crownlands.audio.preferences.v1"));
  assert.equal(savedPreferences.musicMuted, false, "The shared music preference must persist.");
  assert.equal(savedPreferences.effectsMuted, false);

  const rejectedFallbackStart = playRecords.length;
  queuePlayRejection("NotSupportedError");
  queuePlaySuccess();
  await manager.setMusicState("battle", { immediate: true });
  assert.match(playRecords[rejectedFallbackStart].src, /\.mp3\?v=test-build$/);
  assert.match(playRecords[rejectedFallbackStart + 1].src, /\.ogg\?v=test-build$/);
  assert.equal(manager.currentMusicSourceIndex, 1, "A rejected MP3 play must fall back to OGG.");
  assert.equal(manager.getDebugState().preferredAudioExtension, "ogg");

  manager.preferredAudioExtension = "mp3";
  manager.currentMusicSourceIndex = 0;
  queuePlaySuccess();
  await manager.setMusicState("danger", { immediate: true });
  assert.equal(manager.currentMusicSourceIndex, 0);
  queuePlaySuccess();
  manager.currentMusic.error = { code: 4 };
  manager.currentMusic.dispatchMediaEvent("error");
  await flushPromises();
  assert.match(manager.currentMusic.src, /\.ogg\?v=test-build$/);
  assert.equal(manager.musicUnlocked, true);

  queuePlaySuccess();
  await manager.setMusicState("victory", {
    immediate: true,
    returnState: "danger",
  });
  assert.equal(manager.getDebugState().returnState, "danger");
  assert.equal(manager.currentMusic.loop, false);
  manager.currentMusic.pause();
  queuePlayRejection("NotSupportedError");
  queuePlaySuccess();
  await manager.resumeMusic();
  assert.equal(manager.currentMusicSourceIndex, 1, "A paused temporary track must fall back to its OGG source.");
  assert.equal(
    manager.getDebugState().returnState,
    "danger",
    "Resume codec fallback must preserve a temporary track's contextual return state.",
  );
  queuePlaySuccess();
  manager.currentMusic.dispatchMediaEvent("ended");
  await flushPromises();
  assert.equal(manager.currentMusicState, "danger", "Temporary victory music must honor its explicit return state.");
  assert.equal(manager.getDebugState().returnState, "");

  manager.musicUnlocked = false;
  manager.unlocked = false;
  manager.currentMusic.pause();
  assert.equal(
    await manager.setMusicState("victory", { returnState: "world_map" }),
    false,
    "A locked temporary request must remain pending.",
  );
  const pendingReturnUnlock = queueDeferredPlay();
  const returnUnlockPromise = manager.unlock();
  assert.equal(
    await manager.setMusicState("victory", { returnState: "danger" }),
    false,
    "A same-state return-state change must queue during an in-flight unlock.",
  );
  pendingReturnUnlock.resolve();
  await returnUnlockPromise;
  await flushPromises();
  assert.equal(manager.currentMusicState, "victory");
  assert.equal(
    manager.getDebugState().returnState,
    "danger",
    "Unlock reconciliation must compare and retain the latest explicit return state.",
  );
  queuePlaySuccess();
  manager.currentMusic.dispatchMediaEvent("ended");
  await flushPromises();
  assert.equal(manager.currentMusicState, "danger");

  manager.currentMusic.pause();
  const resumeStart = playRecords.length;
  queuePlaySuccess();
  dispatchWindowEvent("pageshow");
  await flushPromises();
  assert.equal(playRecords.length, resumeStart + 1);
  assert.equal(manager.currentMusic.paused, false, "pageshow must resume authorized unmuted music.");

  manager.currentMusic.pause();
  queuePlaySuccess();
  dispatchWindowEvent("focus");
  await flushPromises();
  assert.equal(manager.currentMusic.paused, false, "Window focus must resume authorized unmuted music.");

  now += 1000;
  manager.currentMusic.currentTime = 4.25;
  manager.stopActiveEffects();
  const lifecycleEffectStart = effectSourceStarts.length;
  assert.equal(manager.playEffect("button_click"), true);
  await flushPromises();
  const lifecycleEffectSource = effectSourceStarts.at(-1);
  assert.equal(effectSourceStarts.length, lifecycleEffectStart + 1);
  now += 100;
  const lifecycleTimerStart = scheduledTimeouts.length;
  assert.equal(manager.playEffect("button_click", { delayMs: 500 }), true);
  const lifecycleDelayedTimer = scheduledTimeouts.slice(lifecycleTimerStart).find(entry => entry.delay === 500);
  assert.ok(lifecycleDelayedTimer, "The lifecycle fixture must include a pending delayed effect.");
  now += 100;
  const lifecycleInFlightEffectStart = effectSourceStarts.length;
  assert.equal(manager.playEffect("gold_pickup"), true);
  const lifecyclePausePlayStart = playRecords.length;
  const lifecycleSuspendStart = contextSuspendRecords.length;
  dispatchWindowEvent("blur");
  await flushPromises();
  const pausedLifecycleState = manager.getDebugState();
  assert.equal(pausedLifecycleState.lifecyclePaused, true);
  assert.equal(pausedLifecycleState.lifecyclePauseReason, "blur");
  assert.equal(pausedLifecycleState.resumeMusicAfterLifecycle, true);
  assert.equal(pausedLifecycleState.resumeEffectsAfterLifecycle, true);
  assert.equal(pausedLifecycleState.paused, true, "Desktop focus loss must pause music.");
  assert.equal(pausedLifecycleState.currentTime, 4.25, "Lifecycle pause must preserve music position.");
  assert.equal(pausedLifecycleState.currentMusicState, "danger");
  assert.equal(manager.preferences.musicMuted, false, "Lifecycle pause must not change Music Mute.");
  assert.equal(manager.preferences.effectsMuted, false, "Lifecycle pause must not change Effects Mute.");
  assert.equal(lifecycleEffectSource.stopped, true, "Backgrounding must discard active transient effects.");
  assert.equal(manager.activeEffects.size, 0);
  assert.equal(
    effectSourceStarts.length,
    lifecycleInFlightEffectStart,
    "An effect still decoding when the page backgrounds must be discarded.",
  );
  assert.equal(manager.pendingEffectCounts.has("gold_pickup"), false);
  assert.equal(lifecycleDelayedTimer.cleared, true, "Backgrounding must cancel delayed effects.");
  assert.equal(manager.pendingEffectCounts.has("button_click"), false);
  assert.equal(pausedLifecycleState.pendingEffectTimerCount, 0);
  assert.equal(contextSuspendRecords.length, lifecycleSuspendStart + 1);
  assert.equal(manager.effectContext.state, "suspended");
  assert.equal(manager.playEffect("button_click"), false, "Effects must not start while lifecycle-paused.");
  assert.equal(playRecords.length, lifecyclePausePlayStart, "Backgrounding must not attempt music playback.");

  dispatchWindowEvent("pagehide", { persisted: true });
  await flushPromises();
  assert.equal(manager.getDebugState().lifecyclePauseReason, "blur", "Duplicate background events must be idempotent.");
  assert.equal(contextSuspendRecords.length, lifecycleSuspendStart + 1);

  const lifecycleResumePlayStart = playRecords.length;
  const lifecycleContextResumeStart = contextResumeRecords.length;
  queuePlaySuccess();
  dispatchWindowEvent("focus");
  dispatchWindowEvent("pageshow", { persisted: true });
  await flushPromises();
  const resumedLifecycleState = manager.getDebugState();
  assert.equal(playRecords.length, lifecycleResumePlayStart + 1, "A foreground event burst must resume music once.");
  assert.equal(contextResumeRecords.length, lifecycleContextResumeStart + 1, "Effects must resume once after focus returns.");
  assert.equal(resumedLifecycleState.lifecyclePaused, false);
  assert.equal(resumedLifecycleState.paused, false);
  assert.equal(resumedLifecycleState.currentTime, 4.25, "Music must resume from its preserved position.");
  assert.equal(resumedLifecycleState.currentMusicState, "danger");
  assert.equal(resumedLifecycleState.effectsContextState, "running");
  assert.equal(resumedLifecycleState.lastLifecycleError, "");

  document.visibilityState = "hidden";
  dispatchDocumentEvent("visibilitychange", document);
  await flushPromises();
  assert.equal(manager.getDebugState().lifecyclePauseReason, "hidden");
  const hiddenStateChangePlayStart = playRecords.length;
  assert.equal(
    await manager.setMusicState("battle", { immediate: true }),
    false,
    "A background music-state change must remain pending without playback.",
  );
  assert.equal(manager.getDebugState().requestedMusicState, "battle");
  assert.equal(manager.getDebugState().currentMusicState, "danger");
  assert.equal(playRecords.length, hiddenStateChangePlayStart);
  document.visibilityState = "visible";
  queuePlaySuccess();
  dispatchDocumentEvent("visibilitychange", document);
  await flushPromises();
  assert.equal(manager.currentMusicState, "battle", "Foregrounding must use the latest requested contextual music.");
  assert.equal(manager.currentMusic.paused, false);

  document.visibilityState = "hidden";
  dispatchDocumentEvent("visibilitychange", document);
  await flushPromises();
  manager.setMusicMuted(true);
  const mutedForegroundPlayStart = playRecords.length;
  document.visibilityState = "visible";
  dispatchDocumentEvent("visibilitychange", document);
  await flushPromises();
  assert.equal(playRecords.length, mutedForegroundPlayStart, "Music muted while away must remain paused on return.");
  assert.equal(manager.currentMusic.paused, true);
  assert.equal(manager.preferences.effectsMuted, false);
  queuePlaySuccess();
  await manager.setMusicMuted(false);
  assert.equal(manager.currentMusic.paused, false, "Foreground unmute must still resume within the user action.");

  dispatchWindowEvent("blur");
  await flushPromises();
  queuePlayRejection("NotAllowedError");
  dispatchWindowEvent("focus");
  await flushPromises();
  assert.equal(manager.currentMusic.paused, true);
  assert.equal(manager.musicUnlocked, false);
  assert.equal(manager.getDebugState().lastPlaybackError, "NotAllowedError");
  queuePlaySuccess();
  dispatchDocumentEvent("pointerdown", ordinaryTarget);
  await flushPromises();
  assert.equal(manager.currentMusic.paused, false, "A first interaction must recover a policy-blocked lifecycle resume.");
  assert.equal(manager.musicUnlocked, true);
  assert.equal(manager.getDebugState().lastPlaybackError, "");

  queueContextSuspendRejection("InvalidStateError");
  dispatchDocumentEvent("freeze", document);
  await flushPromises();
  assert.equal(manager.getDebugState().lifecyclePaused, true);
  assert.equal(manager.getDebugState().lifecyclePauseReason, "freeze");
  assert.equal(manager.getDebugState().lastLifecycleError, "InvalidStateError");
  queuePlaySuccess();
  dispatchDocumentEvent("resume", document);
  await flushPromises();
  assert.equal(manager.getDebugState().lifecyclePaused, false);
  assert.equal(manager.currentMusic.paused, false, "A resume event must recover music after a frozen page.");
  assert.equal(manager.getDebugState().lastLifecycleError, "", "A later successful resume must clear lifecycle errors.");
  queuePlaySuccess();
  await manager.setMusicState("danger", { immediate: true });

  now += 100;
  const effectFallbackStart = effectFetchRecords.length;
  effectDecodeFailureExtensions.add("mp3");
  assert.equal(manager.playEffect("notification"), true);
  await flushPromises();
  effectDecodeFailureExtensions.delete("mp3");
  assert.match(effectFetchRecords[effectFallbackStart], /notification\.mp3\?v=test-build$/);
  assert.match(effectFetchRecords[effectFallbackStart + 1], /notification\.ogg\?v=test-build$/);
  assert.match(effectSourceStarts.at(-1).buffer.url, /notification\.ogg\?v=test-build$/);

  now += 100;
  const exhaustedEffectCodecStart = effectFetchRecords.length;
  const exhaustedEffectSourceStart = effectSourceStarts.length;
  effectDecodeFailureExtensions.add("mp3");
  effectDecodeFailureExtensions.add("ogg");
  assert.equal(manager.playEffect("invalid_action"), true);
  await flushPromises();
  effectDecodeFailureExtensions.clear();
  assert.match(effectFetchRecords[exhaustedEffectCodecStart], /invalid_action\.mp3\?v=test-build$/);
  assert.match(effectFetchRecords[exhaustedEffectCodecStart + 1], /invalid_action\.ogg\?v=test-build$/);
  assert.equal(effectFetchRecords.length, exhaustedEffectCodecStart + 2);
  assert.equal(effectSourceStarts.length, exhaustedEffectSourceStart, "Effects must not request WAV after browser codecs fail.");

  now += 100;
  assert.equal(manager.playEffect("invalid_action"), true);
  await flushPromises();
  assert.match(effectSourceStarts.at(-1).buffer.url, /invalid_action\.mp3\?v=test-build$/);

  const contextualButton = new FakeElement("contextualButton", "button");
  contextualButton.addEventListener("click", () => {
    manager.playEffect("invalid_action");
  });
  now += 100;
  const contextualStart = effectSourceStarts.length;
  dispatchDocumentEvent("click", contextualButton);
  await flushPromises();
  assert.equal(
    effectSourceStarts.length,
    contextualStart + 1,
    "A contextual cue from a button handler must suppress the delegated generic button sound.",
  );
  assert.match(effectSourceStarts.at(-1).buffer.url, /invalid_action\.mp3\?v=test-build$/);

  const stoppedPropagationButton = new FakeElement("stoppedPropagationButton", "button");
  stoppedPropagationButton.addEventListener("click", event => event.stopPropagation());
  now += 100;
  const stoppedPropagationStart = effectSourceStarts.length;
  dispatchDocumentEvent("click", stoppedPropagationButton);
  await flushPromises();
  assert.equal(
    effectSourceStarts.length,
    stoppedPropagationStart + 1,
    "Capture-phase UI audio must survive a target handler that stops propagation.",
  );
  assert.match(effectSourceStarts.at(-1).buffer.url, /button_click\.mp3\?v=test-build$/);

  const explicitCueButton = new FakeElement("explicitCueButton", "button");
  explicitCueButton.dataset.audioEffect = "invalid_action";
  now += 100;
  const explicitStart = effectSourceStarts.length;
  dispatchDocumentEvent("click", explicitCueButton);
  await flushPromises();
  assert.equal(effectSourceStarts.length, explicitStart + 1);
  assert.match(effectSourceStarts.at(-1).buffer.url, /invalid_action\.mp3\?v=test-build$/);

  const silentButton = new FakeElement("silentButton", "button");
  silentButton.dataset.audioEffect = "none";
  const silentStart = effectSourceStarts.length;
  dispatchDocumentEvent("click", silentButton);
  await flushPromises();
  assert.equal(effectSourceStarts.length, silentStart, 'data-audio-effect="none" must suppress generic UI sound.');

  const audioControlButton = new FakeElement("customAudioControl", "button");
  audioControlButton.dataset.audioControl = "true";
  audioControlButton.dataset.audioEffect = "button_click";
  const controlStart = effectSourceStarts.length;
  dispatchDocumentEvent("click", audioControlButton);
  await flushPromises();
  assert.equal(effectSourceStarts.length, controlStart, "[data-audio-control] must skip unlock and delegated UI sounds.");

  now += 100;
  const asynchronousEffectStart = effectSourceStarts.length;
  assert.equal(manager.playEffect("notification"), true);
  await flushPromises();
  assert.equal(
    effectSourceStarts.length,
    asynchronousEffectStart + 1,
    "An authorized Web Audio context must play later asynchronous effects without another gesture.",
  );

  now += 100;
  const delayedEffectStart = effectSourceStarts.length;
  const delayedTimerStart = scheduledTimeouts.length;
  const delayedEffectFetchStart = effectFetchRecords.length;
  assert.equal(manager.playEffect("timer_tick_complete", { delayMs: 150 }), true);
  assert.equal(effectSourceStarts.length, delayedEffectStart, "A delayed effect must not start immediately.");
  assert.equal(manager.pendingEffectCounts.get("timer_tick_complete"), 1);
  assert.equal(
    effectFetchRecords.length,
    delayedEffectFetchStart + 1,
    "A delayed Web Audio effect must begin loading before its timer fires.",
  );
  assert.match(effectFetchRecords[delayedEffectFetchStart], /timer_tick_complete\.mp3\?v=test-build$/);
  const delayedTimer = scheduledTimeouts.slice(delayedTimerStart).find(entry => entry.delay === 150);
  assert.ok(delayedTimer, "playEffect() must schedule the requested delay.");
  await flushPromises();
  assert.equal(effectSourceStarts.length, delayedEffectStart, "Preloading must not start a delayed effect early.");
  delayedTimer.callback();
  await flushPromises();
  assert.equal(effectSourceStarts.length, delayedEffectStart + 1);
  assert.match(effectSourceStarts.at(-1).buffer.url, /timer_tick_complete\.mp3\?v=test-build$/);
  assert.equal(manager.pendingEffectCounts.has("timer_tick_complete"), false);

  now += 100;
  const delayedSwordStart = effectSourceStarts.length;
  const delayedSwordTimerStart = scheduledTimeouts.length;
  assert.equal(manager.playSwordClash({ delayMs: 175 }), true);
  assert.equal(effectSourceStarts.length, delayedSwordStart, "A delayed sword clash must not start immediately.");
  const delayedSwordTimer = scheduledTimeouts.slice(delayedSwordTimerStart).find(entry => entry.delay === 175);
  assert.ok(delayedSwordTimer, "playSwordClash() must preserve delayMs.");
  delayedSwordTimer.callback();
  await flushPromises();
  assert.equal(effectSourceStarts.length, delayedSwordStart + 1);
  assert.match(effectSourceStarts.at(-1).buffer.url, /sword_clash_0[1-3]\.mp3\?v=test-build$/);

  now += 100;
  const levelUpFetchStart = effectFetchRecords.length;
  assert.equal(await manager.prepareEffect("level_up"), true);
  assert.equal(
    effectFetchRecords.length,
    levelUpFetchStart + 1,
    "A city-upgrade gesture must preload the eventual success cue.",
  );
  assert.match(effectFetchRecords[levelUpFetchStart], /level_up\.mp3\?v=test-build$/);
  const levelUpStart = effectSourceStarts.length;
  const levelUpAsset = productionEffectAssets.find(asset => asset.id === "level_up");
  const expectedLevelUpBaseGain = Math.min(1, levelUpAsset.recommended_volume * 1.35);
  const expectedLevelUpEffectiveGain = Math.min(1, expectedLevelUpBaseGain * manager.preferences.effectsVolume);
  assert.equal(manager.playEffect("level_up", { volumeScale: 1.35 }), true);
  await flushPromises();
  assert.equal(
    effectSourceStarts.length,
    levelUpStart + 1,
    "A delayed city-upgrade success must start the preloaded level_up cue.",
  );
  assert.ok(
    Math.abs(effectSourceStarts.at(-1).connections[0].gain.value - expectedLevelUpBaseGain) < 0.000001,
    "The level_up gain must apply its 1.35 volume multiplier instead of capping it at 1.",
  );
  assert.equal(manager.getDebugState().lastEffectId, "level_up");
  assert.ok(manager.getDebugState().lastEffectStartedAt > 0);
  assert.equal(manager.getDebugState().lastEffectRecommendedVolume, levelUpAsset.recommended_volume);
  assert.equal(manager.getDebugState().lastEffectVolumeScale, 1.35);
  assert.equal(manager.getDebugState().lastEffectBaseGain, expectedLevelUpBaseGain);
  assert.equal(manager.getDebugState().lastEffectEffectiveGain, expectedLevelUpEffectiveGain);

  const overdriveAsset = productionEffectAssets.find(asset => asset.id === "stronghold_captured");
  now += 100;
  const overdriveStart = effectSourceStarts.length;
  assert.equal(manager.playEffect(overdriveAsset.id, { volumeScale: 2 }), true);
  await flushPromises();
  assert.equal(effectSourceStarts.length, overdriveStart + 1);
  assert.equal(effectSourceStarts.at(-1).connections[0].gain.value, 1);
  assert.equal(manager.getDebugState().lastEffectRecommendedVolume, overdriveAsset.recommended_volume);
  assert.equal(manager.getDebugState().lastEffectVolumeScale, 2);
  assert.equal(manager.getDebugState().lastEffectBaseGain, 1);
  assert.equal(manager.getDebugState().lastEffectEffectiveGain, 0.8);

  manager.setEffectsVolume(0.5);
  assert.equal(manager.effectMasterGain.gain.value, 0.5, "The effects preference must drive a Web Audio GainNode.");
  manager.setEffectsVolume(0.8);

  const sourcesBeforeMute = [...effectSourceStarts];
  dispatchDocumentEvent("click", effectsMute);
  assert.equal(manager.preferences.effectsMuted, true);
  assert.equal(manager.preferences.musicMuted, false);
  assert.equal(manager.currentMusic.paused, false, "Effects mute must not pause music.");
  assert.ok(sourcesBeforeMute.every(source => source.stopped), "Effects mute must stop active Web Audio sources.");
  assert.equal(manager.effectMasterGain.gain.value, 0);
  assert.equal(effectsMute.getAttribute("aria-pressed"), "true");
  assert.equal(effectsMute.getAttribute("aria-label"), "Unmute effects");
  assert.equal(effectsMute.icon.dataset.clIcon, "sound-off");
  assert.match(effectsMute.icon.innerHTML, /href="#cl-icon-sound-off"/);
  dispatchDocumentEvent("click", effectsMute);
  assert.equal(manager.effectMasterGain.gain.value, 0.8);
  assert.equal(effectsMute.getAttribute("aria-pressed"), "false");

  const effectContext = audioContextInstances[0];
  effectContext.suspendForTest();
  assert.equal(manager.getDebugState().effectsUnlocked, false);
  assert.equal(manager.getDebugState().effectsContextState, "suspended");
  queueContextResumeRejection("NotAllowedError");
  dispatchWindowEvent("pageshow");
  await flushPromises();
  assert.equal(manager.effectsUnlocked, false);
  assert.equal(manager.getDebugState().lastEffectsError, "NotAllowedError");
  queueContextResumeSuccess();
  dispatchDocumentEvent("pointerdown", ordinaryTarget);
  await flushPromises();
  assert.equal(manager.effectsUnlocked, true, "The next ordinary gesture must recover a suspended effects context.");
  assert.equal(manager.getDebugState().lastEffectsError, "");

  assert.equal(productionEffectAssets.length, 25, "The runtime fixture must exercise all production effects.");
  for (const asset of productionEffectAssets) {
    now += 100;
    const productionEffectStart = effectSourceStarts.length;
    assert.equal(manager.playEffect(asset.id), true, `${asset.id} must queue through the production effect engine.`);
    await flushPromises();
    assert.equal(
      effectSourceStarts.length,
      productionEffectStart + 1,
      `${asset.id} must start one Web Audio source.`,
    );
    const source = effectSourceStarts.at(-1);
    assert.ok(
      source.buffer.url.includes(`/${asset.id}.`),
      `${asset.id} must decode its own production media source.`,
    );
    const expectedBaseGain = Math.min(1, Math.max(0, Number(asset.recommended_volume)));
    assert.ok(
      Math.abs(source.connections[0].gain.value - expectedBaseGain) < 0.000001,
      `${asset.id} must apply its production recommended_volume.`,
    );
    const productionDebug = manager.getDebugState();
    assert.equal(productionDebug.lastEffectId, asset.id);
    assert.equal(productionDebug.lastEffectRecommendedVolume, asset.recommended_volume);
    assert.equal(productionDebug.lastEffectVolumeScale, 1);
    assert.equal(productionDebug.lastEffectBaseGain, expectedBaseGain);
    assert.ok(
      Math.abs(productionDebug.lastEffectEffectiveGain - expectedBaseGain * 0.8) < 0.000001,
      `${asset.id} must expose its effective default gain.`,
    );
    source.stop();
  }

  const debugState = manager.getDebugState();
  assert.equal(debugState.ready, true);
  assert.equal(debugState.currentMusicState, "danger");
  assert.equal(debugState.currentAssetId, "danger_contested_loop");
  assert.equal(debugState.paused, false);
  assert.equal(debugState.effectsMuted, false);
  assert.equal(debugState.effectsEngine, "webaudio");
  assert.equal(debugState.effectsContextState, "running");
  assert.equal(debugState.effectsAuthorized, true);

  const loginMuteTag = indexHtml.match(/<button\b[^>]*\bid=["']loginMusicMuteBtn["'][^>]*>/i)?.[0] || "";
  assert.ok(loginMuteTag, "The login screen must include #loginMusicMuteBtn.");
  assert.match(loginMuteTag, /\btype=["']button["']/i);
  assert.match(loginMuteTag, /\baria-pressed=["']false["']/i);
  assert.match(loginMuteTag, /\baria-label=["']Mute music["']/i);
  for (const [id, label] of [["musicMute", "Mute music"], ["effectsMute", "Mute effects"]]) {
    const profileMuteTag = indexHtml.match(new RegExp(`<button\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i"))?.[0] || "";
    assert.ok(profileMuteTag, `The settings mixer must include #${id}.`);
    assert.match(profileMuteTag, /\btype=["']button["']/i);
    assert.match(profileMuteTag, /\baria-pressed=["']false["']/i);
    assert.match(profileMuteTag, new RegExp(`\\baria-label=["']${label}["']`, "i"));
  }
  assert.doesNotMatch(indexHtml, /setupAudioBtn|testAudioBtn|data-audio-enable/, "Dedicated sound buttons must stay removed.");

  const musicAssets = manifestSource.assets.filter(asset => asset.category === "music");
  assert.ok(musicAssets.length > 0, "The production manifest must contain music.");
  assert.ok(
    musicAssets.every(asset => ["main_menu", "world_map", "battle", "danger", "victory"].includes(asset.music_state)),
    "Every production music asset must declare a supported music_state.",
  );
  for (const asset of manifestSource.assets) {
    for (const relativePath of [
      String(asset.wav).replace(/\.wav$/i, ".mp3"),
      asset.ogg,
      asset.wav,
    ]) {
      assert.ok(
        fs.existsSync(path.join(projectRoot, "audio", relativePath)),
        `${asset.id} is missing ${relativePath}.`,
      );
    }
  }
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

  manager.effectsEngine = "htmlaudio";
  manager.effectContext = null;
  manager.effectMasterGain = null;
  manager.effectLimiter = null;
  manager.effectsUnlocked = true;
  now += 500;
  const audioCountBeforeHtmlPreparation = audioInstances.length;
  queuePlayRejection("NotSupportedError");
  queuePlaySuccess();
  assert.equal(await manager.prepareEffect("level_up"), true);
  const preparedHtmlRecord = manager.preparedHtmlEffects.get("level_up");
  const preparedHtmlLevelUp = preparedHtmlRecord?.audio;
  assert.ok(preparedHtmlLevelUp, "HTMLAudio fallback must retain the gesture-authorized effect element.");
  assert.equal(preparedHtmlRecord.sourceIndex, 1, "HTMLAudio preparation must fall back from MP3 to OGG.");
  assert.match(preparedHtmlLevelUp.src, /level_up\.ogg\?v=test-build$/);
  assert.equal(audioInstances.length, audioCountBeforeHtmlPreparation + 2);
  assert.equal(manager.effectsUnlocked, true, "A codec failure must not revoke effects authorization.");
  assert.equal(preparedHtmlLevelUp.paused, true);
  queuePlaySuccess();
  assert.equal(manager.playEffect("level_up", { volumeScale: 1.35 }), true);
  await flushPromises();
  assert.equal(
    audioInstances.length,
    audioCountBeforeHtmlPreparation + 2,
    "Delayed HTMLAudio fallback playback must reuse the element prepared by the upgrade gesture.",
  );
  assert.equal(preparedHtmlLevelUp.paused, false);
  assert.ok(Math.abs(preparedHtmlLevelUp.volume - expectedLevelUpEffectiveGain) < 0.000001);
  assert.equal(manager.getDebugState().lastEffectId, "level_up");

  now += 500;
  queuePlaySuccess();
  assert.equal(manager.playEffect(overdriveAsset.id, { volumeScale: 2 }), true);
  await flushPromises();
  const htmlOverdrive = audioInstances.at(-1);
  assert.equal(htmlOverdrive.dataset.audioId, overdriveAsset.id);
  assert.equal(htmlOverdrive.volume, 0.8, "HTMLAudio must use the same capped base gain as Web Audio.");
  assert.equal(manager.getDebugState().lastEffectRecommendedVolume, overdriveAsset.recommended_volume);
  assert.equal(manager.getDebugState().lastEffectVolumeScale, 2);
  assert.equal(manager.getDebugState().lastEffectBaseGain, 1);
  assert.equal(manager.getDebugState().lastEffectEffectiveGain, 0.8);

  now += 500;
  const htmlLifecycleTimerStart = scheduledTimeouts.length;
  assert.equal(manager.playEffect("button_click", { delayMs: 425 }), true);
  const htmlLifecycleTimer = scheduledTimeouts.slice(htmlLifecycleTimerStart).find(entry => entry.delay === 425);
  assert.ok(htmlLifecycleTimer, "HTMLAudio must register delayed effects with the lifecycle timer set.");
  const htmlSuspendStart = contextSuspendRecords.length;
  dispatchWindowEvent("blur");
  await flushPromises();
  assert.equal(manager.getDebugState().lifecyclePaused, true);
  assert.equal(htmlOverdrive.paused, true, "Backgrounding must stop an active HTMLAudio effect.");
  assert.equal(htmlOverdrive.currentTime, 0, "Discarded HTMLAudio effects must reset instead of resuming stale audio.");
  assert.equal(htmlLifecycleTimer.cleared, true);
  assert.equal(manager.pendingEffectCounts.has("button_click"), false);
  assert.equal(contextSuspendRecords.length, htmlSuspendStart, "HTMLAudio fallback must not require AudioContext suspension.");
  queuePlaySuccess();
  dispatchWindowEvent("focus");
  await flushPromises();
  assert.equal(manager.getDebugState().lifecyclePaused, false);
  assert.equal(manager.currentMusic.paused, false);
  assert.equal(htmlOverdrive.paused, true, "Discarded HTMLAudio effects must not replay after foregrounding.");

  compressorCreationFails = true;
  manager.effectsEngine = "webaudio";
  manager.effectContext = null;
  manager.effectMasterGain = null;
  manager.effectLimiter = null;
  const directOutputContext = manager.ensureEffectContext();
  assert.ok(directOutputContext, "Effects must retain Web Audio when the optional limiter is unavailable.");
  assert.equal(manager.effectLimiter, null);
  assert.equal(manager.effectMasterGain.connections[0], directOutputContext.destination);
  assert.equal(manager.getDebugState().effectsLimiterActive, false);

  console.log(
    "Validated persistent audio, background lifecycle, all production effects, balanced gain, limiting, delayed cues, codec fallback, and UI capture.",
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
