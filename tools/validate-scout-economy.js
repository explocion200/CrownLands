"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm");
const towers = require("../functions/holding-towers");
const { serverSource, extractFunction } = require("./world-travel-test-fixtures");

// Exercise the real launch's read boundary before its own-target rejection.
// Tower ownership cannot make an unaffiliated/probationary member eligible.
async function checkReads({ clanId = "", active = true, eligible = false, duplicate = false }) {
  const reads = [], nowMs = Date.now(), profile = { clanId };
  const ref = path => ({path});
  const snapshot = (exists, data = {}) => ({exists, id:"target", data:()=>data});
  const transaction = {get:async reference => {
    reads.push(reference.path);
    if (reference.path === "target") return snapshot(true, {ownerUid:"player"});
    if (reference.path === "army") return snapshot(duplicate, {ownerUid:"player",status:"active"});
    if (reference.path === "players/player") return snapshot(true, profile);
    if (reference.path === "clans/clan") return snapshot(true, {status:active ? "active" : "disbanded"});
    if (reference.path === "clans/clan/members/player") return snapshot(true, {
      clanId, status:"active", joinedAtMs:nowMs - (eligible ? 7 * 86400000 : 1000),
    });
    return snapshot(false);
  }};
  let preparation = 0;
  const scope = {
    Date, WeakMap, HttpsError:class extends Error { constructor(code, message) { super(message); this.code = code; } },
    HOLDING_TOWERS:towers,
    OPERATION_TIMING:{scout:()=>{},measure:(_phase,run)=>run()},
    requireActiveWorldRegionId:async id=>id,
    getServerWorldTargetIds:()=>new Set(["target"]),
    cityRefForRegion:()=>ref("target"), canonicalArmyRef:()=>ref("army"),
    armyLaunchRateLimitRef:()=>ref("rate"), db:{doc:ref},
    isHoldingTowerWorldActive:()=>true,
    holdingTowerRef:id=>ref("towers/"+id), holdingTowerGarrisonRef:id=>ref("garrisons/"+id),
    runTransactionWithInfrastructureRetry:run=>run(transaction),
    prepareEconomyCollection:async (_transaction,_uid,_now,options)=>{
      preparation++;
      assert.equal(options.checkpointWriteBudget,0,"Scout launch retained unrelated optional writes");
      return {profileAfter:profile};
    },
    safeString:value=>String(value||""), getOwnerUid:value=>value.ownerUid,
  };
  vm.createContext(scope);
  vm.runInContext("async " + extractFunction(serverSource,"launchAutomaticScoutOrder"),scope);
  const request = scope.launchAutomaticScoutOrder({},"player",{id:"army",toId:"target",targetRegionId:"core"},nowMs);
  if (duplicate) {
    assert.equal((await request).duplicate,true);
    assert.equal(preparation,0,"An idempotent replay recomputed economy");
  } else await assert.rejects(request,/own holding/);
  assert.equal(reads.filter(path=>/^(towers|garrisons)\//.test(path)).length,
    !duplicate && clanId && active && eligible ? towers.TOWERS.length * 2 : 0,
    "Tower reads must match authoritative membership eligibility");
}
(async()=>{
  for (const scenario of [{},{clanId:"clan"},{clanId:"clan",eligible:true},
    {clanId:"clan",eligible:true,active:false},{clanId:"clan",eligible:true,duplicate:true}]) await checkReads(scenario);
  console.log("Scout economy read gates passed: unaffiliated, probationary, eligible, disbanded and replayed requests.");
})().catch(error=>{console.error(error);process.exitCode=1;});
