"use strict";
const assert=require("node:assert/strict");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture");
const {createLiveServer}=require("./map-benchmark/seamless/live-server");
async function main(){
 const f=await createFixture({players:2,openWorld:true});let server;
 try{
  let valid=true;server=await createLiveServer({reader:f.reader,grants:f.grants,valid:()=>valid});const address=await server.listen(),entry=address.url+"/__benchmark__/seamless/";
  const before=(await f.store.pool.query(`SELECT count(*)::text AS documents,(SELECT count(*) FROM ${f.store.schema}.changes)::text AS changes FROM ${f.store.schema}.documents`)).rows[0];
  const sign=await fetch(entry+"login",{method:"POST",headers:{origin:address.url,"content-type":"application/json"},body:JSON.stringify({key:f.grants[0].key})});const opts={headers:{cookie:sign.headers.get("set-cookie").split(";")[0]}};
  const home=f.reader.manifest.sections.find(s=>s.id===f.reader.manifest.homeSectionId),east=f.reader.manifest.sections.find(s=>s.x===home.x+1448&&s.y===home.y);
  const packet=await f.reader.read(f.grants[0].uid,[home.id,east.id]),cities=packet.objects.upsert.filter(o=>o.kind==="castle");
  assert.ok(cities.some(o=>Math.hypot(o.previewLocal.x-o.local.x,o.previewLocal.y-o.local.y)>100));
  const {imageToGame}=require("./map-benchmark/seamless/live-catalog");
  assert.equal(f.reader.object("new-layout-slot","cities",imageToGame(home,{x:12,y:12}),home).layoutUnmapped,true);
  const from=cities.filter(o=>o.sectionId===home.id&&o.previewLocal.x>1300).sort((a,b)=>a.y-b.y)[0],to=cities.filter(o=>o.sectionId===east.id&&o.previewLocal.x<120).sort((a,b)=>Math.abs(a.y-from.y)-Math.abs(b.y-from.y))[0];
  const url=entry+"route?"+new URLSearchParams({realm:f.reader.manifest.realmId,from:from.key,to:to.key,uid:f.grants[1].uid,x:"0",y:"0"});
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,opts),result=await response.json();assert.equal(response.status,200);assert.equal(result.status,"ok");assert.equal(result.previewOnly,true);
  assert.deepEqual(result.points[0],{x:from.x,y:from.y});assert.deepEqual(result.points.at(-1),{x:to.x,y:to.y});
  assert.ok(Math.abs(result.segments[0].points.at(-1).y-home.y-543)>100,"Route still uses the old arrow");
  assert.ok(!/troops|ownerUid|privateSecret|inventory|gamePosition/.test(JSON.stringify(result)),"Route response leaked account fields");
  assert.equal((await fetch(url,opts)).status,429);
  assert.equal((await fetch(url,{...opts,method:"POST"})).status,405);
  assert.equal((await fetch(url,{headers:{...opts.headers,origin:"https://outside.test"}})).status,403);
  await assert.rejects(()=>f.reader.routeEndpoints(f.grants[0].uid,from.key,"inactive:city"),e=>e.status===400);
  const oldMarch=packet.marches.upsert[0];assert.equal(oldMarch.recordedRoute,true);
  const original=(await f.store.doc(`${f.island(oldMarch.sectionId)}/armies/${oldMarch.id}`).get()).data();
  assert.equal(oldMarch.arriveAt,original.arrivesAtMs/1000);assert.equal(oldMarch.departAt,original.launchedAtMs/1000);
  const after=(await f.store.pool.query(`SELECT count(*)::text AS documents,(SELECT count(*) FROM ${f.store.schema}.changes)::text AS changes FROM ${f.store.schema}.documents`)).rows[0];assert.deepEqual(after,before);
  // Fresh endpoints are read again even while the 750ms public cache survives.
  await f.store.doc(`${f.island(from.sectionId)}/cities/${from.id}`).delete();await assert.rejects(()=>f.reader.routeEndpoints(f.grants[0].uid,from.key,to.key),e=>e.status===404);
  const alternate=cities.find(o=>o.sectionId===home.id&&o.key!==from.key),nextUrl=entry+"route?"+new URLSearchParams({realm:f.reader.manifest.realmId,from:alternate.key,to:to.key});
  await new Promise(r=>setTimeout(r,1050));let calls=0;const endpoints=f.reader.routeEndpoints.bind(f.reader);
  f.reader.routeEndpoints=async(...args)=>{const result=await endpoints(...args);if(++calls===2)valid=false;return result;};
  assert.equal((await fetch(nextUrl,opts)).status,401,"Revoked session received an in-flight route");
  assert.equal(server.reader.pending.size,0);
  console.log("Private open routing: spread real identities, non-arrow crossings, normal read permissions, no writes, preserved live timers, fresh/deleted endpoints and in-flight revocation passed.");
 }finally{await server?.close();await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
