/* Continuous camera and bounded rendering; commands remain in the native game UI. */
"use strict";
window.createContinuousWorldView = async function (options = {}) {
  if (!options.scene?.production || typeof options.loadAreas !== "function") throw Error("Authenticated world required");
  const root = options.root || document;
  const $ = id => root.querySelector(`#${id}`);
  const viewport = $("viewport"), world = $("world"), objectsLayer = $("objects"), marchesLayer = $("marches");
  try {
    const stageThree = true, fullCatalog = true;
    const scene = options.scene;
    const M = window.SeamlessModel.forWorld(scene);
    scene.objects ||= []; scene.marches ||= [];
    world.style.width = `${scene.width}px`; world.style.height = `${scene.height}px`;
    world.classList.toggle("full-catalog", fullCatalog);
    viewport.setAttribute("aria-label", `${scene.sections.length}-section world. Drag to explore, scroll or pinch to zoom. Select to inspect.`);
    const objects = new Map(scene.objects.map(o => [o.key, o]));
    function prepareMarch(m, points) {
      const path = M.preparePath(points);
      return { ...m, points, path, position: points[0], bounds: { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) } };
    }
    let marches = scene.marches.map(m => prepareMarch(m, m.points)), activeMarches = marches, feed = null, feedEpoch = null, feedViewer = null, selectedSnapshot = null, routeDraft = null, gameplay = null;
    const byMarch = new Map(marches.map(m => [m.key, m]));
    const nodes = new Map(), terrain = new Map(), routeNodes = new Map();
    function renderRoutes(items){
      const keys=new Set(items.map(m=>m.key));
      for(const [key,node] of routeNodes)if(!keys.has(key)){node.remove();routeNodes.delete(key);}
      for(const item of items){
        let node=routeNodes.get(item.key);
        if(!node){node=document.createElementNS("http://www.w3.org/2000/svg","g");node.dataset.marchKey=item.key;
          for(let i=0;i<2;i++)node.append(document.createElementNS(node.namespaceURI,"polyline"));
          $("routes").append(node);routeNodes.set(item.key,node);}
        if(node.dataset.route!==item.routeId){const points=item.points.map(p=>`${p.x},${p.y}`).join(" ");for(const line of node.children)line.setAttribute("points",points);node.dataset.route=item.routeId;}
        const owner=window.SeamlessAppearance.routeClass(item),kind=item.missionKind==="scout"?"scout-route":"";
        [...node.children].forEach((line,i)=>line.setAttribute("class",`army-route-flow ${i?"":"army-route-base"} ${owner} ${kind}`));
      }
    }
    let patrolPlanAt = 0;
    let disposed = false;
    let size, camera, selected = null, dirty = true, raf = 0, lastFrame = 0;
    let serverTimeOffset = 0, sceneTime = 0, frozenTime = null, lastPlan = "", plannedCamera = null;
    const frameTimes = [], workTimes = [], pointers = new Map();
    let gesture = null, dragged = false, clickKey = null, suppressClick = false, listenerCount = 0;
    const cleanups = [];
    const assets = new window.SeamlessAssets.AssetLoader(() => { dirty = true; });
    const sprites = new window.SeamlessSpriteLayer(viewport, assets);
    let scenery = [], sceneryCamera = "";
    sprites.changed = () => { sceneryCamera = ""; };
    const homeSection = scene.sections.find(s => s.id === scene.homeSectionId);
    function on(target, event, handler, options) { target.addEventListener(event, handler, options); listenerCount++; cleanups.push(() => target.removeEventListener(event, handler, options)); }
    function center() { return { x: size.width / 2, y: size.height / 2 }; }
    function home() { routeDraft?.cancelFollow(); camera = M.clamp({ x: homeSection.x + 724, y: homeSection.y + 543, zoom: M.limits(size).home }, size); dirty = true; refreshInspector(); }
    function resize() {
      const previous = size; size = { width: viewport.clientWidth, height: viewport.clientHeight };
      if (!camera) home();
      else camera = M.clamp({ ...camera, zoom: camera.zoom * M.limits(size).home / M.limits(previous).home }, size);
      // A resize during a gesture starts a fresh anchor in the new viewport.
      gesture = null; dirty = true;
    }
    for (const section of scene.sections) {
      const tile = document.createElement("div"); tile.className = "tile"; tile.dataset.section = section.id;
      tile.style.cssText = `left:${section.x}px;top:${section.y}px;width:${section.width}px;height:${section.height}px;--gutter:${section.gutter ?? 2}px`;
      const thumb = new Image(), full = new Image(); thumb.alt = ""; full.alt = "";
      full.className = "full-terrain";
      const label = document.createElement("span"); label.className = "section-label"; label.textContent = section.name;
      tile.append(thumb, full, label); $("terrain").append(tile); terrain.set(section.id, { tile, thumb, full });
    }
    function setImage(image, path) {
      const url = assets.get(path);
      if (image.dataset.url === (url || "")) return;
      image.dataset.url = url || "";
      if (url) { image.src = url; image.hidden = false; } else { image.removeAttribute("src"); image.hidden = true; }
    }
    function createObject(item) {
      const node = document.createElement(["scenery","troop"].includes(item.kind) ? "div" : "button");
      node.className = item.kind === "troop" ? "troop army-token" : `object ${item.kind}`; node.dataset.key = item.key;
      if (item.kind !== "scenery") { node.type = "button"; node.setAttribute("aria-label", `${item.name} · ${item.sectionName || "Sample patrol"}`); }
      if (item.kind === "troop") {node.setAttribute("role","button");node.tabIndex=0;}
      if (item.kind !== "troop") { const image = new Image(); image.alt = ""; image.draggable = false; node.append(image); }
      if (!["scenery", "troop"].includes(item.kind)) { const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = item.name; node.append(tag); }
      if (item.kind !== "troop") node.style.cssText = `left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px`;
      (item.kind === "troop" ? marchesLayer : objectsLayer).append(node);
      nodes.set(item.key, node); return node;
    }
    function refreshInspector() {
      selectedSnapshot = objects.get(selected) || byMarch.get(selected) || (selectedSnapshot?.key === selected ? selectedSnapshot : null);
    }
    function select(key, notify = true) { if(key===selected&&byMarch.has(key)&&notify){clear();return;} if (objects.get(key)?.selectable || byMarch.has(key)) { selected = key; dirty = true; refreshInspector(); if (notify) options.onSelect?.(objects.get(key) || byMarch.get(key)); } }
    function clear(notify = true) { selected = null; selectedSnapshot = null; cancelFollow(); dirty = true; refreshInspector(); if (notify) options.onClear?.(); }
    function cancelFollow() { routeDraft?.cancelFollow(); }
    function point(event) { const rect = viewport.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
    function beginGesture() {
      const points = [...pointers.values()];
      if (!points.length) { gesture = null; return; }
      const midpoint = points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
      gesture = { camera: { ...camera }, midpoint, distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0 };
    }
    on(viewport, "pointerdown", event => {
      if (event.button !== 0) return;
      if (!pointers.size) { dragged = false; clickKey = event.target.closest("[data-key]")?.dataset.key || null; }
      pointers.set(event.pointerId, point(event)); viewport.setPointerCapture(event.pointerId);
      if (pointers.size > 1) { dragged = true; cancelFollow(); options.onZoom?.(); }
      beginGesture();
    });
    on(viewport, "pointermove", event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, point(event)); if (!gesture) beginGesture();
      const points = [...pointers.values()];
      const midpoint = points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
      const dx = midpoint.x - gesture.midpoint.x, dy = midpoint.y - gesture.midpoint.y;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      dragged = true; cancelFollow(); viewport.classList.add("dragging");
      if (points.length > 1 && gesture.distance > 0) {
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        camera = M.zoomAt(gesture.camera, size, gesture.midpoint, gesture.camera.zoom * distance / gesture.distance, midpoint);
      } else camera = M.clamp({ ...gesture.camera, x: gesture.camera.x - dx / gesture.camera.zoom, y: gesture.camera.y - dy / gesture.camera.zoom }, size);
      // The camera moves every frame; visibility reconciliation uses the margin.
    });
    function endPointer(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (!pointers.size) {
        if (!dragged && event.type === "pointerup") { if (clickKey) select(clickKey); else clear(); }
        suppressClick = true; viewport.classList.remove("dragging"); gesture = null;
      } else { dragged = true; beginGesture(); }
    }
    on(viewport, "pointerup", endPointer); on(viewport, "pointercancel", endPointer); on(viewport, "lostpointercapture", endPointer);
    on(viewport, "click", event => {
      // Pointer selection happens above; only native keyboard activation comes here.
      if (event.detail === 0 && !suppressClick) select(event.target.closest("[data-key]")?.dataset.key);
      suppressClick = false;
    });
    on(viewport, "keydown", event => {
      suppressClick = false;
      if (event.key === "Escape") { clear(); }
      const directions = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] };
      if (directions[event.key]) { event.preventDefault(); cancelFollow(); const [x, y] = directions[event.key]; camera = M.clamp({ ...camera, x: camera.x + x / camera.zoom, y: camera.y + y / camera.zoom }, size); dirty = true; }
    });
    on(viewport, "wheel", event => {
      event.preventDefault(); cancelFollow(); options.onZoom?.();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      camera = M.zoomAt(camera, size, point(event), camera.zoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002)); dirty = true;
    }, { passive: false });
    on($("home"), "click", home);
    on($("fit"), "click", () => { cancelFollow(); options.onZoom?.(); camera = M.clamp({ x: scene.width / 2, y: scene.height / 2, zoom: M.limits(size).min }, size); dirty = true; });
    for (const [id, factor] of [["plus", 1.25], ["minus", 0.8]]) on($(id), "click", () => { options.onZoom?.(); camera = M.zoomAt(camera, size, center(), camera.zoom * factor); dirty = true; });
    // The native From/To controls navigate the accepted route, including endpoints
    // outside the loaded area. Never reconstruct a route from city caches.
    on(marchesLayer,"pointerdown",event=>{if(event.target.closest("[data-army-endpoint]"))event.stopPropagation();});
    on(marchesLayer,"click",event=>{
      const button=event.target.closest("[data-army-endpoint]");if(!button)return;
      event.stopPropagation();const march=byMarch.get(button.closest("[data-key]").dataset.key);if(!march)return;
      const point=button.dataset.armyEndpoint==="from"?march.points[0]:march.points.at(-1);
      clear();camera=M.clamp({...camera,...point},size);dirty=true;
    });
    on(marchesLayer,"keydown",event=>{
      if(event.target.matches(".troop")&&["Enter"," "].includes(event.key)){event.preventDefault();event.stopPropagation();select(event.target.dataset.key);}
    });
    on($("retry"), "click", () => { if (feed?.authExpired) { location.replace("/play/"); return; } assets.retry(); feed?.refresh(); dirty = true; });
    if (fullCatalog) {
      const Feed = stageThree ? window.SeamlessDeltaFeed.DeltaFeed : window.SeamlessFeed.AreaFeed;
      feed = new Feed(data => {
        const principalChanged = stageThree && feedViewer && data.viewer && data.viewer !== feedViewer;
        if (data.viewer) feedViewer = data.viewer;
        const hadEpoch = Boolean(feedEpoch);
        const epochChanged = stageThree && data.epoch && data.epoch !== feedEpoch;
        if (data.epoch) feedEpoch = data.epoch;
        if (principalChanged || epochChanged || data.authExpired) routeDraft?.clear();
        if (principalChanged || (hadEpoch && epochChanged) || data.authExpired) gameplay?.clear();
        if (data.removed?.includes(routeDraft?.source?.key)) routeDraft.clear();
        if (stageThree && Number.isFinite(data.serverTime)) serverTimeOffset = data.serverTime - data.receivedAt;
        const inspectedSections = selectedSnapshot?.kind === "troop" ? selectedSnapshot.sections : [selectedSnapshot?.sectionId];
        const inspectedAreaPresent = inspectedSections.some(id => data.sections.some(s => s.id === id));
        const inspectedAreaLoaded = data.authoritative && inspectedAreaPresent;
        const inspectedMissing = inspectedAreaLoaded && !data.sections.some(s => s.objects.some(o => o.key === selected)) && !data.marches.some(m => m.key === selected);
        const freshSelected = inspectedAreaLoaded && data.sections.flatMap(s => s.objects).find(o => o.key === selected);
        const permissionChanged = freshSelected && selectedSnapshot && (freshSelected.owner !== selectedSnapshot.owner
          || freshSelected.troopVisibility !== selectedSnapshot.troopVisibility || freshSelected.spawnId !== selectedSnapshot.spawnId);
        if (principalChanged || epochChanged || data.authExpired || data.removed?.includes(selected) || inspectedMissing
            || permissionChanged
            ) { selected = null; selectedSnapshot = null; options.onClear?.(); }
        scene.objects = data.sections.flatMap(s => s.objects); objects.clear(); scene.objects.forEach(o => objects.set(o.key, o));
        const routes = new Map(data.routes.map(r => [r.id, r.points]));
        marches = data.marches.map(m => {
          const old = byMarch.get(m.key); return old && !epochChanged && old.routeId === m.routeId ? { ...old, ...m } : prepareMarch(m, routes.get(m.routeId));
        });
        byMarch.clear(); marches.forEach(m => byMarch.set(m.key, m)); scene.marches = marches;
        refreshInspector(); dirty = true;
        options.onAreas?.({ ...data, failed: feed.failed });
      }, options.loadAreas);
      const poll = setInterval(() => { if (!document.hidden) feed.refresh(); }, stageThree ? 1000 : 5000); cleanups.push(() => clearInterval(poll));
      on(window, "online", () => feed.refresh());
    }
    const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
    function renderScene() {
      const view = M.visible(camera, size, 75), exact = M.visible(camera, size);
      const overview = camera.zoom < M.limits(size).detail;
      const ordered = [...scene.sections].sort((a, b) => Math.hypot(a.x + 724 - camera.x, a.y + 543 - camera.y) - Math.hypot(b.x + 724 - camera.x, b.y + 543 - camera.y));
      const visibleSections = ordered.filter(s => M.intersects(exact, s.x, s.y, s.width, s.height));
      const fullSections = overview ? [] : [...visibleSections, ...ordered.filter(s => !visibleSections.includes(s))].slice(0, 4);
      const interest = M.interestSections(scene.sections,camera,size,feed?.ids || []);
      const nearby = ordered.filter(s => interest.includes(s));
      feed?.set(overview ? [] : nearby.map(s => s.id));
      const visibleObjects = scene.objects.filter(o => (!overview || (!fullCatalog && o.kind !== "scenery")) && M.intersects(view, o.left, o.top, o.width, o.height));
      const visibleMarches = overview && fullCatalog ? [] : activeMarches.filter(m => M.intersects(view, m.position.x - 18, m.position.y - 18, 36, 36));
      const requests = (fullCatalog ? (overview ? [] : nearby) : ordered).map((s, i) => ({ path: s.thumbnail, kind: "thumbnail", priority: visibleSections.includes(s) ? i : 100 + i }));
      if (fullCatalog) requests.push({ path: scene.overviewAsset, kind: "overview", priority: 0 });
      fullSections.forEach((s, i) => requests.push({ path: s.terrain, kind: "full", priority: visibleSections.includes(s) ? 10 + i : 150 + i }));
      [...new Set([...visibleObjects, ...visibleMarches].map(o => o.asset))].forEach((path, i) => requests.push({ path, kind: "sprite", priority: 30 + i }));
      const plan = JSON.stringify(requests);
      if (plan !== lastPlan) { assets.update(requests); lastPlan = plan; }
      if (fullCatalog) setImage($("catalog-overview"), scene.overviewAsset);
      for (const section of scene.sections) {
        const tile = terrain.get(section.id); setImage(tile.thumb, section.thumbnail); setImage(tile.full, section.terrain);
        // Scale labels without relaying out text on every zoom frame. Authored
        // matching gutters cover fractional sampling without stretching terrain.
        const labelScale = Math.max(1, 11 / (20 * camera.zoom));
        tile.tile.lastChild.style.transform = `translateX(-50%) scale(${labelScale})`;
        const tinyOverview = fullCatalog && overview && section.width * camera.zoom < 90;
        tile.tile.lastChild.hidden = tinyOverview && section.id !== scene.homeSectionId;
        tile.tile.lastChild.style.maxWidth = fullCatalog && overview && !tinyOverview ? `${section.width * .9 / labelScale}px` : "";
      }
      renderRoutes(overview?[]:marches.filter(m=>M.intersects(view,m.bounds.left,m.bounds.top,m.bounds.right-m.bounds.left,m.bounds.bottom-m.bounds.top)));
      scenery = visibleObjects.filter(o => o.kind === "scenery"); sceneryCamera = "";
      const interactive = visibleObjects.filter(o => o.kind !== "scenery");
      window.SeamlessAppearance?.loadIdentities?.(interactive);
      const visibleKeys = new Set([...interactive, ...visibleMarches].map(o => o.key));
      for (const [key, node] of nodes) if (!visibleKeys.has(key)) { node.remove(); nodes.delete(key); }
      for (const item of [...interactive, ...visibleMarches]) {
        const node = nodes.get(item.key) || createObject(item); if (item.kind !== "troop") setImage(node.firstChild, item.asset);
        window.SeamlessAppearance?.render(node,item,{selected:item.key===selected,zoom:camera.zoom});
        node.classList.toggle("selected", item.key === selected);

      }
      window.SeamlessAppearance?.layout(interactive.map(item => ({item,node:nodes.get(item.key)})));
      world.classList.toggle("close-view", camera.zoom >= M.limits(size).home);
      world.classList.toggle("overview", overview);
      marchesLayer.classList.toggle("overview", overview);
      $("zoom").textContent = `${Math.round(camera.zoom / M.limits(size).home * 100)}%`;
      const stats = assets.stats();
      $("load-status").textContent = stats.failed ? "Some artwork unavailable · retry" : feed?.authExpired ? "Sign in to reconnect" : feed?.failed ? "Reconnecting…" : "Connected";
      if (options.nativeUi && !stats.failed && !feed?.failed) $("load-status").textContent = "Connected";
      $("load-status").closest("footer").hidden = !stats.failed && !feed?.failed && !feed?.authExpired;
      $("retry").hidden = !stats.failed && !feed?.failed; $("retry").textContent = feed?.authExpired ? "Sign in" : "Retry loading";
    }
    function frame(now) {
      if (disposed) return;
      const start = performance.now();
      if (lastFrame && !document.hidden) { frameTimes.push(now - lastFrame); if (frameTimes.length > 900) frameTimes.shift(); }
      sceneTime = frozenTime ?? now / 1000 + serverTimeOffset;
      const view = M.visible(camera, size, 100);
      activeMarches = (fullCatalog && camera.zoom < M.limits(size).detail ? [] : marches).filter(m => M.intersects(view, m.bounds.left, m.bounds.top, m.bounds.right - m.bounds.left, m.bounds.bottom - m.bounds.top));
      for (const march of activeMarches) {
          let progress = Math.min(1, Math.max(0, (sceneTime - march.departAt) / (march.arriveAt - march.departAt)));
          if(march.returning)progress=march.returnStartProgress*(1-Math.min(1,Math.max(0,(sceneTime-march.recalledAt)/(march.arriveAt-march.recalledAt))));
          else if(march.swiftAt&&sceneTime>=march.swiftAt)progress=march.swiftProgress+(1-march.swiftProgress)*Math.min(1,Math.max(0,(sceneTime-march.swiftAt)/(march.arriveAt-march.swiftAt)));
          march.position = M.along(march.path, march.path.length * progress);
      }
      routeDraft?.tick(now);
      // Camera transforms remain frame-synchronous. Reconcile the larger scene
      // only when its culling margin or zoom requires it. Patrol hit targets
      // reconcile separately every 120ms; their visual positions update each frame.
      const moved = !plannedCamera || Math.hypot(camera.x - plannedCamera.x, camera.y - plannedCamera.y) * camera.zoom > 32;
      const zoomed = !plannedCamera || Math.abs(camera.zoom / plannedCamera.zoom - 1) > 0.03;
      if (dirty || moved || zoomed) { renderScene(); dirty = false; plannedCamera = { ...camera }; }
      if (now - patrolPlanAt >= 120) {
        const visible = activeMarches.filter(m => M.intersects(view, m.position.x-18,m.position.y-18,36,36));
        const keys = new Set(visible.map(m=>m.key));
        for (const [key,node] of nodes) if(node.classList.contains("troop") && !keys.has(key)) { node.remove();nodes.delete(key); }
        for (const m of visible) { const node=nodes.get(m.key)||createObject(m); window.SeamlessAppearance?.render(node,m,{selected:m.key===selected,zoom:camera.zoom}); }
        patrolPlanAt=now;
      }
      const cameraKey = `${camera.x}:${camera.y}:${camera.zoom}:${size.width}:${size.height}`;
      if (cameraKey !== sceneryCamera) { sprites.scenery(scenery, camera, size); sceneryCamera = cameraKey; }
      // Moving tokens retain the original DOM icon/count/timer presentation.
      for(const march of activeMarches){const node=nodes.get(march.key);if(node)window.SeamlessAppearance?.tickMarch(node,march,sceneTime);}
      options.onFrame?.({ camera, size, project: p => M.project(camera, p, size) });
      if (disposed) return;
      world.style.transform = `translate3d(${size.width / 2 - camera.x * camera.zoom}px,${size.height / 2 - camera.y * camera.zoom}px,0) scale(${camera.zoom})`;
      routeDraft?.draw(camera,size);
      for (const march of activeMarches) { const node = nodes.get(march.key); if (node) { const p = M.project(camera, march.position, size); node.style.transform = `translate3d(${p.x}px,${p.y}px,0) scale(${Math.min(1,camera.zoom/M.limits(size).max)}) translate(-50%,-50%)`; } }
      const selectedMarch = byMarch.get(selected);
      if(selectedMarch&&!M.intersects(M.visible(camera,size),selectedMarch.position.x,selectedMarch.position.y,1,1))clear();
      workTimes.push(performance.now() - start); if (workTimes.length > 900) workTimes.shift();
      lastFrame = now; raf = requestAnimationFrame(frame);
    }
    on(document, "visibilitychange", () => { lastFrame = 0; if (stageThree && !document.hidden) feed?.refresh(); });
    raf = requestAnimationFrame(frame);
    function dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(raf); observer.disconnect(); sprites.dispose(); assets.dispose(); feed?.dispose(); cleanups.forEach(fn => fn()); nodes.clear(); listenerCount = 0; options.onClear?.(); }
    on(window, "pagehide", dispose);
    // Camera operations are independent of server-authoritative game commands.
    const controller = {
      dispose,
      invalidate: () => { dirty = true; },
      getObject: key => objects.get(key) || byMarch.get(key),
      focus: item => { cancelFollow(); camera = M.clamp({ ...camera, x: item.x, y: item.y }, size); dirty = true; },
      clear: () => clear(false),
      get selectedKey() { return selected; },
      scene, home, select, routeDraft, gameplay, refresh: () => feed?.refresh(),
      snapshot: () => ({ camera: { ...camera }, size: { ...size }, selected, following: null, assets: assets.stats(), feed: feed?.stats(), nodes: nodes.size, listeners: listenerCount+(routeDraft?.cleanups.length||0)+(gameplay?.cleanups.length||0), frameTimes: [...frameTimes], workTimes: [...workTimes], marches: marches.map(m => ({ key: m.key, position: m.position })) }),
      view: (x, y, zoom) => { cancelFollow(); camera = M.clamp({ x, y, zoom: zoom ?? camera.zoom }, size); },
      time: value => { frozenTime = value; dirty = true; },
      resetMetrics: () => { frameTimes.length = 0; workTimes.length = 0; }
    };
    if (!options.root) window.seamlessPreview = controller;
    return controller;
  } catch (error) { $("load-status").textContent = "Map could not load. Reload to retry."; throw error; }
};

