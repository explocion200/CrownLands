"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto"),{Worker}=require("node:worker_threads");
const {Store}=require("../store"),{isPolicy}=require("../deployment-policy");
const {LiveReader}=require("./reader"),{createCommandRouting}=require("./routing");
const Policy=require("../../functions/authoritative-route-policy");
const VERSION="continuous-world-v1",PROTOCOL=1;
const capabilities=new WeakSet();
const MOVEMENT=new Set(["previewArmyRoute","sendArmyOrder","sendNearbyScouts","sendRegroupOrders","createClanRally","joinClanRally","launchClanRally","cancelClanRally","withdrawClanRallyContribution","returnClanReinforcement","useRecallHorn","useSwiftMarch"]);
const fail=(code,message,status)=>Object.assign(Error(message),{code,...(status?{status}:{})});
const digest=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
function createWorldService({store,readPool,deployment,directory,enabled=false,terrainBuilder}){
  if(!isPolicy(deployment,store.schema)||!deployment.isActive()||!readPool||!path.isAbsolute(directory))throw Error("Explicit active deployment and bounded reader pool required");
  if(store.schema!=="migration_game_live"&&!/^migration_game_worldtest_[a-f0-9]{12}$/.test(store.schema))throw Error("Unsupported world schema");
  const readStore=new Store({schema:store.schema,pool:readPool}),routing=createCommandRouting({enabled});
  let state,building,worker,closed=false;const assets=new Set(),generations=[],stats={catalogChanges:0,prepared:0,failures:0};
  const current=async()=>{
    await deployment.assertActive();
    const realm=(await readStore.doc("realmConfig/current").get()).data();
    if(!realm||realm.resetReadinessStatus!=="ready")throw fail("unavailable","The realm is preparing.");
    const expansion=(await readStore.doc(`realmGenerations/${realm.resetGeneration}/expansion/current`).get()).data();
    if(expansion?.topologyVersion!=="core-expansion-v1"||expansion.worldId!==realm.worldId||expansion.resetGeneration!==realm.resetGeneration||expansion.realmShardId!==realm.sharedRealmId)throw fail("unavailable","World catalog unavailable.");
    return {realm,expansion,revision:digest([PROTOCOL,VERSION,realm.worldId,realm.resetGeneration,realm.sharedRealmId,[...(expansion.activeRegionIds||[])].sort()])};
  };
  const render=terrainBuilder||((manifest)=>new Promise((resolve,reject)=>{
    const active=worker=new Worker(path.join(__dirname,"terrain-worker.js"),{workerData:{manifest,directory}});
    const timeout=setTimeout(()=>{void active.terminate();reject(fail("unavailable","Terrain preparation timed out."));},300000);timeout.unref();
    active.once("message",result=>{clearTimeout(timeout);if(worker===active)worker=null;resolve(result);});
    active.once("error",()=>{clearTimeout(timeout);if(worker===active)worker=null;reject(fail("unavailable","Terrain preparation failed."));});
    active.once("exit",code=>{clearTimeout(timeout);if(worker===active)worker=null;if(code)reject(fail("unavailable","Terrain preparation stopped."));});
  }));
  async function prepare(uid,{wait=false}={}){
    if(closed)throw fail("unavailable","World service stopped.");
    const identity=await current();
    if(state?.revision===identity.revision)return state;
    // Reject retired memberships immediately rather than repeatedly starting a
    // background build whose permission failure would appear as a 503 forever.
    const member=(await readStore.doc("players/"+uid).get()).data();
    if(member?.worldId!==identity.realm.worldId||member.resetGeneration!==identity.realm.resetGeneration||member.realmShardId!==identity.realm.sharedRealmId)
      throw fail("permission-denied","Enter the current realm before opening its map.",403);
    if(!building){
      stats.catalogChanges++;
      building=(async()=>{
        const reader=new LiveReader({pool:readPool,schema:store.schema,openWorld:true});
        const manifest=await reader.initialize(uid),art=await render(manifest);
        if(closed)throw fail("unavailable","World service stopped.");
        if((await current()).revision!==identity.revision)throw fail("unavailable","World changed during preparation; retry.");
        const next={...identity,reader,manifest:{...art.manifest,protocol:PROTOCOL,revision:identity.revision,routingVersion:VERSION,production:true,liveReadOnly:false,enabled:true,label:"Crownlands"}};
        // Retain current/previous terrain while tabs refresh. This bounds both
        // eligibility and disk usage across repeated map/season growth.
        generations.push(new Set(art.files));while(generations.length>2)generations.shift();
        assets.clear();for(const generation of generations)for(const name of generation)assets.add(name);
        const cached=await fs.readdir(directory);
        for(const name of cached)if(/^[a-f0-9]{24}(?:-thumb|-overview)?\.webp(?:\.sha256)?$/.test(name)&&!assets.has(name.replace(/\.sha256$/,"")))await fs.unlink(path.join(directory,name));
        state=next;stats.prepared++;return next;
      })().catch(error=>{stats.failures++;throw error;}).finally(()=>{building=null;});
      building.catch(()=>{});
    }
    if(wait)return building;
    throw fail("unavailable","The world map is updating. Please retry shortly.");
  }
  async function options(uid,key,entry){
    if(typeof key!=="string"||key.length>200||!key.includes(":"))throw fail("invalid-argument","Choose a city.");
    return entry.reader.transaction(uid,async({client,access,realm})=>{
      const island=id=>`islands/${realm.worldId}--${realm.sharedRealmId}--${id}`;
      const context={...realm,activeRegionIds:entry.expansion.activeRegionIds};
      const inRealm=d=>d.ref.path===`${island(d.data().regionId)}/cities/${d.id}`&&entry.reader.sections.has(d.data().regionId)
        &&d.data().resetGeneration===realm.resetGeneration&&d.data().realmShardId===realm.sharedRealmId;
      const query=q=>readStore.get(q,client);
      const owned=(await query(readStore.collectionGroup("cities").where("worldId","==",realm.worldId).where("ownerUid","==",uid).limit(512))).docs.filter(inRealm).map(d=>({id:d.id,...d.data()}));
      const address=c=>c.regionId+":"+c.id,anchor=owned.find(c=>address(c)===key);
      if(!anchor)throw fail("permission-denied","That city is no longer yours.");
      const nearbyDocs=(await Promise.all(routing.nearbySections(anchor,Policy.NEARBY_SCOUT_RADIUS,context).map(id=>query(readStore.collection(island(id)+"/cities"))))).flatMap(s=>s.docs).filter(inRealm);
      const clanId=access.profile.clanId,allies=new Set();
      if(typeof clanId==="string"&&/^[\w-]{1,128}$/.test(clanId)){
        const clan=(await query(readStore.doc("clans/"+clanId))).data(),member=(await query(readStore.doc(`clans/${clanId}/members/${uid}`))).data();
        if(clan?.worldId===realm.worldId&&clan.resetGeneration===realm.resetGeneration&&clan.status==="active"&&member?.status==="active")
          for(const d of (await query(readStore.collection(`clans/${clanId}/members`).where("status","==","active").limit(100))).docs)allies.add(d.id);
      }
      const pending=(await query(readStore.collection("armies").where("ownerUid","==",uid).where("status","==","active").limit(512))).docs.map(d=>d.data());
      const targets=new Set(pending.filter(m=>m.kind==="scout"&&!m.returning&&m.worldId===realm.worldId).map(m=>m.targetRegionId+":"+m.toId));
      const dto=c=>({key:address(c),id:c.id,regionId:c.regionId,name:String(c.name||c.id).slice(0,80),distance:routing.distance(anchor,c,context),...(c.ownerUid===uid?{troops:Math.max(0,Math.floor(Number(c.troops)||0))}:{})});
      const sort=(a,b)=>a.distance-b.distance||a.key.localeCompare(b.key);
      return {key,nearby:nearbyDocs.map(d=>({id:d.id,...d.data()})).filter(c=>c.ownerUid!==uid&&!allies.has(c.ownerUid)&&!c.isMainCity&&!targets.has(address(c))&&routing.distance(anchor,c,context)<=Policy.NEARBY_SCOUT_RADIUS).map(dto).sort(sort).slice(0,Policy.MAX_NEARBY_SCOUT_TARGETS),
        regroup:owned.filter(c=>address(c)!==key&&c.troops>=1&&routing.distance(anchor,c,context)<=Policy.REGROUP_RADIUS).map(dto).sort(sort).slice(0,Policy.MAX_REGROUP_SOURCES)};
    });
  }
  const service={schema:store.schema,deployment,routing,get enabled(){return enabled&&!closed;},
    prepare:(uid)=>prepare(uid,{wait:true}),
    async warm(){
      const {realm}=await current();
      const players=await readStore.collection("players").where("worldId","==",realm.worldId).where("resetGeneration","==",realm.resetGeneration).where("realmShardId","==",realm.sharedRealmId).limit(1).get();
      if(!players.docs.length)return false;
      await prepare(players.docs[0].id,{wait:true});return true;
    },
    async healthy(){
      if(!enabled)return true;
      try{
        const identity=await current();
        if(state?.revision!==identity.revision){if(!building)void service.warm().catch(()=>{});return false;}
        return state.manifest.sections.length<480;
      }catch{return false;}
    },
    async read(auth,operation,input){
      if(!enabled){if(operation==="catalog")return {enabled:false,protocol:PROTOCOL};throw fail("failed-precondition","Refresh to use the current map.",409);}
      const entry=await prepare(auth.uid);
      if(operation==="catalog"){await entry.reader.initialize(auth.uid);return entry.manifest;}
      if(input.protocol!==PROTOCOL||input.revision!==entry.revision||input.realm!==entry.manifest.realmId)throw fail("failed-precondition","World changed; refresh the map.",409);
      if(operation==="areas")return entry.reader.read(auth.uid,input.ids,input.cursor);
      if(operation==="options")return options(auth.uid,input.key,entry);
      throw fail("not-found","Unknown world operation.");
    },
    async validateCommand(name,data){
      if(!MOVEMENT.has(name))return;
      if(!enabled){if(data.clientWorldProtocol||data.clientWorldRevision)throw fail("failed-precondition","Map mode changed. Refresh before continuing.",409);return;}
      const identity=await current();
      if(!state||state.revision!==identity.revision||data.clientWorldProtocol!==PROTOCOL||data.clientWorldRevision!==identity.revision)
        throw fail("failed-precondition","The world map was updated. Refresh before continuing.",409);
    },
    async asset(name){if(!/^[a-f0-9]{24}(?:-thumb|-overview)?\.webp$/.test(name)||!assets.has(name))throw fail("not-found","Unknown map image.");return fs.readFile(path.join(directory,name));},
    stats:()=>({...stats,enabled,sections:state?.manifest.sections.length,capacity:512,capacityWarning:(state?.manifest.sections.length||0)>=480,assetFiles:assets.size,reader:state?.reader.stats,routing:routing.stats(),preparing:!!building,revision:state?.revision}),
    async close(){closed=true;await worker?.terminate();await building?.catch(()=>{});await routing.close();assets.clear();},
  };
  capabilities.add(service);return service;
}
module.exports={createWorldService,isWorldService:(value,store,deployment)=>capabilities.has(value)&&value.schema===store.schema&&value.deployment===deployment,PROTOCOL,VERSION,MOVEMENT};
