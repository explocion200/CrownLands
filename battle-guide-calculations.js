(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrownlandsBattleGuideCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RULES = Object.freeze({
    victoryPointsBase: 6,
    victoryPointsPerLevel: 4,
    victoryPointsExponent: 1.35,
    victoryPointsExponentScale: 2,
    baseAttackPowerPerTroop: 2,
    strongerKingdomAssaultRatio: 2,
    strongerKingdomRaidRatio: 2.5,
    scoutIntelMinutes: 10,
    strongholdEffectiveLevel: 50,
    citadelEffectiveLevel: 100,
  });

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
  }

  function levelOf(value) {
    return Math.max(1, Math.floor(finite(value, 1)));
  }

  function read(config, path, fallback = 0) {
    const value = String(path || "").split(".").reduce(
      (current, key) => current && typeof current === "object" ? current[key] : undefined,
      config
    );
    return finite(value, fallback);
  }

  function create(config = {}) {
    const economy = config && typeof config === "object" ? config : {};

    function getSkillPercent(skillId, skillLevel = 0) {
      const perLevel = read(economy, `skills.${skillId}.percentPerLevel`, 0);
      const maximum = read(economy, `skills.${skillId}.maxPercent`, 0);
      return clamp(Math.floor(finite(skillLevel, 0)) * perLevel, 0, maximum);
    }

    function getSkillMaximumLevel(skillId) {
      const perLevel = read(economy, `skills.${skillId}.percentPerLevel`, 0);
      const maximum = read(economy, `skills.${skillId}.maxPercent`, 0);
      return perLevel > 0 ? Math.ceil(maximum / perLevel) : 0;
    }

    function getVictoryPoints(level) {
      const normalized = levelOf(level);
      const raw = RULES.victoryPointsBase
        + normalized * RULES.victoryPointsPerLevel
        + Math.pow(normalized, RULES.victoryPointsExponent) * RULES.victoryPointsExponentScale;
      return Number.isFinite(raw) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)) : Number.MAX_SAFE_INTEGER;
    }

    function getGoldPerHour(level) {
      const normalized = levelOf(level);
      const endgameStart = Math.max(1, read(economy, "cityEconomy.goldEndgameStartLevel", 100));
      const curveLevel = Math.min(normalized, endgameStart);
      const productionVp = Math.floor(
        read(economy, "cityEconomy.productionVpBase", 20)
          * Math.pow(read(economy, "cityEconomy.productionVpGrowth", 1.115), curveLevel - 1)
          + 0.000001
      );
      const endgameMultiplier = normalized > endgameStart
        ? Math.pow(read(economy, "cityEconomy.goldEndgameGrowth", 1.08), normalized - endgameStart)
        : 1;
      const raw = productionVp
        * read(economy, "cityEconomy.goldPerProductionVp", 15)
        * endgameMultiplier;
      return Number.isFinite(raw) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)) : Number.MAX_SAFE_INTEGER;
    }

    function getTroopsPerHour(level) {
      const raw = getVictoryPoints(level) * read(economy, "cityEconomy.troopsPerVictoryPoint", 10);
      return Number.isFinite(raw) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)) : Number.MAX_SAFE_INTEGER;
    }

    function getBaseWall(level) {
      const normalized = levelOf(level);
      const exponent = read(economy, "cityEconomy.wallDefenseExponent", 3);
      const transitionPower = Math.max(1, read(economy, "cityEconomy.wallDefenseTransitionPower", 8));
      const rawGrowth = (Math.pow(normalized, exponent) - 1)
        * read(economy, "cityEconomy.wallDefenseScale", 3);
      const smoothingExponent = Math.max(0, exponent - 1) / transitionPower;
      const smoothingDivisor = Math.pow(
        1 + Math.pow(
          normalized / Math.max(1, read(economy, "cityEconomy.wallDefenseTransitionLevel", 140)),
          transitionPower
        ),
        smoothingExponent
      );
      const raw = read(economy, "cityEconomy.wallDefenseBase", 200)
        + Math.max(0, smoothingDivisor > 0 ? rawGrowth / smoothingDivisor : rawGrowth);
      return Number.isFinite(raw) ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(raw)) : Number.MAX_SAFE_INTEGER;
    }

    function getRepairMinutes(level) {
      const raw = Math.round(
        read(economy, "siegeCombat.repairBaseMinutes", 15)
          + levelOf(level) * read(economy, "siegeCombat.repairMinutesPerLevel", 0.3)
      );
      return Number.isFinite(raw) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, raw)) : Number.MAX_SAFE_INTEGER;
    }

    function getUpgradeTargetHours(level) {
      const normalized = levelOf(level);
      const earlyEnd = read(economy, "cityEconomy.upgradeEarlyEndLevel", 50);
      const midEnd = read(economy, "cityEconomy.upgradeMidEndLevel", 100);
      const earlyStartHours = read(economy, "cityEconomy.upgradeEarlyStartHours", 0.1);
      const earlyEndHours = read(economy, "cityEconomy.upgradeEarlyEndHours", 4);
      const midEndHours = read(economy, "cityEconomy.upgradeMidEndHours", 36);
      if (normalized <= earlyEnd) {
        const progress = (normalized - 1) / Math.max(1, earlyEnd - 1);
        return earlyStartHours + (earlyEndHours - earlyStartHours) * Math.pow(progress, 1.35);
      }
      if (normalized <= midEnd) {
        const progress = (normalized - earlyEnd) / Math.max(1, midEnd - earlyEnd);
        return earlyEndHours + (midEndHours - earlyEndHours) * Math.pow(progress, 1.4);
      }
      const progress = (normalized - midEnd) / Math.max(1, 150 - midEnd);
      return Math.min(
        read(economy, "cityEconomy.upgradeMaximumHours", 720),
        midEndHours + (
          read(economy, "cityEconomy.upgradeLevel150Hours", 240) - midEndHours
        ) * Math.pow(progress, 1.5)
      );
    }

    function getUpgradeCost(level, reductionPercent = 0) {
      const raw = getGoldPerHour(level) * getUpgradeTargetHours(level);
      if (!Number.isFinite(raw)) return Number.MAX_SAFE_INTEGER;
      return Math.max(10, Math.floor(raw * (1 - clamp(reductionPercent, 0, 85) / 100) + 0.000001));
    }

    function getCitySnapshot(inputs = {}) {
      const level = levelOf(inputs.level);
      const taxPercent = getSkillPercent("taxStewardship", inputs.taxStewardshipLevel);
      const granariesPercent = getSkillPercent("royalGranaries", inputs.royalGranariesLevel);
      const stoneworksPercent = getSkillPercent("stoneworks", inputs.stoneworksLevel);
      const guildPercent = getSkillPercent("guildCharters", inputs.guildChartersLevel);
      const packagePercent = clamp(inputs.citadelPackagePercent, 0, 100);
      const upgradePackagePercent = clamp(inputs.citadelUpgradeReductionPercent, 0, 100);
      const defenderTroops = Math.max(0, Math.floor(finite(inputs.defenderTroops, 0)));
      const baseGoldPerHour = getGoldPerHour(level);
      const baseTroopsPerHour = getTroopsPerHour(level);
      const baseWall = getBaseWall(level);
      const stoneworksWall = Math.floor(baseWall * (1 + stoneworksPercent / 100));
      const fullWallPower = Math.floor(stoneworksWall * (1 + packagePercent / 100));
      const ownerGarrisonBasePower = Math.floor(
        defenderTroops * (1 + level * read(economy, "cityEconomy.defensePercentPerLevel", 2) / 100)
      );
      return {
        level,
        victoryPoints: getVictoryPoints(level),
        baseGoldPerHour,
        goldPerHour: Math.floor(baseGoldPerHour * (1 + (taxPercent + packagePercent) / 100)),
        baseTroopsPerHour,
        troopsPerHour: Math.floor(baseTroopsPerHour * (1 + (granariesPercent + packagePercent) / 100)),
        baseWall,
        stoneworksWall,
        fullWallPower,
        ownerGarrisonBasePower,
        ownerGarrisonPower: Math.floor(ownerGarrisonBasePower * (1 + packagePercent / 100)),
        repairMinutes: getRepairMinutes(level),
        upgradeCost: getUpgradeCost(level, guildPercent + upgradePackagePercent),
        taxPercent,
        granariesPercent,
        stoneworksPercent,
        guildPercent,
        packagePercent,
        upgradePackagePercent,
      };
    }

    function getAdvantageTier(ratio = 0) {
      const value = Math.max(0, finite(ratio, 0));
      if (value <= 1) return { key: "defeat", label: "Defeat expected" };
      if (value < 1.5) return { key: "costly", label: "Costly victory" };
      if (value < 2) return { key: "advantage", label: "Advantage" };
      if (value < 3) return { key: "strong", label: "Strong advantage" };
      return { key: "overwhelming", label: "Overwhelming advantage" };
    }

    function simulateSiege(inputs = {}) {
      const city = getCitySnapshot({
        level: inputs.cityLevel,
        stoneworksLevel: inputs.stoneworksLevel,
        defenderTroops: inputs.defenderTroops,
        citadelPackagePercent: inputs.objectiveDefensePercent,
      });
      const attackerTroops = Math.max(1, Math.floor(finite(inputs.attackerTroops, 1)));
      const reinforcementTroops = Math.max(0, Math.floor(finite(inputs.reinforcementTroops, 0)));
      const reinforcementDefensePercent = clamp(inputs.reinforcementDefensePercent, 0, 100);
      const swordmasteryPercent = getSkillPercent("swordmastery", inputs.swordmasteryLevel);
      const attackPowerPerTroop = RULES.baseAttackPowerPerTroop * (1 + swordmasteryPercent / 100);
      const attackPower = Math.floor(attackerTroops * attackPowerPerTroop);
      const wallIntegrityPercent = clamp(inputs.wallIntegrityPercent, 0, 100);
      const startingIntegrityBps = Math.floor(wallIntegrityPercent * 100);
      const startingWallPower = Math.floor(city.fullWallPower * startingIntegrityBps / 10_000);
      const reinforcementGarrisonPower = Math.floor(
        reinforcementTroops * (1 + reinforcementDefensePercent / 100)
      );
      const garrisonDefensePower = city.ownerGarrisonPower + reinforcementGarrisonPower;
      const defensePower = startingWallPower + garrisonDefensePower;
      const wallDamagePower = Math.min(attackPower, startingWallPower);
      const penetratingAttackPower = Math.max(0, attackPower - startingWallPower);
      const wallBreached = startingWallPower <= attackPower;
      const captured = wallBreached && penetratingAttackPower > garrisonDefensePower;
      const rawEndingIntegrityBps = city.fullWallPower > 0
        ? Math.max(0, startingIntegrityBps - Math.ceil(wallDamagePower * 10_000 / city.fullWallPower))
        : startingIntegrityBps;
      const meaningfulPercent = read(economy, "siegeCombat.meaningfulWallDamagePercent", 5);
      const meaningfulWallDamage = startingWallPower > 0 && (
        wallDamagePower * 100 >= city.fullWallPower * meaningfulPercent
          || rawEndingIntegrityBps <= 0
      );
      const totalDefenderTroops = Math.max(0, Math.floor(finite(inputs.defenderTroops, 0)))
        + reinforcementTroops;
      let attackerSurvivors = 0;
      let defenderSurvivors = totalDefenderTroops;
      let defenderLosses = 0;
      if (captured) {
        const remainingPower = Math.max(0, attackPower - defensePower);
        attackerSurvivors = clamp(
          Math.floor(attackerTroops * remainingPower / Math.max(attackPower, 1)),
          1,
          attackerTroops
        );
        defenderLosses = totalDefenderTroops;
        defenderSurvivors = 0;
      } else if (!wallBreached) {
        const pressure = clamp(attackPower / Math.max(1, startingWallPower), 0, 1);
        const capPercent = read(economy, "siegeCombat.intactWallDefenderLossCapPercent", 10) / 100;
        defenderLosses = Math.min(
          totalDefenderTroops,
          Math.floor(totalDefenderTroops * Math.min(capPercent, pressure * capPercent))
        );
        defenderSurvivors = Math.max(totalDefenderTroops > 0 ? 1 : 0, totalDefenderTroops - defenderLosses);
      } else {
        const pressure = clamp(penetratingAttackPower / Math.max(1, garrisonDefensePower), 0, 1);
        defenderLosses = Math.min(totalDefenderTroops, Math.floor(totalDefenderTroops * Math.min(0.82, pressure * 0.82)));
        defenderSurvivors = Math.max(totalDefenderTroops > 0 ? 1 : 0, totalDefenderTroops - defenderLosses);
      }
      const ratio = attackPower / Math.max(1, defensePower);
      const outcome = captured
        ? "capture"
        : wallBreached
          ? "garrison_hold"
          : "wall_hold";
      return {
        ...city,
        attackerTroops,
        swordmasteryPercent,
        attackPowerPerTroop,
        attackPower,
        wallIntegrityPercent,
        startingIntegrityBps,
        startingWallPower,
        wallDamagePower,
        penetratingAttackPower,
        garrisonDefensePower,
        ownerGarrisonPower: city.ownerGarrisonPower,
        reinforcementGarrisonPower,
        defensePower,
        wallBreached,
        captured,
        outcome,
        ratio,
        advantageTier: getAdvantageTier(ratio),
        meaningfulWallDamage,
        endingIntegrityBps: meaningfulWallDamage ? rawEndingIntegrityBps : startingIntegrityBps,
        attackerLosses: attackerTroops - attackerSurvivors,
        attackerSurvivors,
        defenderLosses,
        defenderSurvivors,
        totalDefenderTroops,
        minimumCaptureTroops: Math.max(1, Math.floor(defensePower / attackPowerPerTroop) + 1),
        minimumMeaningfulWallDamageTroops: startingWallPower > 0
          ? Math.max(1, Math.ceil(city.fullWallPower * meaningfulPercent / 100 / attackPowerPerTroop))
          : 0,
      };
    }

    return Object.freeze({
      config: economy,
      rules: RULES,
      getSkillPercent,
      getSkillMaximumLevel,
      getVictoryPoints,
      getGoldPerHour,
      getTroopsPerHour,
      getBaseWall,
      getRepairMinutes,
      getUpgradeTargetHours,
      getUpgradeCost,
      getCitySnapshot,
      getAdvantageTier,
      simulateSiege,
    });
  }

  return Object.freeze({ RULES, create });
});
