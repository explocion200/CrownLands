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
      this.ready = false;
      this.requestedMusicState = "main_menu";
      this.currentMusicState = "";
      this.currentMusic = null;
      this.lastPlaybackError = "";
      this.preferredAudioExtension = "mp3";
      this.musicTransitionId = 0;
      this.playlistTransitionTimer = 0;
      this.temporaryMusicId = 0;
      this.lastEffectAt = new Map();
      this.activeEffects = new Set();
      this.lastSwordIndex = -1;
      this.manifestPromise = this.loadManifest();
      this.installUnlockListeners();
      this.installUiSounds();
      this.bindSettingsUi();
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
        if (this.ready) this.unlock();
        return this.ready;
      } catch (error) {
        console.warn("Crownlands audio is unavailable", error);
        return false;
      }
    }

    installUnlockListeners() {
      const removeUnlockListeners = () => {
        document.removeEventListener("pointerdown", unlock, true);
        document.removeEventListener("touchend", unlock, true);
        document.removeEventListener("click", unlock, true);
        document.removeEventListener("keydown", unlock, true);
      };
      const unlock = () => {
        this.unlock()
          .then(success => {
            if (success) removeUnlockListeners();
          });
      };
      document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
      document.addEventListener("touchend", unlock, { capture: true, passive: true });
      document.addEventListener("click", unlock, true);
      document.addEventListener("keydown", unlock, true);
    }

    async unlock() {
      if (this.unlocked) return true;
      if (!this.ready) return false;
      const started = await this.setMusicState(this.requestedMusicState, {
        allowLocked: true,
        immediate: true,
      });
      if (started) this.unlocked = true;
      return started;
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
    }

    setMusicMuted(muted) {
      this.preferences.musicMuted = Boolean(muted);
      this.savePreferences();
      this.applyMusicVolume();
    }

    setEffectsMuted(muted) {
      this.preferences.effectsMuted = Boolean(muted);
      this.savePreferences();
      if (this.preferences.effectsMuted) {
        for (const audio of this.activeEffects) {
          audio.pause();
          audio.currentTime = 0;
        }
        this.activeEffects.clear();
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
      const requestedState = state === "contested" ? "danger" : state;
      const normalizedState = this.musicPlaylists.get(requestedState)?.length ? requestedState : "world_map";
      this.requestedMusicState = normalizedState;
      if ((!this.unlocked && !options.allowLocked) || !this.ready) return false;
      const playlist = this.musicPlaylists.get(normalizedState) || [];
      if (!playlist.length) return false;
      if (
        !options.forceNext
        && this.currentMusicState === normalizedState
        && this.currentMusic
        && !this.currentMusic.ended
      ) {
        this.applyMusicVolume();
        return true;
      }
      const asset = this.chooseMusicAsset(normalizedState);
      if (!asset) return false;

      this.clearPlaylistTransition();
      const transitionId = ++this.musicTransitionId;
      const previous = this.currentMusic;
      const fadeMs = Math.max(800, Number(options.fadeMs) || 1000);
      let next = null;
      let playbackError = null;
      for (const sourceUrl of asset.urls || [asset.url]) {
        const candidate = new Audio(sourceUrl);
        candidate.dataset.audioId = asset.id;
        candidate.preload = "auto";
        candidate.loop = playlist.length === 1 && asset.loop === true;
        candidate.volume = options.immediate ? this.getMusicVolumeFor(asset) : 0;
        candidate.addEventListener("ended", () => {
          if (candidate.loop || this.currentMusic !== candidate) return;
          if (normalizedState === "victory") {
            this.setMusicState("world_map");
            return;
          }
          this.setMusicState(normalizedState, {
            preserveTemporary: true,
            forceNext: true,
            fadeMs,
          });
        });
        try {
          await candidate.play();
          next = candidate;
          asset.url = sourceUrl;
          this.preferredAudioExtension = sourceUrl.split(".").pop()?.toLowerCase() || "mp3";
          break;
        } catch (error) {
          playbackError = error;
          if (error?.name === "NotAllowedError" || error?.name === "AbortError") break;
        }
      }
      if (!next) {
        if (transitionId !== this.musicTransitionId) return false;
        const error = playbackError;
        this.lastPlaybackError = "";
        this.lastPlaybackError = String(error?.name || "PlaybackError");
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          console.warn(`Could not play music: ${asset.id}`, error);
        }
        return false;
      }
      if (transitionId !== this.musicTransitionId) {
        next.pause();
        next.currentTime = 0;
        return false;
      }
      this.lastPlaybackError = "";

      this.currentMusic = next;
      this.currentMusicState = normalizedState;
      this.lastMusicAssetByState.set(normalizedState, asset.id);
      this.schedulePlaylistTransition(next, normalizedState, playlist.length, fadeMs);
      if (options.immediate) {
        if (previous) {
          previous.pause();
          previous.currentTime = 0;
        }
        return true;
      }

      const startedAt = performance.now();
      const previousAsset = previous ? this.assets.get(previous.dataset.audioId) : null;
      const fade = now => {
        if (transitionId !== this.musicTransitionId) return;
        const progress = Math.min(1, (now - startedAt) / fadeMs);
        next.volume = this.getMusicVolumeFor(asset) * progress;
        if (previous) previous.volume = this.getMusicVolumeFor(previousAsset) * (1 - progress);
        if (progress < 1) {
          requestAnimationFrame(fade);
          return;
        }
        if (previous) {
          previous.pause();
          previous.currentTime = 0;
        }
      };
      requestAnimationFrame(fade);
      return true;
    }

    pulseMusic(state, durationMs = 3500, fallbackState = "world_map") {
      const pulseId = ++this.temporaryMusicId;
      this.setMusicState(state, { preserveTemporary: true });
      window.setTimeout(() => {
        if (pulseId !== this.temporaryMusicId) return;
        this.setMusicState(fallbackState, { preserveTemporary: true });
      }, Math.max(1000, Number(durationMs) || 3500));
    }

    playEffect(id, options = {}) {
      if (!this.unlocked || !this.ready || this.preferences.effectsMuted) return false;
      const asset = this.assets.get(id);
      if (!asset || asset.category === "music") return false;

      const now = performance.now();
      const cooldownMs = Math.max(0, Number(options.cooldownMs) || (id.startsWith("sword_clash_") ? 80 : 0));
      if (now - (this.lastEffectAt.get(id) || 0) < cooldownMs) return false;

      const maxActive = Math.max(1, Number(options.maxActive) || 12);
      const sameEffectCount = [...this.activeEffects].filter(audio => audio.dataset.audioId === id).length;
      const maxSameEffect = Math.max(1, Number(options.maxSameEffect) || (id.startsWith("sword_clash_") ? 2 : 3));
      if (this.activeEffects.size >= maxActive || sameEffectCount >= maxSameEffect) return false;

      this.lastEffectAt.set(id, now);
      const preferredUrl = asset.urls?.find(url => url.toLowerCase().endsWith(`.${this.preferredAudioExtension}`));
      const audio = new Audio(preferredUrl || asset.url);
      audio.dataset.audioId = id;
      audio.preload = "auto";
      audio.loop = asset.loop === true;
      audio.volume = clampVolume(asset.recommended_volume, 1)
        * this.preferences.effectsVolume
        * clampVolume(options.volumeScale, 1);
      const release = () => this.activeEffects.delete(audio);
      audio.addEventListener("ended", release, { once: true });
      audio.addEventListener("error", release, { once: true });
      this.activeEffects.add(audio);
      audio.play().catch(error => {
        release();
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          console.warn(`Could not play effect: ${id}`, error);
        }
      });
      return true;
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
        const button = event.target.closest?.("button, [role='button']");
        if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
        const id = String(button.id || "");
        const label = String(button.getAttribute("aria-label") || button.textContent || "").toLowerCase();
        if (id === "profileCloseBtn" || id === "closeModalBtn" || label.includes("close") || label === "cancel") {
          this.playEffect("menu_close", { cooldownMs: 40 });
        } else if (
          id === "profileBtn"
          || id.endsWith("TabBtn")
          || id.endsWith("ListBtn")
          || id.endsWith("RewardBtn")
          || label.includes("open ")
        ) {
          this.playEffect("menu_open", { cooldownMs: 40 });
        } else {
          this.playEffect("button_click", { cooldownMs: 25 });
        }
      });
    }

    bindSettingsUi() {
      const bind = () => {
        const musicVolume = document.getElementById("musicVolume");
        const effectsVolume = document.getElementById("effectsVolume");
        const musicMute = document.getElementById("musicMute");
        const effectsMute = document.getElementById("effectsMute");
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
    }
  }

  window.CrownlandsAudio = new AudioManager();
})();
