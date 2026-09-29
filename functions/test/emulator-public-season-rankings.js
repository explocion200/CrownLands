"use strict";
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { readArchive } = require("../public-season-rankings");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Local Firestore emulator required.");
const project = "crown-land-b15e0";
initializeApp({ projectId: project });
const db = getFirestore();
async function main() {
  const season = "realm-2026-09", now = Date.UTC(2026, 10, 1), header = db.doc("seasonResults/" + season);
  await header.set({ seasonId: season, status: "finalizing", privateHeader: "hidden" });
  for (const board of ["players", "clans", "glory"]) await header.collection("boards").doc(board).set({
    entries: Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, playerName: "Ruler " + i, name: "House " + i,
      kingPower: 1000 - i, totalKingPower: 2000 - i, pvpKills: 300 - i, uid: "private-" + i, email: "hidden" })),
  });
  assert.equal((await readArchive(db, { season }, now)).status, "pending");
  assert.equal((await readArchive(db, {}, now)).seasons.length, 0);
  await header.update({ status: "ready" });
  await db.doc("seasonResults/realm-2026-10").set({ seasonId: "realm-2026-10", status: "open" });
  await db.doc("seasonResults/realm-2026-11").set({ seasonId: "realm-2026-11", status: "ready" });
  assert.deepEqual((await readArchive(db, {}, now)).seasons.map(row => row.seasonId), [season]);
  for (const board of ["players", "clans", "glory"]) {
    const result = await readArchive(db, { season, board }, now);
    assert.equal(result.entries.length, 100); assert.equal(result.entries[99].rank, 100);
    assert.deepEqual(Object.keys(result.entries[0]).sort(), ["name", "rank", "score"]);
  }
  const batch = db.batch();
  for (let year = 2027; year <= 2029; year++) for (let month = 1; month <= 12; month++) {
    const seasonId = `realm-${year}-${String(month).padStart(2, "0")}`;
    batch.set(db.doc("seasonResults/" + seasonId), { seasonId, status: "ready" });
  }
  await batch.commit();
  const first = await readArchive(db, {}, Date.UTC(2030, 0, 1));
  assert.equal(first.seasons.length, 24); assert.equal(first.seasons[0].seasonId, "realm-2029-12");
  assert.equal(first.nextBefore, "realm-2028-01");
  const second = await readArchive(db, { before: first.nextBefore }, Date.UTC(2030, 0, 1));
  assert.equal(second.seasons[0].seasonId, "realm-2027-12"); assert.equal(second.nextBefore, null);
  assert(second.seasons.every(row => !first.seasons.some(other => other.seasonId === row.seasonId)));
  const snapshot = await header.get();
  const hub = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB || "127.0.0.1:4400"}/emulators`).then(r => r.json());
  const endpoint = `http://${hub.functions.host}:${hub.functions.port}/${project}/us-central1/getPublicSeasonRankings`;
  const publicResponse = await fetch(endpoint);
  assert.equal(publicResponse.status, 200); assert.match(publicResponse.headers.get("cache-control"), /s-maxage=300/);
  assert(Array.isArray((await publicResponse.json()).seasons));
  assert.equal((await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 405);
  assert.equal((await fetch(endpoint + "?season=../../players&board=players")).status, 400);
  const current = "realm-" + new Date().toISOString().slice(0, 7);
  assert.equal((await fetch(endpoint + "?season=" + current)).status, 400, "Current rankings are not public archive entries");
  const privatePath = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/seasonResults/${season}`;
  assert.equal((await fetch(privatePath)).status, 403, "Direct Firestore access remains private");
  assert((await header.get()).updateTime.isEqual(snapshot.updateTime), "Archive reads mutated results");
  console.log("Public archive emulator passed anonymous HTTP, private records, three final Top 100 boards, pending/current exclusions and read-only behavior.");
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
