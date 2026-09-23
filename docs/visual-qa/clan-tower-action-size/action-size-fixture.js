/* Native-size preview of the approved production controls. No layout or size overrides. */
(function () {
  "use strict";
  if (!window.__CROWNLANDS_BENCHMARK__ || location.pathname !== "/__benchmark__/") throw Error("Action size review requires the mock game.");
  const size = 56;
  let requestedZoom = .6, resizeTimer, measurementFrame = 0;
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
  // Read measurements after camera changes without replacing any game function.
  const cameraObserver = new MutationObserver(report);
  cameraObserver.observe(mapWorld, { attributes: true, attributeFilter: ["style"] });
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
    requestedZoom = Math.max(.4, Math.min(1, (Number(next.zoom) || 60) / 100));
    focus();
  }
  window.CrownlandsActionSizeReview = { set, measure, focus };
  // Let the reused layout fixture finish its resize framing before restoring zoom.
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(focus, 140); });
})();
