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

function extractConditional(source, conditionPattern, label, startIndex = 0, required = true) {
  const ifPattern = /\bif\s*\(/g;
  ifPattern.lastIndex = Math.max(0, startIndex);
  let match;

  while ((match = ifPattern.exec(source))) {
    const parameterOpen = source.indexOf("(", match.index);
    const parameterClose = findClosingParenthesis(source, parameterOpen, label);
    if (parameterClose < 0) return null;
    const condition = source.slice(parameterOpen + 1, parameterClose);
    conditionPattern.lastIndex = 0;
    if (!conditionPattern.test(condition)) {
      ifPattern.lastIndex = parameterClose + 1;
      continue;
    }

    const bodyOpen = source.indexOf("{", parameterClose);
    check(bodyOpen >= 0, `${label} has no conditional body`);
    if (bodyOpen < 0) return null;
    const body = extractBlockFromOpenBrace(source, bodyOpen, label);
    const bodyClose = bodyOpen + body.length + 1;
    let end = bodyClose + 1;
    let elseBody = "";
    let cursor = end;
    while (/\s/.test(source[cursor] || "")) cursor += 1;
    if (source.slice(cursor, cursor + 4) === "else") {
      cursor += 4;
      while (/\s/.test(source[cursor] || "")) cursor += 1;
      if (source[cursor] === "{") {
        elseBody = extractBlockFromOpenBrace(source, cursor, `${label} else branch`);
        end = cursor + elseBody.length + 2;
      }
    }

    return {
      body,
      condition,
      elseBody,
      end,
      start: match.index,
    };
  }

  if (required) check(false, `${label} is missing`);
  return null;
}

function extractTryCatch(source, label) {
  const tryMatch = /\btry\s*\{/.exec(source);
  check(Boolean(tryMatch), `${label} try block is missing`);
  if (!tryMatch) return { catchBody: "", tryBody: "" };

  const tryOpen = source.indexOf("{", tryMatch.index);
  const tryBody = extractBlockFromOpenBrace(source, tryOpen, `${label} try block`);
  const tryClose = tryOpen + tryBody.length + 1;
  const catchMatch = /\bcatch\s*\(/g;
  catchMatch.lastIndex = tryClose + 1;
  const catchResult = catchMatch.exec(source);
  check(Boolean(catchResult), `${label} catch block is missing`);
  if (!catchResult) return { catchBody: "", tryBody };

  const catchParameterOpen = source.indexOf("(", catchResult.index);
  const catchParameterClose = findClosingParenthesis(
    source,
    catchParameterOpen,
    `${label} catch parameters`
  );
  if (catchParameterClose < 0) return { catchBody: "", tryBody };
  const catchOpen = source.indexOf("{", catchParameterClose);
  check(catchOpen >= 0, `${label} catch block has no body`);
  if (catchOpen < 0) return { catchBody: "", tryBody };

  return {
    catchBody: extractBlockFromOpenBrace(source, catchOpen, `${label} catch block`),
    tryBody,
  };
}

function countGameCueCalls(source, cue) {
  const pattern = new RegExp(
    `(?:playGameSound|playGameSoundAfter)\\s*\\(\\s*["'\`]${escapeRegex(cue)}["'\`]`,
    "g"
  );
  return (source.match(pattern) || []).length;
}

function countRewardSoundCalls(source) {
  return (source.match(/\bplayRewardSound\s*\(/g) || []).length;
}

function extractArrowCallback(source, pattern, label) {
  pattern.lastIndex = 0;
  const match = pattern.exec(source);
  check(Boolean(match), `${label} is missing`);
  if (!match) return null;

  const bodyOpen = source.indexOf("{", match.index);
  check(bodyOpen >= 0, `${label} has no callback body`);
  if (bodyOpen < 0) return null;
  const body = extractBlockFromOpenBrace(source, bodyOpen, label);
  return {
    body,
    end: bodyOpen + body.length + 2,
    start: match.index,
  };
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
        `(?:playGameSound|playGameSoundAfter|playEffect)\\s*\\(\\s*["'\`]${escapeRegex(id)}["'\`]`
      );
      const swordListPattern = new RegExp(
        `SWORD_CLASHES[\\s\\S]{0,240}["'\`]${escapeRegex(id)}["'\`]`
      );
      const delegatedUiPattern = new RegExp(
        `effectId\\s*=\\s*["'\`]${escapeRegex(id)}["'\`]`
      );
      check(
        cuePattern.test(runtimeSource)
          || swordListPattern.test(runtimeSource)
          || (
            delegatedUiPattern.test(runtimeSource)
            && /this\.playEffect\(effectId\s*,/.test(runtimeSource)
          ),
        `effect cue "${id}" is loaded but never invoked`
      );
    }
  }

  const manifestEffectIds = new Set(
    assets.filter(asset => asset?.category !== "music").map(asset => String(asset.id || ""))
  );
  const invokedCuePattern = /(?:playGameSound|playGameSoundAfter|playEffect)\s*\(\s*["'`]([a-z0-9]+(?:_[a-z0-9]+)*)["'`]/g;
  let invokedCue;
  while ((invokedCue = invokedCuePattern.exec(runtimeSource))) {
    check(
      manifestEffectIds.has(invokedCue[1]),
      `runtime invokes effect cue "${invokedCue[1]}" but the manifest does not define it`
    );
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
    /<button\b[^>]*\bid=["']musicMute["'][^>]*\baria-pressed=["']false["'][^>]*>/i.test(indexSource),
    "profile Music Mute button (#musicMute) is missing or inaccessible"
  );
  check(
    /<button\b[^>]*\bid=["']effectsMute["'][^>]*\baria-pressed=["']false["'][^>]*>/i.test(indexSource),
    "profile Effects Mute button (#effectsMute) is missing or inaccessible"
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
  const pauseForLifecycle = extractMethod(audioManagerSource, "pauseForLifecycle");
  const resumeFromLifecycle = extractMethod(audioManagerSource, "resumeFromLifecycle");
  const clearPendingEffectTimers = extractMethod(audioManagerSource, "clearPendingEffectTimers");
  const getDebugState = extractMethod(audioManagerSource, "getDebugState");
  const loadManifest = extractMethod(audioManagerSource, "loadManifest");

  check(bindSettingsUi.includes('getElementById("musicMute")'), "profile Music Mute switch is not bound");
  check(bindSettingsUi.includes('getElementById("effectsMute")'), "profile Effects Mute button is not bound");
  check(bindSettingsUi.includes('getElementById("loginMusicMuteBtn")'), "login Music Mute button is not bound");
  check(
    /musicMute\.addEventListener\(\s*"click"[\s\S]*?setMusicMuted\(\s*!this\.preferences\.musicMuted\s*\)/.test(bindSettingsUi),
    "profile Music Mute button does not toggle setMusicMuted()"
  );
  check(
    /effectsMute\.addEventListener\(\s*"click"[\s\S]*?setEffectsMuted\(\s*!this\.preferences\.effectsMuted\s*\)/.test(bindSettingsUi),
    "profile Effects Mute button does not toggle setEffectsMuted()"
  );
  check(
    /loginMusicMute\.addEventListener\(\s*"click"[\s\S]*?setMusicMuted\(\s*!this\.preferences\.musicMuted\s*\)/.test(bindSettingsUi),
    "login Music Mute button does not toggle setMusicMuted() in its click"
  );
  check(
    /syncProfileMuteButton\(\s*musicMute\s*,\s*this\.preferences\.musicMuted\s*,\s*"music"\s*\)/.test(syncSettingsUi),
    "persisted music mute preference is not reflected in the profile button"
  );
  check(
    /syncProfileMuteButton\(\s*effectsMute\s*,\s*this\.preferences\.effectsMuted\s*,\s*"effects"\s*\)/.test(syncSettingsUi),
    "persisted effects mute preference is not reflected in the profile button"
  );
  check(
    /loginMusicMute\.setAttribute\(\s*"aria-pressed"\s*,\s*String\(this\.preferences\.musicMuted\)\s*\)/.test(syncSettingsUi),
    "persisted music mute preference is not reflected in login aria-pressed"
  );
  check(
    syncSettingsUi.includes('"Unmute music"') && syncSettingsUi.includes('"Mute music"'),
    "login Music Mute button labels are not synchronized"
  );
  check(
    syncSettingsUi.includes('"--audio-level"') && syncSettingsUi.includes('"aria-valuetext"'),
    "volume sliders do not synchronize their visual fill and accessible percentage"
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
  check(setEffectsMuted.includes("this.stopActiveEffects()"), "muting effects does not stop active effects");
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
  for (const eventName of ["pagehide", "blur", "pageshow", "focus", "visibilitychange", "freeze", "resume"]) {
    check(
      resumeListeners.includes(`("${eventName}"`),
      `audio lifecycle listener is missing for ${eventName}`
    );
  }
  check(
    resumeListeners.includes("this.pauseForLifecycle(")
      && resumeListeners.includes("this.resumeFromLifecycle("),
    "background and foreground events are not routed through the lifecycle state machine"
  );
  check(
    pauseForLifecycle.includes("this.persistentMusic.pause()")
      && pauseForLifecycle.includes("this.clearPendingEffectTimers()")
      && pauseForLifecycle.includes("this.stopActiveEffects()")
      && pauseForLifecycle.includes("this.suspendEffectsForLifecycle()"),
    "background lifecycle does not pause music and discard transient effects"
  );
  check(
    resumeFromLifecycle.includes("this.resumeMusic(")
      && resumeFromLifecycle.includes("this.resumeEffects()")
      && resumeFromLifecycle.includes("this.preferences.musicMuted")
      && resumeFromLifecycle.includes("this.preferences.effectsMuted"),
    "foreground lifecycle does not independently resume eligible music and effects"
  );
  check(
    playEffect.includes("this.lifecyclePaused")
      && clearPendingEffectTimers.includes("window.clearTimeout")
      && clearPendingEffectTimers.includes("releasePending"),
    "background lifecycle does not block and release scheduled effects"
  );
  check(
    getDebugState.includes("lifecyclePaused")
      && getDebugState.includes("lifecyclePauseReason")
      && getDebugState.includes("resumeMusicAfterLifecycle"),
    "audio diagnostics do not expose lifecycle pause and resume intent"
  );
  check(
    audioManagerSource.includes('"NotAllowedError"'),
    "autoplay-policy rejection handling is missing"
  );
}

function validateSettingsLayoutContracts(indexSource, stylesSource) {
  check(
    (indexSource.match(/class=["'][^"']*audio-channel-card[^"']*["']/g) || []).length === 2,
    "the audio mixer must contain exactly two compact channel cards"
  );
  check(indexSource.includes('class="audio-channel-grid"'), "the audio mixer grid is missing");
  check(indexSource.includes('class="settings-secondary-grid"'), "the Notifications and Privacy grid is missing");
  check(
    /\.audio-channel-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(stylesSource),
    "the audio mixer is not a two-column desktop layout"
  );
  check(
    /@media\s*\(max-width:\s*640px\)[\s\S]*?\.audio-channel-grid,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(stylesSource),
    "the audio mixer does not stack at the mobile breakpoint"
  );
  check(
    /\.audio-mute-button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/.test(stylesSource),
    "audio mute buttons must retain 44px touch targets"
  );
  check(
    stylesSource.includes("env(safe-area-inset-right)")
      && stylesSource.includes("env(safe-area-inset-bottom)")
      && stylesSource.includes("env(safe-area-inset-left)"),
    "settings layout does not account for mobile safe areas"
  );
}

function validateCodecAndTemporaryMusicContracts(audioManagerSource) {
  const loadManifest = extractMethod(audioManagerSource, "loadManifest");
  const setMusicState = extractMethod(audioManagerSource, "setMusicState");
  const ensureEffectContext = extractMethod(audioManagerSource, "ensureEffectContext");
  const getEffectGainState = extractMethod(audioManagerSource, "getEffectGainState");
  const playEffect = extractMethod(audioManagerSource, "playEffect");
  const playEffectSource = extractMethod(audioManagerSource, "playEffectSource");
  const prepareEffect = extractMethod(audioManagerSource, "prepareEffect");
  const loadEffectBuffer = extractMethod(audioManagerSource, "loadEffectBuffer");
  const playWebAudioEffect = extractMethod(audioManagerSource, "playWebAudioEffect");
  const playSwordClash = extractMethod(audioManagerSource, "playSwordClash");
  const installUiSounds = extractMethod(audioManagerSource, "installUiSounds");
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
  check(
    /function\s+clampScale\s*\([^)]*\)\s*\{[\s\S]*?Math\.min\(\s*2\s*,\s*Math\.max\(\s*0\s*,\s*number\s*\)\s*\)/.test(audioManagerSource),
    "effect volume multipliers must support an audible boost above 1 with a safe upper bound"
  );
  check(
    getEffectGainState.includes("clampScale(options?.volumeScale, 1)")
      && /clampVolume\(\s*recommendedVolume\s*\*\s*volumeScale\s*,\s*1\s*\)/.test(getEffectGainState)
      && playWebAudioEffect.includes("this.getEffectGainState(asset, options)")
      && playEffectSource.includes("this.getEffectGainState(asset, options)"),
    "Web Audio and HTMLAudio must share the same multiplied, capped effect gain calculation"
  );
  check(
    ensureEffectContext.includes("createDynamicsCompressor()")
      && ensureEffectContext.includes("limiter.threshold.value = -3")
      && ensureEffectContext.includes("limiter.knee.value = 0")
      && ensureEffectContext.includes("limiter.ratio.value = 20")
      && ensureEffectContext.includes("limiter.attack.value = 0.003")
      && ensureEffectContext.includes("limiter.release.value = 0.12")
      && ensureEffectContext.includes("masterGain.connect(limiter)")
      && ensureEffectContext.includes("limiter.connect(context.destination)")
      && ensureEffectContext.includes("masterGain.connect(context.destination)"),
    "the effects bus must use the configured limiter with a direct-output fallback"
  );
  check(
    playEffect.includes("options.delayMs")
      && playEffect.includes("this.prepareEffect(id)")
      && playEffect.includes("window.setTimeout(() =>")
      && playEffect.includes("this.pendingEffectTimers.add(timerRecord)"),
    "delayed effects must predecode and start through the shared scheduler"
  );
  check(
    /playSwordClash\s*\(\s*options\s*=\s*\{\}\s*\)/.test(audioManagerSource)
      && playSwordClash.includes("...options"),
    "playSwordClash() must preserve delayed-play options"
  );
  check(
    /addEventListener\(\s*["']click["']\s*,[\s\S]*?\{\s*capture\s*:\s*true\s*\}\s*\)/.test(installUiSounds)
      && installUiSounds.includes("Promise.resolve().then(")
      && installUiSounds.includes("this.suppressDelegatedUiSound"),
    "delegated UI effects must use deferred capture-phase handling without double cues"
  );
  check(
    prepareEffect.includes('this.effectsEngine === "htmlaudio"')
      && prepareEffect.includes("audio.play()")
      && prepareEffect.includes("this.preparedHtmlEffects.set(id, record)")
      && prepareEffect.includes("prepareSource(nextSourceIndex)"),
    "HTMLAudio fallback must authorize and retain a reusable effect element during the user gesture"
  );
  check(
    audioManagerSource.includes("this.preparedHtmlEffects.get(id)")
      && audioManagerSource.includes("this.playEffectSource(asset, playbackOptions, prepared.sourceIndex, prepared.audio)"),
    "delayed HTMLAudio fallback playback must reuse the gesture-authorized effect element"
  );
  check(
    prepareEffect.includes('error?.name === "NotAllowedError"')
      && prepareEffect.includes('error?.name === "AbortError"')
      && /if\s*\(\s*policyError\s*\)\s*\{[\s\S]*?this\.effectsUnlocked\s*=\s*false/.test(prepareEffect),
    "HTMLAudio codec failures must preserve effects authorization while policy failures revoke it"
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
      && getDebugState.includes("effectsLimiterActive")
      && getDebugState.includes("lastEffectRecommendedVolume")
      && getDebugState.includes("lastEffectVolumeScale")
      && getDebugState.includes("lastEffectBaseGain")
      && getDebugState.includes("lastEffectEffectiveGain")
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

function validateCityUpgradeCueContract(gameSource) {
  const primeCityUpgradeAudio = extractFunction(gameSource, "primeCityUpgradeAudio");
  check(
    countGameCueCalls(primeCityUpgradeAudio, "button_click") === 1,
    "a city-upgrade gesture must play one immediate button_click cue"
  );
  check(
    /unlockEffects\?\.\s*\(\s*\{\s*userGesture\s*:\s*true\s*\}\s*\)/.test(primeCityUpgradeAudio),
    "a city-upgrade gesture must explicitly authorize the independent effects channel"
  );
  check(
    /prepareEffect\?\.\s*\(\s*["']level_up["']\s*\)/.test(primeCityUpgradeAudio),
    "a city-upgrade gesture must preload the delayed level_up success cue"
  );

  const cityWheel = extractFunction(gameSource, "renderSelectedCityWheel");
  const wheelUpgradeHandler = cityWheel.match(
    /querySelector\s*\(\s*["']\.wheel-level["']\s*\)[\s\S]*?addEventListener\s*\(\s*["']click["'][\s\S]*?\n\s*\}\s*\);/
  )?.[0] || "";
  check(
    /wheel-level[\s\S]*?data-audio-effect=["']none["']/.test(cityWheel),
    "the map-wheel upgrade control must suppress duplicate delegated UI audio"
  );
  check(
    wheelUpgradeHandler.indexOf("primeCityUpgradeAudio()") >= 0
      && wheelUpgradeHandler.indexOf("primeCityUpgradeAudio()") < wheelUpgradeHandler.indexOf("upgradeCity("),
    "the map-wheel upgrade control must prime audio before starting the upgrade"
  );

  const renderCityLevelUpButton = extractFunction(gameSource, "renderCityLevelUpButton");
  check(
    /data-audio-effect=["']none["']/.test(renderCityLevelUpButton),
    "modal city-upgrade controls must suppress duplicate delegated UI audio"
  );
  const bindCityLevelUpButtons = extractFunction(gameSource, "bindCityLevelUpButtons");
  check(
    bindCityLevelUpButtons.indexOf("primeCityUpgradeAudio()") >= 0
      && bindCityLevelUpButtons.indexOf("primeCityUpgradeAudio()") < bindCityLevelUpButtons.indexOf("button.disabled = true"),
    "modal city-upgrade controls must prime audio before disabling the clicked button"
  );

  const upgradeCity = extractFunction(gameSource, "upgradeCity");
  check(
    !/Number\s*\(\s*result\?\.upgraded\s*\)\s*\|\|\s*chunkLevels/.test(upgradeCity),
    "city-upgrade responses must not treat a missing or zero upgraded count as success"
  );
  check(
    /Number\.isFinite\s*\(\s*reportedUpgraded\s*\)/.test(upgradeCity)
      && /if\s*\(\s*upgraded\s*<\s*1\s*\)\s*throw\b/.test(upgradeCity),
    "city-upgrade responses must require a finite positive server-confirmed level count"
  );
  check(
    /serverCityUpgradeInFlightIds\.has[\s\S]*?rejectGameAction\s*\(/.test(upgradeCity),
    "duplicate in-flight city upgrades must play invalid_action"
  );
  const serverBranch = extractConditional(
    upgradeCity,
    /\busesServerEconomyAuthority\s*\(\s*\)/,
    "upgradeCity() server-authority branch"
  );
  if (!serverBranch) return;

  const { catchBody, tryBody } = extractTryCatch(
    serverBranch.body,
    "upgradeCity() server-authority branch"
  );
  const confirmedServerUpgrade = extractConditional(
    tryBody,
    /\btotalUpgraded\s*>\s*0\b/,
    "upgradeCity() confirmed-server-success branch",
    0,
    false
  );
  const zeroServerUpgrade = confirmedServerUpgrade ? null : extractConditional(
    tryBody,
    /(?:!\s*totalUpgraded\b|\btotalUpgraded\s*(?:===?|<=)\s*0\b|\btotalUpgraded\s*<\s*1\b|\b0\s*(?:===?|>=)\s*totalUpgraded\b)/,
    "upgradeCity() zero-upgrade server guard",
    0,
    false
  );
  if (confirmedServerUpgrade) {
    check(
      countGameCueCalls(confirmedServerUpgrade.body, "level_up") === 1,
      "a confirmed server city upgrade must play level_up exactly once"
    );
    check(
      countGameCueCalls(tryBody, "level_up") === 1,
      "server city-upgrade success audio must stay inside the confirmed-upgrade guard"
    );
  } else if (zeroServerUpgrade) {
    check(
      zeroServerUpgrade.body.includes("rejectGameAction("),
      "a zero-upgrade server result must use rejectGameAction()"
    );
    check(
      /\breturn\b/.test(zeroServerUpgrade.body),
      "a zero-upgrade server result must return before success audio"
    );
    check(
      countGameCueCalls(zeroServerUpgrade.body, "level_up") === 0,
      "a zero-upgrade server result must not play level_up"
    );
    const confirmedServerSuccess = tryBody.slice(zeroServerUpgrade.end);
    check(
      countGameCueCalls(confirmedServerSuccess, "level_up") === 1,
      "a confirmed server city upgrade must play level_up exactly once"
    );
  } else {
    check(
      false,
      "upgradeCity() must distinguish confirmed server upgrades from zero-upgrade results before playing level_up"
    );
  }

  const partialServerUpgrade = extractConditional(
    catchBody,
    /\btotalUpgraded\s*>\s*0\b/,
    "upgradeCity() partial-server-success branch"
  );
  if (partialServerUpgrade) {
    check(
      countGameCueCalls(partialServerUpgrade.body, "level_up") === 1,
      "a partial server city upgrade must play level_up exactly once"
    );
    check(
      Boolean(partialServerUpgrade.elseBody),
      "upgradeCity() server failure must have a distinct zero-upgrade branch"
    );
    if (partialServerUpgrade.elseBody) {
      check(
        partialServerUpgrade.elseBody.includes("rejectGameAction("),
        "a server city-upgrade failure with no completed levels must use rejectGameAction()"
      );
      check(
        countGameCueCalls(partialServerUpgrade.elseBody, "level_up") === 0,
        "a server city-upgrade failure with no completed levels must not play level_up"
      );
    }
  }

  const localNoUpgrade = extractConditional(
    upgradeCity,
    /(?:!\s*upgraded\b|\bupgraded\s*(?:===?|<=)\s*0\b|\bupgraded\s*<\s*1\b|\b0\s*(?:===?|>=)\s*upgraded\b)/,
    "upgradeCity() local no-upgrade branch",
    serverBranch.end
  );
  if (localNoUpgrade) {
    check(
      localNoUpgrade.body.includes("rejectGameAction("),
      "a local city upgrade with no completed levels must use rejectGameAction()"
    );
    check(
      /\breturn\b/.test(localNoUpgrade.body),
      "a local city upgrade with no completed levels must return before success audio"
    );
    check(
      countGameCueCalls(localNoUpgrade.body, "level_up") === 0,
      "a local city upgrade with no completed levels must not play level_up"
    );
    const confirmedLocalSuccess = upgradeCity.slice(localNoUpgrade.end);
    check(
      countGameCueCalls(confirmedLocalSuccess, "level_up") === 1,
      "a confirmed local city upgrade must play level_up exactly once"
    );
  }

  check(
    countGameCueCalls(upgradeCity, "level_up") === 3,
    "upgradeCity() must contain exactly three level_up calls: server success, partial server success, and local success"
  );
  check(
    tryBody.indexOf("if (upgraded < 1)") >= 0
      && tryBody.indexOf("applyServerEconomyResult(result)") > tryBody.indexOf("if (upgraded < 1)"),
    "server economy state must only be applied after a city upgrade is positively confirmed"
  );
  const audibleLevelUpCalls = upgradeCity.match(
    /playGameSound\s*\(\s*["']level_up["']\s*,\s*\{[^}]*volumeScale\s*:\s*1\.35[^}]*\}\s*\)/g
  ) || [];
  check(
    audibleLevelUpCalls.length === 3,
    "every confirmed city-upgrade success must play the raised-volume level_up cue"
  );
}

function validateScoutDispatchCueContract(gameSource) {
  const launchScoutMission = extractFunction(gameSource, "launchScoutMission");
  const serverBranch = extractConditional(
    launchScoutMission,
    /\busesServerArmyAuthority\s*\(\s*\)/,
    "launchScoutMission() server-authority branch"
  );
  if (!serverBranch) return;

  const acceptedCallback = extractArrowCallback(
    serverBranch.body,
    /\.then\s*\(\s*(?:async\s+)?accepted\s*=>\s*\{/,
    "launchScoutMission() accepted-server callback"
  );
  if (acceptedCallback) {
    const acceptedGuardIndex = acceptedCallback.body.search(
      /\bif\s*\(\s*!\s*accepted\s*\)\s*(?:\{\s*)?return\b/
    );
    const dispatchIndex = acceptedCallback.body.search(
      /playGameSound\s*\(\s*["']troop_dispatch["']/
    );
    check(
      acceptedGuardIndex >= 0,
      "server scout dispatch must guard against a rejected server order"
    );
    check(
      countGameCueCalls(acceptedCallback.body, "troop_dispatch") === 1,
      "an accepted server scout order must play troop_dispatch exactly once"
    );
    check(
      acceptedGuardIndex >= 0 && dispatchIndex > acceptedGuardIndex,
      "server scout troop_dispatch must run only after the accepted-order guard"
    );
  }
  check(
    countGameCueCalls(serverBranch.body, "troop_dispatch") === 1,
    "the server scout path must not play troop_dispatch outside its accepted callback"
  );

  const localSuccess = launchScoutMission.slice(serverBranch.end);
  const localEnqueueIndex = localSuccess.search(
    /\bstate\.attacks\.push\s*\(\s*mission\s*\)/
  );
  const localPublishIndex = localSuccess.search(
    /\bpublishOnlineArmyMovement\s*\(\s*mission\s*\)/
  );
  const localDispatchIndex = localSuccess.search(
    /playGameSound\s*\(\s*["']troop_dispatch["']/
  );
  check(localEnqueueIndex >= 0, "local scout success must enqueue its mission");
  check(localPublishIndex >= 0, "local scout success must publish its mission");
  check(
    countGameCueCalls(localSuccess, "troop_dispatch") === 1,
    "a successful local scout order must play troop_dispatch exactly once"
  );
  check(
    localDispatchIndex > localEnqueueIndex && localDispatchIndex > localPublishIndex,
    "local scout troop_dispatch must run only after the mission is accepted locally"
  );
  check(
    countGameCueCalls(launchScoutMission, "troop_dispatch") === 2,
    "launchScoutMission() must contain exactly two troop_dispatch calls: accepted server and successful local"
  );
}

function validateClanRallyDispatchCueContract(gameSource) {
  const submitRallyOrder = extractFunction(gameSource, "submitClanRallyTroopOrder");
  check(
    /\bactiveTroopOrderKind\s*===\s*["']rally_create["'][\s\S]{0,200}["']createClanRally["'][\s\S]{0,200}["']joinClanRally["']/.test(submitRallyOrder),
    "submitClanRallyTroopOrder() must route both rally creation and rally joining through its shared success path"
  );
  const submitBlocks = extractTryCatch(
    submitRallyOrder,
    "submitClanRallyTroopOrder()"
  );
  const submitRequestIndex = submitBlocks.tryBody.search(
    /\bawait\s+api\s*\[\s*method\s*\]\s*\(/
  );
  const submitDispatchIndex = submitBlocks.tryBody.search(
    /playGameSound\s*\(\s*["']troop_dispatch["']/
  );
  const submitSuccessIndex = submitBlocks.tryBody.search(/\breturn\s+true\s*;/);
  check(
    countGameCueCalls(submitBlocks.tryBody, "troop_dispatch") === 1,
    "successful clan rally creation/join must play troop_dispatch exactly once"
  );
  check(
    submitRequestIndex >= 0
      && submitDispatchIndex > submitRequestIndex
      && submitSuccessIndex > submitDispatchIndex,
    "clan rally creation/join must play troop_dispatch after server acceptance and before returning success"
  );
  check(
    countGameCueCalls(submitBlocks.catchBody, "troop_dispatch") === 0,
    "a failed clan rally creation/join must not play troop_dispatch"
  );
  check(
    countGameCueCalls(submitRallyOrder, "troop_dispatch") === 1,
    "submitClanRallyTroopOrder() must keep its dispatch cue on the shared success path"
  );

  const runRallyAction = extractFunction(gameSource, "runClanRallyAction");
  check(
    /\baction\s*===\s*["']launch["'][\s\S]{0,200}["']launchClanRally["']/.test(runRallyAction),
    "runClanRallyAction() must map the launch action to launchClanRally"
  );
  const runBlocks = extractTryCatch(runRallyAction, "runClanRallyAction()");
  const runRequestIndex = runBlocks.tryBody.search(
    /\bawait\s+api\s*\[\s*method\s*\]\s*\(/
  );
  check(runRequestIndex >= 0, "runClanRallyAction() must await its server action");
  const launchBranch = extractConditional(
    runBlocks.tryBody,
    /\baction\s*===\s*["']launch["']/,
    "runClanRallyAction() successful launch branch",
    Math.max(0, runRequestIndex)
  );
  if (launchBranch) {
    check(
      countGameCueCalls(launchBranch.body, "troop_dispatch") === 1,
      "a successful assembled clan rally launch must play troop_dispatch exactly once"
    );
  }
  check(
    countGameCueCalls(runRallyAction, "troop_dispatch") === 1,
    "runClanRallyAction() must restrict troop_dispatch to the successful launch branch"
  );
  check(
    countGameCueCalls(runBlocks.catchBody, "troop_dispatch") === 0,
    "a failed clan rally launch must not play troop_dispatch"
  );
}

function validateRewardedAdCueContract(gameSource) {
  const claimPreparedRewardedAd = extractFunction(gameSource, "claimPreparedRewardedAd");
  const guardedRewardCue = /\bif\s*\(\s*(?=[^)]*(?:!\s*result\??\.replayed|result\??\.replayed\s*===?\s*false))(?=[^)]*(?:\breward\s*>\s*0\b|\breward\s*>=\s*1\b|\b0\s*<\s*reward\b))[^)]*\)\s*(?:\{\s*)?playRewardSound\s*\(\s*rewardType\s*(?:[,)]|$)/;
  check(
    guardedRewardCue.test(claimPreparedRewardedAd),
    "a non-replayed positive rewarded-ad claim must play the matching reward sound exactly once"
  );
  check(
    countRewardSoundCalls(claimPreparedRewardedAd) === 1,
    "claimPreparedRewardedAd() must not play reward audio for replayed or zero-value claims"
  );
}

function validateCampCaptureCueContract(gameSource) {
  const applyServerArmyResult = extractFunction(gameSource, "applyServerArmyResult");
  const assignmentPattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g;
  let classifier = null;
  let assignment;
  while ((assignment = assignmentPattern.exec(applyServerArmyResult))) {
    const expression = assignment[2];
    if (
      /\bresult\.targetType\s*===\s*["']camp["']/.test(expression)
      && /\bnormalizedCampUpdate\b/.test(expression)
      && /\bisRewardCampTarget\s*\(/.test(expression)
    ) {
      classifier = {
        end: assignmentPattern.lastIndex,
        expression,
        name: assignment[1],
        start: assignment.index,
      };
      break;
    }
  }
  check(
    Boolean(classifier),
    "applyServerArmyResult() must classify camp targets before capture reward audio"
  );
  if (!classifier) return;

  const ordinaryCaptureBranch = extractConditional(
    applyServerArmyResult,
    new RegExp(
      `(?=[\\s\\S]*\\bnewestPlayerReport\\??\\.type\\s*===\\s*["']attack["'])`
        + `(?=[\\s\\S]*\\bnewestPlayerReport\\??\\.outcome\\s*===\\s*["']victory["'])`
        + `(?=[\\s\\S]*!\\s*${escapeRegex(classifier.name)}\\b)`
    ),
    "applyServerArmyResult() non-camp victory branch"
  );
  if (!ordinaryCaptureBranch) return;
  check(
    classifier.end <= ordinaryCaptureBranch.start,
    "camp target classification must happen before city/Stronghold capture cues"
  );
  check(
    countGameCueCalls(ordinaryCaptureBranch.body, "city_captured") === 1,
    "the non-camp victory branch must retain one city_captured cue"
  );
  check(
    countGameCueCalls(ordinaryCaptureBranch.body, "stronghold_captured") === 1,
    "the non-camp victory branch must retain one stronghold_captured cue"
  );
  check(
    countGameCueCalls(ordinaryCaptureBranch.body, "camp_captured") === 0,
    "the non-camp victory branch must not play camp_captured"
  );

  const campVictoryBranch = extractConditional(
    applyServerArmyResult,
    /(?=[\s\S]*\bnormalizedCampUpdate\b)(?=[\s\S]*\bresult\.targetType\s*===\s*["']camp["'])(?=[\s\S]*\bresult\.kind\s*===\s*["']attack["'])(?=[\s\S]*\bresult\.outcome\s*===\s*["']victory["'])/,
    "applyServerArmyResult() camp-victory branch",
    ordinaryCaptureBranch.end
  );
  if (campVictoryBranch) {
    check(
      campVictoryBranch.start > ordinaryCaptureBranch.end,
      "camp_captured must be evaluated after camp victories are excluded from ordinary capture cues"
    );
    check(
      countGameCueCalls(campVictoryBranch.body, "camp_captured") === 1,
      "a successful camp capture must play camp_captured exactly once"
    );
    check(
      countGameCueCalls(campVictoryBranch.body, "city_captured") === 0
        && countGameCueCalls(campVictoryBranch.body, "stronghold_captured") === 0,
      "a camp victory must not also play city_captured or stronghold_captured"
    );
  }
  check(
    countGameCueCalls(applyServerArmyResult, "camp_captured") === 1
      && countGameCueCalls(applyServerArmyResult, "city_captured") === 1
      && countGameCueCalls(applyServerArmyResult, "stronghold_captured") === 1,
    "applyServerArmyResult() must keep distinct single cues for camp, city, and Stronghold captures"
  );
}

function validateAudibleMixAndSequencingContracts(gameSource) {
  check(
    /const\s+BATTLE_IMPACT_AUDIO_DELAY_MS\s*=\s*150\s*;/.test(gameSource)
      && /const\s+BATTLE_OUTCOME_AUDIO_DELAY_MS\s*=\s*450\s*;/.test(gameSource)
      && /const\s+REWARD_FOLLOWUP_AUDIO_DELAY_MS\s*=\s*900\s*;/.test(gameSource)
      && /const\s+VICTORY_MUSIC_AUDIO_DELAY_MS\s*=\s*2000\s*;/.test(gameSource),
    "the measured battle, outcome, reward, and victory timing constants are missing"
  );

  const playGameSoundAfter = extractFunction(gameSource, "playGameSoundAfter");
  const playBattleImpactAfter = extractFunction(gameSource, "playBattleImpactAfter");
  const playRewardSoundAfter = extractFunction(gameSource, "playRewardSoundAfter");
  check(
    playGameSoundAfter.includes("playGameSound(id")
      && playGameSoundAfter.includes("delayMs:"),
    "delayed game cues must queue through AudioManager so their media predecodes"
  );
  check(
    countGameCueCalls(playBattleImpactAfter, "siege_impact") === 1
      && playBattleImpactAfter.includes("playSwordClash({ delayMs: normalizedDelayMs })"),
    "battle impacts must queue siege or sword audio through the +150ms scheduler"
  );
  check(
    playRewardSoundAfter.includes("playRewardSound(rewardType")
      && playRewardSoundAfter.includes("delayMs:"),
    "reward follow-up cues must queue through AudioManager instead of masking the timer"
  );

  const applyServerArmyResult = extractFunction(gameSource, "applyServerArmyResult");
  check(
    (applyServerArmyResult.match(/playBattleImpactAfter\s*\(/g) || []).length === 1,
    "server-authoritative battles must schedule one impact cue"
  );
  for (const cue of ["stronghold_captured", "city_captured", "battle_defeat", "camp_captured"]) {
    check(
      new RegExp(
        `playGameSoundAfter\\s*\\(\\s*["']${escapeRegex(cue)}["']\\s*,\\s*BATTLE_OUTCOME_AUDIO_DELAY_MS`
      ).test(applyServerArmyResult),
      `server-authoritative ${cue} must use the +450ms outcome slot`
    );
  }
  check(
    /levelUpAudioDelayMs\s*:[\s\S]{0,180}REWARD_FOLLOWUP_AUDIO_DELAY_MS[\s\S]{0,40}:\s*0/.test(applyServerArmyResult),
    "server combat level-up audio must follow the battle mix"
  );

  const resolveAttack = extractFunction(gameSource, "resolveAttack");
  check(
    (resolveAttack.match(/playBattleImpactAfter\s*\(/g) || []).length === 1,
    "local battles must schedule one impact cue"
  );
  for (const cue of ["stronghold_captured", "city_captured", "battle_defeat"]) {
    check(
      new RegExp(
        `playGameSoundAfter\\s*\\(\\s*["']${escapeRegex(cue)}["']\\s*,\\s*BATTLE_OUTCOME_AUDIO_DELAY_MS`
      ).test(resolveAttack),
      `local ${cue} must use the +450ms outcome slot`
    );
  }
  check(
    (resolveAttack.match(/audioDelayMs\s*:\s*REWARD_FOLLOWUP_AUDIO_DELAY_MS/g) || []).length >= 5,
    "every local combat XP path must keep level-up audio out of the impact/outcome mix"
  );

  const requestDueRewardCampPayout = extractFunction(gameSource, "requestDueRewardCampPayout");
  const timerCueIndex = requestDueRewardCampPayout.indexOf('playGameSound("timer_tick_complete"');
  const rewardCueIndex = requestDueRewardCampPayout.indexOf("playRewardSoundAfter(");
  check(
    timerCueIndex >= 0
      && rewardCueIndex > timerCueIndex
      && requestDueRewardCampPayout.includes("REWARD_FOLLOWUP_AUDIO_DELAY_MS"),
    "camp completion must play its timer first and its reward in the follow-up slot"
  );

  const queueLevelUpReward = extractFunction(gameSource, "queueLevelUpReward");
  const showNextLevelUpReward = extractFunction(gameSource, "showNextLevelUpReward");
  const scheduleLevelUpRewardAudio = extractFunction(gameSource, "scheduleLevelUpRewardAudio");
  check(
    countGameCueCalls(queueLevelUpReward, "level_up") === 0
      && showNextLevelUpReward.includes("scheduleLevelUpRewardAudio(nextReward)")
      && countGameCueCalls(scheduleLevelUpRewardAudio, "level_up") === 1,
    "hero level-up audio must play when its reward modal is actually presented"
  );

  const selectCity = extractFunction(gameSource, "selectCity");
  const firstCitySelectIndex = selectCity.indexOf('playGameSound("city_select"');
  check(
    firstCitySelectIndex > selectCity.indexOf("neutralBlockReason")
      && firstCitySelectIndex > selectCity.indexOf("shieldBlockReason"),
    "city selection audio must not mask rejected-order invalid_action cues"
  );
  const selectRewardCamp = extractFunction(gameSource, "selectRewardCamp");
  check(
    countGameCueCalls(selectRewardCamp, "city_select") === 1,
    "selecting a reward camp must play one city-selection cue"
  );

  const updateIncomingAttackUi = extractFunction(gameSource, "updateIncomingAttackUi");
  check(
    updateIncomingAttackUi.includes("lastAudioIncomingAttackIds")
      && updateIncomingAttackUi.includes("getArmyTokenId(attack)")
      && updateIncomingAttackUi.includes("!lastAudioIncomingAttackIds.has(id)"),
    "incoming attack audio must detect replacement armies, not only count changes"
  );

  const updatePerformancePanel = extractFunction(gameSource, "updatePerformancePanel");
  check(
    updatePerformancePanel.includes("lastEffectEffectiveGain")
      && updatePerformancePanel.includes("lastEffectVolumeScale"),
    "F8 diagnostics must expose the effective effect gain and runtime scale"
  );
  check(
    updatePerformancePanel.includes("lifecyclePaused")
      && updatePerformancePanel.includes("lifecyclePauseReason")
      && updatePerformancePanel.includes("resumeMusicAfterLifecycle")
      && updatePerformancePanel.includes("Audio lifecycle:"),
    "F8 diagnostics must expose background pause and resume intent"
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
  const stylesSource = readSource("styles.css");
  const serviceWorkerSource = readSource("service-worker.js");
  const runtimeSource = `${audioManagerSource}\n${gameSource}\n${indexSource}`;

  const counts = validateManifestAndFiles(manifest, runtimeSource);
  validateMuteAndUnlockContracts(audioManagerSource, indexSource);
  validateSettingsLayoutContracts(indexSource, stylesSource);
  validateCodecAndTemporaryMusicContracts(audioManagerSource);
  validateRuntimeCueAndContextContracts(gameSource);
  validateCityUpgradeCueContract(gameSource);
  validateScoutDispatchCueContract(gameSource);
  validateClanRallyDispatchCueContract(gameSource);
  validateRewardedAdCueContract(gameSource);
  validateCampCaptureCueContract(gameSource);
  validateAudibleMixAndSequencingContracts(gameSource);
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
