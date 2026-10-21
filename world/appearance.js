/* Original map banners and march tokens on the continuous camera. Only the
   authorized area's public fields and explicitly disclosed counts are used. */
(function(){
  "use strict";
  const rendered=new WeakMap();
  const esc=value=>escapeHtml(String(value??""));
  const own=item=>Boolean(item.ownerUid&&item.ownerUid===getCurrentOnlineUid());
  const ally=item=>Boolean(!own(item)&&item.ownerClanId&&item.ownerClanId===state.clanId);
  const relation=item=>own(item)?"player":ally(item)?"clan-ally":item.ownerUid?"enemy":"neutral";
  const count=item=>item.troopVisibility==="exact"&&Number.isFinite(item.troops)?formatNumber(item.troops):item.troopVisibility==="estimate"?esc(item.troopEstimateLabel):"?";
  const flag=item=>item.ownerFlag?'<span class="kingdom-flag city-owner-flag city-kingdom-flag" aria-hidden="true"><span class="flag-symbol"></span></span>':`<span class="city-owner-flag owner-flag" aria-hidden="true">${renderCrownlandsIcon(OWNER.neutral.flagIcon,"owner-flag-icon")}</span>`;
  function render(node,item,{inspector=false,selected=false}={}){
    if(inspector)return;
    if(item.kind==="scenery")return;
    const owner=relation(item),now=Date.now();
    const countdown=item.kind==="camp"?item.payoutPending?formatDuration(Math.max(0,Math.ceil((item.payoutAtMs-now)/1000))):"Securing":item.kind==="npc"&&!item.selectable?item.respawnAtMs>now?"Respawn "+formatDuration(Math.ceil((item.respawnAtMs-now)/1000)):"Awaiting respawn":"";
    const main=item.isMainCity===true||(own(item)&&item.id===state.mainCityId&&item.sectionId===getMainCityRegionId());
    const signature=JSON.stringify([item.key,item.name,item.kind,item.owner,item.ownerUid,item.ownerFlag,item.ownerClanId,item.ownerClanTag,item.level,item.campType,item.classification,item.troopVisibility,item.troops,item.troopEstimateLabel,item.selectable,item.missionKind,selected,owner,countdown,main]);
    if(rendered.get(node)===signature)return;
    rendered.set(node,signature);
    node.classList.remove("player","enemy","neutral","clan-ally");node.classList.add(owner);
    node.classList.toggle("main-city-node",main);
    node.classList.toggle("selected",selected);
    if(item.kind==="troop"){
      node.classList.add("army-token");
      const shown=item.troopVisibility!=="hidden";
      node.innerHTML=`<span class="army-token-icon">${item.missionKind==="scout"?renderCrownlandsIcon("scout","army-token-svg"):item.missionKind==="transfer"?"♞":"⚔"}</span><strong class="army-token-count"${shown?"":" hidden"}>${shown?count(item):""}</strong><small class="army-token-time"></small>`;
      node.setAttribute("aria-label",`${item.owner||"Ruler"} · ${item.missionKind||"Army"}${shown?" · "+count(item)+" troops":""}`);
      return;
    }
    node.querySelector(".tag")?.remove();node.querySelector(".map-banner")?.remove();
    const label=document.createElement("span");label.className="map-banner";
    const name=`<strong class="city-name">${esc(item.name)}</strong>`,level=`<span class="city-label-level">${esc(item.level??"")}</span>`;
    const clan=item.ownerClanTag?`<strong class="map-city-clan-tag">[${esc(item.ownerClanTag)}]</strong>`:"";
    const ruler=`<span class="city-ruler-row"><strong class="${own(item)?"city-ruler-name":"foreign-ruler-name"}">${esc(item.owner)}</strong></span>`;
    if(item.kind==="npc"){
      label.innerHTML=`<span class="native-npc-label">${item.classification==="boss"?"Boss":"Marauder"} · ${esc(item.level??"")}${countdown?" · "+esc(countdown):""}</span>`;
    }else if(item.kind==="tower"){
      label.innerHTML=`<span class="holding-tower-clan-banner">${item.owner!=="Neutral"?ruler:""}</span><span class="holding-tower-map-label">${esc(item.name)}</span>`;
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
    node.setAttribute("aria-label",`${item.name} · ${item.sectionName} · ${item.owner}${item.level?" · Level "+item.level:""}`);
  }
  window.SeamlessAppearance={render,tickMarch(node,item,now){
    const timer=node.querySelector(".army-token-time"),value=formatDuration(Math.max(0,Math.ceil(item.arriveAt-now)));
    if(timer&&timer.textContent!==value)timer.textContent=value;
  }};
})();
