"use strict";

const {
  digest,
  hashObject,
  createDeterministicRandom,
} = require("../map-scaling-phase-4/generator");
const { ASSET_LIBRARY_VERSION } = require("./asset-library");

const MAP_WIDTH = 1448;
const MAP_HEIGHT = 1086;
const GAMEPLAY_WIDTH = 13000;
const GAMEPLAY_HEIGHT = 17000;
const TERRAIN_PLAN_VERSION = "phase5-terrain-plan-v1";
const TERRAIN_PROFILES = Object.freeze([
  "agricultural",
  "woodland",
  "rolling_hills",
  "wetland",
  "trade_corridor",
]);

const PROFILE_PALETTES = Object.freeze({
  agricultural: Object.freeze({ ground: "#71844b", secondary: "#87945a", accent: "#a89a58", blocker: "#465c37", water: "#526f72" }),
  woodland: Object.freeze({ ground: "#596d42", secondary: "#687b49", accent: "#817746", blocker: "#314831", water: "#4d696a" }),
  rolling_hills: Object.freeze({ ground: "#718052", secondary: "#8b8b58", accent: "#8b7750", blocker: "#585a45", water: "#526d73" }),
  wetland: Object.freeze({ ground: "#637452", secondary: "#7c8058", accent: "#766c49", blocker: "#475343", water: "#4b6d70" }),
  trade_corridor: Object.freeze({ ground: "#748052", secondary: "#8b8656", accent: "#9a8054", blocker: "#4b5740", water: "#526d73" }),
});

function round(value, precision = 6) {
  const scale = 10 ** precision;
  return Math.round(Number(value) * scale) / scale;
}

function createPhase5Seed({ worldId, seasonId, regionId, coordinate, generatorVersion, retrySalt = "default" }) {
  const material = [
    worldId,
    seasonId,
    regionId,
    coordinate.gridX,
    coordinate.gridY,
    generatorVersion,
    ASSET_LIBRARY_VERSION,
    retrySalt,
  ].join("|");
  return Object.freeze({
    strategy: "sha256(worldId|seasonId|regionId|gridX|gridY|generatorVersion|assetLibraryVersion|retrySalt)",
    retrySalt: String(retrySalt || "default"),
    seedHash: digest(material),
    materialHash: digest(material),
  });
}

function ellipse(id, type, x, y, rx, ry, rot = 0) {
  return { id, type, x: Math.round(x), y: Math.round(y), rx: Math.round(rx), ry: Math.round(ry), rot: round(rot), blocksCities: true, blocksMovement: true };
}

function createBlockers(profile, random, constrained = false) {
  if (constrained) {
    return [
      ellipse("constrained-water", "water", 610, 500, 245, 260, -0.12),
      ellipse("constrained-mountain", "mountain", 845, 590, 235, 250, 0.2),
    ];
  }
  const jitter = (amount) => (random() - 0.5) * amount;
  if (profile === "woodland") {
    return [
      ellipse("woodland-nw", "dense_forest", 315 + jitter(40), 255 + jitter(30), 108, 72, -0.22),
      ellipse("woodland-ne", "dense_forest", 1090 + jitter(40), 265 + jitter(30), 116, 76, 0.19),
      ellipse("woodland-sw", "dense_forest", 340 + jitter(40), 780 + jitter(30), 112, 80, 0.12),
      ellipse("woodland-se", "dense_forest", 1080 + jitter(40), 760 + jitter(30), 110, 78, -0.15),
      ellipse("woodland-coppice", "dense_forest", 720 + jitter(32), 520 + jitter(24), 72, 52, 0.08),
    ];
  }
  if (profile === "rolling_hills") {
    return [
      ellipse("ridge-nw", "mountain", 340 + jitter(45), 260 + jitter(35), 124, 72, -0.3),
      ellipse("ridge-ne", "mountain", 1090 + jitter(45), 300 + jitter(35), 118, 70, 0.28),
      ellipse("ridge-sw", "mountain", 380 + jitter(45), 760 + jitter(35), 120, 76, 0.18),
      ellipse("ridge-se", "mountain", 1045 + jitter(45), 755 + jitter(35), 124, 78, -0.2),
    ];
  }
  if (profile === "wetland") {
    return [
      ellipse("wetland-west", "marsh", 315 + jitter(35), 370 + jitter(30), 118, 82, -0.18),
      ellipse("wetland-east", "marsh", 1110 + jitter(35), 700 + jitter(30), 120, 86, 0.14),
      ellipse("wetland-pond", "water", 1000 + jitter(30), 270 + jitter(25), 96, 68, 0.2),
      ellipse("wetland-reeds", "marsh", 430 + jitter(30), 780 + jitter(25), 88, 62, -0.12),
    ];
  }
  if (profile === "trade_corridor") {
    return [
      ellipse("trade-woods", "dense_forest", 300 + jitter(45), 285 + jitter(35), 92, 66, -0.2),
      ellipse("trade-rocks", "mountain", 1140 + jitter(45), 760 + jitter(35), 94, 68, 0.18),
      ellipse("trade-pond", "water", 1110 + jitter(35), 300 + jitter(30), 82, 58, 0.1),
    ];
  }
  return [
    ellipse("farm-woodlot", "dense_forest", 1125 + jitter(40), 280 + jitter(35), 86, 60, 0.16),
    ellipse("farm-pond", "water", 1080 + jitter(40), 785 + jitter(35), 88, 62, 0.2),
    ellipse("farm-rocks", "mountain", 310 + jitter(40), 735 + jitter(35), 78, 56, -0.18),
  ];
}

