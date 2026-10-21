"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
// Fictional public identities rendered through the real continuous viewport and
// original power cache. Transport for all non-fixture requests stays unchanged.
module.exports=async function checkMapPower(page,source,select,output){
  await select(page,source);
  await page.waitForFunction(()=>!playerIdentityLookupInFlight);
  await page.evaluate(()=>{
    const q=window.mapPowerQA={now:Date.now(),batches:[],repairs:0,selected:false,stats:{kingPower:300000,version:13,updatedAtMs:Date.now()}};
    q.uids=Array.from({length:5},(_,i)=>"continuous-power-fixture-"+i);
    q.powers=[25000,150000,350001,300000,100000];q.names=["Unverified","In range","Stronger","Equal","Protected"];
    q.original={stats:getGlobalStatsSnapshot,render:SeamlessAppearance.render,load:SeamlessAppearance.loadIdentities};
    const api=getOnlineApi();q.api=api;q.original.identities=api.loadPlayerIdentities;q.original.combat=api.getCombatPlayerIdentity;
    getGlobalStatsSnapshot=()=>q.stats;clearEnemyPowerBandCache();
    q.keys=new Map(nativeContinuousWorld.view.scene.objects.filter(o=>o.kind==="castle").map((o,i)=>[o.key,i%5]));
    q.adapt=item=>q.keys.has(item.key)?{...item,ownerUid:q.uids[q.keys.get(item.key)],owner:q.names[q.keys.get(item.key)],ownerClanId:"",ownerClanTag:"",troopVisibility:"hidden"}:item;
    SeamlessAppearance.render=(node,item,options)=>q.original.render(node,q.adapt(item),{...options,selected:q.selected||options?.selected});
    SeamlessAppearance.loadIdentities=items=>q.original.load(items.map(q.adapt));
    api.loadPlayerIdentities=async uids=>{
      const test=uids.filter(uid=>q.uids.includes(uid)),other=uids.filter(uid=>!q.uids.includes(uid));
      if(test.length)q.batches.push(test);
      const rows=other.length?await q.original.identities.call(api,other):[];
      return [...rows,...test.map(uid=>{const i=q.uids.indexOf(uid);return {uid,displayName:q.names[i],kingPower:q.powers[i],kingPowerVersion:i===0?12:13,updatedAtMs:q.now};})];
    };
    api.getCombatPlayerIdentity=input=>{
      if(!q.uids.includes(input.uid))return q.original.combat.call(api,input);
      q.repairs++;return new Promise(resolve=>q.release=()=>resolve({uid:input.uid,displayName:"Verified protected",kingPower:25000,kingPowerVersion:13,updatedAtMs:q.now+100}));
    };
    q.read=()=>[...nativeContinuousWorld.root.querySelectorAll("#objects .castle")].filter(n=>q.keys.has(n.dataset.key)&&n.querySelector(".foreign-selected-data,.foreign-city-shield")).map(n=>({key:n.dataset.key,index:q.keys.get(n.dataset.key),band:n.dataset.enemyPowerBand,color:getComputedStyle(n.querySelector(".foreign-selected-data,.foreign-city-shield")).backgroundColor,aria:n.getAttribute("aria-label"),section:nativeContinuousWorld.view.getObject(n.dataset.key).sectionId}));
    renderCities(true);
  });
  const expected=["unknown","in-range","overpowering","in-range","protected"];
  const colors=["rgb(129, 118, 101)","rgb(179, 38, 30)","rgb(75, 20, 24)","rgb(179, 38, 30)","rgb(201, 120, 111)"];
  const reports=[];
  try{
    await page.waitForFunction(expected=>mapPowerQA.release&&new Set(mapPowerQA.read().map(r=>r.index)).size===5&&mapPowerQA.read().every(r=>r.band===expected[r.index]),expected);
    const first=await page.evaluate(()=>{const q=mapPowerQA;q.first=nativeContinuousWorld.root.querySelector('[data-key="'+q.read().find(r=>r.index===0).key+'"]');return q.read();});
    assert(first.some(r=>r.section!==source.regionId),"Neighboring section owners must be classified without selecting that section");
    for(const row of first){assert.equal(row.color,colors[row.index]);if(row.index===0)assert.match(row.aria,/not yet verified/);}
    await page.evaluate(()=>mapPowerQA.release());
    await page.waitForFunction(()=>mapPowerQA.read().filter(r=>r.index===0).every(r=>r.band==="protected"));
    assert(await page.evaluate(()=>mapPowerQA.first.isConnected),"Identity refresh replaced the castle node");
    assert.equal(await page.evaluate(()=>mapPowerQA.repairs),1,"Owner repair should be deduplicated across castles");
    assert.match((await page.evaluate(()=>mapPowerQA.read().find(r=>r.index===0))).aria,/raid only/);
    for(const [width,height]of [[1440,900],[844,390],[568,320]]){
      await page.setViewportSize({width,height});
      for(const selected of [false,true]){
        await page.evaluate(selected=>{mapPowerQA.selected=selected;renderCities(true);},selected);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const rows=await page.evaluate(()=>mapPowerQA.read());assert(rows.length>5);
        for(const row of rows){assert.equal(row.band,row.index===0?"protected":expected[row.index]);assert.equal(row.color,row.index===0?colors[4]:colors[row.index]);}
        reports.push({width,height,selected,rows});
      }
      await page.screenshot({path:path.join(output,`power-colors-${width}.png`)});
    }
    // Native stats/identity callbacks and the three-second stabilization timer
    // must repaint even when neither the camera nor area data changes.
    await page.evaluate(()=>{mapPowerQA.stats={kingPower:500000,version:13,updatedAtMs:mapPowerQA.now+200};renderCities(true);});
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal((await page.evaluate(()=>mapPowerQA.read().find(r=>r.index===1))).band,"in-range");
    await page.waitForFunction(()=>mapPowerQA.read().filter(r=>r.index===1).every(r=>r.band==="protected"),null,{timeout:7000});
    // Ownership and object-type changes clear obsolete enemy color classes.
    const exemptions=await page.evaluate(()=>{
      const q=mapPowerQA,item=q.adapt(nativeContinuousWorld.view.scene.objects.find(o=>q.keys.has(o.key)));
      const node=document.createElement("button");node.append(new Image());
      q.original.render(node,item);const before=node.dataset.enemyPowerBand;
      const cases=[{ownerUid:getCurrentOnlineUid()},{ownerUid:""},...['camp','stronghold','citadel','tower','npc','troop'].map(kind=>({kind})),{ownerUid:[...clanMemberUidSet].find(uid=>uid!==getCurrentOnlineUid()),ownerClanId:state.clanId}];
      const rows=cases.map(change=>{q.original.render(node,item);q.original.render(node,{...item,...change});return {change,band:node.dataset.enemyPowerBand||"",classes:[...node.classList].filter(c=>c.startsWith("enemy-power-"))};});
      return {before,rows,batches:q.batches,repairs:q.repairs};
    });
    assert(exemptions.before);for(const row of exemptions.rows){assert.equal(row.band,"");assert.deepEqual(row.classes,[]);}
    const requested=exemptions.batches.flat();assert.equal(new Set(requested).size,5);assert(requested.length<=10,"Camera redraws repeatedly fetched cached powers");
    fs.writeFileSync(path.join(output,"power-color-checks.json"),JSON.stringify({first,viewports:reports,exemptions},null,2));
  }finally{
    await page.evaluate(()=>{
      const q=mapPowerQA;q.release?.();getGlobalStatsSnapshot=q.original.stats;SeamlessAppearance.render=q.original.render;SeamlessAppearance.loadIdentities=q.original.load;
      q.api.loadPlayerIdentities=q.original.identities;q.api.getCombatPlayerIdentity=q.original.combat;
      for(const uid of q.uids){playerIdentityCache.delete(uid);playerIdentityLookupMisses.delete(uid);playerIdentityLookupQueue.delete(uid);}clearEnemyPowerBandCache();delete window.mapPowerQA;renderCities(true);
    });
    await page.setViewportSize({width:1440,height:900});await select(page,source);
  }
};
