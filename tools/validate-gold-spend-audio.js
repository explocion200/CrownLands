"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const game = read("game.js"), economy = read("instant-economy-actions.js"), gear = read("common-gear-ui.js");
function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  return (source.slice(start - 6, start) === "async " ? "async " : "") + source.slice(start, source.indexOf("\n}", start) + 2);
}
const spendSoundSource = extract(game, "playGoldSpendSound");
module.exports = { spendSoundSource };

function fixture() {
  const sounds = [], applied = [];
  const context = vm.createContext({
    console: { warn() {} }, scope: "session-one", state: { gold: 1000 },
    getOnlineSessionRequestScope: () => context.scope,
    playGameSound: (id, options) => { sounds.push({ id, options }); return true; },
    applyServerEconomyResult: result => applied.push(result),
    formatNumber: String, addLog() {}, showToast() {}, saveGame() {},
  });
  vm.runInContext(spendSoundSource, context);
  return { context, sounds, applied };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function run() {
  const f = fixture();
  for (const amount of [0, -1, undefined, null, NaN, Infinity, "not-gold"]) assert.equal(f.context.playGoldSpendSound(amount), false);
  for (const result of [{ duplicate: true }, { replayed: true }, { ok: false }]) assert.equal(f.context.playGoldSpendSound(100, result), false);
  assert.equal(f.context.playGoldSpendSound(100, {}, "old-session"), false);
  assert.equal(f.sounds.length, 0);
  assert.equal(f.context.playGoldSpendSound(100, { ok: true }, f.context.scope), true);
  assert.equal(f.sounds[0].id, "gold_spend");
  assert.equal(f.sounds[0].options.allowCrossMap, true, "A confirmed payment must stay audible after moving to another map");
  f.context.playGameSound = () => { throw Error("audio device failed"); };
  assert.equal(f.context.playGoldSpendSound(100), false, "Audio failure must not reject an accepted payment");
  f.context.playGameSound = () => false;
  assert.equal(f.context.playGoldSpendSound(100), false, "Muted effects must not force playback");

  for (const scenario of ["success", "rejected", "stale", "duplicate", "replayed", "free"]) {
    const f = fixture(), response = deferred();
    let current = true;
    Object.assign(f.context, {
      getShopItemById: () => ({ id: "war_drums", label: "War Drums" }),
      supportsInstantEconomyActionBatching: () => true,
      getShopItemPrice: () => 100,
      getOnlineApi: () => ({ purchaseShopItem: () => response.promise }),
      isInstantEconomyActionCurrent: () => current,
      selectedInventoryItemId: "", selectedInventoryEntryKey: "",
      queueInstantEconomyRemainder() { throw Error("Unexpected extra batch"); },
    });
    vm.runInContext(extract(economy, "executeInstantShopPurchase"), f.context);
    const pending = f.context.executeInstantShopPurchase({ itemId: "war_drums", quantity: 3, unitCost: 100, reservedGold: 300 });
    assert.equal(f.sounds.length, 0, "A queued purchase must not sound before server confirmation");
    if (scenario === "stale") current = false;
    if (scenario === "rejected") response.reject(Error("Not enough Gold"));
    else response.resolve({ purchasedQuantity: 3, spentGold: scenario === "free" ? 0 : 300, [scenario]: true });
    if (scenario === "rejected") await assert.rejects(pending); else await pending;
    assert.equal(f.sounds.length, scenario === "success" ? 1 : 0, `Shop ${scenario}: wrong number of payment cues`);
  }

  for (const scenario of ["success", "rejected", "stale", "duplicate", "replayed", "free"]) {
    const f = fixture(), response = deferred();
    Object.assign(f.context, {
      getOnlineApi: () => ({ purchaseCommonGearBox: () => response.promise }),
      getCommonGearBoxShopPrice: () => 100,
      modalBody: { querySelector: () => null }, modal: { open: false },
    });
    vm.runInContext(extract(gear, "buyCommonGearBox"), f.context);
    const pending = f.context.buyCommonGearBox();
    assert.equal(f.sounds.length, 0);
    if (scenario === "stale") f.context.scope = "session-two";
    if (scenario === "rejected") response.reject(Error("Purchase denied"));
    else response.resolve({ spentGold: scenario === "free" ? 0 : 100, [scenario]: true });
    await pending;
    assert.equal(f.sounds.length, scenario === "success" ? 1 : 0, `Gear Box ${scenario}: wrong number of payment cues`);
  }

  for (const scenario of ["success", "rejected", "stale", "replayed", "equip", "unequip"]) {
    const f = fixture(), response = deferred();
    f.context.state.gear = { instances: { target: { gearKey: "sword", level: 1 } } };
    Object.assign(f.context, {
      COMMON_GEAR: { getDefinition: () => ({ gearName: "Sword", rarity: "common" }) },
      commonGearActionInFlight: false, commonGearActiveAction: null,
      commonGearMergeConfirmOpen: false, commonGearViewRequestId: 0,
      commonGearUpgradeRequests: new Map(), getCommonGearActionScope: () => f.context.scope,
      isCommonGearBuildingOpen: () => false,
      createDailyMissionRequestId: () => "gear-payment",
      getCommonGearUpgradePreview: () => ({ upgradeGold: 100 }),
      getOnlineApi: () => ({ upgradeCommonGear: () => response.promise, equipCommonGear: () => response.promise, unequipCommonGear: () => response.promise }),
    });
    vm.runInContext(extract(gear, "runCommonGearAction"), f.context);
    const action = ["equip", "unequip"].includes(scenario) ? scenario : "merge";
    const pending = f.context.runCommonGearAction("barracks", action, "target");
    assert.equal(f.sounds.length, 0);
    if (scenario === "stale") f.context.scope = "session-two";
    if (scenario === "rejected") response.reject(Error("Upgrade denied"));
    else response.resolve({ spentGold: 100, [scenario]: true });
    await pending;
    assert.equal(f.sounds.length, scenario === "success" ? 1 : 0, `Gear ${scenario}: wrong number of payment cues`);
    assert.equal(f.context.commonGearActionInFlight, false);
  }

  // Guard the remaining integration points: receipt amounts, success boundaries,
  // and free actions must not drift into balance-difference or click-based audio.
  for (const [source, name, receipt] of [
    [game, "donateClanTreasuryFromPanel", "result?.donated"],
    [game, "runHoldingTowerSpendAction", "result?.cost"],
    [game, "runClanTowerBuildingAction", 'kind === "build" ? result?.cost : result?.spentGold'],
    [game, "toggleScoutNearby", "result?.cost"],
    [game, "toggleRegroup", "result?.cost"],
    [economy, "executeInstantCityUpgrade", "result?.spentGold"],
    [gear, "runCommonGearAction", "result?.spentGold"],
  ]) {
    const body = extract(source, name);
    assert(body.includes(`playGoldSpendSound(${receipt}, result`), `${name} must use the confirmed payment amount`);
    assert(body.indexOf("playGoldSpendSound(") > body.indexOf("await "), `${name} played payment audio before confirmation`);
  }
  for (const name of ["resetSkills", "runClanSocialAction", "applyServerEconomyResult"]) {
    assert(!extract(game, name).includes("playGoldSpendSound("), `${name} must not infer spending from free gifts, refunds or balance synchronization`);
  }
  assert(extract(game, "toggleScoutNearby").includes("else playGoldSpendSound(SCOUT_NEARBY_COST)"), "Refunded local scouting must remain silent");
  const regroup = extract(game, "toggleRegroup");
  assert(regroup.indexOf("playGoldSpendSound(REGROUP_COST)") > regroup.indexOf("state.gold += REGROUP_COST"), "Local Regroup must charge successfully before sounding");
  for (const [source, name] of [[economy, "buyShopItem"], [economy, "upgradeCity"], [game, "recruit"], [game, "applySavedSkillPreset"], [game, "handleClanSubmit"]]) {
    assert(extract(source, name).includes("playGoldSpendSound("), `${name} is missing its confirmed spending cue`);
  }
  console.log("Validated Gold spending audio: confirmed batches, Gear purchases, retries, stale sessions, free actions, independent controls and payment-safe audio failures.");
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
