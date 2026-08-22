const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, ...relativePath.split("/")), "utf8");
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `Missing function body for ${name}`);
  const open = signatureEnd + 2;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

test("game loads scoped objective artwork config before runtime generation", () => {
  const html = read("index.html");
  const configIndex = html.indexOf('src="objective-visual-config.js');
  const gameIndex = html.indexOf('src="game.js');
  assert.ok(configIndex >= 0 && configIndex < gameIndex);
  const config = read("objective-visual-config.js");
  assert.match(config, /regionIdPrefix:\s*"core-v2-"/);
  assert.match(config, /camp:\s*132/);
  assert.match(config, /stronghold:\s*154/);
  assert.match(config, /crownCitadel:\s*260/);
});

test("generated objectives keep serialized interaction size separate from artwork size", () => {
  const game = read("game.js");
  const strongholds = functionSource(game, "generateEditorStrongholdSlots");
  const camps = functionSource(game, "generateWorldCampSlots");
  assert.match(strongholds, /const interactionSize = islandImageVisualSizeToWorld[\s\S]*getObjectiveImageVisualSize/);
  assert.match(strongholds, /size:\s*interactionSize,[\s\S]*visualSize/);
  assert.match(camps, /size:\s*interactionSize,\s*interactionSize,\s*visualSize/);
  assert.match(functionSource(game, "getExternalObjectiveImageVisualSize"), /startsWith\(prefix\)/);
});

test("hitboxes, route clearance, harvest clearance, march endpoints, and action wheels ignore artwork size", () => {
  const game = read("game.js");
  for (const name of [
    "getRouteObstacleRadius",
    "getHarvestBonusCityClearance",
    "getHarvestBonusCampClearance",
    "getMarchEndpointInteractionClearance",
    "renderSelectedStrongholdWheel",
    "renderSelectedRewardCampWheel",
  ]) {
    const source = functionSource(game, name);
    assert.doesNotMatch(source, /get(?:Stronghold|Camp)RenderSize|\.visualSize/, `${name} must preserve interaction geometry`);
  }
  assert.match(functionSource(game, "getRouteObstacleRadius"), /target\.size[\s\S]*getStrongholdVisualSize/);
  assert.match(functionSource(game, "getMarchEndpointInteractionClearance"), /target\.size[\s\S]*getStrongholdVisualSize/);
});

test("CSS uses interaction dimensions on nodes and visual dimensions only on artwork", () => {
  const styles = read("styles.css");
  assert.match(styles, /\.camp-node\s*\{[\s\S]*?width:\s*var\(--camp-size/);
  assert.match(styles, /\.camp-art\s*\{[\s\S]*?width:\s*var\(--camp-visual-size/);
  assert.match(styles, /\.stronghold-node\s*\{[\s\S]*?width:\s*var\(--stronghold-size/);
  assert.match(styles, /\.stronghold-building\s*\{[\s\S]*?width:\s*var\(--stronghold-visual-size/);
  assert.match(styles, /\.camp-art\.map-art-flip-x\s*\{[\s\S]*translate\(-50%, -50%\) scaleX\(-1\)/);
});
