/* The estate is presentation only. Construction fixtures never enter player state. */
(function (root, factory) {
  const estate = factory();
  if (typeof module === "object" && module.exports) module.exports = estate;
  else root.CrownlandsEstate = estate;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";
  const WIDTH = 1448, HEIGHT = 1086;
  const ASSETS = "assets/inner-city-estate/";
  // Decorative outpainting fills wide-screen gutters; the playable map and
  // approved center retain their original 1448 x 1086 coordinates and camera.
  const scenery = Object.freeze([
    ["west",-904.25,939], ["east",1414.75,937.5],
  ].map(([key,x,width])=>Object.freeze({key,x,width,height:HEIGHT,src:ASSETS+"terrain-surround-"+key+".webp"})));
  // One physical scale (.30 map pixels per source-atlas pixel). Preserve each
  // building's natural silhouette; fitting every sprite to a square breaks scale.
  const spriteSizes = [[75.5,63.5],[93,91],[90,58],[72,56],[140.2624309392265,57.80386740331492],[112,57.5],[74,62.5],[94,55],[84,58],[59,55],[105.5,62.5],[71.5,60.5],[72.5,53.5],[117,46.5],[53,72.5],[118,60.5],[68.5,52],[83.5,45.5],[102.5,47],[75,45]];
  // Overlapping close-up paintings retain the same logical map coordinates.
  // Only visible tiles are requested when the camera exceeds overview density.
  const terrainTiles = Object.freeze([
    ["nw",0,0], ["ne",700,0], ["sw",0,519], ["se",700,519],
  ].map(([key,x,y])=>Object.freeze({key,x,y,width:748,height:567,src:ASSETS+"terrain-detail-"+key+".webp"})));
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
    ["gatehouse", "Gatehouse", 50, 60, "city", 10.5, 10.5, "City defense / wall strength"],
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
  const buildings = Object.freeze(definitions.map(([key, label, x, y, district, width, height, role], index) => Object.freeze({
    key, label, role, district,
    hotspot: Object.freeze({ left: x, top: y }),
    footprint: Object.freeze({ width, height }),
    artSize: Object.freeze({ width:spriteSizes[index][0], height:spriteSizes[index][1] }),
    // Offsets recover the exact cutout location in the painted wall junction.
    artOffsetX: key === "gatehouse" ? 5.697513812154739 : 0,
    artOffsetY: key === "gatehouse" ? 27.180386740331528 : 0,
    entrance: Object.freeze([x, y + height / 2]),
    initialState: oldArt[key] ? "completed" : "unbuilt",
    artSrc: oldArt[key] ? "assets/optimized/" + oldArt[key] : ASSETS + key + ".webp",
    artByState: Object.freeze({ completed: ASSETS + key + ".webp", unbuilt: ASSETS + "surveyed-plot.webp", constructing: ASSETS + "construction.webp" }),
  })));
  const districts = Object.freeze([
    { key: "city", label: "Walled City", x: 50, y: 43 },
    { key: "quarry", label: "Quarry Hills", x: 29, y: 25 },
    { key: "mine", label: "Iron Ridge", x: 73, y: 26 },
    { key: "woodland", label: "Woodland", x: 19, y: 40 },
    { key: "crafts", label: "Crafts Quarter", x: 34, y: 65 },
    { key: "farmland", label: "Farmland", x: 27, y: 83 },
    { key: "trade", label: "Trade Quarter", x: 83, y: 56 },
  ].map(Object.freeze));
  const junctions = {
    south: [50, 100], hub: [50, 70], sw: [43, 65], ws: [33, 65], wm: [30, 54], saw: [29, 49], wn: [29, 39], nw: [34, 23], nm: [49, 18], ne: [68, 24], en: [74, 34], em: [75, 53], es: [78, 67], wagon: [78, 73], se: [78, 75], sm: [63, 76],
    an: [24, 70], aw: [12, 74], asw: [12, 85], as: [29, 93], ase: [50, 92], ae: [53, 81],
    gateOut: [50, 65.5], gateIn: [50, 54.5], square: [50, 43], hall: [50, 36],
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
    "royal-stables": ["gateIn", [[54, 54]]], "guild-master": ["square", [[46, 52], [44, 54], [44, 58.5], [40, 58.5]]],
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
  const states = Object.freeze(["unbuilt", "constructing", "completed"]);
  function createStates(fixture = null) {
    return Object.fromEntries(buildings.map(b => [b.key, states.includes(fixture?.[b.key]) ? fixture[b.key] : b.initialState]));
  }
  const cottages=Object.freeze([
    [35,39,3,4],[43.8,26.5,3,4],[56,30,3,4],[64,41,3,4],[63,56,3,4],[35,51,3,4],[45.2,45.3,3,4],[53.3,46,3,4],[91,43,3,4],[92,50,3,4],[76.5,39,3,4],
    [34.5,43.5,1.8,2.8],[35,46.5,1.8,2.8],[44.5,33,1.8,2.8],[55.5,34.2,1.8,2.8],[58,28,1.8,2.8],[61.5,27.5,1.8,2.8],[66.5,45,1.8,2.8],[66,49.2,1.8,2.8],[56.5,56,1.8,2.8],[60,57,1.8,2.8],
  ].map(([x,y,width,height],i)=>Object.freeze({key:"cottage-"+i,hotspot:Object.freeze({left:x,top:y}),footprint:Object.freeze({width,height})})));
  function siteMarkup(b, siteState) {
    return `<div class="estate-site" data-estate-site="${b.key}" data-site-state="${siteState}" style="left:${b.hotspot.left}%;top:${b.hotspot.top}%;width:${b.footprint.width}%;height:${b.footprint.height}%;z-index:${Math.round((b.hotspot.top+b.footprint.height/2)*100)}">
      <img ${siteState === "completed" ? `class="estate-building-art" style="width:${b.artSize.width}px;height:${b.artSize.height}px;--estate-art-offset-x:${b.artOffsetX}px;--estate-art-offset:${b.artOffsetY}px"` : 'class="estate-plot-art"'} src="${b.artByState[siteState]}" alt="" draggable="false">
      </div>`;
  }
  function shell(options, siteStates) {
    return `<section class="estate-shell" aria-labelledby="estateTitle">
      <header class="estate-header"><button type="button" data-inner-castle-back>‹ <span>Back to City Details</span></button><div><p>${escape(options.cityName)} · Main City</p><h2 id="estateTitle">Inner Castle</h2></div><button type="button" data-estate-directory-toggle aria-expanded="false" aria-controls="estateDirectory">Buildings <span>20</span></button><span class="estate-close-space"></span></header>
      <div class="estate-viewport" tabindex="0" aria-label="City estate map. Drag to pan; use zoom controls or arrow keys to explore.">
        <div class="estate-world" aria-hidden="true">
          ${scenery.map(s=>`<img class="estate-scenery" data-estate-scenery="${s.key}" alt="" draggable="false" hidden>`).join("")}
          <div class="estate-ground"><img class="estate-terrain" src="${ASSETS}terrain.webp" alt="" draggable="false">
          ${terrainTiles.map(t=>`<img class="estate-terrain-detail" data-terrain-tile="${t.key}" style="left:${t.x}px;top:${t.y}px;width:${t.width}px;height:${t.height}px;--fade-left:${t.x ? 24 : 0}px;--fade-right:${t.x ? 0 : 24}px;--fade-top:${t.y ? 24 : 0}px;--fade-bottom:${t.y ? 0 : 24}px" alt="" draggable="false" hidden>`).join("")}
          </div>${buildings.map(b=>siteMarkup(b,siteStates[b.key])).join("")}
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
    const shellElement=host.querySelector(".estate-shell"), viewport=host.querySelector(".estate-viewport"), world=host.querySelector(".estate-world"), detail=host.querySelector(".estate-detail"), directory=host.querySelector(".estate-directory");
    const camera = {zoom:1,x:WIDTH/2,y:HEIGHT/2,detailOpen:false,directoryOpen:false,...options.camera};
    let selected=options.selectedKey || "great-hall", fit=1, destroyed=false, gestureMoved=false, suppressClick=false;
    const pointers = new Map(), abort = new AbortController(), signal=abort.signal;
    const targets=[...host.querySelectorAll("[data-inner-castle-building]")];
    const districtTargets=[...host.querySelectorAll("[data-estate-district]")];
    const tileImages=[...world.querySelectorAll("[data-terrain-tile]")];
    const sceneryImages=[...world.querySelectorAll("[data-estate-scenery]")];
    const visualLeft=b=>b.hotspot.left+(siteStates[b.key]==="completed"?b.artOffsetX*100/WIDTH:0);
    const visualTop=b=>b.hotspot.top+(siteStates[b.key]==="completed"?b.artOffsetY*100/HEIGHT:0);
    const listen=(element,type,callback,extra={})=>element.addEventListener(type,callback,{...extra,signal});
    function paint() {
      if(destroyed) return;
      const width=viewport.clientWidth,height=viewport.clientHeight;
      if(!width || !height) return;
      fit=Math.min(width/WIDTH,height/HEIGHT);
      const scale=fit*camera.zoom;
      const clampAxis=(value,size,screen)=>size*scale<=screen?size/2:Math.max(screen/(2*scale),Math.min(size-screen/(2*scale),value));
      camera.x=clampAxis(camera.x,WIDTH,width);camera.y=clampAxis(camera.y,HEIGHT,height);
      const tx=width/2-camera.x*scale,ty=height/2-camera.y*scale;
      // Re-rasterize at the current scale; a promoted overview layer otherwise
      // magnifies its cached low-density pixels even with native detail images.
      world.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;
      const gutter=Math.max(0,(width-WIDTH*scale)/(2*scale)),sceneryVisible=gutter>.5;
      world.classList.toggle("has-scenery",sceneryVisible);
      sceneryImages.forEach((image,i)=>{
        const s=scenery[i];
        image.hidden=!sceneryVisible;
        // Anchor to the map edge. Extra-wide displays crop only the scenery,
        // never stretch the city or change its fitted view and hit targets.
        const extra=Math.max(0,gutter-(i ? s.x+s.width-WIDTH : -s.x));
        const sceneWidth=s.width+extra;
        image.style.left=(s.x-(i ? 0 : extra))+"px";
        image.style.width=sceneWidth+"px";
        image.style.height=HEIGHT+"px";
        if(sceneryVisible&&!image.getAttribute("src"))image.src=s.src;
      });
      tileImages.forEach((image,i)=>{
        const t=terrainTiles[i],visible=scale*(rootDevicePixelRatio())>1.05 && tx+(t.x+t.width)*scale>0 && tx+t.x*scale<width && ty+(t.y+t.height)*scale>0 && ty+t.y*scale<height;
        image.hidden=!visible;
        if(visible&&!image.getAttribute("src"))image.src=t.src;
      });
      const locate=(element,x,y)=>{const sx=tx+x*WIDTH/100*scale,sy=ty+y*HEIGHT/100*scale;element.style.left=sx+"px";element.style.top=sy+"px";return sx>=22&&sy>=22&&sx<=width-22&&sy<=height-22;};
      const boxes=buildings.map(b=>({x:tx+visualLeft(b)*WIDTH/100*scale,y:ty+visualTop(b)*HEIGHT/100*scale}));
      targets.forEach((target,i)=>{
        const b=buildings[i], visible=locate(target,visualLeft(b),visualTop(b));
        const collision=boxes.some((p,j)=>j!==i&&Math.abs(p.x-boxes[i].x)<46&&Math.abs(p.y-boxes[i].y)<46);
        target.hidden=camera.zoom<2.5||!visible||collision; target.setAttribute("aria-pressed",String(selected===b.key));
      });
      const viewportBox=viewport.getBoundingClientRect(), controls=host.querySelector(".estate-camera-controls").getBoundingClientRect();
      districtTargets.forEach((target,i)=>{
        const d=districts[i];target.hidden=camera.zoom>=2.5||!locate(target,d.x,d.y);
        if(target.hidden)return;
        // Extraction labels stay below their miniature art even when the map
        // shrinks but accessible text retains its screen-pixel size.
        if(d.key==="quarry"||d.key==="mine"){
          const b=buildings.find(b=>b.key===d.key),label=target.querySelector("span").getBoundingClientRect();
          const south=ty+(b.hotspot.top+b.footprint.height/2)*HEIGHT/100*scale;
          target.style.top=Math.max(parseFloat(target.style.top),south+label.height/2+6)+"px";
        }
        const r=target.getBoundingClientRect();
        if(r.left<controls.right+8&&r.right>controls.left-8&&r.top<controls.bottom+8&&r.bottom>controls.top-8){
          target.style.left=Math.min(viewportBox.width-r.width/2-8,controls.right-viewportBox.left+r.width/2+8)+"px";
        }
      });
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
      const s=siteStates[b.key],gearRole=s==="completed"&&options.onGear?options.gearRoles?.[b.key]:null;
      detail.hidden=!camera.detailOpen;
      detail.querySelector(":scope > [data-manage-common-gear]")?.remove();
      detail.querySelector("[data-estate-detail-copy]").innerHTML=`<p class="estate-eyebrow">${s==="unbuilt"?"Surveyed plot":s==="constructing"?"Under construction":"Completed building"}</p><h3>${escape(b.label)}</h3><img src="${s==="completed"?b.artSrc:b.artByState[s]}" alt="${escape(b.label)} ${s==="completed"?"artwork":"site"}" draggable="false"><p>${escape(b.role)}</p><p class="estate-building-status">${gearRole?escape(gearRole)+" gear and bonuses":"Function planned"}</p>${gearRole?'<button type="button" class="estate-manage" data-manage-common-gear="'+b.key+'">Manage Gear →</button>':""}`;
      const manage=detail.querySelector("[data-manage-common-gear]");
      if(manage){detail.append(manage);manage.addEventListener("click",()=>options.onGear?.(b.key),{signal});}
      targets.forEach(t=>t.setAttribute("aria-pressed",String(t.dataset.innerCastleBuilding===selected)));
      host.querySelectorAll("[data-estate-directory-building]").forEach(t=>t.setAttribute("aria-current",t.dataset.estateDirectoryBuilding===selected?"true":"false"));
    }
    function select(key, focus=true, openBuilding=false) {
      const b=buildings.find(b=>b.key===key);if(!b)return;
      selected=key;camera.detailOpen=true;camera.directoryOpen=false;directory.hidden=true;
      host.querySelector("[data-estate-directory-toggle]").setAttribute("aria-expanded","false");
      if(focus){camera.zoom=Math.max(2.5,camera.zoom);camera.x=visualLeft(b)*WIDTH/100;camera.y=visualTop(b)*HEIGHT/100;}
      options.onSelect?.(key);
      if(openBuilding&&siteStates[key]==="completed"&&options.gearRoles?.[key]&&typeof options.onGear==="function"){
        camera.detailOpen=false;paint();renderDetail();
        // The equipment callback replaces this scene. Save selection/camera
        // before it runs and leave the disposed DOM alone afterward.
        options.onGear(key);return;
      }
      paint();renderDetail();
      if(focus) detail.querySelector("[data-estate-detail-close]").focus({preventScroll:true});
    }
    listen(shellElement,"click",event=>{
      if(suppressClick&&!event.target.closest("button")){suppressClick=false;return;}
      suppressClick=false;
      const b=event.target.closest("[data-inner-castle-building],[data-estate-directory-building]");
      if(b){select(b.dataset.innerCastleBuilding||b.dataset.estateDirectoryBuilding,true,true);return;}
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
    const resize=new ResizeObserver(paint);resize.observe(viewport);
    renderDetail();paint();
    return {
      select, zoom, fit:()=>{camera.zoom=1;camera.x=WIDTH/2;camera.y=HEIGHT/2;paint();},
      snapshot:()=>({...camera}),
      debug:()=>({camera:{...camera},siteStates:{...siteStates},actors:0,mode:"still",animationRunning:false,destroyed}),
      destroy(){if(destroyed)return;destroyed=true;abort.abort();resize.disconnect();},
    };
  }
  function rootDevicePixelRatio() { return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1; }
  return Object.freeze({width:WIDTH,height:HEIGHT,buildings,cottages,districts,roads,junctions,terrainTiles,scenery,states,createStates,samplePath,mount});
});
