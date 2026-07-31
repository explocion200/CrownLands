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
const effectDecodeFailureExtensions = new Set();
const effectFetchRecords = [];
const effectSourceStarts = [];
let resolveManifest;
let now = 1000;
let nextTimeoutId = 1;

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
const musicMute = new FakeElement("musicMute", "input");
const effectsMute = new FakeElement("effectsMute", "input");
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
  const event = {
    key: "",
    repeat: false,
    target,
    type,
    ...properties,
  };
  const entries = documentListeners.get(type) || [];
  for (const entry of entries.filter(item => item.capture)) entry.handler(event);
  for (const handler of target?.listeners?.get(type) || []) handler(event);
  for (const entry of entries.filter(item => !item.capture)) entry.handler(event);
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

  decodeAudioData(arrayBuffer, success, failure) {
    const extension = String(arrayBuffer?.url || "").match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() || "";
    const result = effectDecodeFailureExtensions.has(extension)
      ? Promise.reject(makePlaybackError("EncodingError"))
      : Promise.resolve({ duration: 0.25, url: arrayBuffer?.url || "" });
    result.then(success, failure);
    return result;
  }

  resume() {
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
  }, {
    id: "button_click",
    category: "ui",
    wav: "ui/button_click.wav",
    ogg: "ui/button_click.ogg",
    loop: false,
    recommended_volume: 0.42,
  }, {
    id: "invalid_action",
    category: "ui",
    wav: "ui/invalid_action.wav",
    ogg: "ui/invalid_action.ogg",
    loop: false,
    recommended_volume: 0.42,
  }, {
    id: "notification",
    category: "ui",
    wav: "ui/notification.wav",
    ogg: "ui/notification.ogg",
    loop: false,
    recommended_volume: 0.45,
  }, {
    id: "level_up",
    category: "rewards",
    wav: "rewards/level_up.wav",
    ogg: "rewards/level_up.ogg",
    loop: false,
    recommended_volume: 0.6,
  }],
};

