"use strict";
const $ = id => document.getElementById(id), number = value => Number(value).toLocaleString("en-US");
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const heraldry = CrownlandsClanHeraldryRenderer.create({config:CrownlandsClanHeraldryConfig,assets:CrownlandsClanHeraldryAssets,legacyRenderer:CrownlandsClanHeraldryLegacyV1});
const icons = {troops:"assets/icons/daily-login-troops-r1.svg",walls:"assets/icons/skills/stoneworks.svg",defense:"assets/icons/skills/shieldwallDiscipline.svg"};
let holdingKey = "gold", hold = STRONGHOLD_DEFINITIONS[holdingKey];
let sample = "owned", fixture = strongholdDetailFixture(sample,hold), section = "overview", actionOrigin = null;
function status(message) { parent.postMessage({type:"stronghold-status",message,section},location.origin); }
function link(name,kind="profile") { return `<button class="name-link" data-preview-action="${kind}" data-name="${esc(name)}">${esc(name)}</button>`; }
function rulerMark() { return '<span class="ruler-mark" aria-hidden="true"><img src="assets/flag-symbols/selected/svg/lion.svg" alt=""></span>'; }
function duration(seconds) { const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60); return `${h}h ${String(m).padStart(2,"0")}m`; }
function metric(label,value,help="",className="") { return `<div class="metric-row"><div><span>${label}</span>${help?`<small>${help}</small>`:""}</div><strong class="${className}">${value}</strong></div>`; }
function identityMarkup(f) {
 return `<div class="keep-illustration"><span class="keep-level"><small>Defense level</small><strong>${hold.level}</strong></span><img src="${hold.art}" alt="${esc(hold.artDescription)}"><span class="keep-caption">${esc(hold.name)} · The Core</span></div>
  <div class="ownership-record"><div class="ruler-entry">${rulerMark()}<div><small>Owner${f.owned?" · You":""}</small>${f.neutral?`<span class="plain-owner">${f.owner}</span>`:link(f.owner)}</div></div>
  <div class="ruler-entry"><span class="heraldry-slot" id="clanHeraldry" aria-hidden="true"></span><div><small>Holding clan</small>${f.clan?link(`[${f.tag}] ${f.clan}`,"clan"):'<span class="plain-owner">No clan</span>'}</div></div></div>
  <div class="holding-tag">${f.owned?'Garrison limit <strong>Unlimited</strong>':`Intelligence <strong>${f.ally?"Clan shared":f.scouted?"Scouted":"Unscouted"}</strong>`}</div>`;
}
function benefitMarkup(f) {
 return `<section class="holding-benefit" aria-label="${esc(hold.kind)} bonus"><img src="${hold.icon}" alt=""><div class="benefit-heading"><p class="eyebrow">${f.owned?"Controlled bonus":"Stronghold bonus"}</p><h2>${hold.label}</h2></div><div class="benefit-rate"><strong>+${hold.directPercent}%</strong><small>Controller</small></div><div class="benefit-rate shared"><strong>+${hold.clanPercent}%</strong><small>Clanmates</small></div></section>`;
}
function benefitDetailsMarkup(f) {
 return `<p class="bonus-copy">The controller receives <strong>${hold.directPercent}%</strong>; current clanmates receive <strong>${hold.clanPercent}%</strong>, subject to Citadel precedence.</p>
  ${f.owned?`<div class="benefit-note"><strong>Your active objective benefit</strong><p>${hold.kind} +${hold.directPercent}%</p><small>Citadel precedence is applied by the server.</small></div>`:""}
  <div class="benefit-note"><strong>Effect target · ${hold.target}</strong><small>${hold.help}</small></div>`;
}
function wallMarkup(f) {
 return `<div class="wall-overview ${f.damaged?"damaged":""}"><img src="${icons.walls}" alt=""><div><div class="wall-heading"><span>Wall integrity</span><strong>${f.integrity}% · ${f.damaged?"Damaged":"Intact"}</strong></div><div class="integrity-track" style="--integrity:${f.integrity}%" aria-hidden="true"><span></span></div><small>${f.damaged?"Full repair in 12m 00s":"Fully repaired"}</small></div></div>`;
}
function supportMarkup(f) {
 if(!f.owned&&!f.ally)return "";
 return `<section class="support-panel"><div class="support-heading"><h2>Clan reinforcements</h2><strong>${number(f.support.reduce((sum,row)=>sum+row.troops,0))} troops</strong></div>
  ${f.support.map((row,i)=>`<article class="support-row"><div>${row.name==="Your troops"?"<strong>Your troops</strong>":link(row.name)}<small>${number(row.troops)} stationed</small></div><button class="small-button" data-preview-action="support" data-support="${i}">${row.action}</button></article>`).join("")||`<p class="empty-support">${f.owned?"No allied troops are stationed here.":"You have no troops stationed at this allied holding."}</p>`}
  <p class="support-help">${f.owned?"These troops stay at this holding until their sender recalls them, you send them home, or they are lost in battle.":"Your troops stay at this holding until you recall them, the holding owner sends them home, or they are lost in battle."}</p></section>`;
}
function detailsMarkup(f) {
 const total = f.owned ? number(f.totalDefense) : f.scouted ? `${number(f.baseDefense)} <b>+ ${number(f.totalDefense-f.baseDefense)}</b>` : "Unknown";
 return `${benefitMarkup(f)}<div class="strength-overview"><article class="strength-card"><img src="${icons.troops}" alt=""><div><h2>${f.owned?"Troops stationed":"Troops"}</h2><strong>${f.visibleTroops?number(f.troops):"Unknown"}</strong><small>${f.owned?"Owner garrison":f.ally?"Shared by your clan":f.scouted?"Scout report":"Scout required"}</small></div></article><article class="strength-card"><img src="${icons.defense}" alt=""><div><h2>${f.owned?"Estimated defense":"Total defense"}</h2><strong class="${f.scouted?"scouted-pair":""}">${total}</strong><small>${f.owned?"Walls + owner garrison":f.scouted?"Report · base + bonus":"Scout required"}</small></div></article></div>
  ${wallMarkup(f)}
  <div class="overview-disclosures"><details class="detail-fold"><summary><span>Defense &amp; repair</span><small>Wall power · bonuses</small></summary><div class="fold-content">
  ${f.owned?`<p>Estimated live defense combines current wall power with locally estimated owner garrison defense. Allied reinforcements are listed separately.</p>${f.objectiveDefensePercent?`<p>Includes ${hold.kind} +${f.objectiveDefensePercent}% on the owner's defending soldiers. Wall power is unchanged.</p>`:""}<p>Station as many troops as you can send.</p>`:f.ally?'<p>Exact owner troops are shared by your clan.</p>':f.scouted?'<p>Garrison and defense reflect your latest scout report.</p>':'<p>A scout report is needed to reveal the current garrison and total defense.</p>'}
  ${metric("Wall power",f.powerVisible?`${number(f.wallPower)} / ${number(f.fullWalls)}`:"Unknown","Walls absorb attack power before the garrison fights.","stat-pair")}
  ${f.owned?metric("Wall level",String(hold.level),"Sets this objective's base wall and repair time")+metric("City walls",`${number(hold.baseWalls)} <b>+ ${number(f.fullWalls-hold.baseWalls)}</b>`,"Stoneworks +12% · Gear wall strength +4%","stat-pair"):""}
  <p>Full-breach repair window <strong>30m 00s</strong>.${f.damaged?" Hits add proportional time. Ownership handoffs preserve the deadline.":""}</p></div></details>
  <details class="detail-fold"><summary><span>Holding benefits</span><small>${hold.subject} · clan sharing</small></summary><div class="fold-content">${benefitDetailsMarkup(f)}</div></details></div>
  ${f.neutral?`<div class="access-note neutral-note"><strong>Neutral base · ${number(hold.neutralStartingTroops)}</strong>One-time starting defenders. This is not the current garrison.</div>`:""}
  ${f.ally?'<div class="access-note"><strong>Clan Ally · Garrison shared by clan</strong>Scout and Attack are disabled. You may send clan reinforcements. Exact owner troops are live; defense bonuses and reinforcement details remain private.</div>':!f.owned?`<div class="access-note scout-note"><strong>${f.scouted?"Scout report expires in 7m 43s":"Scout report · Not available"}</strong>${f.scouted?"Defense values reflect the report snapshot.":"Current troop and total defense values remain unknown."}</div>`:""}
  ${supportMarkup(f)}`;
}
function legacyMarkup(f) {
 const state = f.legacyStatus;
 if(state!=="ready") {
  const copy = {loading:["Reading the Stronghold Legacy","Loading this Stronghold's holding-time rankings…"],error:["Stronghold Legacy unavailable","The Stronghold Legacy could not be loaded right now."],empty:["The legacy is yet to be written","No ruler has held this Stronghold yet."]}[state];
  return `<div class="legacy-state" role="status"><img src="${hold.icon}" alt=""><h2>${copy[0]}</h2><p>${copy[1]}</p></div>`;
 }
 return `<div class="legacy-intro"><img src="${hold.icon}" alt=""><div><h2>The Stronghold Legacy</h2><p>Cumulative time held at ${esc(hold.name)}. The current holder's time continues rising until control changes.</p></div></div>
  <div class="legacy-columns"><span>Rank</span><span>Ruler</span><span>Time held</span></div><div class="legacy-list" tabindex="0" aria-label="Stronghold holding-time rankings">${strongholdLegacyFixture(f).map(row=>`<article class="legacy-row ${row.current?"current":""}"><span class="legacy-rank">#${row.rank}</span><div class="legacy-ruler">${rulerMark()}<div>${link(row.name)}${row.current?"<small>Current holder</small>":""}</div></div><strong class="legacy-time">${duration(row.seconds)}</strong></article>`).join("")}</div>`;
}
function footerMarkup(f) {
 if(section==="legacy")return `<p class="footer-note"><strong>${esc(hold.name)} · Stronghold Legacy</strong><br>Scores are cumulative for this Stronghold. Its current holder continues adding time.</p>`;
 if(!f.owned)return `<p class="footer-note"><strong>${f.ally?"Clan ally holding":f.neutral?"Neutral Stronghold":"Foreign Stronghold"}</strong><br>${f.ally?"Your stationed reinforcements can be recalled from the support section.":"Scout reports govern private troop and defense information."}</p>`;
 return `<div class="management-copy"><strong>${f.cooldown?"Daily allowance used":"Holding management"}</strong><small>${f.cooldown?"Resets in 06h 24m at 00:00 UTC.":"One relinquishment available · Resets 00:00 UTC"}</small></div><button class="relinquish-button" data-preview-action="relinquish" ${f.cooldown?"disabled":""}>${f.cooldown?"Available in 06h 24m":"Relinquish Castle"}</button>`;
}
function render() {
 fixture = strongholdDetailFixture(sample,hold);
 document.title = `${hold.name} preview`;
 document.querySelector('.holding-shell').dataset.holding = holdingKey;
 $("strongholdTitle").textContent=hold.name;
 $("strongholdKind").textContent=hold.kind.toUpperCase();
 $("strongholdSeal").src=hold.icon;
 $("close").setAttribute("aria-label",`Close ${hold.kind}`);
 $("informationTabs").setAttribute("aria-label",`${hold.name} information`);
 $("regionNote").textContent=`${hold.name} · The Core`;
 $("reopen").textContent=`Open ${hold.name}`;
 $("dismissAction").textContent=`Back to ${hold.name}`;
 $("ownership").textContent=fixture.owned?"Under your control":fixture.ally?"Clan ally":fixture.neutral?"Neutral defenders":"Foreign holding";
 $("ownership").className=`ownership ${fixture.neutral?"neutral":!fixture.owned&&!fixture.ally?"enemy":""}`;
 $("identity").innerHTML=identityMarkup(fixture); $("details").innerHTML=detailsMarkup(fixture); $("legacyPanel").innerHTML=legacyMarkup(fixture);
 if(fixture.clan)heraldry.render($("clanHeraldry"),{...CrownlandsClanHeraldryConfig.DEFAULT_V2,division:"solid",primary:fixture.owned||fixture.ally?"#596346":"#794438",charge:fixture.owned||fixture.ally?"lion":"dragon",chargeColor:"#eee1bd",borderColor:"#b5a078",finish:"weathered"},{width:34,variant:"micro",label:`${fixture.clan} heraldry`});
 else $("clanHeraldry").hidden=true;
 setSection(section);
}
function setSection(next,focus=false) {
 section=next; document.querySelectorAll("[data-tab]").forEach(tab=>{const active=tab.dataset.tab===section;tab.setAttribute("aria-selected",String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();});
 document.querySelector('.holding-shell').classList.toggle('overview-active',section==="overview");
 $("overviewPanel").hidden=section!=="overview";$("legacyPanel").hidden=section!=="legacy";$("actions").innerHTML=footerMarkup(fixture);$("actions").classList.toggle("legacy-footer",section==="legacy");
 status(section==="legacy"?"Stronghold Legacy preview. Holding times are fictional and frozen for review.":"Overview redesign. Expand Defense & repair or Holding benefits for the full breakdown.");
}
function previewAction(button) {
 const action=button.dataset.previewAction;actionOrigin=button;
 let title="",copy="";
 if(action==="profile"||action==="clan") {title=button.dataset.name;copy=`In the game this opens the ${action==="clan"?"clan":"ruler"} profile. Return to review the Stronghold.`;}
 if(action==="relinquish") {title=`Relinquish ${hold.name}`;copy="The game asks for confirmation, marches stationed troops to the nearest friendly city, and makes the Stronghold neutral. The one-holding-per-UTC-day allowance is checked by the server.";}
 if(action==="support") {const row=fixture.support[Number(button.dataset.support)];title=row.action;copy=`${number(row.troops)} troops would return to ${row.source}. If the original source is no longer owned, the game chooses the sender's Main City. The game asks for confirmation before returning troops.`;}
 $("actionTitle").textContent=title;$("actionCopy").textContent=copy;$("actionDialog").showModal();$("dismissAction").focus();status(`Local preview: ${title}. No game action was taken.`);
}
document.addEventListener("click",event=>{const tab=event.target.closest("[data-tab]");if(tab){setSection(tab.dataset.tab);return;}const action=event.target.closest("[data-preview-action]");if(action&&!action.disabled)previewAction(action);});
document.querySelector('[role="tablist"]').addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();setSection(event.key==="Home"?"overview":event.key==="End"?"legacy":section==="overview"?"legacy":"overview",true);});
$("dismissAction").addEventListener("click",()=>$("actionDialog").close());$("actionDialog").addEventListener("close",()=>{if(actionOrigin?.isConnected)actionOrigin.focus();});
$("close").addEventListener("click",()=>$("strongholdDialog").close());$("strongholdDialog").addEventListener("close",()=>$("reopen").focus());$("reopen").addEventListener("click",()=>{$("strongholdDialog").showModal();$(section==="legacy"?"legacyTab":"overviewTab").focus();});
const samples=["owned","damaged","cooldown","ally","enemy","scouted","neutral","long","legacy-loading","legacy-error","legacy-empty"];
function reset(next="owned",nextHolding=holdingKey) {if($("actionDialog").open)$("actionDialog").close();holdingKey=Object.hasOwn(STRONGHOLD_DEFINITIONS,nextHolding)?nextHolding:"gold";hold=STRONGHOLD_DEFINITIONS[holdingKey];sample=samples.includes(next)?next:"owned";section=sample.startsWith("legacy-")?"legacy":"overview";render();$("identity").scrollTop=0;$("details").scrollTop=0;if(!$("strongholdDialog").open)$("strongholdDialog").showModal();$(section==="legacy"?"legacyTab":"overviewTab").focus();}
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="stronghold-review")reset(event.data.sample,event.data.holding);});
const initialQuery=new URLSearchParams(location.search);
reset(initialQuery.get("sample")||"owned",initialQuery.get("holding")||"gold");
