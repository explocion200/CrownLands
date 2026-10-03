(function(global){
 "use strict";
 const B=global.CrownlandsClanTowerBuildings;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>Math.max(0,Math.floor(n||0)).toLocaleString();
 const money=n=>`<img src="assets/icons/royal-shop-gold-r1.svg" alt="">${number(n)}`;
 function mount(host,tower,options={}){
  host._clanTowerClockCleanup?.();
  const view=options.view||{},itemDetails=options.itemDetails||{},now=Date.now();
  const current=B.level(tower.buildings?.shop),status=tower.clanShop,project=tower.buildingProject;
  const treasury=options.treasuryBalance;
  const model=Object.assign(view,{level:current,gold:options.personalGold||0,
    treasury:treasury==null||!Number.isFinite(Number(treasury))?null:Number(treasury),
    eligible:Boolean(status?.eligible),eligibleAt:status?.eligibleAtMs,
    manager:Boolean(tower.ownerMember&&tower.permissions?.manage&&tower.worldActive!==false),
    attack:Boolean(tower.attackBlocked),integrity:Math.max(0,Math.min(10000,Number(tower.wallIntegrityBps)||0)/100),
    repairActive:Boolean(tower.repairActive),pending:Boolean(options.actionBusy),
    sample:!status?(tower.clanShopError?'unavailable':'loading'):'ready',owned:options.inventory||{},
    project:project?{building:project.buildingId,target:project.targetLevel,total:B.duration(project.targetLevel),
      remaining:Math.max(0,Number(project.remainingMs)||0),end:Number(project.progressStartedAtMs)+Number(project.remainingMs),
      paused:!project.progressStartedAtMs||Boolean(tower.attackBlocked)||tower.wallIntegrityBps<10000}:null});
  model.section=['overview','levels','wares'].includes(model.section)?model.section:'overview';
  if(!B.SHOP_ITEMS.some(i=>i.id===model.selected))model.selected=current>=9?'common_gear_box':current>=2?'royal_tax_decree_30m':'recall_horn';
  const rows=()=>B.SHOP_ITEMS.map(def=>{const row=status?.items?.find(i=>i.id===def.id),details=itemDetails[def.id]||{};return{...def,...row,art:details.icon,description:details.description||'',category:details.category||'Kingdom provisions',price:row?.price,unlocked:Boolean(row?.unlocked),remaining:row?.remaining||0,limit:row?.limit||0};});
  const chosen=()=>rows().find(i=>i.id===model.selected);
  function time(ms){const seconds=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}h${m?` ${m}m`:''}`:m?`${m}m${s?` ${s}s`:''}`:`${s}s`;}
  const timer=at=>Number.isFinite(Number(at))?`<span data-clan-tower-countdown="${at}">${time(at-Date.now())}</span>`:'—';
  const scrollSelectors=['#catalogueScroll','.selection-scroll','#overviewPanel','#levelsPanel','.building-panel'];
  const savedScroll=Object.fromEntries(scrollSelectors.map(selector=>[selector,host.querySelector(selector)?.scrollTop||0]));
  const focused=host.contains(document.activeElement)?document.activeElement?.id:'';
  const items='<div id="waresPanel" class="wares-panel" role="tabpanel" aria-labelledby="tab-wares" hidden><section class="catalogue" aria-label="Clan items"><header class="catalogue-header"><div><h2>Items for your kingdom</h2><p id="unlockedCount"></p></div><div class="item-wallet"><small>Your Gold</small><strong id="goldBalance"></strong></div></header><p id="catalogueAlert" class="notice" hidden></p><div id="catalogueScroll" class="scroll-region" tabindex="0" aria-label="All Clan Shop items"><div id="itemGrid" role="listbox" aria-label="Choose an item"></div></div><footer class="catalogue-footer"><span>Daily allowance renews at <b>00:00 UTC</b></span><span>Peace Shield: <b>every 72 hours</b></span></footer></section><section id="selection" class="selection" aria-label="Selected item"></section></div>';
  host.innerHTML=global.CrownlandsClanTowerBuildingsUi.frame(tower,'shop',{
    icon:B.art('shop',current),closeId:'closeShop',upgradeId:'upgradeShop',items,
  })+'<p id="liveStatus" class="sr-only" role="status" aria-live="polite"></p>';
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
function section(id){model.section=['overview','levels','wares'].includes(id)?id:'overview';renderTabs();}
function renderTabs(){
 host.querySelectorAll('[data-section]').forEach(b=>{const active=b.dataset.section===model.section;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 for(const id of ['overview','levels','wares'])$('#'+id+'Panel').hidden=model.section!==id;
 const items=model.section==='wares';
 $('.clan-building-body').classList.toggle('show-items',items);
 $('.building-panel').hidden=items;$('.upgrade-footer').hidden=items;
}
function render(){
 $('#balance').textContent=model.treasury===null?'Unavailable':number(model.treasury);
 $('#balance').title=model.treasury===null?'Unavailable':number(model.treasury)+' Gold';
 $('#buildingArt').src=B.art('shop',model.level);
 $('#buildingLevel').textContent=model.level?'Shop Level '+model.level:'Shop unbuilt';
 $('#levelTrack').innerHTML=Array.from({length:10},(_,i)=>'<span class="'+(i<model.level?'reached':'')+'"></span>').join('');
 $('#levelTrack').setAttribute('aria-label','Level '+model.level+' of 10');
 $('#buildingCaption').textContent=model.level?model.level+' of 10 levels completed':'Build to unlock extra personal item purchases.';
 $('#goldBalance').textContent=number(model.gold);$('#goldBalance').title=number(model.gold)+' Gold';
 renderOverview();renderLevels();renderFooter();renderCatalogue();renderSelection();renderTabs();tick();
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
 $('#selection').innerHTML=`<header class="selection-status"><span>Selected provision</span><b class="${availability.action==='buy'?'':'unavailable'}">${availability.label}</b></header><div class="selection-scroll" tabindex="0" aria-label="${esc(item.name)} details"><div class="selected-hero"><div class="hero-art ${item.id==='common_gear_box'?'common':''}"><img src="${item.art}" alt="${esc(item.name)}"></div><h2 class="selected-name">${esc(item.name)}</h2><p class="selected-kind">${esc(item.category)}</p></div><div class="ornament" aria-hidden="true">◆</div><p class="description">${esc(item.description)}</p><div class="allowance-facts"><div><small>Your Clan Shop limit</small><strong>${unknown?'—':esc(limit)}</strong></div><div><small>${shield?'Purchase cooldown':'Daily reset · 00:00 UTC'}</small><strong>${unknown?'—':resetLabel}</strong></div></div>${increase?`<p class="detail-note">${esc(increase)}</p>`:''}<p class="detail-note">Your Clan Shop allowance is separate from the regular Shop. Changing clans does not renew it.</p>${!model.eligible?`<p class="feedback">Purchases unlock after 1 hour in the clan. ${timer(model.eligibleAt)} remaining.</p>`:''}${model.feedback?`<p class="feedback ${model.failed?'error':''}" role="status">${esc(model.feedback)}</p>`:''}</div><footer class="purchase-footer"><p><span>In your Bag: <b>${number(model.owned[item.id])}</b></span><span>${unknown?'Allowance pending':item.unlocked?`Remaining: <b>${item.remaining} / ${item.limit}</b>`:`Unlocks at Level ${item.unlockLevel}`}</span></p><div class="price"><small>Personal Gold · 1 item</small><strong>${Number.isFinite(item.price)?money(item.price):'—'}</strong></div><button type="button" id="purchase" data-clan-shop-buy="${availability.action==='buy'?item.id:''}" class="primary" data-action="${availability.action||''}" ${availability.disabled?'disabled':''}>${availability.button}</button></footer>`;
}
const levelChange=level=>{
 const before=B.shopStatus(Math.max(0,level-1)),after=B.shopStatus(level);
 return after.flatMap((i,index)=>!before[index].unlocked&&i.unlocked?[`${i.name} · ${i.id==='shield_12h'?'1 every 72 hours':'1 per day'}`]:i.limit>before[index].limit?[`${i.name} · ${i.limit} per day`]:[]).join(' + ');
};
function renderOverview(){
 const next=Math.min(10,model.level+1),maximum=model.level===10;
 const count=level=>B.shopStatus(level).filter(i=>i.unlocked).length;
 const statusFirst=Boolean(model.project||model.pending||model.failed||(!maximum&&reason()));
 $('#overviewPanel').innerHTML=(statusFirst?projectCard():'')+
 '<h2 class="section-heading">Extra item purchases</h2><p class="section-intro">Every completed Shop level unlocks an item or increases a personal allowance.</p><div class="benefit-comparison"><article class="benefit-card"><small>Current · '+(model.level?'Level '+model.level:'Unbuilt')+'</small><strong id="currentBenefit">'+count(model.level)+'</strong><p>items unlocked</p><span class="gain">'+(model.level?'Available through this Shop':'Build Level 1 to buy here')+'</span></article><span class="comparison-arrow" aria-hidden="true">'+(maximum?'◆':'→')+'</span><article class="benefit-card next"><small>'+(maximum?'Maximum benefit':'Next · Level '+next)+'</small><strong id="nextBenefit">'+count(next)+'</strong><p>items unlocked</p><span class="gain">'+(maximum?'All allowances unlocked':esc(levelChange(next)))+'</span></article></div>'+
 '<div class="benefit-explanation"><article><div><h3>Items use your Gold</h3><p>Each member buys for their own Bag after 1 hour in the clan.</p></div></article><article><div><h3>Upgrades use Clan Treasury</h3><p>Leaders and Officers build one level at a time for the whole clan.</p></div></article></div><p class="rules-note">Clan Shop allowances are separate from the regular Shop. Daily limits reset at 00:00 UTC. A Peace Shield can be bought once every 72 hours.</p><button class="retry" type="button" data-browse-items>Browse items →</button>'+(statusFirst?'':projectCard());
}
function renderLevels(){
 $('#levelsPanel').innerHTML='<h2 class="section-heading">The ten Shop levels</h2><p class="section-intro">Each level adds these items or personal allowances. Gold and time are for that level only.</p><table class="levels-table unlock-table"><thead><tr><th scope="col">Level</th><th scope="col">Unlock or allowance</th><th scope="col">Treasury Gold</th><th scope="col">Build time</th></tr></thead><tbody>'+Array.from({length:10},(_,i)=>{
 const level=i+1;return '<tr class="'+(level===model.level?'current':level===model.level+1?'next':'')+'"><td>'+level+'<span class="row-state">'+(level===model.level?'Current':level===model.level+1?'Next':'')+'</span></td><td>'+esc(levelChange(level))+'</td><td>'+number(B.cost(level))+'</td><td>'+time(B.duration(level))+'</td></tr>';
 }).join('')+'</tbody></table><p class="level-footnote">Each member has their own allowance, shared across Clan Shops. Purchases and upgrades are paid separately.</p>';
}
function reason(){
    if(model.level===10)return "Maximum level reached. All items and personal allowances are unlocked.";
    if(!model.manager)return "The Clan Leader and Officers can start building upgrades.";
    if(model.project)return model.project.building!=="shop"?`${B.definition(model.project.building)?.name||"Another building"} is being upgraded. Only one building project can run at a time.`:model.project.paused?"Construction resumes automatically once the walls are fully repaired and incoming attacks end.":"Construction is underway. The completed Shop level remains active.";
    if(model.attack)return "Wait for the incoming attack to end before starting construction.";
    if(model.integrity<100||model.repairActive)return "Fully repair the Tower walls before starting construction.";
    if(model.treasury===null)return "Clan Treasury balance is unavailable. Retry before upgrading.";
    if(model.treasury<B.cost(model.level+1))return `The Clan Treasury needs ${number(B.cost(model.level+1)-model.treasury)} more Gold.`;
    return "";
  }
function progress(){const project=model.project;if(!project)return 0;const remaining=project.paused?project.remaining:Math.max(0,project.end-Date.now());return Math.min(100,Math.max(0,(1-remaining/project.total)*100));}
function projectCard(){
 const project=model.project,active=project?.building==="shop",paused=Boolean(project?.paused);
 const blocked=Boolean(reason())&&model.level!==10;
 let title="Ready to upgrade",badge="Ready",copy="Walls must be fully repaired, with no incoming attack and no other building project.";
 if(model.level===0)title="Ready to build";
 if(model.level===10){title="Shop complete";badge="Maximum level";copy="All ten Shop levels are complete. All items and personal allowances are unlocked.";}
 else if(project){title=active?(paused?`Level ${project.target} upgrade paused`:`Building Level ${project.target}`):"Another building is underway";badge=project.paused?"Paused":active?"In progress":esc(B.definition(project.building)?.name || "Construction");copy=reason();}
 else if(model.pending){title="Starting construction…";badge="Pending";copy="Waiting for the server to confirm construction. The completed level stays active.";}
 else if(blocked){title=!model.manager?"Officer approval required":model.attack?"Incoming attack":(model.integrity<100||model.repairActive)?"Walls need repair":model.treasury===null?"Treasury unavailable":"More Gold needed";badge="Unavailable";copy=reason();}
 if(model.failed){title="Upgrade could not start";badge="Try again";copy=model.feedback;}
 const conditions=!project&&model.level<10?`<div class="conditions"><span class="${(model.integrity<100||model.repairActive)?"unmet":""}">Walls ${model.integrity}%</span><span class="${model.attack?"unmet":""}">${model.attack?"Attack incoming":"No incoming attack"}</span></div>`:"";
 return `<section class="project-card ${model.failed?"error":paused?"paused":blocked?"blocked":""}" aria-label="Construction status"><div class="project-heading"><h3>${title}</h3><span class="state-badge">${badge}</span></div><p>${esc(copy)}</p>${project?`<div class="progress" role="progressbar" aria-label="${esc(B.definition(project.building)?.name || "Building")} construction" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(progress())}"><span style="--progress:${progress()}%"></span></div><div class="project-stats"><span>${paused?"Work preserved":"Work completed"} · <b id="progressPercent">${Math.floor(progress())}%</b></span><span>${paused?"Paused · ":""}<b data-project-time></b> remaining</span></div>`:""}${conditions}${model.treasury===null||model.failed?`<button class="retry" type="button" data-retry ${model.refreshing?"disabled":""}>${model.refreshing?"Refreshing…":"Refresh status"}</button>`:""}</section>`;
}
function renderFooter(){
 const next=Math.min(10,model.level+1),active=model.project?.building==="shop",maximum=model.level===10,paused=active&&model.project.paused;
 $("#upgradeFacts").innerHTML=maximum?'<div><dt>Shop completed</dt><dd>Level 10 / 10</dd></div><div><dt>Catalogue unlocked</dt><dd>7 items</dd></div>':`<div><dt>${active?"Gold paid":model.level?`Level ${next} cost`:"Level 1 cost"}</dt><dd id="upgradeCost">${money(B.cost(next))}</dd></div><div><dt>${active?paused?"Work remaining":"Time remaining":"Construction time"}</dt><dd ${active?"data-project-time":""}>${active?"":time(B.duration(next))}</dd></div>`;
 const button=$("#upgradeShop"),blocked=Boolean(reason());button.disabled=blocked||model.pending;
 button.textContent=maximum?"Maximum level":model.pending?"Starting…":active?paused?"Upgrade paused":"Upgrade in progress":model.project?"Building project active":!model.manager?"Leader / Officer only":model.attack?"Attack incoming":(model.integrity<100||model.repairActive)?"Repair walls first":model.treasury===null?"Balance unavailable":blocked?"Not enough Gold":model.level?`Upgrade to Level ${next}`:"Build Level 1";
 $("#upgradeNote").textContent=model.failed?model.feedback:reason()||"Paid upfront from Clan Treasury. One building project per Tower. Construction cannot be canceled.";$("#upgradeNote").className=model.failed?"error":"";
}

 const projectKey=model.project?[model.project.building,model.project.target,model.project.end].join(':'):'';
 function tick(){
   const project=model.project;if(!project)return;
   const remaining=project.paused?project.remaining:Math.max(0,project.end-Date.now());
   host.querySelectorAll('[data-project-time]').forEach(node=>node.textContent=time(remaining));
   const bar=$('.progress');if(bar){bar.setAttribute('aria-valuenow',String(Math.floor(progress())));bar.firstElementChild.style.setProperty('--progress',progress()+'%');$('#progressPercent').textContent=Math.floor(progress())+'%';}
   if(!project.paused&&remaining===0&&model.countdownRefreshKey!==projectKey){model.countdownRefreshKey=projectKey;options.onRefresh?.();}
 }
  $('#itemGrid').addEventListener('click',e=>{const card=e.target.closest('[data-item]');if(card)select(card.dataset.item);});
  $('#itemGrid').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const ids=B.SHOP_ITEMS.map(i=>i.id),index=ids.indexOf(model.selected),cols=getComputedStyle($('#itemGrid')).gridTemplateColumns.split(' ').length,delta=e.key==='ArrowDown'?cols:e.key==='ArrowUp'?-cols:e.key==='ArrowLeft'?-1:1;select(ids[e.key==='Home'?0:e.key==='End'?ids.length-1:Math.max(0,Math.min(ids.length-1,index+delta))],true);});
  $('#selection').addEventListener('click',e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='buy'&&getAvailability(chosen()).action==='buy')options.onBuy?.(model.selected);
    if(action==='upgrade'){section('levels');$('#tab-levels').focus();}
    if(action==='retry'&&!model.refreshing)options.onRefresh?.();
  });
  host.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>section(b.dataset.section)));
  $('.shop-tabs').addEventListener('keydown',e=>{if(!e.target.matches('[role="tab"]')||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const sections=['overview','levels','wares'],index=sections.indexOf(model.section),next=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:-1)+3)%3;section(sections[next]);$('#tab-'+sections[next]).focus();});
  $('#upgradeShop').addEventListener('click',()=>{if(reason()||model.pending)return;model.pending=true;model.failed=false;renderOverview();renderFooter();options.onBuild?.();});
  $('#overviewPanel').addEventListener('click',event=>{if(event.target.closest('[data-retry]')&&!model.refreshing)options.onRefresh?.();if(event.target.closest('[data-browse-items]')){section('wares');$('#tab-wares').focus();}});
  $('#closeShop').addEventListener('click',()=>options.onClose?.());
  $('[data-shop-back]').addEventListener('click',()=>options.onBack?.());
  $('[data-shop-building]').addEventListener('change',e=>options.onBuilding?.(e.target.value));
  render();
  for(const [selector,top] of Object.entries(savedScroll)){const el=host.querySelector(selector);if(el)el.scrollTop=top;}
  if(focused)host.querySelector('#'+CSS.escape(focused))?.focus({preventScroll:true});
  let refreshed=false;
  const clock=global.setInterval(()=>{tick();host.querySelectorAll('[data-clan-tower-countdown]').forEach(el=>{const end=Number(el.dataset.clanTowerCountdown);el.textContent=time(end-Date.now());if(!refreshed&&end>now&&end<=Date.now()){refreshed=true;options.onRefresh?.();}});},1000);
  const dialog=host.closest('dialog');
  const cleanup=()=>{global.clearInterval(clock);dialog?.removeEventListener('close',cleanup);};
  host._clanTowerClockCleanup=cleanup;dialog?.addEventListener('close',cleanup,{once:true});
  host.dataset.clanShopReady='true';
 }
 global.CrownlandsClanShopUi=Object.freeze({mount});
})(window);
