"use strict";
/* All state is synthetic, in memory. No account, storage, backend or ad calls. */
const $=s=>document.querySelector(s),model=window.DailyLoginDraft;
const art={gold:"assets/icons/royal-shop-gold-r1.svg",troops:"docs/visual-qa/daily-login-cycle/troops.svg",chest:"assets/icons/common-gear-chest-r1.svg"};
const items={
  war_drums_30m:{label:"War Drums",art:"assets/optimized/item-war-drums-384x384-40892cafa303.webp"},
  veil_of_silence_30m:{label:"Veil of Silence",art:"assets/optimized/item-veil-of-silence-384x384-45fcf6e08b34.webp"},
  royal_tax_decree_30m:{label:"Royal Tax Decree",art:"assets/optimized/item-royal-tax-decree-384x384-86d99a278ab1.webp"},
  swift_march_order:{label:"Swift March Order",art:"assets/optimized/item-swift-march-384x384-cbdfa5099ab0.webp"},
  recall_horn:{label:"Recall Horn",art:"assets/optimized/item-recall-horn-384x384-66b7bde99a6d.webp"},
  shield_12h:{label:"Royal Peace Shield",art:"assets/optimized/item-peace-shield-384x384-c74d2eb2f8ac.webp"}
};
let seed=4821,state=model.fixture(),selected=state.nextDay,week=Math.ceil(selected/7),message="";
const img=(src,cls="")=>`<img src="${src}" alt="" class="${cls}" draggable="false">`;
const kindName=r=>r.resource==="gold"?"Gold":"troops";
const stateName=day=>day<state.nextDay?"Collected":day===state.nextDay&&model.pending(state)?"Ready to collect":day<=state.earnedThrough?"Queued":day===state.nextDay?"Next login":"Upcoming";
const heroArt=r=>r.commonGearBoxes?art.chest:r.itemId?items[r.itemId].art:art[r.resource];
const bundleLabel=r=>`${r.hours} hours of ${kindName(r)}${r.itemId?`, one ${items[r.itemId].label}`:""}${r.commonGearBoxes?", one Common Gear Box":""}`;
function announce(text){message=text;$("#liveStatus").textContent=text;parent.postMessage({type:"daily-login-status",message:text,needsCity:!state.hasCity},location.origin);}
function select(day,focus=false){selected=Math.max(1,Math.min(28,day));week=Math.ceil(selected/7);render();$("#detailScroll").scrollTop=0;if(focus)$(`[data-day="${selected}"]`)?.focus();}
function render(){
  $("#cycleLabel").textContent=`Cycle ${state.cycle} · 28 days`;
  $("#dayLabel").textContent=`Day ${state.nextDay} / 28`;
  $("#progressLabel").textContent=`${state.nextDay-1} collected`;
  $("#weekNav").innerHTML=[1,2,3,4].map(w=>`<button type="button" data-week="${w}" aria-pressed="${w===week}" aria-label="Week ${w}, days ${w*7-6} to ${w*7}">Week ${w}<small>${w*7-6}–${w*7}</small></button>`).join("");
  $("#weeks").innerHTML=[1,2,3,4].map(w=>`<section class="week-row ${w===week?"active":""}" aria-label="Week ${w}"><div class="week-heading"><h3>Week ${w}</h3><b class="week-number">${["I","II","III","IV"][w-1]}</b><span>Days ${w*7-6}–${w*7}</span></div><div class="day-grid">${state.schedule.filter(r=>r.week===w).map(r=>{
    const status=stateName(r.day),classes=[r.day<state.nextDay?"claimed":r.day<=state.earnedThrough?"ready":"upcoming",r.weekday===7?"week-end":r.weekday>=5?"late":"resource"];
    return `<button type="button" class="day-tile ${classes.join(" ")}" data-day="${r.day}" aria-pressed="${r.day===selected}" aria-label="Day ${r.day}, ${bundleLabel(r)}, ${status}"><span class="day-number">Day ${r.day}</span><span class="day-art">${img(heroArt(r))}${r.itemId?`<span class="mini-bonus">${img(art[r.resource])}</span>`:""}</span><strong class="day-reward">${r.hours}h ${kindName(r)}</strong><span class="day-extra">${r.commonGearBoxes?"+ Gear Box":r.itemId?"+ Item":status==="Ready to collect"?"Ready":r.day<state.nextDay?"Collected":"Production"}</span></button>`;
  }).join("")}</div></section>`).join("");
  const reward=state.schedule[selected-1],item=items[reward.itemId],isMilestone=!!reward.commonGearBoxes,resource=kindName(reward),amount=Math.floor(reward.hours*(reward.resource==="gold"?state.goldRate:state.troopRate));
  $("#selectedDayLabel").textContent=`Day ${selected} · Week ${reward.week}`;$("#selectedStatus").textContent=stateName(selected);
  const row=(src,title,detail)=>`<div class="bundle-row">${img(src)}<div><strong>${title}</strong><small>${detail}</small></div></div>`;
  $("#detailScroll").innerHTML=`<div class="reward-hero"><div class="hero-art ${!isMilestone&&!item?"resource":""}">${img(heroArt(reward))}</div><h2>${isMilestone?"The week's bounty":item?"A royal provision":"The royal gift"}</h2><p class="hero-kicker">${isMilestone?"Weekly chest milestone":reward.weekday>=5?"End-of-week reward":"Daily reward"}</p></div><div class="ornament" aria-hidden="true">◆</div><div class="bundle">${row(art[reward.resource],state.hasCity?`${amount.toLocaleString("en-US")} ${resource}`:`${reward.hours} hours of ${resource}`,`${reward.hours}h of base ${resource} production`)}${item?row(item.art,`1 × ${item.label}`,"Added to your Bag"):""}${isMilestone?row(art.chest,"1 × Common Gear Box","Three Level 1 Common gear pieces"):""}</div><p class="reward-note">${!state.hasCity?"Your progress is safe. Establish your new main city to collect rewards. ":""}${isMilestone?"The seventh day of each week includes a Gear Box. Unopened boxes carry across seasons. ":""}Resource amounts use your base production when collected.</p>`;
  const count=model.pending(state),button=$("#claimButton"),note=$("#claimNote");button.classList.remove("is-link");
  if(selected!==state.nextDay){button.disabled=false;button.textContent=count?"View ready reward":"View next reward";button.classList.add("is-link");note.textContent=selected<state.nextDay?"This reward has been collected.":"Rewards are collected in order.";}
  else if(!state.hasCity){button.disabled=true;button.textContent="Establish your main city";note.textContent="Cycle progress preserved";}
  else if(!count){button.disabled=true;button.textContent="Return next login day";note.textContent="Next reward at 00:00 UTC";}
  else{button.disabled=false;button.textContent=`Claim Day ${state.nextDay}`;note.textContent=count===2?"2 earned rewards waiting":"Your reward is ready";}
}
$("#weekNav").addEventListener("click",e=>{const b=e.target.closest("[data-week]");if(!b)return;const w=Number(b.dataset.week),day=state.nextDay>=w*7-6&&state.nextDay<=w*7?state.nextDay:w*7;select(day);$(`[data-week="${w}"]`)?.focus();});
$("#weeks").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(b)select(Number(b.dataset.day),true);});
$("#weeks").addEventListener("keydown",e=>{const b=e.target.closest("[data-day]");if(!b||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key))return;e.preventDefault();const day=Number(b.dataset.day),cols=matchMedia("(orientation:landscape) and (max-width:650px)").matches?4:7;select(e.key==="Home"?1:e.key==="End"?28:day+(e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:e.key==="ArrowUp"?-cols:cols),true);});
$("#claimButton").addEventListener("click",()=>{if(selected!==state.nextDay){select(state.nextDay);$("#claimButton").focus();return;}const reward=model.claim(state);if(!reward)return;selected=state.nextDay;week=Math.ceil(selected/7);render();announce(`Collected Cycle ${reward.cycle}, Day ${reward.day}: ${bundleLabel(reward)}. ${state.cycle!==reward.cycle?`Cycle ${state.cycle} has a fresh arrangement. Today's login is already counted; the next day does not unlock early.`:`${model.pending(state)} earned reward(s) waiting.`}`);$(`[data-day="${reward.day}"]`)?.classList.add("just-claimed");$("#claimButton").focus();});
$("#closeDaily").addEventListener("click",()=>{$("#dailyDialog").close();$("#dismissed").hidden=false;});$("#dailyDialog").addEventListener("cancel",()=>{$("#dismissed").hidden=false;});$("#reopen").addEventListener("click",()=>{$("#dismissed").hidden=true;$("#dailyDialog").showModal();});
window.addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=="daily-login-review")return;
  const action=e.data.action;
  if(action==="reset"){state=model.fixture(e.data.sample,seed);selected=state.nextDay;message=`Cycle ${state.cycle}, Day ${state.nextDay}. ${model.pending(state)} earned reward(s) waiting. All values are sample data.`;}
  else if(action==="next-day"||action==="missed"){const before=state.earnedThrough;model.advance(state,action==="missed"?7:1);selected=state.nextDay;message=action==="missed"?`Seven days away did not skip rewards. Earned progress moved by ${state.earnedThrough-before} day; ${model.pending(state)} reward(s) waiting.`:`New UTC login day. ${model.pending(state)} earned reward(s) waiting; the queue is capped at two.`;}
  else if(action==="season"){model.seasonReset(state);message=`Season changed: Cycle ${state.cycle}, Day ${state.nextDay}, ${model.pending(state)} queued reward(s) and the same reward arrangement are preserved. Establish the sample city to collect.`;}
  else if(action==="city"){model.establishCity(state);message="Sample main city established. Same cycle, same day and same arrangement; resource rewards now use the new base production.";}
  else if(action==="fresh"){seed++;state=model.fixture("ready",seed);state.cycle=4+(seed-4822);state.nextDay=1;state.earnedThrough=1;selected=1;message=`New example cycle ${state.cycle}: a different arrangement, the same 111h Gold + 111h troops + six items + four Gear Boxes. This review control cannot reroll a live cycle.`;}
  else return;
  week=Math.ceil(selected/7);render();if(!$("#dailyDialog").open){$("#dismissed").hidden=true;$("#dailyDialog").showModal();}announce(message);
});
$("#headerSeal").innerHTML='<svg viewBox="0 0 32 36"><path d="M6 4h20v29H6ZM6 11h20M11 2v5m10-5v5M10 16h3m6 0h3M10 21h3m6 0h3M10 27l3 2 7-6"/><path d="M3 7v28h20"/></svg>';
render();$("#dailyDialog").showModal();announce("Daily Login draft ready. Select a day to inspect its full reward bundle.");
