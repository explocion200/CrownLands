const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = JSON.parse(read("functions/economy-config.json"));
const clientSource = read("game.js");
const serverSource = read("functions/index.js");
const editorSource = read("tools/map-editor/editor.js");
const calculator = require(path.join(root, "battle-guide-calculations.js")).create(config);

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

const cityEconomy = config.cityEconomy;
const skills = config.skills;
const troopCombat = config.troopCombat;
const wallStats = {
  cityWallsBase: Number(cityEconomy.wallDefenseBase),
  cityWallsPerLevel: Number(cityEconomy.wallDefensePerLevel),
  wallCurveModelVersion: Number(cityEconomy.wallCurveModelVersion),
  wallEarlyScale: Number(cityEconomy.wallEarlyScale),
  wallEarlyExponent: Number(cityEconomy.wallEarlyExponent),
  wallEarlyEndLevel: Number(cityEconomy.wallEarlyEndLevel),
  wallBridgeEndLevel: Number(cityEconomy.wallBridgeEndLevel),
  wallBridgeDefense: Number(cityEconomy.wallBridgeDefense),
  wallMidEndLevel: Number(cityEconomy.wallMidEndLevel),
  wallMidDefense: Number(cityEconomy.wallMidDefense),
  wallGoldLinkedEndLevel: Number(cityEconomy.wallGoldLinkedEndLevel),
  wallGoldLinkedCostExponent: Number(cityEconomy.wallGoldLinkedCostExponent),
  wallProductionRatioEndLevel: Number(cityEconomy.wallProductionRatioEndLevel),
  wallProductionRatioMaximumHours: Number(cityEconomy.wallProductionRatioMaximumHours),
};

assert.equal(wallStats.wallCurveModelVersion, 2);
assert.equal(cityEconomy.troopsPerVictoryPoint, 10.3);
assert.equal(wallStats.cityWallsBase, 200);
assert.equal(wallStats.wallBridgeDefense, 1_456_669);
assert.equal(wallStats.wallMidDefense, 3_000_000);
assert.equal(wallStats.wallGoldLinkedEndLevel, 150);
assert.equal(wallStats.wallGoldLinkedCostExponent, 0.22881653173769995);
assert.equal(wallStats.wallProductionRatioMaximumHours, 240);
assert.equal("defensePercentPerLevel" in cityEconomy, false, "City level must never increase soldier defense.");
assert.equal(Number(troopCombat.baseAttackPowerPerTroop), 1.25);
assert.equal(Number(troopCombat.baseDefensePowerPerTroop), 1.30);

function createRuntimeWallContext() {
  const context = {
    CITY_LEVEL_STATS: wallStats,
    BASE_TROOP_DEFENSE_POWER: Number(troopCombat.baseDefensePowerPerTroop),
    clampCityLevel: level => Math.max(1, Math.floor(Number(level) || 1)),
    getMillionLordsPassiveGoldPerHour: calculator.getGoldPerHour,
    getCityUpgradeTargetHours: calculator.getUpgradeTargetHours,
    getBaseCityTroopProductionPerHour: calculator.getTroopsPerHour,
    Number,
    Math,
  };
  vm.createContext(context);
  return context;
}

const clientContext = createRuntimeWallContext();
const serverContext = createRuntimeWallContext();
vm.runInContext(extractFunction(clientSource, "getBaseCityWalls"), clientContext);
vm.runInContext(extractFunction(serverSource, "getBaseCityWalls"), serverContext);

const editorContext = {
  state: { economy: config },
  normalizeEconomyPreviewLevel: level => Math.max(1, Math.floor(Number(level) || 1)),
  readEconomyNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
  getEconomyPreviewGoldPerHour: level => calculator.getGoldPerHour(level),
  getEconomyPreviewUpgradeTargetHours: level => calculator.getUpgradeTargetHours(level),
  getEconomyPreviewTroopsPerHour: level => calculator.getTroopsPerHour(level),
  Number,
  Math,
};
vm.createContext(editorContext);
vm.runInContext(extractFunction(editorSource, "getEconomyPreviewBaseWall"), editorContext);

const expectedWalls = new Map([
  [1, 200],
  [2, 600],
  [5, 5_435],
  [10, 23_763],
  [25, 145_557],
  [30, 293_811],
  [40, 911_482],
  [50, 1_456_669],
  [75, 2_228_335],
  [100, 3_000_000],
  [101, 3_030_867],
  [125, 4_090_593],
  [150, 6_200_000],
  [151, 6_279_528],
  [175, 8_325_854],
  [200, 10_800_816],
  [250, 14_329_224],
  [500, 34_735_584],
]);
for (const [level, expected] of expectedWalls) {
  assert.equal(calculator.getBaseWall(level), expected, `Shared wall curve is wrong at Level ${level}.`);
  assert.equal(clientContext.getBaseCityWalls(level), expected, `Client wall curve is wrong at Level ${level}.`);
  assert.equal(serverContext.getBaseCityWalls(level), expected, `Server wall curve is wrong at Level ${level}.`);
  assert.equal(editorContext.getEconomyPreviewBaseWall(level), expected, `Map-editor wall preview is wrong at Level ${level}.`);
}

