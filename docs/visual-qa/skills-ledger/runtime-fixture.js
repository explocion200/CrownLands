/* Local actual-game fixture; uses only the benchmark mock services. */
(async function () {
  if (!["127.0.0.1", "localhost"].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const sample = new URLSearchParams(location.search).get("sample");
  state.playerName = "Aldric";
  state.character.level = sample === "new" ? 10 : sample === "veteran" ? 151 : 76;
  state.gold = sample === "poor" ? 1200 : 185000;
  state.upgrades = { ...createDefaultSkills(), swordmastery: 15, marchOrders: 8, fieldMedics: 5, shieldwallDiscipline: 12, stoneworks: 8, taxStewardship: 10, royalGranaries: 7, guildCharters: 4 };
  if (sample === "new") state.upgrades = { ...createDefaultSkills(), swordmastery: 3, shieldwallDiscipline: 2, taxStewardship: 1, marchOrders: 1 };
  if (sample === "veteran") state.upgrades = { ...createDefaultSkills(), swordmastery: 30, shieldwallDiscipline: 25, marchOrders: 15, fieldMedics: 25, stoneworks: 20, taxStewardship: 10, royalGranaries: 10 };
  if (sample === "spent") state.upgrades = { ...createDefaultSkills(), swordmastery: 20, shieldwallDiscipline: 20, taxStewardship: 20, royalGranaries: 15 };
  state.skillPresets = normalizeSkillPresets(null);
  state.skillPresets = replaceLocalSkillPresetSlot(state.skillPresets, { ...state.skillPresets.slots[0], name: "War Council", saved: true, upgrades: { ...createDefaultSkills(), swordmastery: 18, marchOrders: 10, fieldMedics: 6, shieldwallDiscipline: 8, stoneworks: 4, taxStewardship: 5, royalGranaries: 6, guildCharters: 2 } });
  getShopPricingContext = () => ({ rawBaseGoldPerHour: 32400 });
  usesServerEconomyAuthority = () => false;
  saveGame = () => {}; queueOnlineSave = () => {};
  reconcileSkillPoints(state.character, state.upgrades);
  showProfileScreen(); showProfileSkills();
  document.documentElement.dataset.skillsRuntimeReady = "true";
})();
