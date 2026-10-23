"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),crypto=require("node:crypto");
const {monitorEventLoopDelay}=require("node:perf_hooks");
const {Pool}=require("../local-backend/node_modules/pg");
const {encode}=require("../local-backend/store");
const {createGameplayPilot}=require("./map-benchmark/seamless/gameplay-pilot");
const {createWorldService}=require("../local-backend/world/service");
const {productionTestPolicy}=require("./map-benchmark/seamless/production-test-policy");
const {createAuthenticatedNativeHarness}=require("./map-benchmark/seamless/native-auth-harness");
const {ChatEvents}=require("../local-backend/chat-events");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stats=values=>{const sorted=values.toSorted((a,b)=>a-b);return {count:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};};
const playerCount=Number(process.env.CROWNLANDS_WORLD_LOAD_PLAYERS||24);
assert([24,25,50,100].includes(playerCount),"Load steps are 24, 25, 50 or 100 fictional players");
// Wait for every actor to stop before tearing down its database/HTTP server,
// including overload failures; Promise.all alone leaves rejected groups running.
const settle=async jobs=>{const results=await Promise.allSettled(jobs),failed=results.find(r=>r.status==="rejected");if(failed)throw failed.reason;return results.map(r=>r.value);};
(async()=>{
  const pilot=await createGameplayPilot({productionRouting:true}),directory=fs.mkdtempSync(path.join(os.tmpdir(),"world-service-"));
  let world,harness,events,disabled;
  const loop=monitorEventLoopDelay({resolution:10}),timings={area:[],command:[],chat:[],watch:[]},statuses={},retries={area:0,command:0,chat:0,watch:0},failures={area:0,command:0,chat:0,watch:0};
  const outcomes=Object.fromEntries(Object.keys(timings).map(kind=>[kind,{requested:0,success:0,failed:0,exhausted:0,attempts:0}]));
  try{
    const deployment=productionTestPolicy(pilot.store),config={store:pilot.store,readPool:pilot.reader.pool,deployment,directory,
      // Raster composition is tested by the real production browser suite. Keep
      // lifecycle/combined-load measurements focused on DB, routing and HTTP.
      terrainBuilder:async manifest=>({manifest,files:[]})};
    world=createWorldService({...config,enabled:true});
    await pilot.routing.close();Object.defineProperties(pilot.routing,Object.getOwnPropertyDescriptors(world.routing));
    const entry=await world.prepare(pilot.players[0].uid),scene=entry.manifest;
    const token={clientWorldProtocol:1,clientWorldRevision:scene.revision};
    const oldRevision=crypto.createHash("sha256").update(JSON.stringify([1,"continuous-world-v1",entry.realm.worldId,entry.realm.resetGeneration,entry.realm.sharedRealmId,[...entry.expansion.activeRegionIds].sort()])).digest("hex");
    assert.notEqual(scene.revision,oldRevision,"Changed display geometry must invalidate pre-layout clients");
    await assert.rejects(world.validateCommand("sendArmyOrder",{...token,clientWorldRevision:oldRevision}),e=>e.status===409);
    // A route accepted before this display change keeps its recorded geometry
    // and clock. The reader must not snap its endpoints to the new city slots.
    const oldFixture=require("../local-backend/world/templates.json"),section=scene.sections[0];
    const oldCities=oldFixture.objects.filter(o=>o.sectionId===section.templateId&&o.kind==="castle").slice(0,2);
    const toGame=require("../local-backend/world/catalog").imageToGame;
    const stored={status:"active",launchedAtMs:1000,arrivesAtMs:101000,pathSegments:[{regionId:section.id,routingVersion:"continuous-world-v1",geometryId:"a".repeat(64),points:oldCities.map(o=>toGame(section,o.previewLocal))}]};
    const saved=JSON.stringify(stored),march=entry.reader.march("accepted-before-layout",stored,[section.id],50000);
    assert.equal(JSON.stringify(stored),saved);assert.equal(march.body.departAt,1);assert.equal(march.body.arriveAt,101);assert(march.body.openWorldRoute);
    march.route.points.forEach((p,i)=>assert(Math.hypot(p.x-section.x-oldCities[i].previewLocal.x,p.y-section.y-oldCities[i].previewLocal.y)<1e-7));
    const identity={clientReleaseId:pilot.identity.releaseId,clientWorldId:pilot.identity.worldId,clientResetGeneration:pilot.identity.resetGeneration,clientRealmShardId:pilot.identity.realmShardId};
    const invoke=(name,uid,data)=>pilot.routes.find(r=>r.name===name).handler({auth:{uid,token:{email_verified:true,firebase:{sign_in_provider:"password"}}},data:{...identity,...data}});
    for(let i=2;i<playerCount;i++){
      const p={uid:"load_"+crypto.randomBytes(8).toString("hex"),name:"Viewer"+i};
      await invoke("claimStartingCity",p.uid,{playerName:p.name});pilot.players.push(p);
    }
    events=new ChatEvents(new Pool({host:"/var/run/postgresql",database:"crownlands_migration",max:1}),pilot.store.schema);await events.start();
    harness=await createAuthenticatedNativeHarness(pilot,{productionWorld:world,chatEvents:events});
    async function request(i,route,input,kind="command",retry=true){
      const started=performance.now(),cookies=harness.cookies(i),counts=outcomes[kind];counts.requested++;
      try { for(let n=0;n<8;n++){
        counts.attempts++;
        const res=await harness.request("https://playcrownlands.com/api/local-game/v1/"+route,"POST",{
          origin:"https://playcrownlands.com","content-type":"application/json","x-crownlands-csrf":harness.sessions[i].csrf,
          cookie:cookies.map(c=>c.name+"="+c.value).join("; "),"x-crownlands-client-ip":"192.168.1."+(i+10)},Buffer.from(JSON.stringify(input)));
        statuses[res.status]=(statuses[res.status]||0)+1;
        if(retry&&[429,503].includes(res.status)){
          retries[kind]++;const retryAfter=Math.min(120000,Math.max(0,Number(res.headers?.["retry-after"]||0)*1000));
          await wait(Math.max(retryAfter,Math.min(30000,1000*2**n))+(i%7)*37);continue;
        }
        const body=JSON.parse(res.body);if(res.status===200){timings[kind].push(performance.now()-started);counts.success++;}else counts.failed++;
        return {status:res.status,...body};
      }
      counts.exhausted++;throw Error("Request did not recover: "+route);
      } catch(error){failures[kind]++;counts.failed++;throw error;}
    }
    const uid=pilot.players[0].uid,[source,target]=pilot.pair;
    const preview={...identity,...token,sourceRegionId:source.regionId,targetRegionId:target.regionId,fromId:source.id,toId:target.id,kind:"attack"};
    for(const data of [{...preview,clientWorldRevision:"0".repeat(64)},{...preview,clientWorldProtocol:0},{...preview,clientWorldRevision:undefined}])
      assert.equal((await request(0,"call/previewArmyRoute",{data},"command",false)).status,409);
    disabled=createWorldService({...config,enabled:false});
    assert.deepEqual(await disabled.read({uid},"catalog",{}),{enabled:false,protocol:1});
    await disabled.validateCommand("sendArmyOrder",{});
    await assert.rejects(disabled.validateCommand("sendArmyOrder",token),e=>e.status===409);
    const input=ids=>({protocol:1,revision:scene.revision,realm:scene.realmId,ids});
    const ids=scene.sections.slice(0,16).map(s=>s.id),key=source.regionId+":"+source.id;
    let preparationReads=0;const poolQuery=config.readPool.query;
    config.readPool.query=function(...args){if(String(args[0]).includes('.documents'))preparationReads++;return poolQuery.apply(this,args);};
    const ours=await world.read({uid},"areas",input([source.regionId]));config.readPool.query=poolQuery;
    assert.equal(preparationReads,0,"Warm area read repeated preparation reads outside its authorization snapshot");
    const theirs=await world.read({uid:pilot.players[1].uid},"areas",input([source.regionId]));
    assert.equal(ours.objects.upsert.find(o=>o.key===key).troopVisibility,"exact");
    assert(!Object.hasOwn(theirs.objects.upsert.find(o=>o.key===key),"troops"));
    const options=await world.read({uid},"options",{...input([]),key});
    assert(options.nearby.some(c=>c.id===target.id&&c.regionId===target.regionId));
    assert(options.nearby.every(c=>!Object.hasOwn(c,"troops")));
    await assert.rejects(world.read({uid:pilot.players[1].uid},"options",{...input([]),key}),e=>e.code==="permission-denied");
    // A slow foreground options read must coexist with the same player's map
    // poll (and vice versa), without admitting duplicate reads in either lane.
    for(const lane of ["areas","options"]){
      let enter,release;const entered=new Promise(r=>{enter=r;}),held=new Promise(r=>{release=r;});
      const pending=entry.reader.transaction(uid,async()=>{enter();await held;},lane);
      try{
        await entered;
        await assert.rejects(entry.reader.transaction(uid,async()=>{},lane),e=>e.status===429);
        const result=await request(0,lane==="areas"?"world/options":"world/areas",lane==="areas"?{protocol:1,revision:scene.revision,realm:scene.realmId,key}:input([source.regionId]),"area",false);
        assert.equal(result.status,200,"Foreground options and background areas collided");
      }finally{release();await pending;}
    }
    // Concurrent exploration (overlapping then dispersed), real scouting and
    // committed chat all share one HTTP admission gate and one action pool.
    const channel="globalChat/"+pilot.identity.resetGeneration+"--"+pilot.identity.realmShardId+"/messages";
    const chatTarget={collection:channel,filters:Object.entries({...pilot.identity,status:"visible"}).filter(([k])=>k!=="releaseId").map(([k,v])=>({field:[k],op:"==",value:encode(v)})),orders:[{field:["createdAtMs"],direction:"desc"}],limit:80};
    for(const values of Object.values(outcomes))for(const key of Object.keys(values))values[key]=0;
    for(const key of Object.keys(statuses))delete statuses[key];
    for(const kind of Object.keys(timings)){timings[kind]=[];retries[kind]=0;failures[kind]=0;}
    loop.enable();
    const subscriptions=settle(pilot.players.map(async(p,i)=>{
      await wait(i*47);
      for(let round=0;round<6;round++){
        const result=await request(i,"watch",{targets:[{path:`players/${p.uid}`} ]},"watch");
        assert.equal(result.status,200);assert.equal(result.result[0].documents[0].path,`players/${p.uid}`);await wait(1500);
      }
    }));
    const reads=settle(pilot.players.map(async(p,i)=>{
      await wait(i*43);let cursor;
      for(let round=0;round<8;round++){
        const sections=round<4?ids:Array.from({length:16},(_,j)=>scene.sections[(i*4+round*3+j)%scene.sections.length].id);
        const result=await request(i,"world/areas",{...input(sections),cursor},"area");assert.equal(result.status,200);cursor={epoch:result.result.epoch,revision:result.result.revision};await wait(800);
      }
    }));
    const chatting=settle([0,1,2,3].map(async i=>{
      let initial=await request(i,"watch-chat",{targets:[chatTarget]},"chat");assert.equal(initial.status,200);
      for(let round=0;round<3;round++){
        await wait(3100);
        const [next,send]=await settle([
          request(i,"watch-chat",{targets:[chatTarget],cursor:initial.result.cursor},"chat"),
          request(i,"call/sendChatMessage",{data:{...identity,channel:"global",text:"Synthetic world load "+round,requestId:crypto.randomUUID()}},"command"),
        ]);
        assert.equal(send.status,200,JSON.stringify(send));initial=next;assert.equal(initial.status,200);
      }
    }));
    const commands=(async()=>{for(let n=0;n<6;n++){
      await wait(1000);const result=await request(0,"call/previewArmyRoute",{data:preview});assert.equal(result.status,200,JSON.stringify(result));
      const armyId="service_scout_"+crypto.randomUUID();
      const sent=await request(0,"call/sendArmyOrder",{data:{...identity,...token,armyId,sourceRegionId:source.regionId,targetRegionId:target.regionId,army:{id:armyId,fromId:source.id,toId:target.id,kind:"scout",troops:1,requestedTroops:1,sourceRegionId:source.regionId,targetRegionId:target.regionId}}});
      assert.equal(sent.status,200,JSON.stringify(sent));
    }})();
    let loadError;try{await settle([reads,chatting,commands,subscriptions]);}catch(error){loadError=error;}loop.disable();
    const report={players:playerCount,sections:scene.sections.length,iterations:8,statuses,retries,failures,outcomes,
      timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,stats(v)])),eventLoopP95Ms:loop.percentile(95)/1e6,world:world.stats(),externalRequests:0};
    const output="release-artifacts/continuous-production/shared-load"+(playerCount===24?"":"-"+playerCount)+".json";
    fs.mkdirSync("release-artifacts/continuous-production",{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
    if(loadError)throw loadError;
    assert(world.stats().reader.peakDatabase<=2);assert.equal(pilot.store.pool.waitingCount,0);
    const loadWorldStats=world.stats();
    // Ownership changes and loss of realm membership invalidate privileged data.
    await pilot.cityRef(source).update({ownerUid:pilot.players[1].uid,ownerName:"Other"});
    const lost=await world.read({uid},"areas",input([source.regionId]));assert(!lost.objects.upsert.some(o=>o.key===key&&Object.hasOwn(o,"troops")));
    await assert.rejects(world.read({uid},"options",{...input([]),key}),e=>e.code==="permission-denied");
    const expansionPath=`realmGenerations/${pilot.identity.resetGeneration}/expansion/current`,expansion=(await pilot.store.doc(expansionPath).get()).data();
    const travel=require("./world-travel-test-fixtures").createTravelFixture(88),growth=travel.activeRegionIds.find(id=>!expansion.activeRegionIds.includes(id));assert(growth);
    await pilot.store.doc(expansionPath).update({activeRegionIds:[...expansion.activeRegionIds,growth]});
    await assert.rejects(world.validateCommand("sendArmyOrder",token),e=>e.status===409);
    const grown=await world.prepare(uid);assert(grown.manifest.sections.some(s=>s.id===growth));assert.notEqual(grown.revision,scene.revision);
    await assert.rejects(world.read({uid},"areas",input(ids)),e=>e.status===409);
    await world.validateCommand("sendArmyOrder",{clientWorldProtocol:1,clientWorldRevision:grown.revision});
    const realm=(await pilot.store.doc("realmConfig/current").get()).data();
    await pilot.store.doc("realmConfig/current").update({resetGeneration:"realm-test-next"});
    await assert.rejects(world.read({uid},"catalog",{}));
    await pilot.store.doc("realmGenerations/realm-test-next/expansion/current").set({...expansion,resetGeneration:"realm-test-next"});
    await pilot.store.doc("players/"+uid).update({resetGeneration:"realm-test-next"});
    const nextSeason=await world.prepare(uid);assert.equal(nextSeason.manifest.resetGeneration,"realm-test-next");assert.notEqual(nextSeason.revision,grown.revision);
    const clean=await world.read({uid},"areas",{...input([source.regionId]),revision:nextSeason.revision});
    assert(!clean.objects.upsert.some(o=>o.key===key),"Retired city leaked across season change");
    await pilot.store.doc("realmConfig/current").set(realm);
    await pilot.store.doc("players/"+uid).update({resetGeneration:"retired"});
    await assert.rejects(world.read({uid},"areas",{...input(ids),revision:grown.revision}),e=>e.status===403);
    report.world=loadWorldStats;report.lifecycle=world.stats();report.lifecyclePassed=true;
    fs.writeFileSync(output,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    assert(report.timings.command.p95<2000,"Commands exceeded the 2-second load-test gate");
  }finally{loop.disable();await harness?.close();await events?.close();await world?.close();await disabled?.close();await pilot.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
