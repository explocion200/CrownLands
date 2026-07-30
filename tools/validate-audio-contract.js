"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const AUDIO_ROOT = path.join(ROOT, "audio");
const MEDIA_EXTENSIONS = Object.freeze(["mp3", "ogg", "wav"]);
const REQUIRED_CONTEXT_CUES = Object.freeze([
  "parchment_open",
  "invalid_action",
  "notification",
  "siege_impact",
]);

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readSource(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  check(fs.existsSync(absolutePath), `${relativePath} is missing`);
  if (!fs.existsSync(absolutePath)) return "";
  return fs.readFileSync(absolutePath, "utf8").replace(/\r\n?/g, "\n");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsStringLiteral(source, value) {
  const escaped = escapeRegex(value);
  return new RegExp(`(["'\`])${escaped}\\1`).test(source);
}

function extractBlockFromOpenBrace(source, openIndex, label) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }

  check(false, `${label} has an unbalanced function body`);
  return "";
}

function extractBalancedBlock(source, marker, label) {
  const markerIndex = source.indexOf(marker);
  check(markerIndex >= 0, `${label} is missing`);
  if (markerIndex < 0) return "";

  const openIndex = source.indexOf("{", markerIndex + marker.length);
  check(openIndex >= 0, `${label} has no function body`);
  if (openIndex < 0) return "";
  return extractBlockFromOpenBrace(source, openIndex, label);
}

function findClosingParenthesis(source, openIndex, label) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  check(false, `${label} has unbalanced parameters`);
  return -1;
}

function extractCallable(source, pattern, label) {
  const match = pattern.exec(source);
  check(Boolean(match), `${label} is missing`);
  if (!match) return "";
  const parameterOpen = source.indexOf("(", match.index);
  const parameterClose = findClosingParenthesis(source, parameterOpen, label);
  if (parameterClose < 0) return "";
  const bodyOpen = source.indexOf("{", parameterClose);
  check(bodyOpen >= 0, `${label} has no function body`);
  if (bodyOpen < 0) return "";
  return extractBlockFromOpenBrace(source, bodyOpen, label);
}

function extractMethod(source, name) {
  return extractCallable(
    source,
    new RegExp(`^\\s{4}(?:async\\s+)?${escapeRegex(name)}\\s*\\(`, "m"),
    `AudioManager.${name}()`
  );
}

function extractFunction(source, name) {
  return extractCallable(
    source,
    new RegExp(`^(?:async\\s+)?function\\s+${escapeRegex(name)}\\s*\\(`, "m"),
    `${name}()`
  );
}

function walkMediaFiles(directory, prefix = "") {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMediaFiles(absolutePath, relativePath));
      continue;
    }
    if (MEDIA_EXTENSIONS.includes(path.extname(entry.name).slice(1).toLowerCase())) {
      results.push(relativePath);
    }
  }
  return results;
}

function normalizeMediaPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function validateManifestAndFiles(manifest, runtimeSource) {
  check(Array.isArray(manifest.assets), "audio/manifest.json must contain an assets array");
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  check(assets.length > 0, "audio/manifest.json must contain at least one asset");

  const ids = new Set();
  const expectedMedia = new Set();
  const musicStates = new Set();
  let effectCount = 0;

  for (const [index, asset] of assets.entries()) {
    const label = `manifest asset #${index + 1}`;
    const id = String(asset?.id || "");
    check(/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id), `${label} has an invalid id: ${id || "(empty)"}`);
    check(!ids.has(id), `manifest contains duplicate id "${id}"`);
    ids.add(id);

    check(typeof asset?.category === "string" && asset.category.length > 0, `${id || label} has no category`);
    check(typeof asset?.loop === "boolean", `${id || label} must declare loop as a boolean`);
    check(
      Number.isFinite(asset?.recommended_volume)
        && asset.recommended_volume >= 0
        && asset.recommended_volume <= 1,
      `${id || label} has an invalid recommended_volume`
    );

    const wavPath = normalizeMediaPath(asset?.wav);
    const oggPath = normalizeMediaPath(asset?.ogg);
    const mp3Path = normalizeMediaPath(
      asset?.mp3
      || (wavPath.toLowerCase().endsWith(".wav") ? wavPath.replace(/\.wav$/i, ".mp3") : "")
    );
    const mediaByExtension = { mp3: mp3Path, ogg: oggPath, wav: wavPath };

    for (const extension of MEDIA_EXTENSIONS) {
      const mediaPath = mediaByExtension[extension];
      check(Boolean(mediaPath), `${id || label} has no ${extension.toUpperCase()} source`);
      if (!mediaPath) continue;
      check(
        path.posix.extname(mediaPath).toLowerCase() === `.${extension}`,
        `${id || label} ${extension.toUpperCase()} source has the wrong extension: ${mediaPath}`
      );
      check(
        !path.posix.isAbsolute(mediaPath) && !mediaPath.split("/").includes(".."),
        `${id || label} ${extension.toUpperCase()} source must stay inside audio/: ${mediaPath}`
      );
      const normalizedKey = mediaPath.toLowerCase();
      check(!expectedMedia.has(normalizedKey), `multiple manifest entries reference ${mediaPath}`);
      expectedMedia.add(normalizedKey);

      const absolutePath = path.join(AUDIO_ROOT, ...mediaPath.split("/"));
      check(fs.existsSync(absolutePath), `referenced ${extension.toUpperCase()} file is missing: audio/${mediaPath}`);
      if (fs.existsSync(absolutePath)) {
        check(fs.statSync(absolutePath).size > 0, `referenced audio file is empty: audio/${mediaPath}`);
      }
    }

    for (const mediaPath of Object.values(mediaByExtension).filter(Boolean)) {
      check(
        path.posix.basename(mediaPath, path.posix.extname(mediaPath)) === id,
        `${id || label} source basename does not match its manifest id: ${mediaPath}`
      );
    }

    const runtimeIdPattern = new RegExp(
      `(?:["'\`]${escapeRegex(id)}["'\`]|\\b${escapeRegex(id)}\\s*:)`
    );
    check(runtimeIdPattern.test(runtimeSource), `manifest id "${id}" has no runtime coverage`);

    if (asset.category === "music") {
      const state = String(asset.music_state || "");
      check(Boolean(state), `music asset "${id}" must declare music_state`);
      check(!musicStates.has(state), `music_state "${state}" is assigned more than once`);
      musicStates.add(state);
      check(containsStringLiteral(runtimeSource, state), `music_state "${state}" has no runtime coverage`);
    } else {
      effectCount += 1;
      const cuePattern = new RegExp(
        `(?:playGameSound|playEffect)\\s*\\(\\s*["'\`]${escapeRegex(id)}["'\`]`
      );
      const swordListPattern = new RegExp(
        `SWORD_CLASHES[\\s\\S]{0,240}["'\`]${escapeRegex(id)}["'\`]`
      );
      check(
        cuePattern.test(runtimeSource) || swordListPattern.test(runtimeSource),
        `effect cue "${id}" is loaded but never invoked`
      );
    }
  }

  const uploadedMedia = walkMediaFiles(AUDIO_ROOT);
  const uploadedKeys = new Set(uploadedMedia.map(file => file.toLowerCase()));
  for (const uploaded of uploadedMedia) {
    check(expectedMedia.has(uploaded.toLowerCase()), `uploaded audio file is not referenced: audio/${uploaded}`);
  }
  for (const expected of expectedMedia) {
    check(uploadedKeys.has(expected), `manifest-derived audio source was not uploaded: audio/${expected}`);
  }
  check(
    uploadedMedia.length === assets.length * MEDIA_EXTENSIONS.length,
    `expected exactly ${assets.length * MEDIA_EXTENSIONS.length} uploaded media files, found ${uploadedMedia.length}`
  );

  return {
    assetCount: assets.length,
    effectCount,
    mediaCount: uploadedMedia.length,
    musicStateCount: musicStates.size,
  };
}

