"use strict";
/* Synthetic design-review data only. No game scripts, accounts, storage or network actions. */
const $=s=>document.querySelector(s),dialog=$('#shopDialog'),selection=$('#selection');
const coin='docs/visual-qa/shop-ui/coin.svg';
const glyphs={store:'<path d="M5 13h22v16H5Z M3 12l3-9h20l3 9M3 12q3 6 6 0 3 6 6 0 3 6 6 0 4 6 8 0M12 29V19h8v10M10 3l-1 9m7-9v9m6-9 1 9"/>',bag:'<path d="M10 3h12l-3 6H13Z M12 10c-1 5-9 9-9 15 0 7 26 7 26 0 0-6-8-10-9-15Z M11 10h11M13 16l-3 9m12-9 1 9"/>',buy:'<path d="M7 3h17v26H7Z M11 8h9m-9 5h9m-9 5h5m-5 6h5M5 6H3v25h18M20 22l3 3 6-8"/>',play:'<path d="M5 4h22v24H5Z M13 10l8 6-8 6Z M8 4v24m16-24v24"/>'};
const icon=n=>`<svg class="ink-icon" viewBox="0 0 32 32" aria-hidden="true">${glyphs[n]||glyphs.bag}</svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('en-US'),compact=n=>n>=1e9?`${+(n/1e9).toFixed(2)}B`:n>=1e6?`${+(n/1e6).toFixed(2)}M`:n>=1e3?`${+(n/1e3).toFixed(1)}K`:String(n);
const money=n=>`<img src="${coin}" alt="">${compact(n)}`;
let source,model,artwork='new',epoch=0,countdownTimer=null,adChoice=null;const purchaseTimers=new Set();
function notify(message){$('#liveStatus').textContent=message;parent.postMessage({type:'shop-status',message},location.origin);}
function remaining(){return Math.max(0,Math.ceil((model.cooldownUntil-Date.now())/1000));}
function clockLabel(){const s=remaining();return `${Math.floor(s/60)}m ${String(s%60).padStart(2,'0')}s`;}
function art(item){return artwork==='previous'?item.previousIcon||item.icon:item.icon;}
function chosen(){return (model.section==='provisions'?model.items:source.rewards).find(i=>i.id===model.selected);}
function availability(){if(model.adsUnavailable)return 'Rewarded ads unavailable';if(model.watched>=source.rewardRules.dailyLimit)return 'Daily limit reached';return remaining()>0?`Available in ${clockLabel()}`:'Available now';}
function canWatch(){return !model.adsUnavailable&&model.watched<source.rewardRules.dailyLimit&&remaining()===0;}
function reset(sample='ready'){
 purchaseTimers.forEach(clearTimeout);purchaseTimers.clear();epoch++;adChoice=null;if($('#adDialog').open)$('#adDialog').close();
 model={items:source.items.map(i=>({...i,purchased:0,pending:0})),gold:source.sample.gold,section:'provisions',selected:'common_gear_box',sample,failOnce:sample==='error',feedback:'',feedbackError:false,watched:0,cooldownUntil:0,adsUnavailable:false};
 if(sample==='low')model.gold=100;
 if(sample==='limit')model.items[0].purchased=1;
 if(sample==='pending'){model.selected='war_drums_30m';const item=model.items.find(i=>i.id===model.selected);item.pending=1;item.owned++;item.purchased++;model.gold-=item.price;model.feedback='1 purchase queued. You can buy another while it is confirmed.';}
 if(sample==='large'){model.gold=234567890123;model.items.forEach(i=>i.owned=123456789);}
 if(['rewards','cooldown','adlimit','unavailable'].includes(sample)){model.section='rewards';model.selected='gold';model.watched=sample==='adlimit'?source.rewardRules.dailyLimit:sample==='cooldown'?1:0;model.cooldownUntil=sample==='cooldown'?Date.now()+14*60*1000:0;model.adsUnavailable=sample==='unavailable';}
 render();notify('Preview reset · Sample inventory and Gold only.');
}
function render(){
 $('#goldBalance').textContent=compact(model.gold);$('#goldBalance').title=number(model.gold)+' Gold';
 document.querySelectorAll('[data-section]').forEach(b=>{const active=b.dataset.section===model.section;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 $('.shop-catalog').dataset.section=model.section;$('#catalogPanel').setAttribute('aria-labelledby','tab-'+model.section);
 const rewards=model.section==='rewards',items=rewards?source.rewards:model.items;
 $('#catalogTitle').textContent=rewards?'Free .5h Boosts':'The royal stores';$('#catalogNote').textContent=rewards?'Optional advertisements':'7 provisions';
 $('#catalogFooter').innerHTML=rewards?'<span>One shared 30-minute cooldown</span><span>Daily reset · 00:00 UTC</span>':'<span>Purchased items go to your Bag</span><span>One item per purchase</span>';
 $('#itemGrid').innerHTML=items.map(i=>`<button class="item-tile ${rewards?'reward-tile':''}" data-item="${i.id}" type="button" aria-label="${esc(i.label)}${rewards?'':`, ${number(i.price)} Gold`}" aria-pressed="${model.selected===i.id}"><span class="tile-art"><img src="${esc(art(i))}" alt="" draggable="false"></span><span class="item-name">${esc(i.label)}</span>${rewards?`<span class="reward-caption">${esc(i.description)}</span><span class="tile-price">${esc(availability())}</span>`:`<span class="tile-price" title="${number(i.price)} Gold">${money(i.price)}</span>`}</button>`).join('')+(rewards?'':`<div class="tile-empty" aria-hidden="true">${icon('bag')}<span>For your realm</span></div>`);
 $('#itemGrid').querySelectorAll('[data-item]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.item)));
 renderSelection();
}
function select(id){model.selected=id;model.feedback='';render();document.querySelector(`[data-item="${id}"]`)?.focus({preventScroll:true});notify(chosen().label+' selected.');}
function renderSelection(){
 const item=chosen(),rewards=model.section==='rewards';if(!item)return;
 const exhausted=!rewards&&item.purchased>=item.dailyLimit,poor=!rewards&&model.gold<item.price;
 const status=rewards?availability():exhausted?'Daily limit reached':poor?'Not enough Gold':item.pending?`${item.pending} queued`:'Available';
 const button=rewards?'Watch Advertisement':exhausted?'Daily Limit Reached':poor?'Not Enough Gold':item.pending?'Buy Again':'Buy';
 const disabled=rewards?!canWatch():exhausted||poor;
 const description=item.description;
 const note=rewards?`Estimated reward: ${number(source.sample.rewardAmounts[item.id])} ${item.rewardLabel}.<br>One shared ${source.rewardRules.cooldownMinutes}-minute cooldown for both rewards.`:item.id==='common_gear_box'?'Opens in your Bag. One box available from the Shop each UTC day.':`Daily purchase limit: ${item.dailyLimit}. Resets at 00:00 UTC.`;
 selection.innerHTML=`<div class="selection-heading"><span>${rewards?'Optional reward':'Selected provision'}</span><span>${esc(status)}</span></div><div class="selection-scroll"><div class="selected-hero"><div class="selected-art"><img src="${esc(art(item))}" alt="${esc(item.label)} illustration"></div><h2>${esc(item.label)}</h2><p class="selected-category">${rewards?'Advertisement reward':esc(item.category)}</p></div><div class="decorative-rule" aria-hidden="true">◆</div><p class="description">${esc(description)}</p><p class="detail-note">${note}</p>${model.feedback?`<p class="action-feedback ${model.feedbackError?'error':''}" role="status">${esc(model.feedback)}</p>`:''}</div><footer class="purchase-footer"><div class="purchase-stats">${rewards?`<span>Watched today <strong>${model.watched} / ${source.rewardRules.dailyLimit}</strong></span><span>UTC</span>`:`<span>Owned <strong data-owned>${number(item.owned)}</strong></span><span>Daily <strong data-daily>${item.purchased} / ${item.dailyLimit}</strong></span>`}</div><div class="purchase-action"><div class="price-total"><span>${rewards?'Cost':'Price · 1 item'}</span><strong title="${rewards?'No Gold required':number(item.price)+' Gold'}">${rewards?'Free':money(item.price)}</strong></div><button class="buy-button" type="button" ${disabled?'disabled':''} id="buyItem">${icon(rewards?'play':'buy')}<span>${button}</span></button></div></footer>`;
 $('#buyItem').addEventListener('click',rewards?watch:buy);
}
function buy(){
 const item=chosen();if(item.purchased>=item.dailyLimit||model.gold<item.price)return;
 const token=epoch,id=item.id,fail=model.failOnce;model.failOnce=false;item.owned++;item.purchased++;item.pending++;model.gold-=item.price;model.feedback=`${item.pending} purchase${item.pending===1?'':'s'} queued.`;model.feedbackError=false;render();$('#buyItem')?.focus({preventScroll:true});
 const timer=setTimeout(()=>{purchaseTimers.delete(timer);if(token!==epoch)return;const target=model.items.find(i=>i.id===id);target.pending--;if(fail){model.gold+=target.price;target.owned--;target.purchased--;model.feedback='Purchase could not be confirmed. Gold and item counts restored. Try again.';model.feedbackError=true;notify('Sample purchase failed. Reserved Gold and item quantity were restored.');}else{model.feedback=target.label+' added to your Bag.';model.feedbackError=false;notify(`${target.label} purchased in this draft · ${number(target.price)} sample Gold spent.`);}render();},650);purchaseTimers.add(timer);
}
function watch(){if(!canWatch())return;adChoice=chosen().id;$('#adConfirmText').textContent=`Receive ${source.rewardRules.minutes} minutes of ${chosen().rewardLabel==='gold'?'Gold':'Troop'} production after a completed advertisement. Estimated reward: ${number(source.sample.rewardAmounts[adChoice])} ${chosen().rewardLabel}.`;$('#adDialog').showModal();$('#cancelAd').focus();}
function startCountdown(){clearInterval(countdownTimer);countdownTimer=setInterval(()=>{if(!dialog.open)return;const hadCooldown=model._lastSeconds>0;model._lastSeconds=remaining();if(model.section==='rewards'&&(remaining()>0||hadCooldown)){const focused=document.activeElement?.id;render();if(focused)document.getElementById(focused)?.focus({preventScroll:true});}},1000);}
function close(){clearInterval(countdownTimer);dialog.close();$('#dismissed').hidden=false;notify('Shop preview closed.');}
document.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>{model.section=b.dataset.section;model.selected=model.section==='provisions'?model.items[0].id:source.rewards[0].id;model.feedback='';render();b.focus();notify(model.section==='provisions'?'Provisions selected.':'Optional rewards selected.');}));
$('#sections').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();$('#tab-'+(e.key==='Home'?'provisions':e.key==='End'?'rewards':model.section==='provisions'?'rewards':'provisions')).click();});
$('#itemGrid').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const ids=(model.section==='provisions'?model.items:source.rewards).map(i=>i.id),index=ids.indexOf(model.selected),delta=e.key==='ArrowDown'?4:e.key==='ArrowUp'?-4:e.key==='ArrowRight'?1:-1;select(ids[e.key==='Home'?0:e.key==='End'?ids.length-1:(index+delta+ids.length)%ids.length]);});
$('#closeShop').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});$('#reopen').addEventListener('click',()=>{$('#dismissed').hidden=true;render();dialog.showModal();startCountdown();});
$('#cancelAd').addEventListener('click',()=>{$('#adDialog').close();adChoice=null;$('#buyItem')?.focus();});
$('#completeAd').addEventListener('click',()=>{if(!adChoice||!canWatch())return;const id=adChoice;adChoice=null;model.watched++;model.cooldownUntil=Date.now()+source.rewardRules.cooldownMinutes*60000;if(id==='gold')model.gold+=source.sample.rewardAmounts.gold;model.feedback='Reward received. Both advertisements now share the cooldown.';$('#adDialog').close();render();notify(`Simulated ${source.rewards.find(r=>r.id===id).label} completion · Shared 30-minute cooldown started.`);});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||!source)return;if(e.data?.type==='shop-review'){artwork=e.data.artwork==='previous'?'previous':'new';reset(e.data.sample);}if(e.data?.type==='shop-artwork'){artwork=e.data.artwork==='previous'?'previous':'new';render();notify(artwork==='new'?'New illustrated items.':'Previous item artwork for comparison.');}});
fetch('docs/visual-qa/shop-ui/snapshot.json').then(r=>{if(!r.ok)throw Error('Could not load review snapshot');return r.json();}).then(data=>{source=data;$('.shop-seal').innerHTML=icon('store');reset();dialog.showModal();startCountdown();}).catch(error=>{notify(error.message);$('#dismissed').hidden=false;$('#dismissed p').textContent=error.message;});
