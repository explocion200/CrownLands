(function (root) {
  "use strict";
  const B = root.CrownlandsClanTowerBuildings;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const number = value => Number(value).toLocaleString();
  const time = ms => { const m = Math.max(0, Math.ceil(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };
  function mount(host, tower, options) {
    const scroll = Object.fromEntries([...host.querySelectorAll(".detail-scroll")].map(n => [n.id, n.scrollTop]));
    host._clanTowerClockCleanup?.();
    const id = options.buildingId, def = B.definition(id), level = B.level(tower.buildings?.[id]), next = Math.min(10, level + 1);
    const view = options.view, project = tower.buildingProject, ownProject = project?.buildingId === id;
    const paused = project && (!project.progressStartedAtMs || tower.attackBlocked || tower.wallIntegrityBps < 10000);
    const balance = options.treasuryBalance, manager = tower.ownerMember && tower.permissions?.manage && tower.worldActive !== false;
    const unavailable = tower.clanTowerSupportVersion !== 1;
    const reason = unavailable ? "This building awaits a compatible game server."
      : level === 10 ? "Maximum level reached." : !manager ? "The Clan Leader and Officers manage construction after Tower probation."
      : project ? paused ? "Construction is paused. Progress is saved until the walls are fully repaired and incoming attacks end." : "One building project is already underway. Completed benefits remain active."
      : tower.attackBlocked ? "Wait for the incoming attack to end."
      : tower.wallIntegrityBps < 10000 || tower.repairActive ? "Fully repair the Tower walls before construction."
      : balance == null ? "Clan Treasury balance unavailable. Refresh before upgrading."
      : balance < B.cost(next) ? `The Treasury needs ${number(B.cost(next) - balance)} more Gold.` : "";
    const benefit = l => id === "stables" ? `+${B.bonus(id, l)}% speed` : `${B.intelligenceCapacity(l)} reports`;
    host.innerHTML = root.CrownlandsClanTowerBuildingsUi.frame(tower, id, { icon: B.art(id, level), closeId: "closeSupportBuilding", intelligence: id === "scout_lodge" });
    const $ = selector => host.querySelector(selector);
    $("#balance").textContent = balance == null ? "Unavailable" : number(balance);
    $("#buildingLevel").textContent = level ? `Level ${level} / 10` : "Unbuilt";
    $("#buildingCaption").textContent = def.description;
    $("#levelTrack").innerHTML = Array.from({ length: 10 }, (_, i) => `<span class="${i < level ? "reached" : ""}"></span>`).join("");
    $("#overviewPanel").innerHTML = `<h2 class="section-heading">${esc(def.name)}</h2><p class="section-intro">${esc(def.description)}</p><div class="benefit-comparison"><article class="benefit-card"><small>Current · ${level ? `Level ${level}` : "Unbuilt"}</small><strong>${benefit(level)}</strong></article><span class="comparison-arrow">→</span><article class="benefit-card next"><small>${level === 10 ? "Maximum" : `Next · Level ${next}`}</small><strong>${benefit(next)}</strong></article></div><p class="rules-note">${id === "stables" ? "After one hour in the clan, completed Stables add speed to clan reinforcements and forming-rally contributions. The total army speed bonus remains capped at +200%. Attacks, scouts, own-holding transfers and returns receive no Stables bonus. Accepted marches keep their timing." : "After one hour in the clan, members can explicitly share their own successful scout reports. Capacity is shared by the whole clan. Intelligence keeps its original ten-minute deadline. Losing this Tower ends access; a new owner starts with an empty board."}</p><section class="project-card"><h3>${project ? `${esc(B.definition(project.buildingId)?.name)} · Level ${project.targetLevel}` : "Construction"}</h3><p>${esc(reason || "Ready to begin.")}</p>${project ? '<div class="progress" role="progressbar" aria-label="Construction progress" aria-valuemin="0" aria-valuemax="100"><span></span></div><p data-project-time></p>' : ""}</section>`;
    $("#levelsPanel").innerHTML = `<h2 class="section-heading">All ten levels</h2><table class="levels-table"><thead><tr><th>Level</th><th>Benefit</th><th>Treasury Gold</th><th>Build time</th></tr></thead><tbody>${Array.from({ length: 10 }, (_, i) => `<tr class="${i + 1 === level ? "current" : i === level ? "next" : ""}"><td>${i + 1}</td><td>${benefit(i + 1)}</td><td>${number(B.cost(i + 1))}</td><td>${time(B.duration(i + 1))}</td></tr>`).join("")}</tbody></table><p class="level-footnote">5.115 billion Gold · 85h 30m total. The Workshop does not shorten building projects.</p>`;
    $("#upgradeFacts").innerHTML = level === 10 ? `<div><dt>Maximum benefit</dt><dd>${benefit(level)}</dd></div>` : `<div><dt>${ownProject ? "Gold paid" : `Level ${next} cost`}</dt><dd id="upgradeCost"><img src="assets/optimized/gold-coin-192x192-f2620b39eb0d.webp" alt="Gold">${number(B.cost(next))}</dd></div><div><dt>Build time</dt><dd>${time(B.duration(next))}</dd></div>`;
    const upgrade = $("#upgrade"); upgrade.disabled = Boolean(reason || options.actionBusy);
    upgrade.textContent = level === 10 ? "Maximum level" : options.actionBusy ? "Starting…" : ownProject ? paused ? "Paused" : "In progress" : project ? "Project slot occupied" : level ? `Upgrade to Level ${next}` : "Build Level 1";
    $("#upgradeNote").textContent = view.failed ? view.feedback : reason || "Full cost paid upfront. One building project; no cancellation or refund. Wall work has its own queue.";
    upgrade.addEventListener("click", () => { if (!upgrade.disabled) { upgrade.disabled = true; options.onBuild(); } });
    let stopIntelligence = null;
    function section(value) {
      view.section = ["overview", "levels", ...(id === "scout_lodge" ? ["intelligence"] : [])].includes(value) ? value : "overview";
      for (const button of host.querySelectorAll("[data-section]")) {
        const active = button.dataset.section === view.section; button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
        $("#" + button.getAttribute("aria-controls")).hidden = !active;
      }
      stopIntelligence?.(); stopIntelligence = null;
      if (view.section === "intelligence") {
        const panel = $("#intelligencePanel");
        if (unavailable || !level) panel.textContent = unavailable ? reason : "Build the Scout Lodge to unlock clan intelligence.";
        else stopIntelligence = root.CrownlandsClanIntelligenceUi.mount(panel, { ...options.intelligence, tower });
      }
    }
    host.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => section(button.dataset.section)));
    $(".clan-building-tabs").addEventListener("keydown", event => {
      const tabs = [...host.querySelectorAll("[data-section]")], index = tabs.indexOf(event.target);
      if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
      section(tabs[next].dataset.section); tabs[next].focus();
    });
    $("#closeSupportBuilding").addEventListener("click", options.onClose);
    $(`[data-${id}-back]`).addEventListener("click", options.onBack);
    $(`[data-${id}-building]`).addEventListener("change", event => options.onBuilding(event.target.value));
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.textContent = "Refresh status"; refresh.addEventListener("click", options.onRefresh); $("#overviewPanel").appendChild(refresh);
    function tick() {
      if (!project) return;
      const remaining = paused ? project.remainingMs : Math.max(0, project.progressStartedAtMs + project.remainingMs - Date.now());
      $("[data-project-time]").textContent = `${paused ? "Paused · " : ""}${remaining ? time(remaining) + " remaining" : "Awaiting server confirmation"}`;
      const progress = Math.max(0, Math.min(100, 100 * (1 - remaining / B.duration(project.targetLevel))));
      $(".progress").setAttribute("aria-valuenow", String(Math.floor(progress))); $(".progress span").style.setProperty("--progress", `${progress}%`);
      const key = `${project.id}:${project.targetLevel}:${project.progressStartedAtMs}`;
      if (!paused && !remaining && view.countdownRefreshKey !== key) { view.countdownRefreshKey = key; options.onCountdownComplete(); }
    }
    section(view.section); tick();
    for (const panel of host.querySelectorAll(".detail-scroll")) panel.scrollTop = scroll[panel.id] || 0;
    const clock = root.setInterval(tick, 1000), dialog = host.closest("dialog");
    const cleanup = () => { root.clearInterval(clock); stopIntelligence?.(); stopIntelligence = null; dialog?.removeEventListener("close", cleanup); };
    host._clanTowerClockCleanup = cleanup; dialog?.addEventListener("close", cleanup, { once: true });
    host.dataset.supportBuildingReady = id; host.dataset[id + "Ready"] = "true";
  }
  root.CrownlandsClanSupportBuildingsUi = Object.freeze({ mount });
})(window);
