"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const presentation = fs.readFileSync(path.join(root, "rallies-activity-ui.js"), "utf8");
function extract(name, next) {
  const start = game.indexOf(`function ${name}(`);
  const end = game.indexOf(`function ${next}(`, start);
  assert(start >= 0 && end > start, `Missing function ${name}`);
  return game.slice(start, end).replace(/async\s*$/, "");
}
async function main() {
  const city = { id: "origin", name: "Assembly", regionId: "west", owner: "player", ownerUid: "me", troops: 600 };
  const target = { id: "tower", kind: "holdingTower", regionId: "east", owner: "neutral" };
  const messages = [], opened = [], selections = [];
  let currentRegion = "west", scope = "me:world:one", finishSwitch;
  const context = vm.createContext({
    state: { clanId: "clan", clanRole: "leader" }, onlineClanRallies: [],
    lastSelectedOwnedCityId: city.id, selectedSourceId: "", selectedTargetId: "", scoutNearbySourceId: "", regroupSourceId: "",
    sendMode: false, activeTroopOrderKind: "", activeRallyOrderContext: null, selectedTroopAmount: 0,
    CLAN_RALLY_CREATOR_ROLES: ["leader", "officer"], holdingTowerActionsInFlight: new Set(),
    cityById: id => id === city.id ? city : null,
    getArmyTargetById: id => id === target.id ? target : null,
    getCurrentOnlineUid: () => "me", getCityRegionId: city => city.regionId,
    normalizeRegionId: value => value, isClanAllyCity: city => city.clanId === "clan",
    getHoldingTowerTargetType: target => target.kind === "holdingTower" ? "tower" : "city",
    isRallyObjectiveTarget: target => !!target && ["holdingTower", "stronghold", "citadel"].includes(target.kind),
    usesServerArmyAuthority: () => true, getOnlineApi: () => ({ isSignedIn: () => true, createClanRally() {} }),
    estimateArmyRouteLength: () => 10, getRouteHeuristicDistance: () => 10,
    rejectGameAction: value => messages.push(value), showToast: value => messages.push(value),
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    renderSelectionChangeNow() {}, showTroopSliderModalAsync: (...args) => opened.push(args),
    getHoldingTowerOrderPermission: tower => tower.allowed !== false,
    formatNumber: value => String(value), escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    modal: { open: true, close() { this.open = false; } }, closeProfileScreen: () => selections.push("closeProfile"),
    clearSelection: () => selections.push("clear"), selectCity: id => selections.push(id),
    selectClanTowerOnMap: async id => selections.push(id), getHoldingTowerVisual: () => target,
    centerOnWorldPoint: city => selections.push("center:" + city.id),
    getOnlineRequestScope: () => scope, getActiveMapRegionId: () => currentRegion,
    switchOnlineIsland: region => new Promise(resolve => { finishSwitch = () => { currentRegion = region; resolve(true); }; }),
  });
  vm.runInContext(presentation + "\n" +
    extract("rememberOwnedAttackSource", "getLastSelectedOwnedAttackCity") +
    extract("getLastSelectedOwnedAttackCity", "completeScoutMission") +
    extract("findLastSelectedAttackSource", "findPreferredAttackSource") +
    extract("canCurrentPlayerCreateClanRally", "beginCreateClanRally") +
    extract("beginCreateClanRally", "beginJoinClanRallyContribution") +
    extract("showHoldingTowerOrderComposer", "renderHoldingTowerMapOrder"), context);
  for (const kind of ["holdingTower", "stronghold", "citadel"]) {
    target.kind = kind;
    context.beginCreateClanRally(target);
    assert.equal(opened.at(-1)[0], city);
    assert.equal(opened.at(-1)[2].orderKind, "rally_create");
    assert.equal(context.selectedTroopAmount, 300);
  }
  target.kind = "holdingTower";
  context.showHoldingTowerOrderComposer(target, "rally-attack");
  assert.equal(opened.length, 4, "Tower must open the same slider without its source picker");
  for (const change of [
    () => { city.troops = 0; }, () => { city.troops = 600; city.owner = "enemy"; },
    () => { city.owner = "player"; context.lastSelectedOwnedCityId = "missing"; },
    () => { context.lastSelectedOwnedCityId = city.id; context.state.clanRole = "member"; },
    () => { context.state.clanRole = "leader"; target.owner = "player"; },
  ]) {
    change(); context.beginCreateClanRally(target);
    assert.equal(opened.length, 4, "Invalid source/permission must never silently pick another city");
  }
  target.owner = "neutral"; target.allowed = false;
  context.showHoldingTowerOrderComposer(target, "rally-attack");
  assert.equal(opened.length, 4);
  let previewRequest;
  context.supportsAuthoritativeArmyRoutes = () => true;
  context.getOnlineApi = () => ({ previewArmyRoute: async request => { previewRequest = request; return { points: [city, target] }; } });
  context.normalizeAuthoritativeRoutePreview = result => result;
  context.ONLINE_WORLD_ID = "world"; context.RESET_GENERATION = "one";
  vm.runInContext("async " + extract("requestAuthoritativeOrderRoute", "cancelAuthoritativeRoutePreviewRefresh"), context);
  await context.requestAuthoritativeOrderRoute(city, target, "rally_create", 600);
  assert.equal(previewRequest.targetType, "tower", "The shared slider must request the Tower route, not a city with that ID");
  assert.equal(previewRequest.fromId, city.id);
  assert.equal(previewRequest.requestedTroops, 600);
  const forming = { id: "r1", clanId: "clan", status: "forming", leaderUid: "me", assemblyCityId: city.id, assemblyRegionId: "west",
    participants: [{ status: "assembled", troops: 400 }, { status: "assembled", troops: 150 }, { status: "inbound", troops: 250 },
      { status: "returning", troops: 80 }, { status: "assembled", troops: Infinity }, { status: "assembled", troops: -20 }] };
  context.onlineClanRallies = [forming];
  assert.equal(context.getCityRallyAssembly(city).ready, 550);
  assert.equal(context.getCityRallyAssembly(city).inbound, 250);
  assert.equal(city.troops, 600, "Assembly display must not restore reserved troops to spendable garrison");
  assert.match(context.renderCityRallyAssemblyPanel(city), /550 ready here.*250 inbound/);
  forming.participants[2].status = "assembled";
  assert.equal(context.getCityRallyAssembly(city).ready, 800, "Only arrived contributions appear as ready");
  for (const status of ["launched", "recalling", "cancelled", "settled"]) {
    forming.status = status;
    assert.equal(context.getCityRallyAssembly(city).ready, 0);
  }
  forming.status = "forming";
  for (const [key, value] of [["clanId", "another"], ["assemblyRegionId", "east"], ["assemblyCityId", "other"], ["leaderUid", "former-owner"], ["assemblyType", "tower"]]) {
    const previous = forming[key]; forming[key] = value;
    assert.equal(context.getCityRallyAssembly(city).ready, 0, key);
    forming[key] = previous;
  }
  city.owner = "enemy"; city.clanId = "";
  assert.equal(context.getCityRallyAssembly(city).ready, 0, "Rivals cannot see private assembly troops");
  city.clanId = "clan";
  assert.equal(context.getCityRallyAssembly(city).ready, 800, "Clan members can see the assembly city");
  city.owner = "player";
  await context.focusClanRallyAssembly(forming);
  assert.deepEqual(selections, ["closeProfile", "clear", "origin", "center:origin"]);
  selections.length = 0;
  forming.assemblyRegionId = "east"; city.regionId = "east";
  const navigation = context.focusClanRallyAssembly(forming);
  finishSwitch(); await navigation;
  assert(selections.includes("origin"), "Cross-map shortcut must select the assembly city");
  currentRegion = "west"; selections.length = 0;
  const stale = context.focusClanRallyAssembly(forming);
  scope = "another-user:world:one"; finishSwitch(); await stale;
  assert.equal(selections.length, 0, "Account switch must invalidate a pending map jump");
  forming.assemblyCityName = '<unsafe "city">';
  assert.match(context.renderRallyAssemblyLink(forming), /&lt;unsafe &quot;city&quot;>/);
  console.log("Validated remembered Rally source, Tower routing, reserved/arriving troop visibility, privacy and assembly navigation.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
