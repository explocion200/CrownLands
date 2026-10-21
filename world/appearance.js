/* Original map banners and march tokens on the continuous camera. Only the
   authorized area's public fields and explicitly disclosed counts are used. */
(function(){
  "use strict";
  const rendered=new WeakMap();
  const esc=value=>escapeHtml(String(value??""));
  const own=item=>Boolean(item.ownerUid&&item.ownerUid===getCurrentOnlineUid());
  const ally=item=>Boolean(!own(item)&&isClanAllyCity({...item,owner:"enemy"}));
  const relation=item=>own(item)?"player":ally(item)?"clan-ally":item.ownerUid?"enemy":"neutral";
  const powerCity=item=>({...item,owner:relation(item)});
  function loadIdentities(items){
    if(!state)return;
    // The continuous viewport includes owners outside state.cities. Reuse the
    // bounded identity cache/repair queue, never infer power from local troops.
    const cities=items.filter(item=>item.kind==="castle").map(powerCity);
    pruneEnemyPowerBandCache(cities);
    queuePlayerIdentityLookupForUids(cities.filter(city=>city.owner==="enemy").map(city=>city.ownerUid));
  }
  const count=item=>item.troopVisibility==="exact"&&Number.isFinite(item.troops)?formatNumber(item.troops):item.troopVisibility==="estimate"?esc(item.troopEstimateLabel):"?";
  const flag=item=>item.ownerFlag?'<span class="kingdom-flag city-owner-flag city-kingdom-flag" aria-hidden="true"><span class="flag-symbol"></span></span>':`<span class="city-owner-flag owner-flag" aria-hidden="true">${renderCrownlandsIcon(OWNER.neutral.flagIcon,"owner-flag-icon")}</span>`;
  function render(node,item,{inspector=false,selected=false}={}){
    // Sign-out clears game state before the pending camera frame is disposed.
    if(inspector||!state)return;
    if(item.kind==="scenery")return;
    const owner=relation(item),now=Date.now();
    const city=item.kind==="castle"?powerCity(item):null;
    const powerBand=city?getStableEnemyCityPowerBand(city):"";
    const powerLabel=getEnemyCityPowerBandLabel(powerBand,city);
    const countdown=item.kind==="camp"?item.payoutPending?formatDuration(Math.max(0,Math.ceil((item.payoutAtMs-now)/1000))):"Securing":item.kind==="npc"&&!item.selectable?getMarauderRespawnLabel(item):"";
    const main=item.isMainCity===true||(own(item)&&item.id===state.mainCityId&&item.sectionId===getMainCityRegionId());
    const signature=JSON.stringify([item.key,item.name,item.kind,item.owner,item.ownerUid,item.ownerFlag,item.ownerClanId,item.ownerClanTag,item.level,item.campType,item.classification,item.troopVisibility,item.troops,item.troopEstimateLabel,item.selectable,item.missionKind,item.returning,selected,owner,countdown,main,powerBand,powerLabel]);
    if(rendered.get(node)===signature)return;
    rendered.set(node,signature);
    node.classList.remove("player","enemy","neutral","clan-ally");node.classList.add(owner);
    node.classList.remove("enemy-power-unknown","enemy-power-protected","enemy-power-in-range","enemy-power-overpowering");
    if(powerBand){node.classList.add(`enemy-power-${powerBand}`);node.dataset.enemyPowerBand=powerBand;}
    else delete node.dataset.enemyPowerBand;
    node.classList.toggle("main-city-node",main);
    node.classList.toggle("selected",selected);
    if(item.kind==="troop"){
      node.classList.add("army-token");
      node.classList.toggle("hidden-transfer",item.troopVisibility==="hidden");
      node.classList.toggle("clan-attack",owner==="clan-ally"&&!item.returning&&["attack","rally"].includes(item.missionKind));
      node.setAttribute("aria-expanded",String(selected));
      const shown=item.troopVisibility!=="hidden";
      node.innerHTML=`<span class="army-token-icon">${item.missionKind==="scout"?renderCrownlandsIcon("scout","army-token-svg"):item.missionKind==="transfer"?"♞":"⚔"}</span><strong class="army-token-count"${shown?"":" hidden"}>${shown?count(item):""}</strong><small class="army-token-time"></small><span class="army-token-nav" data-army-relationship="${owner==="clan-ally"?"ally":owner}"${selected?"":" hidden"}>${["from","to"].map((endpoint,i)=>`<button type="button" data-army-endpoint="${endpoint}" aria-label="Go to march ${i?"destination":"origin"}"><span aria-hidden="true">${renderCrownlandsIcon(i?"forward":"back")}</span><small>${i?"To":"From"}</small></button>`).join("")}</span>`;
      node.setAttribute("aria-label",`${item.owner||"Ruler"} · ${item.missionKind||"Army"}${shown?" · "+count(item)+" troops":""}`);
      return;
    }
    node.querySelector(".tag")?.remove();node.querySelector(".map-banner")?.remove();
    const label=document.createElement("span");label.className="map-banner";
    const name=`<strong class="city-name">${esc(item.name)}</strong>`,level=`<span class="city-label-level">${esc(item.level??"")}</span>`;
    const clan=item.ownerClanTag?`<strong class="map-city-clan-tag">[${esc(item.ownerClanTag)}]</strong>`:"";
    const ruler=`<span class="city-ruler-row"><strong class="${own(item)?"city-ruler-name":"foreign-ruler-name"}">${esc(item.owner)}</strong></span>`;
    if(item.kind==="npc"){
      label.innerHTML=`<span class="city-label native-npc-label">${item.classification==="boss"?"Boss":"Marauder"} · ${esc(item.level??"")}${countdown?' · <small data-npc-respawn>'+esc(countdown)+'</small>':""}</span>`;
    }else if(item.kind==="tower"){
      label.innerHTML=`<span class="city-label native-tower-label"><span class="holding-tower-clan-banner">${item.owner!=="Neutral"?ruler:""}</span><span class="holding-tower-map-label">${esc(item.name)}</span></span>`;
    }else if(item.kind==="camp"){
      const type=["gold","troops","items","deed"].includes(item.campType)?item.campType:"gold";
      label.innerHTML=`<span class="camp-map-banner city-label player-city-label"><span class="player-city-banner">${item.ownerFlag?`<span class="camp-holder-flag city-owner-column">${flag(item)}</span>`:`<img class="camp-type-flag" src="/assets/icons/camps/camp-${type}-v2.webp" width="42" height="53" alt="" draggable="false">`}<span class="player-city-data">${clan}${ruler}${name}${item.ownerUid?`<span class="gold-camp-active-timer city-army-count"><small>${item.contested?"Contested":"Active"}</small><strong>${esc(countdown)}</strong></span>`:""}</span></span></span>`;
    }else if(own(item)){
      node.classList.add("city-node");
      label.innerHTML=`<span class="city-label player-city-label"><span class="player-city-banner"><span class="city-owner-column">${flag(item)}${level}</span><span class="player-city-data">${clan}${ruler}${name}<span class="city-army-count">${count(item)} troops</span></span></span>`;
    }else{
      node.classList.add("city-node");
      label.innerHTML=selected?`<span class="city-label foreign-city-label selected-foreign-label">${clan}${ruler}<span class="foreign-selected-banner"><span class="foreign-selected-level">${esc(item.level??"")}</span><span class="foreign-selected-crest">${flag(item)}</span><span class="foreign-selected-data">${name}<span class="foreign-garrison">${count(item)} troops</span></span></span></span>`:`<span class="city-label foreign-city-label">${clan}${item.ownerUid?ruler:""}${name}<span class="foreign-city-shield">${flag(item)}${level}</span></span>`;
    }
    node.append(label);
    if(item.ownerFlag)for(const element of label.querySelectorAll(".city-kingdom-flag"))FlagRenderer.render(element,item.ownerFlag,{stableKey:item.ownerUid||item.key,context:"city",size:"small"});
    node.title=`${item.name} · ${item.sectionName} · ${item.owner}${item.level?" · Level "+item.level:""}${powerLabel?" · "+powerLabel:""}`;
    node.setAttribute("aria-label",node.title);
  }
  let measurements=new WeakMap(),measured=0,lastLayout="",layoutSize="";
  document.fonts?.addEventListener("loadingdone",()=>{measurements=new WeakMap();lastLayout="";});
  function layout(rows){
    const size=`${innerWidth}:${innerHeight}`;
    if(size!==layoutSize){layoutSize=size;measurements=new WeakMap();lastLayout="";}
    const entries=rows.map(({node,item})=>({node,item,banner:node.querySelector(".map-banner"),label:node.querySelector(".city-label")})).filter(e=>e.label);
    const fresh=entries.filter(e=>!measurements.has(e.label));
    // Batch reads/writes only for changed banners, never on each camera frame.
    fresh.forEach(e=>e.banner.classList.remove("compact"));
    const sizes=fresh.map(e=>({width:e.label.offsetWidth*.8,height:e.label.offsetHeight*.8}));
    fresh.forEach(e=>{if(!e.node.classList.contains("selected"))e.banner.classList.add("compact");});
    fresh.forEach((e,i)=>measurements.set(e.label,{...sizes[i],compact:e.node.classList.contains("selected")?null:{width:e.label.offsetWidth*.8,height:e.label.offsetHeight*.8},version:++measured}));
    const signature=entries.map(e=>`${e.item.key}:${measurements.get(e.label).version}:${e.item.x}:${e.item.top}`).join("|");
    if(signature===lastLayout)return;
    lastLayout=signature;
    const byKey=new Map(entries.map(e=>[e.item.key,e]));
    const labels=entries.map(e=>({key:e.item.key,x:e.item.x,y:e.item.top-4,priority:e.node.classList.contains("selected")?1:0,...measurements.get(e.label)}));
    const labelBounds=new Map();
    for(const result of SeamlessModel.placeLabels(labels)){
      if(!result.hidden)labelBounds.set(result.key,result.rect);
      const {banner}=byKey.get(result.key);
      banner.classList.toggle("compact",Boolean(result.compact));
      banner.style.visibility=result.hidden?"hidden":"";
      banner.style.transform=`translate(${result.dx||0}px,${(result.dy||0)-4}px) scale(.8)`;
    }
    window.SeamlessAppearance.labelBounds=labelBounds;
  }
  window.SeamlessAppearance={render,layout,loadIdentities,routeClass(item){return own(item)?"player-route":ally(item)?!item.returning&&["attack","rally"].includes(item.missionKind)?"clan-hostile-route":"clan-support-route":"enemy-route";},tickMarch(node,item,now){
    const timer=node.querySelector(".army-token-time"),value=formatDuration(Math.max(0,Math.ceil(item.arriveAt-now)));
    if(timer&&timer.textContent!==value)timer.textContent=value;
  }};
})();
