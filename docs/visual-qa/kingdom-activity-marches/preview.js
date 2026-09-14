"use strict";
const dialog = document.getElementById("reportDialog"), list = document.getElementById("marchList");
const iconFile = "assets/icons/battle-reports-ledger-r1.svg";
const artFiles = { march: "assets/icons/skills/marchOrders.svg", troops: "assets/icons/daily-login-troops-r1.svg", swift: "assets/optimized/item-swift-march-160x160-e857cc4d8977.webp", recall: "assets/optimized/item-recall-horn-160x160-b261d10e9c8b.webp" };
const kinds = { attack: {label:"Attack",icon:"attack"}, scout: {label:"Scout",icon:"scout"}, transfer: {label:"Transfer",art:"march"}, returning: {label:"Returning",art:"recall"}, reinforce: {label:"Reinforce",icon:"defense"}, rally: {label:"Rally Assembly",icon:"realm"}, "camp-return": {label:"Camp Recall",art:"recall"} };
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number = value => typeof value === "number" ? value.toLocaleString("en-US") : "Syncing";
const time = seconds => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2,"0")}s`;
const icon = name => `<svg aria-hidden="true"><use href="${iconFile}#${name}"></use></svg>`;
const art = name => `<img src="${artFiles[name]}" alt="">`;
let rows = [], inventory = {swift:3,recall:2}, revision = 0;

function fixtures(sample) {
  const base = [
    {id:"scout",kind:"scout",origin:"Ravenwatch",target:"Alderwick",map:"Northgate March",troops:1,targetTroops:7600,owner:"Lady Maeve",remaining:42},
    {id:"transfer",kind:"transfer",origin:"Briarford",target:"Ravenwatch",map:"Northgate March",troops:12000,remaining:166,swift:true,recall:true,returnSeconds:94,note:"Moving troops to your city"},
    {id:"attack",kind:"attack",origin:"Ravenwatch",target:"Greyhaven",map:"Ashen Vale",troops:4850,targetTroops:3200,owner:"Lord Aldric",remaining:252,recall:true,returnSeconds:108},
    {id:"return",kind:"returning",origin:"Briarford",target:"Briarford",originalTarget:"Ironmere",map:"Northgate March",troops:2250,remaining:304,note:"Recalled before reaching Ironmere"},
    {id:"reinforce",kind:"reinforce",origin:"Ravenwatch",target:"Ironwatch",map:"Ironwatch",troops:8000,remaining:680,recall:true,returnSeconds:170,note:"Reinforcing your Stronghold"},
    {id:"rally",kind:"rally",origin:"Dunmere",target:"Crown Citadel",map:"Crown Citadel",troops:6500,remaining:965,note:"Joining the clan rally"},
  ];
  if (sample === "empty") return [];
  if (sample === "transfers") return [
    {...base[1],remaining:312},
    {...base[1],id:"transfer-used",origin:"Dunmere",target:"Briarford",remaining:488,swift:false,swiftApplied:true,troops:14500},
    {...base[4],id:"owned-stronghold",remaining:805,swift:true},
    {...base[4],id:"allied-stronghold",target:"Swiftgate",map:"Swiftgate",note:"Reinforcing an allied Stronghold",troops:6250,remaining:1248},
  ];
  if (sample === "returns") return [
    {...base[3],remaining:16},
    {...base[3],id:"return-long",origin:"Dunmere",target:"Dunmere",originalTarget:"Stoneward",map:"Ashen Vale",remaining:526,troops:10200},
    {id:"camp-recall",kind:"camp-return",origin:"Gold Camp",target:"Ravenwatch",map:"Northgate March",troops:1500,remaining:864,note:"Withdrawing stationed troops to Ravenwatch"},
  ];
  if (sample === "pending") return [
    {...base[1],id:"sending",troops:null,state:"Sending",target:"Ravenwatch",remaining:0},
    {...base[2],id:"checking",state:"Checking",owner:null,targetTroops:null,note:"Target details are loading",remaining:0},
    {...base[0],id:"resolving",state:"Resolving",remaining:0},
    {...base[1],id:"applying",busy:"swift",remaining:386},
    {...base[2],id:"recalling",busy:"recall",remaining:552},
  ];
  if (sample === "long") return [
    {...base[2],origin:"The Royal Borough of West Ravenwatch",target:"The High Citadel of Thornfield and Ash",map:"The Northern Highlands of Westmarch",owner:"Duke Rowan of the Eastern Marches",troops:999999999,targetTroops:888888888,remaining:7519},
    {...base[1],origin:"Stonebridge-on-the-River",target:"Saint Alderwick's Fortified Crossing",map:"The March of the Kingsward",troops:12500000,remaining:8251},
    {...base[3],origin:"The High Borough of Ravenshold",target:"The High Borough of Ravenshold",originalTarget:"The Southern Watch of Windermere",map:"The Vale of Ash and Willow",troops:8900100,remaining:9604},
  ];
  if (sample === "many") return Array.from({length:18},(_,i)=>({...base[i%base.length],id:`march-${i}`,remaining:42+i*147}));
  return base;
}

function status(message) {
  document.getElementById("panelStatus").textContent = message;
  document.getElementById("liveStatus").textContent = message;
  window.parent.postMessage({type:"marches-status",message},location.origin);
}
function actionButton(kind, row) {
  const label = kind === "swift" ? "Swift Order" : "Recall";
  const full = kind === "swift" ? "Use Swift March Order" : "Use Recall Horn";
  return `<button class="command ${kind}" data-command="${kind}" data-row="${row.id}" aria-label="${full} on ${esc(row.target)}" title="${full}" ${row.busy ? "disabled" : ""}>${art(kind)}<span>${label}</span></button>`;
}
function renderRow(row) {
  const kind = kinds[row.kind], returning = row.kind === "returning", state = row.state;
  const targetName = returning ? row.origin : row.target;
  const originName = returning ? row.originalTarget : row.origin;
  const originLabel = returning ? "Recalled before" : "Origin";
  const targetLabel = returning ? "Returning to" : "Destination";
  const commands = [];
  if (!state && row.swift && inventory.swift > 0) commands.push(actionButton("swift",row));
  if (!state && row.recall && inventory.recall > 0) commands.push(actionButton("recall",row));
  commands.push(`<button class="command locate" data-command="map" data-row="${row.id}" aria-label="Go to current march location for ${esc(targetName)}" title="Go to current march location" ${state === "Sending" ? "disabled" : ""}>${icon("map")}<span>Map</span></button>`);
  let note = row.busy === "swift" ? "Applying Swift Order…" : row.busy === "recall" ? "Sounding Recall…" : "";
  if (!state && !row.busy && !row.swiftApplied && !inventory.swift && !inventory.recall && (row.swift || row.recall)) note = "No march items in your bag";
  const targetInfo = row.owner ? `<div class="target-info"><button class="owner-link" data-profile="${esc(row.owner)}" aria-label="View ${esc(row.owner)}'s profile">${esc(row.owner)}</button><span>· ${number(row.targetTroops)} troops</span></div>` : `<small>${esc(returning ? `Returning to ${row.origin}` : row.note || "Target details are loading")}</small>`;
  const timing = state || time(row.remaining);
  const timingNote = state === "Sending" ? "Order being sent" : state === "Checking" ? "Checking the same order" : state === "Resolving" ? "Arrived · awaiting result" : returning || row.kind === "camp-return" ? "Until return" : "Until arrival";
  return `<article class="march-row ${row.kind}${number(row.troops).length > 8 ? " wide-force" : ""}${row.busy ? " busy" : ""}" data-march="${row.id}" aria-label="${esc(kind.label)} to ${esc(targetName)}">
    <div class="march-kind">${kind.icon ? icon(kind.icon) : art(kind.art)}<strong>${kind.label}</strong></div>
    <div class="march-route"><div class="route-point source"><span>${originLabel}</span><strong>${esc(originName)}</strong></div><span class="route-arrow" aria-hidden="true">${returning ? "↩" : "→"}</span><div class="route-point destination"><span>${targetLabel} · ${esc(row.map)}</span><strong>${esc(targetName)}</strong>${targetInfo}</div></div>
    <div class="march-force">${art("troops")}<strong>${number(row.troops)}</strong><small>${row.troops === null ? "troop count" : row.kind === "scout" ? "scout" : "troops"}</small></div>
    <div class="march-arrival${state ? " pending" : row.remaining <= 30 ? " urgent" : ""}"><strong>${timing}</strong><small>${timingNote}</small>${row.swiftApplied ? '<small class="applied">Swift Order applied</small>' : ""}</div>
    <div class="march-actions">${commands.join("")}${note ? `<small class="command-note">${note}</small>` : ""}</div>
  </article>`;
}
function render() {
  const previousScroll = list.scrollTop;
  const summary = document.getElementById("marchSummary");
  document.getElementById("marchCount").textContent = rows.length;
  document.getElementById("swiftCount").textContent = inventory.swift;
  document.getElementById("recallCount").textContent = inventory.recall;
  const counts = rows.reduce((all,row)=>{all[row.kind]=(all[row.kind]||0)+1;return all;},{});
  const countLabels = {attack:["attack","attacks"],scout:["scout","scouts"],transfer:["transfer","transfers"],returning:["return","returns"],reinforce:["reinforcement","reinforcements"],rally:["rally assembly","rally assemblies"],"camp-return":["camp recall","camp recalls"]};
  const description = Object.entries(counts).map(([kind,count])=>`${count} ${countLabels[kind][count===1?0:1]}`).join(" · ");
  const first = rows[0], pendingLabel = first?.state ? first.state === "Checking" ? "Checking the same order" : first.state === "Resolving" ? "Resolving arrived order" : "Sending order to server" : "Soonest arrival";
  summary.innerHTML = `<div class="summary-copy"><h2>${rows.length ? `${rows.length} ${rows.length===1?"march":"marches"} underway` : "Your armies are at rest"}</h2><p>${esc(description || "No active troop marches")}</p></div>${first ? `<div class="summary-next"><span>${pendingLabel}</span><strong>${first.state || time(first.remaining)}</strong></div>` : ""}`;
  list.innerHTML = rows.length ? rows.map(renderRow).join("") : `<div class="empty-state">${art("march")}<h2>No active troop marches</h2><p>Armies, scouts, transfers and returning troops will appear here when they are on the move.</p><button data-command="return-map">Return to map</button></div>`;
  list.scrollTop = previousScroll;
}
function loadSample(sample) {
  revision += 1;
  rows = fixtures(sample).sort((a,b)=>a.remaining-b.remaining);
  inventory = sample === "no-items" ? {swift:0,recall:0} : {swift:3,recall:2};
  list.scrollTop = 0;
  render();
  status("Orders in motion across the realm");
  if (!dialog.open) dialog.showModal();
}
list.addEventListener("click", event => {
  const profile = event.target.closest("[data-profile]");
  if (profile) {status(`Profile preview: this opens ${profile.dataset.profile}'s ruler profile in the game.`);return;}
  const button = event.target.closest("[data-command]");
  if (!button || button.disabled) return;
  const command = button.dataset.command;
  if (command === "return-map") {dialog.close();status("Returned to the map. Reopen to continue reviewing.");return;}
  const row = rows.find(entry=>entry.id===button.dataset.row);
  if (!row) return;
  if (command === "map") {status(`Map preview: locate the ${kinds[row.kind].label.toLowerCase()} toward ${row.kind==="returning"?row.origin:row.target} at its current position.`);return;}
  if (row.busy || row.state || !row[command] || !inventory[command]) return;
  const currentRevision = revision;
  // Reserve the sample item immediately so rapid actions cannot overspend it.
  inventory[command] -= 1;
  row.busy = command;
  render();
  status(command === "swift" ? "Applying Swift Order…" : "Sounding Recall…");
  setTimeout(()=>{
    if(currentRevision!==revision) return;
    row.busy = null;
    if(command === "swift") {row.remaining=Math.ceil(row.remaining*0.5);row.swift=false;row.swiftApplied=true;}
    else {row.originalTarget=row.target;row.kind="returning";row.remaining=row.returnSeconds;row.target=row.origin;row.map="Northgate March";row.recall=false;row.swift=false;row.swiftApplied=false;row.owner=null;row.targetTroops=null;}
    rows.sort((a,b)=>a.remaining-b.remaining);
    render();
    list.querySelector(`[data-march="${row.id}"] [data-command="map"]`)?.focus({preventScroll:true});
    status(command === "swift" ? "Draft example: one Swift Order used; the sample remaining time is halved." : `Draft example: one Recall Horn used; the army is returning to ${row.origin}.`);
  },450);
});
document.getElementById("close").addEventListener("click",()=>dialog.close());
document.getElementById("reopen").addEventListener("click",()=>dialog.showModal());
window.addEventListener("message",event=>{
  if(event.origin===location.origin && event.source===window.parent && event.data?.type==="marches-review") loadSample(event.data.sample);
});
loadSample("standard");
