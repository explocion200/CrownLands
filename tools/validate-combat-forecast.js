const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const clientUiSource = fs.readFileSync(path.join(root, "common-gear-ui.js"), "utf8");

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
  "const COMBAT_FORECAST_VERSION = 4",
  "const ATTACK_COMBAT_SNAPSHOT_VERSION = 1",
  "defensePower: defenseContext.packages.totalDefense",
  "attackCombatSnapshot: createAttackCombatSnapshot(troops, profile)",
  "getSnapshottedAttackPower(army.attackCombatSnapshot, troopCount)",
  "projection.attackCombatSnapshot = FieldValue.delete()",
  "projection.launchCombatForecast = FieldValue.delete()",
  "launchCombatForecast: normalizeCombatForecast(launchCombatForecast)",
  "combatForecastVersion: COMBAT_FORECAST_VERSION",
  "defenseCombatVersion: order.targetType === \"camp\" ? 0 : DEFENSE_COMBAT_VERSION",
  "id: \"protected_raid\"",
  "id: \"protected_breach\"",
];
requiredServerSnippets.forEach(snippet => {
  if (!serverSource.includes(snippet)) throw new Error(`Missing authoritative combat behavior: ${snippet}`);
});

const requiredClientSnippets = [
  "getScoutReportForTarget(target)",
  "Scouted siege defense",
  "Forecast at scout time",
  "Protected raid — cannot capture",
  "launchCombatForecast: normalizeCombatForecast(report.launchCombatForecast)",
  "Attack sources: Swordmastery",
  "War Captain gear",
  "targetType: isRewardCampTarget(target) ? \"camp\" : \"city\"",
  "defenseCombatVersion: Math.max(0, Math.floor(Number(report.defenseCombatVersion) || 0))",
];
requiredClientSnippets.forEach(snippet => {
  if (!`${clientSource}\n${clientUiSource}`.includes(snippet)) throw new Error(`Missing combat forecast UI behavior: ${snippet}`);
});

const attackModalSource = readFunction(clientSource, "updateTroopSliderModal");
[
  '<div><span>Scouted total defense</span><strong>${formatNumber(preview.defensePower)} power</strong></div>',
  '<div><span>${siege ? "Scouted siege defense" : "Scouted total defense"}</span><strong>${formatNumber(preview.defensePower)} power</strong></div>',
  '<div><span>Forecast at scout time</span><strong>${forecastOutcome}</strong></div>',
  '<span>Travel bonus</span>',
].forEach(snippet => {
  if (!attackModalSource.includes(snippet)) throw new Error(`Missing compact scouted forecast UI: ${snippet}`);
});
[
  "minimum capture force",
  "attacker losses",
  "Defense can change before arrival",
  "Current wall ${formatNumber(siege.startingWallPower)}",
  "Scout age ${formatDuration(scoutAge)}",
].forEach(snippet => {
  if (attackModalSource.includes(snippet)) throw new Error(`Scouted attack forecast still exposes extra detail: ${snippet}`);
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
  BASE_TROOP_ATTACK_POWER: 1.25,
  SIEGE_COMBAT_VERSION: 1,
  SIEGE_MEANINGFUL_WALL_DAMAGE_PERCENT: 5,
  Number,
  Math,
  normalizeAttackProtectionSnapshot(value) {
    return value && value.mode && value.mode !== "normal" ? value : null;
  },
  getAttackPower(troops) {
    return troops * 1.25;
  },
  getBattleDefensePower(target) {
    return Number(target?.localDefense) || 0;
  },
  isRewardCampTarget() {
    return false;
  },
  normalizeTimestampMs(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  },
  skillMultiplier() {
    return 1;
  },
  getCommonGearBonuses() {
    return { attackStrength: 0, wallRepairSpeed: 0 };
  },
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  },
};
vm.createContext(sandbox);
vm.runInContext(`${calculateSource}; this.calculateCombatResult = calculateCombatResult;`, sandbox);

const advantageSource = readFunction(clientSource, "getCombatAdvantageTier");
const minimumSource = readFunction(clientSource, "getMinimumTroopsForPower");
vm.runInContext(
  `${advantageSource}; ${minimumSource}; this.getCombatAdvantageTier = getCombatAdvantageTier; this.getMinimumTroopsForPower = getMinimumTroopsForPower;`,
  sandbox
);

