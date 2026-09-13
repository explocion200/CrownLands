/* Local actual-game fixture. Never packaged or connected to production services. */
(async function () {
  if (!["127.0.0.1", "localhost"].includes(location.hostname) || !window.__CROWNLANDS_BENCHMARK__) throw Error("Local benchmark required");
  const deadline = Date.now() + 60000;
  while (window.__CROWNLANDS_BENCHMARK__.getStatus().status !== "ready") {
    if (Date.now() > deadline) throw Error("Benchmark did not initialize");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const sample = new URLSearchParams(location.search).get("sample");
  const originalSummary = getKingdomSummary;
  const summary = { kingPower: 184720, cities: 18, gold: 2456800, troops: 186450, baseGoldProductionPerHour: 192000, goldProductionPerHour: 268800, baseTroopProductionPerHour: 14200, troopProductionPerHour: 19880 };
  if (sample === "large") Object.assign(summary, { kingPower: 284720190, cities: 1284, gold: 9245680120, troops: 786452190, baseGoldProductionPerHour: 15248000, goldProductionPerHour: 23176960, baseTroopProductionPerHour: 2648000, troopProductionPerHour: 3972000 });
  getKingdomSummary = () => ({ ...originalSummary(), ...summary });
  state.playerName = sample === "large" ? "AlexandriaIronwood" : "Aldric";
  state.character.level = sample === "large" ? 150 : 42;
  state.character.xp = Math.floor(getXpRequiredForLevel(state.character.level) * .66);
  state.flag = normalizeFlag({ version: 2, primary: "#596044", secondary: "#C5AD75", symbolColor: "#F2E2BF", pattern: "diagonal", symbol: "crown" });
  state.clanId = sample === "new" ? "" : "fixture_clan";
  state.clanName = sample === "large" ? "Wardens of the Northern Marches" : "The Greywatch";
  state.clanTag = sample === "large" ? "WARD" : "OAK";
  if (sample === "new") { state.character.level = 1; state.character.xp = 0; }
  const current = structuredClone(window.AchievementReviewSamples.mixed);
  current.serverTimeMs = Date.now();
  current.seasonEndsAtMs = Date.now() + 17 * 86400000;
  seasonalAchievementState = normalizeSeasonalAchievementState(current, Date.now());
  getSeasonalAchievementNowMs = () => Date.now();
  seasonalAchievementStatusLoading = false; seasonalAchievementError = "";
  const api = getOnlineApi();
  getOnlineApi = () => ({ ...api, getSeasonalAchievementStatus: async () => ({ seasonalAchievementState: structuredClone(current), serverTimeMs: Date.now() }) });
  supportsSeasonalAchievements = () => sample !== "unavailable";
  saveGame = () => {}; queueOnlineSave = () => {};
  if (sample === "loading" || sample === "unavailable") seasonalAchievementState = null;
  showProfileScreen();
  document.documentElement.dataset.profileRuntimeReady = "true";
})();
