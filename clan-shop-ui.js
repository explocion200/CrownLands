(function(global){
 "use strict";
 const B=global.CrownlandsClanTowerBuildings;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>Math.max(0,Math.floor(n||0)).toLocaleString();
 const money=n=>`<img src="assets/icons/royal-shop-gold-r1.svg" alt="">${number(n)}`;
 function mount(host,tower,options={}){
  host._clanTowerClockCleanup?.();
  const view=options.view||{},itemDetails=options.itemDetails||{},now=Date.now();
  const current=B.level(tower.buildings?.shop),next=Math.min(10,current+1),status=tower.clanShop;
  const project=tower.buildingProject,active=project?.buildingId==='shop';
  const paused=active&&(!project.progressStartedAtMs||tower.attackBlocked||tower.wallIntegrityBps<10000);
  const model=Object.assign(view,{level:current,gold:options.personalGold||0,treasury:options.treasuryBalance??null,
    eligible:Boolean(status?.eligible),eligibleAt:status?.eligibleAtMs,manager:Boolean(tower.ownerMember&&tower.permissions?.manage),
    pending:Boolean(options.actionBusy),sample:!status?(tower.clanShopError?'unavailable':'loading'):'ready',
    owned:options.inventory||{},project:active?{end:project.progressStartedAtMs+project.remainingMs,remaining:project.remainingMs,paused}:null});
  model.section=model.section||'wares';
  if(!B.SHOP_ITEMS.some(i=>i.id===model.selected))model.selected=current>=9?'common_gear_box':current>=2?'royal_tax_decree_30m':'recall_horn';
  const constructionReason=!tower.ownerMember?'Only the controlling clan can manage these buildings.':!model.manager?'The Clan Leader and Officers manage construction.':current>=10?'Maximum level reached.':project?active?paused?'Construction paused until the walls are fully repaired and no attack is incoming.':'Construction in progress.':'Another building project is already underway.':tower.attackBlocked?'Wait until the incoming attack has ended.':tower.wallIntegrityBps<10000||tower.repairActive?'Fully repair the walls before construction.':model.treasury===null||!Number.isFinite(Number(model.treasury))?'Clan Treasury balance is unavailable.':model.treasury<B.cost(next)?'The Clan Treasury needs more Gold.':'';
  const rows=()=>B.SHOP_ITEMS.map(def=>{const row=status?.items?.find(i=>i.id===def.id),details=itemDetails[def.id]||{};return{...def,...row,art:details.icon,description:details.description||'',category:details.category||'Kingdom provisions',price:row?.price,unlocked:Boolean(row?.unlocked),remaining:row?.remaining||0,limit:row?.limit||0};});
  const chosen=()=>rows().find(i=>i.id===model.selected);
  function time(ms){const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}h ${m}m`:`${m}m ${String(s%60).padStart(2,'0')}s`;}
  const timer=at=>Number.isFinite(Number(at))?`<span data-clan-tower-countdown="${at}">${time(at-Date.now())}</span>`:'—';
  const scrollSelectors=['#catalogueScroll','.selection-scroll','.upgrade-scroll','.building-summary'];
  const savedScroll=Object.fromEntries(scrollSelectors.map(selector=>[selector,host.querySelector(selector)?.scrollTop||0]));
  const focused=host.contains(document.activeElement)?document.activeElement?.id:'';
  host.innerHTML=`<div class="shop-shell">
  <header class="window-header"><img id="shopSign" src="assets/clan-buildings/shop-3.webp" alt=""><div class="heading"><p>${esc(tower.name)} · Clan Tower</p><h1 id="shopTitle">Clan Shop <span id="shopLevel"></span></h1></div><div class="wallet"><span>Your Gold</span><strong><img src="assets/icons/royal-shop-gold-r1.svg" alt="Gold"><span id="goldBalance"></span></strong></div><button id="closeShop" type="button" class="close" aria-label="Close Clan Shop">×</button></header>
  <nav class="shop-tabs" aria-label="Clan Shop sections"><div role="tablist"><button id="tab-wares" role="tab" data-section="wares" aria-controls="waresPanel" aria-selected="true">Provisions</button><button id="tab-upgrades" role="tab" data-section="upgrades" aria-controls="upgradesPanel" aria-selected="false">Shop upgrades</button></div><div class="shop-navigation"><button type="button" data-shop-back>← Tower Info</button><label><span class="sr-only">Tower building</span><select data-shop-building aria-label="Tower building">${B.DEFINITIONS.map(d=>`<option value="${d.id}" ${d.id==="shop"?"selected":""}>${esc(d.name)}</option>`).join("")}</select></label></div></nav>
  <div id="waresPanel" class="wares-panel" role="tabpanel" aria-labelledby="tab-wares">
   <section class="catalogue" aria-label="Clan provisions"><header class="catalogue-header"><div><h2>The tower stores</h2><p>Extra purchases for clan members</p></div><span id="unlockedCount"></span></header><p id="catalogueAlert" class="notice" hidden></p><div id="catalogueScroll" class="scroll-region" tabindex="0" aria-label="All Clan Shop items"><div id="itemGrid" role="listbox" aria-label="Choose a provision"></div></div><footer class="catalogue-footer"><span>Daily allowance renews at <b>00:00 UTC</b></span><span>Peace Shield: <b>every 72 hours</b></span></footer></section>
   <section id="selection" class="selection" aria-label="Selected item"></section>
  </div>
  <div id="upgradesPanel" class="upgrades-panel" role="tabpanel" aria-labelledby="tab-upgrades" hidden></div>
 </div>

<p id="liveStatus" class="sr-only" role="status" aria-live="polite"></p>`;
  const $=selector=>host.querySelector(selector);
  function notify(message){$('#liveStatus').textContent=message;}
function getAvailability(item){
 if(model.pending||model.refreshing)return{label:'Confirming purchase',button:'Confirming…',disabled:true};
 if(model.sample==='loading')return{label:'Loading stock',button:'Loading…',disabled:true};
 if(model.sample==='unavailable')return{label:'Stock unavailable',button:'Retry',action:'retry'};
 if(!model.level)return{label:'Shop unbuilt',button:'View building',action:'upgrade'};
 if(!Number.isFinite(item.price))return{label:'Price unavailable',button:'Retry',action:'retry'};
 if(!item.unlocked)return{label:`Unlocks at Level ${item.unlockLevel}`,button:'View unlock',action:'upgrade'};
 if(!model.eligible)return{label:'Membership wait',button:'Not yet available',disabled:true};
 if(!item.remaining)return{label:'Allowance used',button:'Restocking',disabled:true};
 if(model.gold<item.price)return{label:'Not enough Gold',button:'Not enough Gold',disabled:true};
 return{label:'Available',button:'Purchase one',action:'buy'};
}
function select(id,focus=false){if(!itemDetails[id])return;model.selected=id;model.feedback='';renderCatalogue();renderSelection();if(focus){const card=$(`[data-item="${id}"]`);card.focus({preventScroll:true});card.scrollIntoView({block:'nearest'});}notify(chosen().name+' selected.');}
function section(id){model.section=id;renderTabs();if(id==='upgrades')renderUpgrades();else{renderCatalogue();renderSelection();}}
function renderTabs(){host.querySelectorAll('[data-section]').forEach(b=>{const active=b.dataset.section===model.section;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});$('#waresPanel').hidden=model.section!=='wares';$('#upgradesPanel').hidden=model.section!=='upgrades';}
function render(){
 $('#shopLevel').textContent=model.level?`Level ${model.level}`:'Unbuilt';$('#shopSign').src=B.art('shop',model.level);$('#goldBalance').textContent=number(model.gold);$('#goldBalance').title=number(model.gold)+' Gold';renderTabs();renderCatalogue();renderSelection();renderUpgrades();
}
function renderCatalogue(){
 const items=rows(),unknown=['loading','unavailable'].includes(model.sample);
 $('#unlockedCount').textContent=unknown?'Stock pending':`${items.filter(i=>i.unlocked).length} / ${items.length} unlocked`;
 const notice=$('#catalogueAlert');notice.hidden=true;notice.className='notice';
 if(!model.eligible){notice.innerHTML=`You can browse now. Purchases unlock in ${timer(model.eligibleAt)}.`;notice.hidden=false;}
 if(!model.level){notice.textContent='This Tower needs a completed Clan Shop before purchases unlock.';notice.hidden=false;}
 if(unknown){notice.textContent=model.sample==='loading'?'Checking your Clan Shop allowance…':'Could not load your allowance. Retry from the selected item.';notice.hidden=false;}
 $('#itemGrid').innerHTML=items.map(i=>`<button type="button" role="option" class="item-card ${!i.unlocked?'locked':''} ${i.id==='common_gear_box'?'chest':''}" data-item="${i.id}" aria-selected="${i.id===model.selected}" tabindex="${i.id===model.selected?0:-1}" aria-label="${esc(i.name)}, ${number(i.price)} Gold, ${unknown?'stock pending':!i.unlocked?'unlocks at Level '+i.unlockLevel:i.remaining+' of '+i.limit+' remaining'}"><span class="card-art"><img src="${i.art}" alt=""></span><strong>${esc(i.name)}</strong><span class="card-price">${Number.isFinite(i.price)?money(i.price):'—'}</span><span class="card-allowance ${i.unlocked&&!i.remaining?'spent':''}">${unknown?'Checking allowance':!i.unlocked?`Shop Level ${i.unlockLevel}`:`${i.remaining} / ${i.limit} ${i.remaining?'remaining':'· restocking'}`}</span></button>`).join('');
}
function renderSelection(){
 const item=chosen(),availability=getAvailability(item),shield=item.id==='shield_12h',unknown=['loading','unavailable'].includes(model.sample);
 const limit=item.unlocked?`${item.limit} ${shield?'every 72h':'per day'}`:`Unlocks at Lv ${item.unlockLevel}`;
 const resetLabel=shield?(item.remaining?'Starts after purchase':`Ready in ${timer(item.resetAtMs)}`):`Renews in ${timer(item.resetAtMs)}`;
 const increase=item.increaseLevel&&model.level<item.increaseLevel?`Shop Level ${item.increaseLevel} increases this allowance to 2 per day.`:'';
 $('#selection').innerHTML=`<header class="selection-status"><span>Selected provision</span><b class="${availability.action==='buy'?'':'unavailable'}">${availability.label}</b></header><div class="selection-scroll" tabindex="0" aria-label="${esc(item.name)} details"><div class="selected-hero"><div class="hero-art ${item.id==='common_gear_box'?'common':''}"><img src="${item.art}" alt="${esc(item.name)}"></div><h2 class="selected-name">${esc(item.name)}</h2><p class="selected-kind">${esc(item.category)}</p></div><div class="ornament" aria-hidden="true">◆</div><p class="description">${esc(item.description)}</p><div class="allowance-facts"><div><small>Your Clan Shop limit</small><strong>${unknown?'—':esc(limit)}</strong></div><div><small>${shield?'Purchase cooldown':'Daily reset · 00:00 UTC'}</small><strong>${unknown?'—':resetLabel}</strong></div></div>${increase?`<p class="detail-note">${esc(increase)}</p>`:''}<p class="detail-note">Your Clan Shop allowance is separate from the regular Shop. Changing clans does not renew it.</p>${!model.eligible?`<p class="feedback">Purchases unlock after 24 hours in the clan. ${timer(model.eligibleAt)} remaining.</p>`:''}${model.feedback?`<p class="feedback ${model.failed?'error':''}" role="status">${esc(model.feedback)}</p>`:''}</div><footer class="purchase-footer"><p><span>In your Bag: <b>${number(model.owned[item.id])}</b></span><span>${unknown?'Allowance pending':item.unlocked?`Remaining: <b>${item.remaining} / ${item.limit}</b>`:`Unlocks at Level ${item.unlockLevel}`}</span></p><div class="price"><small>Personal Gold · 1 item</small><strong>${Number.isFinite(item.price)?money(item.price):'—'}</strong></div><button type="button" id="purchase" data-clan-shop-buy="${availability.action==='buy'?item.id:''}" class="primary" data-action="${availability.action||''}" ${availability.disabled?'disabled':''}>${availability.button}</button></footer>`;
}
const levelChange=level=>{
 const before=B.shopStatus(Math.max(0,level-1)),after=B.shopStatus(level);
 return after.flatMap((i,index)=>!before[index].unlocked&&i.unlocked?[`${i.name} · ${i.id==='shield_12h'?'1 every 72 hours':'1 per day'}`]:i.limit>before[index].limit?[`${i.name} · ${i.limit} per day`]:[]).join(' + ');
};
function renderUpgrades(){
 const current=model.level,next=Math.min(10,current+1),project=model.project,paused=project?.paused;
 const reason=constructionReason || 'Paid from Clan Treasury. One building project at a time. Projects cannot be canceled.';
 $('#upgradesPanel').innerHTML=`<section class="building-summary" tabindex="0" aria-label="Shop level and benefits"><img class="building-art" src="${B.art('shop',current)}" alt="Clan Shop building"><p>${esc(tower.name)} · TOWER STORES</p><h2>${current?`Shop Level ${current}`:'Build your Clan Shop'}</h2><div class="level-track" aria-label="Level ${current} of 10">${Array.from({length:10},(_,i)=>`<span class="${i<current?'reached':''}"></span>`).join('')}</div><p>Extra personal purchases for your clan. Items are paid for with each member's own Gold.</p><div class="benefit-box"><small>Current benefit</small><strong>${current?`${rows().filter(i=>i.unlocked).length} provisions unlocked`:'No purchases yet'}</strong><p>${current?'Daily quantities follow your completed Shop level.':'Members may browse the catalogue before construction is complete.'}</p></div>${current<10?`<div class="benefit-box"><small>Next · Level ${next}</small><strong>${next===10?'Royal Peace Shield':next===9?'Common Gear Box':'More supplies'}</strong><p>${esc(levelChange(next))}</p></div>`:''}</section><section class="upgrades-main"><div class="upgrade-scroll" tabindex="0" aria-label="All ten Shop levels"><h2>The growing catalogue</h2><p>New provisions and larger personal allowances with each level.</p><table class="unlock-table"><thead><tr><th>Level</th><th>Unlock or improvement</th><th>Progress</th></tr></thead><tbody>${Array.from({length:10},(_,i)=>{const lv=i+1;return`<tr class="${lv===current?'current':lv===current+1?'next':''}"><td>${lv}</td><td>${esc(levelChange(lv))}</td><td>${lv===current?'Current':lv<current?'Unlocked':lv===current+1?'Next':'Locked'}</td></tr>`;}).join('')}</tbody></table></div><footer class="upgrade-footer"><dl><div><dt>Clan Treasury</dt><dd>${model.treasury===null?'Unavailable':number(model.treasury)+' Gold'}</dd></div>${current<10?`<div><dt>${project?'Gold paid':`Level ${next} cost`}</dt><dd>${number(B.cost(next))} Gold</dd></div><div><dt>${project?paused?'Work remaining':'Time remaining':'Construction time'}</dt><dd>${project?paused?time(project.remaining):timer(project.end):time(B.duration(next))}</dd></div>`:''}</dl><button id="upgradeShop" data-clan-building-start="shop" type="button" class="primary" ${constructionReason||model.pending?'disabled':''}>${current===10?'Maximum level':paused?'Construction paused':project?'Upgrading…':current?`Upgrade to Level ${next}`:'Build Level 1'}</button><p role="status">${esc(reason)}</p></footer></section>`;
}

  $('#itemGrid').addEventListener('click',e=>{const card=e.target.closest('[data-item]');if(card)select(card.dataset.item);});
  $('#itemGrid').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const ids=B.SHOP_ITEMS.map(i=>i.id),index=ids.indexOf(model.selected),cols=getComputedStyle($('#itemGrid')).gridTemplateColumns.split(' ').length,delta=e.key==='ArrowDown'?cols:e.key==='ArrowUp'?-cols:e.key==='ArrowLeft'?-1:1;select(ids[e.key==='Home'?0:e.key==='End'?ids.length-1:Math.max(0,Math.min(ids.length-1,index+delta))],true);});
  $('#selection').addEventListener('click',e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='buy'&&getAvailability(chosen()).action==='buy')options.onBuy?.(model.selected);
    if(action==='upgrade'){section('upgrades');$('#tab-upgrades').focus();}
    if(action==='retry'&&!model.refreshing)options.onRefresh?.();
  });
  host.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>section(b.dataset.section)));
  $('.shop-tabs').addEventListener('keydown',e=>{if(!e.target.matches('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'wares':e.key==='End'?'upgrades':model.section==='wares'?'upgrades':'wares';section(next);$('#tab-'+next).focus();});
  $('#upgradesPanel').addEventListener('click',e=>{if(e.target.closest('#upgradeShop')&&!constructionReason&&!model.pending)options.onBuild?.();});
  $('#closeShop').addEventListener('click',()=>options.onClose?.());
  $('[data-shop-back]').addEventListener('click',()=>options.onBack?.());
  $('[data-shop-building]').addEventListener('change',e=>options.onBuilding?.(e.target.value));
  render();
  for(const [selector,top] of Object.entries(savedScroll)){const el=host.querySelector(selector);if(el)el.scrollTop=top;}
  if(focused)host.querySelector('#'+CSS.escape(focused))?.focus({preventScroll:true});
  let refreshed=false;
  const clock=global.setInterval(()=>host.querySelectorAll('[data-clan-tower-countdown]').forEach(el=>{const end=Number(el.dataset.clanTowerCountdown);el.textContent=time(end-Date.now());if(!refreshed&&end>now&&end<=Date.now()){refreshed=true;options.onRefresh?.();}}),1000);
  const dialog=host.closest('dialog');
  const cleanup=()=>{global.clearInterval(clock);dialog?.removeEventListener('close',cleanup);};
  host._clanTowerClockCleanup=cleanup;dialog?.addEventListener('close',cleanup,{once:true});
  host.dataset.clanShopReady='true';
 }
 global.CrownlandsClanShopUi=Object.freeze({mount});
})(window);
