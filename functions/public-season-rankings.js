"use strict";

const { BOARDS, supported, seasonInfo } = require("./season-rewards");
const PAGE_SIZE = 24;
const invalid = () => { throw Object.assign(new Error("Invalid archive selection."), { status: 400 }); };
const text = (value, fallback = "") => typeof value === "string" ? value.slice(0, 120) : fallback;

// Publish only finished rankings. Account IDs, clan rosters and reward receipts
// stay behind the existing authenticated game APIs and Firestore rules.
function publicRows(entries, board) {
  const scoreField = board === "clans" ? "totalKingPower" : board === "glory" ? "pvpKills" : "kingPower";
  if (!Array.isArray(entries)) throw new Error("Finalized board entries missing.");
  return entries.slice(0, 100).map((row, index) => {
    if (row.rank !== index + 1 || !Number.isSafeInteger(row[scoreField]) || row[scoreField] < 0) throw new Error("Invalid finalized standing.");
    return { rank: row.rank,
      name: text(board === "clans" ? row.name : row.playerName || row.displayName).trim() || (board === "clans" ? "Clan" : "Ruler"),
      score: row[scoreField] };
  });
}

async function readArchive(db, query = {}, nowMs = Date.now()) {
  if (Object.keys(query).some(key => !["season", "board", "before"].includes(key))
    || Object.values(query).some(value => typeof value !== "string")) invalid();
  const currentSeason = "realm-" + new Date(nowMs).toISOString().slice(0, 7);
  if (query.season) {
    const { season, board = "players" } = query;
    if (!supported(season) || season >= currentSeason || !BOARDS.includes(board) || query.before) invalid();
    const info = seasonInfo(season), ref = db.doc("seasonResults/" + season);
    const header = (await ref.get()).data();
    if (header?.status !== "ready") return { seasonId: season, board, status: header ? "pending" : "unavailable", entries: [] };
    const snapshot = await ref.collection("boards").doc(board).get();
    if (!snapshot.exists) throw new Error("Finalized board missing.");
    return { seasonId: season, board, status: "ready", endsAtMs: info.endsAtMs,
      trackingStartedAtMs: Number.isSafeInteger(header.trackingStartedAtMs) ? header.trackingStartedAtMs : 0,
      entries: publicRows(snapshot.data().entries, board) };
  }
  if (query.board || (query.before && (!supported(query.before) || query.before > currentSeason))) invalid();
  // arm() stores seasonId in every header. Firestore supports descending field
  // indexes, but rejects a query ordered only by descending document ID.
  const snapshot = await db.collection("seasonResults").orderBy("seasonId", "desc")
    .startAfter(query.before || currentSeason).limit(PAGE_SIZE).get();
  const seasons = snapshot.docs.filter(doc => supported(doc.id) && doc.data().status === "ready")
    .map(doc => ({ seasonId: doc.id, endsAtMs: seasonInfo(doc.id).endsAtMs }));
  return { seasons, nextBefore: snapshot.size === PAGE_SIZE ? snapshot.docs.at(-1).id : null };
}

function createHandler(db) {
  return async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (request.method !== "GET") return response.set("Allow", "GET").status(405).json({ error: "Use GET to read season rankings." });
    try {
      const result = await readArchive(db, request.query);
      response.set("Cache-Control", "public, max-age=60, s-maxage=300");
      return response.status(200).json(result);
    } catch (error) {
      return response.status(error.status === 400 ? 400 : 503).json({
        error: error.status === 400 ? "Invalid archive selection." : "Season rankings are temporarily unavailable.",
      });
    }
  };
}

module.exports = { PAGE_SIZE, publicRows, readArchive, createHandler };
