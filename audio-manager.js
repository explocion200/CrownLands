(function () {
  "use strict";

  const STORAGE_KEY = "crownlands.audio.preferences.v1";
  const MANIFEST_URL = "audio/manifest.json";
  const MUSIC_BY_STATE = Object.freeze({
    main_menu: "main_menu_loop",
    world_map: "world_map_loop",
    battle: "battle_loop",
    danger: "danger_contested_loop",
    contested: "danger_contested_loop",
    victory: "victory_fanfare",
  });
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
      this.unlocked = false;
      this.ready = false;
      this.requestedMusicState = "main_menu";
      this.currentMusicState = "";
      this.currentMusic = null;
      this.lastPlaybackError = "";
      this.preferredAudioExtension = "mp3";
      this.musicTransitionId = 0;
      this.temporaryMusicId = 0;
      this.lastEffectAt = new Map();
      this.activeEffects = new Set();
      this.lastSwordIndex = -1;
      this.manifestPromise = this.loadManifest();
      this.installUnlockListeners();
      this.installUiSounds();
      this.bindSoundButtons();
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
            .map(relativePath => `audio/${String(relativePath).replace(/^\/+/, "")}`)
            .filter((url, index, entries) => entries.indexOf(url) === index);
          this.assets.set(asset.id, {
            ...asset,
            url: urls[0],
            urls,
          });
        }
        this.ready = this.assets.size > 0;
        this.updateSoundControls(this.ready ? "ready" : "unavailable");
        this.syncSettingsUi();
        return this.ready;
      } catch (error) {
        console.warn("Crownlands audio is unavailable", error);
        this.updateSoundControls("unavailable");
        return false;
      }
    }

    installUnlockListeners() {
      let unlocking = false;
      const removeUnlockListeners = () => {
        document.removeEventListener("pointerdown", unlock, true);
        document.removeEventListener("touchend", unlock, true);
        document.removeEventListener("keydown", unlock, true);
      };
      const unlock = event => {
        if (event?.target?.closest?.("[data-audio-enable]")) return;
        if (unlocking) return;
        unlocking = true;
        this.unlock()
          .then(success => {
            if (success) {
              removeUnlockListeners();
              this.updateSoundControls("playing");
            }
          })
          .finally(() => {
            unlocking = false;
          });
      };
      document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
      document.addEventListener("touchend", unlock, { capture: true, passive: true });
      document.addEventListener("keydown", unlock, true);
    }

    async unlock() {
      if (this.unlocked) return true;
      if (!this.ready) return false;
      this.unlocked = true;
      const started = await this.setMusicState(this.requestedMusicState, { immediate: true });
      if (!started) this.unlocked = false;
      return started;
    }

    async enableSound() {
      if (!this.ready) {
        this.updateSoundControls("loading");
        this.manifestPromise = this.loadManifest();
        return false;
      }
      if (this.preferences.musicMuted) this.preferences.musicMuted = false;
      if (this.preferences.effectsMuted) this.preferences.effectsMuted = false;
      if (this.preferences.musicVolume <= 0) this.preferences.musicVolume = DEFAULT_PREFERENCES.musicVolume;
      if (this.preferences.effectsVolume <= 0) this.preferences.effectsVolume = DEFAULT_PREFERENCES.effectsVolume;
      this.savePreferences();

      if (!this.currentMusic || this.currentMusic.paused) this.unlocked = false;
      const started = await this.unlock();
      if (!started) {
        this.updateSoundControls(this.lastPlaybackError === "NotAllowedError" ? "blocked" : "incompatible");
        return false;
      }
      this.playEffect("button_click", { cooldownMs: 0 });
      this.updateSoundControls("playing");
      return true;
    }

    bindSoundButtons() {
      const bind = () => {
        for (const id of ["setupAudioBtn", "testAudioBtn"]) {
          const button = document.getElementById(id);
          if (!button || button.dataset.audioBound) continue;
          button.dataset.audioBound = "true";
          button.addEventListener("click", async () => {
            this.updateSoundControls("starting");
            await this.enableSound();
          });
        }
        this.updateSoundControls(this.ready ? (this.unlocked ? "playing" : "ready") : "loading");
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
      else bind();
    }

    updateSoundControls(state) {
      const states = {
        loading: {
          label: "Loading Sound...",
          message: "Loading audio files...",
          disabled: true,
        },
        ready: {
          label: "Enable Sound",
          message: "Tap once to start music and effects.",
          disabled: false,
        },
        starting: {
          label: "Starting Sound...",
          message: "Requesting browser audio permission...",
          disabled: true,
        },
        playing: {
          label: "Sound On \u2713",
          message: "Music and effects are enabled.",
          disabled: false,
        },
        blocked: {
          label: "Try Sound Again",
          message: "Your browser blocked playback. Tap again to retry.",
          disabled: false,
        },
        incompatible: {
          label: "Sound Unavailable",
          message: "This browser could not play the audio format. Refresh after the next game update.",
          disabled: false,
        },
        unavailable: {
          label: "Retry Sound",
          message: "Audio files did not load. Check the connection and retry.",
          disabled: false,
        },
      };
      const status = states[state] || states.ready;
      for (const id of ["setupAudioBtn", "testAudioBtn"]) {
        const button = document.getElementById(id);
        if (!button) continue;
        button.textContent = status.label;
        button.disabled = status.disabled;
        button.dataset.audioState = state;
      }
      for (const id of ["setupAudioStatus", "audioStatusText"]) {
        const output = document.getElementById(id);
        if (output) output.textContent = status.message;
      }
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

    async setMusicState(state, options = {}) {
      if (!options.preserveTemporary) this.temporaryMusicId += 1;
      const normalizedState = MUSIC_BY_STATE[state] ? state : "world_map";
      this.requestedMusicState = normalizedState;
      if (!this.unlocked || !this.ready) return false;
      const assetId = MUSIC_BY_STATE[normalizedState];
      const asset = this.assets.get(assetId);
      if (!asset || asset.category !== "music") return false;
      if (this.currentMusicState === normalizedState && this.currentMusic && !this.currentMusic.ended) {
        this.applyMusicVolume();
        return true;
      }

      const transitionId = ++this.musicTransitionId;
      const previous = this.currentMusic;
      let next = null;
      let playbackError = null;
      for (const sourceUrl of asset.urls || [asset.url]) {
        const candidate = new Audio(sourceUrl);
        candidate.dataset.audioId = asset.id;
        candidate.preload = "auto";
        candidate.loop = asset.loop === true;
        candidate.volume = options.immediate ? this.getMusicVolumeFor(asset) : 0;
        candidate.addEventListener("ended", () => {
          if (asset.loop === true || this.currentMusic !== candidate) return;
          this.setMusicState("world_map");
        });
        try {
          await candidate.play();
          next = candidate;
          asset.url = sourceUrl;
          this.preferredAudioExtension = sourceUrl.split(".").pop()?.toLowerCase() || "mp3";
          break;
        } catch (error) {
          playbackError = error;
        }
      }
      if (!next) {
        const error = playbackError;
        this.lastPlaybackError = "";
        this.lastPlaybackError = String(error?.name || "PlaybackError");
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          console.warn(`Could not play music: ${asset.id}`, error);
        }
        return false;
      }
      this.lastPlaybackError = "";

      this.currentMusic = next;
      this.currentMusicState = normalizedState;
      if (options.immediate) {
        if (previous) {
          previous.pause();
          previous.currentTime = 0;
        }
        return true;
      }

      const duration = Math.max(800, Number(options.fadeMs) || 1000);
      const startedAt = performance.now();
      const previousAsset = previous ? this.assets.get(previous.dataset.audioId) : null;
      const fade = now => {
        if (transitionId !== this.musicTransitionId) return;
        const progress = Math.min(1, (now - startedAt) / duration);
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
        if (button.matches?.("[data-audio-enable]")) return;
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
