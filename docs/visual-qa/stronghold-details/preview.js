"use strict";
const $ = id => document.getElementById(id), number = value => Number(value).toLocaleString("en-US");
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const heraldry = CrownlandsClanHeraldryRenderer.create({config:CrownlandsClanHeraldryConfig,assets:CrownlandsClanHeraldryAssets,legacyRenderer:CrownlandsClanHeraldryLegacyV1});
const icons = {gold:GOLD_HOLD.icon,troops:"assets/icons/daily-login-troops-r1.svg",walls:"assets/icons/skills/stoneworks.svg",defense:"assets/icons/skills/shieldwallDiscipline.svg"};
let sample = "owned", fixture = goldDetailFixture(sample), section = "overview", actionOrigin = null;
function status(message) { parent.postMessage({type:"stronghold-status",message,section},location.origin); }
function link(name,kind="profile") { return `<button class="name-link" data-preview-action="${kind}" data-name="${esc(name)}">${esc(name)}</button>`; }
function rulerMark() { return '<span class="ruler-mark" aria-hidden="true"><img src="assets/flag-symbols/selected/svg/lion.svg" alt=""></span>'; }
function duration(seconds) { const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60); return `${h}h ${String(m).padStart(2,"0")}m`; }
function metric(label,value,help="",className="") { return `<div class="metric-row"><div><span>${label}</span>${help?`<small>${help}</small>`:""}</div><strong class="${className}">${value}</strong></div>`; }
function identityMarkup(f) {
 return `<div class="fortress-plate"><img class="fortress-art" src="${GOLD_HOLD.art}" alt="Aurum Keep's stone fortress with three towers and a walled courtyard"><span class="art-caption">Aurum Keep · Gold Stronghold</span></div>
  <div class="identity-line">${rulerMark()}<div><small>Owner${f.owned?" · You":""}</small>${f.neutral?`<span class="plain-owner">${f.owner}</span>`:link(f.owner)}</div></div>
  <div class="identity-line"><span class="heraldry-slot" id="clanHeraldry" aria-hidden="true"></span><div><small>Holding clan</small>${f.clan?link(`[${f.tag}] ${f.clan}`,"clan"):'<span class="plain-owner">No clan</span>'}</div></div>
  <div class="garrison-card"><img src="${icons.troops}" alt=""><div><small>${f.owned?"Troops stationed":"Troops"}</small><strong>${f.visibleTroops?number(f.troops):"Unknown"}</strong></div></div>
  <div class="identity-facts"><div><small>Defense level</small><strong>${GOLD_HOLD.level}</strong></div>${f.owned?'<div><small>Garrison limit</small><strong>Unlimited</strong></div>':`<div><small>Intelligence</small><strong>${f.ally?"Clan shared":f.scouted?"Scouted":"Unscouted"}</strong></div>`}</div>
  <p class="identity-help">${f.owned?"Station as many troops as you can send.":f.ally?"Exact owner troops are shared by your clan.":f.scouted?"Garrison reflects your latest scout report.":"A scout report is needed to reveal the current garrison."}</p>`;
}
function benefitMarkup(f) {
 return `<div class="bonus-banner"><img src="${icons.gold}" alt=""><div><p class="eyebrow">${f.owned?"Controlled bonus":"Stronghold bonus"}</p><div class="bonus-main"><strong>+8%</strong><h2>Base gold production</h2></div></div></div>`;
}
function benefitDetailsMarkup(f) {
 return `<p class="bonus-copy">The controller receives <strong>8%</strong>; current clanmates receive <strong>4%</strong>, subject to Citadel precedence.</p>
  ${f.owned?'<div class="benefit-note"><strong>Your active objective benefit</strong><p>Gold Stronghold +8%</p><small>Citadel precedence is applied by the server.</small></div>':""}
  ${f.owned?'<div class="benefit-note"><strong>Effect target · Base gold production</strong><small>Boosts owned towns while held.</small></div>':""}`;
}
function wallMarkup(f) {
 return `<div class="fortification ${f.damaged?"damaged":""}"><div class="integrity-heading"><span>Wall integrity</span><strong>${f.integrity}% · ${f.damaged?"Damaged":"Intact"}</strong></div><div class="integrity-track" style="--integrity:${f.integrity}%" aria-hidden="true"><span></span></div>
  <p>${f.powerVisible?`<strong>${number(f.wallPower)} / ${number(f.fullWalls)}</strong> wall power.`:"Wall power requires a scout report."} Walls absorb attack power before the garrison fights.</p>
  <small>${f.damaged?"Full repair in 12m 00s":"Fully repaired · Full-breach repair window 30m 00s"}</small>
  ${f.damaged?'<small>30m 00s full-breach window · Hits add proportional time · Ownership handoffs preserve the deadline.</small>':""}</div>`;
}
function supportMarkup(f) {
 if(!f.owned&&!f.ally)return "";
 return `<section class="support-panel"><div class="support-heading"><h2>Clan reinforcements</h2><strong>${number(f.support.reduce((sum,row)=>sum+row.troops,0))} troops</strong></div>
  ${f.support.map((row,i)=>`<article class="support-row"><div>${row.name==="Your troops"?"<strong>Your troops</strong>":link(row.name)}<small>${number(row.troops)} stationed</small></div><button class="small-button" data-preview-action="support" data-support="${i}">${row.action}</button></article>`).join("")||`<p class="empty-support">${f.owned?"No allied troops are stationed here.":"You have no troops stationed at this allied holding."}</p>`}
  <p class="support-help">${f.owned?"These troops stay at this holding until their sender recalls them, you send them home, or they are lost in battle.":"Your troops stay at this holding until you recall them, the holding owner sends them home, or they are lost in battle."}</p></section>`;
}
function detailsMarkup(f) {
 const total = f.owned ? number(f.totalDefense) : f.scouted ? `${number(f.baseDefense)} <b>+ ${number(f.totalDefense-f.baseDefense)}</b>` : "Unknown";
 return `${benefitMarkup(f)}<div class="section-heading"><img src="${icons.defense}" alt=""><h2>Fortress defenses</h2></div>
  ${metric(f.owned?"Estimated live defense":"Total defense",total,f.owned?"Current wall power plus locally estimated garrison defense":f.scouted?"Base + bonus from the scout report":"Requires a scout report",f.scouted?"stat-pair":"")}
  ${wallMarkup(f)}
  ${f.owned?metric("Wall level",String(GOLD_HOLD.level),"Sets this objective's base wall and repair time")+metric("City walls",`${number(GOLD_HOLD.baseWalls)} <b>+ ${number(f.fullWalls-GOLD_HOLD.baseWalls)}</b>`,"Stoneworks +12% · Gear wall strength +4%","stat-pair"):""}
  ${benefitDetailsMarkup(f)}
  ${f.neutral?`<div class="access-note neutral-note"><strong>Neutral base · ${number(GOLD_HOLD.neutralStartingTroops)}</strong>One-time starting defenders. This is not the current garrison.</div>`:""}
  ${f.ally?'<div class="access-note"><strong>Clan Ally · Garrison shared by clan</strong>Scout and Attack are disabled. You may send clan reinforcements. Exact owner troops are live; defense bonuses and reinforcement details remain private.</div>':!f.owned?`<div class="access-note scout-note"><strong>${f.scouted?"Scout report expires in 7m 43s":"Scout report · Not available"}</strong>${f.scouted?"Defense values reflect the report snapshot.":"Current troop and total defense values remain unknown."}</div>`:""}
  ${supportMarkup(f)}`;
}
function legacyMarkup(f) {
 const state = f.legacyStatus;
 if(state!=="ready") {
  const copy = {loading:["Reading the Stronghold Legacy","Loading this Stronghold's holding-time rankings…"],error:["Stronghold Legacy unavailable","The Stronghold Legacy could not be loaded right now."],empty:["The legacy is yet to be written","No ruler has held this Stronghold yet."]}[state];
  return `<div class="legacy-state" role="status"><img src="${icons.gold}" alt=""><h2>${copy[0]}</h2><p>${copy[1]}</p></div>`;
 }
 return `<div class="legacy-intro"><img src="${icons.gold}" alt=""><div><h2>The Stronghold Legacy</h2><p>Cumulative time held at Aurum Keep. The current holder's time continues rising until control changes.</p></div></div>
  <div class="legacy-columns"><span>Rank</span><span>Ruler</span><span>Time held</span></div><div class="legacy-list" tabindex="0" aria-label="Stronghold holding-time rankings">${goldLegacyFixture(f).map(row=>`<article class="legacy-row ${row.current?"current":""}"><span class="legacy-rank">#${row.rank}</span><div class="legacy-ruler">${rulerMark()}<div>${link(row.name)}${row.current?"<small>Current holder</small>":""}</div></div><strong class="legacy-time">${duration(row.seconds)}</strong></article>`).join("")}</div>`;
}
function footerMarkup(f) {
 if(section==="legacy")return '<p class="footer-note"><strong>Aurum Keep · Stronghold Legacy</strong><br>Scores are cumulative for this Stronghold. Its current holder continues adding time.</p>';
 if(!f.owned)return `<p class="footer-note"><strong>${f.ally?"Clan ally holding":f.neutral?"Neutral Stronghold":"Foreign Stronghold"}</strong><br>${f.ally?"Your stationed reinforcements can be recalled from the support section.":"Scout reports govern private troop and defense information."}</p>`;
 return `<div class="management-copy"><strong>Relinquish Castle</strong><small>March stationed troops to your nearest friendly city and make this city neutral.</small><small>${f.cooldown?"Daily allowance used. Resets in 06h 24m at 00:00 UTC.":"Available now. One holding may be relinquished per UTC day."}</small></div><button class="relinquish-button" data-preview-action="relinquish" ${f.cooldown?"disabled":""}>${f.cooldown?"Available in 06h 24m":"Relinquish Castle"}</button>`;
}
function render() {
 fixture = goldDetailFixture(sample);
 $("ownership").textContent=fixture.owned?"Under your control":fixture.ally?"Clan ally":fixture.neutral?"Neutral defenders":"Foreign holding";
 $("ownership").className=`ownership ${fixture.neutral?"neutral":!fixture.owned&&!fixture.ally?"enemy":""}`;
 $("identity").innerHTML=identityMarkup(fixture); $("details").innerHTML=detailsMarkup(fixture); $("legacyPanel").innerHTML=legacyMarkup(fixture);
 if(fixture.clan)heraldry.render($("clanHeraldry"),{...CrownlandsClanHeraldryConfig.DEFAULT_V2,division:"solid",primary:fixture.owned||fixture.ally?"#596346":"#794438",charge:fixture.owned||fixture.ally?"lion":"dragon",chargeColor:"#eee1bd",borderColor:"#b5a078",finish:"weathered"},{width:34,variant:"micro",label:`${fixture.clan} heraldry`});
 else $("clanHeraldry").hidden=true;
 setSection(section);
}
function setSection(next,focus=false) {
 section=next; document.querySelectorAll("[data-tab]").forEach(tab=>{const active=tab.dataset.tab===section;tab.setAttribute("aria-selected",String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();});
 $("overviewPanel").hidden=section!=="overview";$("legacyPanel").hidden=section!=="legacy";$("actions").innerHTML=footerMarkup(fixture);$("actions").classList.toggle("legacy-footer",section==="legacy");
 status(section==="legacy"?"Stronghold Legacy preview. Holding times are fictional and frozen for review.":"Gold Stronghold overview. Scroll each column to inspect all information.");
}
function previewAction(button) {
 const action=button.dataset.previewAction;actionOrigin=button;
 let title="",copy="";
 if(action==="profile"||action==="clan") {title=button.dataset.name;copy=`In the game this opens the ${action==="clan"?"clan":"ruler"} profile. Return to review the Stronghold.`;}
 if(action==="relinquish") {title="Relinquish Aurum Keep";copy="The game asks for confirmation, marches stationed troops to the nearest friendly city, and makes the Stronghold neutral. The one-holding-per-UTC-day allowance is checked by the server.";}
 if(action==="support") {const row=fixture.support[Number(button.dataset.support)];title=row.action;copy=`${number(row.troops)} troops would return to ${row.source}. If the original source is no longer owned, the game chooses the sender's Main City. The game asks for confirmation before returning troops.`;}
 $("actionTitle").textContent=title;$("actionCopy").textContent=copy;$("actionDialog").showModal();$("dismissAction").focus();status(`Local preview: ${title}. No game action was taken.`);
}
document.addEventListener("click",event=>{const tab=event.target.closest("[data-tab]");if(tab){setSection(tab.dataset.tab);return;}const action=event.target.closest("[data-preview-action]");if(action&&!action.disabled)previewAction(action);});
document.querySelector('[role="tablist"]').addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();setSection(event.key==="Home"?"overview":event.key==="End"?"legacy":section==="overview"?"legacy":"overview",true);});
$("dismissAction").addEventListener("click",()=>$("actionDialog").close());$("actionDialog").addEventListener("close",()=>{if(actionOrigin?.isConnected)actionOrigin.focus();});
$("close").addEventListener("click",()=>$("strongholdDialog").close());$("strongholdDialog").addEventListener("close",()=>$("reopen").focus());$("reopen").addEventListener("click",()=>{$("strongholdDialog").showModal();$(section==="legacy"?"legacyTab":"overviewTab").focus();});
const samples=["owned","damaged","cooldown","ally","enemy","scouted","neutral","long","legacy-loading","legacy-error","legacy-empty"];
function reset(next="owned") {if($("actionDialog").open)$("actionDialog").close();sample=samples.includes(next)?next:"owned";section=sample.startsWith("legacy-")?"legacy":"overview";render();$("identity").scrollTop=0;$("details").scrollTop=0;if(!$("strongholdDialog").open)$("strongholdDialog").showModal();$(section==="legacy"?"legacyTab":"overviewTab").focus();}
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="stronghold-review")reset(event.data.sample);});
reset();
