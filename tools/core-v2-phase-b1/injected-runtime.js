"use strict";

/* Core v2 Phase B1 north-west Tower reservation adapter. Appended only by the loopback server. */
(function installCoreB1TowerReservation() {
  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!fixture?.developmentOnly) throw new Error("The Core v2 Phase B1 Tower adapter is development-only.");

  function currentTower() {
    const regionId = getActiveMapRegionId();
    return fixture.prototypes.find(prototype => (
      prototype.regionId === regionId && prototype.key === "northwest-holding-tower"
    )) || null;
  }

  function addNorthwestTowerReservation() {
    cityLayer?.querySelector("[data-core-b1-tower-reservation]")?.remove();
    const prototype = currentTower();
    if (!prototype || !cityLayer) return;
    const objective = prototype.objective || {};
    const imageCenter = { x: Number(objective.x) || 724, y: Number(objective.y) || 543 };
    const worldCenter = islandImagePointToWorld(getActiveMapRegionId(), imageCenter);
    const mapCenter = worldToMapPoint(worldCenter);
    const worldRadiusX = Math.abs(islandImagePointToWorld(getActiveMapRegionId(), {
      x: imageCenter.x + (Number(objective.radiusX) || 142),
      y: imageCenter.y,
    }).x - worldCenter.x);
    const worldRadiusY = Math.abs(islandImagePointToWorld(getActiveMapRegionId(), {
      x: imageCenter.x,
      y: imageCenter.y + (Number(objective.radiusY) || 126),
    }).y - worldCenter.y);
    const marker = document.createElement("div");
    marker.dataset.coreA1TowerReservation = "true";
    marker.dataset.coreB1TowerReservation = "true";
    marker.className = "core-a1-tower-reservation core-b1-tower-reservation";
    marker.setAttribute("aria-label", "Future North-West Holding Tower reservation — development only");
    marker.style.cssText = [
      "position:absolute",
      `left:${mapCenter.x}px`,
      `top:${mapCenter.y}px`,
      `width:${Math.max(90, worldRadiusX * 2)}px`,
      `height:${Math.max(80, worldRadiusY * 2)}px`,
      "transform:translate(-50%,-50%)",
      "border:3px dashed rgba(246,215,142,.9)",
      "border-radius:50%",
      "background:rgba(34,24,15,.14)",
      "box-shadow:0 0 0 2px rgba(30,18,8,.45),inset 0 0 24px rgba(246,215,142,.13)",
      "pointer-events:none",
      "z-index:7",
    ].join(";");
    const label = document.createElement("span");
    label.textContent = "FUTURE TOWER RESERVATION";
    label.style.cssText = "position:absolute;left:50%;top:100%;transform:translate(-50%,8px);padding:4px 7px;white-space:nowrap;border-radius:5px;background:rgba(19,13,8,.9);color:#f6d78e;font:700 11px/1.1 system-ui;letter-spacing:.06em";
    marker.appendChild(label);
    cityLayer.appendChild(marker);
  }

  const originalRenderAll = renderAll;
  renderAll = function renderAllWithCoreB1Tower(...args) {
    const result = originalRenderAll.apply(this, args);
    queueMicrotask(addNorthwestTowerReservation);
    return result;
  };

  const readinessPoll = window.setInterval(() => {
    if (document.documentElement.dataset.coreA1Ready !== "true") return;
    window.clearInterval(readinessPoll);
    addNorthwestTowerReservation();
  }, 100);
})();
