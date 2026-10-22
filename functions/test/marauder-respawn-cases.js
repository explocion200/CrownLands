"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { createMarauderPopulation, isClear, roadPlacementPoints } = require("../marauder-population");
const M = require("../marauder-rules");
const catalog = require("../core-expansion-region-catalog.json");

module.exports = async function respawnCases({ db, geometry }) {
  const token = crypto.randomBytes(6).toString("hex"), now = Date.now();
  const world = { worldId: `respawn_${token}`, resetGeneration: `respawn_${token}`,
    realmShardId: "shard_0001", storageId: `respawn_${token}` };
  const island = id => db.doc(`islands/${world.worldId}--${id}`);
  const regionIds = ["core-v2-south-support-p0-p2", "core-v2-crown-citadel-p0-p0"];
  const layouts = new Map();
  const population = createMarauderPopulation({ db, runTransaction: work => db.runTransaction(work), context: () => world,
    activeRegions: async () => [...layouts.keys()], descriptor: id => catalog.regions.find(row => row.id === id),
    layout: id => layouts.get(id), islandId: id => `${world.worldId}--${id}` });
  await population.rolloutRef().set({ enabled: true });
  for (const regionId of regionIds) {
    const area = geometry(regionId), roads = roadPlacementPoints(area).map(point => ({ ...point, regionId }))
      .filter(point => isClear(point, area) && area.accessible(point));
    assert(roads.length >= 2, `${regionId} needs multiple valid road points`);
    const original = roads[0];
    assert(roads.every(point => !isClear(point, { ...area, structures: [...area.structures, original] })),
      "The real map reproduces the old self-remains placement deadlock");
    layouts.set(regionId, { ...area, roadPoints: [original] });
    await island(regionId).set({ ...world, regionId });
    assert.equal((await population.populate(regionId, now)).spawned, 1);
    const privateRef = (await island(regionId).collection("marauderCombat").get()).docs[0].ref;
    const before = (await privateRef.get()).data(), publicRef = island(regionId).collection("marauders").doc(privateRef.id);
    const due = now + 1800000, patch = { status: "defeated", respawnAtMs: due };
    await privateRef.set(patch, { merge: true }); await publicRef.set(patch, { merge: true });
    const request = { regionId, id: privateRef.id, spawnId: before.spawnId };
    assert.equal((await population.refresh(request, due - 1)).spawned, 0, "Keep the 30-minute boss cooldown");
    assert.equal((await population.refresh(request, due)).blocked, 1, "Do not reuse the exact previous point");
    assert.equal((await publicRef.get()).data().spawnId, before.spawnId);
    layouts.set(regionId, { ...area, roadPoints: roads.filter(point => point !== original) });
    const outcomes = await Promise.all([population.refresh(request, due + 60000),
      population.refresh(request, due + 60000), population.maintain(due + 60000)]);
    assert.equal(outcomes.reduce((sum, result) => sum + result.spawned, 0), 1,
      "Concurrent viewers and the scheduler replace the due identity exactly once");
    const after = (await privateRef.get()).data(), visible = (await publicRef.get()).data();
    assert.equal(after.status, "active"); assert.equal(after.respawnAtMs, 0);
    assert.notEqual(after.spawnId, before.spawnId); assert.equal(visible.spawnId, after.spawnId);
    assert(after.x !== before.x || after.y !== before.y);
    assert(Math.hypot(after.x - before.x, after.y - before.y) < 128,
      "A disappearing corpse must not exclude nearby otherwise-clear roads");
    assert(isClear(after, area) && area.accessible(after));
    assert.equal(after.troops, M.balance(after.level, after.balanceVersion).defenders);
    assert.equal(visible.status, "active"); assert(!Object.hasOwn(visible, "troops"));
    assert.equal((await population.refresh(request, due + 60001)).spawned, 0, "Old encounter requests cannot reset the replacement");

    // A current city still blocks the same road even though this slot's own
    // remains no longer do. No fallback or lowered building clearance.
    const nextDue = due + 1800000, target = roads.find(point => point.x !== after.x || point.y !== after.y);
    layouts.set(regionId, { ...area, roadPoints: [target] });
    const city = island(regionId).collection("cities").doc("fixture-blocking-city");
    await city.set({ x: target.x, y: target.y });
    await privateRef.set({ status: "defeated", respawnAtMs: nextDue }, { merge: true });
    await publicRef.set({ status: "defeated", respawnAtMs: nextDue }, { merge: true });
    assert.equal((await population.refresh({ ...request, spawnId: after.spawnId }, nextDue)).blocked, 1);
    assert.equal((await publicRef.get()).data().status, "defeated");
    assert.equal((await privateRef.get()).data().spawnId, after.spawnId);
    await city.delete();
    assert.equal((await population.refresh({ ...request, spawnId: after.spawnId }, nextDue + 60000)).spawned, 1);
  }
  const blockedRegion = "core-v2-north-east-holding-tower-p1-m1", blockedArea = geometry(blockedRegion);
  assert(!roadPlacementPoints(blockedArea).some(point => isClear(point, blockedArea)
    && blockedArea.accessible({ ...point, regionId: blockedRegion })),
    "Lionwatch remains genuinely blocked under the approved terrain/road rules");
  layouts.set(blockedRegion, blockedArea); await island(blockedRegion).set({ ...world });
  assert.equal((await population.populate(blockedRegion, now)).blocked, 1);
  assert.equal((await island(blockedRegion).collection("marauders").get()).size, 0);

  // Only the replaced slot's remains are removed from obstacles. Another
  // defeated slot still occupies space until its own atomic replacement.
  const solo = catalog.regions.find(row => !row.permanentCore), soloId = solo.id;
  let points = [{ x: 1500, y: 1500 }, { x: 3500, y: 3500 }];
  const soloArea = { bounds: { left: 0, top: 0, right: 5000, bottom: 5000 }, structures: [],
    rectangles: [], walkable: () => true, accessible: () => true };
  const soloPopulation = createMarauderPopulation({ db, runTransaction: work => db.runTransaction(work), context: () => world,
    activeRegions: async () => [soloId], descriptor: () => solo,
    layout: () => ({ ...soloArea, roadPoints: points }), islandId: id => `${world.worldId}--${id}` });
  await island(soloId).set({ ...world });
  assert.equal((await soloPopulation.populate(soloId, now)).spawned, 2);
  const rows = (await island(soloId).collection("marauderCombat").get()).docs;
  const own = rows[0].data(), other = rows[1].data(), due = now + 120000;
  for (const row of rows) {
    const patch = { status: "defeated", respawnAtMs: due + (row.id === rows[0].id ? 0 : 120000) };
    await row.ref.set(patch, { merge: true });
    await island(soloId).collection("marauders").doc(row.id).set(patch, { merge: true });
  }
  const request = { regionId: soloId, id: rows[0].id, spawnId: own.spawnId };
  points = [{ x: other.x + 20, y: other.y }];
  assert.equal((await soloPopulation.refresh(request, due)).blocked, 1, "Other remains still block placement");
  points = [{ x: own.x + 20, y: own.y }];
  assert.equal((await soloPopulation.refresh(request, due + 60000)).spawned, 1);
  assert.equal((await rows[1].ref.get()).data().status, "defeated");
  assert.equal((await rows[1].ref.get()).data().spawnId, other.spawnId);
  // Four reserved alternatives do not create four slots. Inspect each at most
  // once, retain active encounters, and rotate exactly one due identity.
  const reserved=[{x:1300,y:1300},{x:3700,y:1300},{x:1300,y:3700},{x:3700,y:3700}];
  const fixedIsland=db.doc(`islands/${world.worldId}--fixed-sites`);await fixedIsland.set({...world});
  const fixed=createMarauderPopulation({db,runTransaction:work=>db.runTransaction(work),context:()=>world,
    activeRegions:async()=>[soloId],descriptor:()=>solo,
    layout:()=>({...soloArea,roadPoints:reserved,fixedRoadSites:true}),islandId:()=>fixedIsland.id});
  const initial=await Promise.all([fixed.populate(soloId,now),fixed.populate(soloId,now)]);
  assert.equal(initial.reduce((n,r)=>n+r.spawned,0),2);
  const fixedRows=(await fixedIsland.collection("marauderCombat").get()).docs;
  assert.equal(fixedRows.length,2);assert.equal((await fixed.populate(soloId,now)).spawned,0);
  const unchanged=fixedRows[1].data(),current=fixedRows[0].data();
  const fixedPublic=fixedIsland.collection("marauders").doc(fixedRows[0].id),fixedPrivate=fixedRows[0].ref;
  const fixedRequest={regionId:soloId,id:fixedRows[0].id,spawnId:current.spawnId},fixedDue=now+120000;
  await fixedPrivate.set({status:"defeated",respawnAtMs:fixedDue},{merge:true});
  await fixedPublic.set({status:"defeated",respawnAtMs:fixedDue},{merge:true});
  assert.equal((await fixed.refresh(fixedRequest,fixedDue-1)).spawned,0);
  const blockers=[];
  for(const [i,p]of reserved.entries()){
    const ref=fixedIsland.collection("cities").doc("block-"+i);await ref.set(p);blockers.push(ref);
  }
  assert.equal((await fixed.refresh(fixedRequest,fixedDue)).blocked,1,"Occupied reserved sites do not fall back to arbitrary ground");
  assert.equal((await fixedPublic.get()).data().spawnId,current.spawnId);
  // Leave exactly one valid replacement: even unlucky random starts must find it.
  const free=reserved.findIndex(p=>Math.hypot(p.x-current.x,p.y-current.y)>0&&Math.hypot(p.x-unchanged.x,p.y-unchanged.y)>128);
  await blockers[free].delete();
  const rotated=await Promise.all([fixed.refresh(fixedRequest,fixedDue+60000),fixed.refresh(fixedRequest,fixedDue+60000)]);
  assert.equal(rotated.reduce((n,r)=>n+r.spawned,0),1);
  const final=(await fixedPrivate.get()).data();assert.equal(final.x,reserved[free].x);assert.equal(final.y,reserved[free].y);
  assert.notEqual(final.spawnId,current.spawnId);assert.deepEqual((await fixedRows[1].ref.get()).data(),unchanged);
  assert.equal((await fixedIsland.collection("marauders").get()).size,2);
  console.log("Respawn regression passed: Southhaven and Crown Citadel actual roads, unchanged cooldowns/buildings, fresh position/identity, concurrent replacement, other remains, and blocked Lionwatch.");
};
