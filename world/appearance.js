/* Original map banners and march tokens on the continuous camera. Private
   scout snapshots stay in the current account, never in shared area objects. */
(function(){
  "use strict";
  const rendered=new WeakMap();
  const esc=value=>escapeHtml(String(value??""));
  const own=item=>Boolean(item.ownerUid&&item.ownerUid===getCurrentOnlineUid());
  const ally=item=>Boolean(!own(item)&&isClanAllyCity({...item,owner:"enemy"}));
  const relation=item=>own(item)?"player":ally(item)?"clan-ally":item.ownerUid?"enemy":"neutral";
  const powerCity=item=>({...item,owner:relation(item)});
  const bannerScale=item=>item.kind==="castle"?.72:.8;
  function geometry(item){
    if(item.kind==="tower"){
      // Fit the four active buildings inside the old Tower footprint.
      // Always start with the received dimensions; updates must not shrink it again.
      const width=item.width*.5,height=item.height*.5,offsetY=width*.39;
      // Anchor the courtyard toward the top of the reserved footprint, leaving
      // its lower edge for actions above the next city's banner. Routes keep x/y.
      return {...item,width,height,left:item.x-width/2,top:item.y-height/2-offsetY,
        asset:"assets/clan-buildings/tower.webp",labelTop:item.y-offsetY-width*.58,
        compoundBottom:item.y-offsetY+width*.79};
    }
    if(item.kind!=="castle")return item;
    // The reader's footprint is the established level-100 maximum. Derive
    // presentation from each fresh packet; never alter saved positions/routes.
    const scale=.5+.1*getCastleStage(item.level),width=item.width*scale,height=item.height*scale;
    return {...item,width,height,left:item.x-width/2,top:item.y-height/2};
  }
  function courtyard(tower,snapshot){
    const definitions=window.CrownlandsClanTowerBuildings;
    if(!definitions||snapshot?.ownerKind!=="clan"||!snapshot.clanId||snapshot.clanId!==tower.ownerClanId)return [];
    const children=[];
    const centerY=tower.top+tower.height/2;
    // Retired buildings keep their saved levels, but have no map artwork/site.
    for(const [i,building]of definitions.DEFINITIONS.filter(b=>!definitions.mechanicsPending(b.id)).entries()){
      const level=definitions.level(snapshot.buildings?.[building.id]),constructing=snapshot.buildingProject?.buildingId===building.id;
      if(!level&&!constructing)continue;
      const width=tower.width*.4,x=tower.x+(i%2?1:-1)*tower.width*.72,y=centerY+(-.38+Math.floor(i/2)*.96)*tower.width;
      children.push({key:tower.key+":building:"+building.id,id:building.id,buildingId:building.id,towerKey:tower.key,towerId:tower.id,
        sectionId:tower.sectionId,sectionName:tower.sectionName,kind:"tower-building",name:building.name,level,constructing,
        x,y,left:x-width/2,top:y-width/2,width,height:width,asset:definitions.art(building.id,level),selectable:true});
    }
    // The sprites are already transparent: expose the actual map floor below.
    return children;
  }
  function loadIdentities(items){
    if(!state)return;
    // The continuous viewport includes owners outside state.cities. Reuse the
    // bounded identity cache/repair queue, never infer power from local troops.
    const cities=items.filter(item=>item.kind==="castle").map(powerCity);
    pruneEnemyPowerBandCache(cities);
    queuePlayerIdentityLookupForUids(cities.filter(city=>city.owner==="enemy").map(city=>city.ownerUid));
  }
  function scoutReport(item,nowMs=Date.now()){
    if(!state||!["castle","stronghold","citadel"].includes(item.kind))return null;
    // Reports are normalized on receipt. Do not normalize/scan the entire
    // account's history for every visible castle on every camera frame.
    const report=state.scoutReports?.[item.id];
    if(!report||(report.targetType&&report.targetType!=="city")
        ||(report.cityId&&report.cityId!==item.id)||(report.regionId&&report.regionId!==item.sectionId)
        ||String(report.ownerUid||"")!==String(item.ownerUid||"")
        ||!Number.isFinite(report.troops)||getScoutReportRemainingSeconds(report,nowMs)<=0)return null;
    return report;
  }
  function count(item,nowMs){
    if(item.troopVisibility==="exact"&&Number.isFinite(item.troops))return formatNumber(item.troops);
    if(item.troopVisibility==="estimate")return esc(item.troopEstimateLabel);
    const report=scoutReport(item,nowMs);
    return report?formatNumber(report.troops):"?";
  }
  const flag=item=>item.ownerFlag?'<span class="kingdom-flag city-owner-flag city-kingdom-flag" aria-hidden="true"><span class="flag-symbol"></span></span>':`<span class="city-owner-flag owner-flag" aria-hidden="true">${renderCrownlandsIcon(OWNER.neutral.flagIcon,"owner-flag-icon")}</span>`;
  function tickShield(node,item,now){
    const shown=item.kind==="castle"&&Boolean(item.ownerUid)&&Number.isFinite(item.peaceShieldExpiresAtMs)&&item.peaceShieldExpiresAtMs>now;
    if(node.shieldVisible===shown)return;
    node.shieldVisible=shown;node.classList.toggle("peace-shielded",shown);
    node.querySelector(".city-shield-field")?.remove();
    if(shown){const field=document.createElement("span");field.className="city-shield-field";field.setAttribute("aria-hidden","true");
      field.innerHTML='<img src="/assets/optimized/status-peace-shield-field-192x192-ca4a297c750b.webp" alt="" draggable="false" decoding="async">';node.append(field);}
  }
  function render(node,item,{inspector=false,selected=false,nowMs=Date.now()}={}){
    // Sign-out clears game state before the pending camera frame is disposed.
    if(inspector||!state)return;
    if(item.kind==="scenery"||item.kind==="courtyard")return;
    if(item.kind==="tower-building"){
      node.classList.toggle("constructing",item.constructing);
      node.classList.toggle("unbuilt",!item.level);
      node.title=`${item.name} · ${item.level?"Level "+item.level:"Under construction"} · ${item.sectionName}`;
      node.setAttribute("aria-label",node.title);
      return;
    }
    tickShield(node,item,nowMs);
    const owner=relation(item),now=Date.now();
    const city=item.kind==="castle"?powerCity(item):null;
    const powerBand=city?getStableEnemyCityPowerBand(city):"";
    const powerLabel=getEnemyCityPowerBandLabel(powerBand,city);
    const countdown=item.kind==="camp"?item.payoutPending?formatDuration(Math.max(0,Math.ceil((item.payoutAtMs-now)/1000))):"Securing":item.kind==="npc"&&!item.selectable?getMarauderRespawnLabel(item):"";
    const main=item.isMainCity===true||(own(item)&&item.id===state.mainCityId&&item.sectionId===getMainCityRegionId());
    const troopCount=count(item,nowMs);
    const signature=JSON.stringify([item.key,item.name,item.kind,item.owner,item.ownerUid,item.ownerFlag,item.ownerClanId,item.ownerClanTag,item.level,item.campType,item.classification,item.troopVisibility,troopCount,item.selectable,item.missionKind,item.returning,selected,owner,countdown,main,powerBand,powerLabel]);
    if(rendered.get(node)===signature)return;
    rendered.set(node,signature);
    node.classList.remove("player","enemy","neutral","clan-ally");node.classList.add(owner);
    node.classList.remove("enemy-power-unknown","enemy-power-protected","enemy-power-in-range","enemy-power-overpowering");
    if(powerBand){node.classList.add(`enemy-power-${powerBand}`);node.dataset.enemyPowerBand=powerBand;}
    else delete node.dataset.enemyPowerBand;
    node.classList.toggle("main-city-node",main);
    node.classList.toggle("selected",selected);
    if(item.kind==="troop"){
      node.marchSecond=null;
      node.classList.add("army-token");
      node.classList.toggle("hidden-transfer",item.troopVisibility==="hidden");
      node.classList.toggle("clan-attack",owner==="clan-ally"&&!item.returning&&["attack","rally"].includes(item.missionKind));
      node.setAttribute("aria-expanded",String(selected));
      const shown=item.troopVisibility!=="hidden";
      node.innerHTML=`<span class="army-token-icon">${item.missionKind==="scout"?renderCrownlandsIcon("scout","army-token-svg"):item.missionKind==="transfer"?"♞":"⚔"}</span><strong class="army-token-count"${shown?"":" hidden"}>${shown?troopCount:""}</strong><small class="army-token-time"></small><span class="army-token-nav" data-army-relationship="${owner==="clan-ally"?"ally":owner}"${selected?"":" hidden"}>${["from","to"].map((endpoint,i)=>`<button type="button" data-army-endpoint="${endpoint}" aria-label="Go to march ${i?"destination":"origin"}"><span aria-hidden="true">${renderCrownlandsIcon(i?"forward":"back")}</span><small>${i?"To":"From"}</small></button>`).join("")}</span>`;
      node.setAttribute("aria-label",`${item.owner||"Ruler"} · ${item.missionKind||"Army"}${shown?" · "+troopCount+" troops":""}`);
      return;
    }
    node.querySelector(".map-banner")?.remove();
    const label=document.createElement("span");label.className="map-banner";
    label.style.transform=`translateY(-4px) scale(${bannerScale(item)})`;
    const name=`<strong class="city-name">${esc(item.name)}</strong>`,level=`<span class="city-label-level">${esc(item.level??"")}</span>`;
    const clan=item.ownerClanTag?`<strong class="map-city-clan-tag">[${esc(item.ownerClanTag)}]</strong>`:"";
    const ruler=`<span class="city-ruler-row"><strong class="${own(item)?"city-ruler-name":"foreign-ruler-name"}">${esc(item.owner)}</strong></span>`;
    if(item.kind==="npc"){
      label.innerHTML=`<span class="city-label native-npc-label">${item.classification==="boss"?"Boss":"Marauder"} · ${esc(item.level??"")}${countdown?'<small data-npc-respawn>'+esc(countdown)+'</small>':""}</span>`;
    }else if(item.kind==="tower"){
      label.innerHTML=`<span class="city-label native-tower-label"><span class="holding-tower-clan-banner">${item.owner!=="Neutral"?ruler:""}</span><span class="holding-tower-map-label">${esc(item.name)}</span></span>`;
    }else if(item.kind==="camp"){
      const type=["gold","troops","items","deed"].includes(item.campType)?item.campType:"gold";
      label.innerHTML=`<span class="camp-map-banner city-label player-city-label"><span class="player-city-banner">${item.ownerFlag?`<span class="camp-holder-flag city-owner-column">${flag(item)}</span>`:`<img class="camp-type-flag" src="/assets/icons/camps/camp-${type}-v2.webp" width="42" height="53" alt="" draggable="false">`}<span class="player-city-data">${clan}${ruler}${name}${item.ownerUid?`<span class="gold-camp-active-timer city-army-count"><small>${item.contested?"Contested":"Active"}</small><strong>${esc(countdown)}</strong></span>`:""}</span></span></span>`;
    }else if(own(item)){
      node.classList.add("city-node");
      label.innerHTML=`<span class="city-label player-city-label"><span class="player-city-banner"><span class="city-owner-column">${flag(item)}${level}</span><span class="player-city-data">${clan}${ruler}${name}<span class="city-army-count">${troopCount} troops</span></span></span>`;
    }else{
      node.classList.add("city-node");
      label.innerHTML=selected?`<span class="city-label foreign-city-label selected-foreign-label">${clan}${ruler}<span class="foreign-selected-banner"><span class="foreign-city-shield">${flag(item)}${level}</span><span class="foreign-selected-data">${name}<span class="foreign-garrison">${troopCount} troops</span></span></span></span>`:`<span class="city-label foreign-city-label">${clan}${item.ownerUid?ruler:""}${name}<span class="foreign-city-shield">${flag(item)}${level}</span></span>`;
    }
    node.append(label);
    if(item.ownerFlag)for(const element of label.querySelectorAll(".city-kingdom-flag"))FlagRenderer.render(element,item.ownerFlag,{stableKey:item.ownerUid||item.key,context:"city",size:"small"});
    node.title=`${item.name} · ${item.sectionName} · ${item.owner}${item.level?" · Level "+item.level:""}${powerLabel?" · "+powerLabel:""}`;
    node.setAttribute("aria-label",node.title);
  }
  let measurements=new WeakMap(),measured=0,lastLayout="",layoutSize="",cacheHits=0;
  const measurementCache=new Map(),placements=new Map();
  function resetLayout(){measurements=new WeakMap();measurementCache.clear();placements.clear();lastLayout="";}
  document.fonts?.addEventListener("loadingdone",resetLayout);
  function layout(rows,clearings=[],controls=[]){
    const size=`${innerWidth}:${innerHeight}`;
    if(size!==layoutSize){layoutSize=size;resetLayout();}
    const entries=rows.map(({node,item})=>({node,item,banner:node.querySelector(".map-banner"),label:node.querySelector(".city-label")})).filter(e=>e.label);
    // Culling must not turn returning banners into fresh synchronous layouts.
    // Include all rendered content/state; font and viewport changes clear both
    // caches. Never cache a private snapshot independently of its active node.
    for(const e of entries)if(!measurements.has(e.label)){
      const key=rendered.get(e.node),cached=measurementCache.get(key);
      if(cached){measurementCache.delete(key);measurementCache.set(key,cached);measurements.set(e.label,cached);cacheHits++;}
    }
    const fresh=entries.filter(e=>!measurements.has(e.label));
    // Batch reads/writes only for changed banners, never on each camera frame.
    fresh.forEach(e=>e.banner.classList.remove("compact"));
    const sizes=fresh.map(e=>({width:e.label.offsetWidth*bannerScale(e.item),height:e.label.offsetHeight*bannerScale(e.item)}));
    fresh.forEach(e=>{if(!e.node.classList.contains("selected"))e.banner.classList.add("compact");});
    fresh.forEach((e,i)=>{
      const value={...sizes[i],compact:e.node.classList.contains("selected")?null:{width:e.label.offsetWidth*bannerScale(e.item),height:e.label.offsetHeight*bannerScale(e.item)},version:++measured};
      measurements.set(e.label,value);measurementCache.set(rendered.get(e.node),value);
      while(measurementCache.size>2048)measurementCache.delete(measurementCache.keys().next().value);
    });
    const signature=entries.map(e=>`${e.item.key}:${measurements.get(e.label).version}:${e.item.x}:${e.item.top}`).join("|")
      +";"+rows.map(({item:o})=>`${o.key}:${o.left}:${o.top}:${o.width}:${o.height}`).join("|")+JSON.stringify([clearings,controls]);
    if(signature===lastLayout)return;
    lastLayout=signature;
    const byKey=new Map(entries.map(e=>[e.item.key,e]));
    const labels=entries.map(e=>({key:e.item.key,x:e.item.x,y:(e.item.labelTop??e.item.top)-4,anchored:e.item.kind==="npc",priority:e.node.classList.contains("selected")?1:0,...measurements.get(e.label)}));
    const labelBounds=new Map();
    // Place complete banners around Report controls just like castle artwork;
    // the existing solver tries a small sideways adjustment before lifting.
    const obstacles=[...clearings,...controls.filter(c=>c.anchorKey),...rows.filter(({item})=>item.kind!=="courtyard").map(({item:o})=>({left:o.left,top:o.top,right:o.left+o.width,bottom:o.top+o.height}))];
    let results=placements.get(signature);
    if(!results){results=SeamlessModel.placeLabels(labels,new Set(),0,obstacles);placements.set(signature,results);if(placements.size>16)placements.delete(placements.keys().next().value);}
    for(const result of results){
      // An open action row may cover a neighboring banner on narrow screens.
      // Temporarily suppress that banner instead of detaching it from its city.
      const covered=!result.hidden&&controls.some(c=>SeamlessModel.intersects(c,result.rect.left,result.rect.top,result.rect.right-result.rect.left,result.rect.bottom-result.rect.top));
      if(!result.hidden&&!covered)labelBounds.set(result.key,result.rect);
      const {banner,item}=byKey.get(result.key);
      const compact=Boolean(result.compact),visibility=result.hidden||covered?"hidden":"",transform=`translate(${result.dx||0}px,${(result.dy||0)-4+(item.labelTop??item.top)-item.top}px) scale(${bannerScale(item)})`;
      if(banner.classList.contains("compact")!==compact)banner.classList.toggle("compact",compact);
      if(banner.style.visibility!==visibility)banner.style.visibility=visibility;
      if(banner.style.transform!==transform)banner.style.transform=transform;
    }
    window.SeamlessAppearance.labelBounds=labelBounds;
  }
  window.SeamlessAppearance={render,scoutReport,layout,geometry,courtyard,loadIdentities,tickShield,resetLayout,stats:()=>({measured,cacheHits,measurements:measurementCache.size,placements:placements.size}),routeClass(item){return own(item)?"player-route":ally(item)?!item.returning&&["attack","rally"].includes(item.missionKind)?"clan-hostile-route":"clan-support-route":"enemy-route";},tickMarch(node,item,now){
    const second=Math.ceil(item.arriveAt-now);if(node.marchSecond===second)return;node.marchSecond=second;
    const timer=node.querySelector(".army-token-time"),value=formatDuration(Math.max(0,Math.ceil(item.arriveAt-now)));
    if(timer&&timer.textContent!==value)timer.textContent=value;
  }};
})();
