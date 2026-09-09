"use strict";
/* global cityDetailsIcon */
// Design fixture only. This page has no Firebase client, auth, or game mutations.
const seeds = [
  {id:"wyvern",name:"Wyvernmarket Mead",region:"Kingsbridge",level:82,troops:281240,goldRate:120830,troopRate:108240,cost:42350,main:true},
  {id:"oak",name:"Oakhaven",region:"Kingsbridge",level:72,troops:96500,goldRate:61820,troopRate:48570,cost:21800},
  {id:"aurum",name:"Aurum Keep",region:"Gilded Moor",level:62,troops:84500,stronghold:true},
  {id:"river",name:"Rivermill",region:"Dawncrest",level:54,troops:42180,goldRate:24820,troopRate:18370,cost:14820},
  {id:"stone",name:"Stoneford",region:"Dawncrest",level:41,troops:24680,goldRate:12200,troopRate:8520,cost:8420},
  {id:"rose",name:"Rosewatch",region:"Elderglen",level:29,troops:14220,goldRate:4280,troopRate:3400,cost:5270},
  {id:"briar",name:"Briarwick",region:"Elderglen",level:18,troops:8240,goldRate:2110,troopRate:1840,cost:2830},
  {id:"moss",name:"Mossfield",region:"Kingsbridge",level:12,troops:3800,goldRate:1120,troopRate:870,cost:1260},
  {id:"hollow",name:"Hollowmead",region:"Elderglen",level:6,troops:1420,goldRate:570,troopRate:480,cost:630},
];
let cities, gold, page, sortKey, ascending, rosterState, stages, announcementTimer, generation=0;
const rowTimers = new Map();
const $ = selector => document.querySelector(selector);
const number = value => Math.floor(value).toLocaleString("en-US");
const locateIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/></svg>';
function announce(text) { clearTimeout(announcementTimer);$("#announcement").textContent=text;$("#announcement").classList.add("visible");announcementTimer=setTimeout(()=>$("#announcement").classList.remove("visible"),3500); }
function artwork(city) {
  if(city.stronghold)return "../../../assets/worlds/core-expansion-v1/art/stronghold-gold-37d993bdce7f.webp";
  const stage=city.level>=100?5:city.level>=75?4:city.level>=50?3:city.level>=25?2:1;
  return "../../../"+stages[stage];
}
function option(city, mode) {
  let count=0,total=0;
  const requested=mode==="max"?Infinity:Number(mode);
  while(count<requested) {
    const next=Math.round(city.cost*Math.pow(1.11,count));
    if(mode==="max"&&total+next>gold)break;
    total+=next;count++;
  }
  return {count,cost:total,disabled:!count||total>gold};
}
function row(city) {
  const status=city.pending?`${city.pending} level${city.pending===1?"":"s"} syncing…`:city.message|| (city.stronghold?"":"Gold cost shown below each choice");
  return `<article class="city-row ${city.stronghold?"stronghold":""}" data-city="${city.id}" aria-label="${city.name}">
    <div class="identity"><img src="${artwork(city)}" alt="" draggable="false"><div class="identity-copy">${city.main?`<span class="main-seal">${cityDetailsIcon("allegiance")} Main city</span>`:""}<button type="button" class="city-name" data-info="${city.id}" aria-label="Open ${city.name} details">${city.name}</button><small>${city.region}${city.stronghold?" · Stronghold":""}</small></div></div>
    <div class="city-level"><span>Level</span>${city.stronghold?"SH":number(city.level)}</div>
    <div class="garrison">${number(city.troops)}<small>troops</small></div>
    <div class="production">${city.stronghold?`<span>${cityDetailsIcon("coin")} +8% gold</span><small>Owner bonus while held</small>`:`<span title="${number(city.goldRate)} gold per hour">${cityDetailsIcon("coin")}${number(city.goldRate)}</span><span title="${number(city.troopRate)} troops per hour">${cityDetailsIcon("troops")}${number(city.troopRate)}</span>`}</div>
    <div class="row-actions">${city.stronghold?`<div class="stronghold-actions"><span>Held for your kingdom</span><button type="button" class="locate" data-locate="${city.id}" aria-label="Locate ${city.name}">${locateIcon}</button></div>`:`<div class="upgrade-buttons">${["1","5","max"].map(mode=>{const o=option(city,mode);return `<button type="button" data-upgrade="${mode}" data-id="${city.id}" ${o.disabled?"disabled":""} aria-label="${mode==="max"?"MAX":"+"+mode} ${city.name}: ${number(o.cost)} gold" title="${number(o.count)} levels · ${number(o.cost)} gold"><strong>${mode==="max"?"MAX":"+"+mode}</strong><small>${o.count?number(o.cost):"—"}</small></button>`;}).join("")}<button class="locate" type="button" data-locate="${city.id}" aria-label="Locate ${city.name}">${locateIcon}</button></div><span class="row-state ${city.pending?"pending":city.message?"success":""}">${status}</span>`}</div>
  </article>`;
}
function visibleCities() { return rosterState==="empty"?[]:rosterState==="partial"?cities.slice(0,6):cities; }
function render() {
  const list=visibleCities();const pages=Math.max(1,Math.ceil(list.length/5));page=Math.min(page,pages-1);
  const regular=list.filter(c=>!c.stronghold).length,strongholds=list.filter(c=>c.stronghold).length;
  $("#availableGold").textContent=number(gold);
  $("#rosterSummary").innerHTML=`<strong>${rosterState==="partial"?regular+" / 8":regular} cities</strong><i>·</i><strong>${strongholds} Stronghold${strongholds===1?"":"s"}</strong><i>·</i>Across ${new Set(list.map(c=>c.region)).size} regions`;
  document.querySelectorAll("[data-sort]").forEach(button=>{const active=button.dataset.sort===sortKey;button.setAttribute("aria-pressed",String(active));button.querySelector(".sort-direction").textContent=active?(ascending?"Low to high ↑":"High to low ↓"):"Sort";});
  const notice=$("#rosterNotice");notice.hidden=!["syncing","partial"].includes(rosterState);
  notice.innerHTML=rosterState==="partial"?'<span>Full roster unavailable. Showing saved cities.</span><button type="button" id="retryRoster">Retry sync</button>':'<span>Syncing the full city roster… You can keep using saved cities.</span>';
  $("#cityRows").innerHTML=list.length?list.slice(page*5,page*5+5).map(row).join(""):`<section class="empty">${cityDetailsIcon("city")}<h2>Your ledger is waiting</h2><p>Your owned cities and Strongholds will appear here.</p></section>`;
  $("#shownCount").textContent=list.length?`${page*5+1}–${Math.min(list.length,page*5+5)} of ${list.length} holdings`:"No holdings to show";
  $("#pageNumber").textContent=`${page+1} / ${pages}`;$("#prevPage").disabled=page===0;$("#nextPage").disabled=page===pages-1;
}
function refreshRows() {
  const active=document.activeElement;const focus=active?.dataset.upgrade?{id:active.dataset.id,mode:active.dataset.upgrade}:null;
  const scroll=$("#cityRows").scrollTop;
  document.querySelectorAll("[data-city]").forEach(element=>{const city=cities.find(c=>c.id===element.dataset.city);if(city)element.outerHTML=row(city);});
  $("#availableGold").textContent=number(gold);$("#cityRows").scrollTop=scroll;
  if(focus){const target=document.querySelector(`[data-id="${focus.id}"][data-upgrade="${focus.mode}"]`);if(!target?.disabled)target?.focus({preventScroll:true});}
}
function upgrade(id,mode) {
  const city=cities.find(c=>c.id===id);if(!city||city.stronghold)return;
  const o=option(city,mode);if(o.disabled)return;
  gold-=o.cost;city.level+=o.count;city.cost=Math.round(city.cost*Math.pow(1.11,o.count));city.pending=(city.pending||0)+o.count;city.message="";
  refreshRows();clearTimeout(rowTimers.get(id));const currentGeneration=generation;
  rowTimers.set(id,setTimeout(()=>{if(generation!==currentGeneration)return;city.message=`+${city.pending} levels confirmed`;city.pending=0;refreshRows();announce(`${city.name} upgraded in this draft.`);},1800));
}
function showPreview(city) {
  $("#previewBody").innerHTML=`<img src="${artwork(city)}" alt=""><p class="eyebrow">${city.owner==="player"?"Your kingdom":"City information"}</p><h2 id="previewTitle">${city.name}</h2><p>${city.stronghold?"Stronghold":"Level "+number(city.level)} · ${city.region}</p><p>${city.owner==="player"?number(city.troops)+" troops stationed here.":"Garrison information requires a scout report."}</p>${city.owner==="player"&&!city.stronghold?`<button type="button" class="castle-entry">${cityDetailsIcon("city")}Enter Inner Castle</button>`:""}<p class="draft-note-inline">This is a navigation preview. The approved City Details panel will open here in the game.</p>`;
  if(!$("#cityPreview").open)$("#cityPreview").showModal();
}
function reset() {
  generation++;rowTimers.forEach(clearTimeout);rowTimers.clear();cities=seeds.map(c=>({...c,owner:"player"}));gold=500000;page=0;sortKey="level";ascending=false;rosterState="ready";$("#rosterState").value="ready";render();
}
document.addEventListener("click",event=>{
  const button=event.target.closest("button");if(!button)return;
  if(button.dataset.upgrade)upgrade(button.dataset.id,button.dataset.upgrade);
  if(button.dataset.info)showPreview(cities.find(c=>c.id===button.dataset.info));
  if(button.dataset.locate)announce(`Draft: locate ${cities.find(c=>c.id===button.dataset.locate).name} on its map.`);
  if(button.dataset.sort){ascending=sortKey===button.dataset.sort?!ascending:false;sortKey=button.dataset.sort;cities.sort((a,b)=>(ascending?1:-1)*(a[sortKey]-b[sortKey])||a.name.localeCompare(b.name));page=0;render();}
  if(button.dataset.size){$(".stage").dataset.size=button.dataset.size;document.querySelectorAll("[data-size]").forEach(b=>{if(b.tagName==="BUTTON")b.setAttribute("aria-pressed",String(b===button));});}
  if(button.id==="retryRoster"){rosterState="ready";$("#rosterState").value="ready";render();announce("Full sample roster restored.");}
  if(button.id==="prevPage"||button.id==="nextPage"){page+=button.id==="nextPage"?1:-1;render();$("#cityRows").scrollTop=0;}
  if(button.id==="resetDraft")reset();
  if(button.classList.contains("close-preview"))$("#cityPreview").close();
  if(button.classList.contains("castle-entry"))announce("Draft: open your Main City's Inner Castle.");
});
$("#rosterState").addEventListener("change",event=>{rosterState=event.target.value;page=0;render();});
document.querySelectorAll("[data-icon]").forEach(el=>el.replaceWith(document.createRange().createContextualFragment(cityDetailsIcon(el.dataset.icon))));
fetch("../../../assets/worlds/core-expansion-v1/illustrated-art-receipt.json").then(r=>{if(!r.ok)throw Error("City artwork unavailable");return r.json();}).then(receipt=>{stages=receipt.cityStageAssets;reset();}).catch(error=>{$("#cityRows").textContent=error.message;});
