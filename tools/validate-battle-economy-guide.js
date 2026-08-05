const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = JSON.parse(read("functions/economy-config.json"));
const guide = require(path.join(root, "battle-guide-calculations.js"));
const calculator = guide.create(config);
const server = read("functions/index.js");
const client = read("game.js");
const page = read("battle-economy-guide.html");
const runtime = read("battle-economy-guide.js");
const styles = read("battle-economy-guide.css");

function readNumericConstant(source, name) {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*([0-9_.]+);`).exec(source);
  assert.ok(match, `Missing ${name}.`);
  return Number(match[1].replaceAll("_", ""));
}

assert.equal(guide.RULES.baseAttackPowerPerTroop, readNumericConstant(server, "BASE_TROOP_ATTACK_POWER"));
assert.equal(guide.RULES.baseAttackPowerPerTroop, readNumericConstant(client, "BASE_TROOP_ATTACK_POWER"));
assert.equal(guide.RULES.strongerKingdomAssaultRatio, readNumericConstant(server, "ATTACK_PROTECTION_ASSAULT_MIN_RATIO"));
assert.equal(guide.RULES.strongerKingdomRaidRatio, readNumericConstant(server, "ATTACK_PROTECTION_RAID_MIN_RATIO"));
assert.equal(guide.RULES.strongholdEffectiveLevel, 50);
assert.equal(guide.RULES.citadelEffectiveLevel, 100);

const expectedMilestones = {
  1: { vp: 12, gold: 300, troops: 120, wall: 200, repair: 15 },
  25: { vp: 260, gold: 4080, troops: 2600, wall: 47071, repair: 23 },
  50: { vp: 599, gold: 62160, troops: 5990, wall: 375172, repair: 30 },
  75: { vp: 985, gold: 945060, troops: 9850, wall: 1263684, repair: 38 },
  100: { vp: 1408, gold: 14365905, troops: 14080, wall: 2951425, repair: 45 },
  150: { vp: 2338, gold: 673784109, troops: 23380, wall: 7872309, repair: 60 },
};

for (const [levelText, expected] of Object.entries(expectedMilestones)) {
  const level = Number(levelText);
  assert.equal(calculator.getVictoryPoints(level), expected.vp, `Level ${level} VP drifted.`);
  assert.equal(calculator.getGoldPerHour(level), expected.gold, `Level ${level} gold drifted.`);
  assert.equal(calculator.getTroopsPerHour(level), expected.troops, `Level ${level} troops drifted.`);
  assert.equal(calculator.getBaseWall(level), expected.wall, `Level ${level} wall drifted.`);
  assert.equal(calculator.getRepairMinutes(level), expected.repair, `Level ${level} repair drifted.`);
}

assert.equal(calculator.getRepairMinutes(200), 75);
assert.equal(calculator.getRepairMinutes(500), 165);
for (let level = 2; level <= 500; level += 1) {
  assert.ok(calculator.getBaseWall(level) >= calculator.getBaseWall(level - 1), `Wall curve fell at Level ${level}.`);
  assert.ok(calculator.getRepairMinutes(level) >= calculator.getRepairMinutes(level - 1), `Repair curve fell at Level ${level}.`);
}

const skillExpectations = {
  swordmastery: { level: 30, percent: 60 },
  stoneworks: { level: 25, percent: 75 },
  taxStewardship: { level: 25, percent: 75 },
  royalGranaries: { level: 25, percent: 75 },
  guildCharters: { level: 25, percent: 50 },
  marchOrders: { level: 20, percent: 60 },
  fieldMedics: { level: 25, percent: 50 },
};
for (const [skill, expectation] of Object.entries(skillExpectations)) {
  assert.equal(calculator.getSkillMaximumLevel(skill), expectation.level, `${skill} maximum level drifted.`);
  assert.equal(calculator.getSkillPercent(skill, 1000), expectation.percent, `${skill} cap drifted.`);
}

const unboosted = calculator.getCitySnapshot({ level: 50, defenderTroops: 1_000_000 });
const boosted = calculator.getCitySnapshot({
  level: 50,
  defenderTroops: 1_000_000,
  taxStewardshipLevel: 25,
  royalGranariesLevel: 25,
  stoneworksLevel: 25,
  guildChartersLevel: 25,
  citadelPackagePercent: 10,
  citadelUpgradeReductionPercent: 10,
});
assert.equal(boosted.goldPerHour, Math.floor(unboosted.baseGoldPerHour * 1.85), "Gold bonuses must add against base.");
assert.equal(boosted.troopsPerHour, Math.floor(unboosted.baseTroopsPerHour * 1.85), "Troop bonuses must add against base.");
assert.equal(boosted.fullWallPower, Math.floor(Math.floor(unboosted.baseWall * 1.75) * 1.1), "Stoneworks and objective wall stages drifted.");
assert.equal(boosted.ownerGarrisonPower, 2_200_000, "Level and objective garrison defense drifted.");
assert.ok(boosted.upgradeCost < unboosted.upgradeCost, "Upgrade reductions must lower the next upgrade price.");

const equality = calculator.simulateSiege({
  attackerTroops: 100,
  cityLevel: 1,
  defenderTroops: 0,
  wallIntegrityPercent: 100,
});
assert.equal(equality.attackPower, 200);
assert.equal(equality.startingWallPower, 200);
assert.equal(equality.captured, false, "Equal attack and defense must not capture.");
assert.equal(equality.outcome, "garrison_hold");

const onePowerWin = calculator.simulateSiege({
  attackerTroops: 101,
  cityLevel: 1,
  defenderTroops: 0,
  wallIntegrityPercent: 100,
});
assert.equal(onePowerWin.captured, true, "More power than total defense must capture.");
assert.equal(onePowerWin.minimumCaptureTroops, 101);
assert.equal(onePowerWin.attackerSurvivors, 1, "Winning survivors must use fully resolved wall and garrison power.");

const wallHold = calculator.simulateSiege({
  attackerTroops: 10_000,
  cityLevel: 50,
  defenderTroops: 1_000_000,
  stoneworksLevel: 25,
  wallIntegrityPercent: 100,
});
assert.equal(wallHold.outcome, "wall_hold");
assert.ok(wallHold.defenderLosses <= wallHold.totalDefenderTroops * 0.1, "An intact wall exceeded the defender-loss cap.");

const garrisonHold = calculator.simulateSiege({
  attackerTroops: 1_000_000,
  cityLevel: 50,
  defenderTroops: 1_000_000,
  wallIntegrityPercent: 100,
});
assert.equal(garrisonHold.wallBreached, true);
assert.equal(garrisonHold.captured, false);
assert.equal(garrisonHold.outcome, "garrison_hold");
assert.ok(garrisonHold.defenderLosses <= garrisonHold.totalDefenderTroops * 0.82, "A garrison hold exceeded the loss cap.");

const capture = calculator.simulateSiege({
  attackerTroops: 1_300_000,
  cityLevel: 50,
  defenderTroops: 1_000_000,
  wallIntegrityPercent: 100,
});
assert.equal(capture.captured, true);
assert.equal(capture.defenderSurvivors, 0);
assert.ok(capture.attackerSurvivors > 0);

const reinforcement = calculator.simulateSiege({
  attackerTroops: 1_300_000,
  cityLevel: 50,
  defenderTroops: 1_000_000,
  reinforcementTroops: 500_000,
  reinforcementDefensePercent: 10,
  wallIntegrityPercent: 100,
});
assert.equal(reinforcement.reinforcementGarrisonPower, 550_000, "Reinforcements must use their own bonus without city-level defense.");
assert.equal(reinforcement.fullWallPower, capture.fullWallPower, "Reinforcements must not add another wall.");

const belowFive = calculator.simulateSiege({
  attackerTroops: 4,
  cityLevel: 1,
  defenderTroops: 0,
  wallIntegrityPercent: 100,
});
assert.equal(belowFive.meaningfulWallDamage, false);
assert.equal(belowFive.endingIntegrityBps, 10_000, "Insignificant wall damage must not persist.");
const exactFive = calculator.simulateSiege({
  attackerTroops: 5,
  cityLevel: 1,
  defenderTroops: 100,
  wallIntegrityPercent: 100,
});
assert.equal(exactFive.wallDamagePower, 10);
assert.equal(exactFive.meaningfulWallDamage, true, "Exactly 5% wall damage must persist.");
assert.equal(exactFive.endingIntegrityBps, 9_500);
assert.equal(exactFive.repairAddedMs, 45_000, "A 5% Level 1 hit must add exactly 45 seconds.");
const breachedWall = calculator.simulateSiege({
  attackerTroops: 1,
  cityLevel: 100,
  defenderTroops: 1_000_000,
  wallIntegrityPercent: 0,
});
assert.equal(breachedWall.meaningfulWallDamage, false, "Attacking an already breached wall must not start a new repair window.");
assert.equal(breachedWall.repairAddedMs, 0);

assert.match(page, /id="system-map"/);
assert.match(page, /id="city-explorer"/);
assert.match(page, /id="economy-map"/);
assert.match(page, /id="skills-guide"/);
assert.match(page, /id="battle-explorer"/);
assert.match(page, /id="wall-timers"/);
assert.match(page, /Damage-proportional wall-repair examples/);
assert.match(runtime, /formatRepairDuration[\s\S]*?repairAddedMs/);
assert.match(page, /id="special-rules"/);
assert.match(page, /<details class="guide-math">/);
assert.match(page, /<noscript>/);
assert.match(page, /battle-guide-calculations\.js/);
assert.match(page, /name="description" content="[^\"]{50,}"/);
assert.doesNotMatch(page, /adsbygoogle|securepubads|googletag/);
assert.doesNotMatch(runtime, /fetch\(|XMLHttpRequest|WebSocket|firebase|httpsCallable/, "The public guide must remain read-only and local.");
assert.match(runtime, /data-battle-preset/);
assert.match(runtime, /aria-selected/);
assert.match(styles, /@media \(max-width: 560px\)/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);

const pageIds = [...page.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(pageIds).size, pageIds.length, "Guide element IDs must be unique.");
const pageIdSet = new Set(pageIds);
const referencedIds = [...runtime.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
for (const id of referencedIds) {
  assert.ok(pageIdSet.has(id), `The guide runtime references missing element #${id}.`);
}

new Function(runtime);
new Function(read("battle-guide-calculations.js"));

console.log("Validated the public battle/economy guide, formula parity, city curves, skills, siege boundaries, repair thresholds, accessibility, and read-only behavior.");
