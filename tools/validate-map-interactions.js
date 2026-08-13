const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gamePath = path.resolve(__dirname, "..", "game.js");
const instantActionsPath = path.resolve(__dirname, "..", "instant-economy-actions.js");
const stylesPath = path.resolve(__dirname, "..", "styles.css");
const interfaceThemePath = path.resolve(__dirname, "..", "interface-theme.css");
const source = `${fs.readFileSync(instantActionsPath, "utf8")}\n${fs.readFileSync(gamePath, "utf8")}`;
const stylesSource = `${fs.readFileSync(stylesPath, "utf8")}\n${fs.readFileSync(interfaceThemePath, "utf8")}`;

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function readNumberConstant(name) {
  const match = source.match(new RegExp(`const ${name} = ([0-9.]+);`));
  assert.ok(match, `Missing numeric constant ${name}.`);
  return Number(match[1]);
}

function routeLengthForTest(points = []) {
  return points.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point.x - points[index].x, point.y - points[index].y)
  ), 0);
}

function pointAlongRouteForTest(points = [], progress = 0) {
  const totalLength = routeLengthForTest(points);
  if (!points.length) return null;
  if (points.length === 1 || totalLength <= 0) return { ...points[0] };
  let wanted = totalLength * Math.max(0, Math.min(1, progress));
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (wanted <= length || index === points.length - 1) {
      const ratio = length > 0 ? wanted / length : 0;
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
    }
    wanted -= length;
  }
  return { ...points[points.length - 1] };
}

const context = {
  CROWDED_MAP_CITY_THRESHOLD: readNumberConstant("CROWDED_MAP_CITY_THRESHOLD"),
  CROWDED_MAP_ARMY_THRESHOLD: readNumberConstant("CROWDED_MAP_ARMY_THRESHOLD"),
  CROWDED_MAP_CITY_EXIT_THRESHOLD: readNumberConstant("CROWDED_MAP_CITY_EXIT_THRESHOLD"),
  CROWDED_MAP_ARMY_EXIT_THRESHOLD: readNumberConstant("CROWDED_MAP_ARMY_EXIT_THRESHOLD"),
  LOW_ZOOM_PERFORMANCE_THRESHOLD: readNumberConstant("LOW_ZOOM_PERFORMANCE_THRESHOLD"),
  LOW_ZOOM_PERFORMANCE_EXIT_THRESHOLD: readNumberConstant("LOW_ZOOM_PERFORMANCE_EXIT_THRESHOLD"),
  MAP_TOUCH_PAN_THRESHOLD: readNumberConstant("MAP_TOUCH_PAN_THRESHOLD"),
  MAP_TOUCH_TAP_TOLERANCE: readNumberConstant("MAP_TOUCH_TAP_TOLERANCE"),
  MAP_LOW_ZOOM_TAP_TOLERANCE_BONUS: readNumberConstant("MAP_LOW_ZOOM_TAP_TOLERANCE_BONUS"),
  MAP_CITY_TAP_RADIUS_PX: readNumberConstant("MAP_CITY_TAP_RADIUS_PX"),
  MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE: readNumberConstant("MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE"),
  MARCH_ENDPOINT_INTERACTION_SIZE_RATIO: readNumberConstant("MARCH_ENDPOINT_INTERACTION_SIZE_RATIO"),
  ISLAND_PICKER_MIN_ZOOM: readNumberConstant("ISLAND_PICKER_MIN_ZOOM"),
  ISLAND_PICKER_MAX_ZOOM: readNumberConstant("ISLAND_PICKER_MAX_ZOOM"),
  DEFAULT_CAMP_VISUAL_SIZE: 132,
  isRewardCampTarget: target => target?.kind === "camp",
  isStronghold: target => target?.kind === "stronghold",
  getStrongholdVisualSize: target => Number(target?.size) || 154,
  resolveCityTapButton: event => event?.cityButton || null,
  resolveArmyTapToken: event => event?.armyToken || null,
  clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  normalizeTimestampMs: value => Math.max(0, Number(value) || 0),
  getMissionRouteSegments: mission => mission?.segments || [],
  normalizeArmyPath: path => Array.isArray(path) ? path : [],
  getCityRegionId: mission => mission?.sourceRegionId || "west",
  routeLength: routeLengthForTest,
  pointAlongRoute: pointAlongRouteForTest,
};

