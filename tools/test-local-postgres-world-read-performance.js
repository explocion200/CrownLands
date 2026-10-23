"use strict";
// Real production reader + disposable PostgreSQL. No production services/data.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),{execFileSync}=require("node:child_process");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture");
const {LiveReader}=require("../local-backend/world/reader");
// Keep the measured pre-optimization implementation stable across later PRs.
const baseline="cdc22393d72cbbcc5a72f83b219fbde00060a44d";
const filename=path.join(__dirname,"../local-backend/world/reader.js"),old=new Module(filename,module);
old.filename=filename;old.paths=Module._nodeModulePaths(path.dirname(filename));
old._compile(execFileSync("git",["show",baseline+":local-backend/world/reader.js"],{encoding:"utf8"}),filename);
const comparable=packet=>{const {epoch,viewer,revision,fromRevision,serverTime,...rest}=packet;return rest;};
(async()=>{
  const fixture=await createFixture({players:3,appearances:true});let now=Date.now(),bytes=0,statements=0;
  const pool={async connect(){const client=await fixture.reader.pool.connect();return {
    async query(...args){statements++;const result=await client.query(...args);bytes+=Buffer.byteLength(JSON.stringify(result.rows));return result;},
    release:()=>client.release(),
  };}};
  const reader=new LiveReader({pool,schema:fixture.store.schema,clock:()=>now,openWorld:true});
  const reference=new old.exports.LiveReader({pool,schema:fixture.store.schema,clock:()=>now,openWorld:true});
  const uid=fixture.grants[0].uid,other=fixture.grants[1].uid;
  try{
    const manifest=await reader.initialize(uid);await reference.initialize(uid);
    const ids=manifest.sections.slice(0,16).map(s=>s.id),section=ids[0];
    const docs=await fixture.store.collection(fixture.island(section)+"/cities").get();
    const city=docs.docs.find(d=>d.data().ownerUid===uid),key=section+":"+city.id;
    // Account timers and their city copies agree in this parity fixture. The
    // dedicated shield-reader suite covers intentionally missing/stale copies.
    await fixture.store.doc("players/"+uid).update({itemEffects:{shieldExpiresAtMs:now+6000}});
    const owned=await fixture.store.collectionGroup("cities").where("ownerUid","==",uid).get();
    for(let i=0;i<owned.docs.length;i+=200){const batch=fixture.store.batch();for(const doc of owned.docs.slice(i,i+200))batch.update(doc.ref,{ownerShieldExpiresAtMs:now+6000});await batch.commit();}
    await city.ref.update({privateSecret:"not-for-map-".repeat(20000),ownerShieldExpiresAtMs:now+6000,fortificationState:{version:1,integrityBps:5000,repairAtMs:now+2000},ownerFlag:null});
    const npc=fixture.store.doc(fixture.island(section)+"/marauders/performance-npc");
    await npc.set({...fixture.realm,regionId:section,x:city.data().x,y:city.data().y,name:"Sample boss",level:90,status:"active",classification:"boss",spawnId:"spawn-a",privateSecret:"hidden"});
    const compare=async(viewer=uid)=>{
      const expected=await reference.read(viewer,ids),actual=await reader.read(viewer,ids);
      assert.deepEqual(comparable(actual),comparable(expected));
      assert(!JSON.stringify(actual).includes("privateSecret"));return actual;
    };
    bytes=0;await reference.read(uid,ids);const beforeBytes=bytes;
    bytes=0;const first=await reader.read(uid,ids),afterBytes=bytes;
    assert.deepEqual(comparable(first),comparable(await reference.read(uid,ids)));
    assert(afterBytes<beforeBytes*.75,"SQL projection must avoid transferring unrelated document contents");
    const builds=reader.stats.dtoBuilds;now+=800;await compare();
    assert(reader.stats.dtoHits>0);assert.equal(reader.stats.dtoBuilds,builds,"Unchanged rows rebuild public DTOs");
    assert.equal(first.objects.upsert.find(o=>o.key===key).peaceShieldExpiresAtMs,0);
    now+=1500;const repaired=await compare();assert(repaired.objects.upsert.find(o=>o.key===key).peaceShieldExpiresAtMs>now,"Repair clock must invalidate shield presentation");
    now+=5000;const expired=await compare();assert.equal(expired.objects.upsert.find(o=>o.key===key).peaceShieldExpiresAtMs,0);
    await fixture.store.doc("playerCosmetics/"+uid).update({"equipped.city":"templar_city"});now+=800;const reskinned=await compare();
    assert.notEqual(reskinned.objects.upsert.find(o=>o.key===key).asset,first.objects.upsert.find(o=>o.key===key).asset);
    await npc.update({status:"defeated",respawnAtMs:now+10000});now+=800;assert.equal((await compare()).objects.upsert.find(o=>o.id===npc.id).selectable,false);
    await npc.update({status:"active",spawnId:"spawn-b"});now+=800;assert.equal((await compare()).objects.upsert.find(o=>o.id===npc.id).spawnId,"spawn-b");
    // Own garrisons change immediately, even inside the shared 750 ms window.
    await city.ref.update({troops:4321});assert.equal((await compare()).objects.upsert.find(o=>o.key===key).troops,4321);
    await city.ref.update({ownerUid:other});assert(!(await compare()).objects.upsert.some(o=>o.key===key&&Object.hasOwn(o,"troops")));
    now+=800;await compare(other);
    const wrong=fixture.store.doc("players/"+uid);await wrong.update({resetGeneration:"retired"});
    await assert.rejects(reader.read(uid,ids),e=>e.status===403);await wrong.update({resetGeneration:fixture.realm.resetGeneration});
    // Pre-aborted and cancelled queued reads never start a SQL transaction.
    const cancelled=new AbortController();cancelled.abort();const count=statements;
    await assert.rejects(reader.read(uid,ids,null,cancelled.signal),e=>e.status===499);assert.equal(statements,count);
    const held=await Promise.all([fixture.reader.pool.connect(),fixture.reader.pool.connect()]);
    const queued=new AbortController(),pending=reader.read(uid,ids,null,queued.signal);queued.abort();held[0].release();
    try{await assert.rejects(pending,e=>e.status===499);}finally{held[1].release();}
    assert.equal(reader.active,0);assert.equal(reader.pending.size,0);assert.equal(statements,count);
    // Aborting one viewer must not abort another viewer's shared section load.
    now+=800;const build=reader.buildPublicSections.bind(reader);let entered,release;
    const entering=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
    reader.buildPublicSections=async(...args)=>{entered();await gate;return build(...args);};
    const abort=new AbortController(),oldView=reader.views.get(uid);
    const a=reader.read(uid,ids,null,abort.signal);await entering;const b=reader.read(other,ids);abort.abort();release();
    const results=await Promise.allSettled([a,b]);reader.buildPublicSections=build;
    assert.equal(results[0].status,"rejected");assert.equal(results[0].reason.status,499);assert.equal(results[1].status,"fulfilled");
    assert.equal(reader.views.get(uid),oldView,"Cancelled read published a cursor");
    assert.equal(reader.active,0);assert.equal(reader.pending.size,0);assert.equal(reader.sectionLoads.size,0);
    assert(reader.publicSections.size<=128&&reader.publicAreas.size<=8&&reader.views.size<=128);
    const report={beforeBytes,afterBytes,ratio:afterBytes/beforeBytes,stats:reader.stats,externalRequests:0};
    fs.mkdirSync("release-artifacts/server-read-performance",{recursive:true});fs.writeFileSync("release-artifacts/server-read-performance/reader.json",JSON.stringify(report,null,2));
    console.log("Production reader parity, projected fields, unchanged DTO reuse, own-count freshness, shields, cosmetics, spawn identity, scope revocation and shared-load cancellation passed.",JSON.stringify(report));
  }finally{await fixture.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
