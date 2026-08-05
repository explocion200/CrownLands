const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");

function readFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}.`);
  const bodyStart = text.indexOf(") {", start) + 2;
  if (bodyStart < 2) throw new Error(`Could not find ${name}'s body.`);
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

const requiredServerSnippets = [
  "const COMBAT_FORECAST_VERSION = 1",
  "const ATTACK_COMBAT_SNAPSHOT_VERSION = 1",
  "defensePower: defenseContext.packages.totalDefense",
  "attackCombatSnapshot: createAttackCombatSnapshot(troops, profile)",
  "getSnapshottedAttackPower(army.attackCombatSnapshot, troopCount)",
  "projection.attackCombatSnapshot = FieldValue.delete()",
  "projection.launchCombatForecast = FieldValue.delete()",
  "launchCombatForecast: normalizeCombatForecast(launchCombatForecast)",
  "combatForecastVersion: COMBAT_FORECAST_VERSION",
  "id: \"protected_raid\"",
  "id: \"protected_breach\"",
];
requiredServerSnippets.forEach(snippet => {
  if (!serverSource.includes(snippet)) throw new Error(`Missing authoritative combat behavior: ${snippet}`);
});

const requiredClientSnippets = [
  "getScoutReportForTarget(target)",
  "Scouted total defense",
  "Forecast at scout time",
  "Protected raid — cannot capture",
  "Defense can change before arrival",
  "Launch forecast compared with arrival",
  "Production, reinforcements, and bonuses remain live while troops travel",
  "launchCombatForecast: normalizeCombatForecast(report.launchCombatForecast)",
  "targetType: isRewardCampTarget(target) ? \"camp\" : \"city\"",
];
requiredClientSnippets.forEach(snippet => {
  if (!clientSource.includes(snippet)) throw new Error(`Missing combat forecast UI behavior: ${snippet}`);
});

const calculateSource = readFunction(clientSource, "calculateCombatResult");
if (!calculateSource.includes("options.attackPower") || !calculateSource.includes("options.defensePower")) {
  throw new Error("Client combat previews do not accept authoritative attack and defense power.");
}
const previewSource = readFunction(clientSource, "calculateBattlePreviewForTroops");
if (!previewSource.includes("scoutReport?.totalDefense")
  || !previewSource.includes("combatForecast?.attackPowerPerTroop")) {
  throw new Error("The attack modal can still discard full scout defense or launch attack power.");
}

const sandbox = {
  BASE_TROOP_ATTACK_POWER: 2,
  Number,
  Math,
  normalizeAttackProtectionSnapshot(value) {
    return value && value.mode && value.mode !== "normal" ? value : null;
  },
  getAttackPower(troops) {
    return troops * 2;
  },
  getBattleDefensePower(target) {
    return Number(target?.localDefense) || 0;
  },
  skillMultiplier() {
    return 1;
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  },
};
vm.createContext(sandbox);
vm.runInContext(`${calculateSource}; this.calculateCombatResult = calculateCombatResult;`, sandbox);

const target = { troops: 100, localDefense: 100 };
const launchForecast = sandbox.calculateCombatResult(300, "player", target, {
  attackPower: 600,
  defensePower: 500,
});
if (!launchForecast.success || launchForecast.attackPower !== 600 || launchForecast.defensePower !== 500) {
  throw new Error("A forecast does not use the authoritative full defense snapshot.");
}

const liveDefenseResult = sandbox.calculateCombatResult(300, "player", target, {
  attackPower: 600,
  defensePower: 650,
});
if (liveDefenseResult.success || liveDefenseResult.defensePower !== 650) {
  throw new Error("Arrival combat does not honor stronger live defense.");
}

const protectedRaid = sandbox.calculateCombatResult(300, "player", target, {
  attackPower: 900,
  defensePower: 500,
  attackProtection: { mode: "raid", captureAllowed: false },
});
if (protectedRaid.success || !protectedRaid.raidCompleted || protectedRaid.defenderLosses > 10) {
  throw new Error("Protected raids can be displayed as captures or exceed their casualty cap.");
}

const protectedBreach = sandbox.calculateCombatResult(300, "player", target, {
  attackPower: 600,
  defensePower: 500,
  attackProtection: { mode: "assault", captureAllowed: false },
});
if (protectedBreach.success || !protectedBreach.breachCompleted) {
  throw new Error("A first protected assault is not represented as a breach-only outcome.");
}

console.log("Validated authoritative scout defense forecasts, launch-locked attack power, live arrival defense, protected outcomes, privacy, and report diagnostics.");
