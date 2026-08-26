(function () {
  "use strict";

  const config = window.CROWNLANDS_ECONOMY_CONFIG || {};
  const guideApi = window.CrownlandsBattleGuideCalculations;
  if (!guideApi?.create) return;
  const calculator = guideApi.create(config);
  const $ = id => document.getElementById(id);
  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const whole = (value, fallback = 0) => Math.max(0, Math.floor(number(value, fallback)));
  const format = value => Math.floor(number(value, 0)).toLocaleString("en-US");
  const compact = value => {
    const amount = Math.max(0, number(value, 0));
    if (amount >= 1e12) return `${(amount / 1e12).toFixed(amount >= 1e13 ? 0 : 1)}T`;
    if (amount >= 1e9) return `${(amount / 1e9).toFixed(amount >= 1e10 ? 0 : 1)}B`;
    if (amount >= 1e6) return `${(amount / 1e6).toFixed(amount >= 1e7 ? 0 : 1)}M`;
    if (amount >= 1e3) return `${(amount / 1e3).toFixed(amount >= 1e4 ? 0 : 1)}K`;
    return format(amount);
  };
  const percent = value => `${Math.max(0, number(value, 0)).toFixed(0)}%`;
  const formatRepairDuration = milliseconds => {
    const totalSeconds = Math.max(0, Math.round(number(milliseconds, 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (!minutes) return `${seconds}s`;
    return seconds ? `${format(minutes)}m ${seconds}s` : `${format(minutes)}m`;
  };
  const svgNode = (name, attributes = {}, text = "") => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  };

  const cityInputs = {
    levelRange: $("cityLevelRange"),
    levelNumber: $("cityLevelNumber"),
    tax: $("taxSkillLevel"),
    granaries: $("granarySkillLevel"),
    stoneworks: $("cityStoneworksLevel"),
    shieldwall: $("cityShieldwallLevel"),
    guild: $("guildSkillLevel"),
    package: $("cityCitadelPackage"),
    defenders: $("cityDefenderTroops"),
  };

  function getCityPackage() {
    const [statPercent, upgradePercent] = String(cityInputs.package?.value || "0:0")
      .split(":")
      .map(value => Math.max(0, number(value, 0)));
    return { statPercent, upgradePercent };
  }

  function getCityControlValues(levelOverride = null) {
    const packageValue = getCityPackage();
    return {
      level: levelOverride ?? whole(cityInputs.levelNumber?.value, 1),
      taxStewardshipLevel: whole(cityInputs.tax?.value),
      royalGranariesLevel: whole(cityInputs.granaries?.value),
      stoneworksLevel: whole(cityInputs.stoneworks?.value),
      shieldwallDisciplineLevel: whole(cityInputs.shieldwall?.value),
      guildChartersLevel: whole(cityInputs.guild?.value),
      citadelPackagePercent: packageValue.statPercent,
      citadelUpgradeReductionPercent: packageValue.upgradePercent,
      defenderTroops: whole(cityInputs.defenders?.value),
    };
  }

  function drawLineChart(svg, observations, selectedLevel, options = {}) {
    if (!svg || !observations.length) return;
    const width = 680;
    const height = 230;
    const margin = { top: 16, right: 22, bottom: 34, left: 66 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const minimumLevel = observations[0].level;
    const maximumLevel = observations[observations.length - 1].level;
    const rawValues = observations.map(row => Math.max(options.logarithmic ? 1 : 0, row.value));
    const transform = value => options.logarithmic ? Math.log10(Math.max(1, value)) : value;
    const transformed = rawValues.map(transform);
    const minimumValue = options.logarithmic ? Math.min(...transformed) : 0;
    const maximumValue = Math.max(minimumValue + 1, ...transformed);
    const x = level => margin.left + (level - minimumLevel) / Math.max(1, maximumLevel - minimumLevel) * plotWidth;
    const y = value => margin.top + plotHeight - (transform(value) - minimumValue) / Math.max(1e-9, maximumValue - minimumValue) * plotHeight;
    const inverse = value => options.logarithmic ? Math.pow(10, value) : value;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.append(
      svgNode("title", {}, options.title || "City progression chart"),
      svgNode("desc", {}, `${options.title || "Value"} from Level ${minimumLevel} through Level ${maximumLevel}; selected Level ${selectedLevel}.`),
      svgNode("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight, class: "chart-frame" })
    );
    for (let index = 0; index <= 4; index += 1) {
      const portion = index / 4;
      const transformedTick = minimumValue + (maximumValue - minimumValue) * portion;
      const tickValue = inverse(transformedTick);
      const tickY = margin.top + plotHeight - portion * plotHeight;
      svg.append(
        svgNode("line", { x1: margin.left, x2: width - margin.right, y1: tickY, y2: tickY, class: "chart-grid-line" }),
        svgNode("text", { x: margin.left - 9, y: tickY + 4, "text-anchor": "end" }, compact(tickValue))
      );
    }
    const tickLevels = [...new Set([minimumLevel, Math.round(maximumLevel / 3), Math.round(maximumLevel * 2 / 3), maximumLevel])]
      .filter(level => level >= minimumLevel && level <= maximumLevel);
    tickLevels.forEach(level => {
      svg.append(svgNode("text", { x: x(level), y: height - 11, "text-anchor": level === minimumLevel ? "start" : level === maximumLevel ? "end" : "middle" }, `L${level}`));
    });
    const pathData = observations.map((row, index) => `${index ? "L" : "M"}${x(row.level).toFixed(2)},${y(row.value).toFixed(2)}`).join(" ");
    svg.append(svgNode("path", { d: pathData, class: "chart-line" }));
    const selected = observations.reduce((best, row) => (
      Math.abs(row.level - selectedLevel) < Math.abs(best.level - selectedLevel) ? row : best
    ), observations[0]);
    const markerX = x(selected.level);
    const markerY = y(selected.value);
    const marker = svgNode("circle", { cx: markerX, cy: markerY, r: 6, class: "chart-marker", tabindex: "0" });
    marker.append(svgNode("title", {}, `Level ${selected.level}: ${format(selected.value)} ${options.unit || ""}`.trim()));
    const useEndAnchor = markerX > width - 150;
    svg.append(
      marker,
      svgNode("text", {
        x: markerX + (useEndAnchor ? -10 : 10),
        y: Math.max(margin.top + 13, markerY - 10),
        "text-anchor": useEndAnchor ? "end" : "start",
        class: "chart-value-label",
      }, `L${selected.level}: ${compact(selected.value)}${options.unit || ""}`)
    );
  }

  function updateCityExplorer() {
    const values = getCityControlValues();
    const level = Math.max(1, values.level);
    const snapshot = calculator.getCitySnapshot(values);
    if (cityInputs.levelNumber) cityInputs.levelNumber.value = String(level);
    if (cityInputs.levelRange && level <= 150) cityInputs.levelRange.value = String(level);
    $("cityLevelOutput").textContent = format(level);
    $("taxSkillOutput").textContent = `Lv ${values.taxStewardshipLevel} · +${snapshot.taxPercent}%`;
    $("granarySkillOutput").textContent = `Lv ${values.royalGranariesLevel} · +${snapshot.granariesPercent}%`;
    $("cityStoneworksOutput").textContent = `Lv ${values.stoneworksLevel} · +${snapshot.stoneworksPercent}%`;
    $("cityShieldwallOutput").textContent = `Lv ${values.shieldwallDisciplineLevel} · +${snapshot.shieldwallPercent}%`;
    $("guildSkillOutput").textContent = `Lv ${values.guildChartersLevel} · −${snapshot.guildPercent}%`;
    $("cityVictoryPoints").textContent = format(snapshot.victoryPoints);
    $("cityVictoryHelp").textContent = `${format(snapshot.victoryPoints * config.cityEconomy.troopsPerVictoryPoint)} base troops/hour`;
    $("cityGoldProduction").textContent = `${format(snapshot.goldPerHour)}/h`;
    $("cityGoldHelp").textContent = `Base ${format(snapshot.baseGoldPerHour)}/h · +${snapshot.taxPercent + snapshot.packagePercent}%`;
    $("cityTroopProduction").textContent = `${format(snapshot.troopsPerHour)}/h`;
    $("cityTroopHelp").textContent = `Base ${format(snapshot.baseTroopsPerHour)}/h · +${snapshot.granariesPercent + snapshot.packagePercent}%`;
    $("cityWallPower").textContent = format(snapshot.fullWallPower);
    $("cityWallHelp").textContent = `Base ${format(snapshot.baseWall)} · Stoneworks +${snapshot.stoneworksPercent}%`;
    $("cityGarrisonDefense").textContent = format(snapshot.ownerGarrisonPower);
    $("cityGarrisonHelp").textContent = `${format(values.defenderTroops)} troops · ${snapshot.baseDefensePowerPerTroop.toFixed(2)} base · Shieldwall +${snapshot.shieldwallPercent}% · objective +${snapshot.packagePercent}%`;
    $("cityUpgradeCost").textContent = `${format(snapshot.upgradeCost)} gold`;
    $("cityUpgradeHelp").textContent = `${Math.min(85, snapshot.guildPercent + snapshot.upgradePackagePercent)}% total reduction`;
    $("cityRepairTime").textContent = `${format(snapshot.repairMinutes)}m`;

    const plottedMaximum = Math.max(150, Math.min(500, level));
    const step = Math.max(1, Math.ceil(plottedMaximum / 180));
    const levels = [];
    for (let current = 1; current <= plottedMaximum; current += step) levels.push(current);
    if (levels[levels.length - 1] !== plottedMaximum) levels.push(plottedMaximum);
    const selectedChartLevel = Math.min(level, plottedMaximum);
    const series = levels.map(current => ({ current, snapshot: calculator.getCitySnapshot(getCityControlValues(current)) }));
    drawLineChart($("goldLevelChart"), series.map(row => ({ level: row.current, value: row.snapshot.goldPerHour })), selectedChartLevel, { title: "Gold production by city level", unit: "/h", logarithmic: true });
    drawLineChart($("troopLevelChart"), series.map(row => ({ level: row.current, value: row.snapshot.troopsPerHour })), selectedChartLevel, { title: "Troop production by city level", unit: "/h" });
    drawLineChart($("wallLevelChart"), series.map(row => ({ level: row.current, value: row.snapshot.fullWallPower })), selectedChartLevel, { title: "Full wall power by city level" });
    drawLineChart($("repairLevelChart"), series.map(row => ({ level: row.current, value: row.snapshot.repairMinutes })), selectedChartLevel, { title: "Full-breach wall repair minutes by city level", unit: "m" });

    const milestones = [...new Set([1, 25, 50, 75, 100, 150, level])].sort((a, b) => a - b);
    $("cityMilestoneRows").innerHTML = milestones.map(milestone => {
      const row = calculator.getCitySnapshot(getCityControlValues(milestone));
      return `<tr data-selected="${milestone === level}"><th scope="row">${format(milestone)}</th><td>${format(row.victoryPoints)}</td><td>${format(row.goldPerHour)}</td><td>${format(row.troopsPerHour)}</td><td>${format(row.fullWallPower)}</td><td>${format(row.repairMinutes)}m</td></tr>`;
    }).join("");
  }

  const skillDefinitions = [
    { id: "swordmastery", name: "Swordmastery", role: "Offense", change: "Outgoing attack power locked at launch", not: "Walls, garrison defense, or troop count" },
    { id: "shieldwallDiscipline", name: "Shieldwall Discipline", role: "Defense", change: "The owner soldier or reinforcement soldier defense package", not: "Walls, troop count, or attack power" },
    { id: "stoneworks", name: "Stoneworks", role: "Defense", change: "The holding owner’s single wall", not: "Garrison troops or reinforcement walls" },
    { id: "taxStewardship", name: "Tax Stewardship", role: "Economy", change: "Normal city base gold production", not: "Reward minimums or troop production" },
    { id: "royalGranaries", name: "Royal Granaries", role: "Economy", change: "Normal city base troop production", not: "Existing troops or attack power per troop" },
    { id: "guildCharters", name: "Guild Charters", role: "Growth", change: "Regular city upgrade cost", not: "Upgrade time, city level, or Strongholds" },
    { id: "marchOrders", name: "March Orders", role: "Logistics", change: "Attack, transfer, scout, and regroup travel speed", not: "Combat power or route distance" },
    { id: "fieldMedics", name: "Field Medics", role: "Recovery", change: "A share of eligible battle losses returned to the main city", not: "The battle outcome or immediate survivors" },
  ];

  function renderSkills() {
    $("skillGuideRows").innerHTML = skillDefinitions.map(skill => {
      const row = config.skills?.[skill.id] || {};
      const maximumLevel = calculator.getSkillMaximumLevel(skill.id);
      return `<tr><th scope="row">${skill.name}</th><td>${skill.role}</td><td>+${format(row.percentPerLevel || 0)}%</td><td>+${format(row.maxPercent || 0)}% at Lv ${format(maximumLevel)}</td><td>${skill.change}</td><td>${skill.not}</td></tr>`;
    }).join("");
  }

  const battleInputs = {
    attackers: $("battleAttackerTroops"),
    sword: $("battleSwordLevel"),
    shieldwall: $("battleShieldLevel"),
    cityLevel: $("battleCityLevel"),
    defenders: $("battleDefenderTroops"),
    reinforcements: $("battleReinforcementTroops"),
    reinforcementBonus: $("battleReinforcementBonus"),
    stoneworks: $("battleStoneLevel"),
    objective: $("battleObjectiveDefense"),
    wall: $("battleWallIntegrity"),
  };
  let battlePerspective = "attacker";
  let latestBattle = null;

  const battlePresets = {
    wall: { attackers: 300000, sword: 0, shieldwall: 30, cityLevel: 50, defenders: 1000000, reinforcements: 0, reinforcementBonus: 0, stoneworks: 25, objective: 0, wall: 100 },
    garrison: { attackers: 1000000, sword: 0, shieldwall: 30, cityLevel: 50, defenders: 1000000, reinforcements: 0, reinforcementBonus: 0, stoneworks: 0, objective: 0, wall: 0 },
    capture: { attackers: 1100000, sword: 30, shieldwall: 30, cityLevel: 50, defenders: 1000000, reinforcements: 0, reinforcementBonus: 0, stoneworks: 0, objective: 0, wall: 0 },
    damaged: { attackers: 1000000, sword: 30, shieldwall: 30, cityLevel: 100, defenders: 1000000, reinforcements: 0, reinforcementBonus: 0, stoneworks: 25, objective: 0, wall: 0 },
  };

  function getBattleValues() {
    return {
      attackerTroops: Math.max(1, whole(battleInputs.attackers?.value, 1)),
      swordmasteryLevel: whole(battleInputs.sword?.value),
      shieldwallDisciplineLevel: whole(battleInputs.shieldwall?.value),
      cityLevel: Math.max(1, whole(battleInputs.cityLevel?.value, 1)),
      defenderTroops: whole(battleInputs.defenders?.value),
      reinforcementTroops: whole(battleInputs.reinforcements?.value),
      reinforcementDefensePercent: whole(battleInputs.reinforcementBonus?.value),
      stoneworksLevel: whole(battleInputs.stoneworks?.value),
      objectiveDefensePercent: whole(battleInputs.objective?.value),
      wallIntegrityPercent: whole(battleInputs.wall?.value),
    };
  }

  function outcomeTitle(result) {
    if (result.outcome === "capture") return "City captured";
    if (result.outcome === "garrison_hold") return "Wall breached; garrison holds";
    return "Wall holds";
  }

  function updatePerspectiveText() {
    if (!latestBattle) return;
    const text = battlePerspective === "attacker"
      ? latestBattle.captured
        ? `Your army clears both defensive layers. About ${format(latestBattle.attackerSurvivors)} troops remain after all ${format(latestBattle.defensePower)} resolved defense power is paid.`
        : `Your attack cannot capture this snapshot. It needs ${format(latestBattle.minimumCaptureTroops)} committed troops at the selected Swordmastery, ${format(Math.max(0, latestBattle.minimumCaptureTroops - latestBattle.attackerTroops))} more than selected.`
      : latestBattle.captured
        ? `The current wall and garrison are short of the attack by ${format(Math.max(0, latestBattle.attackPower - latestBattle.defensePower))} power. Reinforcements, repaired integrity, or applicable defense bonuses must close that gap before arrival.`
        : latestBattle.outcome === "wall_hold"
          ? `The wall stops all penetrating power. Defenders lose no more than ${format(config.siegeCombat.intactWallDefenderLossCapPercent)}%, and ${format(latestBattle.defenderSurvivors)} troops remain behind the holding.`
          : `The wall falls, but the garrison’s ${format(latestBattle.garrisonDefensePower)} defense exceeds the ${format(latestBattle.penetratingAttackPower)} power that reaches it. ${format(latestBattle.defenderSurvivors)} defenders remain.`;
    $("battlePerspectiveText").textContent = text;
    $("attackerPerspectiveBtn").setAttribute("aria-selected", String(battlePerspective === "attacker"));
    $("defenderPerspectiveBtn").setAttribute("aria-selected", String(battlePerspective === "defender"));
  }

  function updateBattleExplorer() {
    const values = getBattleValues();
    const result = calculator.simulateSiege(values);
    latestBattle = result;
    $("battleSwordOutput").textContent = `Lv ${values.swordmasteryLevel} · +${result.swordmasteryPercent}%`;
    $("battleShieldOutput").textContent = `Lv ${values.shieldwallDisciplineLevel} · +${result.shieldwallPercent}%`;
    $("battleStoneOutput").textContent = `Lv ${values.stoneworksLevel} · +${result.stoneworksPercent}%`;
    $("battleWallOutput").textContent = `${values.wallIntegrityPercent}%`;
    const title = outcomeTitle(result);
    $("battleOutcomeBanner").dataset.outcome = result.outcome;
    $("battleOutcomeTitle").textContent = title;
    $("battleOutcomeTier").textContent = `${result.advantageTier.label} · ${result.ratio.toFixed(2)}× total defense`;
    $("battleAttackPower").textContent = format(result.attackPower);
    $("battleAttackFormula").textContent = `${format(result.attackerTroops)} troops · ${result.attackPowerPerTroop.toFixed(2)} power each`;
    $("battleWallAbsorbed").textContent = format(result.wallDamagePower);
    $("battleWallStart").textContent = `${format(result.startingWallPower)} current · ${format(result.fullWallPower)} full`;
    $("battlePenetratingPower").textContent = format(result.penetratingAttackPower);
    $("battleGarrisonComparison").textContent = `vs ${format(result.garrisonDefensePower)} garrison defense`;
    $("battlePipelineResult").textContent = title;
    $("battleCaptureRule").textContent = result.captured
      ? `${format(result.penetratingAttackPower)} is greater than ${format(result.garrisonDefensePower)}`
      : result.wallBreached
        ? `${format(result.penetratingAttackPower)} is not greater than ${format(result.garrisonDefensePower)}`
        : "No attack power reaches the garrison";
    $("battleMinimumForce").textContent = format(result.minimumCaptureTroops);
    const shortfall = Math.max(0, result.minimumCaptureTroops - result.attackerTroops);
    $("battleShortfall").textContent = shortfall ? `Short by ${format(shortfall)}` : `Threshold met by ${format(result.attackerTroops - result.minimumCaptureTroops)} troops`;
    $("battleAttackerLosses").textContent = `${format(result.attackerLosses)} (${percent(result.attackerLosses * 100 / result.attackerTroops)})`;
    $("battleAttackerSurvivors").textContent = `${format(result.attackerSurvivors)} return`;
    $("battleDefenderLosses").textContent = `${format(result.defenderLosses)} (${percent(result.totalDefenderTroops ? result.defenderLosses * 100 / result.totalDefenderTroops : 0)})`;
    $("battleDefenderSurvivors").textContent = `${format(result.defenderSurvivors)} remain`;
    $("battleEndingWall").textContent = `${(result.endingIntegrityBps / 100).toFixed(result.endingIntegrityBps % 100 ? 1 : 0)}%`;
    $("battleRepairResult").textContent = result.meaningfulWallDamage
      ? `${result.endingIntegrityBps <= 0 ? "Breached" : "Persistent damage"} · adds ${formatRepairDuration(result.repairAddedMs)}`
      : result.startingWallPower <= 0
        ? "Already breached · active deadline unchanged"
        : `Below ${format(config.siegeCombat.meaningfulWallDamagePercent)}% · no persistent timer`;
    const maximumBar = Math.max(1, result.attackPower, result.startingWallPower, result.garrisonDefensePower);
    const setBar = (id, value) => { $(id).style.width = `${Math.max(0, Math.min(100, value / maximumBar * 100))}%`; };
    setBar("attackPowerBar", result.attackPower);
    setBar("wallPowerBar", result.startingWallPower);
    setBar("garrisonPowerBar", result.garrisonDefensePower);
    $("attackPowerBarValue").textContent = format(result.attackPower);
    $("wallPowerBarValue").textContent = format(result.startingWallPower);
    $("garrisonPowerBarValue").textContent = format(result.garrisonDefensePower);
    updatePerspectiveText();
  }

  function applyBattlePreset(name) {
    const preset = battlePresets[name];
    if (!preset) return;
    Object.entries(preset).forEach(([key, value]) => {
      if (battleInputs[key]) battleInputs[key].value = String(value);
    });
    document.querySelectorAll("[data-battle-preset]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.battlePreset === name));
    });
    updateBattleExplorer();
  }

  function renderStaticValues() {
    const pickups = config.pickups || {};
    $("pickupEconomyText").textContent = `First pickup after ${format(pickups.initialSpawnDelayMinutes)} minutes · then ${format(pickups.respawnAfterCollectionMinutes)} minute after each collection · center-biased placement · ${format(pickups.goldAwardProductionMinutes)} minutes of stored production · daily cap ${format(pickups.dailyGoldCap)} gold and ${format(pickups.dailyTroopCap)} troop pickups`;
    const repairExamples = [
      { label: "Level 1 city", level: 1 },
      { label: "Level 25 city", level: 25 },
      { label: "Stronghold / Level 50 city", level: 50 },
      { label: "Level 75 city", level: 75 },
      { label: "Citadel / Level 100 city", level: 100 },
      { label: "Level 150 city", level: 150 },
      { label: "Level 200 city", level: 200 },
      { label: "Level 500 city", level: 500 },
    ];
    $("repairExampleRows").innerHTML = repairExamples.map(row => {
      const fullRepairMs = calculator.getRepairMinutes(row.level) * 60_000;
      return `<tr><th scope="row">${row.label}</th><td>${format(row.level)}</td><td>${formatRepairDuration(fullRepairMs * 0.05)}</td><td>${formatRepairDuration(fullRepairMs * 0.2)}</td><td>${formatRepairDuration(fullRepairMs * 0.5)}</td><td>${formatRepairDuration(fullRepairMs)}</td></tr>`;
    }).join("");
  }

  cityInputs.levelRange?.addEventListener("input", () => {
    cityInputs.levelNumber.value = cityInputs.levelRange.value;
    updateCityExplorer();
  });
  cityInputs.levelNumber?.addEventListener("input", updateCityExplorer);
  Object.entries(cityInputs).filter(([key]) => !["levelRange", "levelNumber"].includes(key)).forEach(([, input]) => input?.addEventListener("input", updateCityExplorer));
  Object.values(battleInputs).forEach(input => input?.addEventListener("input", () => {
    document.querySelectorAll("[data-battle-preset]").forEach(button => button.setAttribute("aria-pressed", "false"));
    updateBattleExplorer();
  }));
  document.querySelectorAll("[data-battle-preset]").forEach(button => button.addEventListener("click", () => applyBattlePreset(button.dataset.battlePreset)));
  $("attackerPerspectiveBtn")?.addEventListener("click", () => { battlePerspective = "attacker"; updatePerspectiveText(); });
  $("defenderPerspectiveBtn")?.addEventListener("click", () => { battlePerspective = "defender"; updatePerspectiveText(); });

  renderSkills();
  renderStaticValues();
  updateCityExplorer();
  applyBattlePreset("wall");
})();
