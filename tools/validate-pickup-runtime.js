"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = ["game.js", "pickup-placement.js"].map(file => fs.readFileSync(path.join(__dirname, "..", file), "utf8")).join("\n");

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const end = source.indexOf("\n}", start) + 2;
  return `${source.slice(start - 6, start) === "async " ? "async " : ""}${source.slice(start, end)}`;
}

function fixture(type = "gold") {
  let resolveClaim, rejectClaim;
  const claim = new Promise((resolve, reject) => { resolveClaim = resolve; rejectClaim = reject; });
  const bonus = { id: "pickup-one", type, regionId: "region-0001", x: 500, y: 400 };
  const stats = { claims: 0, reservations: 0, applied: 0, sounds: [] };
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
    isHarvestBonusPlacementSafe: () => true,
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
    crownlandsAudio: { playEffect: (id, options) => { stats.sounds.push({ id, options }); return true; } },
    renderHarvestBonuses() {}, renderPanel() {}, showToast() {}, playRewardAnimation() {},
    addLog() {}, getHarvestBonusTroopTargetCity: () => ({ name: "Main City" }),
    formatNumber: String, getHarvestBonusRespawnToastSuffix: () => "",
    onlineLastError: "",
  };
  vm.createContext(context);
  for (const name of ["playGameSound", "playRewardSound", "getHarvestRequestGuard", "renderHarvestFeedback", "collectHarvestBonus", "updateServerHarvestBonuses"]) vm.runInContext(extract(name), context);
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
  for (const type of ["gold", "troops"]) await check(`${type} pending claims cannot race a spawn or duplicate collection`, async () => {
    const f = fixture(type);
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    await f.context.collectHarvestBonus(f.bonus.id);
    assert.equal(f.stats.sounds.length, 0, "Pending collection played a success cue");
    f.context.updateServerHarvestBonuses();
    await Promise.resolve();
    const reserved = f.stats.reservations;
    f.resolveClaim(success); await pending;
    assert.equal(f.stats.claims, 1);
    assert.equal(reserved, 0, "Collection launched a competing spawn request");
    assert.equal(f.context.pendingHarvestBonusIds.size, 0);
    await f.context.collectHarvestBonus(f.bonus.id);
    assert.deepEqual(f.stats.sounds.map(sound => sound.id), [type === "gold" ? "map_gold_pickup" : "map_troop_pickup"], "Confirmed collection must play the supplied cue exactly once");
  });
  await check("map pickup sound stays scoped to positive rewards on the active map", async () => {
    for (const scenario of [
      { type: "troops", reward: 125, sound: "map_troop_pickup" },
      { type: "troops", reward: 0 },
      { type: "troops", reward: 125, switchedMap: true },
      { type: "gold", reward: 0 },
      { type: "gold", reward: 125, switchedMap: true },
    ]) {
      const f = fixture();
      f.bonus.type = scenario.type;
      Object.assign(f.context, { addLog() {}, getHarvestBonusTroopTargetCity: () => ({ name: "Main City" }) });
      const pending = f.context.collectHarvestBonus(f.bonus.id);
      if (scenario.switchedMap) f.context.getActiveMapRegionId = () => "region-0002";
      f.resolveClaim({ ...success, reward: scenario.reward }); await pending;
      assert.deepEqual(f.stats.sounds.map(sound => sound.id), scenario.sound ? [scenario.sound] : []);
    }
    const f = fixture();
    for (const type of ["gold", "troops", "item", "deed"]) f.context.playRewardSound(type);
    assert.deepEqual(f.stats.sounds.map(sound => sound.id), ["gold_pickup", "troop_reward", "relic_reward", "deed_camp_complete"], "Other rewards must retain their existing sounds");
  });
  await check("local Gold collection uses the supplied sound after crediting Gold", async () => {
    const f = fixture();
    f.context.state.gold = 10;
    Object.assign(f.context, {
      usesServerEconomyAuthority: () => false,
      getHarvestBonusGoldReward: () => 125,
      incrementHarvestBonusDailyCount() {}, resetHarvestRespawnTimer() {}, saveGame() {}, renderHud() {},
    });
    f.context.crownlandsAudio.playEffect = id => {
      assert.equal(f.context.state.gold, 135, "Sound preceded the Gold credit");
      f.stats.sounds.push({ id });
      return true;
    };
    await f.context.collectHarvestBonus(f.bonus.id);
    assert.deepEqual(f.stats.sounds.map(sound => sound.id), ["map_gold_pickup"]);
    assert.equal(f.context.state.harvestBonuses.length, 0);
  });
  for (const hasCity of [true, false]) await check(`local soldier pickup ${hasCity ? "credits troops before sound" : "without a city stays silent"}`, async () => {
    const f = fixture("troops");
    const city = { id: "main-city", name: "Main City", troopFloat: 10, troops: 10 };
    let credited = 0;
    Object.assign(f.context, {
      usesServerEconomyAuthority: () => false,
      getHarvestBonusTroopReward: () => 125,
      getHarvestBonusTroopTargetCity: () => hasCity ? city : null,
      getCityRegionId: () => "region-0001", getActiveOnlineRegionId: () => "region-0001",
      markOwnedCityChanged: () => { credited++; },
      incrementHarvestBonusDailyCount() {}, resetHarvestRespawnTimer() {}, saveGame() {}, renderHud() {}, renderCities() {},
    });
    f.context.crownlandsAudio.playEffect = id => {
      assert.equal(city.troops, 135, "Sound preceded the troop credit");
      assert.equal(credited, 1);
      f.stats.sounds.push({ id });
      return true;
    };
    await f.context.collectHarvestBonus(f.bonus.id);
    assert.deepEqual(f.stats.sounds.map(sound => sound.id), hasCity ? ["map_troop_pickup"] : []);
    assert.equal(f.context.state.harvestBonuses.length, hasCity ? 0 : 1);
    assert.equal(city.troops, hasCity ? 135 : 10);
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
  for (const type of ["gold", "troops"]) await check(`${type} rejection preserves pickup and its deadline`, async () => {
    const f = fixture(type);
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.rejectClaim(new Error("temporarily unavailable")); await pending;
    assert.equal(f.stats.sounds.length, 0, "Rejected collection played a success cue");
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
  for (const type of ["gold", "troops"]) await check(`${type} reward presentation failure cannot resurrect a confirmed pickup`, async () => {
    const f = fixture(type);
    f.context.crownlandsAudio.playEffect = () => { throw new Error("audio failed"); };
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.resolveClaim(success); await pending;
    assert.equal(f.context.state.harvestBonuses.length, 0);
    assert.equal(f.context.state.harvestNextSpawnAtMs, 120_000);
  });
  for (const type of ["gold", "troops"]) for (const reject of [false, true]) await check(`late ${type} ${reject ? "failure" : "success"} cannot alter another session`, async () => {
    const f = fixture(type);
    const pending = f.context.collectHarvestBonus(f.bonus.id);
    f.context.onlineSessionGeneration++;
    f.context.state = { harvestBonuses: [], daily: {}, harvestNextSpawnAtMs: 900_000 };
    if (reject) f.rejectClaim(new Error("old session")); else f.resolveClaim(success);
    await pending;
    assert.equal(f.stats.applied, 0);
    assert.equal(f.context.state.harvestBonuses.length, 0);
    assert.equal(f.context.state.harvestNextSpawnAtMs, 900_000);
    assert.equal(f.stats.sounds.length, 0, "A stale session played a pickup cue");
  });
  await check("nearest valid placement stops further terrain checks", () => {
    let checks = 0;
    const context = {
      isHalloweenMapSeason: () => false,
      HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
      HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE: 300,
      HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE: Math.PI * (3 - Math.sqrt(5)),
      normalizeRegionId: value => value,
      getIslandMapBounds: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
      getHarvestBonusMapArtBounds: () => [],
      isValidHarvestBonusPoint: () => ++checks >= 2,
    };
    vm.createContext(context); vm.runInContext(extract("createHarvestBonusPoint"), context);
    assert(context.createHarvestBonusPoint("region-0001"));
    assert.equal(checks, 2, "Search kept testing farther candidates after finding the closest valid point");
  });
  await check("pickup footprints clear registered scenery and the entire Tower image", () => {
    const art = {scenery:[{x:100,y:100,w:40,h:60}],landmarks:[{x:400,y:150,width:200,height:300}]};
    const context = {
      HARVEST_BONUS_LAND_CLEARANCE: 64,
      state: { cities: [] },
      getPlayableBaseCitiesByRegion: () => [],
      getHarvestBonusSeasonalArtBounds: () => [],
      normalizeRegionId: value => value,
      getIllustratedMapPresentation: region => region === "current" ? art : null,
      islandImagePointToWorld: (_, point) => ({x:1000+point.x*2,y:2000+point.y*2}),
      WORLD_HOLDING_TOWERS: [{regionId:"current",visualX:1700,visualY:3100,width:200,anchorX:0.5,anchorY:1},
        {regionId:"other",visualX:1200,visualY:2600,width:600,anchorX:0.5,anchorY:1}],
    };
    vm.createContext(context);
    vm.runInContext(extract("getHarvestBonusMapArtBounds")+"\n"+extract("isHarvestBonusClearOfMapArt"),context);
    const bounds=context.getHarvestBonusMapArtBounds("current");
    assert.equal(bounds.length,3,"Another map's Tower affected the current map.");
    for(const point of [{x:1200,y:2200},{x:1290,y:2200},{x:2000,y:2350},{x:1700,y:2910},{x:1700,y:3140},{x:1700,y:3200},{x:1505,y:3100},{x:1890,y:3100},{x:1700,y:3280}]) {
      assert.equal(context.isHarvestBonusClearOfMapArt(point.x,point.y,bounds),false,`Obstructed pickup accepted at ${JSON.stringify(point)}`);
    }
    assert.equal(context.isHarvestBonusClearOfMapArt(1200,2600,bounds),true,"Clear central space was rejected.");
    assert.equal(context.isHarvestBonusClearOfMapArt(1305,2200,bounds),true,"Scenery clearance did not end outside the full pickup footprint.");
  });
  await check("seasonal exclusions inherit the active New Lands template and reject malformed art", () => {
    const context = {
      isHalloweenMapSeason: () => true,
      halloweenMapLayouts: { assets: [{ src: "assets/optimized/halloween-map-pumpkins-abcdef123456.webp", w: 40, h: 30 }],
        maps: { template: [[0, 100, 200], [9, 5, 5], [0, NaN, 10]] } },
      REGION_CATALOG_SUMMARIES_BY_ID: new Map([["generated", { templateRegionId: "template" }]]),
      islandImagePointToWorld: (_, point) => ({ x: point.x * 2, y: point.y * 2 }),
    };
    vm.createContext(context); vm.runInContext(extract("getHarvestBonusSeasonalArtBounds"), context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.getHarvestBonusSeasonalArtBounds("generated"))), [{ left: 200, top: 400, right: 280, bottom: 460 }]);
    context.isHalloweenMapSeason = () => false;
    assert.equal(context.getHarvestBonusSeasonalArtBounds("generated").length, 0);
  });
  await check("city exclusions cover unloaded canonical markers, live relocation, and skin outskirts", () => {
    const context = {
      normalizeRegionId: value => value, getIllustratedMapPresentation: () => null,
      islandImagePointToWorld: (_, point) => point, WORLD_HOLDING_TOWERS: [],
      getHarvestBonusSeasonalArtBounds: () => [], HARVEST_BONUS_LAND_CLEARANCE: 64,
      getCityRegionId: city => city.regionId, isStronghold: city => city.kind === "stronghold",
      getPlayableBaseCitiesByRegion: () => [{regionId:"current",x:100,y:100}],
      state: {cities:[{regionId:"current",x:500,y:500},{regionId:"other",x:800,y:800}]},
    };
    vm.createContext(context); vm.runInContext(extract("getHarvestBonusMapArtBounds")+"\n"+extract("isHarvestBonusClearOfMapArt"),context);
    const bounds=context.getHarvestBonusMapArtBounds("current");
    assert.equal(bounds.length,2);
    assert.equal(context.isHarvestBonusClearOfMapArt(100,100,bounds),false,"Unloaded canonical city was ignored");
    assert.equal(context.isHarvestBonusClearOfMapArt(620,620,bounds),false,"Pickup corner overlaps a relocated city's skin outskirts");
    assert.equal(context.isHarvestBonusClearOfMapArt(800,800,bounds),true,"Another map's city blocked the current map");
  });
  await check("placement waits for pending seasonal artwork and bounds a blocked search", () => {
    let checks=0;
    const context={isHalloweenMapSeason:()=>true,halloweenMapLayouts:null,halloweenMapLayoutPromise:{},
      normalizeRegionId:value=>value,getHarvestBonusMapArtBounds:()=>[],getIslandMapBounds:()=>({left:0,top:0,width:1000,height:800}),
      HARVEST_BONUS_CENTER_SEARCH_FRACTIONS:[0.15,0.25,0.35],HARVEST_BONUS_CENTER_SEARCH_ATTEMPTS_PER_ZONE:300,
      HARVEST_BONUS_CENTER_SEARCH_GOLDEN_ANGLE:Math.PI*(3-Math.sqrt(5)),isValidHarvestBonusPoint:()=>{checks++;return false;}};
    vm.createContext(context);vm.runInContext(extract("createHarvestBonusPoint"),context);
    assert.equal(context.createHarvestBonusPoint("current"),null);
    assert.equal(checks,0,"Pending art caused a speculative placement");
    context.halloweenMapLayouts={};
    assert.equal(context.createHarvestBonusPoint("current"),null);
    assert.equal(checks,900,"Blocked search exceeded its fixed attempt budget");
  });
  await check("saved placement safety is cached until map artwork or city geometry changes", () => {
    let checks = 0;
    const context = {
      normalizeRegionId: value => value, isHalloweenMapSeason: () => true,
      halloweenMapLayouts: {}, halloweenMapLayoutPromise: null, cityRenderSignature: "cities-one",
      state: {}, harvestBonusPlacementValidation: null, HARVEST_BONUS_CENTER_SEARCH_FRACTIONS: [0.15, 0.25, 0.35],
      getIslandMapBounds: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
      isValidHarvestBonusPoint: (...args) => { checks++; assert.equal(args[4], "saved"); return checks === 1; },
    };
    vm.createContext(context); vm.runInContext(extract("isHarvestBonusPlacementSafe"), context);
    const bonus = { id: "saved", regionId: "active", x: 520, y: 420 };
    for (let i = 0; i < 1000; i++) assert(context.isHarvestBonusPlacementSafe(bonus));
    assert.equal(checks, 1, "Idle pickup refresh rescans the map");
    context.cityRenderSignature = "cities-moved";
    assert.equal(context.isHarvestBonusPlacementSafe(bonus), false);
    assert.equal(checks, 2);
    context.halloweenMapLayouts = {};
    assert.equal(context.isHarvestBonusPlacementSafe(bonus), false);
    assert.equal(checks, 3);
    assert.equal(context.isHarvestBonusPlacementSafe({ ...bonus, x: 950 }), false, "Saved off-center pickup escaped repair");
  });
  for (const type of ["gold", "troops", "crowns"]) await check(`${type} obstructed same-map reservation moves once and preserves its identity`, async () => {
    const f = fixture(type), calls = [];
    f.context.isHarvestBonusPlacementSafe = () => false;
    f.context.createHarvestBonusPoint = () => ({ x: 600, y: 450 });
    f.context.getOnlineApi = () => ({ reserveHarvestBonusSpawn: data => { calls.push(data); return new Promise(() => {}); } });
    f.context.updateServerHarvestBonuses();
    f.context.updateServerHarvestBonuses();
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].relocateActive, true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].bonus)), { ...f.bonus, x: 600, y: 450 });
    assert.equal(f.context.state.harvestNextSpawnAtMs, 1);
  });
  await check("an obstructed saved pickup retries after five seconds without losing its reservation", () => {
    const f = fixture();
    f.context.isHarvestBonusPlacementSafe = () => false;
    f.context.createHarvestBonusPoint = () => null;
    const started = Date.now();
    f.context.updateServerHarvestBonuses();
    assert(f.context.harvestRelocationRetryAtMs >= started + 5000);
    assert.equal(f.context.state.harvestBonuses[0].id, f.bonus.id);
    assert.equal(f.context.state.harvestNextSpawnAtMs, 1);
    assert.equal(f.stats.reservations, 0);
  });
  assert.equal(failures.length, 0, `${failures.length} pickup regressions failed`);
}

module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
