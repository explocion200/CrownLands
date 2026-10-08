"use strict";
const E = require("./estate-economy");
const G = require("./common-gear");
const { fail, integer, HOUR } = E;
const DAY = 24 * HOUR;
const utcDay = now => new Date(now).toISOString().slice(0, 10);
const MEALS = [
  { id: "none", level: 0, foodHours: 0, reward: 0, recovery: 0 },
  { id: "bread", level: 10, foodHours: .05, reward: .05, recovery: 0 },
  { id: "stew", level: 25, foodHours: .12, reward: .08, recovery: .05 },
  { id: "feast", level: 50, foodHours: .25, reward: .12, recovery: .10 },
];
function commissionQuote(state, building, family) {
  const level = state.levels[building];
  if (!G.BUILDINGS[building] || !level) fail("Construct the officer building first.");
  if (state.commissions[building]) fail("Claim the previous commission first.");
  const rarity = G.RARITIES[E.rarityIndex(level)];
  const item = G.DEFINITIONS.find(d => d.buildingId === building && d.familyKey === family && d.rarity === rarity);
  if (!item) fail("Choose an item family for this officer.", "invalid-argument");
  // Every family has a fixed published category recipe. Materials enter at the
  // same processor stages as building costs; shares redistribute before unlock.
  const themes = {
    armor: { timber: .30, stone: .35, planks: .20, iron: .10, tools: .05 },
    weapon: { timber: .45, stone: .10, planks: .15, iron: .25, tools: .05 },
    jewelry: { timber: .15, stone: .50, planks: .10, iron: .20, tools: .05 },
  };
  const weights = Object.entries(themes[item.category]).filter(([key]) =>
    key === "planks" ? level >= 11 : key === "iron" ? level >= 26 : key === "tools" ? level >= 51 : true);
  const total = weights.reduce((n, [, weight]) => n + weight, 0), reference = E.referenceRates(level);
  const materials = Object.fromEntries(weights.map(([key, weight]) => {
    if (!E.chainLevel(state, key)) fail("Construct the " + E.PRODUCERS[key].building + " supply chain first.");
    return [key, Math.floor(reference[key] * 4 * weight / total)];
  }));
  const durationMs = Math.ceil((168 - 96 * (level - 1) / 99) * HOUR);
  return { action: "commission", building, family, gearKey: item.gearKey, name: item.gearName, rarity,
    level: 1, materials, durationMs, version: E.VERSION, referenceLevel: level };
}
function rosterLimit(state) { return state.levels["guild-master"] ? 6 + Math.floor(18 * (state.levels["guild-master"] - 1) / 99) : 0; }
function offers(state, now, rawGoldPerHour) {
  const ale = state.levels.alehouse, guild = state.levels["guild-master"];
  if (!ale || !guild) return [];
  const highest = E.rarityIndex(ale);
  return [highest, Math.max(0, highest - 1), 0].map((quality, index) => ({
    id: utcDay(now) + "_" + index, day: utcDay(now), quality, name: G.RARITIES[quality] + " Champion",
    level: Math.min(guild, 1 + Math.floor((ale - 1) / 10)),
    gold: Math.ceil(Math.max(285, rawGoldPerHour) * [.2, .5, 1, 2, 4][quality]),
  }));
}
function train(champion, xp, guildLevel) {
  const next = { ...champion };
  const ceiling = Math.max(next.level, guildLevel);
  // Previously banked XP is retained even if it exceeds the new bank limit.
  let room = 0;
  for (let level = next.level; level < Math.min(100, ceiling); level++) room += 4 * level;
  if (ceiling < 100) room += 4 * ceiling;
  const credited = next.level >= 100 ? 0 : Math.max(0, Math.min(xp, room - next.xp));
  next.xp += credited;
  while (next.level < ceiling && next.level < 100 && next.xp >= 4 * next.level) {
    next.xp -= 4 * next.level; next.level++;
  }
  return { champion: next, credited };
}
function questQuote(state, input, champions, now) {
  const guild = state.levels["guild-master"], ale = state.levels.alehouse;
  if (!guild) fail("Construct the Guild Master first.");
  const tier = integer(input.tier, 0, 4, "Choose a quest tier.");
  if (tier > Math.min(E.rarityIndex(guild), E.rarityIndex(ale))) fail("Upgrade the Guild Master and Alehouse to unlock this quest.");
  const hours = input.hours;
  if (![2, 4, 8].includes(hours)) fail("Choose a two, four or eight hour quest.", "invalid-argument");
  const ids = input.championIds;
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.length < [2, 2, 3, 4, 4][tier]
    || ids.length > (guild >= 50 ? 4 : guild >= 25 ? 3 : 2)) fail("Choose a suitable party.");
  const party = ids.map(id => {
    const champion = champions[id];
    if (!champion || !state.activeChampionIds.includes(id)) fail("That champion is not on your active roster.");
    if (champion.questId || champion.recoveryUntilMs > now) fail("A champion is busy or recovering.");
    return train(champion, 0, guild).champion;
  });
  if (party.reduce((n, c) => n + Math.floor(c.level * (1 + .25 * c.quality)), 0) < [2, 60, 160, 320, 600][tier])
    fail("This party needs more power for that quest tier.");
  const limit = guild >= 60 ? 3 : guild >= 25 ? 2 : 1;
  if (state.quests.length >= limit) fail("All expedition slots are occupied.");
  if (state.quests.length + state.parcels.length >= 6) fail("Claim pending quest materials before launching.");
  const keys = input.resources;
  if (!Array.isArray(keys) || !keys.length || keys.length > 2 || new Set(keys).size !== keys.length
    || keys.some(key => !E.KEYS.includes(key) || ["food", "grain"].includes(key))) fail("Choose one or two non-food materials.", "invalid-argument");
  const foodRate = E.quoteRate(state, "food");
  if (!foodRate) fail("Construct the Farmstead and Windmill first.");
  const meal = MEALS.find(meal => meal.id === (input.meal || "none"));
  if (!meal || meal.level > ale) fail("That preparation meal is unavailable.");
  const baseHours = E.C.rules.quest.rewardHoursPerElapsedHour[tier] * hours;
  const budget = baseHours * (1 + meal.reward), day = utcDay(now);
  if ((state.questUsage.day === day ? state.questUsage.hours : 0) + budget > 2.4 + 1e-10) fail("Today's shared expedition allowance is used.");
  const baseRewards = {}, rewards = {};
  for (const key of keys) {
    const rate = E.quoteRate(state, key);
    baseRewards[key] = Math.floor(rate * baseHours / keys.length);
    rewards[key] = Math.floor(rate * budget / keys.length);
    if (rewards[key] <= 0) fail("This trip yields no " + key + ". Choose a longer journey or another resource.");
  }
  if (meal.reward && !meal.recovery && keys.every(key => rewards[key] === baseRewards[key]))
    fail("This meal would not increase your rounded reward. Choose no meal.");
  const xp = 20 * hours * E.C.rules.champion.tierXpMultipliers[tier];
  const training = Object.fromEntries(party.map(c => [c.id, train(c, xp, guild)]));
  const reduction = Math.min(.45, .35 * (ale - 1) / 99 + meal.recovery);
  return { action: "quest", tier, hours, championIds: ids, resources: keys, meal: meal.id, day, budget,
    rewards, baseRewards, food: Math.ceil(.01 * hours * foodRate) + Math.ceil(meal.foodHours * foodRate),
    training, durationMs: hours * HOUR, recoveryMs: Math.max(10, hours * 15 * (1 - reduction)) * 60000,
    version: E.VERSION };
}
function launchQuest(state, quote, id, champions, now) {
  E.spend(state, { food: quote.food });
  if (state.questUsage.day !== quote.day) state.questUsage = { day: quote.day, hours: 0 };
  state.questUsage.hours += quote.budget;
  state.quests.push({ ...structuredClone(quote), id, completesAtMs: now + quote.durationMs });
  quote.championIds.forEach(championId => { champions[championId].questId = id; });
}
function settleQuests(state, champions, now) {
  const remaining = [];
  for (const quest of state.quests) {
    if (quest.completesAtMs > now) { remaining.push(quest); continue; }
    for (const id of quest.championIds) {
      if (!champions[id] || champions[id].questId !== quest.id) fail("Expedition ownership is inconsistent.", "internal");
      const result = quest.training[id].champion;
      champions[id] = { ...champions[id], level: result.level, xp: result.xp, questId: "",
        recoveryUntilMs: quest.completesAtMs + quest.recoveryMs };
    }
    state.parcels.push({ id: quest.id, rewards: quest.rewards, day: quest.day, budget: quest.budget });
  }
  state.quests = remaining;
  for (const id of state.activeChampionIds) if (champions[id] && !champions[id].questId)
    champions[id] = train(champions[id], 0, state.levels["guild-master"]).champion;
}
function claimParcel(state, id) {
  const parcel = state.parcels.find(parcel => parcel.id === id);
  if (!parcel) fail("This parcel has already been claimed.");
  const received = {};
  for (const [key, value] of Object.entries(parcel.rewards)) {
    const amount = Math.min(value, Math.max(0, Math.floor(E.capacity(state, key) - state.stock[key] + E.EPS)));
    if (amount) { state.stock[key] += amount; parcel.rewards[key] -= amount; received[key] = amount; }
  }
  if (!Object.keys(received).length) fail("Make storage space before claiming.");
  if (Object.values(parcel.rewards).every(v => v === 0)) state.parcels = state.parcels.filter(p => p.id !== id);
  return received;
}
function supplyQuote(state, resource, hours, now) {
  if (![.25, .5, 1].includes(hours) || !E.KEYS.includes(resource)) fail("Choose a supply pack.", "invalid-argument");
  const food = ["food", "grain"].includes(resource), building = food ? "market" : "wagon-yard", level = state.levels[building];
  if (!level || hours > .25 + .75 * (level - 1) / 99 + 1e-10) fail("Upgrade " + building + " for that delivery size.");
  if ((["planks", "iron"].includes(resource) && level < 25) || (resource === "tools" && level < 50))
    fail("Upgrade the Wagon Yard to unlock this material.");
  const day = utcDay(now), used = state.supplyUsage.day === day ? state.supplyUsage.hours : 0;
  if (used + hours > 1 + 1e-10) fail("Today's shared supply allowance is used.");
  const quantity = Math.floor(E.quoteRate(state, resource) * hours);
  if (quantity <= 0) fail("Construct the resource supply chain first.");
  if (state.stock[resource] + quantity > E.capacity(state, resource) + E.EPS) fail("Make storage space for the full delivery.");
  return { action: "supply", building, resource, hours, quantity, crowns: Math.ceil(hours * 20), day, version: E.VERSION };
}
module.exports = { DAY, utcDay, MEALS, commissionQuote, rosterLimit, offers, train, questQuote, launchQuest, settleQuests, claimParcel, supplyQuote };
