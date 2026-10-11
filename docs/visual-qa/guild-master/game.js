"use strict";
(async () => {
  if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") throw Error("Guild gameplay review is local only.");
  const M=GuildReviewModel, key="crownlands-guild-review-v1", dialog=document.querySelector("#guildPreview");
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const art=id=>`assets/guild-master/${id}.webp${id.startsWith("common-")?"?revision=common-champions-r2":""}`, number=n=>Math.round(n).toLocaleString();
  const illustration=(id,alt,cls="",lazy=true)=>`<img class="${cls}" src="${art(id)}" alt="${escape(alt)}" width="1536" height="1024" loading="${lazy?"lazy":"eager"}" decoding="async">`;
  const time=minutes=>minutes<60?`${Math.round(minutes)} min`:`${Math.floor(minutes/60)}h${Math.round(minutes%60)?` ${Math.round(minutes%60)}m`:""}`;
  let state;try{state=JSON.parse(sessionStorage.getItem(key));}catch(_){}if(state?.version!==1)state=M.initial();
  for(const c of [...state.members,...state.offers])if(c.rarity==="Common")c.portraitId=M.commonPortraitFor(c);
  if(!M.missions.some(m=>m.id===state.selectedMission))state.selectedMission=null;
  const save=()=>{try{sessionStorage.setItem(key,JSON.stringify(state));}catch(_){} };save();
  let page="hall",building="guild-master",typeFilter="all",statusFilter="all",message="",opener=null,reportStep=0,reportOutcome="partial",reportMission="escort",reviewRoom="infirmary";
  let sample,estate,economy,clockTimer=0;
  const currentMission=()=>M.missions.find(m=>m.id===state.selectedMission);
  const ready=c=>c.recoveryUntilMs<=Date.now();
  const button=(action,label,attrs="",primary=false)=>`<button type="button" data-guild="${action}" ${primary?'class="guild-primary"':""} ${attrs}>${label}</button>`;
  const statRows=(c,base=false)=>M.stats.map((name,i)=>`<div class="guild-stat"><span>${name}</span><i aria-hidden="true"><span style="width:${Math.min(100,(base?c.base:M.values(c))[i]/(base?16:35)*100)}%"></span></i><b>${(base?c.base:M.values(c))[i]}</b></div>`).join("");
  const nameFor=id=>state.members.find(c=>c.id===id)?.name||"Member";
  const portrait=(c,cls="guild-portrait")=>`<img class="${cls}" src="${art(M.commonPortraitFor(c)||c.type)}" alt="${escape(c.name)} · ${escape(c.rarity)} ${M.types[c.type].name} portrait" width="512" height="512" decoding="async">`;
  const tabNames={hall:"Guild hall",members:"Members",contracts:"Contracts",planning:"Mission plan",infirmary:"Infirmary",training:"Training",archive:"Archive",improvements:"Improvements"};
  function member(c,recruit=false){
    const selected=state.party.includes(c.id),t=M.types[c.type],available=ready(c);
    return `<article class="guild-member ${selected&&!recruit?"is-selected":""}" data-member="${escape(c.id)}"><div class="guild-member-top">${portrait(c)}<div><h3>${escape(c.name)}</h3><p>${escape(c.rarity)} · ${t.name} · Lv. ${c.level}</p><span class="guild-pill">${recruit?"Available to recruit":available?selected?"In your party":"Ready":`Resting · ${time((c.recoveryUntilMs-Date.now())/60000)}`}</span></div></div>
      ${statRows(c)}<p class="guild-subtle"><b>${t.skill}</b><br>${t.trait} · ${t.hazard==="treatment"?"Helps members recover":`Useful against ${t.hazard} risks`}</p>
      ${recruit?`<p class="guild-subtle">These are this recruit's starting rolls. Refreshing keeps the same offer.</p><div class="guild-member-actions">${button("recruit",c.claimed?"Recruited":"Recruit · 57 Gold",`data-id="${c.id}" ${c.claimed||state.gold<57?"disabled":""}`,!c.claimed)}</div>`:
        `<details><summary>Starting rolls &amp; growth</summary>${statRows(c,true)}<p>Each level adds ${t.growth.join(" / ")} in the stat order above. Range example: each starting stat varies by up to 2 from its type's center.</p></details><div class="guild-member-actions">${button("party",selected?"Remove from party":"Add to party",`data-id="${c.id}" ${!available||!selected&&state.party.length>=3?"disabled":""}`,!selected&&available)}${selected?button("leader",state.leader===c.id?"Party leader":"Make leader",`data-id="${c.id}" ${state.leader===c.id?"disabled":""}`):""}</div>`}
      </article>`;
  }
  function hall(){return `<div class="guild-hall"><div class="guild-hall-art">${illustration("hall-v3","Champions preparing expeditions in a grand timber Guild Hall with galleries, banners and a great hearth","",false)}</div><div><p class="guild-eyebrow">Your permanent guild</p><h2>A place for every specialty</h2><p>Choose a contract, then prepare the right party for the journey.</p><div class="guild-summary"><div><small>Members</small><strong>${state.members.length}</strong></div><div><small>Ready</small><strong>${state.members.filter(ready).length}</strong></div><div><small>Reputation</small><strong>12</strong></div></div><div class="guild-room-links">${M.facilities.map(f=>button("tab",`<span>${f.name}<small>${f.id==="planning"?(currentMission()?"Resume your selected contract":"Choose a contract to start planning")+" · ":""}${escape(f.benefit(state.rooms[f.id]))}</small></span><span aria-hidden="true">›</span>`,`data-tab="${f.id==="planning"&&!currentMission()?"contracts":f.id}"`)).join("")}</div><p class="guild-subtle">12 / 30 reputation toward the next client chapter.</p>${button("recruits","Visit the Alehouse")}</div></div>`;}
  function roster(){
    const filtered=state.members.filter(c=>(typeFilter==="all"||c.type===typeFilter)&&(statusFilter==="all"||ready(c)===(statusFilter==="ready")));
    return `<div class="guild-tools"><div><h2>Guild members</h2><p class="guild-subtle">${state.party.length} / 3 selected · Leader: ${escape(nameFor(state.leader))}</p></div><label>Specialty<select data-field="type">${["all",...Object.keys(M.types)].map(t=>`<option value="${t}" ${typeFilter===t?"selected":""}>${t==="all"?"All specialties":M.types[t].name}</option>`).join("")}</select></label><label>Availability<select data-field="status">${["all","ready","resting"].map(s=>`<option value="${s}" ${statusFilter===s?"selected":""}>${s==="all"?"Everyone":s==="ready"?"Ready":"Resting"}</option>`).join("")}</select></label>${button("recruits","Find new champions")}</div><div class="guild-member-grid">${filtered.map(c=>member(c)).join("")||'<p class="guild-notice">No members match these filters.</p>'}</div>`;
  }
  function recruits(){return `<div class="guild-tools"><div><p class="guild-eyebrow">Alehouse · Today's visitors</p><h2>Meet your next champion</h2><p>Two Guards, different strengths. Compare their individual rolls before recruiting.</p></div><span class="guild-pill">${number(state.gold)} sample Gold</span></div><div class="guild-member-grid">${state.offers.map(c=>member(c,true)).join("")}</div><p class="guild-notice">Random starting stats are confirmed. The ±2 ranges shown here are examples for review. These sample offers stay fixed through refreshes and reopening this preview.</p>`;}
  function contracts(){return `<p class="guild-eyebrow">1. Choose a contract</p><h2>Contracts around the kingdom</h2><p>Select a mission to plan its party, route and supplies.</p><div class="guild-contracts">${M.missions.map(m=>`<article class="guild-contract">${illustration("mission-"+m.id,m.name+" — "+m.client)}<div><p class="guild-eyebrow">${m.kind} · ${m.hours}h</p><h3>${m.name}</h3><p>${m.copy}</p><p class="guild-subtle">${M.stats[m.primary]} + ${M.stats[m.secondary]}<br>${m.client}</p>${button("mission",state.selectedMission===m.id?"Resume plan":"Select &amp; plan",`data-id="${m.id}"`,true)}</div></article>`).join("")}</div>`;}
  function forecastMarkup(m){
    const f=M.forecast(state,m);if(!f)return '<p class="guild-notice">Add members to see a forecast.</p>';
    const full=m.kind==="Gold"?`${number(285*.05*m.hours*f.rewardFactor)} Gold`:m.kind==="Troops"?`${number(200*.025*m.hours*f.rewardFactor)} troops`:m.kind==="Officer Gear"?"40% chance of one Common item after full success":m.kind==="Discovery"||m.kind==="Story chapter"?"A permanent discovery":`${number(600*.009*m.hours*f.rewardFactor)} ${m.kind}`;
    const signed=n=>(n>0?"+":"")+n.toFixed(1)+" points";
    return `<p class="guild-eyebrow">Example forecast · Proposed balance</p><h3>The likely road ahead</h3><div class="guild-odds"><div><b>${f.success.toFixed(1)}%</b><span>Full success</span></div><div><b>${f.partial.toFixed(1)}%</b><span>Partial success</span></div><div><b>${f.failure.toFixed(1)}%</b><span>Failure</span></div></div><p class="guild-subtle">Risk of a setback: <b>${f.risk.toFixed(1)}%</b></p>
      <p class="guild-subtle" data-party-readiness>Party readiness <b>${f.readiness.toFixed(1)}</b> · Mission target <b>${f.target.toFixed(1)}</b></p><details data-member-contributions><summary>Member contributions</summary><dl class="guild-breakdown">${f.contributions.map(c=>`<dt>${escape(c.name)}</dt><dd>+${c.points.toFixed(1)}</dd>`).join("")}<dt>${escape(nameFor(f.leaderId))} · Leadership bonus</dt><dd>+${f.leaderBonus.toFixed(1)}</dd></dl><p class="guild-subtle">Each member adds their relevant stats. The mission target stays fixed as the party changes. Extra members can improve success or leave it at the cap. Changing the leader can change their bonus.</p></details>
      <dl class="guild-breakdown"><dt>Contract risk</dt><dd>20.0 points</dd><dt>Party stats &amp; leader</dt><dd>${signed(f.adjustment)}</dd><dt>Matching signatures</dt><dd>${signed(-f.signature)}</dd><dt>Matching traits</dt><dd>${signed(-f.traits)}</dd><dt>Route</dt><dd>${signed(f.routeRisk)}</dd><dt>Approach</dt><dd>${signed(f.approachRisk)}</dd><dt>Supplies</dt><dd>${signed(state.supply?-6:0)}</dd></dl><p class="guild-subtle">Displayed risk is limited to 5–75% in this proposal.</p>
      <div class="guild-summary"><div><small>Journey</small><strong>${time(f.hours*60)}</strong></div><div><small>Costs</small><strong>${f.food} Food</strong></div><div><small>Recovery</small><strong>${time(f.recovery)}</strong></div></div><h4>On full success</h4><p>${full}</p><h4>Experience</h4><p class="guild-subtle">${f.xp} XP each on success · ${Math.floor(f.xp*.75)} on partial success · ${Math.floor(f.xp*.5)} on failure.</p><h4>Setbacks</h4><p class="guild-subtle">Partial success pays half the material, Gold or troop reward; failure pays none. Gear and discoveries need full success. Recovery can be longer after setbacks.</p>${m.kind==="Officer Gear"?`<p class="guild-notice">Overall Common Gear chance in this example: ${(f.success*.4).toFixed(2)}%. No other rarity is offered in this sample.</p>`:""}`;
  }
  function planning(){
    const m=currentMission(),party=state.members.filter(c=>state.party.includes(c.id));
    return `<div class="guild-tools" data-mission-plan="${m.id}"><div><p class="guild-eyebrow">2. Plan your mission</p><h2>${m.name}</h2><p class="guild-subtle">${m.client} · ${m.kind}</p></div>${button("tab","Change contract",'data-tab="contracts"')}</div><div class="guild-planning"><div>${illustration("room-planning","Guild planners studying routes and party markers at an oak map table","guild-room-image guild-planning-art")}<p>${m.copy}</p><h3>Your party</h3><div class="guild-party">${party.map(c=>button("tab",`${portrait(c,"")}<span>${escape(c.name)}<small style="display:block">${M.types[c.type].name}${c.id===state.leader?" · Leader":""}</small></span>`,'data-tab="members"')).join("")}</div>${button("tab","Choose members",'data-tab="members"')}<div class="guild-choices"><label>Party leader<select data-field="leader">${party.map(c=>`<option value="${c.id}" ${state.leader===c.id?"selected":""}>${escape(c.name)}</option>`).join("")}</select></label><label>Route<select data-field="route"><option value="direct" ${state.route==="direct"?"selected":""}>Direct · Standard journey</option><option value="patrolled" ${state.route==="patrolled"?"selected":""}>Patrolled · Slower, safer</option><option value="remote" ${state.route==="remote"?"selected":""}>Remote · Faster, riskier</option></select></label><label>Approach<select data-field="approach">${["cautious","balanced","bold"].map(v=>`<option value="${v}" ${state.approach===v?"selected":""}>${v[0].toUpperCase()+v.slice(1)}</option>`).join("")}</select></label></div><label class="guild-check"><input type="checkbox" data-field="supply" ${state.supply?"checked":""}>Pack provisions for ${m.hazard} risk · +6 Food</label><div class="guild-saved"><label>Party name<input data-field="partyName" maxlength="36" value="${escape(state.partyName||"Western Watch")}"></label>${button("saveParty","Save party")}${state.saved.length?`<label>Saved parties<select data-field="saved"><option value="">Choose a party</option>${state.saved.map((s,i)=>`<option value="${i}">${escape(s.name)}</option>`).join("")}</select></label>`:""}</div><p class="guild-notice">This local preview demonstrates the decisions and report layout. Starting real missions remains unavailable until the balance and server implementation are complete.</p></div><aside class="guild-paper" data-forecast aria-live="polite">${forecastMarkup(m)}</aside></div>`;
  }
  function infirmary(){const resting=state.members.filter(c=>!ready(c));return `<div class="guild-two-col"><div>${illustration("room-infirmary","A medic tending a resting member beside clean linen beds","guild-room-image")}<h2 style="margin-top:16px">Care for every returning member</h2><p>Rest starts at the mission's finish time. Members recover together; rewards can wait.</p><p class="guild-pill">Infirmary Lv. ${state.rooms.infirmary} · ${7*state.rooms.infirmary}% shorter recovery</p>${button("room","Review improvement",'data-id="infirmary"')}</div><div><h3>Resting now</h3>${resting.map(c=>`<article class="guild-member"><div class="guild-member-top">${portrait(c)}<div><h3>${escape(c.name)}</h3><p>${M.types[c.type].name}</p><span class="guild-pill" data-recovery="${c.id}">${time((c.recoveryUntilMs-Date.now())/60000)} remaining</span></div></div><p class="guild-subtle">Started resting automatically after The Forgotten Waymark.</p></article>`).join("")||'<p class="guild-notice">Everyone is ready for a new assignment.</p>'}<h3 style="margin-top:22px">Suggested replacement</h3><p>${escape(state.members.find(ready)?.name)} is ready to join your next party.</p>${button("tab","Review available members",'data-tab="members"')}</div></div>`;}
  function training(){return `<div class="guild-two-col"><div>${illustration("room-training","Members practising with wooden swords in the Guild courtyard","guild-room-image")}<h2 style="margin-top:16px">Learning together</h2><p>Veterans can mentor a newer member while staying at the Guild. The pupil carries that advice on their next mission.</p><p class="guild-pill">Training area Lv. ${state.rooms.training} · ${5*state.rooms.training}% mentoring XP</p>${button("room","Review improvement",'data-id="training"')}<p class="guild-subtle">Mentoring requires a ready member at least Level 10 and five levels above the pupil. No sample member meets that requirement yet.</p></div><div class="guild-paper"><p class="guild-eyebrow">Mara Stone · Personal ambition</p><h3>A promise kept</h3><p>Safely escort the people who depend on the western road.</p><p>First successful escort → 20 XP and a personal history entry.</p><progress value="0" max="1" aria-label="Successful escorts: zero of one"></progress><h4>Further milestones</h4><p class="guild-subtle">3 matching successes → 60 XP<br>6 matching successes → 120 XP and an earned title.</p><h4>Signature development</h4><p class="guild-subtle">Proposed training milestones at Levels 10, 20, 40 and 60 improve the member's specialty. Exact champion progression is still under review.</p></div></div>`;}
  function archive(){return `<div class="guild-two-col"><div><p class="guild-eyebrow">Stories that stay with your guild</p><h2>The archive</h2>${illustration("room-archive","An archivist organizing chronicles in the Guild library","guild-room-image")}<h3 style="margin-top:16px">The forgotten northern road</h3><p>Three names in an old ledger lead toward the watchtower. The next chapter needs Archive Level 1 and the first reputation milestone.</p>${button("room","Review Archive improvement",'data-id="archive"')}</div><div><h3>Example mission reports</h3>${["success","partial","failure"].map(outcome=>`<article class="guild-paper" style="margin-bottom:12px"><p class="guild-eyebrow">The Merchant's Road · Example ${outcome==="partial"?"partial success":outcome}</p><p>${outcome==="success"?"The caravan reached Alderwick safely.":outcome==="partial"?"The party brought most of the supplies home.":"The caravan turned back at the fallen bridge."}</p>${button("report","Read report",`data-outcome="${outcome}"`)}</article>`).join("")}<p class="guild-subtle">These are illustrative reports. Playing or skipping them cannot grant rewards.</p></div></div>`;}
  function improvements(){return `<h2>Improve your Guild</h2><p>Each room begins with its core service. Improvements add new opportunities and visible progress.</p>${state.roomJob?`<p class="guild-notice" data-room-timer>${M.facilities.find(f=>f.id===state.roomJob.id).name} improvement in progress · ${time((state.roomJob.endsAt-Date.now())/60000)} remaining. One internal improvement at a time.</p>`:""}<div class="guild-rooms">${M.facilities.map(f=>`<article class="guild-room-card">${illustration("room-"+f.id,f.name)}<p class="guild-eyebrow" style="margin-top:12px">Level ${state.rooms[f.id]} / 5</p><h3>${f.name}</h3><p>${escape(f.benefit(state.rooms[f.id]))}</p>${button("room","Review improvement",`data-id="${f.id}"`)}</article>`).join("")}</div>`;}
  function roomReview(){
    const f=M.facilities.find(f=>f.id===reviewRoom),level=state.rooms[f.id],next=level+1,idx=next-1;
    if(next>5)return `<h2>${f.name}</h2><p>All five improvements complete.</p>`;
    const gold=Math.ceil(285*M.roomCosts.goldHours[idx]);
    return `<div class="guild-upgrade-head">${illustration("room-"+f.id,f.name)}<div><p class="guild-eyebrow">Approved room progression</p><h2>${f.name} · Level ${next}</h2><p>Guild Master level ${M.roomCosts.guild[idx]} required · Current level 24</p></div></div><div class="guild-two-col" style="margin-top:22px"><article class="guild-paper"><h3>What improves</h3><p><span class="guild-subtle">Now</span><br>${escape(f.benefit(level))}</p><p><span class="guild-subtle">Next</span><br>${escape(f.benefit(next))}</p><div class="guild-summary"><div><small>Time</small><strong>${time(M.roomCosts.minutes[idx])}</strong></div><div><small>Gold</small><strong>${number(gold)}</strong></div><div><small>Available</small><strong>${number(state.gold)}</strong></div></div><p>${next===1?"First improvement requires only Gold.":"Later improvements require the approved material bill; this review starts rooms at their basic level."}</p><p class="guild-subtle">One improvement runs at a time. No queue or material deposits. Started work retains its timer and price.</p>${state.roomJob?'<p class="guild-notice">A Guild improvement is already running.</p>':""}</article><article><h3>All five improvement levels</h3><div class="guild-scroll-table"><table class="guild-table"><thead><tr><th>Level</th><th>Guild</th><th>Gold</th><th>Time</th></tr></thead><tbody>${M.roomCosts.guild.map((g,i)=>`<tr><td>${i+1}</td><td>${g}</td><td>${number(Math.ceil(285*M.roomCosts.goldHours[i]))}</td><td>${time(M.roomCosts.minutes[i])}</td></tr>`).join("")}</tbody></table></div><p class="guild-subtle">Gold examples use 285 unboosted Main City Gold per hour. This local preview only spends its sample balance.</p></article></div>`;
  }
  function report(){
    const stages=["Departure","Obstacles","Contributions","Outcome","Rewards"],out=reportOutcome;
    const m=M.missions.find(m=>m.id===reportMission);
    const text=["The party left the Guild with a prepared route, a chosen leader and supplies for the journey.",out==="success"?"The group found a safe crossing before the caravan reached the flooded track.":"A fallen tree blocked the narrow road. The party had to decide how much of the cargo could be carried onward.",`${escape(nameFor(state.leader))} kept the party together. The members' specialties influenced the accepted odds; they could not guarantee the result.`,out==="success"?"Full success. The contract was completed and the party returned safely.":out==="partial"?"Partial success. The party returned with part of the cargo. A possible setback occurred despite their preparation.":"The mission failed. Everyone returned safely, with experience from the attempt and a longer recovery ahead.","In the finished system, this page will show the server-recorded rewards and any items still waiting for storage. This illustrative report grants no rewards."];
    return `<article class="guild-report"><p class="guild-eyebrow">${m.name} · Illustrative ${out} report</p><ol class="guild-report-steps">${stages.map((s,i)=>`<li ${i===reportStep?'aria-current="step"':""}>${i+1}. ${s}</li>`).join("")}</ol>${illustration(reportStep===0?"hall-v3":"mission-"+m.id,reportStep===0?"Departure from the Guild Hall":m.name)}<h2 style="margin-top:18px">${stages[reportStep]}</h2><p>${text[reportStep]}</p>${reportStep===2?`<div class="guild-party">${state.members.filter(c=>state.party.includes(c.id)).map(c=>portrait(c)).join("")}</div>`:""}</article>`;
  }
  function render(keep=false){
    if(!dialog.open)return;
    if(page==="planning"&&!currentMission())page="contracts";
    const scroll=keep?dialog.querySelector(".guild-body")?.scrollTop||0:0;
    const focused=keep&&dialog.contains(document.activeElement)?{action:document.activeElement.dataset.guild,id:document.activeElement.dataset.id,field:document.activeElement.dataset.field}:null;
    const content=building==="alehouse"?recruits():({hall,members:roster,contracts,planning,infirmary,training,archive,improvements,room:roomReview,report}[page]||hall)();
    let actions=button("close","Back to Inner Castle");
    if(building==="alehouse")actions=button("returnGuild","Back to Guild", "",true);
    else if(page==="planning")actions=button("report","Preview report",`data-outcome="partial" ${state.party.length<currentMission().requiredMembers?"disabled":""}`,true);
    else if(page==="members")actions=currentMission()?button("tab","Back to mission plan",'data-tab="planning"',true):button("tab","Choose a contract",'data-tab="contracts"',true);
    else if(page==="room")actions=button("tab","Cancel",'data-tab="improvements"')+button("improve","Start sample improvement",state.roomJob||state.gold<Math.ceil(285*M.roomCosts.goldHours[state.rooms[reviewRoom]])?"disabled":"",true);
    else if(page==="report")actions=button("skip","Skip to result")+button(reportStep<4?"nextReport":"tab",reportStep<4?"Continue":"Back to Archive",reportStep<4?"":'data-tab="archive"',true);
    dialog.innerHTML=`<header><div><small>Inner Castle · ${building==="alehouse"?"Recruitment":"Champions & expeditions"}</small><h1 id="guildTitle">${building==="alehouse"?"Alehouse":"Guild Master"}</h1></div><small>Lv. 24</small>${button("refresh","Refresh")}${button("close","×",'class="guild-close" aria-label="Close and return to Inner Castle"')}</header><p class="guild-preview-note">Local game preview · Sample members &amp; resources · Room upgrades approved; champion and mission balance proposed.</p>${building==="alehouse"?"":`<nav aria-label="Guild rooms">${Object.entries(tabNames).filter(([id])=>id!=="planning"||currentMission()).map(([id,name])=>button("tab",name,`data-tab="${id}" ${page===id?'aria-current="page"':""}`)).join("")}</nav>`}<div class="guild-body">${message?`<p class="guild-notice" role="status">${escape(message)}</p>`:""}${content}</div><footer><span>${building==="alehouse"?"Same type. Individual starting rolls.":page==="planning"?"Choose members, route and supplies; then review the forecast.":"Your members and their stories persist."}</span><div>${actions}</div></footer>`;
    if(focused){const e=[...dialog.querySelectorAll("button,input,select")].find(e=>focused.field?e.dataset.field===focused.field:e.dataset.guild===focused.action&&e.dataset.id===focused.id);e?.focus({preventScroll:true});}
    dialog.querySelector(".guild-body").scrollTop=scroll;
  }
  function openGuild(which="guild-master",section="hall"){
    building=which;page=section;message="";
    if(!dialog.open){opener=document.activeElement;dialog.showModal();}
    render();dialog.querySelector('[data-guild="close"]').focus({preventScroll:true});
    tick();
  }
  function tick(){
    clearTimeout(clockTimer);if(!dialog.open||document.hidden)return;
    if(state.roomJob&&state.roomJob.endsAt<=Date.now()){state.rooms[state.roomJob.id]++;message=M.facilities.find(f=>f.id===state.roomJob.id).name+" sample improvement completed.";state.roomJob=null;save();render(true);}
    dialog.querySelectorAll("[data-recovery]").forEach(e=>{const c=state.members.find(c=>c.id===e.dataset.recovery);e.textContent=ready(c)?"Ready":time((c.recoveryUntilMs-Date.now())/60000)+" remaining";});
    if(state.roomJob&&dialog.querySelector("[data-room-timer]"))dialog.querySelector("[data-room-timer]").textContent=`${M.facilities.find(f=>f.id===state.roomJob.id).name} improvement in progress · ${time((state.roomJob.endsAt-Date.now())/60000)} remaining.`;
    clockTimer=setTimeout(tick,10000);
  }
  dialog.addEventListener("close",()=>{clearTimeout(clockTimer);opener?.isConnected&&opener.focus({preventScroll:true});});
  document.addEventListener("visibilitychange",tick);
  dialog.addEventListener("change",event=>{
    const f=event.target.dataset.field;if(!f)return;
    if(f==="type")typeFilter=event.target.value;
    else if(f==="status")statusFilter=event.target.value;
    else if(["leader","route","approach"].includes(f))state[f]=event.target.value;
    else if(f==="supply")state.supply=event.target.checked;
    else if(f==="partyName")state.partyName=event.target.value;
    else if(f==="saved"&&event.target.value!==""){
      const s=state.saved[Number(event.target.value)];if(!s)return;
      state.party=s.ids.filter(id=>state.members.some(c=>c.id===id&&ready(c)));
      state.leader=state.party.includes(s.leader)?s.leader:state.party[0]||"";
      message=state.party.length<s.ids.length?"Unavailable members were left out. Review the roster for a suitable replacement.":"Saved party restored.";
    }
    save();render(true);
  });
  dialog.addEventListener("input",event=>{if(event.target.dataset.field==="partyName"){state.partyName=event.target.value;save();}});
  dialog.addEventListener("click",event=>{
    const b=event.target.closest("[data-guild]");if(!b||b.disabled)return;const action=b.dataset.guild;message="";
    if(action==="close"){dialog.close();return;}
    if(action==="tab"){page=b.dataset.tab;render();return;}
    if(action==="refresh"){message="Preview refreshed. Your party, offers and starting rolls are unchanged.";render(true);return;}
    if(action==="recruits"){openGuild("alehouse");return;}
    if(action==="returnGuild"){openGuild("guild-master","members");return;}
    if(action==="mission"){if(!M.missions.some(m=>m.id===b.dataset.id))return;state.selectedMission=b.dataset.id;save();page="planning";render();return;}
    if(action==="room"){reviewRoom=b.dataset.id;page="room";render();return;}
    if(action==="report"){
      if(page!=="archive"&&(!currentMission()||state.party.length<currentMission().requiredMembers))return;
      reportMission=page==="archive"?"escort":state.selectedMission;
      reportStep=0;reportOutcome=b.dataset.outcome||"partial";page="report";render();return;
    }
    if(action==="nextReport"){reportStep=Math.min(4,reportStep+1);render();return;}
    if(action==="skip"){reportStep=4;render();return;}
    if(action==="party"){
      const c=state.members.find(c=>c.id===b.dataset.id);if(!c||!ready(c))return;
      if(state.party.includes(c.id))state.party=state.party.filter(id=>id!==c.id);
      else if(state.party.length<3)state.party.push(c.id);
      if(!state.party.includes(state.leader)){
        state.leader=state.party[0]||"";
        if(state.leader)message=nameFor(state.leader)+" is now the party leader. Their Leadership bonus may change the forecast.";
      }
    }else if(action==="leader"){if(state.party.includes(b.dataset.id))state.leader=b.dataset.id;
    }else if(action==="saveParty"){
      const name=(state.partyName||"Western Watch").trim().slice(0,36);
      if(!name||!state.party.length){message="Choose at least one member and a party name.";render(true);return;}
      const existing=state.saved.find(p=>p.name===name);
      if(!existing&&state.saved.length>=3+state.rooms.planning){message="All saved-party slots are in use. Use an existing name to update that party.";render(true);return;}
      const entry={name,ids:[...state.party],leader:state.leader};if(existing)Object.assign(existing,entry);else state.saved.push(entry);message="Party saved for this local preview.";
    }else if(action==="recruit"){
      const offer=state.offers.find(c=>c.id===b.dataset.id);if(!offer||offer.claimed||state.gold<57)return;
      offer.claimed=true;state.gold-=57;state.members.push({...structuredClone(offer),id:"hired-"+offer.id});message=offer.name+" joined your sample roster with exactly the stats shown. No real Gold was spent.";estate.updateResources();
    }else if(action==="improve"){
      const level=state.rooms[reviewRoom],gold=Math.ceil(285*M.roomCosts.goldHours[level]);
      if(level!==0||state.roomJob||state.gold<gold){message="This local review supports the Gold-only first improvement. Later material upgrades will use the approved server implementation.";render(true);return;}
      state.gold-=gold;state.roomJob={id:reviewRoom,endsAt:Date.now()+M.roomCosts.minutes[level]*60000};page="improvements";message="Sample improvement started. No real resources were spent.";estate.updateResources();
    }
    save();render(true);tick();
  });
  const response=await fetch("/building-ui-fixture?profile=ready&building=guild-master");if(!response.ok)throw Error("Start the estate-building-ui-preview server to review this scene.");sample=await response.json();
  const api={getEstateState:async()=>structuredClone(sample),getEstateQuote:async input=>{const r=await fetch("/building-ui-quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;},commitEstateAction:async()=>{throw Error("Local visual preview only. No player resources have been spent.");},getEstateChampions:async()=>({champions:Object.values(sample.champions),nextCursor:""})};
  economy=CrownlandsEstateEconomy.create({scope:()=>"guild-game-preview",preferenceScope:()=>"guild-game-preview",api:()=>api,visible:()=>!dialog.open,gold:()=>state.gold,gear:CROWNLANDS_COMMON_GEAR,selectBuilding:id=>{estate.select(id);return document.querySelector(`[data-inner-castle-building="${id}"]`);}});
  const icon=name=>name==="arrow-up"?'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 2 12h6v10h8V12h6Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m14 2 10 10-10 10v-6H2V8h12Z"/></svg>';
  estate=CrownlandsEstate.mount(document.querySelector("#modalBody"),{cityName:"Kingsmoor",estate:sample.estate,getResources:()=>({...sample.estate.stock,gold:state.gold,crowns:160}),actions:CrownlandsEstateEconomy.mapActions(icon,economy),onBuilding:id=>["guild-master","alehouse"].includes(id)?openGuild(id):economy.building(id),onUpgrade:id=>economy.upgrade(id),onBack:()=>{location.href="/?view=map&revision=guild-review-return";}});
  document.querySelector("#modal").show();estate.fit();
  const note=document.createElement("span");note.className="guild-map-review";note.textContent="LOCAL GUILD PREVIEW";document.querySelector(".estate-header").append(note);
  const params=new URL(location.href).searchParams;
  const entry=params.get("entry")||"guild";
  if(entry!=="map"){estate.select(entry==="alehouse"?"alehouse":"guild-master");openGuild(entry==="alehouse"?"alehouse":"guild-master",params.get("tab")||"hall");}
  window.guildGamePreview={estate,openGuild,model:M,snapshot:()=>structuredClone(state)};
  document.documentElement.dataset.guildGameReady="true";
  window.addEventListener("pagehide",()=>{clearTimeout(clockTimer);economy.destroy();estate.destroy();},{once:true});
})().catch(error=>{console.error(error);const p=document.querySelector("#previewFailure");p.hidden=false;p.textContent=error.message;});
