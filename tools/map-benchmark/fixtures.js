"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { loadAuthoritativeRealmContract } = require("./realm-contract.js");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const MAP_DATA_PATH = path.join(ROOT_DIR, "assets", "map-editor-data.js");
const CORE_EXPANSION_CATALOG_PATH = path.join(ROOT_DIR, "assets", "worlds", "core-expansion-v1", "region-catalog.json");
const RELEASE_CONFIG_PATH = path.join(ROOT_DIR, "functions", "release-config.json");

const BENCHMARK_SEED = "crownlands-map-phase-0-v1";
const FIXED_EPOCH_MS = Date.UTC(2040, 0, 1, 12, 0, 0);
const PRIMARY_REGION_ID = "core-v2-north-support-p0-m2";
const NEIGHBOR_REGION_ID = "core-v2-greybanner-hold-p0-m1";

const SCENARIOS = Object.freeze({
  A: Object.freeze({ id: "A", slug: "moderate", label: "Moderate", cityCount: 50, marchCount: 25 }),
  B: Object.freeze({ id: "B", slug: "busy", label: "Busy", cityCount: 100, marchCount: 50 }),
  C: Object.freeze({ id: "C", slug: "heavy", label: "Heavy", cityCount: 150, marchCount: 100 }),
  D: Object.freeze({ id: "D", slug: "static-world", label: "Static world", cityCount: 100, marchCount: 0 }),
  E: Object.freeze({ id: "E", slug: "march-pressure", label: "March pressure", cityCount: 50, marchCount: 100 }),
});

function createSeededRandom(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6D2B79F5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function loadLegacyMapEditorData() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(MAP_DATA_PATH, "utf8"), context, { filename: MAP_DATA_PATH });
  return JSON.parse(JSON.stringify(context.window.CROWNLANDS_MAP_EDITOR_DATA));
}

function loadMapEditorData(releaseConfig) {
  if (String(releaseConfig?.worldTopology || "").toLowerCase() !== "core-expansion-v1") {
    return loadLegacyMapEditorData();
  }
  const catalog = JSON.parse(fs.readFileSync(CORE_EXPANSION_CATALOG_PATH, "utf8"));
  const maps = [PRIMARY_REGION_ID, NEIGHBOR_REGION_ID].map(regionId => {
    const summary = catalog.regions.find(region => region.id === regionId);
    if (!summary?.regionDefinitionPath) {
      throw new Error(`Benchmark region ${regionId} is missing from the active Core catalog.`);
    }
    const definitionPath = path.join(ROOT_DIR, ...summary.regionDefinitionPath.split("/"));
    return {
      ...JSON.parse(fs.readFileSync(definitionPath, "utf8")),
      regionDefinitionPath: summary.regionDefinitionPath,
    };
  });
  return {
    version: catalog.version,
    worldId: catalog.worldId,
    worldName: catalog.worldName,
    globalSettings: catalog.globalSettings,
    maps,
    landBridges: [],
  };
}

function loadReleaseConfig() {
  return JSON.parse(fs.readFileSync(RELEASE_CONFIG_PATH, "utf8"));
}

function createBenchmarkCityDefinitions(regionId, count) {
  const random = createSeededRandom(`${BENCHMARK_SEED}:cities`);
  const cells = [];
  const columns = 15;
  const rows = 10;
  const marginX = 88;
  const marginY = 78;
  const usableWidth = 1448 - marginX * 2;
  const usableHeight = 1086 - marginY * 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({ row, column });
    }
  }
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [cells[index], cells[target]] = [cells[target], cells[index]];
  }

  return cells.slice(0, count).map((cell, index) => {
    const baseX = marginX + (cell.column + 0.5) * usableWidth / columns;
    const baseY = marginY + (cell.row + 0.5) * usableHeight / rows;
    const x = Math.round(baseX + (random() - 0.5) * 22);
    const y = Math.round(baseY + (random() - 0.5) * 18);
    return {
      id: `${regionId}_bench_${String(index + 1).padStart(3, "0")}`,
      name: `Benchmark Hold ${String(index + 1).padStart(3, "0")}`,
      regionId,
      x,
      y,
      xNorm: Number((x / 1448).toFixed(6)),
      yNorm: Number((y / 1086).toFixed(6)),
      level: 1 + (index * 7) % 50,
      troops: 10,
      owner: "neutral",
      startType: "neutral",
    };
  });
}

