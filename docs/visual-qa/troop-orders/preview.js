"use strict";

// Synthetic review snapshots. Own-army power responds; enemy outcomes and routes are fixed samples.
const art = {
  keep: "assets/optimized/castle-keep-256x256-ce263706d73e.webp",
  castle: "assets/optimized/castle-castle-256x256-5e8edd306418.webp",
  camp: "assets/worlds/core-expansion-v1/art/camp-warband-2bb9352998c8.webp",
  stronghold: "assets/worlds/core-expansion-v1/art/stronghold-defense-bc42b1436d02.webp",
  swift: "assets/optimized/item-swift-march-160x160-e857cc4d8977.webp",
  banner: "docs/visual-qa/troop-orders/marching-banner.svg",
  attack: "assets/icons/skills/swordmastery.svg",
  transfer: "assets/icons/skills/marchOrders.svg",
  reinforce: "assets/icons/skills/shieldwallDiscipline.svg",
  rally: "assets/icons/skills/marchOrders.svg"
};
const samples = {
  attack: {},
  defeat: { amount: 120000, outcome: "Walls likely hold", tone: "lose" },
  unknown: { forecast: "unknown" },
  stale: { forecast: "stale" },
  camp: { to: "Warband Camp", toMap: "Greybanner Hold", toArt: art.camp, targetLabel: "Neutral Warband Camp", camp: true, defense: 520000 },
  transfer: { kind: "transfer", to: "Aurum Watch", targetLabel: "Your city", targetTroops: 185000, swift: 3 },
  "no-item": { kind: "transfer", to: "Aurum Watch", targetLabel: "Your city", targetTroops: 185000, swift: 0 },
  reinforce: { kind: "reinforce", to: "Ironwatch Outpost", targetLabel: "Clan allied holding", stationed: 60000, shield: true },
  rally: { kind: "rally", to: "Ironwatch", toMap: "Ironwatch", toArt: art.stronghold, targetLabel: "Clan rally objective" },
  join: { kind: "join", to: "Greybanner Assembly", toMap: "Greybanner Hold", targetLabel: "Rally assembly city" },
  calculating: { route: "calculating" },
  error: { route: "error" },
  protected: { blocked: true, to: "The Royal Home", targetLabel: "Main City" },
  unbuffed: { swordmastery: 0, weaponLevel: 0, bonus: 0 },
  stored: { swordmastery: 0, weaponLevel: 0, storedWeaponLevel: 5, bonus: 0 },
  maximum: { swordmastery: 60, weaponLevel: 5 },
  rounding: { troops: 17, amount: 1, swordmastery: 2, weaponLevel: 1, forecast: "unknown", bonus: 0 },
  long: { from: "Northwatch Keep beyond the Western Kingsroad", fromMap: "The Northern Marches of Greybanner", to: "Stonebridge Castle of the Southern Borderlands", toMap: "The Southern Borderlands of Ironwatch", troops: 4294967295, amount: 1234567890, defense: 987654321, seconds: 8472 }
};
const commandNames = { attack: "Attack", transfer: "Transfer", reinforce: "Reinforce", rally: "Create Rally", join: "Join Rally" };
const dialog = document.getElementById("reportDialog"), body = document.getElementById("orderBody");
const confirm = document.getElementById("confirmOrder"), cancel = document.getElementById("cancelOrder"), reopen = document.getElementById("reopen");
let current, amount, swift = false;
const num = value => Math.floor(Number(value) || 0).toLocaleString("en-US");
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const duration = value => { const seconds = Math.ceil(value); return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };
const isRally = () => current.kind === "rally" || current.kind === "join";
const gearData = CROWNLANDS_COMMON_GEAR;
const weaponDefinition = gearData.getDefinition("barracks_weapon_common_01");
const precise = value => Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
function contributionValue(value, signed = false) {
  const precision = Math.abs(value) < 1 ? 6 : 2;
  const scale = 10 ** precision;
  const rounded = Math.round(value * scale) / scale;
  return `${Math.abs(value - rounded) > 0.000001 ? "≈" : ""}${signed ? "+" : ""}${rounded.toLocaleString("en-US", { maximumFractionDigits: precision })}`;
}
function renderPowerBreakdown() {
  const equipped = current.weaponLevel > 0;
  return `<section class="attack-power-sheet" aria-label="Your attack power breakdown"><header><div><span>YOUR ATTACK POWER</span><strong id="ownAttackTotal"></strong></div><img src="${art.attack}" alt=""></header>
    <div class="power-source"><img src="assets/icons/daily-login-troops-r1.svg" alt=""><div><strong>Base troop power</strong><small>1.25 power per troop</small></div><b id="basePowerValue"></b></div>
    <div class="power-source"><img src="${art.attack}" alt=""><div><strong>Swordmastery</strong><small>Level ${current.swordmastery / 2} · +${precise(current.swordmastery)}% attack</small></div><b id="skillPowerValue"></b></div>
    <div class="power-source"><img class="common-item" src="${weaponDefinition.art}" alt=""><div><strong>${equipped ? escape(weaponDefinition.gearName) : "War Captain weapon"}</strong><small>${equipped ? `Equipped · Level ${current.weaponLevel} · +${precise(gearData.getBonusPercent({ level: current.weaponLevel }))}%` : "No attack weapon equipped"}</small></div><b id="weaponPowerValue"></b></div>
    <p class="power-equation"><span id="perTroopValue"></span><strong id="combinedAttackBonus"></strong></p><p class="power-note">Bonuses add to base power. Final total rounds down to whole points.</p></section>`;
}
function renderTransferDetails() {
  return `<div class="transfer-details" aria-label="Transfer summary">
    <section id="forecast" class="transfer-card" aria-label="Troops at destination"></section>
    <section class="transfer-card transfer-journey" aria-label="Journey details"><p class="transfer-card-title"><img src="${art.banner}" alt="">Journey</p><div id="travelSummary" class="travel-summary"></div></section>
    <section class="transfer-card transfer-options" aria-label="Swift March option"><p class="transfer-card-title"><img src="${art.swift}" alt="">Swift March Order</p><div class="transfer-swift-control"><div><strong>${num(current.swift)} available</strong><small>${current.swift ? "Use one to shorten this journey" : "No orders in your bag"}</small></div><label class="swift-toggle"><span id="swiftState">Off</span><input id="swiftToggle" type="checkbox" role="switch" aria-label="Use a Swift March Order" ${current.swift ? "" : "disabled"}></label></div></section>
  </div>`;
}
function announce(message) {
  document.getElementById("liveStatus").textContent = message;
  if (parent !== window) parent.postMessage({ type: "orders-status", message }, location.origin);
}
function open() { reopen.hidden = true; if (!dialog.open) dialog.showModal(); }
function locationPanel(label, name, map, image, detail, destination = false, level = null) {
  const levelBadge = Number.isSafeInteger(level) && level > 0 ? `<span class="location-level" aria-label="City level ${level}">Lv. ${num(level)}</span>` : "";
  return `<section class="order-location ${destination ? "destination" : ""}"><img class="location-art" src="${image}" alt=""><div class="location-copy"><div class="location-meta"><span class="location-label">${label}</span>${levelBadge}</div><h2>${escape(name)}</h2><p>${escape(map)}${detail ? ` · ${escape(detail)}` : ""}</p></div></section>`;
}
function setSample(key) {
  const sample = Object.hasOwn(samples, key) ? key : "attack";
  current = { kind: "attack", from: "Northwatch Keep", fromMap: "Greybanner Hold", fromLevel: 64, to: "Stonebridge Castle", toMap: "Ironwatch", toLevel: 82, fromArt: art.keep, toArt: art.castle, targetLabel: "Enemy city", troops: 1250000, amount: 750000, defense: 684500, outcome: "Likely capture", tone: "win", forecast: "scouted", route: "ready", seconds: 492, bonus: 24, swordmastery: 40, weaponLevel: 4, ...samples[sample] };
  if (current.kind === "attack" && !Object.hasOwn(samples[sample], "bonus")) current.bonus = 20;
  amount = current.amount; swift = false;
  const command = commandNames[current.kind];
  dialog.dataset.sample = sample;
  dialog.dataset.kind = current.kind;
  document.getElementById("reportTitle").textContent = current.blocked ? "Protected home base" : `${command} troops`;
  document.getElementById("orderKind").textContent = current.blocked ? "Attack blocked" : isRally() ? "Clan orders" : current.kind === "attack" ? "Attack order" : "Friendly movement";
  document.getElementById("headingArt").src = art[current.kind === "join" ? "rally" : current.kind];
  confirm.hidden = Boolean(current.blocked); confirm.textContent = command; confirm.classList.toggle("friendly", current.kind !== "attack");
  cancel.textContent = current.blocked ? "Close" : "Cancel";
  document.getElementById("actionNotice").textContent = current.blocked ? "No troops sent." : current.shield ? "Sending removes your Royal Peace Shield." : isRally() ? "Rally commitment does not remove an active Royal Peace Shield." : "";
  if (current.blocked) {
    body.innerHTML = `<section class="protected-state"><img src="${art.reinforce}" alt=""><h2>${escape(current.to)}</h2><strong>Home base protected</strong><p>Main cities cannot be attacked or captured.<br>Choose another enemy city.</p></section>`;
    open(); return;
  }
  const notes = [];
  if (current.shield) notes.push('<div class="order-note warning"><strong>Shield warning</strong>Launching clan reinforcements immediately removes your Royal Peace Shield. Your ally\'s shield is not affected.</div>');
  if (current.kind === "reinforce") notes.push('<div class="order-note"><strong>1 / 2 assignments with Rowan</strong>Each assignment must support a different holding owned by this clanmate.</div><div class="order-note"><strong>2 / 5 reinforcement slots</strong>Ordinary cities reserve one slot per contributing clanmate when a march launches.</div>');
  if (isRally()) notes.push(`<div class="order-note"><strong>2–20 participants</strong>${current.kind === "rally" ? "You will lead this manual-launch Rally. Launch stays blocked until every participant is Ready." : "Your troops march visibly to the assembly city and must arrive before launch."}</div>`);
  body.innerHTML = `<div class="order-route">${locationPanel("From", current.from, current.fromMap, current.fromArt, "", false, current.kind === "attack" ? current.fromLevel : null)}
    <svg class="order-arrow" viewBox="0 0 44 24" aria-hidden="true"><path d="M2 12h37M29 3l11 9-11 9M3 8h13M3 16h13"/></svg>
    ${locationPanel("To", current.to, current.toMap, current.toArt, current.targetLabel, true, current.kind === "attack" && !current.camp ? current.toLevel : null)}</div>
    <div class="order-columns ${current.kind === "attack" ? "selection-layout attack-layout" : current.kind === "transfer" ? "selection-layout transfer-layout" : ""}"><section class="force-column" aria-label="Troop selection"><div class="force-summary"><div><p class="force-label">Troops to ${isRally() ? "commit" : current.kind === "attack" ? "attack with" : "send"}</p><div class="force-readout"><img src="assets/icons/daily-login-troops-r1.svg" alt=""><strong id="amountValue"></strong></div></div><p class="remaining"><b id="remainingValue"></b> of ${num(current.troops)} remain at source</p></div>
    ${isRally() ? `<label class="contribution">Contribution<input id="contribution" type="number" min="1" max="${current.troops}" step="1" value="${amount}" aria-label="Rally troop contribution"></label>` : ""}
    <input id="troopRange" class="troop-range" type="range" min="1" max="${current.troops}" step="1" value="${amount}" aria-label="Troops to ${isRally() ? "commit" : current.kind === "attack" ? "attack with" : current.kind === "reinforce" ? "reinforce with" : "transfer"}"><div class="range-labels"><span>1</span><span>Max ${num(current.troops)}</span></div>
    ${notes.length ? `<div class="order-notes">${notes.join("")}</div>` : ""}</section>
    ${current.kind === "transfer" ? renderTransferDetails() : `${current.kind === "attack" ? renderPowerBreakdown() : ""}<section class="intelligence-column" aria-label="Forecast and travel"><div class="forecast-travel"><div id="forecast"></div><div id="travelSummary" class="travel-summary"></div></div></section>`}</div>`;
  body.querySelector("#troopRange").addEventListener("input", event => setAmount(event.target.value));
  const contribution = body.querySelector("#contribution");
  contribution?.addEventListener("input", event => { if (event.target.value !== "" && event.target.validity.valid) setAmount(event.target.value); });
  contribution?.addEventListener("change", event => setAmount(event.target.value));
  body.querySelector("#swiftToggle")?.addEventListener("change", event => { swift = current.swift > 0 && event.target.checked; update(); announce(`Sample Swift March Order ${swift ? "on" : "off"}. No item was consumed.`); });
  update(); body.scrollTop = 0; open();
}
function setAmount(value) {
  amount = Math.min(current.troops, Math.max(1, Math.floor(Number(value) || 1)));
  update();
  announce(current.kind === "attack" ? "Selection and your attack-power contributions updated. Enemy outcomes and route times remain fixed sample snapshots." : "Selection updated. Friendly arrival totals respond; route times remain fixed sample snapshots.");
}
function update() {
  document.getElementById("amountValue").textContent = num(amount);
  document.getElementById("remainingValue").textContent = num(current.troops - amount);
  if (current.kind === "attack") {
    const gearPercent = current.weaponLevel ? gearData.getBonusPercent({ level: current.weaponLevel }) : 0;
    const power = ORDER_POWER_REVIEW.calculate(amount, current.swordmastery, gearPercent);
    document.getElementById("ownAttackTotal").textContent = num(power.totalPower);
    document.getElementById("basePowerValue").textContent = contributionValue(power.basePower);
    document.getElementById("skillPowerValue").textContent = contributionValue(power.swordmasteryPower, true);
    document.getElementById("weaponPowerValue").textContent = contributionValue(power.weaponPower, true);
    document.getElementById("perTroopValue").textContent = `${precise(power.perTroop)} power / troop`;
    document.getElementById("combinedAttackBonus").textContent = `+${precise(power.bonusPercent)}% total bonus`;
  }
  const range = document.getElementById("troopRange"); range.value = amount; range.style.setProperty("--fill", `${100 * (amount - 1) / Math.max(1, current.troops - 1)}%`);
  const contribution = document.getElementById("contribution"); if (contribution) contribution.value = amount;
  const toggle = document.getElementById("swiftToggle"); if (toggle) { toggle.checked = swift; document.getElementById("swiftState").textContent = swift ? "On" : "Off"; }
  confirm.disabled = current.route !== "ready";
  const forecast = document.getElementById("forecast"), travel = document.getElementById("travelSummary");
  let heading = "Battle forecast", tone = current.tone, fields;
  if (current.route !== "ready") {
    heading = "Travel route"; tone = "unknown";
    fields = `<div><strong>${current.route === "error" ? "Route unavailable" : "Calculating travel time…"}</strong><small>${current.route === "error" ? "The route could not be confirmed. Try again." : "Checking the connected roads and arrival time."}</small>${current.route === "error" ? '<button id="retryRoute" class="route-retry">Try again</button>' : ""}</div>`;
    document.getElementById("actionNotice").textContent = current.route === "error" ? "Route unavailable. Try again before sending." : "Confirming the route before troops can be sent.";
  } else if (current.kind === "transfer") {
    heading = "At destination"; fields = `<div><strong>${num(current.targetTroops + amount)}</strong><small>Troops after arrival</small></div>`;
  } else if (current.kind === "reinforce") {
    heading = "Reinforcement order"; fields = `<div><span>Your stationed support</span><strong>${num(current.stationed + amount)} troops</strong><small>Owned by you and merged at this holding</small></div>`;
  } else if (isRally()) {
    heading = "Rally commitment"; fields = `<div><span>${current.kind === "join" ? "Contribution" : "Leader force"}</span><strong>${num(amount)} troops</strong><small>${current.kind === "join" ? "One participant slot will be reserved immediately" : "Troops wait at the assembly city until you launch or cancel"}</small></div>`;
  } else if (current.forecast !== "scouted") {
    tone = "unknown"; fields = `<div><span>Battle forecast</span><strong>${current.forecast === "stale" ? "New scout required" : "Garrison unknown"}</strong><small>${current.forecast === "stale" ? "This report predates the current wall-and-garrison combat model." : "Scout report required"}</small></div>`;
  } else {
    fields = `<div><span>Scouted ${current.camp ? "total" : "siege"} defense</span><strong>${num(current.defense)} power</strong></div><div><span>Forecast at scout time</span><strong class="outcome-value">${current.outcome}</strong></div>`;
  }
  forecast.innerHTML = `<div class="forecast-sheet ${tone}"><p class="forecast-title"><img src="${current.kind === "transfer" ? "assets/icons/daily-login-troops-r1.svg" : art[current.kind === "attack" ? "reinforce" : current.kind === "join" ? "rally" : current.kind]}" alt="">${heading}</p><div class="forecast-values">${fields}</div></div>`;
  travel.hidden = current.route !== "ready";
  const seconds = swift ? Math.max(1, current.seconds * 0.5) : current.seconds;
  const bonus = swift ? Math.round(((1 + current.bonus / 100) * current.seconds / seconds - 1) * 100) : current.bonus;
  const travelBonus = `<div><span>Travel bonus</span><strong>${bonus}%</strong></div>`, travelTime = `<div><span>Travel time</span><strong>${duration(seconds)}</strong></div>`;
  travel.innerHTML = current.kind === "transfer" ? travelTime + travelBonus : travelBonus + travelTime;
  document.getElementById("retryRoute")?.addEventListener("click", () => { current.route = "ready"; document.getElementById("actionNotice").textContent = ""; update(); confirm.focus(); announce("Sample route recovered. This is a mock result; no server was contacted."); });
}
document.getElementById("close").addEventListener("click", () => dialog.close());
cancel.addEventListener("click", () => dialog.close());
confirm.addEventListener("click", () => {
  if (current.blocked || current.route !== "ready") return;
  const message = `Draft only: ${commandNames[current.kind]} ${num(amount)} troops from ${current.from} to ${current.to}${swift ? " with one Swift March Order" : ""}. Nothing was sent or consumed.`;
  announce(message); document.getElementById("actionNotice").textContent = "Order previewed. No troops sent.";
});
dialog.addEventListener("close", () => { reopen.hidden = false; reopen.focus(); });
reopen.addEventListener("click", open);
window.addEventListener("message", event => { if (event.origin === location.origin && event.source === parent && event.data?.type === "orders-review") setSample(event.data.sample); });
setSample(new URLSearchParams(location.search).get("sample") || "attack");
