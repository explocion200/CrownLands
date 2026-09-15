"use strict";

const dialog = document.getElementById("reportDialog");
const ledger = document.getElementById("holdLedger");
const mapPreview = document.getElementById("mapPreview");
const reopen = document.getElementById("reopen");
const definitions = {
  gold: { kind: "Gold Stronghold", label: "Base gold production", icon: "assets/icons/royal-shop-gold-r1.svg" },
  training: { kind: "Training Stronghold", label: "Base troop production", icon: "assets/icons/daily-login-troops-r1.svg" },
  speed: { kind: "Movement Stronghold", label: "March speed", icon: "assets/icons/skills/marchOrders.svg" },
  defense: { kind: "Defense Stronghold", label: "Defending-soldier power", icon: "assets/icons/skills/shieldwallDiscipline.svg" },
  crown: { kind: "Royal seat", label: "Crown bonuses", icon: "assets/icons/reward-achievements-r1.svg" }
};
// Current display helpers use 8% regional / 10% Crown. Layout bonus metadata is not used.
const crownBenefits = [["+10%", "Base gold production"], ["+10%", "Base troop production"], ["+10%", "March speed"], ["+10%", "Soldier defense"], ["−10%", "Upgrade cost"]];
const sampleNames = new Set(["standard", "citadel", "crown", "long", "zero", "single", "empty"]);
let holds = [];
let returnFocusId = "";
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const number = value => Number(value).toLocaleString("en-US");
const mapIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/><path d="m5.5 10 2 2-2 2 M11 12h2"/></svg>';

function announce(message) {
  document.getElementById("liveStatus").textContent = message;
  if (parent !== window) parent.postMessage({ type: "strongholds-status", message }, location.origin);
}

function row(hold) {
  const definition = definitions[hold.type];
  const crown = hold.type === "crown";
  const bonus = crown
    ? `<div class="hold-bonus crown-bonus"><span class="bonus-title">CROWN SPECIALIZATIONS</span><div class="crown-benefits">${crownBenefits.map(([value, label]) => `<div class="crown-benefit"><strong>${value}</strong><span>${label}</span></div>`).join("")}</div></div>`
    : `<div class="hold-bonus"><img src="${definition.icon}" alt=""><div><small>Objective specialization</small><div class="bonus-main"><strong>+8%</strong><span>${definition.label}</span></div></div></div>`;
  return `<article class="hold-row ${crown ? "is-crown" : ""} ${hold.troops >= 100000000 ? "large-force" : ""}" data-kind="${hold.type}" data-hold="${escape(hold.id)}" aria-label="${escape(hold.name)} in ${escape(hold.map)}">
    <div class="hold-identity"><img class="hold-art" src="${escape(hold.art)}" alt=""><div class="hold-name"><span class="holding-kind">${definition.kind}</span><h3>${escape(hold.name)}</h3><p>Map · ${escape(hold.map)}</p></div></div>
    ${bonus}
    <div class="hold-garrison"><strong class="garrison-number">${number(hold.troops)}</strong><span class="garrison-label">troops stationed</span><span class="control-label">Held by you</span></div>
    <div class="hold-level"><img src="assets/icons/skills/stoneworks.svg" alt=""><strong>${number(hold.level)}</strong><small>Defense level</small></div>
    <button class="locate-hold" data-locate="${escape(hold.id)}" aria-label="Show ${escape(hold.name)} on map">${mapIcon}<span>Map</span></button>
  </article>`;
}

