"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const towers = require(path.join(root, "functions", "holding-towers.js"));
const server = read("functions/index.js");
const client = read("game.js");
const firebaseClient = read("firebaseClient.js");
const holdingTowerUi = read("holding-tower-ui.js");
const holdingTowerStyles = read("holding-tower-ui.css");
const rules = read("firestore.rules");

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const canonicalCost = level => level * 100_000;
const constantCityCost = () => 100_000;
const baseRepairMinutes = () => 60;

function expectError(callback, pattern, message) {
  assert.throws(callback, pattern, message);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}.`);
  const parametersStart = source.indexOf("(", start);
  let parameterDepth = 0;
  let parametersEnd = -1;
  for (let index = parametersStart; index < source.length; index += 1) {
    if (source[index] === "(") parameterDepth += 1;
    if (source[index] === ")") parameterDepth -= 1;
    if (parameterDepth === 0) {
      parametersEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf("{", parametersEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name}.`);
}

function ownedTower(towerId = towers.TOWERS[0].id, patch = {}) {
  return {
    ...towers.createNeutralTowerState(towerId, {
      worldId: "pending-core-v2",
      resetGeneration: "season-test",
      nowMs: NOW,
    }),
    realmShardId: "shard_0001",
    ownerKind: "clan",
    clanId: "clan-red",
    clanName: "Red Keep",
    clanTag: "RED",
    neutralDefenders: 0,
    ...patch,
  };
}

// Permanent identities and neutral reset state.
assert.deepEqual(
  towers.TOWERS.map(tower => [tower.id, tower.name, tower.quadrant, tower.reservedX, tower.reservedY]),
  [
    ["core-v2-holding-tower-1", "Ravenwatch Tower", "north-west", 736, 552],
    ["core-v2-holding-tower-2", "Highguard Tower", "north-east", 734, 555],
    ["core-v2-holding-tower-3", "Blackthorn Tower", "south-west", 724, 543],
    ["core-v2-holding-tower-4", "Stoneward Tower", "south-east", 736, 555],
  ]
);
for (const definition of towers.TOWERS) {
  const neutral = towers.createNeutralTowerState(definition.id, { nowMs: NOW });
  assert.equal(neutral.ownerKind, "neutral");
  assert.equal(neutral.clanId, "");
  assert.equal(neutral.wallLevel, 1);
  assert.equal(neutral.wallIntegrityBps, 10_000);
  assert.equal(neutral.neutralDefenders, 10_000_000);
  assert.deepEqual(neutral.upgradeQueue, []);
  assert.equal(neutral.repair, null);
  assert.equal(neutral.veil, null);
  assert.equal(neutral.veilUsage.count, 0);
}

// Authoritative 24-hour membership probation and five-person Rally gate.
const eligibleMember = uid => ({ uid, clanId: "clan-red", status: "active", joinedAtMs: NOW - 25 * HOUR_MS });
const probationMember = uid => ({ uid, clanId: "clan-red", status: "active", joinedAtMs: NOW - 23 * HOUR_MS });
assert.equal(towers.isEligibleMember(probationMember("new"), NOW, "clan-red"), false);
assert.equal(towers.isEligibleMember({ ...eligibleMember("exact"), joinedAtMs: NOW - 24 * HOUR_MS }, NOW, "clan-red"), true);
assert.equal(towers.isEligibleMember(eligibleMember("persisted"), NOW + 31 * 24 * HOUR_MS, "clan-red"), true, "A reset must not restart a persisted membership age.");
const members = new Map(Array.from({ length: 6 }, (_, index) => {
  const uid = `member-${index + 1}`;
  return [uid, eligibleMember(uid)];
}));
const participants = count => Array.from({ length: count }, (_, index) => ({ uid: `member-${index + 1}`, troops: index + 1, status: "assembled" }));
assert.equal(towers.validateTowerRallyParticipants(participants(4), members, NOW, "clan-red").valid, false);
assert.equal(towers.validateTowerRallyParticipants(participants(5), members, NOW, "clan-red").valid, true);
assert.equal(towers.validateTowerRallyParticipants([...participants(4), { uid: "member-5", troops: 0 }], members, NOW, "clan-red").count, 4);
const membersWithProbation = new Map(members);
membersWithProbation.set("member-5", probationMember("member-5"));
assert.equal(towers.validateTowerRallyParticipants(participants(5), membersWithProbation, NOW, "clan-red").count, 4);
assert.equal(towers.validateTowerRallyParticipants(participants(4), members, NOW, "clan-red").count, 4, "A withdrawn fifth contribution must no longer count.");
assert.equal(towers.validateTowerRallyParticipants([...participants(4), { uid: "member-4", troops: 900 }], members, NOW, "clan-red").count, 4, "Duplicate participant records must not count twice.");

