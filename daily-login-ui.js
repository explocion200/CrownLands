/* Approved Daily Login presentation; only server status supplies the reward schedule. */

(function () {

"use strict";

let lastPosition = "", selected = 1;

window.CrownlandsDailyLoginUI = { mount(root, options) {

  const { status, rates, busy, error, claim, items } = options;

  const position = `${status.cycleId}:${status.nextDay}`;

  if(position !== lastPosition){ selected = status.nextDay; lastPosition = position; }

  root.innerHTML = `<section id="dailyRewardPanelRewards" class="dl-cycle daily-shell" role="tabpanel" aria-labelledby="dailyRewardTabRewards">

<header class="daily-header"><span id="headerSeal" class="header-seal" aria-hidden="true"></span><div><p>A gift for your return</p><h1 id="dailyTitle">Daily Login</h1></div><div class="cycle-status"><span id="cycleLabel"></span><strong id="dayLabel"></strong></div></header>

<div class="daily-body"><section class="reward-ledger" aria-label="Daily reward cycle"><div class="ledger-heading"><div><h2>Your royal rewards</h2><p>Four weeks. Yours to finish.</p></div><span id="progressLabel"></span></div><nav id="weekNav" aria-label="Reward weeks"></nav><div id="weeks"></div><footer class="ledger-footer"><span><i class="legend-ready"></i> Ready</span><span><i class="legend-claimed"></i> Collected</span><span class="carry-note">Progress carries across seasons</span></footer></section><section class="reward-detail" aria-label="Selected reward"><div class="detail-heading"><span id="selectedDayLabel"></span><span id="selectedStatus"></span></div><div id="detailScroll" class="detail-scroll"></div><footer class="claim-footer"><p id="claimNote"></p><button id="claimButton" class="claim-button"></button></footer></section></div>

</section>`;

  const $ = selector => root.querySelector(selector);

  const state = { ...status, earnedThrough: status.earnedThroughDay, goldRate: rates.goldPerHour, troopRate: rates.troopsPerHour,

    hasCity: options.hasCity, schedule: status.schedule.map(r => ({ ...r, week: Math.ceil(r.day/7), weekday: (r.day-1)%7+1,

      resource: r.goldHours > 0 ? "gold" : "troops", hours: r.goldHours || r.troopHours, itemId: Object.keys(r.items || {})[0] })) };

  const model = { pending: () => status.pendingCount };

  const weekNumbers = Array.from({length:Math.ceil(state.schedule.length/7)},(_,i)=>i+1);

  let week = Math.ceil(selected/7);

const art={gold:"assets/icons/royal-shop-gold-r1.svg",troops:"assets/icons/daily-login-troops-r1.svg",chest:"assets/icons/common-gear-chest-r1.svg"};



const img=(src,cls="")=>`<img src="${src}" alt="" class="${cls}" draggable="false">`;

const kindName=r=>r.resource==="gold"?"Gold":"troops";

const stateName=day=>day<state.nextDay?"Collected":day===state.nextDay&&model.pending(state)?"Ready to collect":day<=state.earnedThrough?"Queued":day===state.nextDay?"Next login":"Upcoming";

const heroArt=r=>r.commonGearBoxes?art.chest:r.itemId?items[r.itemId].art:art[r.resource];

const bundleLabel=r=>`${r.hours ? `${r.hours} hours of ${kindName(r)}` : "Item reward"}${r.itemId?`, one ${items[r.itemId].label}`:""}${r.commonGearBoxes?", one Common Gear Box":""}`;

function select(day,focus=false){selected=Math.max(1,Math.min(state.schedule.length,day));week=Math.ceil(selected/7);render();$("#detailScroll").scrollTop=0;if(focus)$(`[data-day="${selected}"]`)?.focus();}

function render(){

  $("#cycleLabel").textContent=`Cycle ${state.cycle} · ${state.schedule.length} days`;

  $("#dayLabel").textContent=`Day ${state.nextDay} / ${state.schedule.length}`;

  $("#progressLabel").textContent=`${state.nextDay-1} collected`;

  $("#weekNav").innerHTML=weekNumbers.map(w=>`<button type="button" data-week="${w}" aria-pressed="${w===week}" aria-label="Week ${w}, days ${w*7-6} to ${Math.min(w*7,state.schedule.length)}">Week ${w}<small>${w*7-6}–${Math.min(w*7,state.schedule.length)}</small></button>`).join("");

  $("#weeks").innerHTML=weekNumbers.map(w=>`<section class="week-row ${w===week?"active":""}" aria-label="Week ${w}"><div class="week-heading"><h3>Week ${w}</h3><b class="week-number">${["I","II","III","IV","V"][w-1]}</b><span>Days ${w*7-6}–${Math.min(w*7,state.schedule.length)}</span></div><div class="day-grid">${state.schedule.filter(r=>r.week===w).map(r=>{

    const status=stateName(r.day),classes=[r.day<state.nextDay?"claimed":r.day<=state.earnedThrough?"ready":"upcoming",r.weekday===7?"week-end":r.weekday>=5?"late":"resource"];

    return `<button type="button" class="day-tile ${classes.join(" ")}" data-day="${r.day}" aria-pressed="${r.day===selected}" aria-label="Day ${r.day}, ${bundleLabel(r)}, ${status}"><span class="day-number">Day ${r.day}</span><span class="day-art">${img(heroArt(r))}${r.itemId&&r.hours?`<span class="mini-bonus">${img(art[r.resource])}</span>`:""}</span><strong class="day-reward">${r.hours ? `${r.hours}h ${kindName(r)}` : "1 × Item"}</strong><span class="day-extra">${r.commonGearBoxes?"+ Gear Box":r.itemId?"+ Item":status==="Ready to collect"?"Ready":r.day<state.nextDay?"Collected":"Production"}</span></button>`;

  }).join("")}</div></section>`).join("");

  const reward=state.schedule[selected-1],item=items[reward.itemId],isMilestone=!!reward.commonGearBoxes,resource=kindName(reward),amount=Math.floor(reward.hours*(reward.resource==="gold"?state.goldRate:state.troopRate));

  $("#selectedDayLabel").textContent=`Day ${selected} · Week ${reward.week}`;$("#selectedStatus").textContent=stateName(selected);

  const row=(src,title,detail)=>`<div class="bundle-row">${img(src)}<div><strong>${title}</strong><small>${detail}</small></div></div>`;

  $("#detailScroll").innerHTML=`<div class="reward-hero"><div class="hero-art ${!isMilestone&&!item?"resource":""}">${img(heroArt(reward))}</div><h2>${isMilestone?"The week's bounty":item?"A royal provision":"The royal gift"}</h2><p class="hero-kicker">${isMilestone?"Weekly chest milestone":reward.weekday>=5?"End-of-week reward":"Daily reward"}</p></div><div class="ornament" aria-hidden="true">◆</div><div class="bundle">${reward.hours ? row(art[reward.resource],state.hasCity?`${amount.toLocaleString("en-US")} ${resource}`:`${reward.hours} hours of ${resource}`,`${reward.hours}h of base ${resource} production`) : ""}${item?row(item.art,`1 × ${item.label}`,"Added to your Bag"):""}${isMilestone?row(art.chest,"1 × Common Gear Box","Three Level 1 Common gear pieces"):""}</div><p class="reward-note">${!state.hasCity?"Your progress is safe. Establish your new main city to collect rewards. ":""}${isMilestone?"The seventh day of each week includes a Gear Box. Unopened boxes carry across seasons. ":""}Resource amounts use your base production when collected.</p>`;

  const count=model.pending(state),button=$("#claimButton"),note=$("#claimNote");button.classList.remove("is-link");

  if(selected!==state.nextDay){button.disabled=false;button.textContent=count?"View ready reward":"View next reward";button.classList.add("is-link");note.textContent=selected<state.nextDay?"This reward has been collected.":"Rewards are collected in order.";}

  else if(!state.hasCity){button.disabled=true;button.textContent="Establish your main city";note.textContent="Cycle progress preserved";}

  else if(!count){button.disabled=true;button.textContent="Return next login day";note.textContent="Next reward at 00:00 UTC";}

  else{button.disabled=false;button.textContent=`Claim Day ${state.nextDay}`;note.textContent=count===2?"2 earned rewards waiting":"Your reward is ready";}

  if(busy){button.disabled=true;button.textContent="Collecting…";}

  if(error){note.textContent=error;note.setAttribute("role","alert");}

}



$("#weekNav").addEventListener("click",e=>{const b=e.target.closest("[data-week]");if(!b)return;const w=Number(b.dataset.week),day=state.nextDay>=w*7-6&&state.nextDay<=w*7?state.nextDay:w*7;select(day);$(`[data-week="${w}"]`)?.focus();});

$("#weeks").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(b)select(Number(b.dataset.day),true);});

$("#weeks").addEventListener("keydown",e=>{const b=e.target.closest("[data-day]");if(!b||!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(e.key))return;e.preventDefault();const day=Number(b.dataset.day),cols=matchMedia("(orientation:landscape) and (max-width:650px)").matches?4:7;select(e.key==="Home"?1:e.key==="End"?state.schedule.length:day+(e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:e.key==="ArrowUp"?-cols:cols),true);});



  $("#claimButton").addEventListener("click", event => { if(selected!==state.nextDay){select(state.nextDay);$("#claimButton").focus();return;} if(!busy) claim(event.currentTarget); });

  $("#headerSeal").innerHTML='<svg viewBox="0 0 32 36"><path d="M6 4h20v29H6ZM6 11h20M11 2v5m10-5v5M10 16h3m6 0h3M10 21h3m6 0h3M10 27l3 2 7-6"/></svg>';

  if(status.transition) $(".ledger-heading p").textContent="Finish your saved rewards, then begin four new weeks.";

  $("#weeks").style.setProperty("--daily-weeks",weekNumbers.length);

  render();

} };

})();

