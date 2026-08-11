const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const {
  DAILY_MISSION_VERSION,
  DAILY_MISSION_SCHEMA_VERSION,
  DAILY_MISSION_COUNT,
  MISSION_FAMILIES,
  getDailyMissionCycle,
  getMissionTarget,
  createDailyMissionState,
  createReplacementMission,
  migrateDailyMissionState,
  applyDailyMissionEvent,
} = require(path.join(root, "functions", "dailyMissions.js"));

function capacity(overrides = {}) {
  return {
    cityCount: 5,
    averageCityLevel: 45,
    goldPerHour: 100_000,
    troopPerHour: 20_000,
    launchableTroops: 1_000_000,
    maxSourceTroops: 600_000,
    qualifyingAttackTroops: 50_000,
    projectedCombatTroops: 1_200_000,
    kingPower: 4_000_000,
    eligibleOpponentCount: 8,
    eligibleEnemyCityCount: 24,
    safePvpTargets: [{
      cityId: "enemy-city",
      regionId: "west",
      cityName: "Low-Risk Keep",
      sourceCityId: "source-city",
      sourceRegionId: "west",
      sourceCityName: "Home Keep",
      recommendedTroops: 150_000,
      estimatedLosses: 75_000,
      evaluatedAtMs: Date.UTC(2026, 7, 9, 8),
    }],
    maxCampCaptures: 4,
    feasibleCampTypes: ["gold", "troops", "items", "deed"],
    deedCampEligible: true,
    strongholdEligible: true,
    clanGiftEligible: true,
    remainingHours: 24,
    upgradeTargets: {
      easy: { totalLevels: 4, singleCityLevels: 2, uniqueCities: 2, goldSpendTarget: 200_000 },
      medium: { totalLevels: 8, singleCityLevels: 4, uniqueCities: 3, goldSpendTarget: 500_000 },
      hard: { totalLevels: 14, singleCityLevels: 6, uniqueCities: 5, goldSpendTarget: 900_000 },
    },
    itemCosts: {
      royal_tax_decree_30m: 150_000,
      war_drums_30m: 75_000,
      swift_march_order: 300_000,
      recall_horn: 500_000,
    },
    ...overrides,
  };
}

function makeState(missions, overrides = {}) {
  return {
    schemaVersion: DAILY_MISSION_SCHEMA_VERSION,
    missionVersion: DAILY_MISSION_VERSION,
    cycleKey: "fresh-2026-07-26-server-reset_2026-08-09",
    resetGeneration: "fresh-2026-07-26-server-reset",
    capacitySnapshot: capacity(),
    missions,
    rerollsRemaining: 1,
    completedCount: 0,
    claimedCount: 0,
    ...overrides,
  };
}

function mission(family, target, overrides = {}) {
  const definition = MISSION_FAMILIES[family];
  return {
    id: `test_${family}`,
    family,
    activityGroup: definition.group,
    activityKey: definition.activityKey || family,
    target,
    progress: 0,
    uniqueProgressKeys: [],
    completedAtMs: 0,
    claimedAtMs: 0,
    ...overrides,
  };
}

function applyOne(entry, event, snapshot = capacity()) {
  return applyDailyMissionEvent(makeState([entry], { capacitySnapshot: snapshot }), {
    id: `event_${entry.family}`,
    occurredAtMs: Date.UTC(2026, 7, 9, 12),
    ...event,
  }, Date.UTC(2026, 7, 9, 12, 1)).missions[0];
}

const beforeMidnight = Date.UTC(2026, 7, 9, 23, 59, 59, 999);
const atMidnight = Date.UTC(2026, 7, 10, 0, 0, 0, 0);
const beforeCycle = getDailyMissionCycle(beforeMidnight, "realm-reset");
const nextCycle = getDailyMissionCycle(atMidnight, "realm-reset");
assert.strictEqual(beforeCycle.utcDate, "2026-08-09");
assert.strictEqual(beforeCycle.resetsAtMs, atMidnight);
assert.strictEqual(nextCycle.utcDate, "2026-08-10");
assert.notStrictEqual(beforeCycle.cycleKey, nextCycle.cycleKey);

