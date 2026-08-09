const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const economySource = fs.readFileSync(path.join(root, "economy-config.js"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "tools", "map-editor", "editor.js"), "utf8");

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
const troopCombat = economyContext.window.CROWNLANDS_ECONOMY_CONFIG?.troopCombat || {};
const wallStats = {
  cityWallsBase: Number(cityEconomy.wallDefenseBase),
  cityWallsPerLevel: Number(cityEconomy.wallDefensePerLevel),
};

assert.deepEqual(wallStats, {
  cityWallsBase: 200,
  cityWallsPerLevel: 28858,
});
assert.equal("defensePercentPerLevel" in cityEconomy, false, "City level must never increase soldier defense.");
assert.equal(Number(troopCombat.baseAttackPowerPerTroop), 1.25, "Base troop attack must be 1.25.");
assert.equal(Number(troopCombat.baseDefensePowerPerTroop), 1.30, "Base troop defense must be 1.30.");

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
const editorContext = {
  state: { economy: { cityEconomy } },
  normalizeEconomyPreviewLevel: level => Math.max(1, Math.floor(Number(level) || 1)),
  readEconomyNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  Number,
  Math,
};
vm.createContext(editorContext);
vm.runInContext(extractFunction(editorSource, "getEconomyPreviewBaseWall"), editorContext);

const expectedWalls = new Map([
  [1, 200],
  [10, 259_922],
  [20, 548_502],
  [25, 692_792],
  [30, 837_082],
  [40, 1_125_662],
  [50, 1_414_242],
  [75, 2_135_692],
  [100, 2_857_142],
  [150, 4_300_042],
  [200, 5_742_942],
  [500, 14_400_342],
  [1000, 28_829_342],
]);
for (const [level, expected] of expectedWalls) {
  assert.equal(clientContext.getBaseCityWalls(level), expected, `Client wall curve is wrong at level ${level}.`);
  assert.equal(serverContext.getBaseCityWalls(level), expected, `Server wall curve is wrong at level ${level}.`);
  assert.equal(editorContext.getEconomyPreviewBaseWall(level), expected, `Map-editor wall preview is wrong at level ${level}.`);
}

assert.match(clientSource, /const baseCityWalls = rewardCamp \? 0 : getBaseCityWalls\(level\)/);
assert.match(serverSource, /const baseCityWalls = rewardCamp \? 0 : getBaseCityWalls\(level\)/);
assert.doesNotMatch(clientSource, /cityWallsExponent|cityWallsTransition/);
assert.doesNotMatch(serverSource, /cityWallsExponent|cityWallsTransition/);
assert.doesNotMatch(clientSource, /cityWallsAcceleration/);
assert.doesNotMatch(serverSource, /cityWallsAcceleration/);

const baseAttackPower = Number(troopCombat.baseAttackPowerPerTroop);
const baseDefensePower = Number(troopCombat.baseDefensePowerPerTroop);
assert.equal(baseAttackPower, 1.25, "Base troop attack must be 1.25.");
const levelOneWalls = clientContext.getBaseCityWalls(1);
const neutralLevelOneDefense = levelOneWalls + Math.floor(10 * baseDefensePower);
const defendedLevelOneDefense = levelOneWalls + Math.floor(200 * baseDefensePower);
assert.ok(200 * baseAttackPower > neutralLevelOneDefense, "Starting troops cannot capture a neutral level-1 city.");
assert.ok(200 * baseAttackPower <= defendedLevelOneDefense, "An equally staffed level-1 city cannot hold against 200 attackers.");

const stoneworksMaximum = Number(skillConfig.stoneworks?.maxPercent);
assert.equal(stoneworksMaximum, 75, "Stoneworks maximum changed without rebalancing wall tests.");
const level100Walls = clientContext.getBaseCityWalls(100);
const level100MaxStoneworksWalls = Math.floor(level100Walls * (1 + stoneworksMaximum / 100));
assert.equal(level100MaxStoneworksWalls, 4_999_998, "Level 100 max-Stoneworks wall changed outside the approved balance.");

const siegeBenchmarks = new Map([
  [50, { wall: 2_474_923, attackers: 2_277_462 }],
  [100, { wall: 4_999_998, attackers: 3_540_000 }],
  [150, { wall: 7_525_073, attackers: 4_802_537 }],
]);
for (const [level, expected] of siegeBenchmarks) {
  const maxStoneworksWall = Math.floor(serverContext.getBaseCityWalls(level) * (1 + stoneworksMaximum / 100));
  const shieldwallMaximum = Number(skillConfig.shieldwallDiscipline?.maxPercent);
  assert.equal(shieldwallMaximum, 60, "Shieldwall maximum changed without rebalancing siege tests.");
  const garrisonPower = Math.floor(1_000_000 * baseDefensePower * (1 + shieldwallMaximum / 100));
  const maxSwordAttackPower = baseAttackPower * (1 + Number(skillConfig.swordmastery?.maxPercent) / 100);
  assert.equal(maxSwordAttackPower, 2, "Maximum Swordmastery attack power must be 2 per troop.");
  const minimumMaxSwordAttackers = Math.floor((maxStoneworksWall + garrisonPower) / maxSwordAttackPower) + 1;
  assert.equal(maxStoneworksWall, expected.wall, `Max-Stoneworks wall changed at Level ${level}.`);
  assert.equal(minimumMaxSwordAttackers, expected.attackers, `One-wave threshold changed at Level ${level}.`);
}

let previousWall = 0;
for (let level = 1; level <= 10_000; level += 1) {
  const currentWall = serverContext.getBaseCityWalls(level);
  assert.ok(currentWall >= previousWall, `Wall power decreased between levels ${level - 1} and ${level}.`);
  assert.equal(clientContext.getBaseCityWalls(level), currentWall, `Client/server wall mismatch at level ${level}.`);
  if (level > 1) assert.equal(currentWall - previousWall, 28_858, `Wall growth is not linear at Level ${level}.`);
  previousWall = currentWall;
}
assert.doesNotMatch(extractFunction(serverSource, "getBaseCityWalls"), /normalizedLevel\s*>\s*100/);
assert.doesNotMatch(extractFunction(clientSource, "getBaseCityWalls"), /normalizedLevel\s*>\s*100/);

const level30Walls = clientContext.getBaseCityWalls(30);
const level30ObjectiveDefense = level30Walls + Math.floor(10_000 * baseDefensePower * 1.1);
const level30ObjectiveAttackers = Math.floor(level30ObjectiveDefense / baseAttackPower) + 1;
assert.equal(level30ObjectiveAttackers, 681_106, "Level-30 objective defense benchmark drifted.");

console.log(
  `Validated 1.25 base attack, 1.30 soldier defense, Shieldwall Discipline, and one linear wall curve: L1 ${levelOneWalls.toLocaleString()}, `
    + `L50 ${clientContext.getBaseCityWalls(50).toLocaleString()}, `
    + `L100 ${level100Walls.toLocaleString()} `
    + `(Stoneworks max ${level100MaxStoneworksWalls.toLocaleString()}).`
);