function validateMuteAndUnlockContracts(audioManagerSource, indexSource) {
  check(
    /<button\b[^>]*\bid=["']loginMusicMuteBtn["'][^>]*\baria-pressed=["']false["'][^>]*>/i.test(indexSource),
    "loginMusicMuteBtn must be an accessible button with aria-pressed"
  );
  check(
    /<input\b[^>]*\bid=["']musicMute["'][^>]*>/i.test(indexSource),
    "profile Music Mute switch (#musicMute) is missing"
  );

  const bindSettingsUi = extractMethod(audioManagerSource, "bindSettingsUi");
  const syncSettingsUi = extractMethod(audioManagerSource, "syncSettingsUi");
  const setMusicMuted = extractMethod(audioManagerSource, "setMusicMuted");
  const setEffectsMuted = extractMethod(audioManagerSource, "setEffectsMuted");
  const playEffect = extractMethod(audioManagerSource, "playEffect");
  const unlock = extractMethod(audioManagerSource, "unlock");
  const unlockEffects = extractMethod(audioManagerSource, "unlockEffects");
  const unlockListeners = extractMethod(audioManagerSource, "installUnlockListeners");
  const resumeListeners = extractMethod(audioManagerSource, "installResumeListeners");
  const loadManifest = extractMethod(audioManagerSource, "loadManifest");

  check(bindSettingsUi.includes('getElementById("musicMute")'), "profile Music Mute switch is not bound");
  check(bindSettingsUi.includes('getElementById("loginMusicMuteBtn")'), "login Music Mute button is not bound");
  check(
    /musicMute\.addEventListener\(\s*"change"[\s\S]*?setMusicMuted\(musicMute\.checked\)/.test(bindSettingsUi),
    "profile Music Mute switch does not call setMusicMuted()"
  );
  check(
    /loginMusicMute\.addEventListener\(\s*"click"[\s\S]*?setMusicMuted\(\s*!this\.preferences\.musicMuted\s*\)/.test(bindSettingsUi),
    "login Music Mute button does not toggle setMusicMuted() in its click"
  );
  check(
    /musicMute\.checked\s*=\s*this\.preferences\.musicMuted/.test(syncSettingsUi),
    "persisted music mute preference is not reflected in the profile switch"
  );
  check(
    /loginMusicMute\.setAttribute\(\s*"aria-pressed"\s*,\s*String\(this\.preferences\.musicMuted\)\s*\)/.test(syncSettingsUi),
    "persisted music mute preference is not reflected in login aria-pressed"
  );
  check(
    syncSettingsUi.includes('"Unmute music"') && syncSettingsUi.includes('"Mute music"'),
    "login Music Mute button labels are not synchronized"
  );

  check(setMusicMuted.includes("this.preferences.musicMuted = nextMuted"), "setMusicMuted() does not persist music state");
  check(setMusicMuted.includes("this.persistentMusic.pause()"), "muting music does not pause the persistent music element");
  check(
    setMusicMuted.includes("return this.resumeMusic(")
      && setMusicMuted.includes("musicGesture: true"),
    "unmuting music does not resume within the control interaction"
  );
  check(!setMusicMuted.includes("effectsMuted"), "setMusicMuted() must not change effectsMuted");
  check(!setMusicMuted.includes("setEffectsMuted"), "setMusicMuted() must not call setEffectsMuted()");
  check(!setMusicMuted.includes("activeEffects"), "muting music must not stop active effects");

  check(setEffectsMuted.includes("this.preferences.effectsMuted"), "setEffectsMuted() does not persist effects state");
  check(setEffectsMuted.includes("this.activeEffects"), "muting effects does not stop active effects");
  check(!setEffectsMuted.includes("musicMuted"), "setEffectsMuted() must not change musicMuted");
  check(!setEffectsMuted.includes("persistentMusic"), "muting effects must not pause persistent music");
  check(!setEffectsMuted.includes("setMusicMuted"), "setEffectsMuted() must not call setMusicMuted()");

  check(playEffect.includes("this.effectsUnlocked"), "effects authorization is not tracked independently");
  check(playEffect.includes("this.preferences.effectsMuted"), "effect playback does not honor effectsMuted");
  check(!playEffect.includes("this.preferences.musicMuted"), "effect playback incorrectly depends on musicMuted");
  check(!playEffect.includes("this.musicUnlocked"), "effect playback incorrectly depends on music authorization");

  check(audioManagerSource.includes("this.unlockPromise = null"), "unlock in-flight state is missing");
  check(
    /if\s*\(\s*this\.unlockPromise\s*\)\s*\{/.test(unlock)
      && /if\s*\(\s*!isMusicGesture\s*\|\|\s*this\.unlockIsGesture\s*\)\s*return\s+this\.unlockPromise/.test(unlock),
    "overlapping unlock attempts are not deduplicated"
  );
  check(
    unlock.includes("supersedingAutoplay = true")
      && unlock.includes("this.musicTransitionId += 1"),
    "a trusted gesture does not supersede an in-flight automatic unlock"
  );
  check(unlock.includes("this.unlockPromise = attempt"), "unlock attempt is not stored as the in-flight promise");
  check(
    /this\.unlockPromise\s*===\s*attempt[\s\S]*?this\.unlockPromise\s*=\s*null/.test(unlock),
    "unlock in-flight promise is not safely cleared"
  );
  check(unlock.includes(".finally("), "unlock in-flight state is not finalized after rejection");
  check(
    loadManifest.includes("this.unlock(")
      && loadManifest.includes("{ autoplay: true }"),
    "menu music is not attempted immediately after manifest load"
  );
  check(
    loadManifest.includes("this.pendingMusicGesture")
      && loadManifest.includes("navigator.userActivation?.isActive"),
    "a first gesture received while the manifest loads is not retained"
  );
  check(
    unlockListeners.includes("this.isAudioControlEvent(event)"),
    "audio controls are not excluded from generic gesture unlocking"
  );
  for (const eventName of ["pointerdown", "click", "keydown"]) {
    check(
      unlockListeners.includes(`addEventListener("${eventName}"`),
      `first-interaction unlock listener is missing for ${eventName}`
    );
  }
  check(
    unlockListeners.includes("this.unlock({ userGesture: true })")
      && unlock.includes("this.unlockEffects({ userGesture: true })"),
    "ordinary interaction does not start independent effects authorization"
  );
  check(
    audioManagerSource.includes("window.AudioContext || window.webkitAudioContext")
      && unlockEffects.includes("context.resume()"),
    "effects are not authorized through a gesture-resumed Web Audio context"
  );
  check(
    resumeListeners.includes("this.resumeMusic()") && resumeListeners.includes("this.resumeEffects()"),
    "foreground lifecycle does not independently resume music and effects"
  );
  check(
    audioManagerSource.includes('"NotAllowedError"'),
    "autoplay-policy rejection handling is missing"
  );
}

function validateCodecAndTemporaryMusicContracts(audioManagerSource) {
  const loadManifest = extractMethod(audioManagerSource, "loadManifest");
  const setMusicState = extractMethod(audioManagerSource, "setMusicState");
  const playEffectSource = extractMethod(audioManagerSource, "playEffectSource");
  const loadEffectBuffer = extractMethod(audioManagerSource, "loadEffectBuffer");
  const playWebAudioEffect = extractMethod(audioManagerSource, "playWebAudioEffect");
  const pulseMusic = extractMethod(audioManagerSource, "pulseMusic");
  const getDebugState = extractMethod(audioManagerSource, "getDebugState");

  check(
    /const\s+urls\s*=\s*\[\s*browserAudioPath\s*,\s*asset\.ogg\s*,\s*asset\.wav\s*,?\s*\]/.test(loadManifest),
    "codec preference must be MP3, then OGG, then WAV"
  );
  check(
    /replace\(\s*\/\\?\\\.wav\$\/i\s*,\s*["']\.mp3["']\s*\)/.test(loadManifest)
      || loadManifest.includes('replace(/\\.wav$/i, ".mp3")'),
    "manifest loading does not derive the uploaded MP3 source"
  );
  check(
    /for\s*\([^)]*sourceIndex[^)]*sourceUrls\.length[^)]*\)/.test(setMusicState),
    "music play() rejections do not advance through codec sources"
  );
  check(setMusicState.includes("candidate.play()"), "music source candidates are not played");
  check(setMusicState.includes("next.onerror"), "later music media errors have no fallback handler");
  check(
    /nextSourceIndex\s*=\s*selectedSourceIndex\s*\+\s*1/.test(setMusicState)
      && setMusicState.includes("sourceStartIndex: nextSourceIndex"),
    "later music media errors do not retry the next codec"
  );
  check(
    playEffectSource.includes('addEventListener("error"') && playEffectSource.includes(".catch(fallback)"),
    "effects do not fall back for both media errors and rejected play() promises"
  );
  check(
    /nextSourceIndex\s*=\s*sourceIndex\s*\+\s*1/.test(playEffectSource)
      && playEffectSource.includes("this.playEffectSource(asset, options, nextSourceIndex)"),
    "effect codec fallback does not advance to the next source"
  );
  check(
    /for\s*\([^)]*sourceIndex[^)]*sourceUrls\.length[^)]*\)/.test(loadEffectBuffer)
      && loadEffectBuffer.includes("this.decodeEffectAudio")
      && loadEffectBuffer.includes("this.effectBufferPromises"),
    "Web Audio effects do not decode/cache MP3, OGG, and WAV fallbacks"
  );
  check(
    playWebAudioEffect.includes("createBufferSource()")
      && playWebAudioEffect.includes("createGain()")
      && playWebAudioEffect.includes("this.activeEffects.add(record)"),
    "Web Audio effects do not support independent overlapping sources and gain control"
  );

  check(setMusicState.includes("options.returnState"), "setMusicState() has no explicit temporary return state");
  check(
    setMusicState.includes("this.currentMusicReturnState = returnState"),
    "temporary return state is not retained on the persistent music element"
  );
  check(
    setMusicState.includes("const handleEnded")
      && setMusicState.includes("this.currentMusicReturnState")
      && setMusicState.includes("next.onended = handleEnded"),
    "temporary music completion does not restore its explicit return state"
  );
  check(
    /returnState\s*:\s*fallbackState/.test(pulseMusic),
    "pulseMusic() does not pass its contextual fallback as returnState"
  );
  check(
    getDebugState.includes("musicMuted")
      && getDebugState.includes("effectsMuted")
      && getDebugState.includes("returnState")
      && getDebugState.includes("currentSource")
      && getDebugState.includes("lastPlaybackError")
      && getDebugState.includes("effectsEngine")
      && getDebugState.includes("effectsContextState")
      && getDebugState.includes("lastEffectsError"),
    "getDebugState() omits required playback diagnostics"
  );
}

function validateRuntimeCueAndContextContracts(gameSource) {
  for (const cue of REQUIRED_CONTEXT_CUES) {
    const pattern = new RegExp(
      `playGameSound\\s*\\(\\s*["'\`]${escapeRegex(cue)}["'\`]`,
      "g"
    );
    const matches = gameSource.match(pattern) || [];
    check(matches.length > 0, `required contextual cue "${cue}" has no game trigger`);
  }

  const ambientMusic = extractFunction(gameSource, "getAmbientMusicState");
  check(ambientMusic.includes("getIncomingAttacks()"), "ambient return state ignores incoming attacks");
  check(ambientMusic.includes("onlineCampStates"), "ambient return state ignores contested camps");
  check(
    containsStringLiteral(ambientMusic, "danger") && containsStringLiteral(ambientMusic, "world_map"),
    "ambient return state must select danger or world_map"
  );

  const allBattlePulses = gameSource.match(
    /pulseMusic\s*\(\s*["']battle["']/g
  ) || [];
  const contextualBattlePulses = gameSource.match(
    /pulseMusic\s*\(\s*["']battle["']\s*,[^;\n]*getAmbientMusicState\s*\(\s*\)\s*\)/g
  ) || [];
  check(allBattlePulses.length > 0, "battle music is never triggered");
  check(
    contextualBattlePulses.length === allBattlePulses.length,
    "every battle music pulse must restore getAmbientMusicState()"
  );

  const allVictoryStates = gameSource.match(
    /setMusicState\s*\(\s*["']victory["']/g
  ) || [];
  const contextualVictoryStates = gameSource.match(
    /setMusicState\s*\(\s*["']victory["']\s*,\s*\{[^}]*returnState\s*:\s*getAmbientMusicState\s*\(\s*\)[^}]*\}\s*\)/g
  ) || [];
  check(allVictoryStates.length > 0, "victory music is never triggered");
  check(
    contextualVictoryStates.length === allVictoryStates.length,
    "every victory cue must explicitly return to getAmbientMusicState()"
  );
}

function validateServiceWorkerContract(serviceWorkerSource) {
  const fetchHandler = extractBalancedBlock(
    serviceWorkerSource,
    'self.addEventListener("fetch", event =>',
    "service-worker fetch handler"
  );
  const rangeBypass = fetchHandler.search(
    /if\s*\(\s*request\.headers\.has\(\s*["']range["']\s*\)\s*\)\s*return\s*;/
  );
  const firstRespondWith = fetchHandler.indexOf("event.respondWith");
  check(rangeBypass >= 0, "service worker does not bypass Range requests");
  check(
    rangeBypass >= 0 && firstRespondWith >= 0 && rangeBypass < firstRespondWith,
    "Range bypass must run before any service-worker response handling"
  );
  check(
    fetchHandler.includes("isAudioMediaRequest(url)") && /isAudioMediaRequest\(url\)\s*\)\s*return/.test(fetchHandler),
    "audio media is not streamed directly from the network"
  );

  const cacheableResponse = extractFunction(serviceWorkerSource, "isCacheableResponse");
  const putInCache = extractFunction(serviceWorkerSource, "putInCache");
  check(
    /response\.status\s*===\s*200/.test(cacheableResponse),
    "service worker cache policy must reject 206 Partial Content"
  );
  check(
    putInCache.includes("try") && putInCache.includes("catch") && putInCache.includes("return false"),
    "service-worker cache writes are not non-fatal"
  );
}

function main() {
  const manifestSource = readSource("audio/manifest.json");
  let manifest = {};
  try {
    manifest = JSON.parse(manifestSource);
  } catch (error) {
    failures.push(`audio/manifest.json is invalid JSON: ${error.message}`);
  }

  const audioManagerSource = readSource("audio-manager.js");
  const gameSource = readSource("game.js");
  const indexSource = readSource("index.html");
  const serviceWorkerSource = readSource("service-worker.js");
  const runtimeSource = `${audioManagerSource}\n${gameSource}\n${indexSource}`;

  const counts = validateManifestAndFiles(manifest, runtimeSource);
  validateMuteAndUnlockContracts(audioManagerSource, indexSource);
  validateCodecAndTemporaryMusicContracts(audioManagerSource);
  validateRuntimeCueAndContextContracts(gameSource);
  validateServiceWorkerContract(serviceWorkerSource);

  if (failures.length) {
    console.error(`Audio contract validation failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Audio contract validation passed: ${counts.assetCount} manifest assets, `
      + `${counts.mediaCount} media files, ${counts.musicStateCount} music states, `
      + `${counts.effectCount} effect cues.`
  );
}

main();
