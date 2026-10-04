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
    const reason = B.mechanicsPending(def.id) ? "New mechanics are being designed. Upgrades are paused."
      : !own ? "Only the controlling clan can manage these buildings."
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
      const eligibility = status && !status.eligible ? `<p class="ctb-note">Purchases unlock after 1 hour in the clan${status.eligibleAtMs ? ` · ${timer(status.eligibleAtMs, nowMs)} remaining` : ""}.</p>` : "";
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
  // One frame keeps navigation, Treasury, benefits and construction in the same place.
  function frame(tower, id, { icon, closeId, upgradeId = "upgrade", items = "" } = {}) {
    const def = B.definition(id), level = B.level(tower.buildings?.[id]);
    return `<div class="${id}-shell clan-building-shell">
      <header class="window-header"><img class="header-emblem" src="${esc(icon)}" alt=""><div class="heading"><p>${esc(tower.name)} · Clan Tower</p><h1 id="${id}Title">${esc(def.name)}</h1></div><div class="treasury"><span>Clan Treasury</span><strong><img src="assets/optimized/gold-coin-192x192-c682187a7b6c.webp" alt="Gold"><span id="balance"></span></strong></div><button id="${closeId}" type="button" class="close" aria-label="Close ${esc(def.name)}">×</button></header>
      <div class="${id}-body clan-building-body">
        <aside class="building-panel" tabindex="0" aria-label="${esc(def.name)} building and level"><p class="overline">${esc(tower.clanName || "Your clan")}</p><div class="building-art"><img id="buildingArt" src="${B.art(id, level)}" alt="${esc(def.name)} building"></div><h2 id="buildingLevel"></h2><div id="levelTrack" class="level-track"></div><p id="buildingCaption" class="building-caption"></p><label class="building-navigation"><span class="sr-only">Tower building</span><select data-${id}-building aria-label="Tower building">${B.DEFINITIONS.map(d => `<option value="${d.id}" ${d.id === id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label><div class="building-seal" aria-hidden="true">◆</div><p class="building-note">Completed benefits stay active while this building upgrades.</p></aside>
        <section class="detail-panel" aria-label="${esc(def.name)} improvements">
          <nav class="${id}-tabs clan-building-tabs" aria-label="${esc(def.name)} sections"><div role="tablist"><button id="tab-overview" type="button" role="tab" aria-controls="overviewPanel" aria-selected="true" data-section="overview">Overview</button><button id="tab-levels" type="button" role="tab" aria-controls="levelsPanel" aria-selected="false" data-section="levels">All levels</button>${items ? '<button id="tab-wares" type="button" role="tab" aria-controls="waresPanel" aria-selected="false" data-section="wares">Items</button>' : ""}</div><button type="button" class="tower-back" data-${id}-back>← Tower Info</button></nav>
          <div id="overviewPanel" class="detail-scroll" tabindex="0" role="tabpanel" aria-labelledby="tab-overview"></div>
          <div id="levelsPanel" class="detail-scroll" tabindex="0" role="tabpanel" aria-labelledby="tab-levels" hidden></div>
          ${items}
        </section>
      </div>
      <footer class="upgrade-footer"><dl id="upgradeFacts"></dl><button id="${upgradeId}" class="primary" type="button" aria-describedby="upgradeNote"></button><p id="upgradeNote" role="status"></p></footer>
    </div>`;
  }
  function mountPendingMechanics(host, tower, id, options = {}) {
    host._clanTowerClockCleanup?.();
    const view = options.view || {}, level = B.level(tower.buildings?.[id]), def = B.definition(id);
    const scroll = Object.fromEntries(["#overviewPanel", "#levelsPanel", ".building-panel"].map(s => [s, host.querySelector(s)?.scrollTop || 0]));
    const focused = host.contains(document.activeElement) ? document.activeElement?.id : "";
    const closeId = id === "infirmary" ? "closeInfirmary" : "closeTraining";
    host.innerHTML = frame(tower, id, {closeId, icon: `assets/icons/skills/${id === "infirmary" ? "fieldMedics" : "swordmastery"}.svg`});
    const $ = selector => host.querySelector(selector);
    $("#balance").textContent = options.treasuryBalance == null ? "Unavailable" : num(options.treasuryBalance);
    $("#buildingLevel").textContent = level ? `${def.name} Level ${level}` : `${def.name} unbuilt`;
    $("#levelTrack").innerHTML = Array.from({length: 10}, (_, i) => `<span class="${i < level ? "reached" : ""}"></span>`).join("");
    $("#levelTrack").setAttribute("aria-label", `Level ${level} of 10`);
    $("#buildingCaption").textContent = "Your completed levels are preserved.";
    $(".building-note").textContent = "New mechanics are being designed. New upgrades are paused.";
    const project = tower.buildingProject;
    $("#overviewPanel").innerHTML = `<h2 class="section-heading">Mechanics being redesigned</h2><p class="section-intro">${esc(def.name)} keeps its completed levels while its new role is designed.</p><div class="benefit-comparison"><article class="benefit-card"><small>Saved progress</small><strong id="currentBenefit">${level} / 10</strong><p>completed levels</p><span class="gain">Progress preserved</span></article><span class="comparison-arrow" aria-hidden="true">◆</span><article class="benefit-card next"><small>Current combat bonus</small><strong id="nextBenefit">+0%</strong><p>${id === "infirmary" ? "casualty recovery" : "rally attack strength"}</p><span class="gain">Previous bonus retired</span></article></div><div class="benefit-explanation"><article><img src="assets/icons/skills/fieldMedics.svg" alt=""><div><h3>Skills and equipment</h3><p>Recovery comes from Field Medics and equipped gear, up to 90%.</p></div></article><article><img src="assets/icons/skills/swordmastery.svg" alt=""><div><h3>Armies already launched</h3><p>Existing marches keep the attack bonuses saved at departure.</p></div></article></div>${project ? `<section class="project-card"><div class="project-heading"><h3>Previously paid construction</h3><span class="state-badge">${esc(B.definition(project.buildingId)?.name)}</span></div><p>Paid work can finish under the existing construction rules. New upgrades are paused.</p><div class="project-stats"><span>Level ${num(project.targetLevel)}</span><strong data-project-time></strong></div></section>` : ""}`;
    $("#levelsPanel").innerHTML = `<h2 class="section-heading">${esc(def.name)} levels</h2><p class="section-intro">Completed levels stay saved. These are the original construction costs and times.</p><table class="levels-table"><thead><tr><th>Level</th><th>Status</th><th>Treasury Gold</th><th>Build time</th></tr></thead><tbody>${Array.from({length: 10}, (_, i) => `<tr class="${i + 1 === level ? "current" : ""}"><td>${i + 1}</td><td>${i < level ? "Completed" : "Not built"}</td><td>${num(B.cost(i + 1))}</td><td>${duration(B.duration(i + 1))}</td></tr>`).join("")}</tbody></table>`;
    $("#upgradeFacts").innerHTML = `<div><dt>Saved level</dt><dd id="upgradeCost">${level} / 10</dd></div><div><dt>Combat bonus</dt><dd>+0%</dd></div>`;
    $("#upgrade").disabled = true;
    $("#upgrade").textContent = "Upgrades paused";
    $("#upgradeNote").textContent = "New mechanics are being designed. Your completed levels are preserved.";
    function section(selected) {
      view.section = selected === "levels" ? "levels" : "overview";
      host.querySelectorAll("[data-section]").forEach(button => {
        const active = button.dataset.section === view.section;
        button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
      });
      $("#overviewPanel").hidden = view.section !== "overview";
      $("#levelsPanel").hidden = view.section !== "levels";
    }
    $("#" + closeId).addEventListener("click", () => options.onClose?.());
    $(`[data-${id}-back]`).addEventListener("click", () => options.onBack?.());
    $(`[data-${id}-building]`).addEventListener("change", event => options.onBuilding?.(event.target.value));
    host.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => section(button.dataset.section)));
    $(".clan-building-tabs").addEventListener("keydown", event => {
      if (!event.target.closest("[data-section]") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); section(event.key === "Home" ? "overview" : event.key === "End" ? "levels" : view.section === "overview" ? "levels" : "overview");
      $("#tab-" + view.section).focus();
    });
    section(view.section);
    for (const [selector, top] of Object.entries(scroll)) $(selector).scrollTop = top;
    if (focused) host.querySelector("#" + CSS.escape(focused))?.focus({preventScroll: true});
    const projectKey = project ? `${project.id}:${project.targetLevel}:${project.progressStartedAtMs}` : "";
    function tick() {
      if (!project) return;
      const paused = !project.progressStartedAtMs || tower.attackBlocked || tower.wallIntegrityBps < 10000;
      const remaining = paused ? project.remainingMs : Math.max(0, project.progressStartedAtMs + project.remainingMs - Date.now());
      $("[data-project-time]").textContent = `${paused ? "Paused · " : ""}${remaining ? duration(remaining) + " remaining" : "Awaiting confirmation"}`;
      if (!paused && !remaining && view.countdownRefreshKey !== projectKey) {view.countdownRefreshKey = projectKey; options.onCountdownComplete?.();}
    }
    tick();
    const dialog = host.closest("dialog"), clock = project ? global.setInterval(tick, 1000) : 0;
    const cleanup = () => {if (clock) global.clearInterval(clock); dialog?.removeEventListener("close", cleanup);};
    host._clanTowerClockCleanup = cleanup; dialog?.addEventListener("close", cleanup, {once: true});
    host.dataset[`${id}Ready`] = "true";
  }
  global.CrownlandsClanTowerBuildingsUi = Object.freeze({ render, frame, mountPendingMechanics });
})(window);