vm.createContext(context);
vm.runInContext([
  extractFunction("shouldUseCrowdedMapPerformance"),
  extractFunction("shouldUseLowZoomPerformance"),
  extractFunction("resolveMapTapTargets"),
  extractFunction("getMapNodeTapMovementTolerance"),
  extractFunction("getMarchEndpointInteractionClearance"),
  extractFunction("isMarchInsideEndpointInteractionClearance"),
  extractFunction("clampIslandMapPickerZoom"),
  extractFunction("clampIslandMapPickerCamera"),
  extractFunction("getIslandMapPickerZoomAnchor"),
  extractFunction("getIslandMapPickerAnchoredCamera"),
  extractFunction("getIslandMapPickerZoomedCamera"),
  extractFunction("getIslandMapPinchGeometry"),
  extractFunction("getMissionPointAtProgress"),
  extractFunction("getArmyTravelProgress"),
].join("\n"), context, { filename: gamePath });

function createCityTapHarness({
  zoom = 0.4,
  directId = "source",
  hitIds = ["source"],
  renderedIds = hitIds,
  cityPositions = {},
  strongholdIds = [],
} = {}) {
  const allIds = [...new Set([...hitIds, ...renderedIds, ...Object.keys(cityPositions)])];
  const nodes = new Map(allIds.map(id => {
    const node = {
      dataset: { cityId: id },
      classList: {
        contains: className => className === "stronghold-node" && strongholdIds.includes(id),
      },
    };
    node.closest = selector => selector.includes(".city-node") ? node : null;
    return [id, node];
  }));
  const renderedNodes = renderedIds.map(id => nodes.get(id)).filter(Boolean);
  const cityLayer = {
    contains: node => renderedNodes.includes(node),
    querySelectorAll: () => renderedNodes,
  };
  const tapContext = {
    MAP_CITY_TAP_RADIUS_PX: context.MAP_CITY_TAP_RADIUS_PX,
    zoom,
    cityLayer,
    document: {
      elementsFromPoint: () => hitIds.map(id => nodes.get(id)).filter(Boolean),
    },
    screenToWorld: () => ({ x: 0, y: 0 }),
    cityById: id => cityPositions[id] ? { id, ...cityPositions[id] } : null,
  };
  vm.createContext(tapContext);
  vm.runInContext([
    extractFunction("findNearestCityTapNode"),
    extractFunction("resolveCityTapButton"),
  ].join("\n"), tapContext, { filename: gamePath });
  const directNode = nodes.get(directId) || null;
  const event = {
    clientX: 100,
    clientY: 100,
    target: directNode || { closest: () => null },
  };
  return { context: tapContext, event, nodes };
}

assert.equal(context.shouldUseLowZoomPerformance(false, 0.71), true);
assert.equal(context.shouldUseLowZoomPerformance(true, 0.75), true, "Low-zoom mode should not flap near its entry threshold.");
assert.equal(context.shouldUseLowZoomPerformance(true, 0.79), false);
assert.equal(context.getMapNodeTapMovementTolerance("mouse", 1), 12);
assert.equal(context.getMapNodeTapMovementTolerance("mouse", 0.4), 16);
assert.equal(context.getMapNodeTapMovementTolerance("touch", 1), 16);
assert.equal(context.getMapNodeTapMovementTolerance("touch", 0.4), 20);
const overlappingMapTargets = { cityButton: "city", armyToken: "army" };
assert.equal(context.resolveMapTapTargets(overlappingMapTargets, false).armyToken, "army");
assert.equal(context.resolveMapTapTargets(overlappingMapTargets, false).cityButton, null);
assert.equal(context.resolveMapTapTargets(overlappingMapTargets, true).cityButton, "city");
assert.equal(context.resolveMapTapTargets(overlappingMapTargets, true).armyToken, null);

const overlappingDestinationTap = createCityTapHarness({
  directId: "source",
  hitIds: ["source", "target"],
  renderedIds: ["source", "target"],
  cityPositions: {
    source: { x: 0, y: 0 },
    target: { x: 12, y: 0 },
  },
});
assert.equal(
  overlappingDestinationTap.context.resolveCityTapButton(overlappingDestinationTap.event, "source"),
  overlappingDestinationTap.nodes.get("target"),
  "Destination mode must select a city underneath the higher-stacked source marker.",
);

