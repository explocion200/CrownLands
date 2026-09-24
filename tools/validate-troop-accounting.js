"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing source boundary: ${start}`);
  return text.slice(a, b);
}

const realm = { worldId: "test-world", resetGeneration: "test-season", realmShardId: "test-shard" };
const profile = { ...realm, uid: "owner", towerGarrisonTroops: 400, towerGarrisonResetGeneration: realm.resetGeneration,
  stationedReinforcementTroops: 50, reinforcementResetGeneration: realm.resetGeneration,
  committedRallyTroops: 75, rallyResetGeneration: realm.resetGeneration };
const city = { ...realm, id: "city", islandId: "island", regionId: "region", ownerUid: "owner", troops: 100 };
const camp = { ...city, id: "camp", troops: 200 };
const march = { ...city, id: "march", status: "active", troops: 300 };
const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : Number(fallback) || 0;
const sandbox = {
  Map, Number, Date, Math, console, exports: {},
  safeString: (value, length = 999) => String(value || "").slice(0, length), safeNumber,
  RESET_GENERATION: realm.resetGeneration, ONLINE_WORLD_ID: realm.worldId, GLOBAL_PLAYER_STATS_VERSION: 12,
  KING_POWER_ARMY_TROOP_VALUE: 2, KING_POWER_AUTHORITY_VERSION: 12,
  FieldValue: { serverTimestamp: () => "timestamp" },
  getCurrentRealmShardId: () => realm.realmShardId,
  REALM_TOPOLOGY: { normalizeRealmShardId: value => value || "legacy" },
  getOwnerUid: value => value.ownerUid || "", getCityEntryIslandId: entry => entry.city.islandId,
  getOnlineIslandId: () => "island", isCurrentWorldIslandId: id => id === "island",
  isCurrentWorldArmy: army => army.worldId === realm.worldId && army.resetGeneration === realm.resetGeneration
    && army.realmShardId === realm.realmShardId,
  getArmyStatsKey: army => army.id, normalizeItemEffects: () => ({}),
  getOwnedStrongholdBonuses: () => ({}), getStaticActiveServerRegionIds: () => ["region"],
  getCityProductionStats: () => ({}), getCityInfrastructurePowerComponents: () => ({
    replacementPower: 10, defensivePower: 5, sustainableTroopPerHour: 1,
  }),
  isStronghold: () => false, clampCityLevel: () => 1, normalizeRegionId: id => id || "region",
  getRegionIdFromOnlineIslandId: () => "region", normalizeCharacterProgress: () => ({ level: 1 }),
  getObjectiveTroopDefenseBonusPercent: () => 0,
};
vm.createContext(sandbox);
vm.runInContext([
  between(source, "function scopeServerArmyMovement(", "function writeArmyMovementCopies("),
  between(source, "function getTroopKingPower(", "\nfunction "),
  between(source, "function createGlobalStatsSnapshot(", "function getTimedProductionBoostOverlapSeconds("),
  between(source, "function createPatchedCityEntriesForStats(", "function writeGlobalStatsFromEconomy("),
].join("\n"), sandbox);
const snapshot = overrides => sandbox.createGlobalStatsSnapshot({ uid: "owner", profile,
  cityEntries: [{ city }], heldCamps: [{ camp }], activeArmies: [march], ...overrides });
const baseline = snapshot();
assert.equal(baseline.armyPower, 1125 * 2, "All five troop locations must contribute once.");
assert.equal(baseline.towerTroopPower, 800);
assert.equal(baseline.kingPower, baseline.armyPower + baseline.replacementPower + baseline.defensivePower);
assert.equal(snapshot({ profile: { ...profile, towerGarrisonResetGeneration: "old-season" } }).armyPower, 725 * 2);
assert.equal(snapshot({ profile: { ...profile, towerGarrisonTroops: -20 } }).totalTowerTroops, 0);
assert.equal(snapshot({ profile: { ...profile, towerGarrisonTroops: 400.9 } }).totalTowerTroops, 400);
assert.equal(snapshot({ activeArmies: [march, march, { ...march, id: "resolved", status: "resolved" },
  { ...march, id: "other", ownerUid: "other" }, { ...march, id: "old", resetGeneration: "old" },
  { ...march, id: "shard", realmShardId: "other" }, { ...march, id: "rally", rallyAttack: true, troops: 75 },
] }).armyPower, baseline.armyPower, "Mirrors, other players/realms, and reserved rally marches must not add power.");
assert.equal(sandbox.getTotalMilitaryTroopsFromGlobalStats({ totalTroops: Number.MAX_SAFE_INTEGER,
  totalTowerTroops: 500 }), Number.MAX_SAFE_INTEGER);
