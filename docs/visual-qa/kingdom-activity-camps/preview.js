"use strict";

const dialog = document.getElementById("reportDialog");
const ledger = document.getElementById("campLedger");
const mapPreview = document.getElementById("mapPreview");
const reopen = document.getElementById("reopen");
const definitions = {
  gold: { reward: "20,000", unit: "Gold", label: "Base hold reward", icon: "assets/icons/royal-shop-gold-r1.svg" },
  troops: { reward: "10,000", unit: "troops", label: "Base hold reward", icon: "assets/icons/daily-login-troops-r1.svg" },
  items: { reward: "1 random usable item", label: "Hold reward", icon: "assets/icons/reward-daily-quests-r1.svg" },
  deed: { reward: "1 random neutral city", label: "Hold reward", icon: "assets/icons/skills/guildCharters.svg" }
};
const sampleNames = new Set(["standard", "contested", "resolving", "syncing", "long", "many", "single", "empty"]);
const startingSeconds = [187, 548, 1362, 2858];
let camps = [];
let returnFocusId = "";

const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const number = value => Number(value).toLocaleString("en-US");
const duration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const remaining = camp => camp.deadline === null ? null : Math.max(0, Math.ceil((camp.deadline - Date.now()) / 1000));
const timeText = camp => remaining(camp) === null ? "Syncing" : remaining(camp) === 0 ? "Resolving" : duration(remaining(camp));
const mapIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16 M15 5v16"/><path d="m5.5 10 2 2-2 2 M11 12h2"/></svg>';

function announce(message) {
  document.getElementById("liveStatus").textContent = message;
  if (parent !== window) parent.postMessage({ type: "camps-status", message }, location.origin);
}

function row(camp) {
  const reward = definitions[camp.type];
  const contested = camp.state === "contested";
  const seconds = remaining(camp);
  return `<article class="camp-row ${contested ? "is-contested" : ""} ${camp.troops >= 10000000 ? "large-force" : ""}" data-kind="${camp.type}" data-camp="${escape(camp.id)}" aria-label="${escape(camp.name)} in ${escape(camp.map)}">
    <div class="camp-identity"><img class="camp-art" src="${escape(camp.art)}" alt=""><div class="camp-name"><h3>${escape(camp.name)}</h3><p>${escape(camp.map)}</p></div></div>
    <div class="camp-reward ${reward.unit ? "" : "random"}"><img src="${reward.icon}" alt=""><div><small>${reward.label}</small><strong>${reward.reward}${reward.unit ? `<span class="reward-unit">${reward.unit}</span>` : ""}</strong></div></div>
    <div class="camp-garrison"><strong class="garrison-number">${number(camp.troops)}</strong><span class="garrison-label">troops stationed</span><span class="control-label ${contested ? "contested" : ""}">${contested ? "Control contested" : "Controlled by you"}</span></div>
    <div class="camp-timer ${seconds === null || seconds === 0 ? "is-state" : seconds < 60 ? "is-soon" : ""}"><strong data-timer="${escape(camp.id)}">${timeText(camp)}</strong><small data-timer-note="${escape(camp.id)}">${seconds === null ? "Reward timer" : seconds === 0 ? "Awaiting result" : "Until reward"}</small></div>
    <button class="locate-camp" data-locate="${escape(camp.id)}" aria-label="Show ${escape(camp.name)} in ${escape(camp.map)} on map">${mapIcon}<span>Map</span></button>
  </article>`;
}

function updateTimes() {
  for (const camp of camps) {
    const timer = ledger.querySelector(`[data-timer="${CSS.escape(camp.id)}"]`);
    if (!timer) continue;
    const seconds = remaining(camp);
    const text = timeText(camp);
    if (timer.textContent !== text) timer.textContent = text;
    timer.parentElement.classList.toggle("is-state", seconds === null || seconds === 0);
    timer.parentElement.classList.toggle("is-soon", seconds !== null && seconds > 0 && seconds < 60);
    const note = timer.nextElementSibling;
    const description = seconds === null ? "Reward timer" : seconds === 0 ? "Awaiting result" : "Until reward";
    if (note.textContent !== description) note.textContent = description;
  }
  const soonest = camps.find(camp => remaining(camp) > 0);
  const summary = document.getElementById("nextRewardTime");
  if (summary) summary.textContent = soonest ? timeText(soonest) : camps.some(camp => remaining(camp) === 0) ? "Resolving" : "Syncing";
}

