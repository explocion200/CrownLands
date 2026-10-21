"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture");
const {createLiveServer,readGrant}=require("./map-benchmark/seamless/live-server");
const {applyPacket,DeltaFeed}=require("./map-benchmark/seamless/delta-feed");
const {overview,gameToImage,imageToGame,catalog}=require("./map-benchmark/seamless/live-catalog");
async function main(){
 const directory=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"private-reader-grant-")),file=path.join(directory,"grant.json");
 try{
  const grant={version:1,uid:"fixture-owner",key:require("node:crypto").randomBytes(32).toString("base64url"),expiresAt:Date.now()+60000};
  fs.writeFileSync(file,JSON.stringify(grant),{mode:0o600});assert.equal(readGrant(file).uid,grant.uid);
  fs.chmodSync(file,0o644);assert.throws(()=>readGrant(file));fs.chmodSync(file,0o600);
  for(const invalid of [{...grant,expiresAt:Date.now()-1},{...grant,expiresAt:Date.now()+8000000},{...grant,uid:"players/other"},{...grant,key:"short"}]){fs.writeFileSync(file,JSON.stringify(invalid));assert.throws(()=>readGrant(file));}
  const link=path.join(directory,"link.json");fs.symlinkSync(file,link);assert.throws(()=>readGrant(link));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
 for(const status of [401,403,409,410]){
  const feed=new DeltaFeed(()=>{},async()=>{throw Object.assign(Error("Ended"),{status});});
  feed.ids=["fixture"];feed.data={sections:[{id:"fixture",objects:[{private:true}]}],marches:[],routes:[]};
  await feed.refresh();assert.equal(feed.authExpired,true);assert.deepEqual(feed.data.sections,[]);feed.dispose();
 }
 const f=await createFixture(),{store,reader,grants,realm}=f;let server;
 try{
  assert.equal(reader.manifest.sections.length,112);assert.ok(reader.manifest.sections.some(s=>s.id==="new-lands-l03-p031"));
  for(const section of reader.manifest.sections)for(const p of [{x:0,y:0},{x:1448,y:1086},{x:724,y:543}]){const roundtrip=gameToImage(section,imageToGame(section,p));assert.ok(Math.hypot(roundtrip.x-p.x,roundtrip.y-p.y)<1e-8);}
  const atlas=await overview(reader.manifest);assert.ok(atlas.length<1024*1024);
  const id=reader.manifest.homeSectionId,uid=grants[0].uid,other=grants[1].uid;
  const before=(await store.pool.query(`SELECT count(*)::text AS documents,(SELECT count(*) FROM ${store.schema}.changes)::text AS changes FROM ${store.schema}.documents`)).rows[0];
  let packet=await reader.read(uid,[id]),cursor={epoch:packet.epoch,revision:packet.revision};
  const city=packet.objects.upsert.find(o=>o.kind==="castle"&&o.troopVisibility==="exact");assert.ok(city);
  assert.ok(packet.objects.upsert.some(o=>o.kind==="castle"&&o.troopVisibility==="hidden"&&!Object.hasOwn(o,"troops")));
  assert.ok(packet.marches.upsert.some(m=>m.troopVisibility==="exact"&&m.troops===2500));
  assert.ok(packet.marches.upsert.some(m=>m.troopVisibility==="hidden"&&!Object.hasOwn(m,"troops")));
  for(const item of packet.objects.upsert){const art=reader.artObjects.get(item.sectionId+":"+item.id);if(art&&item.kind!=="scenery"){assert.equal(item.asset,item.kind==="castle"?catalog.mapPresentation.cityStageAssets[2]:art.asset);assert.equal(item.kind,art.kind);}}
  const crossing=packet.marches.upsert.find(m=>m.sections.length===2),route=packet.routes.find(r=>r.id===crossing.routeId);
  assert.ok(crossing.arriveAt>crossing.departAt);assert.deepEqual(route.points[1],route.points[2],"Boundary crossing has a coordinate gap");
  const section=reader.sections.get(id),source={status:"active",launchedAtMs:1,arrivesAtMs:2,sourceRegionId:id,
    pathSegments:[{regionId:id,points:Array.from({length:1200},(_,i)=>imageToGame(section,{x:i,y:543}))}]};
  assert.equal(reader.march("long",source,[id]).route.points.length,1200);
  assert.throws(()=>reader.march("oversize",{...source,pathSegments:[{regionId:id,points:Array(8193).fill(imageToGame(section,{x:1,y:1}))}]},[id]),e=>e.status===413);
  const stageSource=fs.readFileSync(path.resolve(__dirname,"../game.js"),"utf8").match(/function getCastleStage\(level\) \{[\s\S]*?\n\}/)[0];
  const gameStage=require("node:vm").runInNewContext(`(${stageSource})`);
  for(const level of [1,24,25,49,50,74,75,99,100,125])assert.equal(reader.object("generated-city","cities",{...imageToGame(section,{x:100,y:100}),level},section).asset,catalog.mapPresentation.cityStageAssets[gameStage(level)]);
  assert.ok([...reader.publicAreas.values()].every(area=>[...area.objects.values()].every(o=>!Object.hasOwn(o,"troops"))),"Own counts entered the shared cache");
  assert.ok(!/privateSecret|requestedTroops|attackCombatSnapshot|inventory|@example|gold/.test(JSON.stringify(packet)));
  let data=applyPacket({sections:[],marches:[],routes:[]},packet,[id],null);
  const expanded=await reader.read(uid,[...crossing.sections],cursor);assert.equal(expanded.kind,"snapshot");assert.equal(expanded.epoch,cursor.epoch,"Changing camera area changed permission epoch");
  packet=await reader.read(uid,[id]);cursor={epoch:packet.epoch,revision:packet.revision};
  const enemy=await reader.read(other,[id]);const same=enemy.objects.upsert.find(o=>o.key===city.key);assert.equal(same.troopVisibility,"hidden");assert.ok(!Object.hasOwn(same,"troops"));
  packet=await reader.read(uid,[id],cursor);assert.equal(packet.kind,"delta");assert.equal(packet.objects.upsert.length,0);assert.equal(packet.marches.upsert.length,0);
  const after=(await store.pool.query(`SELECT count(*)::text AS documents,(SELECT count(*) FROM ${store.schema}.changes)::text AS changes FROM ${store.schema}.documents`)).rows[0];assert.deepEqual(after,before,"Reader mutated source data");
  assert.ok(reader.stats.unchangedPolls>0,"Unchanged polls rebuilt the scene");
  let clock=Date.now()+1000;reader.clock=()=>clock;
  await reader.read(uid,[id]);const loaded=reader.stats.sectionLoads;
  await reader.read(other,crossing.sections);assert.equal(reader.stats.sectionLoads,loaded+1,"Overlapping area reloaded a fresh section");
  const flags={version:2,primary:"#72363a",secondary:"#c69a45",symbolColor:"#f2e2bf",pattern:"chevron",symbol:"crown",privateSecret:"must-not-leak"};
  await store.doc(`${f.island(id)}/cities/${city.id}`).update({ownerFlag:flags});
  await store.doc("playerCosmetics/"+uid).set({equipped:{city:"templar_city"},privateSecret:"must-not-leak"});
  clock+=1000;packet=await reader.read(uid,[id]);const dressed=packet.objects.upsert.find(o=>o.key===city.key);
  assert.equal(dressed.asset,require("../functions/cosmetics").item("templar_city").assets[2]);
  assert.equal(dressed.ownerFlag.primary,flags.primary.toUpperCase());assert.ok(!Object.hasOwn(dressed.ownerFlag,"privateSecret"));
  const stranger=await reader.read(other,[id]);assert.equal(stranger.objects.upsert.find(o=>o.key===city.key).asset,dressed.asset);
  assert.equal(stranger.objects.upsert.find(o=>o.key===city.key).troopVisibility,"hidden");
  // An owner can change without a public name/flag change. Recompose the
  // private dependencies even when every public DTO byte is identical.
  await store.doc(`${f.island(id)}/cities/${city.id}`).update({ownerUid:other});
  await store.doc("playerCosmetics/"+other).set({equipped:{city:"templar_city"}});
  clock+=1000;const newOwner=await reader.read(other,[id]);assert.equal(newOwner.objects.upsert.find(o=>o.key===city.key).troopVisibility,"exact");
  await store.doc(`${f.island(id)}/cities/${city.id}`).update({ownerUid:uid});clock+=1000;
  packet=await reader.read(uid,[id]);
  const freshSection=reader.manifest.sections.find(s=>!reader.publicSections.has(s.id)).id,build=reader.buildPublicSections.bind(reader);
  reader.buildPublicSections=async()=>{throw Error("Fixture asset-independent database interruption");};
  await assert.rejects(()=>reader.read(uid,[freshSection]),/Fixture asset-independent database interruption/);
  assert.equal(reader.sectionLoads.size,0,"Failed single-flight read remained pending");reader.buildPublicSections=build;
  assert.equal((await reader.read(uid,[freshSection])).kind,"snapshot");
  assert.ok(reader.publicSections.size<=128);reader.clock=Date.now;
  cursor={epoch:packet.epoch,revision:packet.revision};await store.doc(`${f.island(id)}/cities/${city.id}`).update({ownerUid:other,ownerName:"Fixture new owner"});
  packet=await reader.read(uid,[id],cursor);const lost=packet.objects.upsert.find(o=>o.key===city.key);assert.equal(lost.troopVisibility,"hidden");assert.ok(!Object.hasOwn(lost,"troops"));
  data=applyPacket(data,packet,[id],cursor);assert.equal(data.sections[0].objects.find(o=>o.key===city.key).troopVisibility,"hidden");
  cursor={epoch:packet.epoch,revision:packet.revision};await store.doc(`${f.island(id)}/cities/${city.id}`).delete();packet=await reader.read(uid,[id],cursor);assert.ok(packet.objects.remove.includes(city.key));
  await store.doc(`${f.island(id)}/cities/foreign`).set({...realm,realmShardId:"shard_0002",id:"foreign",x:50,y:50});packet=await reader.read(uid,[id]);assert.ok(!packet.objects.upsert.some(o=>o.id==="foreign"));
  await store.doc(`players/${uid}`).update({clanId:"changed"});packet=await reader.read(uid,[id],cursor);assert.equal(packet.kind,"snapshot");assert.notEqual(packet.epoch,cursor.epoch);
  await assert.rejects(()=>reader.read(uid,["new-lands-l03-p040"]),e=>e.status===400);
  await assert.rejects(()=>reader.read(uid,Array(17).fill(id)),e=>e.status===400);
  await store.doc(`players/${uid}`).update({resetGeneration:"old"});await assert.rejects(()=>reader.read(uid,[id]),e=>e.status===403);await store.doc(`players/${uid}`).update(realm);
  server=await createLiveServer({reader,grants,atlas});const address=await server.listen();
  const post=(url,body,headers={})=>fetch(address.url+url,{method:"POST",headers:{origin:address.url,"content-type":"application/json",...headers},body:JSON.stringify(body)});
  assert.equal((await fetch(address.url+"/__benchmark__/seamless/catalog")).status,401);
  assert.equal((await post("/__benchmark__/seamless/login",{uid:other,key:"bad"})).status,401);
  const signed=await post("/__benchmark__/seamless/login",{key:grants[0].key,uid:other}),cookie=signed.headers.get("set-cookie").split(";")[0];assert.equal(signed.status,200);
  const opts={headers:{cookie}};
  assert.equal((await fetch(address.url+"/__benchmark__/seamless/catalog",opts)).status,200);
  assert.equal((await post("/local-api/sendArmy",{}, {cookie})).status,405);
  assert.equal((await fetch(address.url+"/local-auth/v1/session",opts)).status,404);
  assert.equal((await fetch(address.url+"/__benchmark__/seamless/catalog",{headers:{cookie,origin:"https://outside.test"}})).status,403);
  const url=address.url+"/__benchmark__/seamless/changes?"+new URLSearchParams({realm:reader.manifest.realmId,ids:id,uid:other});
  const own=await fetch(url,opts);assert.equal(own.status,200);assert.equal((await own.json()).viewer,require("./map-benchmark/seamless/live-reader").hash(uid));
  assert.equal((await fetch(url,opts)).status,429);
  await post("/__benchmark__/seamless/logout",{}, {cookie});assert.equal((await fetch(url,opts)).status,401);
  // An in-flight revocation must suppress its result, not just the next read.
  let valid=true;await server.close();server=await createLiveServer({reader,grants,atlas,valid:()=>valid});const b=await server.listen();
  const s=await fetch(b.url+"/__benchmark__/seamless/login",{method:"POST",headers:{origin:b.url,"content-type":"application/json"},body:JSON.stringify({key:grants[0].key})});const c=s.headers.get("set-cookie").split(";")[0];
  const read=reader.read.bind(reader);reader.read=async(...args)=>{const value=await read(...args);valid=false;return value;};
  assert.equal((await fetch(b.url+"/__benchmark__/seamless/changes?"+new URLSearchParams({realm:reader.manifest.realmId,ids:id}),{headers:{cookie:c}})).status,401);reader.read=read;
  const expansion=store.doc(`realmGenerations/${realm.resetGeneration}/expansion/current`);await expansion.update({activeRegionIds:[]});await assert.rejects(()=>reader.read(uid,[id]),e=>e.status===409);
  console.log("Live reader: 112 active/generated areas, exact/hidden/estimated disclosure, cross-player isolation, ownership/deletion, realm/revocation, no writes, HTTP isolation and budgets passed.");
 }finally{await server?.close();await f.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
