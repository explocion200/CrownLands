"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("game.js");
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end));
const declarations = between(source, "let clanTreasuryStatus =", "const holdingTowerSnapshots =");
const treasuryFunctions = between(source, "function getClanTreasuryScope(", "function renderClanTreasuryPanel(");
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const reads = [], subscriptions = [], renders = [], donations = [], economy = [];
  const input = { value: "20000000", reportValidity: () => true, focus() {} };
  const api = {
    isSignedIn: () => true,
    getClanTreasuryStatus() { const pending = deferred(); reads.push(pending); return pending.promise; },
    subscribeClanTreasury(clanId, handlers) {
      const subscription = { clanId, handlers, stopped: false };
      subscriptions.push(subscription);
      return () => { subscription.stopped = true; };
    },
    donateClanTreasuryGold(payload) { const pending = deferred(); donations.push({ ...pending, payload }); return pending.promise; },
  };
  const context = vm.createContext({
    console, state: { clanId: "clan-a", gold: 50000000 }, uid: "member-a", onlineSessionGeneration: 1,
    window: { CrownlandsClanTreasuryUi: { closeConfirmation() {}, confirm: async () => true, bind() {} } },
    activeProfileTab: "clan", clanLedgerConfirmationOpen: false,
    selectedHoldingTowerId: "tower-a",
    holdingTowerSnapshots: new Map([["tower-a", { id: "tower-a", ownerMember: true, clanId: "clan-a" }]]),
    clanContent: { querySelector: () => input }, document: { activeElement: input },
    getOnlineApi: () => api, getCurrentOnlineUid: () => context.uid,
    renderClanView: () => { renders.push("panel"); input.value = ""; },
    renderHoldingTowerModal: () => renders.push("tower"),
    markOnlineRealtimeRecoveryNeeded() {}, formatNumber: String,
    confirmClanLedgerAction: async () => true, rejectGameAction: message => { throw Error(message); },
    applyServerEconomyResult: result => economy.push(result), showToast() {}, playRewardSound() {},
    refreshServerEconomy: async () => {},
  });
  vm.runInContext(declarations + treasuryFunctions + `
    this.status = () => clanTreasuryStatus;
    this.loading = () => clanTreasuryLoading;
    this.busy = () => clanTreasuryActionInFlight;
    this.attempted = () => clanTreasuryLoadAttempted;
  `, context);
  const status = (balance, revision, remaining = 50_000_000) => ({
    clanId: context.state.clanId, treasury: { balance, revision, totalDonated: balance, totalSpent: 0 },
    allowance: { remaining }, utcDate: "2026-09-22",
  });
  return { context, api, input, reads, subscriptions, renders, donations, economy, status };
}

