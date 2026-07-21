const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const expectedSkills = {
  swordmastery: { percentPerLevel: 2, maxPercent: 60, maxLevel: 30 },
  stoneworks: { percentPerLevel: 3, maxPercent: 75, maxLevel: 25 },
  taxStewardship: { percentPerLevel: 3, maxPercent: 75, maxLevel: 25 },
  royalGranaries: { percentPerLevel: 3, maxPercent: 75, maxLevel: 25 },
  guildCharters: { percentPerLevel: 2, maxPercent: 50, maxLevel: 25 },
  marchOrders: { percentPerLevel: 3, maxPercent: 60, maxLevel: 20 },
  fieldMedics: { percentPerLevel: 2, maxPercent: 50, maxLevel: 25 },
};

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function readSkillConfig(source, skill) {
  const match = source.match(new RegExp(`${skill}:\\s*\\{[^}]*percentPerLevel:\\s*([0-9.]+)[^}]*maxPercent:\\s*([0-9.]+)`));
  if (!match) throw new Error(`Missing ${skill} configuration.`);
  return { percentPerLevel: Number(match[1]), maxPercent: Number(match[2]) };
}

for (const [skill, expected] of Object.entries(expectedSkills)) {
  const serverConfig = readSkillConfig(serverSource, skill);
  const clientConfig = readSkillConfig(clientSource, skill);
  if (serverConfig.percentPerLevel !== clientConfig.percentPerLevel || serverConfig.maxPercent !== clientConfig.maxPercent) {
    throw new Error(`${skill} differs between the server and client.`);
  }
  if (serverConfig.percentPerLevel !== expected.percentPerLevel || serverConfig.maxPercent !== expected.maxPercent) {
    throw new Error(`${skill} no longer matches its approved boost configuration.`);
  }
  const maxLevel = Math.ceil(serverConfig.maxPercent / serverConfig.percentPerLevel);
  if (maxLevel !== expected.maxLevel || maxLevel * serverConfig.percentPerLevel < serverConfig.maxPercent) {
    throw new Error(`${skill} has an invalid cap level.`);
  }
}

requireMatch(serverSource, /function normalizeSkillUpgrades[\s\S]*?normalizeSkillLevelForSkill/, "Server skill levels are not capped during normalization.");
requireMatch(clientSource, /function normalizeUpgrades[\s\S]*?normalizeSkillUpgradeLevel/, "Client skill levels are not capped during normalization.");
requireMatch(serverSource, /function getAttackPower[\s\S]*?skillMultiplier\(attackerProfile, "swordmastery"\)/, "Swordmastery is missing from server attack power.");
requireMatch(serverSource, /function getCityStats[\s\S]*?getSkillPercent\(defenderProfile, "stoneworks"\)/, "Stoneworks is missing from server wall defense.");
requireMatch(serverSource, /function getCityProductionStats[\s\S]*?getSkillPercent\(profile, "taxStewardship"\)/, "Tax Stewardship is missing from server city production.");
requireMatch(serverSource, /function getCityProductionStats[\s\S]*?getSkillPercent\(profile, "royalGranaries"\)/, "Royal Granaries is missing from server city production.");
requireMatch(serverSource, /exports\.upgradeCity[\s\S]*?getSkillPercent\(economy\.profileAfter, "guildCharters"\)/, "Guild Charters is missing from server upgrade costs.");
requireMatch(serverSource, /exports\.spendSkillPoint[\s\S]*?prepareEconomyCollection[\s\S]*?writePreparedEconomy/, "Skill purchases do not settle production through the server economy.");

const marchOrderUses = serverSource.match(/speedMultiplier:\s*skillMultiplier\([^,]+, "marchOrders"\)/g) || [];
if (marchOrderUses.length < 5) {
  throw new Error(`March Orders is only wired into ${marchOrderUses.length} server march paths; expected at least 5.`);
}
requireMatch(serverSource, /if \(targetType === "camp"\)[\s\S]*?recoverBattleLossesToMainCity\([\s\S]*?losses: battle\.attackerLosses[\s\S]*?losses: battle\.defenderLosses/, "Field Medics is missing from camp battles.");
requireMatch(serverSource, /const recoverBattleLossesToMainCity[\s\S]*?getCanonicalMainCityEntry/, "Field Medics does not use the canonical main city.");

console.log("Validated all seven skill configurations and their server-authoritative boost paths.");