const directDestinationTap = createCityTapHarness({
  directId: "target",
  hitIds: ["source", "target"],
  renderedIds: ["source", "target"],
  cityPositions: {
    source: { x: 0, y: 0 },
    target: { x: 20, y: 0 },
  },
});
assert.equal(
  directDestinationTap.context.resolveCityTapButton(directDestinationTap.event, "source"),
  directDestinationTap.nodes.get("target"),
  "A directly tapped destination must win even when the source center is closer.",
);
assert.equal(
  directDestinationTap.context.resolveCityTapButton(directDestinationTap.event),
  directDestinationTap.nodes.get("source"),
  "Normal browsing must retain nearest-city resolution for overlapping markers.",
);

const nearestDestinationTap = createCityTapHarness({
  directId: "source",
  hitIds: ["source", "far-target", "near-target"],
  renderedIds: ["source", "far-target", "near-target"],
  cityPositions: {
    source: { x: 0, y: 0 },
    "far-target": { x: 24, y: 0 },
    "near-target": { x: 8, y: 0 },
  },
});
assert.equal(
  nearestDestinationTap.context.resolveCityTapButton(nearestDestinationTap.event, "source"),
  nearestDestinationTap.nodes.get("near-target"),
  "Ambiguous destination taps must select the nearest non-source city.",
);

const strongholdDestinationTap = createCityTapHarness({
  directId: "source",
  hitIds: ["source", "stronghold"],
  renderedIds: ["source", "stronghold"],
  cityPositions: {
    source: { x: 0, y: 0 },
    stronghold: { x: 18, y: 0 },
  },
  strongholdIds: ["stronghold"],
});
assert.equal(
  strongholdDestinationTap.context.resolveCityTapButton(strongholdDestinationTap.event, "source"),
  strongholdDestinationTap.nodes.get("stronghold"),
  "Owned and foreign Strongholds must remain selectable destinations under the source marker.",
);

const lowZoomNearbyTap = createCityTapHarness({
  zoom: 0.4,
  directId: "source",
  hitIds: ["source"],
  renderedIds: ["source", "target"],
  cityPositions: {
    source: { x: 0, y: 0 },
    target: { x: 100, y: 0 },
  },
});
assert.equal(
  lowZoomNearbyTap.context.resolveCityTapButton(lowZoomNearbyTap.event, "source"),
  lowZoomNearbyTap.nodes.get("target"),
  "The fixed screen-space radius must find a nearby destination at minimum zoom.",
);
const fullZoomSourceTap = createCityTapHarness({
  zoom: 1,
  directId: "source",
  hitIds: ["source"],
  renderedIds: ["source", "target"],
  cityPositions: {
    source: { x: 0, y: 0 },
    target: { x: 100, y: 0 },
  },
});
assert.equal(
  fullZoomSourceTap.context.resolveCityTapButton(fullZoomSourceTap.event, "source"),
  fullZoomSourceTap.nodes.get("source"),
  "A source-only tap must preserve the existing choose-a-different-destination response.",
);

