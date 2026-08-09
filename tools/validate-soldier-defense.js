const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const config = JSON.parse(read("functions/economy-config.json"));
const server = read("functions/index.js");
const client = read("game.js");
const packageJson = JSON.parse(read("functions/package.json"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") {
      parameterDepth -= 1;
      if (parameterDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.ok(bodyStart >= 0, `Missing ${name} body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const attackBase = Number(config.troopCombat?.baseAttackPowerPerTroop);
const defenseBase = Number(config.troopCombat?.baseDefensePowerPerTroop);
const swordMaximum = Number(config.skills?.swordmastery?.maxPercent);
const shieldwallMaximum = Number(config.skills?.shieldwallDiscipline?.maxPercent);
const stoneworksMaximum = Number(config.skills?.stoneworks?.maxPercent);
assert.equal(Number(config.troopCombat?.defenseModelVersion), 1);
assert.equal(attackBase, 1.25);
assert.equal(defenseBase, 1.30);
assert.deepEqual(config.skills.shieldwallDiscipline, { percentPerLevel: 2, maxPercent: 60 });
assert.equal("defensePercentPerLevel" in config.cityEconomy, false);

const troops = 1_000_000;
const attackPower = percent => Math.floor(troops * attackBase * (1 + percent / 100));
const defensePower = percent => Math.floor(troops * defenseBase * (1 + percent / 100));
assert.equal(attackPower(0), 1_250_000);
assert.equal(attackPower(swordMaximum), 2_000_000);
assert.equal(defensePower(0), 1_300_000);
assert.equal(defensePower(shieldwallMaximum), 2_080_000);
assert.equal(defensePower(shieldwallMaximum + 8), 2_184_000);
assert.equal(defensePower(shieldwallMaximum + 10), 2_210_000);
assert.equal(defensePower(shieldwallMaximum + 4), 2_132_000);
assert.equal(defensePower(shieldwallMaximum + 5), 2_145_000);

const maxAttackPerTroop = attackBase * (1 + swordMaximum / 100);
const minimumTroops = defense => Math.floor(defense / maxAttackPerTroop) + 1;
assert.equal(minimumTroops(defensePower(shieldwallMaximum)), 1_040_001);
assert.equal(minimumTroops(defensePower(shieldwallMaximum + 8)), 1_092_001);
assert.equal(minimumTroops(defensePower(shieldwallMaximum + 10)), 1_105_001);

const wallForLevel = level => Math.floor(
  (Number(config.cityEconomy.wallDefenseBase)
    + Number(config.cityEconomy.wallDefensePerLevel) * (level - 1))
  * (1 + stoneworksMaximum / 100)
);
const benchmarks = new Map([
  [50, { wall: 2_474_923, normal: 2_277_462, stronghold: 2_329_462, citadel: 2_342_462 }],
  [100, { wall: 4_999_998, normal: 3_540_000, stronghold: 3_592_000, citadel: 3_605_000 }],
  [150, { wall: 7_525_073, normal: 4_802_537, stronghold: 4_854_537, citadel: 4_867_537 }],
]);
for (const [level, expected] of benchmarks) {
  const wall = wallForLevel(level);
  assert.equal(wall, expected.wall, `Level ${level} max-Stoneworks wall drifted.`);
  assert.equal(minimumTroops(wall + defensePower(shieldwallMaximum)), expected.normal);
  assert.equal(minimumTroops(wall + defensePower(shieldwallMaximum + 8)), expected.stronghold);
  assert.equal(minimumTroops(wall + defensePower(shieldwallMaximum + 10)), expected.citadel);
}

for (const [source, label] of [[server, "Server"], [client, "Client"]]) {
  const stats = extractFunction(source, "getCityStats");
  assert.match(stats, /defensePercent = soldierDefenseEnabled \? 0 : level \* 2/, `${label} removed the legacy fallback needed by in-flight armies.`);
  assert.match(stats, /cityWalls = Math\.floor\(baseCityWalls \* \(1 \+ stoneworksPercent \/ 100\)\)/, `${label} wall does not use Stoneworks alone.`);
  assert.match(stats, /BASE_TROOP_DEFENSE_POWER \* \([\s\S]*?shieldwallDisciplinePercent \+ objectiveTroopDefenseBonusPercent/, `${label} soldier defense does not add Shieldwall and objective support against 1.30.`);
  assert.match(stats, /totalDefense = soldierDefenseEnabled[\s\S]*?cityWalls \+ troopDefense/, `${label} modern total defense does not keep walls separate from soldiers.`);
  assert.match(stats, /objectiveTroopDefenseBonusPercent/, `${label} does not expose the soldier-only objective-defense field.`);
}
assert.match(
  extractFunction(client, "getCityStats"),
  /soldierDefenseEnabled = !isRewardCampTarget\(city\)/,
  "Client city stats do not use the defined reward-camp helper."
);
assert.doesNotMatch(client, /\bisRewardCamp\(/, "Client references the server-only isRewardCamp helper.");
assert.match(client, /targetFortificationAtStart\.ownerGarrisonDefensePower/, "Demo combat does not consume the already-resolved modern garrison power.");
assert.doesNotMatch(
  client,
  /targetStatsAtStart\.troopDefense\s*\*\s*\(1\s*\+\s*targetStatsAtStart\.strongholdDefenseBonusPercent/,
  "Demo combat applies objective defense a second time."
);
assert.match(server, /function getObjectiveTroopDefenseBonusPercent/);
assert.match(client, /function getObjectiveTroopDefenseBonusPercent/);

assert.match(server, /const DEFENSE_STRONGHOLD_BONUS_PERCENT = 8;/);
assert.match(server, /const CROWN_CITADEL_DEFENSE_BONUS_PERCENT = 10;/);
assert.match(server, /CLAN_SHARED_OBJECTIVE_MULTIPLIER = 0\.5;/);
assert.match(server, /defenseCombatVersion: order\.targetType === "camp" \? 0 : DEFENSE_COMBAT_VERSION/);
assert.match(server, /defenseCombatVersion: rally\.targetType === "camp" \? 0 : DEFENSE_COMBAT_VERSION/);
assert.match(server, /Math\.floor\(safeNumber\(army\.defenseCombatVersion, 0\)\)/, "Unversioned in-flight armies do not settle with legacy defense.");
assert.match(server, /effectiveKind === "attack" && safeString\(army\.kind, 24\) !== "attack"[\s\S]*?DEFENSE_COMBAT_VERSION/, "Reinforcement-to-attack conversion does not adopt the live defense model.");
assert.match(extractFunction(server, "usesSoldierDefenseModel"), /!isRewardCamp\(city\)/, "Reward camps are not excluded from Version 1 defense.");
assert.match(server, /capabilities:[\s\S]*?defenseCombatVersion: DEFENSE_COMBAT_VERSION/);

assert.match(server, /function createScoutReportSnapshot[\s\S]*?baseDefensePowerPerTroop[\s\S]*?shieldwallDisciplinePercent/);
assert.match(server, /function createDetailedBattleSnapshot[\s\S]*?defenseCombatVersion[\s\S]*?powerBreakdown/);
assert.match(server, /baseWallPower[\s\S]*?stoneworksWallBonusPower/);
assert.match(server, /baseDefenseBonusPower[\s\S]*?shieldwallDisciplineBonusPower/);
assert.match(server, /personalObjectiveBonusPower[\s\S]*?sharedClanBonusPower/);

assert.match(server, /const SKILL_PRESET_MODEL_VERSION = 4;/);
assert.match(server, /const DEFENSE_SKILL_FREE_RESET_GRANT_VERSION = 1;/);
assert.match(server, /function normalizeFreeSkillResetState[\s\S]*?createdAtMs < DEFENSE_SKILL_FREE_RESET_ROLLOUT_AT_MS/);
assert.match(server, /goldCharged: SKILL_PRESET_APPLY_COST[\s\S]*?freeResetConsumed: false/);
assert.match(server, /freeResetConsumed = spentPoints > 0 && freeSkillResetCredits > 0/);
assert.match(client, /Shieldwall Discipline/);

for (const document of [read("README.md"), read("how-to-play.html"), read("game-rules.html"), read("battle-economy-guide.html")]) {
  assert.match(document, /Shieldwall Discipline/);
  assert.match(document, /1\.30/);
}
assert.ok(packageJson.scripts.test.includes("validate-soldier-defense.js"), "The soldier-defense validator is not part of the Functions suite.");

console.log("Validated Version 1 soldier defense, Shieldwall, additive objective support, Stoneworks-only walls, legacy marches, free reset migration, and all approved benchmarks.");
