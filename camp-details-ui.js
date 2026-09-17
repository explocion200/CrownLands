(function (global) {
  "use strict";
  const icons={gold:"assets/icons/royal-shop-gold-r1.svg",troops:"assets/icons/daily-login-troops-r1.svg",items:"assets/icons/reward-daily-quests-r1.svg",deed:"assets/icons/skills/guildCharters.svg"};
  const num=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString();
  const dailyLimit=config=>config.type==='deed'?1:['gold','troops'].includes(config.type)?(config.dailyRewards?.length||0):Math.max(0,Number(config.maxDailyRewards)||0);
  function node(doc,tag,className,text) {const el=doc.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;}
  function mount(root, {camp,config,mapName,onClose,estimatedRewards=()=>[]}={}) {
    const overview=root.querySelector('[data-camp-info-panel="stats"]');
    if(!overview)return;
    const doc=root.ownerDocument,wrapper=overview.parentElement,create=(tag,cls,text)=>node(doc,tag,cls,text);
    const modal=root.closest('dialog');modal.classList.add('camp-details-modal');wrapper.dataset.camp=config.type;
    const header=create('header','camp-details-header'),image=create('img','');image.src=icons[config.type]||icons.gold;image.alt='';
    const heading=create('div',''),kicker=create('small','','FIELD OUTPOST'),title=create('h1','',camp.name);heading.append(kicker,title);
    const ownership=create('span','camp-ownership',camp.owner==='player'?'Your camp':camp.ownerUid?'Controlled camp':'Neutral camp');
    const close=create('button','camp-close','×');close.type='button';close.setAttribute('aria-label',`Close ${camp.name}`);close.addEventListener('click',onClose);header.append(image,heading,ownership,close);wrapper.prepend(header);
    const identity=create('aside','camp-identity');identity.tabIndex=0;identity.setAttribute('aria-label','Camp artwork and controller');
    const art=create('figure','camp-portrait'),picture=create('img','');picture.src=camp.artSrc||config.artSrc;picture.alt=camp.name;art.append(picture,create('figcaption','',mapName||'The Core'));identity.append(art);
    const publicStatus=overview.querySelector('.camp-public-status'),owner=publicStatus?.firstElementChild;
    if(owner){owner.classList.add('camp-controller');identity.append(owner);}
    const facts=create('div','camp-identity-facts');for(const [label,value] of [['Hold time',`${Math.floor(config.holdSeconds/60)} min`],['Daily limit',`${dailyLimit(config)} rewards`]]){const block=create('div','');block.append(create('small','',label),create('strong','',value));facts.append(block);}identity.append(facts);
    const details=create('div','camp-detail-column');details.tabIndex=0;details.setAttribute('aria-label','Reward, hold timer and defenses');
    const summary=create('section','camp-next-reward');summary.dataset.campRewardSummary=camp.id;summary.setAttribute('aria-live','polite');details.append(summary);
    while(overview.firstChild)details.append(overview.firstChild);
    overview.classList.add('camp-overview-layout');overview.replaceChildren(identity,details);
    const tabs=[...wrapper.querySelectorAll('[data-camp-info-tab]')];tabs.find(t=>t.dataset.campInfoTab==='stats').textContent='Overview';
    const rules=tabs.find(t=>t.dataset.campInfoTab==='rules');rules.textContent='Camp Rules';rules.removeAttribute('aria-label');
    const footer=create('footer','camp-details-footer'),footerCopy=create('div','');footerCopy.append(create('strong','',camp.name),create('small','',`${Math.floor(config.holdSeconds/60)}-minute hold · Daily reset 00:00 UTC`));
    const rewards=create('button','camp-rewards-shortcut','Your Rewards →');rewards.type='button';rewards.addEventListener('click',()=>tabs.find(t=>t.dataset.campInfoTab==='reward').click());
    const back=create('button','camp-back','Back to Map');back.type='button';back.addEventListener('click',onClose);footer.append(footerCopy,rewards,back);wrapper.append(footer);
    const updateTabs=()=>{tabs.forEach(t=>t.tabIndex=t.getAttribute('aria-selected')==='true'?0:-1);rewards.hidden=tabs.find(t=>t.dataset.campInfoTab==='reward').getAttribute('aria-selected')==='true';};
    tabs.forEach((tab,i)=>{tab.addEventListener('click',updateTabs);tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();});});
    wrapper._campDetails={config,estimatedRewards};updateTabs();updateRewards(root,camp.id,config,null,'loading');
  }
  function updateRewards(root,campId,config,progress,status='ready') {
    const summary=[...root.querySelectorAll('[data-camp-reward-summary]')].find(el=>el.dataset.campRewardSummary===String(campId));if(!summary)return;
    const doc=root.ownerDocument,create=(tag,cls,text)=>node(doc,tag,cls,text),wrapper=summary.closest('.gold-camp-info-panel');
    const heading=create('h2','',status==='ready'?'Your next reward':status==='loading'?'Loading your rewards…':'Reward progress unavailable');summary.replaceChildren(heading);
    if(status!=='ready')return;
    const estimates=wrapper._campDetails?.estimatedRewards()||[],limit=Number(dailyLimit(config)),claimed=Math.max(0,Number(progress?.count)||0),complete=claimed>=limit;
    const reward=config.type==='deed'?'1 random city':config.type==='items'?'1 usable item':`${num(estimates[claimed])} ${config.rewardLabel}`;
    const row=create('div','camp-reward-amount'),image=create('img','');image.src=icons[config.type]||icons.gold;image.alt='';row.append(image,create('strong','',complete?'Daily limit reached':reward));summary.append(row,create('p','',`${num(Math.min(claimed,limit))} of ${num(limit)} earned today · Shared across all ${config.name} locations.`));
    if(!complete&&['gold','troops'].includes(config.type))summary.append(create('small','','Current estimate. Final reward uses production when the hold resolves.'));
  }
  global.CrownlandsCampDetailsUi=Object.freeze({mount,updateRewards,dailyLimit});
})(typeof window!=='undefined'?window:globalThis);
