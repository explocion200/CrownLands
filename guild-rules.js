(function(root) {
  "use strict";
  const C = typeof module === "object" && module.exports ? require("./guild-config") : root.CrownlandsGuildConfig;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const tenth = n => Math.round(n * 10) / 10;
  const partyLimit = level => level >= 50 ? 4 : level >= 25 ? 3 : 2;
  const missionLimit = level => level >= 60 ? 3 : level >= 25 ? 2 : 1;
  const values = champion => champion.base.map((n, i) => n + (champion.level - 1) * C.types[champion.type].growth[i]);
  const ceiling = champion => Math.max(C.ceilings[champion.quality], champion.protectedCeiling || 0, champion.level);
  const skillIndex = level => [1, 10, 20, 40, 60].filter(n => level >= n).length - 1;
  function advance(champion, xp) {
    const next = structuredClone(champion), cap = ceiling(champion);
    let remaining = 0;
    for (let level = next.level; level < cap; level++) remaining += 4 * level;
    const credited = next.level >= cap ? 0 : Math.max(0, Math.min(Math.floor(xp), remaining - next.xp));
    next.xp += credited;
    while (next.level < cap && next.xp >= 4 * next.level) { next.xp -= 4 * next.level; next.level++; }
    return { champion: next, credited };
  }
  function forecast(mission, tierIndex, party, leaderId, preparation = {}) {
    const tier = C.tiers[tierIndex], route = C.routes[preparation.route || "direct"], approach = C.approaches[preparation.approach || "balanced"];
    const leader = party.find(c => c.id === leaderId);
    if (!tier || !route || !approach || !party.length || !leader) return null;
    const contributions = party.map(c => ({ id: c.id, name: c.name, type: c.type,
      points: .6 * values(c)[mission.primary] + .3 * values(c)[mission.secondary] }));
    const leaderBonus = .1 * tier.members * values(leader)[3];
    const readiness = contributions.reduce((sum, c) => sum + c.points, 0) + leaderBonus;
    const adjustment = clamp(20 * (1 - readiness / tier.target), -15, 35);
    const signature = Math.min(12, party.reduce((sum, c) => sum + (C.types[c.type].hazard === mission.hazard ? [4, 5, 6, 7, 8][skillIndex(c.level)] : 0), 0));
    const traits = Math.min(6, party.filter(c => C.traits[c.trait] === mission.hazard).length * 2);
    const objectiveRisk = preparation.objective ? 3 : 0, supplyRisk = preparation.supply ? -6 : 0;
    const risk = tenth(clamp(tier.risk + adjustment - signature - traits + route.risk + approach.risk + objectiveRisk + supplyRisk, 5, 75));
    const partial = tenth(.7 * risk);
    const secondaryType = Object.keys(C.types).find(type => C.types[type].hazard === mission.hazard);
    const support = party.reduce((sum, c) => sum + values(c)[mission.secondary], 0);
    return { risk, success: tenth(100 - risk), partial, failure: tenth(risk - partial), contributions, leaderId, leaderBonus,
      readiness, target: tier.target, baseRisk: tier.risk, adjustment, signature, traits, routeRisk: route.risk, approachRisk: approach.risk,
      objectiveRisk, supplyRisk, timeFactor: route.time * approach.time, rewardFactor: route.reward * approach.reward,
      secondaryType, support, requiredSupport: tier.target * 1.25,
      objectiveEligible: party.some(c => c.type === secondaryType) && support >= tier.target * 1.25,
      medicReduction: Math.max(0, ...party.filter(c => c.type === "medic").map(c => [.05, .06, .07, .08, .1][skillIndex(c.level)])) };
  }
  const api = { values, ceiling, skillIndex, advance, forecast, partyLimit, missionLimit };
  if (typeof module === "object" && module.exports) module.exports = api; else root.CrownlandsGuildRules = api;
})(typeof window === "object" ? window : globalThis);
