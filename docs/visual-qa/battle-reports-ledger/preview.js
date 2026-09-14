"use strict";
// Design examples only. No game imports, storage, networking, or account mutations.
const iconFile = "docs/visual-qa/battle-reports-ledger/icons.svg";
const dialog = document.getElementById("reportsDialog");
const list = document.getElementById("reportList");
const baseReports = [
  {id:"r1",type:"scout",label:"Scout",tone:"scout",city:"Ravenwatch",level:16,troops:"14.2K",troopLabel:"reported",ruler:"Lady Maeve",flag:"cross",color:"#66704f",age:"1 min ago",expiry:"8m 42s",new:true},
  {id:"r2",type:"attack",label:"Victory",tone:"victory",city:"Thornfield",level:18,troops:"35K",troopLabel:"sent",ruler:"Lord Edric",flag:"crown",color:"#783f3c",age:"3 min ago",new:true},
  {id:"r3",type:"defense",label:"Victory",tone:"victory",city:"Greenwood",level:22,troops:"24K",troopLabel:"sent",ruler:"Thane Rowan",flag:"cross",color:"#57676b",age:"6 min ago",new:true},
  {id:"r4",type:"scout",label:"You were scouted",tone:"scout",city:"Willowmere",level:12,troops:"1",troopLabel:"troops seen",ruler:"Lady Elinor",flag:"crown",color:"#8a7550",age:"8 min ago"},
  {id:"r5",type:"attack",label:"Defeat",tone:"defeat",city:"Blackhollow",level:29,troops:"21K",troopLabel:"sent",ruler:"Lord Osric",flag:"cross",color:"#854c46",age:"11 min ago"},
  {id:"r6",type:"attack",label:"Breach",tone:"victory",city:"Stonegate",level:31,troops:"46K",troopLabel:"sent",ruler:"Lady Isolde",flag:"crown",color:"#626b49",age:"18 min ago"},
  {id:"r7",type:"attack",label:"Victory",tone:"victory",city:"Warband Camp",camp:true,troops:"8.5K",troopLabel:"sent",ruler:"Neutral",age:"24 min ago"},
  {id:"r8",type:"defense",label:"Defeat",tone:"defeat",city:"Oakbridge",level:14,troops:"18K",troopLabel:"sent",ruler:"Lord Alaric",flag:"cross",color:"#60557b",age:"42 min ago"},
  {id:"r9",type:"defense",label:"Victory",tone:"victory",city:"Briarford",level:20,troops:"32.5K",troopLabel:"sent",ruler:"Lady Beatrice",flag:"crown",color:"#717f59",age:"1 hour ago"},
];
const specialReports = [
  {...baseReports[0],id:"s1",age:"9 min ago",expiry:"0m 34s",urgent:true},
  {...baseReports[1],id:"s2",label:"Damaged",tone:"defeat",age:"12 min ago"},
  {...baseReports[2],id:"s3",label:"City lost",tone:"defeat",age:"17 min ago"},
  {...baseReports[3],id:"s4",type:"defense",label:"Breached",tone:"defeat",troops:"17K",troopLabel:"sent",age:"21 min ago"},
  {...baseReports[4],id:"s5",label:"Raid",age:"28 min ago"},
  {...baseReports[5],id:"s6",label:"Handoff warning",tone:"defeat",age:"35 min ago"},
  {...baseReports[6],id:"s7",label:"Final warning",tone:"defeat",age:"48 min ago"},
  {...baseReports[8],id:"s8",city:"Unavailable target",ruler:"Unknown",flag:null,unavailable:true,age:"2 hours ago"},
];
const events = [
  {id:"e1",title:"A new king rises",age:"4 min ago",art:"assets/optimized/crown-citadel-384x384-a23c30392f3c.webp",objective:"Crown Citadel",location:"The Crown Marches",herald:"Hear ye! Hear ye! Let it be proclaimed throughout Crownlands!",attacker:"Aldric",attackerClan:"The Ashen Stag",defender:"Osric",defenderClan:"Iron Oath",citadel:true},
  {id:"e2",title:"The Defense Stronghold has fallen",age:"18 min ago",art:"assets/optimized/stronghold-defense-384x384-6bee2f3ace80.webp",objective:"Ironwatch · Defense Stronghold",location:"Ironwatch",herald:"Hear ye, Lords of the Realm!",attacker:"Lady Maeve",attackerClan:"The Ashen Stag",defender:"Thane Rowan",defenderClan:"Silver Branch",type:"Defense Stronghold"},
  {id:"e3",title:"The Gold Stronghold has fallen",age:"43 min ago",art:"assets/optimized/stronghold-gold-384x384-27daf74041f8.webp",objective:"Aurum Keep · Gold Stronghold",location:"Aurum Keep",herald:"Hear ye, Lords of the Realm!",attacker:"Lady Elinor",attackerClan:"House Wren",type:"Gold Stronghold"},
];
const types = [{key:"all",label:"All",icon:"dispatch",title:"All dispatches"},{key:"attack",label:"Attack",icon:"attack",title:"Attack reports"},{key:"defense",label:"Defense",icon:"defense",title:"Defense reports"},{key:"scout",label:"Scout",icon:"scout",title:"Scout reports"},{key:"realm",label:"Realm Activity",icon:"realm",title:"Proclamations of the realm"}];
let sample = "standard", filter = "all", newVisit = true, sync = "ready", reports = [], retryTimer;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function art(id, className="", attributes="aria-hidden=\"true\"") { return `<svg class="${className}" ${attributes}><use href="${iconFile}#${id}"></use></svg>`; }
function tell(message) { document.getElementById("liveStatus").textContent=message; window.parent.postMessage({type:"reports-review-status",message},location.origin); }
function identity(name, kind="ruler") { return `<button class="name-link" data-action="${kind}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`; }
function row(report) {
  const isNew = newVisit && report.new;
  return `<article class="report-row ${report.tone}${isNew ? " new" : ""}" data-report-id="${report.id}" aria-label="${escapeHtml(report.label+': '+report.city)}">
    <div class="report-result">${art(report.type === "defense" && report.tone === "defeat" ? "defense-defeat" : report.type,"report-art")}<div class="result-copy"><div class="result-line"><strong class="outcome">${escapeHtml(report.label)}</strong>${isNew ? '<span class="new-tag">New</span>' : ""}</div><span class="time">${escapeHtml(report.age)}${report.expiry ? `<span class="expiry${report.urgent ? " urgent" : ""}">Expires in ${escapeHtml(report.expiry)}</span>` : ""}</span></div></div>
    <div class="target"><span class="target-meta">${report.camp ? "Camp" : "Lv "+report.level}</span><strong>${escapeHtml(report.city)}</strong></div>
    <div class="troops"><strong>${escapeHtml(report.troops)}</strong><small>${escapeHtml(report.troopLabel)}</small></div>
    <div class="ruler">${report.flag ? art("flag-"+report.flag,"flag",`role="img" aria-label="${escapeHtml(report.ruler)} kingdom flag" style="color:${report.color}"`) : ""}${report.flag ? identity(report.ruler) : `<span class="name-link">${escapeHtml(report.ruler)}</span>`}</div>
    <div class="actions"><button class="row-action" data-action="map" data-name="${escapeHtml(report.city)}" aria-label="${report.unavailable ? "Target unavailable" : "Go to "+escapeHtml(report.city)}" title="${report.unavailable ? "Target unavailable" : "View location"}" ${report.unavailable ? "disabled" : ""}>${art("map")}</button><button class="row-action open" data-action="report" data-name="${escapeHtml(report.city)}" aria-label="View full report for ${escapeHtml(report.city)}" title="View full report">${art("open")}</button></div>
  </article>`;
}
function participant(name, clan) { return identity(name)+(clan ? ` of ${identity(clan,"clan")}` : ""); }
function proclamation(event) {
  const attacker=participant(event.attacker,event.attackerClan), defender=event.defender ? participant(event.defender,event.defenderClan) : "";
  const body=event.citadel ? `${attacker} has stormed the Crown Citadel, overthrown King ${defender}, and claimed the throne.` : defender ? `${attacker} has overthrown ${defender} and seized control of the ${event.type}.` : `${attacker} has seized the unclaimed ${event.type}.`;
  return `<article class="activity-card"><img class="objective-art" src="${event.art}" alt="" draggable="false"><header class="activity-head"><h3>${escapeHtml(event.title)}</h3><time>${event.age}</time></header><div class="proclamation"><p class="herald">${event.herald}</p><p>${body}</p><p class="closing">${event.citadel ? `All hail King ${identity(event.attacker)}, ruler of Crownlands!` : "A new banner now flies above its walls."}</p></div><footer class="activity-foot"><span><b>Objective</b>${event.objective}</span><span><b>Location</b>${event.location}</span><button class="location-button" data-action="map" data-name="${event.objective}">View Location</button></footer></article>`;
}
function render() {
  const available = types.filter(t=>sample!=="no-realm"||t.key!=="realm");
  document.getElementById("filters").innerHTML = available.map(t=>`<button type="button" data-filter="${t.key}" aria-pressed="${t.key===filter}">${art(t.icon)}<span>${t.label}</span></button>`).join("");
  const isRealm=filter==="realm", shown=isRealm ? (sample==="empty" ? [] : events) : reports.filter(r=>filter==="all"||r.type===filter);
  document.getElementById("listTitle").textContent=types.find(t=>t.key===filter).title;
  document.getElementById("count").textContent=`${shown.length} ${isRealm ? "proclamations" : "reports"} · newest first`;
  const arrivals = !isRealm && newVisit ? shown.filter(r=>r.new).length : 0;
  document.getElementById("arrivalNote").textContent=arrivals ? `${arrivals} new this visit` : "";
  document.getElementById("mobileSummary").textContent=`${shown.length} ${isRealm ? "proclamations" : "reports"} · newest first${arrivals ? ` · ${arrivals} new` : ""}`;
  document.getElementById("columnLabels").hidden=isRealm;
  document.getElementById("syncBanner").hidden=isRealm||sync==="ready";
  document.getElementById("syncMessage").textContent=sync==="loading" ? "Loading reports…" : "Reports reconnecting. Saved reports are still available.";
  document.getElementById("retry").disabled=sync==="loading";
  document.getElementById("retention").textContent=isRealm ? "Stronghold & Crown Citadel captures" : "Battle reports · 24 hours";
  document.getElementById("footerNote").textContent=isRealm ? "Realm Activity" : "Scout intelligence · 10 minutes";
  list.setAttribute("aria-label",isRealm ? "Realm activity list" : "Battle report list");
  if(shown.length) list.innerHTML=shown.map(isRealm ? proclamation : row).join("");
  else {
    const waiting=!isRealm&&sync!=="ready";
    const heading=waiting ? "Waiting for reports to sync." : isRealm ? "No Realm Activity yet." : `No ${filter==="all" ? "battle" : filter} reports yet.`;
    const explanation=waiting ? "Your dispatches will appear when the connection is restored." : isRealm ? "Major Stronghold and Crown Citadel captures will be recorded here." : "Battle and scouting dispatches will appear here as they arrive.";
    list.innerHTML=`<div class="empty">${art(isRealm ? "realm" : "dispatch")}<h3>${heading}</h3><p>${explanation}</p></div>`;
  }
}
function reset(next) {
  clearTimeout(retryTimer); sample=next||"standard"; filter=sample==="realm" ? "realm" : "all"; newVisit=true;
  sync=sample==="loading" ? "loading" : sample==="reconnecting" ? "reconnecting" : "ready";
  reports=(sample==="empty"||sample==="loading" ? [] : sample==="outcomes" ? specialReports : baseReports).map(r=>({...r}));
  if(sample==="long") reports=reports.map((r,i)=>({...r,city:i===0 ? "The Watchtower of Saint Bartholomew" : r.city,ruler:i===0 ? "Lady Eleonora of the Northern Marches" : r.ruler,troops:i<3 ? ["1.28M","842.5K","999.9K"][i] : r.troops}));
  render();list.scrollTop=0;if(!dialog.open)dialog.showModal();
}
document.getElementById("filters").addEventListener("click",event=>{
  const button=event.target.closest("[data-filter]");if(!button)return;
  filter=button.dataset.filter;render();list.scrollTop=0;
  document.querySelector(`[data-filter="${filter}"]`).focus();
  tell(`${types.find(t=>t.key===filter).label} selected. Displaying example ${filter==="realm" ? "proclamations" : "reports"}.`);
});
list.addEventListener("click",event=>{
  const button=event.target.closest("[data-action]");if(!button||button.disabled)return;
  const labels={map:"View map location",report:"Open full report",ruler:"Open ruler profile",clan:"Open clan profile"};
  list.querySelectorAll(".selected").forEach(row=>row.classList.remove("selected"));button.closest(".report-row")?.classList.add("selected");
  tell(`${labels[button.dataset.action]}: ${button.dataset.name}. Preview navigation only; no game state changed.`);
});
document.getElementById("retry").addEventListener("click",()=>{
  sync="loading";render();tell("Retrying the example report connection…");
  retryTimer=setTimeout(()=>{sync="ready";render();list.focus();tell("Example connection restored; saved reports retained.");},650);
});
document.getElementById("close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>{newVisit=false;document.getElementById("reopen").focus();tell("Reports closed. Reopen to review the already-viewed list.");});
document.getElementById("reopen").addEventListener("click",()=>{render();dialog.showModal();});
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===window.parent&&event.data?.type==="reports-review")reset(event.data.sample);});
reset("standard");
