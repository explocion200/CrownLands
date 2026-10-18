"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "game.js"), "utf8");
const runtime = require("../region-catalog.js");
const topology = require("../functions/coreExpansionTopology.js");
function extract(name) {
  const match = source.match(new RegExp(`^function ${name}\\([^]*?^}\\r?$`, "m"));
  assert(match, `Missing ${name}`);
  return match[0];
}
function fixture() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "assets/worlds/core-expansion-v1/region-catalog.json")));
  const regions = catalog.regions.map(region => ({ ...region }));
  const regionId = "new-lands-l03-p013";
  const identity = topology.parseNewLandsRegionId(regionId);
  const template = catalog.regions.find(region => region.purpose === "player_region");
  const descriptor = { ...template, ...topology.getRegionAtActivationOrdinal(identity.activationOrdinal),
    templateRegionId: template.id, templateDefinitionPath: template.regionDefinitionPath,
    regionDefinitionPath: template.regionDefinitionPath };
  assert(!regions.some(region => region.id === regionId), "The regression requires a server-expanded map absent from bundled assets");
  const c = {
    CORE_EXPANSION_TOPOLOGY_ACTIVE: true, REGION_CATALOG: catalog, REGION_CATALOG_RUNTIME: runtime,
    REGION_CATALOG_SUMMARIES_BY_ID: new Map(regions.map(region => [region.id, region])),
    REGION_DEFINITION_LOADER: runtime.createRegionDefinitionLoader({ catalog, fetchJson: () => { throw Error("Roster verification must not load map artwork/definitions"); } }),
    WORLD_REGIONS: regions, WORLD_REGIONS_BY_ID: new Map(regions.map(region => [region.id, region])),
    WORLD_REGION_IDS: regions.map(region => region.id), WORLD_CONFIG: {}, STARTER_REGION_TYPE: "starter",
    ACTIVE_WORLD_REGION_IDS: new Set(regions.map(region => region.id)), STATIC_ACTIVE_WORLD_REGION_IDS: new Set(regions.map(region => region.id)),
    DEFAULT_ONLINE_REGION_ID: regions[0].id, RESET_GENERATION: "realm-2026-10", ONLINE_WORLD_ID: "main-realm-2026-10", REALM_SHARD_ID: "shard_0001",
    appliedCoreExpansionState: null, editorMapCache: new Map(),
    cleanRegionType: value => value || "starter", labelFromEditorRegionId: value => value,
    getPlayableBaseCityById: () => null, state: { cities: [], playerName: "Fixture" },
    cityById: id => c.state.cities.find(city => city.id === id),
    getCurrentOnlineUid: () => "fixture-owner", resolvePlayerIdentityForUid: () => null,
    getCityTroopFallback: () => 0, getCanonicalCityName: (base, raw) => raw.name || raw.id,
    normalizePowerValue: value => Number(value) || 0, normalizeTimestampMs: value => Number(value) || 0,
    readCityTroops: value => Number(value) || 0, readCityTroopFloat: value => Number(value) || 0,
    clampCityLevel: value => Math.max(1, Number(value) || 1), isStronghold: city => city?.kind === "stronghold",
    getStrongholdVisualSize: () => 1, getStrongholdDefenseLevel: city => city.level,
    getGlobalStatsSnapshot: () => ({ totalCities: 46 }), hasUsableGlobalStats: () => true,
    getActiveMapRegionId: () => regions[0].id, playerCities: () => c.state.cities,
    getCityRegionId: city => city.regionId, normalizeSingleMainCityAssignment() {},
    updateIslandSummariesFromOwnedCityCache() {}, updateOutgoingAttackUi() {}, updateIslandSwitcherUi() {},
    modal: { open: false }, onlineOwnedCitiesCache: [], onlineOwnedCitiesCacheComplete: false,
  };
  vm.createContext(c);
  for (const name of ["cleanEditorRegionId", "buildCatalogEditorMap", "buildDefaultEditorRegion", "getRegionById", "getRegionIds",
    "normalizeRegionId", "registerCoreExpansionRegions", "applyCoreExpansionRealmState", "getDynamicNewLandsCityIdentity",
    "getKnownCityId", "getRegionIdFromOnlineIslandId", "getOnlineIslandId", "normalizeOwnedCitySnapshot", "getOwnedCityCacheKey",
    "getOwnedCityRosterCompletenessIssues", "validateCompleteOwnedCityRoster", "mergeOwnedCitySnapshots", "getAllOwnedCitiesForDisplay",
    "getOwnedCitySnapshotById", "getOwnedCitySnapshotForUpgrade"]) vm.runInContext(extract(name), c);
  const row = (id, region, kind = "") => ({ id, regionId: region, islandId: `${c.ONLINE_WORLD_ID}--${c.REALM_SHARD_ID}--${region}`,
    kind, ownerUid: "fixture-owner", level: 10, troops: 100 });
  const rows = Array.from({ length: 45 }, (_, i) => row(`core_${i.toString(16).padStart(18, "0")}`, regions[i % 25].id));
  rows.push(...Array.from({ length: 4 }, (_, i) => row(`${regions[i].id}_stronghold`, regions[i].id, "stronghold")));
  const added = row(`${regionId}-city-40`, regionId);
  rows.push(added);
  c.state.cities = [rows[0]];
  c.state.mainCityId = rows[0].id;
  return { c, descriptor, rows, added, realm: { resetGeneration: c.RESET_GENERATION, worldId: c.ONLINE_WORLD_ID,
    coreExpansion: { revision: 75, activeRegionIds: [regionId], regions: [descriptor] } } };
}

