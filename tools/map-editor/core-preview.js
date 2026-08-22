(function initCrownlandsCorePreview(global) {
  "use strict";

  const API = "/api/core-preview";
  const SIZE_RULES = Object.freeze({
    camp: Object.freeze({ minimum: 48, maximum: 400, fallback: 132, label: "Camp" }),
    stronghold: Object.freeze({ minimum: 64, maximum: 500, fallback: 154, label: "Stronghold" }),
    crownCitadel: Object.freeze({ minimum: 100, maximum: 700, fallback: 260, label: "Crown Citadel" }),
  });
  const SIDE_ORDER = ["north", "east", "south", "west"];

  const state = {
    active: false,
    loaded: false,
    loading: false,
    verificationAttempts: 0,
    workspace: null,
    config: null,
    baseline: null,
    selectedRegionId: "",
    undo: [],
    redo: [],
    lastSave: null,
    viewMode: "all",
  };

  const elements = {};

  function cacheElements() {
    [
      "corePreviewView", "corePreviewIntegrityBadge", "corePreviewBlocker", "corePreviewWorkspace",
      "corePreviewPackage", "corePreviewCandidate", "corePreviewCounts", "corePreviewDigest",
      "corePreviewGrid", "corePreviewViewFilters", "corePreviewCampSize", "corePreviewStrongholdSize", "corePreviewCitadelSize",
      "corePreviewUndoBtn", "corePreviewRedoBtn", "corePreviewResetBtn", "corePreviewSaveBtn",
      "corePreviewComparison", "corePreviewWarnings", "corePreviewDiff", "corePreviewStatus",
      "corePreviewDetail",
    ].forEach(id => { elements[id] = document.getElementById(id); });
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function assetUrl(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^(?:https?:|data:|\/)/i.test(source)) return source;
    return `/${source.replace(/^\.\//, "")}`;
  }

  function sizes(config = state.config) {
    return config?.pendingCore5x5?.visualSizes || {};
  }

  function objectiveSize(objective) {
    const rule = SIZE_RULES[objective.kind] || SIZE_RULES.stronghold;
    const value = Number(sizes()?.[objective.kind]);
    return Number.isFinite(value) && value > 0 ? value : Number(objective.serializedSize) || rule.fallback;
  }

  function objectivePosition(objective, region) {
    const left = Number.isFinite(Number(objective.xNorm)) ? Number(objective.xNorm) * 100 : Number(objective.x) / Number(region.width) * 100;
    const top = Number.isFinite(Number(objective.yNorm)) ? Number(objective.yNorm) * 100 : Number(objective.y) / Number(region.height) * 100;
    return { left, top };
  }

  function cityPosition(city, region) {
    const left = Number.isFinite(Number(city.xNorm)) ? Number(city.xNorm) * 100 : Number(city.x) / Number(region.width) * 100;
    const top = Number.isFinite(Number(city.yNorm)) ? Number(city.yNorm) * 100 : Number(city.y) / Number(region.height) * 100;
    return { left, top };
  }

  function pointStyle(point) {
    return `left:${point.left.toFixed(4)}%;top:${point.top.toFixed(4)}%`;
  }

  function regionById(id) {
    return state.workspace?.regions?.find(region => region.id === id) || null;
  }

  function selectedRegion() {
    return regionById(state.selectedRegionId) || state.workspace?.regions?.[0] || null;
  }

  function configSignature(config = state.config) {
    return JSON.stringify(sizes(config));
  }

  function isDirty() {
    return Boolean(state.config && state.baseline && configSignature(state.config) !== configSignature(state.baseline));
  }

  function notifyDirty() {
    global.CrownlandsStudioUI?.setGlobalDirty?.(isDirty());
  }

  function setStatus(message, kind = "") {
    if (!elements.corePreviewStatus) return;
    elements.corePreviewStatus.textContent = message;
    elements.corePreviewStatus.dataset.kind = kind;
  }

  function configErrors() {
    return Object.entries(SIZE_RULES).flatMap(([key, rule]) => {
      const value = Number(sizes()?.[key]);
      if (!Number.isInteger(value) || value < rule.minimum || value > rule.maximum) {
        return [`${rule.label} must be a whole number from ${rule.minimum} to ${rule.maximum} px.`];
      }
      return [];
    });
  }

  function pushUndo() {
    const snapshot = clone(state.config);
    if (state.undo.length && configSignature(state.undo[state.undo.length - 1]) === configSignature(snapshot)) return;
    state.undo.push(snapshot);
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
  }

  function setConfig(nextConfig, message) {
    state.config = clone(nextConfig);
    notifyDirty();
    render();
    if (message) setStatus(message, configErrors().length ? "error" : "busy");
  }

  function renderIntegrity() {
    const integrity = state.workspace?.integrity || {};
    const verified = Boolean(state.workspace?.ok && integrity.ok);
    elements.corePreviewIntegrityBadge.textContent = verified ? "MANIFEST VERIFIED" : "PREVIEW BLOCKED";
    elements.corePreviewIntegrityBadge.dataset.ok = String(verified);
    elements.corePreviewBlocker.hidden = verified;
    elements.corePreviewWorkspace.hidden = !verified;
    if (!verified) {
      const errors = state.workspace?.errors || ["The supplemental Core preview manifest could not be verified."];
      const unavailable = state.workspace?.reason === "unavailable";
      const title = unavailable ? "Pending Core preview unavailable for this project" : "Core Preview Integrity Check Failed";
      elements.corePreviewBlocker.innerHTML = `<strong>${title}</strong><p>No map was rendered and editing is disabled.</p><ul>${errors.map(error => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
    }
  }

  function renderSummary() {
    const workspace = state.workspace;
    const counts = workspace.integrity.counts;
    elements.corePreviewPackage.textContent = workspace.packageVersion;
    elements.corePreviewCandidate.textContent = workspace.candidateId;
    elements.corePreviewCounts.textContent = `${counts.maps} maps · ${counts.cities} cities · ${counts.objectives} objectives · ${counts.reciprocalConnections} reciprocal roads`;
    elements.corePreviewDigest.textContent = workspace.integrity.overallSha256;
    elements.corePreviewDigest.title = `${workspace.integrity.protectedFileCount} protected files · ${workspace.integrity.manifestPath}`;
  }

  function renderRoadExits(region) {
    return SIDE_ORDER.flatMap(side => (region.edgeConnections?.[side] || []).map(edge => {
      const offset = side === "north" || side === "south" ? Number(edge.arrowXNorm ?? ((edge.start + edge.end) / 2)) * 100
        : Number(edge.arrowYNorm ?? ((edge.start + edge.end) / 2)) * 100;
      return `<span class="core-road-exit core-road-${side}" style="--road-offset:${offset.toFixed(3)}%" title="${escapeHtml(`${edge.type || "road"} to ${edge.connectsToRegionId}`)}"></span>`;
    })).join("");
  }

  function renderCities(region, detailed = false) {
    return region.cities.map(city => {
      const position = cityPosition(city, region);
      return `<span class="core-city-marker${detailed ? " detailed" : ""}" style="${pointStyle(position)}" title="${escapeHtml(city.name || city.id)}"></span>`;
    }).join("");
  }

  function renderObjectives(region, detailed = false) {
    return region.objectives.map(objective => {
      const position = objectivePosition(objective, region);
      const size = objectiveSize(objective);
      const width = size / Number(region.width) * 100;
      const art = assetUrl(objective.artSrc);
      const title = `${objective.name || objective.id} · visual ${size}px · interaction ${objective.interactionSize}px`;
      const content = art ? `<img src="${escapeHtml(art)}" alt="" draggable="false" />` : `<b>${escapeHtml(objective.kind)}</b>`;
      return `<span class="core-objective-marker ${escapeHtml(objective.kind)}${detailed ? " detailed" : ""}" data-objective-kind="${escapeHtml(objective.kind)}" style="${pointStyle(position)};width:${Math.max(width, detailed ? 3 : 1.8).toFixed(4)}%" title="${escapeHtml(title)}"><i style="--interaction-ratio:${Math.max(0.15, Number(objective.interactionSize) / size).toFixed(4)}"></i>${content}</span>`;
    }).join("");
  }

  function renderGrid() {
    const selected = selectedRegion();
    elements.corePreviewGrid.innerHTML = state.workspace.regions.map(region => {
      const map = region.map?.url || "";
      const relevant = state.viewMode === "all" || region.objectives.some(objective => objective.kind === state.viewMode);
      return `<button class="core-preview-tile${selected?.id === region.id ? " selected" : ""}${relevant ? "" : " comparison-muted"}" type="button" data-core-region="${escapeHtml(region.id)}" style="grid-column:${Number(region.gridX) + 3};grid-row:${Number(region.gridY) + 3}" aria-label="Inspect ${escapeHtml(region.name)}">
        <img src="${escapeHtml(map)}" alt="" draggable="false" />
        <span class="core-preview-overlay">${renderCities(region)}${renderObjectives(region)}${renderRoadExits(region)}</span>
        <span class="core-preview-tile-label"><strong>${escapeHtml(region.name.replace(/\s+—.*$/, ""))}</strong><small>${region.cities.length} cities · ${region.objectives.length} objectives</small></span>
      </button>`;
    }).join("");
    elements.corePreviewViewFilters.querySelectorAll("[data-core-view]").forEach(button => {
      button.classList.toggle("active", button.dataset.coreView === state.viewMode);
    });
  }

  function neighborIds(region) {
    return [...new Set(SIDE_ORDER.flatMap(side => (region.edgeConnections?.[side] || []).map(edge => edge.connectsToRegionId)).filter(Boolean))];
  }

  function renderDetail() {
    const region = selectedRegion();
    if (!region) { elements.corePreviewDetail.innerHTML = ""; return; }
    const neighbors = neighborIds(region);
    const typeCounts = region.objectives.reduce((result, objective) => {
      result[objective.kind] = (result[objective.kind] || 0) + 1;
      return result;
    }, {});
    elements.corePreviewDetail.innerHTML = `<div class="core-preview-detail-copy">
      <span>Selected verified region · grid ${region.gridX}, ${region.gridY}</span>
      <strong>${escapeHtml(region.name)}</strong>
      <p>${region.cities.length} actual cities · ${region.objectives.length} objectives (${typeCounts.camp || 0} camp, ${typeCounts.stronghold || 0} stronghold, ${typeCounts.crownCitadel || 0} citadel) · ${neighbors.length} connected neighbors</p>
      <nav aria-label="Connected Core regions">${neighbors.map(id => `<button type="button" data-core-neighbor="${escapeHtml(id)}">${escapeHtml(regionById(id)?.name?.replace(/\s+—.*$/, "") || id)}</button>`).join("") || "<small>Outer edge: no connected neighbor.</small>"}</nav>
    </div>
    <div class="core-preview-detail-map">
      <img src="${escapeHtml(region.map?.url || "")}" alt="${escapeHtml(region.name)} map" draggable="false" />
      <span class="core-preview-overlay">${renderCities(region, true)}${renderObjectives(region, true)}${renderRoadExits(region)}</span>
    </div>`;
  }

  function interactionValues(kind) {
    return [...new Set(state.workspace.regions.flatMap(region => region.objectives)
      .filter(objective => objective.kind === kind)
      .map(objective => Number(objective.interactionSize)))]
      .sort((left, right) => left - right);
  }

  function renderControls() {
    const current = sizes();
    if (document.activeElement !== elements.corePreviewCampSize) elements.corePreviewCampSize.value = current.camp;
    if (document.activeElement !== elements.corePreviewStrongholdSize) elements.corePreviewStrongholdSize.value = current.stronghold;
    if (document.activeElement !== elements.corePreviewCitadelSize) elements.corePreviewCitadelSize.value = current.crownCitadel;
    const errors = configErrors();
    elements.corePreviewUndoBtn.disabled = !state.undo.length;
    elements.corePreviewRedoBtn.disabled = !state.redo.length;
    elements.corePreviewResetBtn.disabled = !isDirty();
    elements.corePreviewSaveBtn.disabled = !isDirty() || Boolean(errors.length);
    elements.corePreviewComparison.innerHTML = Object.entries(SIZE_RULES).map(([key, rule]) => {
      const baseline = sizes(state.baseline)?.[key];
      const pending = current[key];
      const interaction = interactionValues(key);
      const interactionLabel = interaction.length ? interaction.join(", ") : "n/a";
      return `<div data-changed="${baseline !== pending}"><strong>${rule.label}</strong><span>Saved visual <b>${baseline}px</b></span><span>Pending visual <b>${pending}px</b></span><span>Interaction remains <b>${interactionLabel}px</b></span></div>`;
    }).join("");
    renderDiff(errors);
  }

  function collisionWarnings() {
    const warnings = [];
    state.workspace.regions.forEach(region => {
      region.objectives.forEach(objective => {
        const objectiveX = Number(objective.xNorm) * region.width || Number(objective.x);
        const objectiveY = Number(objective.yNorm) * region.height || Number(objective.y);
        const visualRadius = objectiveSize(objective) / 2;
        if (objectiveX - visualRadius < 0 || objectiveY - visualRadius < 0 || objectiveX + visualRadius > region.width || objectiveY + visualRadius > region.height) {
          warnings.push({ region, text: `${objective.name || objective.id} artwork extends outside the map bounds` });
        }
        SIDE_ORDER.forEach(side => (region.edgeConnections?.[side] || []).forEach(edge => {
          const roadXNorm = side === "east" ? Number(edge.arrowXNorm ?? .935) : side === "west" ? Number(edge.arrowXNorm ?? .065) : Number(edge.arrowXNorm ?? ((edge.start + edge.end) / 2));
          const roadYNorm = side === "south" ? Number(edge.arrowYNorm ?? .935) : side === "north" ? Number(edge.arrowYNorm ?? .065) : Number(edge.arrowYNorm ?? ((edge.start + edge.end) / 2));
          const roadX = roadXNorm * region.width;
          const roadY = roadYNorm * region.height;
          if (Math.hypot(objectiveX - roadX, objectiveY - roadY) < visualRadius + 34) {
            warnings.push({ region, text: `${objective.name || objective.id} artwork approaches the ${side} road exit` });
          }
        }));
        region.cities.forEach(city => {
          const cityX = Number(city.xNorm) * region.width || Number(city.x);
          const cityY = Number(city.yNorm) * region.height || Number(city.y);
          if (Math.hypot(objectiveX - cityX, objectiveY - cityY) < visualRadius + 18) {
            warnings.push({ region, text: `${objective.name || objective.id} visually overlaps ${city.name || city.id}` });
          }
        });
      });
      region.objectives.forEach((left, index) => region.objectives.slice(index + 1).forEach(right => {
        const leftX = Number(left.xNorm) * region.width || Number(left.x);
        const leftY = Number(left.yNorm) * region.height || Number(left.y);
        const rightX = Number(right.xNorm) * region.width || Number(right.x);
        const rightY = Number(right.yNorm) * region.height || Number(right.y);
        if (Math.hypot(leftX - rightX, leftY - rightY) < (objectiveSize(left) + objectiveSize(right)) / 2) {
          warnings.push({ region, text: `${left.name || left.id} visually overlaps ${right.name || right.id}` });
        }
      }));
    });
    return warnings;
  }

  function renderWarnings() {
    const warnings = collisionWarnings();
    elements.corePreviewWarnings.innerHTML = warnings.length
      ? `<p><strong>${warnings.length} visual warning${warnings.length === 1 ? "" : "s"}</strong> — diagnostics do not change hitboxes or march routing.</p><ol>${warnings.slice(0, 20).map(warning => `<li><button type="button" data-core-warning-region="${escapeHtml(warning.region.id)}">${escapeHtml(warning.region.name.replace(/\s+—.*$/, ""))}</button> ${escapeHtml(warning.text)}</li>`).join("")}${warnings.length > 20 ? `<li>…and ${warnings.length - 20} more.</li>` : ""}</ol>`
      : "<p><strong>No visual collisions detected.</strong> This is a visual-only check; gameplay geometry was not recalculated.</p>";
  }

  function renderDiff(errors = configErrors()) {
    if (errors.length) {
      elements.corePreviewDiff.textContent = `SAVE BLOCKED\n${errors.join("\n")}`;
      return;
    }
    const changes = Object.keys(SIZE_RULES).filter(key => sizes(state.baseline)?.[key] !== sizes()?.[key]);
    if (!changes.length && !state.lastSave) {
      elements.corePreviewDiff.textContent = "No unsaved visual changes.";
      return;
    }
    if (changes.length) {
      elements.corePreviewDiff.textContent = [
        "objective-visual-config.js",
        ...changes.map(key => `- ${key}: ${sizes(state.baseline)[key]} px\n+ ${key}: ${sizes()[key]} px`),
        "generated package files affected: 0",
      ].join("\n");
      return;
    }
    const receipt = state.lastSave;
    elements.corePreviewDiff.textContent = [
      "SAVED: objective-visual-config.js",
      ...(receipt.changes || []).map(change => `${change.field}: ${change.before} -> ${change.after}`),
      `generated package files affected: ${receipt.generatedFilesAffected}`,
      `protected package unchanged: ${receipt.packageIntegrityUnchanged}`,
      `reset candidate unchanged: ${receipt.resetCandidateUnchanged}`,
      `manifest: ${receipt.packageOverallSha256}`,
    ].join("\n");
  }

  function render() {
    if (!state.loaded || !state.workspace) return;
    renderIntegrity();
    if (!state.workspace.ok) return;
    renderSummary();
    renderGrid();
    renderDetail();
    renderControls();
    renderWarnings();
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    state.verificationAttempts += 1;
    elements.corePreviewIntegrityBadge.textContent = "VERIFYING MANIFEST";
    setStatus("Verifying every protected Core preview artifact before rendering…", "busy");
    try {
      const response = await fetch(API, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Core preview request failed: ${response.status}`);
      state.workspace = payload;
      state.loaded = true;
      if (payload.ok) {
        state.config = clone(payload.config);
        state.baseline = clone(payload.config);
        state.selectedRegionId = payload.regions.find(region => region.gridX === 0 && region.gridY === 0)?.id || payload.regions[0]?.id || "";
        setStatus(`Verified ${payload.integrity.protectedFileCount} protected files. Offline preview is editable.`, "success");
      } else {
        setStatus("Core preview blocked because protected package integrity could not be established.", "error");
      }
      render();
    } catch (error) {
      state.workspace = { ok: false, errors: [error.message || String(error)], integrity: { ok: false } };
      state.loaded = true;
      render();
      setStatus(error.message || String(error), "error");
    } finally {
      state.loading = false;
    }
  }

  function handleSizeInput(event) {
    const mapping = new Map([
      [elements.corePreviewCampSize, "camp"],
      [elements.corePreviewStrongholdSize, "stronghold"],
      [elements.corePreviewCitadelSize, "crownCitadel"],
    ]);
    const key = mapping.get(event.target);
    if (!key) return;
    const nextValue = Number(event.target.value);
    if (sizes()[key] === nextValue) return;
    pushUndo();
    state.config.pendingCore5x5.visualSizes[key] = nextValue;
    notifyDirty();
    render();
    const errors = configErrors();
    setStatus(errors[0] || `${SIZE_RULES[key].label} artwork preview updated. Gameplay geometry remains unchanged.`, errors.length ? "error" : "busy");
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(clone(state.config));
    setConfig(state.undo.pop(), "Reverted the last visual-size edit.");
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(clone(state.config));
    setConfig(state.redo.pop(), "Reapplied the visual-size edit.");
  }

  function reset() {
    if (!isDirty()) return;
    pushUndo();
    setConfig(state.baseline, "Restored the saved external visual configuration.");
  }

  async function save() {
    if (!isDirty()) return { ok: true, changes: [], generatedFilesAffected: 0 };
    const errors = configErrors();
    if (errors.length) throw new Error(errors.join(" "));
    elements.corePreviewSaveBtn.disabled = true;
    setStatus("Saving only objective-visual-config.js, then re-verifying the protected package…", "busy");
    const response = await fetch(`${API}/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.config),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Core preview save failed: ${response.status}`);
    state.config = clone(payload.config);
    state.baseline = clone(payload.config);
    state.lastSave = payload;
    state.undo = [];
    state.redo = [];
    notifyDirty();
    render();
    setStatus(`Saved ${payload.changedFiles.length || 0} external config file. Generated files affected: ${payload.generatedFilesAffected}. Protected digest unchanged.`, "success");
    return payload;
  }

  function selectRegion(id) {
    if (!regionById(id)) return;
    state.selectedRegionId = id;
    renderGrid();
    renderDetail();
    elements.corePreviewDetail.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }

  function bindEvents() {
    elements.corePreviewGrid.addEventListener("click", event => selectRegion(event.target.closest("[data-core-region]")?.dataset.coreRegion));
    elements.corePreviewViewFilters.addEventListener("click", event => {
      const button = event.target.closest("[data-core-view]");
      if (!button) return;
      state.viewMode = button.dataset.coreView;
      const firstMatch = state.workspace.regions.find(region => state.viewMode === "all" || region.objectives.some(objective => objective.kind === state.viewMode));
      if (firstMatch) state.selectedRegionId = firstMatch.id;
      renderGrid();
      renderDetail();
      setStatus(`${button.textContent.trim()} comparison selected. Protected coordinates remain locked.`, "success");
    });
    elements.corePreviewDetail.addEventListener("click", event => selectRegion(event.target.closest("[data-core-neighbor]")?.dataset.coreNeighbor));
    elements.corePreviewWarnings.addEventListener("click", event => selectRegion(event.target.closest("[data-core-warning-region]")?.dataset.coreWarningRegion));
    [elements.corePreviewCampSize, elements.corePreviewStrongholdSize, elements.corePreviewCitadelSize].forEach(input => input.addEventListener("input", handleSizeInput));
    elements.corePreviewUndoBtn.addEventListener("click", undo);
    elements.corePreviewRedoBtn.addEventListener("click", redo);
    elements.corePreviewResetBtn.addEventListener("click", reset);
    elements.corePreviewSaveBtn.addEventListener("click", () => save().catch(error => {
      setStatus(error.message || String(error), "error");
      renderControls();
    }));
  }

  async function init() {
    cacheElements();
    bindEvents();
    render();
  }

  function setActive(value) {
    const wasActive = state.active;
    state.active = Boolean(value);
    if (state.active && !wasActive) load();
    if (state.active) render();
  }

  function getVerificationStatus() {
    return Object.freeze({
      active: state.active,
      loading: state.loading,
      attempts: state.verificationAttempts,
      verified: Boolean(state.workspace?.ok && state.workspace?.integrity?.ok),
    });
  }

  global.CrownlandsCorePreview = Object.freeze({ getVerificationStatus, init, isDirty, load, save, setActive });
})(window);
