"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CHAT = require("../functions/chat");
const source = fs.readFileSync(path.resolve(__dirname, "../functions/index.js"), "utf8");
const handler = source.slice(source.indexOf('exports.sendChatMessage ='), source.indexOf('exports.createClan ='));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise,resolve}; };

(async () => {
  const restriction = deferred(), commit = deferred(), readyToCommit = deferred();
  const reads = [], writes = [];
  const profile = { playerName: "Authoritative Ruler" };
  const snapshot = data => ({exists:Boolean(data),data:()=>data});
  const transaction = {
    get(ref) {
      reads.push(ref);
      if (ref === "restriction") return restriction.promise;
      return Promise.resolve(snapshot(ref === "players/ruler" ? profile : null));
    },
    create(ref, data) { writes.push({ref,data}); },
    set(ref, data) { writes.push({ref,data}); },
  };
  const context = {
    exports:{}, CHAT, Date,
    HttpsError:class extends Error {},
    timedCallable:(_name,_options,callback)=>callback,
    requireCompatibleClient:()=>{}, assertChatPayloadDoesNotSpoofIdentity:()=>{},
    assertChatRestrictionAllowsSend:()=>{}, normalizePlayerName:name=>name,
    db:{doc:ref=>ref}, chatRestrictionRef:()=>"restriction", chatRateLimitRef:()=>"rate", chatSendRequestRef:()=>"receipt",
    globalChatMessageRef:id=>`messages/${id}`,
    requireCurrentSeasonParticipation:async (tx,_uid,options)=>{
      assert.equal(tx,transaction,"Participation left the authoritative transaction.");
      await tx.get("main-city");
      return {profile:options.profileSnap.data()};
    },
    runTransactionWithInfrastructureRetry:async callback=>{
      const result=await callback(transaction);
      readyToCommit.resolve();
      await commit.promise;
      return result;
    },
    ONLINE_WORLD_ID:"fixture-world", RESET_GENERATION:"fixture-generation", getCurrentRealmShardId:()=>"legacy",
    FieldValue:{serverTimestamp:()=>"server-timestamp"}, Timestamp:{fromMillis:value=>value},
  };
  vm.runInNewContext(handler,context);
  let settled=false;
  const request=context.exports.sendChatMessage({auth:{uid:"ruler"},data:{channel:"global",text:"  Hello  ",requestId:"scheduling_fixture_1"}}).then(result=>{settled=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  assert(reads.includes("main-city"),"Main City verification waited for the unrelated restriction read.");
  assert.equal(writes.length,0,"A message was written before restriction verification.");
  restriction.resolve(snapshot(null));
  await readyToCommit.promise;
  assert.equal(settled,false,"Delivery was acknowledged before commit.");
  commit.resolve();
  const result=await request;
  assert.equal(result.message.text,"Hello");
  assert.equal(result.message.senderDisplayName,profile.playerName);
  const saved=writes.find(write=>write.ref===`messages/${result.messageId}`).data;
  for(const [key,value] of Object.entries(result.message)) assert.equal(saved[key],value,`Acknowledgement differs from persisted ${key}.`);
  assert.equal(result.cooldownMs,3000);
  console.log("Validated overlapping authoritative chat reads, restriction gating, commit-before-acknowledgement, canonical response and unchanged cooldown.");
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
