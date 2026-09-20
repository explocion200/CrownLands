"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const catalog = require("../functions/core-expansion-region-catalog.json");
const catalogRuntime = require("../region-catalog.js");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
const summaries = new Map(catalog.regions.map(region => [region.id, region]));
const activeRegions = catalog.regions.filter(region => region.lifecycle === "active");
const coreRegion = activeRegions.find(region => region.permanentCore && region.campCount);
const definition = JSON.parse(fs.readFileSync(path.join(root, coreRegion.regionDefinitionPath), "utf8"));
const destination = { ...definition.cities[0], regionId: coreRegion.id };
const camp = { ...definition.camps[0], regionId: coreRegion.id, targetType: "camp" };
const homeRegion = activeRegions.find(region => region.id !== coreRegion.id).id;
const functionSource = name => {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} is missing.`);
  return source.slice(source.slice(start - 6, start) === "async " ? start - 6 : start, source.indexOf("\n}", start) + 2);
};

function createSession() {
  const events = [];
  const context = {
    state: { cities: [] }, CORE_EXPANSION_TOPOLOGY_ACTIVE: true,
    REGION_CATALOG_RUNTIME: catalogRuntime, REGION_CATALOG_SUMMARIES_BY_ID: summaries,
    WORLD_REGION_IDS: [...summaries.keys()], DEFAULT_ONLINE_REGION_ID: homeRegion,
    cleanEditorRegionId: value => String(value || "").trim().toLowerCase(),
    getRegionIds: () => [...summaries.keys()], getRegionById: id => summaries.get(id),
    getPlayableBaseCityById: () => null,
    getArmyTargetById: id => context.state.cities.find(city => city.id === id) || null,
    getCampTargetById: id => context.getArmyTargetById(id)?.targetType === "camp" ? context.getArmyTargetById(id) : null,
    getActiveMapRegionId: () => context.activeRegion,
    activeRegion: homeRegion, onlineWorldConnected: false,
    modal: { open: true, close() { this.open = false; events.push("close"); } },
    scoutNearbySourceId: "old-source", regroupSourceId: "old-source", sendMode: true, selectedTargetId: "old-target",
    renderCrownlandsIcon: () => "map", renderBattleReportLedgerIcon: () => "map",
    escapeHtml: value => String(value || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    selectCity: id => events.push(["city", id, context.sendMode]),
    selectRewardCamp: id => events.push(["camp", id, context.sendMode]),
    showToast: message => events.push(["toast", message]),
    console: { warn() {} },
    async switchOnlineIsland(regionId) {
      events.push(["switch", regionId]);
      context.activeRegion = regionId;
      context.state.cities = [destination, camp];
      return true;
    },
  };
  vm.createContext(context);
  ["getDynamicNewLandsCityIdentity", "getCityRegionId", "getKnownCityId", "normalizeRegionId",
    "getResolvableReportCityId", "renderBattleReportLocateButton", "focusBattleReportTarget"]
    .forEach(name => vm.runInContext(functionSource(name), context));
  return { context, events };
}

async function main() {
  // Real current-world IDs, without a loaded city or region definition cache.
  // This models reports delivered while away and reopened after signing in.
  let cityCount = 0;
  const { context: cold } = createSession();
  for (const region of activeRegions.filter(region => region.permanentCore)) {
    const map = JSON.parse(fs.readFileSync(path.join(root, region.regionDefinitionPath), "utf8"));
    for (const city of map.cities) {
      for (const type of ["attack", "defense", "scout"]) {
        const html = cold.renderBattleReportLocateButton({ type, cityId: city.id, regionId: region.id, cityName: city.name });
        assert(!html.includes(" disabled"), `An unloaded ${type} target must be navigable: ${city.id}`);
        assert(html.includes(`data-report-region="${region.id}"`));
      }
      cityCount++;
    }
  }
  for (const report of [{}, { cityId: destination.id }, { cityId: "not-a-city", regionId: coreRegion.id },
    { cityId: destination.id, regionId: "missing-region" }]) {
    assert(cold.renderBattleReportLocateButton(report).includes(" disabled"), "Unknown target identity must remain unavailable.");
  }
  assert(!cold.renderBattleReportLocateButton({ cityId: camp.id, regionId: camp.regionId }).includes(" disabled"));
  const newLands = activeRegions.find(region => /^new-lands-l/.test(region.id));
  assert(newLands);
  assert(!cold.renderBattleReportLocateButton({ cityId: `${newLands.id}-city-01`, regionId: newLands.id }).includes(" disabled"));

  for (const target of [destination, camp]) {
    const { context, events } = createSession();
    await context.focusBattleReportTarget(target.id, target.regionId);
    assert.deepEqual(events[0], ["switch", target.regionId], "Navigate using the saved report region before resolving the city.");
    assert(events.some(event => Array.isArray(event) && event[0] === (target === camp ? "camp" : "city") && event[1] === target.id && event[2] === false));
    assert.equal(context.modal.open, false);
    assert(events.some(event => event[0] === "toast" && event[1] === `Viewing ${target.name}`));
  }

  const loaded = createSession();
  loaded.context.state.cities = [destination];
  loaded.context.activeRegion = destination.regionId;
  await loaded.context.focusBattleReportTarget(destination.id);
  assert(!loaded.events.some(event => event[0] === "switch"), "A cached current-map location does not require a connection.");
  assert(loaded.events.some(event => event[0] === "city"));

  for (const failure of ["offline", "rejected", "missing-target", "wrong-map"]) {
    const { context, events } = createSession();
    context.switchOnlineIsland = async regionId => {
      if (failure === "rejected") throw new Error("Network unavailable");
      if (failure === "offline") return false;
      context.activeRegion = regionId;
      context.state.cities = failure === "wrong-map" ? [{ ...destination, regionId: homeRegion }] : [];
      return true;
    };
    await context.focusBattleReportTarget(destination.id, destination.regionId);
    assert(!events.some(event => ["city", "camp"].includes(event[0])), `${failure}: do not select a missing or off-map target.`);
    assert(!events.some(event => event[0] === "toast" && event[1].startsWith("Viewing")), `${failure}: do not claim successful navigation.`);
    assert(events.some(event => event[0] === "toast"), `${failure}: show recovery feedback.`);
    assert.equal(context.modal.open, true, `${failure}: preserve the report until navigation succeeds.`);
  }
  console.log(`Validated report location links for ${cityCount} uncached Core cities, all report types, Camps, New Lands, and map-load recovery.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
