"use strict";
const crypto=require("node:crypto");
const {Store}=require("../../../local-backend/store");
const {LiveReader}=require("./live-reader");
const {fixture,catalog,imageToGame}=require("./live-catalog");
const topology=require("../../../functions/coreExpansionTopology");
async function createFixture({players=100,crowded=false,appearances=false,openWorld=false}={}){
  const schema="migration_reader_test_"+crypto.randomBytes(6).toString("hex"),store=new Store({schema});
  const realm={worldId:"main-realm-reader-test",resetGeneration:"realm-reader-test",realmShardId:"shard_0001"};
  const island=id=>`islands/${realm.worldId}--${realm.realmShardId}--${id}`;
  const now=Date.now(),grants=Array.from({length:players},(_,i)=>({uid:`reader-${i}`,key:crypto.randomBytes(32).toString("base64url"),expiresAt:now+7200000}));
  let readPool;
  try {
  await store.initialize();
  const expansion={...realm,topologyVersion:"core-expansion-v1",activeRegionIds:Array.from({length:87},(_,i)=>topology.getRegionAtActivationOrdinal(i).id)};
  await store.doc("realmConfig/current").set({...realm,sharedRealmId:realm.realmShardId,resetReadinessStatus:"ready"});
  await store.doc(`realmGenerations/${realm.resetGeneration}/expansion/current`).set(expansion);
  for(const g of grants)await store.doc("players/"+g.uid).set({...realm,clanId:"fixture-clan",email:"private@example.test",gold:123456,inventory:{secret:true}});
  if(appearances)for(const [i,g]of grants.entries())await store.doc("playerCosmetics/"+g.uid).set({equipped:{city:i%2?"templar_city":"halloween_city"},privateSecret:"not-a-map-field"});
  const {Pool}=require("../../../local-backend/node_modules/pg");
  readPool=new Pool({host:"/var/run/postgresql",database:"crownlands_migration",max:2,connectionTimeoutMillis:250,options:"-c default_transaction_read_only=on",application_name:"world-reader-isolated-load"});
  const reader=new LiveReader({pool:readPool,schema,openWorld});await reader.initialize(grants[0].uid);
  const writes=[];const batch={set:(ref,data)=>writes.push([ref,data])};
  for(const section of reader.manifest.sections){
    const base=fixture.sections.find(s=>s.id===section.templateId);
    const source=fixture.objects.filter(o=>o.sectionId===base.id && o.kind!=="scenery");
    for(const [i,o] of source.entries()){
      const collection=o.kind==="camp"?"camps":o.kind==="tower"?"holdingTowers":"cities",id=section.id===base.id?o.id:`${section.id}-city-${String(i+1).padStart(2,"0")}`;
      batch.set(store.doc(collection==="holdingTowers"?`${collection}/${id}`:`${island(section.id)}/${collection}/${id}`),{...realm,id,name:o.name,regionId:section.id,...imageToGame(section,o.local),
        ownerUid:grants[i%grants.length].uid,ownerName:`Fixture ${i%grants.length}`,ownerFlag:appearances?{version:2,primary:i%2?"#315a8a":"#72363a",secondary:"#c69a45",symbolColor:"#f2e2bf",pattern:i%2?"cross":"chevron",symbol:i%2?"axe":"crown"}:null,level:30,troops:1000+i,privateSecret:"never-visible",inventory:{secret:true}});
    }
    for(let i=0;i<(crowded?12:2);i++){
      const id=`${section.id}-march-${i}`,data={...realm,ownerUid:grants[i%grants.length].uid,ownerName:`Fixture ${i%grants.length}`,status:"active",kind:i%2?"transfer":"attack",
        sourceRegionId:section.id,targetRegionId:section.id,launchedAtMs:now-10000,arrivesAtMs:now+120000,
        pathSegments:[{regionId:section.id,points:[{x:100,y:543},{x:1348,y:543}].map(p=>imageToGame(section,p))}],troopVisibility:i%2?"hidden":"estimate",troopEstimateLabel:"1K–10K",
        requestedTroops:999999,attackCombatSnapshot:{privateSecret:true}};
      if(section.id===reader.manifest.homeSectionId&&i===0){
        const next=reader.manifest.sections.find(s=>s.gridX===section.gridX+1&&s.gridY===section.gridY);
        data.targetRegionId=next.id;
        data.pathSegments=[{regionId:section.id,points:[{x:100,y:543},{x:1448,y:543}].map(p=>imageToGame(section,p))},
          {regionId:next.id,points:[{x:0,y:543},{x:1348,y:543}].map(p=>imageToGame(next,p))}];
      }
      batch.set(store.doc(`${island(section.id)}/armies/${id}`),data);
      batch.set(store.doc(`armies/${id}`),{...data,troops:2500});
    }
  }
  for(let i=0;i<writes.length;i+=200){const commit=store.batch();for(const [ref,data]of writes.slice(i,i+200))commit.set(ref,data);await commit.commit();}
  return {store,reader,realm,grants,island,async close(){await readPool.end();await store.pool.query(`DROP SCHEMA ${schema} CASCADE`);await store.close();}};
  }catch(error){await readPool?.end();await store.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await store.close();throw error;}
}
module.exports={createFixture};
