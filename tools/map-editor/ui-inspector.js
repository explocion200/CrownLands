(function () {
  "use strict";

  const API = "/api/ui-editor";
  const PRESETS = { desktop: [1440, 900], phone: [844, 390], smallPhone: [667, 375] };
  const COLOR_PROPERTIES = new Set(["color", "backgroundColor", "borderColor", "iconColor"]);
  const PX_PROPERTIES = new Set(["fontSize", "letterSpacing", "borderWidth", "borderRadius", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginRight", "marginBottom", "marginLeft", "gap", "top", "right", "bottom", "left", "x", "y", "iconSize"]);
  const CLOSE_STATES = new Set(["default", "hover", "pressed", "disabled"]);
  const state = {
    workspace: null,
    config: null,
    baseline: null,
    selected: [],
    inspectEnabled: false,
    currentScreen: "player-profile",
    breakpoint: "base",
    componentState: "default",
    undo: [],
    redo: [],
    pending: [],
    recentColors: [],
    lastColorProperty: "color",
    dirty: false,
    loadError: "",
    guides: false,
    sourceStatus: null,
  };
  const elements = {};
  let notifyStatus = () => {};
  let log = () => {};

  const clone = value => JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const kebab = value => String(value).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
  const px = value => `${Number(value) || 0}px`;
  const screenFrames = () => [elements.screenFrame, ...document.querySelectorAll("[data-compare-preset]")].filter(Boolean);
  const allFrames = () => [elements.componentFrame, ...screenFrames()].filter(Boolean);
  const currentFrame = () => state.selected[0]?.frame || (document.getElementById("screensView")?.classList.contains("hidden") ? elements.componentFrame : elements.screenFrame);

  function cacheElements() {
    const ids = [
      "uiPropertyInspector", "uiSelectionTitle", "uiSelectionCount", "uiUndoBtn", "uiRedoBtn", "uiGuidesBtn", "uiSnapToggle", "uiBreadcrumb",
      "uiScopeBadge", "uiComponentName", "uiScreenName", "uiElementId", "uiClassName", "uiSourceFile", "uiLocalSource", "uiBreakpointSource",
      "uiGlobalCloseSection", "uiGlobalImpact", "uiComponentState", "uiCloseDefaultFields", "uiRestoreSharedBtn", "uiPreviewAffectedBtn",
      "uiLocalPositionSection", "uiPositionHeading", "uiAnchorSelect", "uiPositionTop", "uiPositionRight", "uiPositionX", "uiPositionY", "uiResetPositionBtn",
      "uiGenericProperties", "uiBreakpointSelect", "uiFontFamilyReadOnly", "uiContrastStatus", "uiMatchSourceSelect", "uiMatchStyleBtn", "uiResetPropertyBtn", "uiResetElementBtn",
      "uiThemeColorGrid", "uiRecentColors", "uiRunQaBtn", "uiCloseAuditBtn", "uiQaResults", "uiPendingCount", "uiChangeHistory", "uiSaveChangesBtn", "uiDiscardChangesBtn", "uiSaveStatus",
      "uiGitBranch", "uiGitDirtyNotice", "uiReviewDiffBtn", "uiRefreshGitBtn", "uiDiffReview", "uiCommitMessage", "uiCommitBtn", "uiPushBtn",
      "screenPreviewFrame", "componentPreviewFrame", "screenPreviewSelect", "compareViewportsBtn", "viewportComparePanel",
    ];
    for (const id of ids) elements[id.replace(/^ui/, "ui").replace(/^screenPreviewFrame$/, "screenFrame").replace(/^componentPreviewFrame$/, "componentFrame").replace(/^screenPreviewSelect$/, "screenSelect")] = document.getElementById(id);
    elements.screenFrame = document.getElementById("screenPreviewFrame");
    elements.componentFrame = document.getElementById("componentPreviewFrame");
    elements.screenSelect = document.getElementById("screenPreviewSelect");
  }

  function setStudioDirty(value) {
    state.dirty = Boolean(value);
    window.CrownlandsStudioUI?.setUiDirty?.(state.dirty);
    elements.uiSaveChangesBtn.disabled = !state.dirty;
    elements.uiDiscardChangesBtn.disabled = !state.dirty;
  }

  function selectionMeta(entry = state.selected[0]) {
    if (!entry?.node) return null;
    const node = entry.node;
    const screen = node.closest("[data-ui-screen]");
    const component = node.dataset.uiComponent || inferType(node);
    const elementId = node.dataset.uiElementId || node.id || stableElementId(node);
    const screenId = screen?.dataset.uiScreen || (entry.frame === elements.componentFrame ? "component-library" : state.currentScreen);
    return {
      screenId,
      positionScreenId: node.dataset.uiPositionScreen || screenId,
      screenName: screen?.dataset.uiScreenName || (entry.frame === elements.componentFrame ? "Component Library" : elements.screenSelect?.selectedOptions?.[0]?.textContent || state.currentScreen),
      component,
      componentName: component.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
      elementId,
      source: node.dataset.uiSource || node.closest("[data-ai-files]")?.dataset.aiFiles?.split(",")[0] || "Preview source mapping unavailable",
      localSource: node.dataset.uiLocalSource || "ui-studio-config.json",
      breadcrumb: node.dataset.uiBreadcrumb || buildBreadcrumb(node),
      className: String(node.className || "").trim() || node.tagName.toLowerCase(),
    };
  }

  function inferType(node) {
    if (node.matches("button")) return node.getAttribute("aria-label")?.toLowerCase().includes("close") ? "close-button" : "button";
    if (node.matches("input, select, textarea")) return "input";
    if (node.matches("img, svg")) return "icon";
    if (node.matches("h1,h2,h3,h4,p,span,strong,small,label")) return "text";
    if (node.matches("header")) return "header";
    return "panel";
  }

  function stableElementId(node) {
    const screen = node.closest("[data-ui-screen]") || node.ownerDocument.body;
    const nodes = [...screen.querySelectorAll("[data-ui-inspectable],button,input,select,h1,h2,h3,h4,p,label,img,svg")];
    const id = `${inferType(node)}-${Math.max(1, nodes.indexOf(node) + 1)}`;
    node.dataset.uiElementId = id;
    return id;
  }

  function buildBreadcrumb(node) {
    const screen = node.closest("[data-ui-screen]");
    const parts = [screen?.dataset.uiScreenName || "Component Library"];
    const parent = node.parentElement?.closest("[data-ui-component],header,section,article,nav");
    if (parent && parent !== screen && parent !== node) parts.push(parent.dataset.uiComponent?.replace(/-/g, " ") || parent.tagName.toLowerCase());
    parts.push(node.dataset.uiComponent?.replace(/-/g, " ") || inferType(node));
    return parts.map(part => part.replace(/\b\w/g, character => character.toUpperCase())).join(" > ");
  }

  function bindFrame(frame) {
    const doc = frame.contentDocument;
    if (!doc || doc.documentElement.dataset.uiInspectorBound === "true") return;
    doc.documentElement.dataset.uiInspectorBound = "true";
    doc.addEventListener("pointerover", event => {
      if (!state.inspectEnabled) return;
      const target = inspectable(event.target);
      doc.querySelectorAll(".ui-inspector-hover").forEach(node => node.classList.remove("ui-inspector-hover"));
      target?.classList.add("ui-inspector-hover");
    }, true);
    doc.addEventListener("pointerout", event => inspectable(event.target)?.classList.remove("ui-inspector-hover"), true);
    doc.addEventListener("click", event => {
      if (!state.inspectEnabled) return;
      const target = inspectable(event.target);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      selectNode(frame, target, event.shiftKey || event.ctrlKey || event.metaKey);
    });
    applyConfigToFrame(frame);
    if (frame !== elements.componentFrame) showScreenInFrame(frame, state.currentScreen);
  }

  function inspectable(node) {
    if (!node?.closest) return null;
    return node.closest("[data-ui-inspectable],[data-ui-component]")
      || node.closest("button,input,select,textarea,h1,h2,h3,h4,p,label,img,svg,.panel-header,.modal-card");
  }

  function clearSelection() {
    for (const entry of state.selected) entry.node?.classList.remove("ui-inspector-selected", "ui-inspector-multi-selected");
    state.selected = [];
  }

  function selectNode(frame, node, additive = false) {
    if (!additive) clearSelection();
    const existing = state.selected.findIndex(entry => entry.node === node);
    if (existing >= 0 && additive) {
      state.selected[existing].node.classList.remove("ui-inspector-selected", "ui-inspector-multi-selected");
      state.selected.splice(existing, 1);
    } else if (existing < 0) {
      state.selected.push({ frame, node });
    }
    state.selected.forEach(entry => entry.node.classList.add("ui-inspector-selected", ...(state.selected.length > 1 ? ["ui-inspector-multi-selected"] : [])));
    renderInspector();
  }

  function selectedNodesForScreen(screenId, elementId) {
    const matches = [];
    for (const frame of allFrames()) {
      const doc = frame.contentDocument;
      if (!doc) continue;
      const screen = doc.querySelector(`[data-ui-screen="${CSS.escape(screenId)}"]`);
      const node = screen?.querySelector(`[data-ui-element-id="${CSS.escape(elementId)}"]`);
      if (node) matches.push({ frame, node });
    }
    return matches;
  }

  function renderInspector() {
    const meta = selectionMeta();
    elements.uiSelectionTitle.textContent = meta?.componentName || "Select an element";
    elements.uiSelectionCount.textContent = `${state.selected.length} selected`;
    elements.uiBreadcrumb.textContent = meta?.breadcrumb || "No element selected";
    elements.uiComponentName.textContent = meta?.componentName || "—";
    elements.uiScreenName.textContent = meta?.screenName || "—";
    elements.uiElementId.textContent = meta?.elementId || "—";
    elements.uiClassName.textContent = meta?.className || "—";
    elements.uiSourceFile.textContent = meta?.source || "—";
    elements.uiLocalSource.textContent = meta?.localSource || "—";
    elements.uiScopeBadge.textContent = meta?.component === "close-button" ? "GLOBAL + LOCAL" : "THIS SCREEN";
    elements.uiBreakpointSource.textContent = state.breakpoint === "base" ? "Base style" : `${state.breakpoint} override`;
    const isClose = meta?.component === "close-button";
    elements.uiGlobalCloseSection.classList.toggle("hidden", !isClose);
    elements.uiLocalPositionSection.classList.toggle("hidden", !isClose);
    elements.uiGenericProperties.classList.toggle("hidden", !meta || isClose);
    if (isClose) renderCloseProperties(meta);
    if (meta && !isClose) renderGenericProperties(meta);
    renderMatchSources();
    updateContrast();
  }

  function closeComponent() { return state.config.globalComponents["close-button"]; }
  function closeState() { return closeComponent().states[state.componentState] || closeComponent().states.default; }

  function renderCloseProperties(meta) {
    const values = closeState();
    const defaultsOnly = new Set(["width", "height", "borderColor", "borderWidth", "borderRadius", "iconSize", "iconStrokeWidth", "shadow", "padding", "defaultTop", "defaultRight"]);
    document.querySelectorAll("[data-ui-global-property]").forEach(input => {
      const property = input.dataset.uiGlobalProperty;
      input.disabled = state.componentState !== "default" && defaultsOnly.has(property);
      const fallback = closeComponent().states.default[property];
      input.value = values[property] ?? fallback ?? "";
    });
    const usageScreens = state.workspace.registry.closeButton.usages.flatMap(usage => usage.screen.split(/[,()]/).map(value => value.trim()).filter(Boolean));
    elements.uiGlobalImpact.textContent = `This shared change affects ${state.workspace.registry.closeButton.usages.length} implementation points representing ${new Set(usageScreens).size} screen surfaces.`;
    elements.uiPositionHeading.textContent = `Position — ${meta.screenName}`;
    const value = ensureScreenPosition(meta.positionScreenId, false);
    elements.uiAnchorSelect.value = value.anchor;
    elements.uiPositionTop.value = value.top;
    elements.uiPositionRight.value = value.right;
    elements.uiPositionX.value = value.x;
    elements.uiPositionY.value = value.y;
  }

  function ensureScreenPosition(screenId, create = true) {
    const defaultState = closeComponent().states.default;
    if (!state.config.screenOverrides[screenId] && create) state.config.screenOverrides[screenId] = {};
    if (!state.config.screenOverrides[screenId]?.["close-button"] && create) state.config.screenOverrides[screenId]["close-button"] = { anchor: "top-right", top: defaultState.defaultTop || 0, right: defaultState.defaultRight || 0, bottom: 0, left: 0, x: 0, y: 0 };
    return state.config.screenOverrides[screenId]?.["close-button"] || { anchor: "top-right", top: defaultState.defaultTop || 0, right: defaultState.defaultRight || 0, bottom: 0, left: 0, x: 0, y: 0 };
  }

  function overrideKey(meta) { return `${meta.screenId}:${meta.elementId}`; }
  function elementRecord(meta, create = false) {
    const key = overrideKey(meta);
    if (!state.config.elementOverrides[key] && create) state.config.elementOverrides[key] = { screenId: meta.screenId, elementId: meta.elementId, base: {} };
    return state.config.elementOverrides[key] || null;
  }

  function computedValue(node, property) {
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (COLOR_PROPERTIES.has(property)) return rgbToHex(style[property === "iconColor" ? "color" : property]) || "#000000";
    if (["textAlign", "position", "borderStyle", "textShadow"].includes(property)) return style[property];
    if (property === "opacity" || property === "fontWeight" || property === "lineHeight") return Number.parseFloat(style[property]) || "";
    const value = Number.parseFloat(style[property]);
    return Number.isFinite(value) ? Number(value.toFixed(2)) : "";
  }

  function renderGenericProperties(meta) {
    const record = elementRecord(meta);
    const values = record?.[state.breakpoint] || {};
    document.querySelectorAll("[data-ui-property]").forEach(input => {
      const property = input.dataset.uiProperty;
      input.value = values[property] ?? computedValue(state.selected[0].node, property) ?? "";
    });
    elements.uiFontFamilyReadOnly.value = state.selected[0].node.ownerDocument.defaultView.getComputedStyle(state.selected[0].node).fontFamily;
  }

  function snapshot() { return { config: clone(state.config), pending: clone(state.pending) }; }
  function restore(snapshotValue) {
    state.config = clone(snapshotValue.config);
    state.pending = clone(snapshotValue.pending);
    setStudioDirty(state.pending.length > 0 || JSON.stringify(state.config) !== JSON.stringify(state.baseline));
    applyConfigToFrames();
    renderPending();
    renderInspector();
  }

  function mutate(description, action) {
    state.undo.push(snapshot());
    if (state.undo.length > 100) state.undo.shift();
    state.redo = [];
    action();
    state.pending.push({ at: new Date().toISOString(), description });
    if (state.pending.length > 200) state.pending.shift();
    setStudioDirty(true);
    applyConfigToFrames();
    renderPending();
    renderInspector();
    elements.uiUndoBtn.disabled = false;
    elements.uiRedoBtn.disabled = true;
  }

  function undo() {
    const previous = state.undo.pop();
    if (!previous) return;
    state.redo.push(snapshot());
    restore(previous);
    elements.uiUndoBtn.disabled = state.undo.length === 0;
    elements.uiRedoBtn.disabled = false;
  }

  function redo() {
    const next = state.redo.pop();
    if (!next) return;
    state.undo.push(snapshot());
    restore(next);
    elements.uiUndoBtn.disabled = false;
    elements.uiRedoBtn.disabled = state.redo.length === 0;
  }

  function renderPending() {
    elements.uiPendingCount.textContent = String(state.pending.length);
    elements.uiChangeHistory.innerHTML = state.pending.length ? state.pending.slice().reverse().map((change, index) => `<li><span>${escapeHtml(change.description)}</span><button type="button" data-ui-revert-index="${state.pending.length - 1 - index}">Revert</button></li>`).join("") : "<li>No manual changes in this session.</li>";
    if (state.pending.length) elements.uiCommitMessage.placeholder = suggestCommitMessage();
  }

  function suggestCommitMessage() {
    const global = state.pending.some(change => /global|shared/i.test(change.description));
    const screens = new Set(state.pending.map(change => change.description.match(/— ([^:]+)/)?.[1]).filter(Boolean));
    if (global) return "fix(ui): refine shared Crownlands components";
    if (screens.size === 1) return `fix(ui): polish ${[...screens][0].toLowerCase()}`.slice(0, 90);
    return "fix(ui): polish screen alignment and readability";
  }

  function buildPreviewCss(config) {
    const component = config.globalComponents["close-button"];
    const base = component.states.default;
    const hover = component.states.hover;
    const pressed = component.states.pressed;
    const disabled = component.states.disabled;
    const rules = [`
      [data-ui-component="close-button"], .cl-shared-close { width:${px(base.width)} !important; min-width:${px(base.width)} !important; height:${px(base.height)} !important; min-height:${px(base.height)} !important; padding:${px(base.padding)} !important; color:${base.iconColor} !important; border:${px(base.borderWidth)} solid ${base.borderColor} !important; border-radius:${px(base.borderRadius)} !important; background:${base.backgroundColor} !important; opacity:${base.opacity}; box-shadow:${base.shadow}; }
      [data-ui-component="close-button"] .cl-icon, .cl-shared-close .cl-icon { width:${px(base.iconSize)} !important; height:${px(base.iconSize)} !important; }
      [data-ui-component="close-button"] .cl-icon path { stroke-width:${base.iconStrokeWidth}; }
      [data-ui-component="close-button"]:hover, [data-ui-component="close-button"][data-ui-preview-state="hover"] { color:${hover.iconColor}; background:${hover.backgroundColor} !important; }
      [data-ui-component="close-button"]:active, [data-ui-component="close-button"][data-ui-preview-state="pressed"] { color:${pressed.iconColor}; background:${pressed.backgroundColor} !important; }
      [data-ui-component="close-button"][data-ui-preview-state="disabled"] { opacity:${disabled.opacity}; }
    `];
    for (const [screenId, values] of Object.entries(config.screenOverrides)) {
      const value = values["close-button"];
      if (!value) continue;
      const vertical = value.anchor.startsWith("bottom") ? `bottom:${px(value.bottom)};top:auto;` : `top:${px(value.top)};bottom:auto;`;
      const horizontal = value.anchor.endsWith("left") ? `left:${px(value.left)};right:auto;` : `right:${px(value.right)};left:auto;`;
      rules.push(`[data-ui-screen="${CSS.escape(screenId)}"] [data-ui-component="close-button"], [data-ui-position-screen="${CSS.escape(screenId)}"] { position:absolute;${vertical}${horizontal}translate:${px(value.x)} ${px(value.y)}; }`);
    }
    for (const record of Object.values(config.elementOverrides)) {
      for (const breakpoint of ["base", "desktop", "phone", "smallPhone"]) {
        const values = record[breakpoint];
        if (!values) continue;
        const declarations = [];
        for (const [property, value] of Object.entries(values)) {
          if (property === "x" || property === "y") continue;
          if (value === "" || value == null) continue;
          declarations.push(`${kebab(property)}:${PX_PROPERTIES.has(property) ? px(value) : value}`);
        }
        if (values.x != null || values.y != null) declarations.push(`translate:${px(values.x)} ${px(values.y)}`);
        if (!declarations.length) continue;
        const rule = `[data-ui-screen="${CSS.escape(record.screenId)}"] [data-ui-element-id="${CSS.escape(record.elementId)}"] { ${declarations.join(";")} }`;
        const query = breakpoint === "desktop" ? "(min-width:901px)" : breakpoint === "phone" ? "(min-width:668px) and (max-width:900px)" : breakpoint === "smallPhone" ? "(max-width:667px)" : "";
        rules.push(query ? `@media ${query}{${rule}}` : rule);
      }
    }
    return rules.join("\n");
  }

  function applyConfigToFrame(frame) {
    const doc = frame?.contentDocument;
    if (!doc?.head || !state.config) return;
    let style = doc.getElementById("ui-studio-live-preview");
    if (!style) { style = doc.createElement("style"); style.id = "ui-studio-live-preview"; doc.head.append(style); }
    style.textContent = buildPreviewCss(state.config);
    doc.body?.classList.toggle("ui-guides-active", state.guides);
    doc.querySelectorAll("[data-ui-component='close-button']").forEach(node => { node.dataset.uiPreviewState = state.componentState === "default" ? "" : state.componentState; });
  }

  function applyConfigToFrames() { allFrames().forEach(applyConfigToFrame); }

  function showScreenInFrame(frame, screenId) {
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("[data-ui-screen]").forEach(screen => { screen.hidden = screen.dataset.uiScreen !== screenId; });
    applyConfigToFrame(frame);
  }

  function setScreen(screenId) {
    state.currentScreen = screenId;
    screenFrames().forEach(frame => showScreenInFrame(frame, screenId));
    clearSelection();
    renderInspector();
  }

  function parseInput(input) {
    if (input.type === "number") return input.value === "" ? null : Number(input.value);
    return input.value;
  }

  function changeGlobal(input) {
    const property = input.dataset.uiGlobalProperty;
    const value = parseInput(input);
    if (value == null) return;
    const before = closeState()[property];
    if (String(before) === String(value)) return;
    mutate(`Global Close Button ${property}: ${before} → ${value}`, () => { closeState()[property] = value; });
    rememberColor(value);
  }

  function changeGeneric(input) {
    const meta = selectionMeta();
    if (!meta) return;
    const property = input.dataset.uiProperty;
    const value = parseInput(input);
    if (value == null || meta.screenId === "component-library") return;
    const before = elementRecord(meta)?.[state.breakpoint]?.[property] ?? computedValue(state.selected[0].node, property);
    if (String(before) === String(value)) return;
    mutate(`${meta.componentName} — ${meta.screenName}: ${property} ${before} → ${value}`, () => {
      const record = elementRecord(meta, true);
      if (!record[state.breakpoint]) record[state.breakpoint] = {};
      record[state.breakpoint][property] = value;
      for (const selected of state.selected.slice(1)) {
        const selectedMeta = selectionMeta(selected);
        if (!selectedMeta || selectedMeta.screenId === "component-library") continue;
        const selectedRecord = elementRecord(selectedMeta, true);
        if (!selectedRecord[state.breakpoint]) selectedRecord[state.breakpoint] = {};
        selectedRecord[state.breakpoint][property] = value;
      }
    });
    if (COLOR_PROPERTIES.has(property)) { state.lastColorProperty = property; rememberColor(value); }
  }

  function changePosition(property, value) {
    const meta = selectionMeta();
    if (!meta) return;
    const position = ensureScreenPosition(meta.positionScreenId);
    const before = position[property];
    if (String(before) === String(value)) return;
    mutate(`Close Button — ${meta.screenName}: ${property} ${before} → ${value}`, () => { ensureScreenPosition(meta.positionScreenId)[property] = value; });
  }

  function nudge(direction, amount = 1) {
    const meta = selectionMeta();
    if (!meta) return;
    if (meta.component === "close-button") {
      const property = direction === "left" || direction === "right" ? "x" : "y";
      const delta = direction === "left" || direction === "up" ? -amount : amount;
      changePosition(property, ensureScreenPosition(meta.positionScreenId)[property] + delta);
      return;
    }
    const property = direction === "left" || direction === "right" ? "x" : "y";
    const input = document.querySelector(`[data-ui-property="${property}"]`);
    input.value = Number(input.value || 0) + (direction === "left" || direction === "up" ? -amount : amount);
    changeGeneric(input);
  }

  function align(action) {
    const meta = selectionMeta();
    if (!meta) return;
    if (meta.component === "close-button") {
      if (action === "top-right") mutate(`Close Button — ${meta.screenName}: aligned top right`, () => Object.assign(ensureScreenPosition(meta.positionScreenId), { anchor: "top-right", top: 8, right: 8, x: 0, y: 0 }));
      else if (action === "header") mutate(`Close Button — ${meta.screenName}: aligned to header`, () => Object.assign(ensureScreenPosition(meta.positionScreenId), { anchor: "top-right", top: 16, right: 11, x: 0, y: 0 }));
      return;
    }
    const nodes = state.selected.map(entry => entry.node);
    if (!nodes.length) return;
    const parent = nodes[0].parentElement;
    const parentRect = parent.getBoundingClientRect();
    mutate(`${nodes.length} element${nodes.length === 1 ? "" : "s"} — ${meta.screenName}: ${action}`, () => {
      nodes.forEach((node, index) => {
        const entry = state.selected.find(value => value.node === node);
        const nodeMeta = selectionMeta(entry);
        if (nodeMeta.screenId === "component-library") return;
        const rect = node.getBoundingClientRect();
        const record = elementRecord(nodeMeta, true);
        record[state.breakpoint] ||= {};
        if (action === "left") record[state.breakpoint].x = (record[state.breakpoint].x || 0) + parentRect.left - rect.left;
        if (action === "right") record[state.breakpoint].x = (record[state.breakpoint].x || 0) + parentRect.right - rect.right;
        if (action === "top") record[state.breakpoint].y = (record[state.breakpoint].y || 0) + parentRect.top - rect.top;
        if (action === "bottom") record[state.breakpoint].y = (record[state.breakpoint].y || 0) + parentRect.bottom - rect.bottom;
        if (["center-x", "center-both"].includes(action)) record[state.breakpoint].x = (record[state.breakpoint].x || 0) + (parentRect.left + parentRect.width / 2) - (rect.left + rect.width / 2);
        if (["center-y", "center-both"].includes(action)) record[state.breakpoint].y = (record[state.breakpoint].y || 0) + (parentRect.top + parentRect.height / 2) - (rect.top + rect.height / 2);
        if (action === "equal-x" && nodes.length > 2) record[state.breakpoint].x = index * 8;
        if (action === "equal-y" && nodes.length > 2) record[state.breakpoint].y = index * 8;
      });
    });
  }

  function resetElement() {
    const meta = selectionMeta();
    if (!meta) return;
    mutate(`${meta.componentName} — ${meta.screenName}: reset element`, () => { delete state.config.elementOverrides[overrideKey(meta)]; });
  }

  function restoreShared() {
    const defaults = state.workspace.defaults.globalComponents["close-button"];
    mutate("Global Close Button restored to shared default", () => { state.config.globalComponents["close-button"] = clone(defaults); });
  }

  function rememberColor(value) {
    if (!/^#[0-9a-f]{6}$/i.test(String(value))) return;
    state.recentColors = [value.toUpperCase(), ...state.recentColors.filter(color => color !== value.toUpperCase())].slice(0, 8);
    renderColors();
  }

  function renderColors() {
    elements.uiThemeColorGrid.innerHTML = state.workspace.registry.themeColors.map(item => `<button type="button" data-ui-theme-color="${item.value}" title="${escapeHtml(item.label)} · ${item.token}" style="--swatch:${item.value}"><i></i><span>${escapeHtml(item.label)}</span></button>`).join("");
    elements.uiRecentColors.innerHTML = state.recentColors.map(color => `<button type="button" data-ui-theme-color="${color}" title="Recent ${color}" style="--swatch:${color}"></button>`).join("");
  }

  function applyThemeColor(value) {
    const meta = selectionMeta();
    if (!meta) return;
    if (meta.component === "close-button") {
      const input = document.querySelector(`[data-ui-global-property="${state.lastColorProperty === "color" ? "iconColor" : state.lastColorProperty}"]`) || document.querySelector("[data-ui-global-property='iconColor']");
      input.value = value;
      changeGlobal(input);
    } else {
      const property = COLOR_PROPERTIES.has(state.lastColorProperty) && state.lastColorProperty !== "iconColor" ? state.lastColorProperty : "color";
      const input = document.querySelector(`[data-ui-property="${property}"]`);
      input.value = value;
      changeGeneric(input);
    }
  }

  function rgbToHex(value) {
    const match = String(value || "").match(/rgba?\((\d+)\D+(\d+)\D+(\d+)/i);
    if (!match) return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value).toUpperCase() : "";
    return `#${[match[1], match[2], match[3]].map(channel => Number(channel).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }

  function luminance(color) {
    const hex = rgbToHex(color).slice(1);
    if (hex.length !== 6) return null;
    const channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  }

  function contrastRatio(foreground, background) {
    const first = luminance(foreground); const second = luminance(background);
    if (first == null || second == null) return null;
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  }

  function effectiveBackground(node) {
    let current = node;
    while (current) {
      const color = current.ownerDocument.defaultView.getComputedStyle(current).backgroundColor;
      if (color && !/rgba?\([^)]*,\s*0\s*\)$/.test(color) && color !== "transparent") return color;
      current = current.parentElement;
    }
    return "rgb(255, 255, 255)";
  }

  function updateContrast() {
    const node = state.selected[0]?.node;
    if (!node || selectionMeta()?.component === "close-button") { elements.uiContrastStatus.textContent = node ? "Global Close Button contrast is shown by UI QA." : "Select text to measure contrast."; return; }
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    const ratio = contrastRatio(style.color, effectiveBackground(node));
    if (ratio == null) { elements.uiContrastStatus.textContent = "Contrast could not be calculated for this layered background."; return; }
    const pass = ratio >= 4.5;
    elements.uiContrastStatus.dataset.status = pass ? "passed" : "warning";
    elements.uiContrastStatus.textContent = `${pass ? "PASS" : "LOW CONTRAST"} · ${ratio.toFixed(2)}:1${pass ? "" : " · Try Ivory, Parchment, or Dark Walnut from the project palette."}`;
  }

  function runPreviewQa() {
    const frame = elements.screenFrame;
    const doc = frame?.contentDocument;
    const screen = doc?.querySelector(`[data-ui-screen="${CSS.escape(state.currentScreen)}"]`);
    if (!screen) return [];
    const findings = [];
    const candidates = [...new Set(
      [...screen.querySelectorAll("[data-ui-inspectable],[data-ui-component],h1,h2,h3,h4,p,button,label,strong,span,input")]
        .map(inspectable)
        .filter(node => node?.getClientRects().length)
    )];
    for (const node of candidates) {
      const id = node.dataset.uiElementId || stableElementId(node);
      const style = doc.defaultView.getComputedStyle(node);
      if (node.textContent.trim() && !["IMG", "SVG", "INPUT"].includes(node.tagName)) {
        const ratio = contrastRatio(style.color, effectiveBackground(node));
        if (ratio != null && ratio < 3) findings.push({ kind: "contrast", severity: "High", screenId: state.currentScreen, elementId: id, message: `${node.textContent.trim().slice(0, 42)} has ${ratio.toFixed(2)}:1 contrast.` });
      }
      if (node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2) findings.push({ kind: "overflow", severity: "Medium", screenId: state.currentScreen, elementId: id, message: `${id} clips or overflows its bounds.` });
    }
    const close = screen.querySelector("[data-ui-component='close-button']");
    const header = close?.closest("header,.ui-preview-header,.panel-header") || close?.parentElement;
    if (close && header) {
      const closeRect = close.getBoundingClientRect(); const headerRect = header.getBoundingClientRect();
      if (closeRect.left < headerRect.left || closeRect.right > headerRect.right || closeRect.top < headerRect.top || closeRect.bottom > headerRect.bottom) findings.push({ kind: "close-alignment", severity: "High", screenId: state.currentScreen, elementId: "close-button", message: "Close Button is outside or clipped by the panel header." });
      const title = header.querySelector("h1,h2,h3,strong");
      if (title) { const titleRect = title.getBoundingClientRect(); if (!(closeRect.right < titleRect.left || closeRect.left > titleRect.right || closeRect.bottom < titleRect.top || closeRect.top > titleRect.bottom)) findings.push({ kind: "close-overlap", severity: "High", screenId: state.currentScreen, elementId: "close-button", message: "Close Button overlaps header text." }); }
    }
    if (screen.dataset.uiNoScroll === "true" && (screen.scrollHeight > screen.clientHeight + 2 || screen.scrollWidth > screen.clientWidth + 2)) findings.push({ kind: "no-scroll", severity: "Medium", screenId: state.currentScreen, elementId: "panel-header", message: `${screen.dataset.uiScreenName} is marked No Scroll Expected but now requires scrolling.` });
    return findings.slice(0, 60);
  }

  function renderQa(findings) {
    elements.uiQaResults.innerHTML = findings.length ? findings.map((finding, index) => `<article data-severity="${escapeHtml(finding.severity || "Medium")}"><strong>${escapeHtml(finding.kind || "UI QA")}</strong><p>${escapeHtml(finding.message)}</p>${finding.screenId ? `<button type="button" data-ui-qa-index="${index}">Select Element</button>` : ""}${finding.kind === "legacy" ? `<button type="button" data-ui-convert-usage="${escapeHtml(finding.usageId)}">Convert to Shared Close Button</button>` : ""}</article>`).join("") : "<div class='ui-qa-pass'>PASS · No visible contrast, overflow, clipping, no-scroll, or Close Button alignment findings.</div>";
    elements.uiQaResults._findings = findings;
  }

  async function runCloseAudit() {
    const response = await fetch(`${API}/audit`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Close Button audit failed: ${response.status}`);
    const audit = await response.json();
    const summary = { kind: "summary", severity: "Info", message: `${audit.implementations} existing implementations audited; ${audit.migrated} representative controls use the shared semantic component. Event-handler references were preserved.` };
    renderQa([summary, ...audit.findings]);
  }

  function selectQaFinding(finding) {
    if (!finding?.screenId) return;
    if ([...elements.screenSelect.options].some(option => option.value === finding.screenId)) elements.screenSelect.value = finding.screenId;
    setScreen(elements.screenSelect.value);
    window.setTimeout(() => {
      const entries = selectedNodesForScreen(finding.screenId, finding.elementId || "close-button");
      if (entries[0]) selectNode(entries[0].frame, entries[0].node, false);
    }, 0);
  }

  function renderMatchSources() {
    const frame = currentFrame(); const doc = frame?.contentDocument; const meta = selectionMeta();
    const options = doc && meta ? [...doc.querySelectorAll("[data-ui-element-id]")].filter(node => node !== state.selected[0]?.node).slice(0, 80) : [];
    elements.uiMatchSourceSelect.innerHTML = `<option value="">Choose element…</option>${options.map(node => `<option value="${escapeHtml(node.dataset.uiElementId)}">${escapeHtml(node.dataset.uiBreadcrumb || node.dataset.uiElementId)}</option>`).join("")}`;
  }

  function matchStyle() {
    const meta = selectionMeta(); const frame = currentFrame(); const sourceId = elements.uiMatchSourceSelect.value;
    const source = frame?.contentDocument?.querySelector(`[data-ui-element-id="${CSS.escape(sourceId)}"]`);
    if (!meta || !source || meta.screenId === "component-library") return;
    const style = source.ownerDocument.defaultView.getComputedStyle(source);
    mutate(`${meta.componentName} — ${meta.screenName}: matched style from ${sourceId}`, () => {
      const record = elementRecord(meta, true); record[state.breakpoint] ||= {};
      Object.assign(record[state.breakpoint], { color: rgbToHex(style.color), backgroundColor: rgbToHex(style.backgroundColor), borderColor: rgbToHex(style.borderColor), borderWidth: parseFloat(style.borderWidth) || 0, borderRadius: parseFloat(style.borderRadius) || 0, fontSize: parseFloat(style.fontSize) || 16, fontWeight: parseFloat(style.fontWeight) || 600, lineHeight: parseFloat(style.lineHeight) || 1.2 });
    });
  }

  async function save(options = {}) {
    if (!state.dirty) return { ok: true, unchanged: true };
    if (options.confirm && !window.confirm(`Save ${state.pending.length} pending UI change${state.pending.length === 1 ? "" : "s"} to ui-studio-config.json?\n\nAffected file:\nui-studio-config.json`)) return { ok: false, cancelled: true };
    elements.uiSaveStatus.textContent = "Saving UI configuration and validating…";
    const response = await fetch(`${API}/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.config) });
    if (!response.ok) throw new Error((await response.text()) || `UI save failed: ${response.status}`);
    const result = await response.json();
    state.config = clone(result.config); state.baseline = clone(result.config); state.pending = []; state.undo = []; state.redo = [];
    setStudioDirty(false); renderPending(); renderInspector(); applyConfigToFrames();
    elements.uiUndoBtn.disabled = true; elements.uiRedoBtn.disabled = true;
    elements.uiSaveStatus.dataset.kind = result.validation.warnings.length ? "warning" : "success";
    elements.uiSaveStatus.textContent = `${result.validation.warnings.length ? "Saved with warnings" : "Saved · Validation Passed"} · ${result.validation.checks.join(" · ")}`;
    log("Saved manual UI configuration.", "success", result.changedFiles.join(", "));
    await refreshSourceStatus();
    return { ok: true, ...result };
  }

  function discardPreview() {
    if (!state.dirty || !window.confirm("Discard all unsaved manual UI preview changes from this session?")) return;
    state.config = clone(state.baseline); state.pending = []; state.undo = []; state.redo = [];
    setStudioDirty(false); applyConfigToFrames(); renderPending(); renderInspector();
  }

  async function refreshSourceStatus() {
    const api = window.crownlandsDesktop?.sourceControl;
    if (!api) {
      elements.uiGitDirtyNotice.textContent = "Source-control actions are available in the Windows Studio app.";
      elements.uiCommitBtn.disabled = true; elements.uiPushBtn.disabled = true; elements.uiReviewDiffBtn.disabled = true;
      return;
    }
    state.sourceStatus = await api.status();
    elements.uiGitBranch.textContent = state.sourceStatus.branch || "Detached";
    elements.uiGitDirtyNotice.dataset.dirty = String(state.sourceStatus.dirty);
    elements.uiGitDirtyNotice.textContent = state.sourceStatus.dirty ? `Uncommitted Changes Detected · ${state.sourceStatus.modifiedCount} modified file${state.sourceStatus.modifiedCount === 1 ? "" : "s"}. Manual preview is safe; Save writes only ui-studio-config.json.` : "Working tree clean · no uncommitted files.";
    elements.uiCommitBtn.disabled = state.sourceStatus.protectedBranch;
    elements.uiPushBtn.disabled = state.sourceStatus.protectedBranch || !state.sourceStatus.remotes.includes("origin");
  }

  async function reviewDiff() {
    const result = await window.crownlandsDesktop?.sourceControl?.diff(["ui-studio-config.json"]);
    elements.uiDiffReview.classList.remove("hidden");
    elements.uiDiffReview.textContent = result?.text || "No saved UI config diff. Pending preview changes have not been written yet.";
  }

  async function commitChanges() {
    if (state.dirty) throw new Error("Save pending UI changes before committing.");
    const message = elements.uiCommitMessage.value.trim() || elements.uiCommitMessage.placeholder;
    const result = await window.crownlandsDesktop?.sourceControl?.commit({ message, files: ["ui-studio-config.json"] });
    if (result?.cancelled) return;
    elements.uiSaveStatus.dataset.kind = "success";
    elements.uiSaveStatus.textContent = `Committed ${result.head.slice(0, 10)} on ${result.branch}. Nothing was pushed.`;
    await refreshSourceStatus();
  }

  async function pushChanges() {
    if (state.dirty) throw new Error("Save pending UI changes before pushing.");
    const result = await window.crownlandsDesktop?.sourceControl?.push();
    if (result?.cancelled) return;
    elements.uiSaveStatus.dataset.kind = "success";
    elements.uiSaveStatus.textContent = `Pushed ${result.branch} to ${result.remote}. No merge or deployment was performed.`;
    await refreshSourceStatus();
  }

  function bindEvents() {
    allFrames().forEach(frame => frame.addEventListener("load", () => bindFrame(frame)));
    document.querySelectorAll("[data-ui-inspector-toggle]").forEach(button => button.addEventListener("click", () => {
      state.inspectEnabled = !state.inspectEnabled;
      document.querySelectorAll("[data-ui-inspector-toggle]").forEach(value => { value.classList.toggle("active", state.inspectEnabled); value.textContent = state.inspectEnabled ? "Inspecting…" : "Inspect UI"; });
      elements.uiPropertyInspector.classList.remove("hidden");
      notifyStatus(state.inspectEnabled ? "Inspect UI is active. Click an element; hold Shift or Ctrl to multi-select." : "Inspect UI paused.");
    }));
    elements.screenSelect.addEventListener("change", () => setScreen(elements.screenSelect.value));
    elements.uiUndoBtn.addEventListener("click", undo); elements.uiRedoBtn.addEventListener("click", redo);
    elements.uiGuidesBtn.addEventListener("click", () => { state.guides = !state.guides; elements.uiGuidesBtn.setAttribute("aria-pressed", String(state.guides)); elements.uiGuidesBtn.classList.toggle("active", state.guides); applyConfigToFrames(); });
    elements.uiComponentState.addEventListener("change", () => { state.componentState = CLOSE_STATES.has(elements.uiComponentState.value) ? elements.uiComponentState.value : "default"; applyConfigToFrames(); renderInspector(); });
    document.querySelectorAll("[data-ui-global-property]").forEach(input => {
      input.addEventListener("focus", () => { if (COLOR_PROPERTIES.has(input.dataset.uiGlobalProperty)) state.lastColorProperty = input.dataset.uiGlobalProperty; });
      input.addEventListener("change", () => changeGlobal(input));
      if (["number", "color", "range"].includes(input.type)) input.addEventListener("input", () => changeGlobal(input));
    });
    document.querySelectorAll("[data-ui-property]").forEach(input => {
      input.addEventListener("focus", () => { if (COLOR_PROPERTIES.has(input.dataset.uiProperty)) state.lastColorProperty = input.dataset.uiProperty; });
      input.addEventListener("change", () => changeGeneric(input));
      if (["number", "color", "range"].includes(input.type)) input.addEventListener("input", () => changeGeneric(input));
    });
    elements.uiBreakpointSelect.addEventListener("change", () => { state.breakpoint = elements.uiBreakpointSelect.value; renderInspector(); });
    elements.uiAnchorSelect.addEventListener("change", () => changePosition("anchor", elements.uiAnchorSelect.value));
    for (const [element, property] of [[elements.uiPositionTop, "top"], [elements.uiPositionRight, "right"], [elements.uiPositionX, "x"], [elements.uiPositionY, "y"]]) {
      element.addEventListener("input", () => changePosition(property, Number(element.value)));
      element.addEventListener("change", () => changePosition(property, Number(element.value)));
    }
    document.querySelectorAll("[data-ui-nudge]").forEach(button => button.addEventListener("click", event => nudge(button.dataset.uiNudge, event.shiftKey ? 8 : 1)));
    document.querySelectorAll("[data-ui-align]").forEach(button => button.addEventListener("click", () => align(button.dataset.uiAlign)));
    elements.uiRestoreSharedBtn.addEventListener("click", restoreShared);
    elements.uiResetPositionBtn.addEventListener("click", () => { const meta = selectionMeta(); if (meta) mutate(`Close Button — ${meta.screenName}: restored default position`, () => { delete state.config.screenOverrides[meta.positionScreenId]; }); });
    elements.uiResetElementBtn.addEventListener("click", resetElement);
    elements.uiResetPropertyBtn.addEventListener("click", () => { const active = document.activeElement; if (active?.dataset?.uiProperty) { const meta = selectionMeta(); const property = active.dataset.uiProperty; mutate(`${meta.componentName} — ${meta.screenName}: reset ${property}`, () => { const record = elementRecord(meta); if (record?.[state.breakpoint]) delete record[state.breakpoint][property]; }); } });
    elements.uiPreviewAffectedBtn.addEventListener("click", () => { elements.viewportComparePanel.classList.remove("hidden"); elements.compareViewportsBtn.classList.add("active"); });
    elements.compareViewportsBtn.addEventListener("click", () => { const show = elements.viewportComparePanel.classList.toggle("hidden"); elements.compareViewportsBtn.classList.toggle("active", !show); });
    elements.uiThemeColorGrid.addEventListener("click", event => { const button = event.target.closest("[data-ui-theme-color]"); if (button) applyThemeColor(button.dataset.uiThemeColor); });
    elements.uiRecentColors.addEventListener("click", event => { const button = event.target.closest("[data-ui-theme-color]"); if (button) applyThemeColor(button.dataset.uiThemeColor); });
    elements.uiRunQaBtn.addEventListener("click", () => renderQa(runPreviewQa()));
    elements.uiCloseAuditBtn.addEventListener("click", () => runCloseAudit().catch(handleError));
    elements.uiQaResults.addEventListener("click", event => { const button = event.target.closest("[data-ui-qa-index]"); if (button) selectQaFinding(elements.uiQaResults._findings?.[Number(button.dataset.uiQaIndex)]); const convert = event.target.closest("[data-ui-convert-usage]"); if (convert) mutate(`Converted ${convert.dataset.uiConvertUsage} to shared Close Button metadata`, () => { state.config.sharedMigrations[convert.dataset.uiConvertUsage] = true; }); });
    elements.uiMatchStyleBtn.addEventListener("click", matchStyle);
    elements.uiSaveChangesBtn.addEventListener("click", () => save({ confirm: true }).catch(handleError));
    elements.uiDiscardChangesBtn.addEventListener("click", discardPreview);
    elements.uiChangeHistory.addEventListener("click", event => { const button = event.target.closest("[data-ui-revert-index]"); if (!button) return; while (state.pending.length > Number(button.dataset.uiRevertIndex)) undo(); });
    elements.uiRefreshGitBtn.addEventListener("click", () => refreshSourceStatus().catch(handleError));
    elements.uiReviewDiffBtn.addEventListener("click", () => reviewDiff().catch(handleError));
    elements.uiCommitBtn.addEventListener("click", () => commitChanges().catch(handleError));
    elements.uiPushBtn.addEventListener("click", () => pushChanges().catch(handleError));
    window.addEventListener("keydown", event => {
      const tag = event.target?.tagName;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))) { event.preventDefault(); redo(); return; }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || !state.selected.length) return;
      const direction = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[event.key];
      if (direction) { event.preventDefault(); nudge(direction, event.shiftKey ? 8 : 1); }
    });
  }

  function handleError(error) {
    const message = error?.message || String(error);
    elements.uiSaveStatus.dataset.kind = "error"; elements.uiSaveStatus.textContent = message;
    notifyStatus(message, "error"); log(message, "error", error?.stack || "");
  }

  async function init(options = {}) {
    notifyStatus = options.onStatus || notifyStatus; log = options.log || log;
    cacheElements(); bindEvents();
    const response = await fetch(API, { cache: "no-store" });
    if (!response.ok) throw new Error(`Manual UI workspace failed to load: ${response.status}`);
    state.workspace = await response.json();
    state.config = clone(state.workspace.config); state.baseline = clone(state.workspace.config);
    renderColors(); renderPending();
    allFrames().forEach(frame => { if (frame.contentDocument?.readyState === "complete") bindFrame(frame); });
    screenFrames().forEach(frame => {
      const preset = frame.dataset.comparePreset;
      if (preset && PRESETS[preset]) { frame.style.width = `${PRESETS[preset][0]}px`; frame.style.height = `${PRESETS[preset][1]}px`; }
    });
    setScreen(elements.screenSelect.value);
    await refreshSourceStatus();
    renderInspector();
    log("Manual UI inspector ready.", "success", `${state.workspace.registry.components.length} shared components · ${state.workspace.registry.screens.length} priority screens`);
  }

  window.CrownlandsUIInspector = Object.freeze({
    init,
    save,
    isDirty: () => state.dirty,
    hasLoadError: () => Boolean(state.loadError),
    getConfig: () => clone(state.config),
    getSelectionContext() {
      const meta = selectionMeta();
      return meta ? { area: "UI Studio / Manual Inspector", screen: meta.screenName, screenId: meta.screenId, component: meta.componentName, elementId: meta.elementId, selector: `[data-ui-element-id="${meta.elementId}"]`, sourceFiles: [meta.source, meta.localSource, "ui-studio-config.json"], sharedComponent: meta.component === "close-button" ? clone(state.workspace.registry.closeButton) : null, currentQa: runPreviewQa() } : { area: "UI Studio / Manual Inspector" };
    },
    selectQaFinding,
    runQa: runPreviewQa,
    undo,
    redo,
  });
})();