function makeSample(name) {
  let list = HOLD_REVIEW_DATA.map((hold, index) => ({ ...hold, troops: [9450000, 12850000, 28340000, 7350000, 18620000][index] }));
  if (name === "standard") list = list.filter(hold => hold.type !== "crown");
  if (name === "crown") list = list.filter(hold => hold.type === "crown");
  if (name === "long") list = list.map((hold, index) => ({ ...hold,
    name: ["Greybanner Hold of the Northern Watch", "Aurum Keep beyond the Old King's Road", "Crown Citadel of the Five Banners", "Swiftgate at the Eastern Mountain Pass", "Ironwatch of the Southern Borderlands"][index],
    map: ["The Northern Training Grounds of Greybanner", "The Golden Marches of Western Aurum", "The Central Crown Lands and Royal Demesne", "The Eastern Highlands beyond Swiftgate", "The Southern Borderlands of Ironwatch"][index],
    troops: [1234567890, 987654321, 4294967295, 1000000000, 2345678901][index]
  }));
  if (name === "zero") list = list.filter(hold => hold.type === "gold" || hold.type === "crown").map(hold => ({ ...hold, troops: 0 }));
  if (name === "single") list = list.filter(hold => hold.type === "gold");
  if (name === "empty") list = [];
  return list.sort((a, b) => a.map.localeCompare(b.map) || a.name.localeCompare(b.name));
}

function showLedger() {
  mapPreview.hidden = true;
  reopen.hidden = true;
  if (!dialog.open) dialog.showModal();
  const restore = returnFocusId && ledger.querySelector(`[data-locate="${CSS.escape(returnFocusId)}"]`);
  if (restore) restore.focus({ preventScroll: true });
}

function setSample(name) {
  const sample = sampleNames.has(name) ? name : "standard";
  holds = makeSample(sample);
  returnFocusId = "";
  dialog.dataset.sample = sample;
  document.getElementById("holdCount").textContent = String(holds.length);
  const crown = holds.some(hold => hold.type === "crown");
  document.getElementById("holdSummary").innerHTML = `<strong class="held-count">${holds.length}</strong><div><h2>${holds.length === 1 ? "Stronghold under your control" : "Strongholds under your control"}</h2><p>${holds.length ? `${new Set(holds.map(hold => hold.regionId)).size} ${holds.length === 1 ? "map" : "maps"} · Bonuses remain active while held` : "No Strongholds under your control"}</p></div>${holds.length ? `<div class="hold-summary-note ${crown ? "is-royal" : ""}"><img src="${crown ? "assets/icons/reward-achievements-r1.svg" : "assets/icons/skills/shieldwallDiscipline.svg"}" alt=""><span>${crown ? "Crown Citadel held" : "Regional strongholds"}</span></div>` : ""}`;
  document.getElementById("holdColumns").hidden = holds.length === 0;
  ledger.classList.toggle("is-empty", holds.length === 0);
  ledger.innerHTML = holds.length ? holds.map(row).join("") : `<div class="empty-state"><img src="${HOLD_REVIEW_DATA.find(hold => hold.type === "gold").art}" alt=""><h2>No Strongholds under your control</h2><p>Held Strongholds and the Crown Citadel appear here with their specialization, garrison and defense level.</p><button data-return-map>Return to map</button></div>`;
  ledger.scrollTop = 0;
  showLedger();
}

ledger.addEventListener("click", event => {
  const button = event.target.closest("[data-locate]");
  if (button) {
    const hold = holds.find(hold => hold.id === button.dataset.locate);
    if (!hold) return;
    returnFocusId = hold.id;
    document.getElementById("mapHoldArt").src = hold.art;
    document.getElementById("mapHoldName").textContent = hold.name;
    document.getElementById("mapRegionName").textContent = hold.map;
    mapPreview.hidden = false;
    dialog.close();
    reopen.hidden = true;
    document.getElementById("backToLedger").focus();
    announce(`Map preview: ${hold.name} in ${hold.map}. No game map or account was changed.`);
  } else if (event.target.closest("[data-return-map]")) {
    dialog.close();
    announce("Returned to the draft backdrop. Open Kingdom Activity to review again.");
  }
});
document.getElementById("backToLedger").addEventListener("click", () => { showLedger(); announce("Returned to Strongholds; your list position is preserved."); });
document.getElementById("close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => { reopen.hidden = !mapPreview.hidden; if (mapPreview.hidden) reopen.focus(); });
reopen.addEventListener("click", showLedger);
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === parent && event.data?.type === "strongholds-review") setSample(event.data.sample);
});
window.addEventListener("keydown", event => { if (event.key === "Escape" && !mapPreview.hidden) { event.preventDefault(); showLedger(); } });
setSample(new URLSearchParams(location.search).get("sample") || "standard");
