"use strict";
const $ = id => document.getElementById(id);
const number = n => Number(n).toLocaleString("en-US");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const status = message => parent.postMessage({type: "tower-status", message}, location.origin);
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
  return `<div class="veil-strip">${icon("veil")}<div><strong>Veil of Silence</strong><small>${f.member ? `${f.veilUses} of 3 uses remain today · 00:00 UTC reset` : "Public walls and clan remain visible"}</small></div><span>${f.veil ? "7m remaining" : "Inactive"}</span></div>`;
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
  return `<section class="service-card queue-card"><div class="section-top"><div><p class="eyebrow">CONSTRUCTION</p><h3>Wall upgrades</h3></div><span class="badge">${10 - f.queue.length} slots open</span></div>${f.queue.length ? `<div class="active-upgrade"><strong>Wall Level ${f.queue[0].from} → ${f.queue[0].to}</strong><span>${f.incoming ? "Paused by incoming rally" : "6m remaining · 10-minute build"}</span>${progress(40, "Current wall upgrade progress")}<small>${number(f.queue[0].cost)} gold paid · ${f.incoming ? "Resumes after battle" : "40% complete"}</small></div><ol class="queued-levels">${f.queue.slice(1).map(row => `<li><strong>Level ${row.from} → ${row.to}</strong><span>10 minutes · ${number(row.cost)} gold paid</span></li>`).join("") || '<li>No additional levels queued</li>'}</ol>` : '<p class="service-copy">No upgrades queued. Every level takes 10 minutes. Tower walls have no maximum level.</p>'}<p class="footnote">Repair fully before building. Construction pauses during attacks; capture removes the queue without a refund.</p></section>`;
}
function wallsMarkup(f) {
  const intro = titleBlock("OFFICER COMMANDERY", "Walls &amp; Veil", "Clan Treasury funds fortifications, paid repairs and the tower's own Veil service.");
  if (!f.member) return intro + wallMarkup(f) + veilMarkup(f) + '<p class="footnote">Construction orders, costs, daily Veil usage and Clan Treasury details are private to the controlling clan.</p>';
  const upgradeReason = f.incoming ? "Wait until the incoming attack resolves." : f.integrity < 100 || f.repair ? "Fully repair the walls first." : f.queue.length >= 10 ? "All 10 construction slots are occupied." : f.treasury < f.nextCost ? "Not enough gold in the Clan Treasury." : "10 minutes per level · No item acceleration";
  const repairReason = f.repair ? "Paid repair underway · 19m remaining" : f.incoming ? "New repairs cannot start during an attack." : f.integrity === 100 ? "Walls are already fully repaired." : f.treasury < f.repairCost ? "Not enough gold in the Clan Treasury." : "Restores full integrity at the base city repair rate.";
  const veilReason = f.veil ? "Veil is active · 7m remaining" : f.veilUses === 0 ? "Daily allowance used. Resets at 00:00 UTC." : f.treasury < f.veilCost ? "Not enough gold in the Clan Treasury." : "Conceals scouting for 10 minutes.";
  return intro + `<div class="treasury-strip">${icon("gold")}<div><small>Clan Treasury</small><strong>${number(f.treasury)} <span>gold</span></strong></div><span>${f.manager ? "Your role · Officer" : "Your role · Member"}</span></div>${!f.manager ? '<div class="notice"><strong>Officer controls</strong><p>Only the clan leader and officers can spend Clan Treasury gold. You can inspect the current work below.</p></div>' : ""}<div class="works-grid"><div>${wallMarkup(f)}${queueMarkup(f)}</div><div class="services">${f.manager ? `<section class="service-card"><div class="section-top"><h3>Queue wall levels</h3>${icon("wall")}</div><label class="level-control" for="levelCount">Levels to queue <select id="levelCount" ${f.incoming || f.integrity < 100 || f.repair || f.queue.length >= 10 ? "disabled" : ""}>${Array.from({length: Math.max(1, 10 - f.queue.length)}, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></label><p class="price-note">Next level: <strong>${number(f.nextCost)} gold</strong></p>${action("upgrade", "Review Upgrade", "primary-button", f.incoming || f.integrity < 100 || f.repair || f.queue.length >= 10 || f.treasury < f.nextCost)}<p class="service-copy">${upgradeReason}</p></section>` : ""}<section class="service-card"><h3>${f.repair ? "Repair underway" : "Wall repair"}</h3><p class="service-copy">${repairReason}</p>${f.repair ? `${progress(37, "Paid repair progress")}<p class="price-note">${number(f.repairCost)} gold paid · 37% of timer elapsed</p>` : f.manager ? action("repair", `Start Repair · ${number(f.repairCost)} gold`, "paper-button", f.incoming || f.integrity === 100 || f.treasury < f.repairCost) : ""}<small>Existing paid repairs continue through attacks.</small></section><section class="service-card veil-service"><div class="section-top"><h3>Veil of Silence</h3>${icon("veil")}</div><p class="service-copy">${veilReason}</p><p class="price-note"><strong>${f.veilUses} of 3</strong> uses left today</p>${f.manager ? action("veil", `Activate · ${number(f.veilCost)} gold`, "paper-button", f.veil || !f.veilUses || f.treasury < f.veilCost) : ""}<small>A tower service paid from Clan Treasury. Your Bag items are not consumed.</small></section></div></div>`;
}
function rulesMarkup() {
  const rules = [
    ["Conquer together", "Tower conquest is rally-only: five unique eligible clan members must each contribute at least one troop. New members have a 24-hour Tower participation probation. Ordinary Rally target rules remain separate."],
    ["A clan foothold", "The clan owns the tower and may hold all four. There is no passive realm bonus. Surviving attackers form a garrison with each contribution personally attributed; all valid defenders fight together."],
    ["Personal troop actions", "Issue troop orders from the tower's map controls, just like a city. Eligible members may reinforce; outgoing attacks, movement and rallies use only their own stationed troops. Normal target-driven scouting automatically chooses the closest eligible city or Tower origin."],
    ["Walls & conquest", "Fresh neutral Towers start at Wall Level 1, full integrity and 10,000,000 NPC defenders. That starting rule does not reveal their current force. Capture removes five wall levels, never below Level 1, and sets integrity to zero."],
    ["Construction", "There is no wall-level cap. Up to ten levels may be queued, each taking ten minutes and costing five times the equivalent city wall upgrade. Walls must be fully repaired first. Items and modifiers do not accelerate construction."],
    ["Attacks & repairs", "New repairs and upgrades cannot start under attack. Construction pauses; an existing paid repair continues. Capture loses queued work without a refund. Manual repair costs five times the equivalent city wall cost, scaled to damage, and uses the unmodified city repair rate."],
    ["Veil of Silence", "The Tower service lasts ten minutes, with three uses per Tower per UTC day. Each use costs the equivalent city wall cost at its current level, paid from Clan Treasury. It does not consume a Bag item. Public clan and wall details remain visible."],
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
function render(towerKey, sampleKey) {
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
  selectTab("overview");
  if (!$("towerDialog").open) $("towerDialog").showModal();
  document.querySelectorAll('.scroll-panel, .identity-column, .detail-column').forEach(el => {el.scrollTop = 0;});
}
function openAction(key, origin) {
  const descriptions = {
    clan: [fixture.clan, "This opens the controlling clan's public profile in the game."],
    scout: ["Scout Tower", "The normal scouting flow automatically selects your closest eligible city or Tower origin. A successful scout reveals a snapshot of total defenders; the private contribution roster remains hidden."],
    upgrade: ["Review wall upgrade", `Review ${$("levelCount")?.value || 1} additional wall level(s), ten minutes each. The next level is shown at ${number(fixture.nextCost)} gold in this example. The game must quote the complete cost for the selected levels before confirmation; the next-level price is not a bulk total.`],
    repair: ["Review paid repair", `Restore full wall integrity for ${number(fixture.repairCost)} Clan Treasury gold in this example. Repairs use the base city repair rate and continue through attacks once started.`],
    veil: ["Review Tower Veil", `Spend ${number(fixture.veilCost)} Clan Treasury gold in this example for ten minutes of Veil. This uses one of the tower's ${fixture.veilUses} remaining daily activations and consumes no Bag item.`]
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
window.addEventListener("message", e => {if (e.origin === location.origin && e.source === parent && e.data?.type === "tower-review") render(e.data.tower, e.data.sample);});
const query = new URLSearchParams(location.search); render(query.get("tower"), query.get("sample"));
parent.postMessage({type: "tower-ready"}, location.origin);
