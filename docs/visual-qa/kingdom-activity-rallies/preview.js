"use strict";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const number = value => Math.max(0, Number(value) || 0).toLocaleString("en-US");
const time = value => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
const emblem = kind => `assets/clan-heraldry/art-set-v1/svg/full/${kind === "citadel" ? "crown" : "fortress-keep"}.svg`;
const horn = "assets/optimized/item-recall-horn-384x384-66b7bde99a6d.webp";
let rallies = [], selectedId = "", horns = 2, viewer = "creator", generation = 0;
const participant = (name, troops, state = "assembled", seconds = 0, own = false, creator = false) => ({ name, troops, state, seconds, own, creator });
function fixtures(sample) {
  const base = [
    { id: "stoneward", target: "Stoneward", region: "Ashen Vale", kind: "stronghold", creator: "Rowan Ashford", assembly: "Ravenwatch", state: "forming", owned: true,
      participants: [participant("Rowan Ashford", 42000, "assembled", 0, true, true), participant("Lady Elowen", 36500), participant("Lord Aldric", 28000, "inbound", 142), participant("Mira of Dunmere", 18500, "inbound", 318)] },
    { id: "citadel", target: "Crown Citadel", region: "The Crownlands", kind: "citadel", creator: "Rowan Ashford", assembly: "Ravenwatch", state: "launched", owned: true,
      participants: [participant("Rowan Ashford", 84000, "assembled", 0, true, true), participant("Lady Elowen", 72000), participant("Lord Aldric", 64000), participant("Sir Oswin", 58000), participant("Mira of Dunmere", 46500)] },
    { id: "swiftgate", target: "Swiftgate", region: "Northgate March", kind: "stronghold", creator: "Lady Elowen", assembly: "Dunmere", state: "returning", owned: false,
      participants: [participant("Lady Elowen", 38500, "returning", 0, false, true), participant("Rowan Ashford", 26000, "returning", 0, true), participant("Sir Oswin", 21000, "returning")] },
  ];
  if (sample === "empty") return [];
  if (["ready", "leader", "pending"].includes(sample)) {
    const rally = base[0]; rally.participants.forEach(person => { person.state = "assembled"; });
    if (sample === "leader") { rally.owned = false; rally.creator = "Lady Elowen"; rally.participants[0].name = "Lady Elowen"; rally.participants[0].own = false; rally.participants[1].name = "Rowan Ashford"; rally.participants[1].own = true; }
    if (sample === "pending") rally.busy = "launch";
    return [rally];
  }
  if (["join", "member", "full"].includes(sample)) {
    const rally = base[0]; rally.owned = false; rally.creator = "Lady Elowen"; rally.participants[0].name = "Lady Elowen"; rally.participants[0].own = false; rally.participants[1].name = "Sir Oswin";
    if (sample === "member") { rally.participants[1].name = "Rowan Ashford"; rally.participants[1].own = true; }
    if (sample === "full") {
      const names = ["Lady Elowen", "Sir Oswin", "Lord Aldric", "Mira of Dunmere", "Duke Cedric", "Lady Isolde", "Warden Brynn", "Sir Garrick", "Lady Adela", "Lord Edric", "Lady Rosamund", "Sir Tristan", "Warden Leofric", "Lady Alys", "Lord Godwin", "Sir Edmund", "Lady Beatrice", "Warden Rolf", "Sir Bertram", "Lady Matilda"];
      rally.participants = names.map((name, index) => participant(name, 22500 + index * 1500, index < 16 ? "assembled" : "inbound", 140 + index * 11, false, index === 0));
    }
    return [rally];
  }
  if (sample === "many") {
    const extra = [
      { ...structuredClone(base[0]), id: "ironhold", target: "Ironhold", region: "Ironwood Reach", creator: "Sir Oswin", owned: false },
      { ...structuredClone(base[1]), id: "goldhaven", target: "Goldhaven", region: "Golden Vale", kind: "stronghold", creator: "Lord Aldric", owned: false },
    ];
    extra.forEach(row => {
      row.participants.slice(1).filter(person => person.name === row.creator).forEach(person => { person.name = "Rowan Ashford"; person.own = true; });
      row.participants[0].name = row.creator; row.participants[0].own = false;
    });
    return [...base, ...extra];
  }
  if (sample === "long") {
    const rally = base[0]; rally.target = "The High Stronghold of West Thornfield"; rally.region = "The Northern Highlands of Westmarch"; rally.assembly = "Saint Alderwick's Fortified Crossing"; rally.creator = "Duke Rowan of the Eastern Marches";
    rally.participants[0].name = rally.creator; rally.participants[0].troops = 999999999;
    rally.participants[1].name = "Lady Elowen of Stonebridge-on-the-River"; rally.participants[1].troops = 12500000;
    return [rally];
  }
  if (sample === "no-horns") return [base[1]];
  return base;
}
function status(message) {
  $("liveStatus").textContent = message;
  if (window.parent !== window) window.parent.postMessage({ type: "rallies-status", message }, location.origin);
}
function totals(rally) {
  const active = rally.participants.filter(person => ["assembled", "inbound"].includes(person.state));
  const ready = active.filter(person => person.state === "assembled");
  const sum = list => list.reduce((total, person) => total + person.troops, 0);
  return { active, ready, force: sum(rally.state === "returning" ? rally.participants.filter(person => person.state === "returning") : ready), inbound: sum(active.filter(person => person.state === "inbound")) };
}
function stateName(rally) { return ({ forming: "Forming", launched: "Launched", returning: "Returning" })[rally.state]; }
function profile(name) { return `<button class="ruler-link" data-profile="${esc(name)}">${esc(name)}</button>`; }
function participantState(rally, person) {
  if (rally.state === "returning" || person.state === "returning") return ["Returning", "Homeward", "returning"];
  if (rally.state === "launched") return ["Marching", "With the rally", "marching"];
  if (person.state === "inbound") return [person.seconds ? time(person.seconds) : "Arriving", "To assembly", "inbound"];
  return ["Ready", "At assembly", "ready"];
}
function commands(rally) {
  const { active, ready } = totals(rally), allReady = active.length >= 2 && ready.length === active.length;
  const manage = rally.owned || viewer === "leader";
  const own = rally.participants.some(person => person.own && ["assembled", "inbound"].includes(person.state));
  const button = (action, label, style = "", disabled = false) => `<button class="rally-command ${style}" data-action="${action}" ${disabled || rally.busy ? "disabled" : ""}>${label}</button>`;
  let note = "", buttons = "";
  if (rally.busy) note = "Sending your order…";
  if (rally.state === "forming" && manage) {
    if (!rally.busy) note = allReady ? "<strong>All contributions are ready.</strong> Launch when you choose." : active.length < 2 ? "At least 2 rulers must be ready to launch." : `${active.length - ready.length} ${active.length - ready.length === 1 ? "contribution is" : "contributions are"} still inbound. Every army must arrive before launch.`;
    buttons = button("cancel", "Cancel", "danger") + button("launch", rally.busy === "launch" ? "Sending…" : "Launch", "primary", !allReady);
  } else if (rally.state === "forming" && own) {
    if (!rally.busy) note = "Your contribution is committed. The creator or Clan Leader gives the launch order.";
    buttons = button("withdraw", "Withdraw", "danger");
  } else if (rally.state === "forming" && active.length < 20) {
    if (!rally.busy) note = "Join with troops from one of your cities.";
    buttons = button("join", "Join Rally", "primary");
  } else if (rally.state === "forming") note = "This rally is full. All 20 participant places are occupied.";
  else if (rally.state === "launched" && rally.owned) {
    if (!rally.busy) note = horns ? "Recall the combined army for 1 Recall Horn." : "A Recall Horn is needed to recall this army.";
    buttons = button("recall", `<img src="${horn}" alt="">${rally.busy === "recall" ? "Sending…" : "Recall · 1 Horn"}`, "danger", horns < 1);
  } else if (rally.state === "launched") note = "The combined army is marching. Only its creator may recall it.";
  else note = "The rally is returning. Contributions remain assigned to their rulers.";
  return `<div class="order-note" role="status">${note}</div><div class="action-buttons">${buttons}</div>`;
}
function render(resetScroll = false) {
  const oldScroll = document.querySelector(".rally-scroll")?.scrollTop || 0;
  const oldPickerScroll = document.querySelector(".rally-picker")?.scrollTop || 0;
  const focused = document.activeElement?.dataset;
  $("hornCount").textContent = number(horns); $("rallyCount").textContent = rallies.length;
  const content = $("ralliesContent"); content.classList.toggle("is-empty", !rallies.length);
  if (!rallies.length) {
    content.innerHTML = `<section class="empty-state"><div class="empty-emblem"><img src="${emblem("stronghold")}" alt=""></div><h2>No active clan rallies</h2><p>Leaders and Officers can begin a rally from an eligible objective on the map. Your clan's active rallies will appear here.</p><button data-action="map">Return to map</button></section>`;
    return;
  }
  const rally = rallies.find(row => row.id === selectedId) || rallies[0]; selectedId = rally.id;
  const { active, ready, force, inbound } = totals(rally);
  const count = active.length || rally.participants.length;
  content.innerHTML = `<aside class="rally-sidebar"><header class="sidebar-heading"><h2>Clan rallies</h2><strong>${rallies.length} / 5</strong></header><nav class="rally-picker" aria-label="Active clan rallies">${rallies.map(row => {
    const rowTotal = totals(row), rowCount = rowTotal.active.length || row.participants.length;
    return `<button class="rally-pick" data-select="${row.id}" aria-pressed="${row.id === selectedId}" aria-label="${esc(row.target)}, ${stateName(row)}"><img src="${emblem(row.kind)}" alt=""><strong>${esc(row.target)}</strong><small>${esc(row.region)}<span class="pick-kind"> · ${row.kind === "citadel" ? "Citadel" : "Stronghold"}</span></small><span class="pick-meta"><span class="status-pill ${row.state}">${stateName(row)}</span><span>${rowCount} / 20</span></span></button>`;
  }).join("")}</nav></aside>
  <section class="rally-detail" aria-labelledby="rallyTitle">
    <header class="rally-title"><div class="target-seal"><img src="${emblem(rally.kind)}" alt=""></div><div class="target-heading"><h2 id="rallyTitle">${esc(rally.target)}</h2><p>${esc(rally.region)} · ${rally.kind === "citadel" ? "Crown Citadel" : "Stronghold"}</p></div><span class="status-pill ${rally.state}">${stateName(rally)}</span></header>
    <div class="rally-scroll" tabindex="0" aria-label="Rally information and all participants">
      <div class="rally-overview"><div class="rally-meta"><div><small>Rally creator</small>${profile(rally.creator)}</div><div><small>Assembly city</small><strong>${esc(rally.assembly)}</strong></div></div>
      <div class="muster-totals ${Math.max(force, inbound) > 9999999 ? "large" : ""}"><div><small>${rally.state === "returning" ? "Returning troops" : rally.state === "launched" ? "Marching troops" : "Assembled troops"}</small><strong>${number(force)}</strong></div><div><small>Incoming troops</small><strong>${number(inbound)}</strong></div><div><small>${rally.state === "forming" ? "Rulers ready" : "Rulers in rally"}</small><strong class="ready-total">${rally.state === "forming" ? `${ready.length} / ${active.length}` : count}</strong></div></div>
      </div><div class="muster-heading"><h3>The muster</h3><span>${count} / 20 rulers${rally.state === "forming" ? " · All must be ready" : ""}</span></div>
      <table class="muster-table" aria-label="Rally participants"><thead><tr><th scope="col">Ruler</th><th scope="col">Troops</th><th scope="col">Status</th></tr></thead><tbody>${rally.participants.map((person, index) => {
        const [label, hint, state] = participantState(rally, person);
        return `<tr><td><div class="participant-identity"><span class="participant-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span>${profile(person.name)}<small>${person.creator ? "Leader" : "Ally"}${person.own ? " · You" : ""}</small></span></div></td><td>${number(person.troops)}</td><td class="participant-status ${state}"><strong>${label}</strong><small>${hint}</small></td></tr>`;
      }).join("")}</tbody></table>
    </div><footer class="rally-actions">${commands(rally)}</footer>
  </section>`;
  document.querySelector(".rally-scroll").scrollTop = resetScroll ? 0 : oldScroll;
  document.querySelector(".rally-picker").scrollTop = oldPickerScroll;
  if (focused?.select) document.querySelector(`[data-select="${CSS.escape(focused.select)}"]`)?.focus({ preventScroll: true });
  if (focused?.action) document.querySelector(`[data-action="${CSS.escape(focused.action)}"]:not(:disabled)`)?.focus({ preventScroll: true });
}
function reset(sample) {
  generation += 1; viewer = sample === "leader" ? "leader" : ["join", "member", "full"].includes(sample) ? "member" : "creator";
  horns = sample === "no-horns" ? 0 : 2; rallies = fixtures(sample); selectedId = rallies[0]?.id || "";
  render(true); if (!$("reportDialog").open) $("reportDialog").showModal();
}
$("ralliesContent").addEventListener("click", event => {
  const pick = event.target.closest("[data-select]");
  if (pick) { selectedId = pick.dataset.select; render(true); status(`Selected ${rallies.find(row => row.id === selectedId).target}.`); return; }
  const ruler = event.target.closest("[data-profile]");
  if (ruler) { status(`Draft: ${ruler.dataset.profile} would open the existing ruler profile.`); return; }
  const control = event.target.closest("[data-action]"); if (!control || control.disabled) return;
  const action = control.dataset.action;
  if (action === "map") { $("reportDialog").close(); status("Draft: return to the world map."); return; }
  const rally = rallies.find(row => row.id === selectedId); if (!rally || rally.busy) return;
  const taskGeneration = generation; rally.busy = action; render();
  status(`Draft: sending ${action} order…`);
  window.setTimeout(() => {
    if (generation !== taskGeneration) return;
    rally.busy = "";
    if (action === "launch") rally.state = "launched";
    if (action === "recall") { horns -= 1; rally.state = "returning"; rally.participants.forEach(person => { person.state = "returning"; }); }
    if (action === "cancel") rallies = rallies.filter(row => row.id !== rally.id);
    if (action === "withdraw") rally.participants = rally.participants.filter(person => !person.own);
    if (action === "join") rally.participants.push(participant("Rowan Ashford", 10000, "inbound", 245, true));
    render();
    status(({ launch: "Draft: the ready rally has launched by your command.", recall: "Draft: one Recall Horn used; the combined army is returning.", cancel: "Draft: the forming rally was cancelled.", withdraw: "Draft: your contribution was withdrawn and will return home.", join: "Draft: 10,000 troops from Ravenwatch are travelling to assembly. The live Join flow retains city and troop selection." })[action]);
  }, 550);
});
$("close").addEventListener("click", () => $("reportDialog").close());
$("reopen").addEventListener("click", () => $("reportDialog").showModal());
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === window.parent && event.data?.type === "rallies-review") reset(event.data.sample);
});
reset(new URLSearchParams(location.search).get("sample") || "standard");