const generatedAt = Date.UTC(2026, 7, 9, 8, 30);
const first = createDailyMissionState({
  uid: "validator-player",
  worldId: "world_01",
  resetGeneration: "realm-reset",
  nowMs: generatedAt,
  capacity: capacity(),
});
const repeated = createDailyMissionState({
  uid: "validator-player",
  worldId: "world_01",
  resetGeneration: "realm-reset",
  nowMs: generatedAt,
  capacity: capacity(),
});
assert.deepStrictEqual(first, repeated, "daily generation must be deterministic within a cycle");
assert.strictEqual(first.missions.length, DAILY_MISSION_COUNT);
assert.strictEqual(new Set(first.missions.map(entry => entry.family)).size, DAILY_MISSION_COUNT);
assert.strictEqual(new Set(first.missions.map(entry => entry.activityKey)).size, DAILY_MISSION_COUNT);
assert.strictEqual(first.rerollsRemaining, 1);
assert.strictEqual(first.resetsAtMs, atMidnight);
assert.strictEqual(first.capacitySnapshot.goldPerHour, 100_000);

assert.strictEqual(getMissionTarget("TROOPS_SENT_TO_BATTLE", "easy", first.capacitySnapshot), 50_000);
assert.strictEqual(getMissionTarget("TROOPS_SENT_TO_BATTLE", "medium", first.capacitySnapshot), 100_000);
assert.strictEqual(getMissionTarget("TROOPS_SENT_TO_BATTLE", "hard", first.capacitySnapshot), 150_000);
assert.strictEqual(getMissionTarget("ENEMY_TROOPS_DEFEATED", "hard", first.capacitySnapshot), 150_000);
assert.strictEqual(getMissionTarget("STRONGHOLD_TROOPS_SENT", "hard", first.capacitySnapshot), 150_000);
assert.strictEqual(getMissionTarget("ATTACK_COUNT", "hard", first.capacitySnapshot), 3);
assert.strictEqual(getMissionTarget("UNIQUE_PLAYERS_ATTACKED", "hard", first.capacitySnapshot), 2);
assert.strictEqual(getMissionTarget("CAMP_CAPTURE_COUNT", "hard", first.capacitySnapshot), 2);
assert.strictEqual(getMissionTarget("UNIQUE_CAMP_TYPES", "medium", first.capacitySnapshot), 1);
assert.strictEqual(getMissionTarget("STRONGHOLD_ATTACK_COUNT", "hard", first.capacitySnapshot), 2);
assert.strictEqual(getMissionTarget("GOLD_EARNED", "hard", first.capacitySnapshot), 400_000);
assert.strictEqual(getMissionTarget("TROOPS_PRODUCED", "hard", first.capacitySnapshot), 80_000);

for (let seed = 0; seed < 200; seed += 1) {
  const generated = createDailyMissionState({
    uid: `selection-${seed}`,
    worldId: "world_01",
    resetGeneration: "realm-reset",
    nowMs: generatedAt,
    capacity: capacity(),
  });
  const militaryCount = generated.missions.filter(entry => ["combat", "stronghold"].includes(entry.activityGroup)).length;
  const campCount = generated.missions.filter(entry => entry.activityGroup === "camps").length;
  assert(militaryCount <= 1, "PvP and Stronghold missions shared more than one selection slot");
  assert(campCount <= 1, "camp missions must occupy at most one separate slot");
  generated.missions.filter(entry => ["ENEMY_CITY_CAPTURE", "BATTLE_WINS"].includes(entry.family)).forEach(entry => {
    assert.strictEqual(entry.difficulty, "easy");
    assert.strictEqual(entry.target, 1);
    assert.strictEqual(entry.recommendedTarget?.cityId, "enemy-city");
  });
}

first.missions.forEach(entry => {
  assert(entry.target >= 1);
  assert(entry.reward.lockedAmount >= 1);
  assert(["gold", "troops", "item"].includes(entry.reward.type));
  if (entry.reward.type === "item") {
    assert(["royal_tax_decree_30m", "war_drums_30m", "swift_march_order", "recall_horn"].includes(entry.reward.itemId));
    assert(!["shield_12h", "veil_of_silence_30m"].includes(entry.reward.itemId));
  } else {
    const expectedRate = entry.reward.type === "gold" ? 100_000 : 20_000;
    assert.strictEqual(entry.reward.lockedAmount, Math.floor(expectedRate * entry.reward.productionHours));
  }
});

