/* Approval-only sample. No game boot, accounts, commands, or stored state. */
"use strict";
const params = new URLSearchParams(location.search);
const stage = [1,25,50,75,100].includes(Number(params.get("stage"))) ? Number(params.get("stage")) : 100;
const zoom = [0.2,0.6,1].includes(Number(params.get("zoom"))) ? Number(params.get("zoom")) : 1;
const kind = ["own","ally","enemy"].includes(params.get("kind")) ? params.get("kind") : "own";
const art = ["city-shack-7acf6bfddaa7","city-fort-804504bf13a8","city-keep-eff443c6c279","city-castle-0f453b4a11b2","city-city-47cad1d12242"];
const imagePath = i => `/assets/worlds/core-expansion-v1/art/${art[i]}.webp`;
const ownActions = [
  ["Regroup","send","reinforcement","100"],
  ["Level","level","arrow-up","10Mg"],
  ["Info","info","information"],
  ["Send","send","forward"],
  ["Nearby","scout","scout","100"],
];
const actions = kind === "own" ? ownActions : kind === "ally" ? [
  ["Clan Ally","disabled","reinforcement"], ["Info","info","information"], ["Reinforce","reinforce","reinforcement"],
] : [["Scout","scout","scout"],["Info","info","information"],["Report","info","reports"],["Attack","attack","attack"]];
const selection = document.getElementById("selection"), castle = document.getElementById("castle"), menu = document.getElementById("actions"), arc = document.getElementById("arc");
castle.querySelector("img").src = imagePath([1,25,50,75,100].indexOf(stage));
document.getElementById("level").textContent = stage;
document.querySelector("#banner span").textContent = `[SAMPLE] ${kind === "own" ? "YOUR KINGDOM" : kind === "ally" ? "CLAN ALLY" : "RIVAL KINGDOM"}`;
const iconArt = {scout:"report-scout-ink-384x384-449c386d3b06",reports:"report-reports-ink-384x384-05cfed23ee0e",attack:"report-attack-ink-384x384-1e1a12b255a7"};
const renderIcon = icon => iconArt[icon] ? `<img class="cl-icon" src="/assets/optimized/${iconArt[icon]}.webp" alt="">` : `<svg class="cl-icon"><use href="#cl-icon-${icon}"></use></svg>`;
menu.innerHTML = actions.map(([name,color,icon,cost]) => `<button class="city-wheel-action cl-action-button cl-action-${color}" type="button" aria-label="${name} (sample)" ${color === "disabled" ? "disabled" : ""}><span class="wheel-icon" aria-hidden="true">${renderIcon(icon)}</span><span class="wheel-action-name">${name}</span>${cost ? `<span class="wheel-cost">${cost}</span>` : ""}</button>`).join("");
let feedbackTimer;
menu.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  document.getElementById("feedback").textContent = `${button.querySelector(".wheel-action-name").textContent} · preview only`;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { document.getElementById("feedback").textContent = ""; }, 1800);
});
function setSelected(value) { menu.hidden = arc.hidden = !value; }
castle.addEventListener("click", () => setSelected(menu.hidden));
document.getElementById("scene").addEventListener("click", event => { if (!selection.contains(event.target)) setSelected(false); });
document.addEventListener("keydown", event => { if (event.key === "Escape") setSelected(false); });
const neighbors = [[20,38,3,"ASHFORD"],[80,32,2,"GREENVALE"],[17,77,0,"WESTWATCH"],[83,72,4,"HIGHMOOR"]];
document.getElementById("neighbors").innerHTML = neighbors.map(([x,y,i,name]) => `<div class="neighbor" style="left:${x}%;top:${y}%" data-stage="${i}"><span>${name}</span><img src="${imagePath(i)}" alt=""></div>`).join("");
function layout() {
  const phone = innerHeight <= 500, buttonSize = phone ? 56 : 72, gap = phone ? 12 : 16;
  // Same current city footprint and five-stage progression, at the requested zoom.
  const fit = Math.min(innerWidth/1448,innerHeight/1086);
  const citySize = 56 * (0.6 + [1,25,50,75,100].indexOf(stage)*0.1) * fit*3*zoom;
  castle.style.width = castle.style.height = `${citySize}px`;
  document.getElementById("banner").style.top = `${-citySize/2-10}px`;
  // Both the full button rectangles and the connecting stroke stay outside the
  // sprite rectangle, including transparent padding. At small stages/zoom the
  // spacing floor prevents adjacent buttons from colliding.
  const angles = actions.map((_,i) => Math.PI-i*Math.PI/(actions.length-1));
  const depth = Math.max((citySize+buttonSize)/2+gap,(buttonSize+6)/Math.sin(Math.PI/(actions.length-1)));
  const distance = (r,angle) => Math.hypot(Math.max(0,Math.abs(r*Math.cos(angle))-(citySize+buttonSize)/2),Math.max(0,Math.abs(depth*Math.sin(angle))-(citySize+buttonSize)/2));
  let radius = Math.max(depth,(buttonSize+10)/(2*Math.sin(Math.PI/(2*(actions.length-1)))));
  while (angles.some(angle => distance(radius,angle) < gap-0.000001)) radius += 0.5;
  // Diagonal square hit regions need more room than their visible hexagon tips.
  while (angles.some((a,i) => angles.slice(i+1).some(b => Math.hypot(Math.max(0,Math.abs(radius*(Math.cos(a)-Math.cos(b)))-buttonSize),Math.max(0,Math.abs(depth*(Math.sin(a)-Math.sin(b)))-buttonSize)) < 5.999))) radius += 0.5;
  const path = `M ${-radius} 0 A ${radius} ${depth} 0 0 0 ${radius} 0`;
  for (const p of arc.querySelectorAll("path")) p.setAttribute("d",path);
  [...menu.children].forEach((button,i) => {
    const angle = angles[i];
    button.style.left = `${radius*Math.cos(angle)}px`;
    button.style.top = `${depth*Math.sin(angle)}px`;
  });
  for (const neighbor of document.querySelectorAll(".neighbor")) neighbor.style.width = `${56*(0.6+Number(neighbor.dataset.stage)*0.1)*fit*3*zoom}px`;
  document.documentElement.dataset.ready = "true";
}
// Reuse the game's vector icon definitions without executing its scripts.
fetch("/index.html").then(response => {if(!response.ok) throw Error("Icon source unavailable");return response.text();}).then(source => {
  const parsed = new DOMParser().parseFromString(source,"text/html"), sprite = document.createElementNS("http://www.w3.org/2000/svg","svg");
  sprite.style.display = "none"; sprite.setAttribute("aria-hidden","true");
  for (const id of new Set(actions.map(a => a[2]))) {
    if (iconArt[id]) continue;
    const symbol = parsed.getElementById(`cl-icon-${id}`);
    if (symbol) sprite.appendChild(document.importNode(symbol,true));
  }
  document.body.appendChild(sprite); layout();
}).catch(() => {document.getElementById("feedback").textContent="Icons could not load. Refresh the local draft.";});
window.addEventListener("resize",layout);
