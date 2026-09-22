"use strict";
const dialog = document.getElementById("threatDialog"), list = document.getElementById("threatList");
const iconFile = "assets/icons/battle-reports-ledger-r1.svg";
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
const number = value => Number(value).toLocaleString("en-US");
const time = seconds => seconds >= 3600 ? Math.floor(seconds / 3600) + "h " + String(Math.floor(seconds % 3600 / 60)).padStart(2, "0") + "m" : String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
const icon = name => '<svg aria-hidden="true"><use href="' + iconFile + "#" + name + '"></use></svg>';
let rows = [], filter = "all";

function fixtures(sample) {
  const base = [
    {id:"attack-1",kind:"attack",ruler:"Lord Aldric",origin:"Greyhaven",target:"Ravenwatch",cityId:"demo-ravenwatch",map:"Northgate March",regionId:"demo-northgate",level:18,troops:12400,defense:23560,estimate:"8,000–12,000",remaining:28},
    {id:"scout-1",kind:"scout",ruler:"Lady Maeve",origin:"Thornfield",target:"Alderwick",cityId:"demo-alderwick",map:"Ashen Vale",regionId:"demo-ashen",level:12,troops:7600,defense:12160,remaining:136},
    {id:"attack-2",kind:"attack",ruler:"Sir Rowan",origin:"Stonebridge",target:"Ravenwatch",cityId:"demo-ravenwatch",map:"Northgate March",regionId:"demo-northgate",level:18,troops:12400,defense:23560,estimate:"4,000–6,000",remaining:348},
    {id:"legion-1",kind:"legion",ruler:"Citadel Legion",origin:"Crown Citadel",target:"Briarford",cityId:"demo-briarford",map:"Kingsward",regionId:"demo-kingsward",level:24,troops:18600,defense:35340,estimate:"20,000–30,000",remaining:562},
    {id:"attack-3",kind:"attack",ruler:"Lady Elowen",origin:"Westmere",target:"Alderwick",cityId:"demo-alderwick",map:"Ashen Vale",regionId:"demo-ashen",level:12,troops:7600,defense:12160,estimate:"6,000–8,000",remaining:847},
  ];
  if (sample === "empty") return [];
  if (sample === "scouts") return [base[1],{...base[1],id:"scout-2",ruler:"Sir Rowan",origin:"Stonebridge",target:"Ravenwatch",cityId:"demo-ravenwatch",map:"Northgate March",regionId:"demo-northgate",remaining:409}];
  if (sample === "many") return Array.from({length:18},(_,index)=>({...base[index % base.length],id:"threat-" + index,remaining:28 + index * 131}));
  if (sample === "pending") return [
    {...base[0],pending:true,estimate:"",origin:"Unknown city"},
    {...base[1],pending:true},
    {...base[3],remaining:831},
  ];
  if (sample === "long") return [
    {...base[0],ruler:"Duke Rowan of the Eastern Marches",origin:"The Royal Borough of West Ravenwatch",target:"Saint Alderwick's Fortified Crossing",map:"The Northern Highlands of Westmarch",level:100,troops:999999999,defense:1899999998,estimate:"800,000,000–1,200,000,000",remaining:7521},
    {...base[1],ruler:"Lady Elowen of the Vale of Ash and Willow",origin:"Stonebridge-on-the-River",target:"The High Citadel of Thornfield and Ash",map:"The Southern Watch of Windermere",remaining:8517},
    {...base[4],remaining:9459},
  ];
  return base;
}
function status(message) {
  const panel = document.getElementById("panelStatus");
  panel.textContent = message;
  panel.title = message;
  window.parent.postMessage({type:"incoming-status",message},location.origin);
}
function renderRow(row) {
  const scout = row.kind === "scout", legion = row.kind === "legion";
  const kind = scout ? "Scout" : legion ? "Legion" : "Attack";
  const cityStats = row.pending
    ? '<p class="pending-note">City details refresh when this map opens.</p>'
    : '<div class="city-stats"><span><strong>' + number(row.troops) + '</strong> troops</span><span><strong>' + number(row.defense) + '</strong> defense</span></div>';
  const identity = legion
    ? '<strong class="npc-name">' + esc(row.ruler) + "</strong>"
    : '<button class="profile" data-profile="' + esc(row.ruler) + '" aria-label="View ' + esc(row.ruler) + '\'s profile">' + esc(row.ruler) + "</button>";
  const force = scout ? "1" : row.estimate || "Unknown";
  return '<article class="threat-row ' + row.kind + (row.remaining <= 60 ? " urgent" : "") + '" data-threat="' + row.id + '" aria-label="' + kind + " approaching " + esc(row.target) + '">' +
    '<div class="arrival"><time datetime="PT' + row.remaining + 'S" aria-label="Arrives in ' + Math.floor(row.remaining / 60) + " minutes " + row.remaining % 60 + ' seconds">' + time(row.remaining) + '</time><span class="kind-label">' + icon(scout ? "scout" : legion ? "realm" : "attack") + kind + "</span>" + (row.remaining <= 60 ? '<small class="urgency">Arriving soon</small>' : "") + "</div>" +
    '<div class="attacker"><span class="attacker-label">' + (legion ? "Citadel force" : scout ? "Scouting ruler" : "Attacking ruler") + "</span>" + identity + '<p class="origin">From <strong>' + esc(row.origin) + "</strong></p></div>" +
    '<div class="city"><span class="city-region">' + esc(row.map) + '</span><div class="city-title"><h3>' + esc(row.target) + "</h3>" + (row.pending ? "" : '<span class="level">Lv ' + row.level + "</span>") + "</div>" + cityStats + "</div>" +
    '<div class="force' + (!scout && !row.estimate ? " unknown" : "") + '"><span>' + (scout ? "Incoming" : "Estimated") + "</span><strong>" + esc(force) + "</strong><small>" + (scout ? "scout" : "troops") + "</small></div>" +
    '<button class="locate" data-locate="' + row.id + '" aria-label="Locate ' + esc(row.target) + " in " + esc(row.map) + '">' + icon("map") + "<span>Locate City</span></button></article>";
}
function render() {
  const attacks = rows.filter(row => row.kind !== "scout").length, scouts = rows.length - attacks;
  const cities = new Set(rows.map(row => row.regionId + ":" + row.cityId)).size, first = rows[0];
  document.getElementById("allCount").textContent = rows.length;
  document.getElementById("attackCount").textContent = attacks;
  document.getElementById("scoutCount").textContent = scouts;
  const summary = document.getElementById("summary");
  summary.classList.toggle("all-clear", !rows.length);
  summary.innerHTML = '<div class="summary-copy"><strong class="summary-number">' + rows.length + '</strong><div><h2>' + (rows.length ? "Incoming " + (rows.length === 1 ? "threat" : "threats") : "All clear") + "</h2><p>" + (rows.length ? cities + (cities === 1 ? " city" : " cities") + " watched · " + attacks + (attacks === 1 ? " attack" : " attacks") + " · " + scouts + (scouts === 1 ? " scout" : " scouts") : "No incoming attacks or scouts") + "</p></div></div>" + (first ? '<div class="next-arrival"><div><span>Next arrival</span><small>' + esc(first.target) + "</small></div><strong>" + time(first.remaining) + "</strong></div>" : "");
  document.querySelectorAll("[data-filter]").forEach(button => button.setAttribute("aria-pressed",String(filter === button.dataset.filter)));
  const visible = rows.filter(row => filter === "all" || (filter === "attack" ? row.kind !== "scout" : row.kind === "scout"));
  list.innerHTML = visible.length ? visible.map(renderRow).join("") : '<div class="empty-state">' + icon("defense") + "<h2>" + (rows.length ? "No incoming " + (filter === "attack" ? "attacks" : "scouts") : "The watch is quiet") + "</h2><p>" + (rows.length ? "Use All to view the other approaching threats." : "Attacks and scouts will appear here when they approach your cities.") + '</p><button data-empty-action="' + (rows.length ? "all" : "close") + '">' + (rows.length ? "Show all threats" : "Return to map") + "</button></div>";
  document.getElementById("visibleCount").textContent = visible.length + " of " + rows.length + " shown";
  list.scrollTop = 0;
}
function loadSample(sample) {
  rows = fixtures(sample).sort((a,b)=>a.remaining-b.remaining);
  filter = "all";
  render();
  status(rows.length ? "Keeping watch across your kingdom" : "No incoming attacks or scouts");
  if (!dialog.open) dialog.showModal();
}
document.querySelector(".filters").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  filter = button.dataset.filter;
  render();
  status(filter === "all" ? "Showing all approaching threats" : filter === "attack" ? "Showing incoming attacks, including the Citadel Legion" : "Showing incoming scouts");
});
list.addEventListener("click", event => {
  const profile = event.target.closest("[data-profile]");
  if (profile) {status("Profile preview: open " + profile.dataset.profile + "'s ruler profile.");return;}
  const empty = event.target.closest("[data-empty-action]");
  if (empty) {
    if (empty.dataset.emptyAction === "all") {filter="all";render();status("Showing all approaching threats");}
    else dialog.close();
    return;
  }
  const locate = event.target.closest("[data-locate]");
  if (!locate) return;
  const row = rows.find(entry => entry.id === locate.dataset.locate);
  if (!row) return;
  list.querySelectorAll(".located").forEach(entry=>entry.classList.remove("located"));
  locate.closest(".threat-row").classList.add("located");
  status("Location preview: " + row.target + " · " + row.map + ". The game will open the target's map and center on its city.");
});
document.getElementById("close").addEventListener("click",()=>dialog.close());
dialog.addEventListener("close",()=>{if (!dialog.open) status("Closed Incoming Threats. Reopen to continue reviewing.");});
document.getElementById("reopen").addEventListener("click",()=>{dialog.showModal();status("Keeping watch across your kingdom");});
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === window.parent && event.data?.type === "incoming-review") loadSample(event.data.sample);
});
loadSample(new URLSearchParams(location.search).get("sample") || "standard");
