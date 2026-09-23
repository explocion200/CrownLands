"use strict";
/* Local design draft. All state is in memory; no accounts, storage, fetches or backend calls. */
const B=window.CrownlandsClanTowerBuildings,$=selector=>document.querySelector(selector),dialog=$("#infirmaryDialog");
const samples=["ready","upgrading","paused","attack","damage","other","low","member","unavailable","error"];
const number=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString("en-US");
const money=value=>`<img src="assets/icons/royal-shop-gold-r1.svg" alt="">${number(value)}`;
const time=ms=>{const seconds=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}h${m?` ${m}m`:""}`:m?`${m}m${s?` ${s}s`:""}`:`${s}s`;};
let model,epoch=0,requestTimer;
function notify(message){$("#liveStatus").textContent=message;parent.postMessage({type:"infirmary-status",message:message+" · Draft only"},location.origin);}
function reset(level=4,sample="ready"){
 epoch++;clearTimeout(requestTimer);
 const current=B.level(level);sample=samples.includes(sample)?sample:"ready";
 model={level:current,sample,section:"overview",treasury:sample==="unavailable"?null:sample==="low"?2000000:4260000000,manager:sample!=="member",attack:["attack","paused"].includes(sample),integrity:["damage","paused"].includes(sample)?62:100,project:null,pending:false,failOnce:sample==="error",feedback:"",failed:false};
 if(current<10&&["upgrading","paused"].includes(sample)){
  const remaining=Math.floor(B.duration(current+1)*.375);
  model.project={building:"infirmary",target:current+1,remaining,end:Date.now()+remaining,paused:sample==="paused",total:B.duration(current+1)};
  model.treasury-=B.cost(current+1);
 }
 if(sample==="other"&&current<10)model.project={building:"training",target:5,remaining:5400000,end:Date.now()+5400000,paused:false,total:B.duration(5)};
 render();for(const selector of ["#overviewPanel","#levelsPanel",".building-panel"])$(selector).scrollTop=0;if(!dialog.open)dialog.showModal();$("#dismissed").hidden=true;notify("Infirmary example loaded.");
}
function reason(){
 if(model.level===10)return"Maximum level reached. Your Infirmary adds its full 15 percentage points of defender recovery.";
 if(!model.manager)return"The Clan Leader and Officers can start building upgrades.";
 if(model.project)return model.project.building!=="infirmary"?"The Training Grounds are being upgraded. Only one building project can run at a time.":model.project.paused?"Construction resumes automatically once the walls are fully repaired and incoming attacks end.":"Construction is underway. The completed Infirmary level remains active.";
 if(model.attack)return"Wait for the incoming attack to end before starting construction.";
 if(model.integrity<100)return"Fully repair the Tower walls before starting construction.";
 if(model.treasury===null)return"Clan Treasury balance is unavailable. Retry before upgrading.";
 if(model.treasury<B.cost(model.level+1))return`The Clan Treasury needs ${number(B.cost(model.level+1)-model.treasury)} more Gold.`;
 return"";
}
function progress(){const project=model.project;if(!project)return 0;const remaining=project.paused?project.remaining:Math.max(0,project.end-Date.now());return Math.min(100,Math.max(0,(1-remaining/project.total)*100));}
function render(){
 $("#balance").textContent=model.treasury===null?"Unavailable":number(model.treasury);$("#balance").title=model.treasury===null?"Unavailable":number(model.treasury)+" Gold";
 $("#buildingArt").src=B.art("infirmary",model.level);$("#buildingLevel").textContent=model.level?`Infirmary Level ${model.level}`:"Infirmary unbuilt";
 $("#levelTrack").innerHTML=Array.from({length:10},(_,index)=>`<span class="${index<model.level?"reached":""}"></span>`).join("");$("#levelTrack").setAttribute("aria-label",`Level ${model.level} of 10`);
 $("#buildingCaption").textContent=model.level?`${model.level} of 10 levels completed`:"Build to recover more casualties from this Tower’s defense.";
 renderOverview();renderLevels();renderFooter();section(model.section);tick();
}
function renderOverview(){
 const current=B.bonus("infirmary",model.level),next=Math.min(B.MAX_LEVEL,model.level+1),maximum=model.level===B.MAX_LEVEL;
 const statusFirst=Boolean(model.project||model.pending||model.failed||(!maximum&&reason()));
 $("#overviewPanel").innerHTML=`${statusFirst?projectCard():""}<h2 class="section-heading">Recover more of your defenders</h2><p class="section-intro">Every player defending this Clan Tower receives its completed Infirmary benefit.</p><div class="benefit-comparison"><article class="benefit-card"><small>${model.level?`Active · Level ${model.level}`:"Current · Unbuilt"}</small><strong id="currentBenefit">+${current}%</strong><p>casualty recovery</p><span class="gain">${model.level?`Adds ${current} percentage points`:"No Infirmary benefit yet"}</span></article><span class="comparison-arrow" aria-hidden="true">${maximum?"◆":"→"}</span><article class="benefit-card next"><small>${maximum?"Highest benefit":`After Level ${next}`}</small><strong id="nextBenefit">+${B.bonus("infirmary",next)}%</strong><p>casualty recovery</p><span class="gain">${maximum?"All ten levels completed":"1.5 percentage points more recovery"}</span></article></div><div class="benefit-explanation"><article><img src="assets/icons/skills/shieldwallDiscipline.svg" alt=""><div><h3>This Tower’s defenders</h3><p>The bonus applies to each player’s own casualties when defending here.</p></div></article><article><img src="assets/icons/skills/fieldMedics.svg" alt=""><div><h3>Return to Main City</h3><p>Recovered troops return through the recovery system to their owner’s Main City.</p></div></article></div><div class="recovery-rule"><div class="cap-seal"><strong>90%</strong><span>total cap</span></div><p><b>Field Medics + equipped gear + Infirmary</b><span>Recovery adds together, up to 90% for each player. The Infirmary adds no bonus to attacks or battles elsewhere.</span></p></div><details class="recovery-example" id="recoveryExample"><summary>See a recovery example</summary><div class="example-content"><label for="exampleBase">Example defender’s skill + gear recovery</label><select id="exampleBase"><option value="30">30% · Typical example</option><option value="88">88% · Near the cap</option></select><p class="example-note">Illustration only · 1,000 casualties · not your army’s forecast</p><div id="exampleResults"></div><p class="example-note">No wounded troops are stored in this building.</p></div></details>${statusFirst?"":projectCard()}`;
 renderExample();
}
function renderExample(){
 const base=Number($("#exampleBase").value),bonus=B.bonus("infirmary",model.level),next=B.bonus("infirmary",Math.min(B.MAX_LEVEL,model.level+1));
 const total=Math.min(90,base+bonus),nextTotal=Math.min(90,base+next),applied=total-base;
 $("#exampleResults").innerHTML=`<div class="example-totals"><div><small>Skill + gear</small><strong>${base}%</strong><span>${number(base*10)} recovered</span></div><span aria-hidden="true">→</span><div><small>With Level ${model.level}</small><strong id="exampleTotal">${total}%</strong><span>${number(total*10)} recovered</span></div><span aria-hidden="true">→</span><div><small>${model.level===B.MAX_LEVEL?"Maximum level":`After Level ${model.level+1}`}</small><strong id="exampleNext">${nextTotal}%</strong><span>${number(nextTotal*10)} recovered</span></div></div><p class="example-cap" id="exampleCap">${base+bonus>90?`Only ${applied} of this Infirmary’s ${bonus} percentage points apply in this example because total recovery is capped at 90%.`:bonus?`The Infirmary adds ${number((total-base)*10)} recovered troops in this example. The 90% cap applies to the combined total.`:"An unbuilt Infirmary adds no recovery. Each defender still keeps their own skill and gear benefits."}</p>`;
}
function projectCard(){
 const project=model.project,active=project?.building==="infirmary",paused=active&&project.paused;
 const blocked=Boolean(reason())&&model.level!==10;
 let title="Ready to upgrade",badge="Ready",copy="Walls must be fully repaired, with no incoming attack and no other building project.";
 if(model.level===0)title="Ready to build";
 if(model.level===10){title="Infirmary complete";badge="Maximum level";copy="All ten Infirmary levels are complete. Its benefit continues to support this Tower.";}
 else if(project){title=active?(paused?`Level ${project.target} upgrade paused`:`Building Level ${project.target}`):"Another building is underway";badge=paused?"Paused":active?"In progress":"Training Grounds";copy=reason();}
 else if(model.pending){title="Starting construction…";badge="Pending";copy="Confirming the sample upgrade. The completed level stays active.";}
 else if(blocked){title=model.sample==="member"?"Officer approval required":model.attack?"Incoming attack":model.integrity<100?"Walls need repair":model.treasury===null?"Treasury unavailable":"More Gold needed";badge="Unavailable";copy=reason();}
 if(model.failed){title="Upgrade could not start";badge="Try again";copy=model.feedback;}
 const conditions=!project&&model.level<10?`<div class="conditions"><span class="${model.integrity<100?"unmet":""}">Walls ${model.integrity}%</span><span class="${model.attack?"unmet":""}">${model.attack?"Attack incoming":"No incoming attack"}</span></div>`:"";
 return `<section class="project-card ${model.failed?"error":paused?"paused":blocked?"blocked":""}" aria-label="Construction status"><div class="project-heading"><h3>${title}</h3><span class="state-badge">${badge}</span></div><p>${copy}</p>${project?`<div class="progress" role="progressbar" aria-label="${active?"Infirmary":"Training Grounds"} construction" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(progress())}"><span style="--progress:${progress()}%"></span></div><div class="project-stats"><span>${paused?"Work preserved":"Work completed"} · <b id="progressPercent">${Math.floor(progress())}%</b></span><span>${paused?"Paused · ":""}<b data-project-time></b> remaining</span></div>`:""}${conditions}${model.treasury===null?'<button class="retry" data-retry>Retry balance</button>':""}</section>`;
}
function renderLevels(){
 $("#levelsPanel").innerHTML=`<h2 class="section-heading">The ten Infirmary levels</h2><p class="section-intro">Each completed level adds 1.5 percentage points of defender recovery.</p><table class="levels-table"><thead><tr><th scope="col">Level</th><th scope="col">Recovery bonus</th><th scope="col">Treasury Gold</th><th scope="col">Build time</th></tr></thead><tbody>${Array.from({length:10},(_,index)=>{const level=index+1;return`<tr class="${level===model.level?"current":level===model.level+1?"next":""}"><td>${level}<span class="row-state">${level===model.level?"Current":level===model.level+1?"Next":""}</span></td><td>+${B.bonus("infirmary",level)}%</td><td>${number(B.cost(level))}</td><td>${time(B.duration(level))}</td></tr>`;}).join("")}</tbody></table><p class="level-footnote">Costs are paid upfront from Clan Treasury for each level. Recovery combines with each defender’s Field Medics and gear, up to 90% in total.</p>`;
}
function renderFooter(){
 const next=Math.min(10,model.level+1),active=model.project?.building==="infirmary",maximum=model.level===10,paused=active&&model.project.paused;
 $("#upgradeFacts").innerHTML=maximum?'<div><dt>Infirmary completed</dt><dd>Level 10 / 10</dd></div><div><dt>Defender recovery bonus</dt><dd>+15%</dd></div>':`<div><dt>${active?"Gold paid":model.level?`Level ${next} cost`:"Level 1 cost"}</dt><dd id="upgradeCost">${money(B.cost(next))}</dd></div><div><dt>${active?paused?"Work remaining":"Time remaining":"Construction time"}</dt><dd ${active?"data-project-time":""}>${active?"":time(B.duration(next))}</dd></div>`;
 const button=$("#upgrade"),blocked=Boolean(reason());button.disabled=blocked||model.pending;
 button.textContent=maximum?"Maximum level":model.pending?"Starting…":active?paused?"Upgrade paused":"Upgrade in progress":model.project?"Building project active":!model.manager?"Leader / Officer only":model.attack?"Attack incoming":model.integrity<100?"Repair walls first":model.treasury===null?"Balance unavailable":blocked?"Not enough Gold":model.level?`Upgrade to Level ${next}`:"Build Level 1";
 $("#upgradeNote").textContent=model.failed?model.feedback:reason()||"Paid upfront from Clan Treasury. One building project per Tower. Construction cannot be canceled.";$("#upgradeNote").className=model.failed?"error":"";
}
function section(id){model.section=id==="levels"?"levels":"overview";document.querySelectorAll("[data-section]").forEach(button=>{const active=button.dataset.section===model.section;button.setAttribute("aria-selected",String(active));button.tabIndex=active?0:-1;});$("#overviewPanel").hidden=model.section!=="overview";$("#levelsPanel").hidden=model.section!=="levels";}
function startUpgrade(){
 if(reason()||model.pending)return;
 const token=epoch,shouldFail=model.failOnce;model.failOnce=false;model.pending=true;model.failed=false;model.feedback="";renderOverview();renderFooter();section("overview");$("#overviewPanel").scrollTop=0;notify("Starting a sample upgrade…");
 requestTimer=setTimeout(()=>{
  if(token!==epoch)return;model.pending=false;
  if(shouldFail){model.failed=true;model.feedback="No Gold was spent. Construction could not start. Please try again.";}
  else{const target=model.level+1,total=B.duration(target);model.treasury-=B.cost(target);model.project={building:"infirmary",target,total,remaining:total,end:Date.now()+total,paused:false};model.feedback="Sample construction started. The current benefit remains active.";}
  render();notify(model.feedback);
 },450);
}
function tick(){
 const project=model?.project;if(!project)return;
 if(!project.paused&&project.end<=Date.now()){if(project.building==="infirmary")model.level=project.target;model.project=null;render();notify("Sample construction completed.");return;}
 const remaining=project.paused?project.remaining:Math.max(0,project.end-Date.now());document.querySelectorAll("[data-project-time]").forEach(node=>node.textContent=time(remaining));
 const bar=$(".progress");if(bar){bar.setAttribute("aria-valuenow",String(Math.floor(progress())));bar.firstElementChild.style.setProperty("--progress",progress()+"%");$("#progressPercent").textContent=Math.floor(progress())+"%";}
}
function close(){epoch++;clearTimeout(requestTimer);model.pending=false;dialog.close();$("#dismissed").hidden=false;notify("Infirmary preview closed.");}
$("#upgrade").addEventListener("click",startUpgrade);$("#closeInfirmary").addEventListener("click",close);dialog.addEventListener("cancel",event=>{event.preventDefault();close();});$("#reopen").addEventListener("click",()=>{$("#dismissed").hidden=true;render();dialog.showModal();});
document.querySelectorAll("[data-section]").forEach(button=>button.addEventListener("click",()=>section(button.dataset.section)));
$(".infirmary-tabs").addEventListener("keydown",event=>{if(!event.target.closest("[data-section]")||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();section(event.key==="Home"?"overview":event.key==="End"?"levels":model.section==="overview"?"levels":"overview");$("#tab-"+model.section).focus();});
$("#overviewPanel").addEventListener("click",event=>{if(event.target.closest("[data-retry]")){model.treasury=4260000000;model.sample="ready";render();notify("Sample Treasury balance restored.");}});
$("#overviewPanel").addEventListener("change",event=>{if(event.target.id==="exampleBase")renderExample();});
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="infirmary-review")reset(event.data.level,event.data.sample);});
setInterval(()=>{if(dialog.open)tick();},1000);
const query=new URLSearchParams(location.search);reset(query.has("level")?Number(query.get("level")):4,query.get("sample")||"ready");document.documentElement.dataset.infirmaryReady="true";
