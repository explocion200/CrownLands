"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const end = source.indexOf("\n}", start) + 2;
  return `${source.slice(start - 6, start) === "async " ? "async " : ""}${source.slice(start, end)}`;
}

function fixture() {
  let resolveClaim, rejectClaim;
  const claim = new Promise((resolve, reject) => { resolveClaim = resolve; rejectClaim = reject; });
  const bonus = { id: "pickup-one", type: "gold", regionId: "region-0001", x: 500, y: 400 };
  const stats = { claims: 0, reservations: 0, applied: 0 };
  const context = {
    state: { harvestBonuses: [bonus], daily: { harvestedBonuses: 0 }, harvestNextSpawnAtMs: 1 },
    onlineSessionGeneration: 1,
    pendingHarvestBonusIds: new Set(), harvestSpawnRequestInFlight: false, harvestRelocationRetryAtMs: 0,
    HARVEST_BONUS_DAILY_LIMIT: 60, HARVEST_BONUS_DAILY_GOLD_LIMIT: 30, HARVEST_BONUS_DAILY_TROOP_LIMIT: 30,
    HARVEST_BONUS_SERVER_RETRY_SECONDS: 5,
    console: { warn() {} },
    isGamePausedByOutcome: () => false,
    usesServerEconomyAuthority: () => true,
    normalizeHarvestBonuses: values => (values || []).map(value => ({ ...value })),
    normalizeHarvestBonusType: value => value,
    normalizeRegionId: value => value,
    normalizeDailyCaptureTracker: value => value,
    captureAnimationAnchor: () => null,
    ensureDailyCaptureTracker: () => context.state.daily,
    canHarvestBonusType: () => true,
    getAllActiveHarvestBonuses: () => context.state.harvestBonuses,
    getActiveMapRegionId: () => "region-0001",
    getNextAvailableHarvestBonusType: () => "gold",
    hasAnyActiveHarvestBonus: () => context.state.harvestBonuses.length > 0,
    getHarvestSpawnDelaySeconds: () => 0,
    createHarvestBonusPoint: () => ({ x: 500, y: 400 }),
    createHarvestBonusRecord: () => ({ ...bonus, id: "pickup-two" }),
    setHarvestSpawnDelay: () => {},
    getOnlineApi: () => ({
      collectHarvestBonus: () => { stats.claims++; return claim; },
      reserveHarvestBonusSpawn: () => { stats.reservations++; return new Promise(() => {}); },
    }),
    applyServerEconomyResult: result => {
      stats.applied++;
      Object.assign(context.state, result.currentUser);
    },
    renderHarvestBonuses() {}, renderPanel() {}, showToast() {}, playRewardSound() {}, playRewardAnimation() {},
    formatNumber: String, getHarvestBonusRespawnToastSuffix: () => "",
    onlineLastError: "",
  };
  vm.createContext(context);
  for (const name of ["getHarvestRequestGuard", "renderHarvestFeedback", "collectHarvestBonus", "updateServerHarvestBonuses"]) vm.runInContext(extract(name), context);
  return { context, stats, bonus, resolveClaim, rejectClaim };
}

