"use strict";
// Isolated review only: real definitions, deterministic sample rewards, no account or network actions.
const G=window.CROWNLANDS_COMMON_GEAR,dialog=document.getElementById("boxDialog"),chest=createIllustratedChest(document.getElementById("chestArt"));
const media=matchMedia("(prefers-reduced-motion: reduce)"),sampleCounts={ready:5,rewards:3,last:1,empty:0,slow:3,error:3,retry:3};
const demoGroups=[[["barracks","head"],["treasury","necklace"],["royal-stables","necklace"]],[["gatehouse","weapon"],["barracks","necklace"],["treasury","weapon"]],[["royal-stables","weapon"],["gatehouse","necklace"],["treasury","chest"]]];
const chestIcon='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path fill="currentColor" fill-opacity=".12" d="M4 13V8l8-4 17 5v17L12 30l-8-5Z"/><path d="m4 8 17 5 8-4M4 13l17 5 8-4M21 13v17M9 10v17m8-14v16M4 21l17 5 8-5"/><path fill="currentColor" d="m11 15 5 1v6l-5-1Z"/></svg>';
document.querySelector(".box-seal").innerHTML=chestIcon;document.querySelector(".count-icon").innerHTML=chestIcon;
let sample="ready",motion="auto",remaining=5,phase="ready",busy=false,error="",rewards=[],opened=0,generation=0,failedOnce=false;
const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const title=value=>value.charAt(0).toUpperCase()+value.slice(1);
const effectiveMotion=()=>media.matches&&motion!=="off"?"reduced":motion==="auto"?"full":motion;
const announce=message=>{document.getElementById("liveStatus").textContent=message;parent.postMessage({type:"gear-box-status",message},location.origin);};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function makeRewards(index){return demoGroups[index%demoGroups.length].map(([building,slot])=>G.DEFINITIONS.find(d=>d.buildingId===building&&d.slot===slot));}
function rewardCard(d,index){const role=G.BUILDINGS[d.buildingId].characterRole,name=d.gearName.replace(role+"'s ","");return `<article class="reward-card" aria-label="${escape(d.gearName)}" style="--order:${index}"><div class="rarity-line"><span><i aria-hidden="true"></i> Common</span><span>Level 1</span></div><div class="reward-record" tabindex="0" aria-label="${escape(d.gearName)} details"><div class="reward-hero"><div class="reward-art"><img src="${escape(d.art)}" alt="" draggable="false"></div><div><p class="officer-name">${escape(role)}</p><h3>${escape(name)}</h3><p class="item-meta">${escape(G.BUILDINGS[d.buildingId].name)} · ${title(d.slot)}</p></div></div><div class="item-effect"><strong>+${G.getBonusPercent(1).toFixed(2)}<span>%</span></strong><p>${escape(title(d.statLabel))}</p></div></div></article>`;}
function button(action,label,primary=false,disabled=false){return `<button type="button" data-action="${action}" class="${primary?"primary":"secondary"}" ${disabled?"disabled":""}>${label}</button>`;}
function render(focus=false){
  const showingRewards=phase==="revealed",empty=remaining===0&&!rewards.length;
  document.documentElement.dataset.motion=effectiveMotion();document.documentElement.dataset.phase=phase;
  document.getElementById("remaining").textContent=remaining;
  document.querySelector(".box-count small").textContent=remaining===1?"box remaining":"boxes remaining";
  document.querySelector(".box-count").setAttribute("aria-label",`${remaining} unopened ${remaining===1?"box":"boxes"}`);
  document.getElementById("boxTitle").textContent=showingRewards?"Common Gear Found":"Common Gear Box";
  document.querySelector(".chest-view").hidden=showingRewards;
  document.querySelector(".reward-view").hidden=!showingRewards;
  document.querySelector(".chest-stage").classList.toggle("is-opening",busy);
  document.querySelector(".chest-stage").classList.toggle("is-empty",empty);
  document.querySelector(".contents-promise").hidden=empty;
  document.getElementById("chestTitle").innerHTML=empty?"No unopened boxes":"Break the seal.<br>Equip your realm.";
  document.querySelector(".chest-description").innerHTML=empty?"Your equipment is waiting<br> in the Inner Castle.":"An oak chest, bound in iron.<br> Three pieces of Common equipment inside.";
  const status=document.getElementById("openingStatus");status.textContent=error|| (busy?"Opening your box…":remaining===1?"Your last unopened box.":"");status.classList.toggle("error",!!error);
  document.querySelector(".box-content").setAttribute("aria-busy",String(busy));
  if(showingRewards)document.querySelector(".reward-cards").innerHTML=rewards.map(rewardCard).join("");
  const rewardStatus=document.querySelector(".stored-mark");rewardStatus.innerHTML=error?"No box used · Try again":'<span aria-hidden="true">✓</span> Added to your equipment';rewardStatus.classList.toggle("error",!!error);
  document.querySelector(".footer-note").textContent=showingRewards?(remaining?`${remaining} ${remaining===1?"box":"boxes"} still to open`:"All your boxes are opened."):busy?"One box is opening…":empty?"Visit your officers to manage gear.":"One box · Three pieces";
  document.querySelector(".footer-actions").innerHTML=showingRewards?button("later","Equip Later")+button("castle","Go to Inner Castle")+(remaining?button("another",`${error?"Try Again":"Open Another Box"} <span class="button-count">${remaining}</span>`,true,busy):""):button("later","Back to Bag")+(empty?button("castle","Go to Inner Castle",true):button("open",busy?"Opening…":error?"Try Again":"Open Box",true,busy));
  if(phase==="dismissed"){if(dialog.open)dialog.close();document.getElementById("dismissed").hidden=false;}
  else{document.getElementById("dismissed").hidden=true;if(!dialog.open)dialog.showModal();if(focus)requestAnimationFrame(()=>dialog.querySelector(showingRewards&&remaining?'[data-action="another"]':showingRewards||empty?'[data-action="castle"]':'[data-action="open"]')?.focus({preventScroll:true}));}
}
async function animateOpening(token){
  if(effectiveMotion()!=="full"||document.hidden||phase==="dismissed"){chest.setOpen(1);return;}
  await new Promise(resolve=>{const start=performance.now();function frame(now){if(token!==generation){resolve();return;}const raw=Math.min(1,(now-start)/900),p=1-Math.pow(1-raw,3);if(effectiveMotion()!=="full"||document.hidden||phase==="dismissed"){chest.setOpen(1);resolve();return;}chest.setOpen(p);if(raw<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
}
async function openOne(){
  if(busy||remaining<1||phase==="dismissed")return;
  const token=generation;busy=true;error="";phase="opening";chest.setOpen(0);render();announce("Opening one demonstration box…");
  await wait(sample==="slow"?2000:effectiveMotion()==="off"?0:320);
  if(token!==generation)return;
  if(["error","retry"].includes(sample)&&!failedOnce){failedOnce=true;busy=false;error="The chest could not be opened. Try again.";if(phase!=="dismissed")phase=rewards.length?"revealed":"ready";chest.setOpen(0);render(true);announce("Opening failed in this example. No box was used and no items were added.");return;}
  // Represents one successful authoritative receipt. Presentation never determines rewards or count.
  remaining-=1;rewards=makeRewards(opened);opened+=1;
  document.getElementById("remaining").textContent=remaining;
  await animateOpening(token);
  if(token!==generation)return;
  busy=false;if(phase!=="dismissed")phase="revealed";render(true);
  announce(`3 Common Level 1 pieces added in the preview. ${remaining} ${remaining===1?"box":"boxes"} remaining.`);
}
function reset(next="ready"){
  generation+=1;sample=Object.hasOwn(sampleCounts,next)?next:"ready";remaining=sampleCounts[sample];const hasRewards=["rewards","retry"].includes(sample);phase=hasRewards?"revealed":"ready";busy=false;error="";opened=hasRewards?1:0;failedOnce=false;rewards=hasRewards?makeRewards(0):[];chest.setOpen(rewards.length?1:0);render(true);announce("Interactive draft · Demonstration inventory reset");
}
function dismiss(destination="closed"){
  phase="dismissed";render();document.getElementById("dismissedNote").textContent=destination==="castle"?"Go to Inner Castle selected. This draft stays separate from your game.":"Gear Box preview closed. Your sample rewards are retained.";document.getElementById("reopen").focus();announce(destination==="castle"?"Preview: Go to Inner Castle. No game navigation or inventory changes.":"Preview closed. Reopen to continue the demonstration.");
}
document.querySelector(".footer-actions").addEventListener("click",event=>{const b=event.target.closest("button[data-action]");if(!b||b.disabled)return;if(["open","another"].includes(b.dataset.action))openOne();else dismiss(b.dataset.action);});
document.querySelector(".close").addEventListener("click",()=>dismiss());dialog.addEventListener("cancel",event=>{event.preventDefault();dismiss();});
document.getElementById("reopen").addEventListener("click",()=>{phase=busy?"opening":rewards.length?"revealed":"ready";render(true);});
media.addEventListener("change",()=>render());
window.addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=="gear-box-review")return;const data=event.data;if(["auto","full","reduced","off"].includes(data.motion))motion=data.motion;if(["reset","replay"].includes(data.action)){reset(data.sample);if(data.action==="replay")openOne();}else render();});
window.gearBoxDraft={reset,open:openOne,setMotion(value){if(["auto","full","reduced","off"].includes(value)){motion=value;render();}},getState:()=>({sample,motion,effectiveMotion:effectiveMotion(),remaining,phase,busy,error,opened,rewards:rewards.map(d=>d.gearKey),totalPieces:opened*G.BOX_REVEAL_COUNT,animationProgress:Number(chest.svg.dataset.open)})};
reset();document.documentElement.dataset.ready="true";
