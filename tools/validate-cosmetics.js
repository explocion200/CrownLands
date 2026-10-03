"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const C = require("../functions/cosmetics");
const flags = require("../functions/playerFlagConfig");
const october = Date.UTC(2026, 9, 1), november = Date.UTC(2026, 10, 1);
const state = C.normalize({ crowns: 1500 });
assert.deepEqual(C.ITEMS.map(item => item.id), ["halloween_city"]);
assert.deepEqual(C.OFFERS.map(item => item.id), ["halloween_city"]);
assert.deepEqual(Object.keys(C.CATEGORIES), ["city"]);
const bought = C.purchase(state, { offerId: "halloween_city", expectedPrice: 600, catalogVersion: 1 }, october);
assert.equal(bought.state.crowns, 900);
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
assert.throws(() => C.equip(bought.state, "troops", "halloween_city"), /Only city skins/);
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
const retired = { halloween_troops: true, halloween_border: true, halloween_pumpkin: true, halloween_bat: true, halloween_skull: true, halloween_raven: true };
const legacy = C.normalize({ crowns: 999, owned: { ...retired, halloween_city: true }, equipped: { city: 'halloween_city', troops: 'halloween_troops', border: 'halloween_border' }, revision: 17 });
assert.deepEqual(legacy.owned, { ...retired, halloween_city: true }, 'Retirement must preserve historical ownership');
assert.equal(legacy.crowns, 999); assert.equal(legacy.revision, 17);
assert.deepEqual(legacy.equipped, { city: 'halloween_city', troops: '', border: '' });
for (const id of [...Object.keys(retired), 'halloween_collection']) assert.throws(() => C.quote(id, legacy, october), /catalog/);
for (const category of ['troops', 'border', 'flag']) assert.throws(() => C.equip(legacy, category, ''), /Only city skins/);
for (const name of ['pumpkin', 'bat', 'skull', 'raven']) {
 const symbol = 'halloween-' + name;
 assert.equal(flags.normalizeFlag({ symbol }, 'owner').symbol, symbol, 'Saved flag identities remain compatible');
 assert(!flags.SELECTABLE_SYMBOL_KEYS.includes(symbol));
}
const root = path.resolve(__dirname, "..");
const citySkin = C.item("halloween_city");
assert.equal(citySkin.placeholder, false, "Approved city art must replace the placeholder");
assert.deepEqual(Object.keys(citySkin.assets), ["1", "2", "3", "4", "5"]);
const crypto = require("node:crypto");
const provenance = JSON.parse(fs.readFileSync(path.join(root, "docs/visual-qa/halloween-city-skin/assets.json"), "utf8"));
let skinBytes = 0;
for (const entry of provenance) {
  assert.equal(citySkin.assets[entry.stage], entry.path);
  const bytes = fs.readFileSync(path.join(root, entry.path)); skinBytes += bytes.length;
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.sha256);
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.toString("ascii", 12, 16), "VP8X");
  assert(bytes[20] & 0x10, "City sprites need transparent alpha");
  assert.equal(bytes.readUIntLE(24, 3) + 1, 512); assert.equal(bytes.readUIntLE(27, 3) + 1, 512);
}
assert.equal(provenance.length, 5); assert(skinBytes < 512 * 1024, "Five city skins exceed their lazy-loaded 512 KiB budget");
assert.equal(JSON.parse(fs.readFileSync(path.join(root, "docs/visual-qa/halloween-city-skin/prompts.json"), "utf8")).prompts.length, 5);
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
console.log("Cosmetics passed: city-only catalog, retired purchase/equip rejection, seasonal boundaries, ownership, persistence, 80-pickup rotation, daily caps, saved flag compatibility and no quest grants.");
