/* Local-only demonstration: no live client, identity, subscriptions or orders. */
(async function () {
  "use strict";
  if (location.hostname !== "127.0.0.1") throw new Error("Private preview requires loopback.");
  const M = window.SeamlessModel, $ = id => document.getElementById(id);
  const viewport = $("viewport"), world = $("world"), objectsLayer = $("objects"), marchesLayer = $("marches");
  try {
    const response = await fetch(`/__benchmark__/seamless/fixture?crowded=${new URLSearchParams(location.search).get("crowded") === "1"}`, { credentials: "omit" });
    if (!response.ok) throw new Error("Fixture unavailable");
    const scene = await response.json();
    const objects = new Map(scene.objects.map(o => [o.key, o]));
    const marches = scene.marches.map(m => ({ ...m, path: M.preparePath(m.points), position: m.points[0] }));
    const byMarch = new Map(marches.map(m => [m.key, m]));
    const nodes = new Map(), terrain = new Map();
    let size, camera, selected = null, following = null, dirty = true, raf = 0, lastFrame = 0;
    let sceneTime = 0, frozenTime = null, lastInspectorSection = "", lastPlan = "";
    const frameTimes = [], workTimes = [], pointers = new Map();
    let gesture = null, dragged = false, clickKey = null, suppressClick = false, listenerCount = 0;
    const cleanups = [];
    const assets = new window.SeamlessAssets.AssetLoader(() => { dirty = true; });
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
      tile.style.cssText = `left:${section.x}px;top:${section.y}px;width:${section.width + (section.gridX < 0 ? 1 : 0)}px;height:${section.height + (section.gridY < 0 ? 1 : 0)}px`;
      const thumb = new Image(), full = new Image(); thumb.alt = ""; full.alt = "";
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
      const image = new Image(); image.alt = ""; image.draggable = false; node.append(image);
      if (item.kind !== "scenery") { const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = item.name; node.append(tag); }
      if (item.kind !== "troop") node.style.cssText = `left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px`;
      (item.kind === "troop" ? marchesLayer : objectsLayer).append(node);
      nodes.set(item.key, node); return node;
    }
    function sectionAt(point) { return scene.sections.find(s => point.x >= s.x && point.x < s.x + s.width && point.y >= s.y && point.y < s.y + s.height); }
    function refreshInspector() {
      const item = objects.get(selected) || byMarch.get(selected);
      $("inspector").hidden = !item;
      if (!item) return;
      $("kind").textContent = item.kind === "troop" ? "Sample march · read only" : `${item.kind} · read only`;
      $("name").textContent = item.name;
      const sectionName = item.kind === "troop" ? sectionAt(item.position)?.name : item.sectionName;
      $("section").textContent = sectionName || "Preview edge"; lastInspectorSection = sectionName;
      $("owner").textContent = item.owner;
      $("troops").textContent = `${item.troops.toLocaleString()} sample troops`;
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
      dirty = true;
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
    on($("retry"), "click", () => { assets.retry(); dirty = true; });
    const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
    function renderScene() {
      const view = M.visible(camera, size, 75), exact = M.visible(camera, size);
      const overview = camera.zoom < M.limits(size).home * 0.56;
      const ordered = [...scene.sections].sort((a, b) => Math.hypot(a.x + 724 - camera.x, a.y + 543 - camera.y) - Math.hypot(b.x + 724 - camera.x, b.y + 543 - camera.y));
      const visibleSections = ordered.filter(s => M.intersects(exact, s.x, s.y, s.width, s.height));
      const fullSections = overview ? [] : [...visibleSections, ...ordered.filter(s => !visibleSections.includes(s))].slice(0, 4);
      const visibleObjects = scene.objects.filter(o => (!overview || !["castle", "scenery"].includes(o.kind)) && M.intersects(view, o.left, o.top, o.width, o.height));
      const visibleMarches = marches.filter(m => M.intersects(view, m.position.x - 18, m.position.y - 18, 36, 36));
      const requests = ordered.map((s, i) => ({ path: s.thumbnail, kind: "thumbnail", priority: visibleSections.includes(s) ? i : 100 + i }));
      fullSections.forEach((s, i) => requests.push({ path: s.terrain, kind: "full", priority: visibleSections.includes(s) ? 10 + i : 150 + i }));
      [...new Set([...visibleObjects, ...visibleMarches].map(o => o.asset))].forEach((path, i) => requests.push({ path, kind: "sprite", priority: 30 + i }));
      const plan = JSON.stringify(requests);
      if (plan !== lastPlan) { assets.update(requests); lastPlan = plan; }
      for (const section of scene.sections) {
        const tile = terrain.get(section.id); setImage(tile.thumb, section.thumbnail); setImage(tile.full, section.terrain);
        // Scale labels without relaying out text on every zoom frame. Tile edge
        // overlap is fixed at construction, never resized during navigation.
        tile.tile.lastChild.style.transform = `translateX(-50%) scale(${Math.max(1, 11 / (20 * camera.zoom))})`;
      }
      const visibleKeys = new Set([...visibleObjects, ...visibleMarches].map(o => o.key));
      for (const [key, node] of nodes) if (!visibleKeys.has(key)) { node.remove(); nodes.delete(key); }
      for (const item of [...visibleObjects, ...visibleMarches]) {
        const node = nodes.get(item.key) || createObject(item); setImage(node.firstChild, item.asset);
        node.classList.toggle("selected", item.key === selected);
      }
      world.classList.toggle("close-view", camera.zoom >= M.limits(size).home);
      world.classList.toggle("overview", overview);
      $("zoom").textContent = `${Math.round(camera.zoom / M.limits(size).home * 100)}%`;
      const stats = assets.stats();
      $("load-status").textContent = stats.failed ? `${stats.failed} image(s) unavailable · navigation ready` : `${overview ? "Overview" : `${stats.full}/4 detailed sections`} · ${scene.crowded ? "Crowded" : "Normal"} sample`;
      $("retry").hidden = !stats.failed;
    }
    function frame(now) {
      const start = performance.now();
      if (lastFrame && !document.hidden) { frameTimes.push(now - lastFrame); if (frameTimes.length > 900) frameTimes.shift(); }
      sceneTime = frozenTime ?? now / 1000;
      for (const march of marches) {
        const distance = (sceneTime * march.speed + march.path.length * march.phase) % (march.path.length * 2);
        march.position = M.along(march.path, distance <= march.path.length ? distance : march.path.length * 2 - distance);
      }
      if (following) { const m = byMarch.get(following); camera = M.clamp({ ...camera, ...m.position }, size); dirty = true; }
      // Static scene visibility updates on camera changes; moving nodes use a
      // short cadence so patrols enter/leave the viewport without rebuilding it.
      if (dirty || Math.floor(now / 120) !== Math.floor(lastFrame / 120)) { renderScene(); dirty = false; }
      world.style.transform = `translate3d(${size.width / 2 - camera.x * camera.zoom}px,${size.height / 2 - camera.y * camera.zoom}px,0) scale(${camera.zoom})`;
      for (const march of marches) { const node = nodes.get(march.key); if (node) { node.style.transform = `translate3d(${march.position.x}px,${march.position.y}px,0) translate(-50%,-50%) scale(${Math.max(1, 22 / (36 * camera.zoom))})`; } }
      const selectedMarch = byMarch.get(selected);
      if (selectedMarch && sectionAt(selectedMarch.position)?.name !== lastInspectorSection) refreshInspector();
      workTimes.push(performance.now() - start); if (workTimes.length > 900) workTimes.shift();
      lastFrame = now; raf = requestAnimationFrame(frame);
    }
    on(document, "visibilitychange", () => { lastFrame = 0; });
    raf = requestAnimationFrame(frame);
    on(window, "pagehide", () => { cancelAnimationFrame(raf); observer.disconnect(); assets.dispose(); cleanups.forEach(fn => fn()); });
    // Deliberately present only in this loopback document, for deterministic QA.
    window.seamlessPreview = {
      scene, home, select,
      snapshot: () => ({ camera: { ...camera }, size: { ...size }, selected, following, assets: assets.stats(), nodes: nodes.size, listeners: listenerCount, frameTimes: [...frameTimes], workTimes: [...workTimes], marches: marches.map(m => ({ key: m.key, position: m.position })) }),
      view: (x, y, zoom) => { cancelFollow(); camera = M.clamp({ x, y, zoom: zoom ?? camera.zoom }, size); dirty = true; },
      time: value => { frozenTime = value; dirty = true; },
      resetMetrics: () => { frameTimes.length = 0; workTimes.length = 0; }
    };
  } catch (error) { $("load-status").textContent = `Preview could not load: ${error.message}. Reload to retry.`; }
})();
