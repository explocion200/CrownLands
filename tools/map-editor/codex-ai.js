(function () {
  "use strict";

  const api = window.crownlandsDesktop?.ai || null;
  const state = {
    tasks: [],
    currentId: "",
    context: {},
    capabilities: null,
    settings: null,
    busy: false,
  };
  const elements = {};
  const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const clone = value => JSON.parse(JSON.stringify(value));

  function cacheElements() {
    Object.assign(elements, {
      runtimeStatus: document.getElementById("codexRuntimeStatus"),
      runtimeDetail: document.getElementById("codexRuntimeDetail"),
      activeCount: document.getElementById("codexActiveCount"),
      reviewCount: document.getElementById("codexReviewCount"),
      historyCount: document.getElementById("codexHistoryCount"),
      newTask: document.getElementById("codexNewTaskBtn"),
      historySearch: document.getElementById("codexHistorySearch"),
      history: document.getElementById("codexTaskHistory"),
      form: document.getElementById("codexTaskForm"),
      prompt: document.getElementById("codexTaskPrompt"),
      contextTitle: document.getElementById("codexContextTitle"),
      contextSummary: document.getElementById("codexContextSummary"),
      clearContext: document.getElementById("codexClearContextBtn"),
      agent: document.getElementById("codexAgentSelect"),
      permission: document.getElementById("codexPermissionSelect"),
      model: document.getElementById("codexModelOverride"),
      screenshot: document.getElementById("codexIncludeScreenshot"),
      includeDiff: document.getElementById("codexIncludeDiff"),
      formMessage: document.getElementById("codexFormMessage"),
      detail: document.getElementById("codexTaskDetail"),
      status: document.getElementById("codexTaskStatus"),
      title: document.getElementById("codexTaskTitle"),
      backToNew: document.getElementById("codexBackToNewBtn"),
      classification: document.getElementById("codexClassification"),
      planSummary: document.getElementById("codexPlanSummary"),
      planFiles: document.getElementById("codexPlanFiles"),
      planTests: document.getElementById("codexPlanTests"),
      planSafety: document.getElementById("codexPlanSafety"),
      subtasksPanel: document.getElementById("codexSubtasksPanel"),
      subtaskList: document.getElementById("codexSubtaskList"),
      actions: document.getElementById("codexTaskActions"),
      actionMessage: document.getElementById("codexActionMessage"),
      result: document.getElementById("codexResultPanel"),
      resultSummary: document.getElementById("codexResultSummary"),
      validations: document.getElementById("codexValidationResults"),
      diffPanel: document.getElementById("codexDiffPanel"),
      diffFiles: document.getElementById("codexDiffFiles"),
      diffContent: document.getElementById("codexDiffContent"),
      taskLog: document.getElementById("codexTaskLog"),
      routingForm: document.getElementById("codexRoutingForm"),
      fallbackModel: document.getElementById("codexFallbackModel"),
      autoEscalation: document.getElementById("codexAutoEscalation"),
      routingMessage: document.getElementById("codexRoutingMessage"),
    });
  }

  function currentTask() {
    return state.tasks.find(task => task.id === state.currentId) || null;
  }

  function readableStatus(value) {
    return String(value || "").split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }

  function cleanError(error) {
    return String(error?.message || error || "Unknown error").replace(/^Error invoking remote method '[^']+': Error:\s*/i, "");
  }

  function setMessage(message, kind = "") {
    elements.formMessage.textContent = message;
    elements.formMessage.dataset.kind = kind;
  }

  function setActionMessage(message, kind = "") {
    elements.actionMessage.textContent = message;
    elements.actionMessage.dataset.kind = kind;
  }

  function renderDashboard() {
    elements.activeCount.textContent = String(state.tasks.filter(task => task.status === "running").length);
    elements.reviewCount.textContent = String(state.tasks.filter(task => ["passed", "needs-review", "failed"].includes(task.status)).length);
    elements.historyCount.textContent = String(state.tasks.length);
  }

  function renderHistory() {
    const query = elements.historySearch.value.trim().toLowerCase();
    const tasks = state.tasks.filter(task => !query || `${task.title} ${task.prompt} ${task.route?.agentLabel} ${task.route?.role} ${task.status}`.toLowerCase().includes(query));
    elements.history.innerHTML = tasks.length ? tasks.map(task => {
      const date = new Date(task.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return `<button class="codex-history-card ${task.id === state.currentId ? "active" : ""}" type="button" data-task-id="${escapeHtml(task.id)}"><span>${escapeHtml(readableStatus(task.status))} · ${escapeHtml(task.route?.agentLabel || "Agent")}</span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(date)} · ${escapeHtml(task.route?.configuredModel || task.route?.role || "Auto")}</small></button>`;
    }).join("") : `<div class="codex-empty">No tasks match this filter.</div>`;
  }

  function contextDescription(context = state.context) {
    const labels = [];
    if (context.area) labels.push(context.area);
    if (context.screen) labels.push(`Screen: ${context.screen}`);
    if (context.component) labels.push(`Component: ${context.component}`);
    if (context.themeToken) labels.push(`Token: ${context.themeToken}`);
    if (context.hudSelection?.length) labels.push(`HUD: ${context.hudSelection.map(item => item.label || item.id).join(", ")}`);
    if (context.qaIssue?.title) labels.push(`QA: ${context.qaIssue.title}`);
    if (context.previewPreset) labels.push(`Viewport: ${context.previewPreset}`);
    return labels.join(" · ") || "No specific component, screen, HUD item, theme token, or QA issue is selected.";
  }

  function renderContext() {
    const context = state.context;
    elements.contextTitle.textContent = context.qaIssue?.title || context.component || context.screen || context.themeToken || context.area || "Current Studio selection";
    elements.contextSummary.textContent = contextDescription(context);
    elements.screenshot.checked = Boolean(context.screen || context.component || context.themeToken || context.hudSelection?.length || context.qaIssue);
  }

  function renderActions(task) {
    const buttons = [];
    const add = (action, label, className = "", disabled = false) => buttons.push(`<button type="button" data-ai-action="${action}" class="${className}" ${disabled ? "disabled" : ""}>${label}</button>`);
    if (task.status === "planned") {
      add("run", task.permission === "review-only" ? "Run Review" : "Run Task", "primary", !state.capabilities?.available);
      add("discard", "Discard", "danger");
    } else if (task.status === "running") {
      add("cancel", "Cancel Task", "danger");
    } else if (["passed", "needs-review"].includes(task.status)) {
      if (task.worktree) {
        add("preview", "Preview Changes");
        add("diff", "View Diff");
        add("apply", "Apply to Project", "primary");
      }
      add("discard", "Discard", "danger");
    } else if (task.status === "failed") {
      if (task.worktree) { add("preview", "Preview Partial Changes"); add("diff", "View Diff"); }
      add("retry", "Retry");
      if (task.route?.role !== "deep") add("escalate", "Retry with Deep", "primary");
      add("discard", "Discard", "danger");
    } else if (task.status === "applied") {
      if (task.worktree) { add("preview", "Preview Worktree"); add("diff", "View Applied Diff"); }
    }
    elements.actions.innerHTML = buttons.join("");
  }

  function renderValidations(task) {
    elements.validations.innerHTML = (task.tests || []).length ? task.tests.map(result => `<article data-status="${escapeHtml(result.status)}"><strong>${result.status === "passed" ? "PASS" : "FAIL"}</strong><span>${escapeHtml(result.name)}</span>${result.output ? `<small>${escapeHtml(result.output)}</small>` : ""}</article>`).join("") : `<div class="codex-empty">Validation evidence appears after execution.</div>`;
  }

  function renderTaskLog(task) {
    elements.taskLog.innerHTML = (task.events || []).slice().reverse().map(event => {
      const time = new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `<li title="${escapeHtml(event.details || "")}"><time>${escapeHtml(time)}</time><b>${escapeHtml(event.kind)}</b><span>${escapeHtml(event.message)}</span></li>`;
    }).join("");
  }

  function renderTask() {
    const task = currentTask();
    if (!task) {
      elements.form.classList.remove("hidden");
      elements.detail.classList.add("hidden");
      return;
    }
    elements.form.classList.add("hidden");
    elements.detail.classList.remove("hidden");
    elements.status.textContent = readableStatus(task.status);
    elements.title.textContent = task.title;
    const route = task.route || {};
    elements.classification.innerHTML = [
      route.category, route.agentLabel, `Role: ${route.role}`, `Model: ${task.execution?.modelUsed || route.configuredModel}`,
      `Complexity: ${route.complexity}`, `Risk: ${route.risk}`, `Permission: ${task.permission}`,
    ].filter(Boolean).map(value => `<span ${String(value).startsWith("Risk:") ? `data-risk="${escapeHtml(route.risk)}"` : ""}>${escapeHtml(value)}</span>`).join("");
    elements.planSummary.innerHTML = `<p>${escapeHtml(task.plan?.summary || task.prompt)}</p><p><strong>Systems:</strong> ${escapeHtml((task.plan?.systemsAffected || []).join(" · "))}</p>`;
    elements.planFiles.innerHTML = (task.plan?.expectedFiles || []).map(file => `<li>${escapeHtml(file)}</li>`).join("");
    elements.planTests.innerHTML = (task.plan?.validations || []).map(test => `<li>${escapeHtml(test)}</li>`).join("");
    elements.planSafety.innerHTML = `<p>${task.plan?.backendImpact ? "Backend/data may be affected; review is high priority." : "No backend/data impact detected."}</p><p>${task.plan?.gameplayImpact ? "Gameplay behavior may be affected." : "No gameplay change is intended."}</p><p>No merge, push, deploy, production mutation, or secret access.</p>`;
    const subtasks = task.plan?.subtasks || [];
    elements.subtasksPanel.hidden = !subtasks.length;
    elements.subtaskList.innerHTML = subtasks.map(subtask => `<li><strong>${escapeHtml(subtask.title)}</strong> — ${escapeHtml(subtask.agent)} / ${escapeHtml(subtask.role)}${subtask.dependsOn.length ? ` · after ${escapeHtml(subtask.dependsOn.join(", "))}` : ""}</li>`).join("");
    renderActions(task);
    const hasResult = task.status !== "planned" && task.status !== "running";
    elements.result.classList.toggle("hidden", !hasResult);
    if (hasResult) {
      const usage = task.execution?.usage;
      const usageText = usage ? `\nUsage: ${Number(usage.input_tokens || 0).toLocaleString()} input · ${Number(usage.output_tokens || 0).toLocaleString()} output · ${Number(usage.reasoning_output_tokens || 0).toLocaleString()} reasoning tokens` : "";
      const fallback = task.execution?.fallbackNotice ? `\n${task.execution.fallbackNotice}` : "";
      const error = task.execution?.error ? `\n\nFailure: ${task.execution.error}` : "";
      elements.resultSummary.textContent = `${task.execution?.finalResponse || "No final agent message was returned."}${usageText}${fallback}${error}`;
      renderValidations(task);
    }
    renderTaskLog(task);
  }

  function render() {
    renderDashboard();
    renderHistory();
    renderTask();
  }

  function replaceTask(task) {
    const index = state.tasks.findIndex(entry => entry.id === task.id);
    if (index >= 0) state.tasks[index] = task;
    else state.tasks.unshift(task);
    state.tasks.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    if (["passed", "failed", "applied", "discarded"].includes(task.status)) setActionMessage("");
    render();
    if (["passed", "failed", "applied", "discarded"].includes(task.status)) {
      window.CrownlandsStudioUI?.log?.(`AI task ${readableStatus(task.status).toLowerCase()}: ${task.title}`, task.status === "failed" ? "error" : "success");
    }
  }

  async function planTask(event) {
    event.preventDefault();
    if (!api || state.busy) return;
    state.busy = true;
    setMessage("Classifying and preparing the task plan…");
    try {
      let task = await api.planTask({
        prompt: elements.prompt.value,
        context: clone(state.context),
        permission: elements.permission.value,
        agent: elements.agent.value,
        model: elements.model.value.trim(),
        includeScreenshot: elements.screenshot.checked,
        includeCurrentDiff: elements.includeDiff.checked,
      });
      if (elements.screenshot.checked) {
        try { task = await api.captureContext(task.id); }
        catch (error) { window.CrownlandsStudioUI?.log?.(`AI screenshot context unavailable: ${cleanError(error)}`, "error"); }
      }
      state.currentId = task.id;
      setActionMessage("");
      replaceTask(task);
      setMessage("");
    } catch (error) {
      setMessage(cleanError(error), "error");
    } finally {
      state.busy = false;
    }
  }

  async function showDiff(taskId) {
    const diff = await api.getDiff(taskId);
    elements.diffPanel.classList.remove("hidden");
    elements.diffFiles.innerHTML = diff.files.length ? diff.files.map(file => `<span>${escapeHtml(file.status)} ${escapeHtml(file.path)}</span>`).join("") : `<span>No changed files</span>`;
    elements.diffContent.textContent = diff.patch || diff.message || "No diff available.";
    elements.diffPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runAction(action) {
    const task = currentTask();
    if (!task || !api || (state.busy && action !== "cancel")) return;
    setActionMessage("");
    try {
      if (action === "run") {
        state.busy = true;
        setActionMessage("Checking the project and starting the isolated task…", "busy");
        api.runTask(task.id).then(updated => {
          setActionMessage("");
          replaceTask(updated);
        }, error => {
          const message = cleanError(error);
          setActionMessage(message, "error");
          window.CrownlandsStudioUI?.log?.(`AI task could not start: ${message}`, "error");
        }).finally(() => { state.busy = false; });
      } else if (action === "cancel") {
        replaceTask(await api.cancelTask(task.id));
        setActionMessage("Cancellation requested. Waiting for the local Codex process to stop safely…", "busy");
      } else if (action === "diff") {
        await showDiff(task.id);
      } else if (action === "preview") {
        await api.previewTask(task.id);
      } else if (action === "apply") {
        const updated = await api.applyTask(task.id);
        replaceTask(updated);
        if (updated.context?.qaIssue?.id) window.CrownlandsStudioUI?.markQaTaskApplied?.(updated.context.qaIssue.id, updated.id);
      } else if (action === "discard") {
        replaceTask(await api.discardTask(task.id));
      } else if (action === "retry" || action === "escalate") {
        state.busy = true;
        setActionMessage("Checking the project and restarting the isolated task…", "busy");
        api.retryTask(task.id, action === "escalate").then(updated => {
          setActionMessage("");
          replaceTask(updated);
        }, error => {
          const message = cleanError(error);
          setActionMessage(message, "error");
          window.CrownlandsStudioUI?.log?.(`AI task could not restart: ${message}`, "error");
        }).finally(() => { state.busy = false; });
      }
    } catch (error) {
      const message = cleanError(error);
      setActionMessage(message, "error");
      window.CrownlandsStudioUI?.log?.(`AI action failed: ${message}`, "error");
    }
  }

  function renderSettings() {
    if (!state.settings) return;
    document.querySelectorAll("[data-model-role]").forEach(input => { input.value = state.settings.modelRoles[input.dataset.modelRole] || ""; });
    elements.fallbackModel.value = state.settings.fallbackModel || "";
    elements.autoEscalation.checked = state.settings.autoEscalation !== false;
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!api || !state.settings) return;
    try {
      const modelRoles = {};
      document.querySelectorAll("[data-model-role]").forEach(input => { modelRoles[input.dataset.modelRole] = input.value.trim(); });
      state.settings = await api.saveSettings({ ...state.settings, modelRoles, fallbackModel: elements.fallbackModel.value.trim(), autoEscalation: elements.autoEscalation.checked });
      elements.routingMessage.textContent = "Routing saved.";
      window.setTimeout(() => { elements.routingMessage.textContent = ""; }, 1800);
    } catch (error) {
      elements.routingMessage.textContent = cleanError(error);
    }
  }

  function showNewTask() {
    state.currentId = "";
    setActionMessage("");
    elements.diffPanel.classList.add("hidden");
    render();
    elements.prompt.focus();
  }

  function setContext(context, prompt = "") {
    state.context = context && typeof context === "object" ? clone(context) : {};
    if (prompt) elements.prompt.value = prompt;
    renderContext();
    showNewTask();
  }

  function bindEvents() {
    elements.form.addEventListener("submit", planTask);
    elements.newTask.addEventListener("click", showNewTask);
    elements.backToNew.addEventListener("click", showNewTask);
    elements.clearContext.addEventListener("click", () => setContext({}));
    elements.historySearch.addEventListener("input", renderHistory);
    elements.history.addEventListener("click", event => {
      const card = event.target.closest("[data-task-id]");
      if (!card) return;
      state.currentId = card.dataset.taskId;
      setActionMessage("");
      elements.diffPanel.classList.add("hidden");
      render();
    });
    elements.actions.addEventListener("click", event => {
      const button = event.target.closest("[data-ai-action]");
      if (button) runAction(button.dataset.aiAction);
    });
    elements.routingForm.addEventListener("submit", saveSettings);
    window.addEventListener("crownlands:ai-task", event => setContext(event.detail?.context || {}, event.detail?.prompt || ""));
  }

  async function init() {
    cacheElements();
    bindEvents();
    renderContext();
    if (!api) {
      elements.runtimeStatus.textContent = "Desktop app required";
      elements.runtimeDetail.textContent = "Planning and execution use hardened Electron IPC and are unavailable in a normal browser tab.";
      elements.form.querySelector("button[type='submit']").disabled = true;
      render();
      return;
    }
    api.onTaskUpdated(replaceTask);
    const [capabilities, tasks, settings] = await Promise.all([api.getCapabilities(), api.listTasks(), api.getSettings()]);
    state.capabilities = capabilities;
    state.tasks = tasks;
    state.settings = settings;
    elements.runtimeStatus.textContent = capabilities.available ? "Local Codex ready" : "Codex runtime unavailable";
    elements.runtimeDetail.textContent = capabilities.available
      ? `SDK ${capabilities.sdkVersion} · authentication checked when a task runs · network disabled in task sandbox`
      : capabilities.error || "Install or repair the local Codex SDK runtime.";
    renderSettings();
    render();
  }

  window.CrownlandsCodexAI = { init, setContext, getTasks: () => clone(state.tasks) };
})();