function createRoadSystem(random) {
  const hub = {
    x: Math.round(MAP_WIDTH * (0.48 + (random() - 0.5) * 0.08)),
    y: Math.round(MAP_HEIGHT * (0.51 + (random() - 0.5) * 0.08)),
  };
  const exits = Object.freeze({
    north: Object.freeze({ x: MAP_WIDTH / 2, y: 0 }),
    east: Object.freeze({ x: MAP_WIDTH, y: MAP_HEIGHT / 2 }),
    south: Object.freeze({ x: MAP_WIDTH / 2, y: MAP_HEIGHT }),
    west: Object.freeze({ x: 0, y: MAP_HEIGHT / 2 }),
  });
  const inner = {
    north: { x: Math.round(MAP_WIDTH * (0.46 + random() * 0.08)), y: Math.round(MAP_HEIGHT * 0.28) },
    east: { x: Math.round(MAP_WIDTH * 0.72), y: Math.round(MAP_HEIGHT * (0.46 + random() * 0.08)) },
    south: { x: Math.round(MAP_WIDTH * (0.46 + random() * 0.08)), y: Math.round(MAP_HEIGHT * 0.72) },
    west: { x: Math.round(MAP_WIDTH * 0.28), y: Math.round(MAP_HEIGHT * (0.46 + random() * 0.08)) },
  };
  const edgeRoads = Object.entries(exits).map(([side, exit]) => ({
    id: `road-${side}`,
    side,
    edgeExit: exit,
    halfWidth: 44,
    points: [exit, inner[side], hub],
  }));
  const branches = [
    {
      id: "road-branch-a",
      side: "internal",
      halfWidth: 32,
      points: [hub, { x: Math.round(MAP_WIDTH * 0.36), y: Math.round(MAP_HEIGHT * (0.30 + random() * 0.10)) }],
    },
    {
      id: "road-branch-b",
      side: "internal",
      halfWidth: 30,
      points: [hub, { x: Math.round(MAP_WIDTH * 0.64), y: Math.round(MAP_HEIGHT * (0.65 + random() * 0.08)) }],
    },
  ];
  return { exits, hub, edgeRoads, branches };
}

function flattenRoadCorridors(roadSystem) {
  return [...roadSystem.edgeRoads, ...roadSystem.branches].flatMap(road => (
    road.points.slice(1).map((point, index) => ({
      id: `${road.id}-segment-${index + 1}`,
      side: road.side,
      start: road.points[index],
      end: point,
      halfWidth: road.halfWidth,
    }))
  ));
}

