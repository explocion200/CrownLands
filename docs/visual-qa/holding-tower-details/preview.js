"use strict";
const $ = id => document.getElementById(id);
const number = n => Number(n).toLocaleString("en-US");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const status = message => parent.postMessage({type: "tower-status", message, section}, location.origin);
let tower = TOWER_DEFINITIONS.ravenwatch, sample = "owned", fixture = towerFixture(sample), section = "overview", actionOrigin = null;
const flagRenderer = CrownlandsFlagRenderer.create({config: CrownlandsPlayerFlags, renderIcon: (key, className) => `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true"><use href="assets/flag-symbols/runtime.svg#cl-icon-${key}"></use></svg>`});
const clanHeraldry = CrownlandsClanHeraldryRenderer.create({config: CrownlandsClanHeraldryConfig, assets: CrownlandsClanHeraldryAssets, legacyRenderer: CrownlandsClanHeraldryLegacyV1});
const icon = key => `<img src="${TOWER_ICONS[key]}" alt="">`;
const action = (key, label, style = "paper-button", disabled = false) => `<button class="${style}" data-action="${key}" ${disabled ? "disabled" : ""}>${label}</button>`;
const progress = (value, label) => `<div class="track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></div>`;
function titleBlock(kicker, title, copy) { return `<div class="panel-intro"><p class="eyebrow">${kicker}</p><h2>${title}</h2><p>${copy}</p></div>`; }
function unavailableMarkup() { return `<div class="empty-state">${icon("wall")}<h2>${fixture.unavailable === "loading" ? "Reading the watch ledger…" : "Tower details unavailable"}</h2><p>${fixture.unavailable === "loading" ? "Retrieving the current clan, garrison and wall condition." : "The tower could not be loaded. Return to the map and try again when the connection is ready."}</p></div>`; }
function identityMarkup(f) {
  return `<figure class="tower-plate"><img src="${tower.art}" alt="${esc(tower.name)} illustration"><figcaption>${esc(tower.map)} · The Core</figcaption></figure><div class="controller">${f.neutral ? `<span class="clan-mark" aria-hidden="true">${icon("wall")}</span>` : '<span id="controllingClanFlag" class="clan-flag"></span>'}<div><small>${f.neutral ? "Unclaimed holding" : "Controlling clan"}</small>${f.neutral ? '<strong class="plain-owner">Neutral</strong>' : `<button class="name-link" data-action="clan">${esc(f.clan)} <span>[${esc(f.tag)}]</span></button>`}</div></div><div class="identity-facts"><div><small>Conquest</small><strong>Rally only</strong></div><div><small>Minimum force</small><strong>5 members</strong></div></div><p class="identity-note">A shared military foothold.<br>No passive realm bonus.</p>`;
}
function wallMarkup(f) {
  const copy = f.repair ? "Paid repair in progress · 19m remaining" : f.integrity < 100 ? "Repair required before construction" : "Fortifications fully repaired";
  return `<section class="wall-card ${f.integrity < 100 ? "damaged" : ""}"><div class="section-top"><div><p class="eyebrow">FORTIFICATIONS</p><h2>Wall Level <strong>${number(f.wall)}</strong></h2></div>${icon("wall")}</div><div class="wall-condition"><span>Wall integrity</span><strong>${f.integrity}%</strong></div>${progress(f.integrity, "Wall integrity")}<div class="wall-caption"><span>${number(f.integrity * 100)} / 10,000</span><span>${copy}</span></div></section>`;
}
function troopMarkup(f) {
  return `<div class="strength-grid"><article class="strength-card">${icon("troops")}<div><h3>Stationed defenders</h3><strong>${f.troops === null ? "Hidden" : number(f.troops)}</strong><small>${f.scouted ? "Scout report snapshot" : f.member ? "Combined clan garrison" : "Successful scouting required"}</small></div></article>${f.member ? `<article class="strength-card personal">${icon("march")}<div><h3>Your stationed troops</h3><strong>${number(f.own)}</strong><small>Only you may withdraw them</small></div></article>` : `<article class="strength-card"><div><h3>Conquest requirement</h3><strong>5 rulers</strong><small>Eligible members of one clan</small></div></article>`}</div>`;
}
function veilMarkup(f) {
  return `<div class="veil-strip">${icon("veil")}<div><strong>Veil of Silence</strong><small>${f.member ? `${number(f.veilStored)} stored · Protects this tower only` : "Protects this tower only · Clan and walls stay visible"}</small></div><span>${f.veil ? "7m remaining" : "Inactive"}</span></div>`;
}
function overviewMarkup(f) {
  return `${f.member && !f.eligible ? '<div class="notice"><strong>Tower participation probation</strong><p>Military actions unlock in 18h 24m. New clan members wait 24 hours before participating.</p></div>' : ""}${f.incoming ? '<div class="notice danger"><strong>Enemy rally incoming</strong><p>Construction is paused. Reinforcements may still arrive before battle.</p></div>' : ""}${wallMarkup(f)}${troopMarkup(f)}<p class="intel-note">${f.scouted ? "Scout snapshot · Expires in 12m 18s. Later troop movements are not reflected; a change of ownership invalidates the report." : f.scoutBlocked ? "Veil blocked the scout attempt. Defender counts and the clan roster remain hidden." : f.member ? "Clan garrison information. Each ruler keeps ownership of their contribution." : "Current defenders remain private until a successful scout report. Clan and wall details are public."}</p>${veilMarkup(f)}${f.queue.length ? `<button class="queue-shortcut" data-section="walls"><span>${f.incoming ? "Construction paused" : "Wall upgrade in progress"}<small>Level 12 → 13 · ${f.queue.length} of 10 queue slots used</small></span><strong>${f.incoming ? "Paused" : "6m left"} →</strong></button>` : ""}`;
}
function garrisonMarkup(f) {
  const intro = titleBlock("SHARED DEFENSE", "The clan garrison", "Each ruler's contribution stays personally attributed. All valid defenders fight together.");
  if (!f.member) return intro + `<div class="notice"><strong>Clan roster is private</strong><p>${f.scouted ? `Your scout report reveals ${number(f.troops)} total defenders, but not each ruler's contribution.` : "A successful scout report can reveal the total defending force. Individual contributions are visible to the controlling clan."}</p></div>${action("scout", "Scout Tower")}`;
  return intro + `<div class="garrison-summary"><div><small>Combined defenders</small><strong>${number(f.troops)}</strong></div><div><small>Your contribution</small><strong>${number(f.own)}</strong></div><div><small>Players stationed</small><strong>${f.rows.length}</strong></div></div><div class="garrison-columns" aria-hidden="true"><span>Flag</span><span>Player</span><span>Troops</span></div><ol class="garrison-list">${f.rows.length ? f.rows.map(row => `<li class="${row.self ? "your-row" : ""}"><span class="kingdom-flag player-flag" data-player-flag="${row.uid}" role="img" aria-label="${esc(row.name)}'s flag"><span class="flag-symbol"></span></span><div><strong>${esc(row.name)} ${row.self ? '<em>You</em>' : ""}</strong><small>${row.self ? "Your stationed troops" : "Clan garrison"}</small></div><b aria-label="${number(row.troops)} troops">${number(row.troops)}</b></li>`).join("") : '<li class="empty-row">No troops are stationed here. Reinforce to establish your clan garrison.</li>'}</ol><p class="footnote">Each player attacks or moves with their own contribution. Leaving or being removed from the clan returns their surviving troops to their Main City.</p>`;
}
function queueMarkup(f) {
  const current = f.queue[0];
  return `<section class="wall-queue" aria-label="Wall upgrade queue"><div class="service-section-title"><h3>Upgrade queue</h3><span>${f.queue.length} / 10 occupied</span></div><div class="queue-slots" aria-hidden="true">${Array.from({length:10},(_,i)=>`<span class="${i < f.queue.length ? i === 0 ? "current" : "queued" : ""}"></span>`).join("")}</div>${current ? `<div class="queue-now"><strong>Level ${current.from} → ${current.to}</strong><span>${f.incoming ? "Paused · Incoming attack" : "Building · 6 min left"}</span></div>${progress(40,"Current wall upgrade progress")}<details class="service-details"><summary>View ${f.queue.length} paid upgrade${f.queue.length===1?"":"s"}</summary><ol>${f.queue.map((row,i)=>`<li><strong>Level ${row.from} → ${row.to}</strong><span>${i ? "Queued · 10 min" : f.incoming ? "Paused" : "Building · 6 min left"}</span><small>${number(row.cost)} gold paid</small></li>`).join("")}</ol></details>` : '<p class="service-caption">No upgrades queued. Add levels below.</p>'}</section>`;
}
function veilServiceMarkup(f, cost) {
  const activationReason = f.veil ? "This tower is already protected." : !f.veilStored ? "Purchase a Veil to keep one ready." : "";
  const purchaseReason = !f.veilPurchaseAvailable ? "Daily purchase unavailable." : f.treasury < f.veilCost ? `Need ${number(f.veilCost - f.treasury)} more gold.` : "";
  const state = f.veil ? "Active" : f.member && f.veilStored ? "Ready" : "Inactive";
  return `<article class="defense-pane veil-work">
    <header class="defense-pane-heading">${icon("veil")}<div><h2>Veil of Silence</h2><p>Protection from scouting</p></div><span class="state-chip ${f.veil ? "good" : ""}">${state}</span></header>
    <div class="defense-scroll" tabindex="0" aria-label="Veil status and service">
      <div class="veil-purpose"><h3>Protect this tower only</h3><p>Blocks enemy scouting of this tower. Clan ownership and walls remain visible.</p></div>
      ${f.veil ? '<div class="veil-countdown"><small>Protection ends in</small><strong>7 min</strong></div>' : ""}
      <div class="veil-facts"><div><small>Duration</small><strong>10 <span>min</span></strong></div>${f.member ? `<div><small>Stored Veils</small><strong>${number(f.veilStored)}</strong></div>` : ""}</div>
      ${f.member ? `<section class="veil-activation">
        ${f.manager ? action("veil", f.veil ? "Veil Active" : "Activate Veil", "primary-button", Boolean(activationReason)) : '<p class="service-caption">A Leader or Officer can activate a stored Veil.</p>'}
        ${activationReason ? `<p class="service-blocker ${f.veil ? "calm" : ""}">${activationReason}</p>` : '<p class="service-caption">Uses one stored Veil. Already paid for.</p>'}
      </section>
      <section class="veil-purchase">
        <div class="service-section-title"><h3>Purchase for later</h3><span>${f.veilPurchaseAvailable ? "Available today" : "Unavailable today"}</span></div>
        <div class="veil-purchase-controls">${cost("Purchase price", f.veilCost)}${f.manager ? action("buy-veil", "Purchase Veil", "paper-button", Boolean(purchaseReason)) : ""}</div>
        ${!f.manager ? '<p class="service-caption">A Leader or Officer can purchase using Clan Treasury gold.</p>' : ""}
        ${purchaseReason ? `<p class="service-blocker">${purchaseReason}</p>` : ""}
        <p class="service-caption">Adds to your reserve. Protection starts only when activated.</p>
      </section>` : '<p class="service-privacy">Stored Veils and purchasing are private to the controlling clan.</p>'}
    </div>
  </article>`;
}
function wallsMarkup(f) {
  const slots = 10 - f.queue.length, nextLevel = f.wall + f.queue.length + 1;
  const upgradeReason = f.incoming ? "Upgrades pause during an incoming attack." : f.integrity < 100 || f.repair ? "Repair the walls fully before adding upgrades." : !slots ? "Queue full. Wait for a level to finish." : f.treasury < f.nextCost ? `Need ${number(f.nextCost-f.treasury)} more gold for the next level.` : "";
  const repairReason = f.incoming ? "New repairs cannot start during an incoming attack." : f.treasury < f.repairCost ? `Need ${number(f.repairCost-f.treasury)} more gold.` : "";
  const wallState = f.repair ? "Repairing" : f.integrity < 100 ? "Damaged" : "Intact";
  const cost = (label,value) => `<div class="service-cost"><span>${label}</span><strong>${icon("gold")}${number(value)} <small>gold</small></strong></div>`;
  const topbar = f.member ? `<div class="defense-funds">${icon("gold")}<div><small>Clan Treasury</small><strong>${number(f.treasury)} <span>gold</span></strong></div><p>All services use clan gold.<span>${f.manager ? "You can manage these services." : "Leader & officers can spend. You have view access."}</span></p><span class="service-role">${f.manager ? "Officer" : "View only"}</span></div>` : '<div class="defense-funds public-services"><strong>Public tower status</strong><p>Only the controlling clan can see its treasury and construction.</p></div>';
  let repair = '<p class="wall-ready"><span aria-hidden="true">✓</span> Fully repaired · No repair needed</p>';
  if (f.repair && f.member) repair = `<section class="repair-status"><div class="service-section-title"><h3>Repair in progress</h3><strong>19 min left</strong></div>${progress(37,"Paid repair progress")}<p class="service-caption">37% of repair time elapsed · ${number(f.repairCost)} gold paid</p><small>Continues even during an attack.</small></section>`;
  else if (f.integrity < 100) repair = `<section class="repair-status damaged"><h3>Repair to full integrity</h3>${f.member ? `${cost("Repair cost",f.repairCost)}${f.manager ? action("repair","Start Repair","paper-button",Boolean(repairReason)) : '<p class="service-caption">A leader or officer can start the repair.</p>'}${repairReason ? `<p class="service-blocker">${repairReason}</p>` : ""}<small>Paid repairs continue during attacks.</small>` : '<p class="service-caption">Repairs are managed by the controlling clan.</p>'}</section>`;
  const upgrades = f.member ? `${queueMarkup(f)}<section class="wall-upgrade"><div class="service-section-title"><h3>Add wall levels</h3><span>10 min / level</span></div>${f.manager ? `<div class="upgrade-picker"><label for="levelCount">Levels to add<select id="levelCount" ${f.incoming || f.integrity < 100 || f.repair || !slots ? "disabled" : ""}>${Array.from({length:Math.max(1,slots)},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("")}</select></label>${action("upgrade","Review Upgrade","primary-button",Boolean(upgradeReason))}</div>` : '<p class="service-caption">A leader or officer can queue upgrades.</p>'}${cost(`Level ${nextLevel} price`,f.nextCost)}<p class="service-caption">Single-level price. Review the full cost before queuing more.</p>${upgradeReason ? `<p class="service-blocker">${upgradeReason}</p>` : ""}</section>` : '<p class="service-privacy">Upgrade queues and costs are private to the controlling clan.</p>';
  const wall = `<article class="defense-pane walls-work"><header class="defense-pane-heading">${icon("wall")}<div><h2>Walls</h2><p>Condition &amp; upgrades</p></div><span class="state-chip ${f.integrity < 100 ? "warning" : "good"}">${wallState}</span></header><div class="defense-scroll" tabindex="0" aria-label="Wall condition and upgrades"><div class="wall-readout"><div><small>Wall level</small><strong>${f.wall}</strong></div><div class="wall-health"><div><span>Integrity</span><strong>${f.integrity}%</strong></div>${progress(f.integrity,"Current wall integrity")}<small>${number(f.integrity*100)} / 10,000</small></div></div>${repair}${upgrades}<details class="service-details wall-rules"><summary>Wall rules &amp; costs</summary><p>No wall-level cap. Each upgrade takes 10 minutes and costs 5× the equivalent city level. Items do not speed up construction.</p><p>Fully repair before upgrading. New repairs and upgrades cannot start under attack; construction pauses, but a paid repair continues. Capture removes queued upgrades without a refund.</p><p>Repair cost is 5× the equivalent city repair cost, scaled to damage. Repairs use the base city repair rate.</p></details></div></article>`;
  const veil = veilServiceMarkup(f, cost);
  return `${topbar}<div class="defense-workbench">${wall}${veil}</div>`;
}
function rulesMarkup() {
  const rules = [
    ["Conquer together", "Tower conquest is rally-only: five unique eligible clan members must each contribute at least one troop. New members have a 24-hour Tower participation probation. Ordinary Rally target rules remain separate."],
    ["A clan foothold", "The clan owns the tower and may hold all four. There is no passive realm bonus. Surviving attackers form a garrison with each contribution personally attributed; all valid defenders fight together."],
    ["Personal troop actions", "Issue troop orders from the tower's map controls, just like a city. Eligible members may reinforce; outgoing attacks, movement and rallies use only their own stationed troops. Normal target-driven scouting automatically chooses the closest eligible city or Tower origin."],
    ["Walls & conquest", "Fresh neutral Towers start at Wall Level 1, full integrity and 10,000,000 NPC defenders. That starting rule does not reveal their current force. Capture removes five wall levels, never below Level 1, and sets integrity to zero."],
    ["Construction", "There is no wall-level cap. Up to ten levels may be queued, each taking ten minutes and costing five times the equivalent city wall upgrade. Walls must be fully repaired first. Items and modifiers do not accelerate construction."],
    ["Attacks & repairs", "New repairs and upgrades cannot start under attack. Construction pauses; an existing paid repair continues. Capture loses queued work without a refund. Manual repair costs five times the equivalent city wall cost, scaled to damage, and uses the unmodified city repair rate."],
    ["Veil of Silence", "Leaders and Officers can purchase Veils using Clan Treasury gold and activate stored Veils when needed. Protection lasts ten minutes and affects only the selected Clan Tower. It blocks enemy scouting; public clan and wall details remain visible. It does not consume a Bag item."],
    ["Information & clan changes", "The controlling clan sees its attributed garrison. Other rulers need a valid scout report for total defenders, with ownership changes invalidating the snapshot. Clan departure returns the player's surviving troops to their Main City. Disbanding the clan neutralizes and resets its towers."]
  ];
  return titleBlock("THE TOWER CHARTER", "Hold the ground. Keep the watch.", "The existing rules for shared clan strongpoints.") + `<div class="rules-grid">${rules.map(([h, p]) => `<article><h3>${h}</h3><p>${p}</p></article>`).join("")}</div>`;
}
function selectTab(next, focus = false) {
  if (!["overview", "garrison", "walls", "rules"].includes(next)) return;
  section = next;
  document.querySelectorAll('[role="tab"]').forEach(tab => {const active = tab.dataset.tab === next; tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; $(tab.getAttribute("aria-controls")).hidden = !active; if (active && focus) tab.focus();});
  status(`${tower.name} · ${$(next + "Tab").textContent}`);
}
function render(towerKey, sampleKey, sectionKey = "overview") {
  tower = TOWER_DEFINITIONS[towerKey] || TOWER_DEFINITIONS.ravenwatch;
  sample = TOWER_SAMPLES.includes(sampleKey) ? sampleKey : "owned"; fixture = towerFixture(sample);
  if ($("actionDialog").open) $("actionDialog").close();
  $("towerTitle").textContent = tower.name; $("reopen").textContent = `Open ${tower.name}`;
  const showClanFlag = Boolean(fixture.clanShield && !fixture.unavailable);
  $("towerClanFlag").hidden = !showClanFlag;
  $("towerHeaderIcon").hidden = showClanFlag;
  if (showClanFlag) clanHeraldry.render($("towerClanFlag"), fixture.clanShield, {variant: "micro", label: `${fixture.clan} clan flag`});
  $("quadrant").textContent = `${tower.quadrant} · The Core`;
  document.body.style.setProperty("--tower-map", `url("../../../assets/worlds/core-expansion-v1/maps/${tower.region}.webp")`);
  $("ownership").textContent = fixture.unavailable ? "Awaiting details" : fixture.neutral ? "Neutral" : fixture.member ? "Your clan" : "Rival clan";
  $("ownership").className = `ownership ${fixture.neutral || fixture.unavailable ? "neutral" : fixture.member ? "" : "enemy"}`;
  $("identity").innerHTML = fixture.unavailable ? `<figure class="tower-plate"><img src="${tower.art}" alt="${tower.name}"></figure>` : identityMarkup(fixture);
  if (showClanFlag) clanHeraldry.render($("controllingClanFlag"), fixture.clanShield, {variant: "micro", label: `${fixture.clan} clan flag`});
  $("overview").innerHTML = fixture.unavailable ? unavailableMarkup() : overviewMarkup(fixture);
  $("garrisonPanel").innerHTML = fixture.unavailable ? unavailableMarkup() : garrisonMarkup(fixture);
  fixture.rows.forEach(row => flagRenderer.render(document.querySelector(`[data-player-flag="${row.uid}"]`), row.flag, {stableKey: row.uid, context: "clan-tower-garrison", size: "small"}));
  $("wallsPanel").innerHTML = fixture.unavailable ? unavailableMarkup() : wallsMarkup(fixture);
  $("rulesPanel").innerHTML = rulesMarkup();
  $("footerTitle").textContent = fixture.unavailable ? "Tower state unavailable" : fixture.member ? `${number(fixture.own)} troops under your command` : "Tower conquest · Rally only";
  $("footerHint").textContent = fixture.unavailable ? "Return to the map and try again" : fixture.member && !fixture.eligible ? "Military access unlocks in 18h 24m" : "Issue troop orders from the tower on the map";
  selectTab(["overview", "garrison", "walls", "rules"].includes(sectionKey) ? sectionKey : "overview");
  if (!$("towerDialog").open) $("towerDialog").showModal();
  document.querySelectorAll('.scroll-panel, .identity-column, .detail-column, .defense-scroll').forEach(el => {el.scrollTop = 0;});
}
function openAction(key, origin) {
  const descriptions = {
    clan: [fixture.clan, "This opens the controlling clan's public profile in the game."],
    scout: ["Scout Tower", "The normal scouting flow automatically selects your closest eligible city or Tower origin. A successful scout reveals a snapshot of total defenders; the private contribution roster remains hidden."],
    upgrade: ["Review wall upgrade", `Review ${$("levelCount")?.value || 1} additional wall level(s), ten minutes each. The next level is shown at ${number(fixture.nextCost)} gold in this example. The game must quote the complete cost for the selected levels before confirmation; the next-level price is not a bulk total.`],
    repair: ["Review paid repair", `Restore full wall integrity for ${number(fixture.repairCost)} Clan Treasury gold in this example. Repairs use the base city repair rate and continue through attacks once started.`],
    "buy-veil": ["Purchase Veil · Preview", `The purchase control adds a Veil to the stored reserve for later use. The displayed ${number(fixture.veilCost)} gold is a fictional review price. Buying does not activate protection. Purchase limits and inventory rules will be completed in the later mechanics update.`],
    veil: ["Activate Veil · Preview", `This control uses a stored Veil to protect only ${tower.name} from enemy scouting for ten minutes. It does not purchase another Veil or affect your other towers. Activation and inventory behavior will be completed in the later mechanics update.`]
  };
  if (!descriptions[key]) return;
  actionOrigin = origin; $("actionTitle").textContent = descriptions[key][0]; $("actionCopy").textContent = descriptions[key][1]; $("actionDialog").showModal();
  status(`Preview only · ${descriptions[key][0]}`);
}
document.addEventListener("click", e => {const b = e.target.closest("[data-action]"); if (b && !b.disabled) openAction(b.dataset.action, b); const tab = e.target.closest("[data-tab], [data-section]"); if (tab) selectTab(tab.dataset.tab || tab.dataset.section, Boolean(tab.dataset.section));});
document.querySelector('[role="tablist"]').addEventListener("keydown", e => {const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]; if (!keys.includes(e.key)) return; e.preventDefault(); const tabs = [...document.querySelectorAll('[role="tab"]')], index = tabs.findIndex(t => t.dataset.tab === section), next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; selectTab(tabs[next].dataset.tab, true);});
$("dismiss").addEventListener("click", () => $("actionDialog").close());
$("actionDialog").addEventListener("close", () => actionOrigin?.isConnected && actionOrigin.focus());
$("close").addEventListener("click", () => $("towerDialog").close()); $("back").addEventListener("click", () => $("towerDialog").close());
$("towerDialog").addEventListener("close", () => {$("reopen").focus(); status("Tower closed · Reopen to continue reviewing");});
$("reopen").addEventListener("click", () => $("towerDialog").showModal());
window.addEventListener("message", e => {if (e.origin === location.origin && e.source === parent && e.data?.type === "tower-review") render(e.data.tower, e.data.sample, e.data.section);});
const query = new URLSearchParams(location.search); render(query.get("tower"), query.get("sample"), query.get("section"));
parent.postMessage({type: "tower-ready"}, location.origin);
