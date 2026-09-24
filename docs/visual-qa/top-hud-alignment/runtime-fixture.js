"use strict";
(() => {
 if(location.hostname!=="127.0.0.1"||!window.__CROWNLANDS_BENCHMARK__||!window.CrownlandsOnline?.__getBenchmarkTelemetry)throw Error("Isolated HUD fixture required");
 const root=document.documentElement,api=window.__CROWNLANDS_BENCHMARK__,row=document.querySelector(".profile-action-row"),gold=document.querySelector(".profile-gold");
 const guide=document.createElement("div");guide.id="hudAlignmentGuide";guide.setAttribute("aria-hidden","true");document.body.append(guide);
 let previousZoom=0;
 const inform=message=>parent.postMessage({type:"hud-alignment-status",message},location.origin);
 function measure(){const a=row.getBoundingClientRect(),b=gold.getBoundingClientRect();Object.assign(guide.style,{left:b.left+"px",top:a.top+"px",height:b.bottom-a.top+8+"px"});return{rowLeft:a.left,goldLeft:b.left,difference:a.left-b.left};}
 async function apply({look="draft",zoom=1,guide:showGuide=true}={}){
  root.classList.toggle("hud-alignment-draft",look!=="current");root.dataset.hudAlignmentLook=look;guide.hidden=!showGuide;
  if(previousZoom!==zoom){previousZoom=zoom;await api.setVisualZoom(zoom);}
  const m=measure();root.dataset.hudAlignmentApplied="true";
  inform(look==="current"?"Current game · Top row starts "+m.difference+"px to the right of Gold":"Aligned draft · Top row moved 7px left · Same sizes and spacing");
 }
 window.addEventListener("resize",measure);
 document.addEventListener("click",event=>{const target=event.target.closest("#profileBtn,#leaderboardBtn,#clanHudBtn,#dailyLoginRewardBtn,#inventoryBtn,#shopBtn,#cityListBtn,#islandSwitchBtn,#logBtn,#incomingAttackBtn,#outgoingAttackBtn,#mainCityReturnBtn,#fullscreenBtn,#openChatLedger,[data-retaliation-location]");if(!target)return;event.preventDefault();event.stopImmediatePropagation();inform((target.getAttribute("aria-label")||target.title||"Navigation")+" · Appearance preview only");},true);
 window.HudAlignmentDraft={apply,measure};api.closeModal();pendingOfflineRewardsSummary=null;
})();
