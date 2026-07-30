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
      this.musicTransitionId = 0;
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
          this.assets.set(asset.id, {
            ...asset,
            url: `audio/${String(asset.ogg).replace(/^\/+/, "")}`,
          });
        }
        this.ready = this.assets.size > 0;
        this.syncSettingsUi();
        return this.ready;
      } catch (error) {
        console.warn("Crownlands audio is unavailable", error);
        return false;
      }
    }

    installUnlockListeners() {
      const unlock = () => {
        this.unlock();
        document.removeEventListener("pointerdown", unlock, true);
        document.removeEventListener("keydown", unlock, true);
      };
      document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
      document.addEventListener("keydown", unlock, true);
    }

    async unlock() {
      if (this.unlocked) return true;
      this.unlocked = true;
      await this.manifestPromise;
      if (this.ready) this.setMusicState(this.requestedMusicState, { immediate: true });
      return this.ready;
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
      const next = new Audio(asset.url);
      next.dataset.audioId = asset.id;
      next.preload = "auto";
      next.loop = asset.loop === true;
      next.volume = options.immediate ? this.getMusicVolumeFor(asset) : 0;
      next.addEventListener("ended", () => {
        if (asset.loop === true || this.currentMusic !== next) return;
        this.setMusicState("world_map");
      });

      try {
        await next.play();
      } catch (error) {
        if (error?.name !== "NotAllowedError" && error?.name !== "AbortError") {
          console.warn(`Could not play music: ${asset.id}`, error);
        }
        return false;
      }

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
      const audio = new Audio(asset.url);
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
