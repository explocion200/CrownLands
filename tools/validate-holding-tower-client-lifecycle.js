"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const declarations = source.slice(source.indexOf("const holdingTowerSnapshots ="), source.indexOf("let clanGiftCountdownTimer"));
const functions = source.slice(source.indexOf("function beginHoldingTowerModalSession("), source.indexOf("function generateStrongholdSlots("));
const neutralRules = source.slice(source.indexOf("function pendingNeutralCaptureCount("), source.indexOf("function showNeutralCaptureLimitModal("));
const flush = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const listeners = new Map(), classes = new Set(), reads = [], subscriptions = [], warnings = [], errors = [], renders = [];
  const modal = {
    open: false,
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
    addEventListener(type, callback, options) { listeners.set(callback, { type, once: options?.once }); },
    removeEventListener(type, callback) { listeners.delete(callback); },
    showModal() { this.open = true; },
    close() {
      this.open = false;
      for (const [callback, listener] of [...listeners]) {
        if (listener.type !== "close") continue;
        if (listener.once) listeners.delete(callback);
        callback();
      }
    },
  };
  const inputs = {
    "[data-tower-order-target]": { value: "city-1", addEventListener() {} },
    "[data-tower-order-troops]": { value: "25", max: "100", addEventListener() {} },
    "[data-tower-order-form]": { addEventListener() {} },
    "[data-tower-order-status]": { textContent: "" },
    "button[type='submit']": { setAttribute() {} },
  };
  const modalBody = { innerHTML: "", querySelector: selector => inputs[selector] || null, querySelectorAll: () => [] };
  const api = {
    isSignedIn: () => true,
    getHoldingTowerState(payload) {
      const request = { ...deferred(), towerId: payload.towerId };
      reads.push(request);
      return request.promise;
    },
    subscribeHoldingTowerState(towerId, callbacks) {
      const subscription = { towerId, callbacks, active: true };
      subscriptions.push(subscription);
      return () => { subscription.active = false; };
    },
  };
  const context = vm.createContext({
    console: { warn: (...args) => warnings.push(args) }, modal, modalBody, modalTitle: {},
    onlineSessionGeneration: 0, SHOP_ITEMS: [], COMMON_GEAR_BOX_ITEM: { id: "common_gear_box" }, state: { cities: [], clanId: "" }, clanTreasuryStatus: null,
    window: { CrownlandsClanTowerDetailsUi: { mount() {} }, CrownlandsClanTowerBuildings: { normalizeLevels: levels => levels || {} } },
    HOLDING_TOWER_UI: { renderPanel(tower, options) { renders.push({ id: tower.id, ...options }); return `Tower ${tower.id} revision ${tower.revision || 0}`; } },
    getHoldingTowerVisual: id => ({ id, name: id, kind: "holdingTower", artSrc: `${id}.webp` }),
    getHoldingTowerQaScenario: () => "", getOnlineApi: () => api,
    escapeHtml: String, formatNumber: String, renderClanShield: () => "", loadClanTreasuryStatus: async () => null,
    renderClanHeraldry: () => "", getCachedClanPublicSnapshot: () => null,
    showToast() {}, rejectGameAction: message => errors.push(message),
    playerCities: () => [{ id: "city-1", name: "Home", troops: 100 }],
    WORLD_CAMPS: [], isStronghold: city => city?.kind === "stronghold", isClanAllyCity: () => false, isProtectedMainCity: () => false,
    getRewardCampConfig: camp => camp.campType, NEUTRAL_CITY_COUNT_LIMIT: 30, DAILY_NEUTRAL_CAPTURE_LIMIT: 30,
    ownedCityCount: 1, ensureDailyCaptureTracker: () => context.state.daily || {neutralCaptures: 0},
    getOwnedRegularCityCountForDisplay: () => context.ownedCityCount,
    cityById: id => context.state.cities.find(city => city.id === id),
    getArmyTargetById: id => context.state.cities.find(city => city.id === id),
    isHoldingTowerTarget: target => target.kind === "holdingTower", isRewardCampTarget: () => false,
    getCityRegionId: () => "region", createOnlineArmyId: () => "army-1", getTargetRetaliation: () => null,
    applyServerArmyResult() {}, adoptServerArmyMovement() {}, upsertClanRallySnapshot() {}, renderSelectionChangeNow() {},
    renderCities() {}, cityRenderSignature: "",
  });
  vm.runInContext(`${declarations}\n${neutralRules}\n${functions}\nthis.cacheTower = tower => holdingTowerSnapshots.set(tower.id, tower); this.cachedTower = id => holdingTowerSnapshots.get(id);`, context);
  const tower = id => ({ id, name: id, kind: "holdingTower", ownerKind: "neutral", ownStationedTroops: 100 });
  const finish = (request, revision = 1, patch = {}) => request.resolve({ worldActive: true, towers: [{ ...tower(request.towerId), revision, ...patch }] });
  const open = id => context.openHoldingTower(id);
  const replace = () => { modal.close(); modalBody.innerHTML = "Unrelated dialog"; modal.showModal(); };
  const order = (mode = "withdraw") => {
    const own = { ...tower("tower-a"), ownerKind: "clan", clanId: "clan-a", ownershipRevision: 1,
      ownerMember: true, permissions: {withdrawOwn: true, reinforce: true, attackFrom: true, rallyFrom: true} };
    context.cacheTower(own);
    context.showHoldingTowerOrderComposer(own, mode);
    modal.showModal();
    context.updateHoldingTowerOrderAvailability();
    return () => context.submitHoldingTowerOrder(own, mode);
  };
  return { context, api, modal, modalBody, inputs, reads, subscriptions, warnings, errors, listeners, renders, tower, finish, open, replace, order };
}

