"use strict";
const assert = require("node:assert/strict");
const { publicRows, readArchive, createHandler, PAGE_SIZE } = require("../functions/public-season-rankings");
const now = Date.UTC(2026, 10, 1);
const records = new Map([
  ["realm-2026-11", { status: "ready" }], ["realm-2026-10", { status: "finalizing" }],
  ["realm-2026-09", { status: "ready", privateHeader: "hidden", trackingStartedAtMs: 100 }],
]);
let boardReads = 0;
const entries = [{ rank: 1, playerName: "Ruler", name: "House", kingPower: 9, totalKingPower: 12, pvpKills: 7,
  uid: "private-id", id: "private-id", email: "private", receipt: { requestId: "private" }, roster: ["private"] }];
const db = {
  doc(location) { return { get: async () => ({ data: () => records.get(location.split("/")[1]) }),
    collection: () => ({ doc: () => ({ get: async () => { boardReads++; return { exists: true, data: () => ({ entries }) }; } }) }) }; },
  collection(location) {
    assert.equal(location, "seasonResults");
    let cursor;
    return { orderBy(_field, direction) { assert.equal(direction, "desc"); return this; },
      startAfter(value) { cursor = value; return this; }, limit(value) { assert.equal(value, PAGE_SIZE); return this; },
      async get() { const docs = [...records].filter(([id]) => id < cursor).sort(([a], [b]) => b.localeCompare(a)).slice(0, PAGE_SIZE)
        .map(([id, data]) => ({ id, data: () => data })); return { size: docs.length, docs }; } };
  },
};
async function main() {
  assert.deepEqual(await readArchive(db, {}, now), { seasons: [{ seasonId: "realm-2026-09", endsAtMs: Date.UTC(2026, 9, 1) }], nextBefore: null });
  for (const [board, name, score] of [["players", "Ruler", 9], ["clans", "House", 12], ["glory", "Ruler", 7]]) {
    const result = await readArchive(db, { season: "realm-2026-09", board }, now);
    assert.deepEqual(result.entries, [{ rank: 1, name, score }]);
    assert(!JSON.stringify(result).includes("private"));
  }
  const count = boardReads;
  assert.equal((await readArchive(db, { season: "realm-2026-10" }, now)).status, "pending");
  assert.equal(boardReads, count, "Never read a provisional board");
  assert.equal((await readArchive(db, { season: "realm-2026-12" }, Date.UTC(2027, 0, 1))).status, "unavailable");
  for (const query of [{ season: "realm-2026-11" }, { season: "realm-2026-12" }, { season: "realm-2026-08" },
    { season: "../players/private" }, { season: ["realm-2026-09"] }, { season: "realm-2026-09", board: "awards" },
    { before: "realm-2026-13" }, { uid: "private" }, { board: "players" }]) {
    await assert.rejects(readArchive(db, query, now), error => error.status === 400);
  }
  assert.throws(() => publicRows([{ rank: 2, kingPower: 10 }], "players"));
  assert.throws(() => publicRows([{ rank: 1, kingPower: -1 }], "players"));
  assert.throws(() => publicRows(undefined, "players"));
  assert.equal(publicRows(Array.from({ length: 101 }, (_, i) => ({ rank: i + 1, kingPower: 999 - i })), "players").length, 100);
  for (let year = 2027; year <= 2029; year++) for (let month = 1; month <= 12; month++) records.set(`realm-${year}-${String(month).padStart(2, "0")}`, { status: "ready" });
  const first = await readArchive(db, {}, Date.UTC(2030, 0, 1));
  assert.equal(first.seasons.length, 24); assert(first.nextBefore);
  const second = await readArchive(db, { before: first.nextBefore }, Date.UTC(2030, 0, 1));
  assert(second.seasons.every(row => !first.seasons.some(other => other.seasonId === row.seasonId)));
  const response = () => ({ headers: {}, set(k, v) { this.headers[k] = v; return this; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } });
  let res = response(); await createHandler(db)({ method: "POST", query: {} }, res); assert.equal(res.code, 405);
  res = response(); await createHandler(db)({ method: "GET", query: {} }, res); assert.equal(res.code, 200); assert.match(res.headers["Cache-Control"], /s-maxage=300/);
  res = response(); await createHandler({ collection() { throw Error("private credentials detail"); } })({ method: "GET", query: {} }, res);
  assert.equal(res.code, 503); assert.equal(res.headers["Cache-Control"], "no-store"); assert(!JSON.stringify(res.body).includes("private"));
  console.log("Public season archive passed privacy, finished-only reads, pagination, score/rank integrity, request validation, caching and safe failures.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
