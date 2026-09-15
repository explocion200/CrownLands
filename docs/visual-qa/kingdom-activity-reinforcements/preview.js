"use strict";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const number = value => Math.max(0, Number(value) || 0).toLocaleString("en-US");
const time = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const art = { orders: "assets/icons/skills/marchOrders.svg", shield: "assets/icons/skills/shieldwallDiscipline.svg", keep: "assets/clan-heraldry/art-set-v1/svg/full/fortress-keep.svg", troops: "assets/icons/daily-login-troops-r1.svg" };
const groups = [
  { id: "traveling", title: "Traveling", description: "Friendly support currently marching.", icon: art.orders },
  { id: "allies", title: "Stationed with allies", description: "Your troops defending clan holdings.", icon: art.keep },
  { id: "defending", title: "Defending your holdings", description: "Clan troops held in your cities and objectives.", icon: art.shield },
];
let rows = [], generation = 0;
function fixtures(sample) {
  const list = [
    { id: "outbound", group: "traveling", from: "Ravenwatch", fromMap: "Highwinter Vale", to: "Greyhaven", toMap: "The Crown Marches", ruler: "Lady Elowen", troops: 28500, seconds: 222 },
    { id: "incoming", group: "traveling", from: "Dunmere", fromMap: "The Crown Marches", to: "Ravenwatch", toMap: "Highwinter Vale", ruler: "Mira of Dunmere", troops: 18500, seconds: 78, incoming: true },
    { id: "returning", group: "traveling", from: "Alderkeep", fromMap: "The Crown Marches", to: "Ravenwatch", toMap: "Highwinter Vale", troops: 8200, seconds: 304, returning: true, fallback: true },
    { id: "stoneward", group: "allies", target: "Stoneward", map: "Stoneward", ruler: "Lady Elowen", troops: 12500, returnTo: "Ravenwatch", returnMap: "Highwinter Vale", fallback: false, objective: true },
    { id: "greyhaven", group: "allies", target: "Greyhaven", map: "The Crown Marches", ruler: "Lord Aldric", troops: 32000, returnTo: "Ravenwatch", returnMap: "Highwinter Vale", fallback: true },
    { id: "ravenwatch", group: "defending", target: "Ravenwatch", map: "Highwinter Vale", ruler: "Mira of Dunmere", troops: 18500, returnTo: "Dunmere", returnMap: "The Crown Marches", fallback: false },
    { id: "alderkeep", group: "defending", target: "Alderkeep", map: "The Crown Marches", ruler: "Lady Elowen", troops: 42000, returnTo: "the sender's Main City", fallback: true },
  ];
  if (sample === "empty") return [];
  if (sample === "allies") return list.filter(row => row.group === "allies");
  if (sample === "defending") return list.filter(row => row.group === "defending");
  if (sample === "fallback") return list.filter(row => row.fallback);
  if (sample === "traveling") return [list[0], list[1], list[2], { ...list[1], id: "arriving", from: "Westhaven", troops: 24500, seconds: 0, resolving: true }, { ...list[1], id: "estimate", troops: 2500, estimated: true, seconds: 400 }, { ...list[0], id: "unknown", troops: null, seconds: 535 }];
  if (sample === "long") return list.slice(2, 5).map((row, i) => ({ ...row, from: "The Royal Borough of West Ravenwatch", to: "Saint Alderwick's Fortified Crossing", target: "The High Stronghold of West Thornfield", ruler: "Lady Elowen of Stonebridge-on-the-River", map: "The Northern Highlands of Westmarch", returnTo: "Saint Alderwick's Fortified Crossing", troops: [999999999, 12500000, 8900100][i] }));
  if (sample === "many") return Array.from({ length: 24 }, (_, i) => ({ ...list[i % list.length], id: `company-${i + 1}`, target: `${list[i % list.length].target || "Greyhaven"} ${i + 1}`, troops: 2000 + i * 1250 }));
  if (sample === "pending") return list.slice(3, 6).map(row => ({ ...row, pending: true }));
  if (sample === "retry") return [{ ...list[3], error: "The return order could not be confirmed. Your assignment is still shown; try Recall again." }, list[5]];
  return list;
}
function status(message) {
  $("liveStatus").textContent = message;
  $("panelStatus").textContent = message;
  if (window.parent !== window) window.parent.postMessage({ type: "reinforcements-status", message }, location.origin);
}
function profile(name) { return `<button class="ruler-link" data-profile="${esc(name)}" aria-label="View ${esc(name)}'s profile">${esc(name)}</button>`; }
function force(row) {
  return `<div class="support-force ${row.troops > 9999999 ? "large" : ""}"><img src="${art.troops}" alt=""><strong>${row.troops === null ? "Syncing" : number(row.troops)}</strong><small>${row.estimated ? "Estimated troops" : row.troops === null ? "Troop count" : "Troops"}</small></div>`;
}
function traveling(row) {
  const label = row.returning ? "Returning home" : row.incoming ? "Incoming support" : "Support en route";
  const relationship = row.returning ? "Your troops are returning home." : row.incoming ? `${profile(row.ruler)}<span>is reinforcing your holding.</span>` : `<span>Your troops supporting</span>${profile(row.ruler)}`;
  return `<article class="support-row traveling ${row.returning ? "returning" : ""}" data-row="${esc(row.id)}" aria-label="${label}: ${esc(row.to)}">
    <img class="company-art" src="${art.orders}" alt=""><div class="route-copy"><span class="row-eyebrow">${label}</span><div class="support-route"><div><small>From</small><strong>${esc(row.from)}</strong><span class="map-name">${esc(row.fromMap)}</span></div><span class="route-arrow" aria-hidden="true">→</span><div><small>${row.returning ? "Returning to" : "To"}</small><strong>${esc(row.to)}</strong><span class="map-name">${esc(row.toMap)}</span></div></div><div class="ruler-note">${relationship}</div></div>
    ${force(row)}<div class="arrival"><strong>${row.resolving ? "Arriving" : time(row.seconds)}</strong><small>${row.resolving ? "Confirming arrival" : "Until arrival"}</small>${row.fallback ? '<p class="fallback">Main City fallback</p>' : ""}</div></article>`;
}
function stationed(row) {
  const home = row.group === "defending", action = home ? "Send Home" : "Recall";
  const relationship = home ? `${profile(row.ruler)}<span>is defending your holding.</span>` : `<span>Your troops with</span>${profile(row.ruler)}`;
  return `<article class="support-row ${home ? "defending" : "allies"} ${row.pending ? "pending" : ""} ${row.error ? "retry" : ""}" data-row="${esc(row.id)}" aria-label="${esc(row.target)}, ${esc(row.ruler)}'s support" aria-busy="${Boolean(row.pending)}">
    <img class="company-art" src="${row.objective ? art.keep : art.shield}" alt=""><div class="holding-copy"><span class="row-eyebrow">${home ? "Allied garrison" : "Stationed"}</span><h3>${esc(row.target)}</h3><span class="map-name">${esc(row.map)}</span><div class="ruler-note">${relationship}</div></div>${force(row)}
    <div class="return-copy"><small>Returns to</small><strong>${esc(row.returnTo)}</strong><p class="${row.fallback ? "fallback" : ""}">${row.fallback ? "Via Main City fallback" : "Redirects to Main City if captured"}</p></div><div class="support-command"><button class="return-button ${home ? "send-home" : ""}" data-return="${esc(row.id)}" ${row.pending ? "disabled" : ""} aria-label="${action}: ${esc(row.target)}"><span class="return-arrow" aria-hidden="true">↶</span><span>${row.pending ? "Returning…" : action}</span></button>${row.pending ? "<small>Sending return order…</small>" : ""}</div>${row.error ? `<p class="row-feedback" role="status">${esc(row.error)}</p>` : ""}</article>`;
}
function render(resetScroll = false) {
  const ledger = $("supportLedger"), top = ledger.scrollTop;
  const focused = document.activeElement?.dataset;
  const focusedReturn = focused?.return, focusedProfile = focused?.profile;
  $("supportCount").textContent = number(rows.length);
  $("assignmentCount").textContent = number(rows.length);
  $("sectionNav").hidden = rows.length === 0;
  ledger.classList.toggle("is-empty", !rows.length);
  document.querySelectorAll("[data-jump]").forEach(button => {
    const count = rows.filter(row => row.group === button.dataset.jump).length;
    button.querySelector("b").textContent = number(count);
    button.disabled = count === 0;
  });
  ledger.innerHTML = rows.length ? groups.map(group => {
    const groupRows = rows.filter(row => row.group === group.id);
    if (!groupRows.length) return "";
    return `<section class="support-group" id="group-${group.id}" aria-labelledby="heading-${group.id}"><header class="group-heading"><img src="${group.icon}" alt=""><div><h2 id="heading-${group.id}">${group.title}</h2><p>${group.description}</p></div><strong aria-label="${groupRows.length} assignments">${groupRows.length}</strong></header>${groupRows.map(row => row.group === "traveling" ? traveling(row) : stationed(row)).join("")}</section>`;
  }).join("") : `<section class="empty-state"><div class="empty-emblem"><img src="${art.shield}" alt=""></div><h2>No active clan support</h2><p>Reinforce a clan ally from their holding on the map. Traveling and stationed support will appear here.</p><button data-map>Return to map</button></section>`;
  ledger.scrollTop = resetScroll ? 0 : top;
  if (focusedReturn || focusedProfile) {
    const match = [...ledger.querySelectorAll("button")].find(button => focusedReturn ? button.dataset.return === focusedReturn : button.dataset.profile === focusedProfile);
    if (match && !match.disabled) match.focus({ preventScroll: true });
    else ledger.focus({ preventScroll: true });
  }
}
function confirmReturn(message, action) {
  const dialog = $("returnConfirmation");
  $("confirmationTitle").textContent = action;
  $("confirmationMessage").textContent = message;
  dialog.returnValue = "cancel";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}
