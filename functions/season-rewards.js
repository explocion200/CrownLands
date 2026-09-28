"use strict";

const { FieldPath } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const PVP = require("./pvp-leaderboard");
const GEAR = require("./common-gear");

const FIRST_SEASON = "realm-2026-09";
const VERSION = 1;
const BOARDS = ["players", "clans", "glory"];
const TIERS = Object.freeze([
  { through: 1, personal: [8, 2], clan: [3, 1] },
  { through: 2, personal: [6, 1], clan: [2, 1] },
  { through: 3, personal: [5, 1], clan: [2, 1] },
  { through: 10, personal: [4, 0], clan: [1, 0] },
  { through: 25, personal: [3, 0], clan: [1, 0] },
  { through: 50, personal: [2, 0], clan: [0, 0] },
  { through: 100, personal: [1, 0], clan: [0, 0] },
]);
const TITLES = { players: "Sovereign of the Realm", clans: "The Crown’s Vanguard", glory: "Champion of the Battlefield" };
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const fail = message => { throw new HttpsError("failed-precondition", message); };

function seasonInfo(seasonId) {
  if (!/^realm-\d{4}-(0[1-9]|1[0-2])$/.test(seasonId || "")) fail("Invalid rewards season.");
  const [year, month] = seasonId.slice(6).split("-").map(Number);
  return { seasonId, resetGeneration: seasonId, worldId: "main-" + seasonId, realmShardId: "shard_0001",
    startsAtMs: Date.UTC(year, month - 1, 1), endsAtMs: Date.UTC(year, month, 1),
    honorsExpireAtMs: Date.UTC(year, month + 1, 1), boardId: seasonId + "--shard_0001" };
}

function previousSeason(seasonId) {
  const date = new Date(seasonInfo(seasonId).startsAtMs - 1);
  return "realm-" + date.toISOString().slice(0, 7);
}

function supported(seasonId) {
  return /^realm-\d{4}-(0[1-9]|1[0-2])$/.test(seasonId || "") && seasonId >= FIRST_SEASON;
}

function rewardFor(board, rank, tiers = TIERS) {
  if (!BOARDS.includes(board) || !Number.isInteger(rank) || rank < 1) return { commonGearBoxes: 0, uncommonGearBoxes: 0 };
  const tier = tiers.find(row => rank <= row.through);
  const [commonGearBoxes, uncommonGearBoxes] = tier ? tier[board === "clans" ? "clan" : "personal"] : [0, 0];
  return { commonGearBoxes, uncommonGearBoxes };
}

function honorFor(info, board, rank) {
  return { seasonId: info.seasonId, board, rank, title: rank === 1 ? TITLES[board] : "",
    medal: rank <= 3 ? ["gold", "silver", "bronze"][rank - 1] : rank <= 10 ? "top10" : board === "clans" ? "top25" : "top100",
    decoration: rank <= 3 ? board === "players" ? "crown" : board === "glory" ? "swords" : "laurel" : "",
    activeFromMs: info.endsAtMs, expiresAtMs: info.honorsExpireAtMs };
}

const headerRef = (db, seasonId) => db.doc("seasonResults/" + seasonId);
const awardRef = (db, uid, seasonId) => db.doc(`players/${uid}/seasonRewards/${seasonId}`);
function metadata(info, nowMs) {
  return { ...info, version: VERSION, tiers: TIERS, status: "open", armedAtMs: nowMs };
}

async function arm(db, seasonId, nowMs = Date.now()) {
  if (!supported(seasonId)) return;
  const info = seasonInfo(seasonId), ref = headerRef(db, seasonId);
  await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (snap.exists) return;
    if (nowMs >= info.endsAtMs) fail("Season closing capture was not armed before the deadline. Administrative review is required.");
    transaction.create(ref, metadata(info, nowMs));
  });
}

