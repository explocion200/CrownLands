"use strict";
const crypto = require("node:crypto");
const E = require("./estate-economy"), S = require("./estate-services"), F = require("./guild-facilities");
const C = require("./guild-config"), R = require("./guild-rules"), G = require("./common-gear");
const VERSION = C.version;
const OUTCOMES = ["success", "partial", "failure"];
const CHAPTERS = ["The empty watchtower", "Names beneath the seal", "The northern crossing", "The keeper's promise", "A road remembered"];
const CLIENT_CONTRACTS = [
  ["escort", "The Miller's winter convoy"], ["timber", "The Foresters' hidden route"],
  ["muster", "Alderwick's second muster"], ["workshop", "The Company's masterwork"], ["ledger", "The Archivist's last seal"],
];
function initialize(state) {
  const guild = F.normalize(state);
  if (guild.missionVersion === undefined) Object.assign(guild, {
    missionVersion: 2, legacyRecoveryReduction: .35 * Math.max(0, state.levels.alehouse - 1) / 99,
    missions: [], rewards: [], reputation: 0, clientReputation: {}, discoveries: [], storyChoices: {},
    introductionStarted: false, gearAvailableAtMs: 0, usage: { day: "", gold: 0, troops: 0 }, recentReports: [],
  });
  if (guild.missionVersion !== 2 || !Array.isArray(guild.missions) || !Array.isArray(guild.rewards)) E.fail("This Guild needs a compatible mission server.");
  return guild;
}
function identity(record, { offer = false, promisedLevel = 0, random = crypto.randomInt } = {}) {
  if (record.guildVersion === 2) return record;
  const type = Object.keys(C.types)[random(Object.keys(C.types).length)], pool = C.portraits.filter(p => p.type === type);
  const face = pool[random(pool.length)], traits = Object.keys(C.traits);
  return { ...record, guildVersion: 2, type, name: offer ? face.name : record.name,
    portraitId: record.quality === 0 ? face.id : type,
    base: C.types[type].base.map(center => center + random(5) - 2), trait: traits[random(traits.length)],
    protectedCeiling: Math.max(C.ceilings[record.quality], record.level, promisedLevel), matchingSuccesses: 0, ambitions: [], history: [] };
}
function migrate(state, champions) {
  initialize(state);
  for (const [id, member] of Object.entries(champions)) {
    const promisedLevel = Math.max(0, ...state.quests.map(q => q.training?.[id]?.champion?.level || 0));
    champions[id] = identity(member, { promisedLevel });
  }
  for (let i = 0; i < (state.recruitOffers?.offers?.length || 0); i++) state.recruitOffers.offers[i] = identity(state.recruitOffers.offers[i], { offer: true });
}
function catalogue(state) {
  const guild = initialize(state), missions = C.missions.map(m => ({ ...m, available: true, reason: "" }));
  if (!guild.introductionStarted) missions.unshift({ id: "introduction", name: "A first Guild errand", client: "Guild steward", kind: "Introduction", rewardKind: "discovery", resources: [],
    primary: 0, secondary: 4, hazard: "ambush", hours: 1 / 12, image: "waymark", available: true, reason: "", copy: "Deliver the steward's sealed message. One hired member, one Food, five minutes: learn how a mission, recovery and its report work." });
  CLIENT_CONTRACTS.forEach(([baseId, name], index) => {
    const base = C.missions.find(m => m.id === baseId), needed = F.REPUTATION_MILESTONES[index];
    const available = guild.rooms.contracts > index && (guild.clientReputation[base.client] || 0) >= needed;
    missions.push({ ...base, id: "client-" + (index + 1), baseId, name, image: baseId, available,
      reason: available ? "" : "Contract board Level " + (index + 1) + " and " + needed + " reputation with " + base.client + "." });
  });
  CHAPTERS.forEach((name, index) => {
    const base = C.missions.find(m => m.id === (index % 2 ? "ledger" : "waymark"));
    const available = guild.rooms.archive > index && guild.reputation >= F.REPUTATION_MILESTONES[index]
      && (index === 0 || guild.discoveries.includes("chapter-" + index));
    missions.push({ ...base, id: "chapter-" + (index + 1), name, image: base.id, chapter: index + 1, available,
      reason: available ? "" : "Archive Level " + (index + 1) + ", " + F.REPUTATION_MILESTONES[index] + " Guild reputation and the previous chapter." });
  });
  return missions;
}
function ownedParty(state, champions, ids, now) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length > R.partyLimit(state.levels["guild-master"])) E.fail("Choose a suitable party.");
  return ids.map(id => {
    const c = champions[id];
    if (!c || !state.activeChampionIds.includes(id)) E.fail("Choose members from your active roster.");
    if (c.questId || c.recoveryUntilMs > now || F.busyMentor(state, id, now)) E.fail("A member is on a mission, mentoring or recovering.");
    if (c.guildVersion !== 2) E.fail("Refresh this member before planning.");
    return c;
  });
}
function rewardAmounts(kind, resource, rates, hours, factor) {
  const quantity = Math.floor(hours * factor * (kind === "gold" ? rates.gold : kind === "troops" ? rates.troops : rates.material));
  return { gold: kind === "gold" ? quantity : 0, troops: kind === "troops" ? quantity : 0,
    materials: kind === "materials" ? { [resource]: quantity } : {}, gearKey: "" };
}
function totalReward(reward) { return reward.gold + reward.troops + Object.values(reward.materials).reduce((sum, n) => sum + n, 0); }
function trainingPlan(member, xp, success, mission, introduction) {
  const matching = !introduction && success && (member.type === "medic" || C.types[member.type].hazard === mission.hazard);
  const count = (member.matchingSuccesses || 0) + (matching ? 1 : 0);
  const milestones = [1, 3, 6].filter(n => count >= n && !(member.ambitions || []).includes(n));
  const ambitionXp = milestones.reduce((sum, n) => sum + { 1: 20, 3: 60, 6: 120 }[n], 0);
  const trained = R.advance(member, xp + ambitionXp);
  return { level: trained.champion.level, xp: trained.champion.xp, credited: trained.credited, missionXp: xp,
    ambitionXp, milestones, matchingSuccesses: count, ambitions: [...new Set([...(member.ambitions || []), ...milestones])] };
}
function quote(state, input, champions, now, realm) {
  const guild = F.requireGuild(state); initialize(state);
  const mission = catalogue(state).find(m => m.id === input.missionId);
  if (!mission || !mission.available) E.fail(mission?.reason || "Choose an available Guild contract.");
  const introduction = mission.id === "introduction";
  const tierIndex = introduction ? 0 : E.integer(input.tier, 0, 4, "Choose a contract difficulty.");
  const tier = C.tiers[tierIndex];
  if (state.levels["guild-master"] < tier.guild) E.fail("Upgrade the Guild Master to Level " + tier.guild + " for this difficulty.");
  const party = ownedParty(state, champions, input.championIds, now);
  if (introduction ? party.length !== 1 : party.length < tier.members) E.fail("This contract requires " + (introduction ? 1 : tier.members) + " members.");
  if (state.quests.length + guild.missions.length >= R.missionLimit(state.levels["guild-master"])) E.fail("All mission slots are occupied.");
  if (state.quests.length + state.parcels.length + guild.missions.length + guild.rewards.length >= 6) E.fail("Collect waiting rewards before starting another mission.");
  const hours = introduction ? 1 / 12 : input.hours;
  if (!introduction && !(mission.rewardKind === "gear" ? [8] : tier.hours).includes(hours)) E.fail("Choose an available duration.");
  const route = introduction ? "direct" : input.route || "direct", approach = introduction ? "balanced" : input.approach || "balanced";
  const objective = !introduction && input.objective === true, supply = !introduction && input.supply === true;
  const leaderId = introduction ? party[0].id : input.leaderId;
  const forecast = R.forecast(mission, tierIndex, party, leaderId, { route, approach, objective, supply });
  if (!forecast) E.fail("Choose a leader, route and approach.");
  if (objective && (!forecast.objectiveEligible || !["gold", "troops", "materials"].includes(mission.rewardKind))) E.fail("This secondary objective needs its matching specialty and enough supporting stats, and must improve a material, Gold or troop reward.");
  const foodRate = E.quoteRate(state, "food");
  if (!foodRate) E.fail("Construct the Farmstead and Windmill first, then produce Food.");
  const meal = S.MEALS.find(m => m.id === (introduction ? "none" : input.meal || "none"));
  if (!meal || meal.level > state.levels.alehouse) E.fail("That preparation meal is unavailable at your Alehouse level.");
  const durationMs = introduction ? 5 * 60000 : Math.round(hours * E.HOUR * forecast.timeFactor);
  const seasonal = ["gold", "troops"].includes(mission.rewardKind);
  if (seasonal && (!realm?.mainCityPath || !Number.isSafeInteger(realm.endsAtMs) || now + durationMs >= realm.endsAtMs)) E.fail("This seasonal contract must finish before the realm resets. Choose a shorter contract.");
  const resource = mission.resources.length ? input.resource || mission.resources[0] : "";
  if (mission.resources.length && !mission.resources.includes(resource)) E.fail("Choose a material offered by this contract.");
  const rates = { gold: realm?.goldRate || 0, troops: realm?.troopRate || 0, material: resource ? E.quoteRate(state, resource) : 0 };
  if (resource && !rates.material) E.fail("Construct the complete " + resource + " production chain first.");
  const budgetHours = hours * (mission.rewardKind === "gold" ? .05 : mission.rewardKind === "troops" ? .025 : mission.rewardKind === "materials" ? [.009, .0135, .018, .0225, .027][tierIndex] : 0);
  const factor = forecast.rewardFactor * (1 + meal.reward), fullFactor = factor * (objective ? 1.1 : 1);
  const successReward = rewardAmounts(mission.rewardKind, resource, rates, budgetHours, fullFactor);
  const partialReward = rewardAmounts(mission.rewardKind, resource, rates, budgetHours, factor * .5);
  const withoutMeal = rewardAmounts(mission.rewardKind, resource, rates, budgetHours, forecast.rewardFactor * (objective ? 1.1 : 1));
  if (budgetHours && totalReward(successReward) < 1) E.fail("This journey would yield no reward. Choose another duration or improve the source building.");
  if (meal.reward && !meal.recovery && totalReward(successReward) === totalReward(withoutMeal)) E.fail("This meal would not improve the rounded reward. Choose no meal.");
  if (objective && totalReward(successReward) === totalReward(rewardAmounts(mission.rewardKind, resource, rates, budgetHours, factor))) E.fail("This objective would not improve the rounded reward. Choose the main objective only.");
  const day = S.utcDay(now), reservedHours = budgetHours * fullFactor;
  if (mission.rewardKind === "materials" && (state.questUsage.day === day ? state.questUsage.hours : 0) + reservedHours > 2.4 + 1e-10) E.fail("Today's shared material mission allowance is used.");
  if (seasonal && (guild.usage.day === day ? guild.usage[mission.rewardKind] : 0) + reservedHours > (mission.rewardKind === "gold" ? 1 : .5) + 1e-10) E.fail("Today's " + mission.rewardKind + " mission allowance is used.");
  let gear = null;
  if (mission.rewardKind === "gear") {
    if (guild.gearAvailableAtMs > now) E.fail("Your next Gear recovery attempt is available in " + Math.ceil((guild.gearAvailableAtMs - now) / E.HOUR) + " hours.");
    if (!Object.hasOwn(G.BUILDINGS, input.officer) || !state.levels[input.officer]) E.fail("Choose a constructed officer building.");
    const uncommon = state.entitlements[input.officer] >= 1;
    gear = { officer: input.officer, findPercent: 40, commonPercent: uncommon ? 90 : 100, uncommonPercent: uncommon ? 10 : 0,
      families: G.DEFINITIONS.filter(d => d.buildingId === input.officer && d.rarity === "common").map(d => d.familyKey) };
    gear.overallCommonPercent = forecast.success * .4 * gear.commonPercent / 100;
    gear.overallUncommonPercent = forecast.success * .4 * gear.uncommonPercent / 100;
  }
  const mentorAssignment = guild.mentoring;
  let mentor = null;
  if (!introduction && mentorAssignment && party.some(c => c.id === mentorAssignment.pupilId) && !party.some(c => c.id === mentorAssignment.mentorId)) {
    const member = champions[mentorAssignment.mentorId], pupil = party.find(c => c.id === mentorAssignment.pupilId);
    if (member && !member.questId && member.recoveryUntilMs <= now && mentorAssignment.busyUntilMs <= now
      && state.activeChampionIds.includes(member.id) && member.level >= 10 && member.level >= pupil.level + 5 && guild.rooms.training)
      mentor = { id: member.id, name: member.name, pupilId: pupil.id, bonus: .05 * guild.rooms.training };
  }
  const baseXp = introduction ? 10 : Math.round(20 * hours * [1, 1.1, 1.2, 1.3, 1.4][tierIndex]);
  const reduction = Math.min(.55, Math.max(guild.legacyRecoveryReduction, guild.rooms.infirmary * .07) + meal.recovery + forecast.medicReduction);
  const baseRest = hours * 15 * [1, 1.1, 1.2, 1.35, 1.5][tierIndex] * (1 - reduction);
  const training = {}, recoveryMs = {};
  OUTCOMES.forEach((outcome, index) => {
    training[outcome] = Object.fromEntries(party.map(c => [c.id, trainingPlan(c,
      Math.floor(baseXp * [1, .75, .5][index] * (mentor?.pupilId === c.id ? 1 + mentor.bonus : 1)), outcome === "success", mission, introduction)]));
    recoveryMs[outcome] = introduction ? 2 * 60000 : Math.ceil(Math.max(10, baseRest * [1, 1.25, 1.5][index]) * 60000);
  });
  if (introduction) Object.assign(forecast, { risk: 0, success: 100, partial: 0, failure: 0 });
  if (mission.chapter && !["restore", "share", "record"].includes(input.storyChoice)) E.fail("Choose how your Guild will preserve this discovery.");
  return { action: "guildMission", version: VERSION, missionId: mission.id, missionName: mission.name, client: mission.client,
    image: mission.image || mission.id, kind: mission.rewardKind, hazard: mission.hazard, tier: tierIndex, hours, championIds: party.map(c => c.id),
    members: structuredClone(party), leaderId, route, approach, supply, objective, resource, meal: meal.id, mentor,
    food: introduction ? 1 : Math.ceil(.01 * hours * foodRate) + Math.ceil(meal.foodHours * foodRate) + (supply ? Math.max(1, Math.ceil(.05 * foodRate)) : 0),
    durationMs, recoveryMs, training, forecast, gear, day, reservedHours, rewards: { success: successReward, partial: partialReward, failure: { gold: 0, troops: 0, materials: {}, gearKey: "" } },
    introduction, discovery: mission.rewardKind === "discovery" ? mission.id : "", storyChoice: mission.chapter ? input.storyChoice : "",
    seasonal: seasonal ? { resetGeneration: realm.resetGeneration, worldId: realm.worldId, realmShardId: realm.realmShardId, mainCityPath: realm.mainCityPath, expiresAtMs: realm.endsAtMs } : null };
}
function resolve(value, random = crypto.randomInt) {
  const sample = random(1000), full = Math.round(value.forecast.success * 10), partial = Math.round(value.forecast.partial * 10);
  const outcome = sample < full ? "success" : sample < full + partial ? "partial" : "failure";
  const rewards = structuredClone(value.rewards[outcome]);
  if (outcome === "success" && value.gear && random(1000) < 400) {
    const rarity = random(1000) < value.gear.uncommonPercent * 10 ? "uncommon" : "common";
    const family = value.gear.families[random(value.gear.families.length)];
    const item = G.DEFINITIONS.find(d => d.buildingId === value.gear.officer && d.familyKey === family && d.rarity === rarity);
    if (!item) E.fail("This accepted Gear recovery needs reconciliation.", "internal");
    rewards.gearKey = item.gearKey;
  }
  return { version: VERSION, outcome, rewards };
}
function launch(state, value, id, champions, now) {
  const guild = initialize(state);
  E.spend(state, { food: value.food });
  if (value.kind === "materials") {
    if (state.questUsage.day !== value.day) state.questUsage = { day: value.day, hours: 0 };
    state.questUsage.hours += value.reservedHours;
  }
  if (["gold", "troops"].includes(value.kind)) {
    if (guild.usage.day !== value.day) guild.usage = { day: value.day, gold: 0, troops: 0 };
    guild.usage[value.kind] += value.reservedHours;
  }
  if (value.gear) guild.gearAvailableAtMs = now + 72 * E.HOUR;
  if (value.introduction) guild.introductionStarted = true;
  const mission = { ...structuredClone(value), id, startedAtMs: now, completesAtMs: now + value.durationMs };
  guild.missions.push(mission);
  for (const championId of value.championIds) champions[championId].questId = id;
  if (value.mentor) guild.mentoring.busyUntilMs = mission.completesAtMs;
  return mission;
}
function sameRealm(seasonal, realm, now) {
  return !seasonal || now < seasonal.expiresAtMs && seasonal.resetGeneration === realm.resetGeneration
    && seasonal.worldId === realm.worldId && seasonal.realmShardId === realm.realmShardId;
}
function settle(state, champions, privateResults, now, realm) {
  const guild = initialize(state), completed = [], remaining = [];
  for (const mission of guild.missions) {
    if (mission.completesAtMs > now) { remaining.push(mission); continue; }
    const result = privateResults[mission.id];
    if (!result || result.version !== mission.version || !OUTCOMES.includes(result.outcome)) E.fail("An accepted mission needs its saved outcome. Try again shortly.", "internal");
    const outcome = result.outcome, training = mission.training[outcome], rest = mission.recoveryMs[outcome];
    for (const id of mission.championIds) {
      if (!champions[id] || champions[id].questId !== mission.id) E.fail("Mission ownership needs reconciliation.", "internal");
      const plan = training[id], history = { missionId: mission.id, name: mission.missionName, outcome, completedAtMs: mission.completesAtMs, creditedXp: plan.credited, milestones: plan.milestones };
      Object.assign(champions[id], { level: plan.level, xp: plan.xp, matchingSuccesses: plan.matchingSuccesses, ambitions: plan.ambitions,
        questId: "", recoveryUntilMs: mission.completesAtMs + rest, history: [...(champions[id].history || []), history].slice(-20) });
    }
    if (outcome === "success") {
      if (!mission.introduction) { guild.reputation++; guild.clientReputation[mission.client] = (guild.clientReputation[mission.client] || 0) + 1; }
      if (mission.discovery && !guild.discoveries.includes(mission.discovery)) {
        guild.discoveries.push(mission.discovery);
        if (mission.storyChoice) guild.storyChoices[mission.discovery] = mission.storyChoice;
      }
    }
    const reportId = String(mission.completesAtMs).padStart(13, "0") + "_" + mission.id;
    const reward = { id: mission.id, reportId, ...structuredClone(result.rewards), seasonal: mission.seasonal };
    const expired = !sameRealm(reward.seasonal, realm, now);
    if (expired) { reward.gold = 0; reward.troops = 0; }
    if (totalReward(reward) || reward.gearKey) guild.rewards.push(reward);
    const report = { ...mission, reportId, outcome, receivedReward: structuredClone(result.rewards), seasonalExpired: expired, completedAtMs: mission.completesAtMs, training, restMs: rest };
    completed.push(report);
    guild.recentReports.unshift({ id: reportId, missionName: mission.missionName, image: mission.image, outcome, completedAtMs: mission.completesAtMs });
  }
  guild.missions = remaining;
  guild.recentReports = guild.recentReports.slice(0, 12);
  for (const reward of guild.rewards) if (!sameRealm(reward.seasonal, realm, now)) { reward.gold = 0; reward.troops = 0; reward.seasonalExpired = true; }
  guild.rewards = guild.rewards.filter(reward => totalReward(reward) || reward.gearKey);
  return completed;
}
function claimQuote(state, rewardId, realm, gearRoom, now) {
  const reward = initialize(state).rewards.find(r => r.id === rewardId);
  if (!reward) E.fail("This reward was already collected or its seasonal portion expired.");
  const received = { gold: 0, troops: 0, materials: {}, gearKey: "" };
  if (sameRealm(reward.seasonal, realm, now) && (!reward.seasonal || realm.mainCityPath === reward.seasonal.mainCityPath)) {
    received.gold = reward.gold; received.troops = reward.troops;
  }
  for (const [key, amount] of Object.entries(reward.materials)) {
    const fits = Math.min(amount, Math.max(0, Math.floor(E.storageSpace(state, key) + E.EPS)));
    if (fits) received.materials[key] = fits;
  }
  if (reward.gearKey && gearRoom) received.gearKey = reward.gearKey;
  if (!totalReward(received) && !received.gearKey) E.fail(reward.gearKey ? "Your Gear Bag is full. The item will wait safely." : "Make storage space or return to the original Main City to collect this reward.");
  return { action: "guildClaim", rewardId, received, mainCityPath: reward.seasonal?.mainCityPath || "" };
}
function claim(state, value) {
  const guild = initialize(state), reward = guild.rewards.find(r => r.id === value.rewardId);
  if (!reward) E.fail("This reward was already collected.");
  for (const [key, amount] of Object.entries(value.received.materials)) { state.stock[key] += amount; reward.materials[key] -= amount; }
  reward.gold -= value.received.gold; reward.troops -= value.received.troops;
  if (value.received.gearKey) reward.gearKey = "";
  if (!totalReward(reward) && !reward.gearKey) guild.rewards = guild.rewards.filter(r => r.id !== reward.id);
}
module.exports = { VERSION, OUTCOMES, CHAPTERS, initialize, identity, migrate, catalogue, quote, resolve, launch, settle, claimQuote, claim, sameRealm };