// Normal scouting automatically considers authoritative City and personal Tower origins.
const scoutPlayer = "ricky";
const scoutMember = eligibleMember(scoutPlayer);
const scoutTower = ownedTower(towers.TOWERS[0].id, {
  wallIntegrityBps: 4_000,
  repair: { completeAtMs: NOW + HOUR_MS },
  upgradeQueue: [{ targetLevel: 2, remainingMs: 600_000 }],
  incomingRallyIds: ["rally-incoming"],
  attackBlocked: true,
});
const personalGarrisons = new Map([[scoutTower.id, {
  uid: scoutPlayer,
  towerId: scoutTower.id,
  clanId: "clan-red",
  worldId: "pending-core-v2",
  resetGeneration: "season-test",
  realmShardId: "shard_0001",
  troops: 3,
}]]);
const eligibleTowerOrigins = towers.getEligibleScoutTowerOrigins({
  towers: [scoutTower],
  garrisonsByTowerId: personalGarrisons,
  clanId: "clan-red",
  member: scoutMember,
  uid: scoutPlayer,
  nowMs: NOW,
  worldId: "pending-core-v2",
  resetGeneration: "season-test",
  realmShardId: "shard_0001",
  worldActive: true,
});
assert.equal(eligibleTowerOrigins.length, 1, "Damage, repair, upgrades, and an incoming Rally must not block an otherwise eligible scout origin.");
assert.equal(eligibleTowerOrigins[0].troops, 3);
for (const [label, patch] of [
  ["wrong clan", { towers: [{ ...scoutTower, clanId: "clan-blue" }] }],
  ["ownership changed", { towers: [{ ...scoutTower, ownerKind: "neutral", clanId: "" }] }],
  ["probation", { member: probationMember(scoutPlayer) }],
  ["left or kicked", { member: { ...scoutMember, status: "removed" } }],
  ["world inactive", { worldActive: false }],
  ["wrong realm shard", { realmShardId: "shard_0002" }],
  ["zero personal troops", { garrisonsByTowerId: new Map([[scoutTower.id, { uid: scoutPlayer, troops: 0 }]]) }],
  ["only another member has troops", { garrisonsByTowerId: new Map() }],
]) {
  assert.equal(towers.getEligibleScoutTowerOrigins({
    towers: [scoutTower],
    garrisonsByTowerId: personalGarrisons,
    clanId: "clan-red",
    member: scoutMember,
    uid: scoutPlayer,
    nowMs: NOW,
    worldId: "pending-core-v2",
    resetGeneration: "season-test",
    realmShardId: "shard_0001",
    worldActive: true,
    ...patch,
  }).length, 0, `A Tower with ${label} was accepted as a scout origin.`);
}
const routedScout = towers.selectClosestScoutOrigin([
  { id: "city-far", regionId: "region-b", sourceType: "city", troops: 4, distance: 90 },
  { id: scoutTower.id, regionId: scoutTower.regionId, sourceType: "tower", troops: 3, distance: 40 },
  { id: towers.TOWERS[1].id, regionId: towers.TOWERS[1].regionId, sourceType: "tower", troops: 2, distance: 35 },
  { id: "city-near", regionId: "region-a", sourceType: "city", troops: 1, distance: 60 },
], { id: "target" }, source => ({ pathLength: source.distance, pathSegments: [{}] }));
assert.equal(routedScout.id, towers.TOWERS[1].id, "The closest authoritative Tower route was not selected across multiple eligible Cities and Towers.");
const cityOriginScout = towers.selectClosestScoutOrigin([
  { id: "city-close", regionId: "region-a", sourceType: "city", troops: 1, distance: 20 },
  { id: scoutTower.id, regionId: scoutTower.regionId, sourceType: "tower", troops: 3, distance: 40 },
], { id: "target" }, source => ({ pathLength: source.distance, pathSegments: [{}] }));
assert.equal(cityOriginScout.id, "city-close", "An owned City with the closest authoritative route was not selected.");
const equalRouteScout = towers.selectClosestScoutOrigin([
  { id: "tower-a", regionId: "region-a", sourceType: "tower", troops: 1 },
  { id: "city-z", regionId: "region-z", sourceType: "city", troops: 1 },
  { id: "city-a", regionId: "region-a", sourceType: "city", troops: 1 },
], { id: "target" }, () => ({ pathLength: 50, pathSegments: [{}] }));
assert.equal(equalRouteScout.id, "city-a", "Equal authoritative routes must resolve City before Tower, then by region and id.");