assert.match(clientSource, /const baseCityWalls = rewardCamp \? 0 : getBaseCityWalls\(level\)/);
assert.match(serverSource, /const baseCityWalls = rewardCamp \? 0 : getBaseCityWalls\(level\)/);
assert.match(extractFunction(clientSource, "getBaseCityWalls"), /wallGoldLinkedCostExponent/);
assert.match(extractFunction(serverSource, "getBaseCityWalls"), /wallProductionRatioMaximumHours/);

const baseAttackPower = Number(troopCombat.baseAttackPowerPerTroop);
const baseDefensePower = Number(troopCombat.baseDefensePowerPerTroop);
const levelOneWalls = calculator.getBaseWall(1);
const neutralLevelOneDefense = levelOneWalls + Math.floor(10 * baseDefensePower);
const defendedLevelOneDefense = levelOneWalls + Math.floor(200 * baseDefensePower);
assert.ok(200 * baseAttackPower > neutralLevelOneDefense, "Starting troops cannot capture a neutral Level 1 city.");
assert.ok(200 * baseAttackPower <= defendedLevelOneDefense, "An equally staffed Level 1 city cannot hold against 200 attackers.");

const stoneworksMaximum = Number(skills.stoneworks.maxPercent);
const shieldwallMaximum = Number(skills.shieldwallDiscipline.maxPercent);
const swordmasteryMaximum = Number(skills.swordmastery.maxPercent);
assert.equal(stoneworksMaximum, 75);
assert.equal(shieldwallMaximum, 60);
assert.equal(baseAttackPower * (1 + swordmasteryMaximum / 100), 2);

const siegeBenchmarks = new Map([
  [50, { wall: 2_549_170, attackers: 2_314_586 }],
  [100, { wall: 5_250_000, attackers: 3_665_001 }],
  [150, { wall: 10_850_000, attackers: 6_465_001 }],
]);
for (const [level, expected] of siegeBenchmarks) {
  const maxStoneworksWall = Math.floor(calculator.getBaseWall(level) * (1 + stoneworksMaximum / 100));
  const garrisonPower = Math.floor(1_000_000 * baseDefensePower * (1 + shieldwallMaximum / 100));
  const minimumMaxSwordAttackers = Math.floor((maxStoneworksWall + garrisonPower) / 2) + 1;
  assert.equal(maxStoneworksWall, expected.wall, `Max-Stoneworks wall changed at Level ${level}.`);
  assert.equal(minimumMaxSwordAttackers, expected.attackers, `One-wave threshold changed at Level ${level}.`);
}

let previousWall = 0;
for (let level = 1; level <= 10_000; level += 1) {
  const currentWall = serverContext.getBaseCityWalls(level);
  assert.ok(Number.isSafeInteger(currentWall), `Wall power exceeded safe-integer limits at Level ${level}.`);
  assert.ok(currentWall >= previousWall, `Wall power decreased between Levels ${level - 1} and ${level}.`);
  assert.equal(clientContext.getBaseCityWalls(level), currentWall, `Client/server wall mismatch at Level ${level}.`);
  assert.equal(editorContext.getEconomyPreviewBaseWall(level), currentWall, `Editor/server wall mismatch at Level ${level}.`);
  if (level > 1 && level <= wallStats.wallEarlyEndLevel) {
    assert.ok(currentWall / previousWall <= 3, `Early adjacent wall growth exceeds 3x at Level ${level}.`);
  }
  previousWall = currentWall;
}
assert.equal(calculator.getBaseWall(2) / calculator.getBaseWall(1), 3, "Level 2 must be exactly 3x Level 1.");

for (const level of [200, 250, 500, 1_000]) {
  const equivalentHours = calculator.getBaseWall(level)
    / (calculator.getTroopsPerHour(level) * baseDefensePower);
  assert.ok(Math.abs(equivalentHours - 240) < 0.01, `Post-200 wall ratio drifted at Level ${level}.`);
}

const level30ObjectiveDefense = calculator.getBaseWall(30) + Math.floor(10_000 * baseDefensePower * 1.1);
const level30ObjectiveAttackers = Math.floor(level30ObjectiveDefense / baseAttackPower) + 1;
assert.equal(level30ObjectiveAttackers, 246_489, "Level-30 objective defense benchmark drifted.");

console.log(
  `Validated the staged wall curve across client, server, guide, and editor: L1 ${levelOneWalls.toLocaleString()}, `
    + `L50 ${calculator.getBaseWall(50).toLocaleString()}, L100 ${calculator.getBaseWall(100).toLocaleString()}, `
    + `L150 ${calculator.getBaseWall(150).toLocaleString()}, and a 240-hour production ratio from L200 onward.`
);