const low = createDailyMissionState({
  uid: "low-player",
  worldId: "world_01",
  resetGeneration: "realm-reset",
  nowMs: generatedAt,
  capacity: capacity({ goldPerHour: 10_000, troopPerHour: 2_000, launchableTroops: 50_000, qualifyingAttackTroops: 2_500 }),
});
const high = createDailyMissionState({
  uid: "high-player",
  worldId: "world_01",
  resetGeneration: "realm-reset",
  nowMs: generatedAt,
  capacity: capacity({ goldPerHour: 1_000_000, troopPerHour: 200_000, launchableTroops: 10_000_000, qualifyingAttackTroops: 500_000 }),
});
assert(low.missions.every(entry => entry.reward.lockedAmount > 0));
assert(high.missions.every(entry => entry.reward.lockedAmount > 0));

const late = createDailyMissionState({
  uid: "late-player",
  worldId: "world_01",
  resetGeneration: "realm-reset",
  nowMs: Date.UTC(2026, 7, 9, 23, 50),
  capacity: capacity(),
});
assert.strictEqual(late.missions.length, 3, "late access must still produce three achievable missions");
assert(!late.missions.some(entry => [
  "ENEMY_CITY_CAPTURE", "BATTLE_WINS", "ENEMY_TROOPS_DEFEATED", "CAMP_CAPTURE_COUNT",
  "GOLD_CAMP_CAPTURE", "WARBAND_CAMP_CAPTURE", "RELIC_CAMP_CAPTURE", "UNIQUE_CAMP_TYPES",
].includes(entry.family)), "late access assigned a mission that depends on an arrival before reset");

const replacement = createReplacementMission(first, first.missions[0].id, capacity(), generatedAt + 1000);
assert(replacement, "an eligible replacement should exist");
assert.notStrictEqual(replacement.family, first.missions[0].family);
assert(!first.missions.slice(1).some(entry => entry.family === replacement.family));
assert(!first.missions.slice(1).some(entry => entry.activityKey === replacement.activityKey));
assert.strictEqual(replacement.progress, 0);
const replacementSet = first.missions.slice(1).concat(replacement);
assert(replacementSet.filter(entry => ["combat", "stronghold"].includes(entry.activityGroup)).length <= 1);

const legacyReward = { type: "troops", lockedAmount: 40_000, productionHours: 2 };
const migrated = migrateDailyMissionState(makeState([
  mission("TROOPS_SENT_TO_BATTLE", 1_800_000, {
    difficulty: "hard",
    progress: 150_000,
    reward: legacyReward,
  }),
  mission("ENEMY_CITY_CAPTURE", 3, {
    difficulty: "hard",
    progress: 0,
    reward: { type: "troops", lockedAmount: 10_000, productionHours: 0.5 },
  }),
  mission("GOLD_EARNED", 1_200_000, {
    difficulty: "hard",
    progress: 500_000,
    reward: { type: "gold", lockedAmount: 200_000, productionHours: 2 },
  }),
], { schemaVersion: 1 }), capacity({ safePvpTargets: [] }), generatedAt + 2000);
assert.strictEqual(migrated.schemaVersion, DAILY_MISSION_SCHEMA_VERSION);
assert.strictEqual(migrated.missions[0].target, 150_000);
assert.strictEqual(migrated.missions[0].completedAtMs, generatedAt + 2000);
assert.deepStrictEqual(migrated.missions[0].reward, legacyReward);
assert.strictEqual(migrated.missions[1].family, "ATTACK_COUNT");
assert.strictEqual(migrated.missions[1].target, 1);
assert.strictEqual(migrated.missions[1].reward.lockedAmount, 10_000);
assert.strictEqual(migrated.missions[2].target, 400_000);
assert.strictEqual(migrated.missions[2].progress, 500_000, "migration must retain progress above a lowered target");
assert.strictEqual(migrated.missions[2].completedAtMs, generatedAt + 2000);
assert.strictEqual(migrated.rerollsRemaining, 1);

