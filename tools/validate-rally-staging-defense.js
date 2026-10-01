"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const staging = require("../functions/rally-staging");
const server = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
const functions = (start, end) => server.slice(server.indexOf(`function ${start}(`), server.indexOf(`function ${end}(`));
const context = vm.createContext({ Math, Map, Number, Array,
  safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
});
vm.runInContext(functions("allocateDefenderLosses", "allocateDefenseXp"), context);
const allocate = context.allocateDefenderLosses;
const ready = [
  { id: "r1_owner", rallyId: "r1", ownerUid: "owner", troops: 80 },
  { id: "r2_owner", rallyId: "r2", ownerUid: "owner", troops: 20 },
  { id: "r1_ally", rallyId: "r1", ownerUid: "ally", troops: 70 },
  { id: "r2_ally", rallyId: "r2", ownerUid: "ally", troops: 30 },
  { id: "r1_other", rallyId: "r1", ownerUid: "other", troops: 20 },
];
const groups = staging.groupDefenders([{ id: "regular", ownerUid: "ally", troops: 50 }], ready, "owner");
assert.equal(groups.ownerTroops, 100);
assert.equal(groups.contributions.length, 2, "One defensive package per allied ruler");
assert.equal(groups.contributions.find(row => row.ownerUid === "ally").troops, 150);
for (let losses = 0; losses <= 370; losses++) {
  const result = staging.splitLosses(allocate(200, groups.contributions, losses), groups, allocate);
  assert.equal(result.ownerStart, 200, "Battle reporting includes the owner's staged troops");
  const ordinarySurvivors = result.ownerRemaining + result.alliedRemaining;
  const rallySurvivors = result.staged.reduce((sum, row) => sum + row.remaining, 0);
  assert.equal(ordinarySurvivors + rallySurvivors + losses, 370, "Every troop is either alive once or lost once");
  assert(result.ownerRemaining <= 100 && result.alliedRemaining <= 50, "Reserved troops cannot become spendable garrison");
  assert.equal(result.staged.reduce((sum, row) => sum + row.losses, 0)
    + result.ownerGarrisonLosses + result.contributions.reduce((sum, row) => sum + row.garrisonLosses, 0), losses);
  const repeat = staging.splitLosses(allocate(200, groups.contributions, losses), groups, allocate);
  assert.deepEqual(result, repeat, "Whole troop rounding is deterministic");
}
const ordinary = staging.groupDefenders([{ id: "regular", ownerUid: "ally", troops: 50 }], [], "owner");
const before = allocate(100, ordinary.contributions, 75);
const after = staging.splitLosses(before, ordinary, allocate);
for (const key of ["ownerStart", "ownerLosses", "ownerRemaining", "alliedStart", "alliedLosses", "alliedRemaining"]) {
  assert.equal(after[key], before[key], `Unstaged defense preserves ${key}`);
}
const tower = staging.groupDefenders([{ id: "owner", ownerUid: "owner", troops: 100 }], ready);
const towerLoss = staging.splitLosses(allocate(0, tower.contributions, 80), tower, allocate);
assert.equal(towerLoss.contributions.length, 3);
assert.equal(towerLoss.staged.length, 5);
assert.equal(towerLoss.contributions.reduce((sum, row) => sum + row.remaining, 0), 240);

const stagingRead = server.slice(server.indexOf("async function readRallyStagingDefense"), server.indexOf("function rallyStagingCombatTarget"));
assert.match(stagingRead, /scopeQueryToCurrentRealmShard[\s\S]*RESET_GENERATION[\s\S]*ONLINE_WORLD_ID/);
assert.match(stagingRead, /RALLY_STATUS_FORMING[\s\S]*assemblyType === targetType[\s\S]*assemblyCityId === target.id/);
assert.match(stagingRead, /assembledRallyParticipants\(rally\)/, "Only arrived troops defend");
const launch = server.slice(server.indexOf("exports.launchClanRally"), server.indexOf("exports.previewArmyProtection"));
assert.match(launch, /assembledParticipants.length < minimumParticipants/);
assert.doesNotMatch(launch, /unreadyParticipants|All participants must be Ready/);
assert(launch.indexOf("transaction.get(canonicalArmyRef(participant.joinArmyId))") < launch.indexOf("inboundReturns.forEach"));
assert.match(launch, /rally_launched_before_arrival/);
assert.match(launch, /rally.status === RALLY_STATUS_LAUNCHED[\s\S]*duplicate: true/);
assert.match(server, /writeRallyStagingDefenseSettlement[\s\S]*rally_assembly_defeated/);
assert.match(server, /committedRallyTroops: Math.max\(0, getProfileCommittedRallyTroops\(profile\) - losses\)/);
console.log("Rally staging: all integer casualty splits, multiple rallies, ownership, Tower packages and atomic launch guards passed.");
