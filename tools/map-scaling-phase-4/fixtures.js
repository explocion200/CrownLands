"use strict";

const { CORE_RADIUS } = require("../../region-catalog");

const FIXTURE_KINDS = Object.freeze([
  "open",
  "forest-heavy",
  "mountain-heavy",
  "road-heavy",
  "constrained-invalid",
]);

function createDevelopmentCore25() {
  const regions = [];
  for (let gridY = -CORE_RADIUS; gridY <= CORE_RADIUS; gridY += 1) {
    for (let gridX = -CORE_RADIUS; gridX <= CORE_RADIUS; gridX += 1) {
      regions.push({
        id: `phase4_core_${gridX + CORE_RADIUS}_${gridY + CORE_RADIUS}`,
        name: `Development Core ${gridX},${gridY}`,
        purpose: gridX === 0 && gridY === 0 ? "core_citadel" : "core_support",
        permanentCore: true,
        spawnEligible: false,
        spawnReady: false,
        lifecycle: "development_fixture",
        visibility: "development_only",
        gridX,
        gridY,
        worldLayer: 0,
        clockwiseOrderIndex: null,
      });
    }
  }
  return regions;
}

function commonDefinition(allocation, kind) {
  return {
    id: allocation.regionId,
    name: `Phase 4 ${kind}`,
    width: 1448,
    height: 1086,
    mapAsset: null,
    thumbnailAsset: null,
    terrain: {
      source: `phase4-${kind}-authoritative-fixture-v1`,
      authoritativeData: true,
      derivedFromImagePixels: false,
      landPolygon: [
        { x: 78, y: 92 },
        { x: 270, y: 54 },
        { x: 1160, y: 54 },
        { x: 1372, y: 145 },
        { x: 1402, y: 850 },
        { x: 1300, y: 1022 },
        { x: 160, y: 1022 },
        { x: 44, y: 840 },
      ],
      blockers: [],
      prohibitedTerrain: [],
    },
    roadCorridors: [],
    noCityZones: [],
    camps: [
      { id: `${allocation.regionId}_fixture_camp`, xNorm: 0.25, yNorm: 0.69, radius: 66 },
    ],
    strongholds: [
      { id: `${allocation.regionId}_fixture_stronghold`, xNorm: 0.75, yNorm: 0.31, radius: 88 },
    ],
    citadels: [],
  };
}

function createOpenFixture(allocation) {
  const definition = commonDefinition(allocation, "open region");
  definition.terrain.blockers.push({
    id: "open-small-pond",
    type: "water",
    x: 1080,
    y: 770,
    rx: 95,
    ry: 68,
    rot: 0.2,
  });
  return {
    kind: "open",
    expectedSpawnReady: true,
    config: {},
    definition,
  };
}

function createForestHeavyFixture(allocation) {
  const definition = commonDefinition(allocation, "forest-heavy region");
  definition.terrain.prohibitedTerrain.push(
    { id: "forest-nw", type: "forest", x: 330, y: 260, rx: 104, ry: 68, rot: -0.25 },
    { id: "forest-ne", type: "forest", x: 1080, y: 245, rx: 112, ry: 72, rot: 0.18 },
    { id: "forest-west", type: "forest", x: 330, y: 720, rx: 112, ry: 84, rot: 0.12 },
    { id: "forest-east", type: "forest", x: 1100, y: 735, rx: 108, ry: 81, rot: -0.16 },
    { id: "forest-center", type: "forest", x: 710, y: 535, rx: 81, ry: 56, rot: 0.08 },
  );
  return {
    kind: "forest-heavy",
    expectedSpawnReady: true,
    config: { maximumCandidateEvaluations: 120000 },
    definition,
  };
}

function createMountainHeavyFixture(allocation) {
  const definition = commonDefinition(allocation, "mountain-heavy region");
  definition.terrain.blockers.push(
    { id: "mountain-nw", type: "mountain", x: 330, y: 245, rx: 130, ry: 74, rot: -0.32 },
    { id: "mountain-n", type: "mountain", x: 720, y: 230, rx: 135, ry: 66, rot: 0.08 },
    { id: "mountain-ne", type: "mountain", x: 1085, y: 285, rx: 116, ry: 77, rot: 0.3 },
    { id: "mountain-sw", type: "mountain", x: 390, y: 775, rx: 130, ry: 84, rot: 0.22 },
    { id: "mountain-se", type: "mountain", x: 1040, y: 760, rx: 135, ry: 84, rot: -0.2 },
  );
  return {
    kind: "mountain-heavy",
    expectedSpawnReady: true,
    config: { maximumCandidateEvaluations: 120000 },
    definition,
  };
}

function createRoadHeavyFixture(allocation) {
  const definition = commonDefinition(allocation, "road-heavy region");
  definition.roadCorridors.push(
    {
      id: "future-road-northwest-link",
      side: "internal",
      start: { x: 350, y: 210 },
      end: { x: 1040, y: 825 },
      halfWidth: 34,
    },
    {
      id: "future-road-northeast-link",
      side: "internal",
      start: { x: 1090, y: 230 },
      end: { x: 405, y: 830 },
      halfWidth: 34,
    },
  );
  definition.terrain.blockers.push(
    { id: "road-region-rocks-west", type: "mountain", x: 275, y: 350, rx: 90, ry: 80, rot: -0.1 },
    { id: "road-region-rocks-east", type: "mountain", x: 1170, y: 730, rx: 95, ry: 82, rot: 0.18 },
  );
  return {
    kind: "road-heavy",
    expectedSpawnReady: true,
    config: { maximumCandidateEvaluations: 48000 },
    definition,
  };
}

function createConstrainedInvalidFixture(allocation) {
  const definition = commonDefinition(allocation, "intentionally constrained invalid region");
  definition.terrain.landPolygon = [
    { x: 500, y: 300 },
    { x: 948, y: 300 },
    { x: 948, y: 786 },
    { x: 500, y: 786 },
  ];
  definition.terrain.blockers.push(
    { id: "invalid-water-west", type: "water", x: 570, y: 425, rx: 95, ry: 110, rot: 0 },
    { id: "invalid-mountain-east", type: "mountain", x: 875, y: 650, rx: 92, ry: 115, rot: 0 },
  );
  definition.camps = [];
  definition.strongholds = [];
  return {
    kind: "constrained-invalid",
    expectedSpawnReady: false,
    config: { maximumCandidateEvaluations: 12000 },
    definition,
  };
}

function createConstraintFixture(kind, allocation) {
  switch (String(kind || "open")) {
    case "forest-heavy": return createForestHeavyFixture(allocation);
    case "mountain-heavy": return createMountainHeavyFixture(allocation);
    case "road-heavy": return createRoadHeavyFixture(allocation);
    case "constrained-invalid": return createConstrainedInvalidFixture(allocation);
    default: return createOpenFixture(allocation);
  }
}

module.exports = Object.freeze({
  FIXTURE_KINDS,
  createDevelopmentCore25,
  createConstraintFixture,
  createOpenFixture,
  createForestHeavyFixture,
  createMountainHeavyFixture,
  createRoadHeavyFixture,
  createConstrainedInvalidFixture,
});
