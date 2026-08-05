const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const server = read("functions/index.js");
const client = read("game.js");
const economy = JSON.parse(read("functions/economy-config.json"));
const rules = read("game-rules.html");
const guide = read("how-to-play.html");
const readme = read("README.md");
const editor = read("tools/map-editor/editor.js");
const editorServer = read("tools/editor-server.js");
const packageJson = JSON.parse(read("functions/package.json"));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parameterStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parameterEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf("{", parameterEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

assert.deepEqual(economy.siegeCombat, {
  modelVersion: 1,
  repairBaseMinutes: 15,
  repairMinutesPerLevel: 0.3,
  meaningfulWallDamagePercent: 5,
  intactWallDefenderLossCapPercent: 10,
});

const context = {
  BASE_TROOP_ATTACK_POWER: 2,
  SIEGE_COMBAT_VERSION: 1,
  FORTIFICATION_STATE_VERSION: 1,
  SIEGE_REPAIR_BASE_MINUTES: 15,
  SIEGE_REPAIR_MINUTES_PER_LEVEL: 0.3,
  SIEGE_MEANINGFUL_WALL_DAMAGE_PERCENT: 5,
  SIEGE_INTACT_WALL_DEFENDER_LOSS_CAP_PERCENT: 10,
  Date,
  Math,
  Number,
  safeNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  },
  safeString(value, maxLength = 256) {
    return String(value || "").slice(0, maxLength);
  },
  clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  },
  clampInt(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || 0)));
  },
  timestampToMs(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  },
  getSiegeRepairLevel(target) {
    return Math.max(1, Math.floor(Number(target?.level) || 1));
  },
  getSiegeRepairTiming(level, nowMs, reductionPercent = 0) {
    const repairWindowMinutes = Math.max(1, Math.round(15 + Math.max(1, Math.floor(Number(level) || 1)) * 0.3));
    const reduction = Math.max(0, Math.min(100, Number(reductionPercent) || 0));
    return {
      repairWindowMinutes,
      repairReductionPercent: reduction,
      repairAtMs: nowMs + Math.max(60_000, Math.floor(repairWindowMinutes * 60_000 * (1 - reduction / 100))),
    };
  },
  usesSiegeCombat(version, targetType) {
    return targetType !== "camp" && Number(version) >= 1;
  },
  normalizeAttackProtectionSnapshot(value) {
    return value && value.mode && value.mode !== "normal" ? value : null;
  },
  normalizeDemoAttackSnapshot() {
    return null;
  },
  getAttackPower(troops) {
    return Math.max(0, Number(troops) || 0) * 2;
  },
  getCityStats(target) {
    return { level: Math.max(1, Math.floor(Number(target?.level) || 1)), totalDefense: Math.max(0, Number(target?.legacyDefense) || 0) };
  },
  skillMultiplier() {
    return 1;
  },
};
vm.createContext(context);
vm.runInContext(`${extractFunction(server, "normalizeFortificationState")}; ${extractFunction(server, "getFortificationStatePatch")}; ${extractFunction(server, "calculateCombatResult")}; this.normalizeFortificationState = normalizeFortificationState; this.getFortificationStatePatch = getFortificationStatePatch; this.calculateCombatResult = calculateCombatResult;`, context, {
  filename: "functions/index.js",
});

const activeStoredWall = context.normalizeFortificationState({
  fortificationState: { version: 1, integrityBps: 4_000, lastDamagedAtMs: 1_000, repairAtMs: 61_000, lastArmyId: "a1" },
}, 1_500);
assert.equal(activeStoredWall.integrityBps, 4_000);
assert.equal(activeStoredWall.repairAtMs, 61_000);
assert.equal(activeStoredWall.repairWindowMinutes, 1, "Legacy active timers must infer their original duration.");
const repairedStoredWall = context.normalizeFortificationState({
  fortificationState: { version: 1, integrityBps: 0, lastDamagedAtMs: 1_000, repairAtMs: 2_000, lastArmyId: "a1" },
}, 2_000);
assert.equal(repairedStoredWall.integrityBps, 10_000, "A completed repair timer must restore full wall integrity.");
assert.equal(repairedStoredWall.repairAtMs, 0);

