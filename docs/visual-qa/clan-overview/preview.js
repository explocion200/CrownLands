"use strict";
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const renderer = CrownlandsClanHeraldryRenderer.create({config:CrownlandsClanHeraldryConfig,assets:CrownlandsClanHeraldryAssets,legacyRenderer:CrownlandsClanHeraldryLegacyV1});
const defaultShield = {...CrownlandsClanHeraldryConfig.DEFAULT_V2,division:"solid",primary:"#566344",secondary:"#d8bd78",charge:"lion",chargeColor:"#ead9b2",borderColor:"#b8a06d"};
const base = {name:"Greybanner Covenant",tag:"GREY",description:"We keep the western roads, stand beside our allies, and answer the banner together. Every ruler has a place in the hall.",role:"Leader",power:"86.4M",members:24,rallies:2,gift:"3.5h ready",giftState:"Gold gifts to collect",captures:1240,rewards:3,applications:3,shield:defaultShield};
const examples = {
 leader:{},
 officer:{role:"Officer"},
 member:{role:"Member"},
 quiet:{name:"Oakwatch Company",tag:"OAK",description:"No description yet.",power:"124K",members:1,rallies:0,gift:"Send now",giftState:"Gold gift available",captures:0,rewards:0,applications:0},
 cooldown:{gift:"Ready in 4h 12m",giftState:"Gold gift cooldown",rewards:0,applications:0},
 large:{name:"Wardens of the Old March",tag:"MARCH",description:"From the farms of the western valley to the watchtowers beyond the northern river, our covenant welcomes rulers who defend their neighbours, share in the work of conquest, and keep their word. Rally beneath our banner when the roads grow dangerous; no sworn ally stands alone.",power:"999.8T",members:30,rallies:5,gift:"24h ready",captures:2000,rewards:6,applications:12},
 legacy:{name:"House Redwyvern",tag:"RED",shield:CrownlandsClanHeraldryConfig.DEFAULT_V1}
};
let sample = {...base};
function announce(message) { $("liveStatus").textContent=message; parent.postMessage({type:"clan-review-status",message},location.origin); }
function badge(id, count, label) { $(id).hidden=!count; $(id).textContent=count; $(id).parentElement.setAttribute("aria-label",label); }
function render(key="leader") {
 sample={...base,...(examples[key]||{})};
 $("detailDialog").close(); if(!$("clanDialog").open)$("clanDialog").showModal(); $("dismissed").hidden=true;
 $("clanName").textContent=sample.name; $("clanName").setAttribute("aria-label",`View ${sample.name} public clan profile`);
 $("clanTag").textContent=`[${sample.tag}]`; $("role").textContent=`YOUR CLAN · ${sample.role}`; $("description").textContent=sample.description;
 $("clanPower").textContent=sample.power; $("memberTotal").innerHTML=`${sample.members} <small>/ 30</small>`;
 $("rallyCount").textContent=sample.rallies; $("giftValue").textContent=sample.gift; $("giftState").textContent=sample.giftState;
 document.querySelector(".gifts").classList.toggle("ready",sample.gift.endsWith("ready"));
 $("conquestValue").textContent=`${sample.captures.toLocaleString("en-US")} / 2,000`; $("conquestFill").style.width=`${Math.min(100,sample.captures/20)}%`;
 document.querySelector(".conquest-track").setAttribute("aria-valuenow",sample.captures);
 $("rosterValue").textContent=`${sample.members} / 30`;
 const manager=sample.role!=="Member",pending=manager?sample.applications:0;
 $("rosterState").textContent=pending?`${pending} pending applications`:"Clan members";
 badge("rallyBadge",sample.rallies,`War Room, ${sample.rallies} active rallies`);
 badge("rewardBadge",sample.rewards,`Rewards, ${sample.rewards} ready rewards`);
 badge("memberBadge",pending||sample.members,`Members, ${pending?`${pending} pending applications`:`${sample.members} clan members`}`);
 $("memberBadge").classList.toggle("alert",pending>0);
 $("leaderActions").hidden=sample.role!=="Leader"; $("memberNote").hidden=sample.role==="Leader";
 renderer.render($("clanShield"),sample.shield,{width:176,variant:"full",label:`${sample.name} shield`});
 $("clanShield").setAttribute("aria-label",`View ${sample.name} public clan profile`);
 document.querySelector(".activity-scroll").scrollTop=0;document.querySelector(".description-scroll").scrollTop=0;
}
function openPreview(name) {
 const details={
  "War Room":`<p><strong>${sample.rallies} active rallies.</strong> This shortcut opens your clan’s existing War Room to coordinate rallies.</p>`,
  Rewards:`<p><strong>Gold gifts: ${escapeHtml(sample.gift)}.</strong> This shortcut opens the existing Rewards section to send or collect gifts and view Weekly Conquest rewards.</p>`,
  "Weekly Conquest":`<p><strong>${sample.captures.toLocaleString("en-US")} / 2,000 enemy cities conquered.</strong> This shortcut opens Weekly Conquest in Rewards. The weekly period resets Monday at 00:00 UTC.</p>`,
  Members:`<p><strong>${sample.members} / 30 members.</strong> This shortcut opens the existing roster${sample.role!=="Member"&&sample.applications?` and ${sample.applications} pending applications`:""}.</p>`,
  "Edit Heraldry":"<p>This leadership action opens the existing heraldry editor. The overview uses the game’s current shield renderer, including legacy shields.</p>",
  "Rename Clan":"<p>This leadership action opens the existing name editor.</p><p>Clan names contain 3–24 characters. Renaming costs <strong>500,000 Gold</strong> and is available once every seven days.</p>",
  "Clan profile":`<div class="detail-shield"></div><p><strong>${escapeHtml(sample.name)} [${escapeHtml(sample.tag)}]</strong></p><p>The shield and clan name open the existing public clan profile.</p>`
 };
 $("detailTitle").textContent=name;$("detailBody").innerHTML=(details[name]||`<p>Opens the existing ${escapeHtml(name)} screen.</p>`)+"<p class=preview-note>This review covers Clan Overview. The linked screens will be reviewed separately.</p>";
 const shield=document.querySelector(".detail-shield");if(shield)renderer.render(shield,sample.shield,{width:100,variant:"full",label:`${sample.name} shield`});
 $("detailDialog").showModal();announce(`${name} action preview opened. No game data is changed.`);
}
document.querySelectorAll("[data-preview]").forEach(button=>button.addEventListener("click",()=>openPreview(button.dataset.preview)));
document.querySelectorAll("[data-overview]").forEach(button=>button.addEventListener("click",()=>{document.querySelector(".activity-scroll").scrollTop=0;announce("Clan Overview selected.");}));
$("closeDetail").addEventListener("click",()=>$("detailDialog").close());$("backToOverview").addEventListener("click",()=>$("detailDialog").close());
$("close").addEventListener("click",()=>$("clanDialog").close());$("clanDialog").addEventListener("close",()=>{$("dismissed").hidden=false;announce("Clan Overview closed.");});
$("reopen").addEventListener("click",()=>{$("clanDialog").showModal();$("dismissed").hidden=true;});
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==="clan-review")render(event.data.sample);});
render();
