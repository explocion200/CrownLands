"use strict";
const assert=require("node:assert/strict"),http=require("node:http");
const {createStageThreeServer,ENTRY}=require("./map-benchmark/seamless/stage-three-server");
async function main(){
 await assert.rejects(()=>createStageThreeServer({host:"0.0.0.0"}));
 await assert.rejects(()=>createStageThreeServer({host:"8.8.8.8",subnet:"8.8.8.0/24",phone:true,maxAgeMs:60000}));
 await assert.rejects(()=>createStageThreeServer({host:"127.0.0.2",subnet:"127.0.0.0/8",phone:true,maxAgeMs:3600001}));
 const server=await createStageThreeServer({host:"127.0.0.2",subnet:"127.0.0.0/8",phone:true,maxAgeMs:60000,scripted:false});
 try {
  const {url}=await server.listen(); const get=(p,o={})=>fetch(url+ENTRY+p,{redirect:"manual",...o});
  assert.equal((await get("catalog")).status,401);
  const page=await (await get("login")).text();assert.match(page,/data-phone="true"/);assert.doesNotMatch(page,/<input|password"/);
  assert.equal((await get("open-sample",{method:"POST"})).status,403);
  const signed=await get("open-sample",{method:"POST",headers:{origin:url,"content-type":"application/json"},body:"{}"});assert.equal(signed.status,200);
  const cookie=signed.headers.get("set-cookie").split(";")[0],headers={cookie};
  assert.match(await (await get("",{headers})).text(),/crownlands-private-preview-origin/);
  const catalog=await (await get("catalog",{headers})).json();
  const query="changes?"+new URLSearchParams({realm:catalog.realmId,ids:catalog.homeSectionId});
  assert.equal((await get(query,{headers})).status,200);
  for(const p of ["../../local-game/read","../../local-auth/session","../../.git/config","../../local-backend/access.js"])assert.equal((await fetch(url+ENTRY+p,{headers})).status,404);
  const denied=await new Promise(resolve=>http.get(url+ENTRY+"login",{headers:{host:"external.test"}},r=>{r.resume();resolve(r.statusCode);}));assert.equal(denied,403);
  // Bound simultaneous reads rather than grow an unbounded database queue.
  const read=server.realm.read.bind(server.realm);let release,entered;
  const started=new Promise(r=>{entered=r;});server.realm.read=async(...args)=>{entered();await new Promise(r=>{release=r;});return read(...args);};
  const pending=get(query,{headers});await started;
  const busy=await get(query,{headers});assert.equal(busy.status,429);assert.equal(busy.headers.get("retry-after"),"1");
  release();assert.equal((await pending).status,200);server.realm.read=read;
  await get("logout",{method:"POST",headers:{...headers,origin:url,"content-type":"application/json"},body:"{}"});assert.equal((await get(query,{headers})).status,401);
  console.log("Private authenticated phone path: explicit bounded LAN mode, fictional-only session, exact origin, forbidden paths, per-account load shedding and logout passed.");
 }finally{await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