function createRasterBlockerMask(blockers, width = 181, height = 136) {
  const bits = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x + 0.5) / width * MAP_WIDTH;
      const py = (y + 0.5) / height * MAP_HEIGHT;
      const blocked = blockers.some(shape => {
        const cosine = Math.cos(-(shape.rot || 0));
        const sine = Math.sin(-(shape.rot || 0));
        const dx = px - shape.x;
        const dy = py - shape.y;
        const rx = dx * cosine - dy * sine;
        const ry = dx * sine + dy * cosine;
        return rx * rx / (shape.rx * shape.rx) + ry * ry / (shape.ry * shape.ry) <= 1;
      });
      bits.push(blocked ? 1 : 0);
    }
  }
  const runs = [];
  let value = bits[0] || 0;
  let count = 0;
  for (const bit of bits) {
    if (bit === value) count += 1;
    else {
      runs.push([value, count]);
      value = bit;
      count = 1;
    }
  }
  runs.push([value, count]);
  return {
    schemaVersion: 1,
    derivedFromAuthoritativeVectorGeometry: true,
    authoritativeForPlacement: false,
    width,
    height,
    encoding: "row-major-rle-bit",
    runs,
    hash: hashObject({ width, height, runs }),
  };
}

function createVisualComposition(profile, palette, blockers, roadSystem, random) {
  const base = [{
    id: "ground-base",
    assetId: "ground.meadow.base",
    category: "ground",
    geometryRef: "land-polygon",
    drawOrder: 0,
    color: palette.ground,
  }];
  const patches = Array.from({ length: 18 }, (_, index) => ({
    id: `ground-patch-${index + 1}`,
    assetId: index % 3 === 0 ? "ground.worn_dirt.patch" : profile === "wetland" ? "ground.wet.patch" : "ground.grassland.patch",
    category: "ground_patch",
    geometryRef: "decorative-only",
    drawOrder: 5,
    x: Math.round(80 + random() * (MAP_WIDTH - 160)),
    y: Math.round(70 + random() * (MAP_HEIGHT - 140)),
    rx: Math.round(55 + random() * 120),
    ry: Math.round(32 + random() * 76),
    color: index % 2 ? palette.secondary : palette.accent,
    opacity: 0.16,
  }));
  const blockerArt = blockers.map(shape => ({
    id: `visual-${shape.id}`,
    assetId: shape.type === "water" ? "water.pond_edge"
      : shape.type === "mountain" ? "blocker.mountain"
        : shape.type === "marsh" ? "blocker.marsh" : "forest.dense_blocker",
    category: shape.type,
    geometryRef: shape.id,
    drawOrder: shape.type === "water" || shape.type === "marsh" ? 20 : 38,
    x: shape.x,
    y: shape.y,
    rx: shape.rx,
    ry: shape.ry,
    rot: shape.rot,
    color: shape.type === "water" ? palette.water : palette.blocker,
  }));
  const roadArt = [...roadSystem.edgeRoads, ...roadSystem.branches].map(road => ({
    id: `visual-${road.id}`,
    assetId: road.side === "internal" ? "road.shallow_curve" : "road.cardinal_edge",
    category: "road",
    geometryRef: road.id,
    drawOrder: 24,
    points: road.points,
    halfWidth: road.halfWidth,
    color: "#786347",
  }));
  return [...base, ...patches, ...blockerArt, ...roadArt].sort((left, right) => left.drawOrder - right.drawOrder || left.id.localeCompare(right.id));
}