// Buffer writes so the closing fence is read in the SAME transaction, after
// discovering its actual touched boards but before any Firestore writes. This
// covers every existing score/clan/battle producer without a global hot write.
async function guardTransaction(db, transaction, operation, scope, clock = Date.now) {
  const writes = [];
  let proxy;
  proxy = new Proxy(transaction, { get(target, property) {
    if (["set", "update", "create", "delete"].includes(property)) return (...args) => { writes.push([property, args]); return proxy; };
    const value = target[property];
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await operation(proxy);
  const seasons = new Set();
  for (const [method, [ref]] of writes) {
    const parts = ref.path.split("/");
    if (["leaderboards", "clanLeaderboards"].includes(parts[0]) || (parts[0] === "pvpKillEvents" && method === "create")) {
      if (supported(parts[1].split("--")[0])) seasons.add(parts[1].split("--")[0]);
    }
    if (parts[0] === "clans" && supported(scope?.resetGeneration)) seasons.add(scope.resetGeneration);
  }
  const pending = [];
  for (const seasonId of seasons) {
    const info = seasonInfo(seasonId), ref = headerRef(db, seasonId);
    const snap = await transaction.get(ref), stored = snap.data();
    if (clock() >= info.endsAtMs || (stored && stored.status !== "open")) fail("This season has closed. Re-enter the current kingdom.");
    const prior = previousSeason(seasonId);
    if (supported(prior)) {
      const previous = await transaction.get(headerRef(db, prior));
      if (!["captured", "finalizing", "ready"].includes(previous.data()?.status)) {
        fail("Last season’s standings are being preserved. Please reconnect shortly.");
      }
    }
    if (!snap.exists) pending.push([ref, metadata(info, clock())]);
  }
  // Recheck wall time after reads/retries, before flushing the buffered writes.
  for (const seasonId of seasons) if (clock() >= seasonInfo(seasonId).endsAtMs) fail("This season has closed. Re-enter the current kingdom.");
  for (const [ref, data] of pending) transaction.create(ref, data);
  for (const [method, args] of writes) transaction[method](...args);
  return result;
}

function publicEntry(row, id, board, rank) {
  const entry = { id, rank };
  const fields = board === "clans"
    ? ["name", "tag", "shield", "banner", "memberCount", "totalKingPower"]
    : ["displayName", "playerName", "flag", "kingPower", "pvpKills", "reachedAtMs", "clanId", "clanName", "clanTag", "mainRegionId", "cityCount"];
  for (const field of fields) if (row[field] !== undefined) entry[field] = row[field];
  if (board !== "clans") entry.uid = id;
  return entry;
}

async function standings(db, info, board) {
  const collection = board === "players" ? "leaderboards" : board === "clans" ? "clanLeaderboards" : "pvpLeaderboards";
  const field = board === "players" ? "kingPower" : board === "clans" ? "totalKingPower" : "pvpKills";
  let query = db.collection(`${collection}/${info.boardId}/entries`).orderBy(field, "desc");
  if (board === "glory") query = query.orderBy("reachedAtMs", "asc");
  const snapshot = await query.orderBy(FieldPath.documentId(), "asc").limit(100).get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.worldId !== info.worldId || data.resetGeneration !== info.seasonId || data.realmShardId !== info.realmShardId) fail("A leaderboard entry has an invalid season scope.");
    if (!Number.isSafeInteger(data[field]) || data[field] < 0) fail("A leaderboard score is invalid.");
  }
  return snapshot.docs.map((doc, index) => publicEntry(doc.data(), doc.id, board, index + 1));
}

async function capture(db, seasonId, nowMs = Date.now()) {
  const ref = headerRef(db, seasonId), info = seasonInfo(seasonId);
  const status = await db.runTransaction(async transaction => {
    const snap = await transaction.get(ref), stored = snap.data();
    if (!stored || stored.armedAtMs >= info.endsAtMs) fail("Season closing capture was not armed before the deadline. Administrative review is required.");
    if (nowMs < info.endsAtMs) return "open";
    if (stored.status === "open") transaction.update(ref, { status: "closing", closedAtMs: nowMs });
    return stored.status;
  });
  if (!["open", "closing"].includes(status) || nowMs < info.endsAtMs) return;
  // All source score/roster writes now conflict with the committed fence.
  const [players, clans] = await Promise.all([standings(db, info, "players"), standings(db, info, "clans")]);
  const rosterRows = [];
  for (const clan of clans.slice(0, 25)) {
    const members = await db.collection(`clans/${clan.id}/members`).get();
    const uids = members.docs.filter(doc => doc.data().status !== "removed").map(doc => {
      const member = doc.data();
      if (member.resetGeneration !== seasonId || member.worldId !== info.worldId) fail("The closing clan roster has an invalid season scope.");
      return doc.id;
    });
    if (uids.length > 30 || uids.length !== clan.memberCount) fail("The closing clan roster does not match its published member count.");
    rosterRows.push({ clanId: clan.id, uids });
  }
  await db.runTransaction(async transaction => {
    if ((await transaction.get(ref)).data()?.status !== "closing") return;
    transaction.set(ref.collection("boards").doc("players"), { entries: players });
    transaction.set(ref.collection("boards").doc("clans"), { entries: clans });
    for (const roster of rosterRows) transaction.set(ref.collection("rosters").doc(roster.clanId), roster);
    transaction.update(ref, { status: "captured", capturedAtMs: nowMs });
  });
}

async function prepareTransition(db, seasonId, nowMs = Date.now()) {
  if (!supported(seasonId)) return;
  const prior = previousSeason(seasonId);
  if (supported(prior)) await capture(db, prior, nowMs);
  await arm(db, seasonId, nowMs);
}

function buildAwards(info, boards, rosters, tiers = TIERS) {
  const awards = new Map();
  const add = (uid, board, row, clanId = "") => {
    const reward = rewardFor(board, row.rank, tiers);
    if (!reward.commonGearBoxes && !reward.uncommonGearBoxes) return;
    const award = awards.get(uid) || { seasonId: info.seasonId, uid, version: VERSION, commonGearBoxes: 0, uncommonGearBoxes: 0, placements: [], honors: [], claimed: false };
    if (award.placements.some(entry => entry.board === board)) fail("Duplicate season award recipient.");
    award.commonGearBoxes += reward.commonGearBoxes;
    award.uncommonGearBoxes += reward.uncommonGearBoxes;
    award.placements.push({ board, rank: row.rank, ...reward, ...(clanId ? { clanId, clanName: row.name || "Clan", clanTag: row.tag || "" } : {}) });
    award.honors.push(honorFor(info, board, row.rank));
    awards.set(uid, award);
  };
  for (const board of ["players", "glory"]) for (const row of boards[board]) {
    if (integer(row[board === "players" ? "kingPower" : "pvpKills"]) > 0) add(row.uid, board, row);
  }
  for (const row of boards.clans.slice(0, 25)) for (const uid of rosters.get(row.id) || []) add(uid, "clans", row, row.id);
  return [...awards.values()];
}

async function finalize(db, seasonId, nowMs = Date.now()) {
  const ref = headerRef(db, seasonId), info = seasonInfo(seasonId);
  const stored = (await ref.get()).data();
  if (!stored || !["captured", "finalizing"].includes(stored.status)) return;
  if (stored.version !== VERSION) fail("Unknown season reward policy version.");
  // The lease avoids simultaneous workers publishing/replacing claimable awards.
  const leaseId = require("node:crypto").randomUUID();
  const acquired = await db.runTransaction(async transaction => {
    const data = (await transaction.get(ref)).data();
    if (!["captured", "finalizing"].includes(data?.status) || data.leaseUntilMs > nowMs) return false;
    transaction.update(ref, { status: "finalizing", leaseId, leaseUntilMs: nowMs + 240000 });
    return true;
  });
  if (!acquired) return;
  const publish = async operation => db.runTransaction(async transaction => {
    const data = (await transaction.get(ref)).data();
    if (data?.status !== "finalizing" || data.leaseId !== leaseId || data.leaseUntilMs < Date.now()) fail("Season verification lease expired; retry is required.");
    operation(transaction);
  });
  try {
    let cursor = stored.eventCursor || "", drained = false;
    for (let page = 0; page < 5; page += 1) {
      let query = db.collection(`pvpKillEvents/${info.boardId}/events`).orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const events = await query.limit(100).get();
      for (const event of events.docs) {
        const data = event.data();
        if (data.occurredAtMs < info.startsAtMs || data.occurredAtMs >= info.endsAtMs || data.worldId !== info.worldId || data.resetGeneration !== seasonId) fail("A recorded Glory event is outside the closing season.");
        await PVP.processEvent(db, event.ref);
      }
      cursor = events.docs.at(-1)?.id || cursor;
      await publish(transaction => transaction.update(ref, { eventCursor: cursor }));
      if (events.size < 100) { drained = true; break; }
    }
    if (!drained) return;
    const glory = await standings(db, info, "glory");
    const identities = glory.length ? await db.getAll(...glory.map(row => db.doc(`leaderboards/${info.boardId}/entries/${row.uid}`))) : [];
    glory.forEach((row, index) => Object.assign(row, publicEntry({ ...(identities[index]?.data() || {}), ...row }, row.uid, "glory", row.rank)));
    const [playerBoard, clanBoard, rosterDocs, tracking] = await Promise.all([
      ref.collection("boards").doc("players").get(), ref.collection("boards").doc("clans").get(),
      ref.collection("rosters").get(), db.doc("pvpLeaderboards/" + info.boardId).get(),
    ]);
    const boards = { players: playerBoard.data().entries, clans: clanBoard.data().entries, glory };
    const rosters = new Map(rosterDocs.docs.map(doc => [doc.id, doc.data().uids]));
    const awards = buildAwards(info, boards, rosters, stored.tiers);
    for (let offset = 0; offset < awards.length; offset += 150) {
      await publish(transaction => {
        for (const award of awards.slice(offset, offset + 150)) {
          transaction.set(awardRef(db, award.uid, seasonId), award);
          transaction.set(db.doc(`playerSeasonHonors/${award.uid}/seasons/${seasonId}`), { seasonId, honors: award.honors });
        }
      });
    }
    await publish(transaction => {
      for (const clan of boards.clans.slice(0, 25)) transaction.set(db.doc(`clanSeasonHonors/${clan.id}/seasons/${seasonId}`), { seasonId, honors: [honorFor(info, "clans", clan.rank)] });
      transaction.set(ref.collection("boards").doc("glory"), { entries: glory });
    });
    await db.runTransaction(async transaction => {
      const current = (await transaction.get(ref)).data();
      if (current.leaseId !== leaseId || current.leaseUntilMs < Date.now()) fail("Season verification lease expired; retry is required.");
      transaction.update(ref, { status: "ready", finalizedAtMs: Date.now(), recipientCount: awards.length,
        commonGearBoxes: awards.reduce((sum, row) => sum + row.commonGearBoxes, 0),
        uncommonGearBoxes: awards.reduce((sum, row) => sum + row.uncommonGearBoxes, 0),
        trackingStartedAtMs: integer(tracking.data()?.trackingStartedAtMs), leaseUntilMs: 0 });
    });
  } finally {
    await db.runTransaction(async transaction => {
      const data = (await transaction.get(ref)).data();
      if (data?.leaseId === leaseId && data.status !== "ready") transaction.update(ref, { leaseUntilMs: 0 });
    });
  }
}

async function status(db, uid, requestedSeason, currentSeason, nowMs = Date.now()) {
  const seasonId = requestedSeason || previousSeason(currentSeason);
  const info = seasonInfo(seasonId);
  if (!supported(seasonId)) return { ...info, status: "not-started", serverTimeMs: nowMs, pendingSeasons: [] };
  const ref = headerRef(db, seasonId);
  const [header, award, profile, pending] = await Promise.all([
    ref.get(), awardRef(db, uid, seasonId).get(), db.doc("players/" + uid).get(),
    db.collection(`players/${uid}/seasonRewards`).where("claimed", "==", false).get(),
  ]);
  const pendingSeasons = [];
  for (const doc of pending.docs) if ((await headerRef(db, doc.id).get()).data()?.status === "ready") pendingSeasons.push(doc.id);
  const stored = header.data();
  const output = { ...info, status: stored?.status || "unavailable", version: stored?.version || VERSION,
    tiers: stored?.tiers || TIERS, serverTimeMs: nowMs, pendingSeasons: pendingSeasons.sort().reverse(),
    award: stored?.status === "ready" ? award.data() || null : null,
    trackingStartedAtMs: integer(stored?.trackingStartedAtMs), projected: null, decorations: {} };
  if (seasonId === currentSeason && stored?.status === "open") {
    const [players, clans, glory, tracking] = await Promise.all(BOARDS.map(board => standings(db, info, board)).concat(db.doc("pvpLeaderboards/" + info.boardId).get()));
    const clanId = profile.data()?.clanId || "";
    const member = clanId ? await db.doc(`clans/${clanId}/members/${uid}`).get() : null;
    const qualifies = member?.exists && member.data().status !== "removed" && member.data().resetGeneration === seasonId;
    output.projected = { players: players.find(row => row.uid === uid) || null,
      glory: glory.find(row => row.uid === uid) || null, clans: qualifies ? clans.find(row => row.id === clanId) || null : null };
    output.clanEligible = Boolean(qualifies);
    output.trackingStartedAtMs = integer(tracking.data()?.trackingStartedAtMs);
    const prior = previousSeason(seasonId), previous = await headerRef(db, prior).get();
    if (previous.data()?.status === "ready") for (const board of BOARDS) {
      const rows = (await headerRef(db, prior).collection("boards").doc(board).get()).data()?.entries || [];
      output.decorations[board] = rows.slice(0, 3).filter(row => board === "clans" || row[board === "players" ? "kingPower" : "pvpKills"] > 0)
        .map(row => ({ id: row.id, ...honorFor(seasonInfo(prior), board, row.rank) }));
    }
  }
  const participation = seasonId < currentSeason ? await db.doc(`leaderboards/${info.boardId}/entries/${uid}`).get() : null;
  output.participated = Boolean(participation?.exists || (stored?.status === "ready" && award.exists));
  return output;
}

async function history(db, seasonId, board) {
  if (!supported(seasonId) || !BOARDS.includes(board)) fail("Invalid season leaderboard.");
  const ref = headerRef(db, seasonId), header = (await ref.get()).data();
  if (header?.status !== "ready") fail("That season’s results are not finalized yet.");
  return { seasonId, board, entries: (await ref.collection("boards").doc(board).get()).data()?.entries || [],
    trackingStartedAtMs: integer(header.trackingStartedAtMs) };
}

async function honors(db, kind, id) {
  if (!["player", "clan"].includes(kind) || !/^[^/]{1,128}$/.test(id || "")) fail("Invalid honors identity.");
  const snapshots = await db.collection(`${kind}SeasonHonors/${id}/seasons`).get();
  const result = [];
  for (const snapshot of snapshots.docs) {
    if ((await headerRef(db, snapshot.id).get()).data()?.status === "ready") result.push(...(snapshot.data().honors || []));
  }
  return { serverTimeMs: Date.now(), honors: result.sort((a, b) => b.seasonId.localeCompare(a.seasonId) || a.rank - b.rank) };
}

async function claim(db, uid, seasonId, requestId, nowMs = Date.now()) {
  if (!supported(seasonId) || !/^[a-zA-Z0-9_-]{8,96}$/.test(requestId || "")) fail("Invalid season reward claim.");
  const ref = awardRef(db, uid, seasonId), profileRef = db.doc("players/" + uid);
  return db.runTransaction(async transaction => {
    const [season, award, profile, currentRealm] = await transaction.getAll(headerRef(db, seasonId), ref, profileRef, db.doc("realmConfig/current"));
    if (season.data()?.status !== "ready") fail("Last season’s results are still being finalized.");
    if (!award.exists) fail("There are no box rewards for this season.");
    if (award.data().claimed) return { ok: true, replayed: true, receipt: award.data().receipt };
    if (!profile.exists || !profile.data().mainCityId || profile.data().resetGeneration <= seasonId
      || profile.data().resetGeneration !== currentRealm.data()?.resetGeneration
      || profile.data().worldId !== currentRealm.data()?.worldId) fail("Enter the new season before claiming last season’s rewards.");
    if (Number(profile.data().gear?.schemaVersion || 0) > GEAR.SCHEMA_VERSION) fail("Refresh the game before collecting equipment rewards.");
    const data = award.data(), gear = GEAR.normalizeState(profile.data().gear);
    gear.commonGearBoxes += integer(data.commonGearBoxes);
    gear.uncommonGearBoxes += integer(data.uncommonGearBoxes);
    if (!Number.isSafeInteger(gear.commonGearBoxes) || !Number.isSafeInteger(gear.uncommonGearBoxes)) fail("Equipment box balance requires review.");
    gear.updatedAtMs = nowMs;
    const receipt = { seasonId, requestId, claimedAtMs: nowMs, commonGearBoxes: data.commonGearBoxes, uncommonGearBoxes: data.uncommonGearBoxes };
    transaction.update(profileRef, { gear });
    transaction.update(ref, { claimed: true, receipt });
    return { ok: true, replayed: false, receipt, gear };
  });
}

module.exports = { FIRST_SEASON, VERSION, BOARDS, TIERS, TITLES, seasonInfo, previousSeason, supported,
  rewardFor, honorFor, publicEntry, headerRef, awardRef, arm, guardTransaction, capture, prepareTransition, buildAwards, finalize, claim, standings, status, history, honors };
