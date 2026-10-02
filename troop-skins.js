/* Eight-direction cosmetic art; positions, intelligence and mission authority remain in game.js. */
(function () {
  "use strict";
  const tokens = new WeakMap();
  let loadState = "idle", loadPromise = null;
  function ensureArt() {
    if (loadPromise) return loadPromise;
    const source = globalThis.CrownlandsCosmetics.item("halloween_troops").assets.atlas;
    loadState = "loading";
    const image = new Image(); image.src = source;
    loadPromise = image.decode().then(() => {
      loadState = image.naturalWidth === 640 && image.naturalHeight === 1280 ? "ready" : "failed";
    }, () => { loadState = "failed"; }).then(() => {
      document.documentElement.dataset.troopArt = loadState;
      return loadState;
    });
    return loadPromise;
  }
  function sprite() {
    void ensureArt();
    const layer = document.createElement("span"), strip = document.createElement("span"), image = document.createElement("img");
    layer.className = "troop-skin-sprite"; layer.setAttribute("aria-hidden", "true"); layer.dataset.skinMotion = "idle";
    strip.className = "troop-skin-frames";
    image.className = "troop-skin-atlas"; image.alt = ""; image.draggable = false; image.decoding = "async";
    image.src = globalThis.CrownlandsCosmetics.item("halloween_troops").assets.atlas;
    strip.append(image); layer.append(strip);
    layer.style.setProperty("--troop-row", "3");
    return layer;
  }
  function apply(token, skin, motion) {
    const existing = tokens.get(token);
    if (skin !== "halloween_troops") {
      if (existing) { motion.forget(existing.layer); existing.layer.remove(); tokens.delete(token); }
      delete token.dataset.troopArt;
      return;
    }
    if (existing) { motion.watch(existing.layer, false, "troops"); return; }
    const layer = sprite();
    token.append(layer); token.dataset.troopArt = "true";
    tokens.set(token, { layer, dx: NaN, dy: NaN, row: 3 });
    motion.watch(layer, false, "troops");
  }
  function face(token, dx, dy, reverse = false) {
    const info = tokens.get(token);
    if (!info || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (reverse) { dx = -dx; dy = -dy; }
    if (info.dx === dx && info.dy === dy) return;
    info.dx = dx; info.dy = dy;
    if (Math.abs(dx) + Math.abs(dy) < .001) return;
    const row = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 10) % 8;
    if (info.row === row) return;
    info.row = row; info.layer.style.setProperty("--troop-row", String(row));
  }
  function preview(element, detail, motion) {
    if (element.querySelector(".troop-skin-sprite")) return;
    const layer = sprite(); element.append(layer);
    if (detail) motion.watch(layer, true, "troops");
  }
  globalThis.CrownlandsTroopSkins = Object.freeze({ apply, face, preview, has: token => tokens.has(token), ready: ensureArt });
})();
