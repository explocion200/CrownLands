"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{performance}=require("node:perf_hooks");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture"),{createLiveServer,ENTRY}=require("./map-benchmark/seamless/live-server");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]||0;
async function main(){
 const f=await createFixture({crowded:true});let server;
 try{
  server=await createLiveServer({reader:f.reader,grants:f.grants});const {url}=await server.listen(),clients=[];
  for(const grant of f.grants){const response=await fetch(url+ENTRY+"login",{method:"POST",headers:{origin:url,"content-type":"application/json"},body:JSON.stringify({key:grant.key})});assert.equal(response.status,200);clients.push({cookie:response.headers.get("set-cookie").split(";")[0],cursor:null});}
  const sections=f.reader.manifest.sections,home=sections.find(s=>s.id===f.reader.manifest.homeSectionId);
  const ids=sections.filter(s=>s.gridX>=home.gridX-1&&s.gridX<=home.gridX+2&&s.gridY>=home.gridY-1&&s.gridY<=home.gridY+2).map(s=>s.id);
  assert.equal(ids.length,16);const results=[];
  async function request(client){
    const query=new URLSearchParams({realm:f.reader.manifest.realmId,ids:(client.ids||ids).join(","),...(client.cursor||{})}),start=performance.now();
    const response=await fetch(url+ENTRY+"changes?"+query,{headers:{cookie:client.cookie,"accept-encoding":"gzip"}}),wire=Number(response.headers.get("content-length"));
    const packet=await response.json(),ms=performance.now()-start;
    if(response.ok){assert.equal(packet.viewer,require("./map-benchmark/seamless/live-reader").hash(f.grants[clients.indexOf(client)].uid));client.cursor={epoch:packet.epoch,revision:String(packet.revision)};assert.ok(!/"(?:privateSecret|requestedTroops|attackCombatSnapshot|inventory)"/.test(JSON.stringify(packet)));}
    return{status:response.status,ms,wire,kind:packet.kind};
  }
  // Synchronised bursts must shed excess work without a growing pool queue.
  const burst=await Promise.all(clients.map(request));assert.ok(burst.some(r=>r.status===429));assert.ok(burst.every(r=>[200,429].includes(r.status)));
  assert.ok(f.reader.stats.peak<=16);assert.ok(f.reader.stats.peakDatabase<=2);await pause(1100);
  for(const scenario of [{count:10},{count:25},{count:50},{count:100},{count:50,dispersed:true}]){
    const {count}=scenario;
    for(const [i,client]of clients.entries())if(scenario.dispersed){const center=sections[Math.floor((i%8)*sections.length/8)];client.ids=[...sections].sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y)).slice(0,16).map(s=>s.id);client.cursor=null;}
    const readings=[],started=performance.now(),cpu=process.cpuUsage();
    await Promise.all(clients.slice(0,count).map(async(client,index)=>{
      await pause(index*1000/count);
      for(let i=0;i<8;i++){const at=performance.now();readings.push(await request(client));await pause(Math.max(0,1000-(performance.now()-at)));}
    }));
    const elapsed=performance.now()-started,used=process.cpuUsage(cpu),ok=readings.filter(r=>r.status===200);
    assert.ok(readings.every(r=>[200,429].includes(r.status)),"Unexpected feed failure under load");
    assert.ok(ok.length>0);assert.ok(f.reader.pool.waitingCount===0,"Database queue accumulated");
    results.push({players:count,areaPattern:scenario.dispersed?"eight dispersed windows":"shared crowded window",seconds:+(elapsed/1000).toFixed(1),requests:readings.length,success:ok.length,busy:readings.length-ok.length,
      p50Ms:+percentile(ok.map(r=>r.ms),.5).toFixed(1),p95Ms:+percentile(ok.map(r=>r.ms),.95).toFixed(1),maxMs:+Math.max(...ok.map(r=>r.ms)).toFixed(1),
      snapshots:ok.filter(r=>r.kind==="snapshot").length,wireBytes:ok.reduce((n,r)=>n+r.wire,0),processCpuPercent:+((used.user+used.system)/(elapsed*10)).toFixed(1),heapMiB:+(process.memoryUsage().heapUsed/1048576).toFixed(1)});
  }
  const output=path.resolve("release-artifacts/continuous-live-reader");fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,"load.json"),JSON.stringify({at:new Date().toISOString(),fixtureOnly:true,sections:112,maximumAreaSections:16,crowdedMarchesPerSection:12,
    burst:{requests:100,accepted:burst.filter(r=>r.status===200).length,busy:burst.filter(r=>r.status===429).length},results,bounds:{...f.reader.stats,cachedViewers:f.reader.views.size,waiting:f.reader.pool.waitingCount}},null,2));
  console.log(JSON.stringify({results,bounds:f.reader.stats},null,2));
 }finally{await server?.close();await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
