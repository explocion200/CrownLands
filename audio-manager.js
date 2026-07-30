(function () {
  "use strict";

  const STORAGE_KEY = "crownlands.audio.preferences.v1";
  const MANIFEST_URL = "audio/manifest.json";
  const BUILD_ID = document.querySelector?.('meta[name="crownlands-build"]')?.content || "audio";
  const DEFAULT_MUSIC_STATE_BY_ID = Object.freeze({
    main_menu_loop: "main_menu",
    world_map_loop: "world_map",
    battle_loop: "battle",
    danger_contested_loop: "danger",
    victory_fanfare: "victory",
  });
  const MUSIC_STATES = Object.freeze(["main_menu", "world_map", "battle", "danger", "victory"]);
  const SWORD_CLASHES = Object.freeze(["sword_clash_01", "sword_clash_02", "sword_clash_03"]);
  const AUDIO_CONTROL_SELECTOR = [
    "#loginMusicMuteBtn",
    "#musicMute",
    "#effectsMute",
    "#musicVolume",
    "#effectsVolume",
    "[data-audio-control]",
    ".audio-toggle-control",
    ".audio-volume-control",
  ].join(", ");
  const DEFAULT_PREFERENCES = Object.freeze({
    musicVolume: 0.7,
    effectsVolume: 0.8,
    musicMuted: false,
    effectsMuted: false,
  });

  function clampVolume(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
  }

  function getAudioExtension(url = "") {
    return String(url).match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() || "";
  }

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        musicVolume: clampVolume(saved.musicVolume, DEFAULT_PREFERENCES.musicVolume),
        effectsVolume: clampVolume(saved.effectsVolume, DEFAULT_PREFERENCES.effectsVolume),
        musicMuted: Boolean(saved.musicMuted),
        effectsMuted: Boolean(saved.effectsMuted),
      };
    } catch (error) {
      console.warn("Could not load Crownlands audio preferences", error);
      return { ...DEFAULT_PREFERENCES };
    }
  }

  class AudioManager {
    constructor() {
      this.preferences = loadPreferences();
      this.assets = new Map();
      this.musicPlaylists = new Map(MUSIC_STATES.map(state => [state, []]));
      this.lastMusicAssetByState = new Map();
      this.unlocked = false;
      this.musicUnlocked = false;
      this.effectsUnlocked = false;
      this.unlockPromise = null;
      this.unlockIsGesture = false;
      this.pendingMusicGesture = false;
      this.ready = false;
      this.requestedMusicState = "main_menu";
      this.requestedMusicReturnState = "";
      this.currentMusicState = "";
      this.currentMusicReturnState = "";
      this.currentMusicSourceIndex = -1;
      this.currentMusic = null;
      this.persistentMusic = this.createPersistentMusicElement();
      this.lastPlaybackError = "";
      this.preferredAudioExtension = "mp3";
      this.musicTransitionId = 0;
      this.playlistTransitionTimer = 0;
      this.temporaryMusicId = 0;
      this.lastEffectAt = new Map();
      this.activeEffects = new Set();
      this.pendingEffectCounts = new Map();
      this.effectBufferPromises = new Map();
      this.effectContext = null;
      this.effectMasterGain = null;
      this.effectUnlockPromise = null;
      this.effectsAuthorized = false;
      this.effectsEngine = (window.AudioContext || window.webkitAudioContext) ? "webaudio" : "htmlaudio";
      this.lastEffectsError = "";
      this.lastSwordIndex = -1;
      this.suppressDelegatedUiSound = false;
      this.manifestPromise = this.loadManifest();
      this.installUnlockListeners();
      this.installResumeListeners();
      this.installUiSounds();
      this.bindSettingsUi();
    }

    createPersistentMusicElement() {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.playsInline = true;
      audio.hidden = true;
      audio.setAttribute?.("aria-hidden", "true");
      audio.setAttribute?.("playsinline", "");
      if (document.body?.appendChild) {
        document.body.appendChild(audio);
      } else {
        document.addEventListener("DOMContentLoaded", () => document.body?.appendChild?.(audio), { once: true });
      }
      return audio;
    }

    async loadManifest() {
      try {
        const response = await fetch(MANIFEST_URL, { cache: "no-cache" });
        if (!response.ok) throw new Error(`Audio manifest request failed (${response.status})`);
        const manifest = await response.json();
        for (const asset of Array.isArray(manifest.assets) ? manifest.assets : []) {
          if (!asset?.id || !asset?.ogg) continue;
          const browserAudioPath = asset.mp3
            || (asset.wav ? String(asset.wav).replace(/\.wav$/i, ".mp3") : asset.ogg);
          const urls = [
            browserAudioPath,
            asset.ogg,
            asset.wav,
          ]
            .filter(Boolean)
            .map(relativePath => `audio/${String(relativePath).replace(/^\/+/, "")}?v=${encodeURIComponent(BUILD_ID)}`)
            .filter((url, index, entries) => entries.indexOf(url) === index);
          const normalizedAsset = {
            ...asset,
            url: urls[0],
            urls,
          };
          this.assets.set(asset.id, normalizedAsset);
          if (asset.category === "music") {
            const musicState = String(asset.music_state || DEFAULT_MUSIC_STATE_BY_ID[asset.id] || "").trim();
            if (this.musicPlaylists.has(musicState)) this.musicPlaylists.get(musicState).push(normalizedAsset);
          }
        }
        this.ready = this.assets.size > 0 && [...this.musicPlaylists.values()].some(playlist => playlist.length);
        this.syncSettingsUi();
        if (this.ready) {
          const canRetainPendingGesture = Boolean(
            this.pendingMusicGesture
            && navigator.userActivation?.isActive
          );
          this.unlock(canRetainPendingGesture ? { musicGesture: true } : { autoplay: true });
        }
        return this.ready;
      } catch (error) {
        console.warn("Crownlands audio is unavailable", error);
        return false;
      }
    }

    installUnlockListeners() {
      const unlock = event => {
        if (this.isAudioControlEvent(event)) return;
        if (
          event?.type === "keydown"
          && (event.repeat || ["Alt", "Control", "Meta", "Shift"].includes(event.key))
        ) return;
        this.unlock({ userGesture: true });
      };
      document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
      document.addEventListener("touchend", unlock, { capture: true, passive: true });
      document.addEventListener("click", unlock, true);
      document.addEventListener("keydown", unlock, true);
    }

    installResumeListeners() {
      const resume = () => {
        if (document.visibilityState && document.visibilityState !== "visible") return;
        this.resumeMusic();
        this.resumeEffects();
      };
      window.addEventListener?.("pageshow", resume);
      window.addEventListener?.("focus", resume);
      document.addEventListener("visibilitychange", resume);
    }

    isAudioControlEvent(event) {
      return Boolean(event?.target?.closest?.(AUDIO_CONTROL_SELECTOR));
    }

    unlock(options = {}) {
      const isMusicGesture = Boolean(options.userGesture || options.musicGesture);
      if (isMusicGesture) this.pendingMusicGesture = true;
      if (options.userGesture) this.unlockEffects({ userGesture: true });
      if (!this.ready || this.preferences.musicMuted) return Promise.resolve(false);
      if (
        this.musicUnlocked
        && this.currentMusic
        && !this.currentMusic.paused
        && !this.currentMusic.ended
      ) {
        this.unlocked = true;
        this.pendingMusicGesture = false;
        return Promise.resolve(true);
      }
      let supersedingAutoplay = false;
      if (this.unlockPromise) {
        if (!isMusicGesture || this.unlockIsGesture) return this.unlockPromise;
        supersedingAutoplay = true;
        this.musicTransitionId += 1;
        this.unlockPromise = null;
        this.unlockIsGesture = false;
      }

      const attempt = this.setMusicState(this.requestedMusicState, {
        allowLocked: true,
        forceNext: supersedingAutoplay,
        immediate: true,
        returnState: this.requestedMusicReturnState,
        resume: true,
      })
        .then(async started => {
          if (started) {
            this.musicUnlocked = true;
            this.unlocked = true;
            this.pendingMusicGesture = false;
          }
          if (
            started
            && !this.preferences.musicMuted
            && (
              this.requestedMusicState !== this.currentMusicState
              || this.requestedMusicReturnState !== this.currentMusicReturnState
            )
          ) {
            return this.setMusicState(this.requestedMusicState, {
              allowLocked: true,
              immediate: true,
              preserveTemporary: true,
              returnState: this.requestedMusicReturnState,
            });
          }
          return started;
        })
        .finally(() => {
          if (this.unlockPromise === attempt) {
            this.unlockPromise = null;
            this.unlockIsGesture = false;
          }
        });
      this.unlockPromise = attempt;
      this.unlockIsGesture = isMusicGesture;
      return attempt;
    }

    resumeMusic(options = {}) {
      if (!this.ready || this.preferences.musicMuted) return Promise.resolve(false);
      return this.unlock({ resume: true, ...options });
    }

    savePreferences() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
      } catch (error) {
        console.warn("Could not save Crownlands audio preferences", error);
      }
      this.syncSettingsUi();
    }

    setMusicVolume(value) {
      this.preferences.musicVolume = clampVolume(value, this.preferences.musicVolume);
      this.savePreferences();
      this.applyMusicVolume();
    }

    setEffectsVolume(value) {
      this.preferences.effectsVolume = clampVolume(value, this.preferences.effectsVolume);
      this.savePreferences();
      this.applyEffectsVolume();
    }

    setMusicMuted(muted) {
      const nextMuted = Boolean(muted);
      const changed = this.preferences.musicMuted !== nextMuted;
      this.preferences.musicMuted = nextMuted;
      this.savePreferences();
      if (nextMuted) {
        this.pendingMusicGesture = false;
        this.clearPlaylistTransition();
        this.musicTransitionId += 1;
        this.persistentMusic.pause();
        return Promise.resolve(changed);
      }
      this.applyMusicVolume();
      return this.resumeMusic({ musicGesture: true });
    }

    setEffectsMuted(muted) {
      this.preferences.effectsMuted = Boolean(muted);
      this.savePreferences();
      if (this.preferences.effectsMuted) {
        for (const effect of [...this.activeEffects]) effect.stop?.();
        this.activeEffects.clear();
      } else {
        this.resumeEffects();
      }
      this.applyEffectsVolume();
    }

    applyEffectsVolume() {
      const masterVolume = this.preferences.effectsMuted ? 0 : this.preferences.effectsVolume;
      if (this.effectMasterGain?.gain) this.effectMasterGain.gain.value = masterVolume;
      for (const effect of this.activeEffects) {
        if (effect.kind !== "html" || !effect.audio) continue;
        effect.audio.volume = this.preferences.effectsMuted
          ? 0
          : effect.baseVolume * this.preferences.effectsVolume;
      }
    }

    getMusicVolumeFor(asset) {
      if (this.preferences.musicMuted) return 0;
      return clampVolume(asset?.recommended_volume, 1) * this.preferences.musicVolume;
    }

    applyMusicVolume() {
      if (!this.currentMusic) return;
      const asset = this.assets.get(this.currentMusic.dataset.audioId);
      this.currentMusic.volume = this.getMusicVolumeFor(asset);
    }

    normalizeMusicState(state, fallbackState = "world_map") {
      const requestedState = state === "contested" ? "danger" : String(state || "");
      if (this.musicPlaylists.get(requestedState)?.length) return requestedState;
      if (this.musicPlaylists.get(fallbackState)?.length) return fallbackState;
      if (this.musicPlaylists.get("main_menu")?.length) return "main_menu";
      return requestedState || fallbackState;
    }

    chooseMusicAsset(state) {
      const playlist = this.musicPlaylists.get(state) || [];
      if (!playlist.length) return null;
      const lastId = this.lastMusicAssetByState.get(state);
      const candidates = playlist.length > 1
        ? playlist.filter(asset => asset.id !== lastId)
        : playlist;
      return candidates[Math.floor(Math.random() * candidates.length)] || playlist[0];
    }

    clearPlaylistTransition() {
      if (!this.playlistTransitionTimer) return;
      window.clearTimeout(this.playlistTransitionTimer);
      this.playlistTransitionTimer = 0;
    }

    schedulePlaylistTransition(audio, state, playlistSize, fadeMs) {
      this.clearPlaylistTransition();
      if (state === "victory" || playlistSize <= 1) return;
      const schedule = () => {
        if (this.currentMusic !== audio || !Number.isFinite(audio.duration)) return;
        const delayMs = Math.floor(audio.duration * 1000 - fadeMs);
        if (delayMs <= 0) return;
        this.playlistTransitionTimer = window.setTimeout(() => {
          this.playlistTransitionTimer = 0;
          if (this.currentMusic !== audio || this.currentMusicState !== state) return;
          this.setMusicState(state, {
            preserveTemporary: true,
            forceNext: true,
            fadeMs,
          });
        }, delayMs);
      };
      if (audio.readyState >= 1) schedule();
      else audio.addEventListener("loadedmetadata", schedule, { once: true });
    }

    async setMusicState(state, options = {}) {
      if (!options.preserveTemporary) this.temporaryMusicId += 1;
      const normalizedState = this.normalizeMusicState(state);
      const hasReturnState = Object.prototype.hasOwnProperty.call(options, "returnState");
      const returnState = hasReturnState && options.returnState
        ? this.normalizeMusicState(options.returnState)
        : "";
      this.requestedMusicState = normalizedState;
      this.requestedMusicReturnState = returnState;
      if (
        (!this.musicUnlocked && !options.allowLocked)
        || !this.ready
        || this.preferences.musicMuted
      ) return false;
      const playlist = this.musicPlaylists.get(normalizedState) || [];
      if (!playlist.length) return false;
      if (
        !options.forceNext
        && this.currentMusicState === normalizedState
        && this.currentMusic
        && !this.currentMusic.ended
        && !this.currentMusic.error
      ) {
        const resumeTransitionId = this.musicTransitionId;
        if (options.returnState !== undefined) this.currentMusicReturnState = returnState;
        this.applyMusicVolume();
        if (this.currentMusic.paused) {
          try {
            await Promise.resolve(this.currentMusic.play());
            if (resumeTransitionId !== this.musicTransitionId) return false;
            this.lastPlaybackError = "";
            this.musicUnlocked = true;
            this.unlocked = true;
          } catch (error) {
            if (resumeTransitionId !== this.musicTransitionId) return false;
            this.lastPlaybackError = String(error?.name || "PlaybackError");
            if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
              const currentAsset = this.assets.get(this.currentMusic.dataset.audioId);
              const nextSourceIndex = this.currentMusicSourceIndex + 1;
              if (currentAsset && nextSourceIndex < (currentAsset.urls || []).length) {
                return this.setMusicState(normalizedState, {
                  ...options,
                  _asset: currentAsset,
                  allowLocked: true,
                  forceNext: true,
                  preserveTemporary: true,
                  returnState: this.currentMusicReturnState,
                  sourceStartIndex: nextSourceIndex,
                });
              }
              console.warn(`Could not resume music: ${currentAsset?.id || normalizedState}`, error);
            }
            this.musicUnlocked = false;
            this.unlocked = false;
            return false;
          }
        }
        return true;
      }
      const asset = options._asset || this.chooseMusicAsset(normalizedState);
      if (!asset) return false;

      this.clearPlaylistTransition();
      const transitionId = ++this.musicTransitionId;
      const previous = this.currentMusic;
      const fadeMs = Math.max(800, Number(options.fadeMs) || 1000);
      let next = null;
      let playbackError = null;
      let selectedSourceIndex = -1;
      const sourceUrls = asset.urls || [asset.url];
      const sourceStartIndex = Math.max(0, Number(options.sourceStartIndex) || 0);
      for (let sourceIndex = sourceStartIndex; sourceIndex < sourceUrls.length; sourceIndex += 1) {
        const sourceUrl = sourceUrls[sourceIndex];
        const candidate = this.persistentMusic;
        candidate.pause();
        candidate.onerror = null;
        candidate.onended = null;
        candidate.src = sourceUrl;
        candidate.load?.();
        candidate.preload = "auto";
        candidate.loop = playlist.length === 1 && asset.loop === true;
        candidate.volume = this.getMusicVolumeFor(asset);
        try {
          await Promise.resolve(candidate.play());
          next = candidate;
          selectedSourceIndex = sourceIndex;
          asset.url = sourceUrl;
          this.preferredAudioExtension = getAudioExtension(sourceUrl) || "mp3";
          break;
        } catch (error) {
          playbackError = error;
          if (transitionId !== this.musicTransitionId) return false;
          if (error?.name === "NotAllowedError" || error?.name === "AbortError") break;
        }
      }
      if (!next) {
        if (transitionId !== this.musicTransitionId) return false;
        this.lastPlaybackError = String(playbackError?.name || "PlaybackError");
        this.musicUnlocked = false;
        this.unlocked = false;
        if (playbackError?.name !== "NotAllowedError" && playbackError?.name !== "AbortError") {
          console.warn(`Could not play music: ${asset.id}`, playbackError);
        }
        return false;
      }
      if (transitionId !== this.musicTransitionId) {
        if (this.preferences.musicMuted) {
          next.pause();
        }
        return false;
      }
      this.lastPlaybackError = "";
      this.musicUnlocked = true;
      this.unlocked = true;

      next.dataset.audioId = asset.id;
      this.currentMusic = next;
      this.currentMusicState = normalizedState;
      this.currentMusicReturnState = returnState;
      this.currentMusicSourceIndex = selectedSourceIndex;
      this.lastMusicAssetByState.set(normalizedState, asset.id);
      const handleEnded = () => {
        if (next.loop || this.currentMusic !== next || this.musicTransitionId !== transitionId) return;
        const nextState = this.currentMusicReturnState
          || (normalizedState === "victory" ? "world_map" : "");
        if (nextState) {
          this.setMusicState(nextState, { preserveTemporary: true });
          return;
        }
        this.setMusicState(normalizedState, {
          preserveTemporary: true,
          forceNext: true,
          fadeMs,
        });
      };
      next.onended = handleEnded;
      let mediaErrorHandled = false;
      next.onerror = () => {
        if (
          mediaErrorHandled
          || this.currentMusic !== next
          || this.musicTransitionId !== transitionId
        ) return;
        mediaErrorHandled = true;
        const mediaErrorCode = Number(next.error?.code) || 0;
        this.lastPlaybackError = mediaErrorCode ? `MediaError:${mediaErrorCode}` : "MediaError";
        const nextSourceIndex = selectedSourceIndex + 1;
        if (!this.preferences.musicMuted && nextSourceIndex < sourceUrls.length) {
          this.setMusicState(normalizedState, {
            _asset: asset,
            allowLocked: true,
            forceNext: true,
            immediate: true,
            preserveTemporary: true,
            returnState,
            sourceStartIndex: nextSourceIndex,
          });
          return;
        }
        this.musicUnlocked = false;
        this.unlocked = false;
      };
      this.schedulePlaylistTransition(next, normalizedState, playlist.length, fadeMs);
      next.volume = this.getMusicVolumeFor(asset);
      if (previous && previous !== next) {
        previous.pause();
        previous.currentTime = 0;
      }
      return true;
    }

    pulseMusic(state, durationMs = 3500, fallbackState = "world_map") {
      const pulseId = ++this.temporaryMusicId;
      this.setMusicState(state, {
        preserveTemporary: true,
        returnState: fallbackState,
      });
      window.setTimeout(() => {
        if (pulseId !== this.temporaryMusicId) return;
        this.setMusicState(fallbackState, { preserveTemporary: true });
      }, Math.max(1000, Number(durationMs) || 3500));
    }

    ensureEffectContext() {
      if (this.effectContext || this.effectsEngine === "htmlaudio") return this.effectContext;
      const EffectAudioContext = window.AudioContext || window.webkitAudioContext;
      if (!EffectAudioContext) {
        this.effectsEngine = "htmlaudio";
        return null;
      }
      try {
        const context = new EffectAudioContext();
        const masterGain = context.createGain();
        masterGain.connect(context.destination);
        context.onstatechange = () => {
          this.effectsUnlocked = context.state === "running";
          if (this.effectsUnlocked) {
            this.effectsAuthorized = true;
            this.lastEffectsError = "";
          }
        };
        this.effectContext = context;
        this.effectMasterGain = masterGain;
        this.applyEffectsVolume();
        if (context.state === "running") {
          this.effectsUnlocked = true;
          this.effectsAuthorized = true;
        }
        return context;
      } catch (error) {
        this.effectsEngine = "htmlaudio";
        this.lastEffectsError = String(error?.name || "AudioContextError");
        return null;
      }
    }

    unlockEffects(options = {}) {
      const context = this.effectContext || (options.userGesture ? this.ensureEffectContext() : null);
      if (this.effectsEngine === "htmlaudio") {
        if (options.userGesture) {
          this.effectsAuthorized = true;
          this.effectsUnlocked = true;
          this.lastEffectsError = "";
        }
        return Promise.resolve(this.effectsUnlocked);
      }
      if (!context) return Promise.resolve(false);
      if (context.state === "running") {
        this.effectsAuthorized = true;
        this.effectsUnlocked = true;
        this.lastEffectsError = "";
        return Promise.resolve(true);
      }
      if (this.effectUnlockPromise) return this.effectUnlockPromise;
      if (!options.userGesture && !this.effectsAuthorized) return Promise.resolve(false);

      let resumeResult;
      try {
        resumeResult = context.resume();
      } catch (error) {
        this.effectsUnlocked = false;
        this.lastEffectsError = String(error?.name || "AudioContextResumeError");
        return Promise.resolve(false);
      }
      const attempt = Promise.resolve(resumeResult)
        .then(() => {
          const running = context.state === "running";
          this.effectsUnlocked = running;
          if (running) {
            this.effectsAuthorized = true;
            this.lastEffectsError = "";
          } else {
            this.lastEffectsError = `AudioContext:${context.state || "suspended"}`;
          }
          return running;
        })
        .catch(error => {
          this.effectsUnlocked = false;
          this.lastEffectsError = String(error?.name || "AudioContextResumeError");
          return false;
        })
        .finally(() => {
          if (this.effectUnlockPromise === attempt) this.effectUnlockPromise = null;
        });
      this.effectUnlockPromise = attempt;
      return attempt;
    }

    resumeEffects() {
      return this.unlockEffects({ userGesture: false });
    }

    getEffectsReadyPromise() {
      if (this.effectsEngine === "htmlaudio") return Promise.resolve(this.effectsUnlocked);
      if (this.effectContext?.state === "running") return Promise.resolve(true);
      if (this.effectUnlockPromise) return this.effectUnlockPromise;
      if (this.effectsAuthorized) return this.resumeEffects();
      return Promise.resolve(false);
    }

    decodeEffectAudio(arrayBuffer) {
      const context = this.effectContext;
      if (!context?.decodeAudioData) return Promise.reject(new Error("Web Audio decoding is unavailable"));
      return new Promise((resolve, reject) => {
        let settled = false;
        const succeed = buffer => {
          if (settled) return;
          settled = true;
          resolve(buffer);
        };
        const fail = error => {
          if (settled) return;
          settled = true;
          reject(error || new Error("Could not decode audio"));
        };
        try {
          const result = context.decodeAudioData(arrayBuffer, succeed, fail);
          if (result?.then) result.then(succeed, fail);
        } catch (error) {
          fail(error);
        }
      });
    }

    loadEffectBuffer(asset) {
      const cached = this.effectBufferPromises.get(asset.id);
      if (cached) return cached;
      const sourceUrls = asset.urls || [asset.url];
      const loadPromise = (async () => {
        let lastError = null;
        for (let sourceIndex = 0; sourceIndex < sourceUrls.length; sourceIndex += 1) {
          const sourceUrl = sourceUrls[sourceIndex];
          try {
            const response = await fetch(sourceUrl, { cache: "force-cache" });
            if (!response.ok) throw new Error(`Audio request failed (${response.status})`);
            const buffer = await this.decodeEffectAudio(await response.arrayBuffer());
            return { buffer, sourceIndex, sourceUrl };
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error(`Could not load effect: ${asset.id}`);
      })();
      this.effectBufferPromises.set(asset.id, loadPromise);
      loadPromise.catch(() => {
        if (this.effectBufferPromises.get(asset.id) === loadPromise) {
          this.effectBufferPromises.delete(asset.id);
        }
      });
      return loadPromise;
    }

    async playWebAudioEffect(asset, options) {
      try {
        if (!await this.getEffectsReadyPromise()) return false;
        if (this.preferences.effectsMuted || this.effectContext?.state !== "running") return false;
        const decoded = await this.loadEffectBuffer(asset);
        if (this.preferences.effectsMuted || this.effectContext?.state !== "running") return false;

        const source = this.effectContext.createBufferSource();
        const gainNode = this.effectContext.createGain();
        const baseVolume = clampVolume(asset.recommended_volume, 1)
          * clampVolume(options.volumeScale, 1);
        source.buffer = decoded.buffer;
        source.loop = asset.loop === true;
        gainNode.gain.value = baseVolume;
        source.connect(gainNode);
        gainNode.connect(this.effectMasterGain);
        let released = false;
        const record = {
          audioId: asset.id,
          gainNode,
          kind: "webaudio",
          source,
          stop: () => {
            if (released) return;
            try {
              source.stop();
            } catch (error) {
              release();
            }
          },
        };
        const release = () => {
          if (released) return;
          released = true;
          this.activeEffects.delete(record);
          source.disconnect?.();
          gainNode.disconnect?.();
        };
        source.onended = release;
        this.activeEffects.add(record);
        try {
          source.start(0);
        } catch (error) {
          release();
          throw error;
        }
        this.preferredAudioExtension = getAudioExtension(decoded.sourceUrl) || this.preferredAudioExtension;
        this.lastEffectsError = "";
        this.effectsUnlocked = true;
        this.effectsAuthorized = true;
        return true;
      } catch (error) {
        this.lastEffectsError = String(error?.name || error?.message || "EffectPlaybackError");
        console.warn(`Could not play effect: ${asset.id}`, error);
        return false;
      }
    }

    playEffect(id, options = {}) {
      if (!this.ready || this.preferences.effectsMuted) return false;
      const asset = this.assets.get(id);
      if (!asset || asset.category === "music") return false;
      const canQueue = this.effectsEngine === "htmlaudio"
        ? this.effectsUnlocked
        : Boolean(
          this.effectsUnlocked
          || this.effectUnlockPromise
          || (this.effectsAuthorized && this.effectContext)
        );
      if (!canQueue) return false;
      if (options.delegated !== true) {
        this.suppressDelegatedUiSound = true;
        Promise.resolve().then(() => {
          this.suppressDelegatedUiSound = false;
        });
      }

      const now = performance.now();
      const cooldownMs = Math.max(0, Number(options.cooldownMs) || (id.startsWith("sword_clash_") ? 80 : 0));
      if (this.lastEffectAt.has(id) && now - this.lastEffectAt.get(id) < cooldownMs) return false;

      const maxActive = Math.max(1, Number(options.maxActive) || 12);
      const pendingEffectCount = [...this.pendingEffectCounts.values()].reduce((total, count) => total + count, 0);
      const sameEffectCount = [...this.activeEffects].filter(effect => effect.audioId === id).length
        + (this.pendingEffectCounts.get(id) || 0);
      const maxSameEffect = Math.max(1, Number(options.maxSameEffect) || (id.startsWith("sword_clash_") ? 2 : 3));
      if (this.activeEffects.size + pendingEffectCount >= maxActive || sameEffectCount >= maxSameEffect) return false;

      this.lastEffectAt.set(id, now);
      if (this.effectsEngine === "webaudio") {
        this.pendingEffectCounts.set(id, (this.pendingEffectCounts.get(id) || 0) + 1);
        this.playWebAudioEffect(asset, options).finally(() => {
          const remaining = Math.max(0, (this.pendingEffectCounts.get(id) || 1) - 1);
          if (remaining) this.pendingEffectCounts.set(id, remaining);
          else this.pendingEffectCounts.delete(id);
        });
      } else {
        this.playEffectSource(asset, options, 0);
      }
      return true;
    }

    playEffectSource(asset, options, sourceIndex) {
      const sourceUrls = asset.urls || [asset.url];
      const sourceUrl = sourceUrls[sourceIndex];
      if (!sourceUrl || this.preferences.effectsMuted) return;

      const audio = new Audio(sourceUrl);
      audio.dataset.audioId = asset.id;
      audio.preload = "auto";
      audio.loop = asset.loop === true;
      const baseVolume = clampVolume(asset.recommended_volume, 1)
        * clampVolume(options.volumeScale, 1);
      audio.volume = baseVolume * this.preferences.effectsVolume;
      let released = false;
      let fallbackStarted = false;
      const record = {
        audio,
        audioId: asset.id,
        baseVolume,
        kind: "html",
        stop: () => {
          audio.pause();
          audio.currentTime = 0;
          release();
        },
      };
      const release = () => {
        if (released) return;
        released = true;
        this.activeEffects.delete(record);
      };
      const fallback = error => {
        if (fallbackStarted) return;
        fallbackStarted = true;
        release();
        audio.pause();
        const nextSourceIndex = sourceIndex + 1;
        if (
          error?.name !== "NotAllowedError"
          && error?.name !== "AbortError"
          && nextSourceIndex < sourceUrls.length
          && !this.preferences.effectsMuted
        ) {
          this.playEffectSource(asset, options, nextSourceIndex);
          return;
        }
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          console.warn(`Could not play effect: ${asset.id}`, error);
        } else {
          this.effectsUnlocked = false;
          this.effectsAuthorized = false;
        }
        this.lastEffectsError = String(error?.name || "EffectPlaybackError");
      };
      audio.addEventListener("ended", release, { once: true });
      audio.addEventListener("error", () => {
        const error = new Error(`Media error ${Number(audio.error?.code) || "unknown"}`);
        error.name = "MediaError";
        fallback(error);
      }, { once: true });
      this.activeEffects.add(record);
      let playResult;
      try {
        playResult = audio.play();
      } catch (error) {
        fallback(error);
        return;
      }
      Promise.resolve(playResult)
        .then(() => {
          this.preferredAudioExtension = getAudioExtension(sourceUrl) || this.preferredAudioExtension;
          this.effectsUnlocked = true;
          this.effectsAuthorized = true;
          this.lastEffectsError = "";
        })
        .catch(fallback);
    }

    playSwordClash() {
      if (!SWORD_CLASHES.length) return false;
      let index = Math.floor(Math.random() * SWORD_CLASHES.length);
      if (SWORD_CLASHES.length > 1 && index === this.lastSwordIndex) {
        index = (index + 1 + Math.floor(Math.random() * (SWORD_CLASHES.length - 1))) % SWORD_CLASHES.length;
      }
      this.lastSwordIndex = index;
      return this.playEffect(SWORD_CLASHES[index], {
        cooldownMs: 80,
        maxActive: 10,
        maxSameEffect: 2,
      });
    }

    installUiSounds() {
      document.addEventListener("click", event => {
        if (this.isAudioControlEvent(event)) return;
        const button = event.target.closest?.("button, [role='button']");
        if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
        if (this.suppressDelegatedUiSound) return;
        const explicitEffect = String(button.getAttribute("data-audio-effect") || "").trim();
        if (explicitEffect) {
          if (explicitEffect.toLowerCase() !== "none") {
            this.playEffect(explicitEffect, { cooldownMs: 25, delegated: true });
          }
          return;
        }
        const id = String(button.id || "");
        const label = String(button.getAttribute("aria-label") || button.textContent || "").toLowerCase();
        if (id === "profileCloseBtn" || id === "closeModalBtn" || label.includes("close") || label === "cancel") {
          this.playEffect("menu_close", { cooldownMs: 40, delegated: true });
        } else if (
          id === "profileBtn"
          || id.endsWith("TabBtn")
          || id.endsWith("ListBtn")
          || id.endsWith("RewardBtn")
          || label.includes("open ")
        ) {
          this.playEffect("menu_open", { cooldownMs: 40, delegated: true });
        } else {
          this.playEffect("button_click", { cooldownMs: 25, delegated: true });
        }
      });
    }

    bindSettingsUi() {
      const bind = () => {
        const musicVolume = document.getElementById("musicVolume");
        const effectsVolume = document.getElementById("effectsVolume");
        const musicMute = document.getElementById("musicMute");
        const effectsMute = document.getElementById("effectsMute");
        const loginMusicMute = document.getElementById("loginMusicMuteBtn");
        if (musicVolume && !musicVolume.dataset.audioBound) {
          musicVolume.dataset.audioBound = "true";
          musicVolume.addEventListener("input", () => this.setMusicVolume(Number(musicVolume.value) / 100));
        }
        if (effectsVolume && !effectsVolume.dataset.audioBound) {
          effectsVolume.dataset.audioBound = "true";
          effectsVolume.addEventListener("input", () => this.setEffectsVolume(Number(effectsVolume.value) / 100));
        }
        if (musicMute && !musicMute.dataset.audioBound) {
          musicMute.dataset.audioBound = "true";
          musicMute.addEventListener("change", () => this.setMusicMuted(musicMute.checked));
        }
        if (effectsMute && !effectsMute.dataset.audioBound) {
          effectsMute.dataset.audioBound = "true";
          effectsMute.addEventListener("change", () => this.setEffectsMuted(effectsMute.checked));
        }
        if (loginMusicMute && !loginMusicMute.dataset.audioBound) {
          loginMusicMute.dataset.audioBound = "true";
          loginMusicMute.addEventListener("click", () => {
            this.setMusicMuted(!this.preferences.musicMuted);
          });
        }
        this.syncSettingsUi();
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
      else bind();
    }

    syncSettingsUi() {
      const values = {
        musicVolume: Math.round(this.preferences.musicVolume * 100),
        effectsVolume: Math.round(this.preferences.effectsVolume * 100),
      };
      for (const [id, value] of Object.entries(values)) {
        const input = document.getElementById(id);
        const output = document.getElementById(`${id}Value`);
        if (input && document.activeElement !== input) input.value = String(value);
        if (output) output.textContent = `${value}%`;
      }
      const musicMute = document.getElementById("musicMute");
      const effectsMute = document.getElementById("effectsMute");
      if (musicMute) musicMute.checked = this.preferences.musicMuted;
      if (effectsMute) effectsMute.checked = this.preferences.effectsMuted;
      const loginMusicMute = document.getElementById("loginMusicMuteBtn");
      if (loginMusicMute) {
        const label = this.preferences.musicMuted ? "Unmute music" : "Mute music";
        loginMusicMute.setAttribute("aria-pressed", String(this.preferences.musicMuted));
        loginMusicMute.setAttribute("aria-label", label);
        loginMusicMute.setAttribute("title", label);
        loginMusicMute.dataset.musicMuted = String(this.preferences.musicMuted);
        const icon = loginMusicMute.querySelector?.("[data-music-icon]");
        if (icon) icon.textContent = this.preferences.musicMuted ? "\u{1F507}" : "\u{1F50A}";
        const visibleLabel = loginMusicMute.querySelector?.("[data-music-label]");
        if (visibleLabel) visibleLabel.textContent = label;
      }
    }

    getDebugState() {
      const music = this.currentMusic;
      return {
        ready: this.ready,
        unlocked: this.unlocked,
        musicUnlocked: this.musicUnlocked,
        effectsUnlocked: this.effectsUnlocked,
        unlockInFlight: Boolean(this.unlockPromise),
        unlockMode: this.unlockPromise ? (this.unlockIsGesture ? "gesture" : "automatic") : "idle",
        pendingMusicGesture: this.pendingMusicGesture,
        effectsUnlockInFlight: Boolean(this.effectUnlockPromise),
        effectsAuthorized: this.effectsAuthorized,
        effectsEngine: this.effectsEngine,
        effectsContextState: this.effectContext?.state || (this.effectsEngine === "htmlaudio" ? "unavailable" : "not-created"),
        activeEffectCount: this.activeEffects.size,
        bufferedEffectCount: this.effectBufferPromises.size,
        musicMuted: this.preferences.musicMuted,
        effectsMuted: this.preferences.effectsMuted,
        requestedMusicState: this.requestedMusicState,
        requestedReturnState: this.requestedMusicReturnState,
        currentMusicState: this.currentMusicState,
        returnState: this.currentMusicReturnState,
        currentAssetId: music?.dataset?.audioId || "",
        currentSource: music?.currentSrc || music?.src || "",
        currentSourceIndex: this.currentMusicSourceIndex,
        paused: music ? Boolean(music.paused) : true,
        currentTime: Number.isFinite(music?.currentTime) ? music.currentTime : 0,
        readyState: Number(music?.readyState) || 0,
        networkState: Number(music?.networkState) || 0,
        preferredAudioExtension: this.preferredAudioExtension,
        lastPlaybackError: this.lastPlaybackError,
        lastEffectsError: this.lastEffectsError,
      };
    }
  }

  window.CrownlandsAudio = new AudioManager();
})();
