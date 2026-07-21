const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const constantNames = [
  "KING_POWER_TERRITORY_PER_CITY",
  "KING_POWER_CITY_LEVEL_SQUARED_MULTIPLIER",
  "KING_POWER_GOLD_PRODUCTION_SQRT_MULTIPLIER",
  "KING_POWER_GOLD_TO_TROOP_PRODUCTION_CAP_RATIO",
  "KING_POWER_TROOP_PRODUCTION_MULTIPLIER",
  "KING_POWER_WALL_MULTIPLIER",
  "KING_POWER_DEFENSE_PERCENT_MULTIPLIER",
  "KING_POWER_STRONGHOLD_BASE",
  "KING_POWER_STRONGHOLD_LEVEL_MULTIPLIER",
  "KING_POWER_TROOP_SCALE",
  "KING_POWER_TROOP_EXPONENT",
];

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  if (!match) throw new Error(`Missing ${name}.`);
  return Number(match[1]);
}

const config = Object.fromEntries(constantNames.map(name => {
  const serverValue = readConstant(serverSource, name);
  const clientValue = readConstant(clientSource, name);
  if (serverValue !== clientValue) {
    throw new Error(`${name} differs between server (${serverValue}) and client (${clientValue}).`);
  }
  return [name, serverValue];
}));

const serverVersion = readConstant(serverSource, "GLOBAL_PLAYER_STATS_VERSION");
const clientVersion = readConstant(clientSource, "KING_POWER_AUTHORITY_VERSION");
if (serverVersion !== clientVersion || serverVersion !== 4) {
  throw new Error(`King Power authority versions differ or are stale (server ${serverVersion}, client ${clientVersion}).`);
}

function cityPower(level) {
  const victoryPoints = Math.floor(6 + level * 4 + Math.pow(level, 1.35) * 2);
  const productionVp = Math.floor(20 * Math.pow(1.115, level - 1) + 0.000001);
  const goldPerHour = productionVp * 15;
  const troopPerHour = victoryPoints * 3;
  const walls = 30 + (level - 1) * 32;
  const defensePercent = level * 3;
  const troopProductionPower = troopPerHour * config.KING_POWER_TROOP_PRODUCTION_MULTIPLIER;
  const economicPower = Math.floor(Math.min(
    Math.sqrt(goldPerHour) * config.KING_POWER_GOLD_PRODUCTION_SQRT_MULTIPLIER,
    troopProductionPower * config.KING_POWER_GOLD_TO_TROOP_PRODUCTION_CAP_RATIO
  ));
  const total = Math.floor(
    config.KING_POWER_TERRITORY_PER_CITY
      + level * level * config.KING_POWER_CITY_LEVEL_SQUARED_MULTIPLIER
      + economicPower
      + troopProductionPower
      + walls * config.KING_POWER_WALL_MULTIPLIER
      + defensePercent * config.KING_POWER_DEFENSE_PERCENT_MULTIPLIER
  );
  return { total, economicPower, troopProductionPower };
}

function troopPower(troops) {
  return Math.floor(
    Math.pow(Math.max(0, troops), config.KING_POWER_TROOP_EXPONENT)
      * config.KING_POWER_TROOP_SCALE
  );
}

const levels = [1, 10, 25, 50, 75, 100, 110, 125, 150];
for (let index = 1; index < levels.length; index += 1) {
  if (cityPower(levels[index]).total <= cityPower(levels[index - 1]).total) {
    throw new Error(`City power did not increase from level ${levels[index - 1]} to ${levels[index]}.`);
  }
}
levels.forEach(level => {
  const power = cityPower(level);
  if (power.economicPower > power.troopProductionPower) {
    throw new Error(`Gold power exceeded troop-production power at level ${level}.`);
  }
  if (power.economicPower > power.troopProductionPower * config.KING_POWER_GOLD_TO_TROOP_PRODUCTION_CAP_RATIO) {
    throw new Error(`Gold power exceeded its military-support cap at level ${level}.`);
  }
});

const concentratedRemnant = cityPower(100).total + troopPower(10_000_000);
const broadKingdom = cityPower(75).total * 10 + troopPower(1_000_000);
if (concentratedRemnant >= broadKingdom) {
  throw new Error("A one-city 10M-troop remnant still outweighs ten level 75 cities.");
}
if (troopPower(10_000_000) <= troopPower(1_000_000)) {
  throw new Error("Additional troops must still increase King Power.");
}
if (cityPower(100).total <= troopPower(1_000_000)) {
  throw new Error("A developed level 100 city should outweigh an ordinary one-million-troop reserve.");
}

console.log(
  `Validated King Power v4: 1x L100 + 10M troops = ${concentratedRemnant.toLocaleString()}, `
    + `10x L75 + 1M troops = ${broadKingdom.toLocaleString()}.`
);
