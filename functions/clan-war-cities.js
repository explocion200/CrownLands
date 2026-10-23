"use strict";
const { createHash } = require("node:crypto");
const { current, memberActive } = require("./clan-tower-support");
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const keyFor = (realm, regionId, cityId) => createHash("sha256")
  .update(JSON.stringify([realm.worldId, realm.resetGeneration, realm.realmShardId, regionId, cityId])).digest("hex");
const PAGE_SIZE = 25;

// Private, generation-qualified loss records. Public city snapshots never contain this board.
function createService({ db, HttpsError, realm, validateProfile, assertWorld, cityRef, regularCity, transact, transfer }) {
  const fail = (code, message) => new HttpsError(code, message);
  const recordRef = (clanId, key) => db.doc(`clans/${clanId}/warCities/${key}`);
  async function membership(tx, uid, clanId, r) {
    if (!validId(uid) || !validId(clanId)) return null;
    const [profile, member] = await Promise.all([tx.get(db.doc(`players/${uid}`)), tx.get(db.doc(`clans/${clanId}/members/${uid}`))]);
    return current(profile.data(), r) && profile.data().clanId === clanId && memberActive(member.data(), uid, clanId, r)
      ? profile.data() : null;
  }
  async function authorize(tx, uid) {
    assertWorld();
    const r = realm(), profile = (await tx.get(db.doc(`players/${uid}`))).data();
    validateProfile(profile || {});
    const clanId = profile.clanId;
    if (!current(profile, r) || !validId(clanId)) throw fail("permission-denied", "Join a clan in the current season to view War Cities.");
    const [clan, member] = await Promise.all([tx.get(db.doc(`clans/${clanId}`)), tx.get(db.doc(`clans/${clanId}/members/${uid}`))]);
    if (!current(clan.data(), r) || clan.data().status !== "active" || !memberActive(member.data(), uid, clanId, r)) {
      throw fail("permission-denied", "Your clan membership has changed.");
    }
    return { r, clanId, profile };
  }
  // Read before combat writes; commit only with an actual regular-city ownership transfer.
  async function prepareCapture(tx, { target, regionId, defenderUid, defenderProfile, attackerUid, attackerProfile }) {
    if (!regularCity(target) || target.isMainCity || !defenderUid || defenderUid === attackerUid) return null;
    const r = realm(), key = keyFor(r, regionId, target.id), clans = new Map();
    for (const [uid, profile] of [[defenderUid, defenderProfile], [attackerUid, attackerProfile]]) {
      const clanId = profile?.clanId;
      if (!current(profile, r) || !validId(clanId)) continue;
      const [clan, member, previous] = await Promise.all([tx.get(db.doc(`clans/${clanId}`)),
        tx.get(db.doc(`clans/${clanId}/members/${uid}`)), tx.get(recordRef(clanId, key))]);
      if (current(clan.data(), r) && clan.data().status === "active" && memberActive(member.data(), uid, clanId, r)) {
        const old = previous.data();
        const preserve = current(old, r) && old.status === "open" && old.originalOwnerUid !== uid
          && await membership(tx, old.originalOwnerUid, clanId, r);
        clans.set(uid, { clanId, ref: previous.ref, old, preserve: Boolean(preserve) });
      }
    }
    return { r, key, clans, target, regionId, defenderUid, defenderProfile, attackerUid, attackerProfile };
  }
  function commitCapture(tx, context, nowMs, eventId) {
    if (!context) return;
    const { r, key, clans, target, regionId, defenderUid, defenderProfile, attackerUid, attackerProfile } = context;
    const lost = clans.get(defenderUid), recovered = clans.get(attackerUid);
    if (lost && lost.clanId !== recovered?.clanId && !lost.preserve) {
      tx.set(lost.ref, { ...r, key, clanId: lost.clanId, status: "open", cityId: target.id, regionId,
        cityName: String(target.name || target.id).slice(0, 80), originalOwnerUid: defenderUid,
        originalOwnerName: String(defenderProfile.playerName || target.ownerName || "Ruler").slice(0, 40),
        captorUid: attackerUid, captorName: String(attackerProfile.playerName || "Ruler").slice(0, 40),
        lostAtMs: nowMs, lossEventId: keyFor(r, eventId, "loss") });
    }
    if (recovered && current(recovered.old, r) && recovered.old.status === "open" && recovered.old.originalOwnerUid === attackerUid) {
      tx.set(recovered.ref, { status: "returned", returnedAtMs: nowMs }, { merge: true });
    }
  }
  async function execute(uid, input = {}) {
    const action = input.action || "list";
    if (!input || typeof input !== "object" || Array.isArray(input) || !["list", "return"].includes(action)
      || Object.keys(input).some(key => !["action", "cursor", "key", "lossEventId", "operationId"].includes(key))
      || (input.cursor && !/^[a-f0-9]{64}$/.test(input.cursor))
      || (action === "return" && (!/^[a-f0-9]{64}$/.test(input.key || "") || !validId(input.lossEventId) || !validId(input.operationId)))) {
      throw fail("invalid-argument", "Choose a valid War Cities action.");
    }
    return transact(async tx => {
      const { r, clanId } = await authorize(tx, uid), nowMs = Date.now();
      if (action === "list") {
        let query = db.collection(`clans/${clanId}/warCities`).where("worldId", "==", r.worldId)
          .where("resetGeneration", "==", r.resetGeneration).where("realmShardId", "==", r.realmShardId)
          .where("status", "==", "open").orderBy("key");
        if (input.cursor) query = query.where("key", ">", input.cursor);
        const page = await tx.get(query.limit(PAGE_SIZE + 1)), entries = [];
        for (const snap of page.docs.slice(0, PAGE_SIZE)) {
          const loss = snap.data();
          if (loss.key !== keyFor(r, loss.regionId, loss.cityId)) continue;
          const original = await membership(tx, loss.originalOwnerUid, clanId, r);
          if (!original) continue;
          const city = (await tx.get(cityRef(loss.regionId, loss.cityId))).data();
          if (!current(city, r) || !regularCity(city) || city.ownerUid === loss.originalOwnerUid) continue;
          const holder = await membership(tx, city.ownerUid, clanId, r);
          entries.push({ key: loss.key, lossEventId: loss.lossEventId, cityName: loss.cityName,
            originalOwnerName: String(original.playerName || loss.originalOwnerName).slice(0, 40),
            captorName: loss.captorName, currentOwnerName: String(city.ownerName || "Neutral").slice(0, 40),
            lostAtMs: loss.lostAtMs, status: holder ? "recovered" : "lost",
            canReturn: Boolean(holder && city.ownerUid === uid && !city.isMainCity && holder.mainCityId !== city.id),
            returnBlockedReason: holder && city.ownerUid === uid && (city.isMainCity || holder.mainCityId === city.id) ? "Choose another Main City before returning this city." : "",
            location: { targetType: "city", regionId: loss.regionId, targetId: loss.cityId } });
        }
        return { version: 1, clanId, ...r, serverTimeMs: nowMs, entries,
          nextCursor: page.docs.length > PAGE_SIZE ? page.docs[PAGE_SIZE - 1].data().key : "" };
      }
      const receiptRef = db.doc(`players/${uid}/warCityReceipts/${keyFor(r, clanId, input.operationId)}`);
      const receipt = (await tx.get(receiptRef)).data();
      if (receipt) {
        if (!current(receipt, r) || receipt.key !== input.key || receipt.lossEventId !== input.lossEventId) throw fail("already-exists", "That request was already used for another city.");
        return { ...receipt.result, replayed: true };
      }
      const lossRef = recordRef(clanId, input.key), loss = (await tx.get(lossRef)).data();
      if (!current(loss, r) || loss.status !== "open" || loss.lossEventId !== input.lossEventId
        || loss.key !== keyFor(r, loss.regionId, loss.cityId)) throw fail("failed-precondition", "This loss is no longer available. Refresh War Cities.");
      if (loss.originalOwnerUid === uid) throw fail("failed-precondition", "This city already belongs to its original ruler.");
      const original = await membership(tx, loss.originalOwnerUid, clanId, r);
      if (!original) throw fail("failed-precondition", "The original ruler is no longer in your clan.");
      const result = await transfer(tx, { uid, clanId, loss, nowMs, operationId: input.operationId });
      tx.set(lossRef, { status: "returned", returnedAtMs: nowMs, returnedByUid: uid }, { merge: true });
      tx.create(receiptRef, { ...r, key: input.key, lossEventId: input.lossEventId, result, createdAtMs: nowMs });
      return result;
    }, "clanWarCities");
  }
  return { prepareCapture, commitCapture, execute };
}
module.exports = { createService, keyFor, PAGE_SIZE };
