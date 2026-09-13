/* Synthetic review state only. No backend imports, network writes or persistence. */
"use strict";
const $ = id => document.getElementById(id);
const labels = {
  swordmastery: ["Swordmastery", "Outgoing attack power."],
  marchOrders: ["March Orders", "Travel speed: attacks, transfers, scouts & regroups."],
  fieldMedics: ["Field Medics", "Recover battle losses to your Main City."],
  shieldwallDiscipline: ["Shieldwall Discipline", "Defense for stationed and reinforcing soldiers."],
  stoneworks: ["Stoneworks", "City wall strength."],
  taxStewardship: ["Tax Stewardship", "Normal city Gold production."],
  royalGranaries: ["Royal Granaries", "Normal city troop production."],
  guildCharters: ["Guild Charters", "City upgrade cost reduction."],
};
const groups = [
  { id: "attack", label: "Attack", icon: "swordmastery", skills: ["swordmastery", "marchOrders", "fieldMedics"] },
  { id: "defense", label: "Defense", icon: "shieldwallDiscipline", skills: ["shieldwallDiscipline", "stoneworks"] },
  { id: "utility", label: "Utility", icon: "guildCharters", skills: ["taxStewardship", "royalGranaries", "guildCharters"] },
];
const config = window.CROWNLANDS_ECONOMY_CONFIG.skills;
const keys = Object.keys(labels), iconRoot = "docs/visual-qa/skills-ledger/icons/";
const copy = value => structuredClone(value), empty = () => Object.fromEntries(keys.map(key => [key, 0]));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const number = value => Math.floor(value).toLocaleString("en-US");
const maximum = key => Math.ceil(config[key].maxPercent / config[key].percentPerLevel);
const cost = (key, level) => level >= maximum(key) ? 0 : level + 1 >= maximum(key) - 4 ? 2 : 1;
const spent = allocation => keys.reduce((sum, key) => sum + Array.from({ length: allocation[key] || 0 }, (_, level) => cost(key, level)).reduce((a, b) => a + b, 0), 0);
const allocation = values => ({ ...empty(), ...values });
let state, selected = 0, drafts = {}, pendingAction = null, toastTimer;
const dialog = $("skillsDialog"), actionDialog = $("actionDialog");
function notify(message) {
  $("toast").textContent = message; $("toast").classList.add("visible");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2500);
  if (parent !== window) parent.postMessage({ type: "skills-review-status", message }, location.origin);
}
function currentSlot() { return state.slots.find(slot => slot.id === selected); }
function draft() {
  const slot = currentSlot();
  if (!slot) return null;
  return drafts[selected] ||= { name: slot.name, skills: copy(slot.skills) };
}
function dirty() {
  const slot = currentSlot(), next = draft();
  return Boolean(slot && (next.name !== slot.name || JSON.stringify(next.skills) !== JSON.stringify(slot.skills)));
}
function viewed() { return selected ? draft().skills : state.live; }
function unspent() { return state.level - 1 - spent(viewed()); }
function applyCost() { return Math.ceil(state.baseGold * window.CROWNLANDS_ECONOMY_CONFIG.playerCosts.skillPresetApplyHours); }
function statusFor(slot) {
  if (state.level < slot.unlock) return `Locked · Lv ${slot.unlock}`;
  if (slot.id === selected && dirty()) return state.applied === slot.id ? "Applied · Unsaved" : "Unsaved changes";
  if (state.applied === slot.id) return JSON.stringify(slot.skills) === JSON.stringify(state.live) ? "Applied" : "Apply changes";
  return slot.saved ? "Saved" : "Empty";
}
function confirm(title, message, label, callback, details = "") {
  pendingAction = callback; $("actionTitle").textContent = title; $("actionCopy").textContent = message;
  $("actionNumbers").textContent = details; $("confirmAction").textContent = label;
  actionDialog.returnValue = ""; actionDialog.showModal();
}
function leaveDraft(action) {
  if (!selected || !dirty()) return action();
  confirm("Leave this draft?", "Your preset has unsaved changes. Save it to keep this allocation, or discard the changes before continuing.", "Discard changes", () => { delete drafts[selected]; action(); });
  const save = document.createElement("button"); save.type = "button"; save.className = "secondary"; save.textContent = "Save & continue"; save.dataset.saveContinue = "true";
  save.addEventListener("click", () => { pendingAction = () => { saveSlot(false); action(); }; actionDialog.close("confirm"); });
  actionDialog.querySelector("footer").insertBefore(save, $("confirmAction"));
}
function saveSlot(message = true) {
  if (!selected || unspent() < 0) return;
  const slot = currentSlot(), next = draft();
  slot.name = next.name.trim().slice(0, 24) || `Preset ${selected}`; next.name = slot.name;
  slot.skills = copy(next.skills); slot.saved = true; render();
  if (message) notify("Preset saved. Your current skills are unchanged.");
}
function renderTabs() {
  $("presetTabs").innerHTML = `<button role="tab" aria-selected="${selected === 0}" data-slot="0" class="${selected === 0 ? "selected" : ""}"><strong>Current Build</strong><small>${state.applied ? `${esc(state.slots[state.applied - 1].name)} applied` : "Custom live build"}</small></button>` + state.slots.map(slot => {
    const locked = state.level < slot.unlock;
    return `<button role="tab" aria-selected="${selected === slot.id}" data-slot="${slot.id}" class="${selected === slot.id ? "selected" : ""} ${state.applied === slot.id ? "applied" : ""} ${locked ? "locked" : ""}" ${locked ? "disabled" : ""} title="${esc(locked ? `Unlocks at Hero Level ${slot.unlock}` : slot.name)}"><strong>${esc(locked ? `Preset ${slot.id}` : slot.name)}</strong><small>${esc(statusFor(slot))}</small></button>`;
  }).join("");
}
function renderBuild() {
  const editing = selected > 0, used = spent(viewed()), slot = currentSlot();
  document.querySelector(".build-bar").classList.toggle("editing", editing);
  $("buildName").textContent = editing ? draft().name : "Current Build";
  $("buildTag").textContent = editing ? dirty() ? "UNSAVED" : state.applied === selected ? "APPLIED" : "DRAFT" : "LIVE";
  $("buildTag").classList.toggle("draft", editing && state.applied !== selected);
  $("buildHint").textContent = editing ? dirty() ? "Unsaved changes" : slot.saved ? "Saved preset · edit or apply" : "Empty preset · plan your skills" : "Changes apply immediately";
  $("presetName").hidden = !editing;
  if (editing && document.activeElement !== $("presetName")) $("presetName").value = draft().name;
  $("available").textContent = number(unspent()); $("spent").textContent = number(used); $("level").textContent = number(state.level); $("refundTotal").textContent = number(used);
  $("resetSkills").hidden = editing; $("resetSkills").disabled = used === 0;
  $("savePreset").hidden = !editing; $("applyPreset").hidden = !editing;
  $("savePreset").disabled = !editing || (slot.saved && !dirty()) || unspent() < 0;
  $("applyPreset").disabled = !editing || !slot.saved || dirty() || state.gold < applyCost();
  $("applyPrice").innerHTML = `<img src="assets/icons/royal-shop-gold-r1.svg" alt="Gold">${number(applyCost())}`;
  $("applyPreset").title = state.gold < applyCost() ? `Need ${number(applyCost())} Gold; you have ${number(state.gold)}.` : "1 hour of base Gold production";
  if (editing && state.gold < applyCost() && !dirty()) $("buildHint").textContent = `Need ${number(applyCost())} Gold · have ${number(state.gold)}`;
}
function skillCard(key) {
  const [label, description] = labels[key], level = viewed()[key], max = maximum(key), rate = config[key].percentPerLevel, cap = level === max;
  return `<article class="skill-card ${cap ? "capped" : ""}" data-skill-card="${key}"><img src="${iconRoot}${key}.svg" alt=""><h3>${label}</h3><p class="description">${description}</p><div class="skill-values"><strong>+${level * rate}% <small class="cap-label">/ ${config[key].maxPercent}% cap</small></strong><span>Lv ${level} / ${max}</span></div><div class="stepper" role="group" aria-label="Adjust ${label}"><button data-adjust="${key}" data-delta="-1" ${level === 0 ? "disabled" : ""} aria-label="Remove one ${label} level and refund ${level ? cost(key, level - 1) : 0} points">−</button><span class="cost">${cap ? "MAX" : `${cost(key, level)} ${cost(key, level) === 1 ? "PT" : "PTS"}`}<small>${cap ? "Mastered" : `Next +${(level + 1) * rate}%`}</small></span><button data-adjust="${key}" data-delta="1" ${cap || unspent() < cost(key, level) ? "disabled" : ""} aria-label="Add one ${label} level for ${cost(key, level)} points">+</button></div></article>`;
}
function renderGroups() {
  const scrollTop = $("skillGroups").scrollTop;
  $("skillGroups").innerHTML = groups.map((group, index) => `<section class="skill-group" data-category="${group.id}" aria-label="${group.label} skills"><header class="group-heading"><img src="${iconRoot}${group.icon}.svg" alt=""><div><h2>${group.label}</h2><p>${group.skills.length} disciplines · ${group.skills.reduce((sum, key) => sum + spent({ ...empty(), [key]: viewed()[key] }), 0)} points assigned</p></div><span>${["I", "II", "III"][index]}</span></header><div class="group-cards">${group.skills.map(skillCard).join("")}</div></section>`).join("");
  $("skillGroups").scrollTop = scrollTop;
}
function render(focus) {
  renderTabs(); renderBuild(); renderGroups();
  if (focus) document.querySelector(focus)?.focus({ preventScroll: true });
}
function setSample(sample = "established") {
  selected = 0; drafts = {};
  state = { level: 76, gold: 185000, baseGold: 32400, applied: 0, live: allocation({ swordmastery: 15, marchOrders: 8, fieldMedics: 5, shieldwallDiscipline: 12, stoneworks: 8, taxStewardship: 10, royalGranaries: 7, guildCharters: 4 }) };
  state.slots = [25, 50, 75, 100].map((unlock, index) => ({ id: index + 1, unlock, name: ["War Council", "Stewardship", "Preset 3", "Preset 4"][index], saved: index < 2, skills: empty() }));
  state.slots[0].skills = allocation({ swordmastery: 18, marchOrders: 10, fieldMedics: 6, shieldwallDiscipline: 8, stoneworks: 4, taxStewardship: 5, royalGranaries: 6, guildCharters: 2 });
  state.slots[1].skills = allocation({ swordmastery: 5, marchOrders: 5, fieldMedics: 2, shieldwallDiscipline: 4, stoneworks: 2, taxStewardship: 20, royalGranaries: 20, guildCharters: 15 });
  if (sample === "new") { state.level = 10; state.live = allocation({ swordmastery: 3, shieldwallDiscipline: 2, taxStewardship: 1, marchOrders: 1 }); }
  if (sample === "poor") state.gold = 1200;
  if (sample === "spent") state.live = allocation({ swordmastery: 20, shieldwallDiscipline: 20, taxStewardship: 20, royalGranaries: 15 });
  if (sample === "veteran") {
    state.level = 151; state.live = allocation({ swordmastery: 30, shieldwallDiscipline: 25, marchOrders: 15, fieldMedics: 25, stoneworks: 20, taxStewardship: 10, royalGranaries: 10 });
    state.slots[3] = { ...state.slots[3], name: "Royal Campaign", saved: true, skills: copy(state.live) }; state.applied = 4;
  }
  if (actionDialog.open) { pendingAction = null; actionDialog.close(); }
  render(); if (!dialog.open) dialog.showModal();
  $("skillGroups").scrollTop = 0;
  document.querySelector('[data-slot="0"]').focus({ preventScroll: true });
}
$("presetTabs").addEventListener("click", event => {
  const button = event.target.closest("[data-slot]"); if (!button || button.disabled) return;
  const next = Number(button.dataset.slot); if (next === selected) return;
  leaveDraft(() => { selected = next; render(`[data-slot="${next}"]`); });
});
$("skillGroups").addEventListener("click", event => {
  const button = event.target.closest("[data-adjust]"); if (!button || button.disabled) return;
  const key = button.dataset.adjust, delta = Number(button.dataset.delta), levels = viewed(), previous = levels[key];
  if (delta > 0 && (previous === maximum(key) || unspent() < cost(key, previous))) return;
  if (delta < 0 && previous === 0) return;
  levels[key] += delta; if (!selected) state.applied = 0;
  render(`[data-adjust="${key}"][data-delta="${delta}"]`);
  const message = selected ? `${labels[key][0]} draft: Level ${levels[key]}. ${unspent()} points unspent.` : `${labels[key][0]}: Level ${levels[key]}. ${delta > 0 ? cost(key, previous) + " points spent" : cost(key, previous - 1) + " points refunded"}.`;
  if (parent !== window) parent.postMessage({ type: "skills-review-status", message }, location.origin);
});
$("presetName").addEventListener("input", event => { draft().name = event.target.value; renderTabs(); renderBuild(); });
$("savePreset").addEventListener("click", () => saveSlot());
$("applyPreset").addEventListener("click", () => {
  if ($("applyPreset").disabled) return;
  const price = applyCost();
  confirm(`Apply ${currentSlot().name}?`, "Replace your current skills with this saved preset. Unspent points remain available.", "Apply preset", () => {
    state.gold -= price; state.live = copy(currentSlot().skills); state.applied = selected; render(); notify(`${currentSlot().name} applied. ${number(price)} Gold spent in this preview.`);
  }, `${number(price)} Gold · 1h of base Gold production. Available: ${number(state.gold)} Gold.`);
});
$("resetSkills").addEventListener("click", () => {
  const points = spent(state.live);
  confirm("Reset current skills?", "Remove all assigned levels from your current build. Your saved presets stay available.", "Reset for free", () => { state.live = empty(); state.applied = 0; render(); notify(`${points} skill points returned. No Gold spent.`); }, `${points} skill points returned · Free`);
});
actionDialog.addEventListener("close", () => {
  const action = pendingAction; pendingAction = null; actionDialog.querySelector("[data-save-continue]")?.remove();
  if (actionDialog.returnValue === "confirm") action?.();
});
function closeSkills() { leaveDraft(() => dialog.close()); }
$("close").addEventListener("click", closeSkills);
dialog.addEventListener("cancel", event => { event.preventDefault(); closeSkills(); });
$("reopen").addEventListener("click", () => { dialog.showModal(); render(); });
document.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => {
  if (button.dataset.section === "Skills") return;
  leaveDraft(() => confirm(button.dataset.section, `This action will open the existing ${button.dataset.section} screen. This review focuses on Skills.`, "Back to Skills", () => {}));
}));
window.addEventListener("message", event => { if (event.origin === location.origin && event.source === parent && event.data?.type === "skills-review") setSample(event.data.sample); });
dialog.append($("toast")); setSample();
