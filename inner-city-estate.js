/* The estate is presentation only. Construction fixtures never enter player state. */
(function (root, factory) {
  const estate = factory();
  if (typeof module === "object" && module.exports) module.exports = estate;
  else root.CrownlandsEstate = estate;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";
  const WIDTH = 1448, HEIGHT = 1086;
  const ASSETS = "assets/inner-city-estate/";
  const oldArt = {
    treasury: "inner-castle-treasury-512x512-6c53e7cf4366.webp",
    "great-hall": "inner-castle-great-hall-512x512-11afdcfaa594.webp",
    barracks: "inner-castle-barracks-512x512-8353ca76ded4.webp",
    alehouse: "inner-castle-alehouse-512x512-959b09534998.webp",
    gatehouse: "inner-castle-gatehouse-512x512-3c5f1b7dcdc9.webp",
    "royal-stables": "inner-castle-royal-stables-512x512-5a9290514dbd.webp",
  };
  const definitions = [
    ["treasury", "Treasury", 39, 33, "city", 7, 7, "Gold storage / gold production"],
    ["great-hall", "Great Hall", 50, 31, "city", 9, 10, "Ruler power / kingdom upgrades"],
    ["barracks", "Barracks", 61, 34, "city", 7, 7, "Troop production / military strength"],
    ["alehouse", "Alehouse", 40, 46, "city", 7, 7, "Morale / recovery / small boosts"],
    ["gatehouse", "Gatehouse", 50, 60, "city", 9, 8, "City defense / wall strength"],
    ["royal-stables", "Royal Stables", 60, 48, "city", 10, 9, "Movement / march speed"],
    ["guild-master", "Guild Master", 40, 54, "city", 7, 7, "Manage champions, form quest parties and review expedition reports."],
    ["quarry", "Quarry", 29, 18, "quarry", 10, 8, "Gather stone for buildings and fortifications."],
    ["mine", "Mine", 73, 19, "mine", 9, 9, "Extract iron ore for equipment and crafted components."],
    ["foresters-lodge", "Forester’s Lodge", 17, 33, "woodland", 7, 7, "Gather wood from the surrounding forest."],
    ["sawmill", "Sawmill", 23, 45, "woodland", 9, 8, "Process logs into construction timber."],
    ["smithy", "Smithy", 27, 61, "crafts", 7, 7, "Forge metal fittings, tools and equipment components."],
    ["workshop", "Workshop", 37, 70, "crafts", 7, 7, "Assemble practical goods and crafted components."],
    ["builders-yard", "Builders’ Yard", 43, 83, "farmland", 9, 8, "Manage construction crews and the building queue."],
    ["windmill", "Windmill", 12, 64, "farmland", 5, 8, "Process harvested grain into food and provisions."],
    ["farmstead", "Farmstead", 18, 79, "farmland", 10, 8, "Grow and harvest crops for the settlement."],
    ["granary", "Granary", 29, 87, "farmland", 6, 7, "Store grain and protect the city’s food reserves."],
    ["storehouse", "Storehouse", 69, 63, "trade", 8, 7, "Store timber, stone, ore and finished goods."],
    ["wagon-yard", "Wagon Yard", 87, 69, "trade", 10, 8, "Organize freight wagons, deliveries and caravans."],
    ["market", "Market", 83, 44, "trade", 9, 8, "Trade materials and manage merchant contracts."],
  ];
  const buildings = Object.freeze(definitions.map(([key, label, x, y, district, width, height, role]) => Object.freeze({
    key, label, role, district,
    hotspot: Object.freeze({ left: x, top: y }),
    footprint: Object.freeze({ width, height }),
    entrance: Object.freeze([x, y + height / 2]),
    initialState: oldArt[key] ? "completed" : "unbuilt",
    artSrc: oldArt[key] ? "assets/optimized/" + oldArt[key] : ASSETS + key + ".webp",
    artByState: Object.freeze({ completed: ASSETS + key + ".webp", unbuilt: ASSETS + "surveyed-plot.svg", constructing: ASSETS + "construction.svg" }),
  })));
  const districts = Object.freeze([
    { key: "city", label: "Walled City", x: 50, y: 43 },
    { key: "quarry", label: "Quarry Hills", x: 29, y: 19 },
    { key: "mine", label: "Iron Ridge", x: 73, y: 20 },
    { key: "woodland", label: "Woodland", x: 19, y: 40 },
    { key: "crafts", label: "Crafts Quarter", x: 34, y: 65 },
    { key: "farmland", label: "Farmland", x: 27, y: 83 },
    { key: "trade", label: "Trade Quarter", x: 83, y: 56 },
  ].map(Object.freeze));
  const junctions = {
    south: [50, 100], hub: [50, 70], sw: [43, 65], ws: [33, 65], wm: [30, 54], saw: [29, 49], wn: [29, 39], nw: [34, 23], nm: [49, 18], ne: [68, 24], en: [74, 34], em: [75, 53], es: [78, 67], wagon: [78, 73], se: [78, 75], sm: [63, 76],
    an: [24, 70], aw: [12, 74], asw: [12, 85], as: [29, 93], ase: [50, 92], ae: [53, 81],
    gateOut: [50, 65], gateIn: [50, 55], square: [50, 43], hall: [50, 36],
  };
  const roads = [];
  function road(id, from, to, bends = [], buildingKey = "") {
    const anchors = [junctions[from], ...bends, junctions[to]];
    const winding = /^(circuit|farm|royal-approach)/.test(id) ? .35 : 0;
    const points = anchors.slice(1).flatMap(([x,y],index)=>{
      const [px,py]=anchors[index],length=Math.hypot(x-px,y-py)||1;
      return Array.from({length:winding?12:1},(_,step)=>{
        const t=step/(winding?12:1),bow=Math.sin(t*Math.PI)*winding;
        return [px+(x-px)*t-(y-py)/length*bow,py+(y-py)*t+(x-px)/length*bow];
      });
    });
    points.push(anchors.at(-1));
    roads.push(Object.freeze({ id, from, to, buildingKey, points: Object.freeze(points.map(point => Object.freeze(point))) }));
  }
  road("royal-approach", "south", "hub"); road("royal-gate", "hub", "gateOut");
  road("gate-passage", "gateOut", "gateIn", [], "gatehouse"); road("royal-street", "gateIn", "square"); road("hall-approach", "square", "hall", [], "great-hall");
  const circuit = ["hub", "sw", "ws", "wm", "saw", "wn", "nw", "nm", "ne", "en", "em", "es", "wagon", "se", "sm", "hub"];
  circuit.slice(1).forEach((to, i) => road("circuit-" + i, circuit[i], to));
  const farm = ["ws", "an", "aw", "asw", "as", "ase", "ae", "hub"];
  farm.slice(1).forEach((to, i) => road("farm-" + i, farm[i], to));
  const spurs = {
    treasury: ["square", [[44, 39]]], barracks: ["square", [[56, 40]]], alehouse: ["square", [[46, 49.5]]],
    "royal-stables": ["gateIn", [[54, 54]]], "guild-master": ["square", [[46, 52], [44, 58.5], [40, 58.5]]],
    quarry: ["nw", [[29, 23]]], mine: ["ne", [[73, 24]]], "foresters-lodge": ["wn", [[17, 39]]], sawmill: ["saw", []],
    smithy: ["ws", [[27, 65]]], workshop: ["hub", [[43, 74], [37, 74]]], "builders-yard": ["ase", [[43, 90]]],
    windmill: ["an", [[12, 70]]], farmstead: ["asw", [[18, 85]]], granary: ["as", []],
    storehouse: ["es", [[69, 67]]], "wagon-yard": ["wagon", []], market: ["em", [[83, 51]]],
  };
  buildings.forEach(building => {
    if (!spurs[building.key]) return;
    const [from, bends] = spurs[building.key];
    junctions[building.key] = building.entrance;
    road(building.key + "-entrance", from, building.key, bends, building.key);
  });
  Object.freeze(roads);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const point = ([x, y]) => `${x * 10},${y * 7.5}`;
  const roadPath = road => "M" + road.points.map(point).join(" L");
  const states = Object.freeze(["unbuilt", "constructing", "completed"]);
  function createStates(fixture = null) {
    return Object.fromEntries(buildings.map(b => [b.key, states.includes(fixture?.[b.key]) ? fixture[b.key] : b.initialState]));
  }
  function wallMarkup(front) {
    const paths = front ? ["M310,352 L350,428 L450,458", "M550,458 L650,435 L690,368"] : ["M310,352 L310,263 L340,218 L400,180 L600,180 L670,225 L690,368"];
    const towers = front ? [[35,57],[65,58]] : [[31,35],[34,29],[40,24],[60,24],[67,30]];
    return `<svg class="estate-wall ${front ? "estate-wall-front" : "estate-wall-back"}" viewBox="0 0 1000 750" aria-hidden="true"><defs><pattern id="estate-stone-${front}" width="9" height="5" patternUnits="userSpaceOnUse"><rect width="9" height="5" fill="#c7bea0"/><path d="M0 4.5h9M4 0v5" stroke="#6d6650" stroke-width=".45"/></pattern></defs>${paths.map(d => `<path d="${d}" fill="none" stroke="#453d2a" stroke-width="12"/><path d="${d}" fill="none" stroke="url(#estate-stone-${front})" stroke-width="9"/><path d="${d}" transform="translate(0,-4)" fill="none" stroke="#e2d4b2" stroke-width="3" stroke-dasharray="5 3"/>`).join("")}${towers.map(([x,y]) => `<g transform="translate(${x*10},${y*7.5})"><path d="M-6,-12h12v17l-6,3-6-3z" fill="url(#estate-stone-${front})" stroke="#534a35" stroke-width="1"/><path d="M-8,-12l8-8 8 8z" fill="#525445" stroke="#3b382c" stroke-width="1"/></g>`).join("")}</svg>`;
  }
  const cottages=Object.freeze([
    [35,39,3,4],[43.8,26.5,3,4],[56,30,3,4],[64,41,3,4],[63,56,3,4],[35,51,3,4],[45.2,45.3,3,4],[53.3,46,3,4],[91,43,3,4],[92,50,3,4],[76.5,39,3,4],
    [34.5,43.5,1.8,2.8],[35,46.5,1.8,2.8],[44.5,33,1.8,2.8],[55.5,34.2,1.8,2.8],[58,28,1.8,2.8],[61.5,27.5,1.8,2.8],[66.5,45,1.8,2.8],[66,49.2,1.8,2.8],[56.5,56,1.8,2.8],[60,57,1.8,2.8],
  ].map(([x,y,width,height],i)=>Object.freeze({key:"cottage-"+i,hotspot:Object.freeze({left:x,top:y}),footprint:Object.freeze({width,height})})));
  function sceneryMarkup() {
    return cottages.map((c,i) => `<img class="estate-cottage" src="${ASSETS}${i%2 ? "foresters-lodge" : "farmstead"}.webp" style="left:${c.hotspot.left}%;top:${c.hotspot.top}%;width:${c.footprint.width}%;height:${c.footprint.height}%;z-index:${Math.round((c.hotspot.top+c.footprint.height/2)*100)}" alt="" draggable="false">`).join("");
  }
  function siteMarkup(b, siteState) {
    return `<div class="estate-site" data-estate-site="${b.key}" data-site-state="${siteState}" style="left:${b.hotspot.left}%;top:${b.hotspot.top}%;width:${b.footprint.width}%;height:${b.footprint.height}%;z-index:${Math.round((b.hotspot.top+b.footprint.height/2)*100)}">
      <img src="${b.artByState[siteState]}" alt="" draggable="false"><span class="estate-plot-sign" aria-hidden="true">${escape(b.label)}</span>
      ${siteState === "completed" ? `<span class="estate-pennant"></span>${["alehouse","smithy","great-hall"].includes(b.key) ? '<span class="estate-smoke"></span>' : ""}${b.key === "windmill" ? '<img class="estate-mill-sails" src="assets/inner-city-estate/mill-sails.svg" alt="">' : ""}` : ""}
      </div>`;
  }
  function shell(options, siteStates) {
    return `<section class="estate-shell" aria-labelledby="estateTitle">
      <header class="estate-header"><button type="button" data-inner-castle-back>‹ <span>Back to City Details</span></button><div><p>${escape(options.cityName)} · Main City</p><h2 id="estateTitle">Inner Castle</h2></div><button type="button" data-estate-directory-toggle aria-expanded="false" aria-controls="estateDirectory">Buildings <span>20</span></button><span class="estate-close-space"></span></header>
      <div class="estate-viewport" tabindex="0" aria-label="City estate map. Drag to pan; use zoom controls or arrow keys to explore.">
        <div class="estate-world" aria-hidden="true"><img class="estate-terrain" src="${ASSETS}terrain.webp" alt="" draggable="false">
          <svg class="estate-roads" viewBox="0 0 1000 750"><g class="estate-road-edge">${roads.map(r=>`<path d="${roadPath(r)}"/>`).join("")}</g><g class="estate-road-dirt">${roads.map(r=>`<path d="${roadPath(r)}"/>`).join("")}</g><g class="estate-road-ruts">${roads.map(r=>`<path d="${roadPath(r)}"/>`).join("")}</g><ellipse cx="500" cy="323" rx="25" ry="15" fill="#b9a475" stroke="#8d7a50" stroke-width=".8"/></svg>
          ${wallMarkup(false)}${sceneryMarkup()}${buildings.map(b=>siteMarkup(b,siteStates[b.key])).join("")}${wallMarkup(true)}<div class="estate-actors"></div>
        </div>
        <div class="estate-map-targets">${districts.map(d=>`<button type="button" class="estate-district" data-estate-district="${d.key}" aria-label="Zoom to ${escape(d.label)}"><span>${escape(d.label)}</span></button>`).join("")}${buildings.map(b=>`<button type="button" class="estate-building-target" data-inner-castle-building="${b.key}" aria-label="${escape(b.label)}${options.newMarkers?.[b.key] ? "; new gear" : ""}" aria-controls="estateDetail" aria-pressed="false" hidden><span>${escape(b.label)}</span>${options.newMarkers?.[b.key] ? '<b class="estate-new" aria-hidden="true">!</b>' : ""}</button>`).join("")}</div>
        <nav class="estate-directory" id="estateDirectory" aria-label="Estate buildings" hidden>${districts.map(d=>`<section><h3>${escape(d.label)}</h3>${buildings.filter(b=>b.district===d.key).map(b=>`<button type="button" data-estate-directory-building="${b.key}"><span>${escape(b.label)}</span><small>${siteStates[b.key]==="completed" ? "Complete" : siteStates[b.key]==="constructing" ? "Building" : "Plot"}</small>${options.newMarkers?.[b.key] ? '<b class="estate-new" aria-label="New gear">!</b>' : ""}</button>`).join("")}</section>`).join("")}</nav>
        <aside class="estate-detail" id="estateDetail" aria-label="Selected building" hidden><button type="button" class="estate-detail-close" data-estate-detail-close aria-label="Close building details">×</button><div data-estate-detail-copy aria-live="polite"></div></aside>
        <div class="estate-camera-controls"><button type="button" data-estate-zoom="out" aria-label="Zoom out">−</button><output aria-label="Map zoom" data-estate-zoom-label>100%</output><button type="button" data-estate-zoom="in" aria-label="Zoom in">+</button><button type="button" data-estate-fit>Fit Estate</button></div><p class="estate-map-hint">Drag to explore · Select a district to look closer</p>
      </div></section>`;
  }
  const pathMetrics = new WeakMap();
  function samplePath(points, distance) {
    if (!pathMetrics.has(points)) {
      const scaled=points.map(([x,y])=>[x*WIDTH/100,y*HEIGHT/100]);
      const lengths=scaled.slice(1).map(([x,y],i)=>Math.hypot(x-scaled[i][0],y-scaled[i][1]));
      pathMetrics.set(points,{scaled,lengths,total:lengths.reduce((a,b)=>a+b,0)});
    }
    const {scaled,lengths,total}=pathMetrics.get(points);
    let remaining = ((distance % (2*total))+2*total)%(2*total), reverse = remaining > total;
    if(reverse) remaining = 2*total-remaining;
    let index=0; while(index<lengths.length-1 && remaining>lengths[index]) remaining-=lengths[index++];
    const ratio = lengths[index] ? remaining/lengths[index] : 0;
    const [x,y]=scaled[index], [nx,ny]=scaled[index+1];
    return { x:x+(nx-x)*ratio,y:y+(ny-y)*ratio,facing:(nx-x)*(reverse?-1:1)<0?-1:1 };
  }
  function mount(host, options = {}) {
    const siteStates = createStates(options.fixture);
    host.innerHTML = shell(options,siteStates);
    const shellElement=host.querySelector(".estate-shell"), viewport=host.querySelector(".estate-viewport"), world=host.querySelector(".estate-world"), actorsRoot=host.querySelector(".estate-actors"), detail=host.querySelector(".estate-detail"), directory=host.querySelector(".estate-directory");
    const camera = {zoom:1,x:WIDTH/2,y:HEIGHT/2,detailOpen:false,directoryOpen:false,...options.camera};
    let selected=options.selectedKey || "great-hall", fit=1, destroyed=false, raf=0, elapsed=0, last=0, mode="off", gestureMoved=false, suppressClick=false;
    const pointers = new Map(), abort = new AbortController(), signal=abort.signal;
    const targets=[...host.querySelectorAll("[data-inner-castle-building]")];
    const districtTargets=[...host.querySelectorAll("[data-estate-district]")];
    const listen=(element,type,callback,extra={})=>element.addEventListener(type,callback,{...extra,signal});
    function isVisible() {return !destroyed && shellElement.isConnected && !document.hidden && host.closest("dialog")?.open!==false;}
    function paint() {
      if(destroyed) return;
      const width=viewport.clientWidth,height=viewport.clientHeight;
      if(!width || !height) return;
      fit=Math.min(width/WIDTH,height/HEIGHT);
      const scale=fit*camera.zoom;
      const clampAxis=(value,size,screen)=>size*scale<=screen?size/2:Math.max(screen/(2*scale),Math.min(size-screen/(2*scale),value));
      camera.x=clampAxis(camera.x,WIDTH,width);camera.y=clampAxis(camera.y,HEIGHT,height);
      const tx=width/2-camera.x*scale,ty=height/2-camera.y*scale;
      world.style.transform=`translate3d(${tx}px,${ty}px,0) scale(${scale})`;
      const locate=(element,x,y)=>{const sx=tx+x*WIDTH/100*scale,sy=ty+y*HEIGHT/100*scale;element.style.left=sx+"px";element.style.top=sy+"px";return sx>=22&&sy>=22&&sx<=width-22&&sy<=height-22;};
      const boxes=buildings.map(b=>({x:tx+b.hotspot.left*WIDTH/100*scale,y:ty+b.hotspot.top*HEIGHT/100*scale}));
      targets.forEach((target,i)=>{
        const b=buildings[i], visible=locate(target,b.hotspot.left,b.hotspot.top);
        const collision=boxes.some((p,j)=>j!==i&&Math.abs(p.x-boxes[i].x)<46&&Math.abs(p.y-boxes[i].y)<46);
        target.hidden=camera.zoom<2.5||!visible||collision; target.setAttribute("aria-pressed",String(selected===b.key));
      });
      districtTargets.forEach((target,i)=>{const d=districts[i];target.hidden=camera.zoom>=2.5||!locate(target,d.x,d.y);});
      host.querySelector("[data-estate-zoom-label]").textContent=Math.round(camera.zoom*100)+"%";
      host.querySelector('[data-estate-zoom="out"]').disabled=camera.zoom<=1;
      host.querySelector('[data-estate-zoom="in"]').disabled=camera.zoom>=4;
      host.querySelector(".estate-map-hint").hidden=camera.zoom>=2.5;
    }
    function zoom(value,clientX,clientY) {
      const rect=viewport.getBoundingClientRect(), px=clientX==null?rect.width/2:clientX-rect.left,py=clientY==null?rect.height/2:clientY-rect.top;
      const previous=fit*camera.zoom,next=Math.max(1,Math.min(4,value));
      const wx=camera.x+(px-rect.width/2)/previous,wy=camera.y+(py-rect.height/2)/previous;
      camera.zoom=next;camera.x=wx-(px-rect.width/2)/(fit*next);camera.y=wy-(py-rect.height/2)/(fit*next);paint();
    }
    function renderDetail() {
      const b=buildings.find(b=>b.key===selected);if(!b)return;
      const s=siteStates[b.key],gearRole=options.gearRoles?.[b.key];
      detail.hidden=!camera.detailOpen;
      detail.querySelector(":scope > [data-manage-common-gear]")?.remove();
      detail.querySelector("[data-estate-detail-copy]").innerHTML=`<p class="estate-eyebrow">${s==="unbuilt"?"Surveyed plot":s==="constructing"?"Under construction":"Completed building"}</p><h3>${escape(b.label)}</h3><img src="${s==="completed"?b.artSrc:b.artByState[s]}" alt="${escape(b.label)} ${s==="completed"?"artwork":"site"}" draggable="false"><p>${escape(b.role)}</p><p class="estate-building-status">${gearRole?escape(gearRole)+" gear and bonuses":"Function planned"}</p>${gearRole?'<button type="button" class="estate-manage" data-manage-common-gear="'+b.key+'">Manage Gear →</button>':""}`;
      const manage=detail.querySelector("[data-manage-common-gear]");
      if(manage){detail.append(manage);manage.addEventListener("click",()=>options.onGear?.(b.key),{signal});}
      targets.forEach(t=>t.setAttribute("aria-pressed",String(t.dataset.innerCastleBuilding===selected)));
      host.querySelectorAll("[data-estate-directory-building]").forEach(t=>t.setAttribute("aria-current",t.dataset.estateDirectoryBuilding===selected?"true":"false"));
      host.querySelectorAll("[data-estate-site]").forEach(s=>s.classList.toggle("is-selected",s.dataset.estateSite===selected));
    }
    function select(key, focus=true) {
      const b=buildings.find(b=>b.key===key);if(!b)return;
      selected=key;camera.detailOpen=true;camera.directoryOpen=false;directory.hidden=true;
      host.querySelector("[data-estate-directory-toggle]").setAttribute("aria-expanded","false");
      if(focus){camera.zoom=Math.max(2.5,camera.zoom);camera.x=b.hotspot.left*WIDTH/100;camera.y=b.hotspot.top*HEIGHT/100;}
      options.onSelect?.(key);paint();renderDetail();
      if(focus) detail.querySelector("[data-estate-detail-close]").focus({preventScroll:true});
    }
    listen(shellElement,"click",event=>{
      if(suppressClick&&!event.target.closest("button")){suppressClick=false;return;}
      suppressClick=false;
      const b=event.target.closest("[data-inner-castle-building],[data-estate-directory-building]");
      if(b)select(b.dataset.innerCastleBuilding||b.dataset.estateDirectoryBuilding);
      const d=event.target.closest("[data-estate-district]");
      if(d){const district=districts.find(v=>v.key===d.dataset.estateDistrict);camera.zoom=2.5;camera.x=district.x*WIDTH/100;camera.y=district.y*HEIGHT/100;camera.detailOpen=false;renderDetail();paint();viewport.focus({preventScroll:true});}
      const z=event.target.closest("[data-estate-zoom]");if(z)zoom(camera.zoom+(z.dataset.estateZoom==="in"?.5:-.5));
      if(event.target.closest("[data-estate-fit]")){camera.zoom=1;camera.x=WIDTH/2;camera.y=HEIGHT/2;camera.detailOpen=false;renderDetail();paint();}
      if(event.target.closest("[data-estate-detail-close]")){camera.detailOpen=false;renderDetail();viewport.focus({preventScroll:true});}
      if(event.target.closest("[data-estate-directory-toggle]")){camera.directoryOpen=!camera.directoryOpen;directory.hidden=!camera.directoryOpen;event.target.closest("button").setAttribute("aria-expanded",String(camera.directoryOpen));if(camera.directoryOpen)directory.querySelector("button").focus({preventScroll:true});}
      if(event.target.closest("[data-inner-castle-back]"))options.onBack?.();
    });
    listen(viewport,"wheel",event=>{if(event.target.closest(".estate-detail,.estate-directory"))return;event.preventDefault();zoom(camera.zoom*Math.exp(-event.deltaY*.0015),event.clientX,event.clientY);},{passive:false});
    listen(viewport,"pointerdown",event=>{
      if(event.button!==0||event.target.closest("button,.estate-detail,.estate-directory"))return;
      gestureMoved=false;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});viewport.setPointerCapture(event.pointerId);
    });
    listen(viewport,"pointermove",event=>{
      const old=pointers.get(event.pointerId);if(!old)return;
      const oldPoints=[...pointers.values()];pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const next=[...pointers.values()];
      if(Math.hypot(event.clientX-old.x,event.clientY-old.y)>2)gestureMoved=true;
      if(next.length===2){const before=Math.hypot(oldPoints[0].x-oldPoints[1].x,oldPoints[0].y-oldPoints[1].y),after=Math.hypot(next[0].x-next[1].x,next[0].y-next[1].y);if(before>1)zoom(camera.zoom*after/before,(next[0].x+next[1].x)/2,(next[0].y+next[1].y)/2);}
      else {camera.x-=(event.clientX-old.x)/(fit*camera.zoom);camera.y-=(event.clientY-old.y)/(fit*camera.zoom);paint();}
    });
    const endPointer=event=>{pointers.delete(event.pointerId);if(gestureMoved)suppressClick=true;};
    listen(viewport,"pointerup",endPointer);listen(viewport,"pointercancel",endPointer);listen(viewport,"lostpointercapture",event=>pointers.delete(event.pointerId));
    listen(viewport,"keydown",event=>{
      if(event.target!==viewport)return;
      const delta=70/(fit*camera.zoom);
      if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","0"].includes(event.key))event.preventDefault();
      if(event.key==="ArrowLeft")camera.x-=delta;if(event.key==="ArrowRight")camera.x+=delta;if(event.key==="ArrowUp")camera.y-=delta;if(event.key==="ArrowDown")camera.y+=delta;
      if(event.key==="+"||event.key==="=")zoom(camera.zoom+.5);if(event.key==="-")zoom(camera.zoom-.5);if(event.key==="0"){camera.zoom=1;camera.x=WIDTH/2;camera.y=HEIGHT/2;}paint();
    });
    const routeFromRoads=ids=>ids.flatMap(id=>roads.find(r=>r.id===id).points);
    const routes=[
      routeFromRoads(["gate-passage","royal-street","hall-approach"]),
      routeFromRoads(["royal-approach","royal-gate","gate-passage","royal-street"]),
      ...roads.filter(r=>r.buildingKey&&siteStates[r.buildingKey]==="completed"&&r.buildingKey!=="gatehouse").map(r=>r.points),
    ];
    const workSites=buildings.filter(b=>siteStates[b.key]==="constructing").slice(0,2);
    const actors=Array.from({length:14},(_,i)=>{
      const element=document.createElement("div");element.className="estate-actor"+(i>=12?" estate-mounted":"");element.innerHTML='<span></span>';actorsRoot.append(element);
      const row=i<10?0:i<12?1:i===12?2:3;
      const worker=i>=8&&i<10?workSites[i-8]:null;
      const route=worker?[[worker.hotspot.left+worker.footprint.width*.3,worker.hotspot.top+worker.footprint.height*.25],[worker.hotspot.left+worker.footprint.width*.4,worker.hotspot.top+worker.footprint.height*.25]]:i===12?roads.find(r=>r.buildingKey==="royal-stables").points:i===13?routes[1]:routes[i%routes.length];
      return {element,sprite:element.firstElementChild,row,route,offset:i*157,speed:i===12?24:i===13?14:11+i%3};
    });
    function paintActors(time) {
      actors.forEach(a=>{
        const location=samplePath(a.route,a.offset+time*a.speed);
        a.element.style.transform=`translate3d(${location.x}px,${location.y}px,0)`;a.element.style.zIndex=String(Math.round(location.y/HEIGHT*10000));
        const frame=mode==="full"?Math.floor(time*(a.row===3?8:10)+a.offset/37)%8:0;
        a.sprite.style.backgroundPosition=`${frame/7*100}% ${a.row/3*100}%`;a.sprite.style.transform=`translate(-50%,-100%) scaleX(${location.facing})`;
      });
    }
    function tick(now){raf=0;if(!isVisible()||mode!=="full"){last=0;return;}if(last)elapsed+=Math.min((now-last)/1000,.1);last=now;paintActors(elapsed);raf=requestAnimationFrame(tick);}
    function refreshMotion(){
      cancelAnimationFrame(raf);raf=0;last=0;
      mode=options.animationManager?.getEffectiveMode?.()||"off";const active=isVisible()&&mode==="full";
      shellElement.dataset.estateMotion=active?"full":"still";paintActors(elapsed);
      if(active)raf=requestAnimationFrame(tick);
    }
    const unsubscribe=options.animationManager?.subscribeMode?.(refreshMotion);
    listen(document,"visibilitychange",refreshMotion);
    const resize=new ResizeObserver(()=>{paint();refreshMotion();});resize.observe(viewport);
    renderDetail();paint();refreshMotion();
    return {
      select, zoom, fit:()=>{camera.zoom=1;camera.x=WIDTH/2;camera.y=HEIGHT/2;paint();},
      snapshot:()=>({...camera}),
      debug:()=>({camera:{...camera},siteStates:{...siteStates},actors:actors.length,mode,animationRunning:Boolean(raf),destroyed}),
      destroy(){if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);raf=0;abort.abort();resize.disconnect();unsubscribe?.();actorsRoot.replaceChildren();},
    };
  }
  return Object.freeze({width:WIDTH,height:HEIGHT,buildings,cottages,districts,roads,junctions,states,createStates,samplePath,mount});
});
