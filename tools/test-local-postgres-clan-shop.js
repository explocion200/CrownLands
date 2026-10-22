"use strict";
const assert = require("node:assert/strict"), { randomUUID, randomBytes } = require("node:crypto");
const T = require("../functions/holding-towers"), B = require("../functions/clan-tower-buildings");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  process.env.CROWNLANDS_BACKEND = "postgres-rehearsal";
  process.env.CROWNLANDS_REHEARSAL_SCHEMA = "migration_game_clanshop_" + randomBytes(6).toString("hex");
  const db = require("../functions/platform").store, game = require("../functions");
  const users = ["leader", "officer", "member", "member"].map((role, index) => ({ uid: "shop_" + randomUUID(), role, name: "Shop Tester " + index }));
  let identity = {};
  const call = async (name, user, data = {}) => game[name]({ auth: { uid: user.uid, token: { email_verified: true, firebase: { sign_in_provider: "google.com" } } },
    data: { clientReleaseId: identity.releaseId, clientWorldId: identity.worldId, clientResetGeneration: identity.resetGeneration, clientRealmShardId: identity.realmShardId, ...data } });
  const profile = user => db.doc(`players/${user.uid}`), read = async ref => (await ref.get()).data();
  const tower = T.TOWERS[0], towerRef = db.doc(`holdingTowers/${tower.id}`), clanId = "shop_" + randomUUID();
  const memberRef = user => db.doc(`clans/${clanId}/members/${user.uid}`);
  const shop = async user => (await call("getClanTowerShop", user, { towerId: tower.id })).clanShop;
  const buy = (user, itemId, extra = {}) => call("purchaseClanTowerShopItem", user, { towerId: tower.id, itemId, operationId: randomUUID(), ...extra });
  try {
    await db.initialize();
    const seasons = require("../functions/season-rewards"), prior = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
    await seasons.arm(db, prior, seasons.seasonInfo(prior).startsAtMs + 1);
    const realm = await call("getRealmInfo", users[0]);
    identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
    await db.doc(`clans/${clanId}`).set({ ...identity, status: "active", leaderUid: users[0].uid, memberCount: users.length, name: "Shop Test Clan", tag: "TST" });
    await towerRef.set({ ...T.createNeutralTowerState(tower.id), ...identity, ownerKind: "clan", clanId, ownershipRevision: 1, wallIntegrityBps: 10000, buildings: { shop: 10 } });
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const user of users) {
      await call("claimStartingCity", user, { playerName: user.name });
      await memberRef(user).set({ ...identity, uid: user.uid, clanId, role: user.role, status: "active", joinedAtMs: Date.now() - 7200000 });
      await profile(user).update({ clanId, clanRole: user.role, gold: 1e12, goldFloat: 1e12,
        clanShopUsage: { ...identity, version: 2, utcDate: yesterday, counts: Object.fromEntries(B.shopStatus(10).filter(i => i.id !== "shield_12h").map(i => [i.id, i.limit])), shieldReadyAtMs: Date.now() - 1 } });
    }
    // Purchasing one item after midnight must not bring yesterday's other item counts into today.
    const first = users[2], receipt = { operationId: randomUUID() };
    const initial = await shop(first); assert(initial.eligible);
    const result = await buy(first, "recall_horn", receipt);
    const refreshed = await shop(first);
    assert.deepEqual(refreshed.items.map(i => [i.id, i.remaining]), result.clanShop.items.map(i => [i.id, i.remaining]), "Refreshing after the first purchase resurrected yesterday's spent allowances");
    assert.equal(refreshed.items.find(i => i.id === "swift_march_order").remaining, 2);
    const bag = (await read(profile(first))).shopItems;
    assert.equal((await buy(first, "recall_horn", receipt)).duplicate, true);
    assert.deepEqual((await read(profile(first))).shopItems, bag);
    // Simulate an already affected legacy record dated today: real purchases
    // and a still-running Shield cooldown must survive receipt-based recovery.
    const shieldReceipt = { operationId: randomUUID() };
    await buy(first, "shield_12h", shieldReceipt);
    const shieldDeadline = (await shop(first)).items.find(i => i.id === "shield_12h").resetAtMs;
    for (const [name, patch] of Object.entries({ foreign: { resetGeneration: "other-season" }, future: { createdAtMs: Date.now() + 3600000 }, priorDay: { createdAtMs: Date.parse(yesterday + "T23:59:00Z") } })) {
      await db.doc(`players/${first.uid}/clanShopReceipts/fixture_${name}`).set({ ...identity, towerId: tower.id, itemId: "war_drums_30m", quantity: 2, createdAtMs: Date.now(), ...patch });
    }
    await profile(first).update({ "clanShopUsage.version": 1, "clanShopUsage.counts.swift_march_order": 2, "clanShopUsage.counts.war_drums_30m": 2 });
    const recovered = await shop(first);
    assert.equal(recovered.items.find(i => i.id === "recall_horn").remaining, 0);
    assert.equal(recovered.items.find(i => i.id === "swift_march_order").remaining, 2);
    assert.equal(recovered.items.find(i => i.id === "war_drums_30m").remaining, 2);
    assert.equal(recovered.items.find(i => i.id === "shield_12h").resetAtMs, shieldDeadline);
    assert.equal((await read(profile(first))).clanShopUsage.version, 2);
    await assert.rejects(buy(first, "recall_horn"), /purchase limit/);
    await assert.rejects(buy(first, "shield_12h"), /purchase limit/);
    // All roles, all seven items, no garrison, personal balances/allowances, and independent main shop usage.
    for (const user of users) {
      const before = await read(profile(user));
      for (const item of (await shop(user)).items) {
        for (let n = 0; n < item.remaining; n++) await buy(user, item.id);
        await assert.rejects(buy(user, item.id), /purchase limit/);
      }
      const after = await read(profile(user));
      assert((await shop(user)).items.every(i => i.remaining === 0), user.role + " did not exhaust exactly their own allowance");
      assert.equal(after.gear.commonGearBoxes, (before.gear?.commonGearBoxes || 0) + 1);
      assert.deepEqual(after.gear.shopPurchase, before.gear?.shopPurchase);
      assert.deepEqual(after.itemPurchaseCooldowns, before.itemPurchaseCooldowns);
    }
    // The last ordinary member has an independent allowance, serialized across simultaneous requests.
    const member = users[3];
    await profile(member).update({ "clanShopUsage.counts.swift_march_order": 1 });
    const races = await Promise.allSettled([buy(member, "swift_march_order"), buy(member, "swift_march_order")]);
    assert.equal(races.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await shop(member)).items.find(i => i.id === "swift_march_order").remaining, 0);
    // A seasonal reset must not resurrect any old counts or the old Shield cooldown on the next write.
    await profile(member).update({ "clanShopUsage.resetGeneration": "previous-season" });
    await buy(member, "recall_horn");
    assert.equal((await shop(member)).items.find(i => i.id === "swift_march_order").remaining, 2);
    assert.equal((await shop(member)).items.find(i => i.id === "shield_12h").remaining, 1);
    // Existing eligibility, level locks, ownership and funds remain authoritative.
    await memberRef(member).update({ joinedAtMs: Date.now() - 1800000 });
    assert.equal((await shop(member)).eligible, false); await assert.rejects(buy(member, "swift_march_order"));
    await memberRef(member).update({ joinedAtMs: Date.now() - 7200000 });
    await towerRef.update({ "buildings.shop": 1 });
    await assert.rejects(buy(member, "common_gear_box"), /item locked/);
    await towerRef.update({ "buildings.shop": 0 }); await assert.rejects(buy(member, "swift_march_order"), /Build this Tower/);
    await towerRef.update({ "buildings.shop": 10 });
    await profile(member).update({ gold: 0, goldFloat: 0, economyUpdatedAtMs: Date.now() });
    await assert.rejects(buy(member, "common_gear_box"), /Not enough personal Gold/);
    await memberRef(member).delete(); await assert.rejects(shop(member), /membership/);
    await towerRef.update({ clanId: "other-clan" }); await assert.rejects(shop(first), /no longer owns/);
    console.log("Local PostgreSQL Clan Shop: UTC/season rollover, all seven items for all roles without garrisons, personal limits, retries, concurrency, main-shop independence and authorization passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