function makeSample(name) {
  const now = Date.now();
  let list = ["gold", "troops", "items", "deed"].map((type, i) => ({
    ...CAMP_REVIEW_DATA.find(camp => camp.type === type),
    troops: [38450, 27150, 18750, 42200][i], state: "held", deadline: now + startingSeconds[i] * 1000
  }));
  if (name === "contested") list = list.map((camp, i) => ({ ...camp, state: i === 0 || i === 2 ? "contested" : "held" }));
  if (name === "resolving") { list[0].deadline = now - 1000; list[1].deadline = now + 45000; }
  if (name === "syncing") list = list.map(camp => ({ ...camp, deadline: null }));
  if (name === "long") list = list.map((camp, i) => ({ ...camp,
    name: ["Gold Camp of the Northern King's Road", "Warband Camp at the Old Watchtower", "Relic Camp of the Weathered Stone Circle", "Deed Camp beside the Three River Crossing"][i],
    map: ["The Northern Marches of Gilded Moor", "Frostwolf March and the Eastern Borderlands", "Ravenscar and the Western Highlands", "Dawncrest beyond the Old King's Bridge"][i],
    troops: [1234567890, 987654321, 1000000000, 4294967295][i]
  }));
  if (name === "many") list = CAMP_REVIEW_DATA.map((camp, i) => ({ ...camp, troops: 21300 + i * 4175, state: i % 5 === 0 ? "contested" : "held", deadline: now + (95 + i * 113) * 1000 }));
  if (name === "single") list = list.slice(0, 1);
  if (name === "empty") list = [];
  return list.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.name.localeCompare(b.name));
}

function showLedger() {
  mapPreview.hidden = true;
  reopen.hidden = true;
  if (!dialog.open) dialog.showModal();
  const restore = returnFocusId && ledger.querySelector(`[data-locate="${CSS.escape(returnFocusId)}"]`);
  if (restore) restore.focus({ preventScroll: true });
}

function setSample(name) {
  camps = makeSample(sampleNames.has(name) ? name : "standard");
  returnFocusId = "";
  document.getElementById("campCount").textContent = String(camps.length);
  const contested = camps.filter(camp => camp.state === "contested").length;
  document.getElementById("campSummary").innerHTML = `<strong class="held-count">${camps.length}</strong><div><h2>${camps.length === 1 ? "Camp under your control" : "Camps under your control"}</h2><p>${camps.length ? `${new Set(camps.map(camp => camp.regionId)).size} ${camps.length === 1 ? "map" : "maps"}${contested ? ` · ${contested} contested` : " · Your held objectives"}` : "No active camp holds"}</p></div>${camps.length ? '<div class="next-reward"><small>Next camp reward</small><strong id="nextRewardTime"></strong></div>' : ""}`;
  document.getElementById("campColumns").hidden = camps.length === 0;
  ledger.classList.toggle("is-empty", camps.length === 0);
  ledger.innerHTML = camps.length ? camps.map(row).join("") : `<div class="empty-state"><img src="${CAMP_REVIEW_DATA.find(camp => camp.type === "gold").art}" alt=""><h2>No camps under your control</h2><p>Held Gold, Warband, Relic and Deed Camps appear here with their rewards and hold timers.</p><button data-return-map>Return to map</button></div>`;
  ledger.scrollTop = 0;
  updateTimes();
  showLedger();
}

ledger.addEventListener("click", event => {
  const button = event.target.closest("[data-locate]");
  if (button) {
    const camp = camps.find(camp => camp.id === button.dataset.locate);
    if (!camp) return;
    returnFocusId = camp.id;
    document.getElementById("mapCampArt").src = camp.art;
    document.getElementById("mapCampName").textContent = camp.name;
    document.getElementById("mapRegionName").textContent = camp.map;
    mapPreview.hidden = false;
    dialog.close();
    reopen.hidden = true;
    document.getElementById("backToLedger").focus();
    announce(`Map preview: ${camp.name} in ${camp.map}. No game map or account was changed.`);
  } else if (event.target.closest("[data-return-map]")) {
    dialog.close();
    announce("Returned to the draft backdrop. Open Kingdom Activity to review again.");
  }
});
document.getElementById("backToLedger").addEventListener("click", () => { showLedger(); announce("Returned to Camps; your list position is preserved."); });
document.getElementById("close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => { reopen.hidden = !mapPreview.hidden; if (mapPreview.hidden) reopen.focus(); });
reopen.addEventListener("click", showLedger);
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === parent && event.data?.type === "camps-review") setSample(event.data.sample);
});
window.addEventListener("keydown", event => { if (event.key === "Escape" && !mapPreview.hidden) showLedger(); });
setSample(new URLSearchParams(location.search).get("sample") || "standard");
const reviewClock = setInterval(updateTimes, 1000);
window.addEventListener("pagehide", () => clearInterval(reviewClock), { once: true });
