/* Preview-only size choices. Production code and the approved 56px size stay unchanged. */
(function () {
  "use strict";
  if (!window.__CROWNLANDS_BENCHMARK__ || location.pathname !== "/__benchmark__/") throw Error("Action size review requires the mock game.");
  const originalLayout = updateClanTowerActionWheelLayout;
  let size = 56, requestedZoom = .6, resizeTimer, measurementFrame = 0;
  function measure() {
    return {
      type: "tower-size-measurement", size, zoom, minimumZoom: getZoomBoundsForViewport().min,
      buttons: [...document.querySelectorAll("[data-clan-tower-map-action]")].map(button => {
        const rect = button.getBoundingClientRect();
        return { id: button.dataset.clanTowerMapAction, label: button.querySelector("strong").textContent.trim(), width: rect.width, height: rect.height, x: rect.x, y: rect.y };
      })
    };
  }
  function report() {
    if (measurementFrame) return;
    measurementFrame = requestAnimationFrame(() => { measurementFrame = 0; parent.postMessage(measure(), location.origin); });
  }
  updateClanTowerActionWheelLayout = function (wheel = cityLayer?.querySelector(".clan-tower-action-wheel")) {
    originalLayout(wheel);
    if (!wheel?._clanTowerLayout) return;
    // The production inverse-camera transform remains in use. Only this mock page
    // overrides the unapproved size options and their 4px gap / 8px clearance.
    wheel.style.setProperty("--cl-action-size", size + "px");
    const buttons = wheel.querySelectorAll("[data-clan-tower-map-action]");
    buttons.forEach((button, index) => button.style.setProperty("--tower-action-x", `${(index - (buttons.length - 1) / 2) * (size + 4)}px`));
    wheel.style.setProperty("--tower-action-y", `${wheel._clanTowerLayout.bottomOffset * Math.max(.1, zoom) + 8 + size / 2}px`);
    report();
  };
  function focus() {
    const tower = window.CrownlandsCastlePositionReview.tower;
    if (!tower) return;
    zoom = requestedZoom;
    centerOnWorldPoint({ x: tower.visualX, y: tower.visualY }, tower.regionId);
    updateCameraTransform();
    const row = cityLayer.querySelector(".clan-tower-action-wheel"), info = row?.querySelector('[data-clan-tower-map-action="info"]');
    if (!info) return;
    const rect = info.getBoundingClientRect(), frame = mapFrame.getBoundingClientRect();
    // Keep the controls in view while zooming; the map art still scales normally.
    camera.x += (rect.x + rect.width / 2 - frame.x - frame.width / 2) / zoom;
    camera.y += (rect.y + rect.height / 2 - frame.y - frame.height * .60) / zoom;
    updateCameraTransform();
    report();
  }
  function set(next = {}) {
    size = [56, 64, 72].includes(Number(next.size)) ? Number(next.size) : 56;
    requestedZoom = Math.max(.4, Math.min(1, (Number(next.zoom) || 60) / 100));
    focus();
  }
  window.CrownlandsActionSizeReview = { set, measure, focus };
  // Let the reused layout fixture finish its resize framing before restoring zoom.
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(focus, 140); });
})();
