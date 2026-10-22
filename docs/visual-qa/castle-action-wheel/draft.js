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
] : [["Scout","scout","scout"],["Info","info","information"],["Attack","attack","attack"],["Report","info","reports"]];
let silhouette = [], alphaMask;
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
  const phone = innerHeight <= 500, buttonSize = phone ? 44 : 56, gap = phone ? 4 : 6;
  // Same current city footprint and five-stage progression, at the requested zoom.
  const fit = Math.min(innerWidth/1448,innerHeight/1086);
  const citySize = 56 * (0.6 + [1,25,50,75,100].indexOf(stage)*0.1) * fit*3*zoom;
  castle.style.width = castle.style.height = `${citySize}px`;
  document.getElementById("banner").style.top = `${-citySize/2-10}px`;
  // Keep the original 142:118 ellipse, open at the top, and the original
  // side/bottom/upper-side action arrangement. Clear painted castle pixels,
  // not the empty corners of the transparent square image.
  const stroke = 8*buttonSize/64, centerY = citySize*.08;
  const curve = radius => Array.from({length:181},(_,i) => {
    const angle=(-45+i*1.5)*Math.PI/180;
    return {x:radius*Math.cos(angle),y:centerY+radius*118/142*Math.sin(angle)};
  });
  const clear = radius => curve(radius).every(point => {
    const px=Math.floor((point.x/citySize+.5)*256),py=Math.floor((point.y/citySize+.5)*256);
    if(px>=0 && px<256 && py>=0 && py<256 && alphaMask[(py*256+px)*4+3]>32) return false;
    return silhouette.every(edge=>Math.hypot(point.x-edge.x*citySize,point.y-edge.y*citySize)>=gap+stroke/2);
  });
  let radius=Math.max(citySize/2+gap,buttonSize*.6);
  for(let attempt=0;attempt<400 && !clear(radius);attempt++) radius+=.5;
  const ry=radius*118/142, tip=Math.SQRT1_2;
  const path=`M ${radius*tip} ${centerY-ry*tip} A ${radius} ${ry} 0 1 1 ${-radius*tip} ${centerY-ry*tip}`;
  for(const p of arc.querySelectorAll("path")) p.setAttribute("d",path);
  arc.style.setProperty("--arc-stroke",`${stroke}px`);
  const sideX=Math.max(radius,citySize/2+gap+buttonSize/2);
  const sideY=centerY-1.44*buttonSize/64;
  const infoY=Math.max(centerY+ry,citySize/2+gap+buttonSize/2,sideY+buttonSize+2);
  const extraX=sideX+buttonSize*.55;
  const extraY=sideY-buttonSize-2;
  const slots=actions.length===5
    ? [[-extraX,extraY],[-sideX,sideY],[0,infoY],[sideX,sideY],[extraX,extraY]]
    : actions.length===4
      ? [[-sideX,sideY],[0,infoY],[sideX,sideY],[extraX,extraY]]
      : [[-sideX,sideY],[0,infoY],[sideX,sideY]];
  [...menu.children].forEach((button,i)=>{
    button.style.left=`${slots[i][0]}px`;
    button.style.top=`${slots[i][1]}px`;
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
  document.body.appendChild(sprite);
  return castle.querySelector("img").decode();
}).then(() => {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=256;
  const context=canvas.getContext("2d",{willReadFrequently:true});
  context.drawImage(castle.querySelector("img"),0,0,256,256);
  alphaMask=context.getImageData(0,0,256,256).data;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    if(alphaMask[(y*256+x)*4+3]<=32)continue;
    if(x===0||y===0||x===255||y===255||[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>alphaMask[((y+dy)*256+x+dx)*4+3]<=32))silhouette.push({x:(x+.5)/256-.5,y:(y+.5)/256-.5});
  }
  layout();
}).catch(() => {document.getElementById("feedback").textContent="Icons could not load. Refresh the local draft.";});
window.addEventListener("resize",()=>{if(alphaMask)layout();});
