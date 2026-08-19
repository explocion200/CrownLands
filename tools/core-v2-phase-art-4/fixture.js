"use strict";

const fs = require("node:fs");
const path = require("node:path");
const b1Fixture = require("../core-v2-phase-b1/fixture.js");

const ROOT = path.resolve(__dirname, "..", "..");
const ART4 = path.join(ROOT, "benchmark-results", "map", "core-v2-phase-art-4");
const createB1Fixture = b1Fixture.createFixture;
const FIXED_EPOCH_MS = Date.UTC(2041, 0, 1, 12, 0, 0);
const PRIMARY_REGION_ID = "core-v2-north-support-p0-m2";
const NEIGHBOR_REGION_ID = "core-v2-deed-camp-north-east-p1-m2";

const LOCKED_CANDIDATE_BY_KEY = Object.freeze({
  "northwest-warband-camp": "benchmark-results/map/core-v2-phase-art-3/candidates/northwest-warband-camp/map-final-candidate.png",
  "northwest-relic-camp": "benchmark-results/map/core-v2-phase-art-3/candidates/northwest-relic-camp/map-final-candidate.png",
  "west-north-relic-camp": "benchmark-results/map/core-v2-phase-art-3/candidates/west-north-relic-camp/map-final-candidate.png",
  "northwest-holding-tower": "benchmark-results/map/core-v2-phase-art-3/candidates/northwest-holding-tower/map-final-candidate.png",
  "aurum-keep": "benchmark-results/map/core-v2-phase-art-3/candidates/aurum-keep/map-final-candidate.png",
  "crown-citadel": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/crown-citadel/map-final-candidate-v2.png",
  "southwest-holding-tower": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/southwest-holding-tower/map-final-candidate-v2.png",
  "west-support": "benchmark-results/map/core-v2-phase-art-2-v2/candidates/west-support/map-final-candidate-v2.png",
});