// Per-player unlimited safe-integer garrisons and own-only withdrawal.
let garrisons = {};
garrisons = towers.addGarrisonTroops(garrisons, "ricky", 7_800);
garrisons = towers.addGarrisonTroops(garrisons, "john", 6_200);
garrisons = towers.addGarrisonTroops(garrisons, "mike", 3_900);
assert.equal(towers.getCombinedGarrisonTroops(garrisons), 17_900);
assert.equal(garrisons.ricky.troops, 7_800, "Conquest survivors must remain attributed by player.");
expectError(() => towers.withdrawGarrisonTroops(garrisons, "john", "ricky", 1), /cannot-withdraw-another/, "A member withdrew another member's troops.");
garrisons = towers.withdrawGarrisonTroops(garrisons, "ricky", "ricky", 800);
assert.equal(garrisons.ricky.troops, 7_000);
const hugeGarrison = towers.addGarrisonTroops({}, "whale", Number.MAX_SAFE_INTEGER - 10);
assert.equal(hugeGarrison.whale.troops, Number.MAX_SAFE_INTEGER - 10, "Tower garrisons must not impose an artificial gameplay cap.");
expectError(() => towers.addGarrisonTroops(hugeGarrison, "whale", 11), /safe-integer range/);

// The first successful Treasury donation locks the raw rate for that UTC day.
const firstDay = "2026-08-22";
const secondDay = "2026-08-23";
const previewAllowance = towers.getDonationAllowanceForUsage({}, 20_000, firstDay);
assert.equal(previewAllowance.locked, false);
assert.equal(previewAllowance.preview, true);
assert.equal(previewAllowance.rawGoldPerHourSnapshot, null);
assert.equal(previewAllowance.previewRawGoldPerHour, 20_000);
assert.equal(previewAllowance.dailyCap, 240_000);
const firstDonation = towers.applyTreasuryDonation({
  usage: {},
  currentRawBaseGoldPerHour: 20_000,
  donationDayUtc: firstDay,
  amount: 100_000,
  personalGold: 500_000,
  treasury: { balance: 700_000, totalDonated: 900_000, totalSpent: 200_000 },
});
assert.deepEqual(firstDonation.usage, {
  donationDayUtc: firstDay,
  rawGoldPerHourSnapshot: 20_000,
  dailyDonationCap: 240_000,
  donatedToday: 100_000,
});
assert.equal(firstDonation.allowance.locked, true);
assert.equal(firstDonation.personalGold, 400_000);
assert.equal(firstDonation.treasury.balance, 800_000);

const afterProductionIncrease = towers.applyTreasuryDonation({
  usage: firstDonation.usage,
  currentRawBaseGoldPerHour: 30_000,
  donationDayUtc: firstDay,
  amount: 20_000,
  personalGold: firstDonation.personalGold,
  treasury: firstDonation.treasury,
});
assert.equal(afterProductionIncrease.usage.rawGoldPerHourSnapshot, 20_000);
assert.equal(afterProductionIncrease.usage.dailyDonationCap, 240_000, "A production increase changed the locked daily cap.");
const afterProductionDecrease = towers.applyTreasuryDonation({
  usage: afterProductionIncrease.usage,
  currentRawBaseGoldPerHour: 10_000,
  donationDayUtc: firstDay,
  amount: 20_000,
  personalGold: afterProductionIncrease.personalGold,
  treasury: afterProductionIncrease.treasury,
});
assert.equal(afterProductionDecrease.usage.rawGoldPerHourSnapshot, 20_000);
assert.equal(afterProductionDecrease.usage.dailyDonationCap, 240_000, "A production decrease changed the locked daily cap.");

const nextDayPreview = towers.getDonationAllowanceForUsage(firstDonation.usage, 32_000, secondDay);
assert.equal(nextDayPreview.locked, false);
assert.equal(nextDayPreview.dailyCap, 384_000, "The prior UTC day's snapshot did not expire.");
const nextDayDonation = towers.applyTreasuryDonation({
  usage: firstDonation.usage,
  currentRawBaseGoldPerHour: 32_000,
  donationDayUtc: secondDay,
  amount: 1,
  personalGold: 500_000,
  treasury: firstDonation.treasury,
});
assert.equal(nextDayDonation.usage.rawGoldPerHourSnapshot, 32_000);
assert.equal(nextDayDonation.usage.dailyDonationCap, 384_000);