const attackSnapshotSandbox = {
  ATTACK_COMBAT_SNAPSHOT_VERSION: 1,
  BASE_TROOP_ATTACK_POWER: 1.25,
  Math,
  Number,
  safeNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  },
  getSkillLevel() {
    return 30;
  },
  getSkillPercent() {
    return 60;
  },
  skillMultiplier() {
    return 1.6;
  },
  getCommonGearBonuses() {
    return { attackStrength: 1.5 };
  },
};
vm.createContext(attackSnapshotSandbox);
vm.runInContext(
  `${readFunction(serverSource, "normalizeAttackCombatSnapshot")};`
    + `${readFunction(serverSource, "createAttackCombatSnapshot")};`
    + `${readFunction(serverSource, "getSnapshottedAttackPower")};`
    + "this.createAttackCombatSnapshot = createAttackCombatSnapshot; this.getSnapshottedAttackPower = getSnapshottedAttackPower;",
  attackSnapshotSandbox
);
const newAttackSnapshot = attackSnapshotSandbox.createAttackCombatSnapshot(100, {});
if (newAttackSnapshot.attackPowerPerTroop !== 2.01875
  || newAttackSnapshot.launchAttackPower !== 201
  || newAttackSnapshot.attackStrengthPercent !== 1.5) {
  throw new Error("Swordmastery and equipped War Captain gear are not snapshotted as separate additive attack sources.");
}
const legacyAttackPower = attackSnapshotSandbox.getSnapshottedAttackPower({
  version: 1,
  attackPowerPerTroop: 3.2,
  swordmasteryLevel: 30,
  swordmasteryPercent: 60,
  launchTroops: 100,
  launchAttackPower: 320,
}, 100);
if (legacyAttackPower !== 320) {
  throw new Error("An in-flight army lost its pre-rebalance launch power snapshot.");
}
[
  [0.99, "defeat_expected"],
  [1, "defeat_expected"],
  [1.0001, "costly_victory"],
  [1.5, "advantage"],
  [2, "strong_advantage"],
  [3, "overwhelming_advantage"],
].forEach(([ratio, expected]) => {
  const actual = sandbox.getCombatAdvantageTier(ratio).key;
  if (actual !== expected) throw new Error(`Power ratio ${ratio} was labeled ${actual}, expected ${expected}.`);
});
if (sandbox.getMinimumTroopsForPower(500, 2) !== 251) {
  throw new Error("Minimum capture troops must exceed, not merely equal, authoritative defense power.");
}

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

Object.assign(sandbox, {
  COMBAT_FORECAST_VERSION: 4,
  clampCityLevel: value => Math.max(1, Math.floor(Number(value) || 1)),
  formatNumber: value => String(value),
  escapeHtml: value => String(value).replace(/[<>&"]/g, ""),
});
for (const name of ["normalizeCombatFortificationSnapshot", "normalizeCombatForecast", "renderBattleForecastChanges"]) {
  vm.runInContext(readFunction(clientSource, name), sandbox);
}
const forecastReport = { type: "attack", launchCombatForecast: {
  version: 4, status: "scouted", targetOwnerUid: "original-owner", ownerTroops: 100,
  reinforcementTroops: 20, defensePower: 1156,
  fortification: { startingWallPower: 1000 },
} };
const unchangedBattle = { defender: { ownerUid: "original-owner", startingTroops: 100 },
  reinforcements: [{ startingTroops: 20 }], siege: { startingWallPower: 1000 }, totals: { defensePower: 1156 } };
if (sandbox.renderBattleForecastChanges(forecastReport, unchangedBattle)) {
  throw new Error("An unchanged defense was presented as a changed forecast.");
}
const changedBattle = { defender: { ownerUid: "new-owner", startingTroops: 150 },
  reinforcements: [{ startingTroops: 40 }, { startingTroops: 10 }], siege: { startingWallPower: 1200 }, totals: { defensePower: 1460 } };
const comparison = sandbox.renderBattleForecastChanges(forecastReport, changedBattle);
for (const detail of ["changed owners", "Wall power: 1,000 → 1,200", "Owner garrison: 100 → 150", "Reinforcement troops: 20 → 50", "Total defense: 1,156 → 1,460", "defenses present at arrival"]) {
  if (!comparison.includes(detail)) throw new Error(`The battle report does not explain ${detail}.`);
}
const depletedBattle = { ...unchangedBattle, siege: { startingWallPower: 0 }, reinforcements: [] };
const depletedComparison = sandbox.renderBattleForecastChanges(forecastReport, depletedBattle);
if (!depletedComparison.includes("Wall power: 1,000 → 0") || !depletedComparison.includes("Reinforcement troops: 20 → 0")) {
  throw new Error("Zero wall power or recalled reinforcements were hidden from the comparison.");
}
for (const report of [null, { ...forecastReport, type: "defense" },
  { type: "attack", launchCombatForecast: { ...forecastReport.launchCombatForecast, status: "expired" } },
  { type: "attack", launchCombatForecast: { ...forecastReport.launchCombatForecast, version: 0 } }]) {
  if (sandbox.renderBattleForecastChanges(report, changedBattle)) {
    throw new Error("A defender, missing forecast, or invalid scout exposed an attack forecast comparison.");
  }
}
if (!readFunction(clientSource, "renderDetailedBattleReport").includes('viewerRole === "attacker" ? renderBattleForecastChanges(report, snapshot)')) {
  throw new Error("Detailed reports do not restrict scout comparisons to the attacking viewer.");
}

console.log("Validated authoritative scout defense forecasts, launch-locked attack power, live arrival defense, protected outcomes, privacy, and report diagnostics.");
