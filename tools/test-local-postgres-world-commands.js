"use strict";
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs"), path = require("node:path");
const { createPlatform } = require("../local-backend/platform");
const { Store } = require("../local-backend/store");
const production=process.argv.includes("--production");
const { createCommandRouting } = require(production?"../local-backend/world/routing":"./map-benchmark/seamless/command-routing");
const { createTravelFixture, canonicalCity } = require("./world-travel-test-fixtures");

(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  assert.equal(require("../functions/platform").privateWorldRouting, undefined);
  const routing = createCommandRouting();
  for (const schema of ["migration_game_live", "migration_game_preview", "migration_game_test_123"]) {
    const rejected = new Store({ schema });
    assert.throws(() => createPlatform({ store: rejected, privateWorldRouting: routing }), /disposable worldtest/);
    await rejected.close();
  }
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_worldtest_" + randomBytes(6).toString("hex");
  const file = require.resolve("../functions/platform"); delete require.cache[file];
  const ordinary = require(file), db = ordinary.store;
  assert.equal(ordinary.privateWorldRouting, undefined, "No environment switch can enable draft routing");
  require.cache[file].exports = createPlatform({ store: db, privateWorldRouting: routing });
  const game = require("../functions"), fixture = createTravelFixture(87);
  const measurements = [], scenarios = [], diagnostics = [];
  const originalLog = console.log;
  console.log = (...args) => {
    const [label, details] = args;
    if (label === "crownlands_operation" && ["resolveArmyOrder", "sendArmyOrder", "joinClanRally", "launchClanRally"].includes(details?.operation)) {
      const values = {};
      for (const key of ["requestDurationMs", "dbReadQueries", "dbReadRows", "dbTransactionAttempts", "dbSerializationFailures", "dbDeadlocks", "dbRetries", "dbDocumentCacheHits"]) {
        if (Number.isFinite(details[key])) values[key] = details[key];
      }
      diagnostics.push({ operation: details.operation, outcome: details.outcome, ...values });
    }
    originalLog(...args);
  };
  let identity = {};
  const call = async (name, user, data = {}) => {
    const start = performance.now();
    const result = await game[name]({ auth: { uid: user.uid, token: { email_verified: true,
      firebase: { sign_in_provider: "google.com" } } }, data: {
      clientReleaseId: identity.releaseId, clientWorldId: identity.worldId,
      clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId, ...data } });
    measurements.push({ name, ms: performance.now() - start });
    if (name === "getRealmInfo") identity = { releaseId: result.currentReleaseId, worldId: result.worldId,
      resetGeneration: result.resetGeneration, realmShardId: result.sharedRealmId };
    return result;
  };
  const actor = async label => ({ uid: `worldtest_${randomUUID()}`, label });
  const read = async ref => (await ref.get()).data();
  const cityRef = c => db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${c.regionId}/cities/${c.id}`);
  const own = (city, user, troops = 50000) => cityRef(city).set({ ...city, ...identity, ownerKind: "player", owner: "player",
    ownerUid: user.uid, ownerName: user.label, level: 1, troops, troopFloat: troops, isMainCity: false,
    productionUpdatedAtMs: Date.now() + 3600000 }, { merge: true });
  const payload = (source, target, kind = "transfer", id = `worldtest_${randomUUID()}`) => ({ armyId: id,
    sourceRegionId: source.regionId, targetRegionId: target.regionId,
    army: { id, kind, fromId: source.id, toId: target.id, troops: 10, requestedTroops: 10,
      sourceRegionId: source.regionId, targetRegionId: target.regionId,
      total: .001, pathLength: 1, routingVersion: "client-forged", path: [{ x: 0, y: 0 }, { x: 1, y: 1 }], pathSegments: [] } });
  const request = m => ({ armyId: m.id, routeRegionIds: m.routeRegionIds });
  const due = m => db.doc(`armies/${m.id}`).update({ arrivesAtMs: Date.now() - 1000 });
  async function settle(user, m) {
    assert.deepEqual((await read(db.doc(`armies/${m.id}`))).pathSegments, m.pathSegments);
    for (const id of m.routeRegionIds) assert((await db.doc(`islands/${identity.worldId}--${identity.realmShardId}--${id}/armies/${m.id}`).get()).exists);
    await assert.rejects(call("resolveArmyOrder", user, request(m)), /not arrived/);
    await due(m);
    const results = await Promise.all([call("resolveArmyOrder", user, request(m)), call("resolveArmyOrder", user, request(m))]);
    assert(results.every(r => r.ok));
    assert.equal((await read(db.doc(`armies/${m.id}`))).status, "resolved");
    return results;
  }
  try {
    await db.initialize();
    const seasons = require("../functions/season-rewards"), prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    const leader = await actor("World leader"), ally = await actor("World ally");
    await call("getRealmInfo", leader);
    const claims = [];
    for (const user of [leader, ally]) claims.push(await call("claimStartingCity", user, { playerName: user.label }));
    await db.doc(`realmGenerations/${identity.resetGeneration}/expansion/current`).set({ activeRegionIds: fixture.activeRegionIds,
      admittingRegionIds: fixture.activeRegionIds, nextActivationOrdinal: fixture.activeRegionIds.length }, { merge: true });
    const used = new Set(claims.map(c => c.cityId));
    const city = (region, index) => {
      while (used.has(canonicalCity(fixture.planner, region, index).id)) index++;
      const c = canonicalCity(fixture.planner, region, index); used.add(c.id); return c;
    };
    const source = city(fixture.activeRegionIds[0], 10), target = city(fixture.activeRegionIds[12], 12);
    const enemy = city(fixture.activeRegionIds[12], 14), allyCity = city(fixture.activeRegionIds[12], 16);
    for (const regionId of [source.regionId, target.regionId]) await call("ensureMainIsland", leader, { regionId });
    for (const c of claims) await db.doc(`islands/${c.islandId}/cities/${c.cityId}`).update({ troops: 0, troopFloat: 0, productionUpdatedAtMs: Date.now() + 3600000 });
    await own(source, leader); await own(target, leader, 100); await own(allyCity, ally);
    await cityRef(enemy).set({ ...enemy, ...identity, ownerKind: "neutral", ownerUid: "", isMainCity: false,
      troops: 1, troopFloat: 1, level: 1, productionUpdatedAtMs: Date.now() + 3600000 });
    const clanId = `worldtest_${randomUUID()}`;
    await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: leader.uid, memberCount: 2, name: "World test", tag: "TEST" });
    for (const [u, role] of [[leader, "leader"], [ally, "member"]]) {
      await db.doc(`clans/${clanId}/members/${u.uid}`).set({ ...identity, clanId, uid: u.uid, status: "active", role });
      await db.doc(`players/${u.uid}`).update({ clanId, clanRole: role, itemEffects: {}, shopItems: { recall_horn: 20 },
        upgrades: { marchOrders: 5 }, gold: 10000000, goldFloat: 10000000 });
    }
    // A real old-policy launch must survive activation and idempotent retries.
    const oldRequest = payload(source, target), old = (await call("sendArmyOrder", leader, oldRequest)).movement;
    assert(old.pathSegments.every(s => !s.routingVersion));
    routing.setEnabled(true);
    const replay = (await call("sendArmyOrder", leader, oldRequest)).movement;
    assert.deepEqual(replay.pathSegments, old.pathSegments); assert.equal(replay.arrivesAtMs, old.arrivesAtMs);
    await settle(leader, old); scenarios.push("pre-transition launch/replay/arrival unchanged");

    const launch = async (user, from, to, kind = "transfer") => {
      const preview = await call("previewArmyRoute", user, { fromId: from.id, toId: to.id, sourceRegionId: from.regionId,
        targetRegionId: to.regionId, kind, requestedTroops: 10 });
      const order = payload(from, to, kind), movement = (await call("sendArmyOrder", user, order)).movement;
      assert(movement.pathSegments.every(s => s.routingVersion === (production?"continuous-world-v1":"open-world-draft-v1") && /^[a-f0-9]{64}$/.test(s.geometryId)));
      assert.deepEqual(movement.pathSegments, preview.segments);
      assert.equal(Math.ceil(movement.total * 1000), preview.durationMs);
      const repeated = (await call("sendArmyOrder", user, order)).movement;
      assert.equal(repeated.arrivesAtMs, movement.arrivesAtMs);
      return movement;
    };
    const next = await launch(leader, source, target);
    assert.notDeepEqual(next.pathSegments, old.pathSegments);
    routing.setEnabled(false); // Rollback does not reinterpret already issued routes.
    await settle(leader, next); routing.setEnabled(true);
    scenarios.push("new geometry, forged geometry/ETA ignored, disable preserves saved route");
    await assert.rejects(call("sendArmyOrder", ally, payload(source, target)), /own|belong|source/i);
    const scout = await call("sendArmyOrder", leader, payload(source, enemy, "scout"));
    assert(scout.movement.pathSegments.every(s => s.routingVersion)); await settle(leader, scout.movement);
    await settle(leader, await launch(leader, source, enemy, "attack"));
    const reinforcement = await launch(leader, source, allyCity, "reinforce"); await settle(leader, reinforcement);
    scenarios.push("closest scout, attack, allied reinforcement, intermediate views and duplicate arrivals");
    const stations = await db.collection("reinforcements").where("ownerUid", "==", leader.uid).get();
    const stationed = stations.docs.find(s => s.data().status === "stationed"); assert(stationed);
    const recalled = await call("returnClanReinforcement", leader, { reinforcementId: stationed.id });
    assert(recalled.movement.pathSegments.every(s => s.routingVersion)); await settle(leader, recalled.movement);
    const allyTarget = city(source.regionId, 24); await own(allyTarget, ally);
    const simultaneous = await Promise.all([launch(leader, source, target), launch(ally, allyCity, allyTarget)]);
    await Promise.all(simultaneous.map((m, i) => settle(i ? ally : leader, m)));
    scenarios.push("two simultaneous player commands and stationed reinforcement recall");
    const unavailableOrder = payload(source, target), beforeFailure = await read(cityRef(source));
    const calculate = routing.calculate;
    routing.calculate = async () => { throw Object.assign(Error("Injected private worker unavailable"), { code: "unavailable" }); };
    try { await assert.rejects(call("sendArmyOrder", leader, unavailableOrder), /worker unavailable/); }
    finally { routing.calculate = calculate; }
    assert.equal((await read(cityRef(source))).troops, beforeFailure.troops);
    assert(!(await db.doc(`armies/${unavailableOrder.armyId}`).get()).exists);
    scenarios.push("worker failure rolls back order without troop loss");
    const returning = await launch(leader, source, target);
    const now = Date.now();
    await db.doc(`armies/${returning.id}`).update({ launchedAtMs: now - 60000, arrivesAtMs: now + 60000, total: 120 });
    await call("useRecallHorn", leader, request(returning));
    const reversed = { id: returning.id, ...await read(db.doc(`armies/${returning.id}`)) };
    assert(reversed.pathSegments.every(s => s.geometryId === returning.pathSegments[0].geometryId));
    await settle(leader, reversed); scenarios.push("recall retains original geometry version");
    // An actual fresh server process must settle persisted routes with the
    // draft provider absent. This tests restart/rollback, not just a boolean.
    routing.setEnabled(false);
    const restartOld = (await call("sendArmyOrder", leader, payload(source, target))).movement;
    routing.setEnabled(true);
    const restartNew = await launch(leader, source, target);
    await due(restartOld); await due(restartNew);
    const restartScript = `
      const assert=require('node:assert/strict');
      const input=JSON.parse(process.argv[1]);
      if(!/^migration_game_worldtest_[a-f0-9]{12}$/.test(process.env.CROWNLANDS_REHEARSAL_SCHEMA))throw Error('Disposable schema required');
      const platform=require('./functions/platform'),game=require('./functions');
      (async()=>{try{
        assert.equal(platform.privateWorldRouting,undefined);
        for(const id of input.ids){
          const ref=platform.store.doc('armies/'+id),before=(await ref.get()).data();
          assert.equal(before.status,'active');
          const result=await game.resolveArmyOrder({auth:{uid:input.uid,token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}},
            data:{armyId:id,routeRegionIds:before.routeRegionIds,...input.scope}});
          assert(result.ok);
          const after=(await ref.get()).data();assert.equal(after.status,'resolved');
          assert.deepEqual(after.pathSegments,before.pathSegments);
          assert.equal(after.launchedAtMs,before.launchedAtMs);assert.equal(after.arrivesAtMs,before.arrivesAtMs);
        }
      }finally{await platform.store.close();}})().catch(e=>{console.error(e);process.exitCode=1});`;
    require("node:child_process").execFileSync(process.execPath, ["-e", restartScript, JSON.stringify({
      uid: leader.uid, ids: [restartOld.id, restartNew.id], scope: { clientReleaseId: identity.releaseId,
        clientWorldId: identity.worldId, clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId },
    })], { cwd: path.resolve(__dirname,".."), timeout: 30000, stdio: ["ignore","pipe","pipe"] });
    for(const movement of [restartOld,restartNew]) assert.equal((await read(db.doc("armies/"+movement.id))).status,"resolved");
    scenarios.push("fresh backend process settles saved old/new routes without draft provider");
    // Exercise full real rally join, withdrawal, rejoin, cancellation and fallback
    // returns through the same shared cases used by the production adapter.
    await require("../functions/test/rally-recall-rejoin-cases")({ db, call, actor,
      getWorldMap: id => fixture.scope.getServerWorldMap(id),
      settleReceipt: snapshot => game.settleRallyBattle({ data: snapshot, params: { receiptId: snapshot.id } }) });
    scenarios.push("three-player rally recall/rejoin/cancellation and captured-origin returns");
    const output = path.resolve("release-artifacts/continuous-command-rehearsal"); fs.mkdirSync(output, { recursive: true });
    const arrivals = diagnostics.filter(row => row.operation === "resolveArmyOrder" && row.outcome === "ok");
    assert(arrivals.length > 0 && arrivals.every(row => row.dbReadQueries > 0), "Real arrivals must expose bounded read diagnostics");
    const report = { passed: true, sections: 112, scenarios, measurements, diagnostics, resources: routing.stats() };
    fs.writeFileSync(path.join(output, "commands.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: true, scenarios, calls: measurements.length, resources: routing.stats() }));
  } finally {
    console.log = originalLog;
    await routing.close();
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
