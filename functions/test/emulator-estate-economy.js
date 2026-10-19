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
  const load = () => call("getEstateState", owner, { includeUpgradeOverview: true });
  const quote = async input => (await call("getEstateQuote", owner, { input })).quote;
  const commit = (q, requestId = crypto.randomUUID(), extra = {}) => call("commitEstateAction", owner,
    { quoteId: q.id, requestId, acceptPermanentCredit: true, ...extra });
  const act = async input => commit(await quote(input));
  let loaded = await load();
  assert.equal(Object.values(loaded.estate.levels).filter(Boolean).length, 6);
  assert.deepEqual(loaded.estate.stock, E.zero());
  assert.equal(Object.keys(loaded.upgradeOverview).length,20);
  assert.equal(loaded.upgradeOverview["foresters-lodge"].ready,true);
  assert.equal(loaded.upgradeOverview.treasury.status,"blocked","Completed Hall level gates readiness");
  assert.equal(loaded.upgradeOverview["foresters-lodge"].bill.gold,75);
  assert.deepEqual(loaded.estate.buildingPrerequisites.treasury,[{building:"great-hall",requiredLevel:2,currentLevel:1}]);
  assert.deepEqual(loaded.estate.buildingPrerequisites.workshop,[
    {building:"sawmill",requiredLevel:1,currentLevel:0},
    {building:"smithy",requiredLevel:1,currentLevel:0},
  ]);
  assert.deepEqual(loaded.estate.buildingPrerequisites.sawmill,[{building:"foresters-lodge",requiredLevel:1,currentLevel:0}]);
  await assert.rejects(quote({action:"fund",building:"workshop",count:1}),/Construct sawmill to Level 1 first/);
  assert.equal((await db.collection(`players/${owner.uid}/estateQuotes`).get()).size,0,"Overview creates no spend quotes");
  assert.equal((await call("getEstateState",owner)).upgradeOverview,undefined,"Ordinary clock refreshes do not prepare realm readiness");
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
  assert.equal(competing.filter(r => r.status === "fulfilled").length, 0, "No work can be queued while the builder is occupied");
  assert(competing.every(r=>/builders are busy/.test(r.reason.message)));
  assert.equal((await stateRef.get()).data().jobs.length,1);
  loaded=await load();
  assert.equal(loaded.upgradeOverview["foresters-lodge"].status,"constructing");
  assert.equal(loaded.upgradeOverview.mine.status,"builders");
  let saved = (await stateRef.get()).data();
  saved.settledAtMs = Date.now() - E.HOUR;
  for (const job of saved.jobs) if (job.status === "running") {
    job.startedAtMs = saved.settledAtMs; job.completesAtMs = job.startedAtMs + job.durationMs;
  }
  await stateRef.set(saved); loaded = await load();
  assert.equal(loaded.estate.jobs.length, 0); assert.equal(loaded.estate.levels["foresters-lodge"], 1);
  assert.deepEqual(loaded.estate.buildingPrerequisites.sawmill,[],"Completed source removes its prerequisite link");
  assert.deepEqual(loaded.estate.buildingPrerequisites.smithy,[{building:"mine",requiredLevel:1,currentLevel:0}]);
  assert(loaded.estate.stock.timber > 0); const completedLevel = loaded.estate.levels["foresters-lodge"];
  await load(); assert.equal((await stateRef.get()).data().levels["foresters-lodge"], completedLevel);
  const freeQuotes=await Promise.all([quote({action:"fund",building:"mine",count:1}),quote({action:"fund",building:"quarry",count:1})]);
  const race=await Promise.allSettled(freeQuotes.map(q=>commit(q)));
  assert.equal(race.filter(r=>r.status==="fulfilled").length,1,"Concurrent starts must claim a free builder only once");
  assert.equal((await stateRef.get()).data().jobs.length,1);
  // Seed pre-release credit/receipts only in the emulator. New deposit actions
  // and unaccepted old quotes cannot create credit; accepted receipts still replay.
  saved = E.initial(Date.now()); for (const key in saved.levels) saved.levels[key] = 24;
  saved.levels["great-hall"] = 25; for (const key of E.KEYS) saved.stock[key] = 500;
  const legacyBill=E.baseQuote(saved,"quarry",25,285);
  saved.stock.stone-=250;
  saved.deposits.quarry={target:25,version:"retained-price-v1",materials:legacyBill.materials,deposited:{stone:250}};
  await stateRef.set(saved);
  // Admission migrates Gear entitlements and advances the estate revision.
  // An unaccepted legacy quote must bind that canonical revision so this test
  // reaches deposit retirement rather than the unrelated stale-quote guard.
  await load();
  const profileBefore = (await profileRef.get()).data(), beforeReset = (await stateRef.get()).data();
  const deposit={id:"legacy_deposit_quote",input:{action:"deposit",building:"quarry",amounts:{stone:250}},
    value:{action:"deposit",building:"quarry",amounts:{stone:250},target:25,nonrefundable:true},
    expiresAtMs:Date.now()+300000,revision:beforeReset.revision,resetGeneration:profileBefore.resetGeneration,
    worldId:profileBefore.worldId,realmShardId:profileBefore.realmShardId||"legacy"};
  await db.doc(`players/${owner.uid}/estateQuotes/${deposit.id}`).set(deposit);
  await db.doc(`players/${owner.uid}/estateReceipts/deposit_replay_001`).set({requestId:"deposit_replay_001",quoteId:deposit.id,action:"deposit"});
  await profileRef.set({ ...profileBefore, gold: 100, goldFloat: 100, resetGeneration: "expired-test-realm" });
  const oldRetry = await commit(deposit, "deposit_replay_001", { clientResetGeneration: "expired-test-realm" });
  assert(oldRetry.replayed); assert.deepEqual((await stateRef.get()).data(), beforeReset);
  assert.equal((await profileRef.get()).data().gold, 100);
  await assert.rejects(commit(deposit, "new_expired_spend", { clientResetGeneration: "expired-test-realm" }), /Refresh|updated/);
  await profileRef.set(profileBefore);
  await assert.rejects(quote({action:"deposit",building:"quarry",amounts:{stone:1}}),/no longer available/);
  await assert.rejects(commit(deposit,"unaccepted_old_deposit"),/no longer available/);
  assert.deepEqual((await stateRef.get()).data(),beforeReset);
  assert.equal((await db.doc(`players/${owner.uid}/estateReceipts/unaccepted_old_deposit`).get()).exists,false);
  loaded = await load(); assert.equal(loaded.estate.deposits.quarry.deposited.stone, 250);
  assert.equal(loaded.estate.constructionPolicy,"pay-on-start");
  assert.equal(loaded.upgradeOverview.quarry.status,"materials");
  await assert.rejects(quote({action:"fund",building:"quarry",count:2}),/one level/);
  const incomplete=await quote({action:"fund",building:"quarry",count:1});
  assert.equal(incomplete.value.jobs[0].version,"retained-price-v1");
  assert.equal(incomplete.value.materials.stone,legacyBill.materials.stone-250);
  const unpaidState=(await stateRef.get()).data(),unpaidGold=(await profileRef.get()).data().goldFloat;
  await assert.rejects(commit(incomplete,"insufficient_materials"),/Not enough/);
  assert.deepEqual((await stateRef.get()).data(),unpaidState);assert.equal((await profileRef.get()).data().goldFloat,unpaidGold);
  assert.equal((await db.doc(`players/${owner.uid}/estateReceipts/insufficient_materials`).get()).exists,false);
  for(const key of E.KEYS)unpaidState.stock[key]=1e6;await stateRef.set(unpaidState);
  await profileRef.update({gold:0,goldFloat:0});
  const noGold=await quote({action:"fund",building:"quarry",count:1});
  const noGoldState=(await stateRef.get()).data(),noGoldProfile=(await profileRef.get()).data();
  await assert.rejects(commit(noGold,"insufficient_gold"),/Not enough Gold/);
  assert.deepEqual((await stateRef.get()).data(),noGoldState);
  assert.equal((await profileRef.get()).data().goldFloat,noGoldProfile.goldFloat);
  await profileRef.update({gold:1e12,goldFloat:1e12});
  loaded=await load();assert.equal(loaded.upgradeOverview.quarry.ready,true,"Loose materials plus old credit enable Upgrade");
  const ready=await quote({action:"fund",building:"quarry",count:1});
  assert(Object.values(ready.value.materials).some(v=>v>0));
  const stockBefore=(await stateRef.get()).data().stock;
  const startedRace=await Promise.all([commit(ready,"manual_upgrade_001"),commit(ready,"manual_upgrade_001")]);
  assert.equal(startedRace.filter(r=>r.replayed).length,1);
  const started=startedRace.find(r=>!r.replayed);assert.equal(started.estate.jobs[0].status,"running");
  assert.equal(started.estate.deposits.quarry,undefined);
  for(const key of E.KEYS)assert(Math.abs(started.estate.stock[key]-(stockBefore[key]-(ready.value.materials[key]||0)))<1,
    "Only due materials are paid once: "+key);
  const afterStart=(await stateRef.get()).data(),goldAfterStart=(await profileRef.get()).data().goldFloat;
  assert((await commit(ready,"manual_upgrade_001")).replayed);
  assert.deepEqual((await stateRef.get()).data(),afterStart);assert.equal((await profileRef.get()).data().goldFloat,goldAfterStart);
  await assert.rejects(quote({action:"fund",building:"quarry",count:1}),/Finish/);
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
  // Promotion gates use completed building levels even when inventory, chests,
  // pending grants or legacy entitlements already include the destination tier.
  saved = E.initial(Date.now()); await stateRef.set(saved);
  const common = G.DEFINITIONS.find(d => d.buildingId === "barracks" && d.rarity === "common");
  const promotionGear = G.createDefaultState();
  for (const id of ["promotion_target", "promotion_material"])
    promotionGear.instances[id] = G.normalizeInstance({ instanceId: id, gearKey: common.gearKey, level: 5 });
  promotionGear.instances.old_epic_piece = G.normalizeInstance({ instanceId:"old_epic_piece",gearKey:epic.gearKey,level:3 });
  promotionGear.uncommonGearBoxes = 1;
  saved.entitlements.barracks = 4; saved.chestEntitlement = 1; await stateRef.set(saved);
  await profileRef.update({ gear: promotionGear, gold: 10000000, goldFloat: 10000000 });
  await assert.rejects(call("upgradeCommonGear", owner, { instanceId: "promotion_target", requestId: "locked_promotion_001", cost: 850000, gearSchemaVersion: G.SCHEMA_VERSION }), /Level 25/);
  assert.equal(Object.keys((await profileRef.get()).data().gear.instances).length, 3);
  saved.levels.barracks = 25; saved.levels["great-hall"] = 25; await stateRef.set(saved);
  await call("upgradeCommonGear", owner, { instanceId: "promotion_target", requestId: "allowed_promotion_001", cost: 850000, gearSchemaVersion: G.SCHEMA_VERSION });
  assert.equal(Object.keys((await profileRef.get()).data().gear.instances).length, 2);
  // All officer buildings enforce every rarity boundary for new equipment,
  // including same-rarity upgrades. Existing gear remains equip/upgrade usable.
  for (const building of Object.keys(G.BUILDINGS)) for (let tier=1;tier<G.RARITIES.length;tier++) {
    const rarity=G.RARITIES[tier], threshold=[1,25,50,75,100][tier];
    const definition=G.DEFINITIONS.find(d=>d.buildingId===building&&d.rarity===rarity&&d.slot==="head");
    const owned=G.createDefaultState();
    for(const id of ["new_target","new_material","old_target","old_material"])
      owned.instances[id]=G.normalizeInstance({instanceId:id,gearKey:definition.gearKey,level:1,requiresBuildingLevel:id.startsWith("new")});
    saved=E.initial(Date.now());saved.levels[building]=threshold-1;saved.entitlements[building]=4;
    await stateRef.set(saved);await profileRef.update({gear:owned,gold:1e15,goldFloat:1e15});
    const before=(await profileRef.get()).data(),estateBefore=(await stateRef.get()).data();
    await assert.rejects(call("equipCommonGear",owner,{instanceId:"new_target",gearSchemaVersion:G.SCHEMA_VERSION}),new RegExp("Level "+threshold));
    await assert.rejects(call("upgradeCommonGear",owner,{instanceId:"new_target",requestId:crypto.randomUUID(),cost:G.getUpgradeGoldCost(owned.instances.new_target),gearSchemaVersion:G.SCHEMA_VERSION}),new RegExp("Level "+threshold));
    assert.deepEqual((await profileRef.get()).data(),before,"Denied gear actions cannot spend, equip, consume or settle");
    assert.deepEqual((await stateRef.get()).data(),estateBefore);
    await call("equipCommonGear",owner,{instanceId:"old_target",gearSchemaVersion:G.SCHEMA_VERSION});
    await call("unequipCommonGear",owner,{instanceId:"old_target",gearSchemaVersion:G.SCHEMA_VERSION});
    const oldUpgrade=await call("upgradeCommonGear",owner,{instanceId:"old_target",requestId:crypto.randomUUID(),cost:G.getUpgradeGoldCost(owned.instances.old_target),gearSchemaVersion:G.SCHEMA_VERSION});
    assert.equal(oldUpgrade.currentUser.gear.instances[oldUpgrade.upgradedInstanceId].requiresBuildingLevel,undefined);
    // Restore deterministic inputs: same-rarity matching may consume any
    // unequipped copy, while access follows the selected target.
    await profileRef.update({gear:owned});
    saved.levels[building]=threshold;await stateRef.set(saved);
    const equipped=await call("equipCommonGear",owner,{instanceId:"new_target",gearSchemaVersion:G.SCHEMA_VERSION});
    assert.equal(equipped.currentUser.gear.equipped[building].head,"new_target");
    const requestId=crypto.randomUUID();
    const accepted=await call("upgradeCommonGear",owner,{instanceId:"new_target",requestId,cost:G.getUpgradeGoldCost(owned.instances.new_target),gearSchemaVersion:G.SCHEMA_VERSION});
    assert.equal(accepted.currentUser.gear.instances[accepted.upgradedInstanceId].requiresBuildingLevel,true);
    assert.equal(accepted.currentUser.gear.equipped[building].head,accepted.upgradedInstanceId);
    assert((await call("upgradeCommonGear",owner,{instanceId:"new_target",requestId,gearSchemaVersion:G.SCHEMA_VERSION})).replayed);
  }
  // Box rewards are owned immediately, but receiving a chest does not unlock
  // an officer's building level. Legacy item access is never widened by it.
  saved=E.initial(Date.now());await stateRef.set(saved);
  const boxes=G.createDefaultState();boxes.uncommonGearBoxes=1;
  await profileRef.update({gear:boxes});
  const opened=await call("openCommonGearBox",owner,{boxType:"uncommon",requestId:"gated_box_open",gearSchemaVersion:G.SCHEMA_VERSION});
  const newUncommon=Object.values(opened.gear.instances).find(i=>i.rarity==="uncommon");
  assert(newUncommon.requiresBuildingLevel);
  await assert.rejects(call("equipCommonGear",owner,{instanceId:newUncommon.instanceId,gearSchemaVersion:G.SCHEMA_VERSION}),/Level 25/);
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
  assert.equal(inventory[0].requiresBuildingLevel,true,"Commission results retain the building requirement");
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
  await assert.rejects(quote({ action: "quest", tier: 4, hours: 8, championIds: ids, resources: ["timber"], meal: "feast" }), /updated Guild/);
  // Seed an already accepted pre-expansion quest through its original rules.
  // New clients must not launch that retired action, but its terms still settle.
  const legacyServices = require("../estate-services");
  saved = (await stateRef.get()).data();
  const legacyChampions = Object.fromEntries(await Promise.all(ids.map(async id => [id, (await db.doc(`players/${owner.uid}/estateChampions/${id}`).get()).data()])));
  const legacyQuote = legacyServices.questQuote(saved, { tier: 4, hours: 8, championIds: ids, resources: ["timber"], meal: "feast" }, legacyChampions, Date.now());
  legacyServices.launchQuest(saved, legacyQuote, "legacy_accepted_quest", legacyChampions, Date.now());
  await stateRef.set(saved);
  for (const [id, champion] of Object.entries(legacyChampions)) await db.doc(`players/${owner.uid}/estateChampions/${id}`).set(champion);
  const quest = { estate: saved, receipt: { requestId: "legacy_accepted_quest" } };
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
  // Exercise real monthly admission, not just a direct replacement of the
  // seasonal parent. Permanent children must survive initialization unchanged.
  const returning = await user(), returningRef = db.doc(`players/${returning.uid}`);
  await returningRef.set({ displayName: "Returning estate", playerName: "Returning estate", gold: 900000, goldFloat: 900000,
    resetGeneration: previous, worldId: "main-" + previous, realmShardId: "shard_0001", gear: G.createDefaultState(),
    character: { level: 20, xp: 0, skillPoints: 19 } });
  const retained = structuredClone(beforeReset);
  const paidJob = { ...E.baseQuote(retained, "quarry", 25, 285), id: "permanent_paid_job", status: "paused", fundedAtMs: Date.now() };
  retained.jobs.push(paidJob); delete retained.deposits.quarry;
  E.startProduction(retained,E.productionQuote(retained,"sawmill",100),"permanent_production_batch",Date.now());
  const championRecord = { id: "permanent_champion", name: "Retained champion", quality: 1, level: 12, xp: 7,
    active: true, questId: "", recoveryUntilMs: Date.now() + E.HOUR, acquiredAtMs: Date.now() - E.HOUR };
  retained.activeChampionIds = [championRecord.id];
  const persistentRecords = { "estate/state": retained, "estateChampions/permanent_champion": championRecord,
    "estateContracts/permanent_paid_job": paidJob, "estateReceipts/permanent_receipt": { requestId: "permanent_receipt", acceptedAtMs: Date.now() } };
  for (const [path, data] of Object.entries(persistentRecords)) await returningRef.collection(path.split("/")[0]).doc(path.split("/")[1]).set(data);
  await call("claimStartingCity", returning, { playerName: "Returning estate" });
  const newProfile = (await returningRef.get()).data();
  assert.equal(newProfile.resetGeneration, realm.resetGeneration); assert.equal(newProfile.worldId, realm.worldId);
  assert.equal(newProfile.gold, 100, "Season entry resets realm Gold independently from estate credit");
  for (const [path, data] of Object.entries(persistentRecords)) assert.deepEqual((await db.doc(returningRef.path + "/" + path).get()).data(), data);
  const returned = await call("getEstateState", returning);
  assert.equal(returned.estate.jobs[0].id, paidJob.id); assert.equal(returned.estate.jobs[0].status, "paused");
  assert.equal(returned.estate.productionOrders.sawmill.id,"permanent_production_batch","Paid production survives real monthly admission");
  assert.equal(returned.champions[championRecord.id].level, 12); assert.equal(returned.champions[championRecord.id].xp, 7);
  const resume=(await call("getEstateQuote",returning,{input:{action:"pause",jobId:paidJob.id,paused:false}})).quote;
  const resumed=await call("commitEstateAction",returning,{quoteId:resume.id,requestId:"resume_legacy_paid",acceptPermanentCredit:true});
  assert.equal(resumed.estate.jobs[0].status,"running");assert.equal(resumed.estate.jobs[0].durationMs,paidJob.durationMs);
  assert.equal((await returningRef.get()).data().gold,100,"Previously paid work resumes without another Gold payment");
  // Manual material batches use the existing authenticated quote/receipt
  // transaction, without a Gold charge, duplicate debit or automatic repeat.
  saved=E.initial(Date.now());for(const key in saved.levels)saved.levels[key]=1;
  for(const p of E.C.producers)saved.processors[p.building]=false;
  for(const k of E.KEYS)saved.stock[k]=100;
  await stateRef.set(saved);loaded=await load();assert.equal(loaded.estate.productionPolicy,"manual-batches");
  assert.equal(loaded.estate.productionRecipes.sawmill.maxQuantity,50);
  for(const quantity of [0,1.5,51])await assert.rejects(quote({action:"produce",building:"sawmill",quantity}),/whole|quantity|materials|storage/);
  await assert.rejects(quote({action:"processor",building:"sawmill",enabled:true}),/no longer available/);
  const batchQuote=await quote({action:"produce",building:"sawmill",quantity:20});
  const batchGold=(await profileRef.get()).data().goldFloat;
  const batches=await Promise.all([commit(batchQuote,"manual_batch_001"),commit(batchQuote,"manual_batch_001")]);
  assert.equal(batches.filter(r=>r.replayed).length,1);
  saved=(await stateRef.get()).data();assert.equal(saved.stock.timber,60);assert.equal(saved.stock.planks,100);
  assert.equal(saved.productionOrders.sawmill.quantity,20);assert.equal(saved.productionOrders.sawmill.durationMs,E.HOUR);
  assert.equal((await profileRef.get()).data().goldFloat,batchGold,"Production pays materials, never realm Gold");
  await assert.rejects(quote({action:"produce",building:"sawmill",quantity:1}),/Finish/);
  saved.productionOrders.sawmill.completesAtMs=Date.now()-100;
  saved.productionOrders.sawmill.startedAtMs=saved.productionOrders.sawmill.completesAtMs-saved.productionOrders.sawmill.durationMs;
  saved.settledAtMs=saved.productionOrders.sawmill.completesAtMs-1;await stateRef.set(saved);
  const batchComplete=await Promise.all([load(),load()]);assert(batchComplete.every(r=>r.estate.stock.planks===120));
  assert(batchComplete.every(r=>!r.estate.productionOrders.sawmill));
  assert.equal((await load()).estate.stock.timber,60,"Completion and repeated reads cannot start another batch");
  // Two devices competing for the same Timber can accept only one recipe.
  saved=(await stateRef.get()).data();saved.stock.timber=20;saved.stock.ore=60;await stateRef.set(saved);
  const batchRaceQuotes=await Promise.all([quote({action:"produce",building:"sawmill",quantity:10}),quote({action:"produce",building:"smithy",quantity:20})]);
  const batchRace=await Promise.allSettled(batchRaceQuotes.map((q,i)=>commit(q,"batch_resource_race_"+i)));
  assert.equal(batchRace.filter(r=>r.status==="fulfilled").length,1);
  saved=(await stateRef.get()).data();assert.equal(saved.stock.timber,0);assert.equal(Object.keys(saved.productionOrders).length,1);
  // Legacy automatic accrual is retained once; new actions never turn it on.
  const legacy=E.initial(Date.now()-E.HOUR);delete legacy.productionPolicyVersion;delete legacy.productionOrders;
  for(const key in legacy.levels)legacy.levels[key]=1;for(const p of E.C.producers)legacy.processors[p.building]=false;
  legacy.processors.sawmill=true;legacy.stock.timber=100;legacy.stock.planks=2.25;
  await stateRef.set(legacy);await load();const migrated=(await stateRef.get()).data();
  assert(migrated.stock.planks>=22.25&&migrated.stock.planks<22.3);assert.equal(migrated.productionPolicyVersion,1);
  assert.deepEqual(migrated.productionOrders,{});
  const again=await load();assert.equal(again.estate.stock.planks,Math.floor(migrated.stock.planks));
  assert.equal((await stateRef.get()).data().stock.planks,migrated.stock.planks,"Migration does not restart legacy processing");
  // Guild room payments reuse the same transaction, quote revision and durable
  // receipt guarantees. Never accept a price, timer or result from the client.
  await profileRef.update({ gold: 1000000000, goldFloat: 1000000000 });
  saved = E.initial(Date.now());
  for (const key in saved.levels) saved.levels[key] = 75;
  for (const key of E.KEYS) saved.stock[key] = 10000;
  await stateRef.set(saved);
  loaded = await load();
  assert.equal(loaded.estate.guild.rooms.infirmary, 0);
  assert.equal(loaded.guildOverview.infirmary.bill.target, 1);
  const roomFirst = await quote({ action: "guildRoom", room: "infirmary" });
  const roomRival = await quote({ action: "guildRoom", room: "planning" });
  const roomGoldBefore = (await profileRef.get()).data().goldFloat;
  const roomStarts = await Promise.all([commit(roomFirst, "guild_room_first_001"), commit(roomFirst, "guild_room_first_001")]);
  assert.equal(roomStarts.filter(r => r.replayed).length, 1);
  const roomGoldAfter = (await profileRef.get()).data().goldFloat;
  assert(Math.abs(roomGoldBefore - roomGoldAfter - roomFirst.value.gold) < 5, "Room Gold is charged once, allowing passive accrual");
  assert.equal((await stateRef.get()).data().guild.roomJob.durationMs, 600000);
  await assert.rejects(commit(roomRival, "guild_room_rival_001"), /changed|improvement/);
  await assert.rejects(commit(roomFirst, "guild_room_duplicate_001"), /already been accepted/);
  await assert.rejects(quote({ action: "guildRoom", room: "archive" }), /Finish/);
  const paidRoomContract = await db.doc(`players/${owner.uid}/estateContracts/guild_room_first_001`).get();
  assert.equal(paidRoomContract.data().target, 1);
  saved = (await stateRef.get()).data();
  saved.guild.roomJob.completesAtMs = Date.now() - 100;
  saved.guild.roomJob.startedAtMs = saved.guild.roomJob.completesAtMs - saved.guild.roomJob.durationMs;
  await stateRef.set(saved);
  const roomCompletions = await Promise.all([load(), load()]);
  assert(roomCompletions.every(result => result.estate.guild.rooms.infirmary === 1 && !result.estate.guild.roomJob));
  assert.equal((await load()).estate.guild.rooms.infirmary, 1, "Repeated reads do not add another room level");
  assert.equal((await db.doc(`players/${owner.uid}/estateContracts/guild_room_first_001`).get()).data().completedAtMs, saved.guild.roomJob.completesAtMs);
  // Insufficient materials cannot partially charge Gold or start work.
  saved = (await stateRef.get()).data(); saved.stock.stone = 0; await stateRef.set(saved);
  const roomSecond = await quote({ action: "guildRoom", room: "infirmary" });
  const beforeRejectedRoom = (await profileRef.get()).data().goldFloat;
  await assert.rejects(commit(roomSecond, "guild_room_insufficient_001"), /Not enough stone/);
  assert.equal((await profileRef.get()).data().goldFloat, beforeRejectedRoom);
  assert.equal((await stateRef.get()).data().guild.roomJob, null);
  assert.equal((await db.doc(`players/${owner.uid}/estateReceipts/guild_room_insufficient_001`).get()).exists, false);
  saved = (await stateRef.get()).data(); saved.stock.stone = 10000; await stateRef.set(saved);
  const roomSecondFresh = await quote({ action: "guildRoom", room: "infirmary" });
  const roomAccepted = await commit(roomSecondFresh, "guild_room_second_001", { value: { gold: 0, durationMs: 1, target: 5 } });
  assert.equal(roomAccepted.estate.guild.roomJob.target, 2);
  assert.equal(roomAccepted.estate.guild.roomJob.durationMs, E.HOUR);
  assert.equal(roomAccepted.receipt.quote.gold, roomSecondFresh.value.gold);
  // Party names/membership and mentor assignments belong to the account, not
  // the browser. An unavailable member can stay in a saved party for later.
  const mentor = { id: "guild_veteran_001", name: "Veteran", quality: 0, level: 12, xp: 0, questId: "", recoveryUntilMs: 0, active: true };
  const pupil = { id: "guild_pupil_001", name: "Pupil", quality: 0, level: 7, xp: 0, questId: "", recoveryUntilMs: 0, active: true };
  await db.doc(`players/${owner.uid}/estateChampions/${mentor.id}`).set(mentor);
  await db.doc(`players/${owner.uid}/estateChampions/${pupil.id}`).set(pupil);
  saved = (await stateRef.get()).data(); saved.activeChampionIds = [mentor.id, pupil.id]; saved.guild.rooms.training = 1; await stateRef.set(saved);
  const partyInput = { action: "guildParty", name: "Road watchers", championIds: [mentor.id, pupil.id], leaderId: mentor.id };
  const partyQuote = await quote(partyInput);
  const partyRace = await Promise.all([commit(partyQuote, "guild_party_saved_001"), commit(partyQuote, "guild_party_saved_001")]);
  assert.equal(partyRace.filter(r => r.replayed).length, 1);
  loaded = await load(); assert.equal(loaded.estate.guild.savedParties.length, 1);
  assert.deepEqual(loaded.estate.guild.savedParties[0].championIds, [mentor.id, pupil.id]);
  await assert.rejects(quote({ ...partyInput, championIds: [mentor.id, "another_players_champion"] }), /owned/);
  await assert.rejects(quote({ ...partyInput, championIds: Array(5).fill(mentor.id) }), /four/);
  await act({ action: "guildMentor", mentorId: mentor.id, pupilId: pupil.id });
  assert.equal((await load()).estate.guild.mentoring.mentorId, mentor.id);
  saved = (await stateRef.get()).data(); saved.guild.mentoring.busyUntilMs = Date.now() + E.HOUR; await stateRef.set(saved);
  await assert.rejects(quote({ action: "guildMentor", clear: true }), /accepted mission/);
  await assert.rejects(quote({ action: "roster", championId: mentor.id, active: false }), /mentoring/);
  assert.equal((await rest(stranger, `players/${owner.uid}/estate/state`)).status, 403);
  assert.equal((await rest(owner, `players/${owner.uid}/estate/state`, "PATCH")).status, 403);
  // Real Guild callables: server-owned recruitment rolls, hidden accepted
  // outcomes, concurrent completions, receipt replay and seasonal claims.
  saved = (await stateRef.get()).data(); saved.guild.mentoring = null; saved.stock.food = 10000; await stateRef.set(saved);
  const guildMembers = (await load()).champions;
  assert.equal(guildMembers[mentor.id].guildVersion, 2);
  assert.deepEqual((await load()).champions[mentor.id].base, guildMembers[mentor.id].base, "Saved stat rolls survive loads");
  const introQuote = await quote({ action: "guildMission", missionId: "introduction", championIds: [pupil.id] });
  assert.equal(introQuote.value.food, 1); assert.equal(introQuote.value.durationMs, 300000);
  const introRuns = await Promise.all([commit(introQuote, "guild_intro_once_001"), commit(introQuote, "guild_intro_once_001")]);
  assert.equal(introRuns.filter(result => result.replayed).length, 1);
  assert.equal((await stateRef.get()).data().stock.food, 9999);
  const hiddenResultRef = db.doc(`players/${owner.uid}/estateMissionResults/guild_intro_once_001`);
  assert.equal((await hiddenResultRef.get()).data().outcome, "success");
  assert.equal((await rest(owner, hiddenResultRef.path)).status, 403, "Owners cannot read an unfinished mission outcome");
  assert.equal((await rest(owner, hiddenResultRef.path, "PATCH")).status, 403, "Owners cannot change the saved roll");
  assert.equal((await load()).estate.guild.missions[0].outcome, undefined, "Public state never exposes the private result early");
  await assert.rejects(quote({ action: "guildMission", missionId: "introduction", championIds: [mentor.id] }), /available/);
  saved = (await stateRef.get()).data(); saved.guild.missions[0].completesAtMs = Date.now() - 500000; await stateRef.set(saved);
  const acceptedIntroEnd = saved.guild.missions[0].completesAtMs;
  const introComplete = await Promise.all([load(), load()]);
  assert(introComplete.every(result => result.estate.guild.missions.length === 0));
  assert.equal(introComplete[0].champions[pupil.id].recoveryUntilMs, acceptedIntroEnd + 120000);
  assert.equal(introComplete[0].estate.guild.discoveries.filter(id => id === "introduction").length, 1);
  assert.equal(introComplete[0].estate.guild.reputation, 0);
  const introReportId = introComplete[0].estate.guild.recentReports[0].id;
  const priorXp = introComplete[0].champions[pupil.id].xp;
  const reportReply = await call("getGuildReports", owner, { reportId: introReportId });
  assert.equal(reportReply.report.missionId, "introduction");
  await call("getGuildReports", owner, { reportId: introReportId });
  assert.equal((await load()).champions[pupil.id].xp, priorXp, "Report replay cannot train a champion twice");
  assert.equal((await rest(stranger, `players/${owner.uid}/estateGuildReports/${introReportId}`)).status, 403);
  await assert.rejects(call("getGuildReports", stranger, { reportId: introReportId }), /unavailable/);
  const missionInput = { action: "guildMission", missionId: "escort", championIds: [mentor.id, pupil.id], leaderId: mentor.id, tier: 0, hours: 2, route: "direct", approach: "balanced", meal: "none" };
  const goldMissionQuote = await quote(missionInput);
  const launch = await commit(goldMissionQuote, "guild_gold_mission_001", { outcome: "success", rewards: { gold: 1000000000000 }, durationMs: 1 });
  assert.equal(launch.estate.guild.missions[0].durationMs, 2 * E.HOUR);
  assert.equal(launch.estate.guild.missions[0].rewards.success.gold, goldMissionQuote.value.rewards.success.gold);
  const resultRef = db.doc(`players/${owner.uid}/estateMissionResults/guild_gold_mission_001`);
  const acceptedRandomResult = (await resultRef.get()).data();
  await commit(goldMissionQuote, "guild_gold_mission_001");
  assert.deepEqual((await resultRef.get()).data(), acceptedRandomResult, "A retried launch cannot reroll its accepted result");
  // An emulator-admin fixture chooses success to exercise the payout branch.
  await resultRef.set({ version: goldMissionQuote.value.version, outcome: "success", rewards: goldMissionQuote.value.rewards.success });
  saved = (await stateRef.get()).data(); saved.guild.missions[0].completesAtMs = Date.now() - 5000000; await stateRef.set(saved);
  loaded = await load();
  assert.equal(loaded.estate.guild.reputation, 1);
  assert.equal(loaded.estate.guild.rewards[0].gold, goldMissionQuote.value.rewards.success.gold);
  const goldClaim = await quote({ action: "guildClaim", rewardId: "guild_gold_mission_001" });
  const beforeGuildGold = (await profileRef.get()).data().goldFloat;
  const claimedGold = await Promise.all([commit(goldClaim, "guild_gold_claim_001"), commit(goldClaim, "guild_gold_claim_001")]);
  assert.equal(claimedGold.filter(result => result.replayed).length, 1);
  assert(Math.abs((await profileRef.get()).data().goldFloat - beforeGuildGold - goldClaim.value.received.gold) < 5);
  assert.equal((await load()).estate.guild.rewards.length, 0);
  await assert.rejects(quote({ action: "guildClaim", rewardId: "guild_gold_mission_001" }), /already collected/);
  // Preserve an unclaimed permanent material portion while expiring Gold.
  saved = (await stateRef.get()).data();
  saved.guild.rewards.push({ id: "expired_reward_001", reportId: introReportId, gold: 999, troops: 0, materials: { timber: 2 }, gearKey: "",
    seasonal: { ...goldMissionQuote.value.seasonal, expiresAtMs: Date.now() - 1 } });
  await stateRef.set(saved); loaded = await load();
  assert.equal(loaded.estate.guild.rewards[0].gold, 0); assert.equal(loaded.estate.guild.rewards[0].materials.timber, 2);
  const materialClaim = await quote({ action: "guildClaim", rewardId: "expired_reward_001" });
  assert.equal(materialClaim.value.received.gold, 0); assert.equal(materialClaim.value.received.materials.timber, 2);
  await commit(materialClaim, "expired_material_claim_001");
  assert.equal((await load()).estate.guild.reputation, 1, "Seasonal expiry never rewinds permanent reputation");
  const troopMissionQuote = await quote({ ...missionInput, missionId: "muster" });
  await commit(troopMissionQuote, "guild_troop_mission_001");
  await db.doc(`players/${owner.uid}/estateMissionResults/guild_troop_mission_001`).set({
    version: troopMissionQuote.value.version, outcome: "success", rewards: troopMissionQuote.value.rewards.success });
  saved = (await stateRef.get()).data(); saved.guild.missions[0].completesAtMs = Date.now() - 5000000; await stateRef.set(saved); await load();
  const troopClaim = await quote({ action: "guildClaim", rewardId: "guild_troop_mission_001" });
  const mainCityRef = db.doc(troopClaim.value.mainCityPath), troopsBefore = (await mainCityRef.get()).data().troopFloat;
  await Promise.all([commit(troopClaim, "guild_troop_claim_001"), commit(troopClaim, "guild_troop_claim_001")]);
  assert(Math.abs((await mainCityRef.get()).data().troopFloat - troopsBefore - troopClaim.value.received.troops) < 5, "Troops reach the original canonical Main City exactly once");
  const gearMissionQuote = await quote({ ...missionInput, missionId: "equipment", hours: 8, officer: "barracks" });
  await commit(gearMissionQuote, "guild_gear_mission_001");
  const acceptedGear = { ...gearMissionQuote.value.rewards.success, gearKey: common.gearKey };
  await db.doc(`players/${owner.uid}/estateMissionResults/guild_gear_mission_001`).set({
    version: gearMissionQuote.value.version, outcome: "success", rewards: acceptedGear });
  saved = (await stateRef.get()).data(); saved.guild.missions[0].completesAtMs = Date.now() - 20000000; await stateRef.set(saved); await load();
  await assert.rejects(quote({ ...missionInput, missionId: "equipment", hours: 8, officer: "barracks" }), /72|hours/);
  await profileRef.update({ gear: fullGear });
  await assert.rejects(quote({ action: "guildClaim", rewardId: "guild_gear_mission_001" }), /Bag is full/);
  assert.equal((await stateRef.get()).data().guild.rewards[0].gearKey, common.gearKey);
  await profileRef.update({ gear: G.createDefaultState() });
  const guildGearClaim = await quote({ action: "guildClaim", rewardId: "guild_gear_mission_001" });
  await Promise.all([commit(guildGearClaim, "guild_gear_claim_001"), commit(guildGearClaim, "guild_gear_claim_001")]);
  const guildGear = (await profileRef.get()).data().gear;
  assert.equal(Object.keys(guildGear.instances).length, 1);
  assert.equal(Object.values(guildGear.instances)[0].gearKey, common.gearKey);
  assert.equal(Object.values(guildGear.instances)[0].requiresBuildingLevel,true,"Guild grants retain the building requirement");
  assert.equal(guildGear.newMarkers.barracks, true);
  console.log("Estate emulator passed: real Gold authority, current realm guards, durable receipts, two devices, persistence, migration, Gear, champions, legacy quests, Guild missions/private outcomes/claims, facilities and write rules.");
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
