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
  BASE_TROOP_ATTACK_POWER: 1.25,
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
  getSiegeRepairTiming(level, wallDamagePower, fullWallPower, currentRepairAtMs, nowMs, reductionPercent = 0) {
    const repairWindowMinutes = Math.max(1, Math.round(15 + Math.max(1, Math.floor(Number(level) || 1)) * 0.3));
    const reduction = Math.max(0, Math.min(100, Number(reductionPercent) || 0));
    const damageShare = Math.max(0, Math.min(1, (Number(wallDamagePower) || 0) / Math.max(1, Number(fullWallPower) || 0)));
    const repairAddedMs = Math.max(0, Math.round(repairWindowMinutes * 60_000 * damageShare * (1 - reduction / 100)));
    return {
      repairWindowMinutes,
      repairReductionPercent: reduction,
      repairAddedMs,
      repairAtMs: Math.max(Number(currentRepairAtMs) || 0, nowMs) + repairAddedMs,
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
  activeCommonGearBonuses: { attackStrength: 0, wallRepairSpeed: 0 },
  getCommonGearBonuses() {
    return context.activeCommonGearBonuses;
  },
};
vm.createContext(context);
vm.runInContext(`${extractFunction(server, "normalizeFortificationState")}; ${extractFunction(server, "getFortificationIntegrityBpsAt")}; ${extractFunction(server, "getFortificationStatePatch")}; ${extractFunction(server, "calculateCombatResult")}; this.normalizeFortificationState = normalizeFortificationState; this.getFortificationIntegrityBpsAt = getFortificationIntegrityBpsAt; this.getFortificationStatePatch = getFortificationStatePatch; this.calculateCombatResult = calculateCombatResult;`, context, {
  filename: "functions/index.js",
});

const activeStoredWall = context.normalizeFortificationState({
  fortificationState: { version: 1, integrityBps: 4_000, lastDamagedAtMs: 1_000, repairAtMs: 61_000, lastArmyId: "a1" },
}, 1_500);
assert.equal(activeStoredWall.integrityBps, 4_000);
assert.equal(activeStoredWall.repairAtMs, 61_000);
assert.equal(activeStoredWall.repairWindowMinutes, 1, "Legacy active timers must infer their original duration.");
assert.equal(
  context.getFortificationIntegrityBpsAt(activeStoredWall, 31_000),
  7_000,
  "A damaged wall must recover continuously instead of remaining static until its deadline."
);
const repairedStoredWall = context.normalizeFortificationState({
  fortificationState: { version: 1, integrityBps: 0, lastDamagedAtMs: 1_000, repairAtMs: 2_000, lastArmyId: "a1" },
}, 2_000);
assert.equal(repairedStoredWall.integrityBps, 10_000, "A completed repair timer must restore full wall integrity.");
assert.equal(repairedStoredWall.repairAtMs, 0);

const integrityContexts = [server, client].map((source, index) => {
  const integrityContext = {
    Date,
    Math,
    Number,
    clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, Number(value) || 0));
    },
    clampInt(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || 0)));
    },
    safeNumber(value, fallback = 0) {
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    },
    timestampToMs(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    },
    normalizeTimestampMs(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    },
  };
  vm.createContext(integrityContext);
  vm.runInContext(`${extractFunction(source, "getFortificationIntegrityBpsAt")}; this.getFortificationIntegrityBpsAt = getFortificationIntegrityBpsAt;`, integrityContext, {
    filename: index === 0 ? "functions/index.js" : "game.js",
  });
  return integrityContext;
});
for (const integrityContext of integrityContexts) {
  const breachedWall = { integrityBps: 0, lastDamagedAtMs: 1_000, repairAtMs: 101_000 };
  assert.equal(integrityContext.getFortificationIntegrityBpsAt(breachedWall, 1_000), 0);
  assert.equal(integrityContext.getFortificationIntegrityBpsAt(breachedWall, 26_000), 2_500);
  assert.equal(integrityContext.getFortificationIntegrityBpsAt(breachedWall, 51_000), 5_000);
  assert.equal(integrityContext.getFortificationIntegrityBpsAt(breachedWall, 76_000), 7_500);
  assert.equal(integrityContext.getFortificationIntegrityBpsAt(breachedWall, 101_000), 10_000);
  assert.equal(
    integrityContext.getFortificationIntegrityBpsAt({
      integrityBps: 4_000,
      lastDamagedAtMs: 1_000,
      repairAtMs: 101_000,
    }, 51_000),
    7_000,
    "Partial wall damage must recover linearly from its post-hit integrity."
  );
  assert.equal(
    integrityContext.getFortificationIntegrityBpsAt({ integrityBps: 4_000, repairAtMs: 101_000 }, 51_000),
    4_000,
    "Legacy damage without a known repair start must not invent elapsed progress."
  );
}