async function run() {
  const failures = [];
  async function check(name, test) {
    try { await test(); console.log(`PASS pickup: ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL pickup: ${name}: ${error.message}`); }
  }
  const success = { reward: 125, currentUser: { harvestBonuses: [], daily: { harvestedGoldBonuses: 1 }, harvestNextSpawnAtMs: 120_000 } };
  await check("derived map reuse follows definition changes, eviction, and asset versions", () => {
    let builds=0;
    const context={
      cleanEditorRegionId:String,CORE_EXPANSION_TOPOLOGY_ACTIVE:true,
      REGION_CATALOG_SUMMARIES_BY_ID:new Map([["map-a",{id:"map-a"}]]),
      regionDefinitionCache:new Map(),editorMapCache:new Map(),EDITOR_MAP_CACHE_LIMIT:64,
      REGION_CATALOG:{assetVersion:"one"},
      buildCatalogEditorMap:(summary,definition)=>({id:summary.id,cities:definition?.cities,build:++builds}),
    };
    vm.createContext(context);vm.runInContext(extract("getEditorMap"),context);
    const initial=context.getEditorMap("map-a");
    for(let i=0;i<100;i++)assert.equal(context.getEditorMap("map-a"),initial);
    assert.equal(builds,1,"Repeated geometry reads rebuilt map contents");
    context.regionDefinitionCache.set("map-a",{definition:{cities:[{id:"city-a"}]}});
    assert.equal(context.getEditorMap("map-a").cities[0].id,"city-a");
    context.regionDefinitionCache.delete("map-a");
    assert.equal(context.getEditorMap("map-a").cities,undefined,"Evicted definitions remained visible");
    context.REGION_CATALOG.assetVersion="two";
    assert.equal(context.getEditorMap("map-a").build,4);
    for(let i=0;i<100;i++){const id=`map-${i}`;context.REGION_CATALOG_SUMMARIES_BY_ID.set(id,{id});context.getEditorMap(id);}
    assert(context.editorMapCache.size<=64,"Derived metadata cache grew without a bound");
    const loaderStart=source.indexOf("const REGION_DEFINITION_LOADER =");
    const loaderEnd=source.indexOf("\n});",loaderStart)+4;
    let callbacks;
    Object.assign(context,{
      REGION_DEFINITION_CACHE_LIMIT:4,playableBaseCitiesByRegionCache:new Map(),playableBaseCitiesByIdCache:new Map(),
      REGION_CATALOG_RUNTIME:{createRegionDefinitionLoader:options=>{callbacks=options;return {};}}
    });
    vm.runInContext(source.slice(loaderStart,loaderEnd),context);
    context.editorMapCache.set("map-a",{});callbacks.onLoad("map-a");
    assert(!context.editorMapCache.has("map-a"));
    context.editorMapCache.set("map-a",{});callbacks.onEvict("map-a");
    assert(!context.editorMapCache.has("map-a"),"Eviction retained the derived city definitions");
    assert.match(extract("registerCoreExpansionRegions"),/REGION_DEFINITION_LOADER\.register\(descriptors\);\s*editorMapCache\.clear\(\);/);
  });
  await check("pending claims cannot race a spawn or duplicate collection", async () => {
    const f = fixture();
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    await f.context.collectHarvestBonus(f.bonus.id);
    f.context.updateServerHarvestBonuses();
    await Promise.resolve();
    const reserved = f.stats.reservations;
    f.resolveClaim(success); await pending;
    assert.equal(f.stats.claims, 1);
    assert.equal(reserved, 0, "Collection launched a competing spawn request");
    assert.equal(f.context.pendingHarvestBonusIds.size, 0);
  });
  await check("a stale spawn response cannot replace another session or release its lock", async () => {
    const f = fixture();
    let resolveSpawn;
    f.context.state.harvestBonuses = [];
    f.context.getOnlineApi = () => ({ reserveHarvestBonusSpawn: () => new Promise(resolve => { resolveSpawn = resolve; }) });
    f.context.updateServerHarvestBonuses();
    await Promise.resolve();
    f.context.onlineSessionGeneration++;
    f.context.state = { harvestBonuses: [], daily: {}, harvestNextSpawnAtMs: 900_000 };
    f.context.harvestSpawnRequestInFlight = true;
    resolveSpawn({ spawned: true, currentUser: { harvestBonuses: [f.bonus] } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.stats.applied, 0);
    assert.equal(f.context.harvestSpawnRequestInFlight, true);
  });
  await check("synchronous spawn failures release their lock and schedule retry", async () => {
    const f = fixture();
    let retries = 0;
    f.context.state.harvestBonuses = [];
    f.context.setHarvestSpawnDelay = seconds => { assert.equal(seconds, 5); retries++; };
    f.context.getOnlineApi = () => ({ reserveHarvestBonusSpawn: () => { throw new Error("unavailable"); } });
    f.context.updateServerHarvestBonuses();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.context.harvestSpawnRequestInFlight, false);
    assert.equal(retries, 1);
  });
  await check("rejection preserves pickup and its deadline", async () => {
    const f = fixture();
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.rejectClaim(new Error("temporarily unavailable")); await pending;
    assert.equal(f.context.state.harvestBonuses[0].id, f.bonus.id);
    assert.equal(f.context.state.harvestNextSpawnAtMs, 1);
    assert.equal(f.context.pendingHarvestBonusIds.size, 0);
  });
  await check("pending feedback failure cannot strand collection", async () => {
    const f = fixture();
    f.context.renderHarvestBonuses = () => { throw new Error("presentation failed"); };
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.resolveClaim(success); await pending.catch(() => {});
    assert.equal(f.stats.claims, 1, "Presentation prevented the server request");
    assert.equal(f.context.pendingHarvestBonusIds.size, 0, "Presentation stranded the claim lock");
  });
  await check("reward presentation failure cannot resurrect a confirmed pickup", async () => {
    const f = fixture();
    f.context.playRewardSound = () => { throw new Error("audio failed"); };
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.resolveClaim(success); await pending;
    assert.equal(f.context.state.harvestBonuses.length, 0);
    assert.equal(f.context.state.harvestNextSpawnAtMs, 120_000);
  });
  for (const reject of [false, true]) await check(`late ${reject ? "failure" : "success"} cannot alter another session`, async () => {
    const f = fixture();
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.context.onlineSessionGeneration++;
    f.context.state = { harvestBonuses: [], daily: {}, harvestNextSpawnAtMs: 900_000 };
    if (reject) f.rejectClaim(new Error("old session")); else f.resolveClaim(success);
    await pending;
    assert.equal(f.stats.applied, 0);
    assert.equal(f.context.state.harvestBonuses.length, 0);
    assert.equal(f.context.state.harvestNextSpawnAtMs, 900_000);
  });
  await check("nearest valid placement stops further terrain checks", () => {
    let checks = 0;
    const context = {
      HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
      HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE: 300,
      HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
      normalizeRegionId: value => value,
      getIslandMapBounds: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
      isValidHarvestBonusPoint: () => ++checks >= 2,
    };
    vm.createContext(context); vm.runInContext(extract("createHarvestBonusPoint"), context);
    assert(context.createHarvestBonusPoint("region-0001"));
    assert.equal(checks, 2, "Search kept testing farther candidates after finding the closest valid point");
  });
  assert.equal(failures.length, 0, `${failures.length} pickup regressions failed`);
}

module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