async function main() {
  {
    const h = harness();
    const first = h.context.loadClanTreasuryStatus();
    const second = h.context.loadClanTreasuryStatus({ force: true });
    assert.equal(h.reads.length, 1, "Tower opening must await the existing Treasury request.");
    h.reads[0].resolve(h.status(0, 0)); await Promise.all([first, second]);
    h.input.value = "1234";
    h.renders.length = 0;
    h.subscriptions[0].handlers.onTreasury(h.status(20_000_000, 1).treasury);
    assert.equal(h.context.status().treasury.balance, 20_000_000);
    assert.deepEqual(h.renders, ["panel", "tower"], "A member donation did not update both views.");
    assert.equal(h.input.value, "1234", "A live balance change erased a donation draft.");
    const refresh = h.context.loadClanTreasuryStatus({ force: true });
    h.subscriptions[0].handlers.onTreasury(h.status(15_000_000, 2).treasury);
    h.reads[1].resolve(h.status(20_000_000, 1)); await refresh;
    assert.equal(h.context.status().treasury.balance, 15_000_000, "A delayed read restored spent Gold.");
    h.context.applyClanTreasuryStatus("clan-a", h.status(10_000_000, 3));
    h.subscriptions[0].handlers.onTreasury(h.status(15_000_000, 2).treasury);
    assert.equal(h.context.status().treasury.balance, 10_000_000, "A delayed listener restored spent Gold.");
    const cached = await h.context.loadClanTreasuryStatus();
    assert.equal(h.reads.length, 2); assert.equal(cached.treasury.balance, 10_000_000);
    h.context.resetClanTreasuryState();
    h.subscriptions[0].handlers.onTreasury(h.status(99, 99).treasury);
    assert.equal(h.context.status(), null);
    assert(h.subscriptions[0].stopped);
  }
  for (const change of ["clan", "account", "session", "reset"]) {
    const h = harness(), loading = h.context.loadClanTreasuryStatus();
    if (change === "clan") h.context.state.clanId = "clan-b";
    if (change === "account") h.context.uid = "member-b";
    if (change === "session") h.context.onlineSessionGeneration++;
    h.context.resetClanTreasuryState();
    const replacement = h.context.loadClanTreasuryStatus();
    h.reads[0].resolve({ ...h.status(99, 99), clanId: "clan-a" }); await loading;
    assert.equal(h.context.status(), null, change + " retained an old Treasury response.");
    assert(h.context.loading(), "An old request cleared the replacement request's busy state.");
    h.reads[1].resolve(h.status(7, 1)); await replacement;
    assert.equal(h.context.status().treasury.balance, 7);
  }
  {
    const h = harness();
    h.api.getClanTreasuryStatus = async () => { throw Error("not active"); };
    await h.context.loadClanTreasuryStatus();
    assert(!h.context.loading()); assert(h.context.attempted(), "A failed load can trigger an endless render/retry loop.");
  }
  for (const abandon of [false, true]) {
    const h = harness();
    h.context.applyClanTreasuryStatus("clan-a", h.status(0, 0));
    h.input.value = "20000000";
    const donation = h.context.donateClanTreasuryFromPanel(); await flush();
    assert.equal(h.donations[0].payload.amount, 20_000_000);
    assert(h.context.busy());
    if (abandon) { h.context.uid = "member-b"; h.context.resetClanTreasuryState(); }
    else h.context.applyClanTreasuryStatus("clan-a", h.status(15_000_000, 2));
    h.donations[0].resolve({ clanId: "clan-a", balance: 20_000_000, revision: 1,
      totalDonated: 20_000_000, totalSpent: 0, allowance: { remaining: 30_000_000 } });
    await donation;
    assert(!h.context.busy());
    assert.equal(h.economy.length, abandon ? 0 : 1);
    assert.equal(h.context.status()?.treasury.balance ?? null, abandon ? null : 15_000_000);
  }
  for (const kind of ["building", "wall"]) for (const abandon of [false, true]) {
    const h = harness(), pending = deferred();
    Object.assign(h.context, {
      holdingTowerActionsInFlight: new Set(), clanBuildingRequestIds: new Map(),
      holdingTowerModalSession: null,
      modalBody: { querySelector: () => ({ value: "1" }) }, createHoldingTowerOperationId: () => "spend",
      refreshHoldingTower: async () => {}, renderCities() {}, cityRenderSignature: "",
    });
    vm.runInContext(between(source, "async function runHoldingTowerSpendAction(", "function getHoldingTowerComposerTargets(")
      + between(source, "async function runClanTowerBuildingAction(", "function getHoldingTowerClanIdentity("), h.context);
    h.context.applyClanTreasuryStatus("clan-a", h.status(20_000_000, 1));
    h.api.startClanTowerBuilding = h.api.queueHoldingTowerWallUpgrades = () => pending.promise;
    const tower = h.context.holdingTowerSnapshots.get("tower-a");
    const spending = kind === "building"
      ? h.context.runClanTowerBuildingAction(tower, "build", "shop")
      : h.context.runHoldingTowerSpendAction(tower, "upgrade");
    if (abandon) { h.context.state.clanId = "clan-b"; h.context.resetClanTreasuryState(); }
    pending.resolve({ clanId: "clan-a", treasury: h.status(15_000_000, 2).treasury });
    await spending;
    assert.equal(h.context.status()?.treasury.balance ?? null, abandon ? null : 15_000_000,
      kind + " spending did not apply only to the current clan.");
    assert.equal(h.context.holdingTowerActionsInFlight.size, 0, "A completed spend left the Tower busy.");
  }
  // Exercise the actual Firebase listener's path, empty state, realm filters and teardown.
  const firebase = read("firebaseClient.js");
  const events = [], listeners = [];
  const context = vm.createContext({
    RESET_GENERATION: "current-reset", ONLINE_WORLD_ID: "current-world", REALM_SHARD_ID: "shard_0001",
    client: { db: {}, user: { uid: "member-a" }, activeSessionId: "one", activeSessionActivationGeneration: 1,
      modules: { firestore: {
        doc: (_db, ...parts) => parts.join("/"),
        onSnapshot: (ref, next, error) => { const listener = { ref, next, error }; listeners.push(listener); return () => { listener.stopped = true; }; },
      } } },
  });
  vm.runInContext(between(firebase, "  function subscribeScopedSnapshot(", "  function cleanPlayerName(")
    + between(firebase, "  function subscribeClanTreasury(", "  function subscribeClanSocialState("), context);
  const stop = context.subscribeClanTreasury("clan-a", { onTreasury: value => events.push(value) });
  assert.equal(listeners[0].ref, "clans/clan-a/treasury/current-reset");
  const current = { worldId: "current-world", resetGeneration: "current-reset", realmShardId: "shard_0001", balance: 20_000_000, revision: 1 };
  const emit = value => listeners[0].next({ exists: () => !!value, data: () => value });
  emit(null); assert.equal(events.at(-1).balance, 0);
  emit(current); assert.equal(events.at(-1).balance, 20_000_000);
  for (const key of ["worldId", "resetGeneration", "realmShardId"]) {
    emit({ ...current, [key]: "old" }); assert.equal(events.at(-1).balance, 0);
  }
  const count = events.length;
  context.client.activeSessionId = "two"; emit(current); assert.equal(events.length, count);
  context.client.activeSessionId = "one"; stop(); emit(current);
  assert.equal(events.length, count); assert(listeners[0].stopped);
  console.log("Clan Treasury client passed: shared live balance, request/revision ordering, donation response, draft preservation, account/clan/reset cleanup, and scoped Firebase subscription.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
