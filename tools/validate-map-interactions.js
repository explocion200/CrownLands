const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gamePath = path.resolve(__dirname, "..", "game.js");
const stylesPath = path.resolve(__dirname, "..", "styles.css");
const source = fs.readFileSync(gamePath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

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

const context = {
  CROWDED_MAP_CITY_THRESHOLD: readNumberConstant("CROWDED_MAP_CITY_THRESHOLD"),
  CROWDED_MAP_ARMY_THRESHOLD: readNumberConstant("CROWDED_MAP_ARMY_THRESHOLD"),
  CROWDED_MAP_CITY_EXIT_THRESHOLD: readNumberConstant("CROWDED_MAP_CITY_EXIT_THRESHOLD"),
  CROWDED_MAP_ARMY_EXIT_THRESHOLD: readNumberConstant("CROWDED_MAP_ARMY_EXIT_THRESHOLD"),
  LOW_ZOOM_PERFORMANCE_THRESHOLD: readNumberConstant("LOW_ZOOM_PERFORMANCE_THRESHOLD"),
  LOW_ZOOM_PERFORMANCE_EXIT_THRESHOLD: readNumberConstant("LOW_ZOOM_PERFORMANCE_EXIT_THRESHOLD"),
  MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE: readNumberConstant("MARCH_ENDPOINT_INTERACTION_MIN_CLEARANCE"),
  MARCH_ENDPOINT_INTERACTION_SIZE_RATIO: readNumberConstant("MARCH_ENDPOINT_INTERACTION_SIZE_RATIO"),
  ISLAND_PICKER_MIN_ZOOM: readNumberConstant("ISLAND_PICKER_MIN_ZOOM"),
  ISLAND_PICKER_MAX_ZOOM: readNumberConstant("ISLAND_PICKER_MAX_ZOOM"),
  DEFAULT_CAMP_VISUAL_SIZE: 132,
  isRewardCampTarget: target => target?.kind === "camp",
  isStronghold: target => target?.kind === "stronghold",
  getStrongholdVisualSize: target => Number(target?.size) || 154,
};

vm.createContext(context);
vm.runInContext([
  extractFunction("shouldUseCrowdedMapPerformance"),
  extractFunction("shouldUseLowZoomPerformance"),
  extractFunction("getMarchEndpointInteractionClearance"),
  extractFunction("isMarchInsideEndpointInteractionClearance"),
  extractFunction("clampIslandMapPickerZoom"),
  extractFunction("getIslandMapPinchGeometry"),
].join("\n"), context, { filename: gamePath });

assert.equal(context.shouldUseLowZoomPerformance(false, 0.71), true);
assert.equal(context.shouldUseLowZoomPerformance(true, 0.75), true, "Low-zoom mode should not flap near its entry threshold.");
assert.equal(context.shouldUseLowZoomPerformance(true, 0.79), false);

assert.equal(context.shouldUseCrowdedMapPerformance(false, 69, 23), false);
assert.equal(context.shouldUseCrowdedMapPerformance(false, 70, 0), true);
assert.equal(context.shouldUseCrowdedMapPerformance(true, 58, 0), true, "Crowded mode should remain stable near its entry threshold.");
assert.equal(context.shouldUseCrowdedMapPerformance(true, 57, 17), false);
assert.equal(context.clampIslandMapPickerZoom(0.01), context.ISLAND_PICKER_MIN_ZOOM);
assert.equal(context.clampIslandMapPickerZoom(0), context.ISLAND_PICKER_MIN_ZOOM);
assert.equal(context.clampIslandMapPickerZoom(0.2, 0.45), 0.45);
assert.equal(context.clampIslandMapPickerZoom(0.5), 0.5);
assert.equal(context.clampIslandMapPickerZoom(2), context.ISLAND_PICKER_MAX_ZOOM);
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
assert.match(source, /picker\.addEventListener\("wheel"[\s\S]*?event\.preventDefault\(\)[\s\S]*?queueWheelZoom[\s\S]*?event\.clientX/, "The mouse wheel should zoom the map around the pointer.");
assert.match(source, /ISLAND_PICKER_ZOOM_EASE_MS\s*=\s*\d+[\s\S]*?function attachIslandMapPickerZoom[\s\S]*?animateWheelZoom[\s\S]*?Math\.exp\(-elapsed \/ ISLAND_PICKER_ZOOM_EASE_MS\)/, "Wheel zoom should ease across animation frames.");
assert.match(source, /function attachIslandMapPickerPan[\s\S]*?const queuePan[\s\S]*?queuePan\(startScrollLeft - dx, startScrollTop - dy\)/, "The map picker should batch drag panning into animation frames.");
assert.match(source, /function getIslandMapPinchGeometry[\s\S]*?Math\.hypot/, "The map picker should calculate a two-pointer pinch gesture.");
assert.match(source, /touchPointers\.size >= 2[\s\S]*?requestAnimationFrame\(applyPendingPinchZoom\)/, "Mobile pinch updates should be coalesced to the display frame.");
assert.match(source, /function attachIslandMapPickerPan[\s\S]*?applyPendingPinchZoom[\s\S]*?targetViewportX/, "Mobile pinch gestures should zoom around the moving finger midpoint.");
assert.match(stylesSource, /\.island-map-canvas-frame[\s\S]*?--island-grid-base-w[\s\S]*?scale\(var\(--island-map-zoom/, "The map picker should zoom through a fixed-size transform layer.");
assert.doesNotMatch(source, /setProperty\("--island-grid-scaled-(?:w|h)"/, "Zoom frames must not resize the map layout.");
assert.match(stylesSource, /\.island-map-picker\s*\{[\s\S]*?scrollbar-width:\s*none;/, "The map picker should hide native scrollbars while remaining scrollable.");

const city = { id: "city", kind: "city", x: 0, y: 0 };
const target = { id: "target", kind: "city", x: 1000, y: 0 };
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 70, y: 0 }, city, target), true);
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 73, y: 0 }, city, target), false);

const stronghold = { id: "stronghold", kind: "stronghold", size: 200, x: 0, y: 0 };
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 120, y: 0 }, stronghold, target), true);
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 130, y: 0 }, stronghold, target), false);

assert.match(stylesSource, /\.army-token\.endpoint-clearance\s*\{[\s\S]*?pointer-events:\s*none;/, "Endpoint march markers must pass pointer input through to cities.");

const strongholdWheelSource = extractFunction("renderSelectedStrongholdWheel");
assert.match(strongholdWheelSource, /gold-camp-action-wheel stronghold-objective-action-wheel/, "Strongholds should use the camp-style action plaque.");
assert.match(strongholdWheelSource, /Scout[\s\S]*?Info[\s\S]*?Attack/, "Foreign strongholds should expose Scout, Info, and Attack actions.");
assert.match(strongholdWheelSource, /Send[\s\S]*?Reinforce/, "Owned strongholds should preserve send and reinforcement actions.");
assert.doesNotMatch(strongholdWheelSource, /Level|upgradeCity/, "Stronghold action plaques must not expose leveling.");

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
assert.match(upgradeCitySource, /city\.owner !== "player"[\s\S]*?return;/, "The upgrade handler must reject cities the player does not own.");
assert.match(upgradeCitySource, /isStronghold\(city\)[\s\S]*?return;/, "The upgrade handler must reject strongholds.");
assert.match(stylesSource, /\.stronghold-objective-action-wheel\s*\{[\s\S]*?translate\(-50%, -62%\)/, "Stronghold action plaques should align to stronghold artwork.");

console.log("Validated stable map performance modes, march endpoint clearance, and stronghold action plaques.");