async function main() {
  for (const count of [29, 30, 31]) {
    const h = harness();
    h.context.ownedCityCount = count;
    h.context.state.cities = [{id: "city-1", name: "NPC City", owner: "neutral"}];
    const send = h.order("attack-from");
    let sent = 0;
    h.api.sendHoldingTowerArmyOrder = async () => { sent++; return {ok: true}; };
    assert.equal(h.inputs["button[type='submit']"].disabled, count >= 30);
    await send();
    assert.equal(sent, count < 30 ? 1 : 0, `Tower NPC attack used the wrong boundary at ${count} cities.`);
    if (count >= 30) {
      assert.match(h.inputs["[data-tower-order-status]"].textContent, /30 or more cities/);
      assert.match(h.errors[0], /30 or more cities/);
      assert.equal(h.inputs["[data-tower-order-troops]"].value, "25");
    } else { h.finish(h.reads[0]); await flush(); }
  }
  for (const reason of ["city-count", "daily", "pending"]) {
    const h = harness();
    h.context.ownedCityCount = 29;
    h.context.state.cities = [{id: "city-1", name: "NPC City", owner: "neutral"}];
    const send = h.order("attack-from");
    assert.equal(h.inputs["button[type='submit']"].disabled, false);
    if (reason === "city-count") h.context.ownedCityCount = 30;
    if (reason === "daily") h.context.state.daily = {neutralCaptures: 30};
    if (reason === "pending") h.context.state.attacks = [{id: "pending", owner: "player", kind: "attack", toId: "city-1", targetOwnerAtLaunch: "neutral"}];
    let sent = 0;
    h.api.sendHoldingTowerArmyOrder = async () => { sent++; return {ok: true}; };
    await send();
    assert.equal(sent, 0, `An open Tower draft bypassed the updated ${reason} limit.`);
    assert.equal(h.inputs["button[type='submit']"].disabled, true);
    assert.match(h.errors[0], reason === "daily" ? /Daily neutral capture limit/ : /30 or more cities/);
    // Player-owned cities and reward camps are not neutral expansion targets.
    h.context.state.cities[0].owner = "enemy";
    h.context.updateHoldingTowerOrderAvailability();
    assert.equal(h.inputs["button[type='submit']"].disabled, false);
    h.context.state.cities = [];
    h.context.WORLD_CAMPS = [{id: "city-1", name: "Camp", owner: "neutral", campType: "gold"}];
    h.context.updateHoldingTowerOrderAvailability();
    assert.equal(h.inputs["button[type='submit']"].disabled, false);
  }
  {
    const firebase = fs.readFileSync(path.join(__dirname, "..", "firebaseClient.js"), "utf8");
    const watches = [];
    const client = { configured: true, db: {}, user: { uid: "ruler" }, modules: { firestore: {
      doc: (_db, ...parts) => ({ path: parts.join("/") }), collection: (_db, ...parts) => ({ path: parts.join("/") }),
      where: (field, op, value) => ({ field, op, value }), query: (ref, ...filters) => ({ ...ref, filters }),
      onSnapshot(ref, next, error) { const watch = { ref, next, error, active: true }; watches.push(watch); return () => { watch.active = false; }; },
    } } };
    const context = vm.createContext({ client, RESET_GENERATION: "current-reset", ONLINE_WORLD_ID: "current-world", REALM_SHARD_ID: "shard_0001" });
    vm.runInContext([
      firebase.slice(firebase.indexOf("  function subscribeScopedSnapshot("), firebase.indexOf("  function cleanPlayerName(")),
      firebase.slice(firebase.indexOf("  function getRealmShardQueryConstraints("), firebase.indexOf("  const GLOBAL_CHAT_RETENTION_MS")),
      firebase.slice(firebase.indexOf("  function subscribeHoldingTowerState("), firebase.indexOf("  function subscribeIsland(")),
    ].join("\n"), context);
    context.subscribeHoldingTowerState("tower-a", {})();
    assert.equal(watches.length, 1, "An outsider subscribed to a private garrison.");
    let updates = 0;
    const stop = context.subscribeHoldingTowerState("tower-a", { garrisonClanId: "clan-a", onGarrison: () => updates++ });
    assert.equal(watches.length, 3);
    const garrison = watches[2];
    assert.equal(garrison.ref.path, "holdingTowers/tower-a/garrison");
    assert.deepEqual(Object.fromEntries(garrison.ref.filters.map(({ field, op, value }) => {
      assert.equal(op, "=="); return [field, value];
    })), { worldId: "current-world", resetGeneration: "current-reset", realmShardId: "shard_0001", clanId: "clan-a" });
    garrison.next(); assert.equal(updates, 1);
    client.user = { uid: "different-ruler" }; garrison.next(); assert.equal(updates, 1, "A stale account listener delivered private updates.");
    client.user = { uid: "ruler" }; stop(); garrison.next(); assert.equal(updates, 1);
    assert(watches.every(watch => !watch.active), "Public or private Tower listener survived cleanup.");
  }

  {
    const h = harness(), shop = deferred(); let applied = 0;
    h.api.getClanTowerShop = () => shop.promise;
    h.context.applyServerEconomyResult = () => { applied++; };
    const opening = h.open("tower-a");
    h.finish(h.reads[0], 1, { ownerMember: true }); await flush();
    h.context.onlineSessionGeneration++; h.replace();
    shop.resolve({ clanShop: { level: 10 } }); await opening;
    assert.equal(applied, 0, "A late Shop response changed another account's economy.");
    assert.equal(h.modalBody.innerHTML, "Unrelated dialog");
    assert.equal(vm.runInContext("holdingTowerSnapshots.size", h.context), 0);
  }

  for (const fails of [false, true]) {
    const h = harness(), opening = h.open("tower-a");
    h.replace();
    if (fails) h.reads[0].reject(new Error("Offline")); else h.finish(h.reads[0]);
    await opening;
    assert.equal(h.modalBody.innerHTML, "Unrelated dialog", "A closed Tower load overwrote another dialog.");
    assert.equal(h.subscriptions.length, 0, "A closed Tower installed a realtime listener.");
    assert.equal(h.listeners.size, 0, "A closed Tower left a close listener behind.");
  }

  {
    const h = harness(), first = h.open("tower-a"), second = h.open("tower-b");
    h.finish(h.reads[1]); await second;
    h.finish(h.reads[0]); await first;
    assert.match(h.modalBody.innerHTML, /^Tower tower-b/);
    assert.equal(h.subscriptions.length, 1);
    assert.equal(h.subscriptions[0].towerId, "tower-b");
    h.modal.close(); assert.equal(h.subscriptions[0].active, false);
    assert.equal(h.listeners.size, 0);
  }

  {
    const h = harness(), opening = h.open("tower-a");
    h.finish(h.reads[0], 1, { ownerMember: true, clanId: "clan-a" }); await opening;
    const initial = h.subscriptions[0];
    assert.equal(initial.callbacks.garrisonClanId, "clan-a");
    initial.callbacks.onGarrison(); h.finish(h.reads[1], 2, { ownerMember: true, clanId: "clan-a" }); await flush();
    assert.match(h.modalBody.innerHTML, /revision 2$/, "A garrison-only update did not refresh the open Tower.");
    initial.callbacks.onError(new Error("Membership removed"), "holdingTowerGarrison");
    h.finish(h.reads[2], 3, { ownerMember: false }); await flush();
    assert.equal(initial.active, false);
    assert.equal(h.subscriptions.at(-1).callbacks.garrisonClanId, "", "Loss of ownership left a private garrison listener active.");
    h.modal.close(); assert(h.subscriptions.every(subscription => !subscription.active));
  }

  {
    const h = harness(), opening = h.open("tower-a");
    const mapRead = h.context.refreshHoldingTower("tower-b");
    h.finish(h.reads[1]); await mapRead;
    h.finish(h.reads[0]); await opening;
    assert.match(h.modalBody.innerHTML, /^Tower tower-a/, "Another Tower's map read canceled the dialog load.");
    assert.equal(h.subscriptions.length, 1);
    const subscription = h.subscriptions[0];
    subscription.callbacks.onTower();
    h.reads[2].reject(new Error("Temporary reconnect")); await flush();
    assert.equal(h.warnings.length, 1, "Realtime refresh rejection was not handled.");
    subscription.callbacks.onTower();
    h.replace(); h.finish(h.reads[3], 2); await flush();
    assert.equal(h.modalBody.innerHTML, "Unrelated dialog");
    assert.equal(subscription.active, false);
    subscription.callbacks.onTower(); assert.equal(h.reads.length, 4, "A closed listener dispatched another read.");
  }

  {
    const h = harness(), opening = h.open("tower-a");
    h.finish(h.reads[0]); await opening;
    const older = h.context.refreshHoldingTower("tower-a"), newer = h.context.refreshHoldingTower("tower-a");
    h.finish(h.reads[2], 3); await newer;
    h.finish(h.reads[1], 2); await older;
    assert.match(h.modalBody.innerHTML, /revision 3$/, "An older same-Tower response replaced a newer snapshot.");
    const action = deferred(); h.api.startHoldingTowerRepair = () => action.promise;
    const spending = h.context.runHoldingTowerSpendAction(h.tower("tower-a"), "repair");
    h.replace(); action.resolve({ tower: { revision: 4 } }); await spending;
    assert.equal(h.modalBody.innerHTML, "Unrelated dialog", "A completed spend reopened a closed Tower.");
  }

  {
    const h = harness(), first = h.open("tower-a");
    h.finish(h.reads[0]); await first;
    const action = deferred(); let sent = 0;
    h.api.startHoldingTowerRepair = () => { sent++; return action.promise; };
    const spending = h.context.runHoldingTowerSpendAction(h.tower("tower-a"), "repair");
    await h.context.runHoldingTowerSpendAction(h.tower("tower-a"), "repair");
    assert.equal(sent, 1, "An in-flight spend could be submitted twice.");
    const second = h.open("tower-b"); h.finish(h.reads[1]); await second;
    assert.equal(h.renders.at(-1).actionBusy, false, "A different Tower's services stayed disabled.");
    const reopened = h.open("tower-a"); h.finish(h.reads[2]); await reopened;
    assert.equal(h.renders.at(-1).actionBusy, true);
    action.resolve({ tower: { revision: 2 } }); await spending;
    assert.equal(h.renders.at(-1).actionBusy, false, "Reopened Tower services stayed disabled after spending completed.");
  }

  {
    const h = harness(), send = h.order(), action = deferred(); let sent = 0;
    h.api.sendHoldingTowerArmyOrder = () => { sent++; return action.promise; };
    const pending = send(); await send();
    assert.equal(sent, 1, "An in-flight order could be submitted twice.");
    action.resolve({ ok: true }); await pending;
    assert.equal(h.modal.open, false, "An accepted order must close its own composer.");
    h.reads[0].reject(new Error("Refresh offline")); await flush();
    assert.deepEqual(h.errors, [], "A failed follow-up read presented an accepted order as a failed send.");
    assert.equal(h.modal.open, false);
    assert.equal(h.warnings.length, 1);
  }

  for (const fails of [false, true]) {
    const h = harness(), send = h.order(), action = deferred();
    h.api.sendHoldingTowerArmyOrder = () => action.promise;
    const pending = send(); h.replace();
    if (fails) action.reject(new Error("Order denied")); else action.resolve({ ok: true });
    await pending;
    if (!fails) { h.finish(h.reads[0]); await flush(); }
    assert.equal(h.modalBody.innerHTML, "Unrelated dialog", "An old order response replaced another dialog.");
    assert.equal(h.modal.open, true, "An old accepted order closed another dialog.");
  }
  for (const patch of [
    { ownerKind: "neutral", clanId: "", ownerMember: false, permissions: {} },
    { clanId: "clan-b", ownerMember: false },
    { ownershipRevision: 3 },
    { ownStationedTroops: 10 },
    { permissions: {} },
  ]) {
    const h = harness(), send = h.order(); let sent = 0;
    h.api.sendHoldingTowerArmyOrder = async () => { sent++; return {ok:true}; };
    vm.runInContext(`holdingTowerSnapshots.set('tower-a', {...holdingTowerSnapshots.get('tower-a'), ...${JSON.stringify(patch)}})`, h.context);
    await send();
    assert.equal(sent, 0, `A stale composer dispatched an order after ${JSON.stringify(patch)}.`);
    assert.equal(h.inputs["[data-tower-order-troops]"].value, "25", "A denied order lost the player's draft.");
  }
  {
    const h = harness(), send = h.order(), action = deferred();
    h.api.sendHoldingTowerArmyOrder = () => action.promise;
    const pending = send();
    h.context.onlineSessionGeneration++;
    h.replace(); action.resolve({ok:true}); await pending;
    assert.equal(h.reads.length, 0, "A previous account's order triggered reads in the new session.");
    assert.equal(h.modalBody.innerHTML, "Unrelated dialog");
  }
  {
    const h = harness(); h.order();
    const older = h.context.refreshHoldingTower('tower-a');
    h.context.applyHoldingTowerMapSnapshot({id:'tower-a',name:'Tower'}, {
      ownerKind: 'clan', clanId: 'clan-b', ownershipRevision: 2, clanName: 'New owners',
    });
    h.finish(h.reads[0], 1, {ownerKind:'clan',clanId:'clan-a',ownerMember:true,permissions:{withdrawOwn:true}});
    assert.equal(await older,null,'A response from before capture was accepted.');
    const current=h.context.cachedTower('tower-a');
    assert.equal(current.clanId,'clan-b');
    assert.equal(current.permissions,undefined,'Capture retained private permissions.');
    assert.equal(current.ownStationedTroops,undefined,'Capture retained the previous garrison count.');
    assert.equal(h.inputs["button[type='submit']"].disabled,true);
    h.context.applyHoldingTowerMapSnapshot({id:'tower-a',name:'Tower'},null);
    assert.equal(h.context.cachedTower('tower-a').clanId,undefined,'Neutralization retained the clan identity.');
  }
  {
    const h = harness(), send = h.order();
    h.api.sendHoldingTowerArmyOrder = async () => {throw new Error('Try again');};
    const draft=h.modalBody.innerHTML;
    await send();
    assert.equal(h.modalBody.innerHTML,draft,'A failed order rebuilt and erased its draft.');
    assert.equal(h.inputs["button[type='submit']"].disabled,false,'A failed order cannot be retried.');
  }
  for (const amount of ['0','-5','1.5','101','not a number']) {
    const h=harness(),send=h.order(); let sent=0;
    h.api.sendHoldingTowerArmyOrder=async()=>{sent++;return {ok:true};};
    h.inputs['[data-tower-order-troops]'].value=amount;
    await send();assert.equal(sent,0,`Invalid troop count ${amount} was sent.`);
  }
  {
    const h=harness();h.order();
    vm.runInContext("selectedTowerMapId='tower-a'",h.context);
    h.context.syncHoldingTowerSelectionSubscription();
    assert.equal(h.subscriptions[0].callbacks.garrisonClanId,'clan-a');
    h.subscriptions[0].callbacks.onGarrison();
    h.finish(h.reads[0],2,{ownerKind:'clan',clanId:'clan-a',ownershipRevision:1,ownerMember:true,ownStationedTroops:10,permissions:{withdrawOwn:true}});
    await flush();
    assert.equal(h.inputs['[data-tower-order-troops]'].max,'10');
    assert.equal(h.inputs["button[type='submit']"].disabled,true,'A garrison update left an oversized draft sendable.');
    vm.runInContext("selectedTowerMapId=''",h.context);h.context.syncHoldingTowerSelectionSubscription();
    assert.equal(h.subscriptions[0].active,false,'Deselecting a tower retained its private subscription.');
  }
  console.log("Validated Tower dialog cancellation, request ordering, realtime cleanup/reconnect, spend completion, and safe order submission/refresh.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