async function requestReturn(id) {
  const row = rows.find(entry => entry.id === id);
  if (!row || row.pending || row.group === "traveling") return;
  const home = row.group === "defending";
  const fallback = row.fallback ? " The original source is no longer owned, so the troops will use the current Main City fallback." : " If that holding is captured before arrival, the troops will redirect to the current Main City.";
  const version = generation;
  if (!await confirmReturn(`${home ? "Send these allied troops home" : "Recall these reinforcement troops"} to ${row.returnTo}?${fallback}`, home ? "Send allied troops home" : "Recall your troops")) return;
  if (version !== generation || !rows.includes(row)) return;
  row.pending = true; row.error = ""; render();
  status(`Sending the sample return order for ${row.target}…`);
  setTimeout(() => {
    if (version !== generation || !rows.includes(row)) return;
    rows = rows.filter(entry => entry !== row);
    if (!home) rows.push({ id: `return-${row.id}`, group: "traveling", returning: true, from: row.target, fromMap: row.map, to: row.returnTo, toMap: row.returnMap || "", troops: row.troops, seconds: 240, fallback: row.fallback });
    render();
    status(home ? `Draft: ${number(row.troops)} allied troops sent home to ${row.returnTo}.` : `Draft: ${number(row.troops)} of your troops are returning to ${row.returnTo}.`);
  }, 650);
}
$("supportLedger").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-return")) requestReturn(button.dataset.return);
  if (button.hasAttribute("data-profile")) status(`Draft: ${button.dataset.profile}'s existing ruler profile opens here in the game.`);
  if (button.hasAttribute("data-map")) $("reportDialog").close();
});
$("sectionNav").addEventListener("click", event => {
  const button = event.target.closest("[data-jump]");
  if (!button || button.disabled) return;
  document.getElementById(`group-${button.dataset.jump}`)?.scrollIntoView({ block: "start", behavior: "instant" });
  $("supportLedger").focus({ preventScroll: true });
});
function reset(sample = "standard") {
  if ($("returnConfirmation").open) $("returnConfirmation").close("cancel");
  generation += 1; rows = fixtures(sample); render(true);
  status("Stationed troops remain until returned, invalidated or lost in battle.");
  if (!$("reportDialog").open) $("reportDialog").showModal();
}
$("close").addEventListener("click", () => $("reportDialog").close());
$("reopen").addEventListener("click", () => $("reportDialog").showModal());
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === window.parent && event.data?.type === "reinforcements-review") reset(event.data.sample);
});
reset(new URLSearchParams(location.search).get("sample") || "standard");