const ref = { path: "islands/island/cities/city", id: "city", parent: { parent: { id: "island" } } };
const campRef = { ...ref, path: "islands/island/camps/camp", id: "camp" };
sandbox.getCityEntryPath = entry => entry.ref.path;
const economy = { uid: "owner", profileAfter: profile, cityEntries: [{ ref, city }], cityPatches: [],
  heldCamps: [{ ref: campRef, camp }], activeArmies: [march] };
const outbound = { ...march, id: "tower-out", troops: 120 };
const departing = sandbox.createPreparedEconomyStatsSnapshot(economy, { towerGarrisonTroops: 280 }, { addActiveArmies: [outbound] });
assert.equal(departing.armyPower, baseline.armyPower, "Tower departure must conserve troop power.");
const unscopedOutbound = { ...outbound };
delete unscopedOutbound.realmShardId;
assert.equal(sandbox.createPreparedEconomyStatsSnapshot(economy, { towerGarrisonTroops: 280 }, {
  addActiveArmies: [unscopedOutbound],
}).armyPower, baseline.armyPower, "A newly created march must use the same realm scope as its canonical write.");
const cityTransfer = sandbox.createPreparedEconomyStatsSnapshot(economy, {}, {
  extraCityPatches: [{ ref, city, patch: { troops: 20 } }],
  addActiveArmies: [{ ...unscopedOutbound, troops: 80 }],
});
assert.equal(cityTransfer.armyPower, baseline.armyPower, "City transfers must remain counted before their first canonical read.");
const arriving = sandbox.createPreparedEconomyStatsSnapshot({ ...economy, profileAfter: { ...profile, towerGarrisonTroops: 280 },
  activeArmies: [march, outbound] }, { towerGarrisonTroops: 400 }, { excludeArmyIds: [outbound.id] });
assert.equal(arriving.armyPower, baseline.armyPower, "Tower arrival must conserve troop power.");
const rally = sandbox.createPreparedEconomyStatsSnapshot(economy, { towerGarrisonTroops: 280, committedRallyTroops: 195 });
assert.equal(rally.armyPower, baseline.armyPower, "Tower rally reservation must conserve troop power.");
sandbox.getRewardCampCombatTarget = data => ({ ...data, ownerUid: data.holderUid, troops: data.currentGarrison });
const campArrival = sandbox.createPreparedEconomyStatsSnapshot(economy, {}, {
  excludeArmyIds: [march.id], statsCampPatches: [{ ref: campRef, camp, patch: { holderUid: "owner", currentGarrison: 500 } }],
});
assert.equal(campArrival.armyPower, baseline.armyPower, "Arriving Camp troops must not disappear from power.");
const lostCamp = sandbox.createPreparedEconomyStatsSnapshot(economy, {}, {
  statsCampPatches: [{ ref: campRef, camp, patch: { holderUid: "enemy", currentGarrison: 100 } }],
});
assert.equal(lostCamp.totalCampTroops, 0, "A captured Camp must leave the former holder's total immediately.");

// Run the client normalizer and summary, so newly counted troops survive the response boundary.
vm.runInContext(between(client, "function normalizeGlobalStatsSnapshot(", "\nfunction "), sandbox);
vm.runInContext(between(client, "function getKingdomSummary(", "\nfunction "), sandbox);
sandbox.normalizePowerValue = value => Math.max(0, Math.floor(Number(value) || 0));
sandbox.getCurrentOnlineUid = () => "owner";
sandbox.getKnownCityId = id => id || "";
sandbox.normalizeTimestampMs = value => Number(value) || 0;
sandbox.timestampToMs = sandbox.normalizeTimestampMs;
sandbox.getGlobalStatsSnapshot = () => sandbox.normalizeGlobalStatsSnapshot(baseline);
sandbox.hasUsableGlobalStats = () => true;
sandbox.state = { gold: 0 };
assert.equal(sandbox.getKingdomSummary().troops, 1125, "The Kingdom summary must retain Tower, reinforcement and rally troops.");

