(function () {
  const API = "/api/ui-layout-data";
  const PRESETS = {
    landscapeTablet: { label: "Landscape / Tablet", width: 844, height: 390 },
    desktop: { label: "Desktop", width: 1440, height: 900 },
  };
  const COMPONENTS = [
    { id: "profile", label: "Profile, Level & Gold", group: "Identity", icon: "Profile", aspect: false, minW: 110, minH: 70 },
    { id: "fullscreen", label: "Fullscreen Button", group: "Buttons", icon: "Fullscreen", aspect: true, minW: 36, minH: 36 },
    { id: "chat", label: "Chat Toggle", group: "Buttons", icon: "Chat", aspect: true, minW: 44, minH: 44 },
    { id: "inventory", label: "Bag / Inventory", group: "Buttons", icon: "Bag", aspect: true, minW: 40, minH: 40 },
    { id: "shop", label: "Shop", group: "Buttons", icon: "Shop", aspect: true, minW: 40, minH: 40 },
    { id: "activeEffects", label: "Active Effect Badges", group: "Status", icon: "Effects", aspect: false, minW: 56, minH: 40 },
    { id: "cityList", label: "City List", group: "Buttons", icon: "Cities", aspect: true, minW: 40, minH: 40 },
    { id: "islandSwitch", label: "Island Switch", group: "Buttons", icon: "Map", aspect: true, minW: 40, minH: 40 },
    { id: "returnHome", label: "Return to Main City", group: "Buttons", icon: "Main City", aspect: true, minW: 40, minH: 40 },
    { id: "commanderPanel", label: "Commander / City Panel", group: "Panels", icon: "Commander", aspect: false, minW: 220, minH: 100 },
    { id: "outgoingMarch", label: "Outgoing Marches", group: "Status", icon: "Outgoing", aspect: false, minW: 62, minH: 44 },
    { id: "incomingMarch", label: "Incoming Threats", group: "Status", icon: "Incoming", aspect: false, minW: 62, minH: 44 },
    { id: "reportsNav", label: "Reports Navigation", group: "Navigation", icon: "Reports", aspect: false, minW: 86, minH: 52 },
  ];
  const COMPONENT_MAP = Object.fromEntries(COMPONENTS.map(component => [component.id, component]));
  const ANCHORS = ["topLeft", "topCenter", "topRight", "centerLeft", "center", "centerRight", "bottomLeft", "bottomCenter", "bottomRight"];
  const HANDLE_NAMES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const defaultsByPreset = {
    landscapeTablet: {
      profile: ["topLeft", 12, 9, 164, 114, 40], fullscreen: ["topRight", 12, 9, 38, 38, 40],
      chat: ["bottomRight", 313, 16, 56, 56, 57], inventory: ["bottomRight", 240, 12, 64, 64, 55], shop: ["bottomRight", 164, 12, 64, 64, 55],
      activeEffects: ["centerRight", 12, 0, 66, 176, 56], cityList: ["bottomRight", 88, 12, 64, 64, 55],
      islandSwitch: ["bottomRight", 12, 12, 64, 64, 55], returnHome: ["centerLeft", 12, 0, 42, 42, 54],
      commanderPanel: ["topRight", 12, 70, 318, 308, 50], outgoingMarch: ["bottomLeft", 122, 18, 94, 50, 56],
      incomingMarch: ["bottomLeft", 222, 18, 94, 50, 56], reportsNav: ["bottomLeft", 12, 12, 112, 62, 55],
    },
    desktop: {
      profile: ["topLeft", 12, 9, 164, 114, 40], fullscreen: ["topRight", 12, 9, 38, 38, 40],
      chat: ["bottomRight", 313, 16, 56, 56, 57], inventory: ["bottomRight", 240, 12, 64, 64, 55], shop: ["bottomRight", 164, 12, 64, 64, 55],
      activeEffects: ["centerRight", 12, 0, 66, 176, 56], cityList: ["bottomRight", 88, 12, 64, 64, 55],
      islandSwitch: ["bottomRight", 12, 12, 64, 64, 55], returnHome: ["centerLeft", 12, 0, 42, 42, 54],
      commanderPanel: ["topRight", 12, 70, 410, 818, 50], outgoingMarch: ["bottomLeft", 128, 18, 98, 50, 56],
      incomingMarch: ["bottomLeft", 232, 18, 98, 50, 56], reportsNav: ["bottomLeft", 12, 12, 122, 62, 55],
    },
  };

  function defaultConfig() {
    const presets = {};
    Object.entries(PRESETS).forEach(([presetId, preset]) => {
      const components = {};
      Object.entries(defaultsByPreset[presetId]).forEach(([id, values]) => {
        const [anchor, offsetX, offsetY, width, height, zIndex] = values;
        components[id] = { anchor, offsetX, offsetY, width, height, visible: true, zIndex };
      });
      presets[presetId] = { ...preset, components };
    });
    return { schemaVersion: 1, updatedAt: new Date().toISOString(), presets };
  }

  const state = {
    config: defaultConfig(), presetId: "landscapeTablet", selected: [], locked: new Set(), snap: true,
    grid: 8, preview: false, history: [], future: [], drag: null, dirty: false, active: false,
  };
  let elements = {};
  let notifyDirty = () => {};
  let notifyStatus = () => {};
  let modeSetter = () => {};

  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const currentPreset = () => state.config.presets[state.presetId];
  const currentComponents = () => currentPreset().components;

  function ensureDefaults(config) {
    const defaults = defaultConfig();
    Object.keys(PRESETS).forEach(presetId => {
      config.presets[presetId] ||= clone(defaults.presets[presetId]);
      config.presets[presetId].components ||= {};
      COMPONENTS.forEach(component => {
        config.presets[presetId].components[component.id] ||= clone(defaults.presets[presetId].components[component.id]);
      });
    });
    return config;
  }

  function rectFromComponent(component, preset = currentPreset()) {
    const horizontal = component.anchor.includes("Right") || component.anchor === "topRight" || component.anchor === "bottomRight" ? "right"
      : component.anchor.includes("Center") || component.anchor === "center" || component.anchor === "topCenter" || component.anchor === "bottomCenter" ? "center" : "left";
    const vertical = component.anchor.startsWith("bottom") ? "bottom"
      : component.anchor.startsWith("center") || component.anchor === "center" ? "center" : "top";
    const x = horizontal === "right" ? preset.width - component.offsetX - component.width
      : horizontal === "center" ? preset.width / 2 + component.offsetX - component.width / 2 : component.offsetX;
    const y = vertical === "bottom" ? preset.height - component.offsetY - component.height
      : vertical === "center" ? preset.height / 2 + component.offsetY - component.height / 2 : component.offsetY;
    return { x, y, width: component.width, height: component.height };
  }

  function applyRect(component, rect, preset = currentPreset()) {
    component.width = Math.round(rect.width);
    component.height = Math.round(rect.height);
    const anchor = component.anchor;
    const horizontal = anchor.includes("Right") || anchor === "topRight" || anchor === "bottomRight" ? "right"
      : anchor.includes("Center") || anchor === "center" || anchor === "topCenter" || anchor === "bottomCenter" ? "center" : "left";
    const vertical = anchor.startsWith("bottom") ? "bottom" : anchor.startsWith("center") || anchor === "center" ? "center" : "top";
    component.offsetX = Math.round(horizontal === "right" ? preset.width - rect.x - rect.width
      : horizontal === "center" ? rect.x + rect.width / 2 - preset.width / 2 : rect.x);
    component.offsetY = Math.round(vertical === "bottom" ? preset.height - rect.y - rect.height
      : vertical === "center" ? rect.y + rect.height / 2 - preset.height / 2 : rect.y);
  }

  function pushHistory() {
    state.history.push(clone(state.config));
    if (state.history.length > 80) state.history.shift();
    state.future = [];
  }

  function changed(message = "HUD layout changed.") {
    state.config.updatedAt = new Date().toISOString();
    state.dirty = true;
    notifyDirty(message);
    render();
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) return;
    state.future.push(clone(state.config));
    state.config = previous;
    changed("HUD layout undo.");
  }

  function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push(clone(state.config));
    state.config = next;
    changed("HUD layout redo.");
  }

  function select(id, additive = false) {
    if (!COMPONENT_MAP[id]) return;
    if (additive) {
      state.selected = state.selected.includes(id) ? state.selected.filter(value => value !== id) : [...state.selected, id];
    } else state.selected = [id];
    render();
  }

  function renderTree() {
    elements.tree.innerHTML = COMPONENTS.map(component => {
      const value = currentComponents()[component.id];
      return `<div class="hud-tree-item ${state.selected.includes(component.id) ? "selected" : ""}" data-hud-tree-id="${component.id}">
        <span>${component.label}</span>
        <button type="button" data-hud-tree-visible="${component.id}" title="${value.visible ? "Hide" : "Show"}">${value.visible ? "◉" : "○"}</button>
        <button type="button" data-hud-tree-lock="${component.id}" title="${state.locked.has(component.id) ? "Unlock" : "Lock"}">${state.locked.has(component.id) ? "🔒" : "🔓"}</button>
      </div>`;
    }).join("");
  }

  function previewMarkup(id) {
    const icon = (src, alt) => `<img src="${src}" alt="${alt}" draggable="false" />`;
    if (id === "profile") return `<div class="hud-preview-profile">
      <div class="hud-preview-profile-row">
        <div class="hud-preview-profile-frame"><span class="hud-preview-flag">♔</span><b>Lv 42</b></div>
        ${icon("/assets/leaderboard-icon.png?v=20260812-global-hud-pass-3g-r1", "King Power ranks")}
      </div>
      <div class="hud-preview-gold"><span>🪙</span><strong>1,250,000</strong></div>
    </div>`;
    if (id === "fullscreen") return `<div class="hud-preview-fullscreen">⛶</div>`;
    if (id === "chat") return `<div class="hud-preview-fullscreen" aria-label="Chat toggle">‹</div>`;
    if (id === "inventory") return icon("/assets/bag-icon.png?v=20260812-global-hud-pass-3g-r1", "Bag");
    if (id === "shop") return icon("/assets/shop-icon.png?v=20260812-global-hud-pass-3g-r1", "Shop");
    if (id === "cityList") return icon("/assets/city-list-icon.png?v=20260812-global-hud-pass-3g-r1", "City list");
    if (id === "islandSwitch") return icon("/assets/map-icon.png?v=20260812-global-hud-pass-3g-r1", "Island map");
    if (id === "returnHome") return `<div class="hud-preview-home">⌂</div>`;
    if (id === "activeEffects") return `<div class="hud-preview-effects">
      <div>${icon("/assets/royal-peace-shield-icon.webp?v=20260703-shop-icons", "Shield")}<strong>11:42</strong></div>
      <div>${icon("/assets/war-drums-icon.webp?v=20260703-shop-icons", "War Drums")}<strong>24:18</strong></div>
    </div>`;
    if (id === "commanderPanel") return `<div class="hud-preview-commander">
      <header><span><strong>Caer Leon</strong><small>Your city · Level 38</small></span><b>×</b></header>
      <div class="hud-preview-stats"><span>Troops<strong>82,450</strong></span><span>Defense<strong>+18%</strong></span></div>
      <div class="hud-preview-actions"><b>Move</b><b>Upgrade</b><b>Info</b></div>
    </div>`;
    if (id === "outgoingMarch") return `<div class="hud-preview-march outgoing"><span>➤</span><strong>2</strong><small>Marches</small></div>`;
    if (id === "incomingMarch") return `<div class="hud-preview-march incoming"><span>⚔</span><strong>1</strong><small>Incoming</small></div>`;
    if (id === "reportsNav") return `<div class="hud-preview-reports">${icon("/assets/report-icon.png?v=20260812-global-hud-pass-3g-r1", "Reports")}<strong>Reports</strong></div>`;
    return COMPONENT_MAP[id]?.label || id;
  }

  function renderCanvas() {
    const preset = currentPreset();
    const availableWidth = Math.max(280, elements.canvas.parentElement.clientWidth - 60);
    const availableHeight = Math.max(240, elements.canvas.parentElement.clientHeight - 60);
    const scale = Math.min(1, availableWidth / preset.width, availableHeight / preset.height);
    elements.canvas.style.width = `${preset.width}px`;
    elements.canvas.style.height = `${preset.height}px`;
    elements.canvas.style.transform = `scale(${scale})`;
    elements.canvas.style.margin = `${-(preset.height * (1 - scale)) / 2}px ${-(preset.width * (1 - scale)) / 2}px`;
    elements.canvas.style.setProperty("--hud-grid", state.grid);
    elements.canvas.dataset.scale = String(scale);
    elements.canvas.classList.toggle("preview-only", state.preview);
    elements.layer.innerHTML = COMPONENTS.map(meta => {
      const component = currentComponents()[meta.id];
      const rect = rectFromComponent(component);
      const selected = state.selected.includes(meta.id);
      const handles = selected && !state.preview && !state.locked.has(meta.id)
        ? HANDLE_NAMES.map(handle => `<span class="hud-resize-handle" data-handle="${handle}"></span>`).join("") : "";
      return `<div class="hud-component ${selected ? "selected" : ""} ${state.locked.has(meta.id) ? "locked" : ""} ${component.visible ? "" : "hidden-component"}"
        data-hud-id="${meta.id}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;z-index:${component.zIndex}">
        <div class="hud-component-visual">${previewMarkup(meta.id)}</div><span class="hud-component-caption">${meta.label}</span>${handles}
      </div>`;
    }).join("");
  }

  function renderProperties() {
    const id = state.selected[0];
    const component = currentComponents()[id];
    elements.selectionTitle.textContent = state.selected.length > 1 ? `${state.selected.length} components` : COMPONENT_MAP[id]?.label || "None";
    if (!component) {
      elements.form.className = "hud-property-form empty";
      elements.form.textContent = "Select a HUD component.";
      return;
    }
    elements.form.className = "hud-property-form";
    const numberField = (property, label, value, min, max) => `<label>${label}<input data-hud-property="${property}" type="number" min="${min}" max="${max}" value="${value}" /></label>`;
    elements.form.innerHTML = `
      <label class="wide">Anchor<select data-hud-property="anchor">${ANCHORS.map(anchor => `<option value="${anchor}" ${component.anchor === anchor ? "selected" : ""}>${anchor.replace(/([A-Z])/g, " $1")}</option>`).join("")}</select></label>
      ${numberField("offsetX", "X offset", component.offsetX, -3000, 3000)}
      ${numberField("offsetY", "Y offset", component.offsetY, -3000, 3000)}
      ${numberField("width", "Width", component.width, COMPONENT_MAP[id].minW, currentPreset().width)}
      ${numberField("height", "Height", component.height, COMPONENT_MAP[id].minH, currentPreset().height)}
      ${numberField("zIndex", "Layer order", component.zIndex, 0, 999)}
      <label class="hud-check-row"><input data-hud-property="visible" type="checkbox" ${component.visible ? "checked" : ""} /> Visible in game</label>
      <label class="hud-check-row"><input data-hud-lock="${id}" type="checkbox" ${state.locked.has(id) ? "checked" : ""} /> Lock in editor</label>`;
  }

  function render() {
    if (!elements.canvas) return;
    renderTree();
    renderCanvas();
    renderProperties();
    elements.snapBtn.textContent = state.snap ? "Snap On" : "Snap Off";
    elements.snapBtn.classList.toggle("active", state.snap);
    elements.snapBtn.setAttribute("aria-pressed", String(state.snap));
    elements.previewBtn.classList.toggle("active", state.preview);
    elements.undoBtn.disabled = !state.history.length;
    elements.redoBtn.disabled = !state.future.length;
  }

  function canvasPoint(event) {
    const bounds = elements.canvas.getBoundingClientRect();
    const scale = Number(elements.canvas.dataset.scale) || 1;
    return { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale };
  }

  function nearestSnap(value, candidates, tolerance = 6) {
    let best = null;
    candidates.forEach(candidate => {
      const distance = Math.abs(value - candidate);
      if (distance <= tolerance && (!best || distance < best.distance)) best = { value: candidate, distance };
    });
    return best;
  }

  function snapRect(rect, movingIds, mode = "move") {
    if (!state.snap) return { rect, guides: [] };
    const preset = currentPreset();
    const vertical = [16, preset.width / 2, preset.width - 16];
    const horizontal = [16, preset.height / 2, preset.height - 16];
    COMPONENTS.forEach(meta => {
      if (movingIds.includes(meta.id)) return;
      const other = rectFromComponent(currentComponents()[meta.id]);
      vertical.push(other.x, other.x + other.width / 2, other.x + other.width);
      horizontal.push(other.y, other.y + other.height / 2, other.y + other.height);
    });
    const result = { ...rect };
    const guides = [];
    if (mode === "move") {
      result.x = Math.round(result.x / state.grid) * state.grid;
      result.y = Math.round(result.y / state.grid) * state.grid;
      const xPoints = [result.x, result.x + result.width / 2, result.x + result.width];
      const yPoints = [result.y, result.y + result.height / 2, result.y + result.height];
      xPoints.some((point, index) => {
        const match = nearestSnap(point, vertical);
        if (!match) return false;
        result.x += match.value - point; guides.push({ axis: "vertical", value: match.value }); return true;
      });
      yPoints.some((point, index) => {
        const match = nearestSnap(point, horizontal);
        if (!match) return false;
        result.y += match.value - point; guides.push({ axis: "horizontal", value: match.value }); return true;
      });
    } else {
      result.x = Math.round(result.x / state.grid) * state.grid;
      result.y = Math.round(result.y / state.grid) * state.grid;
      result.width = Math.round(result.width / state.grid) * state.grid;
      result.height = Math.round(result.height / state.grid) * state.grid;
      const right = nearestSnap(result.x + result.width, vertical);
      const bottom = nearestSnap(result.y + result.height, horizontal);
      if (right) { result.width = right.value - result.x; guides.push({ axis: "vertical", value: right.value }); }
      if (bottom) { result.height = bottom.value - result.y; guides.push({ axis: "horizontal", value: bottom.value }); }
    }
    return { rect: result, guides };
  }

  function drawGuides(guides = []) {
    elements.guides.innerHTML = guides.map(guide => `<span class="hud-guide ${guide.axis}" style="${guide.axis === "vertical" ? `left:${guide.value}px` : `top:${guide.value}px`}"></span>`).join("");
  }

  function startPointer(event) {
    if (state.preview || event.button !== 0) return;
    const node = event.target.closest("[data-hud-id]");
    if (!node) {
      if (!event.shiftKey) { state.selected = []; render(); }
      return;
    }
    const id = node.dataset.hudId;
    if (!state.selected.includes(id)) select(id, event.shiftKey);
    if (state.locked.has(id)) return;
    const handle = event.target.dataset.handle || "";
    pushHistory();
    const point = canvasPoint(event);
    const startRects = Object.fromEntries(state.selected.map(selectedId => [selectedId, rectFromComponent(currentComponents()[selectedId])]));
    state.drag = { pointerId: event.pointerId, id, handle, point, startRects, moved: false };
    elements.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function movePointer(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event);
    const dx = point.x - drag.point.x;
    const dy = point.y - drag.point.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    const preset = currentPreset();
    let guides = [];
    if (!drag.handle) {
      state.selected.forEach((id, index) => {
        const start = drag.startRects[id];
        let next = { ...start, x: start.x + dx, y: start.y + dy };
        if (index === 0) {
          const snapped = snapRect(next, state.selected, "move");
          guides = snapped.guides;
          const snapDx = snapped.rect.x - next.x;
          const snapDy = snapped.rect.y - next.y;
          next = snapped.rect;
          drag.groupSnap = { x: snapDx, y: snapDy };
        } else {
          next.x += drag.groupSnap?.x || 0; next.y += drag.groupSnap?.y || 0;
        }
        next.x = clamp(next.x, -next.width + 24, preset.width - 24);
        next.y = clamp(next.y, -next.height + 24, preset.height - 24);
        applyRect(currentComponents()[id], next);
      });
    } else {
      const meta = COMPONENT_MAP[drag.id];
      const start = drag.startRects[drag.id];
      let next = { ...start };
      if (drag.handle.includes("e")) next.width = start.width + dx;
      if (drag.handle.includes("s")) next.height = start.height + dy;
      if (drag.handle.includes("w")) { next.x = start.x + dx; next.width = start.width - dx; }
      if (drag.handle.includes("n")) { next.y = start.y + dy; next.height = start.height - dy; }
      if (meta.aspect && ["ne", "se", "sw", "nw"].includes(drag.handle)) {
        const ratio = start.width / start.height;
        next.height = next.width / ratio;
        if (drag.handle.includes("n")) next.y = start.y + start.height - next.height;
      }
      next.width = clamp(next.width, meta.minW, preset.width);
      next.height = clamp(next.height, meta.minH, preset.height);
      const snapped = snapRect(next, [drag.id], "resize");
      guides = snapped.guides;
      applyRect(currentComponents()[drag.id], snapped.rect);
    }
    drawGuides(guides);
    renderCanvas();
    renderProperties();
    event.preventDefault();
  }

  function stopPointer(event) {
    if (!state.drag || (event && state.drag.pointerId !== event.pointerId)) return;
    const moved = state.drag.moved;
    state.drag = null;
    drawGuides();
    if (moved) changed("HUD component moved or resized.");
    else if (state.history.length) state.history.pop();
  }

  function propertyChanged(event) {
    const property = event.target.dataset.hudProperty;
    const id = state.selected[0];
    if (!property || !id) return;
    pushHistory();
    const component = currentComponents()[id];
    component[property] = property === "visible" ? event.target.checked
      : property === "anchor" ? event.target.value : Math.round(Number(event.target.value) || 0);
    changed(`${COMPONENT_MAP[id].label} updated.`);
  }

  function treeClick(event) {
    const visibleId = event.target.dataset.hudTreeVisible;
    const lockId = event.target.dataset.hudTreeLock;
    if (visibleId) {
      pushHistory(); currentComponents()[visibleId].visible = !currentComponents()[visibleId].visible; changed(); return;
    }
    if (lockId) {
      state.locked.has(lockId) ? state.locked.delete(lockId) : state.locked.add(lockId); render(); return;
    }
    const item = event.target.closest("[data-hud-tree-id]");
    if (item) select(item.dataset.hudTreeId, event.shiftKey);
  }

  function runAction(action) {
    const ids = state.selected.filter(id => !state.locked.has(id));
    if (!ids.length) return;
    pushHistory();
    const rects = ids.map(id => ({ id, rect: rectFromComponent(currentComponents()[id]) }));
    const first = rects[0].rect;
    if (action === "matchWidth" || action === "matchHeight") {
      rects.slice(1).forEach(item => { item.rect[action === "matchWidth" ? "width" : "height"] = first[action === "matchWidth" ? "width" : "height"]; });
    } else if (action.startsWith("align")) {
      rects.slice(1).forEach(item => {
        if (action === "alignLeft") item.rect.x = first.x;
        if (action === "alignRight") item.rect.x = first.x + first.width - item.rect.width;
        if (action === "alignTop") item.rect.y = first.y;
        if (action === "alignBottom") item.rect.y = first.y + first.height - item.rect.height;
        if (action === "alignCenterX") item.rect.x = first.x + first.width / 2 - item.rect.width / 2;
        if (action === "alignCenterY") item.rect.y = first.y + first.height / 2 - item.rect.height / 2;
      });
    } else if ((action === "distributeX" || action === "distributeY") && rects.length >= 3) {
      const axis = action === "distributeX" ? "x" : "y";
      const size = action === "distributeX" ? "width" : "height";
      rects.sort((a, b) => a.rect[axis] - b.rect[axis]);
      const start = rects[0].rect[axis];
      const end = rects.at(-1).rect[axis] + rects.at(-1).rect[size];
      const total = rects.reduce((sum, item) => sum + item.rect[size], 0);
      const gap = (end - start - total) / (rects.length - 1);
      let cursor = start;
      rects.forEach(item => { item.rect[axis] = cursor; cursor += item.rect[size] + gap; });
    }
    rects.forEach(item => applyRect(currentComponents()[item.id], item.rect));
    changed("HUD components aligned.");
  }

  function reset(scope) {
    const defaults = defaultConfig();
    pushHistory();
    if (scope === "component") state.selected.forEach(id => { currentComponents()[id] = clone(defaults.presets[state.presetId].components[id]); });
    if (scope === "preset") state.config.presets[state.presetId] = clone(defaults.presets[state.presetId]);
    if (scope === "all") state.config = defaults;
    changed(`HUD ${scope} reset to defaults.`);
  }

  function validate() {
    const issues = [];
    Object.entries(state.config.presets).forEach(([presetId, preset]) => {
      const visible = Object.entries(preset.components).filter(([, component]) => component.visible);
      visible.forEach(([id, component]) => {
        const meta = COMPONENT_MAP[id];
        const rect = rectFromComponent(component, preset);
        if (rect.width < meta.minW || rect.height < meta.minH) issues.push(`${preset.label}: ${meta.label} is below its minimum size.`);
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > preset.width || rect.y + rect.height > preset.height) issues.push(`${preset.label}: ${meta.label} is partly off screen.`);
        if (rect.width < 44 || rect.height < 44) issues.push(`${preset.label}: ${meta.label} is below the 44px touch target.`);
      });
      const layers = new Map();
      visible.forEach(([id, component]) => {
        const key = String(component.zIndex);
        if (!layers.has(key)) layers.set(key, []);
        layers.get(key).push(id);
      });
      layers.forEach((ids, layer) => {
        if (ids.length > 4) issues.push(`${preset.label}: ${ids.length} components share layer ${layer}; verify their overlap order.`);
      });
    });
    elements.validationSummary.textContent = issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "HUD valid";
    elements.validationList.innerHTML = issues.length ? issues.map(issue => `<div>${issue}</div>`).join("") : "<div>No HUD layout issues found.</div>";
    return issues;
  }

  async function load() {
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) throw new Error(`HUD layout load failed: ${response.status}`);
    const payload = await response.json();
    state.config = ensureDefaults(payload.config);
    state.history = []; state.future = []; state.dirty = false;
    render();
  }

  async function save() {
    const response = await fetch(API, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config: state.config }),
    });
    if (!response.ok) throw new Error((await response.text()) || `HUD layout save failed: ${response.status}`);
    const payload = await response.json();
    state.config = ensureDefaults(payload.config);
    state.dirty = false;
    render();
    return payload;
  }

  function nudge(event) {
    if (!state.active || !state.selected.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
    pushHistory();
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    state.selected.filter(id => !state.locked.has(id)).forEach(id => {
      const rect = rectFromComponent(currentComponents()[id]); rect.x += dx; rect.y += dy; applyRect(currentComponents()[id], rect);
    });
    changed("HUD component nudged.");
    event.preventDefault();
  }

  const SEARCH_ITEMS = [
    { mode: "world", category: "Map", label: "World layout and region positions", keywords: "map region island spacing grid", target: "worldModeBtn" },
    { mode: "region", category: "Map", label: "City spacing and UI bounds", keywords: "city spacing overlap ui bounds", target: "toggleUiBoundsBtn" },
    { mode: "region", category: "Map", label: "Camps and strongholds", keywords: "camp reward stronghold city map", target: "addCampBtn" },
    { mode: "economy", category: "Economy", label: "Shop item prices", keywords: "shop price cost gold bonus cooldown", selector: "[data-economy-path^='shopItems.']" },
    { mode: "economy", category: "Economy", label: "Gold and troop pickups", keywords: "gold troop pickup spawn timer daily cap", selector: "[data-economy-path^='pickups.']" },
    { mode: "economy", category: "Economy", label: "Camp rewards", keywords: "camp gold troops production reward", selector: "[data-economy-path^='camps.']" },
    ...COMPONENTS.map(component => ({
      mode: "gameui", category: `Game UI · ${component.group}`, label: component.label,
      keywords: `${component.id} ${component.label} ${component.id === "commanderPanel" ? "commander box city panel" : ""} ${component.id === "reportsNav" ? "reports button" : ""}`,
      componentId: component.id,
    })),
  ];

  function searchInput() {
    const query = elements.search.value.trim().toLowerCase();
    if (!query) { elements.results.hidden = true; return; }
    const tokens = query.split(/\s+/);
    const matches = SEARCH_ITEMS.filter(item => tokens.every(token => `${item.label} ${item.category} ${item.keywords}`.toLowerCase().includes(token))).slice(0, 12);
    elements.results.innerHTML = matches.length ? matches.map((item, index) =>
      `<button class="feature-search-result" type="button" data-search-index="${SEARCH_ITEMS.indexOf(item)}"><span>${item.category}</span><strong>${item.label}</strong></button>`
    ).join("") : `<div class="feature-search-empty">No matching editable feature.</div>`;
    elements.results.hidden = false;
  }

  function activateSearchResult(event) {
    const button = event.target.closest("[data-search-index]");
    if (!button) return;
    const item = SEARCH_ITEMS[Number(button.dataset.searchIndex)];
    modeSetter(item.mode);
    window.setTimeout(() => {
      if (item.componentId) {
        select(item.componentId);
        document.querySelector(`[data-hud-id="${item.componentId}"]`)?.classList.add("feature-target-flash");
      } else {
        const target = item.selector ? document.querySelector(item.selector) : document.getElementById(item.target);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus();
        target?.classList.add("feature-target-flash");
        window.setTimeout(() => target?.classList.remove("feature-target-flash"), 1300);
      }
    }, 40);
    elements.search.value = "";
    elements.results.hidden = true;
  }

  function init(options = {}) {
    notifyDirty = options.onDirty || notifyDirty;
    notifyStatus = options.onStatus || notifyStatus;
    modeSetter = options.setMode || modeSetter;
    elements = {
      canvas: document.getElementById("hudCanvas"), layer: document.getElementById("hudComponentLayer"),
      guides: document.getElementById("hudGuideLayer"), tree: document.getElementById("hudComponentTree"),
      preset: document.getElementById("hudPresetSelect"), snapBtn: document.getElementById("hudSnapBtn"),
      grid: document.getElementById("hudGridSizeInput"), previewBtn: document.getElementById("hudPreviewBtn"),
      undoBtn: document.getElementById("hudUndoBtn"), redoBtn: document.getElementById("hudRedoBtn"),
      selectionTitle: document.getElementById("hudSelectionTitle"), form: document.getElementById("hudPropertyForm"),
      validationSummary: document.getElementById("hudValidationSummary"), validationList: document.getElementById("hudValidationList"),
      search: document.getElementById("featureSearchInput"), results: document.getElementById("featureSearchResults"),
    };
    elements.preset.addEventListener("change", () => { state.presetId = elements.preset.value; state.selected = []; render(); });
    elements.snapBtn.addEventListener("click", () => { state.snap = !state.snap; render(); });
    elements.grid.addEventListener("change", () => { state.grid = clamp(Math.round(Number(elements.grid.value) || 8), 1, 64); elements.grid.value = state.grid; renderCanvas(); });
    elements.previewBtn.addEventListener("click", () => { state.preview = !state.preview; render(); });
    elements.undoBtn.addEventListener("click", undo); elements.redoBtn.addEventListener("click", redo);
    elements.tree.addEventListener("click", treeClick);
    elements.canvas.addEventListener("pointerdown", startPointer);
    window.addEventListener("pointermove", movePointer); window.addEventListener("pointerup", stopPointer); window.addEventListener("pointercancel", stopPointer);
    elements.form.addEventListener("input", propertyChanged);
    elements.form.addEventListener("change", event => {
      if (event.target.matches("select[data-hud-property]")) propertyChanged(event);
    });
    elements.form.addEventListener("change", event => {
      const id = event.target.dataset.hudLock;
      if (id) { event.target.checked ? state.locked.add(id) : state.locked.delete(id); render(); }
    });
    document.querySelector(".hud-align-actions").addEventListener("click", event => { if (event.target.dataset.hudAction) runAction(event.target.dataset.hudAction); });
    document.getElementById("hudResetComponentBtn").addEventListener("click", () => reset("component"));
    document.getElementById("hudResetPresetBtn").addEventListener("click", () => reset("preset"));
    document.getElementById("hudResetAllBtn").addEventListener("click", () => {
      if (window.confirm("Reset every device layout to the shipped defaults?")) reset("all");
    });
    elements.search.addEventListener("input", searchInput);
    elements.results.addEventListener("click", activateSearchResult);
    window.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.shiftKey ? redo() : undo(); event.preventDefault(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { redo(); event.preventDefault(); return; }
      nudge(event);
    });
    window.addEventListener("beforeunload", event => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });
    window.addEventListener("resize", () => { if (state.active) renderCanvas(); });
    render();
    return load().catch(error => { notifyStatus(error.message || String(error), "error"); render(); });
  }

  window.CrownlandsHudEditor = {
    init, save, validate,
    setActive(active) { state.active = Boolean(active); if (state.active) window.setTimeout(render, 0); },
    getConfig: () => clone(state.config),
    replaceConfig(config) { state.config = ensureDefaults(clone(config)); state.history = []; state.future = []; state.dirty = true; render(); },
  };
})();
