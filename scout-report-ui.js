/* Approved Scout Reports presentation. Existing game helpers own snapshots, availability and timers. */
(function (root) {
  "use strict";
  const sprite = "assets/icons/battle-reports-ledger-r1.svg";
  const defenseSkills = ["shieldwallDiscipline", "stoneworks", "fieldMedics", "guildCharters"];
  const attackSkills = ["swordmastery", "marchOrders", "taxStewardship", "royalGranaries"];
  const esc = value => escapeHtml(String(value ?? ""));
  const number = value => value == null || !Number.isFinite(Number(value)) ? "Not recorded" : esc(Number(value).toLocaleString("en-US"));
  const percent = value => Math.max(0, Number(value) || 0).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  const icon = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="${sprite}#${name}"></use></svg>`;
  const art = (name, cls = "") => `<img class="${cls}" src="assets/icons/${name === "troops" ? "daily-login-troops-r1.svg" : `skills/${name}.svg`}" alt="" decoding="async">`;
  const flag = id => `<span id="${id}" class="kingdom-flag flag" aria-hidden="true"><span class="flag-symbol"></span></span>`;
  const player = (uid, name) => renderPlayerNameLink(uid, name || "Unknown ruler", "ruler-link");

  function section(id, title, mark, content, note = "", label = title) {
    return `<section id="scoutDetail-${id}" data-scout-section="${id}" data-scout-label="${esc(label)}"><div class="section-heading">${mark}<h3 tabindex="-1">${title}</h3>${note ? `<span>${esc(note)}</span>` : ""}</div>${content}</section>`;
  }
  function identity(uid, name, role, meta, self, flagId) {
    return `<div class="ruler ${self ? "self" : "other"}">${flag(flagId)}<div><small>${esc(role)}</small>${player(uid, name)}<small>${esc(meta)}</small></div></div>`;
  }
  function heading({ name, meta, disclosure = false, unavailable = false, badge }) {
    return `<div class="scout-heading"><div class="scout-target"><span class="eyebrow">${disclosure ? "A scout reached your holding" : unavailable ? "No current intelligence" : "Your scout returned"}</span><h2 tabindex="-1">${esc(name)}</h2><p>${esc(meta)}</p></div><div class="seal${disclosure || unavailable ? " alert" : ""}">${icon("scout")}<div><strong>${disclosure ? "You were scouted" : unavailable ? "Unavailable" : "Scout successful"}</strong><small>${disclosure ? "Information disclosed" : unavailable ? esc(badge.label) : "1 troop · field intelligence"}</small></div></div></div>`;
  }
  function metric(mark, label, value, help, cls = "") {
    return `<div class="intel-metric ${cls}">${mark}<div><span>${label}</span><strong>${value}</strong>${help ? `<small>${help}</small>` : ""}</div></div>`;
  }
  function totalHelp(base, total) {
    // Display the recorded total even when damaged walls put it below the stored base.
    const difference = Number(total) - Number(base);
    return `Base ${number(base)} · ${difference < 0 ? "−" : "+"}${number(Math.abs(difference))} ${difference < 0 ? "net adjustment" : "bonus"}`;
  }
  function shell(report, content, timing, disclosure = false, unavailable = false) {
    const footer = disclosure ? "Recorded disclosure · information seen at scout time" : unavailable ? "No current intelligence" : "Scout intelligence · ten-minute lifetime";
    return `<div class="report-shell scout-ledger-shell"><header class="window-header"><button id="battleReportBackBtn" class="back-button" type="button" aria-label="Back to reports" data-audio-effect="none"><span aria-hidden="true">‹</span> Reports</button><div class="heading"><p>ROYAL DISPATCHES</p><h2>${disclosure ? "You Were Scouted" : "Scout Report"}</h2></div><div class="header-mark">${icon("scout")}<span>FIELD INTELLIGENCE</span></div>${renderBattleReportLocateButton(report, "scout-report-locate map-button")}<button class="close-button" type="button" data-scout-close aria-label="Close Scout Report">×</button></header><div class="navigation-strip"><nav class="section-nav" aria-label="Scout report sections"></nav><div class="report-timing">${timing}</div></div><div class="report-body" tabindex="0" aria-label="Scout report">${content}</div><footer class="report-footer"><span>${footer}</span><span>Scroll for the full account</span></footer></div>`;
  }
  function skillCard(report, keys, title, disclosure = false, base = false) {
    return `<div class="skill-card"><h4>${title}</h4>${keys.map(key => {
      const level = disclosure ? report.skills?.[key]?.level : report[`${key}Level`];
      const bonus = disclosure ? report.skills?.[key]?.percent : report[`${key}Percent`];
      return `<div class="skill-row">${art(key)}<span>${esc(SKILL_CONFIG[key]?.label || key)}</span><small>Lv ${number(level || 0)}</small><strong>+${number(bonus || 0)}%</strong></div>`;
    }).join("")}${base ? `<div class="base-attack"><span>Base attack</span><strong>+${number(report.baseAttackPercent || 0)}%</strong></div>` : ""}</div>`;
  }
  function skills(report, disclosure = false) {
    return section("skills", disclosure ? "Skills they saw" : "Enemy skills", art("swordmastery", "section-art"), `<div class="skills-grid">${skillCard(report, defenseSkills, disclosure ? "Defense &amp; support" : "Enemy defense stats", disclosure)}${skillCard(report, attackSkills, disclosure ? "Attack &amp; economy" : "Enemy attack stats", disclosure, !disclosure)}</div>`, "Recorded levels & bonuses", disclosure ? "Skills they saw" : "Skills");
  }
  function defenderRow(uid, name, role, troops, power, formula = "", support = false) {
    return `<tr><td><div class="troop-label">${icon(support ? "realm" : "defense")}<div>${player(uid, name)}<small>${esc(role)}${formula ? ` · ${esc(formula)}` : ""}</small></div></div></td><td><strong>${number(troops)}</strong></td><td><strong>${number(power)}</strong></td></tr>`;
  }
  function defense(m) {
    const { report, rewardCampTarget: camp, siege, soldierDefenseEnabled: soldier } = m;
    const ownerFormula = camp ? "1.00 power per troop" : soldier ? `1.30 base · Shieldwall +${formatNumber(report.shieldwallDisciplinePercent || 0)}% · objective +${formatNumber(siege?.troopObjectiveDefenseBonusPercent || 0)}%${m.defenderGearCopy}` : "";
    const rows = defenderRow(m.reportedOwnerUid, m.reportedOwnerName, camp ? "Camp holder" : "City owner", m.ownerTroops, camp ? m.ownerTroops : soldier && siege ? siege.ownerGarrisonDefensePower : null, ownerFormula)
      + m.reinforcements.map(row => defenderRow(row.ownerUid, row.ownerName, "Clan reinforcement", row.troops, camp ? row.troops : soldier ? row.effectivePower : null, camp ? "1.00 power per troop" : soldier ? `${row.baseDefensePowerPerTroop.toFixed(2)} base · Shieldwall +${formatNumber(row.shieldwallDisciplinePercent)}% · personal +${formatNumber(row.personalDefenseBonusPercent)}% · clan +${formatNumber(row.sharedDefenseBonusPercent)}%${row.gearDefenderStrengthPercent > 0 ? ` · owner gear +${percent(row.gearDefenderStrengthPercent)}%` : ""}` : "", true)).join("");
    const formula = soldier && siege ? `${Number(report.baseDefensePowerPerTroop || BASE_TROOP_DEFENSE_POWER).toFixed(2)} base per soldier · Shieldwall +${formatNumber(report.shieldwallDisciplinePercent || 0)}% · objective +${formatNumber(siege.troopObjectiveDefenseBonusPercent || report.strongholdDefenseBonusPercent || 0)}%${m.defenderGearCopy}` : "Owner and reinforcement troop defense";
    const garrison = `<tr class="table-total"><th scope="row">${camp ? "All camp defenders" : "Garrison layer"}${!camp ? `<small>${esc(formula)}</small>` : ""}</th><td><strong>${number(report.troops)}</strong></td><td><strong>${number(camp ? report.troops : siege?.garrisonDefensePower)}</strong></td></tr>`;
    const layer = (label, help, power) => `<tr><td><strong>${label}</strong><small>${help}</small></td><td>—</td><td><strong>${number(power)}</strong></td></tr>`;
    const walls = camp ? layer("Walls", "Camp objectives have no wall layer", 0) : siege
      ? layer("Current wall layer", `${esc(formatWallIntegrity(siege.startingIntegrityBps))} of ${number(siege.fullWallPower)} full power · base wall + Stoneworks${esc(m.wallGearCopy)}`, siege.startingWallPower)
      : layer("City defense", `Level ${number(m.cityLevel)} · +${number(m.defensePercent)}%`, m.cityDefenseBonus) + layer("City walls", `Base ${number(m.baseCityWalls)} · recorded bonus +${number(Math.max(0, m.cityWalls - m.baseCityWalls))}`, m.cityWalls);
    return section("defense", "Enemy defense", icon("defense", "section-art"), `<table class="scout-table"><caption class="sr-only">Scouted defenders, troop counts and defense power</caption><thead><tr><th scope="col">Defenders &amp; sources</th><th scope="col">Troops</th><th scope="col">Defense power</th></tr></thead><tbody>${rows}${garrison}${walls}</tbody></table><div class="defense-total"><div><span>Total defense</span><small>${totalHelp(m.baseTotalDefense, report.totalDefense)}</small></div><strong>${number(report.totalDefense)}</strong></div>`, m.reinforcements.length ? "Owner + clan reinforcements" : "No stationed reinforcements", "Defenses");
  }
  function walls(m) {
    const { siege, report } = m;
    if (!siege) return section("walls", "Walls", art("stoneworks", "section-art"), `<div class="wall-summary">${art("stoneworks")}<div><strong>${number(m.cityWalls)} wall power</strong><small>Base ${number(m.baseCityWalls)} · recorded bonus +${number(Math.max(0, m.cityWalls - m.baseCityWalls))}</small><small>Wall integrity and repair timing were not recorded in this snapshot.</small></div></div>`);
    const integrity = clamp(siege.startingIntegrityBps / 100, 0, 100);
    // Scout snapshots store total reinforced walls and percentages, not all modifier power amounts.
    // Keep percentages explicit instead of reconstructing unrecorded combat arithmetic.
    const rows = [["Base walls", number(siege.baseCityWalls)], ["Stoneworks", `+${number(siege.stoneworksPercent ?? report.stoneworksPercent ?? 0)}%`], ["Gatehouse wall gear", `+${percent(m.wallGearPercent)}%`], ["Full wall power", number(siege.fullWallPower)], [`Current wall power · ${formatWallIntegrity(siege.startingIntegrityBps)}`, number(siege.startingWallPower)]];
    const repair = m.siegeRepair.replace("data-fortification-repair-at-ms", "data-scout-repair-mirror");
    return section("walls", "Walls", art("stoneworks", "section-art"), `<div class="wall-ledger"><div class="wall-summary">${art("stoneworks")}<div><span class="eyebrow">Integrity at scout time</span><strong>${esc(formatWallIntegrity(siege.startingIntegrityBps))} intact</strong><div class="integrity-track" aria-hidden="true"><span style="width:${integrity}%"></span></div>${repair}${siege.repairWindowMinutes > 0 ? `<small>${number(siege.repairWindowMinutes)}-minute full-breach window; hits add proportional time and handoffs preserve it.</small>` : ""}</div></div><dl class="wall-breakdown">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join("")}</dl></div>`);
  }
  function renderIntel(m) {
    const { city, report, rewardCampTarget: camp, siege } = m;
    const route = { cityId: city.id, cityName: city.name, regionId: report.regionId || getCityRegionId(city) };
    const meta = [camp ? "Reward camp · No level · No walls" : `${getBattleTargetTypeLabel({ ...city, targetType: report.targetType || "city" })} · Level ${formatNumber(m.cityLevel)}`, getRegionLabel(route.regionId)].join(" · ");
    const identities = `<div class="ruler-strip">${identity(m.currentPlayerUid, state.playerName, "Your ruler", `Hero Lv ${formatNumber(state.character.level)}`, true, "scoutReportPlayerFlag")}<div class="route-mark">${icon("open")}Scouted</div>${identity(m.reportedOwnerUid, m.reportedOwnerName, camp ? "Camp holder" : "City owner", camp ? "Camp defenders" : `City Lv ${formatNumber(m.cityLevel)}`, false, "scoutReportDefenderFlag")}</div>`;
    const metrics = [metric(art("troops"), "Scouted troops", number(report.troops), `${number(m.ownerTroops)} owner · ${number(m.reinforcementTroops)} support`), metric(icon("defense"), "Total defense power", number(report.totalDefense), totalHelp(m.baseTotalDefense, report.totalDefense), "total")];
    if (!camp && siege) metrics.push(metric(art("stoneworks"), "Wall integrity at scout time", esc(formatWallIntegrity(siege.startingIntegrityBps)), m.siegeRepair));
    const overview = `<section id="scoutDetail-overview" data-scout-section="overview" data-scout-label="Overview">${renderOnboardingTip("scout", city, "report")}${heading({ name: city.name, meta })}${identities}<div class="intel-metrics${metrics.length === 2 ? " two" : ""}">${metrics.join("")}</div><p class="snapshot-note">This is a snapshot at scout time. Defenders and walls may change before an army arrives.</p></section>`;
    const campRules = section("camp-rules", "Camp combat rules", icon("realm", "section-art"), '<div class="disclosure-note"><strong>Fixed troop power</strong><br>Every stationed troop contributes exactly 1.00 defense power. Camp levels, walls, Stoneworks, Shieldwall, and objective bonuses do not apply.</div>', "", "Camp rules");
    const timing = `<div><small>Report age</small><strong data-scout-report-age>${esc(formatDuration(m.age))}</strong></div><div class="expiry${m.remaining <= 30 ? " urgent" : ""}"><small data-scout-expiry-label>${m.remaining <= 30 ? "Expiring soon" : "Expires in"}</small><strong data-scout-report-expires>${esc(formatDuration(m.remaining))}</strong></div>`;
    return shell(route, overview + defense(m) + (camp ? campRules : walls(m) + skills(report)), timing);
  }
  function renderDisclosure(report, badge) {
    const disclosure = report.scoutDisclosure, camp = report.targetType === "camp";
    const metadata = [camp ? "Reward camp" : `City · Level ${formatNumber(report.cityLevel)}`, report.regionId ? getRegionLabel(report.regionId) : ""].filter(Boolean).join(" · ");
    const names = `<div class="ruler-strip">${identity(getCurrentOnlineUid(), state.playerName, "Your ruler", `Hero Lv ${formatNumber(state.character.level)}`, true, "scoutedReportPlayerFlag")}<div class="route-mark">${icon("scout")}Seen by</div>${identity(report.opponentUid, report.opponentName, "Enemy scout", "Scouting ruler", false, "scoutedReportAttackerFlag")}</div>`;
    let content = `<section id="scoutDetail-overview" data-scout-section="overview" data-scout-label="Overview">${heading({ name: report.cityName, meta: metadata, disclosure: true, badge })}${names}<div class="disclosure-route"><div><span>Scouted from</span><strong>${esc(report.sourceCityName || "Unknown city")}</strong><small>${esc(report.sourceRegionId ? getRegionLabel(report.sourceRegionId) : "Unknown map")}</small></div>${icon("open")}<div><span>Your holding</span><strong>${esc(report.cityName)}</strong></div><div class="exact-time"><span>When you were scouted</span><time>${esc(getBattleReportExactTime(report))}</time></div></div><div class="disclosure-note"><strong>${esc(report.opponentName || "Unknown ruler")}</strong> scouted <strong>${esc(report.cityName)}</strong>. ${disclosure ? "The sections below show what that scout saw at the time." : "The detailed disclosure is unavailable."}</div></section>`;
    if (disclosure) {
      const metrics = [["Total troops seen", number(disclosure.troops)], [disclosure.targetType === "camp" ? "Camp holder troops" : "City-owner garrison", number(disclosure.ownerTroops)], ["Reinforcement troops", number(disclosure.reinforcementTroops)], ["Total defense", number(disclosure.totalDefense)], ...(disclosure.targetType === "camp" ? [] : [[`Wall integrity · Lv ${formatNumber(disclosure.cityLevel)}`, esc(formatWallIntegrity(disclosure.wallIntegrityBps))]])];
      content += section("disclosure", "What they saw", icon("dispatch", "section-art"), `<div class="disclosure-metrics" style="grid-template-columns:repeat(${metrics.length},minmax(0,1fr))">${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>`, "At the time of scouting");
      const rows = disclosure.reinforcements || [];
      content += section("reinforcements", "Reinforcements they saw", icon("realm", "section-art"), rows.length ? `<table class="scout-table"><caption class="sr-only">Reinforcements disclosed to the enemy scout</caption><thead><tr><th scope="col">Ruler</th><th scope="col">Troops seen</th></tr></thead><tbody>${rows.map(row => `<tr><td>${player(row.ownerUid, row.ownerName)}<small>Reinforcing your holding</small></td><td><strong>${number(row.troops)}</strong></td></tr>`).join("")}</tbody></table>` : '<div class="empty-row">The scout saw no stationed reinforcements.</div>', "", "Support");
      if (disclosure.targetType !== "camp") content += skills(disclosure, true);
    } else content += section("disclosure", "What they saw", icon("dispatch", "section-art"), '<div class="empty-row">Details unavailable. No troop, defense, or skill values are recorded in this disclosure.</div>');
    const timing = `<div><small>Report age</small><strong>${renderBattleReportAge(report)}</strong></div><div class="expiry inactive"><small>Status</small><strong>Scouted</strong></div>`;
    return shell(report, content, timing, true);
  }
  function renderAttempt(report, badge) {
    if (isDefenderScoutReport(report)) return renderDisclosure(report, badge);
    const meta = [report.targetType === "camp" ? "Reward camp · No level · No walls" : `City · Level ${formatNumber(report.cityLevel)}`, report.regionId ? getRegionLabel(report.regionId) : ""].filter(Boolean).join(" · ");
    const explanation = report.summary || "The scout did not return usable intelligence.";
    const content = `<section id="scoutDetail-overview" data-scout-section="overview" data-scout-label="Overview">${heading({ name: report.cityName, meta, unavailable: true, badge })}<div class="empty-intel">${icon("dispatch")}<span class="eyebrow">${esc(badge.label)}</span><h3 tabindex="-1">No current intelligence</h3><p>${renderPlayerLinkedText(explanation, report.opponentUid, report.opponentName || report.ownerName)}</p><p class="privacy-note">Failed, blocked, replaced, or expired scouts do not reveal hidden troop or defense statistics.</p></div></section>`;
    const timing = `<div><small>Report age</small><strong>${renderBattleReportAge(report)}</strong></div><div class="expiry inactive"><small>Intelligence</small><strong>Unavailable</strong></div>`;
    return shell(report, content, timing, false, true);
  }
  function mount(modal, host, closeButton) {
    const panel = host.querySelector(".scout-ledger-shell");
    if (!panel) return;
    modal.classList.add("scout-report-ledger");
    const body = panel.querySelector(".report-body"), nav = panel.querySelector(".section-nav"), sections = [...body.querySelectorAll("[data-scout-section]")];
    nav.innerHTML = sections.map(section => `<button type="button" data-scout-jump="${section.id}">${esc(section.dataset.scoutLabel)}</button>`).join("");
    const update = () => {
      const top = body.getBoundingClientRect().top;
      const active = body.scrollTop <= 1 ? sections[0] : body.scrollTop + body.clientHeight >= body.scrollHeight - 3 ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= top + 35).at(-1) || sections[0];
      nav.querySelectorAll("button").forEach(button => button.setAttribute("aria-current", button.dataset.scoutJump === active?.id ? "location" : "false"));
    };
    nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      const section = sections.find(section => section.id === button.dataset.scoutJump);
      body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
      section.querySelector("h2,h3")?.focus({ preventScroll: true });
      update();
    }));
    panel.querySelector("[data-scout-close]").addEventListener("click", () => closeButton.click());
    const map = panel.querySelector(".map-button");
    if (map) map.innerHTML = icon("map") + "<span>View map</span>";
    body.addEventListener("scroll", update, { passive: true });
    update();
  }
  function updateTiming(host, remaining) {
    const repair = host.querySelector("[data-fortification-repair-at-ms]");
    if (repair) host.querySelectorAll("[data-scout-repair-mirror]").forEach(label => { label.textContent = repair.textContent; });
    const label = host.querySelector("[data-scout-expiry-label]");
    if (!label) return;
    label.textContent = remaining <= 30 ? "Expiring soon" : "Expires in";
    label.closest(".expiry").classList.toggle("urgent", remaining <= 30);
  }
  root.CrownlandsScoutReportUI = Object.freeze({ renderIntel, renderDisclosure, renderAttempt, mount, updateTiming });
})(window);
