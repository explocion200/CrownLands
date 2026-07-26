const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const economySource = fs.readFileSync(path.join(root, "economy-config.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  assert.ok(parametersEnd >= 0, `Could not parse ${name} parameters.`);
  const bodyStart = source.indexOf("{", parametersEnd);
  let bodyDepth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") bodyDepth += 1;
    if (source[index] === "}") bodyDepth -= 1;
    if (bodyDepth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const economyContext = { window: {} };
vm.createContext(economyContext);
vm.runInContext(economySource, economyContext, { filename: path.join(root, "economy-config.js") });
const cityEconomy = economyContext.window.CROWNLANDS_ECONOMY_CONFIG?.cityEconomy || {};
const skillConfig = economyContext.window.CROWNLANDS_ECONOMY_CONFIG?.skills || {};
const defensePercentPerLevel = Number(cityEconomy.defensePercentPerLevel);
const wallStats = {
  cityWallsBase: Number(cityEconomy.wallDefenseBase),
  cityWallsExponent: Number(cityEconomy.wallDefenseExponent),
  cityWallsExponentScale: Number(cityEconomy.wallDefenseScale),
};

assert.deepEqual(wallStats, {
  cityWallsBase: 200,
  cityWallsExponent: 3,
  cityWallsExponentScale: 3,
});
assert.equal(defensePercentPerLevel, 2, "City soldier defense must be 2% per city level.");

function createWallContext() {
  const context = {
    CITY_LEVEL_STATS: wallStats,
    clampCityLevel: level => Math.max(1, Math.floor(Number(level) || 1)),
  };
  vm.createContext(context);
  return context;
}

const clientContext = createWallContext();
const serverContext = createWallContext();
vm.runInContext(extractFunction(clientSource, "getBaseCityWalls"), clientContext);
vm.runInContext(extractFunction(serverSource, "getBaseCityWalls"), serverContext);

const expectedWalls = new Map([
  [1, 200],
  [10, 3_197],
  [25, 47_072],
  [50, 375_197],
  [75, 1_265_822],
  [100, 3_000_197],
  [150, 10_125_197],
  [200, 24_000_197],
]);
for (const [level, expected] of expectedWalls) {
  assert.equal(clientContext.getBaseCityWalls(level), expected, `Client wall curve is wrong at level ${level}.`);
  assert.equal(serverContext.getBaseCityWalls(level), expected, `Server wall curve is wrong at level ${level}.`);
}

assert.match(clientSource, /const baseCityWalls = getBaseCityWalls\(level\)/);
assert.match(serverSource, /const baseCityWalls = getBaseCityWalls\(level\)/);
assert.doesNotMatch(clientSource, /cityWallsPerLevel/);
assert.doesNotMatch(serverSource, /cityWallsPerLevel/);

const baseAttackPower = 2;
const levelOneWalls = clientContext.getBaseCityWalls(1);
const neutralLevelOneDefense = levelOneWalls + Math.floor(10 * 1.02);
const defendedLevelOneDefense = levelOneWalls + Math.floor(200 * 1.02);
assert.ok(200 * baseAttackPower > neutralLevelOneDefense, "Starting troops cannot capture a neutral level-1 city.");
assert.ok(200 * baseAttackPower <= defendedLevelOneDefense, "An equally staffed level-1 city cannot hold against 200 attackers.");

const stoneworksMaximum = Number(skillConfig.stoneworks?.maxPercent);
assert.equal(stoneworksMaximum, 75, "Stoneworks maximum changed without rebalancing wall tests.");
const level100Walls = clientContext.getBaseCityWalls(100);
const level100MaxStoneworksWalls = Math.floor(level100Walls * (1 + stoneworksMaximum / 100));
assert.ok(level100MaxStoneworksWalls - level100Walls >= 2_250_000, "Max Stoneworks is not meaningful at level 100.");

const level30Walls = clientContext.getBaseCityWalls(30);
const level30ObjectiveDefense = level30Walls + Math.floor(10_000 * 1.6);
const level30ObjectiveAttackers = Math.floor(level30ObjectiveDefense / baseAttackPower) + 1;
assert.ok(
  level30ObjectiveAttackers >= 48_000 && level30ObjectiveAttackers <= 50_000,
  "Level-30 objective defenses are outside the intended opening objective range."
);

console.log(
  `Validated 2% soldier defense per level and scalable city walls: L1 ${levelOneWalls.toLocaleString()}, `
    + `L50 ${clientContext.getBaseCityWalls(50).toLocaleString()}, `
    + `L100 ${level100Walls.toLocaleString()} `
    + `(Stoneworks max ${level100MaxStoneworksWalls.toLocaleString()}).`
);