const failedUsage = {};
expectError(() => towers.applyTreasuryDonation({
  usage: failedUsage,
  currentRawBaseGoldPerHour: 20_000,
  donationDayUtc: firstDay,
  amount: 240_001,
  personalGold: 500_000,
  treasury: {},
}), /daily-donation-cap-exceeded/);
expectError(() => towers.applyTreasuryDonation({
  usage: failedUsage,
  currentRawBaseGoldPerHour: 20_000,
  donationDayUtc: firstDay,
  amount: 1,
  personalGold: 0,
  treasury: {},
}), /insufficient-personal-gold/);
assert.deepEqual(failedUsage, {}, "A failed donation mutated or established the daily snapshot.");

// Existing economy math keeps every multiplier outside the authoritative raw baseline.
const goldProductionContext = {};
vm.createContext(goldProductionContext);
vm.runInContext(extractFunction(server, "calculateGoldProductionRates"), goldProductionContext);
for (const [label, skillOrGear, strongholdOrCitadel, timedBoost] of [
  ["Gear", 75, 0, 0],
  ["Skills", 35, 0, 0],
  ["Stronghold", 0, 25, 0],
  ["Crown Citadel", 0, 40, 0],
  ["timed boost", 0, 0, 50],
]) {
  assert.equal(
    goldProductionContext.calculateGoldProductionRates(100, skillOrGear, strongholdOrCitadel, timedBoost).baseGoldProductionPerHour,
    100,
    `${label} altered the raw Gold/hour snapshot input.`
  );
}
assert.match(server, /const rawGoldProductionPerHour = stronghold \? 0 : getMillionLordsPassiveGoldPerHour\(level\)/);
assert.match(server, /baseGoldPerHour \+= Math\.max\(0, safeNumber\(stats\.baseGoldProductionPerHour, 0\)\)/);
assert.notEqual(towers.getUtcDateKey(NOW), towers.getUtcDateKey(towers.getNextUtcDayStartMs(NOW)));
assert.deepEqual(towers.MANAGER_ROLES, ["leader", "officer"]);

// Wall purchases are canonical-cost adapters: 5x, sequential fixed ten minutes, max ten, and no level cap.
assert.equal(towers.getEquivalentCityWallCost(12, canonicalCost), 1_200_000);
assert.equal(towers.getTowerWallUpgradeCost(12, canonicalCost), 6_000_000);
assert.equal(towers.getTowerVeilCost(12, canonicalCost), 1_200_000);
const queued = towers.queueWallUpgrades(ownedTower(), 3, 99_000_000, canonicalCost, NOW, "queue-a");
assert.equal(queued.state.upgradeQueue.length, 3);
assert.equal(queued.totalCost, canonicalCost(1) * 5 + canonicalCost(2) * 5 + canonicalCost(3) * 5);
assert.equal(queued.state.upgradeQueue[0].remainingMs, 600_000);
assert.equal(towers.materializeTowerState(queued.state, NOW + 599_999).wallLevel, 1);
const afterOneLevel = towers.materializeTowerState(queued.state, NOW + 600_000);
assert.equal(afterOneLevel.wallLevel, 2);
assert.equal(afterOneLevel.upgradeQueue.length, 2);
assert.equal(towers.materializeTowerState(queued.state, NOW + 1_800_000).wallLevel, 4);
expectError(() => towers.queueWallUpgrades(ownedTower(), 11, Number.MAX_SAFE_INTEGER, () => 1, NOW), /At most 10/);
expectError(() => towers.queueWallUpgrades(ownedTower(undefined, { wallIntegrityBps: 9_999 }), 1, 1_000_000, () => 1, NOW), /tower-wall-damaged/);
const highLevel = towers.queueWallUpgrades(ownedTower(undefined, { wallLevel: 1_000_000 }), 10, 100, () => 1, NOW);
assert.equal(highLevel.state.upgradeQueue.at(-1).targetLevel, 1_000_010, "Tower walls must not have a gameplay level cap.");

// Incoming attacks pause fixed-time construction without refunding or losing the queue.
const partBuilt = towers.materializeTowerState(queued.state, NOW + 200_000);
const attacked = towers.materializeTowerState({ ...partBuilt, incomingRallyIds: ["rally-1"], attackBlocked: true }, NOW + 400_000);
assert.equal(attacked.wallLevel, 1);
assert.equal(attacked.upgradeQueue.length, 3);
assert.equal(attacked.upgradeQueue[0].remainingMs, 200_000);
const stillPaused = towers.materializeTowerState(attacked, NOW + 900_000);
assert.equal(stillPaused.upgradeQueue[0].remainingMs, 200_000);
const resumeStarted = towers.materializeTowerState({ ...stillPaused, incomingRallyIds: [], attackBlocked: false }, NOW + 1_300_000);
const resumed = towers.materializeTowerState(resumeStarted, NOW + 1_500_000);
assert.equal(resumed.wallLevel, 2);
assert.equal(resumed.upgradeQueue.length, 2);
expectError(() => towers.queueWallUpgrades({ ...ownedTower(), incomingRallyIds: ["rally-1"] }, 1, 1_000_000, () => 1, NOW), /tower-under-rally-attack/);