const preservedClaim = mission("BATTLE_WINS", 5, {
  difficulty: "hard",
  progress: 5,
  completedAtMs: generatedAt - 1000,
  claimedAtMs: generatedAt,
  reward: legacyReward,
});
const migratedClaim = migrateDailyMissionState(
  makeState([preservedClaim], { schemaVersion: 1, rerollsRemaining: 0 }),
  capacity({ safePvpTargets: [] }),
  generatedAt + 3000
);
assert.deepStrictEqual(migratedClaim.missions[0], preservedClaim, "claimed missions must remain untouched");
assert.strictEqual(migratedClaim.rerollsRemaining, 0);

const migratedSafeOutcome = migrateDailyMissionState(
  makeState([mission("ENEMY_CITY_CAPTURE", 3, { difficulty: "hard", reward: legacyReward })], { schemaVersion: 1 }),
  capacity(),
  generatedAt + 4000
);
assert.strictEqual(migratedSafeOutcome.missions[0].family, "ENEMY_CITY_CAPTURE");
assert.strictEqual(migratedSafeOutcome.missions[0].difficulty, "easy");
assert.strictEqual(migratedSafeOutcome.missions[0].target, 1);
assert.strictEqual(migratedSafeOutcome.missions[0].recommendedTarget.cityId, "enemy-city");

const thresholdSnapshot = capacity({ launchableTroops: 1_000_000, qualifyingAttackTroops: 50_000 });
const tokenAttack = applyOne(mission("ATTACK_COUNT", 1), {
  type: "ATTACK_LAUNCHED",
  targetCategory: "player_city",
  opponentUid: "enemy",
  committedTroops: 49_999,
}, thresholdSnapshot);
assert.strictEqual(tokenAttack.progress, 0, "less than 5% committed troops must not progress combat missions");
const meaningfulAttack = applyOne(mission("ATTACK_COUNT", 1), {
  type: "ATTACK_LAUNCHED",
  targetCategory: "player_city",
  opponentUid: "enemy",
  committedTroops: 50_000,
}, thresholdSnapshot);
assert.strictEqual(meaningfulAttack.progress, 1);
assert(meaningfulAttack.completedAtMs > 0);

assert.strictEqual(applyOne(mission("ENEMY_CITY_CAPTURE", 1), {
  type: "BATTLE_RESOLVED", targetCategory: "player_city", committedTroops: 50_000,
  cityCaptured: true, success: true,
}, thresholdSnapshot).progress, 1);
assert.strictEqual(applyOne(mission("BATTLE_WINS", 1), {
  type: "BATTLE_RESOLVED", targetCategory: "player_city", committedTroops: 50_000, success: true,
}, thresholdSnapshot).progress, 1);
assert.strictEqual(applyOne(mission("ENEMY_TROOPS_DEFEATED", 1000), {
  type: "BATTLE_RESOLVED", targetCategory: "player_city", committedTroops: 50_000, defenderLosses: 1000,
}, thresholdSnapshot).progress, 1000);
assert.strictEqual(applyOne(mission("CAMP_CAPTURE_COUNT", 1), {
  type: "CAMP_CAPTURED", targetCategory: "camp", committedTroops: 1, campCaptured: true, campType: "gold", success: true,
}, thresholdSnapshot).progress, 1, "a server-confirmed camp capture must not be blocked by the PvP token-attack threshold");
assert.strictEqual(applyOne(mission("GOLD_CAMP_CAPTURE", 1), {
  type: "CAMP_CAPTURED", targetCategory: "camp", committedTroops: 1, campCaptured: true, campType: "gold", success: true,
}, thresholdSnapshot).progress, 1, "a successful Gold Camp capture must complete its specific mission");
assert.strictEqual(applyOne(mission("CAMP_CAPTURE_COUNT", 1), {
  type: "CAMP_CAPTURED", targetCategory: "camp", committedTroops: 50_000, campCaptured: true, campType: "gold", success: false,
}, thresholdSnapshot).progress, 0, "an unsuccessful camp battle must not progress a capture mission");
assert.strictEqual(applyOne(mission("TOTAL_CITY_LEVEL_UPGRADES", 3), {
  type: "CITY_UPGRADED", cityId: "city-a", levelsGained: 3, goldSpent: 100_000,
}).progress, 3);
assert.strictEqual(applyOne(mission("GOLD_EARNED", 1000), {
  type: "ECONOMY_PRODUCED", goldProduced: 1000,
}).progress, 1000);
assert.strictEqual(applyOne(mission("TROOPS_PRODUCED", 500), {
  type: "ECONOMY_PRODUCED", troopsProduced: 500,
}).progress, 500);
assert.strictEqual(applyOne(mission("STRONGHOLD_ATTACK", 1), {
  type: "ATTACK_LAUNCHED", targetCategory: "stronghold", committedTroops: 50_000,
}, thresholdSnapshot).progress, 1);
assert.strictEqual(applyOne(mission("CLAN_GIFT", 1), {
  type: "CLAN_GIFT_SENT", clanGiftSent: true,
}).progress, 1);

