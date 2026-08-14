"use strict";

const ASSET_LIBRARY_VERSION = "phase5-dev-placeholder-library-v1";

const DEFAULT_METADATA = Object.freeze({
  sourceDimensions: Object.freeze({ width: 1024, height: 1024 }),
  anchor: Object.freeze({ x: 0.5, y: 0.5 }),
  visualFootprint: "asset_defined",
  gameplayFootprint: "geometry_reference",
  blockerContribution: "none",
  drawOrder: 10,
  terrainCompatibility: Object.freeze(["agricultural", "woodland", "rolling_hills", "wetland", "trade_corridor"]),
  overlapRules: "painterly_overlap_only; never obscure transitions or city interaction zones",
  safeRotations: Object.freeze([0]),
  safeMirroring: Object.freeze([]),
  safeScaleRange: Object.freeze([0.9, 1.1]),
  regionalStyleTags: Object.freeze(["grounded", "late-medieval", "frontier-kingdom", "earthy"]),
  transparency: "rgba_required",
  productionReady: false,
});

function asset(id, category, overrides = {}) {
  return Object.freeze({
    ...DEFAULT_METADATA,
    assetId: id,
    category,
    sourcePath: null,
    availability: "spec_only",
    ...overrides,
  });
}

const ASSETS = Object.freeze([
  asset("ground.meadow.base", "ground", { transparency: "opaque", visualFootprint: "full_map", drawOrder: 0 }),
  asset("ground.grassland.patch", "ground", { safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"], safeScaleRange: [0.8, 1.25] }),
  asset("ground.farmland.patch", "ground", { terrainCompatibility: ["agricultural", "trade_corridor"], safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("ground.worn_dirt.patch", "ground", { safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("ground.muddy.patch", "ground", { terrainCompatibility: ["wetland", "woodland", "trade_corridor"] }),
  asset("ground.rocky.patch", "ground", { terrainCompatibility: ["rolling_hills", "woodland"] }),
  asset("ground.wet.patch", "ground", { terrainCompatibility: ["wetland"] }),
  asset("forest.cluster.small", "forest", { blockerContribution: "optional_dense_core", drawOrder: 35, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("forest.cluster.medium", "forest", { blockerContribution: "optional_dense_core", drawOrder: 35, safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("forest.cluster.large", "forest", { blockerContribution: "authoritative_dense_forest", drawOrder: 35, safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("forest.edge", "forest", { drawOrder: 34, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("forest.dense_blocker", "blocker", { blockerContribution: "authoritative_dense_forest", drawOrder: 36 }),
  asset("forest.coppice", "forest", { drawOrder: 34, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("agriculture.strip_fields", "farmland", { terrainCompatibility: ["agricultural", "rolling_hills", "trade_corridor"], drawOrder: 12, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("agriculture.fenced_field", "farmland", { terrainCompatibility: ["agricultural", "trade_corridor"], drawOrder: 14, safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("agriculture.pasture", "farmland", { terrainCompatibility: ["agricultural", "rolling_hills"], drawOrder: 12 }),
  asset("agriculture.orchard", "farmland", { terrainCompatibility: ["agricultural", "rolling_hills"], drawOrder: 18, safeRotations: [0, 90, 180, 270] }),
  asset("agriculture.hay_field", "farmland", { terrainCompatibility: ["agricultural"], drawOrder: 14, safeRotations: [0, 180] }),
  asset("agriculture.hedgerow", "hedge", { drawOrder: 28, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"], safeScaleRange: [0.75, 1.4] }),
  asset("road.straight", "road", { gameplayFootprint: "authoritative_road_corridor", drawOrder: 24, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("road.shallow_curve", "road", { gameplayFootprint: "authoritative_road_corridor", drawOrder: 24, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("road.strong_curve", "road", { gameplayFootprint: "authoritative_road_corridor", drawOrder: 24, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("road.junction", "road", { gameplayFootprint: "authoritative_road_corridor", drawOrder: 24, safeRotations: [0, 90, 180, 270] }),
  asset("road.bridge_approach", "road", { gameplayFootprint: "authoritative_crossing", drawOrder: 25, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("road.ford_approach", "road", { gameplayFootprint: "authoritative_crossing", drawOrder: 25, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("road.cardinal_edge", "road_edge", { gameplayFootprint: "authoritative_transition_corridor", drawOrder: 24, safeRotations: [0, 90, 180, 270] }),
  asset("water.stream", "water", { blockerContribution: "authoritative_water_except_crossings", drawOrder: 20, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("water.river", "water", { blockerContribution: "authoritative_water_except_crossings", drawOrder: 20, safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("water.river_bend", "water", { blockerContribution: "authoritative_water_except_crossings", drawOrder: 20, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("water.river_bank", "water", { drawOrder: 21, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("water.reeds", "decoration", { drawOrder: 33, terrainCompatibility: ["wetland"], safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("water.pond_edge", "water", { blockerContribution: "authoritative_water", drawOrder: 20, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("elevation.hill", "hill", { drawOrder: 30, terrainCompatibility: ["rolling_hills", "woodland", "agricultural"], safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("elevation.hill_cluster", "hill", { drawOrder: 31, terrainCompatibility: ["rolling_hills", "woodland"], safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("elevation.rocky_ridge", "blocker", { blockerContribution: "authoritative_mountain", drawOrder: 38, terrainCompatibility: ["rolling_hills", "woodland"], safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("elevation.foothills", "hill", { drawOrder: 32, terrainCompatibility: ["rolling_hills", "woodland"], safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("blocker.mountain", "blocker", { blockerContribution: "authoritative_mountain", drawOrder: 40 }),
  asset("blocker.cliff", "blocker", { blockerContribution: "authoritative_cliff", drawOrder: 40, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("blocker.marsh", "blocker", { blockerContribution: "authoritative_marsh", drawOrder: 26, terrainCompatibility: ["wetland"] }),
  asset("decoration.fence", "decoration", { drawOrder: 29, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"], safeScaleRange: [0.8, 1.3] }),
  asset("decoration.hay", "decoration", { drawOrder: 32, terrainCompatibility: ["agricultural"], safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("decoration.cart", "decoration", { drawOrder: 33, safeRotations: [0, 180], safeMirroring: ["horizontal"] }),
  asset("decoration.timber", "decoration", { drawOrder: 33, terrainCompatibility: ["woodland"], safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("decoration.rocks", "decoration", { drawOrder: 33, safeRotations: [0, 90, 180, 270], safeMirroring: ["horizontal"] }),
  asset("decoration.mill", "decoration", { drawOrder: 37, terrainCompatibility: ["agricultural", "trade_corridor"], safeRotations: [0], safeMirroring: ["horizontal"], safeScaleRange: [0.9, 1.05] }),
  asset("overlay.gate.provisional", "gate", { sourcePath: "assets/optimized/inner-castle-gatehouse-512x512-2a07ac7597ac.webp", availability: "runtime_provisional", gameplayFootprint: "none_runtime_overlay", drawOrder: 100, transparency: "rgba_required", safeRotations: [0, 90, 180, 270] }),
]);

function createAssetLibraryManifest() {
  return Object.freeze({
    schemaVersion: 1,
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
    developmentOnly: true,
    renderer: "procedural_qa_placeholders",
    finalProductionArtComplete: false,
    assets: ASSETS,
  });
}

function validateAssetLibrary(manifest = createAssetLibraryManifest()) {
  const errors = [];
  const ids = new Set();
  for (const entry of manifest.assets || []) {
    if (!entry.assetId || ids.has(entry.assetId)) errors.push(`Invalid or duplicate asset ID ${entry.assetId || "(missing)"}.`);
    ids.add(entry.assetId);
    for (const field of ["category", "anchor", "visualFootprint", "gameplayFootprint", "drawOrder", "terrainCompatibility", "overlapRules", "safeRotations", "safeMirroring", "safeScaleRange", "regionalStyleTags"]) {
      if (entry[field] == null) errors.push(`${entry.assetId} is missing ${field}.`);
    }
    if (entry.productionReady === true) errors.push(`${entry.assetId} incorrectly claims production readiness.`);
  }
  return { valid: errors.length === 0, errors, assetCount: ids.size };
}

module.exports = Object.freeze({
  ASSET_LIBRARY_VERSION,
  ASSETS,
  createAssetLibraryManifest,
  validateAssetLibrary,
});
