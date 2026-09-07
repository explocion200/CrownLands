"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const client = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const catalog = require("../assets/worlds/core-expansion-v1/region-catalog.json");
const layout = require("../functions/core-expansion-world-layout.json");

function source(text, name) {
  const match = text.match(new RegExp(`^([ \\t]*)(async )?function ${name}\\(`, "m"));
  assert(match, `Missing ${name}`);
  const start = match.index;
  const end = text.indexOf(`\n${match[1]}}`, start + match[0].length);
  assert(end > start, `Missing end of ${name}`);
  return text.slice(start, text.indexOf("}", end) + 1);
}

async function main() {
  const configs = Object.fromEntries(["gold", "troops", "items", "deed"].map(type => [type, { type }]));
  let uid = "holder";
  let realm = "realm-2026-09:shard_0001";
  let day = "2026-09-07";
  const fetches = [];
  const context = vm.createContext({
    console, Date, Map, Promise, CORE_EXPANSION_TOPOLOGY_ACTIVE: true, REGION_CATALOG: catalog,
    ACTIVE_WORLD_REGION_IDS: new Set(catalog.regions.filter(region => region.permanentCore).map(region => region.id)),
    deedCampLocationsRequest: null, rewardCampProgressCache: new Map(), rewardCampProgressRequests: new Map(),
    deedCampHistoryCache: new Map(), deedCampHistoryRequests: new Map(),
    getCurrentOnlineUid: () => uid, getOnlineRequestScope: () => `${uid}:${realm}`,
    currentUtcDateKey: () => day, normalizeTimestampMs: value => Number(value) || 0,
    RELIC_CAMP_DAILY_REWARD_LIMIT: 5, DEED_CAMP_HISTORY_DISPLAY_LIMIT: 10,
    getRewardCampConfig: camp => configs[typeof camp === "string" ? camp : camp?.campType],
    getOnlineIslandId: regionId => `${realm}--${regionId}`,
    fetch: async definitionPath => {
      fetches.push(definitionPath);
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, definitionPath), "utf8")) };
    },
  });
  for (const name of ["getRewardCampProgressCacheKey", "normalizeRewardCampProgress", "cacheRewardCampProgress",
    "getCachedRewardCampProgress", "loadRewardCampProgress", "getDeedCampHistoryCacheKey", "loadDeedCampLocations",
    "refreshDeedCampHistoryPanel", "refreshCampRewardsAfterPayout"]) vm.runInContext(source(game, name), context);
  const expected = layout.maps.flatMap(map => (map.camps || []).filter(camp => camp.campType === "deed")
    .map(camp => ({ regionId: map.id, campId: camp.id })));
  assert.equal(expected.length, 4);
  const locations = await context.loadDeedCampLocations(expected[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(locations)).sort((a, b) => a.campId.localeCompare(b.campId)),
    expected.sort((a, b) => a.campId.localeCompare(b.campId)), "An unvisited Deed Camp was omitted.");
  assert.equal(fetches.length, 12, "Discovery must read only current camp-map definitions.");
  await context.loadDeedCampLocations(expected[1]);
  assert.equal(fetches.length, 12, "Repeated tabs refetched static definitions.");
  for (const config of Object.values(configs)) {
    context.cacheRewardCampProgress(config, { date: day, count: 1, rewards: [{ itemId: "item" }] });
    assert.equal(context.getCachedRewardCampProgress(config).progress.count, 1);
    uid = "outsider";
    assert.equal(context.getCachedRewardCampProgress(config), null, "Another player inherited rewards.");
    uid = "holder";
    realm = "realm-2026-10:shard_0001";
    assert.equal(context.getCachedRewardCampProgress(config), null, "A new realm inherited rewards.");
    realm = "realm-2026-09:shard_0001";
    day = "2026-09-08";
    assert.equal(context.getCachedRewardCampProgress(config), null, "Yesterday's progress survived UTC reset.");
    assert.equal(context.normalizeRewardCampProgress(config, { date: "2026-09-07", count: 5 }).count, 0);
    day = "2026-09-07";
  }
  let finishProgress;
  const api = { isSignedIn: () => true, loadRewardCampProgress: () => new Promise(resolve => { finishProgress = resolve; }) };
  context.getOnlineApi = () => api;
  const pending = context.loadRewardCampProgress(configs.deed);
  uid = "outsider";
  finishProgress({ date: day, count: 1 });
  await assert.rejects(pending, /account or realm changed/);
  assert.equal(context.getCachedRewardCampProgress(configs.deed), null);
  uid = "holder";
  let reads = 0;
  api.loadRewardCampProgress = async () => ({ date: day, count: ++reads });
  assert.equal((await context.loadRewardCampProgress(configs.gold)).count, 1);
  assert.equal((await context.loadRewardCampProgress(configs.gold)).count, 2, "Opening another camp reused stale progress.");

  let finishHistory;
  let historyReads = 0;
  const rendered = [];
  context.renderDeedCampHistoryPanel = (campId, history, status) => rendered.push({ campId, history, status });
  api.loadRewardCampHistory = async args => {
    historyReads++;
    assert.equal(args.locations.length, 4);
    return new Promise(resolve => { finishHistory = resolve; });
  };
  const camps = expected.map(entry => ({ id: entry.campId, regionId: entry.regionId, campType: "deed" }));
  context.refreshDeedCampHistoryPanel(camps[0]);
  context.refreshDeedCampHistoryPanel(camps[1]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(historyReads, 1);
  finishHistory([{ id: "award", awardedAtMs: 1 }]);
  await new Promise(resolve => setImmediate(resolve));
  for (const camp of camps.slice(0, 2)) assert(rendered.some(row => row.campId === camp.id && row.history[0]?.id === "award"),
    "Switching camps while loading left the new panel without its history.");
  context.refreshDeedCampHistoryPanel(camps[0]);
  await new Promise(resolve => setImmediate(resolve));
  uid = "outsider";
  rendered.length = 0;
  finishHistory([{ id: "private", awardedAtMs: 2 }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rendered.length, 0, "A delayed response rendered another player's history.");
  uid = "holder";
  context.modal = { open: true, dataset: { campInfoId: camps[1].id } };
  context.getCampTargetById = id => camps.find(camp => camp.id === id);
  let updatedId;
  context.renderRewardCampProgressPanel = id => { updatedId = id; };
  context.refreshDeedCampHistoryPanel = camp => { assert.equal(camp.id, camps[1].id); };
  context.refreshCampRewardsAfterPayout(camps[0], configs.deed, { holderUid: uid, dailyClaim: 1 });
  assert.equal(updatedId, camps[1].id, "A payout at one camp did not refresh another matching camp's open panel.");

  const rows = expected.flatMap((camp, index) => Array.from({ length: 4 }, (_, n) => ({
    id: `${index}-${n}`, campId: camp.campId, cityId: `city-${index}-${n}`, regionId: camp.regionId,
    awardedToPlayerId: uid, awardedAtMs: index * 100 + n, source: "deed_camp",
  })));
  const queries = [];
  const clientContext = vm.createContext({
    init: async () => {}, requireSignedIn: () => uid, getOnlineRequestScope: () => `${uid}:${realm}`,
    cleanPlayerName: String, timestampToMs: () => 0,
    client: { db: {}, modules: { firestore: {
      collection: (_db, ...parts) => parts.join("/"), where: (field, op, value) => ({ field, op, value }),
      query: (ref, ...filters) => ({ ref, filters }), getDocs: async query => {
        queries.push(query);
        assert.deepEqual(query.filters[0], { field: "awardedToPlayerId", op: "==", value: uid });
        return { docs: [...rows.filter(row => query.ref.includes(row.campId)),
          { ...rows[0], awardedToPlayerId: "outsider", awardedAtMs: 99999 }].map(row => ({ id: row.id, data: () => row })) };
      },
    } } },
  });
  vm.runInContext(source(client, "loadRewardCampHistory"), clientContext);
  const input = expected.map(camp => ({ islandId: camp.regionId, campId: camp.campId }));
  const history = await clientContext.loadRewardCampHistory({ locations: [...input, input[0]] });
  assert.equal(queries.length, 4, "Duplicate locations caused duplicate reads.");
  assert.equal(history.length, 10);
  assert.deepEqual(Array.from(history, row => row.id), rows.sort((a, b) => b.awardedAtMs - a.awardedAtMs).slice(0, 10).map(row => row.id));
  clientContext.client.modules.firestore.getDocs = async () => { throw new Error("offline"); };
  await assert.rejects(clientContext.loadRewardCampHistory({ locations: input }), /offline/,
    "Unavailable maps must not silently return incomplete award history.");
  console.log("Validated shared Camp rewards: unvisited locations, private caches, UTC reset, stale requests, fresh progress, payout refresh, and latest-10 history.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
