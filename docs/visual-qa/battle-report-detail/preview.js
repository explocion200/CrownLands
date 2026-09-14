"use strict";
// Synthetic presentation examples only. No game imports, storage, combat calculation, or service calls.
const samples = new Set(["victory","defeat","held","breach","raid","rally","camp","camp-reward","citadel","long","legacy","unavailable","loading"]);
const dialog = document.getElementById("reportDialog"), body = document.getElementById("reportBody"), nav = document.getElementById("sections");
const sprite = "assets/icons/battle-reports-ledger-r1.svg";
const assets = {
  troops:"assets/icons/daily-login-troops-r1.svg", gold:"assets/icons/royal-shop-gold-r1.svg", xp:"assets/icons/reward-achievements-r1.svg",
  sword:"assets/icons/skills/swordmastery.svg", shield:"assets/icons/skills/shieldwallDiscipline.svg", wall:"assets/icons/skills/stoneworks.svg",
  attackGear:"assets/optimized/gear-barracks-chest-192x192-5bf7f2f81d43.webp", defenseGear:"assets/optimized/gear-gatehouse-chest-192x192-11e03cd6c3d7.webp",
  chest:"assets/optimized/item-common-gear-box-192x192-d31500be5747.webp"
};
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
const number = value => typeof value === "number" ? value.toLocaleString("en-US") : value;
const emblem = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="${sprite}#${name}"></use></svg>`;
const art = (name, cls = "section-art") => assets[name] ? `<img class="${cls}" src="${assets[name]}" alt="">` : emblem(name, cls);
const entry = (icon, label, value, help = "", item = false) => ({icon,label,value,help,item});
const metric = (icon, label, value, help = "", wide = false) => ({icon,label,value,help,wide});
let current;
function example(sample) {
  const attacker = {role:"attacker",name:"Aldric",flag:"flag-crown",participants:"1 attacking army",troops:80000,base:100000,baseHelp:"1.25 base per troop",power:122000,losses:20000,survivors:60000,
    bonuses:[entry("sword","Swordmastery","+20,000 power","+20%")],
    gear:[entry("attackGear","War Captain gear","+2,000 power","+2%",true),entry("troops","Barracks casualty recovery","+1,000 recovered","+5% gear · main city")]
  };
  const defender = {role:"defender",name:"Lady Maeve",flag:"flag-cross",participants:"1 garrison + 1 reinforcements",troops:20000,base:26000,baseHelp:"1.30 base per soldier",power:66130,losses:20000,survivors:0,wall:35450,wallHelp:"Stoneworks +5,811 · Gatehouse gear +581",reinforcements:5000,supporters:1,
    bonuses:[entry("shield","Shieldwall Discipline","+2,600 power","+10%"),entry("realm","Personal objective support","+1,300 power","Defending soldiers only"),entry("realm","Clan objective support","+520 power","Defending soldiers only"),entry("wall","Stoneworks","+5,811 wall power","+20% wall strength")],
    gear:[entry("defenseGear","Defensive Commander gear","+260 power","+1%",true),entry("wall","Gatehouse wall gear","+581 wall power","+2% · separate from Stoneworks")]
  };
  const report = {sample,attacker,defender,viewer:"attacker",target:"Thornfield",meta:"City · Level 2 · The Crownlands",badge:"VICTORY",tone:"victory",result:"Your side captured the holding",age:"14 minutes ago",wall:{before:"100%",after:"Breached — 0%",integrity:0,repair:"16 minute repair window"},
    rewards:[metric("xp","XP","+850"),metric("gold","Gold","+12,000"),metric("troops","Casualty recovery","+6,000"),metric("troops","Level-up troops","+1,500")],
    rewardHelp:"Field Medics + Barracks gear · 75% combined cap · recovered troops returned to the main city.",
    forecast:["Owner garrison: 12,000 → 15,000.","Reinforcement troops: 0 → 5,000.","Total defense: 53,858 → 66,130."]
  };
  if (["defeat","held","citadel"].includes(sample)) {
    report.viewer="defender"; attacker.name="Lord Edric"; defender.name="Aldric"; attacker.flag="flag-cross"; defender.flag="flag-crown";
    report.target="Oakbridge"; report.forecast=null; report.rewards=[metric("xp","XP","+120")]; report.rewardHelp="";
    report.badge="DEFEAT"; report.tone="defeat"; report.result="Opponent captured the holding";
  }
  if (sample === "held") {
    Object.assign(attacker,{troops:20000,base:25000,power:30500,losses:18000,survivors:2000,bonuses:[entry("sword","Swordmastery","+5,000 power","+20%")],gear:[entry("attackGear","War Captain gear","+500 power","+2%",true)]});
    Object.assign(defender,{losses:0,survivors:20000});
    Object.assign(report,{badge:"VICTORY",tone:"victory",result:"Your side held the holding",wall:{before:"100%",after:"Damaged — 14% intact",integrity:14,repair:"16 minute repair window"},rewards:[metric("xp","XP","+400")]});
  }
  if (sample === "breach") {
    Object.assign(attacker,{troops:20000,base:25000,power:35450,losses:18000,survivors:2000,bonuses:[entry("sword","Swordmastery","+10,000 power","+40%")],gear:[entry("attackGear","War Captain gear","+450 power","+1.8%",true)]});
    Object.assign(defender,{losses:0,survivors:20000});
    Object.assign(report,{badge:"BREACH",result:"Your side breached the wall",rule:"Protected breach — wall breach only",forecast:null,rewards:[metric("xp","XP","+200")],rewardHelp:""});
  }
  if (sample === "raid") {
    Object.assign(report,{badge:"RAID",tone:"defeat",result:"Protected raid completed — no capture",rule:"Protected raid — capture disabled",forecast:null,wall:{before:"100%",after:"Intact — 100%",integrity:100,repair:""}});
    Object.assign(defender,{losses:2000,survivors:18000});
  }
  if (sample === "rally") {
    report.target="The Iron Watch"; report.meta="Stronghold · Level 2 · The Crownlands"; report.forecast=null; attacker.participants="3 rally armies";
    attacker.bonuses=[entry("sword","Swordmastery","+20,000 power","Mixed participant rates")]; attacker.gear=[entry("attackGear","War Captain gear","+2,000 power","Mixed equipped-gear rates",true)];
    report.participants=[{name:"Aldric",role:"Rally creator",troops:30000,losses:7500,survivors:22500,power:45750},{name:"Thane Rowan",role:"Clan participant",troops:25000,losses:6250,survivors:18750,power:34687},{name:"Lady Elowen",role:"Clan participant",troops:25000,losses:6250,survivors:18750,power:41563}];
  }
  if (["camp","camp-reward"].includes(sample)) {
    report.target=sample === "camp" ? "Warband Camp" : "Relic Camp"; report.meta="Reward camp · No level · No walls · The Crownlands";
    report.rule="Camp combat — 1.00 defense per troop, no level or walls"; report.forecast=null; report.wall=null; report.result="Your side captured the camp";
    Object.assign(defender,{name:"Neutral garrison",participants:"1 defending garrison",base:20000,baseHelp:"1.00 base per soldier",power:20000,wall:0,wallFree:true,reinforcements:0,supporters:0,bonuses:[],gear:[]});
    report.rewards=[metric("xp","XP","+300")]; report.rewardHelp="";
    if (sample === "camp-reward") {
      report.viewer="defender"; defender.name="Aldric"; defender.flag="flag-crown"; attacker.name="Relic Camp"; report.result="Your side held the holding";
      report.notice="The Relic Camp hold completed. You received a Common Gear Box.";
      Object.assign(attacker,{troops:0,losses:0,survivors:0}); Object.assign(defender,{losses:0,survivors:20000});
      report.rewards=[metric("chest","Item","Common Gear Box","",true),metric("troops","Amount","×1")];
      report.legacy=true;
    }
  }
  if (sample === "citadel") {
    attacker.name="Citadel Legion"; attacker.gear=[]; attacker.bonuses=[]; attacker.power=100000; defender.power=30680;
    Object.assign(report,{badge:"CITY LOST",result:"The Citadel Legion returned the holding to neutral control",wall:{before:"100%",after:"Bypassed — 100% unchanged",integrity:100,repair:""}});
  }
  if (sample === "long") {
    report.target="The Watchtower of Saint Bartholomew"; report.meta="Stronghold · Level 25 · The Northern Marches"; report.forecast=null;
    attacker.name="Lady Eleonora of the Northern Marches"; defender.name="Lord Maximilian of the Silver Company";
    for (const side of [attacker,defender]) for (const field of ["troops","base","power","losses","survivors","reinforcements"]) if (typeof side[field] === "number") side[field] *= 100;
    defender.wall *= 100; report.wall.before="100%";
    attacker.bonuses=[entry("sword","Swordmastery","+2,000,000 power","+20%")];
    attacker.gear=[entry("attackGear","War Captain gear","+200,000 power","+2%",true)];
    defender.power+=25000;
    defender.bonuses=[entry("shield","Shieldwall Discipline","+260,000 power","Mixed participant rates"),entry("realm","Personal objective support","+130,000 power","Defending soldiers only"),entry("realm","Clan objective support","+52,000 power","Defending soldiers only"),entry("wall","Stoneworks","+581,100 wall power","+20% wall strength"),entry("realm","Other recorded defense","+25,000 power","Authoritative battle snapshot")];
    defender.gear=[entry("defenseGear","Defensive Commander gear","+26,000 power","Mixed equipped-gear rates",true),entry("wall","Gatehouse wall gear","+58,100 wall power","+2% · separate from Stoneworks")];
    defender.wallHelp="Stoneworks +581,100 · Gatehouse gear +58,100";
  }
  if (["legacy","unavailable"].includes(sample)) {
    report.legacy=true; report.forecast=null; report.wall=null;
    report.notice=sample === "unavailable" ? "Detailed participant statistics are unavailable for this report." : "An older report. Only recorded values are available.";
  }
  if (report.legacy) {
    attacker.base="Not recorded"; attacker.power="Not recorded"; attacker.baseHelp="Older report"; attacker.participants="Recorded attacking army";
    defender.base="Not recorded"; defender.baseHelp="Older report"; defender.participants="Recorded defending garrison";
    for (const side of [attacker,defender]) { side.bonuses=[entry("dispatch","Combat bonuses","Not recorded","Historical report")]; side.gear=[]; }
    if (!defender.wallFree) { defender.wall="Not recorded"; defender.wallHelp="Stored wall snapshot"; }
  }
  return report;
}
function status(message) {
  document.getElementById("liveStatus").textContent=message;
  parent.postMessage({type:"battle-detail-status",message},location.origin);
}
function section(id, title, content, icon, hint="") {
  return `<section id="${id}" data-section="${title}"><div class="section-heading">${icon ? art(icon) : ""}<h3 tabindex="-1">${title}</h3>${hint ? `<span>${hint}</span>` : ""}</div>${content}</section>`;
}
function sideCard(side, viewer) {
  return `<article class="army ${viewer ? "viewer" : "opponent"}"><div class="army-top"><svg class="flag" role="img" aria-label="${esc(side.name)} example flag"><use href="${sprite}#${side.flag}"></use></svg><div class="identity"><span class="eyebrow">${viewer ? "Your side" : "Opponent side"}</span><button class="ruler-link" data-ruler="${esc(side.name)}">${esc(side.name)}</button><small>${side.role === "attacker" ? "Attacker" : "Defender"} · ${esc(side.participants)}</small></div><div class="power"><small>Total ${side.role === "attacker" ? "attack" : "defense"} power</small><strong>${esc(number(side.power))}</strong></div></div><div class="troop-flow" aria-label="Troops before and after battle"><div><span>Starting troops</span><strong>${esc(number(side.troops))}</strong></div><div><span>Troops lost</span><strong class="loss">${esc(number(side.losses))}</strong></div><div><span>Surviving</span><strong class="survive">${esc(number(side.survivors))}</strong></div></div></article>`;
}
function summary(report,left,right) {
  const icon=report.viewer === "defender" ? report.tone === "defeat" ? "defense-defeat" : "defense" : "attack";
  const forecast=report.forecast ? `<details class="forecast"><summary>Defense changed after scouting</summary><p>Your forecast used scout information. Combat used the defenses present at arrival.</p><ul>${report.forecast.map(change=>`<li>${esc(change)}</li>`).join("")}</ul><p>Walls can change through damage, repairs, upgrades, or bonuses. Troops can arrive or leave during travel.</p></details>` : "";
  return `<section id="summary" data-section="Summary" class="${report.tone}"><div class="battle-heading"><div class="target-copy"><span class="eyebrow">Battle for</span><h2 tabindex="-1">${esc(report.target)}</h2><p class="target-meta">${esc(report.meta)}</p></div><div class="outcome">${emblem(icon)}<div><strong>${report.badge}</strong><small>${esc(report.result)}</small></div></div></div>${report.rule ? `<p class="rule-note">${esc(report.rule)}</p>` : ""}${report.notice ? `<p class="notice">${esc(report.notice)}</p>` : ""}<div class="armies">${sideCard(left,true)}${sideCard(right,false)}</div>${forecast}</section>`;
}
function forces(left,right) {
  const rows=[
    ["Starting troops","troops",side=>side.participants], ["Base troop power","base",side=>side.baseHelp],
    ...([left,right].some(side=>side.role==="defender" && side.wall) ? [["Wall power at battle","wall",side=>side.role==="attacker" ? "No attacking wall" : side.wallHelp]] : []),
    ["Final resolved power","power",side=>side.role === "attacker" ? "Attack power" : side.wallFree ? "Camp troops and reinforcements only" : "Soldiers, reinforcements, and wall","resolved"],
    ["Troops lost","losses",null,"losses"], ["Troops surviving","survivors",null,"survivors"],
    ...([left,right].some(side=>side.supporters>0) ? [["Allied reinforcements","reinforcements",side=>side.supporters ? `${side.supporters} supporting ruler` : "None recorded"]] : [])
  ];
  return section("forces","Battle Details",`<table class="comparison"><thead><tr><th scope="col">The forces at battle</th>${[left,right].map((side,i)=>`<th scope="col">${i===0 ? "Your side" : "Opponent side"}<small>${side.role === "attacker" ? "Attacking force" : "Defending force"}</small></th>`).join("")}</tr></thead><tbody>${rows.map(([label,key,help,cls])=>`<tr class="${cls||""}"><th scope="row">${label}</th>${[left,right].map(side=>`<td>${esc(number(side[key] ?? "—"))}${help ? `<small>${esc(help(side)||"")}</small>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`,"attack");
}
function bonusCard(side,gear=false) {
  const entries=gear ? side.gear : side.bonuses;
  const title=side.role === "attacker" ? gear ? "Attacker Gear" : "Attack bonuses" : gear ? "Defender Gear" : "Defense bonuses";
  return `<article class="detail-card"><h4>${title}</h4>${entries.length ? entries.map(row=>`<div class="bonus-row">${art(row.icon,`bonus-art${row.item ? " item" : ""}`)}<div class="bonus-copy"><strong>${esc(row.label)}</strong>${row.help ? `<small>${esc(row.help)}</small>` : ""}</div><span class="bonus-value">${esc(row.value)}</span></div>`).join("") : `<p class="no-bonus">No additional combat bonuses</p>`}</article>`;
}
function wallSection(report) {
  if (!report.wall) return "";
  return section("walls","Wall Result",`<div class="wall-result">${art("wall","wall-art")}<div><span class="eyebrow">Before battle</span><strong>${esc(report.wall.before)}</strong><small>${esc(number(report.defender.wall))} wall power</small></div><span class="wall-arrow" aria-hidden="true">→</span><div class="after ${report.wall.integrity===0 ? "breached" : ""}"><span class="eyebrow">After battle</span><strong>${esc(report.wall.after)}</strong>${report.wall.repair ? `<small>${esc(report.wall.repair)}</small>` : ""}<div class="integrity-track" aria-hidden="true"><span style="width:${report.wall.integrity}%"></span></div></div></div>`,"realm");
}
function rewards(report) {
  if (!report.rewards.length) return "";
  return section("rewards","Rewards",`<div class="rewards">${report.rewards.map(reward=>`<div class="reward${reward.wide ? " wide" : ""}">${art(reward.icon,"reward-art")}<div class="reward-copy"><small>${esc(reward.label)}</small><strong>${esc(reward.value)}</strong>${reward.help ? `<small>${esc(reward.help)}</small>` : ""}</div></div>`).join("")}</div>${report.rewardHelp ? `<p class="reward-help">${esc(report.rewardHelp)}</p>` : ""}`,"xp");
}
function rally(report) {
  if (!report.participants) return "";
  return section("rally","Rally participant results",`<table class="rally-table"><thead><tr><th scope="col">Ruler</th><th scope="col">Committed</th><th scope="col">Losses</th><th scope="col">Survivors</th><th scope="col">Attack power</th></tr></thead><tbody>${report.participants.map(row=>`<tr><td><button class="ruler-link" data-ruler="${esc(row.name)}">${esc(row.name)}</button><small>${row.role}</small></td>${[row.troops,row.losses,row.survivors,row.power].map(value=>`<td>${number(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,"realm",`${report.participants.length} players`);
}
function updateNav() {
  const sections=[...body.querySelectorAll("[data-section]")];
  const top=body.getBoundingClientRect().top;
  const active=body.scrollTop+body.clientHeight>=body.scrollHeight-3 ? sections.at(-1) : sections.filter(section=>section.getBoundingClientRect().top<=top+35).at(-1)||sections[0];
  nav.querySelectorAll("button").forEach(button=>{
    if (button.dataset.jump===active?.id) button.setAttribute("aria-current","location"); else button.removeAttribute("aria-current");
  });
}
function render(sample="victory") {
  current=example(samples.has(sample) ? sample : "victory");
  body.dataset.sample=current.sample;
  const left=current[current.viewer],right=current[current.viewer === "attacker" ? "defender" : "attacker"];
  document.getElementById("reportTitle").textContent=current.viewer === "attacker" ? "Attack Report" : "Defense Report";
  document.getElementById("reportTime").textContent=current.age;
  document.getElementById("mapButton").disabled=sample === "loading";
  if (sample === "loading") {
    body.innerHTML=`<section id="summary" data-section="Summary" class="loading-state" role="status">${emblem("dispatch")}<h2 tabindex="-1">Battle for ${esc(current.target)}</h2><p>Loading participant battle statistics…<br>Loading the authoritative battle snapshot…</p></section>`;
  } else {
    const gear=[left,right].filter(side=>side.gear.length);
    body.innerHTML=summary(current,left,right)+rally(current)+forces(left,right)+section("bonuses","Bonuses",`<div class="two-column">${bonusCard(left)}${bonusCard(right)}</div>`,"realm")+(gear.length ? section("gear","Gear Effects",`<div class="two-column">${gear.map(side=>bonusCard(side,true)).join("")}</div>`,"shield") : "")+wallSection(current)+rewards(current);
  }
  nav.innerHTML=[...body.querySelectorAll("[data-section]")].map(section=>`<button data-jump="${section.id}">${section.id === "forces" ? "Forces" : section.id === "rally" ? "Rally" : section.id === "gear" ? "Gear" : section.id === "walls" ? "Walls" : section.dataset.section}</button>`).join("");
  nav.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
    const section=document.getElementById(button.dataset.jump);
    body.scrollTop+=section.getBoundingClientRect().top-body.getBoundingClientRect().top-8;
    section.querySelector("h2,h3")?.focus({preventScroll:true}); updateNav();
  }));
  body.querySelectorAll("[data-ruler]").forEach(button=>button.addEventListener("click",()=>status(`Draft action: open ${button.dataset.ruler}'s player profile.`)));
  body.scrollTop=0; if (!dialog.open) dialog.showModal(); updateNav();
}
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>status(button.dataset.action === "Reports" ? "Draft action: return to the Battle Reports list." : `Draft action: locate ${current.target} on the map.`)));
document.getElementById("close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>status("Report closed. Open Battle Report restores this example."));
document.getElementById("reopen").addEventListener("click",()=>{dialog.showModal();updateNav();});
body.addEventListener("scroll",updateNav,{passive:true}); window.addEventListener("resize",updateNav);
window.addEventListener("message",event=>{if(event.origin===location.origin && event.source===parent && event.data?.type==="battle-detail-review")render(event.data.sample);});
render();
