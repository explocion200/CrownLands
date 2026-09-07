"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const client = fs.readFileSync(path.join(root, "firebaseClient.js"), "utf8");
const layout = require("../functions/core-expansion-world-layout.json");

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const end = source.indexOf("\n}", start);
  assert(end > start, `Missing end of ${name}`);
  return source.slice(start, end + 2);
}

const uid = "fixture-holder";
const nowMs = Date.now();
const camps = ["gold", "troops", "items", "deed"].map((type, index) => {
  const region = layout.maps.find(map => map.camps?.some(camp => camp.campType === type));
  const camp = region.camps.find(entry => entry.campType === type);
  return {
    ...camp, regionId: region.id,
    holderUid: uid, currentGarrison: 1000 + index,
    heldSinceMs: nowMs, payoutAtMs: nowMs + (index + 1) * 600000,
    state: "held", combatVersion: 1,
  };
});
const context = {
  Date,
  WORLD_CAMPS_BY_ID: new Map(), // No camp map has been loaded in this session.
  REGION_CATALOG: {},
  REWARD_CAMP_COMBAT_VERSION: 1,
  DEFAULT_CAMP_VISUAL_SIZE: 132,
  REWARD_CAMP_CONFIG: Object.fromEntries(camps.map(camp => [camp.campType, {
    type: camp.campType, name: camp.name, kind: `${camp.campType}Camp`,
    holdSeconds: 600, baseDefenders: 20000, combatVersion: 1, troopPower: 1,
    baseReward: 1, rewardType: camp.campType, rewardLabel: camp.campType,
  }])),
  onlineHeldCampStates: new Map(), onlineCampStates: new Map(),
  onlineClanRallies: [], onlineReinforcements: [], onlineCampVfxHydrated: false,
  outgoingAttackBtn: {
    hidden: true, classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
  },
  outgoingAttackCount: {}, outgoingAttackTime: {}, modal: { open: false },
  getCurrentOnlineUid: () => uid,
  getOutgoingAttacks: () => [], getIncomingClanReinforcementMarches: () => [],
  getHeldStrongholdsForActiveOperations: () => [],
  normalizeRegionId: value => value,
  normalizeTimestampMs: value => Number(value) || 0,
  readVisualSize: (value, fallback) => Number(value) || fallback,
  formatNumber: String, formatDuration: seconds => `${seconds}s`, escapeHtml: String,
  getCityRegionId: camp => camp.regionId, getRegionLabel: value => value,
  renderCrownlandsIcon: () => "",
  notifyMovementHudOccupancyChange() {}, syncWorldMusicState() {}, renderCities() {},
  getCampVfxSnapshot: () => null,
};
vm.createContext(context);
for (const name of [
  "getCampConfigForType", "getRewardCampConfig", "normalizeOnlineCampState",
  "getCampTargetById", "applyOnlineHeldCamps", "applyOnlineCamps",
  "getHeldCampsForActiveOperations", "getActiveOperationsSnapshot", "updateOutgoingAttackUi",
  "formatHeldCampReward", "renderActiveOperationLocationButton", "renderHeldCampOperationCard",
]) vm.runInContext(functionSource(game, name), context);

context.applyOnlineHeldCamps([]);
assert.equal(context.outgoingAttackBtn.hidden, true);
for (const camp of camps) {
  context.applyOnlineHeldCamps([camp]);
  const operations = context.getActiveOperationsSnapshot();
  assert.equal(operations.camps.length, 1, `${camp.name} disappeared before its map loaded.`);
  assert.equal(context.outgoingAttackBtn.hidden, false, `${camp.name} did not activate Outbound.`);
  assert.equal(context.outgoingAttackCount.textContent, "1");
  const held = operations.camps[0];
  assert.equal(held.currentGarrison, camp.currentGarrison);
  assert.equal(held.payoutAtMs, camp.payoutAtMs);
  assert.equal(held.name, camp.name);
  const card = context.renderHeldCampOperationCard(held);
  assert(card.includes(`data-operation-region="${camp.regionId}"`), "Locate lost the unloaded map.");
  assert(card.includes(`data-operation-location="${camp.id}"`), "Locate lost the held camp.");
  context.applyOnlineHeldCamps([]);
  assert.equal(context.outgoingAttackBtn.hidden, true, "A completed or lost hold remained in Outbound.");
}

context.applyOnlineHeldCamps(camps);
assert.equal(context.getActiveOperationsSnapshot().camps.length, 4, "Simultaneous cross-map holds collapsed.");
context.WORLD_CAMPS_BY_ID.set(camps[0].id, camps[0]);
context.applyOnlineCamps([camps[0]], camps[0].regionId);
assert.equal(context.outgoingAttackCount.textContent, "4", "Visiting a camp double-counted its hold.");
context.applyOnlineCamps([], "core-v2-home");
assert.equal(context.outgoingAttackCount.textContent, "4", "Leaving the camp map removed Outbound activity.");
context.applyOnlineHeldCamps(camps.slice(1));
assert.equal(context.outgoingAttackCount.textContent, "3", "An off-map loss retained a stale hold.");
context.applyOnlineHeldCamps([{ ...camps[0], holderUid: "other-player" }]);
assert.equal(context.outgoingAttackBtn.hidden, true, "Another holder's camp appeared in Outbound.");
assert.equal(context.getCampTargetById("unknown-camp"), null, "Unknown targets must remain unavailable.");

// Exercise the actual subscription query and snapshot delivery, not a copied query.
let listener = null;
let subscribedQuery = null;
const clientContext = {
  RESET_GENERATION: "realm-2026-09", ONLINE_WORLD_ID: "main-realm-2026-09", REALM_SHARD_ID: "shard_0001",
  client: {
    configured: true, db: {}, user: { uid },
    modules: { firestore: {
      collectionGroup: (_db, name) => ({ name }),
      where: (field, operator, value) => ({ field, operator, value }),
      query: (collection, ...filters) => ({ collection, filters }),
      onSnapshot: (query, onCamps) => {
        subscribedQuery = query;
        listener = onCamps;
        return () => { listener = null; };
      },
    } },
  },
};
vm.createContext(clientContext);
for (const name of ["getRealmShardQueryConstraints", "subscribePlayerCamps"]) {
  // Firebase functions are indented within their module closure.
  vm.runInContext(functionSource(client.replace(/^  /gm, ""), name), clientContext);
}
const unsubscribe = clientContext.subscribePlayerCamps({ onCamps: context.applyOnlineHeldCamps });
assert.equal(subscribedQuery.collection.name, "camps");
assert.deepEqual(Array.from(subscribedQuery.filters, filter => [filter.field, filter.operator, filter.value]), [
  ["holderUid", "==", uid], ["resetGeneration", "==", "realm-2026-09"],
  ["worldId", "==", "main-realm-2026-09"], ["realmShardId", "==", "shard_0001"],
], "The held-camp listener cannot satisfy current realm access rules.");
listener({ docs: camps.map(camp => ({ id: camp.id, data: () => camp })) });
assert.equal(context.outgoingAttackCount.textContent, "4", "A remote capture snapshot did not refresh Outbound.");
listener({ docs: [] });
assert.equal(context.outgoingAttackBtn.hidden, true);
unsubscribe();
assert.equal(listener, null, "The held-camp listener did not unsubscribe.");

console.log("Validated all four held-camp Outbound notifications before map load, across map switches, and after capture/loss snapshots.");
