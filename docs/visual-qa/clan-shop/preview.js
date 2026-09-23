"use strict";
/* Design review only: in-memory samples, no authentication, storage or backend calls.
 * Allowance/unlock/construction rules use the current shared Clan Tower module.
 * Price sample mirrors game.js calculateScalableShopPrice: 250,000 base Gold/h, 20 cities.
 */
const B=window.CrownlandsClanTowerBuildings,E=window.CROWNLANDS_ECONOMY_CONFIG,$=s=>document.querySelector(s),dialog=$('#shopDialog');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Math.max(0,Math.floor(n||0)).toLocaleString('en-US');
const coin='assets/icons/royal-shop-gold-r1.svg',money=n=>`<img src="${coin}" alt="">${number(n)}`;
const ITEMS={
 recall_horn:{art:'assets/optimized/item-recall-horn-384x384-66b7bde99a6d.webp',category:'March orders',hours:.54,description:'Cancels one active march before it reaches the target.'},
 swift_march_order:{art:'assets/optimized/item-swift-march-384x384-cbdfa5099ab0.webp',category:'March orders',hours:.36,description:'Speeds up one owned-city transfer or reinforcement to an owned Stronghold.'},
 royal_tax_decree_30m:{art:'assets/optimized/item-royal-tax-decree-384x384-86d99a278ab1.webp',category:'Gold production',hours:.18,description:`Adds ${E.shopItems.royal_tax_decree_30m.bonusPercent}% of base Gold production from owned cities for ${E.shopItems.royal_tax_decree_30m.effectDurationMinutes} minutes. Using more adds their duration to the active timer.`},
 war_drums_30m:{art:'assets/optimized/item-war-drums-384x384-40892cafa303.webp',category:'Troop production',hours:.36,description:`Adds ${E.shopItems.war_drums_30m.bonusPercent}% of base troop production from owned cities for ${E.shopItems.war_drums_30m.effectDurationMinutes} minutes. Using more adds their duration to the active timer.`},
 veil_of_silence_30m:{art:'assets/optimized/item-veil-of-silence-384x384-45fcf6e08b34.webp',category:'Scouting protection',hours:.18,description:`Blocks enemy scouting for ${E.shopItems.veil_of_silence_30m.effectDurationMinutes} minutes.`},
 common_gear_box:{art:'assets/icons/common-gear-chest-r1.svg',category:'Common · Officer equipment',hours:1,description:'Open in your Bag to receive exactly 3 random Common gear pieces for your Inner Castle officers.'},
 shield_12h:{art:'assets/optimized/item-peace-shield-384x384-c74d2eb2f8ac.webp',category:'Peace Shield · 12 hours',hours:1,description:'Protects your regular cities for 12 hours and turns back active rival attacks traveling to or from them. Attacking another player cancels it. Strongholds are excluded.'},
};
let model,epoch=0,purchaseTimer;
const prices=Object.fromEntries(Object.entries(ITEMS).map(([id,item])=>{const raw=250000*item.hours*(1+20/500),step=10**Math.max(1,Math.floor(Math.log10(raw))-1);return[id,Math.max(1000,Math.round(raw/step)*step)];}));
const rows=()=>B.shopStatus(model.level,model.usage,Date.now()).map(item=>({...item,...ITEMS[item.id],price:prices[item.id]}));
const chosen=()=>rows().find(i=>i.id===model.selected);
function time(ms){const s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}h ${m}m`:`${m}m ${String(s%60).padStart(2,'0')}s`;}
const timer=at=>`<span data-countdown="${at}">${time(at-Date.now())}</span>`;
function notify(message){$('#liveStatus').textContent=message;parent.postMessage({type:'clan-shop-status',message},location.origin);}
function reset(level=9,sample='ready'){
 clearTimeout(purchaseTimer);epoch++;
 model={level:B.level(level),sample,section:'wares',selected:'common_gear_box',gold:5000000,treasury:3400000000,eligible:sample!=='new',eligibleAt:Date.now()+8*3600000,manager:sample!=='member',usage:{utcDate:new Date().toISOString().slice(0,10),counts:{swift_march_order:1}},owned:Object.fromEntries(B.SHOP_ITEMS.map(i=>[i.id,i.id==='common_gear_box'?3:2])),pending:false,feedback:'',failed:false,failOnce:sample==='error',project:null};
 if(model.level<9)model.selected=model.level>=2?'royal_tax_decree_30m':'recall_horn';
 if(model.level===10)model.selected='shield_12h';
 if(sample==='spent'){model.usage.counts=Object.fromEntries(rows().map(i=>[i.id,i.limit]));model.usage.shieldReadyAtMs=Date.now()+41*3600000+12*60000;}
 if(sample==='low')model.gold=100;
 if(['upgrading','paused'].includes(sample)&&model.level<10)model.project={end:Date.now()+B.duration(model.level+1),remaining:B.duration(model.level+1),paused:sample==='paused'};
 render();notify('Interactive Clan Shop draft · Sample Gold and inventory only.');
}
function getAvailability(item){
 if(model.pending)return{label:'Confirming purchase',button:'Confirming…',disabled:true};
 if(model.sample==='loading')return{label:'Loading stock',button:'Loading…',disabled:true};
 if(model.sample==='unavailable')return{label:'Stock unavailable',button:'Retry',action:'retry'};
 if(!model.level)return{label:'Shop unbuilt',button:'View building',action:'upgrade'};
 if(!item.unlocked)return{label:`Unlocks at Level ${item.unlockLevel}`,button:'View unlock',action:'upgrade'};
 if(!model.eligible)return{label:'Membership wait',button:'Not yet available',disabled:true};
 if(!item.remaining)return{label:'Allowance used',button:'Restocking',disabled:true};
 if(model.gold<item.price)return{label:'Not enough Gold',button:'Not enough Gold',disabled:true};
 return{label:'Available',button:'Purchase one',action:'buy'};
}
function select(id,focus=false){if(!ITEMS[id])return;model.selected=id;model.feedback='';renderCatalogue();renderSelection();if(focus){const card=$(`[data-item="${id}"]`);card.focus({preventScroll:true});card.scrollIntoView({block:'nearest'});}notify(chosen().name+' selected.');}
function section(id){model.section=id;renderTabs();if(id==='upgrades')renderUpgrades();else{renderCatalogue();renderSelection();}}
function renderTabs(){document.querySelectorAll('[data-section]').forEach(b=>{const active=b.dataset.section===model.section;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});$('#waresPanel').hidden=model.section!=='wares';$('#upgradesPanel').hidden=model.section!=='upgrades';}
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
 $('#itemGrid').innerHTML=items.map(i=>`<button type="button" role="option" class="item-card ${!i.unlocked?'locked':''} ${i.id==='common_gear_box'?'chest':''}" data-item="${i.id}" aria-selected="${i.id===model.selected}" tabindex="${i.id===model.selected?0:-1}" aria-label="${esc(i.name)}, ${number(i.price)} Gold, ${unknown?'stock pending':!i.unlocked?'unlocks at Level '+i.unlockLevel:i.remaining+' of '+i.limit+' remaining'}"><span class="card-art"><img src="${i.art}" alt=""></span><strong>${esc(i.name)}</strong><span class="card-price">${money(i.price)}</span><span class="card-allowance ${i.unlocked&&!i.remaining?'spent':''}">${unknown?'Checking allowance':!i.unlocked?`Shop Level ${i.unlockLevel}`:`${i.remaining} / ${i.limit} ${i.remaining?'remaining':'· restocking'}`}</span></button>`).join('');
}
function renderSelection(){
 const item=chosen(),availability=getAvailability(item),shield=item.id==='shield_12h',unknown=['loading','unavailable'].includes(model.sample);
 const limit=item.unlocked?`${item.limit} ${shield?'every 72h':'per day'}`:`Unlocks at Lv ${item.unlockLevel}`;
 const resetLabel=shield?(item.remaining?'Starts after purchase':`Ready in ${timer(item.resetAtMs)}`):`Renews in ${timer(item.resetAtMs)}`;
 const increase=item.increaseLevel&&model.level<item.increaseLevel?`Shop Level ${item.increaseLevel} increases this allowance to 2 per day.`:'';
 $('#selection').innerHTML=`<header class="selection-status"><span>Selected provision</span><b class="${availability.action==='buy'?'':'unavailable'}">${availability.label}</b></header><div class="selection-scroll" tabindex="0" aria-label="${esc(item.name)} details"><div class="selected-hero"><div class="hero-art ${item.id==='common_gear_box'?'common':''}"><img src="${item.art}" alt="${esc(item.name)}"></div><h2 class="selected-name">${esc(item.name)}</h2><p class="selected-kind">${esc(item.category)}</p></div><div class="ornament" aria-hidden="true">◆</div><p class="description">${esc(item.description)}</p><div class="allowance-facts"><div><small>Your Clan Shop limit</small><strong>${unknown?'—':esc(limit)}</strong></div><div><small>${shield?'Purchase cooldown':'Daily reset · 00:00 UTC'}</small><strong>${unknown?'—':resetLabel}</strong></div></div>${increase?`<p class="detail-note">${esc(increase)}</p>`:''}<p class="detail-note">Your Clan Shop allowance is separate from the regular Shop. Changing clans does not renew it.</p>${!model.eligible?`<p class="feedback">Purchases unlock after 24 hours in the clan. ${timer(model.eligibleAt)} remaining.</p>`:''}${model.feedback?`<p class="feedback ${model.failed?'error':''}" role="status">${esc(model.feedback)}</p>`:''}</div><footer class="purchase-footer"><p><span>In your Bag: <b>${number(model.owned[item.id])}</b></span><span>${unknown?'Allowance pending':item.unlocked?`Remaining: <b>${item.remaining} / ${item.limit}</b>`:`Unlocks at Level ${item.unlockLevel}`}</span></p><div class="price"><small>Personal Gold · 1 item</small><strong>${money(item.price)}</strong></div><button type="button" id="purchase" class="primary" data-action="${availability.action||''}" ${availability.disabled?'disabled':''}>${availability.button}</button></footer>`;
}
const levelChange=level=>{
 const before=B.shopStatus(Math.max(0,level-1)),after=B.shopStatus(level);
 return after.flatMap((i,index)=>!before[index].unlocked&&i.unlocked?[`${i.name} · ${i.id==='shield_12h'?'1 every 72 hours':'1 per day'}`]:i.limit>before[index].limit?[`${i.name} · ${i.limit} per day`]:[]).join(' + ');
};
function renderUpgrades(){
 const current=model.level,next=Math.min(10,current+1),project=model.project,paused=project?.paused;
 const reason=!model.manager?'The Clan Leader and Officers manage building upgrades.':current===10?'Your Clan Shop has reached its highest level.':paused?'Construction is paused. Fully repair the walls and wait for incoming attacks to end.':project?'Your current catalogue remains available during construction.':`Paid from Clan Treasury. One building project at a time. Projects cannot be canceled.`;
 $('#upgradesPanel').innerHTML=`<section class="building-summary" tabindex="0" aria-label="Shop level and benefits"><img class="building-art" src="${B.art('shop',current)}" alt="Clan Shop building"><p>RAVENWATCH · TOWER STORES</p><h2>${current?`Shop Level ${current}`:'Build your Clan Shop'}</h2><div class="level-track" aria-label="Level ${current} of 10">${Array.from({length:10},(_,i)=>`<span class="${i<current?'reached':''}"></span>`).join('')}</div><p>Extra personal purchases for your clan. Items are paid for with each member's own Gold.</p><div class="benefit-box"><small>Current benefit</small><strong>${current?`${rows().filter(i=>i.unlocked).length} provisions unlocked`:'No purchases yet'}</strong><p>${current?'Daily quantities follow your completed Shop level.':'Members may browse the catalogue before construction is complete.'}</p></div>${current<10?`<div class="benefit-box"><small>Next · Level ${next}</small><strong>${next===10?'Royal Peace Shield':next===9?'Common Gear Box':'More supplies'}</strong><p>${esc(levelChange(next))}</p></div>`:''}</section><section class="upgrades-main"><div class="upgrade-scroll" tabindex="0" aria-label="All ten Shop levels"><h2>The growing catalogue</h2><p>New provisions and larger personal allowances with each level.</p><table class="unlock-table"><thead><tr><th>Level</th><th>Unlock or improvement</th><th>Progress</th></tr></thead><tbody>${Array.from({length:10},(_,i)=>{const lv=i+1;return`<tr class="${lv===current?'current':lv===current+1?'next':''}"><td>${lv}</td><td>${esc(levelChange(lv))}</td><td>${lv===current?'Current':lv<current?'Unlocked':lv===current+1?'Next':'Locked'}</td></tr>`;}).join('')}</tbody></table></div><footer class="upgrade-footer"><dl><div><dt>Clan Treasury</dt><dd>${number(model.treasury)} Gold</dd></div>${current<10?`<div><dt>${project?'Gold paid':`Level ${next} cost`}</dt><dd>${number(B.cost(next))} Gold</dd></div><div><dt>${project?paused?'Work remaining':'Time remaining':'Construction time'}</dt><dd>${project?paused?time(project.remaining):timer(project.end):time(B.duration(next))}</dd></div>`:''}</dl><button id="upgradeShop" type="button" class="primary" ${!model.manager||current===10||project?'disabled':''}>${current===10?'Maximum level':paused?'Construction paused':project?'Upgrading…':current?`Upgrade to Level ${next}`:'Build Level 1'}</button><p role="status">${esc(reason)}</p></footer></section>`;
}
function buy(){
 const item=chosen();if(getAvailability(item).action!=='buy')return;
 const id=item.id,token=epoch,shouldFail=model.failOnce;model.failOnce=false;model.pending=true;model.feedback='Confirming your purchase…';model.failed=false;renderSelection();notify('Confirming sample purchase.');
 purchaseTimer=setTimeout(()=>{if(token!==epoch)return;model.pending=false;if(shouldFail){model.failed=true;model.feedback='Purchase failed. No Gold was spent. Please try again.';}else{model.usage=B.purchaseUsage(model.level,model.usage,id,1,Date.now());model.gold-=item.price;model.owned[id]++;model.failed=false;model.feedback=item.name+' added to your Bag.';}render();$('#purchase')?.focus({preventScroll:true});notify(model.feedback+' · Draft only.');},550);
}
function close(){dialog.close();$('#dismissed').hidden=false;notify('Clan Shop draft closed.');}
$('#itemGrid').addEventListener('click',e=>{const card=e.target.closest('[data-item]');if(card)select(card.dataset.item);});
$('#itemGrid').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const ids=B.SHOP_ITEMS.map(i=>i.id),index=ids.indexOf(model.selected),cols=getComputedStyle($('#itemGrid')).gridTemplateColumns.split(' ').length,delta=e.key==='ArrowDown'?cols:e.key==='ArrowUp'?-cols:e.key==='ArrowLeft'?-1:1;select(ids[e.key==='Home'?0:e.key==='End'?ids.length-1:Math.max(0,Math.min(ids.length-1,index+delta))],true);});
$('#selection').addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='buy')buy();if(action==='upgrade'){section('upgrades');$('#tab-upgrades').focus();}if(action==='retry'){model.sample='ready';render();notify('Sample stock reloaded.');}});
document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>section(b.dataset.section)));
$('.shop-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'wares':e.key==='End'?'upgrades':model.section==='wares'?'upgrades':'wares';section(next);$('#tab-'+next).focus();});
$('#upgradesPanel').addEventListener('click',e=>{if(!e.target.closest('#upgradeShop')||!model.manager||model.project||model.level===10)return;model.treasury-=B.cost(model.level+1);model.project={end:Date.now()+B.duration(model.level+1),remaining:B.duration(model.level+1),paused:false};renderUpgrades();notify('Sample construction started. The completed Shop level stays active.');});
$('#closeShop').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});$('#reopen').addEventListener('click',()=>{$('#dismissed').hidden=true;dialog.showModal();});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='clan-shop-review')reset(e.data.level,e.data.sample);});
setInterval(()=>{if(dialog.open)document.querySelectorAll('[data-countdown]').forEach(n=>n.textContent=time(Number(n.dataset.countdown)-Date.now()));},1000);
const query=new URLSearchParams(location.search);reset(query.has('level')?Number(query.get('level')):9,query.get('sample')||'ready');dialog.showModal();document.documentElement.dataset.clanShopReady='true';
