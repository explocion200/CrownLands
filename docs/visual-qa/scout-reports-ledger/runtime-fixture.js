/* Local actual-game review. Synthetic snapshots and mock services; excluded from production. */
(async function () {
  if (!["127.0.0.1", "localhost"].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const target = state.cities.find(city => city.owner !== "player") || state.cities[0];
  const regionId = getCityRegionId(target);
  const examples = ["success", "reinforced", "damaged", "breached", "camp", "scouted", "scouted-camp", "scouted-unavailable", "blocked", "expired", "replaced", "legacy", "long", "zero-power", "expires-soon", "repair-soon"];
  clearOnlineServerReportWatcher();
  function make(sample) {
    const now = Date.now(), near = sample === "expires-soon", gameSeconds = state.gameSeconds;
    const intel = {
      cityId: target.id, cityName: "Thornfield", cityLevel: 2, targetType: "city", regionId, ownerUid: "scout-fixture-opponent", ownerName: "Lady Maeve", ownerFlag: state.flag,
      troops: 20000, ownerTroops: 15000, totalDefense: 65740, baseTotalDefense: 55058, baseCityWalls: 29058, cityWalls: 35450, stoneworksBonus: 5811,
      baseDefensePowerPerTroop: 1.3, defenseCombatVersion: DEFENSE_COMBAT_VERSION, siegeCombatVersion: SIEGE_COMBAT_VERSION,
      scoutedAtMs: now - (near ? 596000 : 30000), expiresAtMs: now + (near ? 4000 : 570000), scoutedAt: Math.max(0, gameSeconds - 30), expiresAt: gameSeconds + (near ? 4 : 570),
      baseAttackPercent: 25,
      reinforcements: [{ ownerUid: "scout-fixture-ally", ownerName: "Thane Rowan", troops: 5000, effectivePower: 7280, baseDefensePowerPerTroop: 1.3, shieldwallDisciplinePercent: 6, personalDefenseBonusPercent: 2, sharedDefenseBonusPercent: 1, gearDefenderStrengthPercent: 3 }],
      fortification: { baseCityWalls: 29058, reinforcedCityWalls: 35450, fullWallPower: 35450, startingWallPower: 35450, startingIntegrityBps: 10000, repairWindowMinutes: 16, repairAtMs: 0, ownerGarrisonDefensePower: 23010, reinforcementGarrisonDefensePower: 7280, garrisonDefensePower: 30290, stoneworksPercent: 20, shieldwallDisciplinePercent: 10, gearWallStrengthPercent: 2, gearDefenderStrengthPercent: 3, troopObjectiveDefenseBonusPercent: 5, defenseCombatVersion: DEFENSE_COMBAT_VERSION, baseDefensePowerPerTroop: 1.3 }
    };
    const skills = {};
    for (const [key, level, percent] of [["shieldwallDiscipline", 5, 10], ["stoneworks", 10, 20], ["fieldMedics", 3, 6], ["guildCharters", 4, 8], ["swordmastery", 8, 16], ["marchOrders", 3, 6], ["taxStewardship", 6, 12], ["royalGranaries", 5, 10]]) {
      intel[`${key}Level`] = level; intel[`${key}Percent`] = percent; skills[key] = { level, percent };
    }
    if (sample === "success") { intel.troops = 15000; intel.reinforcements = []; intel.fortification.garrisonDefensePower = 23010; intel.totalDefense = 58460; intel.baseTotalDefense = 48558; }
    if (["damaged", "repair-soon"].includes(sample)) { Object.assign(intel.fortification, { startingWallPower: 14180, startingIntegrityBps: 4000, repairAtMs: now + (sample === "repair-soon" ? 4000 : 120000) }); intel.totalDefense = 44470; intel.baseTotalDefense = 37623; }
    if (sample === "breached") { Object.assign(intel.fortification, { startingWallPower: 0, startingIntegrityBps: 0, repairAtMs: now + 400000 }); intel.totalDefense = 30290; intel.baseTotalDefense = 26000; }
    if (sample === "zero-power") { Object.assign(intel.fortification, { ownerGarrisonDefensePower: 0, reinforcementGarrisonDefensePower: 0, garrisonDefensePower: 0, startingWallPower: 0, startingIntegrityBps: 0 }); intel.reinforcements[0].effectivePower = 0; intel.totalDefense = 0; intel.baseTotalDefense = 0; }
    if (sample.includes("camp")) { Object.assign(intel, { targetType: "camp", cityName: "Warband Camp", troops: 18000, ownerTroops: 18000, totalDefense: 18000, baseTotalDefense: 18000, fortification: null, reinforcements: [] }); }
    if (sample === "legacy") Object.assign(intel, { fortification: null, defenseCombatVersion: 0, troops: 15000, reinforcements: [], totalDefense: 51050, baseTotalDefense: 44658, defensePercent: 4, cityDefenseBonus: 600 });
    if (sample === "long") {
      intel.ownerName = "Lord Maximilian of the Silver Company"; intel.reinforcements[0].ownerName = "Lady Eleonora of the Northern Marches";
      for (const key of ["troops", "ownerTroops", "totalDefense", "baseTotalDefense"]) intel[key] *= 100;
      for (const key of ["troops", "effectivePower"]) intel.reinforcements[0][key] *= 100;
      for (const key of ["baseCityWalls", "reinforcedCityWalls", "fullWallPower", "startingWallPower", "ownerGarrisonDefensePower", "reinforcementGarrisonDefensePower", "garrisonDefensePower"]) intel.fortification[key] *= 100;
    }
    const report = { id: `scout-runtime-${sample}`, type: "scout", outcome: "success", cityId: target.id, cityName: intel.cityName, cityLevel: 2, targetType: intel.targetType, regionId, opponentUid: intel.ownerUid, opponentName: intel.ownerName, opponentFlag: state.flag, occurredAtMs: now - 30000, summary: "Scout revealed the holding's defenses.", scoutReport: intel, expiresAtMs: intel.expiresAtMs };
    if (sample.startsWith("scouted")) {
      delete report.scoutReport; delete report.expiresAtMs;
      Object.assign(report, { scoutPerspective: "defender", sourceCityName: "Thornfield", sourceRegionId: regionId, cityName: "Oakbridge", summary: "Lady Maeve scouted your holding.", scoutDisclosure: sample === "scouted-unavailable" ? null : { targetType: intel.targetType, troops: intel.troops, ownerTroops: intel.ownerTroops, reinforcementTroops: intel.troops - intel.ownerTroops, totalDefense: intel.totalDefense, cityLevel: 2, wallIntegrityBps: 10000, skills, reinforcements: intel.reinforcements } });
    }
    if (["blocked", "expired", "replaced"].includes(sample)) {
      delete report.scoutReport; delete report.expiresAtMs;
      report.outcome = sample === "blocked" ? "blocked" : "failed";
      report.summary = sample === "blocked" ? "Veil of Silence blocked the scout. 1 scout returned." : sample === "expired" ? "This scout intelligence expired. Send a new scout for an updated snapshot." : "A newer scout replaced this intelligence.";
    }
    return report;
  }
  async function show(sample) {
    const report = make(sample);
    state.scoutReports = report.scoutReport ? { [target.id]: report.scoutReport } : {};
    state.battleReports = [report]; setOnlineReportSyncState("ready");
    await showBattleReportDetail(report.id);
    document.documentElement.dataset.scoutRuntimeSample = sample;
  }
  const picker = document.createElement("select"); picker.id = "scoutRuntimeExample"; picker.setAttribute("aria-label", "Runtime scout example");
  picker.style = "position:fixed;top:0;right:0;z-index:999999;height:22px;font:11px Arial;background:#e8dbb8;color:#352f23";
  picker.innerHTML = examples.map(name => `<option value="${name}">${name}</option>`).join("");
  picker.addEventListener("change", () => show(picker.value)); modal.append(picker);
  window.__scoutRuntimeReview = { show, make, targetId: target.id };
  await show("success");
  document.documentElement.dataset.scoutRuntimeReady = "true";
})();
