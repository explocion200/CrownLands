"use strict";
// Approved Group 3 rules. Mission and champion balance belongs to its separately
// versioned ruleset; facilities never rewrite accepted expedition terms.
const E = require("./estate-economy");
const VERSION = "guild-facilities-1";
const ROOMS = Object.freeze({
  contracts: "Contract board", planning: "Planning table", infirmary: "Infirmary",
  training: "Training area", archive: "Archive",
});
const GUILD_LEVELS = [1, 10, 25, 50, 75];
const GOLD_HOURS = [.25, .5, 1, 2, 4];
const MATERIAL_HOURS = [0, .5, 1, 2, 4];
const MATERIALS = [[], ["timber", "stone"], ["planks", "stone"], ["planks", "iron"], ["iron", "tools"]];
const DURATIONS = [10 * 60000, E.HOUR, 4 * E.HOUR, 12 * E.HOUR, 24 * E.HOUR];
const REPUTATION_MILESTONES = [1, 10, 30, 60, 100];
const own = (object, key) => typeof key === "string" && Object.hasOwn(object, key);
const plain = value => value && typeof value === "object" && !Array.isArray(value);
function championId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,96}$/.test(value)) E.fail("Choose an owned champion.", "invalid-argument");
  return value;
}
function normalize(state) {
  if (state.guild === undefined) state.guild = {
    schemaVersion: 1, rooms: Object.fromEntries(Object.keys(ROOMS).map(room => [room, 0])),
    roomJob: null, savedParties: [], mentoring: null,
  };
  const guild = state.guild;
  if (!plain(guild) || guild.schemaVersion !== 1 || !plain(guild.rooms)) E.fail("This Guild needs a compatible server update.");
  for (const room of Object.keys(ROOMS)) E.integer(guild.rooms[room], 0, 5, "Invalid saved Guild room level.");
  if (!Array.isArray(guild.savedParties) || guild.savedParties.length > 8) E.fail("Invalid saved Guild parties.");
  if (guild.roomJob !== null) {
    const job = guild.roomJob;
    if (!plain(job) || job.version !== VERSION || !own(ROOMS, job.room)) E.fail("This Guild improvement needs a compatible server update.");
    E.integer(job.target, 1, 5, "Invalid Guild improvement level.");
    E.integer(job.startedAtMs, 0, Number.MAX_SAFE_INTEGER, "Invalid Guild improvement start.");
    E.integer(job.completesAtMs, job.startedAtMs + 1, Number.MAX_SAFE_INTEGER, "Invalid Guild improvement deadline.");
    if (guild.rooms[job.room] !== job.target - 1) E.fail("This Guild improvement needs reconciliation.");
  }
  if (guild.mentoring !== null) {
    const assignment = guild.mentoring;
    if (!plain(assignment)) E.fail("Invalid Guild mentoring assignment.");
    championId(assignment.mentorId); championId(assignment.pupilId);
    E.integer(assignment.busyUntilMs, 0, Number.MAX_SAFE_INTEGER, "Invalid mentoring deadline.");
  }
  return guild;
}
function requireGuild(state) {
  const guild = normalize(state);
  if (!state.levels["guild-master"]) E.fail("Construct the Guild Master first.");
  return guild;
}
function settle(state, now) {
  const guild = normalize(state), job = guild.roomJob;
  if (!job || job.completesAtMs > now) return null;
  guild.rooms[job.room] = job.target;
  guild.roomJob = null;
  return { ...job, completedAtMs: job.completesAtMs };
}
function benefit(room, level) {
  switch (room) {
    case "contracts": return level + " additional client contracts, subject to reputation";
    case "planning": return (3 + level) + " saved party slots";
    case "infirmary": return (7 * level) + "% shorter recovery; protects any higher legacy benefit";
    case "training": return level ? (5 * level) + "% mission XP for one mentored pupil" : "Improve to Level 1 to unlock mentoring";
    case "archive": return level + " discovery chapters, subject to Guild reputation";
    default: E.fail("Choose a Guild room.", "invalid-argument");
  }
}
function bill(state, room, rawGoldRate) {
  const guild = requireGuild(state);
  if (!own(ROOMS, room)) E.fail("Choose a Guild room.", "invalid-argument");
  const level = guild.rooms[room], target = level + 1, index = target - 1;
  if (target > 5) E.fail("This room is already at its maximum level.");
  if (!Number.isFinite(rawGoldRate) || rawGoldRate < 0) E.fail("The Main City Gold rate is unavailable.");
  const rates = E.referenceRates(GUILD_LEVELS[index]);
  const materials = Object.fromEntries(MATERIALS[index].map(key => [key, Math.ceil(rates[key] * MATERIAL_HOURS[index] / 2)]));
  const gold = Math.ceil(rawGoldRate * GOLD_HOURS[index]);
  E.integer(gold, 0, Number.MAX_SAFE_INTEGER, "Invalid Guild improvement price.");
  return { action: "guildRoom", version: VERSION, room, target, requiredGuildLevel: GUILD_LEVELS[index],
    gold, materials, durationMs: DURATIONS[index], currentBenefit: benefit(room, level), nextBenefit: benefit(room, target) };
}
function roomQuote(state, room, rawGoldRate) {
  const value = bill(state, room, rawGoldRate);
  if (state.guild.roomJob) E.fail("Finish the current Guild improvement first. Only one room can improve at a time.");
  if (state.levels["guild-master"] < value.requiredGuildLevel) E.fail("Upgrade the Guild Master to Level " + value.requiredGuildLevel + " first.");
  for (const key of Object.keys(value.materials)) if (!E.chainLevel(state, key)) E.fail("Construct the complete " + key + " production chain first.");
  return value;
}
function startRoom(state, value, id, now) {
  const guild = requireGuild(state);
  if (value.version !== VERSION || !own(ROOMS, value.room) || value.target !== guild.rooms[value.room] + 1)
    E.fail("Review a fresh Guild improvement quote.");
  if (guild.roomJob) E.fail("A Guild improvement is already running.");
  E.spend(state, value.materials);
  guild.roomJob = { ...structuredClone(value), id, startedAtMs: now, completesAtMs: now + value.durationMs };
  return guild.roomJob;
}
function partyQuote(state, input, champions) {
  const guild = requireGuild(state);
  const previous = input.partyId ? guild.savedParties.find(party => party.id === input.partyId) : null;
  if (input.partyId && !previous) E.fail("That saved party no longer exists.");
  if (input.remove === true) {
    if (!previous) E.fail("Choose a saved party to remove.");
    return { action: "guildParty", partyId: previous.id, remove: true };
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 36 || /[\u0000-\u001f\u007f]/.test(name)) E.fail("Give this party a name of 1–36 characters.", "invalid-argument");
  const ids = input.championIds, max = state.levels["guild-master"] >= 50 ? 4 : state.levels["guild-master"] >= 25 ? 3 : 2;
  if (!Array.isArray(ids) || !ids.length || ids.length > max || new Set(ids).size !== ids.length) E.fail("Choose one to " + max + " different owned members.");
  for (const id of ids) if (!champions[championId(id)] || champions[id].id !== id) E.fail("Choose owned champions for this party.");
  if (!ids.includes(input.leaderId)) E.fail("Choose a leader from this party.");
  if (!previous && guild.savedParties.length >= 3 + guild.rooms.planning) E.fail("Your saved party slots are full. Replace a party or improve the Planning table.");
  return { action: "guildParty", partyId: previous?.id || "", name, championIds: [...ids], leaderId: input.leaderId };
}
function saveParty(state, value, id) {
  const guild = requireGuild(state), index = guild.savedParties.findIndex(party => party.id === value.partyId);
  if (value.remove) { if (index < 0) E.fail("That saved party no longer exists."); guild.savedParties.splice(index, 1); return; }
  const party = { id: value.partyId || id, name: value.name, championIds: [...value.championIds], leaderId: value.leaderId };
  if (index >= 0) guild.savedParties[index] = party; else guild.savedParties.push(party);
}
function busyMentor(state, id, now) {
  const assignment = state.guild?.mentoring;
  return assignment?.mentorId === id && assignment.busyUntilMs > now;
}
function mentoringQuote(state, input, champions, now) {
  const guild = requireGuild(state);
  if (guild.mentoring?.busyUntilMs > now) E.fail("Your mentor is supporting an accepted mission. Wait for its finish.");
  if (input.clear === true) return { action: "guildMentor", clear: true };
  if (!guild.rooms.training) E.fail("Improve the Training area to Level 1 first.");
  const mentor = champions[championId(input.mentorId)], pupil = champions[championId(input.pupilId)];
  if (!mentor || !pupil || mentor.id === pupil.id) E.fail("Choose two different owned members.");
  if (mentor.level < 10 || mentor.level < pupil.level + 5) E.fail("The mentor must be Level 10 or higher and at least five levels above the pupil.");
  for (const member of [mentor, pupil]) {
    if (member.questId || member.recoveryUntilMs > now || !state.activeChampionIds.includes(member.id))
      E.fail("Both members must be ready and in the active roster.");
  }
  return { action: "guildMentor", mentorId: mentor.id, pupilId: pupil.id };
}
function assignMentor(state, value) {
  requireGuild(state).mentoring = value.clear ? null : { mentorId: value.mentorId, pupilId: value.pupilId, busyUntilMs: 0 };
}
function overview(state, goldRate) {
  const guild = normalize(state);
  return Object.fromEntries(Object.keys(ROOMS).map(room => {
    const level = guild.rooms[room], value = state.levels["guild-master"] && level < 5 ? bill(state, room, goldRate) : null;
    const blockers = [];
    if (!state.levels["guild-master"]) blockers.push("Construct the Guild Master first.");
    if (guild.roomJob) blockers.push("Another Guild improvement is running.");
    if (value && state.levels["guild-master"] < value.requiredGuildLevel) blockers.push("Guild Master Level " + value.requiredGuildLevel + " required.");
    if (value) for (const key of Object.keys(value.materials)) if (!E.chainLevel(state, key)) blockers.push("Construct the " + key + " production chain.");
    return [room, { name: ROOMS[room], level, benefit: benefit(room, level), bill: value, blockers }];
  }));
}
module.exports = { VERSION, ROOMS, GUILD_LEVELS, GOLD_HOURS, MATERIAL_HOURS, MATERIALS, DURATIONS, REPUTATION_MILESTONES,
  normalize, requireGuild, settle, benefit, bill, roomQuote, startRoom, partyQuote, saveParty, busyMentor, mentoringQuote, assignMentor, overview };
