"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const release = require("../release-config.json");
const layout = require("../core-expansion-world-layout.json");
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!firestoreHost) throw new Error("This test requires the Firestore emulator.");
const projectId = process.env.GCLOUD_PROJECT || "crown-land-b15e0";
initializeApp({ projectId });
const db = getFirestore();
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const restRoot = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`;
let identity = { ...release, realmShardId: "legacy" };
let functionsHost;

async function user(label) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `camp-${randomUUID()}@example.test`, password: "Camp-Emulator-Only-123!", returnSecureToken: true }),
  });
  const body = await response.json();
  assert(response.ok, "Emulator signup failed.");
  return { uid: body.localId, token: body.idToken, label };
}

async function call(name, actor, data = {}) {
  if (!functionsHost) {
    const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB || "127.0.0.1:4400"}/emulators`).then(response => response.json());
    functionsHost = `${hub.functions.host}:${hub.functions.port}`;
  }
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: "POST", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
    body: JSON.stringify({ data: { ...data, clientReleaseId: identity.releaseId, clientResetGeneration: identity.resetGeneration,
      clientWorldId: identity.worldId, clientRealmShardId: identity.realmShardId } }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${name}: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

function islandId(regionId) { return `${identity.worldId}--${identity.realmShardId}--${regionId}`; }
function campPath(camp) { return `islands/${islandId(camp.regionId)}/camps/${camp.id}`; }
function statsPath(actor, objective) { return `players/${actor.uid}/objectiveStats/${objective}`; }
async function getAs(documentPath, actor) {
  return fetch(`${restRoot}/${documentPath}`, { headers: { authorization: `Bearer ${actor.token}` } });
}

async function hold(camp, actor, claim, due = true) {
  const now = Date.now();
  await db.doc(campPath(camp)).set({
    ...camp, ...identity, mapId: camp.regionId, holderUid: actor.uid, holderName: actor.label,
    ownerUid: actor.uid, ownerKind: "player", heldSinceMs: now - 3_601_000,
    lastCapturedAtMs: now - 3_601_000, payoutAtMs: due ? now - 1000 : now + 3_600_000,
    payoutPending: true, currentGarrison: 100, troops: 100, troopFloat: 100,
    alliedReinforcementTroops: 0, activeArmyIds: [], state: "held",
    returnSourceCityId: claim.cityId, returnSourceRegionId: claim.mainRegionId, returnSourceCityName: claim.cityName || "Home",
  });
}

// Execute the real browser readers against authenticated emulator REST calls,
// including their actual owner filter, rather than substituting admin reads.
function reader(actor) {
  function decode(value) {
    if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, field]) => [key, decode(field)]));
    if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
    if (value.integerValue !== undefined) return Number(value.integerValue);
    return value.stringValue ?? value.doubleValue ?? value.booleanValue ?? value.timestampValue ?? null;
  }
  const snapshot = document => ({ id: document?.name?.split("/").pop(), exists: () => Boolean(document?.name),
    data: () => decode({ mapValue: { fields: document?.fields || {} } }) });
  const context = vm.createContext({
    RESET_GENERATION: identity.resetGeneration, ONLINE_WORLD_ID: identity.worldId, REALM_SHARD_ID: identity.realmShardId,
    init: async () => {}, requireSignedIn: () => actor.uid,
    getOnlineRequestScope: () => `${actor.uid}:${identity.resetGeneration}:${identity.realmShardId}`,
    timestampToMs: value => Date.parse(value) || 0, cleanPlayerName: String,
    client: { db: {}, modules: { firestore: {
      doc: (_db, ...parts) => parts.join("/"), collection: (_db, ...parts) => parts.join("/"),
      where: (field, operator, value) => ({ field, operator, value }), query: (ref, ...filters) => ({ ref, filters }),
      getDoc: async documentPath => {
        const response = await getAs(documentPath, actor);
        if (response.status === 404) return snapshot(null);
        assert(response.ok, `Private progress read failed: HTTP ${response.status}`);
        return snapshot(await response.json());
      },
      getDocs: async query => {
        const parts = query.ref.split("/");
        const collectionId = parts.pop();
        const response = await fetch(`${restRoot}/${parts.join("/")}:runQuery`, {
          method: "POST", headers: { authorization: `Bearer ${actor.token}`, "content-type": "application/json" },
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId }],
            where: { compositeFilter: { op: "AND", filters: query.filters.map(filter => ({
              fieldFilter: { field: { fieldPath: filter.field }, op: "EQUAL", value: { stringValue: filter.value } },
            })) } } } }),
        });
        assert(response.ok, `Private history query failed: HTTP ${response.status}`);
        return { docs: (await response.json()).filter(row => row.document).map(row => snapshot(row.document)) };
      },
    } } },
  });
  const source = fs.readFileSync(path.resolve(__dirname, "../../firebaseClient.js"), "utf8");
  for (const name of ["loadRewardCampProgress", "loadRewardCampHistory"]) {
    const start = source.indexOf(`  async function ${name}(`);
    const end = source.indexOf("\n  }", start);
    vm.runInContext(source.slice(start, end + 4), context);
  }
  return context;
}

