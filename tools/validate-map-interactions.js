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
].join("\n"), context, { filename: gamePath });

assert.equal(context.shouldUseLowZoomPerformance(false, 0.71), true);
assert.equal(context.shouldUseLowZoomPerformance(true, 0.75), true, "Low-zoom mode should not flap near its entry threshold.");
assert.equal(context.shouldUseLowZoomPerformance(true, 0.79), false);

assert.equal(context.shouldUseCrowdedMapPerformance(false, 69, 23), false);
assert.equal(context.shouldUseCrowdedMapPerformance(false, 70, 0), true);
assert.equal(context.shouldUseCrowdedMapPerformance(true, 58, 0), true, "Crowded mode should remain stable near its entry threshold.");
assert.equal(context.shouldUseCrowdedMapPerformance(true, 57, 17), false);

const city = { id: "city", kind: "city", x: 0, y: 0 };
const target = { id: "target", kind: "city", x: 1000, y: 0 };
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 70, y: 0 }, city, target), true);
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 73, y: 0 }, city, target), false);

const stronghold = { id: "stronghold", kind: "stronghold", size: 200, x: 0, y: 0 };
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 120, y: 0 }, stronghold, target), true);
assert.equal(context.isMarchInsideEndpointInteractionClearance({ x: 130, y: 0 }, stronghold, target), false);

assert.match(stylesSource, /\.army-token\.endpoint-clearance\s*\{[\s\S]*?pointer-events:\s*none;/, "Endpoint march markers must pass pointer input through to cities.");

console.log("Validated stable map performance modes and march endpoint interaction clearance.");