// Paid manual repairs are proportional, use 5x cost, and use only the unmodified base repair window.
const damaged = ownedTower(undefined, { wallLevel: 12, wallIntegrityBps: 5_000 });
assert.equal(towers.getTowerRepairCost(12, 5_000, constantCityCost), 250_000);
assert.equal(towers.materializeTowerState(damaged, NOW + HOUR_MS).repair, null, "Damaged Tower walls must not auto-start repair.");
const repair = towers.startPaidRepair(damaged, 1_000_000, constantCityCost, baseRepairMinutes, { uid: "leader" }, NOW, "repair-a");
assert.equal(repair.cost, 250_000);
assert.equal(repair.state.repair.completeAtMs - NOW, 30 * 60_000);
assert.equal(towers.materializeTowerState(repair.state, NOW + 15 * 60_000).wallIntegrityBps, 7_500);
assert.equal(towers.materializeTowerState(repair.state, NOW + 30 * 60_000).wallIntegrityBps, 10_000);
const repairUnderAttack = towers.materializeTowerState({ ...repair.state, incomingRallyIds: ["rally-1"], attackBlocked: true }, NOW + 15 * 60_000);
assert.equal(repairUnderAttack.wallIntegrityBps, 7_500, "A repair started before an incoming Rally must continue while it approaches.");
expectError(() => towers.startPaidRepair({ ...damaged, incomingRallyIds: ["rally-1"] }, 1_000_000, constantCityCost, baseRepairMinutes, { uid: "officer" }, NOW), /tower-under-rally-attack/);

// Conquest uses the last completed level, destroys the wall and queue, and keeps no refundable queue state.
const builtTower = ownedTower(undefined, { wallLevel: 20, wallIntegrityBps: 8_000, upgradeQueue: queued.state.upgradeQueue });
const captured = towers.conquerTower(builtTower, { id: "clan-blue", name: "Blue Guard", tag: "BLU" }, NOW);
assert.equal(captured.clanId, "clan-blue");
assert.equal(captured.wallLevel, 15);
assert.equal(captured.wallIntegrityBps, 0);
assert.deepEqual(captured.upgradeQueue, []);
assert.equal(captured.repair, null);
assert.equal(captured.veil, null);
assert.equal(towers.conquerTower(ownedTower(undefined, { wallLevel: 5 }), { id: "clan-blue" }, NOW).wallLevel, 1);

// Veil is 10 minutes, 1x canonical cost, max three per Tower per UTC day, independent per Tower, and non-overlapping.
let veiled = ownedTower();
const firstVeil = towers.activateVeil(veiled, 10_000_000, constantCityCost, { uid: "officer" }, NOW, "veil-1");
assert.equal(firstVeil.cost, 100_000);
assert.equal(firstVeil.state.veil.expiresAtMs - NOW, 10 * 60_000);
assert.equal(firstVeil.state.veilUsage.count, 1);
expectError(() => towers.activateVeil(firstVeil.state, 10_000_000, constantCityCost, { uid: "leader" }, NOW + 1), /tower-veil-active/);
veiled = towers.materializeTowerState(firstVeil.state, NOW + 10 * 60_000);
veiled = towers.activateVeil(veiled, 10_000_000, constantCityCost, { uid: "leader" }, NOW + 10 * 60_000, "veil-2").state;
veiled = towers.materializeTowerState(veiled, NOW + 20 * 60_000);
veiled = towers.activateVeil(veiled, 10_000_000, constantCityCost, { uid: "leader" }, NOW + 20 * 60_000, "veil-3").state;
veiled = towers.materializeTowerState(veiled, NOW + 30 * 60_000);
expectError(() => towers.activateVeil(veiled, 10_000_000, constantCityCost, { uid: "leader" }, NOW + 30 * 60_000, "veil-4"), /tower-veil-daily-limit/);
const independentTower = towers.activateVeil(ownedTower(towers.TOWERS[1].id), 10_000_000, constantCityCost, { uid: "leader" }, NOW, "veil-other");
assert.equal(independentTower.state.veilUsage.count, 1);

