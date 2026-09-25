"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const declarations = source.slice(source.indexOf("const holdingTowerSnapshots ="), source.indexOf("let clanGiftCountdownTimer"));
const functions = source.slice(source.indexOf("function beginHoldingTowerModalSession("), source.indexOf("function generateStrongholdSlots("));
const neutralRules = source.slice(source.indexOf("function pendingNeutralCaptureCount("), source.indexOf("function showNeutralCaptureLimitModal("));
const mapOrders = source.slice(source.indexOf("function getTroopOrderSourceById("), source.indexOf("function getHoldingTowerQaScenario("))
  + source.slice(source.indexOf("async function selectClanTowerOnMap("), source.indexOf("function updateClanTowerActionWheelLayout("));
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
    classList: { toggle: (name, force) => { const enabled = force === undefined ? !classes.has(name) : Boolean(force); if (enabled) classes.add(name); else classes.delete(name); return enabled; }, contains: name => classes.has(name), add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
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
  const modalBody = { dataset: {}, innerHTML: "", querySelector: selector => inputs[selector] || null, querySelectorAll: () => [] };
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
    onlineSessionGeneration: 0, sendMode: false, selectedSourceId: null, selectedTargetId: null, SHOP_ITEMS: [], COMMON_GEAR_BOX_ITEM: { id: "common_gear_box" }, state: { cities: [], clanId: "" }, clanTreasuryStatus: null,
    window: { CrownlandsClanTowerDetailsUi: { mount() {} }, CrownlandsClanTowerBuildings: { normalizeLevels: levels => levels || {} } },
    HOLDING_TOWER_UI: { renderPanel(tower, options) { renders.push({ id: tower.id, ...options }); return `Tower ${tower.id} revision ${tower.revision || 0}`; } },
    getHoldingTowerVisual: id => ({ id, name: id, kind: "holdingTower", artSrc: `${id}.webp` }),
    getHoldingTowerQaScenario: () => "", getOnlineApi: () => api,
    escapeHtml: String, formatNumber: String, formatMarchesNumber: String, renderClanShield: () => "", loadClanTreasuryStatus: async () => null,
    mountHoldingTowerTroopOrderView() {}, updateHoldingTowerTroopOrderView() {}, getPeaceShieldAttackWarning: () => "",
    getClanTreasuryScope: () => String(context.onlineSessionGeneration), clanTreasuryClanId: "",
    renderClanHeraldry: () => "", getCachedClanPublicSnapshot: () => null, renderTroopOrderLocation: () => "", clearSelection() {},
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
    renderCities() {}, rerenderIslandSwitcherModalIfOpen() {}, cityRenderSignature: "",
  });
  vm.runInContext(`${declarations}\n${neutralRules}\n${mapOrders}\n${functions}\nthis.cacheTower = tower => holdingTowerSnapshots.set(tower.id, tower); this.cachedTower = id => holdingTowerSnapshots.get(id);`, context);
  const tower = id => ({ id, name: id, kind: "holdingTower", ownerKind: "neutral", ownStationedTroops: 100 });
  const finish = (request, revision = 1, patch = {}) => request.resolve({ worldActive: true, towers: [{ ...tower(request.towerId), revision, ...patch }] });
  const open = id => context.openHoldingTower(id);
  const replace = () => { modal.close(); modalBody.innerHTML = "Unrelated dialog"; modal.showModal(); };
  const order = (mode = "withdraw") => {
    const own = { ...tower("tower-a"), ownerKind: "clan", clanId: "clan-a", ownershipRevision: 1,
      ownerMember: true, permissions: {withdrawOwn: true, reinforce: true, attackFrom: true, rallyFrom: true} };
    context.cacheTower(own);
    context.showHoldingTowerOrderComposer(own, mode, context.getHoldingTowerComposerTargets(mode, own)[0]);
    modal.showModal();
    context.updateHoldingTowerOrderAvailability();
    return () => context.submitHoldingTowerOrder(own, mode);
  };
  return { context, api, modal, modalBody, inputs, reads, subscriptions, warnings, errors, listeners, renders, tower, finish, open, replace, order };
}