function createCitySnapshots(definitions) {
  const random = createSeededRandom(`${BENCHMARK_SEED}:city-state`);
  return definitions.map((city, index) => {
    const playerOwned = index < Math.max(3, Math.floor(definitions.length * 0.1));
    const rivalOwned = !playerOwned && index % 5 < 2;
    const ownerUid = playerOwned ? "benchmark-player" : rivalOwned ? `benchmark-rival-${index % 12}` : "";
    return {
      id: city.id,
      ownerKind: ownerUid ? "player" : "neutral",
      ownerUid,
      ownerName: playerOwned ? "Benchmark Ruler" : rivalOwned ? `Rival ${String(index % 12 + 1).padStart(2, "0")}` : "",
      ownerFlag: ownerUid
        ? { field: index % 2 ? "#274b7a" : "#7a2f27", mark: index % 3 ? "#e8d7a2" : "#d4af37", markType: index % 2 ? "chevron" : "cross" }
        : null,
      level: 1 + (index * 7) % 50,
      troops: 1500 + Math.floor(random() * 98500),
      troopFloat: 1500 + Math.floor(random() * 98500),
      investedGold: 25000 + index * 1250,
      isMainCity: index === 0,
      updatedAtMs: FIXED_EPOCH_MS,
    };
  });
}

function createCampDefinitions(regionId) {
  return [
    {
      id: `${regionId}_benchmark_gold_camp`,
      name: "Benchmark Gold Camp",
      regionId,
      campType: "gold",
      type: "gold",
      x: 310,
      y: 820,
      xNorm: Number((310 / 1448).toFixed(6)),
      yNorm: Number((820 / 1086).toFixed(6)),
      size: 140,
    },
    {
      id: `${regionId}_benchmark_warband_camp`,
      name: "Benchmark Warband Camp",
      regionId,
      campType: "troops",
      type: "troops",
      x: 1135,
      y: 275,
      xNorm: Number((1135 / 1448).toFixed(6)),
      yNorm: Number((275 / 1086).toFixed(6)),
      size: 140,
    },
  ];
}

function createCampSnapshots(camps) {
  return camps.map((camp, index) => ({
    id: camp.id,
    regionId: PRIMARY_REGION_ID,
    campType: camp.campType,
    holderUid: index === 0 ? "benchmark-player" : "",
    holderName: index === 0 ? "Benchmark Ruler" : "",
    troops: 20000,
    updatedAtMs: FIXED_EPOCH_MS,
  }));
}

function createRegionCitySnapshots(map, { playerOwnedCount = 0 } = {}) {
  return (map?.cities || []).map((city, index) => {
    const playerOwned = index < playerOwnedCount;
    return {
      id: city.id,
      ownerKind: playerOwned ? "player" : "neutral",
      ownerUid: playerOwned ? "benchmark-player" : "",
      ownerName: playerOwned ? "Benchmark Ruler" : "",
      level: 1 + index % 20,
      troops: 2500 + index * 125,
      troopFloat: 2500 + index * 125,
      isMainCity: false,
      updatedAtMs: FIXED_EPOCH_MS,
    };
  });
}

function createFixture(scenarioId = "A") {
  const scenario = SCENARIOS[String(scenarioId || "A").toUpperCase()] || SCENARIOS.A;
  const releaseConfig = loadReleaseConfig();
  const mapData = loadMapEditorData(releaseConfig);
  const realmContract = loadAuthoritativeRealmContract();
  const cityDefinitions = createBenchmarkCityDefinitions(PRIMARY_REGION_ID, scenario.cityCount);
  const campDefinitions = createCampDefinitions(PRIMARY_REGION_ID);
  const primaryMap = mapData.maps.find(map => map.id === PRIMARY_REGION_ID);
  const neighborMap = mapData.maps.find(map => map.id === NEIGHBOR_REGION_ID);
  if (!primaryMap || !neighborMap) throw new Error("Benchmark regions are missing from map-editor-data.js.");

  primaryMap.label = `Benchmark Region — ${scenario.label}`;
  primaryMap.cityCapacity = scenario.cityCount;
  primaryMap.cities = cityDefinitions;
  primaryMap.camps = campDefinitions;
  primaryMap.objectives = [];

  const citiesByRegion = Object.fromEntries(mapData.maps.map(map => [
    map.id,
    map.id === PRIMARY_REGION_ID
      ? createCitySnapshots(cityDefinitions)
      : createRegionCitySnapshots(map, { playerOwnedCount: map.id === NEIGHBOR_REGION_ID ? 3 : 0 }),
  ]));
  const campsByRegion = Object.fromEntries(mapData.maps.map(map => [
    map.id,
    map.id === PRIMARY_REGION_ID ? createCampSnapshots(campDefinitions) : [],
  ]));

  return {
    schemaVersion: 1,
    benchmarkSeed: BENCHMARK_SEED,
    fixedEpochMs: FIXED_EPOCH_MS,
    scenario,
    primaryRegionId: PRIMARY_REGION_ID,
    neighborRegionId: NEIGHBOR_REGION_ID,
    player: {
      uid: "benchmark-player",
      email: "benchmark.invalid@local.test",
      displayName: "Benchmark Ruler",
    },
    releaseConfig,
    realmContract,
    mapData,
    citiesByRegion,
    campsByRegion,
  };
}

module.exports = {
  BENCHMARK_SEED,
  FIXED_EPOCH_MS,
  NEIGHBOR_REGION_ID,
  PRIMARY_REGION_ID,
  SCENARIOS,
  createFixture,
};
