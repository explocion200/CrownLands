"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
const { HttpsError } = require("../local-backend/platform");
const { createCosmeticsService } = require("../functions/cosmetics-service");

(async () => {
  const schema = "migration_game_preset_" + crypto.randomBytes(5).toString("hex");
  const db = new Store({ schema });
  const source = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
  const start = source.indexOf("exports.applySkillPreset ="), end = source.indexOf("async function migrateSkillPointSystemForPlayer", start);
  assert(start > 0 && end > start);
  const uid = "preset-wallet-fixture", profile = db.doc(`players/${uid}`);
  const wallet = db.doc(`players/${uid}/cosmetics/state`);
  const cosmeticService = createCosmeticsService({ db, HttpsError, runTransaction: op => db.runTransaction(op) });
  const scope = {
    exports: {}, HttpsError, cosmeticService, SKILL_PRESET_APPLY_CROWNS: 10, RESET_GENERATION: "test-generation",
    timedCallable: (_name, _options, handler) => handler, requireAuth: request => request.auth.uid,
    safeNumber: (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    getCurrentRealmShardId: () => "test-shard", runTransactionWithInfrastructureRetry: op => db.runTransaction(op),
    prepareEconomyCollection: async tx => {
      const snap = await tx.get(profile);
      return { profileSnap: snap, profileAfter: snap.data(), gold: snap.data().gold };
    },
    normalizeSkillUpgrades: value => value, reconcileSkillPoints: value => value,
    requireUnlockedSkillPresetSlot: slot => ({ slot }), normalizeSkillPresets: value => value,
    isValidSkillPresetAllocation: () => true, normalizeSkillPresetAllocation: value => value,
    skillPresetAllocationsMatch: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    setActiveSkillPresetSlot: (presets, activeSlot) => ({ ...presets, activeSlot }),
    writePreparedEconomy: (tx, _economy, patch) => tx.update(profile, patch),
    createEconomyResponse: (economy, patch) => ({ currentUser: { ...economy.profileAfter, ...patch }, ...patch }),
  };
  // Execute the unchanged callable source against real PostgreSQL and the real shared Crown wallet.
  // The emulator suite covers full realm/economy preparation and all skill validation.
  new Function(...Object.keys(scope), source.slice(start, end))(...Object.values(scope));
  const apply = data => scope.exports.applySkillPreset({ auth: { uid }, data });
  const request = () => ({ slot: 1, currency: "crowns", expectedPrice: 10, expectedSavedAtMs: 123, requestId: crypto.randomUUID() });
  const seed = async crowns => {
    await profile.set({ gold: 0, character: { level: 100, skillPoints: 80 }, upgrades: { swordmastery: 0 },
      skillPresets: { activeSlot: 0, slots: [{ slot: 1, name: "War", saved: true, savedAtMs: 123, upgrades: { swordmastery: 19 } }] } });
    await wallet.set({ crowns, revision: 0 });
  };
  try {
    await db.initialize(); await seed(20);
    await assert.rejects(apply({ slot: 1 }), { code: "failed-precondition" });
    await assert.rejects(apply({ ...request(), expectedPrice: 9 }), { code: "failed-precondition" });
    await assert.rejects(apply({ ...request(), expectedSavedAtMs: 124 }), { code: "failed-precondition" });
    const first = request(), duplicates = await Promise.all([apply(first), apply(first)]);
    assert.equal(duplicates.filter(result => result.replayed).length, 1);
    assert.equal((await wallet.get()).data().crowns, 10);
    assert.equal((await wallet.get()).data().revision, 1);
    assert.equal((await profile.get()).data().gold, 0);
    assert.equal((await profile.get()).data().upgrades.swordmastery, 19);
    await assert.rejects(apply({ ...first, slot: 2 }), { code: "invalid-argument" });
    await profile.update({ upgrades: { swordmastery: 4 }, "skillPresets.activeSlot": 0 });
    const replay = await apply(first);
    assert.equal(replay.replayed, true);
    assert.equal((await profile.get()).data().upgrades.swordmastery, 4, "Replay cannot reapply an old build");
    const independent = await apply(request());
    assert.equal(independent.skillPreset.crownsCharged, 10);
    assert.equal((await wallet.get()).data().crowns, 0);
    await seed(9);
    await assert.rejects(apply(request()), { code: "failed-precondition" });
    assert.equal((await wallet.get()).data().crowns, 9);
    assert.equal((await profile.get()).data().upgrades.swordmastery, 0);
    await seed(10);
    const race = await Promise.allSettled([apply(request()), apply(request())]);
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await wallet.get()).data().crowns, 0);
    // A different Crown product shares the same wallet and must conflict with Apply.
    await seed(600);
    const crossProduct = await Promise.allSettled([
      apply(request()),
      cosmeticService.purchase(uid, { requestId: crypto.randomUUID(), offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, Date.UTC(2026, 9, 16)),
    ]);
    assert.equal(crossProduct.filter(result => result.status === "fulfilled").length, 1);
    assert([0, 590].includes((await wallet.get()).data().crowns));
    await seed(600);
    const skin = await cosmeticService.purchase(uid, { requestId: crypto.randomUUID(), offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, Date.UTC(2026, 9, 16));
    assert.equal(skin.state.crowns, 0, "The competing product must be purchasable with sufficient funds");
    console.log("PostgreSQL preset Crowns: atomic allocation/wallet/receipt, zero Gold, stale consent/build rejection, replay, independent confirmations, insufficient funds and competing cosmetic purchase passed.");
  } finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
