"use strict";

const {
  CORE_RADIUS,
  MINIMUM_SPAWN_NPC_CITIES,
  getClockwiseRingCoordinates,
} = require("../../region-catalog");

function fixtureCities(regionId, count = MINIMUM_SPAWN_NPC_CITIES) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${regionId}_city_${String(index + 1).padStart(3, "0")}`,
    regionId,
    xNorm: (index % 5 + 1) / 6,
    yNorm: (Math.floor(index / 5) + 1) / 5,
  }));
}

function fixtureRegion({ id, gridX, gridY, core = false, cities = 0 }) {
  return {
    id,
    name: id,
    type: core ? "core_fixture" : "player_fixture",
    gridX,
    gridY,
    width: 1448,
    height: 1086,
    imagePath: `tools/fixtures/assets/${id}.webp`,
    thumbnailPath: `tools/fixtures/assets/${id}-thumb.webp`,
    regionPath: `tools/fixtures/regions/${id}.json`,
    cities: fixtureCities(id, cities),
    strongholds: [],
    camps: [],
    edgeConnections: {},
  };
}

function createFullCoreFixture() {
  const regions = [];
  for (let gridY = -CORE_RADIUS; gridY <= CORE_RADIUS; gridY += 1) {
    for (let gridX = -CORE_RADIUS; gridX <= CORE_RADIUS; gridX += 1) {
      regions.push(fixtureRegion({
        id: `core_fixture_${gridX + CORE_RADIUS}_${gridY + CORE_RADIUS}`,
        gridX,
        gridY,
        core: true,
      }));
    }
  }
  return regions;
}

function createLayerOneFixture({ complete = true } = {}) {
  const coordinates = getClockwiseRingCoordinates(1);
  const selected = complete ? coordinates : coordinates.slice(0, 4);
  return selected.map((point, index) => fixtureRegion({
    id: `layer_1_fixture_${String(index + 1).padStart(2, "0")}`,
    ...point,
    cities: MINIMUM_SPAWN_NPC_CITIES,
  }));
}

function createResetPersistenceFixture() {
  return {
    flag: { primary: "#7d1722", secondary: "#e2c36d", pattern: "quartered", symbol: "lion" },
    clanId: "fixture_clan",
    clanName: "Fixture Guard",
    clanTag: "FIX",
    clanRole: "member",
    gear: {
      schemaVersion: 1,
      owned: { fixture_common_gear: { level: 3, duplicates: 2 } },
      equipped: { barracks: { head: "fixture_common_gear" } },
    },
    shopItems: { shield_12h: 4 },
    itemEffects: { shieldExpiresAtMs: 9999999999999 },
    worldId: "fixture_season",
    mainRegionId: "layer_1_fixture_01",
    mainCityId: "layer_1_fixture_01_city_001",
  };
}

module.exports = {
  fixtureCities,
  fixtureRegion,
  createFullCoreFixture,
  createLayerOneFixture,
  createResetPersistenceFixture,
};
