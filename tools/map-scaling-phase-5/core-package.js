"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { hashObject } = require("../map-scaling-phase-4/generator");

const ROOT = path.resolve(__dirname, "..", "..");
const CORE_PACKAGE_VERSION = "permanent-core-template-v1";
const CORE_COORDINATE_MIN = -2;
const CORE_COORDINATE_MAX = 2;

const EXPECTED_ACTIVE_CORE = Object.freeze({
  "0,0": "center",
  "0,-1": "north",
  "1,0": "east",
  "0,1": "south",
  "-1,0": "west",
  "-2,2": "region_6",
  "-1,2": "region_7",
  "0,2": "region_8",
  "1,2": "region_9",
  "2,2": "region_10",
});

// Phase 5 permanently reserves the four empty inner-diagonal Core cells for the
// future Holding Tower family. These coordinates are a locked Core invariant:
// generic player-region allocation and normal city population are forbidden.
const FUTURE_HOLDING_TOWER_COORDINATES = Object.freeze([
  Object.freeze({ gridX: -1, gridY: -1, towerSlotId: "holding_tower_northwest" }),
  Object.freeze({ gridX: 1, gridY: -1, towerSlotId: "holding_tower_northeast" }),
  Object.freeze({ gridX: -1, gridY: 1, towerSlotId: "holding_tower_southwest" }),
  Object.freeze({ gridX: 1, gridY: 1, towerSlotId: "holding_tower_southeast" }),
]);

const EXPECTED_OBJECTIVES = Object.freeze({
  citadel: Object.freeze([
    Object.freeze({ id: "center_crown_citadel", regionId: "center", type: "crown", x: 710, y: 498 }),
  ]),
  strongholds: Object.freeze([
    Object.freeze({ id: "north_training_stronghold", regionId: "north", type: "training" }),
    Object.freeze({ id: "east_speed_stronghold", regionId: "east", type: "speed" }),
    Object.freeze({ id: "south_defense_stronghold", regionId: "south", type: "defense" }),
    Object.freeze({ id: "west_gold_stronghold", regionId: "west", type: "gold" }),
  ]),
  camps: Object.freeze([
    Object.freeze({ id: "region_6_gold_camp", regionId: "region_6", type: "gold" }),
    Object.freeze({ id: "region_7_items_camp", regionId: "region_7", type: "items" }),
    Object.freeze({ id: "region_9_deed_camp", regionId: "region_9", type: "deed" }),
    Object.freeze({ id: "region_10_troops_camp", regionId: "region_10", type: "troops" }),
  ]),
});

function coordinateKey(gridX, gridY) {
  return `${Number(gridX)},${Number(gridY)}`;
}

