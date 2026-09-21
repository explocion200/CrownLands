"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const declarations = source.slice(source.indexOf("const holdingTowerSnapshots ="), source.indexOf("let clanGiftCountdownTimer"));
const functions = source.slice(source.indexOf("function beginHoldingTowerModalSession("), source.indexOf("function generateStrongholdSlots("));
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
    "[data-tower-order-troops]": { value: "25" },
    "[data-tower-order-form]": { addEventListener() {} },
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
    state: { cities: [], clanId: "" }, clanTreasuryStatus: null,
    window: { CrownlandsClanTowerDetailsUi: { mount() {} } },
    HOLDING_TOWER_UI: { renderPanel(tower, options) { renders.push({ id: tower.id, ...options }); return `Tower ${tower.id} revision ${tower.revision || 0}`; } },
    getHoldingTowerVisual: id => ({ id, name: id, kind: "holdingTower", artSrc: `${id}.webp` }),
    getHoldingTowerQaScenario: () => "", getOnlineApi: () => api,
    escapeHtml: String, formatNumber: String, renderClanShield: () => "", loadClanTreasuryStatus: async () => null,
    showToast() {}, rejectGameAction: message => errors.push(message),
    playerCities: () => [{ id: "city-1", name: "Home", troops: 100 }],
    isHoldingTowerTarget: target => target.kind === "holdingTower", isRewardCampTarget: () => false,
    getCityRegionId: () => "region", createOnlineArmyId: () => "army-1", getTargetRetaliation: () => null,
    applyServerArmyResult() {}, adoptServerArmyMovement() {}, upsertClanRallySnapshot() {}, renderSelectionChangeNow() {},
  });
  vm.runInContext(`${declarations}\n${functions}`, context);
  const tower = id => ({ id, name: id, kind: "holdingTower", ownerKind: "neutral", ownStationedTroops: 100 });
  const finish = (request, revision = 1) => request.resolve({ worldActive: true, towers: [{ ...tower(request.towerId), revision }] });
  const open = id => context.openHoldingTower(id);
  const replace = () => { modal.close(); modalBody.innerHTML = "Unrelated dialog"; modal.showModal(); };
  const order = () => {
    context.showHoldingTowerOrderComposer(tower("tower-a"), "withdraw");
    modal.showModal();
    return () => context.submitHoldingTowerOrder(tower("tower-a"), "withdraw", [{ id: "city-1", name: "Home" }]);
  };
  return { context, api, modal, modalBody, reads, subscriptions, warnings, errors, listeners, renders, tower, finish, open, replace, order };
}

async function main() {
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
  console.log("Validated Tower dialog cancellation, request ordering, realtime cleanup/reconnect, spend completion, and safe order submission/refresh.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