const repairContexts = [server, client].map((source, index) => {
  const repairContext = {
    SIEGE_REPAIR_BASE_MINUTES: 15,
    SIEGE_REPAIR_MINUTES_PER_LEVEL: 0.3,
    Number,
    Math,
    clampCityLevel(value) {
      return Math.max(1, Math.floor(Number(value) || 1));
    },
  };
  vm.createContext(repairContext);
  vm.runInContext(`${extractFunction(source, "getSiegeRepairWindowMinutes")}; this.getSiegeRepairWindowMinutes = getSiegeRepairWindowMinutes;`, repairContext, {
    filename: index === 0 ? "functions/index.js" : "game.js",
  });
  return repairContext;
});
const repairBenchmarks = new Map([
  [1, 15],
  [25, 23],
  [50, 30],
  [75, 38],
  [100, 45],
  [150, 60],
  [200, 75],
  [500, 165],
  [1_000, 315],
]);
for (const [level, expectedMinutes] of repairBenchmarks) {
  repairContexts.forEach(repairContext => {
    assert.equal(repairContext.getSiegeRepairWindowMinutes(level), expectedMinutes, `Wrong repair window at Level ${level}.`);
  });
}
assert.ok(
  repairContexts[0].getSiegeRepairWindowMinutes(2_000) > repairContexts[0].getSiegeRepairWindowMinutes(1_000),
  "The repair formula was capped at high levels."
);

assert.equal(
  context.getFortificationStatePatch({ persistentDamageApplied: false }, "capture", 50_000),
  null,
  "Capturing an already breached city must not replace its active repair deadline."
);
const persistedDamage = context.getFortificationStatePatch({
  persistentDamageApplied: true,
  endingIntegrityBps: 0,
  repairAtMs: 2_750_000,
  repairWindowMinutes: 45,
}, "breach", 50_000);
assert.equal(persistedDamage.repairAtMs, 2_750_000, "Settlement recalculated an authoritative repair deadline.");
assert.equal(persistedDamage.repairWindowMinutes, 45);

function siegeResult({
  attackPower,
  troops = 1_000_000,
  defenders = 1_000_000,
  wall,
  integrityBps = 10_000,
  garrison,
  targetType = "city",
  level = 50,
  attackProtection = null,
  nowMs = 1_800_000,
  version = 1,
} = {}) {
  return context.calculateCombatResult(troops, { level, troops: defenders, legacyDefense: wall + garrison }, {}, {}, {
    attackPower,
    defensePower: wall + garrison,
    siegeCombatVersion: version,
    targetType,
    fortification: {
      fullWallPower: wall * 10_000 / integrityBps,
      currentWallPower: wall,
      integrityBps,
    },
    garrisonDefensePower: garrison,
    attackProtection,
    nowMs,
  });
}

const level50 = siegeResult({ level: 50, attackPower: 3_200_000, wall: 656_551, garrison: 2_000_000 });
assert.equal(level50.success, true, "One million max-Sword troops should capture the Level 50 benchmark.");
assert.equal(level50.survivors, 169_827, "Siege survivors must consume the complete resolved defense power.");

const level75 = siegeResult({ level: 75, attackPower: 3_200_000, wall: 2_211_447, garrison: 2_500_000 });
assert.equal(level75.success, false, "The Level 75 benchmark garrison should hold after its wall breaches.");
assert.equal(level75.fortificationBreached, true);
assert.equal(level75.fortification.penetratingAttackPower, 988_553);
assert.equal(level75.defenderLosses, 324_245);

const level100 = siegeResult({ level: 100, attackPower: 3_200_000, wall: 5_164_993, garrison: 3_000_000 });
assert.equal(level100.success, false, "Max Stoneworks on a Level 100 city should stop the benchmark army at the wall.");
assert.equal(level100.fortificationBreached, false);
assert.equal(level100.defenderLosses, 61_955);
assert.ok(level100.defenderLosses <= 100_000, "An intact wall allowed more than 10% defender losses.");
assert.equal(level100.fortification.endingIntegrityBps, 3_804);
assert.equal(level100.fortification.repairWindowMinutes, 45);
assert.equal(level100.fortification.repairAtMs, 4_500_000);

const exactThreshold = siegeResult({ attackPower: 50, troops: 50, defenders: 100, wall: 1_000, garrison: 200 });
assert.equal(exactThreshold.fortification.meaningfulWallDamage, true, "Exactly 5% wall damage must reset repair.");
assert.equal(exactThreshold.fortification.persistentDamageApplied, true);
const belowThreshold = siegeResult({ attackPower: 49, troops: 49, defenders: 100, wall: 1_000, garrison: 200 });
assert.equal(belowThreshold.fortification.meaningfulWallDamage, false);
assert.equal(belowThreshold.fortification.endingIntegrityBps, 10_000, "Sub-threshold wall damage must not persist.");

const strictCapture = siegeResult({ attackPower: 1_200, troops: 1_200, defenders: 100, wall: 1_000, garrison: 200 });
assert.equal(strictCapture.success, false, "Attack power equal to wall plus garrison must not capture.");
assert.equal(strictCapture.fortificationBreached, true);
const strictCaptureWin = siegeResult({ attackPower: 1_201, troops: 1_201, defenders: 100, wall: 1_000, garrison: 200 });
assert.equal(strictCaptureWin.success, true);
assert.equal(strictCaptureWin.survivors, 1, "A threshold siege victory must leave one survivor, not a 32% survivor cliff.");