async function run() {
  const manager = window.CrownlandsAudio;
  assert.equal(audioInstances.length, 1, "Every platform must create exactly one persistent music element.");
  assert.equal(appendedNodes[0], manager.persistentMusic, "The persistent music element must be retained in the document.");
  assert.equal(typeof (documentListeners.get("pointerdown") || [])[0]?.handler, "function");
  assert.equal(typeof (windowListeners.get("pageshow") || [])[0]?.handler, "function");
  assert.equal(typeof (windowListeners.get("focus") || [])[0]?.handler, "function");

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
  assert.equal(musicMute.checked, true, "The profile setting must mirror login mute.");
  assert.equal(loginMusicMute.getAttribute("aria-pressed"), "true");
  assert.equal(loginMusicMute.getAttribute("aria-label"), "Unmute music");
  assert.equal(loginMusicMute.icon.textContent, "\u{1F507}");

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
  assert.equal(loginMusicMute.icon.textContent, "\u{1F50A}");

  musicMute.checked = true;
  dispatchDocumentEvent("change", musicMute);
  assert.equal(manager.preferences.musicMuted, true);
  assert.equal(loginMusicMute.getAttribute("aria-pressed"), "true", "Profile mute must update the login control.");
  assert.equal(manager.preferences.effectsMuted, false);
  musicMute.checked = false;
  queuePlaySuccess();
  dispatchDocumentEvent("change", musicMute);
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

  const wavFallbackStart = playRecords.length;
  queuePlayRejection("NotSupportedError");
  queuePlayRejection("NotSupportedError");
  queuePlaySuccess();
  await manager.setMusicState("battle", { forceNext: true, immediate: true });
  assert.match(playRecords[wavFallbackStart].src, /\.mp3\?v=test-build$/);
  assert.match(playRecords[wavFallbackStart + 1].src, /\.ogg\?v=test-build$/);
  assert.match(playRecords[wavFallbackStart + 2].src, /\.wav\?v=test-build$/);
  assert.equal(manager.currentMusicSourceIndex, 2, "Playback must reach WAV when MP3 and OGG both fail.");

  queuePlaySuccess();
  await manager.setMusicState("danger", { immediate: true });
  assert.equal(manager.currentMusicSourceIndex, 0);
  queuePlaySuccess();
  manager.currentMusic.error = { code: 4 };
  manager.currentMusic.dispatchMediaEvent("error");
  await flushPromises();
  assert.match(manager.currentMusic.src, /\.ogg\?v=test-build$/);
  assert.equal(manager.currentMusicSourceIndex, 1, "A later media error must continue with the next codec.");
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

  manager.currentMusic.pause();
  document.visibilityState = "hidden";
  const hiddenStart = playRecords.length;
  dispatchDocumentEvent("visibilitychange", document);
  await flushPromises();
  assert.equal(playRecords.length, hiddenStart, "A hidden document must not attempt playback.");
  document.visibilityState = "visible";
  queuePlaySuccess();
  dispatchDocumentEvent("visibilitychange", document);
  await flushPromises();
  assert.equal(manager.currentMusic.paused, false, "Foreground visibility must resume music.");

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
  const effectWavFallbackStart = effectFetchRecords.length;
  effectDecodeFailureExtensions.add("mp3");
  effectDecodeFailureExtensions.add("ogg");
  assert.equal(manager.playEffect("invalid_action"), true);
  await flushPromises();
  effectDecodeFailureExtensions.clear();
  assert.match(effectFetchRecords[effectWavFallbackStart], /invalid_action\.mp3\?v=test-build$/);
  assert.match(effectFetchRecords[effectWavFallbackStart + 1], /invalid_action\.ogg\?v=test-build$/);
  assert.match(effectFetchRecords[effectWavFallbackStart + 2], /invalid_action\.wav\?v=test-build$/);
  assert.match(effectSourceStarts.at(-1).buffer.url, /invalid_action\.wav\?v=test-build$/);

  const contextualButton = new FakeElement("contextualButton", "button");
  now += 100;
  const contextualStart = effectSourceStarts.length;
  assert.equal(manager.playEffect("invalid_action"), true);
  dispatchDocumentEvent("click", contextualButton);
  await flushPromises();
  assert.equal(
    effectSourceStarts.length,
    contextualStart + 1,
    "A contextual cue from a button handler must suppress the delegated generic button sound.",
  );

  const explicitCueButton = new FakeElement("explicitCueButton", "button");
  explicitCueButton.dataset.audioEffect = "invalid_action";
  now += 100;
  const explicitStart = effectSourceStarts.length;
  dispatchDocumentEvent("click", explicitCueButton);
  await flushPromises();
  assert.equal(effectSourceStarts.length, explicitStart + 1);
  assert.match(effectSourceStarts.at(-1).buffer.url, /invalid_action\.wav\?v=test-build$/);

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
  const levelUpFetchStart = effectFetchRecords.length;
  assert.equal(await manager.prepareEffect("level_up"), true);
  assert.equal(
    effectFetchRecords.length,
    levelUpFetchStart + 1,
    "A city-upgrade gesture must preload the eventual success cue.",
  );
  assert.match(effectFetchRecords[levelUpFetchStart], /level_up\.mp3\?v=test-build$/);
  const levelUpStart = effectSourceStarts.length;
  assert.equal(manager.playEffect("level_up", { volumeScale: 1.35 }), true);
  await flushPromises();
  assert.equal(
    effectSourceStarts.length,
    levelUpStart + 1,
    "A delayed city-upgrade success must start the preloaded level_up cue.",
  );
  assert.ok(
    Math.abs(effectSourceStarts.at(-1).connections[0].gain.value - 0.81) < 0.000001,
    "The level_up gain must apply its 1.35 volume multiplier instead of capping it at 1.",
  );
  assert.equal(manager.getDebugState().lastEffectId, "level_up");
  assert.ok(manager.getDebugState().lastEffectStartedAt > 0);

  manager.setEffectsVolume(0.5);
  assert.equal(manager.effectMasterGain.gain.value, 0.5, "The effects preference must drive a Web Audio GainNode.");
  manager.setEffectsVolume(0.8);

  effectsMute.checked = true;
  const sourcesBeforeMute = [...effectSourceStarts];
  dispatchDocumentEvent("change", effectsMute);
  assert.equal(manager.preferences.effectsMuted, true);
  assert.equal(manager.preferences.musicMuted, false);
  assert.equal(manager.currentMusic.paused, false, "Effects mute must not pause music.");
  assert.ok(sourcesBeforeMute.every(source => source.stopped), "Effects mute must stop active Web Audio sources.");
  assert.equal(manager.effectMasterGain.gain.value, 0);
  effectsMute.checked = false;
  dispatchDocumentEvent("change", effectsMute);
  assert.equal(manager.effectMasterGain.gain.value, 0.8);

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
  assert.ok(Math.abs(preparedHtmlLevelUp.volume - 0.648) < 0.000001);
  assert.equal(manager.getDebugState().lastEffectId, "level_up");

  console.log(
    "Validated persistent autoplay recovery, unlock dedupe, independent mute states, codec fallbacks, resumes, and login control sync.",
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
