/* Local design interactions only. No Firebase, account, or game-state connection. */
"use strict";
const samples=window.AchievementReviewSamples, badge=window.achievementBadge;
const $=id=>document.getElementById(id), copy=v=>JSON.parse(JSON.stringify(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Math.floor(Number(v)||0).toLocaleString('en-US');
let state, category='all', filter='all', selected='conqueror_iii', mode='mixed', busy=false, error='', generation=0;
const complete=a=>Boolean(a.completedAtMs||a.claimedAtMs), claimed=a=>Boolean(a.claimedAtMs), ready=a=>complete(a)&&!claimed(a);
const status=a=>claimed(a)?'Collected':ready(a)?'Ready to claim':'Underway';
const difficulty=a=>({easy:'Easy',medium:'Medium',hard:'Hard',very_hard:'Very hard',prestige:'Prestige'}[a.difficulty]);
function announce(message){$('liveStatus').textContent=message;parent.postMessage({type:'achievements-status',message},location.origin);}
function progressLabel(a){return a.metric==='long_reign_hours'?`${Math.min(a.target,a.progress).toFixed(1)} / ${a.target}h`:`${number(a.progress)} / ${number(a.target)}`;}
function reward(a){
  const r=a.lockedReward||a.rewardSpec;
  if(r.type==='item'){const item=samples.items[r.itemId];return{amount:`×${number(r.lockedAmount||1)}`,label:item.label,short:item.label,art:item.art,item:true,note:complete(a)?'Item reward earned. Collect it into your Bag.':'Earn this item by completing the achievement.'};}
  const label=r.type==='gold'?'Gold':'Troops', locked=Boolean(a.lockedReward);
  return{amount:locked?number(r.lockedAmount):`${r.productionHours}h`,label,short:locked?label:`${label==='Gold'?'Gold':'Troop'} prod.`,art:r.type==='gold'?'assets/icons/royal-shop-gold-r1.svg':'assets/icons/daily-login-troops-r1.svg',item:false,note:locked?`Based on ${r.productionHours} hours of raw ${label.toLowerCase()} production when completed. This amount is fixed.`:`Worth ${r.productionHours} hours of raw ${label.toLowerCase()} production. The amount is fixed when you complete this achievement.`};
}
function sorted(){return state.achievements.filter(a=>(category==='all'||a.category===category)&&(filter==='all'||filter==='ready'&&ready(a)||filter==='progress'&&!complete(a)||filter==='claimed'&&claimed(a))).sort((a,b)=>Number(ready(b))-Number(ready(a))||a.order-b.order);}
function progress(a){return `<div class="progress-label"><span class="row-status">${status(a)}</span><strong>${progressLabel(a)}</strong></div><span class="progress-track" role="progressbar" aria-label="${esc(a.title)} progress" aria-valuemin="0" aria-valuemax="${a.target}" aria-valuenow="${a.progress}"><i style="width:${Math.min(100,a.progress/a.target*100)}%"></i></span>`;}
function row(a){const r=reward(a);return `<button class="achievement-row ${ready(a)?'ready':''} ${claimed(a)?'claimed':''}" data-achievement="${a.id}" aria-pressed="${selected===a.id}" aria-label="${esc(`${a.title}. ${status(a)}. ${progressLabel(a)}. Reward: ${r.amount} ${r.short}.`)}"><span class="row-badge">${badge(a.category)}${claimed(a)?'<span class="seal-check" aria-hidden="true">✓</span>':''}</span><span class="row-copy"><span class="row-kicker">${a.categoryLabel}<i></i>${difficulty(a)}</span><strong class="row-title">${esc(a.title)}</strong><span class="row-description">${esc(a.description)}</span>${progress(a)}</span><span class="row-reward ${r.item?'item':''} ${r.amount.length>7?'large':''}"><img src="${r.art}" alt=""><strong>${r.amount}</strong><small>${r.short}</small></span></button>`;}
function renderDetail(){
  const a=state.achievements.find(a=>a.id===selected);
  if(!a||['loading','error','expired'].includes(mode)){$('detailNumber').textContent='Seasonal achievements';$('detailState').textContent='';$('detailScroll').innerHTML='<p class="detail-empty">Select an achievement to read its requirements and reward.</p>';$('actionFooter').innerHTML='<p>Your seasonal deeds await.</p><button disabled>Select an achievement</button>';return;}
  const r=reward(a), remaining=Math.max(0,a.target-a.progress), remainingLabel=complete(a)?'Requirement met':a.metric==='long_reign_hours'?`${remaining.toFixed(1)}h remaining`:`${number(Math.ceil(remaining))} remaining`;
  $('detailNumber').textContent=`Honor ${String(a.order+1).padStart(2,'0')} of 40`;$('detailState').textContent=status(a);
  $('detailScroll').innerHTML=`<div class="achievement-hero"><span class="hero-badge">${badge(a.category)}</span><h2>${esc(a.title)}</h2><p class="eyebrow">${a.categoryLabel} · ${difficulty(a)}</p></div><div class="ornament" aria-hidden="true">◆</div><section class="objective"><h3>Requirement</h3><p>${esc(a.description)}</p>${progress(a)}</section><p class="requirement-note">${esc(samples.notes[a.metric])} ${remainingLabel}.</p><section class="reward-section"><h3>${claimed(a)?'Reward collected':'Achievement reward'}</h3><div class="reward-box"><img src="${r.art}" alt=""><div><strong>${r.amount} ${r.item||a.lockedReward?r.label:r.short.replace(' prod.',' production')}</strong><small>${claimed(a)?'Added to your realm.':ready(a)?'Earned and ready to collect.':r.item?'One item on completion.':'Amount locks on completion.'}</small></div></div><p class="reward-note">${esc(r.note)}</p></section>`;
  const label=busy?'Collecting…':claimed(a)?'Reward collected':ready(a)?`Claim ${r.item?r.label:r.amount+' '+r.label}`:'Achievement underway';
  const note=error|| (claimed(a)?'Recorded for this season.':ready(a)?'Collect before the season ends.':remainingLabel);
  $('actionFooter').innerHTML=`<p class="${error?'error':''}" ${error?'role="alert"':''}>${esc(note)}</p><button id="claimAchievement" ${busy||!ready(a)?'disabled':''}>${label}</button>`;
}
function render(options={}){
  const list=$('achievementList'), scrollTop=list.scrollTop, detailTop=$('detailScroll').scrollTop;
  const entries=sorted();
  if(!entries.some(a=>a.id===selected))selected=entries[0]?.id||'';
  const completed=state.achievements.filter(complete).length, collected=state.achievements.filter(claimed).length, claimable=state.achievements.filter(ready).length;
  $('completedCount').textContent=`${completed} / 40 complete`;$('claimedCount').textContent=`${collected} / 40`;$('readyCount').textContent=`${claimable} ready to claim`;$('seasonProgress').style.width=completed/40*100+'%';
  $('seasonClock').textContent=mode==='expired'?'Season ended':'17d 12h';
  if(mode==='expired')$('readyCount').textContent='Rewards expired';
  else if(mode==='loading')$('readyCount').textContent='Checking rewards';
  $('categories').innerHTML=Object.entries({all:'All',...samples.categories}).map(([id,label])=>`<button data-category="${id}" aria-pressed="${id===category}">${id==='all'?'':badge(id)}${label}</button>`).join('');
  $('categorySelect').value=category;$('statusSelect').value=filter;
  $('categorySelect').disabled=busy;$('statusSelect').disabled=busy;
  document.querySelectorAll('[data-category]').forEach(button=>{button.disabled=busy;});
  $('listTitle').textContent=category==='all'?'All achievements':samples.categories[category];$('listCount').textContent=`${entries.length} shown · ready first`;
  let placeholder;
  if(mode==='loading')placeholder=['Reviewing the royal ledger','Your season’s deeds are being gathered.',''];
  else if(mode==='error')placeholder=['Reconnecting to the realm','Your achievements are safe. Try loading them again.','Try again'];
  else if(mode==='expired')placeholder=['A new season awaits','Progress and unclaimed rewards reset each season.','Load new season'];
  else if(!entries.length)placeholder=['No achievements here',filter==='ready'?'No rewards are ready in this category.':'Try another category or status.','Show all achievements'];
  list.innerHTML=placeholder?`<div class="placeholder" role="status">${badge(category)}<h3>${placeholder[0]}</h3><p>${placeholder[1]}</p>${placeholder[2]?`<button data-reload>${placeholder[2]}</button>`:''}</div>`:entries.map(row).join('');
  renderDetail();list.scrollTop=options.resetScroll?0:scrollTop;$('detailScroll').scrollTop=options.resetDetail?0:detailTop;
}
function reset(sample='mixed'){
  generation++;busy=false;error='';mode=sample;category='all';filter='all';selected='conqueror_iii';state=copy(sample==='fresh'?samples.fresh:samples.mixed);
  if(sample==='item'){category='strongholds';selected='master_of_strongholds';const a=state.achievements.find(a=>a.id===selected);a.progress=a.target;a.completedAtMs=samples.nowMs;a.lockedReward=copy(a.rewardSpec);}
  if(sample==='crown'){category='crown';selected='long_reign';}
  if(sample==='large')state.achievements.forEach(a=>{if(a.lockedReward?.type!=='item'&&a.lockedReward)a.lockedReward.lockedAmount*=1000;});
  if(sample==='collected')state.achievements.forEach(a=>{a.progress=a.target;a.completedAtMs=samples.nowMs;a.claimedAtMs=samples.nowMs;a.lockedReward=a.rewardSpec.type==='item'?copy(a.rewardSpec):{...a.rewardSpec,lockedAmount:a.rewardSpec.productionHours*samples.capacity[a.rewardSpec.type==='gold'?'goldPerHour':'troopPerHour']};});
  render({resetScroll:true,resetDetail:true});announce('Local preview reset. No player data is changed.');
}
function choose(id){if(busy)return;selected=id;error='';render({resetDetail:true});[...document.querySelectorAll('[data-achievement]')].find(b=>b.dataset.achievement===id)?.focus({preventScroll:true});}
async function claim(fail=false){
  const a=state.achievements.find(a=>a.id===selected);if(busy||!a||!ready(a)||['loading','error','expired'].includes(mode))return;
  const scope=generation;busy=true;error='';render();
  await new Promise(resolve=>setTimeout(resolve,600));if(scope!==generation)return;
  busy=false;if(fail){error='Could not collect. Your reward is still ready.';render();announce('Simulated failure. Retry Claim to collect the reward once.');return;}
  a.claimedAtMs=samples.nowMs;render();announce(`${a.title}: reward collected in this preview. No live reward was claimed.`);
}
$('categorySelect').innerHTML=Object.entries({all:'All categories',...samples.categories}).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
$('categorySelect').addEventListener('change',e=>{category=e.target.value;error='';render({resetScroll:true,resetDetail:true});});
$('statusSelect').addEventListener('change',e=>{filter=e.target.value;error='';render({resetScroll:true,resetDetail:true});});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.achievement)choose(b.dataset.achievement);
  else if(b.dataset.category){category=b.dataset.category;error='';render({resetScroll:true,resetDetail:true});document.querySelector(`[data-category="${category}"]`)?.focus();}
  else if(b.id==='claimAchievement')void claim();
  else if(b.hasAttribute('data-reload')){if(mode==='expired')reset('fresh');else if(mode==='error'||mode==='loading')reset();else{category='all';filter='all';render({resetScroll:true,resetDetail:true});}}
  else if(b.dataset.tab)announce(b.dataset.tab==='achievements'?'You are reviewing Achievements.':`The ${b.dataset.tab==='daily'?'Daily Login':'Daily Quests'} tab opens its existing panel in the game. This draft previews Achievements only.`);
});
$('achievementList').addEventListener('keydown',e=>{const b=e.target.closest('[data-achievement]');if(!b||!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||busy)return;e.preventDefault();const entries=sorted(),i=entries.findIndex(a=>a.id===b.dataset.achievement),next=e.key==='Home'?0:e.key==='End'?entries.length-1:(i+(e.key==='ArrowDown'?1:entries.length-1))%entries.length;choose(entries[next].id);document.querySelector(`[data-achievement="${selected}"]`)?.scrollIntoView({block:'nearest'});});
$('closeAchievement').addEventListener('click',()=>$('achievementDialog').close());
$('achievementDialog').addEventListener('close',()=>{generation++;busy=false;$('dismissed').hidden=false;});
$('reopen').addEventListener('click',()=>{$('dismissed').hidden=true;render();$('achievementDialog').showModal();});
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='achievements-review')return;if(e.data.action==='reset')reset(e.data.sample);else if(e.data.action==='fail'){const a=state.achievements.find(a=>a.id===selected);if(!a||!ready(a)||['loading','error','expired'].includes(mode)){reset();}void claim(true);}});
reset();$('achievementDialog').showModal();