const functionsSource = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const apiSource = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const rulesSource = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

[
  "exports.getDailyMissionStatus",
  "exports.rerollDailyMission",
  "exports.claimDailyMissionReward",
  "exports.applyDailyMissionEvent",
  "enqueueDailyMissionEvent",
  "suppressDailyMissionProduction",
  "productionFromMs",
  "productionToMs",
  "eligibleShare",
  "findDailyMissionSafePvpTargets",
  "createDailyMissionSafeBattleTarget",
  "DAILY_MISSION_SAFE_PEER_LIMIT = 3",
  "DAILY_MISSION_SAFE_CITY_LIMIT = 12",
  "DAILY_MISSION_SAFE_ARMY_PERCENT = 15",
  "DAILY_MISSION_SAFE_LOSS_PERCENT = 10",
  "campDefenders",
  "defenderProfile.clanId",
  "migrateDailyMissionState",
].forEach(contract => assert(functionsSource.includes(contract), `missing server contract: ${contract}`));
[
  "CITY_UPGRADED", "ATTACK_LAUNCHED", "BATTLE_RESOLVED", "CAMP_CAPTURED",
  "DEED_CAMP_COMPLETED", "CLAN_GIFT_SENT", "ECONOMY_PRODUCED",
].forEach(eventType => assert(functionsSource.includes(eventType), `missing authoritative mission event: ${eventType}`));
assert.match(
  functionsSource,
  /if \(battle\.success\)[\s\S]*?eventId: `camp_capture_\$\{armyId\}_\$\{target\.id\}`[\s\S]*?type: "CAMP_CAPTURED"[\s\S]*?campType: campTarget\.campType[\s\S]*?success: true[\s\S]*?campCaptured: true/,
  "ordinary successful camp settlement does not enqueue Daily Mission progress"
);
assert.match(
  functionsSource,
  /if \(result\.success && targetType === "camp"\)[\s\S]*?eventId: `rally_camp_capture_\$\{armyId\}_\$\{target\.id\}`[\s\S]*?type: "CAMP_CAPTURED"[\s\S]*?campType: target\.campType[\s\S]*?success: true[\s\S]*?campCaptured: true/,
  "successful rally camp settlement does not enqueue Daily Mission progress"
);
assert(functionsSource.includes("dailyMissionVersion: DAILY_MISSION_VERSION"));
assert(apiSource.includes("subscribeDailyMissionState"));
assert(clientSource.includes("function scheduleDailyMissionUtcRefresh"));
assert(clientSource.includes("function showDailyMissionRerollConfirmation"));
assert(clientSource.includes("function normalizeMissionTarget"));
assert(clientSource.includes('querySelector(".daily-mission-recommendation button")'));
assert(clientSource.includes("focusBattleReportTarget(recommendation.cityId, recommendation.regionId)"));
assert(clientSource.includes("Low-risk target"));
assert(clientSource.includes("playRewardAnimation(rewardType"));
assert(rulesSource.includes("match /dailyMissions/{cycleKey}"));
assert(rulesSource.includes("match /dailyMissionEvents/{eventId}"));
assert(!htmlSource.includes('id="dailyMissionsSection"'), "Daily Missions must not remain in the Player Profile markup");
assert(clientSource.includes("function renderDailyMissionSection"));
assert(clientSource.includes('id="dailyMissionsList"'));
assert(cssSource.includes(".daily-mission-row"));
assert(cssSource.includes(".daily-mission-recommendation"));
assert(cssSource.includes("overflow: hidden"));

console.log("Daily Missions validation passed.");
