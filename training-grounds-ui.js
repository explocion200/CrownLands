(function(global){
 "use strict";
 const B=global.CrownlandsClanTowerBuildings;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
 const number=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString();
 const money=value=>`<img src="assets/icons/royal-shop-gold-r1.svg" alt="">${number(value)}`;
 const time=ms=>{const seconds=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}h${m?` ${m}m`:""}`:m?`${m}m${s?` ${s}s`:""}`:`${s}s`;};
 function mount(host,tower,options={}){
  host._clanTowerClockCleanup?.();
  const $=selector=>host.querySelector(selector),view=options.view||{},project=tower.buildingProject;
  const treasury=options.treasuryBalance;
  const model=Object.assign(view,{level:B.level(tower.buildings?.training),
    treasury:treasury==null||!Number.isFinite(Number(treasury))?null:Number(treasury),
    manager:Boolean(tower.ownerMember&&tower.permissions?.manage&&tower.worldActive!==false),
    attack:Boolean(tower.attackBlocked),integrity:Math.max(0,Math.min(10000,Number(tower.wallIntegrityBps)||0)/100),
    repairActive:Boolean(tower.repairActive),pending:Boolean(options.actionBusy),
    project:project?{building:project.buildingId,target:project.targetLevel,total:B.duration(project.targetLevel),
      remaining:Math.max(0,Number(project.remainingMs)||0),end:Number(project.progressStartedAtMs)+Number(project.remainingMs),
      paused:!project.progressStartedAtMs||Boolean(tower.attackBlocked)||tower.wallIntegrityBps<10000}:null});
  model.section=model.section||"overview";
  model.exampleBase=[0,30,50].includes(model.exampleBase)?model.exampleBase:30;
  const scrollSelectors=["#overviewPanel","#levelsPanel",".building-panel"];
  const savedScroll=Object.fromEntries(scrollSelectors.map(selector=>[selector,$(selector)?.scrollTop||0]));
  const focused=host.contains(document.activeElement)?document.activeElement?.id:"";
  host.innerHTML=`<div class="training-shell">
 <header class="window-header"><img class="header-emblem" src="assets/icons/skills/swordmastery.svg" alt=""><div class="heading"><p>${esc(tower.name)} · Clan Tower</p><h1 id="trainingTitle">Training Grounds</h1></div><div class="treasury"><span>Clan Treasury</span><strong><img src="assets/icons/royal-shop-gold-r1.svg" alt="Gold"><span id="balance"></span></strong></div><button id="closeTraining" class="close" aria-label="Close Training Grounds">×</button></header>
 <div class="training-body">
  <aside class="building-panel" tabindex="0" aria-label="Training Grounds building and level"><p class="overline">${esc(tower.clanName || "Your clan")}</p><div class="building-art"><img id="buildingArt" src="assets/clan-buildings/training-2.webp" alt="Training Grounds building"></div><h2 id="buildingLevel"></h2><div id="levelTrack" class="level-track"></div><p id="buildingCaption" class="building-caption"></p><label class="building-navigation"><span class="sr-only">Tower building</span><select data-training-building aria-label="Tower building">${B.DEFINITIONS.map(d=>`<option value="${d.id}" ${d.id==="training"?"selected":""}>${esc(d.name)}</option>`).join("")}</select></label><div class="building-seal" aria-hidden="true">◆</div><p class="building-note">Completed rally benefits stay active during upgrades and attacks.</p></aside>
  <section class="detail-panel" aria-label="Training Grounds improvements">
   <nav class="training-tabs" aria-label="Training Grounds sections"><div role="tablist"><button id="tab-overview" type="button" role="tab" aria-controls="overviewPanel" aria-selected="true" data-section="overview">Overview</button><button id="tab-levels" type="button" role="tab" aria-controls="levelsPanel" aria-selected="false" data-section="levels">All levels</button></div><button type="button" class="tower-back" data-training-back>← Tower Info</button></nav>
   <div id="overviewPanel" class="detail-scroll" tabindex="0" role="tabpanel" aria-labelledby="tab-overview"></div>
   <div id="levelsPanel" class="detail-scroll" tabindex="0" role="tabpanel" aria-labelledby="tab-levels" hidden></div>
  </section>
 </div>
 <footer class="upgrade-footer"><dl id="upgradeFacts"></dl><button id="upgrade" class="primary" type="button" aria-describedby="upgradeNote"></button><p id="upgradeNote" role="status"></p></footer>
</div>`;
  function reason(){
    if(model.level===10)return "Maximum level reached. Your Training Grounds add the full 10 percentage points of rally attack strength.";
    if(!model.manager)return "The Clan Leader and Officers can start building upgrades.";
    if(model.project)return model.project.building!=="training"?`${B.definition(model.project.building)?.name||"Another building"} is being upgraded. Only one building project can run at a time.`:model.project.paused?"Construction resumes automatically once the walls are fully repaired and incoming attacks end.":"Construction is underway. The completed Training Grounds level remains active.";
    if(model.attack)return "Wait for the incoming attack to end before starting construction.";
    if(model.integrity<100||model.repairActive)return "Fully repair the Tower walls before starting construction.";
    if(model.treasury===null)return "Clan Treasury balance is unavailable. Retry before upgrading.";
    if(model.treasury<B.cost(model.level+1))return `The Clan Treasury needs ${number(B.cost(model.level+1)-model.treasury)} more Gold.`;
    return "";
  }
function progress(){const project=model.project;if(!project)return 0;const remaining=project.paused?project.remaining:Math.max(0,project.end-Date.now());return Math.min(100,Math.max(0,(1-remaining/project.total)*100));}
function render(){
 $("#balance").textContent=model.treasury===null?"Unavailable":number(model.treasury);$("#balance").title=model.treasury===null?"Unavailable":number(model.treasury)+" Gold";
 $("#buildingArt").src=B.art("training",model.level);$("#buildingLevel").textContent=model.level?`Training\u00a0Grounds Level\u00a0${model.level}`:"Training\u00a0Grounds unbuilt";
 $("#levelTrack").innerHTML=Array.from({length:10},(_,index)=>`<span class="${index<model.level?"reached":""}"></span>`).join("");$("#levelTrack").setAttribute("aria-label",`Level ${model.level} of 10`);
 $("#buildingCaption").textContent=model.level?`${model.level} of 10 levels completed`:"Build to strengthen rallies launched from this Tower.";
 renderOverview();renderLevels();renderFooter();section(model.section);tick();
}
function renderOverview(){
 const current=B.bonus("training",model.level),next=Math.min(B.MAX_LEVEL,model.level+1),maximum=model.level===B.MAX_LEVEL;
 const statusFirst=Boolean(model.project||model.pending||model.failed||(!maximum&&reason()));
 $("#overviewPanel").innerHTML=`${statusFirst?projectCard():""}
 <h2 class="section-heading">Stronger rallies from this Tower</h2>
 <p class="section-intro">Every participant receives the completed Training Grounds bonus when the rally launches.</p>
 <div class="benefit-comparison"><article class="benefit-card"><small>${model.level?`Active · Level ${model.level}`:"Current · Unbuilt"}</small><strong id="currentBenefit">+${current}%</strong><p>rally attack strength</p><span class="gain">${model.level?`Adds ${current} percentage ${current===1?"point":"points"}`:"No Training Grounds benefit yet"}</span></article><span class="comparison-arrow" aria-hidden="true">${maximum?"◆":"→"}</span><article class="benefit-card next"><small>${maximum?"Highest benefit":`After Level ${next}`}</small><strong id="nextBenefit">+${B.bonus("training",next)}%</strong><p>rally attack strength</p><span class="gain">${maximum?"All ten levels completed":"1 percentage point more attack"}</span></article></div>
 <div class="benefit-explanation"><article><img src="assets/icons/skills/swordmastery.svg" alt=""><div><h3>Every rally participant</h3><p>Adds to each player’s own Swordmastery and equipped attack gear.</p></div></article><article><img src="assets/icons/skills/marchOrders.svg" alt=""><div><h3>Locked when you launch</h3><p>Later upgrades or a change of Tower ownership do not alter a launched rally’s bonus.</p></div></article></div>
 <div class="rally-rule"><div class="launch-seal"><strong>Rally</strong><span>from here</span></div><p><b>This Tower’s outgoing rallies</b><span>No bonus to solo attacks, Tower defense, rallies launched from cities, or troop production.</span></p></div>
 <details class="rally-example" id="rallyExample"><summary>See how the bonuses add up</summary><div class="example-content"><label for="exampleBase">Example participant’s skill + attack gear</label><select id="exampleBase"><option value="0">0% · No skill or gear bonus</option><option value="30" selected>30% · Skill and gear combined</option><option value="50">50% · Skill and gear combined</option></select><p class="example-note">Illustration only · 10,000 base attack power · not a battle forecast</p><div id="exampleResults"></div><p class="example-note">Each participant uses their own skills, gear and base power. The Training Grounds percentage is shared by everyone in this rally.</p></div></details>${statusFirst?"":projectCard()}`;
 $("#exampleBase").value=String(model.exampleBase);$("#rallyExample").open=Boolean(model.exampleOpen);renderExample();
}
function renderExample(){
 const base=Number($("#exampleBase").value),bonus=B.bonus("training",model.level),next=B.bonus("training",Math.min(B.MAX_LEVEL,model.level+1));
 const total=base+bonus,nextTotal=base+next,power=percent=>number(10000+percent*100);
 $("#exampleResults").innerHTML=`<div class="example-totals"><div><small>Skill + gear only</small><strong>+${base}%</strong><span>${power(base)} power</span></div><span aria-hidden="true">→</span><div><small>With Level ${model.level}</small><strong id="exampleTotal">+${total}%</strong><span id="examplePower">${power(total)} power</span></div><span aria-hidden="true">→</span><div><small>${model.level===B.MAX_LEVEL?"Maximum level":`After Level ${model.level+1}`}</small><strong id="exampleNext">+${nextTotal}%</strong><span>${power(nextTotal)} power</span></div></div><p class="example-gain" id="exampleGain">${bonus?`Training Grounds adds ${number(bonus*100)} attack power for this example participant. ${base}% skill + gear and ${bonus}% Training Grounds add to ${total}%; the bonuses are not multiplied together.`:"Unbuilt Training Grounds add no attack bonus. Each participant still keeps their own skill and gear benefits."}</p>`;
}
function projectCard(){
 const project=model.project,active=project?.building==="training",paused=Boolean(project?.paused);
 const blocked=Boolean(reason())&&model.level!==10;
 let title="Ready to upgrade",badge="Ready",copy="Walls must be fully repaired, with no incoming attack and no other building project.";
 if(model.level===0)title="Ready to build";
 if(model.level===10){title="Training Grounds complete";badge="Maximum level";copy="All ten Training Grounds levels are complete. Its benefit continues to support this Tower.";}
 else if(project){title=active?(paused?`Level ${project.target} upgrade paused`:`Building Level ${project.target}`):"Another building is underway";badge=project.paused?"Paused":active?"In progress":esc(B.definition(project.building)?.name || "Construction");copy=reason();}
 else if(model.pending){title="Starting construction…";badge="Pending";copy="Waiting for the server to confirm construction. The completed level stays active.";}
 else if(blocked){title=!model.manager?"Officer approval required":model.attack?"Incoming attack":(model.integrity<100||model.repairActive)?"Walls need repair":model.treasury===null?"Treasury unavailable":"More Gold needed";badge="Unavailable";copy=reason();}
 if(model.failed){title="Request could not be confirmed";badge="Try again";copy=model.feedback;}
 const conditions=!project&&model.level<10?`<div class="conditions"><span class="${(model.integrity<100||model.repairActive)?"unmet":""}">Walls ${model.integrity}%</span><span class="${model.attack?"unmet":""}">${model.attack?"Attack incoming":"No incoming attack"}</span></div>`:"";
 return `<section class="project-card ${model.failed?"error":paused?"paused":blocked?"blocked":""}" aria-label="Construction status"><div class="project-heading"><h3>${title}</h3><span class="state-badge">${badge}</span></div><p>${esc(copy)}</p>${project?`<div class="progress" role="progressbar" aria-label="${esc(B.definition(project.building)?.name || "Building")} construction" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(progress())}"><span style="--progress:${progress()}%"></span></div><div class="project-stats"><span>${paused?"Work preserved":"Work completed"} · <b id="progressPercent">${Math.floor(progress())}%</b></span><span>${paused?"Paused · ":""}<b data-project-time></b> remaining</span></div>`:""}${conditions}${model.treasury===null||model.failed?`<button class="retry" type="button" data-retry ${model.refreshing?"disabled":""}>${model.refreshing?"Refreshing…":"Refresh status"}</button>`:""}</section>`;
}
function renderLevels(){
 $("#levelsPanel").innerHTML=`<h2 class="section-heading">The ten Training Grounds levels</h2><p class="section-intro">Each completed level adds 1 percentage point of rally attack strength.</p><table class="levels-table"><thead><tr><th scope="col">Level</th><th scope="col">Rally bonus</th><th scope="col">Treasury Gold</th><th scope="col">Build time</th></tr></thead><tbody>${Array.from({length:10},(_,index)=>{const level=index+1;return`<tr class="${level===model.level?"current":level===model.level+1?"next":""}"><td>${level}<span class="row-state">${level===model.level?"Current":level===model.level+1?"Next":""}</span></td><td>+${B.bonus("training",level)}%</td><td>${number(B.cost(level))}</td><td>${time(B.duration(level))}</td></tr>`;}).join("")}</tbody></table><p class="level-footnote">Costs are paid upfront from Clan Treasury for each level. The bonus applies to every participant in rallies launched from this Tower. Each participant keeps their own skill and gear bonuses.</p>`;
}
function renderFooter(){
 const next=Math.min(10,model.level+1),active=model.project?.building==="training",maximum=model.level===10,paused=active&&model.project.paused;
 $("#upgradeFacts").innerHTML=maximum?'<div><dt>Training Grounds completed</dt><dd>Level 10 / 10</dd></div><div><dt>Rally attack bonus</dt><dd>+10%</dd></div>':`<div><dt>${active?"Gold paid":model.level?`Level ${next} cost`:"Level 1 cost"}</dt><dd id="upgradeCost">${money(B.cost(next))}</dd></div><div><dt>${active?paused?"Work remaining":"Time remaining":"Construction time"}</dt><dd ${active?"data-project-time":""}>${active?"":time(B.duration(next))}</dd></div>`;
 const button=$("#upgrade"),blocked=Boolean(reason());button.disabled=blocked||model.pending;
 button.textContent=maximum?"Maximum level":model.pending?"Starting…":active?paused?"Upgrade paused":"Upgrade in progress":model.project?"Building project active":!model.manager?"Leader / Officer only":model.attack?"Attack incoming":(model.integrity<100||model.repairActive)?"Repair walls first":model.treasury===null?"Balance unavailable":blocked?"Not enough Gold":model.level?`Upgrade to Level ${next}`:"Build Level 1";
 $("#upgradeNote").textContent=model.failed?model.feedback:reason()||"Paid upfront from Clan Treasury. One building project per Tower. Construction cannot be canceled.";$("#upgradeNote").className=model.failed?"error":"";
}
function section(id){model.section=id==="levels"?"levels":"overview";host.querySelectorAll("[data-section]").forEach(button=>{const active=button.dataset.section===model.section;button.setAttribute("aria-selected",String(active));button.tabIndex=active?0:-1;});$("#overviewPanel").hidden=model.section!=="overview";$("#levelsPanel").hidden=model.section!=="levels";}

  // Only the server can complete a project or change its paid balance/level.
  const projectKey=model.project?`${model.project.building}:${model.project.target}:${model.project.end}`:"";
  function tick(){
    const project=model.project;if(!project)return;
    const remaining=project.paused?project.remaining:Math.max(0,project.end-Date.now());
    host.querySelectorAll("[data-project-time]").forEach(node=>node.textContent=time(remaining));
    const bar=$(".progress");if(bar){bar.setAttribute("aria-valuenow",String(Math.floor(progress())));bar.firstElementChild.style.setProperty("--progress",progress()+"%");$("#progressPercent").textContent=Math.floor(progress())+"%";}
    if(!project.paused&&remaining===0&&model.countdownRefreshKey!==projectKey){model.countdownRefreshKey=projectKey;options.onCountdownComplete?.();}
  }
  $("#upgrade").addEventListener("click",()=>{if(reason()||model.pending)return;model.pending=true;model.failed=false;model.exampleOpen=false;renderOverview();renderFooter();section("overview");$("#overviewPanel").scrollTop=0;options.onBuild?.();});
  $("#closeTraining").addEventListener("click",()=>options.onClose?.());
  $("[data-training-back]").addEventListener("click",()=>options.onBack?.());
  $("[data-training-building]").addEventListener("change",e=>options.onBuilding?.(e.target.value));
  host.querySelectorAll("[data-section]").forEach(button=>button.addEventListener("click",()=>section(button.dataset.section)));
  $(".training-tabs").addEventListener("keydown",event=>{if(!event.target.closest("[data-section]")||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();section(event.key==="Home"?"overview":event.key==="End"?"levels":model.section==="overview"?"levels":"overview");$("#tab-"+model.section).focus();});
  $("#overviewPanel").addEventListener("click",event=>{if(event.target.closest("[data-retry]")&&!model.refreshing)options.onRefresh?.();});
  $("#overviewPanel").addEventListener("change",event=>{if(event.target.id==="exampleBase"){model.exampleBase=Number(event.target.value);renderExample();}});
  $("#overviewPanel").addEventListener("toggle",event=>{if(event.target.id==="rallyExample")model.exampleOpen=event.target.open;},true);
  render();
  for(const [selector,top] of Object.entries(savedScroll)){const el=$(selector);if(el)el.scrollTop=top;}
  if(focused)host.querySelector("#"+CSS.escape(focused))?.focus({preventScroll:true});
  const dialog=host.closest("dialog"),clock=global.setInterval(tick,1000);
  const cleanup=()=>{global.clearInterval(clock);dialog?.removeEventListener("close",cleanup);};
  host._clanTowerClockCleanup=cleanup;dialog?.addEventListener("close",cleanup,{once:true});
  host.dataset.trainingReady="true";
 }
 global.CrownlandsTrainingGroundsUi=Object.freeze({mount});
})(window);
