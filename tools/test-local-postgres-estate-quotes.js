"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { HttpsError } = require("../local-backend/platform");
const { createEstateService } = require("../functions/estate-service");
const E = require("../functions/estate-economy");
const G = require("../functions/common-gear");

(async () => {
  const db = new Store({ schema: "migration_estate_quotes_" + crypto.randomBytes(5).toString("hex") });
  const uid = "estate-quote-fixture", profile = db.doc(`players/${uid}`), state = db.doc(`players/${uid}/estate/state`);
  const originalNow = Date.now;
  let now = Date.UTC(2026, 9, 16, 12), goldRate = 285;
  Date.now = () => now;
  const scope = { worldId: "fixture-world", resetGeneration: "fixture-generation", realmShardId: "fixture-shard" };
  const service = createEstateService({
    db, HttpsError, runTransaction: action => db.runTransaction(action),
    assertCurrentPlayerProfile: value => assert.equal(value.worldId, scope.worldId),
    normalizeGear: () => G.createDefaultState(),
    prepareEconomy: async tx => ({ ...(await tx.get(profile)).data() }),
    writeEconomy: (tx, economy, patch = {}) => tx.set(profile, { ...economy, ...patch }),
    economyResponse: (economy, patch = {}) => ({ gold: economy.goldFloat, ...patch }),
    rawMainGoldRate: () => goldRate,
    guildRealm: () => ({ ...scope, mainCityPath: "fixture-city", endsAtMs: now + E.HOUR, goldRate, troopRate: 0 }),
  });
  const quote = async input => (await service.quote(uid, input)).quote;
  const execute = (q, requestId = crypto.randomUUID()) => service.execute(uid,
    { quoteId: q.id, requestId, acceptPermanentCredit: true }, () => {});
  const seed = async () => {
    const value = E.initial(now);
    for (const key of Object.keys(value.levels)) value.levels[key] = 1;
    value.levels["great-hall"] = 3;
    for (const key of E.KEYS) value.stock[key] = E.capacity(value, key);
    await state.set(value);
    await profile.set({ ...scope, gold: 1000000, goldFloat: 1000000 });
    goldRate = 285;
  };
  const unchangedAfterRejection = async (q, pattern) => {
    const before = [(await state.get()).data(), (await profile.get()).data(),
      (await db.collection(`players/${uid}/estateReceipts`).get()).size];
    await assert.rejects(execute(q), pattern);
    assert.deepEqual([(await state.get()).data(), (await profile.get()).data(),
      (await db.collection(`players/${uid}/estateReceipts`).get()).size], before,
    "Rejected quotes cannot spend, start work or create receipts");
  };
  try {
    await db.initialize();
    await profile.set({ ...scope, gold: 1000000, goldFloat: 1000000 });
    const first = await quote({ action: "fund", building: "foresters-lodge", count: 1 });
    const stored = (await db.doc(`players/${uid}/estateQuotes/${first.id}`).get()).data();
    assert.deepEqual(stored.value, first.value);
    assert.notEqual(JSON.stringify(stored.value), JSON.stringify(first.value), "Real JSONB round trip must exercise reordered quote keys");
    const before = (await state.get()).data();
    await service.load(uid);
    assert.equal((await state.get()).data().revision, before.revision, "An unchanged estate refresh must not invalidate quotes");
    const request = crypto.randomUUID();
    const paid = await Promise.all([execute(first, request), execute(first, request)]);
    assert.equal(paid.filter(result => result.replayed).length, 1);
    assert.equal((await profile.get()).data().goldFloat, 1000000 - first.value.gold);
    assert.equal((await state.get()).data().jobs.length, 1);
    now = (await state.get()).data().jobs[0].completesAtMs;
    assert.equal((await service.load(uid)).estate.levels["foresters-lodge"], 1);
    await service.load(uid);
    assert.equal((await profile.get()).data().goldFloat, 1000000 - first.value.gold);

    // Every building's real next-level quote survives storage, pays its exact
    // bill once and completes through the normal settlement path.
    for (const building of Object.keys(E.initial(now).levels)) {
      await seed();
      const q = await quote({ action: "fund", building, count: 1 });
      const initialStock = (await state.get()).data().stock;
      const result = await execute(q);
      const job = result.estate.jobs[0];
      assert.equal(job.building, building);
      assert.equal(job.target, q.value.jobs[0].target);
      assert.equal(job.completesAtMs - job.startedAtMs, q.value.jobs[0].durationMs);
      assert.equal((await profile.get()).data().goldFloat, 1000000 - q.value.gold);
      for (const key of E.KEYS) assert.equal(result.estate.stock[key], initialStock[key] - (q.value.materials[key] || 0));
      now = job.completesAtMs;
      assert.equal((await service.load(uid)).estate.levels[building], job.target);
      assert.equal((await service.load(uid)).estate.levels[building], job.target);
    }

    // The comparator is shared by non-construction estate services as well.
    await seed();
    await state.update({ "stock.planks": 0 });
    const production = await quote({ action: "produce", building: "sawmill", quantity: 2 });
    const batch = await execute(production);
    assert.equal(batch.estate.productionOrders.sawmill.quantity, 2);
    assert.equal(batch.estate.stock.timber, E.capacity((await state.get()).data(), "timber") - 4);
    const reserves = await quote({ action: "reserves", building: "sawmill", reserves: { timber: 5 } });
    assert.equal((await execute(reserves)).estate.reserves.timber, 5);

    // Equality must still reject actual price, nested terms, type, array or
    // field changes; ignoring map order must never weaken exact consent.
    for (const change of [
      value => { value.gold += 1; },
      value => { value.jobs[0].durationMs += 1; },
      value => { value.materials.stone += 1; },
      value => { value.gold = String(value.gold); },
      value => { value.jobs.push({ ...value.jobs[0] }); },
      value => { value.extra = false; },
      value => { delete value.nonrefundable; },
    ]) {
      await seed();
      const q = await quote({ action: "fund", building: "quarry", count: 1 });
      const altered = structuredClone(q.value); change(altered);
      await db.doc(`players/${uid}/estateQuotes/${q.id}`).update({ value: altered });
      await unchangedAfterRejection(q, /quote changed/);
    }
    await seed();
    const stale = await quote({ action: "fund", building: "quarry", count: 1 });
    await state.update({ revision: stale.revision + 1 });
    await unchangedAfterRejection(stale, /estate changed/);
    await seed();
    const poor = await quote({ action: "fund", building: "quarry", count: 1 });
    await profile.update({ gold: 0, goldFloat: 0 });
    await unchangedAfterRejection(poor, /Not enough Gold/);
    await seed();
    const expired = await quote({ action: "fund", building: "quarry", count: 1 });
    now = expired.expiresAtMs;
    await unchangedAfterRejection(expired, /quote expired/);
    console.log("PostgreSQL estate quotes: reordered maps, first construction, all 20 building upgrades, exact payment/timers/completion, concurrent replay, shared production/reserves, changed terms/types and stale/expired/unaffordable rejection passed.");
  } finally {
    Date.now = originalNow;
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
