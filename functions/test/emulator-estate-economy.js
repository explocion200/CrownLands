"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { signUpVerifiedPlayer } = require("./auth-fixtures");
const E = require("../estate-economy"), G = require("../common-gear"), rewards = require("../season-rewards");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator only");
const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId }); const db = getFirestore();
const realm = { ...require("../release-config.json") };
let functionHost;
async function user() {
  const nonce = crypto.randomBytes(7).toString("hex");
  const response = await signUpVerifiedPlayer(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `estate-${nonce}@example.test`, password: `Estate-${nonce}!`, returnSecureToken: true }),
  });
  const value = await response.json(); assert(response.ok, JSON.stringify(value));
  return { uid: value.localId, token: value.idToken };
}
async function call(name, owner, data = {}) {
  if (!functionHost) {
    const emulators = await (await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`)).json();
    functionHost = `${emulators.functions.host}:${emulators.functions.port}`;
  }
  const response = await fetch(`http://${functionHost}/${projectId}/us-central1/${name}`, {
    method: "POST", headers: { authorization: "Bearer " + owner.token, "content-type": "application/json" },
    body: JSON.stringify({ data: { clientReleaseId: realm.releaseId, clientResetGeneration: realm.resetGeneration,
      clientWorldId: realm.worldId, clientRealmShardId: realm.realmShardId || "legacy", ...data } }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw Error(JSON.stringify(body.error || body));
  return body.result;
}
async function rest(owner, path, method = "GET") {
  return fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
    method, headers: { authorization: "Bearer " + owner.token, "content-type": "application/json" },
    ...(method === "PATCH" ? { body: JSON.stringify({ fields: { revision: { integerValue: "999" } } }) } : {}),
  });
}
async function main() {
  const previous = rewards.previousSeason("realm-" + new Date().toISOString().slice(0, 7));
  if (rewards.supported(previous)) await rewards.arm(db, previous, rewards.seasonInfo(previous).startsAtMs + 1);
  const owner = await user(), stranger = await user();
  const info = await call("getRealmInfo", owner);
  Object.assign(realm, { releaseId: info.currentReleaseId, resetGeneration: info.resetGeneration, worldId: info.worldId, realmShardId: info.sharedRealmId });
  await call("claimStartingCity", owner, { playerName: "Estate tester" });
  const profileRef = db.doc(`players/${owner.uid}`), stateRef = db.doc(`players/${owner.uid}/estate/state`);
  const walletRef = db.doc(`players/${owner.uid}/cosmetics/state`);
  const load = () => call("getEstateState", owner);
  const quote = async input => (await call("getEstateQuote", owner, { input })).quote;
  const commit = (q, requestId = crypto.randomUUID(), extra = {}) => call("commitEstateAction", owner,
    { quoteId: q.id, requestId, acceptPermanentCredit: true, ...extra });
  const act = async input => commit(await quote(input));
  let loaded = await load();
  assert.equal(Object.values(loaded.estate.levels).filter(Boolean).length, 6);
  assert.deepEqual(loaded.estate.stock, E.zero());
  assert.equal((await rest(owner, `players/${owner.uid}/estate/state`)).status, 200);
  assert.equal((await rest(stranger, `players/${owner.uid}/estate/state`)).status, 403);
  assert.equal((await rest(owner, `players/${owner.uid}/estate/state`, "PATCH")).status, 403);
  await profileRef.update({ gold: 1000000000000, goldFloat: 1000000000000 });
  const first = await quote({ action: "fund", building: "foresters-lodge", count: 1 });
  assert.equal(first.value.gold, 75); assert.deepEqual(first.value.materials, {});
  await assert.rejects(commit(first, "quote_reserved_request"), /Reserved request ID/);
  await assert.rejects(commit(first, "not_confirmed_001", { acceptPermanentCredit: false }), /nonrefundable/);
  const paid = await Promise.all([commit(first, "first_funding_001"), commit(first, "first_funding_001")]);
  assert.equal(paid.filter(r => r.replayed).length, 1);
  assert.equal((await stateRef.get()).data().jobs.length, 1);
  await assert.rejects(commit(first, "different_request_001"), /already been accepted/);
  const mine = await quote({ action: "fund", building: "mine", count: 1 });
  const quarry = await quote({ action: "fund", building: "quarry", count: 1 });
  const competing = await Promise.allSettled([commit(mine), commit(quarry)]);
  assert.equal(competing.filter(r => r.status === "fulfilled").length, 1, "Stale second-device quote cannot spend");
  let saved = (await stateRef.get()).data();
  saved.settledAtMs = Date.now() - E.HOUR;
  for (const job of saved.jobs) if (job.status === "running") {
    job.startedAtMs = saved.settledAtMs; job.completesAtMs = job.startedAtMs + job.durationMs;
  }
  await stateRef.set(saved); loaded = await load();
  assert.equal(loaded.estate.jobs.length, 0); assert.equal(loaded.estate.levels["foresters-lodge"], 1);
  assert(loaded.estate.stock.timber > 0); const completedLevel = loaded.estate.levels["foresters-lodge"];
  await load(); assert.equal((await stateRef.get()).data().levels["foresters-lodge"], completedLevel);
  // Install a test-only supply chain and validate large partial credit over resets.
  saved = E.initial(Date.now()); for (const key in saved.levels) saved.levels[key] = 24;
  saved.levels["great-hall"] = 25; for (const key of E.KEYS) saved.stock[key] = 500;
  await stateRef.set(saved);
  const deposit = await quote({ action: "deposit", building: "quarry", amounts: { stone: 250 } });
  await commit(deposit, "deposit_replay_001");
  const profileBefore = (await profileRef.get()).data(), beforeReset = (await stateRef.get()).data();
  await profileRef.set({ ...profileBefore, gold: 100, goldFloat: 100, resetGeneration: "expired-test-realm" });
  const oldRetry = await commit(deposit, "deposit_replay_001", { clientResetGeneration: "expired-test-realm" });
  assert(oldRetry.replayed); assert.deepEqual((await stateRef.get()).data(), beforeReset);
  assert.equal((await profileRef.get()).data().gold, 100);
  await assert.rejects(commit(deposit, "new_expired_spend", { clientResetGeneration: "expired-test-realm" }), /Refresh|updated/);
  await profileRef.set(profileBefore);
  loaded = await load(); assert.equal(loaded.estate.deposits.quarry.deposited.stone, 250);
  // Migration preserves owned higher tiers, consumed upgrade receipts and unopened/pending chests.
  const epic = G.DEFINITIONS.find(d => d.buildingId === "barracks" && d.rarity === "epic");
  const gear = G.createDefaultState();
  gear.instances.old_epic_piece = G.normalizeInstance({ instanceId: "old_epic_piece", gearKey: epic.gearKey, level: 3 });
  gear.uncommonGearBoxes = 1;
  await profileRef.update({ gear }); loaded = await load();
  assert.equal(loaded.estate.entitlements.barracks, 3); assert(loaded.estate.entitlements.treasury >= 1);
  const migrationState = (await stateRef.get()).data(); migrationState.chestEntitlement = 0; migrationState.entitlements = {};
  await stateRef.set(migrationState); await profileRef.update({ gear: G.createDefaultState() });
  await db.doc(`players/${owner.uid}/seasonRewards/pending-estate-test`).set({ uncommonGearBoxes: 1, claimed: false });
  loaded = await load(); assert(loaded.estate.entitlements.treasury >= 1, "Pending award must retain Uncommon entitlement");
  await db.doc(`players/${owner.uid}/seasonRewards/pending-estate-test`).delete();
  // Promotion gates affect only unearned tiers, retaining fixed prices/two copies.
  saved = E.initial(Date.now()); await stateRef.set(saved);
  const common = G.DEFINITIONS.find(d => d.buildingId === "barracks" && d.rarity === "common");
  const promotionGear = G.createDefaultState();
  for (const id of ["promotion_target", "promotion_material"])
    promotionGear.instances[id] = G.normalizeInstance({ instanceId: id, gearKey: common.gearKey, level: 5 });
  await profileRef.update({ gear: promotionGear, gold: 10000000, goldFloat: 10000000 });
  await assert.rejects(call("upgradeCommonGear", owner, { instanceId: "promotion_target", requestId: "locked_promotion_001", cost: 850000, gearSchemaVersion: G.SCHEMA_VERSION }), /Level 25/);
  assert.equal(Object.keys((await profileRef.get()).data().gear.instances).length, 2);
  saved.levels.barracks = 25; saved.levels["great-hall"] = 25; await stateRef.set(saved);
  await call("upgradeCommonGear", owner, { instanceId: "promotion_target", requestId: "allowed_promotion_001", cost: 850000, gearSchemaVersion: G.SCHEMA_VERSION });
  assert.equal(Object.keys((await profileRef.get()).data().gear.instances).length, 1);
  // Tier-matched commissions; full inventory leaves the same pending item.
  saved = E.initial(Date.now()); for (const key in saved.levels) saved.levels[key] = 100;
  for (const key of E.KEYS) saved.stock[key] = 1e6;
  await stateRef.set(saved);
  const commission = await act({ action: "commission", building: "barracks", family: common.familyKey });
  assert.equal(commission.estate.commissions.barracks.rarity, "legendary");
  saved = (await stateRef.get()).data(); saved.commissions.barracks.completesAtMs = Date.now() - 1; await stateRef.set(saved);
  const fullGear = G.createDefaultState();
  for (let i = 0; i < G.INVENTORY_LIMIT; i++) fullGear.instances["full_" + i] = G.normalizeInstance({ instanceId: "full_" + i, gearKey: common.gearKey, level: 1 });
  await profileRef.update({ gear: fullGear });
  const claim = await quote({ action: "claimCommission", building: "barracks" });
  await assert.rejects(commit(claim, "full_inventory_claim"), /Bag is full/);
  assert((await stateRef.get()).data().commissions.barracks);
  await profileRef.update({ gear: G.createDefaultState() });
  const claimed = await Promise.all([commit(claim, "commission_claim_001"), commit(claim, "commission_claim_001")]);
  assert.equal(claimed.filter(r => r.replayed).length, 1);
  const inventory = Object.values((await profileRef.get()).data().gear.instances);
  assert.equal(inventory.length, 1); assert.equal(inventory[0].rarity, "legendary");
  // Stable daily recruits, unlimited owned bench, bounded active roster.
  loaded = await load(); const offer = loaded.estate.recruitOffers.offers[0];
  await profileRef.update({ gold: 1e9, goldFloat: 1e9 });
  const recruited = await act({ action: "recruit", offerId: offer.id });
  const championId = recruited.receipt.championId;
  assert.equal(recruited.champions[championId].level, 10);
  await assert.rejects(quote({ action: "recruit", offerId: offer.id }), /unavailable/);
  const batch = db.batch();
  for (let i = 0; i < 30; i++) {
    const id = "champion_bench_" + String(i).padStart(2, "0");
    batch.set(db.doc(`players/${owner.uid}/estateChampions/${id}`),
      { id, name: "Bench champion", level: 100, xp: 0, quality: 4, active: false, questId: "", recoveryUntilMs: 0 });
  }
  await batch.commit();
  const page = await call("getEstateChampions", owner); assert.equal(page.champions.length, 25); assert(page.nextCursor);
  const secondPage = await call("getEstateChampions", owner, { cursor: page.nextCursor }); assert.equal(secondPage.champions.length, 6);
  const ids = ["00", "01", "02", "03"].map(n => "champion_bench_" + n);
  for (const id of ids) await act({ action: "roster", championId: id, active: true });
  const quest = await act({ action: "quest", tier: 4, hours: 8, championIds: ids, resources: ["timber"], meal: "feast" });
  await assert.rejects(quote({ action: "roster", championId: ids[0], active: false }), /finish/);
  const originalBudget = quest.estate.questUsage.hours;
  saved = (await stateRef.get()).data(); saved.quests[0].completesAtMs = Date.now() - 1; await stateRef.set(saved);
  const finished = await Promise.all([load(), load()]);
  assert(finished.every(r => r.estate.parcels.length === 1)); assert.equal(finished[0].estate.questUsage.hours, originalBudget);
  const recovered = (await db.doc(`players/${owner.uid}/estateChampions/${ids[0]}`).get()).data();
  assert(recovered.recoveryUntilMs > Date.now()); assert.equal(recovered.questId, "");
  saved = (await stateRef.get()).data(); saved.stock.timber = E.capacity(saved, "timber") - 1;
  saved.processors["foresters-lodge"] = false; await stateRef.set(saved);
  const parcel = await act({ action: "claimParcel", parcelId: quest.receipt.requestId });
  assert.equal(parcel.receipt.received.timber, 1); assert(parcel.estate.parcels[0].rewards.timber > 0);
  // A shared Crown allowance spans both stores and survives seasonal parent replacement.
  saved = (await stateRef.get()).data(); saved.stock.timber = 0; saved.stock.food = 0; await stateRef.set(saved);
  await walletRef.set({ crowns: 100, revision: 0 });
  await act({ action: "supply", resource: "timber", hours: .5 });
  const supply = await act({ action: "supply", resource: "food", hours: .5 });
  assert.equal(supply.cosmetics.crowns, 80);
  await assert.rejects(quote({ action: "supply", resource: "timber", hours: .25 }), /allowance/);
  const persistent = (await stateRef.get()).data();
  await profileRef.set({ ...(await profileRef.get()).data(), gold: 100, goldFloat: 100 });
  assert.deepEqual((await stateRef.get()).data(), persistent);
  for (const collection of ["estateQuotes", "estateReceipts", "estateContracts", "estateChampions"])
    assert.equal((await rest(owner, `players/${owner.uid}/${collection}/forged_record`, "PATCH")).status, 403);
  console.log("Estate emulator passed: real Gold authority, current realm guards, durable receipts, two devices, persistence, migration, Gear, champions, quests, shared Crown cap and write rules.");
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
