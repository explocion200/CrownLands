"use strict";
// An isolated presentation draft. All item values and current markup come from the synthetic snapshot.
let snapshot,selected="draft-1",filter="all",layout="draft",sample="ready",confirmation=false,returnFocus="";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const title=value=>value.charAt(0).toUpperCase()+value.slice(1);
const number=value=>Math.floor(Number(value)).toLocaleString("en-US");
const percent=value=>Number(value).toFixed(2);
const shortName=value=>value.replace("Cavalry Master's ","");
const art=(src,alt="")=>`<img src="${esc(src)}" alt="${esc(alt)}" draggable="false">`;
function officerMarkup(vm){return `<figure class="tg-officer">${art(vm.building.characterArt,"Cavalry Master with a horse in the Royal Stables — existing portrait for layout review")}<figcaption>Master of the royal cavalry</figcaption></figure>`;}
const icons={
  stables:"<path fill=\"currentColor\" fill-opacity=\".12\" d=\"M9 3C-1 12 3 29 16 30 29 29 33 12 23 3l-5 3c8 7 5 17-2 18C9 23 6 13 14 6Z\"/><path fill=\"currentColor\" fill-opacity=\".25\" stroke=\"none\" d=\"M25 7c7 17-4 24-13 22 14 1 17-14 10-23Z\"/><path d=\"m9 7 2 1m-5 5 2 1m-2 6 2-1m1 7 1-2m11-17 2-1m1 7 2-1m-2 6 2 1m-4 5 1 2\"/>",
  coins:'<g fill="none" stroke-width="1.5"><path fill="currentColor" fill-opacity=".12" d="M16 3 23 5 28 10 29 17 26 24 20 28 12 29 6 25 3 19 3 12 8 6Z"/><path fill="currentColor" fill-opacity=".25" stroke="none" d="M27 11 27 18 24 24 18 27 11 27 6 23 9 27 16 30 24 27 29 20 30 14Z"/><path stroke-width="1.1" d="M10 8 16 6 23 9M7 12l-1 5 3 6M22 24l3-4"/><path fill="currentColor" stroke-width=".5" d="m9 11 4 3 3-6 3 6 4-3-2 10H11Z"/><path d="M12 24h8"/></g>',
  bag:'<path d="M10 9 7 3h18l-4 6M10 9c-2 5-7 7-7 14 0 8 26 8 26 0 0-7-5-9-8-14ZM9 10h13m-8 5-2 6m7-6 2 6"/>',
  forge:"<g fill=\"none\" stroke-width=\"1.5\"><path fill=\"currentColor\" fill-opacity=\".12\" d=\"m4 6 3-2 19 20 1 5-5-2Z\"/> <path fill=\"currentColor\" fill-opacity=\".25\" stroke=\"none\" d=\"m6 7 18 19 3 3-5-2L4 8Z\"/> <path fill=\"currentColor\" fill-opacity=\".12\" d=\"m16 11 4 4L7 30l-4-3Z\"/> <path fill=\"currentColor\" fill-opacity=\".25\" stroke=\"none\" d=\"m18 14 2 1L7 30l-2-2Z\"/> <path fill=\"currentColor\" fill-opacity=\".12\" d=\"m10 7 6-5 14 12-6 6Z\"/> <path fill=\"currentColor\" stroke-width=\".5\" d=\"m25 10 5 4-6 6-5-4Z\"/> <path stroke-width=\"1.1\" d=\"m13 8 9 8M15 6l5 4\"/></g>",
  check:'<path d="m6 16 6 6L27 7"/>',
  scroll:'<path d="M9 4h16c7 0 4 8 0 8H9M9 4C3 4 3 11 9 11v16h16V8M9 27H5c-4 0-3-6 1-6h14M12 15h9m-9 4h7"/>',
  plus:'<path d="M16 7v18M7 16h18"/>'
};
const icon=key=>`<svg class="tg-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${icons[key]||icons.scroll}</svg>`;
function announce(message){parent.postMessage({type:"royal-stables-status",message},location.origin);}
function currentModel(){return snapshot.models[selected]||snapshot.models.empty;}
function slotMarkup(slot){return `<button type="button" class="tg-slot${slot.equipped?"":" is-empty"}" data-slot="${slot.slot}" data-rarity="${esc(slot.equippedDefinition?.rarity||"")}" aria-pressed="${currentModel().selectedSlot===slot.slot}" aria-label="${esc(slot.label+(slot.equipped?`, ${slot.equippedDefinition.gearName}, Level ${slot.equipped.level}`:", empty"))}"><span class="tg-slot-art">${slot.equipped?art(slot.equippedDefinition.art):icon("plus")}</span><span>${slot.label}<small>${slot.equipped?"Lv. "+slot.equipped.level:"Empty"}</small></span>${slot.isUpgradeReady?'<b class="tg-ready" title="Matching upgrade material available">!</b>':""}</button>`;}
function bagMarkup(group){const item=group.representative,def=group.definition;return `<button type="button" class="tg-item${group.isEquipped?" equipped":""}${group.isCompatible?" compatible":""}" data-item="${item.instanceId}" data-rarity="${esc(def.rarity)}" aria-pressed="${group.isSelected}" aria-label="${esc(`${def.gearName}, Level ${item.level}, ${group.count} owned${group.isEquipped?", equipped":""}${group.isNew?", new":""}`)}" title="${esc(def.gearName)}"><span class="tg-item-mark">${group.isEquipped?icon("check"):group.isNew?'<b>New</b>':""}</span>${art(def.art)}<span class="tg-item-level">Lv. ${item.level}</span>${group.count>1?`<span class="tg-item-count">×${group.count}</span>`:""}<span class="tg-item-name">${esc(shortName(def.gearName))}</span>${group.isUpgradeReady&&!group.isEquipped?'<b class="tg-ready" title="Matching upgrade material available">!</b>':""}</button>`;}
function detailsMarkup(vm){
  if(!vm.selected)return `<section class="tg-details" aria-labelledby="tgDetailsTitle"><header class="tg-section-heading"><h3 id="tgDetailsTitle">Selected equipment</h3></header><div class="tg-empty"><span>${icon("scroll")}</span><h4>No ${esc(vm.selectedSlot)} gear selected</h4><p>Choose an equipped slot or an item from the Cavalry Master’s equipment bag.</p></div></section>`;
  const {selected:item,definition:def,requirement:req}=vm;
  const gold=sample==="gold"?12000:snapshot.gold,lowGold=req&&gold<vm.upgradeGold;
  const allowed=vm.canMerge&&!lowGold;
  return `<section class="tg-details" aria-labelledby="tgDetailsTitle">
    <header class="tg-section-heading"><h3 id="tgDetailsTitle">Selected equipment</h3><span>${item.isEquipped?"Equipped":"In bag"}</span></header>
    <div class="tg-detail-scroll" tabindex="0" aria-label="Item description and upgrade requirements">
      <div class="tg-item-hero"><div class="tg-inspected-art" data-rarity="${esc(def.rarity)}">${art(def.art)}</div><div><p class="tg-eyebrow">Cavalry Master’s</p><h4>${esc(shortName(def.gearName))}</h4><p class="tg-item-meta">${title(def.rarity)} · ${title(item.slot)} · Level ${item.level} / 5</p><div class="tg-levels" role="img" aria-label="Level ${item.level} of 5">${[1,2,3,4,5].map(n=>`<i class="${n<=item.level?"filled":""}"></i>`).join("")}</div></div></div>
      <div class="tg-effect"><strong>+${percent(vm.currentBonus)}%</strong><span>${esc(title(def.statLabel))}</span></div>
      ${req?`<p class="tg-next">Next level <strong>+${percent(vm.nextBonus)}%</strong><span>+${percent(vm.nextBonusIncrease)}% increase</span></p>`:'<p class="tg-next">Maximum bonus reached</p>'}
      <div class="tg-requirements"><h5>${icon("forge")} ${req?"Upgrade to Level "+(item.level+1):"Level 5 complete"}</h5>${req?`<dl><div><dt>Matching Level ${item.level} copy</dt><dd class="${vm.duplicateCount>=req.duplicates?"ready":"short"}">${vm.duplicateCount} / ${req.duplicates} available</dd></div><div><dt>Gold cost</dt><dd class="${lowGold?"short":""}">${number(vm.upgradeGold)}</dd></div><div><dt>Raw production</dt><dd>${req.baseGoldHours} ${req.baseGoldHours===1?"hour":"hours"}</dd></div><div><dt>Your gold</dt><dd>${number(gold)}</dd></div></dl>`:'<p>This item has reached its maximum level.</p>'}</div>
      ${lowGold?'<p class="tg-warning">Insufficient gold for this upgrade.</p>':vm.mergeReason&&req?`<p class="tg-warning">${esc(vm.mergeReason)}</p>`:""}
      <div class="tg-description"><h5>Item record</h5><p>${esc(vm.description)}</p><dl><div><dt>Officer</dt><dd>Cavalry Master</dd></div><div><dt>Category / slot</dt><dd>${title(def.category)} / ${title(item.slot)}</dd></div><div><dt>Binding</dt><dd>Not tradeable</dd></div><div><dt>State</dt><dd>${item.isEquipped?"Equipped":"In bag"}</dd></div><div><dt>Full Level ${vm.progressionLevel} path</dt><dd>${vm.progressionBaseCopies} Level 1 copies · ${vm.progressionGoldHours}h raw production</dd></div></dl></div>
    </div><footer class="tg-actions"><button class="tg-secondary" type="button" data-action="equip">${item.isEquipped?"Unequip":"Equip"}</button><button class="tg-primary" type="button" data-action="upgrade" ${allowed?"":"disabled"}>${req?"Upgrade":"Max Level"}${req?icon("forge"):""}</button></footer>
  </section>`;
}
function render(){
  if(!snapshot)return;
  confirmation=false;
  document.querySelectorAll("link[data-legacy]").forEach(link=>{link.disabled=layout==="draft";});
  const vm=currentModel();document.body.className=layout==="draft"?"royal-stables-draft":"royal-stables-current";
  if(layout==="current"){
    document.body.innerHTML=sample==="gold"&&selected==="draft-1"?snapshot.currentGold:snapshot.current[selected]||snapshot.current.empty;
    const dialog=document.querySelector("dialog");dialog.removeAttribute("data-common-gear-building-id");dialog.removeAttribute("open");dialog.showModal();
    document.querySelectorAll("[onerror]").forEach(el=>el.removeAttribute("onerror"));
    if(sample==="gold")document.querySelector("[data-gear-merge]")?.setAttribute("disabled","");
    return;
  }
  const groups=vm.bagGroups.filter(g=>filter==="all"||g.representative.slot===filter);
  document.body.innerHTML=`<dialog id="royal-stablesDraft" class="tg-dialog" aria-labelledby="tgTitle"><div class="tg-shell">
    <header class="tg-header"><div class="tg-seal">${icon("stables")}</div><div class="tg-heading"><p>Inner Castle <span>· Cavalry Master</span></p><h2 id="tgTitle">Royal Stables</h2></div><div class="tg-gold">${icon("coins")}<span><small>Gold</small>${number(sample==="gold"?12000:snapshot.gold)}</span></div><button type="button" class="tg-back" data-action="back"><span aria-hidden="true">←</span><span>Back to Inner Castle</span></button><button type="button" class="tg-close" data-action="close" aria-label="Close Royal Stables">×</button></header>
    <main class="tg-main"><section class="tg-loadout" aria-labelledby="tgOfficerTitle"><header class="tg-section-heading"><h3 id="tgOfficerTitle">Cavalry Master</h3><span>Equipment</span></header><div class="tg-loadout-grid"><div class="tg-slot-column">${vm.leftSlots.map(slotMarkup).join("")}</div>${officerMarkup(vm)}<div class="tg-slot-column">${vm.rightSlots.map(slotMarkup).join("")}</div></div><footer class="tg-loadout-footer"><span>${vm.slots.filter(s=>s.equipped).length} / 8 slots equipped</span><span><b>!</b> Upgrade material ready</span></footer></section>
    <section class="tg-bag" aria-labelledby="tgBagTitle"><header class="tg-section-heading"><h3 id="tgBagTitle">${icon("bag")} Equipment Bag</h3><span>${vm.bagOwnedCount} owned</span></header><div class="tg-bag-controls"><label for="tgFilter">Show</label><select id="tgFilter" aria-label="Filter equipment bag"><option value="all">All slots</option>${snapshot.slots.map(s=>`<option value="${s}" ${filter===s?"selected":""}>${title(s)}</option>`).join("")}</select></div><div class="tg-bag-scroll" tabindex="0" aria-label="Equipment inventory"><div class="tg-items">${groups.map(bagMarkup).join("")||'<div class="tg-empty"><h4>No equipment here</h4><p>Change the filter to see the Cavalry Master’s other gear.</p></div>'}</div></div><footer class="tg-bag-footer"><span>${groups.length} shown · ${vm.bagStackCount} stacks</span><span>${icon("check")} Equipped <b class="tg-legend-ready">!</b> Ready</span></footer></section>
    ${detailsMarkup(vm)}</main></div></dialog>`;
  document.getElementById("royal-stablesDraft").showModal();

  document.getElementById("tgFilter").addEventListener("change",event=>{filter=event.target.value;render();document.getElementById("tgFilter").focus();});
}
function selectItem(id){if(!snapshot.models[id])return;const scroll=document.querySelector('.tg-bag-scroll')?.scrollTop||0;selected=id;confirmation=false;render();const bag=document.querySelector('.tg-bag-scroll');if(bag)bag.scrollTop=scroll;}
function selectSlot(slot){const vm=currentModel(),model=vm.slots.find(s=>s.slot===slot);selectItem(model?.equipped?.instanceId||vm.instances.find(i=>i.slot===slot)?.instanceId||"empty");}
function showConfirmation(){const vm=currentModel();if(!vm.canMerge||sample==="gold")return;const item=vm.selected,req=vm.requirement;confirmation=true;returnFocus="[data-action=upgrade]";
  document.body.insertAdjacentHTML("beforeend",`<dialog class="tg-confirm" aria-labelledby="tgConfirmTitle"><div>${icon("forge")}<p class="tg-eyebrow">Royal Stables armoury</p><h2 id="tgConfirmTitle">Upgrade ${esc(shortName(vm.definition.gearName))}?</h2><div class="tg-combine"><span class="tg-confirm-art" data-rarity="${esc(vm.definition.rarity)}">${art(vm.definition.art)}</span><span>Level ${item.level}<br>+ 1 matching copy</span><b aria-hidden="true">→</b><span>Level ${item.level+1}<strong>+${percent(vm.nextBonus)}%</strong></span></div><p>Combine this Level ${item.level} item with ${req.duplicates} unequipped matching Level ${item.level} copy. Both inputs are consumed to create one new Level ${item.level+1} item.</p><dl><div><dt>Gold cost</dt><dd>${number(vm.upgradeGold)}</dd></div><div><dt>Raw production</dt><dd>${req.baseGoldHours}h</dd></div></dl><p class="tg-warning">This two-to-one upgrade cannot be undone.</p><footer><button type="button" data-action="cancel">Cancel</button><button class="tg-primary" type="button" data-action="confirm">Confirm Upgrade</button></footer></div></dialog>`);

  const dialog=document.querySelector(".tg-confirm");dialog.showModal();dialog.querySelector("[data-action=cancel]").focus();dialog.addEventListener("cancel",event=>{event.preventDefault();closeConfirmation();});
}
function closeConfirmation(){const dialog=document.querySelector(".tg-confirm");dialog?.close();dialog?.remove();confirmation=false;requestAnimationFrame(()=>document.querySelector(returnFocus)?.focus());}
document.addEventListener("click",event=>{const button=event.target.closest("button");if(!button||button.disabled)return;
  const slot=button.dataset.slot||button.dataset.gearSlot,item=button.dataset.item||button.dataset.gearInstance;
  if(slot){selectSlot(slot);return;}if(item){selectItem(item);return;}
  const action=button.dataset.action;
  if(action==="upgrade"){showConfirmation();return;}
  if(action==="cancel"||action==="confirm"){closeConfirmation();if(action==="confirm")announce("Upgrade confirmation previewed · No inventory or gold changed");return;}
  if(action==="equip"||button.hasAttribute("data-gear-equip")){announce("Equipment action previewed · No inventory changed");return;}
  if(action==="back"||action==="close"||button.id==="closeModalBtn"||button.hasAttribute("data-gear-back")){announce("Navigation preview · Returns to the Inner Castle in game");return;}
  if(button.hasAttribute("data-gear-merge")){announce("Current layout comparison · Use the parchment draft to preview confirmation");return;}
  if(button.hasAttribute("data-gear-bag-filter-button")){const menu=document.querySelector("[data-gear-bag-filter-list]");menu.hidden=!menu.hidden;button.setAttribute("aria-expanded",String(!menu.hidden));return;}
  if(button.dataset.gearBagFilterOption){const value=button.dataset.gearBagFilterOption;document.querySelectorAll("[data-gear-instance]").forEach(tile=>{tile.hidden=value!=="all"&&snapshot.models[tile.dataset.gearInstance]?.selected.slot!==value;});document.querySelector("[data-gear-bag-filter-list]").hidden=true;return;}
});
document.addEventListener("submit",event=>event.preventDefault());
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&confirmation){event.preventDefault();event.stopImmediatePropagation();closeConfirmation();}},true);
window.addEventListener("message",event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=="royal-stables-review")return;const next=event.data;if(next.layout)layout=next.layout;if(next.sample)sample=next.sample;if(next.reset){selected={ready:"draft-1",missing:"draft-9",max:"draft-15",weapon:"draft-13",empty:"empty",gold:"draft-1"}[sample]||"draft-1";filter="all";}render();});
fetch("docs/visual-qa/royal-stables-gear/snapshot.json").then(r=>{if(!r.ok)throw Error("Could not load the Royal Stables sample.");return r.json();}).then(async data=>{snapshot=data;for(const href of [...data.stylesheets,"docs/visual-qa/royal-stables-gear/draft.css"]){const link=document.createElement("link");link.rel="stylesheet";link.href=href;if(!href.startsWith("https:")&&!href.endsWith("/draft.css"))link.dataset.legacy="true";document.head.append(link);}await Promise.all([...document.querySelectorAll("link[rel=stylesheet]")].map(link=>link.sheet?Promise.resolve():new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error("Could not load preview styles."));})));render();document.documentElement.dataset.ready="true";}).catch(error=>{document.body.textContent=error.message;});
