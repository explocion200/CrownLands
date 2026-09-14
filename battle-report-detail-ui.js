/* Approved full-report presentation. Game helpers own snapshots, rewards, identities, and navigation. */
(function (root) {
  "use strict";
  const sprite = "assets/icons/battle-reports-ledger-r1.svg";
  const assets = {
    troops:"assets/icons/daily-login-troops-r1.svg", gold:"assets/icons/royal-shop-gold-r1.svg", xp:"assets/icons/reward-achievements-r1.svg",
    sword:"assets/icons/skills/swordmastery.svg", shield:"assets/icons/skills/shieldwallDiscipline.svg", wall:"assets/icons/skills/stoneworks.svg",
    attackGear:"assets/optimized/gear-barracks-chest-192x192-5bf7f2f81d43.webp", defenseGear:"assets/optimized/gear-gatehouse-chest-192x192-11e03cd6c3d7.webp",
    chest:"assets/optimized/item-common-gear-box-192x192-d31500be5747.webp"
  };
  const esc = value => escapeHtml(String(value ?? ""));
  const value = input => esc(formatBattleReportValue(input));
  const emblem = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="${sprite}#${name}"></use></svg>`;
  const art = (name, cls = "section-art") => assets[name] ? `<img class="${cls}" src="${assets[name]}" alt="" decoding="async">` : emblem(name, cls);
  const metric = (icon,label,amount,help="",wide=false) => ({icon,label,amount,help,wide});

  function section(id,title,content,icon,hint="") {
    return `<section id="battleDetail-${id}" data-detail-section="${id}" data-detail-label="${title}"><div class="section-heading">${icon ? art(icon) : ""}<h3 tabindex="-1">${title}</h3>${hint ? `<span>${esc(hint)}</span>` : ""}</div>${content}</section>`;
  }
  function sideCard(side,viewer) {
    const primary=side.primary || {}, role=side.role === "attacker" ? "Attacker" : "Defender";
    return `<article class="army ${viewer ? "viewer" : "opponent"}"><div class="army-top">${renderBattleKingdomFlag(side.flagKey,primary.ownerName || role,"flag")}<div class="identity"><span class="eyebrow">${viewer ? "Your side" : "Opponent side"}</span>${renderPlayerNameLink(primary.ownerUid,primary.ownerName || "Unknown ruler","ruler-link")}<small>${role} · ${esc(side.participantSummary)}</small></div><div class="power"><small>Total ${side.role === "attacker" ? "attack" : "defense"} power</small><strong>${value(side.finalPower)}</strong></div></div><div class="troop-flow" aria-label="Troops before and after battle"><div><span>Starting troops</span><strong>${value(side.startingTroops)}</strong></div><div><span>Troops lost</span><strong class="loss">${value(side.losses)}</strong></div><div><span>Surviving</span><strong class="survive">${value(side.survivors)}</strong></div></div></article>`;
  }
  function summary({report,badge,left,right,target,resultLabel,ruleLabel,message,forecast}) {
    const icon=report.type === "defense" ? badge.tone === "defeat" ? "defense-defeat" : "defense" : "attack";
    const metadata=[getBattleTargetTypeLabel(target),target.targetType === "camp" ? "No level · No walls" : `Level ${formatNumber(target.level || report.cityLevel || 1)}`,target.regionId ? getRegionLabel(target.regionId) : ""].filter(Boolean).join(" · ");
    return `<section id="battleDetail-summary" data-detail-section="summary" data-detail-label="Summary" class="${esc(badge.tone)}"><div class="battle-heading"><div class="target-copy"><span class="eyebrow">Battle for</span><h2 tabindex="-1">${esc(target.name || report.cityName || "Unknown holding")}</h2><p class="target-meta">${esc(metadata)}</p></div><div class="outcome">${emblem(icon)}<div><strong>${esc(badge.label)}</strong><small>${esc(resultLabel)}</small></div></div></div>${ruleLabel ? `<p class="rule-note">${esc(ruleLabel)}</p>` : ""}${message ? `<p class="notice">${esc(message)}</p>` : ""}<div class="armies">${sideCard(left,true)}${sideCard(right,false)}</div>${forecast || ""}</section>`;
  }
  function forces(left,right) {
    const rows=[
      ["Starting troops","startingTroops",side=>side.participantSummary], ["Base troop power","basePower",side=>side.basePowerHelp],
      ...([left,right].some(side=>side.role === "defender" && !side.wallFree && (side.wallPower || typeof side.wallPower === "string")) ? [["Wall power at battle","wallPower",side=>side.role === "attacker" ? "No attacking wall" : side.wallHelp]] : []),
      ["Final resolved power","finalPower",side=>side.role === "attacker" ? "Attack power" : side.wallFree ? "Camp troops and reinforcements only" : "Soldiers, reinforcements, and wall","resolved"],
      ["Troops lost","losses",null,"losses"], ["Troops surviving","survivors",null,"survivors"],
      ...([left,right].some(side=>side.reinforcementCount>0) ? [["Allied reinforcements","reinforcementTroops",side=>side.reinforcementCount>0 ? `${formatNumber(side.reinforcementCount)} supporting ${side.reinforcementCount === 1 ? "ruler" : "rulers"}` : "None recorded"]] : [])
    ];
    return section("forces","Battle Details",`<table class="comparison"><thead><tr><th scope="col">The forces at battle</th>${[left,right].map((side,index)=>`<th scope="col">${index === 0 ? "Your side" : "Opponent side"}<small>${side.role === "attacker" ? "Attacking force" : "Defending force"}</small></th>`).join("")}</tr></thead><tbody>${rows.map(([label,key,help,cls])=>`<tr class="${cls || ""}"><th scope="row">${label}</th>${[left,right].map(side=>`<td>${key === "wallPower" && side.role === "attacker" ? "—" : value(side[key])}${help ? `<small>${esc(help(side))}</small>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`,"attack");
  }
  function bonusIcon(entry,side,gear) {
    if (/Stoneworks|wall gear/i.test(entry.label)) return "wall";
    if (/recover/i.test(entry.value)) return "troops";
    if (gear) return side.role === "attacker" ? "attackGear" : "defenseGear";
    if (/Swordmastery/i.test(entry.label)) return "sword";
    if (/Shieldwall|defense skill|city defense/i.test(entry.label)) return "shield";
    return "realm";
  }
  function bonusCard(side,entries,gear=false) {
    const title=side.role === "attacker" ? gear ? "Attacker Gear" : "Attack bonuses" : gear ? "Defender Gear" : "Defense bonuses";
    return `<article class="detail-card"><h4>${title}</h4>${entries.length ? entries.map(entry=>{const icon=bonusIcon(entry,side,gear);return `<div class="bonus-row">${art(icon,`bonus-art${icon.endsWith("Gear") ? " item" : ""}`)}<div class="bonus-copy"><strong>${esc(entry.label)}</strong>${entry.help ? `<small>${esc(entry.help)}</small>` : ""}</div><span class="bonus-value">${esc(entry.value)}</span></div>`;}).join("") : '<p class="no-bonus">No additional combat bonuses</p>'}</article>`;
  }
  function bonuses(left,right) {
    return section("bonuses","Bonuses",`<div class="two-column">${[left,right].map(side=>bonusCard(side,getBattleSideBonusEntries(side))).join("")}</div>`,"realm");
  }
  function gearEffects({left,right,report,viewerRole}) {
    const cards=[left,right].map(side=>{const entries=getBattleSideBonusEntries({...side,gearOnly:true,casualtyRecovery:side.casualtyRecovery || (viewerRole === side.role ? report.casualtyRecovery : null)});return entries.length ? bonusCard(side,entries,true) : "";}).filter(Boolean);
    return cards.length ? section("gear","Gear Effects",`<div class="two-column">${cards.join("")}</div>`,"shield") : "";
  }
  function walls(defender,siege) {
    if (!siege || defender.wallFree) return "";
    const before=clamp(Math.floor(Number(siege.startingIntegrityBps) || 0),0,10000), after=clamp(Math.floor(Number(siege.endingIntegrityBps) || 0),0,10000), repair=Math.max(0,Math.floor(Number(siege.repairWindowMinutes) || 0));
    return section("walls","Wall Result",`<div class="wall-result">${art("wall","wall-art")}<div><span class="eyebrow">Before battle</span><strong>${esc(formatWallIntegrity(before))}</strong><small>${value(defender.wallPower)} wall power</small></div><span class="wall-arrow" aria-hidden="true">→</span><div class="after ${String(defender.wallAfter).startsWith("Breached") ? "breached" : ""}"><span class="eyebrow">After battle</span><strong>${esc(defender.wallAfter || "Not recorded")}</strong>${repair>0 ? `<small>${formatNumber(repair)} minute repair window</small>` : ""}<div class="integrity-track" aria-hidden="true"><span style="width:${after/100}%"></span></div></div></div>`,"realm");
  }
  function rewards(report) {
    const reward=getBattleReportCampReward(report), rows=[];
    let help="";
    if (reward) {
      if (reward.rewardType === "gold") rows.push(metric("gold","Gold",`+${formatNumber(reward.amount)}`));
      if (reward.rewardType === "troops") rows.push(metric("troops","Troops",`+${formatNumber(reward.amount)}`));
      if (reward.rewardType === "city") rows.push(metric("realm","City",reward.cityName,"",true),metric("map","Location",reward.cityRegionName || (reward.cityRegionId ? getRegionLabel(reward.cityRegionId) : "Location unavailable"),"",true));
      if (reward.rewardType === "item") {
        const item=metric(reward.itemId === "common_gear_box" ? "chest" : "dispatch","Item",reward.itemName,"",true);
        const catalogItem=getShopItemById(reward.itemId);
        if (catalogItem?.icon) item.art=renderItemIcon(catalogItem,"reward-art");
        rows.push(item,metric("troops","Amount",`×${formatNumber(reward.itemQuantity || reward.amount)}`));
      }
    } else {
      if (report.xpAwarded>0) rows.push(metric("xp","XP",`+${formatNumber(report.xpAwarded)}`));
      if (report.goldAwarded>0) rows.push(metric("gold","Gold",`+${formatNumber(report.goldAwarded)}`));
      if (report.fieldMedicsRecovered>0) {
        rows.push(metric("troops","Casualty recovery",`+${formatNumber(report.fieldMedicsRecovered)}`));
        help="Field Medics + Barracks gear · 75% combined cap · returned to the main city";
      }
      if (report.troopsAwarded>0) rows.push(metric("troops","Level-up troops",`+${formatNumber(report.troopsAwarded)}`));
    }
    if (!rows.length) return "";
    return section("rewards","Rewards",`<div class="rewards">${rows.map(row=>`<div class="reward${row.wide ? " wide" : ""}">${row.art || art(row.icon,"reward-art")}<div class="reward-copy"><small>${esc(row.label)}</small><strong>${esc(row.amount)}</strong></div></div>`).join("")}</div>${help ? `<p class="reward-help">${help}</p>` : ""}`,"xp");
  }
  function rally(snapshot) {
    const participants=getDetailedBattleSideParticipants(snapshot,"attacker");
    if (participants.length<2) return "";
    return section("rally","Rally participant results",`<table class="rally-table"><thead><tr><th scope="col">Ruler</th><th scope="col">Committed</th><th scope="col">Losses</th><th scope="col">Survivors</th><th scope="col">Attack power</th></tr></thead><tbody>${participants.map(row=>`<tr><td>${renderPlayerNameLink(row.ownerUid,row.ownerName || "Ruler","ruler-link")}<small>${row.role === "leader" ? "Rally creator" : "Clan participant"}</small></td>${[row.startingTroops || 0,row.losses || 0,row.survivors || 0,row.effectivePower || 0].map(amount=>`<td>${value(amount)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,"realm",`${formatNumber(participants.length)} players`);
  }
  function shell(report,content,loading=false) {
    return `<div class="report-shell detail-ledger-shell"><header class="window-header"><button id="battleReportBackBtn" class="back-button" type="button" aria-label="Back to reports" data-audio-effect="none"><span aria-hidden="true">‹</span> Reports</button><div class="heading"><p>ROYAL DISPATCHES</p><h2>${esc(getBattleReportTypeLabel(report.type))}</h2></div><div class="report-time">${renderBattleReportAge(report)}</div>${loading ? '' : renderBattleReportLocateButton(report,"battle-report-locate-detail map-button")}<button class="close-button" data-detail-close type="button" aria-label="Close Battle Report">×</button></header><nav class="section-nav" aria-label="Report sections"></nav><div class="report-body" tabindex="0" aria-label="Full battle report">${content}</div><footer class="report-footer"><span>Battle reports · retained for 24 hours</span><span>Scroll for the full account</span></footer></div>`;
  }
  function render(options) {
    return shell(options.report,summary(options)+rally(options.snapshot)+forces(options.left,options.right)+bonuses(options.left,options.right)+gearEffects(options)+walls(options.defender,options.siege)+rewards(options.report));
  }
  function loading(report,badge) {
    return shell(report,`<section id="battleDetail-summary" data-detail-section="summary" data-detail-label="Summary" class="loading-state" role="status">${emblem("dispatch")}<h2 tabindex="-1">${esc(report.cityName)}</h2><p>${esc(badge.label)} · Loading participant battle statistics…<br>Loading the authoritative battle snapshot…</p></section>`,true);
  }
  function mount(modal,host,closeButton) {
    const panel=host.querySelector(".detail-ledger-shell");
    if (!panel) return;
    modal.classList.add("battle-report-detail-ledger");
    const body=panel.querySelector(".report-body"), nav=panel.querySelector(".section-nav"), sections=[...body.querySelectorAll("[data-detail-section]")];
    const labels={forces:"Forces",rally:"Rally",gear:"Gear",walls:"Walls"};
    nav.innerHTML=sections.map(section=>`<button type="button" data-detail-jump="${section.id}">${labels[section.dataset.detailSection] || esc(section.dataset.detailLabel)}</button>`).join("");
    const update=()=>{const top=body.getBoundingClientRect().top, active=body.scrollTop+body.clientHeight>=body.scrollHeight-3 ? sections.at(-1) : sections.filter(section=>section.getBoundingClientRect().top<=top+35).at(-1)||sections[0];nav.querySelectorAll("button").forEach(button=>{if(button.dataset.detailJump===active?.id)button.setAttribute("aria-current","location");else button.removeAttribute("aria-current");});};
    nav.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{const section=sections.find(section=>section.id===button.dataset.detailJump);body.scrollTop+=section.getBoundingClientRect().top-body.getBoundingClientRect().top-8;section.querySelector("h2,h3")?.focus({preventScroll:true});update();}));
    panel.querySelector("[data-detail-close]").addEventListener("click",()=>closeButton.click());
    const map=panel.querySelector(".map-button");
    if (map) map.innerHTML=emblem("map")+'<span>View map</span>';
    panel.querySelector(".battle-forecast-changes")?.classList.add("forecast");
    body.addEventListener("scroll",update,{passive:true});
    update();
  }
  root.CrownlandsBattleReportUI=Object.freeze({render,loading,mount});
})(window);