const protectedRaid = siegeResult({
  attackPower: 1_100,
  troops: 1_100,
  defenders: 100,
  wall: 1_000,
  garrison: 50,
  attackProtection: { mode: "raid", captureAllowed: false },
});
assert.equal(protectedRaid.raidCompleted, true);
assert.equal(protectedRaid.fortification.persistentDamageApplied, false, "Protected raids cannot persist wall damage.");
assert.equal(protectedRaid.fortification.endingIntegrityBps, 10_000);
assert.ok(protectedRaid.defenderLosses <= 10);

const camp = siegeResult({ attackPower: 300, troops: 300, defenders: 100, wall: 1_000, garrison: 200, targetType: "camp" });
assert.equal(camp.fortification, null, "Reward camps must retain legacy combat.");
const legacy = siegeResult({ attackPower: 1_000, troops: 1_000, defenders: 100, wall: 1_000, garrison: 200, version: 0 });
assert.equal(legacy.fortification, null, "Unversioned in-flight armies must retain legacy settlement.");

assert.match(server, /const settlementSiegeCombatVersion = targetType === "camp"[\s\S]*?army\.siegeCombatVersion, 0/);
assert.match(server, /function getScoutCombatIntel[\s\S]*?report\.siegeCombatVersion[\s\S]*?return \{ status: "unavailable", report: null \}/);
assert.match(server, /siegeCombatVersion: order\.targetType === "camp" \? 0 : SIEGE_COMBAT_VERSION/);
assert.match(server, /siegeCombatVersion: rally\.targetType === "camp" \? 0 : SIEGE_COMBAT_VERSION/);
assert.match(server, /function writeFortificationSettlement[\s\S]*?fortificationState/);
assert.match(server, /const carriedFortificationState = settledFortificationState \|\| \([\s\S]*?getNeutralClaimCapturePatch[\s\S]*?fortificationState: carriedFortificationState/);
assert.match(server, /function getFortificationStatePatch[\s\S]*?repairAtMs: Math\.max\(nowMs, timestampToMs\(fortification\.repairAtMs\)\)/);
assert.match(server, /function resolveCitadelAssaultTarget[\s\S]*?carriedFortificationState[\s\S]*?getNeutralClaimClearedPatch[\s\S]*?fortificationState: carriedFortificationState/);
assert.match(server, /capabilities:[\s\S]*?siegeCombatVersion: SIEGE_COMBAT_VERSION/);
assert.match(client, /function renderCityFortificationStatus[\s\S]*?Wall integrity[\s\S]*?Walls absorb attack power before the garrison fights/);
assert.match(client, /function supportsSiegeCombat[\s\S]*?getRealmCapabilityVersion\("siegeCombatVersion"\)/);
assert.match(client, /function renderSiegeBattleSection[\s\S]*?Siege phases[\s\S]*?one physical wall/);
assert.match(client, /New scout required[\s\S]*?predates the current wall-and-garrison combat model/);
assert.match(client, /function applyOnlineCities[\s\S]*?hasOwnProperty\.call\(online, "fortificationState"\)/);
assert.match(client, /function applyServerCityUpdates[\s\S]*?hasOwnProperty\.call\(update, "fortificationState"\)/);
assert.ok(client.includes("Walls likely hold"));
assert.ok(client.includes("Walls breached — garrison likely holds"));
assert.match(rules, /two phases[\s\S]*?same smooth wall formula[\s\S]*?0\.3 minutes per city level[\s\S]*?ownership change[\s\S]*?Protected raids do not persist wall damage/);
assert.match(guide, /Defense happens in two layers[\s\S]*?defender troop losses are capped at 10%/);
assert.match(guide, /level-based repair window[\s\S]*?no cap[\s\S]*?does not reset its existing deadline/);
assert.match(readme, /two-phase siege model[\s\S]*?same smooth wall curve[\s\S]*?round\(15 \+ city level x 0\.3\)/);
assert.match(editor, /Universal walls and level-based repair[\s\S]*?siegeCombat\.repairBaseMinutes[\s\S]*?siegeCombat\.repairMinutesPerLevel[\s\S]*?data-economy-preview="fortifications"/);
assert.match(editorServer, /siegeCombat: Object\.fromEntries\(Object\.keys\(fallback\.siegeCombat/);
assert.ok(packageJson.scripts.test.includes("validate-siege-combat.js"), "Siege combat validation is not in the Functions test suite.");

console.log("Validated two-phase siege benchmarks, wall persistence and repair, casualty caps, protected raids, legacy migration, UI disclosure, and player rules.");
