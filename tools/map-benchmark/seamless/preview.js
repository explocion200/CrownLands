/* Private demonstration: no production accounts, subscriptions or orders. */
(async function () {
  "use strict";
  // Only the separate, allowlisted, expiring phone server supplies this origin.
  const phoneOrigin = document.querySelector('meta[name="crownlands-private-preview-origin"]')?.content;
  if (location.hostname !== "127.0.0.1" && phoneOrigin !== location.origin) throw new Error("Private preview requires loopback or the temporary phone test server.");
  const $ = id => document.getElementById(id);
  const viewport = $("viewport"), world = $("world"), objectsLayer = $("objects"), marchesLayer = $("marches");
  try {
    const stageThree = !!document.querySelector('meta[name="crownlands-stage-three"]');
    const params = new URLSearchParams(location.search), fullCatalog = stageThree || params.get("catalog") === "full", crowded = params.get("crowded") === "1";
    const response = await fetch(`/__benchmark__/seamless/${fullCatalog ? "catalog" : "fixture"}?crowded=${crowded}`, { credentials: stageThree ? "same-origin" : "omit" });
    if (!response.ok) throw new Error("Fixture unavailable");
    const scene = await response.json();
    const M = window.SeamlessModel.forWorld(scene);
    scene.objects ||= []; scene.marches ||= [];
    world.style.width = `${scene.width}px`; world.style.height = `${scene.height}px`;
    world.classList.toggle("full-catalog", fullCatalog);
    viewport.setAttribute("aria-label", `${scene.sections.length}-section private world. Drag to explore, scroll or pinch to zoom. Select to inspect.`);
    const objects = new Map(scene.objects.map(o => [o.key, o]));
    function prepareMarch(m, points) {
      const path = M.preparePath(points);
      return { ...m, points, path, position: points[0], bounds: { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) } };
    }
    let marches = scene.marches.map(m => prepareMarch(m, m.points)), activeMarches = marches, feed = null, feedEpoch = null, feedViewer = null, selectedSnapshot = null;
    const byMarch = new Map(marches.map(m => [m.key, m]));
    const nodes = new Map(), terrain = new Map();
    let patrolPlanAt = 0;
    let size, camera, selected = null, following = null, dirty = true, raf = 0, lastFrame = 0;
    let serverTimeOffset = 0, sceneTime = 0, frozenTime = null, lastInspectorSection = "", lastPlan = "", plannedCamera = null;
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
    function home() { following = null; camera = M.clamp({ x: homeSection.x + 724, y: homeSection.y + 543, zoom: M.limits(size).home }, size); dirty = true; refreshInspector(); }
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
      const node = document.createElement(item.kind === "scenery" ? "div" : "button");
      node.className = `object ${item.kind}`; node.dataset.key = item.key;
      if (item.kind !== "scenery") { node.type = "button"; node.setAttribute("aria-label", `${item.name} · ${item.sectionName || "Sample patrol"}`); }
      if (item.kind !== "troop") { const image = new Image(); image.alt = ""; image.draggable = false; node.append(image); }
      if (!["scenery", "troop"].includes(item.kind)) { const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = item.name; node.append(tag); }
      if (item.kind !== "troop") node.style.cssText = `left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px`;
      (item.kind === "troop" ? marchesLayer : objectsLayer).append(node);
      nodes.set(item.key, node); return node;
    }
    function sectionAt(point) { return scene.sections.find(s => point.x >= s.x && point.x < s.x + s.width && point.y >= s.y && point.y < s.y + s.height); }
    function refreshInspector() {
      const item = objects.get(selected) || byMarch.get(selected) || (selectedSnapshot?.key === selected ? selectedSnapshot : null);
      $("inspector").hidden = !item;
      if (!item) return;
      selectedSnapshot = item;
      $("kind").textContent = item.kind === "troop" ? "Sample march · read only" : `${item.kind} · read only`;
      $("name").textContent = item.name;
      const sectionName = item.kind === "troop" ? sectionAt(item.position)?.name : item.sectionName;
      $("section").textContent = `${sectionName || "Preview edge"}${fullCatalog && (feed?.failed || (!objects.has(selected) && !byMarch.has(selected))) ? " · last received" : ""}`; lastInspectorSection = sectionName;
      $("owner").textContent = item.owner;
      $("troops").textContent = item.troopVisibility === "hidden" ? "Troop count private" : item.troopVisibility === "estimate" ? `${item.troopEstimateLabel} troops · estimate` : `${(item.troops || 0).toLocaleString()} sample troops`;
      $("follow").hidden = item.kind !== "troop";
      $("follow").textContent = following === selected ? "Stop following" : "Follow";
    }
    function select(key) { if (objects.get(key)?.selectable || byMarch.has(key)) { selected = key; dirty = true; refreshInspector(); } }
    function cancelFollow() { if (following) { following = null; refreshInspector(); } }
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
      if (pointers.size > 1) { dragged = true; cancelFollow(); }
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
        if (!dragged && event.type === "pointerup" && clickKey) select(clickKey);
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
      if (event.key === "Escape") { selected = null; cancelFollow(); dirty = true; refreshInspector(); }
      const directions = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] };
      if (directions[event.key]) { event.preventDefault(); cancelFollow(); const [x, y] = directions[event.key]; camera = M.clamp({ ...camera, x: camera.x + x / camera.zoom, y: camera.y + y / camera.zoom }, size); dirty = true; }
    });
    on(viewport, "wheel", event => {
      event.preventDefault(); cancelFollow();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      camera = M.zoomAt(camera, size, point(event), camera.zoom * Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002)); dirty = true;
    }, { passive: false });
    on($("home"), "click", home);
    on($("fit"), "click", () => { cancelFollow(); camera = M.clamp({ x: scene.width / 2, y: scene.height / 2, zoom: M.limits(size).min }, size); dirty = true; });
    for (const [id, factor] of [["plus", 1.25], ["minus", 0.8]]) on($(id), "click", () => { camera = M.zoomAt(camera, size, center(), camera.zoom * factor); dirty = true; });
    on($("close"), "click", () => { selected = null; cancelFollow(); dirty = true; refreshInspector(); });
    on($("follow"), "click", () => { following = following === selected ? null : selected; dirty = true; refreshInspector(); });
    on($("retry"), "click", () => { if (feed?.authExpired) { location.replace("./login"); return; } assets.retry(); feed?.refresh(); dirty = true; });
    if (fullCatalog) {
      const Feed = stageThree ? window.SeamlessDeltaFeed.DeltaFeed : window.SeamlessFeed.AreaFeed;
      feed = new Feed(data => {
        const principalChanged = stageThree && feedViewer && data.viewer && data.viewer !== feedViewer;
        if (data.viewer) feedViewer = data.viewer;
        const epochChanged = stageThree && data.epoch && data.epoch !== feedEpoch;
        if (data.epoch) feedEpoch = data.epoch;
        if (stageThree && Number.isFinite(data.serverTime)) serverTimeOffset = data.serverTime - data.receivedAt;
        const inspectedSections = selectedSnapshot?.kind === "troop" ? selectedSnapshot.sections : [selectedSnapshot?.sectionId];
        const inspectedAreaLoaded = data.authoritative && inspectedSections.some(id => data.sections.some(s => s.id === id));
        const inspectedMissing = inspectedAreaLoaded && !data.sections.some(s => s.objects.some(o => o.key === selected)) && !data.marches.some(m => m.key === selected);
        if (principalChanged || epochChanged || data.authExpired || data.removed?.includes(selected) || inspectedMissing) { selected = null; selectedSnapshot = null; following = null; }
        if (data.removed?.includes(following)) following = null;
        scene.objects = data.sections.flatMap(s => s.objects); objects.clear(); scene.objects.forEach(o => objects.set(o.key, o));
        const routes = new Map(data.routes.map(r => [r.id, r.points]));
        marches = data.marches.map(m => {
          const old = byMarch.get(m.key); return old && !epochChanged && old.routeId === m.routeId ? { ...old, ...m } : prepareMarch(m, routes.get(m.routeId));
        });
        if (following && !data.authExpired && !marches.some(m => m.key === following) && byMarch.has(following)) marches.push(byMarch.get(following));
        byMarch.clear(); marches.forEach(m => byMarch.set(m.key, m)); scene.marches = marches;
        refreshInspector(); dirty = true;
      }, async (ids, signal, cursor) => {
        const query = new URLSearchParams({ crowded: String(crowded), ids: ids.join(",") });
        if (stageThree) { query.set("realm", scene.realmId); if (cursor) { query.set("epoch", cursor.epoch); query.set("revision", cursor.revision); } }
        const response = await fetch(`/__benchmark__/seamless/${stageThree ? "changes" : "areas"}?${query}`, { signal, credentials: stageThree ? "same-origin" : "omit" });
        if (!response.ok) throw Object.assign(new Error(`Area HTTP ${response.status}`), { status: response.status }); return response.json();
      });
      const poll = setInterval(() => { if (!document.hidden) feed.refresh(); }, stageThree ? 1000 : 5000); cleanups.push(() => clearInterval(poll));
      on(window, "online", () => feed.refresh());
      if (stageThree) {
        document.querySelector("header small").textContent = "Private Stage 3 · sample data";
        const logout = document.createElement("button"); logout.textContent = "Sign out"; logout.id = "sign-out"; document.querySelector("header nav").append(logout);
        on(logout, "click", async () => {
          const response = await fetch("./logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
          if (response.ok) location.replace("./login");
        });
      }
    }
    if (stageThree && phoneOrigin) {
      document.body.classList.add("phone-test");
      let measureTimer; cleanups.push(()=>clearTimeout(measureTimer));
      const measure = document.createElement("button"); measure.textContent="Measure 10s"; measure.id="measure-phone"; document.querySelector("footer").append(measure);
      on(measure,"click",()=>{
        frameTimes.length=0;workTimes.length=0;measure.disabled=true;measure.textContent="Pan / zoom now…";
        measureTimer=setTimeout(()=>{const samples=frameTimes.slice().sort((a,b)=>a-b); const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
          measure.textContent=samples.length ? `${(1000/mean).toFixed(0)} FPS · p95 ${samples[Math.floor(samples.length*.95)].toFixed(0)} ms` : "Try again";measure.disabled=false;
        },10000);
      });
    }
    const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
    function renderScene() {
      const view = M.visible(camera, size, 75), exact = M.visible(camera, size);
      const overview = camera.zoom < M.limits(size).home * 0.56;
      const ordered = [...scene.sections].sort((a, b) => Math.hypot(a.x + 724 - camera.x, a.y + 543 - camera.y) - Math.hypot(b.x + 724 - camera.x, b.y + 543 - camera.y));
      const visibleSections = ordered.filter(s => M.intersects(exact, s.x, s.y, s.width, s.height));
      const fullSections = overview ? [] : [...visibleSections, ...ordered.filter(s => !visibleSections.includes(s))].slice(0, 4);
      let nearby = ordered.filter(s => visibleSections.includes(s) || visibleSections.some(v => Math.abs(v.gridX - s.gridX) <= 1 && Math.abs(v.gridY - s.gridY) <= 1)).slice(0, 16);
      // Retain the bounded interest window until a visible section leaves it.
      // Re-sorting the nearest 16 on every tiny camera movement caused repeated
      // megabyte snapshots and thumbnail churn at otherwise invisible edges.
      if (fullCatalog && !overview && feed?.ids.length && ordered.filter(s => M.intersects(M.visible(camera,size,100),s.x,s.y,s.width,s.height)).every(s => feed.ids.includes(s.id)))
        nearby = ordered.filter(s => feed.ids.includes(s.id));
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
      scenery = visibleObjects.filter(o => o.kind === "scenery"); sceneryCamera = "";
      const interactive = visibleObjects.filter(o => o.kind !== "scenery");
      const visibleKeys = new Set([...interactive, ...visibleMarches].map(o => o.key));
      for (const [key, node] of nodes) if (!visibleKeys.has(key)) { node.remove(); nodes.delete(key); }
      for (const item of [...interactive, ...visibleMarches]) {
        const node = nodes.get(item.key) || createObject(item); if (item.kind !== "troop") setImage(node.firstChild, item.asset);
        node.classList.toggle("selected", item.key === selected);
        if (item.kind === "troop") { const pixels = `${Math.max(22, 36 * camera.zoom)}px`; if (node.style.width !== pixels) { node.style.width = pixels; node.style.height = pixels; } }
      }
      world.classList.toggle("close-view", camera.zoom >= M.limits(size).home);
      world.classList.toggle("overview", overview);
      marchesLayer.classList.toggle("overview", overview);
      $("zoom").textContent = `${Math.round(camera.zoom / M.limits(size).home * 100)}%`;
      const stats = assets.stats();
      $("load-status").textContent = stats.failed ? `${stats.failed} image(s) unavailable · navigation ready` : feed?.authExpired ? "Test session ended · reload to sign in" : feed?.failed ? "Area updates interrupted · retrying" : feed?.data.scriptHealthy === false ? "Sample updates paused · restart private test" : `${overview ? `Overview${fullCatalog ? " · 81 sections" : ""}` : `${stats.full}/4 detailed sections`} · ${scene.crowded ? "Crowded" : "Normal"} sample`;
      $("retry").hidden = !stats.failed && !feed?.failed; $("retry").textContent = feed?.authExpired ? "Sign in" : "Retry loading";
    }
    function frame(now) {
      const start = performance.now();
      if (lastFrame && !document.hidden) { frameTimes.push(now - lastFrame); if (frameTimes.length > 900) frameTimes.shift(); }
      sceneTime = frozenTime ?? now / 1000 + serverTimeOffset;
      const view = M.visible(camera, size, 100);
      activeMarches = (fullCatalog && camera.zoom < M.limits(size).home * .56 ? [] : marches).filter(m => m.key === following || M.intersects(view, m.bounds.left, m.bounds.top, m.bounds.right - m.bounds.left, m.bounds.bottom - m.bounds.top));
      for (const march of activeMarches) {
        const distance = (sceneTime * march.speed + march.path.length * march.phase) % (march.path.length * 2);
        march.position = M.along(march.path, distance <= march.path.length ? distance : march.path.length * 2 - distance);
      }
      if (following) { const m = byMarch.get(following); camera = M.clamp({ ...camera, ...m.position }, size); }
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
        for (const m of visible) { const node=nodes.get(m.key)||createObject(m); const pixels=`${Math.max(22,36*camera.zoom)}px`;node.style.width=pixels;node.style.height=pixels; }
        patrolPlanAt=now;
      }
      const cameraKey = `${camera.x}:${camera.y}:${camera.zoom}:${size.width}:${size.height}`;
      if (cameraKey !== sceneryCamera) { sprites.scenery(scenery, camera, size); sceneryCamera = cameraKey; }
      sprites.patrols(activeMarches, camera, size, selected, document.activeElement?.dataset.key);
      world.style.transform = `translate3d(${size.width / 2 - camera.x * camera.zoom}px,${size.height / 2 - camera.y * camera.zoom}px,0) scale(${camera.zoom})`;
      for (const march of activeMarches) { const node = nodes.get(march.key); if (node) { const p = M.project(camera, march.position, size); node.style.transform = `translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%)`; } }
      const selectedMarch = byMarch.get(selected);
      if (selectedMarch && sectionAt(selectedMarch.position)?.name !== lastInspectorSection) refreshInspector();
      workTimes.push(performance.now() - start); if (workTimes.length > 900) workTimes.shift();
      lastFrame = now; raf = requestAnimationFrame(frame);
    }
    on(document, "visibilitychange", () => { lastFrame = 0; if (stageThree && !document.hidden) feed?.refresh(); });
    raf = requestAnimationFrame(frame);
    on(window, "pagehide", () => { cancelAnimationFrame(raf); observer.disconnect(); sprites.dispose(); assets.dispose(); feed?.dispose(); cleanups.forEach(fn => fn()); });
    // Deliberately present only in this loopback document, for deterministic QA.
    window.seamlessPreview = {
      scene, home, select, refresh: () => feed?.refresh(),
      snapshot: () => ({ camera: { ...camera }, size: { ...size }, selected, following, assets: assets.stats(), feed: feed?.stats(), nodes: nodes.size, listeners: listenerCount, frameTimes: [...frameTimes], workTimes: [...workTimes], marches: marches.map(m => ({ key: m.key, position: m.position })) }),
      view: (x, y, zoom) => { cancelFollow(); camera = M.clamp({ x, y, zoom: zoom ?? camera.zoom }, size); },
      time: value => { frozenTime = value; dirty = true; },
      resetMetrics: () => { frameTimes.length = 0; workTimes.length = 0; }
    };
  } catch (error) { $("load-status").textContent = `Preview could not load: ${error.message}. Reload to retry.`; }
})();