for (const preexisting of [false, true]) {
  const { c, descriptor, rows, added, realm } = fixture();
  if (preexisting) {
    // Existing sessions can have a registered region with the old missing metadata.
    const incomplete = { id: descriptor.id, label: descriptor.name };
    c.WORLD_REGIONS.push(incomplete); c.WORLD_REGIONS_BY_ID.set(incomplete.id, incomplete);
    c.WORLD_REGION_IDS = c.WORLD_REGIONS.map(region => region.id);
  }
  const before = c.validateCompleteOwnedCityRoster(rows);
  assert.equal(before.complete, false);
  assert.equal(before.cities.filter(city => !c.isStronghold(city)).length, 45);
  c.mergeOwnedCitySnapshots(before.cities, { complete: false });
  c.applyCoreExpansionRealmState(realm);
  const after = c.validateCompleteOwnedCityRoster(rows);
  assert.equal(after.complete, true, after.error);
  assert.equal(c.getRegionById(descriptor.id).cityCapacity, 40);
  assert.equal(after.cities.length, 50, "All 46 regular cities and four Strongholds must survive normalization");
  c.mergeOwnedCitySnapshots(after.cities, { complete: true });
  assert.equal(c.onlineOwnedCitiesCacheComplete, true);
  assert.equal(c.getAllOwnedCitiesForDisplay().length, 50);
  assert.equal(c.getOwnedCitySnapshotForUpgrade(added.id, descriptor.id).id, added.id, "Off-map upgrades must resolve the newly registered city");
  assert.equal(c.getRegionById(descriptor.id).gridX, descriptor.gridX);
  assert.equal(c.getRegionById(descriptor.id).gridY, descriptor.gridY);
  assert.equal(c.getRegionById(descriptor.id).label, descriptor.name);
  for (const ordinal of ["01", "40"]) assert(c.getKnownCityId(`${descriptor.id}-city-${ordinal}`, descriptor.id));
  for (const ordinal of ["00", "41", "400", "invalid"]) assert.equal(c.getKnownCityId(`${descriptor.id}-city-${ordinal}`, descriptor.id), "");
  for (const changed of [
    { ...added, islandId: added.islandId.replace("shard_0001", "shard_0002") },
    { ...added, islandId: added.islandId.replace("2026-10", "2026-09") },
    { ...added, islandId: c.getOnlineIslandId(c.DEFAULT_ONLINE_REGION_ID), id: "not-a-city" },
  ]) assert.equal(c.validateCompleteOwnedCityRoster([...rows.slice(0, -1), changed]).complete, false);
  assert.equal(c.validateCompleteOwnedCityRoster([...rows, added]).complete, false, "Duplicates must still fail verification");
  assert.equal(c.validateCompleteOwnedCityRoster(rows.slice(0, -1)).complete, false, "A genuinely missing city must remain incomplete");
  c.applyCoreExpansionRealmState({ ...realm, coreExpansion: { ...realm.coreExpansion, revision: 74, regions: [{ ...descriptor, cityCapacity: 1 }] } });
  assert.equal(c.getRegionById(descriptor.id).cityCapacity, 40, "An old expansion response must not shrink a newer map's valid city range");
}
console.log("Validated expanded-map roster registration: 46 regular cities + 4 Strongholds, unloaded maps, existing descriptors, off-map upgrades, bounds, realm isolation and stale expansion replies.");