const repairContexts = [server, client].map((source, index) => {
  const repairContext = {
    SIEGE_REPAIR_BASE_MINUTES: 15,
    SIEGE_REPAIR_MINUTES_PER_LEVEL: 0.3,
    Number,
    Math,
    clamp(value, minimum, maximum) {
      return Math.max(minimum, Math.min(maximum, Number(value) || 0));
    },
    safeNumber(value, fallback = 0) {
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    },
    timestampToMs(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    },
    normalizeTimestampMs(value) {
      return Math.max(0, Math.floor(Number(value) || 0));
    },
    clampCityLevel(value) {
      return Math.max(1, Math.floor(Number(value) || 1));
    },
  };
  vm.createContext(repairContext);
  vm.runInContext(`${extractFunction(source, "getSiegeRepairWindowMinutes")}; ${extractFunction(source, "getSiegeRepairTiming")}; this.getSiegeRepairWindowMinutes = getSiegeRepairWindowMinutes; this.getSiegeRepairTiming = getSiegeRepairTiming;`, repairContext, {
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
repairContexts.forEach(repairContext => {
  const first = repairContext.getSiegeRepairTiming(100, 200, 1_000, 0, 1_800_000);
  assert.equal(first.repairWindowMinutes, 45);
  assert.equal(first.repairAddedMs, 540_000);
  assert.equal(first.repairAtMs, 2_340_000);
  const later = repairContext.getSiegeRepairTiming(100, 100, 1_000, first.repairAtMs, 2_100_000);
  assert.equal(later.repairAddedMs, 270_000);
  assert.equal(later.repairAtMs, 2_610_000);
  const reduced = repairContext.getSiegeRepairTiming(100, 100, 1_000, first.repairAtMs, 2_100_000, 50);
  assert.equal(reduced.repairAddedMs, 135_000, "Repair reduction must affect only the latest damage increment.");
  assert.equal(reduced.repairAtMs, 2_475_000);
});

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
  fullWallPower = wall * 10_000 / integrityBps,
  garrison,
  repairAtMs = 0,
  targetType = "city",
  level = 50,
  attackProtection = null,
  nowMs = 1_800_000,
  version = 1,
  ignoreWallDefense = false,
  repairReductionPercent = 0,
} = {}) {
  return context.calculateCombatResult(troops, { level, troops: defenders, legacyDefense: wall + garrison }, {}, {}, {
    attackPower,
    defensePower: wall + garrison,
    siegeCombatVersion: version,
    targetType,
    fortification: {
      fullWallPower,
      currentWallPower: wall,
      integrityBps,
      repairAtMs,
    },
    garrisonDefensePower: garrison,
    ignoreWallDefense,
    attackProtection,
    repairReductionPercent,
    nowMs,
  });
}

const level50 = siegeResult({ level: 50, attackPower: 2_000_000, wall: 2_474_923, garrison: 2_000_000 });
assert.equal(level50.success, false, "One million max-Sword troops should not capture the Level 50 benchmark.");
assert.equal(level50.fortificationBreached, false);
assert.equal(level50.fortification.penetratingAttackPower, 0);
assert.equal(level50.defenderLosses, 80_810);

const level75 = siegeResult({ level: 75, attackPower: 2_000_000, wall: 3_737_461, garrison: 2_500_000 });
assert.equal(level75.success, false, "The Level 75 benchmark wall should hold.");
assert.equal(level75.fortificationBreached, false);
assert.equal(level75.defenderLosses, 53_512);

const level100 = siegeResult({ level: 100, attackPower: 2_000_000, wall: 4_999_998, garrison: 3_000_000 });
assert.equal(level100.success, false, "Max Stoneworks on a Level 100 city should stop the benchmark army at the wall.");
assert.equal(level100.fortificationBreached, false);
assert.equal(level100.defenderLosses, 40_000);
assert.ok(level100.defenderLosses <= 100_000, "An intact wall allowed more than 10% defender losses.");
assert.equal(level100.fortification.endingIntegrityBps, 5_999);
assert.equal(level100.fortification.repairWindowMinutes, 45);
assert.equal(level100.fortification.repairAddedMs, 1_080_000);
assert.equal(level100.fortification.repairAtMs, 2_880_000);

const wallBypass = siegeResult({
  attackPower: 500,
  troops: 500,
  defenders: 100,
  wall: 1_000,
  garrison: 400,
  ignoreWallDefense: true,
});
assert.equal(wallBypass.success, true, "A wall-bypassing attack must resolve against the garrison only.");
assert.equal(wallBypass.defensePower, 400, "Ignored wall power must contribute zero defense.");
assert.equal(wallBypass.defendersLeft, 0, "A successful wall-bypassing attack must defeat the full garrison.");
assert.equal(wallBypass.fortification.wallDefenseIgnored, true);
assert.equal(wallBypass.fortification.startingWallPower, 1_000, "The report must retain the wall that was bypassed.");
assert.equal(wallBypass.fortification.wallDamagePower, 0, "Bypassing a wall must not damage it.");
assert.equal(wallBypass.fortification.endingIntegrityBps, 10_000, "Bypassing a wall must preserve its integrity.");
assert.equal(wallBypass.fortification.persistentDamageApplied, false);

const exactThreshold = siegeResult({ attackPower: 50, troops: 50, defenders: 100, wall: 1_000, garrison: 200 });
assert.equal(exactThreshold.fortification.meaningfulWallDamage, true, "Exactly 5% wall damage must reset repair.");
assert.equal(exactThreshold.fortification.persistentDamageApplied, true);
assert.equal(exactThreshold.fortification.repairAddedMs, 90_000, "A 5% hit must add exactly 5% of Level 50's 30-minute window.");
assert.equal(exactThreshold.fortification.repairAtMs, 1_890_000);
context.activeCommonGearBonuses = { attackStrength: 0, wallRepairSpeed: 10 };
const cappedRepairReduction = siegeResult({
  attackPower: 50,
  troops: 50,
  defenders: 100,
  wall: 1_000,
  garrison: 200,
  repairReductionPercent: 90,
});
assert.equal(cappedRepairReduction.fortification.repairReductionPercent, 95, "Wall repair gear exceeded the 95% combined cap.");
assert.equal(cappedRepairReduction.fortification.repairAddedMs, 4_500, "The 95% repair cap changed the new-damage increment incorrectly.");
context.activeCommonGearBonuses = { attackStrength: 0, wallRepairSpeed: 0 };
const belowThreshold = siegeResult({ attackPower: 49, troops: 49, defenders: 100, wall: 1_000, garrison: 200 });
assert.equal(belowThreshold.fortification.meaningfulWallDamage, false);
assert.equal(belowThreshold.fortification.endingIntegrityBps, 10_000, "Sub-threshold wall damage must not persist.");
assert.equal(belowThreshold.fortification.repairAddedMs, 0);

const firstProgressiveHit = siegeResult({
  level: 100,
  attackPower: 200,
  wall: 1_000,
  garrison: 10_000,
  nowMs: 1_800_000,
});
assert.equal(firstProgressiveHit.fortification.repairAddedMs, 540_000, "A 20% Level 100 hit must add 9 minutes.");
assert.equal(firstProgressiveHit.fortification.repairAtMs, 2_340_000);
const secondProgressiveHit = siegeResult({
  level: 100,
  attackPower: 100,
  wall: 911,
  integrityBps: 9_111,
  fullWallPower: 1_000,
  garrison: 10_000,
  repairAtMs: firstProgressiveHit.fortification.repairAtMs,
  nowMs: 2_100_000,
});
assert.equal(secondProgressiveHit.fortification.repairAddedMs, 270_000, "A later 10% hit must add 4 minutes 30 seconds.");
assert.equal(secondProgressiveHit.fortification.repairAtMs, 2_610_000, "A later hit must extend the existing deadline without discarding elapsed progress.");
assert.equal(secondProgressiveHit.fortification.endingIntegrityBps, 8_111, "A later hit must apply after the wall's elapsed repair is restored.");

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
assert.equal(camp.fortification, null, "Reward camps must remain wall-free.");
const legacy = siegeResult({ attackPower: 1_000, troops: 1_000, defenders: 100, wall: 1_000, garrison: 200, version: 0 });
assert.equal(legacy.fortification, null, "Unversioned in-flight armies must retain legacy settlement.");

assert.match(server, /const settlementSiegeCombatVersion = targetType === "camp"[\s\S]*?army\.siegeCombatVersion, 0/);
assert.match(server, /function getScoutCombatIntel[\s\S]*?report\.siegeCombatVersion[\s\S]*?return \{ status: "unavailable", report: null \}/);
assert.match(server, /siegeCombatVersion: order\.targetType === "camp" \? 0 : SIEGE_COMBAT_VERSION/);
assert.match(server, /siegeCombatVersion: rally\.targetType === "camp" \? 0 : SIEGE_COMBAT_VERSION/);
assert.match(server, /function writeFortificationSettlement[\s\S]*?fortificationState/);
assert.match(server, /function getFortificationSnapshot[\s\S]*?getFortificationIntegrityBpsAt\(state, nowMs\)[\s\S]*?currentWallPower/);
assert.match(client, /function getCityFortificationSnapshot[\s\S]*?getFortificationIntegrityBpsAt\(state, nowMs\)[\s\S]*?currentWallPower/);
assert.match(client, /function updateVisibleFortificationRepairStatus[\s\S]*?getFortificationIntegrityBpsAt[\s\S]*?data-fortification-power/);
assert.match(server, /const carriedFortificationState = settledFortificationState \|\| \([\s\S]*?getNeutralClaimCapturePatch[\s\S]*?fortificationState: carriedFortificationState/);
assert.match(server, /function getFortificationStatePatch[\s\S]*?repairAtMs: Math\.max\(nowMs, timestampToMs\(fortification\.repairAtMs\)\)/);
assert.match(server, /function resolveCitadelAssaultTarget[\s\S]*?carriedFortificationState[\s\S]*?getNeutralClaimClearedPatch[\s\S]*?fortificationState: carriedFortificationState/);
assert.doesNotMatch(extractFunction(server, "getNeutralClaimClearedPatch"), /fortificationState/, "Neutral ownership metadata must not clear active wall damage.");
assert.doesNotMatch(server, /fortificationState:\s*null/, "Ownership and neutral handoffs must not erase fortification state.");
assert.match(server, /capabilities:[\s\S]*?siegeCombatVersion: SIEGE_COMBAT_VERSION/);
assert.match(client, /function renderCityFortificationStatus[\s\S]*?Wall integrity[\s\S]*?Walls absorb attack power before the garrison fights/);
assert.match(client, /function supportsSiegeCombat[\s\S]*?getRealmCapabilityVersion\("siegeCombatVersion"\)/);
assert.match(client, /function renderBattleSideDetails[\s\S]*?Wall power at battle/);
assert.match(client, /function renderBattleWallResult[\s\S]*?Before battle[\s\S]*?After battle[\s\S]*?repair window/);
assert.match(client, /function formatBattleWallAfterStatus[\s\S]*?Intact — 100%[\s\S]*?Breached — 0%[\s\S]*?Damaged —/);
assert.match(client, /New scout required[\s\S]*?predates the current wall-and-garrison combat model/);
assert.match(client, /function applyOnlineCities[\s\S]*?hasOwnProperty\.call\(online, "fortificationState"\)/);
assert.match(client, /function applyServerCityUpdates[\s\S]*?hasOwnProperty\.call\(update, "fortificationState"\)/);
assert.ok(client.includes("Walls likely hold"));
assert.ok(client.includes("Walls breached — garrison likely holds"));
assert.match(rules, /two phases[\s\S]*?full-breach repair window[\s\S]*?same damage share[\s\S]*?recover continuously[\s\S]*?neutral claims[\s\S]*?Protected raids do not persist wall damage/);
assert.match(guide, /Defense happens in two layers[\s\S]*?defender troop losses are capped at 10%/);
assert.match(guide, /full-breach repair window[\s\S]*?exact damage share[\s\S]*?rise continuously[\s\S]*?neutral handoff/);
assert.match(readme, /two-phase siege model[\s\S]*?same linear wall curve[\s\S]*?full-breach repair window[\s\S]*?recover continuously[\s\S]*?later meaningful hits use that recovered strength/);
assert.match(editor, /Soldiers and walls[\s\S]*?added time = full window[\s\S]*?siegeCombat\.repairBaseMinutes[\s\S]*?siegeCombat\.repairMinutesPerLevel[\s\S]*?data-economy-preview="fortifications"/);
assert.match(editorServer, /siegeCombat: Object\.fromEntries\(Object\.keys\(fallback\.siegeCombat/);
assert.match(editorServer, /troopCombat: Object\.fromEntries\(Object\.keys\(fallback\.troopCombat/);
assert.ok(packageJson.scripts.test.includes("validate-siege-combat.js"), "Siege combat validation is not in the Functions test suite.");

console.log("Validated two-phase siege benchmarks, wall persistence and repair, casualty caps, protected raids, legacy migration, UI disclosure, and player rules.");
