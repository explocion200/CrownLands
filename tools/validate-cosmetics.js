"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const C = require("../functions/cosmetics");
const flags = require("../functions/playerFlagConfig");
const october = Date.UTC(2026, 9, 1), november = Date.UTC(2026, 10, 1);
const state = C.normalize({ crowns: 1500 });
assert.equal(C.ITEMS.length, 7);
assert.equal(C.quote(C.BUNDLE.id, state, october).price, 1200);
const bought = C.purchase(state, { offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, october);
assert.equal(bought.state.crowns, 900);
assert.equal(C.quote(C.BUNDLE.id, bought.state, october).price, 720);
assert.deepEqual(bought.state.equipped, { city: "", troops: "", border: "" }, "Purchase must never auto-equip");
assert.throws(() => C.purchase(state, { offerId: "halloween_city", expectedPrice: 0, catalogVersion: 1 }, october), /offer changed/);
assert.throws(() => C.purchase(state, { offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, november), /October/);
assert.throws(() => C.purchase(C.normalize(), { offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, october), /Not enough/);
assert.throws(() => C.purchase(bought.state, { offerId: "halloween_city", expectedPrice: 0, catalogVersion: 1 }, october), /already own/);
assert.equal(C.availability(october - 1).onSale, false);
assert.equal(C.availability(november - 1).onSale, true);
assert.equal(C.availability(november).startsAtMs, Date.UTC(2027, 9, 1));
assert.equal(C.availability(november).endsAtMs, Date.UTC(2027, 10, 1));
assert.throws(() => C.equip(state, "city", "halloween_city"), /do not own/);
assert.throws(() => C.equip(bought.state, "troops", "halloween_city"), /do not own/);
const equipped = C.equip(bought.state, "city", "halloween_city");
assert.equal(equipped.equipped.city, "halloween_city");
assert.equal(C.equip(equipped, "city", "").equipped.city, "");
assert.equal(C.normalize(equipped).equipped.city, "halloween_city", "Season-independent normalization must retain equipment");
let wallet = C.normalize();
for (let i = 0; i < 20; i++) wallet = C.collectCrown(wallet, october);
assert.equal(wallet.crowns, 20);
assert.equal(C.countToday(wallet, october + 86399999), 20);
assert.throws(() => C.collectCrown(wallet, october), /limit/);
wallet = C.collectCrown(wallet, october + 86400000);
assert.equal(wallet.crowns, 21); assert.equal(wallet.crownPickups, 1);
const counts = { gold: 0, troops: 0, crowns: 0 }, seen = []; let preferred = "gold";
for (let i = 0; i < 80; i++) {
  const type = C.availableType(preferred, type => C.PICKUP_CAPS[type] - counts[type]);
  assert(type); counts[type]++; seen.push(type); preferred = C.nextType(type);
}
assert.deepEqual(seen.slice(0,6), ["gold","troops","crowns","gold","troops","crowns"]);
assert.deepEqual(counts, { gold: 30, troops: 30, crowns: 20 });
assert.equal(C.availableType(preferred, type => C.PICKUP_CAPS[type] - counts[type]), "");
assert(!seen.slice(60).includes("crowns"));
assert.throws(() => C.normalize({ version: 99 }), /Update the game/);
for (const item of C.ITEMS.filter(item => item.category === "flag")) {
  assert.equal(flags.normalizeFlag({ symbol: item.symbol }, "owner").symbol, item.symbol);
  assert(!flags.SELECTABLE_SYMBOL_KEYS.includes(item.symbol), "Premium symbols cannot appear in random starter flags");
}
const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
assert(index.includes('cosmeticService.read(transaction, uid)'));
assert(!index.slice(index.indexOf("exports.claimDailyMissionReward"),index.indexOf("exports.applyPvpKillEvent")).includes("COSMETICS"), "Daily quests must not award Crowns");
// Execute the actual server tracker functions, not an independent model of the caps.
function extract(name) { const start=index.indexOf(`function ${name}(`); const end=index.indexOf("\nfunction ",start+1); return index.slice(start,end); }
const context = { COSMETICS:C, HARVEST_BONUS_DAILY_LIMIT:80, HARVEST_BONUS_DAILY_GOLD_LIMIT:30, HARVEST_BONUS_DAILY_TROOP_LIMIT:30, DAILY_NEUTRAL_CAPTURE_LIMIT:10,
  clampInt:(value,min,max)=>Math.min(max,Math.max(min,Math.floor(Number(value)||0))), getCurrentDateKey:date=>date.toISOString().slice(0,10) };
vm.createContext(context);
for (const name of ["normalizeHarvestBonusType","normalizeDaily","mergeHarvestDailyTrackers","getHarvestBonusRemaining","incrementHarvestDailyTracker"]) vm.runInContext(extract(name),context);
const today=new Date().toISOString().slice(0,10);
const merged=context.mergeHarvestDailyTrackers({date:today,harvestedCrownBonuses:10},{date:today,harvestedCrownBonuses:0});
assert.equal(merged.harvestedCrownBonuses,10,"Client counters cannot restore the Crown allowance");
assert.equal(context.getHarvestBonusRemaining("crowns",merged),10);
assert.equal(context.incrementHarvestDailyTracker("crowns",merged).harvestedCrownBonuses,11);
const transportContext = { globalThis: {} };
vm.createContext(transportContext);
vm.runInContext(fs.readFileSync(path.join(root,"cosmetics-client.js"),"utf8"),transportContext);
const calls=[];
const api=transportContext.globalThis.CrownlandsCosmeticsClient.create({client:{},callServerFunction:(name,payload)=>{calls.push({name,payload});return Promise.resolve({});},subscribeScopedSnapshot:()=>()=>{}});
for(const name of ["reserveHarvestBonusSpawn","collectHarvestBonus","getCosmeticsState","purchaseCosmetic","equipCosmetic"]) {
  assert.equal(typeof api[name],"function",`${name} must remain exported by the shared transport`);
  api[name]({test:true});
}
assert.deepEqual(calls.map(call=>call.name),["reserveHarvestBonusSpawn","collectHarvestBonus","getCosmeticsState","purchaseCosmetic","equipCosmetic"]);
console.log("Cosmetics passed: prices, bundles, seasonal boundaries, ownership, persistence, 80-pickup rotation, daily caps, flag compatibility and no quest grants.");
