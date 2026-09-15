/* Loopback-only samples through the production renderer and event bindings. No server mutations. */
(async function () {
  if (location.hostname !== "127.0.0.1" || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark initialization timed out");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const source = state.cities.find(city => city.owner === "player");
  const target = state.cities.find(city => city.owner !== "player");
  Object.assign(source, { troops: 1000000, troopFloat: 1000000, level: 58, name: "Northwatch Keep" });
  Object.assign(target, { troops: 185000, troopFloat: 185000, level: 46, name: "Aurum Watch", isMainCity: false });
  usesServerArmyAuthority = () => true;
  supportsAuthoritativeArmyRoutes = () => false;
  scheduleAuthoritativeRoutePreviewRefresh = () => {};
  getMainCityAttackBlockReason = () => "";
  getPeaceShieldAttackBlockReason = () => "";
  getClanReinforcementBlockReason = () => "";
  getScoutReportForTarget = () => null;
  confirmTroopSliderOrder = () => { document.documentElement.dataset.militaryAction = "confirmed"; modal.close(); };
  focusActiveOperationLocation = request => { document.documentElement.dataset.militaryAction = `map:${request.type}:${request.id}`; modal.close(); };
  const snapshot = { marches: [], rallies: [], reinforcements: [], camps: [], strongholds: [] };
  getActiveOperationsSnapshot = () => snapshot;
  const camps = CAMP_REVIEW_DATA.slice(0, 4).map((row, i) => ({ id: row.id, name: row.name, regionId: row.regionId, campType: row.type, kind: "rewardCamp", owner: "player", artSrc: row.art, troops: 38450 + i * 500, currentGarrison: i === 1 ? 0 : 38450, payoutAtMs: i === 2 ? 0 : Date.now() + (i === 1 ? -1 : 187 + i * 97) * 1000, state: i === 0 ? "contested" : "held" }));
  const holds = HOLD_REVIEW_DATA.map((row, i) => ({ id: row.id, name: row.name, regionId: row.regionId, strongholdType: row.type, kind: "stronghold", owner: "player", artSrc: row.art, troops: 12850000 + i * 70000, level: row.level }));
  const samples = ["attack", "transfer", "no-item", "reinforce", "rally_create", "rally_join", "route-error", "stored-gear", "rounding", "camps", "strongholds", "empty-camps", "empty-strongholds"];
  function show(sample) {
    document.documentElement.dataset.militaryAction = "";
    state.shopItems[SWIFT_MARCH_ORDER_ITEM_ID] = sample === "no-item" ? 0 : 3;
    state.upgrades.swordmastery = sample === "rounding" ? 1 : 20;
    state.gear = normalizeCommonGearState({ instances: { reviewSword: { gearKey: "barracks_weapon_common_01", level: sample === "rounding" ? 1 : 4 } }, equipped: { barracks: { weapon: sample === "stored-gear" ? "" : "reviewSword" } } });
    if (sample.includes("camps") || sample.includes("strongholds")) {
      snapshot.camps = sample.startsWith("empty") ? [] : camps;
      snapshot.strongholds = sample.startsWith("empty") ? [] : holds;
      activeOperationsTab = sample.includes("camps") ? "camps" : "strongholds";
      modal.className = "modal outgoing-attack-modal"; renderOutgoingAttacksModalContent(snapshot);
      if (!modal.open) modal.showModal();
    } else {
      const kind = ["no-item", "route-error"].includes(sample) ? "transfer" : ["stored-gear", "rounding"].includes(sample) ? "attack" : sample;
      target.owner = kind === "transfer" ? "player" : "neutral";
      selectedTroopAmount = sample === "rounding" ? 1 : 750000;
      const route = { points: [{ x: source.x, y: source.y }, { x: target.x, y: target.y }], length: 800, previewStatus: "ready", authoritativeDurationSeconds: 476, authoritativeRequestedTroops: selectedTroopAmount, authoritativeSpeedMultiplier: 1.48, authoritativeError: sample === "route-error" ? "The route could not be confirmed. Try again." : "" };
      const percent = getCommonGearBonuses().attackStrength;
      const forecast = { version: COMBAT_FORECAST_VERSION, status: "unavailable", attackPowerPerTroop: getAttackPower(1, "player"), swordmasteryLevel: getSkillLevel("swordmastery"), swordmasteryPercent: getSkillPercent("swordmastery"), attackStrengthPercent: percent };
      modal.className = "modal";
      showTroopSliderModalWithRoute(source, target, route, { orderKind: kind, combatForecast: forecast });
    }
    document.documentElement.dataset.militarySample = sample;
  }
  const controls = document.createElement("div"); controls.style = "position:fixed;top:0;right:0;z-index:999999;background:#e8dbb8;color:#352f23;font:12px sans-serif";
  const picker = document.createElement("select"); picker.setAttribute("aria-label", "Runtime military example"); picker.innerHTML = samples.map(sample => `<option>${sample}</option>`).join(""); picker.addEventListener("change", () => show(picker.value)); controls.append(picker);
  const reopen = document.createElement("button"); reopen.textContent = "Reopen sample"; reopen.addEventListener("click", () => show(picker.value)); controls.append(reopen);
  modal.append(controls); show("attack"); document.documentElement.dataset.militaryRuntimeReady = "true";
})();
