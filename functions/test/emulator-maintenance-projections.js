"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("This test requires the Firestore emulator.");
initializeApp({projectId:process.env.GCLOUD_PROJECT || "crown-land-b15e0"});
const db = getFirestore();
const source = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const { deleteMaintenanceDocuments } = require("../maintenance-deletes");
function observedQuery(query, name) {
  return new Proxy(query, {get(target, key) {
    if (key === "get") return async () => {
      const result = await target.get();
      for (const doc of result.docs) assert.deepEqual(Object.keys(doc.data()), name === "bulkOrderRequests" ? ["expiresAtMs"] : [],
        "Cleanup loaded receipt payloads that it does not need.");
      return result;
    };
    return typeof target[key] === "function" ? (...args) => observedQuery(target[key](...args), name) : target[key];
  }});
}
const cleanupDb = {batch:()=>db.batch(),
  collection:name=>observedQuery(db.collection(name),name),
  collectionGroup:name=>observedQuery(db.collectionGroup(name),name)};
const context = vm.createContext({db:cleanupDb,Date,Math,deleteMaintenanceDocuments,timestampToMs:Number});
for (const name of ["BULK_ORDER_CLEANUP_MAX_PAGES","BULK_ORDER_CLEANUP_RUNTIME_BUDGET_MS","BULK_ORDER_CLEANUP_LIMIT"]) {
  vm.runInContext(source.match(new RegExp(`const ${name} = [^;]+;`))[0],context);
}
const schedule = section("exports.cleanupExpiredBulkOrderRequests =", "exports.resolveDueArmyOrders =");
assert.match(schedule,/memory: "512MiB"/);assert.match(schedule,/concurrency: 1/);
vm.runInContext(section("async function cleanupExpiredBulkOrderRequests(", "function chargeBulkOrderCost("),context);
vm.runInContext(section("async function cleanupExpiredChatCollectionGroup(", "// Only Global messages"),context);
vm.runInContext(section("async function cleanupExpiredNotificationOutbox(", "exports.deliverIncomingArmyNotification"),context);

(async () => {
  const now = Date.now(), prefix = "projection-" + now;
  const paths = [
    `players/${prefix}/bulkOrderRequests`, `players/${prefix}/cityUpgradeRequests`,
    `players/${prefix}/chatSendRequests`, "serverNotificationOutbox",
  ];
  const refs = [];
  for (const collection of paths) {
    const expired = db.collection(collection).doc(prefix + "-expired");
    const fresh = db.collection(collection).doc(prefix + "-fresh");
    const permanent = db.collection(collection).doc(prefix + "-permanent");
    await expired.set({expiresAtMs:now-1000,response:{payload:"x".repeat(128*1024)}});
    await fresh.set({expiresAtMs:now+3600000,response:{payload:"keep"}});
    await permanent.set({response:{payload:"keep"}});
    refs.push({expired,fresh,permanent});
  }
  const bulk = await context.cleanupExpiredBulkOrderRequests(now);
  assert.equal(bulk.deleted,1);assert.equal(bulk.oldestExpiredByMs,1000);assert.equal(bulk.remainingPossible,false);
  assert.equal((await context.cleanupExpiredChatCollectionGroup("cityUpgradeRequests",now)).deleted,1);
  assert.equal((await context.cleanupExpiredChatCollectionGroup("chatSendRequests",now)).deleted,1);
  assert.equal((await context.cleanupExpiredNotificationOutbox(now)).removed,1);
  for (const {expired,fresh,permanent} of refs) {
    assert.equal((await expired.get()).exists,false);
    assert.equal((await fresh.get()).data().response.payload,"keep");
    assert.equal((await permanent.get()).exists,true);
  }
  assert.equal((await context.cleanupExpiredBulkOrderRequests(now)).deleted,0,"Cleanup replay must be harmless.");
  console.log("Validated projected receipt cleanup against real Firestore: large expired records deleted; fresh/nonexpiring records preserved; age telemetry and replay correct.");
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