async function main() {
  {
    const h = harness(); let shopReads = 0;
    h.api.getClanTowerShop = () => { shopReads++; return Promise.resolve({clanShop:{}}); };
    const first = h.context.selectClanTowerOnMap('tower-a');
    const second = h.context.selectClanTowerOnMap('tower-a');
    assert.equal(h.reads.length, 1, 'Repeated selection duplicated a pending Tower read');
    h.finish(h.reads[0], 1, {ownerMember:true,clanId:'clan-a',ownershipRevision:1,permissions:{inspect:true}});
    await Promise.all([first, second]);
    assert.equal(shopReads, 0, 'Map selection waited for unrelated Shop data');
    const subscription = h.subscriptions[0];
    subscription.callbacks.onGarrison(); subscription.callbacks.onGarrison();
    assert.equal(h.reads.length, 2, 'Garrison notifications duplicated a pending map read');
    h.finish(h.reads[1], 2, {ownerMember:true,clanId:'clan-a',ownershipRevision:1}); await flush();
    assert.equal(h.context.cachedTower('tower-a').revision, 2);
    assert.equal(h.reads.length, 3, 'A garrison change during a read was dropped');
    h.finish(h.reads[2], 3, {ownerMember:true,clanId:'clan-a',ownershipRevision:1}); await flush();
    assert.equal(h.context.cachedTower('tower-a').revision, 3);
    assert.equal(h.reads.length, 3, 'Garrison notifications caused an unbounded refresh loop');
    assert.equal(shopReads, 0);
    const failed = h.context.selectClanTowerOnMap('tower-b');
    h.reads[3].reject(new Error('Offline')); await failed;
    const retry = h.context.selectClanTowerOnMap('tower-b');
    assert.equal(h.reads.length, 5, 'Failed selection could not be retried');
    h.finish(h.reads[4]); await retry;
  }
  for (const change of ['account','clan','ownership']) {
    const h = harness(), old = h.context.selectClanTowerOnMap('tower-a');
    if (change === 'account') h.context.onlineSessionGeneration++;
    if (change === 'clan') h.context.state.clanId = 'new-clan';
    if (change === 'ownership') {
      h.context.applyHoldingTowerMapSnapshot({id:'tower-a'}, {ownerKind:'clan',clanId:'rivals',ownershipRevision:2});
    }
    const current = h.context.selectClanTowerOnMap('tower-a');
    assert.equal(h.reads.length, 2, `A changed ${change} reused an obsolete map read`);
    h.finish(h.reads[1], 2, {ownerKind:'clan',clanId:'rivals',ownershipRevision:2,permissions:{scout:true}}); await current;
    h.finish(h.reads[0], 1, {ownerMember:true,permissions:{withdrawOwn:true}}); await old;
    assert.equal(h.context.cachedTower('tower-a').revision, 2, `Late ${change} response restored stale permissions`);
  }
  for (const patch of [{ownerMember:false}, {clanId:'other'}, {ownershipRevision:2}]) {
    const h=harness();h.order();h.modal.close();
    const own=h.context.cachedTower('tower-a');
    h.context.beginHoldingTowerSendMode(own);
    assert.equal(h.context.sendMode,true);
    assert.equal(h.modal.open,false,'Send must wait for a map destination.');
    assert.equal(h.context.getTroopOrderSourceById(own.id).troops,100,'Send used the whole clan garrison.');
    h.context.cacheTower({...own,...patch});
    assert.equal(h.context.getTroopOrderSourceById(own.id),null,'A captured Tower or removed member retained a usable Send origin.');
  }
  {
    const h=harness();h.order();h.modal.close();
    const own=h.context.cachedTower('tower-a');h.context.beginHoldingTowerSendMode(own);
    h.context.onlineSessionGeneration++;
    assert.equal(h.context.getTroopOrderSourceById(own.id),null,'A previous account retained its Tower Send origin.');
  }
  for(const cancel of [false,true]) {
    const h=harness();h.context.state.cities=[{id:'city-1',name:'Home',owner:'player',troops:100}];
    h.context.sendMode=true;h.context.selectedSourceId='city-1';
    const opening=h.context.selectClanTowerOnMap('tower-a');
    if(cancel)h.context.selectedSourceId=null;
    h.finish(h.reads[0],1,{ownerMember:true,clanId:'clan-a',ownershipRevision:1,permissions:{reinforce:true}});
    await opening;
    assert.equal(h.modal.open,!cancel,'A canceled city-to-Tower selection reopened its order.');
    if(!cancel){
      assert(h.modalBody.innerHTML.includes('data-tower-order-mode="reinforce"'));
      assert(h.modalBody.innerHTML.includes('type="range"'));
      assert(!h.modalBody.innerHTML.includes('data-tower-send-mode'));
    }
  }
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

    const identities = [], towers = [];
    const stopOwner = context.subscribeHoldingTowerState('tower-a', {
      onTower: tower => towers.push(tower), onClan: (clan, clanId) => identities.push({clan, clanId}),
    });
    const publicTower = watches.at(-1);
    const scope = {resetGeneration:'current-reset',worldId:'current-world',realmShardId:'shard_0001'};
    const emit = (watch, id, data) => watch.next({id,exists:()=>Boolean(data),data:()=>data});
    emit(publicTower,'tower-a',{...scope,ownerKind:'clan',clanId:'clan-a'});
    const ownerA = watches.at(-1);
    assert.equal(ownerA.ref.path,'clans/clan-a','Tower identity did not follow its actual owner.');
    assert.equal(identities.at(-1).clan,null,'A capture-time flag remained while the live owner loaded.');
    const flag = {version:2,charge:'wolf',primary:'#225544'};
    emit(ownerA,'clan-a',{...scope,status:'active',name:'Owner A',shield:flag});
    assert.deepEqual(identities.at(-1).clan.shield,flag);
    emit(ownerA,'clan-a',{...scope,status:'active',name:'Renamed A',shield:{...flag,charge:'eagle'}});
    assert.equal(identities.at(-1).clan.shield.charge,'eagle','A saved clan flag edit was not delivered.');
    for(const invalid of [{realmShardId:'other'},{resetGeneration:'old'},{worldId:'old'},{status:'disbanded'}]) {
      emit(ownerA,'clan-a',{...scope,status:'active',shield:flag,...invalid});
      assert.equal(identities.at(-1).clan,null,'An inactive or other-realm clan supplied the Tower flag.');
    }
    emit(publicTower,'tower-a',{...scope,ownerKind:'clan',clanId:'clan-b'});
    const ownerB = watches.at(-1), count = identities.length;
    assert.equal(ownerB.ref.path,'clans/clan-b');
    assert.equal(ownerA.active,false,'Capture retained the previous owner listener.');
    emit(ownerA,'clan-a',{...scope,status:'active',shield:flag});
    assert.equal(identities.length,count,'A late former-owner callback replaced the current flag.');
    emit(ownerB,'clan-b',{...scope,status:'active',shield:{...flag,charge:'stag'}});
    assert.equal(identities.at(-1).clan.shield.charge,'stag');
    emit(publicTower,'tower-a',{...scope,ownerKind:'neutral',clanId:''});
    assert.equal(ownerB.active,false,'Neutralization retained a clan listener.');
    const neutralCount = identities.length;
    emit(ownerB,'clan-b',{...scope,status:'active',shield:flag});
    assert.equal(identities.length,neutralCount);
    emit(publicTower,'tower-a',{...scope,ownerKind:'clan',clanId:'clan-a'});
    const rejoined = watches.at(-1), signedInCount = identities.length;
    client.user = {uid:'another-account'};
    emit(rejoined,'clan-a',{...scope,status:'active',shield:flag});
    assert.equal(identities.length,signedInCount,'A previous account supplied a clan flag.');
    client.user = {uid:'ruler'};
    stopOwner();
    emit(rejoined,'clan-a',{...scope,status:'active',shield:flag});
    assert.equal(identities.length,signedInCount);
    assert(watches.every(watch=>!watch.active),'A live owner flag listener survived cleanup.');
    assert.equal(towers.at(-1).clanId,'clan-a');
  }

  {
    const h=harness();
    h.context.getCachedClanPublicSnapshot=()=>({name:'Stale cached name',shield:{charge:'old-cache'}});
    h.context.renderClanHeraldry=emblem=>JSON.stringify(emblem);
    const opening=h.open('tower-a');
    h.finish(h.reads[0],1,{ownerKind:'clan',clanId:'clan-a',clanName:'Captured name',clanEmblem:{charge:'old-capture'}});
    await opening;
    const saved={id:'clan-a',name:'Actual owner',shield:{version:2,charge:'wolf'},banner:{charge:'old-legacy'}};
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',saved);
    assert.equal(h.context.getHoldingTowerClanIdentity(h.context.cachedTower('tower-a')).emblem,saved.shield);
    assert.equal(h.renders.at(-1).clanShieldHtml,JSON.stringify(saved.shield),'Open Tower UI did not use the actual owner flag.');
    const renderCount=h.renders.length;
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',{...saved,totalKingPower:999});
    assert.equal(h.renders.length,renderCount,'Unrelated clan activity rebuilt the Tower window.');
    saved.shield={version:2,charge:'eagle'};
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',saved);
    assert.equal(h.renders.at(-1).clanShieldHtml,JSON.stringify(saved.shield),'Open Tower UI did not refresh a saved flag edit.');
    const refresh=h.context.refreshHoldingTower('tower-a');
    h.finish(h.reads.at(-1),2,{ownerKind:'clan',clanId:'clan-a',clanEmblem:{charge:'old-capture'}});
    await refresh;
    assert.equal(h.renders.at(-1).clanShieldHtml,JSON.stringify(saved.shield),'A Tower read restored its capture-time flag.');
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',null);
    assert.equal(h.renders.at(-1).clanShieldHtml,'','An unavailable clan invented a default flag.');
    const legacy={shape:'round',primary:'#225544',charge:'lion'};
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',{id:'clan-a',name:'Legacy owner',banner:legacy});
    assert.equal(h.renders.at(-1).clanShieldHtml,JSON.stringify(legacy),'A legacy owning clan lost its saved banner.');
    h.modal.close();
    h.context.getCachedClanPublicSnapshot=()=>null;
    h.context.applyHoldingTowerMapSnapshot({id:'tower-a'}, {ownerKind:'clan',clanId:'clan-b',clanEmblem:{charge:'new-capture'}});
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',saved);
    assert.equal(h.context.getHoldingTowerClanIdentity(h.context.cachedTower('tower-a')).emblem.charge,'new-capture');
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-b',{id:'clan-a',shield:{charge:'wrong-owner'}});
    assert.equal(h.context.getHoldingTowerClanIdentity(h.context.cachedTower('tower-a')).emblem.charge,'new-capture');
    h.context.applyHoldingTowerMapSnapshot({id:'tower-a'},null);
    assert.equal(h.context.getHoldingTowerClanIdentity(h.context.cachedTower('tower-a')),null);
    assert.equal(vm.runInContext('holdingTowerClanIdentities.size',h.context),0);
    h.context.cacheTower({id:'tower-a',ownerKind:'clan',clanId:'clan-a'});
    h.context.applyHoldingTowerClanSnapshot('tower-a','clan-a',saved);
    vm.runInContext("holdingTowerMapSubscriptionsKey='old-account'",h.context);
    h.context.ensureHoldingTowerMapSubscriptions();
    assert.equal(vm.runInContext('holdingTowerClanIdentities.size',h.context),0,'Changing account retained Tower clan identities.');
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
  {
    const h=harness(),send=h.order();
    h.api.sendHoldingTowerArmyOrder=async()=>({ok:false,message:'Order blocked'});
    const draft=h.modalBody.innerHTML;
    await send();
    assert.equal(h.modal.open,true,'A server-denied order closed its draft.');
    assert.equal(h.modalBody.innerHTML,draft);
    assert.deepEqual(h.errors,['Order blocked']);
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
