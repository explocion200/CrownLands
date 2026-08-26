
/* Crownlands pickup visual QA. Appended in memory by the loopback server only. */
(function installCrownlandsPickupQaRuntime() {
  "use strict";

  const query = new URLSearchParams(location.search);
  if (query.get("pickupQa") !== "true") return;
  if (location.hostname !== "127.0.0.1") {
    throw new Error("Pickup QA is restricted to the loopback benchmark server.");
  }

  const maps = getEditorMapEntries()
    .map(map => ({ id: map.id, label: map.label || getRegionLabel(map.id) }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const requestedQaRegionId = normalizeRegionId(query.get("pickupQaRegion"));
  const requestedQaZoom = Number(query.get("pickupQaZoom"));
  const qaState = {
    busy: false,
    lastDiagnostic: null,
    mapResults: [],
    lifecycle: null,
  };
  let qaRoot = null;
  let qaStatus = null;
  let qaResults = null;
  let qaRegionSelect = null;
  let qaZoomSelect = null;

  function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function waitForBenchmarkReady(timeoutMs = 12000) {
    const startedAt = performance.now();
    while (window.__CROWNLANDS_BENCHMARK__?.getStatus?.().status !== "ready") {
      const status = window.__CROWNLANDS_BENCHMARK__?.getStatus?.();
      if (status?.status === "error") throw new Error(status.error || "Benchmark failed to start.");
      if (performance.now() - startedAt > timeoutMs) throw new Error("Pickup QA timed out waiting for the benchmark.");
      await wait(40);
    }
  }

  async function waitForMapReady(timeoutMs = 20000) {
    const startedAt = performance.now();
    while (isMapInteractionBlocked()) {
      if (performance.now() - startedAt > timeoutMs) throw new Error("Pickup QA timed out waiting for a map transition.");
      await wait(30);
    }
    await wait(160);
  }

  function getRequestedZoom() {
    const value = Number(qaZoomSelect?.value || 0.7);
    return Number.isFinite(value) ? value : 0.7;
  }

  function setQaBusy(busy, label = "") {
    qaState.busy = Boolean(busy);
    qaRoot?.querySelectorAll("button, select").forEach(control => {
      control.disabled = qaState.busy;
    });
    if (qaRoot) qaRoot.dataset.busy = String(qaState.busy);
    if (qaState.busy && qaStatus) qaStatus.textContent = label || "Running pickup QA…";
  }

  async function runQaAction(action) {
    try {
      return await action();
    } catch (error) {
      const message = error?.message || String(error);
      if (qaStatus) qaStatus.textContent = `ERROR · ${message}`;
      if (qaRoot) qaRoot.dataset.pass = "false";
      document.documentElement.dataset.pickupQaError = message;
      console.error("Crownlands pickup QA action failed", error);
      return null;
    }
  }

  function resetDailyPickupCounts() {
    const daily = ensureDailyCaptureTracker();
    daily.harvestedGoldBonuses = 0;
    daily.harvestedTroopBonuses = 0;
    daily.harvestedBonuses = 0;
    return daily;
  }

  function applyQaZoom() {
    const rect = mapFrame.getBoundingClientRect();
    zoom = clampZoomForViewport(getRequestedZoom(), rect);
    centerOnRegion(getActiveMapRegionId());
    const focusedBonus = getActiveHarvestBonuses(getActiveMapRegionId())[0] || null;
    if (focusedBonus) centerOnWorldPoint(focusedBonus, getActiveMapRegionId());
    updateCameraTransform();
    renderAll();
  }

  function clearQaOverlays() {
    harvestLayer?.querySelectorAll(".pickup-qa-zone, .pickup-qa-marker").forEach(element => element.remove());
  }

  function createQaOverlayElement(className, styles = {}) {
    const element = document.createElement("span");
    element.className = className;
    Object.assign(element.style, styles);
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function drawQaOverlays(regionId, point) {
    if (!harvestLayer || !point) return;
    clearQaOverlays();
    const bounds = getIslandMapBounds(regionId);
    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const mapCenter = worldToMapPoint(center);
    const shortestDimension = Math.max(1, Math.min(bounds.width, bounds.height));
    HARVEST_BONUS_CENTER_SEARCH_FRACTIONS.slice().reverse().forEach((fraction, index) => {
      const radiusPoint = worldToMapPoint({ x: center.x + shortestDimension * fraction, y: center.y });
      const radius = Math.max(1, Math.abs(radiusPoint.x - mapCenter.x));
      const zone = createQaOverlayElement("pickup-qa-zone", {
        left: `${mapCenter.x}px`,
        top: `${mapCenter.y}px`,
        width: `${radius * 2}px`,
        height: `${radius * 2}px`,
      });
      zone.dataset.fraction = String(fraction);
      zone.dataset.zoneIndex = String(HARVEST_BONUS_CENTER_SEARCH_FRACTIONS.length - index);
      harvestLayer.prepend(zone);
    });
    const mapPoint = worldToMapPoint(point);
    const marker = createQaOverlayElement("pickup-qa-marker", {
      left: `${mapPoint.x}px`,
      top: `${mapPoint.y}px`,
    });
    harvestLayer.appendChild(marker);
  }

  function getNearestDistance(items, point, getPoint = value => value) {
    if (!items.length) return null;
    return Math.min(...items.map(item => {
      const itemPoint = getPoint(item);
      return Math.hypot(Number(itemPoint?.x) - point.x, Number(itemPoint?.y) - point.y);
    }));
  }

  function getSearchZone(distanceFraction) {
    if (distanceFraction <= 0.001) return "center";
    const fraction = HARVEST_BONUS_CENTER_SEARCH_FRACTIONS.find(value => distanceFraction <= value + 0.001);
    return fraction ? `${Math.round(fraction * 100)}%` : "outside";
  }

  function inspectPickup(regionId = getActiveMapRegionId()) {
    const normalizedRegionId = normalizeRegionId(regionId);
    const bonus = getActiveHarvestBonuses(normalizedRegionId)[0] || null;
    const node = harvestLayer?.querySelector(".harvest-bonus-node") || null;
    const bounds = getIslandMapBounds(normalizedRegionId);
    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    const point = bonus ? { x: bonus.x, y: bonus.y } : null;
    const shortestDimension = Math.max(1, Math.min(bounds.width, bounds.height));
    const centerDistance = point ? Math.hypot(point.x - center.x, point.y - center.y) : null;
    const distanceFraction = centerDistance == null ? null : centerDistance / shortestDimension;
    const cities = state?.cities?.filter(city => getCityRegionId(city) === normalizedRegionId) || [];
    const camps = WORLD_CAMPS.filter(camp => normalizeRegionId(camp.regionId) === normalizedRegionId);
    const teleports = normalizedRegionId === getActiveMapRegionId() ? getActiveIslandTeleporters() : [];
    const nodeRect = node?.getBoundingClientRect() || null;
    const frameRect = mapFrame?.getBoundingClientRect() || null;
    const nodeStyle = node ? getComputedStyle(node) : null;
    const glowStyle = node ? getComputedStyle(node, "::before") : null;
    const ringStyle = node ? getComputedStyle(node, "::after") : null;
    const hitTarget = nodeRect
      ? document.elementFromPoint(nodeRect.left + nodeRect.width / 2, nodeRect.top + nodeRect.height / 2)
      : null;
    const visible = Boolean(nodeRect && frameRect
      && nodeRect.width >= 44 && nodeRect.height >= 44
      && nodeRect.right > frameRect.left && nodeRect.left < frameRect.right
      && nodeRect.bottom > frameRect.top && nodeRect.top < frameRect.bottom
      && nodeStyle?.display !== "none" && nodeStyle?.visibility !== "hidden" && Number(nodeStyle?.opacity || 1) > 0);
    const clickable = Boolean(node && hitTarget?.closest?.(".harvest-bonus-node") === node && nodeStyle?.pointerEvents !== "none" && !node.disabled);
    const glowVisible = Boolean(glowStyle
      && glowStyle.backgroundImage !== "none"
      && glowStyle.boxShadow !== "none"
      && ringStyle?.borderStyle !== "none");
    const terrainSafe = Boolean(point && isHarvestBonusTerrainSafePoint(point.x, point.y, normalizedRegionId));
    const citiesSafe = Boolean(point && isHarvestBonusFarFromCities(point.x, point.y, normalizedRegionId));
    const campsSafe = Boolean(point && isHarvestBonusFarFromCamps(point.x, point.y, normalizedRegionId));
    const transitionsSafe = Boolean(point && isHarvestBonusFarFromTransitions(point.x, point.y, normalizedRegionId));
    const inCenterSearch = distanceFraction != null
      && distanceFraction <= Math.max(...HARVEST_BONUS_CENTER_SEARCH_FRACTIONS) + 0.001;
    const diagnostic = {
      regionId: normalizedRegionId,
      label: getRegionLabel(normalizedRegionId),
      point,
      bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
      centerDistance: centerDistance == null ? null : Math.round(centerDistance),
      centerFraction: distanceFraction == null ? null : Number(distanceFraction.toFixed(4)),
      searchZone: distanceFraction == null ? "none" : getSearchZone(distanceFraction),
      terrainSafe,
      citiesSafe,
      campsSafe,
      transitionsSafe,
      nearestCity: point ? getNearestDistance(cities, point) : null,
      nearestCamp: point ? getNearestDistance(camps, point) : null,
      nearestTransition: point ? getNearestDistance(teleports, point, teleport => teleport.worldPoint) : null,
      visible,
      clickable,
      glowVisible,
      zoom: Number(zoom.toFixed(3)),
      detailLevel: mapDetailLevel,
      nodeSize: nodeRect ? { width: Math.round(nodeRect.width), height: Math.round(nodeRect.height) } : null,
      initialDelaySeconds: HARVEST_BONUS_INITIAL_SPAWN_SECONDS,
      respawnSeconds: HARVEST_BONUS_RESPAWN_SECONDS,
      retrySeconds: HARVEST_BONUS_SERVER_RETRY_SECONDS,
    };
    diagnostic.pass = Boolean(point && terrainSafe && citiesSafe && campsSafe && transitionsSafe
      && inCenterSearch && visible && clickable && glowVisible);
    qaState.lastDiagnostic = diagnostic;
    return diagnostic;
  }

  function formatDistance(value) {
    return value == null || !Number.isFinite(value) ? "n/a" : `${Math.round(value)}px`;
  }

  function renderDiagnostic(diagnostic = inspectPickup()) {
    const result = diagnostic || {};
    if (qaStatus) {
      qaStatus.textContent = [
        `${result.pass ? "PASS" : "CHECK"} · ${result.label || result.regionId || "No map"} · ${result.searchZone || "no"} zone · zoom ${result.zoom ?? "n/a"}`,
        result.point
          ? `Point ${result.point.x}, ${result.point.y} · ${((result.centerFraction || 0) * 100).toFixed(1)}% from center`
          : "No safe pickup point was found.",
        `Safety: land ${result.terrainSafe ? "✓" : "✕"} · cities ${result.citiesSafe ? "✓" : "✕"} · camps ${result.campsSafe ? "✓" : "✕"} · exits ${result.transitionsSafe ? "✓" : "✕"}`,
        `Render: visible ${result.visible ? "✓" : "✕"} · clickable ${result.clickable ? "✓" : "✕"} · glow ${result.glowVisible ? "✓" : "✕"} · ${result.nodeSize?.width || 0}px hit target`,
        `Nearest: city ${formatDistance(result.nearestCity)} · camp ${formatDistance(result.nearestCamp)} · exit ${formatDistance(result.nearestTransition)}`,
        `Timers: initial ${HARVEST_BONUS_INITIAL_SPAWN_SECONDS}s · collection ${HARVEST_BONUS_RESPAWN_SECONDS}s · retry ${HARVEST_BONUS_SERVER_RETRY_SECONDS}s`,
      ].join("\n");
    }
    document.documentElement.dataset.pickupQaReady = "true";
    document.documentElement.dataset.pickupQaPass = String(Boolean(result.pass));
    document.documentElement.dataset.pickupQaRegion = String(result.regionId || "");
    document.documentElement.dataset.pickupQaZone = String(result.searchZone || "");
    document.documentElement.dataset.pickupQaVisible = String(Boolean(result.visible));
    document.documentElement.dataset.pickupQaClickable = String(Boolean(result.clickable));
    document.documentElement.dataset.pickupQaGlow = String(Boolean(result.glowVisible));
    qaRoot.dataset.pass = String(Boolean(result.pass));
    return result;
  }

  async function switchToRegion(regionId) {
    const normalizedRegionId = normalizeRegionId(regionId);
    if (getActiveMapRegionId() !== normalizedRegionId) {
      await switchOnlineIsland(normalizedRegionId, { fromMapPicker: true });
      await waitForMapReady();
    }
    qaRegionSelect.value = normalizedRegionId;
    return normalizedRegionId;
  }

  async function placeQaPickup(regionId = qaRegionSelect?.value || getActiveMapRegionId(), type = "gold") {
    await waitForBenchmarkReady();
    const normalizedRegionId = normalizeRegionId(regionId);
    state.harvestBonuses = [];
    setHarvestSpawnDelay(HARVEST_BONUS_INITIAL_SPAWN_SECONDS);
    resetDailyPickupCounts();
    await switchToRegion(normalizedRegionId);
    state.harvestBonuses = [];
    let point = null;
    for (let attempt = 0; attempt < 3 && !point; attempt += 1) point = createHarvestBonusPoint(normalizedRegionId);
    if (point) {
      state.harvestBonuses = [createHarvestBonusRecord(normalizedRegionId, type, point)];
    }
    applyQaZoom();
    renderHarvestBonuses();
    if (point) drawQaOverlays(normalizedRegionId, point);
    await wait(180);
    return renderDiagnostic(inspectPickup(normalizedRegionId));
  }

  function renderMapResults() {
    if (!qaResults) return;
    if (!qaState.mapResults.length) {
      qaResults.innerHTML = "";
      return;
    }
    const passed = qaState.mapResults.filter(result => result.pass).length;
    qaResults.innerHTML = `<strong>${passed}/${qaState.mapResults.length} maps passed</strong><ol>${qaState.mapResults.map(result => (
      `<li data-region-id="${escapeHtml(result.regionId)}" data-pass="${result.pass}">${result.pass ? "✓" : "✕"} ${escapeHtml(result.label)} — ${escapeHtml(result.searchZone)} (${(result.centerFraction * 100).toFixed(1)}%)</li>`
    )).join("")}</ol>`;
    qaRoot.dataset.mapPassCount = String(passed);
    qaRoot.dataset.mapCount = String(qaState.mapResults.length);
  }

  async function runAllMaps() {
    setQaBusy(true, `Checking ${maps.length} maps…`);
    qaState.mapResults = [];
    try {
      for (const [index, map] of maps.entries()) {
        qaStatus.textContent = `Checking map ${index + 1}/${maps.length}: ${map.label}`;
        const result = await placeQaPickup(map.id, index % 2 ? "troops" : "gold");
        qaState.mapResults.push(result);
        renderMapResults();
      }
      const passed = qaState.mapResults.filter(result => result.pass).length;
      document.documentElement.dataset.pickupQaAllMaps = String(passed === maps.length);
      renderDiagnostic(qaState.mapResults.at(-1));
    } finally {
      setQaBusy(false);
    }
    return qaState.mapResults;
  }

  async function runLifecycleChecks() {
    setQaBusy(true, "Running timer and lifecycle checks…");
    try {
      await placeQaPickup(qaRegionSelect.value, "gold");
      const sourceRegionId = getActiveMapRegionId();
      const sourceBonus = getAllActiveHarvestBonuses()[0];
      const sourceBonusId = sourceBonus?.id || "";
      const initialDeadlineBefore = Date.now() + HARVEST_BONUS_INITIAL_SPAWN_SECONDS * 1000;
      setHarvestSpawnDelay(HARVEST_BONUS_INITIAL_SPAWN_SECONDS);
      const initialSeconds = getHarvestSpawnDelaySeconds();
      resetHarvestRespawnTimer();
      const respawnSeconds = getHarvestSpawnDelaySeconds();
      setHarvestSpawnDelay(HARVEST_BONUS_SERVER_RETRY_SECONDS);
      const retrySeconds = getHarvestSpawnDelaySeconds();

      state.harvestBonuses = sourceBonus ? [sourceBonus] : [];
      const duplicateBlocked = spawnHarvestBonus(sourceRegionId, "troops") === false
        && state.harvestBonuses.length === 1;

      const cappedDaily = ensureDailyCaptureTracker();
      cappedDaily.harvestedGoldBonuses = HARVEST_BONUS_DAILY_GOLD_LIMIT;
      cappedDaily.harvestedTroopBonuses = 0;
      cappedDaily.harvestedBonuses = HARVEST_BONUS_DAILY_GOLD_LIMIT;
      state.harvestBonuses = sourceBonus ? [sourceBonus] : [];
      renderHarvestBonuses();
      const dailyCapDisabled = Boolean(harvestLayer?.querySelector(".harvest-bonus-gold")?.disabled);
      resetDailyPickupCounts();

      const legacyBonus = sourceBonus ? { ...sourceBonus } : null;
      if (legacyBonus) {
        delete legacyBonus.createdAtMs;
        legacyBonus.createdAt = Math.max(0, Number(state.gameSeconds) || 0);
        state.harvestBonuses = [legacyBonus];
        pruneExpiredHarvestBonuses();
      }
      const legacySurvived = Boolean(legacyBonus && state.harvestBonuses.some(bonus => bonus.id === legacyBonus.id));

      const expiredBonus = sourceBonus
        ? { ...sourceBonus, id: `${sourceBonus.id}-expired`, createdAtMs: Date.now() - (HARVEST_BONUS_EXPIRE_SECONDS + 2) * 1000 }
        : null;
      state.harvestBonuses = expiredBonus ? [expiredBonus] : [];
      pruneExpiredHarvestBonuses();
      const expiredRemoved = Boolean(expiredBonus && !state.harvestBonuses.some(bonus => bonus.id === expiredBonus.id));

      state.harvestBonuses = sourceBonus ? [sourceBonus] : [];
      const sourceMapIndex = maps.findIndex(map => map.id === sourceRegionId);
      const targetRegionId = maps[(sourceMapIndex + 1 + maps.length) % maps.length].id;
      await switchToRegion(targetRegionId);
      updateHarvestBonuses();
      await wait(220);
      const relocatedBonus = getAllActiveHarvestBonuses().find(bonus => bonus.id === sourceBonusId) || null;
      const relocationSucceeded = Boolean(relocatedBonus
        && normalizeRegionId(relocatedBonus.regionId) === targetRegionId
        && isHarvestBonusTerrainSafePoint(relocatedBonus.x, relocatedBonus.y, targetRegionId));
      renderHarvestBonuses();
      applyQaZoom();
      if (relocatedBonus) drawQaOverlays(targetRegionId, relocatedBonus);
      await wait(140);
      const relocationDiagnostic = renderDiagnostic(inspectPickup(targetRegionId));

      qaState.lifecycle = {
        initialSeconds,
        respawnSeconds,
        retrySeconds,
        duplicateBlocked,
        dailyCapDisabled,
        legacySurvived,
        expiredRemoved,
        relocationSucceeded,
        initialDeadlineBefore,
        pass: initialSeconds === HARVEST_BONUS_INITIAL_SPAWN_SECONDS
          && respawnSeconds === HARVEST_BONUS_RESPAWN_SECONDS
          && retrySeconds === HARVEST_BONUS_SERVER_RETRY_SECONDS
          && duplicateBlocked && dailyCapDisabled && legacySurvived && expiredRemoved && relocationSucceeded
          && relocationDiagnostic.pass,
      };
      qaResults.innerHTML = `<strong>Lifecycle ${qaState.lifecycle.pass ? "passed" : "needs review"}</strong><ol>
        <li>Initial timer: ${initialSeconds}s</li>
        <li>Post-collection timer: ${respawnSeconds}s</li>
        <li>Failed-placement retry: ${retrySeconds}s</li>
        <li>Duplicate blocked: ${duplicateBlocked ? "yes" : "no"}</li>
        <li>Daily-cap pickup disabled: ${dailyCapDisabled ? "yes" : "no"}</li>
        <li>Legacy pickup retained: ${legacySurvived ? "yes" : "no"}</li>
        <li>Expired pickup removed: ${expiredRemoved ? "yes" : "no"}</li>
        <li>Map relocation safe: ${relocationSucceeded ? "yes" : "no"}</li>
      </ol>`;
      document.documentElement.dataset.pickupQaLifecycle = String(qaState.lifecycle.pass);
    } finally {
      setQaBusy(false);
    }
    return qaState.lifecycle;
  }

  function installQaUi() {
    const style = document.createElement("style");
    style.textContent = `
      .pickup-qa-panel { position: fixed; z-index: 10020; right: 10px; top: 68px; width: min(330px, calc(100vw - 20px)); max-height: calc(100vh - 80px); overflow: auto; padding: 12px; border: 1px solid rgba(244,214,133,.62); border-radius: 12px; color: #f8ecd0; background: rgba(8,18,28,.94); box-shadow: 0 12px 42px rgba(0,0,0,.5); font: 12px/1.4 system-ui, sans-serif; }
      .pickup-qa-panel h2 { margin: 0 0 8px; font: 700 15px/1.2 system-ui, sans-serif; color: #ffe49a; }
      .pickup-qa-controls { display: grid; grid-template-columns: 1fr 92px; gap: 7px; }
      .pickup-qa-controls button, .pickup-qa-controls select { min-height: 36px; border: 1px solid rgba(255,226,154,.35); border-radius: 7px; color: #fff4d1; background: #172b3b; font: inherit; }
      .pickup-qa-controls button { cursor: pointer; }
      .pickup-qa-controls button[data-wide] { grid-column: 1 / -1; }
      .pickup-qa-status { margin: 9px 0 0; padding: 8px; border-radius: 8px; white-space: pre-wrap; color: #dce9ef; background: rgba(0,0,0,.28); }
      .pickup-qa-panel[data-pass="true"] .pickup-qa-status { box-shadow: inset 3px 0 #64d889; }
      .pickup-qa-panel[data-pass="false"] .pickup-qa-status { box-shadow: inset 3px 0 #ff7b69; }
      .pickup-qa-results { margin-top: 8px; }
      .pickup-qa-results ol { max-height: 180px; margin: 5px 0 0; padding-left: 22px; overflow: auto; }
      .pickup-qa-results li[data-pass="false"] { color: #ff9b8b; }
      .pickup-qa-zone { position: absolute; z-index: 0; transform: translate(-50%, -50%); border: 2px dashed rgba(118,225,255,.48); border-radius: 50%; background: rgba(60,175,223,.035); pointer-events: none; }
      .pickup-qa-zone[data-fraction="0.15"] { border-color: rgba(255,232,138,.68); }
      .pickup-qa-marker { position: absolute; z-index: 3; width: 92px; height: 92px; transform: translate(-50%, -50%); border: 3px solid #fff4a8; border-radius: 50%; box-shadow: 0 0 0 3px rgba(6,18,29,.72), 0 0 26px rgba(255,225,98,.9); pointer-events: none; }
      .pickup-qa-marker::before, .pickup-qa-marker::after { content: ""; position: absolute; left: 50%; top: 50%; background: #fff7c2; transform: translate(-50%, -50%); }
      .pickup-qa-marker::before { width: 112px; height: 2px; }
      .pickup-qa-marker::after { width: 2px; height: 112px; }
      @media (max-width: 680px) { .pickup-qa-panel { top: 74px; bottom: auto; right: 8px; width: min(290px, calc(100vw - 16px)); max-height: 38vh; } }
    `;
    document.head.appendChild(style);

    qaRoot = document.createElement("aside");
    qaRoot.id = "pickup-qa-panel";
    qaRoot.className = "pickup-qa-panel";
    qaRoot.setAttribute("aria-label", "Pickup visual QA controls");
    qaRoot.innerHTML = `
      <h2>Pickup visual QA · local only</h2>
      <div class="pickup-qa-controls">
        <select id="pickup-qa-region" aria-label="QA map">${maps.map(map => `<option value="${escapeHtml(map.id)}">${escapeHtml(map.label)}</option>`).join("")}</select>
        <select id="pickup-qa-zoom" aria-label="QA zoom"><option value="0.5">Low zoom</option><option value="0.7" selected>Medium</option><option value="1">High zoom</option></select>
        <button id="pickup-qa-place" type="button">Place pickup</button>
        <button id="pickup-qa-refresh" type="button">Refresh</button>
        <button id="pickup-qa-lifecycle" type="button" data-wide>Run lifecycle checks</button>
        <button id="pickup-qa-all-maps" type="button" data-wide>Run all ${maps.length} maps</button>
      </div>
      <pre id="pickup-qa-status" class="pickup-qa-status">Waiting for benchmark…</pre>
      <div id="pickup-qa-results" class="pickup-qa-results" aria-live="polite"></div>
    `;
    document.body.appendChild(qaRoot);
    qaStatus = qaRoot.querySelector("#pickup-qa-status");
    qaResults = qaRoot.querySelector("#pickup-qa-results");
    qaRegionSelect = qaRoot.querySelector("#pickup-qa-region");
    qaZoomSelect = qaRoot.querySelector("#pickup-qa-zoom");
    if ([0.5, 0.7, 1].includes(requestedQaZoom)) qaZoomSelect.value = String(requestedQaZoom);
    if (maps.some(map => map.id === requestedQaRegionId)) qaRegionSelect.value = requestedQaRegionId;

    qaRoot.querySelector("#pickup-qa-place").addEventListener("click", () => runQaAction(async () => {
      setQaBusy(true, "Placing pickup…");
      try { await placeQaPickup(); } finally { setQaBusy(false); }
    }));
    qaRoot.querySelector("#pickup-qa-refresh").addEventListener("click", () => renderDiagnostic(inspectPickup()));
    qaRoot.querySelector("#pickup-qa-lifecycle").addEventListener("click", () => runQaAction(runLifecycleChecks));
    qaRoot.querySelector("#pickup-qa-all-maps").addEventListener("click", () => runQaAction(runAllMaps));
    qaZoomSelect.addEventListener("change", () => runQaAction(async () => {
      applyQaZoom();
      const bonus = getActiveHarvestBonuses()[0];
      if (bonus) drawQaOverlays(getActiveMapRegionId(), bonus);
      await wait(140);
      renderDiagnostic(inspectPickup());
    }));
    harvestLayer?.addEventListener("click", event => {
      if (!event.target.closest(".harvest-bonus-node")) return;
      window.setTimeout(() => renderDiagnostic(inspectPickup()), 120);
    });
  }

  window.__CROWNLANDS_PICKUP_QA__ = Object.freeze({
    getState: () => ({ ...qaState, mapResults: [...qaState.mapResults] }),
    inspect: inspectPickup,
  });

  installQaUi();
  (async () => {
    try {
      await waitForBenchmarkReady();
      const initialRegionId = maps.some(map => map.id === requestedQaRegionId)
        ? requestedQaRegionId
        : getActiveMapRegionId();
      qaRegionSelect.value = initialRegionId;
      await placeQaPickup(initialRegionId, "gold");
    } catch (error) {
      qaStatus.textContent = `ERROR · ${error?.message || error}`;
      qaRoot.dataset.pass = "false";
      document.documentElement.dataset.pickupQaError = String(error?.message || error);
      console.error("Crownlands pickup QA failed to initialize", error);
    }
  })();
})();
