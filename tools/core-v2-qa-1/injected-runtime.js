"use strict";

/* Core v2 QA-1 adapter. Appended only to the isolated development fixture. */
(function installCoreV2Qa1Adapter() {
  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  if (!fixture?.developmentOnly || fixture?.qa1?.exactMapCount !== 25) {
    throw new Error("Core v2 QA-1 requires the isolated 25-map development fixture.");
  }

  function currentTower() {
    const regionId = getActiveMapRegionId();
    return fixture.prototypes.find(prototype => prototype.regionId === regionId && prototype.mapType === "HOLDING_TOWER") || null;
  }

  function addTowerReservation() {
    cityLayer?.querySelectorAll("[data-core-a1-tower-reservation]").forEach(marker => marker.remove());
    const prototype = currentTower();
    if (!prototype || !cityLayer) return;
    if (cityLayer.querySelector(".holding-tower-node[data-holding-tower-id]")) return;
    const objective = prototype.objective || {};
    const imageCenter = { x: Number(objective.x) || 724, y: Number(objective.y) || 543 };
    const worldCenter = islandImagePointToWorld(getActiveMapRegionId(), imageCenter);
    const mapCenter = worldToMapPoint(worldCenter);
    const radiusX = Number(objective.radiusX) || 142;
    const radiusY = Number(objective.radiusY) || 126;
    const worldRadiusX = Math.abs(islandImagePointToWorld(getActiveMapRegionId(), { x: imageCenter.x + radiusX, y: imageCenter.y }).x - worldCenter.x);
    const worldRadiusY = Math.abs(islandImagePointToWorld(getActiveMapRegionId(), { x: imageCenter.x, y: imageCenter.y + radiusY }).y - worldCenter.y);
    const marker = document.createElement("div");
    marker.dataset.coreA1TowerReservation = "true";
    marker.dataset.coreQa1TowerReservation = "true";
    marker.className = "core-a1-tower-reservation core-qa1-tower-reservation";
    marker.setAttribute("aria-label", `${prototype.name} future Tower reservation — development only`);
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

  const previousRenderAll = renderAll;
  renderAll = function renderAllWithQa1Tower(...args) {
    const result = previousRenderAll.apply(this, args);
    queueMicrotask(addTowerReservation);
    return result;
  };

  window.__CROWNLANDS_CORE_QA1__ = Object.freeze({
    getManifest: () => ({ ...fixture.qa1, activeRegionId: getActiveMapRegionId(), developmentOnly: true }),
    getPrototype: () => {
      const prototype = fixture.prototypes.find(entry => entry.regionId === getActiveMapRegionId());
      return prototype ? { ...prototype } : null;
    },
  });

  const readinessPoll = window.setInterval(() => {
    if (document.documentElement.dataset.coreA1Ready !== "true") return;
    window.clearInterval(readinessPoll);
    const toolbarTitle = document.querySelector("#coreA1Toolbar strong");
    if (toolbarTitle) toolbarTitle.textContent = "Core v2 QA-1 — 25 Maps";
    document.getElementById("coreA1Toolbar")?.setAttribute("aria-label", "Core v2 QA-1 runtime controls");
    addTowerReservation();
    document.documentElement.dataset.coreQa1Ready = "true";
  }, 100);
})();
