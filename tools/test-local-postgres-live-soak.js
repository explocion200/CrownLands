"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{performance}=require("node:perf_hooks");
const {createFixture}=require("./map-benchmark/seamless/live-test-fixture"),{createLiveServer,ENTRY}=require("./map-benchmark/seamless/live-server");
const {decode}=require("../local-backend/values");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]||0;
async function main(){
  const seconds=Number(process.argv.find(a=>a.startsWith('--seconds='))?.slice(10)||45),players=Number(process.argv.find(a=>a.startsWith('--players='))?.slice(10)||50);
  assert.ok(seconds>=30&&seconds<=1800&&players>=2&&players<=100);
  const f=await createFixture({players:100,crowded:true,appearances:true});let server;
  try{
    server=await createLiveServer({reader:f.reader,grants:f.grants});const {url}=await server.listen(),clients=[];
    for(let i=0;i<players;i++){
      const signed=await fetch(url+ENTRY+'login',{method:'POST',headers:{origin:url,'content-type':'application/json'},body:JSON.stringify({key:f.grants[i].key})});assert.equal(signed.status,200);
      clients.push({index:i,cookie:signed.headers.get('set-cookie').split(';')[0],cursor:null});
    }
    const sections=f.reader.manifest.sections,windows=Array.from({length:16},(_,i)=>{const center=sections[Math.floor(i*sections.length/16)];return [...sections].sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y)).slice(0,16).map(s=>s.id).sort();});
    const source=(await f.store.pool.query(`SELECT path,body FROM ${f.store.schema}.documents WHERE collection_id='cities' ORDER BY path LIMIT 8`)).rows.map(r=>({path:r.path,data:decode({mapValue:{fields:r.body.fields}})}));
    const watched=new Set(source.map(r=>r.path.split('/').at(-1))),readings=[],memory=[],started=performance.now(),cpu=process.cpuUsage();let updates=0,mutating=true;
    const writer=(async()=>{while(mutating){const batch=f.store.batch();for(const [i,row]of source.entries()){const owner=(updates+i)%players;batch.set(f.store.doc(row.path),{...row.data,ownerUid:f.grants[owner].uid,ownerName:'Changing fixture owner',troops:1000000+owner*10000+updates});}await batch.commit();updates++;await pause(2000);}})();
    try{
      await Promise.all(clients.map(async client=>{
        await pause(client.index*1000/players);
        while(performance.now()-started<seconds*1000){
          const at=performance.now(),window=(Math.floor((at-started)/15000)+client.index%8)%windows.length,ids=windows[window];
          if(client.window!==window){client.cursor=null;client.window=window;}
          const response=await fetch(url+ENTRY+'changes?'+new URLSearchParams({realm:f.reader.manifest.realmId,ids:ids.join(','),...(client.cursor||{})}),{headers:{cookie:client.cookie,'accept-encoding':'gzip'}}),packet=await response.json();
          assert.ok([200,429].includes(response.status),'Unexpected feed status '+response.status);
          if(response.ok){client.cursor={epoch:packet.epoch,revision:String(packet.revision)};for(const o of packet.objects.upsert)if(watched.has(o.id)&&o.troopVisibility==='exact'&&o.troops>=1000000)assert.equal(Math.floor((o.troops-1000000)/10000),client.index,'Ownership transfer leaked another viewer count');
            assert.ok(!/"(?:privateSecret|inventory|attackCombatSnapshot|email)"/.test(JSON.stringify(packet)));}
          readings.push({at:at-started,status:response.status,ms:performance.now()-at,kind:packet.kind,wire:Number(response.headers.get('content-length'))});
          if(client.index===0){global.gc?.();memory.push({seconds:Math.round((at-started)/1000),heapMiB:process.memoryUsage().heapUsed/1048576,views:f.reader.views.size,sections:f.reader.publicSections.size,waiting:f.reader.pool.waitingCount});}
          await pause(Math.max(0,1000-(performance.now()-at)));
        }
      }));
    }finally{mutating=false;await writer;}
    const warm=readings.filter(r=>r.at>=5000),ok=warm.filter(r=>r.status===200),elapsed=performance.now()-started,used=process.cpuUsage(cpu);
    assert.ok(ok.length>0);assert.ok(f.reader.stats.peak<=16&&f.reader.stats.peakDatabase<=2);assert.equal(f.reader.pool.waitingCount,0);
    assert.ok(memory.every(m=>m.views<=128&&m.sections<=128));
    const report={at:new Date().toISOString(),fixtureOnly:true,seconds:+(elapsed/1000).toFixed(1),players,windows:16,moveEverySeconds:15,ownershipUpdates:updates,
      totalReads:readings.length,warmReads:warm.length,warmSuccess:ok.length,warmBusy:warm.length-ok.length,p95Ms:+percentile(ok.map(r=>r.ms),.95).toFixed(1),p99Ms:+percentile(ok.map(r=>r.ms),.99).toFixed(1),snapshots:ok.filter(r=>r.kind==='snapshot').length,
      wireMiB:+(readings.reduce((n,r)=>n+r.wire,0)/1048576).toFixed(2),processCpuPercent:+((used.user+used.system)/(elapsed*10)).toFixed(1),memory,bounds:{...f.reader.stats,views:f.reader.views.size,sections:f.reader.publicSections.size,waiting:f.reader.pool.waitingCount}};
    const output=path.resolve('release-artifacts/continuous-live-reader');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,`soak-${seconds}s.json`),JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,memorySamples:memory.length,memory:undefined},null,2));
  }finally{await server?.close();await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
