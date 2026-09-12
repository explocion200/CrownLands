"use strict";
// Isolated, synthetic inventory. No game script, authentication, or mutation API is loaded.
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=value=>Number(value).toLocaleString("en-US");
// Match the game's compact badges; the selected pane and accessible name keep the exact quantity.
function badgeNumber(value){const n=Math.floor(Number(value)||0);if(n>=1e12)return `${(n/1e12).toFixed(n>=1e13?0:1)}T`;if(n>=1e9)return `${(n/1e9).toFixed(n>=1e10?0:1)}B`;if(n>=1e6)return `${(n/1e6).toFixed(n>=1e7?0:1)}M`;if(n>=10000)return `${Math.floor(n/1000)}K`;if(n>=1000)return `${(n/1000).toFixed(1)}K`;return String(n);}
const icons={
  bag:'<path fill="currentColor" fill-opacity=".10" d="m10 9-3-6h18l-4 6c3 5 8 7 8 14 0 8-26 8-26 0 0-7 5-9 7-14Z"/><path d="M9 10h13M13 4l2 4m6-4-2 4m-6 7-2 8m9-8 2 8m-8 5h7"/>',
  boosts:'<path fill="currentColor" fill-opacity=".12" d="M6 13c3 3 17 3 20 0v12c-3 5-17 5-20 0Z"/><ellipse cx="16" cy="13" rx="10" ry="4"/><path d="m7 16 4 10 5-8 5 8 4-10M4 3l15 6M28 3l-12 6M6 24c4 4 16 4 20 0"/>',
  war:'<path fill="currentColor" fill-opacity=".12" d="M4 3 10 5 26 24l-3 3L5 10Zm24 0-6 2L6 24l3 3 18-17Z"/><path d="m5 21 6 6m10-6 6 6M4 29l4-4m20 4-4-4M7 6l13 15m5-15L12 21"/>',
  defense:'<path fill="currentColor" fill-opacity=".12" d="m16 3 11 4v9c0 7-6 12-11 14C11 28 5 23 5 16V7Z"/><path d="m16 7 7 3v6c0 4-3 8-7 10-4-2-7-6-7-10v-6Zm0 0v19M9 15h14"/><path fill="currentColor" fill-opacity=".2" stroke="none" d="M16 15h7c0 5-3 9-7 11Z"/>',
  utility:'<path fill="currentColor" fill-opacity=".12" d="M7 3h17c7 0 6 8 0 8H9M9 7v20h15V7M9 27H5c-5 0-4-7 0-7h14"/><path d="M12 11h7m-7 4h8m-8 4h5m0 5h5M7 3C2 3 2 9 7 9h2"/>',
  time:'<circle cx="16" cy="17" r="11"/><path d="M16 9v9l5 3M12 2h8m-4 0v4M6 7 3 4M26 7l3-3"/>',
  box:'<path fill="currentColor" fill-opacity=".12" d="M3 13c0-6 5-9 13-9s13 3 13 9v15H3Z"/><path d="M3 14h26M8 5v9m16-9v9M8 18v7m16-7v7M13 12h6v7h-6Z"/><path d="M15 15h2M5 25h3m16 0h3"/>',
  left:'<path d="m20 7-9 9 9 9m-9-9h16"/>',
  right:'<path d="m12 7 9 9-9 9m9-9H5"/>',
  check:'<path d="m6 17 6 6L26 8"/>'
};
const icon=key=>`<svg class="ink-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${icons[key]||icons.bag}</svg>`;
let snapshot,counts={},expires={},selected="",category="all",page=0,sample="ready",busy=false,error="",feedback="",epoch=0,failedOnce=false,pendingSample="ready",suppressSelectionUntil=0;
function announce(message,handoff=""){parent.postMessage({type:"bag-status",message,handoff},location.origin);$("#liveStatus").textContent=message;}
function duration(seconds){const total=Math.max(0,Math.ceil(seconds));if(total>=3600){const h=Math.floor(total/3600),m=Math.floor(total%3600/60);return `${h}h${m?` ${m}m`:""}`;}if(total>=60)return `${Math.floor(total/60)}m ${total%60}s`;return `${total}s`;}
function remaining(id){return Math.max(0,Math.ceil(((expires[id]||0)-Date.now())/1000));}
function model(){const groups=snapshot.items.filter(i=>(counts[i.id]||0)>0&&(category==="all"||i.bagCategory===category));const pageCount=Math.max(1,Math.ceil(groups.length/snapshot.pageSize));page=Math.max(0,Math.min(page,pageCount-1));return{groups,pageCount,entries:groups.slice(page*snapshot.pageSize,(page+1)*snapshot.pageSize)};}
function currentItem(){return snapshot.items.find(i=>i.id===selected&&(counts[i.id]||0)>0)||null;}
function focusItem(id){document.querySelector(`[data-item="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}
function renderInventory(){
  const m=model();
  $("#categories").innerHTML=snapshot.categories.map(([id,label])=>`<button class="category-tab" id="tab-${id}" data-category="${id}" type="button" role="tab" aria-selected="${id===category}" aria-controls="itemViewport" tabindex="${id===category?0:-1}">${icon(id==="all"?"bag":id)}<span>${label}</span></button>`).join("");
  $("#inventoryTitle").textContent=category==="all"?"All items":snapshot.categories.find(c=>c[0]===category)[1];
  $("#stackCount").textContent=`${m.groups.length} ${m.groups.length===1?"stack":"stacks"}`;
  $("#itemViewport").setAttribute("aria-labelledby",`tab-${category}`);
  $("#itemGrid").hidden=!m.entries.length;$("#emptyBag").hidden=!!m.entries.length;
  $("#itemGrid").innerHTML=m.entries.map(i=>`<button class="item-tile${counts[i.id]>=1000?" large-count":""}" type="button" data-item="${esc(i.id)}" aria-pressed="${i.id===selected}" aria-label="${esc(`${i.label}, ${number(counts[i.id])} owned`)}"><span class="quantity" aria-hidden="true">×${badgeNumber(counts[i.id])}</span><span class="tile-art"><img src="${esc(i.icon)}" alt="" draggable="false"></span><strong class="item-name">${esc(i.label)}</strong></button>`).join("")+Array.from({length:Math.max(0,snapshot.pageSize-m.entries.length)},()=>`<span class="tile-empty" aria-hidden="true">${icon("bag")}</span>`).join("");
  $("#emptyBag").innerHTML=`${icon("bag")}<h3>${category==="all"?"Your bag is empty":"No items here"}</h3><p>${category==="all"?"Collect or purchase an item to place it here.":"No owned items are in this category."}</p>`;
  $("#pageStatus").textContent=`Page ${page+1} of ${m.pageCount}`;$("#previous").disabled=page<=0;$("#next").disabled=page>=m.pageCount-1;
  $("#previous").innerHTML=icon("left");$("#next").innerHTML=icon("right");
}
function renderSelection(){
  const item=currentItem(),seconds=item?remaining(item.id):0,heading=`<div class="selection-heading"><span>Selected item</span><span class="heading-status">${seconds?`Active: ${duration(seconds)}`:error?"Use failed":busy?"Using…":icon("utility")}</span></div>`;
  if(!item){$("#selection").innerHTML=heading+`<div class="selection-empty">${icon("utility")}<h2>Select an item</h2><p>Choose an item from your Bag to review its effect.</p></div>`;return;}
  const itemCategory=snapshot.categories.find(c=>c[0]===item.bagCategory)[1],isBox=item.id==="common_gear_box",disabled=busy||seconds>0&&!item.stackable;
  $("#selection").innerHTML=`${heading}<div class="selection-scroll"><div class="selected-hero"><div class="selected-art"><img src="${esc(item.icon)}" alt="" draggable="false"></div><h2>${esc(item.label)}</h2><p class="selected-category">${esc(itemCategory)}</p></div><div class="decorative-rule" aria-hidden="true">◆</div><p class="description">${esc(item.description)}</p><div class="effect">${icon(isBox?"box":item.durationSeconds?"time":"war")}<span>${esc(item.effect)}</span></div><p class="active-status" ${seconds?"":"hidden"}>${seconds?`Active: ${duration(seconds)}`:""}</p><p class="action-feedback${error?" error":""}" role="status" ${error||feedback?"":"hidden"}>${esc(error||feedback)}</p></div><footer class="selection-actions"><div class="owned">Owned<strong style="${counts[item.id]>=100000?'font-size:13px;white-space:nowrap':''}">${number(counts[item.id])}</strong></div><button class="use-button" type="button" ${disabled?"disabled":""} aria-busy="${busy}">${icon(busy?"time":isBox?"box":"check")}<span>${busy?"Using…":isBox?"Open":"Use"}</span></button></footer>`;
}
function render(){renderInventory();renderSelection();}
function setCategory(id,focus=false){if(!snapshot.categories.some(c=>c[0]===id))return;category=id;page=0;selected="";error="";feedback="";render();if(focus)$("#tab-"+id).focus();announce(`${snapshot.categories.find(c=>c[0]===id)[1]} · ${model().groups.length} item stacks`);}
function setPage(value,focus=false){const m=model(),next=Math.max(0,Math.min(m.pageCount-1,value));if(page===next)return;page=next;selected="";error="";feedback="";render();if(focus)$("#itemViewport").focus();}
function selectItem(id,focus=false){if(!model().entries.some(i=>i.id===id))return;selected=id;error="";feedback="";render();if(focus)focusItem(id);announce(`${currentItem().label} · ${number(counts[id])} owned`);}
function fallbackAfterUse(id){if(counts[id]>0)return;const list=snapshot.items.filter(i=>category==="all"||i.bagCategory===category),index=list.findIndex(i=>i.id===id);selected=list.slice(index+1).find(i=>counts[i.id]>0)?.id||list.slice(0,index).reverse().find(i=>counts[i.id]>0)?.id||"";page=selected?Math.floor(model().groups.findIndex(i=>i.id===selected)/snapshot.pageSize):0;}
async function use(){
  const item=currentItem();if(!item||busy||remaining(item.id)>0&&!item.stackable)return;
  if(item.id==="common_gear_box"){announce("Draft handoff: Open leads to the approved Common Gear Box screen. A box is spent when you open the chest there.","box");return;}
  if(["swift_march_order","recall_horn"].includes(item.id)){announce(`Draft handoff: ${item.label} leads to Outgoing Marches to choose an eligible march. If none qualify, the game shows its existing notice. The item is not spent in the Bag.`);return;}
  const token=epoch,id=item.id;busy=true;error="";feedback="";renderSelection();
  await new Promise(r=>setTimeout(r,sample==="slow"?1600:450));if(token!==epoch)return;
  busy=false;
  if(sample==="error"&&!failedOnce){failedOnce=true;error="Could not use this item. Please try again.";renderSelection();if($("#bagDialog").open)$(".use-button")?.focus();announce("Draft failure · Item quantity is unchanged. Use retries the sample action.");return;}
  counts[id]--;expires[id]=Math.max(Date.now(),expires[id]||0)+item.durationSeconds*1000;feedback=`${item.label} ${item.stackable?"duration added.":"activated."}`;
  if(selected===id)fallbackAfterUse(id);render();if($("#bagDialog").open)($(".use-button:not(:disabled)")||document.querySelector(`[data-item="${CSS.escape(selected)}"]`)||$("#itemViewport")).focus({preventScroll:true});announce(`Draft: used one ${item.label}. ${number(counts[id])} remain. No game inventory changed.`);
}
function reset(value="ready"){
  if(!snapshot){pendingSample=value;return;}
  const allowed=["ready","unselected","shield","boost","last","category-empty","empty","large","slow","error"];sample=allowed.includes(value)?value:"ready";epoch++;busy=false;error="";feedback="";failedOnce=false;page=0;category="all";selected="common_gear_box";expires={};
  counts=Object.fromEntries(snapshot.items.map((i,n)=>[i.id,[5,2,12,8,3,4,2][n]||0]));
  if(sample==="unselected")selected="";
  if(sample==="shield"){selected="shield_12h";expires[selected]=Date.now()+2*3600000+14*60000;}
  if(sample==="boost"){selected="war_drums_30m";expires[selected]=Date.now()+18*60000+42000;}
  if(["slow","error"].includes(sample))selected="war_drums_30m";
  if(["last","empty","category-empty"].includes(sample)){counts=Object.fromEntries(snapshot.items.map(i=>[i.id,0]));selected="";}
  if(sample==="last"){counts.war_drums_30m=1;selected="war_drums_30m";}
  if(sample==="category-empty"){counts.common_gear_box=5;category="war";}
  if(sample==="large")counts=Object.fromEntries(snapshot.items.map(i=>[i.id,1000000]));
  render();$("#dismissed").hidden=true;if(!$("#bagDialog").open)$("#bagDialog").showModal();$(".close").focus({preventScroll:true});announce("Interactive draft · Select an item or try the category tabs");
}
$("#categories").addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(b)setCategory(b.dataset.category,true);});
$("#categories").addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const ids=snapshot.categories.map(c=>c[0]),at=ids.indexOf(category),next=e.key==="Home"?0:e.key==="End"?ids.length-1:(at+(e.key==="ArrowRight"?1:-1)+ids.length)%ids.length;setCategory(ids[next],true);});
$("#itemGrid").addEventListener("click",e=>{const b=e.target.closest("[data-item]");if(b&&Date.now()>=suppressSelectionUntil)selectItem(b.dataset.item,true);});
$("#selection").addEventListener("click",e=>{if(e.target.closest(".use-button"))void use();});
$("#previous").addEventListener("click",()=>setPage(page-1,true));$("#next").addEventListener("click",()=>setPage(page+1,true));
$("#itemViewport").addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();setPage(page+(e.key==="ArrowRight"?1:-1),true);}});
let pointer=null,wheelUntil=0;
$("#itemViewport").addEventListener("pointerdown",e=>{if(e.pointerType!=="mouse"||e.button===0)pointer={id:e.pointerId,x:e.clientX,y:e.clientY};});
$("#itemViewport").addEventListener("pointerup",e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;if(Math.abs(dx)>42&&Math.abs(dx)>Math.abs(dy)*1.15){e.preventDefault();suppressSelectionUntil=Date.now()+350;setPage(page+(dx<0?1:-1));}});
$("#itemViewport").addEventListener("pointercancel",()=>{pointer=null;});
$("#itemViewport").addEventListener("wheel",e=>{const dx=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.shiftKey?e.deltaY:0;if(Math.abs(dx)<20)return;e.preventDefault();if(Date.now()<wheelUntil)return;wheelUntil=Date.now()+280;setPage(page+(dx>0?1:-1));},{passive:false});
$(".close").addEventListener("click",()=>$("#bagDialog").close());$("#bagDialog").addEventListener("close",()=>{$("#dismissed").hidden=false;$("#reopen").focus();});$("#reopen").addEventListener("click",()=>{$("#dismissed").hidden=true;$("#bagDialog").showModal();});
window.addEventListener("message",e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==="bag-review")reset(e.data.sample);});
const tick=setInterval(()=>{if(!snapshot||!$("#bagDialog").open)return;const item=currentItem(),line=$(".active-status");if(!item||!line)return;const seconds=remaining(item.id);line.hidden=!seconds;line.textContent=seconds?`Active: ${duration(seconds)}`:"";$(".heading-status").innerHTML=seconds?`Active: ${duration(seconds)}`:error?"Use failed":busy?"Using…":icon("utility");const action=$(".use-button");if(action)action.disabled=busy||seconds>0&&!item.stackable;},1000);
window.addEventListener("pagehide",()=>{clearInterval(tick);epoch++;});
fetch("docs/visual-qa/bag-inventory/snapshot.json").then(r=>{if(!r.ok)throw Error("Item reference could not be loaded");return r.json();}).then(data=>{snapshot=data;$(".bag-seal").innerHTML=icon("bag");reset(pendingSample);window.bagDraft={reset,select:selectItem,setCategory,setPage,use,getState:()=>({sample,category,page,selected,busy,error,counts:{...counts},activeSeconds:remaining(selected),pageCount:model().pageCount}),getSnapshot:()=>structuredClone(snapshot)};document.documentElement.dataset.ready="true";}).catch(error=>{$("#dismissed").hidden=false;$("#dismissed p").textContent=error.message;});
