"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const routing = require("../functions/authoritative-route-planner");
const timing = require("../functions/operation-timing");
const { createTravelFixture, canonicalCity, layout } = require("./world-travel-test-fixtures");
const towers = require("../functions/holding-towers");
const { MAX_NEARBY_SCOUT_TARGETS } = require("../functions/authoritative-route-policy");
const root = path.resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
function stats(values) {
  const rows = [...values].sort((a,b) => a-b);
  return { count: rows.length, p50: rows[Math.ceil(rows.length*.5)-1], p95: rows[Math.ceil(rows.length*.95)-1] };
}
function loadVersion(base = "") {
  const filename = path.join(root, "functions/authoritative-route-planner.js");
  const source = base ? execFileSync("git", ["show", `${base}:functions/authoritative-route-planner.js`], {cwd:root, encoding:"utf8"}) : fs.readFileSync(filename,"utf8");
  // The canonical engine already has a lower-level cache. Give each version its
  // own engine so running the baseline cannot warm the candidate's cache.
  const engineFile = path.join(root,"functions/canonical-route-engine.js");
  const engine = new Module(engineFile, module);
  engine.filename=engineFile; engine.paths=module.paths;
  engine._compile(fs.readFileSync(engineFile,"utf8"),engineFile);
  const loaded = new Module(filename,module);
  loaded.filename=filename; loaded.paths=module.paths;
  const originalRequire=loaded.require.bind(loaded);
  loaded.require=id=>id==="./canonical-route-engine.js" ? engine.exports : originalRequire(id);
  loaded._compile(source,filename);
  return loaded.exports;
}
function cacheChecks() {
  const cache = routing.createTerrainLegCache(2, 5);
  const leg = { regionId:"r", length:5, points:[{x:1,y:2},{x:3,y:4}] };
  cache.set("a", leg); leg.points[0].x = 999;
  assert.equal(cache.get("a").points[0].x, 1, "Insertion aliases caller points");
  const first = cache.get("a"); first.points.reverse(); first.points[0].y = -50;
  assert.deepEqual(cache.get("a").points, [{x:1,y:2},{x:3,y:4}], "Returned points alias the cache");
  cache.set("b", first); cache.get("a"); cache.set("c", first);
  assert.equal(cache.get("b"), null, "LRU did not evict the least-recently-used entry");
  cache.set("large", {...leg,points:Array.from({length:6},()=>({x:0,y:0}))});
  assert.equal(cache.get("large"), null, "An oversized leg exceeded the point budget");
  cache.set("d", {...leg,points:[{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:3,y:3}]});
  assert.deepEqual(cache.snapshot(), {entries:1,points:4}, "Point-budget eviction failed");
  const full = routing.createTerrainLegCache();
  for (let i=0;i<300;i++) full.set(String(i), {points:[{x:i,y:0}]});
  assert.equal(full.snapshot().entries,256);
  const large = routing.createTerrainLegCache();
  for(let i=0;i<20;i++) large.set(String(i),{points:Array.from({length:4096},()=>({x:0,y:0}))});
  assert.deepEqual(large.snapshot(),{entries:8,points:32768});
  assert.equal(routing.createTerrainLegCache().get("d"),null,"Planner caches share entries");
}
function main() {
  cacheChecks();
  const base = execFileSync("git",["merge-base","HEAD","origin/main"],{cwd:root,encoding:"utf8"}).trim();
  const baseline = loadVersion(base);
  const candidate = loadVersion();
  const fixture = createTravelFixture(26);
  const make = implementation => implementation.createAuthoritativeRoutePlanner({...layout,maps:fixture.maps},
    { shortestTravelTime:true, getTerrainBlockers:()=>[] });
  const reference = make(baseline), current = make(candidate);
  const city = canonicalCity(current,fixture.activeRegionIds[0]);
  const same = canonicalCity(current,city.regionId,1);
  const cross = canonicalCity(current,fixture.activeRegionIds[12],1);
  const tower = towers.TOWERS[0];
  const towerSource = {...tower,...routing.imagePointToWorld(current.getModel(tower.regionId),{x:tower.reservedX,y:tower.reservedY})};
  const towerTarget = canonicalCity(current,tower.regionId);
  const cases = [ ["city-same",city,same], ["city-cross",city,cross], ["tower-same",towerSource,towerTarget], ["tower-cross",towerSource,cross] ];
  const evidence = { base, scope:"Pure authoritative routing with isolated canonical caches; first use in a shared process, then warm samples. No network, Firestore, travel or production latency included", routes:[] };
  for (const [name,from,to] of cases) {
    const samples = {before:[],after:[]};
    let expected;
    for (let pass=0;pass<21;pass++) {
      let start=performance.now(); const before=reference.calculate(from,to); samples.before.push(performance.now()-start);
      start=performance.now(); const after=current.calculate(from,to); samples.after.push(performance.now()-start);
      assert(before?.pathLength > 0, `${name} is not reachable`);
      assert.deepEqual(plain(after),plain(before),`${name}: caching changed authoritative geometry`);
      expected=plain(before);
    }
    const forward=current.calculate(from,to); forward.path[0].x=-999;
    assert.deepEqual(plain(current.calculate(from,to)),expected,"A returned route mutated the cache");
    assert.deepEqual(plain(current.calculate(to,from)),plain(reference.calculate(to,from)),"Reverse routes differ");
    evidence.routes.push({name,firstUseMs:{before:samples.before[0],after:samples.after[0]},warmMs:{before:stats(samples.before.slice(1)),after:stats(samples.after.slice(1))}});
  }
  // A retry runs every candidate again; no origin may be removed or approximated.
  const candidates = fixture.activeRegionIds.slice(0,5).map(id=>({...canonicalCity(current,id),sourceType:"city"}));
  candidates.push({...towerSource,sourceType:"tower"});
  const select=planner=>towers.selectClosestScoutOrigin(candidates,cross,(from,to)=>planner.calculate(from,to));
  assert.deepEqual(plain(select(current)),plain(select(reference)),"Closest-origin selection or ties changed");
  const warm=timing.run(()=>{ select(current);return timing.snapshot(); });
  assert(warm.routeCacheHits>0,"Repeated origin routes do not reuse any terrain legs");
  evidence.candidateRetry=warm;
  // Exercise the full permitted Nearby batch, then a transaction retry.
  const targets=current.getModel(city.regionId).map.cities.filter(row=>row.id!==city.id).slice(0,MAX_NEARBY_SCOUT_TARGETS)
    .map(row=>({...row,regionId:city.regionId,...routing.imagePointToWorld(current.getModel(city.regionId),row)}));
  assert.equal(targets.length,MAX_NEARBY_SCOUT_TARGETS);
  const batch={};
  for(const [name,planner] of [["before",reference],["after",current]]) {
    const samples=[];
    for(let pass=0;pass<11;pass++) {
      const start=performance.now();const routes=targets.map(target=>planner.calculate(city,target));
      samples.push(performance.now()-start);
      if(name==="before") batch.expected=plain(routes);
      else assert.deepEqual(plain(routes),batch.expected,"Nearby batch routes differ");
    }
    batch[name]={firstUseMs:samples[0],warmMs:stats(samples.slice(1))};
  }
  delete batch.expected; evidence.nearby={targets:targets.length,...batch};
  const isolated=make(routing);
  assert.deepEqual(isolated.getRouteCacheStats(),{entries:0,points:0});
  const repeated=timing.run(()=>{ isolated.calculate(city,same);isolated.calculate(city,same);return timing.snapshot();});
  assert(repeated.routeCacheHits>0);
  assert(current.getRouteCacheStats().entries<=256 && current.getRouteCacheStats().points<=32768);
  const out=path.join(root,"release-artifacts/scouting-responsiveness");fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,"route-benchmark.json"),JSON.stringify(evidence,null,2));
  console.log("Scout routing passed: exact baseline/reverse routes, closest origin, 24-target batch, retry reuse, planner isolation, LRU/point caps, and mutation safety.");
  console.log(JSON.stringify(evidence));
}
main();
