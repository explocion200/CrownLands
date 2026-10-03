/* Decorate existing city markers without replacing their colors, flag renderer or level. */
(function () {
  "use strict";
  let state = "idle", promise;
  function ready() {
    if (promise) return promise;
    state = "loading";
    const image = new Image(); image.src = CrownlandsCosmetics.item("halloween_border").assets.frame;
    promise = image.decode().then(() => { state = image.naturalWidth === 320 && image.naturalHeight === 400 ? "ready" : "failed"; }, () => { state = "failed"; }).then(() => {
      document.documentElement.dataset.flagFrameArt = state; return state;
    });
    return promise;
  }
  function decoration() {
    void ready();
    const wing = "M33 23C24 18 14 9 2 7C6 14 8 23 5 29C12 23 16 25 17 32C22 26 27 28 28 35L35 29ZM37 23C46 18 56 9 68 7C64 14 62 23 65 29C58 23 54 25 53 32C48 26 43 28 42 35L35 29Z";
    const body = "M31 21L30 13L34 17Q35 16 36 17L40 13L39 22Q41 29 37 33L35 39L33 33Q29 29 31 21Z";
    const bat = `<span class="flag-frame-bat"><span class="flag-frame-wing"><svg viewBox="0 0 70 48"><path d="${wing}"/></svg></span><svg viewBox="0 0 70 48"><path d="${body}"/></svg></span>`;
    const layer = document.createElement("span"); layer.className = "flag-frame-decoration"; layer.dataset.skinMotion = "idle"; layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `<img class="flag-frame-art" alt="" draggable="false" decoding="async"><span class="flag-frame-lights"><i></i><i></i><i></i></span><span class="flag-frame-flight">${bat}</span><span class="flag-frame-flight flag-frame-flight-right">${bat}</span>`;
    if (state !== "failed") layer.querySelector("img").src = CrownlandsCosmetics.item("halloween_border").assets.frame;
    return layer;
  }
  function apply(node, skin, motion) {
    const existing = node.querySelector(".city-flag-frame");
    if (skin !== "halloween_border") {
      if (existing) { motion?.forget(existing.querySelector(".flag-frame-decoration")); existing.replaceWith(existing.firstElementChild); }
      return;
    }
    if (existing) { motion.watch(existing.querySelector(".flag-frame-decoration"), false, "border"); return; }
    const center = node.querySelector(".city-owner-column, .foreign-city-shield, .foreign-selected-crest");
    if (!center) return;
    const wrapper = document.createElement("span"); wrapper.className = "city-flag-frame";
    if (center.classList.contains("foreign-selected-crest")) wrapper.classList.add("city-flag-frame-selected");
    const layer = decoration();
    center.replaceWith(wrapper); wrapper.append(center, layer);
    motion.watch(layer, false, "border");
  }
  function preview(host, detail, motion) {
    if (host.dataset.flagFramePreview !== "halloween_border" || host.querySelector(".flag-frame-decoration")) return;
    const layer = decoration(); host.append(layer);
    if (detail) motion.watch(layer, true, "city");
  }
  globalThis.CrownlandsCityFlagSkins = Object.freeze({ apply, preview, ready });
})();