assert.equal(context.shouldUseCrowdedMapPerformance(false, 69, 23), false);
assert.equal(context.shouldUseCrowdedMapPerformance(false, 70, 0), true);
assert.equal(context.shouldUseCrowdedMapPerformance(true, 58, 0), true, "Crowded mode should remain stable near its entry threshold.");
assert.equal(context.shouldUseCrowdedMapPerformance(true, 57, 17), false);
assert.equal(context.clampIslandMapPickerZoom(0.01), context.ISLAND_PICKER_MIN_ZOOM);
assert.equal(context.clampIslandMapPickerZoom(0), context.ISLAND_PICKER_MIN_ZOOM);
assert.equal(context.clampIslandMapPickerZoom(0.2, 0.45), 0.45);
assert.equal(context.clampIslandMapPickerZoom(0.5), 0.5);
assert.equal(context.clampIslandMapPickerZoom(2), context.ISLAND_PICKER_MAX_ZOOM);
const centeredCamera = context.clampIslandMapPickerCamera(
  { x: -500, y: -500, zoom: 1 },
  { width: 1000, height: 700 },
  { left: 100, top: 50, right: 500, bottom: 350, width: 400, height: 300 },
  20
);
assert.equal(centeredCamera.x, 200, "A world smaller than the viewport should stay centered horizontally.");
assert.equal(centeredCamera.y, 150, "A world smaller than the viewport should stay centered vertically.");
const boundedCamera = context.clampIslandMapPickerCamera(
  { x: 1000, y: -1000, zoom: 1 },
  { width: 600, height: 400 },
  { left: 100, top: 50, right: 1100, bottom: 850, width: 1000, height: 800 },
  20
);
assert.equal(boundedCamera.x, 480, "Panning should stop before the world is lost past the right edge.");
assert.equal(boundedCamera.y, -830, "Panning should stop before the world is lost past the top edge.");
const outerRegionOpeningCamera = context.clampIslandMapPickerCamera(
  { x: 300, y: 150, zoom: 1 },
  { width: 800, height: 500 },
  { left: 100, top: 50, right: 1400, bottom: 850, width: 1300, height: 800 },
  20
);
assert.equal(outerRegionOpeningCamera.x, 300, "An outer active region must remain centered when the map opens.");
assert.equal(outerRegionOpeningCamera.y, 150, "Opening centering must not be displaced by camera clamping.");
const focalCamera = context.getIslandMapPickerZoomedCamera(
  { x: -100, y: -50, zoom: 0.5 },
  1,
  300,
  200
);
assert.equal(focalCamera.x, -500);
assert.equal(focalCamera.y, -300);
assert.equal((300 - focalCamera.x) / focalCamera.zoom, (300 - (-100)) / 0.5, "Zooming must preserve the world point under the cursor.");
const renderedZoomAnchor = context.getIslandMapPickerZoomAnchor(
  { x: -100, y: -50, zoom: 0.5 },
  300,
  200
);
for (const intermediateZoom of [0.56, 0.67, 0.81, 0.94, 1]) {
  const intermediateCamera = context.getIslandMapPickerAnchoredCamera(renderedZoomAnchor, intermediateZoom);
  assert.ok(
    Math.abs((300 - intermediateCamera.x) / intermediateCamera.zoom - renderedZoomAnchor.worldX) < 1e-9,
    `The cursor world anchor must remain fixed at zoom ${intermediateZoom}.`,
  );
  assert.ok(
    Math.abs((200 - intermediateCamera.y) / intermediateCamera.zoom - renderedZoomAnchor.worldY) < 1e-9,
    `The cursor world anchor must remain fixed vertically at zoom ${intermediateZoom}.`,
  );
}
const rebasedZoomAnchor = context.getIslandMapPickerZoomAnchor(
  context.getIslandMapPickerAnchoredCamera(renderedZoomAnchor, 0.7),
  420,
  260
);
const rebasedCamera = context.getIslandMapPickerAnchoredCamera(rebasedZoomAnchor, 0.9);
assert.ok(Math.abs((420 - rebasedCamera.x) / rebasedCamera.zoom - rebasedZoomAnchor.worldX) < 1e-9, "Moving the cursor during an active zoom must rebase the world anchor.");
assert.ok(Math.abs((260 - rebasedCamera.y) / rebasedCamera.zoom - rebasedZoomAnchor.worldY) < 1e-9, "A rebased zoom anchor must remain fixed vertically.");
const pinchGeometry = context.getIslandMapPinchGeometry(new Map([
  [1, { x: 20, y: 30 }],
  [2, { x: 80, y: 110 }],
]));
assert.equal(pinchGeometry.centerX, 50);
assert.equal(pinchGeometry.centerY, 70);
assert.equal(pinchGeometry.distance, 100);
assert.doesNotMatch(source, /data-island-map-zoom-(?:out|in|fit|value)/, "The map picker should not render visible zoom controls.");
assert.doesNotMatch(source, /data-island-map-zoom-slider/, "The map picker should not render a zoom range slider.");
assert.match(source, /function getIslandMapPickerMinimumZoom[\s\S]*?getIslandMapPickerFitZoom/, "The map picker minimum zoom should stop at the all-maps view.");
assert.match(source, /function getIslandMapPickerFitZoom[\s\S]*?getIslandMapContentBounds/, "The all-maps zoom should use actual region bounds instead of padded stage bounds.");
assert.match(source, /picker\.addEventListener\("wheel"[\s\S]*?event\.preventDefault\(\)[\s\S]*?controller\.zoomTo[\s\S]*?event\.clientX/, "The mouse wheel should zoom the map around the pointer.");
assert.match(source, /ISLAND_PICKER_CAMERA_EASE_MS\s*=\s*\d+[\s\S]*?function createIslandMapPickerCameraController[\s\S]*?Math\.exp\(-elapsed \/ ISLAND_PICKER_CAMERA_EASE_MS\)/, "Desktop camera input should ease across animation frames.");
assert.match(source, /function createIslandMapPickerCameraController[\s\S]*?if \(!animationFrame\) animationFrame = requestAnimationFrame\(tick\)/, "Map camera updates should share one animation frame loop.");
assert.match(source, /function attachIslandMapPickerPan[\s\S]*?controller\.moveTo\(\{[\s\S]*?x: startCamera\.x \+ dx[\s\S]*?immediate: true/, "The map picker should batch drag panning through the transform camera.");
assert.match(source, /function getIslandMapPinchGeometry[\s\S]*?Math\.hypot/, "The map picker should calculate a two-pointer pinch gesture.");
assert.match(source, /const schedulePinch = \(\) => \{[\s\S]*?requestAnimationFrame\(applyPendingPinch\)/, "Mobile pinch input should coalesce pointer events into one update per display frame.");
assert.match(source, /const applyPendingPinch = \(\) => \{[\s\S]*?controller\.renderNow\(getIslandMapPickerZoomedCamera[\s\S]*?nextGeometry\.centerX/, "Mobile pinch gestures should directly track the moving finger midpoint.");
assert.match(source, /function createIslandMapPickerCameraController[\s\S]*?getIslandMapPickerAnchoredCamera\(zoomAnchor, nextZoom\)/, "Desktop zoom animation must derive every frame from the cursor anchor.");
assert.match(source, /const zoomTo = [\s\S]*?zoomAnchor = getIslandMapPickerZoomAnchor\(current, focalX, focalY\)/, "Desktop zoom input must anchor from the currently rendered camera.");
assert.match(source, /function setIslandMapPickerOpeningView[\s\S]*?getIslandMapPickerOpeningZoom[\s\S]*?position\.x \* zoom/, "Opening the map picker should center its camera on the active region.");
assert.match(source, /renderIslandSwitcherModalContent[\s\S]*?setIslandMapPickerOpeningView\(picker, activeRegionId \|\| homeRegionId\)/, "Every map picker open should reset to the active region.");
assert.doesNotMatch(source, /restoreIslandMapPickerView/, "The map picker must not restore a stale camera on reopen.");
assert.doesNotMatch(source, /picker\.scroll(?:Left|Top)/, "The map overview camera must not use native scroll offsets.");
assert.match(stylesSource, /\.island-map-canvas-frame[\s\S]*?translate3d\(var\(--island-camera-x[\s\S]*?scale\(var\(--island-map-zoom/, "The map picker should pan and zoom through one transform layer.");
assert.doesNotMatch(source, /setProperty\("--island-grid-scaled-(?:w|h)"/, "Zoom frames must not resize the map layout.");
assert.match(stylesSource, /\.island-map-picker\s*\{[\s\S]*?overflow:\s*hidden;/, "The transform camera viewport should clip the world without native scrolling.");

const city = { id: "city", kind: "city", x: 0, y: 0 };
const target = { id: "target", kind: "city", x: 1000, y: 0 };
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 70, y: 0 }, city, target), true);
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 73, y: 0 }, city, target), false);

const stronghold = { id: "stronghold", kind: "stronghold", size: 200, x: 0, y: 0 };
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 120, y: 0 }, stronghold, target), true);
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 130, y: 0 }, stronghold, target), false);

