/* Pure preview projection. Deliberately independent of live world/travel rules. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SeamlessModel = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const TILE = { width: 1448, height: 1086 };
  const WORLD = { width: TILE.width * 3, height: TILE.height * 3 };
  const identity = (sectionId, objectId) => JSON.stringify([sectionId, objectId]);
  const offset = section => ({ x: section.x ?? (section.gridX + 2) * TILE.width, y: section.y ?? (section.gridY + 2) * TILE.height });
  function localToWorld(section, point) { const o = offset(section); return { x: o.x + point.x, y: o.y + point.y }; }
  function worldToLocal(section, point) { const o = offset(section); return { x: point.x - o.x, y: point.y - o.y }; }
  function project(camera, point, size) {
    return { x: (point.x - camera.x) * camera.zoom + size.width / 2, y: (point.y - camera.y) * camera.zoom + size.height / 2 };
  }
  function unproject(camera, point, size) {
    return { x: (point.x - size.width / 2) / camera.zoom + camera.x, y: (point.y - size.height / 2) / camera.zoom + camera.y };
  }
  function limits(size, world = WORLD) {
    const fit = Math.min(size.width / TILE.width, size.height / TILE.height);
    const detail = fit * 0.56;
    // Stop just above the detail cutoff so cities and their area feed remain
    // visible. Apply the same floor to every camera input, including resize.
    return { min: Math.max(detail + fit * 0.04, Math.min(size.width / world.width, size.height / world.height)), detail, home: fit, max: fit * 3 };
  }
  function clamp(camera, size, world = WORLD) {
    const range = limits(size, world);
    const zoom = Math.max(range.min, Math.min(range.max, camera.zoom));
    const axis = (value, screen, world) => screen / zoom >= world ? world / 2 : Math.max(screen / zoom / 2, Math.min(world - screen / zoom / 2, value));
    return { x: axis(camera.x, size.width, world.width), y: axis(camera.y, size.height, world.height), zoom };
  }
  function zoomAt(camera, size, anchor, zoom, nextAnchor = anchor, world = WORLD) {
    const point = unproject(camera, anchor, size), range = limits(size, world);
    zoom = Math.max(range.min, Math.min(range.max, zoom));
    return clamp({ x: point.x - (nextAnchor.x - size.width / 2) / zoom, y: point.y - (nextAnchor.y - size.height / 2) / zoom, zoom }, size, world);
  }
  function visible(camera, size, margin = 0) {
    const a = unproject(camera, { x: -margin, y: -margin }, size), b = unproject(camera, { x: size.width + margin, y: size.height + margin }, size);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  }
  function intersects(box, x, y, width, height) { return x + width > box.left && y + height > box.top && x < box.right && y < box.bottom; }
  function interestSections(sections, camera, size, previous = []) {
    const visibleSections = margin => sections.filter(s => intersects(visible(camera,size,margin),s.x,s.y,s.width,s.height));
    let required = visibleSections(24);
    if (required.length > 16) required = visibleSections(0);
    const retained = sections.filter(s => previous.includes(s.id));
    if (retained.length <= 16 && required.length && required.every(s => previous.includes(s.id))) return retained;
    // A rectangular window matches the landscape screen. A nearest-16 circle
    // discarded visible corner sections repeatedly during small pans/zooms.
    const maxX = Math.max(...sections.map(s => s.x / TILE.width)), maxY = Math.max(...sections.map(s => s.y / TILE.height));
    const columns = Math.min(maxX+1,size.width/size.height > 2 ? 5 : 4), rows = Math.min(maxY+1,Math.floor(16/columns));
    const origin = (axis, span, count, max) => {
      const low = Math.min(...required.map(s => s[axis]/span)), high = Math.max(...required.map(s => s[axis]/span));
      return Math.max(0,Math.min(max+1-count,Math.max(high-count+1,Math.min(low,Math.round(camera[axis]/span-count/2)))));
    };
    const x = origin("x",TILE.width,columns,maxX), y = origin("y",TILE.height,rows,maxY);
    const window = sections.filter(s => s.x/TILE.width >= x && s.x/TILE.width < x+columns && s.y/TILE.height >= y && s.y/TILE.height < y+rows);
    if (required.every(s => window.includes(s))) return window;
    // Extreme aspect ratios still prioritize visible sections within the cap.
    const distance = s => Math.hypot(s.x+TILE.width/2-camera.x,s.y+TILE.height/2-camera.y);
    return [...required.sort((a,b)=>distance(a)-distance(b)),...sections.filter(s=>!required.includes(s)).sort((a,b)=>distance(a)-distance(b))].slice(0,16);
  }
  function preparePath(points) {
    let length = 0;
    return { points: points.map((p, i) => { if (i) length += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y); return { ...p, distance: length }; }), length };
  }
  // Lay out labels in world units, so pan/zoom cannot enlarge them or change
  // their clearance. Spatial buckets keep crowded area updates bounded.
  function placeLabels(labels, compactKeys = new Set(), attempt = 0, obstacles = []) {
    const grid = new Map(), cell = 160, gap = 4;
    const buckets = rect => {
      const keys=[];
      for(let x=Math.floor(rect.left/cell);x<=Math.floor(rect.right/cell);x++)
        for(let y=Math.floor(rect.top/cell);y<=Math.floor(rect.bottom/cell);y++)keys.push(x+":"+y);
      return keys;
    };
    const add=rect=>{for(const key of buckets(rect)){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(rect);}};
    const blocked=rect=>buckets(rect).some(key=>(grid.get(key)||[]).some(other=>rect.left<other.right+gap&&rect.right+gap>other.left&&rect.top<other.bottom+gap&&rect.bottom+gap>other.top));
    obstacles.forEach(add);
    const placed=[];
    for(const label of [...labels].sort((a,b)=>(b.priority||0)-(a.priority||0)||a.y-b.y||a.key.localeCompare(b.key))){
      let result;
      // Keep full details near their castle. In a crowded row, retain the name
      // and heraldry and stagger the compact banner before moving it farther.
      const variants=[...(compactKeys.has(label.key)?[]:[{...label,compact:false,limit:24}]),...(label.compact?[{...label.compact,compact:true,limit:288}]:[{...label,compact:false,limit:288}])];
      for(const variant of variants){
        for(let up=0;up<=variant.limit&&!result;up+=12)for(const dx of [0,-24,24,-48,48]){
          const rect={left:label.x+dx-variant.width/2,right:label.x+dx+variant.width/2,top:label.y-up-variant.height,bottom:label.y-up};
          if(!blocked(rect)){result={key:label.key,dx,dy:-up,compact:variant.compact,rect};break;}
        }
        if(result)break;
      }
      // An exceptional coincident marker retains its castle hit target/name
      // for selection. Never paint an unreadable stack of overlapping banners.
      if(result){add(result.rect);placed.push(result);}else placed.push({key:label.key,hidden:true});
    }
    if(attempt<3){
      let changed=false;
      const byKey=new Map(labels.map(label=>[label.key,label]));
      for(const result of placed.filter(p=>p.hidden||p.dy < -60)){
        const crowded=byKey.get(result.key);
        for(const label of labels)if(label.compact&&!compactKeys.has(label.key)&&Math.abs(label.x-crowded.x)<180&&Math.abs(label.y-crowded.y)<180){compactKeys.add(label.key);changed=true;}
      }
      if(changed)return placeLabels(labels,compactKeys,attempt+1,obstacles);
    }
    return placed;
  }
  function clearScenery(items, obstacles) {
    const grid=new Map(),cell=160;
    const keys=r=>{const result=[];for(let x=Math.floor(r.left/cell);x<=Math.floor(r.right/cell);x++)for(let y=Math.floor(r.top/cell);y<=Math.floor(r.bottom/cell);y++)result.push(x+":"+y);return result;};
    for(const r of obstacles)for(const key of keys(r)){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(r);}
    return items.filter(o=>!keys({left:o.left,top:o.top,right:o.left+o.width,bottom:o.top+o.height}).some(key=>(grid.get(key)||[]).some(r=>intersects(r,o.left,o.top,o.width,o.height))));
  }
  function along(path, distance) {
    distance = Math.max(0, Math.min(path.length, distance));
    let lo = 0, hi = path.points.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (path.points[mid].distance < distance) lo = mid + 1; else hi = mid; }
    const b = path.points[lo], a = path.points[Math.max(0, lo - 1)], t = (distance - a.distance) / (b.distance - a.distance || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function forWorld(world) { return { ...api, limits: size => limits(size, world), clamp: (camera, size) => clamp(camera, size, world), zoomAt: (camera, size, anchor, zoom, nextAnchor) => zoomAt(camera, size, anchor, zoom, nextAnchor, world) }; }
  const api = { TILE, WORLD, identity, offset, localToWorld, worldToLocal, project, unproject, limits, clamp, zoomAt, visible, intersects, interestSections, placeLabels, clearScenery, preparePath, along, forWorld };
  return api;
});
