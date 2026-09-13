/* Approved Achievements presentation. Progress and claims remain server-owned. */
(function () {
  "use strict";
  const views = new WeakMap();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>Math.floor(Number(v)||0).toLocaleString('en-US');
  /* Eight category emblems drawn in the approved ink, brass and parchment palette. */

  const emblems={
    conquest:'<path fill="#a57558" d="M24 20h23l-5 8 5 8H24Z"/><path d="M23 17v32m-4 1h8"/><path fill="#dfc98d" d="m33 23 2 4 4 .5-3 3 .5 4-3.5-2-3.5 2 .5-4-3-3 4-.5Z"/>',
    combat:'<path fill="#ddd8c3" d="m22 19 5 3 17 24-4 3-18-25Zm22 0-5 3-17 24 4 3 18-25Z"/><path stroke="#a88b4f" stroke-width="3" d="m18 38 10 8m8 0 10-8"/><path d="m20 48-3 4m28-4 3 4"/>',
    camps:'<path fill="#d5bd83" d="M16 45 32 21l16 24Z"/><path fill="#a08758" d="m32 21 7 24h-7Z"/><path fill="#655e42" d="m26 45 6-12 5 12Z"/><path d="M32 17v5m-18 24h36"/><path fill="#915448" d="M33 13h11l-4 4h-7Z"/>',
    growth:'<path fill="#b9a174" d="m24 24 18 21-3 4-20-22Z"/><path fill="#c7b998" d="m22 20 6-5 14 12-6 6Z"/><path fill="#877959" d="m36 23 6 4-6 6-5-5Z"/><path d="m17 44 4-9m-2 8-5-3m5 4 6-3"/>',
    strongholds:'<path fill="#cabb93" d="M18 45V24h5v-5h5v5h8v-5h5v5h5v21Z"/><path fill="#958568" d="M40 25h6v20h-6Z"/><path fill="#625a43" d="M28 45V34q4-7 8 0v11Z"/><path d="M19 30h8m10 0h8m-24 8h5m13 0h5M24 25v19m16-19v19"/>',
    crown:'<path fill="#d4bd7b" d="m18 26 9 6 5-14 6 14 9-6-4 19H22Z"/><path fill="#ac8c4c" d="m23 39 20-1-1 7H23Z"/><path d="m25 41 14-.5"/><path fill="#8b4d43" d="m32 33 3 4-3 3-3-3Z"/><circle cx="18" cy="24" r="2" fill="#d8c58c"/><circle cx="32" cy="17" r="2" fill="#d8c58c"/><circle cx="47" cy="24" r="2" fill="#d8c58c"/>',
    clan:'<path fill="#879064" d="M18 21h12v20l-6-4-6 4Z"/><path fill="#a37258" d="M34 24h12v20l-6-4-6 4Z"/><path d="M16 18v31m16-28v28m16-27v26"/><path stroke="#dac995" d="m22 25 4 9m-4 0 4-9m12 2 4 8m-4 0 4-8"/>',
    daily:'<path fill="#e9d7a4" d="M20 21q-4-7 3-7h22q-5 0-5 7v21H22q-5 0-5-5h19q0 5 4 5"/><path d="M24 23h11m-11 5h8m-9 5h7"/><path fill="#956052" d="m34 38-1 13 5-3 3 3-1-13Z"/><circle cx="37" cy="38" r="5" fill="#a16b51"/><path stroke="#e0c791" d="m34 38 2 2 4-4"/>'
  };
  const badge=(category)=>`<svg class="category-badge" viewBox="0 0 64 64" fill="none" stroke="#61543c" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="#828453" d="M23 55C10 49 8 35 12 24m29 31c13-6 15-20 11-31"/><g fill="#969966" stroke-width=".8"><path d="M12 35q-9-4-6-11 8 3 6 11Zm3 11q-10-1-10-8 9-1 10 8Zm7 8q-10 3-12-3 7-4 12 3Z"/><path d="M52 35q9-4 6-11-8 3-6 11Zm-3 11q10-1 10-8-9-1-10 8Zm-7 8q10 3 12-3-7-4-12 3Z"/></g><path fill="#d4c28d" d="m15 15 17-5 17 5-2 24q-2 11-15 19-13-8-15-19Z"/><path fill="#e1d3aa" d="m19 18 13-4 13 4-2 20q-2 9-11 16-9-7-11-16Z"/><path stroke="#baa16d" d="m21 19 10-3m-11 6 1 8m20 11-2 4"/>${emblems[category]||emblems.crown}</svg>`;

  function createView(root) {
    const controller = new AbortController();
    let options, state, category='all', filter='all', selected='', mode='loading', busy=false, error='', scope='';
    const $=id=>root.querySelector('#'+id);
    const complete=a=>Boolean(a.completedAtMs||a.claimedAtMs), claimed=a=>Boolean(a.claimedAtMs), ready=a=>complete(a)&&!claimed(a);
    const status=a=>claimed(a)?'Collected':ready(a)?'Ready to claim':'Underway';
    const difficulty=a=>({easy:'Easy',medium:'Medium',hard:'Hard',very_hard:'Very hard',prestige:'Prestige'}[a.difficulty]||a.difficulty);
    root.innerHTML=`<section id="dailyRewardPanelAchievements" class="achievements-panel achievement-shell" role="tabpanel" aria-labelledby="dailyRewardTabAchievements">
<header class="achievement-header"><img class="header-seal" src="assets/icons/reward-achievements-r1.svg" alt=""><div class="heading-copy"><p>Deeds worthy of the Crown</p><h1 id="achievementTitle">Achievements</h1></div><div class="season-clock"><span>Season ends in</span><strong id="seasonClock">—</strong><small id="seasonDeadline"></small></div></header>
<section class="season-summary" aria-label="Season progress"><div class="season-title"><span>MONTHLY CAMPAIGN</span><strong id="seasonName"></strong></div><div class="season-track"><div><span>Season progress</span><strong id="completedCount"></strong></div><span class="progress-track"><i id="seasonProgress"></i></span></div><div class="collected-total"><strong id="claimedCount"></strong><span>rewards collected</span></div><span id="readyCount" class="ready-count"></span></section>
<div class="filters"><nav id="categories" aria-label="Achievement categories"></nav><label class="mobile-category">Category<select id="categorySelect" aria-label="Achievement category"></select></label><label class="status-filter">Show<select id="statusSelect" aria-label="Achievement status"><option value="all">All states</option><option value="ready">Ready to claim</option><option value="progress">Underway</option><option value="claimed">Collected</option></select></label></div>
<div class="achievement-body"><section class="ledger" aria-label="Achievement ledger"><div class="ledger-heading"><span id="listTitle">All achievements</span><small id="listCount"></small></div><div id="achievementList" tabindex="0" aria-label="Select an achievement"></div><p class="ledger-note">Progress and unclaimed rewards reset each season.</p></section><section class="detail" aria-label="Selected achievement"><div class="detail-heading"><span id="detailNumber"></span><span id="detailState"></span></div><div id="detailScroll" class="detail-scroll"></div><footer id="actionFooter" class="action-footer"></footer></section></div>
</section>`;
    $('achievementList').classList.add('seasonal-achievement-list');
function progressLabel(a){return a.metric==='long_reign_hours'?`${Math.min(a.target,a.progress).toFixed(1)} / ${a.target}h`:`${number(a.progress)} / ${number(a.target)}`;}
function reward(a){
  const r=a.lockedReward||a.rewardSpec;
  if(r.type==='item'){const item=options.items[r.itemId]||{label:'Royal Item',art:'assets/icons/reward-achievements-r1.svg'};return{amount:`×${number(r.lockedAmount||1)}`,label:item.label,short:item.label,art:item.art,item:true,note:complete(a)?'Item reward earned. Collect it into your Bag.':'Earn this item by completing the achievement.'};}
  const label=r.type==='gold'?'Gold':'Troops', locked=Boolean(a.lockedReward);
  return{amount:locked?number(r.lockedAmount):`${r.productionHours}h`,label,short:locked?label:`${label==='Gold'?'Gold':'Troop'} prod.`,art:r.type==='gold'?'assets/icons/royal-shop-gold-r1.svg':'assets/icons/daily-login-troops-r1.svg',item:false,note:locked?`Based on ${r.productionHours} hours of raw ${label.toLowerCase()} production when completed. This amount is fixed.`:`Worth ${r.productionHours} hours of raw ${label.toLowerCase()} production. The amount is fixed when you complete this achievement.`};
}
function sorted(){return state.achievements.filter(a=>(category==='all'||a.category===category)&&(filter==='all'||filter==='ready'&&ready(a)||filter==='progress'&&!complete(a)||filter==='claimed'&&claimed(a))).sort((a,b)=>Number(ready(b))-Number(ready(a))||a.order-b.order);}
function progress(a){return `<div class="progress-label"><span class="row-status">${status(a)}</span><strong>${progressLabel(a)}</strong></div><span class="progress-track" role="progressbar" aria-label="${esc(a.title)} progress" aria-valuemin="0" aria-valuemax="${a.target}" aria-valuenow="${Math.max(0,Math.min(a.target,a.progress))}"><i style="width:${Math.min(100,a.progress/a.target*100)}%"></i></span>`;}
function row(a){const r=reward(a);return `<button class="achievement-row ${ready(a)?'ready':''} ${claimed(a)?'claimed':''}" data-achievement="${esc(a.id)}" data-seasonal-achievement-toggle="${esc(a.id)}" aria-pressed="${selected===a.id}" aria-label="${esc(`${a.title}. ${status(a)}. ${progressLabel(a)}. Reward: ${r.amount} ${r.short}.`)}"><span class="row-badge">${badge(a.category)}${claimed(a)?'<span class="seal-check" aria-hidden="true">✓</span>':''}</span><span class="row-copy"><span class="row-kicker">${a.categoryLabel}<i></i>${difficulty(a)}</span><strong class="row-title">${esc(a.title)}</strong><span class="row-description">${esc(a.description)}</span>${progress(a)}</span><span class="row-reward ${r.item?'item':''} ${r.amount.length>7?'large':''}"><img src="${r.art}" alt=""><strong>${r.amount}</strong><small>${r.short}</small></span></button>`;}
function renderDetail(){
  const a=state.achievements.find(a=>a.id===selected);
  if(!a||['loading','error','expired','unavailable'].includes(mode)){$('detailNumber').textContent='Seasonal achievements';$('detailState').textContent='';$('detailScroll').innerHTML='<p class="detail-empty">Select an achievement to read its requirements and reward.</p>';$('actionFooter').innerHTML='<p>Your seasonal deeds await.</p><button disabled>Select an achievement</button>';return;}
  const r=reward(a), remaining=Math.max(0,a.target-a.progress), remainingLabel=complete(a)?'Requirement met':a.metric==='long_reign_hours'?`${remaining.toFixed(1)}h remaining`:`${number(Math.ceil(remaining))} remaining`;
  $('detailNumber').textContent=`Honor ${String(a.order+1).padStart(2,'0')} of 40`;$('detailState').textContent=status(a);
  $('detailScroll').innerHTML=`<div class="achievement-hero"><span class="hero-badge">${badge(a.category)}</span><h2>${esc(a.title)}</h2><p class="eyebrow">${a.categoryLabel} · ${difficulty(a)}</p></div><div class="ornament" aria-hidden="true">◆</div><section class="objective"><h3>Requirement</h3><p>${esc(a.description)}</p>${progress(a)}</section><p class="requirement-note">${esc(options.note(a))} ${remainingLabel}.</p><section class="reward-section"><h3>${claimed(a)?'Reward collected':'Achievement reward'}</h3><div class="reward-box"><img src="${r.art}" alt=""><div><strong>${r.amount} ${r.item||a.lockedReward?r.label:r.short.replace(' prod.',' production')}</strong><small>${claimed(a)?'Added to your realm.':ready(a)?'Earned and ready to collect.':r.item?'One item on completion.':'Amount locks on completion.'}</small></div></div><p class="reward-note">${esc(r.note)}</p></section>`;
  const label=busy?'Collecting…':claimed(a)?'Reward collected':ready(a)?`Claim ${r.item?r.label:r.amount+' '+r.label}`:'Achievement underway';
  const note=error|| (claimed(a)?'Recorded for this season.':ready(a)?'Collect before the season ends.':remainingLabel);
  $('actionFooter').innerHTML=`<p class="${error?'error':''}" ${error?'role="alert"':''}>${esc(note)}</p><button id="claimAchievement" ${busy||!ready(a)?'disabled':''}>${label}</button>`;
}
function render(viewOptions={}){
  const list=$('achievementList'), scrollTop=list.scrollTop, detailTop=$('detailScroll').scrollTop;
  const entries=sorted();
  if(!entries.some(a=>a.id===selected))selected=entries[0]?.id||'';
  const completed=state.achievements.filter(complete).length, collected=state.achievements.filter(claimed).length, claimable=state.achievements.filter(ready).length;
  $('completedCount').textContent=`${completed} / 40 complete`;$('claimedCount').textContent=`${collected} / 40`;$('readyCount').textContent=`${claimable} ready to claim`;$('seasonProgress').style.width=completed/40*100+'%';

  if(mode==='expired')$('readyCount').textContent='Rewards expired';
  else if(mode==='loading')$('readyCount').textContent='Checking rewards';
  $('categories').innerHTML=Object.entries({all:'All',...options.categories}).map(([id,label])=>`<button data-category="${id}" aria-pressed="${id===category}">${id==='all'?'':badge(id)}${label}</button>`).join('');
  $('categorySelect').value=category;$('statusSelect').value=filter;
  $('categorySelect').disabled=busy;$('statusSelect').disabled=busy;
  root.querySelectorAll('[data-category]').forEach(button=>{button.disabled=busy;});
  $('listTitle').textContent=category==='all'?'All achievements':options.categories[category];$('listCount').textContent=`${entries.length} shown · ready first`;
  let placeholder;
  if(mode==='unavailable')placeholder=['Achievements unavailable','Enter your current realm to view its achievements.',''];
  else if(mode==='loading')placeholder=['Reviewing the royal ledger','Your season’s deeds are being gathered.',''];
  else if(mode==='error')placeholder=['Reconnecting to the realm',options.error || 'Try loading your achievements again.','Try again'];
  else if(mode==='expired')placeholder=['A new season awaits','Progress and unclaimed rewards reset each season.','Load new season'];
  else if(!entries.length)placeholder=['No achievements here',filter==='ready'?'No rewards are ready in this category.':'Try another category or status.','Show all achievements'];
  list.innerHTML=placeholder?`<div class="placeholder" role="status">${badge(category)}<h3>${placeholder[0]}</h3><p>${esc(placeholder[1])}</p>${placeholder[2]?`<button data-reload>${placeholder[2]}</button>`:''}</div>`:entries.map(row).join('');
  renderDetail();list.scrollTop=viewOptions.resetScroll?0:scrollTop;$('detailScroll').scrollTop=viewOptions.resetDetail?0:detailTop;
}

    function choose(id) {
      if(busy)return;
      selected=id;render({resetDetail:true});
      [...root.querySelectorAll('[data-achievement]')].find(b=>b.dataset.achievement===id)?.focus({preventScroll:true});
    }
    function clock() {
      if(!options)return;
      const end=Number(options.status?.seasonEndsAtMs)||0;
      const remaining=Math.max(0,end-options.now());
      const nextMode=!options.available?'unavailable':end&&!remaining?'expired':!options.status?(options.loading?'loading':'error'):'mixed';
      const changed=mode!==nextMode;mode=nextMode;
      const hours=Math.ceil(remaining/3600000);
      $('seasonClock').textContent=!end?'—':!remaining?'Season ended':Math.floor(hours/24)+'d '+hours%24+'h';
      $('seasonDeadline').textContent=end?new Date(end).toLocaleDateString('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'})+' · 00:00 UTC':'';
      $('seasonName').textContent=options.status?.monthKey?new Date(options.status.monthKey+'-01T00:00:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'}):'Current season';
      if(changed)render();
    }
    const listen=(element,event,fn)=>element.addEventListener(event,fn,{signal:controller.signal});
    listen(root,'click',e=>{
      if(!root.querySelector('.achievements-panel'))return;
      const button=e.target.closest('button');if(!button||!root.contains(button))return;
      if(button.dataset.achievement)choose(button.dataset.achievement);
      else if(button.dataset.category&&!busy){category=button.dataset.category;render({resetScroll:true,resetDetail:true});root.querySelector('[data-category="'+category+'"]')?.focus();}
      else if(button.id==='claimAchievement'){
        clock();const a=state.achievements.find(a=>a.id===selected);
        if(mode==='mixed'&&!busy&&a&&ready(a))void options.claim(a.id,button);
      } else if(button.hasAttribute('data-reload')){
        if(mode!=='mixed')void options.retry();
        else{category='all';filter='all';render({resetScroll:true,resetDetail:true});}
      }
    });
    listen($('categorySelect'),'change',e=>{category=e.target.value;render({resetScroll:true,resetDetail:true});});
    listen($('statusSelect'),'change',e=>{filter=e.target.value;render({resetScroll:true,resetDetail:true});});
    listen($('achievementList'),'keydown',e=>{
      const button=e.target.closest('[data-achievement]');
      if(!button||busy||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      e.preventDefault();const entries=sorted(),i=entries.findIndex(a=>a.id===button.dataset.achievement);
      const next=e.key==='Home'?0:e.key==='End'?entries.length-1:(i+(e.key==='ArrowDown'?1:entries.length-1))%entries.length;
      choose(entries[next].id);root.querySelector('[data-achievement="'+selected+'"]')?.scrollIntoView({block:'nearest'});
    });
    const timer=window.setInterval(()=>{if(root.querySelector('.achievements-panel'))clock();},1000);
    return {destroy(){controller.abort();window.clearInterval(timer);},update(next){
      const focused=root.contains(document.activeElement),focusId=focused?document.activeElement.id:'';
      options=next;state=options.status||{achievements:[]};busy=Boolean(options.busy);error=options.error||'';
      const nextScope=options.scope+':'+(state.seasonId||'');
      const reset=nextScope!==scope;
      if(reset){scope=nextScope;selected='';category='all';filter='all';}
      $('categorySelect').innerHTML=Object.entries({all:'All categories',...options.categories}).map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('');
      clock();render({resetScroll:reset,resetDetail:reset});
      if(focused){
        const target=focusId?root.querySelector('#'+focusId):[...root.querySelectorAll('[data-achievement]')].find(b=>b.dataset.achievement===selected);
        if(target&&!target.disabled)target.focus({preventScroll:true});
      }
    }};
  }
  window.CrownlandsAchievementsUI={
    mount(root,options){let view=views.get(root);if(!view||!root.querySelector('.achievements-panel')){view?.destroy();view=createView(root);views.set(root,view);}view.update(options);},
    destroy(root){views.get(root)?.destroy();views.delete(root);}
  };
})();
