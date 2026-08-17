
/* Core v2 Phase A.1 runtime-density QA. Appended in memory by the loopback server only. */
(function installCoreV2PhaseA1RuntimeQa() {
  "use strict";

  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  const instrumentation = window.__CROWNLANDS_BENCHMARK_INSTRUMENTATION__;
  if (!fixture?.developmentOnly || !instrumentation || location.hostname !== "127.0.0.1") {
    throw new Error("Core v2 Phase A.1 runtime QA requires the development-only loopback fixture.");
  }

  const runtimeQa = {
    status: "waiting",
    currentRegionId: fixture.primaryRegionId,
    zoomPreset: "normal",
    marchesEnabled: true,
    lastResult: null,
    error: "",
  };

  // Keep QA measurements at the actual desktop runtime scale even when the
  // in-app browser pane itself is narrow. Element screenshots target this
  // fixed development-only game surface; production CSS is never changed.
  const captureStyle = document.createElement("style");
  captureStyle.dataset.coreA1CaptureStyle = "true";
  captureStyle.textContent = `
    html, body { min-width: 996px !important; min-height: 720px !important; overflow: auto !important; }
    .phone-shell { width: 996px !important; height: 720px !important; margin: 0 !important; }
    .rotate-warning { display: none !important; }
  `;
  document.head.appendChild(captureStyle);

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function waitForBenchmarkReady(timeoutMs = 15000) {
    const startedAt = performance.now();
    while (window.__CROWNLANDS_BENCHMARK__?.getStatus?.().status !== "ready") {
      const status = window.__CROWNLANDS_BENCHMARK__?.getStatus?.();
      if (status?.status === "error") throw new Error(status.error || "Base benchmark runtime failed.");
      if (performance.now() - startedAt > timeoutMs) throw new Error("Runtime QA timed out waiting for the real Crownlands renderer.");
      await wait(40);
    }
  }

  async function waitForMapReady(timeoutMs = 6000) {
    const startedAt = performance.now();
    while (isMapInteractionBlocked()) {
      if (performance.now() - startedAt > timeoutMs) throw new Error("Map transition did not settle.");
      await wait(25);
    }
  }

  function currentPrototype() {
    return fixture.prototypes.find(entry => entry.regionId === getActiveMapRegionId()) || null;
  }

  // The production runtime builds WORLD_CAMPS once from its startup catalog.
  // Phase A.1 lazy-loads five development definitions, so synchronize any Camp
  // from the newly loaded definition into that existing runtime collection.
  // This remains loopback-only and exercises the real Camp rendering path.
  function ensureLoadedRegionCamps(regionId) {
    getEditorCampDefinitions(regionId).forEach((camp, index) => {
      const config = getCampConfigForType(camp?.campType || camp?.type);
      const id = String(camp?.id || `${regionId}_${config.type}_camp_${index + 1}`);
      if (WORLD_CAMPS_BY_ID.has(id)) return;
      const point = islandImagePointToWorld(regionId, getEditorPoint(camp));
      const runtimeCamp = {
        id,
        name: String(camp?.name || config.name),
        regionId,
        x: Math.round(point.x),
        y: Math.round(point.y),
        campType: config.type,
        artSrc: String(camp?.artSrc || config.artSrc || ""),
        size: islandImageVisualSizeToWorld(regionId, camp?.size, DEFAULT_CAMP_VISUAL_SIZE),
        flipX: Boolean(camp?.flipX),
        prototypeOnly: true,
      };
      WORLD_CAMPS.push(runtimeCamp);
      WORLD_CAMPS_BY_ID.set(id, runtimeCamp);
    });
  }

  function createRepresentativeArmies(regionId, count = 14) {
    const cities = state.cities.filter(city => getCityRegionId(city) === regionId && !isStronghold(city));
    if (cities.length < 2) return [];
    const kinds = ["attack", "transfer", "scout", "reinforce", "rally_join"];
    return Array.from({ length: count }, (_, index) => {
      const source = cities[(index * 7) % cities.length];
      let target = cities[(index * 19 + Math.floor(cities.length / 2) + 1) % cities.length];
      if (target.id === source.id) target = cities[(cities.indexOf(source) + 1) % cities.length];
      const midpoint = {
        x: Math.round((source.x + target.x) / 2 + ((index % 5) - 2) * 15),
        y: Math.round((source.y + target.y) / 2 + (((index * 3) % 5) - 2) * 12),
      };
      const points = [{ x: source.x, y: source.y }, midpoint, { x: target.x, y: target.y }];
      const pathLength = Math.hypot(midpoint.x - source.x, midpoint.y - source.y)
        + Math.hypot(target.x - midpoint.x, target.y - midpoint.y);
      const launchedAtMs = fixture.fixedEpochMs - 45000 - index * 900;
      const arrivesAtMs = fixture.fixedEpochMs + 21600000 + index * 8000;
      const ownerIsPlayer = index % 4 === 0;
      return {
        id: `core-a1-${regionId}-army-${String(index + 1).padStart(2, "0")}`,
        ownerKind: "player",
        ownerUid: ownerIsPlayer ? fixture.player.uid : `benchmark-rival-${index % 12}`,
        ownerName: ownerIsPlayer ? fixture.player.displayName : `Rival Banner ${index % 12 + 1}`,
        ownerFlag: ownerIsPlayer
          ? { field: "#24466f", mark: "#e5cf94", markType: "chevron" }
          : { field: "#742f2a", mark: "#eadcb4", markType: "cross" },
        kind: kinds[index % kinds.length],
        launchKind: kinds[index % kinds.length],
        targetType: "city",
        fromId: source.id,
        toId: target.id,
        fromName: source.name,
        toName: target.name,
        sourceRegionId: regionId,
        targetRegionId: regionId,
        troops: 1200 + index * 613,
        requestedTroops: 1200 + index * 613,
        total: (arrivesAtMs - launchedAtMs) / 1000,
        launchedAtMs,
        arrivesAtMs,
        path: points,
        pathSegments: [{ regionId, points, length: pathLength }],
        pathLength,
        routeRegionIds: [regionId],
        targetOwnerAtLaunch: "neutral",
        targetOwnerUid: "",
        viewerAccess: ownerIsPlayer ? "owner" : "public",
        troopVisibility: ownerIsPlayer ? "exact" : "estimate",
        troopEstimateMin: 1000,
        troopEstimateMax: 10000,
        troopEstimateLabel: "1K–10K",
        status: "active",
        resetGeneration: fixture.releaseConfig.resetGeneration,
        worldId: fixture.releaseConfig.worldId,
      };
    });
  }

  function emitRepresentativeArmies() {
    const regionId = getActiveMapRegionId();
    const armies = runtimeQa.marchesEnabled ? createRepresentativeArmies(regionId) : [];
    window.CrownlandsOnline.__emitIslandArmies(getOnlineIslandId(regionId), armies);
    renderAll();
    addReservationMarker();
    return armies.length;
  }

  function addReservationMarker() {
    cityLayer?.querySelector("[data-core-a1-tower-reservation]")?.remove();
    const prototype = currentPrototype();
    if (prototype?.key !== "southwest-holding-tower") return;
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
    marker.className = "core-a1-tower-reservation";
    marker.setAttribute("aria-label", "Future Holding Tower reservation — development only");
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

  function zoomValueForPreset(preset) {
    const bounds = getZoomBoundsForViewport();
    if (preset === "low") return bounds.min;
    if (preset === "close") return Math.min(bounds.max, Math.max(bounds.min, 1.15));
    return Math.min(bounds.max, Math.max(bounds.min, 0.82));
  }

  async function applyZoomPreset(preset) {
    runtimeQa.zoomPreset = ["low", "normal", "close"].includes(preset) ? preset : "normal";
    zoom = clampZoomForViewport(zoomValueForPreset(runtimeQa.zoomPreset));
    centerOnRegion(getActiveMapRegionId());
    updateCameraTransform();
    renderAll();
    addReservationMarker();
    await wait(420);
    return { preset: runtimeQa.zoomPreset, zoom, detailLevel: mapDetailLevel, lowZoom: lowZoomPerformanceEnabled };
  }

  async function switchRegion(regionId) {
    if (!fixture.prototypes.some(entry => entry.regionId === regionId)) throw new Error(`Unknown Phase A.1 region ${regionId}.`);
    await switchOnlineIsland(regionId, { fromMapPicker: true });
    await waitForMapReady();
    ensureLoadedRegionCamps(regionId);
    runtimeQa.currentRegionId = regionId;
    await applyZoomPreset(runtimeQa.zoomPreset);
    emitRepresentativeArmies();
    await wait(350);
    return collectRuntimeMetrics();
  }

  function visibleElements(selector, root = document) {
    return [...root.querySelectorAll(selector)].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01 && rect.width > 0 && rect.height > 0;
    });
  }

  function rectanglesOverlap(left, right, tolerance = 1) {
    return left.left < right.right - tolerance
      && left.right > right.left + tolerance
      && left.top < right.bottom - tolerance
      && left.bottom > right.top + tolerance;
  }

  function collisionSummary(selector, root = document) {
    const elements = visibleElements(selector, root);
    const pairs = [];
    for (let leftIndex = 0; leftIndex < elements.length; leftIndex += 1) {
      const left = elements[leftIndex];
      const leftRect = left.getBoundingClientRect();
      for (let rightIndex = leftIndex + 1; rightIndex < elements.length; rightIndex += 1) {
        const right = elements[rightIndex];
        if (left.closest(".city-node") && left.closest(".city-node") === right.closest(".city-node")) continue;
        const rightRect = right.getBoundingClientRect();
        if (!rectanglesOverlap(leftRect, rightRect)) continue;
        pairs.push({
          left: left.closest(".city-node")?.dataset.cityId || left.getAttribute("aria-label") || selector,
          right: right.closest(".city-node")?.dataset.cityId || right.getAttribute("aria-label") || selector,
        });
      }
    }
    return { visible: elements.length, collisions: pairs.length, examples: pairs.slice(0, 8) };
  }

  function getCityPairs() {
    const regionId = getActiveMapRegionId();
    const cities = state.cities.filter(city => getCityRegionId(city) === regionId && !isStronghold(city));
    const pairs = [];
    for (let leftIndex = 0; leftIndex < cities.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < cities.length; rightIndex += 1) {
        const left = cities[leftIndex];
        const right = cities[rightIndex];
        pairs.push({ leftId: left.id, rightId: right.id, distance: Math.hypot(left.x - right.x, left.y - right.y) });
      }
    }
    return pairs.sort((left, right) => left.distance - right.distance);
  }

  function collectRuntimeMetrics() {
    const regionId = getActiveMapRegionId();
    const prototype = currentPrototype();
    const pairs = getCityPairs();
    const cityNodes = [...(cityLayer?.querySelectorAll(".city-node[data-city-id]") || [])];
    const normalCityNodes = cityNodes.filter(node => !node.classList.contains("stronghold-node"));
    const selectedNodes = cityNodes.filter(node => node.classList.contains("selected"));
    const objectiveNodes = [...(cityLayer?.querySelectorAll(".stronghold-node, .camp-node, [data-core-a1-tower-reservation]") || [])];
    return {
      status: "measured",
      regionId,
      prototypeKey: prototype?.key || "",
      name: prototype?.name || getRegionLabel(regionId),
      expectedCityCapacity: prototype?.exactCityCapacity || null,
      renderedCityNodes: normalCityNodes.length,
      dataCityCount: state.cities.filter(city => getCityRegionId(city) === regionId && !isStronghold(city)).length,
      objectiveNodes: objectiveNodes.length,
      transitions: {
        openArrows: visibleElements(".teleport-node:not(.region-gate)", mapWorld || mapFrame).length,
        gatedEdges: visibleElements(".teleport-node.region-gate", mapWorld || mapFrame).length,
      },
      marches: {
        data: getRenderableArmies().length,
        tokens: armyLayer?.querySelectorAll(".army-token").length || 0,
        routeElements: pathsSvg?.querySelectorAll("path, polygon, polyline").length || 0,
      },
      camera: { zoom, preset: runtimeQa.zoomPreset, detailLevel: mapDetailLevel, lowZoom: lowZoomPerformanceEnabled },
      visible: {
        cities: visibleElements(".city-node", cityLayer).length,
        cityNames: visibleElements(".city-name", cityLayer).length,
        playerBanners: visibleElements(".player-city-banner", cityLayer).length,
        foreignLabels: visibleElements(".foreign-city-label", cityLayer).length,
        troopCounts: visibleElements(".city-army-count", cityLayer).length,
        shields: visibleElements(".foreign-city-shield, .city-shield-field", cityLayer).length,
      },
      collisions: {
        castles: collisionSummary(".city-castle", cityLayer),
        names: collisionSummary(".city-name", cityLayer),
        playerBanners: collisionSummary(".player-city-banner", cityLayer),
        foreignLabels: collisionSummary(".foreign-city-label", cityLayer),
        troopCounts: collisionSummary(".city-army-count", cityLayer),
        objectiveVsCities: objectiveNodes.reduce((result, objective) => {
          const objectiveRect = objective.getBoundingClientRect();
          result += normalCityNodes.filter(city => rectanglesOverlap(objectiveRect, city.getBoundingClientRect(), 2)).length;
          return result;
        }, 0),
      },
      selection: { selectedCount: selectedNodes.length, selectedCityIds: selectedNodes.map(node => node.dataset.cityId) },
      tightPairs: pairs.slice(0, 8),
      bodySize: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      mapFrame: (() => {
        const rect = mapFrame.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      })(),
    };
  }

  async function resetInteractionProbeSurface(cityId = "") {
    if (modal.open) modal.close();
    clearSelection(false);
    if (cityId) centerOnCity(cityId);
    else centerOnRegion(getActiveMapRegionId());
    updateCameraTransform();
    renderAll();
    addReservationMarker();
    await wait(140);
  }

  async function probeCityInteraction(cityId, pointerType) {
    await resetInteractionProbeSurface(cityId);
    const qaToolbar = document.getElementById("coreA1Toolbar");
    const toolbarWasHidden = Boolean(qaToolbar?.hidden);
    if (qaToolbar) qaToolbar.hidden = true;
    let node = cityLayer.querySelector(`.city-node[data-city-id="${CSS.escape(cityId)}"]`);
    if (!node) {
      if (qaToolbar) qaToolbar.hidden = toolbarWasHidden;
      return { cityId, found: false, hitMatches: false, actionAcknowledged: false };
    }
    let rect = node.getBoundingClientRect();
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) {
      scrollingElement.scrollLeft = Math.max(0, scrollingElement.scrollLeft + rect.left + rect.width / 2 - document.documentElement.clientWidth / 2);
      scrollingElement.scrollTop = 0;
      await wait(80);
      node = cityLayer.querySelector(`.city-node[data-city-id="${CSS.escape(cityId)}"]`);
      rect = node.getBoundingClientRect();
    }
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(clientX, clientY);
    const hitNode = hit?.closest?.(".city-node[data-city-id]") || null;
    const hitCityId = hitNode?.dataset.cityId || "";
    if (pointerType === "touch") {
      const options = { bubbles: true, cancelable: true, composed: true, pointerId: 41, pointerType: "touch", isPrimary: true, clientX, clientY };
      hit?.dispatchEvent(new PointerEvent("pointerdown", { ...options, buttons: 1 }));
      hit?.dispatchEvent(new PointerEvent("pointerup", { ...options, buttons: 0 }));
    }
    hit?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }));
    await wait(180);
    const actionAcknowledged = selectedSourceId === cityId
      || selectedTargetId === cityId
      || node.classList.contains("selected")
      || node.classList.contains("targeted")
      || Boolean(cityLayer.querySelector(".city-action-wheel, .gold-camp-action-wheel"))
      || Boolean(modal.open);
    const result = {
      cityId,
      found: true,
      hitCityId,
      hitTag: hit?.tagName || "",
      hitClass: String(hit?.className || "").slice(0, 160),
      probePoint: { clientX, clientY },
      nodeRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      hitMatches: hitCityId === cityId,
      actionAcknowledged,
      selectedSourceId: selectedSourceId || "",
      selectedTargetId: selectedTargetId || "",
      modalOpened: Boolean(modal.open),
    };
    if (modal.open) modal.close();
    if (scrollingElement) {
      scrollingElement.scrollLeft = 0;
      scrollingElement.scrollTop = 0;
    }
    if (qaToolbar) qaToolbar.hidden = toolbarWasHidden;
    return result;
  }

  function getCurrentlyRenderedCityPair(index = 0) {
    const pairs = getCityPairs();
    return pairs[Math.max(0, Math.min(pairs.length - 1, Number(index) || 0))] || null;
  }

  async function selectTightPairWithMouse(index = 0) {
    const pair = getCurrentlyRenderedCityPair(index);
    if (!pair) throw new Error("No city pair is available.");
    const results = [];
    for (const cityId of [pair.leftId, pair.rightId]) results.push(await probeCityInteraction(cityId, "mouse"));
    return {
      method: "mouse-center-hit-runtime-event-path",
      ...pair,
      results,
      reliable: results.every(result => result.found && result.hitMatches && result.actionAcknowledged),
    };
  }

  async function probeTightPairWithTouch(index = 0) {
    const pair = getCurrentlyRenderedCityPair(index);
    if (!pair) throw new Error("No city pair is available.");
    const results = [];
    for (const cityId of [pair.leftId, pair.rightId]) results.push(await probeCityInteraction(cityId, "touch"));
    return {
      method: "pointerType-touch-center-hit-runtime-event-path",
      ...pair,
      results,
      reliable: results.every(result => result.found && result.hitMatches && result.actionAcknowledged),
    };
  }

  async function runPerformanceSample(durationMs = 3200) {
    const sampleName = `${getActiveMapRegionId()}-${runtimeQa.zoomPreset}-runtime-density`;
    instrumentation.beginSample(sampleName);
    await wait(Math.max(1500, Math.min(8000, Number(durationMs) || 3200)));
    return instrumentation.endSample();
  }

  function setOutput(value) {
    runtimeQa.lastResult = value;
    const output = document.getElementById("coreA1Output");
    if (output) output.textContent = JSON.stringify(value, null, 2);
    return value;
  }

  async function runControlAction(button, action) {
    button.disabled = true;
    try {
      setOutput({ status: "running", action: button.id });
      setOutput(await action());
    } catch (error) {
      setOutput({ status: "error", action: button.id, error: error?.stack || error?.message || String(error) });
    } finally {
      button.disabled = false;
    }
  }

  function createToolbar() {
    if (document.getElementById("coreA1Toolbar")) return;
    const toolbar = document.createElement("aside");
    toolbar.id = "coreA1Toolbar";
    toolbar.setAttribute("aria-label", "Core v2 Phase A.1 runtime QA controls");
    toolbar.style.cssText = "position:fixed;z-index:100000;left:10px;top:92px;width:280px;max-height:calc(100vh - 110px);overflow:auto;padding:10px;border:1px solid #b89555;border-radius:8px;background:rgba(8,14,19,.96);color:#f2e2ba;font:12px/1.35 system-ui;box-shadow:0 8px 24px rgba(0,0,0,.55)";
    toolbar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px"><strong style="color:#fff0bf">Core v2 Phase A.1 Runtime QA</strong><button id="coreA1Hide" type="button" aria-label="Hide runtime QA controls">Hide</button></div>
      <label style="display:grid;gap:3px">Prototype
        <select id="coreA1MapSelect" aria-label="Phase A.1 prototype map" style="width:100%">
          ${fixture.prototypes.map(entry => `<option value="${entry.regionId}">${entry.name} (${entry.exactCityCapacity})</option>`).join("")}
        </select>
      </label>
      <div style="display:flex;gap:5px;margin-top:8px">
        <button id="coreA1ZoomLow" type="button">Low</button>
        <button id="coreA1ZoomNormal" type="button">Normal</button>
        <button id="coreA1ZoomClose" type="button">Close</button>
      </div>
      <label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input id="coreA1Marches" type="checkbox" checked> Representative marches</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:8px">
        <button id="coreA1Measure" type="button">Measure</button>
        <button id="coreA1Performance" type="button">3.2s Perf</button>
        <button id="coreA1MousePair" type="button">Mouse pair</button>
        <button id="coreA1TouchPair" type="button">Touch pair</button>
      </div>
      <pre id="coreA1Output" aria-live="polite" style="margin:8px 0 0;max-height:230px;overflow:auto;white-space:pre-wrap;color:#cfe4d6;background:#050a0d;padding:7px;border-radius:5px">starting</pre>
    `;
    document.body.appendChild(toolbar);
    const showButton = document.createElement("button");
    showButton.id = "coreA1Show";
    showButton.type = "button";
    showButton.hidden = true;
    showButton.textContent = "Show QA";
    showButton.setAttribute("aria-label", "Show runtime QA controls");
    showButton.style.cssText = "position:fixed;z-index:100000;left:1006px;top:92px;padding:6px 9px;border:1px solid #8f784d;border-radius:5px;background:#101a21;color:#fff0bf;cursor:pointer";
    document.body.appendChild(showButton);
    toolbar.querySelectorAll("button").forEach(button => {
      button.style.cssText = "padding:5px 7px;border:1px solid #8f784d;border-radius:4px;background:#2a3842;color:#fff4d2;cursor:pointer";
    });
    const mapSelect = document.getElementById("coreA1MapSelect");
    mapSelect.value = getActiveMapRegionId();
    mapSelect.addEventListener("change", () => runControlAction(mapSelect, () => switchRegion(mapSelect.value)));
    document.getElementById("coreA1ZoomLow").addEventListener("click", event => runControlAction(event.currentTarget, async () => { await applyZoomPreset("low"); return collectRuntimeMetrics(); }));
    document.getElementById("coreA1ZoomNormal").addEventListener("click", event => runControlAction(event.currentTarget, async () => { await applyZoomPreset("normal"); return collectRuntimeMetrics(); }));
    document.getElementById("coreA1ZoomClose").addEventListener("click", event => runControlAction(event.currentTarget, async () => { await applyZoomPreset("close"); return collectRuntimeMetrics(); }));
    document.getElementById("coreA1Marches").addEventListener("change", event => {
      runtimeQa.marchesEnabled = event.currentTarget.checked;
      setOutput({ status: "marches", enabled: runtimeQa.marchesEnabled, count: emitRepresentativeArmies() });
    });
    document.getElementById("coreA1Measure").addEventListener("click", event => runControlAction(event.currentTarget, async () => collectRuntimeMetrics()));
    document.getElementById("coreA1Performance").addEventListener("click", event => runControlAction(event.currentTarget, () => runPerformanceSample()));
    document.getElementById("coreA1MousePair").addEventListener("click", event => runControlAction(event.currentTarget, () => selectTightPairWithMouse(0)));
    document.getElementById("coreA1TouchPair").addEventListener("click", event => runControlAction(event.currentTarget, () => probeTightPairWithTouch(0)));
    document.getElementById("coreA1Hide").addEventListener("click", () => {
      toolbar.hidden = true;
      showButton.hidden = true;
    });
    showButton.addEventListener("click", () => {
      showButton.hidden = true;
      toolbar.hidden = false;
    });
    document.addEventListener("keydown", event => {
      if (String(event.key || "").toLowerCase() !== "q" || event.ctrlKey || event.metaKey || event.altKey) return;
      const shouldShow = toolbar.hidden;
      toolbar.hidden = !shouldShow;
      showButton.hidden = true;
    });
  }

  window.__CROWNLANDS_CORE_A1__ = Object.freeze({
    getStatus: () => ({ ...runtimeQa }),
    getLastResult: () => runtimeQa.lastResult,
  });

  (async () => {
    try {
      await waitForBenchmarkReady();
      createToolbar();
      runtimeQa.status = "ready";
      await applyZoomPreset("normal");
      emitRepresentativeArmies();
      setOutput(collectRuntimeMetrics());
      document.documentElement.dataset.coreA1Ready = "true";
    } catch (error) {
      runtimeQa.status = "error";
      runtimeQa.error = error?.stack || error?.message || String(error);
      document.documentElement.dataset.coreA1Error = "true";
      console.error("Core v2 Phase A.1 runtime QA failed", error);
    }
  })();
})();
