/* Review-only balance model. Never imported by the game or deployed Functions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CrownlandsGearBalanceDraft = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function bonus(proposal, effect, rarityIndex, level, slot) {
    if (!proposal.effects[effect] || !Number.isInteger(rarityIndex) || rarityIndex < 0 || rarityIndex > 4
      || !Number.isInteger(level) || level < 1 || level > 5) throw new RangeError("Invalid draft gear selection");
    if (rarityIndex === 0) return proposal.commonLevels[level - 1];
    const maximums = proposal.curves[proposal.effects[effect].slotCurves?.[slot] || proposal.effects[effect].curve];
    return round(maximums[rarityIndex - 1] + (maximums[rarityIndex] - maximums[rarityIndex - 1]) * level / 5);
  }
  function gearTotal(proposal, effect, rarityIndex, level) {
    const config = proposal.effects[effect];
    const overrides = Object.keys(config.slotCurves || {});
    return round(bonus(proposal, effect, rarityIndex, level) * (config.slots - overrides.length)
      + overrides.reduce((sum, slot) => sum + bonus(proposal, effect, rarityIndex, level, slot), 0));
  }
  function copiesFromCommon(rarityIndex, level) { return 2 ** (rarityIndex * 5 + level - 1); }
  function upgradeGold(proposal, rarityIndex, level) {
    return proposal.costs.goldByRarity[proposal.rarities[rarityIndex].toLowerCase()][level - 1];
  }
  function cumulativeGold(proposal, rarityIndex, level, startRarity = 0) {
    let gold = 0;
    for (let rank = startRarity * 5; rank < rarityIndex * 5 + level - 1; rank++) {
      gold = 2 * gold + upgradeGold(proposal, Math.floor(rank / 5), rank % 5 + 1);
    }
    return gold;
  }
  function clampBonus(raw, cap) {
    const normalized = Math.max(0, Number(raw) || 0);
    const applied = Math.min(Math.max(0, cap), normalized);
    return {raw:round(normalized),applied:round(applied),excess:round(normalized-applied)};
  }
  function scenario(proposal, kind, {rarityIndex=0,level=5,skill=0,objectives=0,clan=0,timed=0}={}) {
    const gear = effect => gearTotal(proposal,effect,rarityIndex,level);
    const choices = {
      attack:{effect:"attackStrength",cap:"attackBonus",clan:true},
      recovery:{effect:"casualtyEfficiency",cap:"casualtyRecovery",clan:true},
      defense:{effect:"defenderStrength",cap:"defendingSoldierBonus",objectives:true},
      walls:{effect:"wallStrength",cap:"wallStrengthBonus"},
      troops:{effect:"troopProductionAllCities",cap:"troopProductionBonus",objectives:true,timed:true},
      mainGold:{effect:"goldProductionMainCity",extra:"goldProductionAllCities",cap:"mainCityGoldBonus",objectives:true,timed:true},
      otherGold:{effect:"goldProductionAllCities",cap:"otherCityGoldBonus",objectives:true,timed:true},
      transfer:{effect:"ownedMarchSpeed",cap:"marchSpeedBonus",objectives:true,movement:true},
      attackMarch:{effect:"enemyMarchSpeed",cap:"marchSpeedBonus",objectives:true,movement:true},
      scout:{effect:"scoutSpeed",cap:"scoutSpeedBonus",objectives:true,movement:true},
      repair:{effect:"wallRepairSpeed",cap:"regularWallRepairReduction",noSkill:true}
    };
    const config=choices[kind]; if(!config) throw new RangeError("Invalid draft category");
    const sources = {skill:config.noSkill?0:Math.max(0,skill),gear:gear(config.effect)+(config.extra?gear(config.extra):0),
      objectives:config.objectives?Math.max(0,objectives):0,clan:config.clan?Math.max(0,clan):0,timed:config.timed?Math.max(0,timed):0};
    const result=clampBonus(Object.values(sources).reduce((a,b)=>a+b,0),proposal.caps[config.cap]);
    return {...result,cap:proposal.caps[config.cap],sources,perItem:bonus(proposal,config.effect,rarityIndex,level),
      copies:copiesFromCommon(rarityIndex,level),directGold:upgradeGold(proposal,rarityIndex,level),
      multiplier:kind==="recovery"?null:kind==="repair"?1-result.applied/100:1+result.applied/100};
  }
  return Object.freeze({bonus,gearTotal,copiesFromCommon,upgradeGold,cumulativeGold,clampBonus,scenario});
});