const SIDE_META = Object.freeze({
  north: { dx: 0, dy: -1, opposite: "south", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.065 },
  east: { dx: 1, dy: 0, opposite: "west", start: 0.462, end: 0.538, arrowXNorm: 0.935, arrowYNorm: 0.5 },
  south: { dx: 0, dy: 1, opposite: "north", start: 0.472, end: 0.528, arrowXNorm: 0.5, arrowYNorm: 0.935 },
  west: { dx: -1, dy: 0, opposite: "east", start: 0.462, end: 0.538, arrowXNorm: 0.065, arrowYNorm: 0.5 },
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function coordinateKey(x, y) {
  return `${x},${y}`;
}

function candidatePath(key) {
  return `benchmark-results/map/core-v2-phase-art-4/candidates/${key}/map-final-candidate.png`;
}

function thumbnailPath(key) {
  return `benchmark-results/map/core-v2-phase-art-4/candidates/${key}/thumbnail.webp`;
}

function createCities(entry) {
  return readJson(path.join(ROOT, entry.outputDirectory, "cities.json")).map((city, index) => ({
    id: `${entry.regionId}_art4_${String(index + 1).padStart(3, "0")}`,
    sourceCityId: city.id,
    name: index % 11 === 0 ? `Royal ${entry.name} ${index + 1}` : `${entry.name} Hold ${index + 1}`,
    regionId: entry.regionId,
    x: city.x,
    y: city.y,
    xNorm: Number(city.xNorm),
    yNorm: Number(city.yNorm),
    level: 1 + (index * 9) % 50,
    troops: 10,
    owner: "neutral",
    ownerKind: "neutral",
    startType: "neutral",
    prototypeOnly: true,
  }));
}

function createSnapshots(cities, regionIndex) {
  return cities.map((city, index) => {
    const playerOwned = index < Math.max(4, Math.floor(cities.length * 0.18));
    const rivalOwned = !playerOwned && index % 3 !== 0;
    const ownerUid = playerOwned ? "benchmark-player" : rivalOwned ? `benchmark-rival-${(index + regionIndex) % 16}` : "";
    const troops = 1850 + ((index * 7919 + regionIndex * 2741) % 148000);
    return {
      id: city.id,
      sourceCityId: city.sourceCityId,
      ownerKind: ownerUid ? "player" : "neutral",
      ownerUid,
      ownerName: playerOwned ? "Runtime QA Ruler" : rivalOwned ? `Rival Banner ${(index + regionIndex) % 16 + 1}` : "",
      ownerFlag: ownerUid ? { field: index % 2 ? "#274b7a" : "#7a2f27", mark: index % 3 ? "#e8d7a2" : "#d4af37", markType: index % 2 ? "chevron" : "cross" } : null,
      level: city.level,
      troops,
      troopFloat: troops,
      investedGold: 25000 + index * 1500,
      isMainCity: regionIndex === 0 && index === 0,
      updatedAtMs: FIXED_EPOCH_MS,
    };
  });
}

function createCamps(entry) {
  const objective = entry.objective || {};
  const campType = { deed: "deed", gold: "gold" }[objective.type];
  if (!campType) return [];
  return [{
    id: `${entry.regionId}_${campType}_camp`,
    name: campType === "deed" ? "Deed Camp" : "Gold Camp",
    campType,
    type: campType,
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    size: objective.visualSize,
    artSrc: entry.profile.objectiveArt,
    prototypeOnly: true,
  }];
}

function createStrongholds(entry) {
  const objective = entry.objective || {};
  if (objective.type !== "training") return [];
  return [{
    id: `${entry.regionId}_training_stronghold`,
    name: "Greybanner Hold",
    x: objective.x,
    y: objective.y,
    xNorm: Number((objective.x / 1448).toFixed(6)),
    yNorm: Number((objective.y / 1086).toFixed(6)),
    type: "training",
    strongholdType: "training",
    sourceStrongholdType: "training",
    bonus: "troop",
    bonusPercent: 20,
    level: 50,
    troops: 150000,
    artSrc: entry.profile.objectiveArt,
    size: objective.visualSize,
    prototypeOnly: true,
  }];
}

function buildConnections(entry, byCoordinate) {
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = byCoordinate.get(coordinateKey(entry.coordinate.gridX + meta.dx, entry.coordinate.gridY + meta.dy));
    return [side, target ? [{
      id: `${side}_road`,
      side,
      start: meta.start,
      end: meta.end,
      type: "road",
      connectsToRegionId: target.regionId,
      arrowXNorm: meta.arrowXNorm,
      arrowYNorm: meta.arrowYNorm,
      intentionalOuter: false,
      notes: "Core v2 Phase ART-4 loopback-only package-available connection",
    }] : []];
  }));
}

function catalogConnections(entry, byCoordinate) {
  return Object.fromEntries(Object.entries(SIDE_META).map(([side, meta]) => {
    const target = byCoordinate.get(coordinateKey(entry.coordinate.gridX + meta.dx, entry.coordinate.gridY + meta.dy));
    return [side, {
      side,
      oppositeSide: meta.opposite,
      state: target ? "open" : "gated",
      targetRegionId: target?.regionId || "",
      fixturePackageAvailabilityOnly: true,
    }];
  }));
}

