(function () {
  const QA_API = "/api/qa-issues";
  const CONTEXT_API = "/api/studio-context";
  const STATUSES = ["Open", "In Progress", "Fixed", "Verified", "Ignored", "Won't Fix"];
  const SEVERITIES = ["Low", "Medium", "High", "Critical"];
  const CATEGORIES = ["Visual", "Layout", "Component", "Gameplay / Functional Bug", "Performance"];
  const PREVIEW_PRESETS = {
    desktop: { label: "1440 × 900", width: 1440, height: 900 },
    phone: { label: "844 × 390", width: 844, height: 390 },
    smallPhone: { label: "667 × 375", width: 667, height: 375 },
  };

  const state = {
    context: null,
    qa: { schemaVersion: 1, issues: [] },
    selectedIssueId: "",
    dirty: false,
    uiDirty: false,
    qaLoadError: "",
    globalDirty: false,
    logs: [],
    currentMode: "world",
    previewPresets: { component: "desktop", screen: "desktop" },
    selectedThemeToken: "",
    selectedComponent: null,
  };
  let notifyDirty = () => {};
  let notifyStatus = () => {};

  const elements = {};
  const clone = value => JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function cacheElements() {
    Object.assign(elements, {
      projectName: document.getElementById("studioProjectName"),
      branchName: document.getElementById("studioBranchName"),
      dirtyChip: document.getElementById("studioDirtyChip"),
      dirtyValue: document.getElementById("studioDirtyValue"),
      openProject: document.getElementById("openProjectBtn"),
      worldSubnav: document.getElementById("worldSubnav"),
      uiSubnav: document.getElementById("uiStudioSubnav"),
      logSummary: document.getElementById("studioLogSummary"),
      logList: document.getElementById("studioLogList"),
      clearLog: document.getElementById("clearStudioLogBtn"),
      qaList: document.getElementById("qaIssueList"),
      qaForm: document.getElementById("qaIssueForm"),
      qaStatusFilter: document.getElementById("qaStatusFilter"),
      qaCategoryFilter: document.getElementById("qaCategoryFilter"),
      qaSearch: document.getElementById("qaSearchInput"),
      qaAdd: document.getElementById("qaAddIssueBtn"),
      qaOpen: document.getElementById("qaOpenCount"),
      qaProgress: document.getElementById("qaProgressCount"),
      qaVerified: document.getElementById("qaVerifiedCount"),
      componentFrame: document.getElementById("componentPreviewFrame"),
      screenFrame: document.getElementById("screenPreviewFrame"),
      screenSelect: document.getElementById("screenPreviewSelect"),
    });
  }

  function updateDirtyIndicator() {
    const dirty = Boolean(state.globalDirty || state.dirty || state.uiDirty);
    elements.dirtyChip.dataset.dirty = String(dirty);
    elements.dirtyValue.textContent = dirty ? "Yes" : "No";
    window.crownlandsDesktop?.updateDirty?.(dirty);
  }

  function markDirty(message = "QA issue changed.") {
    state.dirty = true;
    updateDirtyIndicator();
    notifyDirty(message);
  }

  function log(message, kind = "", details = "") {
    const text = String(message || "").trim();
    if (!text) return;
    const previous = state.logs.at(-1);
    if (previous && previous.message === text && previous.kind === kind && Date.now() - previous.at < 500) return;
    state.logs.push({ at: Date.now(), message: text, kind, details: String(details || "") });
    if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200);
    renderLog();
  }

  function renderLog() {
    if (!elements.logList) return;
    elements.logSummary.textContent = `${state.logs.length} operation${state.logs.length === 1 ? "" : "s"}`;
    elements.logList.innerHTML = state.logs.slice().reverse().map(entry => {
      const time = new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const title = entry.details ? ` title="${escapeHtml(entry.details)}"` : "";
      return `<li data-kind="${escapeHtml(entry.kind)}"${title}><time>${escapeHtml(time)}</time>${escapeHtml(entry.message)}</li>`;
    }).join("");
  }

  function modeChanged(mode) {
    state.currentMode = mode;
    const area = mode === "economy" ? "balance" : ["theme", "components", "screens", "gameui"].includes(mode) ? "ui" : mode === "qa" ? "qa" : mode === "codex" ? "codex" : "world";
    document.querySelectorAll("[data-studio-area]").forEach(button => button.classList.toggle("active", button.dataset.studioArea === area));
    elements.worldSubnav.hidden = area !== "world";
    elements.uiSubnav.hidden = area !== "ui";
    document.querySelectorAll("#worldSubnav .tool-btn, #uiStudioSubnav .tool-btn").forEach(button => {
      const buttonMode = button.id === "worldModeBtn" ? "world"
        : button.id === "regionModeBtn" ? "region"
          : button.id === "themeModeBtn" ? "theme"
            : button.id === "componentsModeBtn" ? "components"
              : button.id === "screensModeBtn" ? "screens" : "gameui";
      button.classList.toggle("active", buttonMode === mode);
    });
  }

  async function loadContext() {
    const response = await fetch(CONTEXT_API, { cache: "no-store" });
    if (!response.ok) throw new Error(`Project context failed: ${response.status}`);
    state.context = await response.json();
    elements.projectName.textContent = state.context.projectName || "Crownlands";
    elements.projectName.title = state.context.projectRoot || "";
    elements.branchName.textContent = state.context.branch || "Not a Git branch";
    log(`Project opened: ${state.context.projectName || "Crownlands"}`, "success", state.context.projectRoot || "");
  }

  async function loadQa() {
    const response = await fetch(QA_API, { cache: "no-store" });
    if (!response.ok) throw new Error(`QA issues failed: ${response.status}`);
    state.qa = await response.json();
    state.selectedIssueId = state.qa.issues[0]?.id || "";
    state.dirty = false;
    renderQa();
    updateDirtyIndicator();
    log(`Loaded ${state.qa.issues.length} QA issues.`, "success");
  }

  function selectedIssue() {
    return state.qa.issues.find(issue => issue.id === state.selectedIssueId) || null;
  }

  function filteredIssues() {
    const status = elements.qaStatusFilter.value;
    const category = elements.qaCategoryFilter.value;
    const query = elements.qaSearch.value.trim().toLowerCase();
    return state.qa.issues.filter(issue => {
      if (status !== "all" && issue.status !== status) return false;
      if (category !== "all" && !issue.categories.includes(category)) return false;
      if (query && !`${issue.title} ${issue.affected} ${issue.component} ${issue.description} ${issue.expected}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function renderQaSummary() {
    elements.qaOpen.textContent = state.qa.issues.filter(issue => issue.status === "Open").length;
    elements.qaProgress.textContent = state.qa.issues.filter(issue => issue.status === "In Progress").length;
    elements.qaVerified.textContent = state.qa.issues.filter(issue => issue.status === "Verified").length;
  }

  function renderQaList() {
    const issues = filteredIssues();
    elements.qaList.innerHTML = issues.length ? issues.map(issue => `
      <button class="qa-issue-card ${issue.id === state.selectedIssueId ? "active" : ""}" type="button" data-qa-issue-id="${escapeHtml(issue.id)}" data-severity="${escapeHtml(issue.severity)}">
        <strong>${escapeHtml(issue.title)}</strong><span>${escapeHtml(issue.status)}</span>
        <small>${escapeHtml(issue.severity)} · ${escapeHtml(issue.categories.join(" / "))} · ${escapeHtml(issue.affected)}</small>
      </button>`).join("") : `<div class="qa-empty-list">No issues match these filters.</div>`;
  }

  function renderQaForm() {
    const issue = selectedIssue();
    if (!issue) {
      elements.qaForm.innerHTML = `<div class="qa-empty-state">Select an issue to view its structured context.</div>`;
      return;
    }
    elements.qaForm.innerHTML = `
      <label class="wide">Title<input data-qa-field="title" value="${escapeHtml(issue.title)}" maxlength="160" /></label>
      <label>Severity<select data-qa-field="severity">${SEVERITIES.map(value => `<option ${issue.severity === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Status<select data-qa-field="status">${STATUSES.map(value => `<option ${issue.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label class="wide">Categories<div class="qa-category-checks">${CATEGORIES.map(value => `<label><input type="checkbox" data-qa-category="${escapeHtml(value)}" ${issue.categories.includes(value) ? "checked" : ""} />${escapeHtml(value)}</label>`).join("")}</div></label>
      <label>Affected screen / area<input data-qa-field="affected" value="${escapeHtml(issue.affected)}" maxlength="180" /></label>
      <label>Component<input data-qa-field="component" value="${escapeHtml(issue.component)}" maxlength="160" /></label>
      <label class="wide">Description<textarea data-qa-field="description" maxlength="5000">${escapeHtml(issue.description)}</textarea></label>
      <label class="wide">Expected behavior<textarea data-qa-field="expected" maxlength="3000">${escapeHtml(issue.expected)}</textarea></label>
      <label class="wide">Notes<textarea data-qa-field="notes" maxlength="10000">${escapeHtml(issue.notes)}</textarea></label>
      <label class="wide">Relevant files <small>One project-relative path per line</small><textarea data-qa-field="relevantFiles" maxlength="9600">${escapeHtml(issue.relevantFiles.join("\n"))}</textarea></label>
      <div class="qa-form-actions"><button id="qaFixWithCodexBtn" class="tool-btn primary" type="button">Fix with Codex</button><button id="qaDeleteIssueBtn" class="danger" type="button">Delete Issue</button></div>`;
  }

  function renderQa() {
    renderQaSummary();
    renderQaList();
    renderQaForm();
  }

  function addQaIssue() {
    const now = new Date().toISOString();
    let suffix = state.qa.issues.length + 1;
    let id = `qa-new-issue-${suffix}`;
    while (state.qa.issues.some(issue => issue.id === id)) id = `qa-new-issue-${++suffix}`;
    state.qa.issues.unshift({
      id, title: "New QA issue", categories: ["Visual"], affected: "Unspecified", component: "",
      description: "", expected: "", severity: "Medium", status: "Open", notes: "", relevantFiles: [],
      createdAt: now, updatedAt: now,
    });
    state.selectedIssueId = id;
    markDirty("New QA issue created.");
    renderQa();
    window.setTimeout(() => elements.qaForm.querySelector("[data-qa-field='title']")?.select(), 0);
  }

  function updateQaField(target) {
    const issue = selectedIssue();
    if (!issue) return;
    if (target.dataset.qaCategory) {
      const categories = [...elements.qaForm.querySelectorAll("[data-qa-category]:checked")].map(input => input.dataset.qaCategory);
      issue.categories = categories.length ? categories : ["Visual"];
    } else if (target.dataset.qaField) {
      const field = target.dataset.qaField;
      issue[field] = field === "relevantFiles" ? target.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) : target.value;
    } else return;
    issue.updatedAt = new Date().toISOString();
    markDirty();
    renderQaSummary();
    renderQaList();
  }

  function deleteSelectedIssue() {
    const issue = selectedIssue();
    if (!issue || !window.confirm(`Delete QA issue “${issue.title}”?`)) return;
    state.qa.issues = state.qa.issues.filter(entry => entry.id !== issue.id);
    state.selectedIssueId = state.qa.issues[0]?.id || "";
    markDirty("QA issue deleted.");
    renderQa();
  }

  async function save() {
    if (state.qaLoadError) throw new Error(`${state.qaLoadError} Reload or reopen the project before saving QA records.`);
    if (!state.dirty) return { ok: true, unchanged: true };
    const response = await fetch(QA_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.qa),
    });
    if (!response.ok) throw new Error((await response.text()) || `QA save failed: ${response.status}`);
    state.qa = await response.json();
    state.dirty = false;
    renderQa();
    updateDirtyIndicator();
    log("Saved QA issue store.", "success");
    return { ok: true, issues: state.qa.issues.length };
  }

  function setPreviewPreset(target, presetId) {
    const preset = PREVIEW_PRESETS[presetId] || PREVIEW_PRESETS.desktop;
    const frame = document.getElementById(target === "component" ? "componentPreviewFrame" : "screenPreviewFrame");
    const label = document.getElementById(target === "component" ? "componentViewportLabel" : "screenViewportLabel");
    frame.style.width = `${preset.width}px`;
    frame.style.height = `${preset.height}px`;
    label.textContent = preset.label;
    document.querySelectorAll(`[data-preview-target="${target}"]`).forEach(button => button.classList.toggle("active", button.dataset.previewPreset === presetId));
    state.previewPresets[target] = presetId;
    log(`${target === "component" ? "Component" : "Screen"} preview resized to ${preset.label}.`);
  }

  function sourceList(value) {
    return String(value || "").split(",").map(file => file.trim()).filter(Boolean);
  }

  function getSelectionContext(kind = state.currentMode) {
    if (kind === "qa" || kind === "qa-issue") {
      const issue = selectedIssue();
      return issue ? { area: "QA", qaIssueId: issue.id, qaIssue: clone(issue), screen: issue.affected, component: issue.component, relevantFiles: clone(issue.relevantFiles), previewPreset: state.previewPresets.screen } : { area: "QA" };
    }
    if (kind === "theme") {
      return { area: "UI Studio / Theme", themeToken: state.selectedThemeToken || "Theme token registry", sourceFiles: ["interface-theme.css", "styles.css"], previewPreset: state.previewPresets.component };
    }
    if (kind === "component" || kind === "components") {
      const inspector = window.CrownlandsUIInspector?.getSelectionContext?.();
      if (inspector?.component) return inspector;
      return {
        area: "UI Studio / Components",
        component: state.selectedComponent?.name || "Component Library",
        selector: state.selectedComponent?.selector || "[data-ai-component]",
        sourceFiles: state.selectedComponent?.sourceFiles || ["styles.css", "interface-theme.css", "tools/map-editor/component-preview.html"],
        componentHierarchy: state.selectedComponent?.hierarchy || [],
        previewPreset: state.previewPresets.component,
      };
    }
    if (kind === "screen" || kind === "screens") {
      const inspector = window.CrownlandsUIInspector?.getSelectionContext?.();
      if (inspector?.screen) return inspector;
      const option = elements.screenSelect?.selectedOptions?.[0];
      return { area: "UI Studio / Screens", screen: option?.textContent || "Crownlands Game Shell", sourceFiles: ["index.html", "styles.css", "interface-theme.css", "tools/map-editor/screen-preview.html"], previewPreset: state.previewPresets.screen };
    }
    if (kind === "hud" || kind === "gameui") {
      return { area: "UI Studio / HUD Layout", ...(window.CrownlandsHudEditor?.getSelectionContext?.() || {}), sourceFiles: ["ui-layout-config.js", "tools/map-editor/hud-editor.js", "tools/map-editor/styles.css"] };
    }
    return { area: kind || "Crownlands Studio" };
  }

  function openCodex(context, prompt = "") {
    window.CrownlandsEditor?.setMode?.("codex");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("crownlands:ai-task", { detail: { context: clone(context), prompt } })), 0);
  }

  function selectThemeToken(article) {
    document.querySelectorAll(".theme-token-grid article").forEach(token => token.classList.toggle("ai-context-selected", token === article));
    state.selectedThemeToken = article?.querySelector("strong")?.textContent?.trim() || article?.dataset.token || "";
  }

  function bindComponentSelection() {
    const frameDocument = elements.componentFrame?.contentDocument;
    if (!frameDocument) return;
    frameDocument.addEventListener("click", event => {
      const target = event.target.closest("[data-ai-component]");
      if (!target) return;
      frameDocument.querySelectorAll("[data-ai-component]").forEach(node => node.classList.toggle("ai-context-selected", node === target));
      state.selectedComponent = {
        name: target.dataset.aiComponent,
        selector: `[data-ai-component="${target.dataset.aiComponent}"]`,
        sourceFiles: [...sourceList(target.dataset.aiFiles), "tools/map-editor/component-preview.html"],
        hierarchy: [...target.querySelectorAll("h2, button, .panel-header")].slice(0, 30).map(node => node.textContent.trim()).filter(Boolean),
      };
    });
  }

  function markQaTaskApplied(issueId, taskId) {
    const issue = state.qa.issues.find(entry => entry.id === issueId);
    if (!issue) return;
    issue.status = "Fixed";
    issue.notes = `${issue.notes ? `${issue.notes}\n` : ""}AI task ${taskId} applied. Needs verification.`;
    issue.updatedAt = new Date().toISOString();
    state.selectedIssueId = issue.id;
    markDirty("QA issue marked Fixed — needs verification after AI task apply.");
    renderQa();
  }

  function bindEvents() {
    elements.openProject.addEventListener("click", () => {
      if (window.crownlandsDesktop?.openProject) window.crownlandsDesktop.openProject();
      else {
        notifyStatus("Open Project is available in the Crownlands Studio desktop application.", "error");
        log("Open Project requested outside the desktop shell.", "error");
      }
    });
    elements.clearLog.addEventListener("click", () => { state.logs = []; renderLog(); });
    elements.qaList.addEventListener("click", event => {
      const card = event.target.closest("[data-qa-issue-id]");
      if (!card) return;
      state.selectedIssueId = card.dataset.qaIssueId;
      renderQa();
    });
    elements.qaForm.addEventListener("input", event => updateQaField(event.target));
    elements.qaForm.addEventListener("change", event => updateQaField(event.target));
    elements.qaForm.addEventListener("click", event => {
      if (event.target.id === "qaDeleteIssueBtn") { event.preventDefault(); deleteSelectedIssue(); }
      if (event.target.id === "qaFixWithCodexBtn") {
        event.preventDefault();
        const issue = selectedIssue();
        if (issue) openCodex(getSelectionContext("qa"), `Fix this QA issue and run the relevant regression validation: ${issue.title}. ${issue.description} Expected: ${issue.expected}`);
      }
    });
    elements.qaStatusFilter.addEventListener("change", renderQaList);
    elements.qaCategoryFilter.addEventListener("change", renderQaList);
    elements.qaSearch.addEventListener("input", renderQaList);
    elements.qaAdd.addEventListener("click", addQaIssue);
    document.querySelectorAll("[data-preview-target]").forEach(button => button.addEventListener("click", () => setPreviewPreset(button.dataset.previewTarget, button.dataset.previewPreset)));
    document.querySelector(".theme-token-grid")?.addEventListener("click", event => {
      const article = event.target.closest("article[data-token]");
      if (article) selectThemeToken(article);
    });
    elements.componentFrame?.addEventListener("load", bindComponentSelection);
    document.querySelectorAll("[data-ask-codex]").forEach(button => button.addEventListener("click", () => openCodex(getSelectionContext(button.dataset.askCodex))));
  }

  async function init(options = {}) {
    notifyDirty = options.onDirty || notifyDirty;
    notifyStatus = options.onStatus || notifyStatus;
    cacheElements();
    bindEvents();
    updateDirtyIndicator();
    renderLog();
    const results = await Promise.allSettled([loadContext(), loadQa()]);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const message = result.reason?.message || String(result.reason);
        if (index === 1) state.qaLoadError = `QA issue store could not be loaded: ${message}`;
        notifyStatus(message, "error");
        log(message, "error", result.reason?.stack || "");
      }
    });
  }

  window.CrownlandsStudioUI = {
    init,
    save,
    log,
    modeChanged,
    isDirty: () => Boolean(state.dirty || state.uiDirty),
    isQaDirty: () => state.dirty,
    hasLoadError: () => Boolean(state.qaLoadError),
    setGlobalDirty(value) { state.globalDirty = Boolean(value); updateDirtyIndicator(); },
    setUiDirty(value) { state.uiDirty = Boolean(value); updateDirtyIndicator(); },
    getQaStore: () => clone(state.qa),
    getSelectionContext,
    openCodex,
    markQaTaskApplied,
  };
})();
