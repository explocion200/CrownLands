
/* Crownlands Phase 0 benchmark runtime. Appended in memory by the loopback server only. */
(function installCrownlandsBenchmarkRuntime() {
  "use strict";

  const fixture = window.__CROWNLANDS_BENCHMARK_BOOTSTRAP__;
  const instrumentation = window.__CROWNLANDS_BENCHMARK_INSTRUMENTATION__;
  if (!fixture || !instrumentation || location.hostname !== "127.0.0.1") {
    throw new Error("Crownlands benchmark runtime requires the loopback benchmark server.");
  }

  const benchmarkState = {
    status: "starting",
    error: "",
    regionLoadLatencyMs: null,
    createdArmies: [],
  };

  const requestedProfile = new URLSearchParams(location.search).get("profile");
  const marchProfileEnabled = requestedProfile === "marches";
  const zoomProfileEnabled = requestedProfile === "zoom";
  const marchProfileState = {
    active: false,
    startedAt: 0,
    functions: Object.create(null),
    stack: [],
  };

  function recordMarchProfileCall(name, durationMs, selfMs) {
    const record = marchProfileState.functions[name] || (marchProfileState.functions[name] = {
      calls: 0,
      totalMs: 0,
      selfMs: 0,
      maxMs: 0,
      samples: [],
    });
    record.calls += 1;
    record.totalMs += durationMs;
    record.selfMs += selfMs;
    record.maxMs = Math.max(record.maxMs, durationMs);
    if (["renderArmies", "renderPaths", "renderCities", "renderPanel"].includes(name) && record.samples.length < 2000) {
      record.samples.push(durationMs);
    }
  }

  function profileMarchFunction(name, original) {
    return function profiledMarchFunction(...args) {
      if (!marchProfileState.active) return original.apply(this, args);
      const frame = { startedAt: performance.now(), childMs: 0 };
      marchProfileState.stack.push(frame);
      try {
        return original.apply(this, args);
      } finally {
        const durationMs = performance.now() - frame.startedAt;
        marchProfileState.stack.pop();
        recordMarchProfileCall(name, durationMs, Math.max(0, durationMs - frame.childMs));
        const parent = marchProfileState.stack[marchProfileState.stack.length - 1];
        if (parent) parent.childMs += durationMs;
      }
    };
  }

  function installMarchProfileHooks() {
    if (!marchProfileEnabled) return;
    frame = profileMarchFunction("frame", frame);
    updateGame = profileMarchFunction("updateGame", updateGame);
    updateEconomy = profileMarchFunction("updateEconomy", updateEconomy);
    updateHarvestBonuses = profileMarchFunction("updateHarvestBonuses", updateHarvestBonuses);
    updateAttacks = profileMarchFunction("updateAttacks", updateAttacks);
    checkGameOver = profileMarchFunction("checkGameOver", checkGameOver);
    samplePerformancePanel = profileMarchFunction("samplePerformancePanel", samplePerformancePanel);
    updatePerformancePanel = profileMarchFunction("updatePerformancePanel", updatePerformancePanel);
    updateDeploymentCheck = profileMarchFunction("updateDeploymentCheck", updateDeploymentCheck);
    renderHud = profileMarchFunction("renderHud", renderHud);
    renderHudStatusPanels = profileMarchFunction("renderHudStatusPanels", renderHudStatusPanels);
    getCityStats = profileMarchFunction("getCityStats", getCityStats);
    getGoldPerSecond = profileMarchFunction("getGoldPerSecond", getGoldPerSecond);
    playerCities = profileMarchFunction("playerCities", playerCities);
    renderArmies = profileMarchFunction("renderArmies", renderArmies);
    renderPaths = profileMarchFunction("renderPaths", renderPaths);
    renderCities = profileMarchFunction("renderCities", renderCities);
    renderPanel = profileMarchFunction("renderPanel", renderPanel);
    getRenderableArmies = profileMarchFunction("getRenderableArmies", getRenderableArmies);
    getRenderableRemoteArmy = profileMarchFunction("getRenderableRemoteArmy", getRenderableRemoteArmy);
    getOnlineArmyRemainingSeconds = profileMarchFunction("getOnlineArmyRemainingSeconds", getOnlineArmyRemainingSeconds);
    getOnlineArmyResolutionId = profileMarchFunction("getOnlineArmyResolutionId", getOnlineArmyResolutionId);
    usesServerArmyAuthority = profileMarchFunction("usesServerArmyAuthority", usesServerArmyAuthority);
    resolvePlayerIdentityForUid = profileMarchFunction("resolvePlayerIdentityForUid", resolvePlayerIdentityForUid);
    getArmyTargetById = profileMarchFunction("getArmyTargetById", getArmyTargetById);
    getArmyTravelProgress = profileMarchFunction("getArmyTravelProgress", getArmyTravelProgress);
    getMissionPointAtProgress = profileMarchFunction("getMissionPointAtProgress", getMissionPointAtProgress);
    getMissionRouteSegments = profileMarchFunction("getMissionRouteSegments", getMissionRouteSegments);
    getMissionSegmentsForRegion = profileMarchFunction("getMissionSegmentsForRegion", getMissionSegmentsForRegion);
    pointAlongRoute = profileMarchFunction("pointAlongRoute", pointAlongRoute);
    worldToMapPoint = profileMarchFunction("worldToMapPoint", worldToMapPoint);
    getVisibleWorldBounds = profileMarchFunction("getVisibleWorldBounds", getVisibleWorldBounds);
    isMarchInsideEndpointInteractionClearance = profileMarchFunction("isMarchInsideEndpointInteractionClearance", isMarchInsideEndpointInteractionClearance);
    updateArmyTokenElement = profileMarchFunction("updateArmyTokenElement", updateArmyTokenElement);
    createArmyTokenElement = profileMarchFunction("createArmyTokenElement", createArmyTokenElement);
    getArmyTokenParts = profileMarchFunction("getArmyTokenParts", getArmyTokenParts);
    isPersonalArmy = profileMarchFunction("isPersonalArmy", isPersonalArmy);
    isCurrentClanmateArmy = profileMarchFunction("isCurrentClanmateArmy", isCurrentClanmateArmy);
    getArmyTroopDisplayText = profileMarchFunction("getArmyTroopDisplayText", getArmyTroopDisplayText);
    getArmyEndpointDetails = profileMarchFunction("getArmyEndpointDetails", getArmyEndpointDetails);
    getArmyRouteRelationshipClass = profileMarchFunction("getArmyRouteRelationshipClass", getArmyRouteRelationshipClass);
    buildTaperedRoutePolygon = profileMarchFunction("buildTaperedRoutePolygon", buildTaperedRoutePolygon);
    getCityRenderSignature = profileMarchFunction("getCityRenderSignature", getCityRenderSignature);
    updateVisibleCityDynamicText = profileMarchFunction("updateVisibleCityDynamicText", updateVisibleCityDynamicText);
    updateMapDensityMode = profileMarchFunction("updateMapDensityMode", updateMapDensityMode);

    const domMethods = [
      [Element.prototype, "querySelector", "DOM.Element.querySelector"],
      [Element.prototype, "querySelectorAll", "DOM.Element.querySelectorAll"],
      [Element.prototype, "setAttribute", "DOM.Element.setAttribute"],
      [Element.prototype, "appendChild", "DOM.Element.appendChild"],
      [Element.prototype, "remove", "DOM.Element.remove"],
      [Document.prototype, "querySelector", "DOM.Document.querySelector"],
      [Document.prototype, "querySelectorAll", "DOM.Document.querySelectorAll"],
      [Document.prototype, "createElement", "DOM.Document.createElement"],
      [Document.prototype, "createElementNS", "DOM.Document.createElementNS"],
      [DocumentFragment.prototype, "appendChild", "DOM.Fragment.appendChild"],
      [DOMTokenList.prototype, "toggle", "DOM.classList.toggle"],
      [CSSStyleDeclaration.prototype, "setProperty", "DOM.style.setProperty"],
    ];
    for (const [prototype, method, name] of domMethods) {
      if (typeof prototype?.[method] !== "function") continue;
      prototype[method] = profileMarchFunction(name, prototype[method]);
    }
  }

  function resetMarchProfile() {
    marchProfileState.functions = Object.create(null);
    marchProfileState.stack = [];
    marchProfileState.startedAt = performance.now();
    marchProfileState.active = marchProfileEnabled;
    return marchProfileState.active;
  }

  function percentile(values, fraction) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
  }

  function getMarchProfile({ stop = true } = {}) {
    const endedAt = performance.now();
    if (stop) marchProfileState.active = false;
    const functions = Object.fromEntries(Object.entries(marchProfileState.functions).map(([name, record]) => [name, {
      calls: record.calls,
      totalMs: record.totalMs,
      selfMs: record.selfMs,
      averageMs: record.calls ? record.totalMs / record.calls : 0,
      maxMs: record.maxMs,
      medianMs: percentile(record.samples, 0.5),
      p95Ms: percentile(record.samples, 0.95),
    }]));
    return {
      enabled: marchProfileEnabled,
      durationMs: Math.max(0, endedAt - marchProfileState.startedAt),
      functions,
      rankedBySelfTime: Object.entries(functions)
        .sort((left, right) => right[1].selfMs - left[1].selfMs)
        .map(([name, record]) => ({ name, ...record })),
      tokenDomNodes: armyLayer ? armyLayer.querySelectorAll("*").length : 0,
      tokenCount: armyLayer?.querySelectorAll(".army-token").length || 0,
      routeSvgNodes: pathsSvg?.querySelectorAll("*").length || 0,
    };
  }

  const zoomProfileState = {
    active: false,
    startedAt: 0,
    functions: Object.create(null),
    stack: [],
    operations: Object.create(null),
    mutations: null,
    observer: null,
    initialSnapshot: null,
  };

  function recordZoomProfileCall(name, durationMs, selfMs) {
    const record = zoomProfileState.functions[name] || (zoomProfileState.functions[name] = {
      calls: 0,
      totalMs: 0,
      selfMs: 0,
      maxMs: 0,
    });
    record.calls += 1;
    record.totalMs += durationMs;
    record.selfMs += selfMs;
    record.maxMs = Math.max(record.maxMs, durationMs);
  }

  function profileZoomFunction(name, original) {
    return function profiledZoomFunction(...args) {
      if (!zoomProfileState.active) return original.apply(this, args);
      const frame = { startedAt: performance.now(), childMs: 0 };
      zoomProfileState.stack.push(frame);
      try {
        return original.apply(this, args);
      } finally {
        const durationMs = performance.now() - frame.startedAt;
        zoomProfileState.stack.pop();
        recordZoomProfileCall(name, durationMs, Math.max(0, durationMs - frame.childMs));
        const parent = zoomProfileState.stack[zoomProfileState.stack.length - 1];
        if (parent) parent.childMs += durationMs;
      }
    };
  }

  function recordZoomOperation(name, args, before, after) {
    const normalizedArgs = args.map(value => String(value)).join(", ").slice(0, 180);
    const key = `${name}(${normalizedArgs})`;
    const record = zoomProfileState.operations[key] || (zoomProfileState.operations[key] = {
      operation: name,
      arguments: normalizedArgs,
      calls: 0,
      changed: 0,
      unchanged: 0,
      examples: [],
    });
    const changed = before !== after;
    record.calls += 1;
    record[changed ? "changed" : "unchanged"] += 1;
    if (record.examples.length < 4) record.examples.push({ before, after });
  }

  function profileZoomDomMethod(prototype, method, name, readValue) {
    const original = prototype?.[method];
    if (typeof original !== "function") return;
    prototype[method] = function profiledZoomDomMethod(...args) {
      if (!zoomProfileState.active) return original.apply(this, args);
      const before = readValue(this);
      const startedAt = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const after = readValue(this);
        const durationMs = performance.now() - startedAt;
        recordZoomOperation(name, args, before, after);
        recordZoomProfileCall(name, durationMs, durationMs);
      }
    };
  }

  function getZoomMutationTarget(element) {
    if (!(element instanceof Element)) return "other";
    if (element === mapFrame) return "map-frame";
    if (element === mapWorld) return "map-world";
    if (element.classList.contains("city-node")) return "city-node";
    if (element.classList.contains("city-label")) return "city-label";
    if (element.classList.contains("city-castle")) return "city-castle";
    if (element.classList.contains("city-shield-field")) return "city-shield";
    if (element.classList.contains("camp-node")) return "camp-node";
    if (element.classList.contains("teleport-node")) return "teleport-node";
    if (element.classList.contains("army-token")) return "army-token";
    if (element.closest?.("#pathsSvg")) return "route-svg";
    if (element.closest?.("#armyLayer")) return "army-layer-child";
    if (element.closest?.("#cityLayer")) return "city-layer-child";
    return element.tagName?.toLowerCase() || "other";
  }

  function resetZoomMutationSummary() {
    return {
      total: 0,
      attributes: 0,
      childList: 0,
      characterData: 0,
      addedNodes: 0,
      removedNodes: 0,
      attributeNames: Object.create(null),
      targetKinds: Object.create(null),
      classChanges: [],
      styleChanges: [],
    };
  }

  function recordZoomMutations(records) {
    if (!zoomProfileState.mutations) return;
    for (const mutation of records) {
      const summary = zoomProfileState.mutations;
      const targetKind = getZoomMutationTarget(mutation.target);
      summary.total += 1;
      summary[mutation.type] = (summary[mutation.type] || 0) + 1;
      summary.targetKinds[targetKind] = (summary.targetKinds[targetKind] || 0) + 1;
      if (mutation.type === "attributes") {
        const attributeName = mutation.attributeName || "unknown";
        summary.attributeNames[attributeName] = (summary.attributeNames[attributeName] || 0) + 1;
        const changes = attributeName === "class" ? summary.classChanges
          : attributeName === "style" ? summary.styleChanges : null;
        if (changes && changes.length < 80) {
          changes.push({
            target: targetKind,
            oldValue: mutation.oldValue || "",
            newValue: mutation.target.getAttribute(attributeName) || "",
          });
        }
      } else if (mutation.type === "childList") {
        summary.addedNodes += mutation.addedNodes.length;
        summary.removedNodes += mutation.removedNodes.length;
      }
    }
  }

  function getZoomVisualSnapshot() {
    const selectorStyles = {};
    for (const [name, selector] of Object.entries({
      terrain: ".world-land, .world-mountain",
      route: "#pathsSvg .army-route-flow",
      city: ".city-node",
      cityCastle: ".city-castle",
      cityShield: ".city-shield-field",
      cityLabel: ".city-label",
      cityName: ".city-name",
      camp: ".camp-node",
      teleport: ".teleport-node",
      army: ".army-token",
      armyCount: ".army-token-count",
      armyTime: ".army-token-time",
    })) {
      const element = mapWorld?.querySelector(selector);
      if (!element) {
        selectorStyles[name] = null;
        continue;
      }
      const style = getComputedStyle(element);
      selectorStyles[name] = {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        filter: style.filter,
        boxShadow: style.boxShadow,
        animationName: style.animationName,
        transitionProperty: style.transitionProperty,
      };
    }
    return {
      zoom,
      detailLevel: typeof mapDetailLevel === "string" ? mapDetailLevel : "",
      mapFrameClass: mapFrame?.className || "",
      mapWorldTransform: mapWorld?.style.transform || "",
      mapHitSize: mapWorld?.style.getPropertyValue("--map-hit-size") || "",
      mapWorldNodeCount: mapWorld?.querySelectorAll("*").length || 0,
      cityCount: cityLayer?.querySelectorAll(".city-node").length || 0,
      visibleCityCount: getVisibleCount(".city-node", cityLayer),
      visibleLabelCount: getVisibleCount(".city-label", cityLayer),
      armyCount: armyLayer?.querySelectorAll(".army-token").length || 0,
      visibleArmyCount: getVisibleCount(".army-token", armyLayer),
      routeCount: pathsSvg?.querySelectorAll(".army-route-flow, .army-route-ribbon").length || 0,
      selectorStyles,
    };
  }

  function installZoomProfileHooks() {
    if (!zoomProfileEnabled) return;
    setZoomAroundPoint = profileZoomFunction("setZoomAroundPoint", setZoomAroundPoint);
    scheduleCameraTransform = profileZoomFunction("scheduleCameraTransform", scheduleCameraTransform);
    applyCameraTransform = profileZoomFunction("applyCameraTransform", applyCameraTransform);
    updateZoomPerformanceClasses = profileZoomFunction("updateZoomPerformanceClasses", updateZoomPerformanceClasses);
    shouldUseLowZoomPerformance = profileZoomFunction("shouldUseLowZoomPerformance", shouldUseLowZoomPerformance);
    getMapDetailLevel = profileZoomFunction("getMapDetailLevel", getMapDetailLevel);
    getZoomBoundsForViewport = profileZoomFunction("getZoomBoundsForViewport", getZoomBoundsForViewport);
    clampZoomForViewport = profileZoomFunction("clampZoomForViewport", clampZoomForViewport);
    getMapViewportOffset = profileZoomFunction("getMapViewportOffset", getMapViewportOffset);
    markZoomInteraction = profileZoomFunction("markZoomInteraction", markZoomInteraction);
    markCameraInteraction = profileZoomFunction("markCameraInteraction", markCameraInteraction);
    finishCameraInteraction = profileZoomFunction("finishCameraInteraction", finishCameraInteraction);
    queueDeferredMapRender = profileZoomFunction("queueDeferredMapRender", queueDeferredMapRender);
    flushDeferredMapRender = profileZoomFunction("flushDeferredMapRender", flushDeferredMapRender);
    updateMainCityReturnButtonForCamera = profileZoomFunction("updateMainCityReturnButtonForCamera", updateMainCityReturnButtonForCamera);
    updateMainCityReturnButton = profileZoomFunction("updateMainCityReturnButton", updateMainCityReturnButton);
    renderArmies = profileZoomFunction("renderArmies", renderArmies);
    renderPaths = profileZoomFunction("renderPaths", renderPaths);
    renderCities = profileZoomFunction("renderCities", renderCities);
    updateVisibleCityDynamicText = profileZoomFunction("updateVisibleCityDynamicText", updateVisibleCityDynamicText);
    updateMapDensityMode = profileZoomFunction("updateMapDensityMode", updateMapDensityMode);

    profileZoomDomMethod(DOMTokenList.prototype, "add", "DOM.classList.add", value => value.value);
    profileZoomDomMethod(DOMTokenList.prototype, "remove", "DOM.classList.remove", value => value.value);
    profileZoomDomMethod(DOMTokenList.prototype, "toggle", "DOM.classList.toggle", value => value.value);
    profileZoomDomMethod(CSSStyleDeclaration.prototype, "setProperty", "DOM.style.setProperty", value => value.cssText);
    profileZoomDomMethod(CSSStyleDeclaration.prototype, "removeProperty", "DOM.style.removeProperty", value => value.cssText);
    profileZoomDomMethod(Element.prototype, "setAttribute", "DOM.Element.setAttribute", value => `${value.className || ""}|${value.getAttribute("style") || ""}`);
    profileZoomDomMethod(Element.prototype, "removeAttribute", "DOM.Element.removeAttribute", value => `${value.className || ""}|${value.getAttribute("style") || ""}`);
  }

  function resetZoomProfile() {
    if (zoomProfileState.observer) zoomProfileState.observer.disconnect();
    zoomProfileState.functions = Object.create(null);
    zoomProfileState.stack = [];
    zoomProfileState.operations = Object.create(null);
    zoomProfileState.mutations = resetZoomMutationSummary();
    zoomProfileState.initialSnapshot = getZoomVisualSnapshot();
    zoomProfileState.startedAt = performance.now();
    zoomProfileState.active = zoomProfileEnabled;
    if (zoomProfileEnabled && mapFrame) {
      zoomProfileState.observer = new MutationObserver(recordZoomMutations);
      zoomProfileState.observer.observe(mapFrame, {
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        childList: true,
        characterData: true,
      });
    }
    return zoomProfileState.active;
  }

  function getZoomProfile({ stop = true } = {}) {
    if (zoomProfileState.observer) recordZoomMutations(zoomProfileState.observer.takeRecords());
    const endedAt = performance.now();
    if (stop) {
      zoomProfileState.active = false;
      zoomProfileState.observer?.disconnect();
    }
    const functions = Object.fromEntries(Object.entries(zoomProfileState.functions).map(([name, record]) => [name, {
      calls: record.calls,
      totalMs: record.totalMs,
      selfMs: record.selfMs,
      averageMs: record.calls ? record.totalMs / record.calls : 0,
      maxMs: record.maxMs,
    }]));
    return {
      enabled: zoomProfileEnabled,
      durationMs: Math.max(0, endedAt - zoomProfileState.startedAt),
      initialSnapshot: zoomProfileState.initialSnapshot,
      finalSnapshot: getZoomVisualSnapshot(),
      functions,
      rankedBySelfTime: Object.entries(functions)
        .sort((left, right) => right[1].selfMs - left[1].selfMs)
        .map(([name, record]) => ({ name, ...record })),
      operations: Object.values(zoomProfileState.operations).sort((left, right) => right.calls - left.calls),
      mutations: zoomProfileState.mutations,
    };
  }

  installMarchProfileHooks();
  installZoomProfileHooks();

  function createBenchmarkArmies() {
    const cities = state.cities.filter(city => getCityRegionId(city) === fixture.primaryRegionId && !isStronghold(city));
    const count = fixture.scenario.marchCount;
    return Array.from({ length: count }, (_, index) => {
      const source = cities[index % cities.length];
      const target = cities[(index * 17 + Math.floor(cities.length / 2) + 1) % cities.length];
      const midpoint = {
        x: Math.round((source.x + target.x) / 2 + ((index % 5) - 2) * 18),
        y: Math.round((source.y + target.y) / 2 + (((index * 3) % 5) - 2) * 14),
      };
      const points = [
        { x: source.x, y: source.y },
        midpoint,
        { x: target.x, y: target.y },
      ];
      const firstLength = Math.hypot(midpoint.x - source.x, midpoint.y - source.y);
      const secondLength = Math.hypot(target.x - midpoint.x, target.y - midpoint.y);
      const pathLength = firstLength + secondLength;
      const launchedAtMs = fixture.fixedEpochMs - 45000 - (index % 7) * 1000;
      const arrivesAtMs = fixture.fixedEpochMs + 21600000 + (index % 11) * 9000;
      const visualKinds = ["attack", "transfer", "scout", "reinforce", "rally_join"];
      const missionKind = fixture.scenario.visualKinds
        ? visualKinds[index % visualKinds.length]
        : index % 9 === 0 ? "reinforce" : index % 5 === 0 ? "scout" : "attack";
      const ownerIsPlayer = fixture.scenario.visualKinds || index % 8 === 0;
      return {
        id: `benchmark-army-${String(index + 1).padStart(3, "0")}`,
        ownerKind: "player",
        ownerUid: ownerIsPlayer ? fixture.player.uid : `benchmark-rival-${index % 12}`,
        ownerName: ownerIsPlayer ? fixture.player.displayName : `Rival ${String(index % 12 + 1).padStart(2, "0")}`,
        ownerFlag: ownerIsPlayer
          ? { field: "#24466f", mark: "#e5cf94", markType: "chevron" }
          : { field: "#742f2a", mark: "#eadcb4", markType: "cross" },
        kind: missionKind,
        launchKind: missionKind,
        targetType: "city",
        fromId: source.id,
        toId: target.id,
        fromName: source.name,
        toName: target.name,
        sourceRegionId: fixture.primaryRegionId,
        targetRegionId: fixture.primaryRegionId,
        troops: 250 + index * 37,
        requestedTroops: 250 + index * 37,
        total: (arrivesAtMs - launchedAtMs) / 1000,
        launchedAtMs,
        arrivesAtMs,
        path: points,
        pathSegments: [{ regionId: fixture.primaryRegionId, points, length: pathLength }],
        pathLength,
        routeRegionIds: [fixture.primaryRegionId],
        targetOwnerAtLaunch: "neutral",
        targetOwnerUid: "",
        viewerAccess: ownerIsPlayer ? "owner" : "public",
        troopVisibility: ownerIsPlayer ? "exact" : "estimate",
        troopEstimateMin: 100,
        troopEstimateMax: 10000,
        troopEstimateLabel: "100–10K",
        status: "active",
        resetGeneration: fixture.releaseConfig.resetGeneration,
        worldId: fixture.releaseConfig.worldId,
      };
    });
  }

  function emitBenchmarkArmies() {
    const islandId = getOnlineIslandId(fixture.primaryRegionId);
    return window.CrownlandsOnline.__emitIslandArmies(islandId, benchmarkState.createdArmies);
  }

  function emitVisualQaArmies(armies) {
    const islandId = getOnlineIslandId(fixture.primaryRegionId);
    window.CrownlandsOnline.__emitIslandArmies(islandId, armies);
    renderAll();
    return {
      requested: armies.length,
      rendered: armyLayer?.querySelectorAll(".army-token").length || 0,
      routeNodes: pathsSvg?.querySelectorAll("polyline, polygon, path").length || 0,
    };
  }

  function setVisualMarchCount(count) {
    const normalizedCount = Math.max(0, Math.min(
      benchmarkState.createdArmies.length,
      Math.floor(Number(count) || 0)
    ));
    return emitVisualQaArmies(benchmarkState.createdArmies.slice(0, normalizedCount));
  }

  function showVisualMissionKinds() {
    const kinds = ["attack", "transfer", "scout", "reinforce", "rally_join"];
    const armies = benchmarkState.createdArmies.slice(0, kinds.length).map((army, index) => ({
      ...army,
      id: `benchmark-visual-${kinds[index]}`,
      kind: kinds[index],
      launchKind: kinds[index],
      ownerUid: fixture.player.uid,
      ownerName: fixture.player.displayName,
      viewerAccess: "owner",
      troopVisibility: "exact",
    }));
    return { ...emitVisualQaArmies(armies), kinds };
  }

  function createHudOperationArmies(mode = "none") {
    const normalizedMode = ["none", "incoming", "outgoing", "both"].includes(mode) ? mode : "none";
    const playerCity = state.cities.find(city => (
      city.owner === "player" || String(city.ownerUid || "") === fixture.player.uid
    ) && !isStronghold(city));
    const rivalCity = state.cities.find(city => (
      String(city.ownerUid || "") !== fixture.player.uid
    ) && !isStronghold(city));
    const template = benchmarkState.createdArmies[0];
    if (!playerCity || !rivalCity || !template) return [];
    const operationEndsAtMs = Date.now() + 10 * 60 * 1000;
    const common = {
      ...template,
      kind: "attack",
      launchKind: "attack",
      launchedAtMs: Date.now() - 30000,
      arrivesAtMs: operationEndsAtMs,
      status: "active",
      sourceRegionId: fixture.primaryRegionId,
      targetRegionId: fixture.primaryRegionId,
    };
    const armies = [];
    if (normalizedMode === "outgoing" || normalizedMode === "both") {
      armies.push({
        ...common,
        id: "benchmark-hud-outgoing",
        ownerUid: fixture.player.uid,
        ownerName: fixture.player.displayName,
        fromId: playerCity.id,
        fromName: playerCity.name,
        toId: rivalCity.id,
        toName: rivalCity.name,
        targetOwnerUid: String(rivalCity.ownerUid || ""),
        viewerAccess: "owner",
        troopVisibility: "exact",
      });
    }
    if (normalizedMode === "incoming" || normalizedMode === "both") {
      armies.push({
        ...common,
        id: "benchmark-hud-incoming",
        ownerUid: "benchmark-hud-rival",
        ownerName: "Rival Scout",
        fromId: rivalCity.id,
        fromName: rivalCity.name,
        toId: playerCity.id,
        toName: playerCity.name,
        targetOwnerUid: fixture.player.uid,
        viewerAccess: "target",
        troopVisibility: "estimate",
      });
    }
    return armies;
  }

  function setHudOperationState(mode = "none") {
    if (state) state.attacks = [];
    pendingOutgoingMissions = new Map();
    onlineArmiesByIsland = new Map();
    onlineArmies = [];
    onlineClanRallies = [];
    onlineReinforcements = [];
    onlineHeldCampStates.clear();
    onlineCampStates.forEach((camp, id) => onlineCampStates.set(id, { ...camp, holderUid: "" }));
    const armies = createHudOperationArmies(mode);
    const result = emitVisualQaArmies(armies);
    updateIncomingAttackUi();
    updateOutgoingAttackUi();
    return {
      ...result,
      mode,
      incomingVisible: Boolean(incomingAttackBtn && !incomingAttackBtn.hidden),
      outgoingVisible: Boolean(outgoingAttackBtn && !outgoingAttackBtn.hidden),
    };
  }

  function startHudChatQa() {
    return window.CrownlandsChat?.start?.({
      api: window.CrownlandsOnline,
      uid: fixture.player.uid,
      clanId: "benchmark-clan",
    });
  }

  function applyHudQaState() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const requestedOperationMode = hash.get("operations") || query.get("hudOperations") || "";
    const operationMode = requestedOperationMode || "baseline";
    const chatMode = hash.get("chat") || query.get("chatMode") || "closed";
    const operationResult = requestedOperationMode
      ? setHudOperationState(requestedOperationMode)
      : {
          ...emitVisualQaArmies(benchmarkState.createdArmies),
          mode: operationMode,
          incomingVisible: Boolean(incomingAttackBtn && !incomingAttackBtn.hidden),
          outgoingVisible: Boolean(outgoingAttackBtn && !outgoingAttackBtn.hidden),
        };
    const controller = window.CrownlandsChat?.init?.();
    if (["closed", "quick", "full"].includes(chatMode)) controller?.setMode?.(chatMode);
    const chat = controller?.diagnostics?.() || null;
    document.documentElement.dataset.hudQaOperations = String(operationMode);
    document.documentElement.dataset.hudQaOperationCount = String(operationResult.requested || 0);
    document.documentElement.dataset.hudQaIncomingVisible = String(operationResult.incomingVisible);
    document.documentElement.dataset.hudQaOutgoingVisible = String(operationResult.outgoingVisible);
    document.documentElement.dataset.hudQaChatMode = String(chat?.mode || "");
    document.documentElement.dataset.hudQaChatListeners = String(chat?.totalListeners || 0);
    document.documentElement.dataset.hudQaGlobalListeners = String(chat?.globalListeners || 0);
    document.documentElement.dataset.hudQaClanListeners = String(chat?.clanListeners || 0);
    return { operationResult, chat };
  }

  async function setVisualZoom(nextZoom) {
    const rect = mapFrame.getBoundingClientRect();
    zoom = clampZoomForViewport(Number(nextZoom) || MIN_ZOOM, rect);
    centerOnRegion(fixture.primaryRegionId);
    updateCameraTransform();
    renderAll();
    await wait(350);
    return getZoomVisualSnapshot();
  }

  function getVisibleCount(selector, root = document) {
    return [...root.querySelectorAll(selector)].filter(element => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    }).length;
  }

  function getImageMemoryEstimate() {
    const seen = new Set();
    let decodedBytesEstimate = 0;
    const images = [];
    document.querySelectorAll("img").forEach(image => {
      const source = image.currentSrc || image.src || "";
      if (!source || seen.has(source) || !image.complete || !image.naturalWidth || !image.naturalHeight) return;
      seen.add(source);
      const bytes = image.naturalWidth * image.naturalHeight * 4;
      decodedBytesEstimate += bytes;
      images.push({ source, width: image.naturalWidth, height: image.naturalHeight, decodedBytesEstimate: bytes });
    });
    return { decodedBytesEstimate, loadedUniqueImages: images.length, images };
  }

  function getRuntimeMetrics() {
    const listenerTelemetry = window.CrownlandsOnline.__getBenchmarkTelemetry();
    const cityNodes = cityLayer?.querySelectorAll(".city-node").length || 0;
    const campNodes = cityLayer?.querySelectorAll(".camp-node").length || 0;
    const strongholdNodes = cityLayer?.querySelectorAll(".stronghold, .stronghold-node, [data-stronghold-id]").length || 0;
    const armyNodes = armyLayer?.querySelectorAll(".army-token").length || armyLayer?.children.length || 0;
    const mapRoot = mapWorld || mapFrame;
    const runningAnimations = document.getAnimations ? document.getAnimations().filter(animation => animation.playState === "running") : [];
    return {
      scenario: fixture.scenario,
      regionId: getActiveMapRegionId(),
      dataCityCount: state.cities.filter(city => getCityRegionId(city) === getActiveMapRegionId() && !isStronghold(city)).length,
      dataMarchCount: getRenderableArmies().length,
      dom: {
        totalNodes: document.getElementsByTagName("*").length,
        mapWorldNodes: mapRoot?.querySelectorAll("*").length || 0,
        cityNodes,
        visibleCityNodes: getVisibleCount(".city-node", cityLayer),
        campNodes,
        visibleCampNodes: getVisibleCount(".camp-node", cityLayer),
        strongholdNodes,
        marchNodes: armyNodes,
        visibleMarchNodes: getVisibleCount(".army-token", armyLayer),
        labelNodes: mapRoot?.querySelectorAll(".city-label, .city-name, .army-label, .camp-label").length || 0,
        svgElements: mapRoot?.querySelectorAll("svg").length || 0,
        svgPaths: mapRoot?.querySelectorAll("path, polyline, polygon").length || 0,
        worldVfxNodes: mapVfxLayer?.querySelectorAll("*").length || 0,
        screenVfxNodes: screenVfxLayer?.querySelectorAll("*").length || 0,
      },
      animations: {
        running: runningAnimations.length,
        applicationPersistentRafLoops: 1,
        measurementRafLoopsExcluded: 1,
      },
      timers: instrumentation.getTimerSnapshot(),
      realtime: listenerTelemetry,
      images: getImageMemoryEstimate(),
      performanceMemory: performance.memory
        ? {
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            usedJSHeapSize: performance.memory.usedJSHeapSize,
          }
        : null,
      camera: { x: camera.x, y: camera.y, zoom },
    };
  }

  async function wait(milliseconds) {
    await new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  async function waitForMapInteractionReady(timeoutMs = 5000) {
    const startedAt = performance.now();
    while (isMapInteractionBlocked()) {
      if (performance.now() - startedAt > timeoutMs) throw new Error("Map transition did not settle before the next benchmark action.");
      await wait(25);
    }
  }

  async function selectAndOpenCities(count = 5) {
    const candidates = state.cities.filter(city => getCityRegionId(city) === getActiveMapRegionId() && !isStronghold(city));
    const selected = [];
    for (let index = 0; index < Math.min(count, candidates.length); index += 1) {
      const city = candidates[(index * 19) % candidates.length];
      selectCity(city.id);
      await wait(80);
      showCityInfoModal(city.id);
      await wait(120);
      selected.push(city.id);
      if (modal.open) modal.close();
      await wait(80);
    }
    return selected;
  }

  async function switchNeighborAndReturn() {
    const before = window.CrownlandsOnline.__getBenchmarkTelemetry().listeners;
    const neighborStartedAt = performance.now();
    const neighborResult = await switchOnlineIsland(fixture.neighborRegionId, { fromMapPicker: true });
    await waitForMapInteractionReady();
    const neighborLatencyMs = performance.now() - neighborStartedAt;
    const atNeighbor = window.CrownlandsOnline.__getBenchmarkTelemetry().listeners;
    const returnStartedAt = performance.now();
    const returnResult = await switchOnlineIsland(fixture.primaryRegionId, { fromMapPicker: true });
    await waitForMapInteractionReady();
    const returnLatencyMs = performance.now() - returnStartedAt;
    emitBenchmarkArmies();
    zoom = MIN_ZOOM;
    centerOnRegion(fixture.primaryRegionId);
    renderAll();
    await wait(350);
    const after = window.CrownlandsOnline.__getBenchmarkTelemetry().listeners;
    return { neighborResult, returnResult, neighborLatencyMs, returnLatencyMs, before, atNeighbor, after };
  }

  const publicApi = {
    fixture: {
      benchmarkSeed: fixture.benchmarkSeed,
      fixedEpochMs: fixture.fixedEpochMs,
      scenario: fixture.scenario,
      primaryRegionId: fixture.primaryRegionId,
      neighborRegionId: fixture.neighborRegionId,
    },
    getStatus: () => ({ ...benchmarkState }),
    getMetrics: getRuntimeMetrics,
    beginSample: instrumentation.beginSample,
    endSample: instrumentation.endSample,
    selectAndOpenCities,
    switchNeighborAndReturn,
    setVisualMarchCount,
    showVisualMissionKinds,
    setHudOperationState,
    startHudChatQa,
    applyHudQaState,
    setVisualZoom,
    closeModal: () => { if (modal.open) modal.close(); },
    resetMarchProfile,
    getMarchProfile,
    resetZoomProfile,
    getZoomProfile,
  };
  window.__CROWNLANDS_BENCHMARK__ = publicApi;

  (async () => {
    try {
      const regionStartedAt = performance.now();
      watchGameServerMembership();
      await startFromInput(false);
      if (!state || !onlineWorldConnected) throw new Error(onlineLastError || "Benchmark game session did not connect.");
      benchmarkState.regionLoadLatencyMs = performance.now() - regionStartedAt;
      benchmarkState.createdArmies = createBenchmarkArmies();
      emitBenchmarkArmies();
      startHudChatQa();
      applyHudQaState();
      const requestedVisualZoom = Number(new URLSearchParams(location.search).get("visualZoom"));
      zoom = Number.isFinite(requestedVisualZoom)
        ? clampZoomForViewport(requestedVisualZoom)
        : MIN_ZOOM;
      centerOnRegion(fixture.primaryRegionId);
      renderAll();
      await wait(600);
      benchmarkState.status = "ready";
      document.documentElement.dataset.crownlandsBenchmarkReady = "true";
    } catch (error) {
      benchmarkState.status = "error";
      benchmarkState.error = error?.stack || error?.message || String(error);
      document.documentElement.dataset.crownlandsBenchmarkError = "true";
      console.error("Crownlands Phase 0 benchmark failed to start", error);
    }
  })();
  window.addEventListener("hashchange", applyHudQaState);
})();