function sha256File(relativePath) {
  const absolutePath = path.join(ROOT, String(relativePath || ""));
  if (!relativePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPermanentCorePackage() {
  const catalog = require(path.join(ROOT, "functions", "region-catalog.json"));
  const world = require(path.join(ROOT, "functions", "world-layout.json"));
  const regionsById = new Map(catalog.regions.map(region => [region.id, region]));
  const mapsById = new Map(world.maps.map(map => [map.id, map]));
  const towerByCoordinate = new Map(FUTURE_HOLDING_TOWER_COORDINATES.map(slot => [
    coordinateKey(slot.gridX, slot.gridY),
    slot,
  ]));

  const cells = catalog.coreReservations.map(reservation => {
    const key = coordinateKey(reservation.gridX, reservation.gridY);
    const region = reservation.activeRegionId ? regionsById.get(reservation.activeRegionId) : null;
    const map = region ? mapsById.get(region.id) : null;
    const tower = towerByCoordinate.get(key) || null;
    if (!region || !map) {
      return {
        schemaVersion: 1,
        gridX: reservation.gridX,
        gridY: reservation.gridY,
        worldLayer: 0,
        cellState: tower ? "reserved_holding_tower" : "reserved_core_support",
        regionId: null,
        reserved: true,
        reservedPurpose: tower ? "future_holding_tower" : reservation.reservedPurpose,
        towerSlotId: tower?.towerSlotId || null,
        reservationLocked: Boolean(tower),
        normalPlayerRegionUseAllowed: false,
        handcraftedMapRequired: true,
        spawnEligible: false,
        spawnReady: false,
        normalCityCapacity: 0,
        playerRegionGenerationAllowed: false,
        cityCoordinateHash: hashObject([]),
        objectives: [],
        camps: [],
      };
    }
    const cityCoordinates = (map.cities || []).map(city => ({
      id: city.id,
      x: city.x,
      y: city.y,
      xNorm: city.xNorm,
      yNorm: city.yNorm,
    })).sort((left, right) => left.id.localeCompare(right.id));
    return {
      schemaVersion: 1,
      gridX: reservation.gridX,
      gridY: reservation.gridY,
      worldLayer: 0,
      cellState: "handcrafted_active",
      regionId: region.id,
      regionName: region.name,
      purpose: region.purpose,
      permanentCore: true,
      reserved: true,
      spawnEligible: false,
      spawnReady: false,
      playerRegionGenerationAllowed: false,
      lifecycle: region.lifecycle,
      mapAsset: region.mapAsset,
      mapAssetHash: sha256File(region.mapAsset),
      thumbnailAsset: region.thumbnailAsset,
      thumbnailAssetHash: sha256File(region.thumbnailAsset),
      regionDefinitionPath: region.regionDefinitionPath,
      regionDefinitionHash: sha256File(region.regionDefinitionPath),
      cityCount: cityCoordinates.length,
      cityCoordinateHash: hashObject(cityCoordinates),
      publishedCityCoordinatesImmutable: true,
      connections: clone(region.connections),
      objectives: clone(map.objectives || []),
      camps: clone(map.camps || []),
    };
  }).sort((left, right) => left.gridY - right.gridY || left.gridX - right.gridX);

  const packageValue = {
    schemaVersion: 1,
    corePackageVersion: CORE_PACKAGE_VERSION,
    developmentOnly: true,
    authoritativeTemplateCandidate: true,
    activationImplemented: false,
    resetMigrationImplemented: false,
    coordinateBounds: { minimum: CORE_COORDINATE_MIN, maximum: CORE_COORDINATE_MAX, cellCount: 25 },
    sourceWorldVersion: world.version,
    sourceCatalogVersion: catalog.version,
    cells,
    objectiveConfiguration: clone(EXPECTED_OBJECTIVES),
    futureHoldingTowerCoordinates: clone(FUTURE_HOLDING_TOWER_COORDINATES),
    futureHoldingTowerReservationPolicy: {
      status: "locked",
      lockVersion: "phase5-approved-v1",
      normalPlayerRegionUseAllowed: false,
      normalCityPopulationAllowed: false,
      cityRelocationAllowed: false,
      coordinateReuseAllowed: false,
    },
    resetContract: {
      reconstructionMode: "restore_immutable_core_package",
      initializeSeasonalObjectiveOwnership: true,
      preservePublishedCityCoordinates: true,
      spawnEligible: false,
      genericPlayerRegionGeneratorAllowed: false,
      completeResetFlowImplemented: false,
    },
  };
  packageValue.hashes = {
    cellsHash: hashObject(cells),
    objectiveConfigurationHash: hashObject(packageValue.objectiveConfiguration),
    towerReservationHash: hashObject(packageValue.futureHoldingTowerCoordinates),
    towerReservationPolicyHash: hashObject(packageValue.futureHoldingTowerReservationPolicy),
  };
  packageValue.packageHash = hashObject(packageValue);
  return packageValue;
}

function validatePermanentCorePackage(corePackage = createPermanentCorePackage()) {
  const errors = [];
  const coordinates = new Set();
  const regions = new Set();
  if (corePackage.developmentOnly !== true || corePackage.activationImplemented !== false) {
    errors.push("Permanent Core template must remain development-only and inactive.");
  }
  if (corePackage.cells?.length !== 25) errors.push("Permanent Core must contain exactly 25 coordinate records.");
  for (const cell of corePackage.cells || []) {
    const key = coordinateKey(cell.gridX, cell.gridY);
    if (coordinates.has(key)) errors.push(`Duplicate Core coordinate ${key}.`);
    coordinates.add(key);
    if (cell.gridX < CORE_COORDINATE_MIN || cell.gridX > CORE_COORDINATE_MAX
      || cell.gridY < CORE_COORDINATE_MIN || cell.gridY > CORE_COORDINATE_MAX) {
      errors.push(`Core coordinate ${key} is outside the 5x5 template.`);
    }
    if (cell.spawnEligible !== false || cell.spawnReady !== false) errors.push(`${key} is incorrectly spawnable.`);
    if (cell.purpose === "player_region" || cell.playerRegionGenerationAllowed !== false) {
      errors.push(`${key} allows generic player-region generation.`);
    }
    if (cell.regionId) {
      if (regions.has(cell.regionId)) errors.push(`Duplicate active Core region ${cell.regionId}.`);
      regions.add(cell.regionId);
      if (EXPECTED_ACTIVE_CORE[key] !== cell.regionId) errors.push(`${key} expected ${EXPECTED_ACTIVE_CORE[key] || "a reservation"}, received ${cell.regionId}.`);
      if (!cell.mapAssetHash || !cell.regionDefinitionHash || !cell.cityCoordinateHash) errors.push(`${cell.regionId} has an incomplete immutable source reference.`);
    } else if (EXPECTED_ACTIVE_CORE[key]) {
      errors.push(`${key} is missing active Core region ${EXPECTED_ACTIVE_CORE[key]}.`);
    }
  }
  for (let y = CORE_COORDINATE_MIN; y <= CORE_COORDINATE_MAX; y += 1) {
    for (let x = CORE_COORDINATE_MIN; x <= CORE_COORDINATE_MAX; x += 1) {
      if (!coordinates.has(coordinateKey(x, y))) errors.push(`Missing Core coordinate ${coordinateKey(x, y)}.`);
    }
  }

  const activeCells = (corePackage.cells || []).filter(cell => cell.regionId);
  const objectives = activeCells.flatMap(cell => (cell.objectives || []).map(objective => ({ ...objective, regionId: cell.regionId })));
  const camps = activeCells.flatMap(cell => (cell.camps || []).map(camp => ({ ...camp, regionId: cell.regionId })));
  const citadels = objectives.filter(objective => objective.type === "crown" || objective.strongholdType === "crown");
  if (citadels.length !== 1) errors.push(`Expected exactly one Crown Citadel, received ${citadels.length}.`);
  const expectedCitadel = EXPECTED_OBJECTIVES.citadel[0];
  const citadel = citadels[0];
  if (!citadel || citadel.id !== expectedCitadel.id || citadel.regionId !== expectedCitadel.regionId
    || citadel.x !== expectedCitadel.x || citadel.y !== expectedCitadel.y) {
    errors.push("Crownlands Heart Citadel configuration drifted.");
  }
  for (const expected of EXPECTED_OBJECTIVES.strongholds) {
    const actual = objectives.find(entry => entry.id === expected.id && entry.regionId === expected.regionId);
    if (!actual || (actual.type || actual.strongholdType) !== expected.type) errors.push(`Stronghold ${expected.id} is invalid or missing.`);
  }
  for (const expected of EXPECTED_OBJECTIVES.camps) {
    const actual = camps.find(entry => entry.id === expected.id && entry.regionId === expected.regionId);
    if (!actual || (actual.type || actual.campType) !== expected.type) errors.push(`Camp ${expected.id} is invalid or missing.`);
  }
  for (const tower of FUTURE_HOLDING_TOWER_COORDINATES) {
    const cell = (corePackage.cells || []).find(entry => entry.gridX === tower.gridX && entry.gridY === tower.gridY);
    if (!cell || cell.cellState !== "reserved_holding_tower" || cell.regionId || cell.normalCityCapacity !== 0
      || cell.reservationLocked !== true || cell.normalPlayerRegionUseAllowed !== false) {
      errors.push(`Holding Tower reservation ${tower.towerSlotId} is not empty and protected.`);
    }
  }
  const configuredTowerCoordinates = corePackage.futureHoldingTowerCoordinates || [];
  if (configuredTowerCoordinates.length !== FUTURE_HOLDING_TOWER_COORDINATES.length
    || hashObject(configuredTowerCoordinates) !== hashObject(FUTURE_HOLDING_TOWER_COORDINATES)) {
    errors.push("Locked Holding Tower coordinate set changed.");
  }
  const towerCells = (corePackage.cells || []).filter(cell => cell.cellState === "reserved_holding_tower");
  if (towerCells.length !== FUTURE_HOLDING_TOWER_COORDINATES.length) {
    errors.push(`Expected exactly four locked Holding Tower cells, received ${towerCells.length}.`);
  }
  const towerPolicy = corePackage.futureHoldingTowerReservationPolicy || {};
  if (towerPolicy.status !== "locked" || towerPolicy.lockVersion !== "phase5-approved-v1"
    || towerPolicy.normalPlayerRegionUseAllowed !== false || towerPolicy.normalCityPopulationAllowed !== false
    || towerPolicy.cityRelocationAllowed !== false || towerPolicy.coordinateReuseAllowed !== false) {
    errors.push("Holding Tower reservation policy is not locked against player-region use and city relocation.");
  }
  return {
    valid: errors.length === 0,
    errors,
    activeCoreRegionCount: activeCells.length,
    reservedCoreCellCount: (corePackage.cells || []).filter(cell => !cell.regionId).length,
    citadelCount: citadels.length,
    strongholdCount: EXPECTED_OBJECTIVES.strongholds.filter(expected => objectives.some(objective => objective.id === expected.id)).length,
    campCount: EXPECTED_OBJECTIVES.camps.filter(expected => camps.some(camp => camp.id === expected.id)).length,
    holdingTowerReservationCount: FUTURE_HOLDING_TOWER_COORDINATES.length,
  };
}

function validateFutureTowerProposal(corePackage, proposal = {}) {
  const errors = [];
  const coordinate = proposal.coordinate || {};
  const cell = (corePackage?.cells || []).find(entry => (
    entry.gridX === Number(coordinate.gridX) && entry.gridY === Number(coordinate.gridY)
  ));
  if (!cell || cell.cellState !== "reserved_holding_tower") errors.push("Tower target is not a reserved Holding Tower Core coordinate.");
  if (cell?.regionId || cell?.purpose === "player_region") errors.push("Tower target is already occupied by a region.");
  if ((proposal.cityRelocations || []).length) errors.push("Holding Tower activation may not relocate published cities.");
  if ((proposal.proposedCities || []).length) errors.push("Holding Tower maps may not receive normal player/NPC city populations.");
  const footprint = proposal.towerFootprint || null;
  for (const published of proposal.publishedCities || []) {
    const original = proposal.authoritativeCityCoordinates?.find(city => city.id === published.id);
    if (!original || original.x !== published.x || original.y !== published.y) {
      errors.push(`Published city ${published.id || "(missing)"} moved during Tower proposal.`);
    }
    if (footprint && Math.hypot(Number(published.x) - Number(footprint.x), Number(published.y) - Number(footprint.y)) < Number(footprint.radius || 0)) {
      errors.push(`Tower footprint overlaps published city ${published.id}.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = Object.freeze({
  CORE_PACKAGE_VERSION,
  EXPECTED_ACTIVE_CORE,
  EXPECTED_OBJECTIVES,
  FUTURE_HOLDING_TOWER_COORDINATES,
  createPermanentCorePackage,
  validatePermanentCorePackage,
  validateFutureTowerProposal,
});
