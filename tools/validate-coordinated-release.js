"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { createTravelFixture, extractFunction, serverSource, clientSource } = require("./world-travel-test-fixtures");
const UI = require("../chat-ui");

async function main() {
  const fixture = createTravelFixture(26); // Observed active Layer 2 expansion, September 5.
  const active = new Set(fixture.descriptors.map(region => region.id));
  assert.equal(active.size, 51);
  const rows = new Map();
  const world = "test-world", generation = "test-generation";
  let pool = [];
  for (const [index, region] of [...active].entries()) {
    // Unequal map populations, including a map larger than the old 50-row cap.
    const count = index === 0 ? 60 : index % 4 + 1;
    const map = fixture.scope.getServerWorldMap(region);
    const docs = map.cities.slice(0, count).map((city, i) => {
      const data = { ...city, ownerUid: i % 2 ? "" : null, worldId: world, resetGeneration: generation, realmShardId: "shard_0001" };
      return { id: city.id, ref: { path: `islands/${region}/cities/${city.id}` }, data: () => data };
    }).sort((a, b) => a.id.localeCompare(b.id));
    rows.set(region, docs);
    pool.push(...docs);
  }
  pool.sort((a, b) => a.ref.path.localeCompare(b.ref.path));
  const scope = {
    crypto, ONLINE_WORLD_ID: world, RESET_GENERATION: generation, DEED_CAMP_CITY_QUERY_LIMIT: 50,
    DEED_CAMP_EXCLUDED_REGION_ID: "center", FieldPath: { documentId: () => "id" },
    Filter: { where: (field, operator, value) => ({field, operator, value}), or: (...filters) => ({filters}) },
    REALM_TOPOLOGY: { normalizeRealmShardId: value => value || "legacy" },
    safeNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    safeString: value => String(value || ""), normalizeRegionId: value => value,
    getOwnerUid: city => city.ownerUid || "", isStronghold: city => Boolean(city.isStronghold),
    getCurrentRealmShardId: () => "shard_0001", isCoreExpansionTopologyActive: () => true,
    getOnlineIslandId: region => region, coreExpansionStateRef: () => ({ expansion: true }),
    getStaticActiveServerRegionIds: () => active, getActiveServerRegionIds: () => active,
    getServerWorldRegularCityIds: region => new Set(fixture.scope.getServerWorldMap(region)?.cities.map(city => city.id) || []),
    getServerWorldMap: region => fixture.scope.getServerWorldMap(region),
    processWithConcurrency: async (items, _count, worker) => Promise.all(items.map(worker)),
    db: { collection: location => {
      const query = { region: location.split("/")[1], cursor: null, size: Infinity,
        where(condition) {
          assert.equal(condition.filters?.length, 2, "Use explicit null/empty equality; production IN does not match null owners.");
          assert.equal(condition.filters[0].value, null);
          assert.equal(condition.filters[1].value, "");
          return this;
        }, orderBy() { return this; }, limit(n) { this.size = n; return this; },
        startAfter(cursor) { this.cursor = cursor; return this; } };
      return query;
    } },
  };
  vm.createContext(scope);
  for (const name of ["stableDeedCampChoiceIndex", "getDeedCampCandidateRegionIds", "findEligibleDeedCampCity"]) {
    vm.runInContext((name === "findEligibleDeedCampCity" ? "async " : "") + extractFunction(serverSource, name), scope);
  }
  const transaction = { async get(query) {
    if (query.expansion) return { exists: true, data: () => ({ activeRegionIds: [...active] }) };
    const all = rows.get(query.region) || [];
    const begin = query.cursor ? all.findIndex(doc => doc.id === query.cursor.id) + 1 : 0;
    const docs = all.slice(begin, begin + query.size);
    return { docs, size: docs.length };
  } };
  assert.deepEqual(Array.from(scope.getDeedCampCandidateRegionIds()).sort(), [...active].sort());
  const reached = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const selected = await scope.findEligibleDeedCampCity(transaction, { id: "camp" }, "holder", 100, `seed${i}`);
    const index = scope.stableDeedCampChoiceIndex(`seed${i}:camp:100:holder`, pool.length);
    assert.equal(selected.ref.path, pool[index].ref.path, "Selection must index the full city pool, without map weighting or a 50-city cap.");
    reached.add(selected.regionId);
  }
  assert.equal(reached.size, active.size, "Every active map must be reachable.");
  const histogram = Array(pool.length).fill(0);
  const draws = pool.length * 200;
  for (let i = 0; i < draws; i += 1) histogram[scope.stableDeedCampChoiceIndex(`distribution${i}`, pool.length)] += 1;
  const chiSquared = histogram.reduce((sum, count) => sum + (count - 200) ** 2 / 200, 0);
  assert(chiSquared < pool.length + 6 * Math.sqrt(2 * pool.length), "City probabilities are unexpectedly uneven.");
  const futureRegion = require("../functions/coreExpansionTopology").getRegionAtActivationOrdinal(26).id;
  const futureCity = fixture.scope.getServerWorldMap(futureRegion).cities[0];
  rows.set(futureRegion, [{id:futureCity.id, ref:{path:`islands/${futureRegion}/cities/${futureCity.id}`},
    data:() => ({...futureCity,ownerUid:null,worldId:world,resetGeneration:generation,realmShardId:"shard_0001"})}]);
  assert(!Array.from(scope.getDeedCampCandidateRegionIds()).includes(futureRegion), "An inactive map entered the pool.");
  active.add(futureRegion);
  let reachedExpansion = false;
  for (let i = 0; i < 2000 && !reachedExpansion; i += 1) {
    reachedExpansion = (await scope.findEligibleDeedCampCity(transaction, {id:"camp"}, "holder", 100, `expansion${i}`)).regionId === futureRegion;
  }
  assert(reachedExpansion, "A newly activated map was missed by a stale candidate list.");
  active.delete(futureRegion);
  const excludedDoc = rows.values().next().value[0];
  const invalid = excludedDoc.data();
  invalid.isMainCity = true;
  invalid.ownerUid = "another-player";
  for (const region of active) rows.set(region, rows.get(region).filter(doc => doc.id === excludedDoc.id));
  assert.equal(await scope.findEligibleDeedCampCity(transaction, {}, "holder", 100, "empty"), null);

  const queueScope = { Promise };
  vm.createContext(queueScope);
  vm.runInContext(extractFunction(clientSource, "createScoutResolutionQueue"), queueScope);
  const queue = queueScope.createScoutResolutionQueue(2);
  let releaseSlow;
  const slow = queue(() => new Promise(resolve => { releaseSlow = resolve; }));
  const failed = queue(async () => { throw new Error("mixed target failure"); });
  const seen = [];
  const fast = [1, 2, 3].map(n => queue(async () => { seen.push(n); return n; }));
  await assert.rejects(failed, /mixed target failure/);
  await Promise.all(fast);
  assert.deepEqual(seen, [1, 2, 3], "A slow or failed target blocked independent reports.");
  releaseSlow(); await slow;

  const now = 2_000_000_000_000;
  const expiry = UI.GLOBAL_CHAT_RETENTION_MS;
  const messages = [
    { id: "expired", channel: "global", createdAtMs: now - expiry },
    { id: "fresh", channel: "global", createdAtMs: now - expiry + 1 },
    { id: "clan", channel: "clan", createdAtMs: 1, expiresAtMs: 2 },
  ];
  assert.deepEqual(UI.filterExpiredGlobalMessages(messages, now).map(m => m.id), ["fresh", "clan"]);
  assert.deepEqual(UI.filterExpiredGlobalMessages(messages, now + 1).map(m => m.id), ["clan"]);
  assert.deepEqual(UI.filterExpiredGlobalMessages(UI.mergeMessages([], messages), now + expiry).map(m => m.id), ["clan"], "A cached/paginated message returned after expiry.");
  const travel = extractFunction(clientSource, "updateTroopSliderModal");
  assert.match(travel, /authoritativeSpeedMultiplier/);
  assert.match(travel, /Travel bonus[\s\S]*?Travel time/);
  assert.doesNotMatch(travel, /routeSummary|marchSourceSummary|attackSourceSummary|Attack is still available/);
  const firebase = fs.readFileSync(path.join(__dirname, "../firebaseClient.js"), "utf8");
  assert.match(extractFunction(firebase, "subscribeServerReports"), /stopped = true; unsubscribe/);
  const { migrationWrite } = require("./admin-migrate-chat-retention");
  const document = { name: "projects/qa/databases/(default)/documents/clans/qa/messages/old",
    updateTime: "2026-09-05T00:00:00Z", fields: { expiresAtMs: { integerValue: "2" }, expiresAt: { timestampValue: "2020-01-01T00:00:00Z" } } };
  const removal = migrationWrite(document, now);
  assert.deepEqual(removal.write.updateMask.fieldPaths, ["expiresAt", "expiresAtMs"]);
  assert.equal(removal.write.currentDocument.updateTime, document.updateTime);
  assert(!removal.write.delete, "Clan migration may only remove expiry metadata.");
  document.name = document.name.replace("clans/qa", "globalChat/qa");
  document.fields.createdAtMs = { integerValue: String(now - expiry) };
  assert.equal(migrationWrite(document, now).kind, "expiredGlobalDeleted");
  document.fields.createdAtMs = { integerValue: String(now - expiry + 1) };
  assert.equal(migrationWrite(document, now), null);
  console.log(`Coordinated release: ${active.size} active maps, ${pool.length} unequal-pool cities, ${draws} unbiased draws (chi-square ${chiSquared.toFixed(2)}); independent scout queue, expiry boundaries/cache, and compact travel passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