function createTerrainPlan({ allocation, profile = "agricultural", generatorVersion, retrySalt = "default", constrained = false }) {
  if (!TERRAIN_PROFILES.includes(profile) && !constrained) throw new Error(`Unknown terrain profile ${profile}.`);
  const seed = createPhase5Seed({
    worldId: allocation.worldId,
    seasonId: allocation.seasonId,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    generatorVersion,
    retrySalt,
  });
  const random = createDeterministicRandom(seed.seedHash);
  const palette = PROFILE_PALETTES[profile] || PROFILE_PALETTES.wetland;
  const roadSystem = createRoadSystem(random);
  const blockers = createBlockers(profile, random, constrained);
  const landPolygon = constrained ? [
    { x: 500, y: 290 }, { x: 948, y: 290 }, { x: 948, y: 796 }, { x: 500, y: 796 },
  ] : [
    { x: 78, y: 92 }, { x: 270, y: 54 }, { x: 1160, y: 54 }, { x: 1372, y: 145 },
    { x: 1402, y: 850 }, { x: 1300, y: 1022 }, { x: 160, y: 1022 }, { x: 44, y: 840 },
  ];
  const plan = {
    schemaVersion: 1,
    terrainPlanVersion: TERRAIN_PLAN_VERSION,
    generatorVersion,
    assetLibraryVersion: ASSET_LIBRARY_VERSION,
    developmentOnly: true,
    profile,
    regionId: allocation.regionId,
    coordinate: allocation.coordinate,
    dimensions: { width: MAP_WIDTH, height: MAP_HEIGHT, aspectRatio: "4:3", opaque: true },
    gameplayCoordinateSystem: {
      width: GAMEPLAY_WIDTH,
      height: GAMEPLAY_HEIGHT,
      pixelToGameplay: { xScale: round(GAMEPLAY_WIDTH / MAP_WIDTH, 12), yScale: round(GAMEPLAY_HEIGHT / MAP_HEIGHT, 12) },
      gameplayToPixel: { xScale: round(MAP_WIDTH / GAMEPLAY_WIDTH, 12), yScale: round(MAP_HEIGHT / GAMEPLAY_HEIGHT, 12) },
    },
    seed,
    palette,
    landPolygon,
    blockers,
    roadSystem,
    roadCorridors: flattenRoadCorridors(roadSystem),
    transitionZones: Object.entries(roadSystem.exits).map(([side, point]) => ({ id: `transition-${side}`, side, ...point, radius: 104 })),
    crossings: [],
  };
  plan.blockerMask = createRasterBlockerMask(blockers);
  plan.visualComposition = createVisualComposition(profile, palette, blockers, roadSystem, random);
  plan.hashes = {
    terrainHash: hashObject({ profile, palette, landPolygon }),
    blockerHash: hashObject({ blockers, blockerMaskHash: plan.blockerMask.hash }),
    roadHash: hashObject({ roadSystem, roadCorridors: plan.roadCorridors }),
    visualPlanHash: hashObject(plan.visualComposition),
  };
  plan.terrainPlanHash = hashObject({ ...plan, terrainPlanHash: undefined });
  return plan;
}

function createPhase4Definition(allocation, terrainPlan) {
  return {
    id: allocation.regionId,
    name: `Phase 5 ${terrainPlan.profile.replace(/_/g, " ")}`,
    purpose: "player_region",
    permanentCore: false,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    mapAsset: null,
    thumbnailAsset: null,
    terrain: {
      source: `${TERRAIN_PLAN_VERSION}:${terrainPlan.terrainPlanHash}`,
      authoritativeData: true,
      derivedFromImagePixels: false,
      landPolygon: terrainPlan.landPolygon,
      blockers: terrainPlan.blockers,
      prohibitedTerrain: [],
    },
    roadCorridors: terrainPlan.roadCorridors,
    noCityZones: [],
    camps: [],
    strongholds: [],
    citadels: [],
  };
}

function pixelToGameplay(point = {}) {
  return {
    x: Math.round(Number(point.x) / MAP_WIDTH * GAMEPLAY_WIDTH),
    y: Math.round(Number(point.y) / MAP_HEIGHT * GAMEPLAY_HEIGHT),
  };
}

module.exports = Object.freeze({
  MAP_WIDTH,
  MAP_HEIGHT,
  GAMEPLAY_WIDTH,
  GAMEPLAY_HEIGHT,
  TERRAIN_PLAN_VERSION,
  TERRAIN_PROFILES,
  PROFILE_PALETTES,
  createPhase5Seed,
  createTerrainPlan,
  createPhase4Definition,
  createRasterBlockerMask,
  flattenRoadCorridors,
  pixelToGameplay,
});
