(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CROWNLANDS_REGION_CATALOG_RUNTIME = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CORE_RADIUS = 2;
  const MINIMUM_SPAWN_NPC_CITIES = 20;
  const REGION_DEFINITION_CACHE_LIMIT = 4;
  const REGION_PURPOSES = Object.freeze([
    "core_citadel",
    "core_stronghold",
    "core_camp",
    "core_support",
    "player_region",
  ]);
  const DIRECTIONS = Object.freeze({
    north: Object.freeze({ dx: 0, dy: -1, opposite: "south" }),
    east: Object.freeze({ dx: 1, dy: 0, opposite: "west" }),
    south: Object.freeze({ dx: 0, dy: 1, opposite: "north" }),
    west: Object.freeze({ dx: -1, dy: 0, opposite: "east" }),
  });

  function coordinateKey(gridX, gridY) {
    return `${Math.round(Number(gridX) || 0)},${Math.round(Number(gridY) || 0)}`;
  }

  function getWorldLayer(gridX, gridY, coreRadius = CORE_RADIUS) {
    return Math.max(0, Math.max(Math.abs(Number(gridX) || 0), Math.abs(Number(gridY) || 0)) - coreRadius);
  }

  function getClockwiseRingCoordinates(layer, coreRadius = CORE_RADIUS, ringAnchor = "north-west") {
    const normalizedLayer = Math.max(1, Math.floor(Number(layer) || 1));
    const radius = coreRadius + normalizedLayer;
    const coordinates = [];
    if (ringAnchor === "north-center") {
      for (let x = 0; x <= radius; x += 1) coordinates.push({ gridX: x, gridY: -radius });
      for (let y = -radius + 1; y <= radius; y += 1) coordinates.push({ gridX: radius, gridY: y });
      for (let x = radius - 1; x >= -radius; x -= 1) coordinates.push({ gridX: x, gridY: radius });
      for (let y = radius - 1; y >= -radius; y -= 1) coordinates.push({ gridX: -radius, gridY: y });
      for (let x = -radius + 1; x < 0; x += 1) coordinates.push({ gridX: x, gridY: -radius });
      return coordinates;
    }
    // Preserve the current-world north-west anchor unless a catalog explicitly
    // declares the reset world's north-center cardinal anchor.
    for (let x = -radius; x <= radius; x += 1) coordinates.push({ gridX: x, gridY: -radius });
    for (let y = -radius + 1; y <= radius; y += 1) coordinates.push({ gridX: radius, gridY: y });
    for (let x = radius - 1; x >= -radius; x -= 1) coordinates.push({ gridX: x, gridY: radius });
    for (let y = radius - 1; y > -radius; y -= 1) coordinates.push({ gridX: -radius, gridY: y });
    return coordinates;
  }

  function getClockwiseRingIndex(gridX, gridY, coreRadius = CORE_RADIUS, ringAnchor = "north-west") {
    const layer = getWorldLayer(gridX, gridY, coreRadius);
    if (layer < 1) return null;
    return getClockwiseRingCoordinates(layer, coreRadius, ringAnchor)
      .findIndex(point => point.gridX === Number(gridX) && point.gridY === Number(gridY));
  }

  function getRegionPurpose(region = {}) {
    const id = String(region.id || "");
    if (id === "center") return "core_citadel";
    if (["north", "east", "south", "west"].includes(id)) return "core_stronghold";
    if (["region_6", "region_7", "region_9", "region_10"].includes(id)) return "core_camp";
    return getWorldLayer(region.gridX, region.gridY) === 0 ? "core_support" : "player_region";
  }

  function buildCoreReservations(regions = [], coreRadius = CORE_RADIUS) {
    const regionByCoordinate = new Map(regions.map(region => [coordinateKey(region.gridX, region.gridY), region]));
    const reservations = [];
    for (let gridY = -coreRadius; gridY <= coreRadius; gridY += 1) {
      for (let gridX = -coreRadius; gridX <= coreRadius; gridX += 1) {
        const region = regionByCoordinate.get(coordinateKey(gridX, gridY));
        reservations.push({
          gridX,
          gridY,
          reserved: true,
          activeRegionId: region?.id || "",
          lifecycle: region ? "active" : "reserved",
          spawnEligible: false,
          reservedPurpose: region ? region.purpose : "core_holding_or_support",
        });
      }
    }
    return reservations;
  }

  function buildCardinalConnections(regions = []) {
    const regionByCoordinate = new Map(regions.map(region => [coordinateKey(region.gridX, region.gridY), region]));
    return Object.fromEntries(regions.map(region => {
      const connections = {};
      for (const [side, direction] of Object.entries(DIRECTIONS)) {
        const neighbor = regionByCoordinate.get(coordinateKey(
          Number(region.gridX) + direction.dx,
          Number(region.gridY) + direction.dy,
        ));
        connections[side] = {
          side,
          oppositeSide: direction.opposite,
          state: neighbor ? "open" : "gated",
          targetRegionId: neighbor?.id || "",
        };
      }
      return [region.id, connections];
    }));
  }

  function deriveWorldBounds(regions = []) {
    const coordinates = regions.map(region => ({
      gridX: Number(region.gridX),
      gridY: Number(region.gridY),
    })).filter(point => Number.isFinite(point.gridX) && Number.isFinite(point.gridY));
    if (!coordinates.length) return { minGridX: 0, maxGridX: 0, minGridY: 0, maxGridY: 0, width: 1, height: 1 };
    const minGridX = Math.min(...coordinates.map(point => point.gridX));
    const maxGridX = Math.max(...coordinates.map(point => point.gridX));
    const minGridY = Math.min(...coordinates.map(point => point.gridY));
    const maxGridY = Math.max(...coordinates.map(point => point.gridY));
    return {
      minGridX,
      maxGridX,
      minGridY,
      maxGridY,
      width: maxGridX - minGridX + 1,
      height: maxGridY - minGridY + 1,
    };
  }

  function isRingComplete(regions = [], layer, coreRadius = CORE_RADIUS) {
    const coordinates = new Set(regions.map(region => coordinateKey(region.gridX, region.gridY)));
    return getClockwiseRingCoordinates(layer, coreRadius)
      .every(point => coordinates.has(coordinateKey(point.gridX, point.gridY)));
  }

  function getNextClockwiseCoordinate(regions = [], layer, coreRadius = CORE_RADIUS) {
    const coordinates = new Set(regions.map(region => coordinateKey(region.gridX, region.gridY)));
    return getClockwiseRingCoordinates(layer, coreRadius)
      .find(point => !coordinates.has(coordinateKey(point.gridX, point.gridY))) || null;
  }

  function getCurrentOuterPlayerLayer(regions = [], coreRadius = CORE_RADIUS) {
    return regions.reduce((maximum, region) => Math.max(
      maximum,
      getWorldLayer(region.gridX, region.gridY, coreRadius),
    ), 0);
  }

  function getNextPlayerExpansionCoordinate(regions = [], coreRadius = CORE_RADIUS) {
    const currentLayer = getCurrentOuterPlayerLayer(regions, coreRadius);
    const targetLayer = Math.max(1, currentLayer);
    const withinLayer = getNextClockwiseCoordinate(regions, targetLayer, coreRadius);
    const worldLayer = withinLayer ? targetLayer : targetLayer + 1;
    const coordinate = withinLayer || getClockwiseRingCoordinates(worldLayer, coreRadius)[0];
    return {
      ...coordinate,
      worldLayer,
      clockwiseOrderIndex: getClockwiseRingIndex(coordinate.gridX, coordinate.gridY, coreRadius),
    };
  }

  function buildCompatibilityRegion(layout = {}, region = {}) {
    const compatRegion = region.compatRegion && typeof region.compatRegion === "object" ? region.compatRegion : {};
    const cellSize = Math.max(500, Number(layout.globalSettings?.gridCellWorldSize) || 2300);
    const worldWidth = Math.max(1000, Number(layout.globalSettings?.worldWidth) || 10000);
    const worldHeight = Math.max(1000, Number(layout.globalSettings?.worldHeight) || 7600);
    const aspect = Math.max(0.2, (Number(region.width) || 2048) / Math.max(1, Number(region.height) || 2048));
    const defaultRx = Math.round(cellSize * (aspect >= 1 ? 0.46 : 0.36));
    const defaultRy = Math.round(cellSize * (aspect >= 1 ? 0.36 : 0.46));
    const rx = Math.max(1, Math.round(Number(compatRegion.rx) || defaultRx));
    const ry = Math.max(1, Math.round(Number(compatRegion.ry) || defaultRy));
    return {
      ...compatRegion,
      id: region.id,
      label: region.name,
      gridX: Number(region.gridX) || 0,
      gridY: Number(region.gridY) || 0,
      x: Math.round(worldWidth / 2 + (Number(region.gridX) || 0) * cellSize),
      y: Math.round(worldHeight / 2 + (Number(region.gridY) || 0) * cellSize),
      rx,
      ry,
      cityRx: Math.max(1, Math.round(Number(compatRegion.cityRx) || rx * 0.82)),
      cityRy: Math.max(1, Math.round(Number(compatRegion.cityRy) || ry * 0.76)),
      rot: Number.isFinite(Number(compatRegion.rot)) ? Number(compatRegion.rot) : 0,
      palette: compatRegion.palette || (region.type === "crownlands_main" ? "heartland" : "woodland"),
    };
  }

  function buildClientEditorMap(region, definition = null) {
    if (!region) return null;
    const width = Math.max(1, Math.floor(Number(region.width) || 2048));
    const height = Math.max(1, Math.floor(Number(region.height) || 1536));
    const result = {
      ...region,
      id: String(region.id || "").trim().toLowerCase(),
      label: region.name || region.label || region.id,
      imageSrc: region.mapAsset || region.imagePath || region.imageSrc || "",
      thumbnailSrc: region.thumbnailAsset || region.thumbnailPath || region.thumbnailSrc || "",
      imageWidth: width,
      imageHeight: height,
      region: region.compatibilityRegion || region.region || {},
    };
    if (!definition) return result;
    result.cities = Array.isArray(definition.cities) ? definition.cities.map(city => ({
      ...city,
      x: Math.round(Number(city.xNorm) * width),
      y: Math.round(Number(city.yNorm) * height),
    })) : [];
    result.objectives = Array.isArray(definition.strongholds) ? definition.strongholds.map(stronghold => {
      const sourceType = String(stronghold.strongholdType || stronghold.type || "gold_stronghold");
      const type = sourceType === "crown_citadel" ? "crown"
        : sourceType === "troop_stronghold" ? "training"
          : sourceType === "march_speed_stronghold" ? "speed"
            : sourceType === "defense_stronghold" ? "defense"
              : sourceType === "upgrade_discount_stronghold" ? "upgradeDiscount"
                : "gold";
      return {
        ...stronghold,
        x: Math.round(Number(stronghold.xNorm) * width),
        y: Math.round(Number(stronghold.yNorm) * height),
        type,
        strongholdType: type,
        sourceStrongholdType: sourceType,
        bonus: stronghold.bonusType,
        bonusPercent: stronghold.bonusAmount,
        startTroops: stronghold.troops,
      };
    }) : [];
    result.camps = Array.isArray(definition.camps) ? definition.camps.map(camp => ({
      ...camp,
      x: Math.round(Number(camp.xNorm) * width),
      y: Math.round(Number(camp.yNorm) * height),
      type: camp.campType,
    })) : [];
    result.edgeConnections = definition.edgeConnections || {};
    return result;
  }

  function createRegionDefinitionLoader({
    catalog = {},
    cacheLimit = REGION_DEFINITION_CACHE_LIMIT,
    fetchJson = null,
    getActiveRegionId = () => "",
    onLoad = () => {},
    onEvict = () => {},
  } = {}) {
    const regions = Array.isArray(catalog.regions) ? catalog.regions : [];
    const byId = new Map(regions.map(region => [String(region.id || "").toLowerCase(), region]));
    const cache = new Map();
    const loads = new Map();
    const maximum = Math.max(1, Math.floor(Number(cacheLimit) || REGION_DEFINITION_CACHE_LIMIT));
    const stats = {
      catalogRegionCount: regions.length,
      definitionRequests: 0,
      definitionCacheHits: 0,
      definitionFailures: 0,
      definitionsLoaded: 0,
      cityDefinitionsLoaded: 0,
      cacheLimit: maximum,
      loadedRegionIds: [],
    };
    const updateStats = () => {
      stats.loadedRegionIds = [...cache.keys()];
      stats.definitionsLoaded = cache.size;
      stats.cityDefinitionsLoaded = [...cache.values()]
        .reduce((total, cached) => total + (cached.definition?.cities?.length || 0), 0);
    };
    const evict = protectedRegionIds => {
      const protectedIds = new Set((protectedRegionIds || []).map(id => String(id || "").toLowerCase()));
      protectedIds.add(String(getActiveRegionId() || "").toLowerCase());
      while (cache.size > maximum) {
        const id = [...cache.keys()].find(candidate => !protectedIds.has(candidate));
        if (!id) break;
        cache.delete(id);
        onEvict(id);
      }
      updateStats();
    };
    const ensure = async (regionId, { protectedRegionIds = [] } = {}) => {
      const id = String(regionId || "").trim().toLowerCase();
      const summary = byId.get(id);
      if (!summary) throw new Error(`Unknown Crownlands region definition: ${id || "(blank)"}.`);
      if (cache.has(id)) {
        const cached = cache.get(id);
        cache.delete(id);
        cache.set(id, cached);
        stats.definitionCacheHits += 1;
        return buildClientEditorMap(summary, cached.definition);
      }
      if (loads.has(id)) return loads.get(id);
      if (typeof fetchJson !== "function") throw new Error("Region definition fetch is not configured.");
      stats.definitionRequests += 1;
      const load = Promise.resolve(fetchJson(summary.regionDefinitionPath, summary))
        .then(definition => {
          if (String(definition?.id || "").toLowerCase() !== id) throw new Error(`${summary.name || id} definition identity did not match its catalog entry.`);
          cache.set(id, { definition, loadedAtMs: Date.now() });
          onLoad(id, definition);
          evict([id, ...protectedRegionIds]);
          return buildClientEditorMap(summary, definition);
        })
        .catch(error => {
          stats.definitionFailures += 1;
          throw error;
        })
        .finally(() => loads.delete(id));
      loads.set(id, load);
      return load;
    };
    return Object.freeze({ cache, loads, stats, ensure, evict, buildMap: buildClientEditorMap });
  }

  function buildRegionCatalog(layout = {}, regions = []) {
    const normalizedRegions = regions.map(region => ({
      ...region,
      id: String(region.id || ""),
      gridX: Math.round(Number(region.gridX) || 0),
      gridY: Math.round(Number(region.gridY) || 0),
    })).filter(region => region.id);
    const cardinalConnections = buildCardinalConnections(normalizedRegions);
    const catalogRegions = normalizedRegions.map(region => {
      const worldLayer = getWorldLayer(region.gridX, region.gridY);
      const permanentCore = worldLayer === 0;
      const npcCityCount = Array.isArray(region.cities)
        ? region.cities.filter(city => !city?.isStronghold && city?.kind !== "stronghold").length
        : Math.max(0, Math.floor(Number(region.npcCityCount) || 0));
      const purpose = getRegionPurpose(region);
      const lifecycle = String(region.lifecycle || "active");
      const spawnEligible = !permanentCore
        && purpose === "player_region"
        && lifecycle === "active"
        && npcCityCount >= MINIMUM_SPAWN_NPC_CITIES;
      return {
        id: region.id,
        name: region.name || region.label || region.id,
        type: region.type || "player",
        purpose,
        permanentCore,
        spawnEligible,
        spawnReady: spawnEligible,
        worldLayer,
        clockwiseOrderIndex: getClockwiseRingIndex(region.gridX, region.gridY),
        lifecycle,
        gridX: region.gridX,
        gridY: region.gridY,
        width: Math.max(1, Math.floor(Number(region.width || region.imageWidth) || 2048)),
        height: Math.max(1, Math.floor(Number(region.height || region.imageHeight) || 1536)),
        mapAsset: region.imagePath || region.imageSrc || "",
        thumbnailAsset: region.thumbnailPath || region.thumbnailSrc || "",
        regionDefinitionPath: region.regionPath || `assets/worlds/world_01/regions/${region.id}.json`,
        cityCapacity: Math.max(0, Math.floor(Number(region.cityCapacity) || npcCityCount)),
        npcCityCount,
        objectiveCount: Array.isArray(region.strongholds) ? region.strongholds.length : Math.max(0, Math.floor(Number(region.objectiveCount) || 0)),
        campCount: Array.isArray(region.camps) ? region.camps.length : Math.max(0, Math.floor(Number(region.campCount) || 0)),
        reservations: Array.isArray(region.reservations) ? region.reservations : [],
        compatibilityRegion: buildCompatibilityRegion(layout, region),
        connections: cardinalConnections[region.id],
      };
    });
    const updatedAt = String(layout.updatedAt || "1970-01-01T00:00:00.000Z");
    return {
      schemaVersion: 3,
      worldId: layout.worldId || "world_01",
      worldName: layout.worldName || "Crownlands World 01",
      updatedAt,
      version: Number(updatedAt.replace(/\D/g, "").slice(0, 12)) || 3,
      globalSettings: layout.globalSettings || {},
      topology: {
        coreRadius: CORE_RADIUS,
        coreWidth: CORE_RADIUS * 2 + 1,
        ringAnchor: "north-west",
        ringDirection: "clockwise",
        connections: "cardinal-only",
      },
      coreReservations: buildCoreReservations(catalogRegions),
      capacityPolicy: {
        minimumNpcCitiesForSpawn: MINIMUM_SPAWN_NPC_CITIES,
        serverAuthoritative: true,
      },
      definitionCache: {
        maxRegions: REGION_DEFINITION_CACHE_LIMIT,
        loadPolicy: "active-first-nearby-on-demand",
      },
      bounds: deriveWorldBounds(catalogRegions),
      regions: catalogRegions,
    };
  }

  function validateCatalog(catalog = {}) {
    const errors = [];
    const regions = Array.isArray(catalog.regions) ? catalog.regions : [];
    const ringAnchor = catalog.topology?.ringAnchor === "north-center" ? "north-center" : "north-west";
    const byId = new Map();
    const byCoordinate = new Map();
    for (const region of regions) {
      const key = coordinateKey(region.gridX, region.gridY);
      if (!region.id || byId.has(region.id)) errors.push(`Duplicate or blank region ID ${region.id || "(blank)"}.`);
      else byId.set(region.id, region);
      if (byCoordinate.has(key)) errors.push(`Duplicate coordinate ${key}.`);
      byCoordinate.set(key, region.id);
      const expectedLayer = getWorldLayer(region.gridX, region.gridY);
      const expectedOrder = getClockwiseRingIndex(region.gridX, region.gridY, CORE_RADIUS, ringAnchor);
      if (!REGION_PURPOSES.includes(region.purpose)) errors.push(`${region.id} has invalid purpose ${region.purpose}.`);
      if (Number(region.worldLayer) !== expectedLayer) errors.push(`${region.id} has invalid world layer.`);
      if ((region.clockwiseOrderIndex ?? null) !== expectedOrder) errors.push(`${region.id} has invalid clockwise order.`);
      if (Boolean(region.permanentCore) !== (expectedLayer === 0)) errors.push(`${region.id} has invalid permanent-core status.`);
      if (expectedLayer === 0 && region.purpose === "player_region") errors.push(`${region.id} cannot be a player region inside the core.`);
      if (expectedLayer > 0 && region.purpose !== "player_region") errors.push(`${region.id} outside the core must be a player region.`);
      if (region.permanentCore && region.spawnEligible) errors.push(`${region.id} cannot be core and spawn eligible.`);
      if (region.spawnEligible && Number(region.npcCityCount) < MINIMUM_SPAWN_NPC_CITIES) errors.push(`${region.id} is below spawn capacity.`);
      if (region.spawnReady && (!region.spawnEligible || Number(region.npcCityCount) < MINIMUM_SPAWN_NPC_CITIES)) {
        errors.push(`${region.id} cannot be spawn ready.`);
      }
    }
    for (const region of regions) {
      for (const [side, direction] of Object.entries(DIRECTIONS)) {
        const connection = region.connections?.[side];
        const expectedNeighborId = byCoordinate.get(coordinateKey(
          Number(region.gridX) + direction.dx,
          Number(region.gridY) + direction.dy,
        )) || "";
        if (!connection) {
          errors.push(`${region.id}:${side} is missing.`);
          continue;
        }
        if (expectedNeighborId) {
          const neighbor = byId.get(expectedNeighborId);
          const reciprocal = neighbor?.connections?.[direction.opposite];
          if (connection.state !== "open" || connection.targetRegionId !== expectedNeighborId) {
            errors.push(`${region.id}:${side} must be open to ${expectedNeighborId}.`);
          }
          if (reciprocal?.targetRegionId !== region.id || reciprocal?.state !== "open") {
            errors.push(`${region.id}:${side} is not reciprocal.`);
          }
        } else if (connection.state !== "gated" || connection.targetRegionId) {
          errors.push(`${region.id}:${side} must be gated without a destination.`);
        }
      }
    }
    const reservations = Array.isArray(catalog.coreReservations) ? catalog.coreReservations : [];
    if (reservations.length !== 25) {
      errors.push("Permanent core must reserve exactly 25 coordinates.");
    } else {
      const reservationCoordinates = new Set();
      for (const reservation of reservations) {
        const key = coordinateKey(reservation.gridX, reservation.gridY);
        reservationCoordinates.add(key);
        if (getWorldLayer(reservation.gridX, reservation.gridY) !== 0 || reservation.spawnEligible !== false) {
          errors.push(`Core reservation ${key} is invalid.`);
        }
      }
      if (reservationCoordinates.size !== 25) errors.push("Permanent core reservations contain duplicate coordinates.");
    }
    const expectedBounds = deriveWorldBounds(regions);
    if (JSON.stringify(catalog.bounds || {}) !== JSON.stringify(expectedBounds)) errors.push("Dynamic catalog bounds drifted.");
    const maximumLayer = getCurrentOuterPlayerLayer(regions);
    for (let layer = 1; layer < maximumLayer; layer += 1) {
      if (!isRingComplete(regions, layer)) errors.push(`Layer ${layer} must be complete before Layer ${layer + 1}.`);
    }
    return errors;
  }

  return Object.freeze({
    CORE_RADIUS,
    MINIMUM_SPAWN_NPC_CITIES,
    REGION_DEFINITION_CACHE_LIMIT,
    REGION_PURPOSES,
    DIRECTIONS,
    coordinateKey,
    getWorldLayer,
    getClockwiseRingCoordinates,
    getClockwiseRingIndex,
    getRegionPurpose,
    buildCoreReservations,
    buildCardinalConnections,
    deriveWorldBounds,
    isRingComplete,
    getNextClockwiseCoordinate,
    getCurrentOuterPlayerLayer,
    getNextPlayerExpansionCoordinate,
    buildCompatibilityRegion,
    buildClientEditorMap,
    createRegionDefinitionLoader,
    buildRegionCatalog,
    validateCatalog,
  });
});