async function main() {
  const [holder, outsider] = await Promise.all([user("Camp Holder"), user("Camp Visitor")]);
  const info = await call("getRealmInfo", holder);
  assert.equal(info.worldTopology, "core-expansion-v1");
  identity = { releaseId: info.currentReleaseId, resetGeneration: info.resetGeneration, worldId: info.worldId, realmShardId: info.sharedRealmId };
  const claim = await call("claimStartingCity", holder, { playerName: holder.label });
  await call("claimStartingCity", outsider, { playerName: outsider.label });
  const holderReader = reader(holder);
  const outsiderReader = reader(outsider);
  const day = new Date().toISOString().slice(0, 10);
  const types = { gold: ["goldCamp", 4], troops: ["warbandCamp", 4], items: ["relicCamp", 5], deed: ["deedCamp", 1] };
  const allCamps = layout.maps.flatMap(map => (map.camps || []).map(camp => ({ ...camp, regionId: map.id })));
  for (const [type, [objective, cap]] of Object.entries(types)) {
    const camps = allCamps.filter(camp => camp.campType === type);
    assert(camps.length >= 2);
    assert.equal((await holderReader.loadRewardCampProgress(type)).count, 0, "A first-time player cannot see zero progress.");
    const progressRef = db.doc(statsPath(holder, objective));
    // Preserve rewards written by the currently deployed server, which did not
    // stamp these owner-private documents with realmShardId.
    await progressRef.set({ resetGeneration: identity.resetGeneration, worldId: identity.worldId, date: day, count: cap - 1 });
    assert.equal((await holderReader.loadRewardCampProgress(type)).count, cap - 1, "Existing shared progress was lost.");
    assert.equal((await getAs(progressRef.path, outsider)).status, 403, "Another player read private Camp progress.");
    assert.equal((await outsiderReader.loadRewardCampProgress(type)).count, 0, "A visitor inherited the holder's reward counter.");
    await hold(camps[0], holder, claim);
    await hold(camps[1], holder, claim, false);
    const first = await call("resolveRewardCampPayout", holder, { campId: camps[0].id, regionId: camps[0].regionId });
    assert.equal(first.status, "paid", `${type} did not pay its last available reward.`);
    assert.equal(first.dailyClaim, cap);
    const otherCamp = (await db.doc(campPath(camps[1])).get()).data();
    assert.equal(otherCamp.holderUid, holder.uid, "Another camp's holder was changed by payout.");
    assert(otherCamp.payoutAtMs > Date.now(), "Another camp's timer was changed by payout.");
    await hold(camps[1], holder, claim);
    const second = await call("resolveRewardCampPayout", holder, { campId: camps[1].id, regionId: camps[1].regionId });
    assert.equal(Number(second.reward), 0, `${type} granted a separate allowance at the second location.`);
    const progress = await holderReader.loadRewardCampProgress(type);
    assert.equal(progress.count, cap);
    assert.equal((await progressRef.get()).data().realmShardId, identity.realmShardId);
    if (type === "items") assert.equal(progress.rewards.length, 1, "Relic history did not survive changing camp locations.");
    const publicRead = await getAs(campPath(camps[0]), outsider);
    assert(publicRead.ok);
    assert(!(await publicRead.json()).fields.dailyRewardClaims, "Public Camp state exposed personal rewards.");
    console.log(`${type}: shared daily allowance, separate holders/timers, existing progress, and owner-only reads passed.`);
  }

  const deeds = allCamps.filter(camp => camp.campType === "deed");
  assert.equal(deeds.length, 4);
  // Yesterday's allowance must reset once across simultaneous holds at all four
  // locations. The transaction must serialize on the player's shared counter.
  await db.doc(statsPath(holder, "deedCamp")).set({ date: "2000-01-01", count: 1 }, { merge: true });
  await Promise.all(deeds.map(camp => hold(camp, holder, claim)));
  const results = await Promise.all(deeds.map(camp => call("resolveRewardCampPayout", holder, { campId: camp.id, regionId: camp.regionId })));
  assert.equal(results.filter(result => result.status === "paid").length, 1, "Concurrent locations duplicated the daily Deed reward.");
  assert.equal(results.filter(result => result.status === "daily-limit").length, 3);
  assert.equal((await holderReader.loadRewardCampProgress("deed")).count, 1);

  for (const [index, camp] of deeds.entries()) {
    for (let n = 0; n < 3; n++) await db.doc(`${campPath(camp)}/rewardHistory/existing_${n}`).set({
      campId: camp.id, cityId: `fixture_${index}_${n}`, cityName: `Award ${index}-${n}`,
      regionId: claim.mainRegionId, regionName: "Award map", awardedToPlayerId: holder.uid,
      awardedAtMs: Date.now() + index * 100 + n, source: "deed_camp",
    });
    await db.doc(`${campPath(camp)}/rewardHistory/visitor`).set({
      campId: camp.id, cityId: `visitor_${index}`, regionId: claim.mainRegionId,
      awardedToPlayerId: outsider.uid, awardedAtMs: Date.now() + 999999, source: "deed_camp",
    });
    assert.equal((await getAs(`${campPath(camp)}/rewardHistory/existing_0`, outsider)).status, 403);
  }
  const locations = deeds.map(camp => ({ islandId: islandId(camp.regionId), campId: camp.id }));
  const history = await holderReader.loadRewardCampHistory({ locations });
  assert.equal(history.length, 10);
  assert.equal(new Set(history.map(row => row.campId)).size, 4, "Existing awards from a matching camp were omitted.");
  assert(history.every(row => row.awardedToPlayerId === holder.uid));
  assert.equal((await outsiderReader.loadRewardCampHistory({ locations })).length, 4);
  await assert.rejects(holderReader.loadRewardCampHistory({ locations: locations.map(location => ({
    ...location, islandId: location.islandId.replace(identity.realmShardId, "shard_9999"),
  })) }), /HTTP 403/);
  const oldStats = db.doc(statsPath(holder, "deedCamp"));
  await oldStats.set({ resetGeneration: "old-realm", count: 999 }, { merge: true });
  assert.equal((await holderReader.loadRewardCampProgress("deed")).count, 0, "Prior-realm rewards leaked into current progress.");
  console.log("Shared Deed history, cross-player/shard privacy, UTC rollover, and four concurrent camp payouts passed.");
}
main().then(() => process.exit(0)).catch(error => { console.error(error.stack); process.exit(1); });
