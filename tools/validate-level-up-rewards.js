const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function readConstant(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`));
  if (!match) throw new Error(`Missing ${name}.`);
  return Number(match[1]);
}

for (const name of [
  "LEVEL_UP_TROOP_REWARD_BASE",
  "LEVEL_UP_TROOP_REWARD_MULTIPLIER",
  "HERO_XP_SOFT_CAP_LEVEL",
  "HERO_XP_HARD_CAP_LEVEL",
  "HERO_XP_POST_50_SPAN",
  "HERO_XP_POST_100_SPAN",
  "HERO_XP_POST_50_MULTIPLIER",
  "HERO_XP_POST_100_MULTIPLIER",
  "HERO_XP_POST_50_EXPONENT",
  "HERO_XP_POST_100_EXPONENT",
  "LEVEL_UP_TROOP_REWARD_POST_50_SCALE",
  "LEVEL_UP_TROOP_REWARD_POST_50_EXPONENT",
  "LEVEL_UP_TROOP_REWARD_POST_100_SCALE",
  "LEVEL_UP_TROOP_REWARD_POST_100_EXPONENT",
]) {
  const serverValue = readConstant(serverSource, name);
  const clientValue = readConstant(clientSource, name);
  if (serverValue !== clientValue) {
    throw new Error(`${name} differs between server (${serverValue}) and client (${clientValue}).`);
  }
}

requireMatch(
  serverSource,
  /function capBattleXpForHeroLevel[\s\S]*?BATTLE_XP_LEVEL_REQUIREMENT_CAP_MULTIPLIER/,
  "Server battle XP is not capped against the receiving hero level."
);
requireMatch(
  serverSource,
  /buildPlayerProgressPatch\(attackerProfile,[\s\S]*?capBattleXpForHeroLevel/,
  "Attacker battle XP is not capped before level-up rewards are granted."
);
requireMatch(
  serverSource,
  /buildPlayerProgressPatch\(defenderProfile \|\| \{},[\s\S]*?capBattleXpForHeroLevel/,
  "Defender battle XP is not capped before level-up rewards are granted."
);
requireMatch(
  clientSource,
  /function getXpRequiredForLevel[\s\S]*?HERO_XP_POST_100_MULTIPLIER/,
  "Client XP requirement formula does not include the post-100 scaling."
);
requireMatch(
  clientSource,
  /function getLevelUpTroopReward[\s\S]*?LEVEL_UP_TROOP_REWARD_POST_100_SCALE/,
  "Client level-up troop formula does not include the flattened post-100 reward."
);

requireMatch(
  serverSource,
  /function creditLevelUpTroopsToMainCity[\s\S]*?getCanonicalMainCityEntry[\s\S]*?appendEconomyCityPatch/,
  "Server level-up troops are not credited to the canonical main city through the economy write path."
);
requireMatch(
  serverSource,
  /exports\.upgradeCity[\s\S]*?creditLevelUpTroopsToMainCity\([\s\S]*?progress\.levelTroopReward/,
  "City-upgrade XP does not credit its level-up troop reward."
);
requireMatch(
  serverSource,
  /attackerLevelTroopReward\s*=\s*creditLevelUpTroopsToMainCity\([\s\S]*?attackerProgress\.levelTroopReward/,
  "Attacker XP does not credit its level-up troop reward."
);
requireMatch(
  serverSource,
  /defenderLevelTroopReward[\s\S]*?creditLevelUpTroopsToMainCity\([\s\S]*?defenderProgress\.levelTroopReward/,
  "Defender XP does not credit its level-up troop reward."
);
requireMatch(
  clientSource,
  /troopsAwarded:\s*Math\.max\(0,\s*Math\.floor\(Number\(report\.troopsAwarded\)/,
  "Synced battle reports do not preserve level-up troop rewards."
);

console.log("Validated server-authoritative level-up troop rewards for upgrades, attacks, and defenses.");
