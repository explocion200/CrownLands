"use strict";
const assert = require("node:assert/strict");
const E = require("../functions/estate-economy");
const F = require("../functions/guild-facilities");
function estate(level = 100) {
  const state = E.initial(0);
  for (const key in state.levels) state.levels[key] = level;
  for (const key in state.stock) state.stock[key] = 10000;
  F.normalize(state);
  return state;
}
const costs = [
  [1, 72, {}, 600000], [10, 143, { timber: 27, stone: 49 }, E.HOUR],
  [25, 285, { planks: 39, stone: 194 }, 4 * E.HOUR],
  [50, 570, { planks: 142, iron: 107 }, 12 * E.HOUR],
  [75, 1140, { iron: 309, tools: 103 }, 24 * E.HOUR],
];
for (const room of Object.keys(F.ROOMS)) {
  const s = estate();
  for (let i = 0; i < 5; i++) {
    const [guild, gold, materials, duration] = costs[i];
    s.levels["guild-master"] = guild;
    const q = F.roomQuote(s, room, 285);
    assert.equal(q.target, i + 1);
    assert.equal(q.gold, gold);
    assert.equal(q.requiredGuildLevel, guild);
    assert.deepEqual(q.materials, materials);
    assert.equal(q.durationMs, duration);
    const stock = structuredClone(s.stock), now = 29 * 24 * E.HOUR;
    F.startRoom(s, q, room + "_room_" + i, now);
    for (const key in stock) assert.equal(s.stock[key], stock[key] - (materials[key] || 0));
    assert.throws(() => F.roomQuote(s, "archive", 285), /Finish/);
    assert.equal(s.jobs.length, 0, "Room work has its own slot, not a construction queue");
    assert.equal(F.settle(s, now + duration - 1), null);
    assert.equal(s.guild.rooms[room], i, "Room benefit cannot arrive early");
    // Later building growth, economy rates and a season boundary cannot alter an accepted timer or bill.
    s.levels["guild-master"] = 100;
    s.levels["builders-yard"] = 100;
    const persisted = E.normalize(JSON.parse(JSON.stringify(s)), now + duration + 30 * 24 * E.HOUR);
    const complete = F.settle(persisted, now + duration + 30 * 24 * E.HOUR);
    assert.equal(complete.completedAtMs, now + duration);
    assert.equal(complete.gold, gold);
    assert.deepEqual(complete.materials, materials);
    assert.equal(persisted.guild.rooms[room], i + 1);
    assert.equal(F.settle(persisted, now + duration + 31 * 24 * E.HOUR), null, "Repeated reads cannot complete twice");
    s.guild = persisted.guild;
  }
  assert.throws(() => F.roomQuote(s, room, 285), /maximum/);
}
{
  const s = estate(0);
  assert.throws(() => F.roomQuote(s, "planning", 285), /Construct the Guild/);
  s.levels["guild-master"] = 1;
  assert.equal(F.roomQuote(s, "planning", 285).gold, 72, "First room improvement needs only Gold");
  s.guild.rooms.planning = 1;
  assert.throws(() => F.roomQuote(s, "planning", 285), /Level 10/);
  s.levels["guild-master"] = 10;
  assert.throws(() => F.roomQuote(s, "planning", 285), /production chain/);
  s.levels["foresters-lodge"] = 1; s.levels.quarry = 1;
  const q = F.roomQuote(s, "planning", 285);
  s.stock.stone = 0;
  const before = structuredClone(s);
  assert.throws(() => F.startRoom(s, q, "room_payment_1", 0), /Not enough stone/);
  assert.deepEqual(s, before, "Failed material validation cannot debit another resource or start a timer");
  assert.throws(() => F.roomQuote(s, "__proto__", 285), /Choose a Guild room/);
  assert.throws(() => F.roomQuote(s, "planning", NaN), /unavailable/);
  assert.throws(() => F.roomQuote(s, "planning", Infinity), /unavailable/);
}
{
  const s = estate(), legacy = E.initial(0);
  legacy.quests = [{ id: "legacy_accepted", training: [{ id: "champion_old", result: { level: 60, xp: 19 } }], recoveryMs: 900000, completesAtMs: 5000000 }];
  legacy.parcels = [{ id: "legacy_parcel", rewards: { timber: 7 } }];
  legacy.jobs = [{ id: "legacy_paid", building: "great-hall", target: 2 }];
  const existing = JSON.stringify(legacy);
  F.normalize(legacy); const { guild, ...rest } = legacy;
  assert.equal(JSON.stringify(rest), existing, "Facility migration never edits legacy quest terms, parcels, paid jobs or stock");
  assert.deepEqual(F.normalize(legacy), guild);
  const bad = structuredClone(s); bad.guild.schemaVersion = 9;
  assert.throws(() => F.normalize(bad), /compatible/);
  assert.equal(bad.guild.schemaVersion, 9, "Unknown versions fail without resetting permanent data");
}
const members = {
  champion_veteran: { id: "champion_veteran", level: 12, xp: 3, questId: "", recoveryUntilMs: 0 },
  champion_pupil: { id: "champion_pupil", level: 7, xp: 2, questId: "", recoveryUntilMs: 0 },
  champion_other: { id: "champion_other", level: 1, xp: 0, questId: "", recoveryUntilMs: 0 },
};
{
  const s = estate(1), input = { name: "Road watchers", championIds: ["champion_veteran", "champion_pupil"], leaderId: "champion_pupil" };
  for (let i = 0; i < 3; i++) F.saveParty(s, F.partyQuote(s, input, members), "party_saved_" + i);
  assert.throws(() => F.partyQuote(s, input, members), /slots are full/);
  F.saveParty(s, F.partyQuote(s, { ...input, partyId: "party_saved_1", name: "Revised watch" }, members), "unused_receipt");
  assert.equal(s.guild.savedParties.length, 3);
  assert.equal(s.guild.savedParties[1].name, "Revised watch");
  assert.equal(s.guild.savedParties[1].id, "party_saved_1");
  F.saveParty(s, F.partyQuote(s, { partyId: "party_saved_0", remove: true }, {}), "unused_receipt");
  assert.equal(s.guild.savedParties.length, 2);
  assert.throws(() => F.partyQuote(s, { ...input, leaderId: "champion_other" }, members), /leader/);
  assert.throws(() => F.partyQuote(s, { ...input, championIds: ["champion_stranger"] }, members), /owned/);
  assert.throws(() => F.partyQuote(s, { ...input, championIds: ["champion_pupil", "champion_pupil"] }, members), /different/);
  assert.throws(() => F.partyQuote(s, { ...input, name: "x".repeat(37) }, members), /name/);
  assert.throws(() => F.partyQuote(s, { ...input, championIds: Object.keys(members) }, members), /one to 2/);
  s.guild.rooms.planning = 5; s.levels["guild-master"] = 50;
  for (let i = 0; i < 6; i++) F.saveParty(s, F.partyQuote(s, { ...input, championIds: Object.keys(members) }, members), "more_party_" + i);
  assert.equal(s.guild.savedParties.length, 8);
  assert.throws(() => F.partyQuote(s, input, members), /slots are full/);
}
{
  const s = estate(), input = { mentorId: "champion_veteran", pupilId: "champion_pupil" };
  s.activeChampionIds = Object.keys(members);
  assert.throws(() => F.mentoringQuote(s, input, members, 100), /Training area/);
  s.guild.rooms.training = 1;
  F.assignMentor(s, F.mentoringQuote(s, input, members, 100));
  assert.equal(s.guild.mentoring.mentorId, input.mentorId);
  assert.equal(F.busyMentor(s, input.mentorId, 100), false, "Idle assignment remains editable");
  s.guild.mentoring.busyUntilMs = 1000;
  assert.equal(F.busyMentor(s, input.mentorId, 999), true);
  assert.equal(F.busyMentor(s, input.mentorId, 1000), false);
  assert.throws(() => F.mentoringQuote(s, { clear: true }, members, 999), /accepted mission/);
  F.assignMentor(s, F.mentoringQuote(s, { clear: true }, members, 1000));
  assert.equal(s.guild.mentoring, null);
  assert.throws(() => F.mentoringQuote(s, { mentorId: "champion_pupil", pupilId: "champion_other" }, members, 100), /Level 10/);
  assert.throws(() => F.mentoringQuote(s, input, { ...members, champion_pupil: { ...members.champion_pupil, level: 8 } }, 100), /five levels/);
  assert.throws(() => F.mentoringQuote(s, input, { ...members, champion_veteran: { ...members.champion_veteran, recoveryUntilMs: 101 } }, 100), /ready/);
  assert.throws(() => F.mentoringQuote(s, input, { ...members, champion_veteran: { ...members.champion_veteran, questId: "accepted_quest" } }, 100), /ready/);
  s.activeChampionIds = ["champion_pupil"];
  assert.throws(() => F.mentoringQuote(s, input, members, 100), /active roster/);
}
console.log("Guild facilities passed: all 25 bills, fixed timers, migration preservation, independent slot, atomic material validation, saved-party capacity/ownership and mentor eligibility/locks.");