const twoIslandMarch = {
  launchedAtMs: 1000,
  arrivesAtMs: 3000,
  pathLength: 200,
  segments: [
    { regionId: "west", length: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    { regionId: "north", length: 100, points: [{ x: 0, y: 100 }, { x: 100, y: 100 }] },
  ],
};
for (const kind of ["attack", "scout", "transfer", "rally_join"]) {
  const mission = { ...twoIslandMarch, kind };
  const firstLocation = context.getMissionPointAtProgress(mission, context.getArmyTravelProgress(mission, 1500));
  const laterLocation = context.getMissionPointAtProgress(mission, context.getArmyTravelProgress(mission, 2500));
  assert.equal(firstLocation.regionId, "west", `${kind} should begin on its current source-side route segment.`);
  assert.equal(firstLocation.point.x, 50);
  assert.equal(laterLocation.regionId, "north", `${kind} should move to its current cross-island route segment.`);
  assert.equal(laterLocation.point.x, 50);
}
const returningMarch = {
  ...twoIslandMarch,
  returning: true,
  recalledAtMs: 2000,
  arrivesAtMs: 3000,
  returnStartProgress: 0.75,
};
const returnProgress = context.getArmyTravelProgress(returningMarch, 2500);
const returnLocation = context.getMissionPointAtProgress(returningMarch, returnProgress);
assert.equal(returnProgress, 0.375);
assert.equal(returnLocation.regionId, "west");
assert.equal(returnLocation.point.x, 75, "A recalled march should center on its current reverse-route position.");
const swiftMarch = {
  ...twoIslandMarch,
  swiftMarchUsedAtMs: 2000,
  swiftMarchProgressAtUse: 0.4,
};
const swiftProgress = context.getArmyTravelProgress(swiftMarch, 2500);
const swiftLocation = context.getMissionPointAtProgress(swiftMarch, swiftProgress);
assert.equal(swiftProgress, 0.7);
assert.equal(swiftLocation.regionId, "north");
assert.equal(swiftLocation.point.x, 40, "Swift March should center using accelerated live progress.");

assert.match(stylesSource, /\.army-token\.endpoint-clearance\s*\{[\s\S]*?pointer-events:\s*none;/, "Endpoint march markers must pass pointer input through to cities.");
assert.match(
  source,
  /function startPan[\s\S]*?resolveMapTapTargets\(event, sendMode, getCityTapExcludedSourceId\(\)\)/,
  "Destination selection must prioritize non-source city targets over overlapping map markers."
);
assert.match(
  source,
  /function resolveCityTapButton[\s\S]*?cityLayer\.querySelectorAll\("\.city-node\[data-city-id\]"\)/,
  "Low-zoom fallback selection must rank only city markers rendered on the active map.",
);
assert.match(
  source,
  /function movePan[\s\S]*?getMapNodeTapMovementTolerance\(panState\.pointerType, panState\.zoom\)/,
  "Map-node taps must use the zoom-aware movement tolerance before becoming pans."
);

const strongholdWheelSource = extractFunction("renderSelectedStrongholdWheel");
assert.match(strongholdWheelSource, /gold-camp-action-wheel stronghold-objective-action-wheel/, "Strongholds should use the camp-style action plaque.");
assert.match(strongholdWheelSource, /Scout[\s\S]*?Info[\s\S]*?Attack/, "Foreign strongholds should expose Scout, Info, and Attack actions.");
assert.match(strongholdWheelSource, /Send[\s\S]*?Reinforce/, "Owned strongholds should preserve send and reinforcement actions.");
assert.doesNotMatch(strongholdWheelSource, /Level|upgradeCity/, "Stronghold action plaques must not expose leveling.");
const controlledObjectiveBenefitSource = extractFunction("getControlledObjectiveBenefitBreakdown");
assert.match(
  controlledObjectiveBenefitSource,
  /getStrongholdDisplayName\(objective\)[\s\S]*?getStrongholdDisplayName\(city\)/,
  "Owned Stronghold and Citadel info must use the canonical objective-name helper."
);
assert.doesNotMatch(
  controlledObjectiveBenefitSource,
  /getStrongholdName\(/,
  "Owned objective info must not call the removed getStrongholdName helper."
);
const ownedObjectiveContext = {
  CROWN_CITADEL_GOLD_BONUS_PERCENT: 10,
  CLAN_SHARED_OBJECTIVE_MULTIPLIER: 0.5,
  formatNumber: value => String(value),
  getStrongholdBonusPercent: objective => Number(objective?.bonusPercent) || 0,
  getStrongholdDisplayName: objective => String(objective?.name || "Stronghold"),
  isCrownCitadel: objective => objective?.strongholdType === "crown",
  isStronghold: objective => objective?.kind === "stronghold",
};
vm.createContext(ownedObjectiveContext);
vm.runInContext(controlledObjectiveBenefitSource, ownedObjectiveContext);
const ownedDefenseStronghold = { id: "defense", kind: "stronghold", strongholdType: "defense", owner: "player", name: "Defense Stronghold", bonusPercent: 8 };
ownedObjectiveContext.getGlobalStatsSnapshot = () => ({ crownCitadelControlled: false });
ownedObjectiveContext.getAllOwnedCitiesForDisplay = () => [ownedDefenseStronghold];
assert.equal(
  ownedObjectiveContext.getControlledObjectiveBenefitBreakdown(ownedDefenseStronghold),
  "Defense Stronghold +8%",
  "An owned Stronghold must render its objective benefit without throwing."
);
const ownedCitadel = { id: "citadel", kind: "stronghold", strongholdType: "crown", owner: "player", name: "Crown Citadel", bonusPercent: 10 };
ownedObjectiveContext.getGlobalStatsSnapshot = () => ({ crownCitadelControlled: true });
ownedObjectiveContext.getAllOwnedCitiesForDisplay = () => [ownedCitadel, ownedDefenseStronghold];
assert.equal(
  ownedObjectiveContext.getControlledObjectiveBenefitBreakdown(ownedCitadel),
  "Citadel +10% · Defense Stronghold +4%",
  "Owned Citadel info must render alongside controlled Strongholds without throwing."
);

const cityInfoSource = extractFunction("showCityInfoModal");
assert.doesNotMatch(
  cityInfoSource,
  /if \(city\.owner !== "player"\) \{[\s\S]*?renderCityLevelUpAction\(city\)[\s\S]*?return;/,
  "Foreign city information must not render leveling controls."
);
assert.equal((cityInfoSource.match(/renderCityLevelUpAction\(city\)/g) || []).length, 1, "Only owned regular city information should render leveling controls.");
const cityLevelUpSource = extractFunction("renderCityLevelUpAction");
assert.match(
  cityLevelUpSource,
  /if \(!city \|\| city\.owner !== "player" \|\| isStronghold\(city\)\) return "";/,
  "The shared level-up renderer must reject foreign cities and every stronghold."
);
const upgradeCitySource = extractFunction("upgradeCity");
assert.match(upgradeCitySource, /city\.owner !== "player"[\s\S]*?return false;/, "The upgrade handler must reject cities the player does not own.");
assert.match(upgradeCitySource, /isStronghold\(city\)[\s\S]*?return false;/, "The upgrade handler must reject strongholds.");
assert.match(stylesSource, /\.stronghold-objective-action-wheel\s*\{[\s\S]*?translate\(-50%, -62%\)/, "Stronghold action plaques should align to stronghold artwork.");

const outgoingMarchCardSource = extractFunction("renderOutgoingAttackCard");
assert.match(outgoingMarchCardSource, /data-outgoing-march="\$\{escapeHtml\(marchId\)\}"/, "March cards should identify their live march instead of an endpoint city.");
assert.match(outgoingMarchCardSource, /aria-label="Go to current march location"/, "March location controls need a current-location accessible label.");
assert.doesNotMatch(outgoingMarchCardSource, /data-outgoing-city/, "March cards must not retain destination-based location controls.");
const focusOutgoingMarchSource = extractFunction("focusOutgoingMarchLocation");
assert.match(focusOutgoingMarchSource, /getOutgoingAttacks\(\)\.find/, "The location action should resolve the latest march snapshot when clicked.");
assert.match(focusOutgoingMarchSource, /getArmyTravelProgress\(mission, Date\.now\(\)\)[\s\S]*?getMissionPointAtProgress/, "The location action should calculate a fresh interpolated route position.");
assert.match(focusOutgoingMarchSource, /switchOnlineIsland\(regionId\)/, "Cross-island marches should open their current route segment.");
assert.match(focusOutgoingMarchSource, /centerOnWorldPoint\(point, regionId\)/, "The map should center on the current march point rather than a city.");
assert.match(source, /querySelectorAll\("\[data-outgoing-march\]"\)[\s\S]*?focusOutgoingMarchLocation/, "Kingdom Activity should bind the current march location control.");
assert.doesNotMatch(source, /function focusOutgoingAttackCity/, "The destination-only march focus handler should be removed.");

console.log("Validated stable map performance modes, live march focusing, low-zoom destination taps, march endpoint clearance, and stronghold action plaques.");
