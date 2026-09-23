"use strict";
// Presentation-only, loopback-only fixtures. Never loaded by the production entry.
(() => {
 if(location.hostname!=="127.0.0.1"||!window.__CROWNLANDS_BENCHMARK__||!window.CrownlandsOnline?.__getBenchmarkTelemetry)throw Error("Isolated HUD fixture required");
 const api=window.__CROWNLANDS_BENCHMARK__,root=document.documentElement,$=id=>document.getElementById(id);
 const prefix="/docs/visual-qa/main-screen-art/",originals=[];
 for(const[selector,asset]of[
  ["#inventoryBtn img",prefix+"art/hud-bag-r1.webp"],["#shopBtn img",prefix+"art/hud-shop-r1.webp"],
  ["#cityListBtn img",prefix+"art/hud-cities-r1.webp"],["#islandSwitchBtn img",prefix+"art/hud-map-r1.webp"],
  ["#leaderboardBtn img",prefix+"leaderboard.svg"],["#dailyLoginRewardBtn img","/assets/icons/reward-daily-login-r1.svg"]
 ]){const el=document.querySelector(selector);if(el)originals.push({el,src:el.getAttribute("src"),asset});}
 const oldReport=document.querySelector("#logBtn .report-icon"),newReport=document.createElementNS("http://www.w3.org/2000/svg","svg");
 newReport.setAttribute("class","nav-icon report-icon hud-art-report");newReport.setAttribute("viewBox","0 0 64 64");newReport.setAttribute("aria-hidden","true");
 newReport.innerHTML='<use href="/assets/icons/battle-reports-ledger-r1.svg#dispatch"></use>';
 oldReport.after(newReport);
 const oldFrame=getComputedStyle($("profileBtn"),"::before").backgroundImage;
 let previousSample="",previousZoom=0;
 const inform=message=>parent.postMessage({type:"hud-art-status",message},location.origin);
 function setSample(sample){
  if(sample===previousSample)return;previousSample=sample;
  const now=Date.now(),active=sample==="active",protectedMap=sample==="protected";
  state.itemEffects={...createDefaultItemEffects(),shieldExpiresAtMs:protectedMap?now+7*3600000:0,warDrumsExpiresAtMs:active||protectedMap?now+1428000:0,royalTaxDecreeExpiresAtMs:active||protectedMap?now+1112000:0,veilOfSilenceExpiresAtMs:active||protectedMap?now+276000:0};
  const city=state.cities.find(c=>c.owner==="player");
  onlineCombatAuthorization={uid:getCurrentOnlineUid(),shieldExpiresAtMs:active?now+814000:0,retaliation:active&&city?[{id:"hud-draft-retaliation",cityId:city.id,cityName:city.name,regionId:getCityRegionId(city),status:"available",expiresAtMs:now+648000}]:[]};
  updateShieldStatusBadge();renderCombatTimers();api.setHudOperationState(active?"both":"none");
 }
 async function apply({look="draft",sample="active",zoom:nextZoom=1}={}){
  const draft=look!=="current";root.classList.toggle("hud-art-draft",draft);root.dataset.hudArtLook=draft?"draft":"current";
  for(const{el,src,asset}of originals)el.src=draft?asset:src;
  oldReport.hidden=draft;newReport.style.display=draft?"":"none";
  setSample(sample);
  const requested=[1,1.6,2.2].includes(nextZoom)?nextZoom:1;
  if(requested!==previousZoom){previousZoom=requested;await api.setVisualZoom(requested);}
  root.dataset.hudArtApplied="true";
  inform(draft?"Parchment & ink draft · Existing control sizes and positions":"Current game · Original artwork and burgundy controls");
 }
 window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="hud-art-apply")apply(event.data);});
 // Keep the design review on the map. The real chat arrow still expands/collapses.
 document.addEventListener("click",event=>{
  const target=event.target.closest("#profileBtn,#leaderboardBtn,#clanHudBtn,#dailyLoginRewardBtn,#inventoryBtn,#shopBtn,#cityListBtn,#islandSwitchBtn,#logBtn,#incomingAttackBtn,#outgoingAttackBtn,#mainCityReturnBtn,#fullscreenBtn,#openChatLedger,[data-retaliation-location]");
  if(!target)return;event.preventDefault();event.stopImmediatePropagation();
  inform((target.getAttribute("aria-label")||target.title||target.textContent.trim()||"Navigation")+" · Appearance preview only");
 },true);
 window.HudArtDraft={apply,originalFrame:oldFrame,assets:originals.map(({src,asset})=>({src,asset}))};
 api.closeModal();pendingOfflineRewardsSummary=null;
 parent.postMessage({type:"hud-art-fixture-ready"},location.origin);
})();