// Reset/current-world integration: global Tower slots are re-neutralized on a generation
// or shard mismatch, and Treasury documents are generation-scoped beneath the current clan.
const requires = (source, pattern, message) => assert.match(source, pattern, message);
const towerRallyResolver = extractFunction(server, "resolveHoldingTowerRallyById");
const paidRepairExtension = extractFunction(server, "extendHoldingTowerPaidRepair");
requires(server, /function isHoldingTowerWorldActive[\s\S]*?isCoreExpansionTopologyActive\(\)[\s\S]*?HOLDING_TOWERS\.TOWERS\.every[\s\S]*?CORE_STATIC_SERVER_WORLD_MAP_BY_ID\.has/, "Holding Towers are not hard-gated to the active Core Expansion topology and its current static maps.");
requires(server, /function normalizeCurrentHoldingTower[\s\S]*?raw\.worldId[\s\S]*?raw\.resetGeneration[\s\S]*?raw\.realmShardId[\s\S]*?createInitialHoldingTowerState/, "Generation or shard mismatches do not reset a Tower to its neutral current-realm state.");
requires(server, /function clanTreasuryRef[\s\S]*?treasury\/\$\{RESET_GENERATION\}/, "Clan Treasury storage is not reset-generation scoped.");
requires(server, /function reconcileCurrentCoreWorldLayouts[\s\S]*?CORE_PERMANENT_REGION_IDS[\s\S]*?allowExpansionPreparation:\s*true[\s\S]*?maintainGameServer/, "Current Core camp/layout reconciliation is not bounded to active permanent Core maps.");
assert.doesNotMatch(server.slice(server.indexOf("function reconcileCurrentCoreWorldLayouts"), server.indexOf("exports.maintainGameServer")), /LEGACY_SERVER_WORLD_MAP|collectionGroup\(/, "Current Core layout reconciliation can scan inactive or historical worlds.");
requires(server, /function maintainHoldingTowersForCurrentRealm[\s\S]*?normalizeCurrentHoldingTower[\s\S]*?holdingTowerStateWritePatch/, "Scheduled Tower advancement does not enforce the current realm identity.");

// Integration/security invariants: server-only mutation, atomic money, Rally-only attack, reports, and returns.
requires(server, /exports\.donateClanTreasuryGold[\s\S]*?runTransactionWithInfrastructureRetry[\s\S]*?gold:[\s\S]*?balance:[\s\S]*?totalDonated/, "Donation is not an atomic personal-Gold-to-Treasury transaction.");
requires(server, /createPreparedEconomyStatsSnapshot\(economy[\s\S]*?currentRawBaseGoldPerHour = stats\.baseGoldPerHour[\s\S]*?applyTreasuryDonation/, "The first successful donation does not use the authoritative raw-base economy snapshot.");
requires(server, /rawGoldPerHourSnapshot:[\s\S]*?dailyDonationCap:[\s\S]*?donatedToday:/, "The locked UTC donation snapshot is not persisted with its derived cap and usage.");
requires(server, /transaction\.set\(usageRef[\s\S]*?transaction\.set\(treasuryRef|transaction\.set\(treasuryRef[\s\S]*?transaction\.set\(usageRef/, "Treasury usage and balance are not written in the same transaction.");
requires(server, /exports\.sendArmyOrder[\s\S]*?order\.targetType === "tower"[\s\S]*?only be attacked through a qualifying Clan Rally/, "Solo attacks can target a Holding Tower.");
requires(server, /function launchAutomaticScoutOrder[\s\S]*?getEligibleScoutTowerOrigins[\s\S]*?selectClosestScoutOrigin[\s\S]*?buildServerGeneratedArmyRoute/, "Normal scouts do not use the shared authoritative City/Tower origin resolver.");
requires(server, /exports\.sendArmyOrder[\s\S]*?order\.kind === "scout"[\s\S]*?launchAutomaticScoutOrder/, "The canonical Scout action does not invoke automatic origin selection.");
requires(server, /source\.sourceType === "tower"[\s\S]*?transaction\.delete\(source\.garrisonRef\)|source\.sourceType === "tower"[\s\S]*?transaction\.set\(source\.garrisonRef/, "Tower-origin scouts do not consume the player's own garrison troop transactionally.");
requires(server, /exports\.launchClanRally[\s\S]*?validateTowerRallyParticipants[\s\S]*?immediately|exports\.launchClanRally[\s\S]*?validateTowerRallyParticipants/, "Tower Rally eligibility is not revalidated at launch.");
requires(server, /towerDefenderMembersSnap[\s\S]*?Holding Tower under Rally attack[\s\S]*?queueIncomingArmyNotification/, "Owning-clan members are not notified when a Rally launches against their Tower.");
requires(server, /applyHoldingTowerTreasurySpend[\s\S]*?assertHoldingTowerManager/, "Tower Treasury spending does not enforce the canonical leader/officer role.");
requires(server, /exports\.startHoldingTowerRepair[\s\S]*?applyHoldingTowerTreasurySpend/, "Tower repairs bypass the shared authoritative spending transaction.");
requires(paidRepairExtension, /startIntegrityBps: endingIntegrityBps[\s\S]*?startedAtMs: nowMs[\s\S]*?timestampToMs\(tower\.repair\.completeAtMs\)[\s\S]*?\+ addedMs/, "A paid Tower repair does not preserve and extend its active trajectory after battle damage.");
requires(server, /exports\.queueHoldingTowerWallUpgrades[\s\S]*?applyHoldingTowerTreasurySpend/, "Tower upgrades bypass the shared authoritative spending transaction.");
requires(server, /exports\.activateHoldingTowerVeil[\s\S]*?applyHoldingTowerTreasurySpend/, "Veil bypasses the shared authoritative spending transaction.");
requires(server, /resolveHoldingTowerDirectMovementById[\s\S]*?Veil of Silence[\s\S]*?intelligence could not be obtained/i, "Veil does not block scout intelligence at resolution.");
requires(server, /resolveHoldingTowerRallyById[\s\S]*?calculateCombatResult[\s\S]*?allocateDefenderLosses[\s\S]*?allocateRallyAttackerLosses/, "Tower battles do not reuse canonical combat and casualty allocation.");
requires(server, /resolveHoldingTowerRallyById[\s\S]*?liveParticipantProfiles[\s\S]*?getRallyAttackPackages\(rally, liveParticipantProfiles\)/, "Tower Rally arrivals do not recalculate participant combat packages from live authoritative profiles.");
assert.doesNotMatch(towerRallyResolver, /prepareEconomyCollection\(/, "Tower Rally resolution performs every participant's full economy settlement in one transaction.");
requires(towerRallyResolver, /receiptKind: "holding_tower_rally_battle"[\s\S]*?rallyParticipants:[\s\S]*?receiptKind: "holding_tower_defense"/, "Tower battle outcomes are not split into scalable, personally attributed settlement receipts.");
requires(towerRallyResolver, /releaseActiveRallySlot\([\s\S]*?rallyStateRef/, "A resolved Tower Rally does not release its clan active-Rally slot.");
requires(server, /function settleRallyBattleReceipt[\s\S]*?holdingTowerBattle[\s\S]*?holdingTowerGarrisonRef[\s\S]*?commitmentSettledAtBattle/, "Tower Rally survivor settlement is not integrated with the canonical Rally receipt path.");
requires(server, /function settleReinforcementBattleReceipt[\s\S]*?holdingTowerDefense[\s\S]*?Holding Tower/, "Tower garrison defenders do not receive asynchronous battle progression and reports.");
requires(server, /garrisonSnap\.docs[\s\S]*?filter\(doc => isCurrentHoldingTowerGarrison/, "Tower conquest can delete a historical or inactive-realm garrison document.");
requires(server, /returnDepartingHoldingTowerGarrisons[\s\S]*?getOwnedMainCityDestination[\s\S]*?createRallyReturnMovement[\s\S]*?transaction\.delete\(garrisonSnap\.ref\)/, "Clan departure does not safely return stationed Tower troops.");
requires(server, /resetClanHoldingTowers[\s\S]*?createInitialHoldingTowerState[\s\S]*?transaction\.delete\(treasuryRef\)/, "Clan disband does not neutralize Towers and remove Treasury.");
requires(rules, /match \/holdingTowers\/\{towerId\}[\s\S]*?allow create, update, delete: if false[\s\S]*?match \/garrison\/\{uid\}/, "Tower documents are not server-owned in Firestore Rules.");
requires(rules, /match \/treasury\/\{resetId\}[\s\S]*?allow create, update, delete: if false[\s\S]*?match \/treasuryReceipts\/\{receiptId\}[\s\S]*?allow read, create, update, delete: if false/, "Clan Treasury or receipt documents are not server-owned in Firestore Rules.");
requires(read("functions/test/emulator-holding-tower-rules.js"), /Treasury privacy[\s\S]*?garrison secrecy[\s\S]*?server-only writes/, "Holding Tower Firestore security is not exercised by the emulator suite.");
requires(read("functions/test/emulator-holding-tower-donation-concurrency.js"), /simultaneous first donations[\s\S]*?allowance race[\s\S]*?Gold race/i, "Holding Tower donation races are not exercised by the emulator suite.");

for (const tower of towers.TOWERS) {
  requires(client, new RegExp(`${tower.id}[\\s\\S]*?${tower.name}`), `${tower.name} is missing from the immutable client visual definitions.`);
}
assert.doesNotMatch(server, /holdingTower[\s\S]{0,80}(productionBonus|attackBonus|marchBonus|xpBonus|territoryBonus)/i, "A forbidden passive Holding Tower bonus was introduced.");
requires(firebaseClient, /getHoldingTowerState[\s\S]*?getClanTreasuryStatus[\s\S]*?donateClanTreasuryGold/, "Holding Tower client callable wrappers are incomplete.");
requires(client, /holding-tower-node[\s\S]*?openHoldingTower/, "The approved Tower art is not interactive.");
requires(holdingTowerStyles, /\.holding-tower-node\s*\{[\s\S]*?position:\s*absolute[\s\S]*?width:\s*var\(--holding-tower-width[\s\S]*?pointer-events:\s*auto/, "Holding Tower markers are not positioned, sized, and interactive on the map.");
requires(holdingTowerStyles, /\.holding-tower-art\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%[\s\S]*?object-fit:\s*contain/, "Holding Tower art does not fill its map marker.");
requires(holdingTowerStyles, /\.holding-tower-map-label\s*\{[\s\S]*?position:\s*absolute[\s\S]*?white-space:\s*nowrap/, "Holding Tower map labels are not anchored to their markers.");
requires(client, /function scoutTarget[\s\S]*?usesServerArmyAuthority\(\)[\s\S]*?launchAutomaticServerScout/, "The normal Scout action does not use the target-only automatic server flow.");
requires(client, /async function ensureRegionDefinitionLoaded[\s\S]*?refreshWorldCampSlotsForRegion\(normalizedRegionId\)[\s\S]*?refreshWorldHoldingTowerSlotsForRegion\(normalizedRegionId\)/, "Lazy Core map loading does not refresh Camp and Holding Tower markers for the active map.");
requires(client, /function refreshWorldHoldingTowerSlotsForRegion[\s\S]*?WORLD_HOLDING_TOWERS\.splice[\s\S]*?WORLD_HOLDING_TOWERS\.push/, "Holding Tower refresh can leave stale or missing markers after a lazy map load.");
assert.doesNotMatch(client, /scout-from|Scout from Tower/, "A manual Tower scout-origin selector remains in the client.");
assert.doesNotMatch(holdingTowerUi, /scout-from|Scout from Tower/, "The dedicated Scout From Tower button remains in the Tower panel.");
requires(holdingTowerUi, /function createQaSnapshot[\s\S]*?Wall Upgrades/, "The split Holding Tower QA/queue renderer is incomplete.");
requires(holdingTowerUi, /function renderPanel[\s\S]*?Veil of Silence/, "The split Holding Tower panel renderer is incomplete.");
requires(holdingTowerStyles, /holding-tower-modal[\s\S]*?var\(--manuscript-ink\)[\s\S]*?var\(--manuscript-paper-surface\)[\s\S]*?var\(--manuscript-button-primary\)[\s\S]*?var\(--cl-ivory\)/, "The final Tower layer does not reuse the Profile manuscript palette and ivory action labels.");
assert.doesNotMatch(holdingTowerStyles, /\.holding-tower-(?:modal|vitals|veil-card|upgrade-copy|queued-levels):is\(/, "A Holding Tower descendant :is() selector was compacted into a non-matching compound selector.");
requires(holdingTowerUi, /data-tower-action="repair"[^>]*class="[^"]*move-action|class="[^"]*move-action[^>]*data-tower-action="repair"/, "Start Repair does not preserve the existing green move-action treatment.");
requires(holdingTowerUi, /data-tower-action="veil"[^>]*class="[^"]*secondary|class="[^"]*secondary[^>]*data-tower-action="veil"/, "Veil of Silence does not preserve the existing blue secondary treatment.");
requires(client, /Treasury Balance[\s\S]*?Daily Donation Allowance[\s\S]*?Remaining Today[\s\S]*?Total Donated[\s\S]*?Total Spent/, "The Clan Treasury does not present the five required readable metrics.");

console.log("Validated Holding Tower current-realm activation, automatic scout origins, neutral/reset state, probation, Rally gate, attributed garrisons, Treasury formulas, walls, repairs, conquest, Veil, security, camp reconciliation, and client integration.");
