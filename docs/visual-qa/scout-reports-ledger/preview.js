"use strict";
// Fixed, synthetic presentation samples. No game imports, storage or service calls.
const dialog = document.getElementById("reportDialog"), body = document.getElementById("reportBody"), nav = document.getElementById("sections");
const samples = new Set(["success", "reinforced", "damaged", "near-expiry", "camp", "scouted", "scouted-camp", "scouted-unavailable", "blocked", "failed", "expired", "replaced", "legacy", "long"]);
const sprite = "assets/icons/battle-reports-ledger-r1.svg";
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const num = value => typeof value === "number" ? value.toLocaleString("en-US") : esc(value);
const icon = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="${sprite}#${name}"></use></svg>`;
const art = (name, cls = "") => `<img class="${cls}" src="assets/icons/${name === "troops" ? "daily-login-troops-r1.svg" : `skills/${name}.svg`}" alt="">`;
const ruler = name => `<button class="ruler-link" data-ruler="${esc(name)}">${esc(name)}</button>`;
const section = (id, name, mark, content, note = "") => `<section id="${id}" data-label="${name}"><div class="section-heading">${mark}<h3>${name}</h3>${note ? `<span>${note}</span>` : ""}</div>${content}</section>`;
const skillNames = { shieldwallDiscipline: "Shieldwall Discipline", stoneworks: "Stoneworks", fieldMedics: "Field Medics", guildCharters: "Guild Charters", swordmastery: "Swordmastery", marchOrders: "March Orders", taxStewardship: "Tax Stewardship", royalGranaries: "Royal Granaries" };
const defenseSkills = ["shieldwallDiscipline", "stoneworks", "fieldMedics", "guildCharters"], attackSkills = ["swordmastery", "marchOrders", "taxStewardship", "royalGranaries"];
let current, observer;

function example(sample) {
  const report = {
    sample, mode: "intel", target: "Thornfield", region: "The Crownlands", targetType: "City", level: 2,
    player: "Aldric", playerLevel: 24, owner: "Lady Maeve", age: "2m 14s", remaining: "7m 46s", status: "INTELLIGENCE RECOVERED",
    ownerTroops: 15000, troops: 15000, ownerPower: 23010, garrisonPower: 23010, totalDefense: 58460, baseDefense: 48558,
    ownerFormula: "1.30 base · Shieldwall +10% · objective +5% · Gatehouse gear +3%",
    fullWallPower: 35450, wallPower: 35450, integrity: 100, repair: "Fully repaired now", repairWindow: "16-minute full-breach repair window",
    wallBase: 29058, stoneworksPower: 5811, wallGearPower: 581, defenderGear: "+3%", wallGear: "+2%", reinforcements: [],
    skills: { shieldwallDiscipline: [5, 10], stoneworks: [10, 20], fieldMedics: [3, 6], guildCharters: [4, 8], swordmastery: [8, 16], marchOrders: [3, 6], taxStewardship: [6, 12], royalGranaries: [5, 10] }, baseAttack: "+25%"
  };
  if (["reinforced", "damaged", "near-expiry", "scouted", "long"].includes(sample)) {
    report.reinforcements = [{ name: "Thane Rowan", troops: 5000, power: 7280, formula: "1.30 base · Shieldwall +6% · personal +2% · clan +1% · owner gear +3%" }];
    Object.assign(report, { troops: 20000, garrisonPower: 30290, totalDefense: 65740, baseDefense: 55058 });
  }
  if (sample === "damaged") Object.assign(report, { integrity: 40, wallPower: 14180, totalDefense: 44470, baseDefense: 37623, repair: "Full repair in 9m 36s", age: "4m 20s", remaining: "5m 40s" });
  if (sample === "near-expiry") Object.assign(report, { age: "9m 40s", remaining: "20s", urgent: true });
  if (["camp", "scouted-camp"].includes(sample)) Object.assign(report, {
    camp: true, target: "Warband Camp", targetType: "Reward camp", owner: "Lord Edric", troops: 18000, ownerTroops: 18000,
    ownerPower: 18000, garrisonPower: 18000, totalDefense: 18000, baseDefense: 18000, ownerFormula: "1.00 power per troop", reinforcements: []
  });
  if (sample.startsWith("scouted")) Object.assign(report, {
    mode: "disclosure", owner: report.player, intruder: "Lady Maeve", target: report.camp ? "Warband Camp" : "Oakbridge",
    source: "Thornfield", sourceRegion: "The Crownlands", age: "4m 12s", timestamp: "14 September 2026 · 10:42:18", status: "YOU WERE SCOUTED",
    unavailable: sample === "scouted-unavailable"
  });
  const reasons = {
    blocked: ["SCOUT BLOCKED", "Your scout was blocked", "The target was protected by Veil of Silence. Your scout returned no usable intelligence.", "3m 10s"],
    failed: ["SCOUT FAILED", "No intelligence recovered", "Your scout did not return usable intelligence from this holding.", "6m 18s"],
    expired: ["INTELLIGENCE EXPIRED", "This intelligence has expired", "The ten-minute intelligence window has ended. Send a new scout from the holding to obtain an updated report.", "10m 01s"],
    replaced: ["INTELLIGENCE REPLACED", "A newer scout superseded this report", "The newer successful scout replaced this snapshot. Open the current intelligence from the holding or Reports.", "5m 08s"]
  };
  if (reasons[sample]) {
    const [status, emptyTitle, reason, age] = reasons[sample];
    // These states intentionally receive no troop, defense or skill data.
    return { sample, mode: "unavailable", status, emptyTitle, reason, age, target: report.target, targetType: report.targetType, region: report.region, level: report.level };
  }
  if (sample === "legacy") Object.assign(report, {
    legacy: true, ownerPower: null, ownerFormula: "City owner", garrisonPower: null, totalDefense: 51050, baseDefense: 44658,
    cityDefense: 600, cityDefensePercent: "+4%", integrity: null, repair: null
  });
  if (sample === "long") {
    Object.assign(report, { target: "The Watchtower of Saint Bartholomew", player: "Lady Eleonora of the Northern Marches", owner: "Lord Maximilian of the Silver Company" });
    report.reinforcements[0].name = "Thane Theobald of the Western Watch";
    // Large values are scaled illustration data, not a combat calculation.
    for (const key of ["ownerTroops", "troops", "ownerPower", "garrisonPower", "totalDefense", "baseDefense", "fullWallPower", "wallPower", "wallBase", "stoneworksPower", "wallGearPower"]) report[key] *= 100;
    for (const row of report.reinforcements) { row.troops *= 100; row.power *= 100; }
  }
  return report;
}

function targetMeta(report) {
  return `${report.camp ? "Reward camp · No level · No walls" : `${esc(report.targetType)} · Level ${report.level}`} · ${esc(report.region)}`;
}
function heading(report) {
  const title = report.mode === "disclosure" ? "A scout reached your holding" : report.mode === "unavailable" ? "No current intelligence" : "Your scout returned";
  const seal = report.mode === "disclosure" ? "You were scouted" : report.mode === "unavailable" ? "Unavailable" : "Scout successful";
  return `<div class="scout-heading"><div class="scout-target"><span class="eyebrow">${title}</span><h2>${esc(report.target)}</h2><p>${targetMeta(report)}</p></div><div class="seal ${report.mode !== "intel" ? "alert" : ""}">${icon("scout")}<div><strong>${seal}</strong><small>${report.mode === "intel" ? "1 troop · field intelligence" : report.mode === "disclosure" ? "Information disclosed" : esc(report.status)}</small></div></div></div>`;
}
function identity(name, role, meta, self) {
  return `<div class="ruler ${self ? "self" : "other"}">${icon(self ? "flag-crown" : "flag-cross", "flag")}<div><small>${role}</small>${ruler(name)}<small>${meta}</small></div></div>`;
}
function identityStrip(report) {
  return `<div class="ruler-strip">${identity(report.player, "Your ruler", `Hero Lv ${report.playerLevel}`, true)}<div class="route-mark">${icon("open")}Scouted</div>${identity(report.owner, report.camp ? "Camp holder" : "City owner", report.camp ? "Camp defenders" : `City Lv ${report.level}`, false)}</div>`;
}
function metric(mark, label, value, help, cls = "") {
  return `<div class="intel-metric ${cls}">${mark}<div><span>${label}</span><strong>${num(value)}</strong>${help ? `<small>${help}</small>` : ""}</div></div>`;
}
function intelOverview(report) {
  const metrics = [metric(art("troops"), "Scouted troops", report.troops, `${num(report.ownerTroops)} owner · ${num(report.troops - report.ownerTroops)} support`), metric(icon("defense"), "Total defense power", report.totalDefense, `Base ${num(report.baseDefense)} · ${report.camp ? "fixed troop power" : `+${num(report.totalDefense - report.baseDefense)} bonus`}`, "total")];
  if (!report.camp && !report.legacy) metrics.push(metric(art("stoneworks"), "Wall integrity at scout time", `${report.integrity}%`, report.repair));
  return `<section id="overview" data-label="Overview">${heading(report)}${identityStrip(report)}<div class="intel-metrics ${metrics.length === 2 ? "two" : ""}">${metrics.join("")}</div><p class="snapshot-note">${report.urgent ? "Intelligence is about to expire. " : ""}This is a snapshot at scout time. Defenders and walls may change before an army arrives.</p></section>`;
}
function garrisonRow(name, role, troops, power, formula, support = false) {
  return `<tr><td><div class="troop-label">${icon(support ? "realm" : "defense")}<div>${ruler(name)}<small>${role}${formula ? ` · ${esc(formula)}` : ""}</small></div></div></td><td><strong>${num(troops)}</strong></td><td><strong>${power === null ? "Not recorded" : num(power)}</strong></td></tr>`;
}
function defense(report) {
  const rows = garrisonRow(report.owner, report.camp ? "Camp holder" : "City owner", report.ownerTroops, report.ownerPower, report.ownerFormula)
    + report.reinforcements.map(row => garrisonRow(row.name, "Clan reinforcement", row.troops, row.power, row.formula, true)).join("");
  const garrisonTotal = `<tr class="table-total"><th scope="row">${report.camp ? "All camp defenders" : "Garrison layer"}</th><td><strong>${num(report.troops)}</strong></td><td><strong>${report.garrisonPower === null ? "Not recorded" : num(report.garrisonPower)}</strong></td></tr>`;
  const layers = report.camp ? `<tr><td><strong>Walls</strong><small>Camp objectives have no wall layer</small></td><td>—</td><td><strong>0</strong></td></tr>` : report.legacy
    ? `<tr><td><strong>City defense</strong><small>Level ${report.level} · ${report.cityDefensePercent}</small></td><td>—</td><td><strong>${num(report.cityDefense)}</strong></td></tr><tr><td><strong>City walls</strong><small>Base ${num(report.wallBase)} · recorded bonus ${num(report.wallPower - report.wallBase)}</small></td><td>—</td><td><strong>${num(report.wallPower)}</strong></td></tr>`
    : `<tr><td><strong>Current wall layer</strong><small>${report.integrity}% of ${num(report.fullWallPower)} full power · base wall + Stoneworks · Gatehouse gear ${report.wallGear}</small></td><td>—</td><td><strong>${num(report.wallPower)}</strong></td></tr>`;
  const table = `<table class="scout-table"><caption class="sr-only">Scouted defenders, their troop counts and defense power</caption><thead><tr><th scope="col">Defenders &amp; sources</th><th scope="col">Troops</th><th scope="col">Defense power</th></tr></thead><tbody>${rows}${garrisonTotal}${layers}</tbody></table><div class="defense-total"><div><span>Total defense</span><small>${report.camp ? "Camp troops only" : report.legacy ? "Recorded troops, city defense and walls" : "Garrison layer + current wall layer"} · Base ${num(report.baseDefense)}</small></div><strong>${num(report.totalDefense)}</strong></div>`;
  return section("defense", "Enemy defense", icon("defense", "section-art"), table, report.reinforcements.length ? "Owner + clan reinforcements" : "No stationed reinforcements");
}
function walls(report) {
  if (report.legacy) return section("walls", "Walls", art("stoneworks", "section-art"), `<div class="wall-summary">${art("stoneworks")}<div><strong>${num(report.wallPower)} wall power</strong><small>Base ${num(report.wallBase)} · recorded bonus ${num(report.wallPower - report.wallBase)}</small><small>Wall integrity and repair timing were not recorded in this snapshot.</small></div></div>`);
  return section("walls", "Walls", art("stoneworks", "section-art"), `<div class="wall-ledger"><div class="wall-summary">${art("stoneworks")}<div><span class="eyebrow">Integrity at scout time</span><strong>${report.integrity}% intact</strong><div class="integrity-track" aria-hidden="true"><span style="width:${report.integrity}%"></span></div><small>${report.repair}</small><small>${report.repairWindow}; hits add proportional time and handoffs preserve it.</small></div></div><dl class="wall-breakdown"><div><dt>Base walls</dt><dd>${num(report.wallBase)}</dd></div><div><dt>Stoneworks · +${report.skills.stoneworks[1]}%</dt><dd>+${num(report.stoneworksPower)}</dd></div><div><dt>Gatehouse wall gear · ${report.wallGear}</dt><dd>+${num(report.wallGearPower)}</dd></div><div><dt>Full wall power</dt><dd>${num(report.fullWallPower)}</dd></div><div><dt>Current wall power · ${report.integrity}%</dt><dd>${num(report.wallPower)}</dd></div></dl></div>`);
}
function skillCard(report, keys, title, base = false) {
  return `<div class="skill-card"><h4>${title}</h4>${keys.map(key => `<div class="skill-row">${art(key)}<span>${skillNames[key]}</span><small>Lv ${report.skills[key][0]}</small><strong>+${report.skills[key][1]}%</strong></div>`).join("")}${base ? `<div class="base-attack"><span>Base attack</span><strong>${report.baseAttack}</strong></div>` : ""}</div>`;
}
function skills(report, disclosed = false) {
  return section("skills", disclosed ? "Skills they saw" : "Enemy skills", art("swordmastery", "section-art"), `<div class="skills-grid">${skillCard(report, defenseSkills, disclosed ? "Defense & support" : "Enemy defense stats")}${skillCard(report, attackSkills, disclosed ? "Attack & economy" : "Enemy attack stats", !disclosed)}</div>`, "Recorded levels & bonuses");
}
function campRules() {
  return section("camp-rules", "Camp rules", icon("realm", "section-art"), `<div class="disclosure-note"><strong>Fixed troop power</strong><br>Every stationed troop contributes exactly 1.00 defense power. Camp levels, walls, Stoneworks, Shieldwall, and objective bonuses do not apply.</div>`);
}
function disclosure(report) {
  const intro = `<section id="overview" data-label="Overview">${heading(report)}<div class="ruler-strip">${identity(report.player, "Your ruler", `Hero Lv ${report.playerLevel}`, true)}<div class="route-mark">${icon("scout")}Seen by</div>${identity(report.intruder, "Enemy scout", "Scouting ruler", false)}</div><div class="disclosure-route"><div><span>Scouted from</span><strong>${esc(report.source)}</strong><small>${esc(report.sourceRegion)}</small></div>${icon("open")}<div><span>Your holding</span><strong>${esc(report.target)}</strong></div><div class="exact-time"><span>When you were scouted</span><time>${report.timestamp}</time></div></div><div class="disclosure-note"><strong>${esc(report.intruder)}</strong> scouted <strong>${esc(report.target)}</strong>. ${report.unavailable ? "The detailed disclosure is unavailable." : "The sections below show what that scout saw at the time."}</div></section>`;
  if (report.unavailable) return intro + section("disclosure", "What they saw", icon("dispatch", "section-art"), `<div class="empty-row">Details unavailable. No troop, defense, or skill values are recorded in this disclosure.</div>`);
  const metrics = [["Total troops seen", report.troops], [report.camp ? "Camp holder troops" : "City-owner garrison", report.ownerTroops], ["Reinforcement troops", report.troops - report.ownerTroops], ["Total defense", report.totalDefense]];
  if (!report.camp) metrics.push([`Wall integrity · Lv ${report.level}`, `${report.integrity}%`]);
  const seen = section("disclosure", "What they saw", icon("dispatch", "section-art"), `<div class="disclosure-metrics" style="grid-template-columns:repeat(${metrics.length},minmax(0,1fr))">${metrics.map(([label, value]) => `<div><span>${label}</span><strong>${num(value)}</strong></div>`).join("")}</div>`, "At the time of scouting");
  const reinforcements = section("reinforcements", "Reinforcements they saw", icon("realm", "section-art"), report.reinforcements.length
    ? `<table class="scout-table"><caption class="sr-only">Reinforcements disclosed to the enemy scout</caption><thead><tr><th scope="col">Ruler</th><th scope="col">Troops seen</th></tr></thead><tbody>${report.reinforcements.map(row => `<tr><td>${ruler(row.name)}<small>Reinforcing your holding</small></td><td><strong>${num(row.troops)}</strong></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-row">The scout saw no stationed reinforcements.</div>`);
  return intro + seen + reinforcements + (report.camp ? "" : skills(report, true));
}
function unavailable(report) {
  return `<section id="overview" data-label="Overview">${heading(report)}<div class="empty-intel">${icon("dispatch")}<span class="eyebrow">${report.status}</span><h3>${report.emptyTitle}</h3><p>${report.reason}</p><p class="privacy-note">Failed, blocked, replaced, or expired scouts do not reveal hidden troop or defense statistics.</p></div></section>`;
}
function setTiming(report) {
  let ending = "";
  if (report.mode === "intel") ending = `<div class="expiry ${report.urgent ? "urgent" : ""}"><small>${report.urgent ? "Expiring soon" : "Expires in"}</small><strong>${report.remaining}</strong></div>`;
  else if (report.mode === "disclosure") ending = `<div class="expiry inactive"><small>Status</small><strong>Scouted</strong></div>`;
  else ending = `<div class="expiry inactive"><small>Intelligence</small><strong>Unavailable</strong></div>`;
  document.getElementById("reportTiming").innerHTML = `<div><small>Report age</small><strong>${report.age}</strong></div>${ending}`;
}
function status(message) {
  document.getElementById("liveStatus").textContent = message;
  parent.postMessage({ type: "scout-status", message }, location.origin);
}
function render(sample) {
  current = example(samples.has(sample) ? sample : "success");
  observer?.disconnect();
  document.getElementById("reportTitle").textContent = current.mode === "disclosure" ? "You Were Scouted" : "Scout Report";
  document.getElementById("footerRule").textContent = current.mode === "intel" ? "Scout intelligence · ten-minute lifetime" : current.mode === "disclosure" ? "Recorded disclosure · information seen at scout time" : "No current intelligence";
  setTiming(current);
  body.innerHTML = current.mode === "intel" ? intelOverview(current) + defense(current) + (current.camp ? campRules() : walls(current) + skills(current)) : current.mode === "disclosure" ? disclosure(current) : unavailable(current);
  const sections = [...body.querySelectorAll("section[data-label]")];
  nav.innerHTML = sections.map((node, index) => `<button data-section="${node.id}" aria-current="${index === 0 ? "location" : "false"}">${node.dataset.label === "Enemy defense" ? "Defenses" : node.dataset.label === "Enemy skills" ? "Skills" : node.dataset.label === "Reinforcements they saw" ? "Support" : node.dataset.label}</button>`).join("");
  body.scrollTop = 0;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
  }, { root: body, rootMargin: "0px 0px -70% 0px", threshold: 0 });
  sections.forEach(node => observer.observe(node));
  if (!dialog.open) dialog.showModal();
  // Start at the header; keep modal's initial focus from scrolling report content.
  document.querySelector(".back-button").focus({ preventScroll: true });
}
function setActive(id) {
  nav.querySelectorAll("button").forEach(button => button.setAttribute("aria-current", button.dataset.section === id ? "location" : "false"));
}
nav.addEventListener("click", event => {
  const button = event.target.closest("[data-section]");
  if (!button) return;
  const target = document.getElementById(button.dataset.section);
  body.scrollTop += target.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  setActive(target.id);
});
document.addEventListener("click", event => {
  const player = event.target.closest("[data-ruler]");
  if (player) return status(`Ruler profile · ${player.dataset.ruler}. The game would open this ruler's profile.`);
  const action = event.target.closest("[data-action]");
  if (action) status(action.dataset.action === "Reports" ? "Back to reports · the game would return to your report list." : `View map · the game would locate ${current.target}.`);
});
document.getElementById("close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => status("Scout Report closed. Use Open Scout Report to reopen this example."));
document.getElementById("reopen").addEventListener("click", () => { dialog.showModal(); status("Scout Report reopened."); });
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === parent && event.data?.type === "scout-review") render(event.data.sample);
});
render(new URLSearchParams(location.search).get("sample") || "success");
