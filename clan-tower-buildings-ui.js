(function (global) {
  "use strict";
  const B = global.CrownlandsClanTowerBuildings;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const num = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
  const duration = ms => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`; };
  const timer = (at, now) => `<span data-clan-tower-countdown="${at}">${duration(Math.max(0, at - now))}</span>`;
  function render(tower, { selected = "shop", treasuryBalance = null, personalGold = 0, actionBusy = false, itemArt = {}, nowMs = Date.now() } = {}) {
    if (!B) return "";
    const levels = B.normalizeLevels(tower.buildings), def = B.definition(selected) || B.DEFINITIONS[0];
    const current = levels[def.id], next = Math.min(10, current + 1), project = tower.buildingProject;
    const own = Boolean(tower.ownerMember), manager = own && tower.permissions?.manage;
    const active = project?.buildingId === def.id;
    const paused = active && (!project.progressStartedAtMs || tower.attackBlocked || tower.wallIntegrityBps < 10000);
    const end = active && !paused ? project.progressStartedAtMs + project.remainingMs : 0;
    const reason = !own ? "Only the controlling clan can manage these buildings."
      : !manager ? "The Clan Leader and Officers manage construction."
      : current >= 10 ? "Maximum level reached."
      : project ? active ? paused ? "Construction paused until the walls are fully repaired and no attack is incoming." : "Construction in progress." : "Another building project is already underway."
      : tower.attackBlocked ? "Wait until the incoming attack has ended."
      : tower.wallIntegrityBps < 10000 || tower.repairActive ? "Fully repair the walls before construction."
      : treasuryBalance === null || !Number.isFinite(Number(treasuryBalance)) ? "Clan Treasury balance is unavailable."
      : Number(treasuryBalance) < B.cost(next) ? "The Clan Treasury needs more Gold." : "";
    const cards = B.DEFINITIONS.map(d => `<button class="ctb-building-choice ${d.id === def.id ? "selected" : ""}" data-clan-building-select="${d.id}" aria-pressed="${d.id === def.id}"><img src="${B.art(d.id, levels[d.id])}" alt="" loading="lazy"><span><strong>${esc(d.name)}</strong><small>${levels[d.id] ? `Level ${levels[d.id]}` : "Unbuilt"}${project?.buildingId === d.id ? " · Building" : ""}</small></span></button>`).join("");
    const info = `<div class="ctb-building-hero"><img src="${B.art(def.id, current)}" alt="${esc(def.name)}"><div><p class="eyebrow">${current ? `LEVEL ${current} / 10` : "UNBUILT"}</p><h2>${esc(def.name)}</h2><p>${esc(def.description)}</p></div></div><div class="ctb-benefits"><p><small>Current benefit</small><strong>${esc(B.benefit(def.id, current))}</strong></p>${current < 10 ? `<p><small>Level ${next}</small><strong>${esc(B.benefit(def.id, next))}</strong></p>` : ""}</div>`;
    const construction = own ? `<section class="ctb-construction"><div><small>Clan Treasury</small><strong>${treasuryBalance === null ? "Unavailable" : `${num(treasuryBalance)} Gold`}</strong></div>${current < 10 ? `<div><small>${active ? "Gold paid" : `Level ${next} cost`}</small><strong>${num(B.cost(next))} Gold</strong></div><div><small>${active ? paused ? "Remaining work" : "Time remaining" : "Construction time"}</small><strong>${active ? end ? timer(end, nowMs) : duration(project.remainingMs) : duration(B.duration(next))}</strong></div>` : ""}${manager && current < 10 && !active ? `<button type="button" class="primary-button" data-clan-building-start="${def.id}" ${reason || actionBusy ? "disabled" : ""}>${current ? `Upgrade to Level ${next}` : "Build Level 1"}</button>` : ""}${reason ? `<p class="ctb-note" role="status">${esc(reason)}</p>` : '<p class="ctb-note">Paid upfront from Clan Treasury. Projects cannot be canceled.</p>'}</section>` : `<p class="ctb-note">${esc(reason)}</p>`;
    let shop = "";
    if (def.id === "shop" && own) {
      const status = tower.clanShop;
      const items = status?.items || B.shopStatus(0, {}, nowMs);
      const eligibility = status && !status.eligible ? `<p class="ctb-note">Purchases unlock after 24 hours in the clan${status.eligibleAtMs ? ` · ${timer(status.eligibleAtMs, nowMs)} remaining` : ""}.</p>` : "";
      shop = `<section class="ctb-shop"><header><div><h3>Clan Shop</h3><p>${status ? `Clan's best Shop: Level ${status.level}` : esc(tower.clanShopError || "Loading shop availability…")}</p></div><div><small>Your Gold</small><strong>${num(personalGold)}</strong></div></header><p class="ctb-note">Extra allowance shared across Clan Shops. Purchases use your personal Gold.</p>${!current ? '<p class="ctb-note">Build this Tower’s Shop to make purchases here.</p>' : ""}${eligibility}<div class="ctb-shop-items">${items.map(item => {
        const locked = !item.unlocked, exhausted = item.remaining < 1;
        const blocked = !status || !current || !status.eligible || locked || exhausted || actionBusy || personalGold < item.price;
        const note = locked ? `Unlocks at Shop Level ${item.unlockLevel}`
          : item.id === "shield_12h" ? "1 purchase every 72 hours"
          : item.increaseLevel && status.level < item.increaseLevel ? `Daily limit increases to 2 at Shop Level ${item.increaseLevel}` : "Resets daily at 00:00 UTC";
        return `<article class="ctb-shop-item ${locked ? "locked" : ""}">${itemArt[item.id] ? `<img src="${esc(itemArt[item.id])}" alt="">` : ""}<div><h4>${esc(item.name)}</h4><p>${esc(note)}</p>${!locked ? `<small>${num(item.remaining)} / ${num(item.limit)} remaining${exhausted && item.resetAtMs > nowMs ? ` · Restocks in ${timer(item.resetAtMs, nowMs)}` : ""}</small>` : ""}</div><button class="paper-button" data-clan-shop-buy="${item.id}" ${blocked ? "disabled" : ""}>${locked ? "Locked" : status ? `Buy · ${num(item.price)} Gold` : "Loading"}</button></article>`;
      }).join("")}</div></section>`;
    }
    return `<div class="ctb-layout"><nav class="ctb-building-list" aria-label="Tower buildings">${cards}</nav><section class="ctb-building-detail" tabindex="0" aria-label="${esc(def.name)} details">${info}${construction}${shop}</section></div>`;
  }
  global.CrownlandsClanTowerBuildingsUi = Object.freeze({ render });
})(window);