function createFixture() {
  const fixture = createB1Fixture();
  const art4Index = readJson(path.join(ART4, "art4-index.json"));

  const existingByRegion = new Map(fixture.prototypes.map(prototype => [prototype.regionId, prototype]));
  for (const map of fixture.mapData.maps) {
    const prototype = existingByRegion.get(map.id);
    const imageSrc = LOCKED_CANDIDATE_BY_KEY[prototype?.key];
    if (imageSrc) map.imageSrc = imageSrc;
  }

  const newEntries = art4Index.entries.map(entry => ({ ...entry, lockedNeighbor: false }));
  const allEntries = [
    ...fixture.prototypes.map(prototype => ({
      ...prototype,
      coordinate: fixture.mapData.maps.find(map => map.id === prototype.regionId)
        ? { gridX: fixture.mapData.maps.find(map => map.id === prototype.regionId).gridX, gridY: fixture.mapData.maps.find(map => map.id === prototype.regionId).gridY }
        : prototype.coordinate,
    })),
    ...newEntries,
  ];
  const byCoordinate = new Map(allEntries.map(entry => [coordinateKey(entry.coordinate.gridX, entry.coordinate.gridY), entry]));

  newEntries.forEach((entry, index) => {
    const cities = createCities(entry);
    const camps = createCamps(entry);
    const objectives = createStrongholds(entry);
    const map = {
      id: entry.regionId,
      label: `${entry.name} — Phase ART-4 Runtime QA`,
      type: "starter",
      purpose: entry.mapType.toLowerCase(),
      gridX: entry.coordinate.gridX,
      gridY: entry.coordinate.gridY,
      imageWidth: 1448,
      imageHeight: 1086,
      imageSrc: candidatePath(entry.key),
      thumbnailSrc: thumbnailPath(entry.key),
      cityCapacity: entry.exactCityCapacity,
      cities,
      camps,
      objectives,
      edgeConnections: buildConnections(entry, byCoordinate),
    };
    fixture.mapData.maps.push(map);
    fixture.citiesByRegion[entry.regionId] = createSnapshots(cities, index);
    fixture.campsByRegion[entry.regionId] = camps.map(camp => ({
      id: camp.id,
      regionId: entry.regionId,
      campType: camp.campType,
      holderUid: "benchmark-rival-3",
      holderName: "Rival Banner 4",
      troops: 20000,
      updatedAtMs: FIXED_EPOCH_MS,
    }));
    fixture.regionCatalog.regions.push({
      id: map.id,
      name: map.label,
      type: map.type,
      purpose: map.purpose,
      permanentCore: true,
      spawnEligible: false,
      spawnReady: false,
      worldLayer: 0,
      clockwiseOrderIndex: null,
      lifecycle: "development_fixture",
      gridX: map.gridX,
      gridY: map.gridY,
      width: 1448,
      height: 1086,
      mapAsset: map.imageSrc,
      thumbnailAsset: map.thumbnailSrc,
      regionDefinitionPath: `/__core_b1__/regions/${map.id}.json`,
      cityCapacity: map.cityCapacity,
      npcCityCount: map.cities.length,
      objectiveCount: map.objectives.length,
      campCount: map.camps.length,
      reservations: entry.mapType === "HOLDING_TOWER" ? [{ type: "holding_tower", ...entry.objective, developmentOnly: true }] : [],
      lockedNeighbor: false,
      compatibilityRegion: {
        id: map.id,
        label: map.label,
        gridX: map.gridX,
        gridY: map.gridY,
        x: 6500 + map.gridX * 2300,
        y: 8500 + map.gridY * 2300,
        rx: 1058,
        ry: 828,
        cityRx: 868,
        cityRy: 629,
        rot: 0,
        palette: "heartland",
      },
      connections: catalogConnections(entry, byCoordinate),
    });
  });

  const regionById = new Map(fixture.regionCatalog.regions.map(region => [region.id, region]));
  for (const map of fixture.mapData.maps) {
    const region = regionById.get(map.id);
    if (region) region.mapAsset = map.imageSrc;
  }

  fixture.primaryRegionId = PRIMARY_REGION_ID;
  fixture.neighborRegionId = NEIGHBOR_REGION_ID;
  fixture.scenario = { id: "CORE_ART4", slug: "north-northeast-final-art-runtime-qa", label: "Core v2 Phase ART-4", cityCount: 70, marchCount: 14 };
  fixture.regionCatalog.bounds = { minGridX: -2, maxGridX: 2, minGridY: -2, maxGridY: 1, width: 5, height: 4 };
  fixture.prototypes = [...fixture.prototypes, ...newEntries.map(entry => ({
    key: entry.key,
    sourceRegionId: entry.regionId,
    regionId: entry.regionId,
    name: entry.name,
    mapType: entry.mapType,
    exactCityCapacity: entry.exactCityCapacity,
    objective: entry.objective,
    profile: entry.profile,
    outputDirectory: entry.outputDirectory,
    candidateDirectory: entry.candidateDirectory,
    lockedNeighbor: false,
  }))];
  fixture.art4 = {
    developmentOnly: true,
    productionActivated: false,
    candidateCount: newEntries.length,
    finishedCoreMapCount: 15,
    representedCoreCityCapacity: 885,
  };
  return fixture;
}

module.exports = Object.freeze({
  FIXED_EPOCH_MS,
  LOCKED_CANDIDATE_BY_KEY,
  NEIGHBOR_REGION_ID,
  PRIMARY_REGION_ID,
  createFixture,
});
