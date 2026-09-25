"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console });
context.window = context;
for (const file of ["clan-tower-details-ui.js", "camp-details-ui.js", "holding-tower-ui.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
}
const towerUi = context.CrownlandsClanTowerDetailsUi;
const campUi = context.CrownlandsCampDetailsUi;
const owner = context.CROWNLANDS_HOLDING_TOWER_UI.createQaSnapshot({ id:"qa", name:"Tower", artSrc:"assets/test.webp" }, "owner");
const money = { treasuryBalance:24_000_000, clanShieldHtml:'<svg data-test-clan-flag></svg>' };
const html = towerUi.render(owner, money);
assert.match(html, /Minimum force<\/small><strong>3 members/);
assert.match(html, /at least three eligible clan members in a rally, including the leader/);
assert.equal((html.match(/data-test-clan-flag/g) || []).length, 2, "Clan flag remains beside title and controlling clan.");
assert.equal((html.match(/data-tower-player-flag=/g) || []).length, 3);
assert(!/data-tower-action="(?:reinforce|withdraw|attack-from|rally-from|rally-attack)"/.test(html), "Details must not contain troop commands.");
assert.deepEqual(Array.from(towerUi.mapActions(owner), a=>a.action), ["info","store","send"]);
assert.deepEqual(Array.from(towerUi.mapActions({...owner,worldActive:false}), a=>a.action), ["info"]);
assert.deepEqual(Array.from(towerUi.mapActions({...owner,buildings:{shop:0},permissions:{inspect:true}}), a=>[a.action,Boolean(a.disabled)]), [["info",false],["store",true],["send",true]]);
const emptyActions=towerUi.mapActions({...owner,ownStationedTroops:0,permissions:{inspect:true,reinforce:true}});
assert.equal(towerUi.mapActions({...owner,ownStationedTroops:0,buildings:{shop:1}}).find(a=>a.action==='store').disabled,false);
assert.match(emptyActions.find(a=>a.action==='send').reason,/your own troops/);
const probationActions=towerUi.mapActions({...owner,eligibility:{eligible:false},permissions:{inspect:true}});
assert(probationActions.find(a=>a.action==='send').reason.includes('24 hours'));
for(const level of [0,1]) {
  const store=towerUi.mapActions({...owner,buildings:{shop:level},buildingProject:{buildingId:'shop',targetLevel:level+1},eligibility:{eligible:false}}).find(a=>a.action==='store');
  assert.equal(store.disabled,level===0,'Store access must use the local completed level, even during construction or probation.');
}
const outsider = {...owner, ownerMember:false, exactDefenders:null, garrison:[{ownerName:"PRIVATE GARRISON",troops:100}], permissions:{scout:true,createRallyAttack:true}};
assert(!towerUi.render(outsider,money).includes("PRIVATE GARRISON"), "Private contributions never render for outsiders.");
assert(towerUi.render(outsider,money).includes("Hidden"));
assert.deepEqual(Array.from(towerUi.mapActions(outsider), a=>a.action), ["info","scout","rally-attack"]);
for (const pending of [undefined, {...outsider,permissions:undefined}]) {
  assert.deepEqual(Array.from(towerUi.mapActions(pending), a=>[a.action,Boolean(a.disabled)]),
    [["info",false],["scout",true],["rally-attack",true]], "Cold selection must show safe pending controls immediately");
}
assert.deepEqual(Array.from(towerUi.mapActions({...outsider,permissions:{scout:true,createRallyAttack:false}}), a=>a.action), ["info","scout"], "A known denial must not offer Rally");
assert(!towerUi.render({...owner,name:'<script>bad()</script>'},money).includes("<script>"));
assert(/data-tower-action="veil" disabled/.test(towerUi.render({...owner,veilUsesRemaining:0},money)));
assert(/data-tower-action="upgrade" disabled/.test(towerUi.render({...owner,attackBlocked:true},money)));
assert(/data-tower-action="repair" disabled/.test(towerUi.render({...owner,wallIntegrityBps:3800,repairCost:100}, {treasuryBalance:0})));
assert(!html.includes("Purchase Veil"), "Stored Veil mechanics remain deferred.");
assert.equal(campUi.dailyLimit({type:"gold",dailyRewards:[20,40,60,80],maxDailyRewards:0}),4);
assert.equal(campUi.dailyLimit({type:"troops",dailyRewards:[10,20,30,40],maxDailyRewards:0}),4);
assert.equal(campUi.dailyLimit({type:"items",maxDailyRewards:5,dailyRewards:[]}),5);
assert.equal(campUi.dailyLimit({type:"deed",maxDailyRewards:0,dailyRewards:[]}),1);
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const spend = game.slice(game.indexOf("async function runHoldingTowerSpendAction"), game.indexOf("function getHoldingTowerComposerTargets"));
assert(spend.indexOf("const count =") < spend.indexOf("renderHoldingTowerModal(tower)"), "Selected wall count must be captured before busy redraw.");
assert(game.includes("...towerVisual, ...(result?.towers?.[0] || {})"), "Server refresh must retain local tower artwork.");
console.log("Validated Camp daily limits, Tower privacy/flags, map-only personal actions, service gating, escaping, and preserved wall quantity/artwork.");
