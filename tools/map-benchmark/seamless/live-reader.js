"use strict";
const crypto=require("node:crypto");
const {Store}=require("../../../local-backend/store");
const {Access}=require("../../../local-backend/access");
const {decode}=require("../../../local-backend/values");
const {buildCatalog,safeAsset,catalog,fixture,gameToImage}=require("./live-catalog");
const {CASTLE_SIZE}=require("./layout");
const Cosmetics=require("../../../functions/cosmetics");
const Flags=require("../../../functions/playerFlagConfig");
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,24);
const fail=(status,message)=>Object.assign(Error(message),{status});
const text=(value,max=80)=>typeof value==="string"?value.slice(0,max):"";
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const current=(data,realm)=>data?.worldId===realm.worldId && data.resetGeneration===realm.resetGeneration && data.realmShardId===realm.sharedRealmId;
const CONTEXT_FIELDS=["worldId","resetGeneration","sharedRealmId","resetReadinessStatus","realmShardId","clanId","topologyVersion","activeRegionIds"];
const CONTEXT_SQL=CONTEXT_FIELDS.map(key=>`'${key}',body->'fields'->'${key}'`).join(",");
class LiveReader {
  constructor({pool,schema="migration_game_live",clock=Date.now}) {
    if(schema!=="migration_game_live"&&!/^migration_reader_test_[a-f0-9]{12}$/.test(schema))throw Error("Reviewed game or isolated test schema required");
    this.pool=pool;this.store=new Store({schema,pool});this.schema=schema;this.clock=clock;
    this.instance=crypto.randomUUID();this.views=new Map();this.publicAreas=new Map();this.publicSections=new Map();this.sectionLoads=new Map();this.pending=new Set();this.active=0;
    this.stats={reads:0,rejected:0,peak:0,peakDatabase:0,maxRows:0,sharedHits:0,omittedObjects:0,omittedMarches:0,sectionLoads:0,sectionHits:0,unchangedPolls:0};
    this.artObjects=new Map(fixture.objects.filter(o=>o.kind!=="scenery").map(o=>[o.sectionId+":"+o.id,o]));
  }
  async transaction(uid,callback) {
    if(typeof uid!=="string"||!uid||uid.includes("/"))throw fail(403,"Invalid private viewer");
    if(this.pending.has(uid)||this.pending.size>=16){this.stats.rejected++;throw fail(429,"Reader busy; retry shortly");}
    this.pending.add(uid);this.stats.peak=Math.max(this.stats.peak,this.pending.size);
    let client;
    try {
      try{client=await this.pool.connect();}catch(error){if(error.message==="timeout exceeded when trying to connect"){this.stats.rejected++;throw fail(429,"Reader busy; retry shortly");}throw error;}
      this.active++;this.stats.peakDatabase=Math.max(this.stats.peakDatabase,this.active);
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='1500ms'");
      // Batch the fresh permission dependencies and project only fields used
      // by Access. Never decode entire player inventories for every map poll.
      const paths=["realmConfig/current","players/"+uid];
      if(this.expansionPath)paths.push(this.expansionPath);
      const contexts=await client.query(`SELECT path,jsonb_build_object('fields',jsonb_strip_nulls(jsonb_build_object(${CONTEXT_SQL}))) AS body FROM ${this.schema}.documents WHERE path=ANY($1::text[])`,[paths]);
      const context=new Map(contexts.rows.map(row=>[row.path,this.decode(row.body)]));
      const access=await new Access({store:this.store,transaction:{get:ref=>paths.includes(ref.path)?Promise.resolve({data:()=>context.get(ref.path)}):this.store.get(ref,client)},auth:{uid},now:this.clock()}).initialize();
      const realm=access.realm;
      if(realm?.resetReadinessStatus!=="ready"||!current(access.profile,realm))throw fail(403,"Current realm membership required");
      const expansion=await access.read(`realmGenerations/${realm.resetGeneration}/expansion/current`);
      const signature=hash([realm.worldId,realm.resetGeneration,realm.sharedRealmId,expansion?.topologyVersion,expansion?.activeRegionIds]);
      if(this.catalogSignature && signature!==this.catalogSignature)throw fail(409,"Active map catalog changed; restart the private reader");
      if(!this.catalogSignature){const built=buildCatalog(realm,expansion);this.manifest=built.manifest;this.scenery=built.scenery;this.catalogSignature=signature;this.expansionPath=`realmGenerations/${realm.resetGeneration}/expansion/current`;this.sections=new Map(this.manifest.sections.map(s=>[s.id,s]));}
      const result=await callback({client,access,realm,now:access.now});
      await client.query("COMMIT");this.stats.reads++;return result;
    }catch(error){if(client)await client.query("ROLLBACK").catch(()=>{});throw error;}
    finally{if(client){this.active--;client.release();}this.pending.delete(uid);}
  }
  initialize(uid){return this.transaction(uid,async()=>this.manifest);}
  async read(uid,ids,cursor) {
    if(!Array.isArray(ids)||!ids.length||ids.length>16||new Set(ids).size!==ids.length||ids.some(id=>!this.sections?.has(id)))throw fail(400,"Choose 1–16 active sections");
    ids=[...ids].sort();
    return this.transaction(uid,async({client,access,realm,now})=>{
      const area=await this.publicArea(ids,{client,access,realm,now});
      const routes=area.routes,overrides=new Map(),removed=new Map();
      // Public DTOs may lag by <750 ms. Exact own counts are never taken from
      // that shared cache: ownership and values are reread in this transaction.
      const owned=area.owned.get(uid)||[];
      if(owned.length){
        const fresh=await client.query(`SELECT path,body FROM ${this.schema}.documents WHERE path=ANY($1::text[])`,[[...new Set(owned.map(o=>o.path))]]);
        const documents=new Map(fresh.rows.map(row=>[row.path,this.decode(row.body)]));
        for(const candidate of owned){const data=documents.get(candidate.path),items=candidate.kind==="objects"?area.objects:area.marches;
          if(!data || (candidate.kind==="marches" && data.status!=="active")){removed.set(candidate.key,candidate.kind);continue;}
          if(!current(data,realm)||!(data.ownerUid===uid||data.holderUid===uid)||!await access.canRead(candidate.path,data))continue;
          const count=data.troops??data.currentGarrison;
          if(Number.isFinite(count)){const item={...items.get(candidate.key),troops:Math.max(0,Math.floor(count)),troopVisibility:"exact"};delete item.troopEstimateLabel;overrides.set(candidate.key,{kind:candidate.kind,item,hash:`own:${area.hashes.get(candidate.key)}:${item.troops}`});}
        }
      }
      // Targeted permission identity: unrelated account economy writes do not
      // invalidate map caches. Realm/account changes do. No scouting payloads
      // or clan-only garrisons are included in this map inspector.
      const scope=hash([this.catalogSignature,uid,access.profile.clanId||null]);
      // Camera area changes are not permission changes. Keep the permission
      // epoch stable, but never reuse a delta cursor from a different area.
      const epoch=this.instance+":"+scope,areaKey=ids.join(","),viewer=hash(uid),prior=this.views.get(uid);
      const delta=cursor&&prior&&prior.areaKey===areaKey&&cursor.epoch===epoch&&prior.epoch===epoch&&cursor.revision===prior.revision;
      const packet={kind:delta?"delta":"snapshot",epoch,viewer,revision:(prior?.revision||0)+1,fromRevision:delta?prior.revision:null,
        ids,serverTime:now/1000,objects:{upsert:[],remove:[]},marches:{upsert:[],remove:[]},routes:[],scriptHealthy:true};
      const signature=hash([area.signature,[...overrides].map(([key,value])=>[key,value.hash]),[...removed]]);
      let objects,marches,hashes;
      if(delta&&prior.signature===signature){
        ({objects,marches,hashes}=prior);this.stats.unchangedPolls++;
      }else{
      objects=new Map(area.objects);marches=new Map(area.marches);hashes=new Map(area.hashes);
      for(const [key,kind]of removed){(kind==="objects"?objects:marches).delete(key);hashes.delete(key);}
      for(const [key,value]of overrides){(value.kind==="objects"?objects:marches).set(key,value.item);hashes.set(key,value.hash);}
      for(const [kind,items] of [["objects",objects],["marches",marches]]){
        for(const [key,item] of items)if(!delta||prior.hashes.get(key)!==hashes.get(key))packet[kind].upsert.push(item);
        if(delta)for(const key of prior[kind].keys())if(!items.has(key))packet[kind].remove.push(key);
      }
      }
      const used=new Set(packet.marches.upsert.map(m=>m.routeId));packet.routes=[...used].map(id=>routes.get(id));
      if(delta&&Buffer.byteLength(JSON.stringify(packet))>65536){packet.kind="snapshot";packet.fromRevision=null;packet.objects={upsert:[...objects.values()],remove:[]};packet.marches={upsert:[...marches.values()],remove:[]};packet.routes=[...routes.values()];}
      if(Buffer.byteLength(JSON.stringify(packet))>4*1024*1024)throw fail(413,"Snapshot exceeds private reader budget");
      this.views.delete(uid);this.views.set(uid,{epoch,areaKey,revision:packet.revision,objects,marches,hashes,signature,at:now});
      for(const [key,view] of this.views)if(this.views.size>128||now-view.at>120000)this.views.delete(key);
      return packet;
    });
  }
  async publicArea(ids,context) {
    const {now}=context,key=ids.join(","),cached=this.publicAreas.get(key);
    if(cached&&now-cached.at<750){this.stats.sharedHits++;return cached;}
    const needed=ids.filter(id=>!this.sectionLoads.has(id)&&(!this.publicSections.has(id)||now-this.publicSections.get(id).at>=750));
    if(needed.length){
      const batch=this.buildPublicSections(needed,context);
      for(const id of needed){
        const pending=batch.then(sections=>sections.get(id));this.sectionLoads.set(id,pending);
        // Attach both handlers immediately; failed shared loads must be retryable.
        pending.then(()=>this.sectionLoads.delete(id),()=>this.sectionLoads.delete(id));
      }
    }
    const sections=await Promise.all(ids.map(id=>{
      if(this.sectionLoads.has(id))return this.sectionLoads.get(id);
      this.stats.sectionHits++;return this.publicSections.get(id);
    }));
    const rows=sections.reduce((sum,s)=>sum+s.rows,0);
    if(rows>2400)throw fail(413,"Area exceeds private reader budget; zoom in");
    const signature=hash(sections.map(s=>s.signature)),at=Math.min(...sections.map(s=>s.at));
    if(cached?.signature===signature){cached.at=at;this.stats.sharedHits++;return cached;}
    const objects=new Map(),marches=new Map(),routes=new Map(),owned=new Map(),hashes=new Map();
    for(const section of sections){
      for(const [key,item]of section.objects)objects.set(key,item);
      for(const [key,item]of section.marches)marches.set(key,item);
      for(const [key,item]of section.routes)routes.set(key,item);
      for(const [key,item]of section.hashes)hashes.set(key,item);
      for(const [uid,items]of section.owned){if(!owned.has(uid))owned.set(uid,[]);owned.get(uid).push(...items);}
    }
    if(marches.size>256)throw fail(413,"Too many movements for this private preview area");
    const value={objects,marches,routes,owned,hashes,signature,at};
    if(!this.publicAreas.has(key)||this.publicAreas.get(key).at<=at){this.publicAreas.delete(key);this.publicAreas.set(key,value);}
    while(this.publicAreas.size>8)this.publicAreas.delete(this.publicAreas.keys().next().value);
    return value;
  }
  async buildPublicSections(ids,{client,access,realm,now}) {
    const sections=new Map(ids.map(id=>[id,{objects:new Map(this.scenery.get(id).map(o=>[o.key,o])),marches:new Map(),routes:new Map(),owned:new Map(),rows:0,at:now}]));
    const parents=ids.map(id=>`islands/${realm.worldId}--${realm.sharedRealmId}--${id}`),parentSections=new Map(parents.map((p,i)=>[p,ids[i]]));
    const result=await client.query(`SELECT path,body FROM ${this.schema}.documents
      WHERE parent_path=ANY($1::text[]) AND collection_id=ANY($2::text[])
      AND (collection_id<>'armies' OR body#>>'{fields,status,stringValue}'='active') ORDER BY path LIMIT 2401`,[parents,["cities","camps","marauders","armies"]]);
    if(result.rows.length>2400)throw fail(413,"Area exceeds private reader budget; zoom in");
    this.stats.maxRows=Math.max(this.stats.maxRows,result.rows.length);this.stats.sectionLoads+=ids.length;
    const towers=await this.store.get(this.store.collection("holdingTowers").where("worldId","==",realm.worldId).where("resetGeneration","==",realm.resetGeneration).where("realmShardId","==",realm.sharedRealmId).limit(32),client);
    const rows=result.rows.map(row=>({path:row.path,data:this.decode(row.body)}));
    for(const tower of towers.docs){const data=tower.data();if(ids.includes(data.regionId))rows.push({path:tower.ref.path,data});}
    const owners=[...new Set(rows.map(r=>r.data.ownerUid||r.data.holderUid).filter(uid=>typeof uid==="string"&&uid.length<=128&&!uid.includes("/")))];
    const appearances=owners.length?await client.query(`SELECT path,body#>>'{fields,equipped,mapValue,fields,city,stringValue}' AS skin FROM ${this.schema}.documents WHERE path=ANY($1::text[])`,[owners.map(uid=>"playerCosmetics/"+uid)]):{rows:[]};
    const skins=new Map(appearances.rows.map(r=>[r.path.slice("playerCosmetics/".length),r.skin]));
    for(const row of rows){
      const p=row.path.split("/"),data=row.data,id=p.at(-1);
      const sourceId=parentSections.get(p.slice(0,2).join("/"))||data.regionId,entry=sections.get(sourceId);
      if(!entry)continue;entry.rows++;
      if(!current(data,realm)||!await access.canRead(row.path,data))continue;
      const own=(uid,path,key,kind)=>{if(uid){if(!entry.owned.has(uid))entry.owned.set(uid,[]);entry.owned.get(uid).push({path,key,kind});}};
      if(p.at(-2)==="armies"){
        const march=this.march(id,data,ids,now);
        if(march){entry.marches.set(march.body.key,march.body);entry.routes.set(march.route.id,march.route);own(data.ownerUid,"armies/"+id,march.body.key,"marches");}
        else this.stats.omittedMarches++;
        continue;
      }
      const section=this.sections.get(data.regionId||sourceId);
      if(!section||section.id!==sourceId)continue;
      const object=this.object(id,p.at(-2),data,section,null,skins.get(data.ownerUid));
      if(object){entry.objects.set(object.key,object);own(data.ownerUid||data.holderUid,row.path,object.key,"objects");}
      else this.stats.omittedObjects++;
    }
    for(const [id,entry]of sections){
      entry.hashes=new Map([...entry.objects,...entry.marches].map(([key,item])=>[key,hash(item)]));
      // Include ownership dependencies: an identical public label can still
      // belong to a different player after capture.
      entry.signature=hash([[...entry.hashes],[...entry.owned]]);
      const previous=this.publicSections.get(id);
      if(!previous||previous.at<=now){this.publicSections.delete(id);this.publicSections.set(id,entry);}
    }
    while(this.publicSections.size>128)this.publicSections.delete(this.publicSections.keys().next().value);
    return sections;
  }
  decode(body){return decode({mapValue:{fields:body.fields||{}}});}
  object(id,collection,data,section,uid,skin){
    const local=gameToImage(section,data);if(!local)return null;
    const landmark=this.artObjects.get(section.templateId+":"+id);
    let kind=collection==="camps"?"camp":collection==="holdingTowers"?"tower":collection==="marauders"?"npc":landmark?.kind||"castle";
    // Ordinary castles use their saved level, never the rotating fictional
    // stages from fixtures. Special landmarks retain their catalog artwork.
    const stage=Math.min(5,Math.max(1,1+Math.floor(number(data.level)/25)));
    let asset=(kind!=="castle"&&landmark?.asset)||catalog.mapPresentation.cityStageAssets[stage];
    if(kind==="castle"&&Cosmetics.item(skin)?.category==="city")asset=Cosmetics.item(skin).assets[stage]||asset;
    if(kind==="npc")asset=`assets/marauders/${data.classification==="boss"?"boss":"solo"}${data.status==="active"?"":"-defeated"}-v1.webp`;
    const width=landmark?.width||(kind==="castle"?CASTLE_SIZE:56),height=landmark?.height||(kind==="castle"?CASTLE_SIZE:56);
    const x=section.x+local.x,y=section.y+local.y;
    const dto={key:section.id+":"+id,id,sectionId:section.id,sectionName:section.name,name:text(data.name)||id,kind,
      gamePosition:{x:data.x,y:data.y},local,previewLocal:local,x,y,left:x-width/2,top:y-height/2,width,height,asset:safeAsset(data.artSrc,asset),
      owner:text(data.ownerName||data.holderName||data.clanName)||"Neutral",selectable:true,troopVisibility:"hidden"};
    if((data.ownerUid||data.holderUid)&&["castle","camp","stronghold","citadel"].includes(kind))dto.ownerFlag=Flags.normalizeFlag(data.ownerFlag||data.holderFlag,data.ownerUid||data.holderUid);
    if(uid&&(data.ownerUid===uid||data.holderUid===uid)){const count=data.troops??data.currentGarrison;if(Number.isFinite(count)){dto.troops=Math.max(0,Math.floor(count));dto.troopVisibility="exact";}}
    return dto;
  }
  march(id,data,ids,now){
    if(data.status!=="active"||!Number.isFinite(data.launchedAtMs)||!Number.isFinite(data.arrivesAtMs)||data.arrivesAtMs<=data.launchedAtMs)return null;
    const segments=Array.isArray(data.pathSegments)&&data.pathSegments.length?data.pathSegments:[{regionId:data.sourceRegionId,points:data.path}];
    if(segments.length>256)throw fail(413,"Movement route exceeds preview budget");
    const points=[],sectionIds=[];
    for(const segment of segments){const s=this.sections.get(segment.regionId);if(!s||!Array.isArray(segment.points)||segment.points.length<2)return null;
      sectionIds.push(s.id);
      for(const p of segment.points){const local=gameToImage(s,p);if(!local)return null;points.push({x:s.x+local.x,y:s.y+local.y});}
    }
    if(points.length>8192)throw fail(413,"Movement route exceeds preview budget");
    if(!sectionIds.some(id=>ids.includes(id)))return null;
    const routeId="route-"+hash(points),key="march:"+id;
    const body={key,id,sectionId:sectionIds[0],sections:[...new Set(sectionIds)],name:text(data.ownerName)||"March",owner:text(data.ownerName),kind:"troop",asset:"assets/icons/skills/atlas-v1/marchOrders.webp",
      routeId,departAt:data.launchedAtMs/1000,arriveAt:data.arrivesAtMs/1000,troopVisibility:"hidden"};
    // Trust only the public producer's explicit estimate/exact marker. Never
    // reconstruct exact hidden forces from another source or requestedTroops.
    if(data.troopVisibility==="estimate"){body.troopVisibility="estimate";body.troopEstimateLabel=text(data.troopEstimateLabel,40);}
    else if(data.troopVisibility==="exact"&&Number.isFinite(data.troops)){body.troopVisibility="exact";body.troops=Math.max(0,Math.floor(data.troops));}
    return {body,route:{id:routeId,points}};
  }
}
module.exports={LiveReader,hash,current,fail};
