"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const S = require("../social");

// Real callable coverage shared by isolated PostgreSQL and the Core emulators.
module.exports = async function ({ db, call, createActor, setIdentity }) {
  const seasons = require("../season-rewards"), previous = seasons.previousSeason(`realm-${new Date().toISOString().slice(0, 7)}`);
  if (seasons.supported(previous)) await seasons.arm(db, previous, seasons.seasonInfo(previous).startsAtMs + 1);
  const alice = await createActor(), bob = await createActor(), outsider = await createActor();
  const realm = await call("getRealmInfo", alice);
  assert.equal(realm.worldTopology, "core-expansion-v1");
  const identity = { releaseId: realm.currentReleaseId, worldId: realm.worldId, resetGeneration: realm.resetGeneration, realmShardId: realm.sharedRealmId };
  setIdentity(identity);
  for (const actor of [alice, bob, outsider]) await call("claimStartingCity", actor, { playerName: "Link " + actor.uid.slice(-6) });
  const city = (await db.collectionGroup("cities").where("ownerUid", "==", alice.uid).limit(1).get()).docs[0];
  assert(city, "Starting city was not created");
  const cityData = city.data(), regionId = cityData.regionId;
  const island = city.ref.path.split("/").slice(0, 2).join("/");
  const cityRef = { kind: "city", id: city.id, regionId };
  const globalCollection = `globalChat/${identity.resetGeneration}--${identity.realmShardId}/messages`;
  const reset = () => db.doc(`serverRateLimits/chat_${alice.uid}`).set({ lastMessageAtMs: 0 });
  const send = async (location, text = "", extra = {}) => {
    await reset();
    return call("sendChatMessage", alice, { channel: "global", text, location, requestId: crypto.randomUUID(), ...extra });
  };
  const resolve = (messageId, actor = alice, extra = {}) => call("sendChatMessage", actor, { action: "resolveLocation", channel: "global", messageId, ...extra });
  const firstRequest = { channel: "global", text: "", location: cityRef, requestId: crypto.randomUUID() };
  const first = await call("sendChatMessage", alice, firstRequest);
  assert.equal(first.message.location.name, cityData.name);
  assert.equal(first.message.text, "");
  const expectedKeys = ["version", "kind", "id", "regionId", "worldId", "resetGeneration", "realmShardId", "name", "mapName", "label", "level", "x", "y", "relocatedAtMs"].sort();
  assert.deepEqual(Object.keys(first.message.location).sort(), expectedKeys, "Snapshot exposed non-public fields");
  assert.equal((await resolve(first.messageId, bob)).status, "available");
  assert.equal((await call("sendChatMessage", alice, firstRequest)).replayed, true);
  await assert.rejects(call("sendChatMessage", alice, { ...firstRequest, location: { ...cityRef, id: "other-city" } }), /another message/);
  await assert.rejects(call("sendChatMessage", alice, { ...firstRequest, requestId: crypto.randomUUID() }), /Wait/);
  for (const forged of [{ ...cityRef, troops: 100 }, { ...cityRef, name: "Fake" }, { ...cityRef, x: 0 }, { ...cityRef, id: "../../private" }, { ...cityRef, id: { toString: "bad" } }, [cityRef]]) {
    await assert.rejects(send(forged), /location/);
  }
  const unopened = require("../coreExpansionTopology").getRegionAtActivationOrdinal(1000).id;
  await assert.rejects(send({ ...cityRef, regionId: unopened }), /no longer available/);
  await assert.rejects(send({ ...cityRef, id: "missing-city" }), /no longer available/);
  // Ownership can change; recorded positions must never follow a relocated castle.
  await city.ref.update({ ownerUid: bob.uid });
  assert.equal((await resolve(first.messageId, bob)).status, "available");
  await city.ref.update({ x: cityData.x + 500, relocatedAtMs: Date.now() });
  assert.equal((await resolve(first.messageId, bob)).status, "moved");
  await city.ref.set(cityData);
  await city.ref.update({ resetGeneration: "old-generation" });
  await assert.rejects(call("sendChatMessage", bob, { channel: "global", text: "", location: cityRef, requestId: crypto.randomUUID() }), /no longer available/);
  await city.ref.set(cityData);
  await db.doc(`${globalCollection}/${first.messageId}`).update({ status: "removed" });
  await assert.rejects(resolve(first.messageId), /no longer available/);
  await db.doc(`${globalCollection}/${first.messageId}`).update({ status: "visible", createdAtMs: Date.now() - 86400001 });
  await assert.rejects(resolve(first.messageId), /no longer available/);

  // Live seed records exercise NPC cities, Strongholds, Citadel and camps.
  const cities = (await db.collectionGroup("cities").get()).docs;
  const npc = cities.find(doc => !doc.data().ownerUid && !doc.data().strongholdType);
  const stronghold = cities.find(doc => doc.data().strongholdType && !/citadel|crown/i.test(doc.data().strongholdType + doc.id));
  const citadel = cities.find(doc => /citadel|crown/i.test(doc.data().strongholdType || ""));
  const camp = (await db.collectionGroup("camps").limit(1).get()).docs[0];
  for (const [doc, kind] of [[npc, "city"], [stronghold, "city"], [citadel, "city"], [camp, "camp"]]) {
    assert(doc, `Missing seeded ${kind} fixture`);
    const shared = await send({ kind, id: doc.id, regionId: doc.data().regionId });
    assert.equal((await resolve(shared.messageId)).status, "available");
  }
  const tower = require("../holding-towers").TOWERS[0];
  await db.doc(`holdingTowers/${tower.id}`).set({ ...identity, id: tower.id, regionId: tower.regionId, name: tower.name, level: 1, troops: 123456 });
  const towerMessage = await send({ kind: "tower", id: tower.id, regionId: tower.regionId });
  assert.equal(towerMessage.message.location.label, "Clan Tower");
  assert.equal((await resolve(towerMessage.messageId)).status, "available");
  for (const classification of ["solo", "boss"]) {
    const id = `marauder_${crypto.createHash("sha256").update(regionId).digest("hex").slice(0, 12)}_${classification === "solo" ? "01" : "02"}`;
    const ref = db.doc(`${island}/marauders/${id}`), spawnId = crypto.randomUUID();
    await ref.set({ ...identity, id, spawnId, classification, status: "active", name: classification === "solo" ? "Marauder Lv. 20" : "Clan Boss Lv. 90",
      level: classification === "solo" ? 20 : 90, x: 40, y: 50 });
    const location = { kind: "marauder", id, regionId, spawnId }, sent = await send(location, "Meet here");
    assert.equal((await resolve(sent.messageId)).status, "available");
    await ref.update({ status: "defeated" });
    assert.equal((await resolve(sent.messageId)).status, "unavailable");
    await assert.rejects(send(location), /no longer available/);
    await ref.update({ status: "active", spawnId: crypto.randomUUID() });
    assert.equal((await resolve(sent.messageId)).status, "unavailable", "Old spawn followed its replacement");
    await assert.rejects(send(location), /no longer available/);
  }
  const clanId = "location-clan-" + crypto.randomUUID();
  await db.doc(`clans/${clanId}`).set({ ...identity, status: "active" });
  await db.doc(`clans/${clanId}/members/${alice.uid}`).set({ ...identity, uid: alice.uid, status: "active" });
  await db.doc(`players/${alice.uid}`).update({ clanId });
  const clan = await send(cityRef, "Clan only", { channel: "clan", expectedClanId: clanId });
  assert.equal((await resolve(clan.messageId, alice, { channel: "clan", clanId })).status, "available");
  await assert.rejects(resolve(clan.messageId, outsider, { channel: "clan", clanId }), /membership/);
  await db.doc(`clans/${clanId}/members/${alice.uid}`).update({ status: "removed" });
  await assert.rejects(resolve(clan.messageId, alice, { channel: "clan", clanId }), /membership/);
  await assert.rejects(send(cityRef, "", { channel: "clan", expectedClanId: "different" }), /clan changed/);

  await db.doc(S.CONFIG).set({ enabled: true });
  const privateRequest = { action: "send", peerUid: bob.uid, location: cityRef, text: "", requestId: crypto.randomUUID() };
  const privateMessage = await call("social", alice, privateRequest), conversationId = privateMessage.conversationId;
  const privateOpen = actor => call("social", actor, { action: "resolveLocation", conversationId, messageId: privateMessage.messageId });
  assert.equal((await privateOpen(bob)).status, "available");
  assert.equal((await call("social", alice, privateRequest)).replayed, true);
  await assert.rejects(privateOpen(outsider), /unavailable/);
  await assert.rejects(call("social", alice, { ...privateRequest, requestId: crypto.randomUUID() }), /3 seconds|accepted/);
  const history = await call("social", bob, { action: "history", conversationId });
  assert.equal(history.messages[0].location.id, city.id);
  const report = await call("social", bob, { action: "report", conversationId, messageId: privateMessage.messageId, reason: "spam" });
  assert.equal((await db.doc(`socialReports/${report.reportId}`).get()).data().evidence[0].location.id, city.id);
  const privateDoc = db.doc(S.messagePath(conversationId, privateMessage.messageId));
  const data = (await privateDoc.get()).data();
  await privateDoc.update({ location: { ...data.location, resetGeneration: "previous-season" } });
  assert.equal((await privateOpen(bob)).status, "old-season");
  await privateDoc.update({ expiresAtMs: Date.now() - 1 });
  await assert.rejects(privateOpen(bob), /unavailable/);
  await call("social", bob, { action: "block", peerUid: alice.uid, enabled: true, requestId: crypto.randomUUID() });
  await assert.rejects(call("social", alice, { ...privateRequest, requestId: crypto.randomUUID() }), /unavailable/);
  assert.equal((await db.collection("serverNotificationOutbox").where("type", "==", "private_message").get()).size, 0, "Unsolicited request produced a private alert");
  console.log("Chat locations: eight target types, canonical snapshots, replay, cooldowns, membership, private authorization, expiry, moves, spawn replacement and report evidence passed.");
};
