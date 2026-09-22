"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { deliverNotificationOutbox } = require("../notification-delivery");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("The local Firestore emulator is required.");
initializeApp({projectId:process.env.GCLOUD_PROJECT || "crown-land-b15e0"});
const db=getFirestore();
async function main() {
  // A separate emulator-only collection avoids invoking real messaging triggers.
  const ref=db.collection("notificationDeliveryTests").doc(randomUUID());
  const seed={status:"pending",attempts:0,notification:{kind:"attack"},expiresAtMs:Date.now()+60000};
  await ref.set(seed);
  let calls=0;
  const options={db,fieldValue:FieldValue,send:async(_notification,completed)=>{
    calls++;
    if(calls===1)return {deliveredTokenIds:["device-a"],completedTokenIds:["device-a"],retryError:Object.assign(new Error("transient"),{code:"messaging/server-unavailable"})};
    assert.deepEqual(completed,["device-a"]);
    return {deliveredTokenIds:["device-b"],completedTokenIds:["device-b"]};
  }};
  await assert.rejects(deliverNotificationOutbox(ref,options),/transient/);
  assert.equal((await ref.get()).data().status,"pending");
  await deliverNotificationOutbox(ref,options);
  const delivered=(await ref.get()).data();
  assert.equal(delivered.status,"delivered");assert.equal(delivered.attempts,2);
  assert.deepEqual(delivered.deliveredTokenIds,["device-a","device-b"]);
  await deliverNotificationOutbox(ref,options);assert.equal(calls,2,"Replayed creation events must read the terminal receipt.");

  await ref.set(seed);
  let release,entered;
  const waiting=new Promise(resolve=>{release=resolve;});
  const started=new Promise(resolve=>{entered=resolve;});
  const slow={...options,send:async()=>{entered();await waiting;return {deliveredTokenIds:["device-a"],completedTokenIds:["device-a"]};}};
  const first=deliverNotificationOutbox(ref,slow);await started;
  await assert.rejects(deliverNotificationOutbox(ref,options),/already in progress/);
  release();await first;
  assert.equal((await ref.get()).data().attempts,1);

  await ref.set({...seed,status:"processing",attempts:3,deliveryLeaseId:"abandoned",deliveryLeaseUntilMs:Date.now()-1});
  await deliverNotificationOutbox(ref,{...options,send:async()=>({completedTokenIds:["invalid-device"]})});
  assert.equal((await ref.get()).data().attempts,4);assert.equal((await ref.get()).data().status,"skipped");
  await ref.set({...seed,expiresAtMs:Date.now()-1});
  await deliverNotificationOutbox(ref,{...options,send:async()=>{throw new Error("Expired events must never be sent");}});
  assert.equal((await ref.get()).data().skipReason,"expired");
  await ref.delete();await deliverNotificationOutbox(ref,options);assert.equal((await ref.get()).exists,false,"Deleted receipts must not be recreated by retries.");
  console.log("Notification emulator passed: partial delivery, retries, duplicate events, concurrent leases, crash recovery and expired/deleted receipts.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