// Exercise both repair paths against a transaction-only query adapter. A simulated
// conflict discards the first attempt, moves troops, and requires fresh reads before publication.
function docRef(id) {
  return { id: id.split("/").at(-1), path: id, parent: { parent: { id: "island" } },
    get: async () => ({ exists: true, data: () => profile }) };
}
function query(kind) { return { kind, where() { return this; }, get() { throw Error("Troop reads escaped the transaction"); } }; }
const written = new Map();
let attempts = 0;
Object.assign(sandbox, {
  db: { doc: docRef, collectionGroup: () => query("cities") },
  HttpsError: Error, onCall: (_, handler) => handler, requireAuth: () => "owner",
  verifyCurrentSeasonParticipation: async () => {}, PLAYER_IDENTITY_SYNC_VERSION: 1,
  getPlayerIdentitySyncSignature: () => "identity", getCanonicalPlayerIdentity: () => ({ ownerName: "Ruler", ownerFlag: {}, clanId: "" }),
  createOwnedCityEntriesFromSnapshot: (_, snap) => snap.docs.map(doc => ({ ref: doc.ref, city: doc.data() })),
  createActiveArmiesFromSnapshot: (_, snap) => snap.docs.map(doc => doc.data()),
  createHeldCampEntriesFromSnapshot: (_, snap) => snap.docs.map(doc => ({ ref: doc.ref, camp: doc.data() })),
  activeArmiesQueryForPlayer: () => query("armies"), heldRewardCampsQueryForPlayer: () => query("camps"),
  combinePlayerObjectiveBonuses: () => ({}), createMainCityAssignmentRepair: () => ({ profileFields: {}, cityPatches: [] }),
  getMainCityProjectionAfterRepair: () => ({}), playerGlobalStatsRef: () => docRef("stats/owner"),
  leaderboardEntryRef: () => docRef("board/owner"), globalStatsForClient: stats => stats,
  writeCurrentOwnerPatches: async () => 0, getStrongholdLegacyRefsForPlayer: () => [],
  crownCitadelReignRef: () => docRef("crown/owner"), getRegionIdFromCityDoc: () => "region",
  getServerWorldTargetIds: () => new Set(["city"]),
  runTransactionWithInfrastructureRetry: async (callback, operation) => {
    const conflict = operation !== "completePlayerIdentitySync";
    let result;
    for (let attempt = 0; attempt < (conflict ? 2 : 1); attempt++) {
      attempts++;
      const pending = new Map();
      let writesStarted = false;
      const transaction = {
        get: async ref => {
          assert(!writesStarted, "Firestore reads must precede writes.");
          if (!ref.kind) return { exists: ref.path !== "crown/owner", data: () => profile, ref };
          const data = ref.kind === "cities" ? { ...city, troops: attempt ? 20 : 100 }
            : ref.kind === "armies" ? { ...march, troops: attempt ? 380 : 300 } : camp;
          return { docs: [{ id: data.id, ref: docRef(data.id), data: () => data }] };
        },
        set: (ref, data) => { writesStarted = true; pending.set(ref.path, data); },
        update: (ref, data) => { writesStarted = true; pending.set(ref.path, data); },
      };
      result = await callback(transaction);
      if (!conflict || attempt) for (const [key, value] of pending) written.set(key, value);
    }
    return result;
  },
});
vm.runInContext(between(source, "async function rebuildGlobalStatsForPlayer(", "function createEconomyResponse("), sandbox);
vm.runInContext(between(source, "exports.syncPlayerIdentity = onCall", "exports.recalculatePlayerGlobalStats ="), sandbox);
async function main() {
  for (const repair of [() => sandbox.rebuildGlobalStatsForPlayer("owner"), () => sandbox.exports.syncPlayerIdentity({})]) {
    written.clear();
    await repair();
    const stats = written.get("stats/owner");
    assert.equal(stats.totalMarchingTroops, 380, "Repair must re-read a march after a conflict.");
    assert.equal(stats.totalCityTroops, 20);
    assert.equal(stats.totalCampTroops, 200, "Identity repair must retain Camp troops.");
    assert.equal(stats.armyPower, baseline.armyPower, "Repair must preserve total troop power across movement.");
    assert.equal(written.get("board/owner").totalTowerTroops, 400);
  }
  assert(attempts >= 4);
  console.log("Validated troop accounting across Towers, Camps, marches, reinforcements, rallies, client summaries and transaction retries.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
