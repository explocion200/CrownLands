"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createProjectFileService } = require("../project-file-service");
const { DEFAULT_ROUTING_SETTINGS, MODEL_ROLES, PERMISSIONS } = require("./constants");
const { CodexRunner, isModelUnavailable } = require("./codex-runner");
const { GitWorktreeService } = require("./git-worktree-service");
const { validateRoutingSettings, validateTaskInput } = require("./ipc-schema");
const { redactSecrets } = require("./redact");
const { TaskStore } = require("./task-store");
const { buildPlan, routeTask } = require("./task-router");
const { ValidationService } = require("./validation-service");

const clone = value => JSON.parse(JSON.stringify(value));

function makeTaskId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14).toLowerCase();
  return `task-${stamp}-${crypto.randomBytes(4).toString("hex")}`;
}

function taskTitle(prompt) {
  const first = String(prompt || "").replace(/\s+/g, " ").trim();
  return first.length > 88 ? `${first.slice(0, 85)}…` : first;
}

function eventMessage(event) {
  if (event.type === "thread.started") return ["thread", "Codex thread started.", event.threadId];
  if (event.type === "command") return [event.exitCode === 0 ? "command" : "error", `Command ${event.exitCode === 0 ? "completed" : "failed"}: ${event.command}`, event.output];
  if (event.type === "file-change") return [event.status === "completed" ? "change" : "error", `${event.changes.length} file change${event.changes.length === 1 ? "" : "s"} reported by Codex.`, JSON.stringify(event.changes)];
  if (event.type === "agent-message") return ["message", "Codex returned a task report.", event.text];
  if (event.type === "todo") return ["progress", "Codex updated its implementation plan.", JSON.stringify(event.items)];
  if (event.type === "turn.completed") return ["usage", "Codex turn completed.", JSON.stringify(event.usage || {})];
  return ["error", "Codex reported an error.", event.error || ""];
}

class AiWorkspaceService extends EventEmitter {
  constructor(projectRoot, options = {}) {
    super();
    this.projectRoot = path.resolve(projectRoot);
    this.projectFiles = options.projectFiles || createProjectFileService(this.projectRoot, {
      readPrefixes: [".crownlands-studio/ai"],
      writePrefixes: [".crownlands-studio/ai"],
      backupRoot: ".crownlands-studio/backups/ai",
    });
    this.store = options.store || new TaskStore(this.projectFiles, options);
    this.git = options.git || new GitWorktreeService(this.projectRoot, { taskRoot: options.taskRoot });
    this.runner = options.runner || new CodexRunner(options);
    this.validation = options.validation || new ValidationService(this.git);
    this.dirtyProvider = options.dirtyProvider || (() => false);
    this.activeRuns = new Map();
  }

  async init() {
    await this.store.init();
    return this;
  }

  async notify(taskOrId) {
    const task = typeof taskOrId === "string" ? await this.store.get(taskOrId) : taskOrId;
    this.emit("task-updated", clone(task));
    return task;
  }

  async listTasks() {
    return this.store.list();
  }

  async getTask(taskId) {
    return this.store.get(taskId);
  }

  async getCapabilities() {
    const [runtime, settings] = await Promise.all([this.runner.capabilities(), this.store.getSettings()]);
    return {
      ...runtime,
      permissions: [...PERMISSIONS],
      modelRoles: [...MODEL_ROLES],
      configuredModels: settings.modelRoles,
      isolation: "git-worktree",
      productionActions: "blocked",
      parallelExecution: "schema-ready-v1-single-lead",
    };
  }

  async getSettings() {
    return this.store.getSettings();
  }

  async saveSettings(value) {
    return this.store.saveSettings(validateRoutingSettings(value));
  }

  async planTask(rawInput) {
    const input = validateTaskInput(rawInput);
    const settings = await this.store.getSettings();
    const context = clone(input.context);
    if (input.includeCurrentDiff) context.currentProjectDiff = await this.git.currentDiffStat();
    const routedInput = { ...input, context };
    const route = routeTask(routedInput, settings);
    const now = new Date();
    const id = makeTaskId(now);
    const task = {
      schemaVersion: 1,
      id,
      title: taskTitle(input.prompt),
      prompt: input.prompt,
      permission: input.permission,
      context,
      includeScreenshot: input.includeScreenshot,
      includeCurrentDiff: input.includeCurrentDiff,
      manualAgent: input.agent,
      manualModel: input.model,
      route,
      plan: buildPlan(routedInput, route),
      status: "planned",
      branch: "",
      worktree: "",
      baseCommit: "",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      filesChanged: [],
      tests: [],
      attachments: [],
      execution: { attempts: 0, threadId: "", modelRequested: route.configuredModel, modelUsed: "", fallbackNotice: "", finalResponse: "", usage: null, error: "", lastSuccessfulStep: "Task planned" },
      events: [{ at: now.toISOString(), kind: "router", message: `Task planned: ${route.agentLabel} → ${route.role} (${route.configuredModel})`, details: route.rationale.join(" ") }],
    };
    await this.store.create(task);
    return this.notify(id);
  }

  async attachScreenshot(taskId, pngBuffer) {
    if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 32 || pngBuffer.length > 20 * 1024 * 1024) throw new Error("Screenshot payload is invalid or larger than 20 MB.");
    const relative = `.crownlands-studio/ai/attachments/${taskId}.png`;
    await this.projectFiles.writeAtomic(relative, pngBuffer, { backup: false });
    const absolute = this.projectFiles.resolveRead(relative);
    const updated = await this.store.update(taskId, task => {
      task.attachments = [{ type: "screenshot", path: relative, absolutePath: absolute }];
      task.context = { ...(task.context || {}), screenshotPath: relative };
      task.events.push({ at: new Date().toISOString(), kind: "context", message: "Captured the current Studio view for visual context.", details: relative });
    });
    return this.notify(updated);
  }

  async assertRunnable(task) {
    if (["running", "applied", "discarded"].includes(task.status)) throw new Error(`Task cannot run while its status is ${task.status}.`);
    if (task.permission !== "review-only") {
      if (this.dirtyProvider()) throw new Error("Studio has unsaved editor changes. Save or discard them before starting an isolated AI edit task.");
      if (!(await this.git.isProjectClean())) throw new Error("The active Crownlands project has Git changes. Commit, stash, or clean them before starting an isolated AI edit task.");
    }
  }

  async ensureWorktree(task) {
    if (task.permission === "review-only") return task;
    if (task.worktree && task.branch && task.baseCommit) return task;
    const created = await this.git.create(task.id);
    const updated = await this.store.update(task.id, value => {
      Object.assign(value, created);
      value.execution.lastSuccessfulStep = "Isolated worktree created";
      value.events.push({ at: new Date().toISOString(), kind: "worktree", message: "Created isolated Git worktree.", details: `${created.branch}\n${created.worktree}` });
    });
    return this.notify(updated);
  }

  async recordRunnerEvent(taskId, event) {
    const [kind, message, details] = eventMessage(event);
    const updated = await this.store.update(taskId, task => {
      task.events.push({ at: new Date().toISOString(), kind, message: redactSecrets(message, 3000), details: redactSecrets(details, 12000) });
      task.events = task.events.slice(-300);
      if (event.type === "thread.started") task.execution.threadId = event.threadId;
      if (event.type === "agent-message") task.execution.finalResponse = event.text;
      if (event.type === "turn.completed") task.execution.usage = event.usage;
      if (event.type === "todo") {
        const current = event.items.find(item => !item.completed) || event.items.at(-1);
        if (current) task.execution.lastSuccessfulStep = current.text;
      }
      if (event.type === "command" && /\b(test|check|lint|validat|build|benchmark|profil)/i.test(event.command)) {
        task.tests.push({ name: event.command, status: event.exitCode === 0 ? "passed" : "failed", command: event.command, output: event.output, source: "agent" });
        task.tests = task.tests.slice(-100);
      }
    });
    return this.notify(updated);
  }

  async runTask(taskId, options = {}) {
    if (this.activeRuns.has(taskId)) throw new Error("This task is already running.");
    let task = await this.store.get(taskId);
    await this.assertRunnable(task);
    task = await this.ensureWorktree(task);
    const controller = new AbortController();
    this.activeRuns.set(taskId, controller);
    task = await this.store.update(taskId, value => {
      value.status = "running";
      value.execution.attempts = Number(value.execution.attempts || 0) + 1;
      value.execution.startedAt = new Date().toISOString();
      value.execution.completedAt = "";
      value.execution.error = "";
      value.tests = options.retry ? value.tests : [];
      value.events.push({ at: new Date().toISOString(), kind: "run", message: options.retry ? "Retry started in the preserved task worktree." : "Task execution started.", details: "" });
    });
    await this.notify(task);

    const workingDirectory = task.permission === "review-only" ? this.projectRoot : task.worktree;
    const settings = await this.store.getSettings();
    const requested = options.model || task.route.configuredModel;
    const candidates = [requested];
    if (settings.fallbackModel && settings.fallbackModel !== requested) candidates.push(settings.fallbackModel);
    candidates.push("");
    let outcome = null;
    let failure = null;
    let usedModel = requested;
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        usedModel = candidates[index];
        try {
          outcome = await this.runner.run(task, {
            model: usedModel,
            reasoningEffort: task.route.reasoningEffort,
            workingDirectory,
            threadId: options.retry ? task.execution.threadId : "",
            retryContext: options.retryContext || "",
            images: (task.attachments || []).map(attachment => attachment.absolutePath).filter(Boolean),
            signal: controller.signal,
            onEvent: event => this.recordRunnerEvent(taskId, event),
          });
          failure = null;
          break;
        } catch (error) {
          failure = error;
          if (controller.signal.aborted || !isModelUnavailable(error) || index === candidates.length - 1) throw error;
          const fallbackLabel = candidates[index + 1] || "Codex default model";
          await this.store.update(taskId, value => {
            value.execution.fallbackNotice = `${candidates[index] || "Configured model"} was unavailable; retrying with ${fallbackLabel}.`;
            value.events.push({ at: new Date().toISOString(), kind: "fallback", message: value.execution.fallbackNotice, details: redactSecrets(error.message || error) });
          });
        }
      }
      if (!outcome) throw failure || new Error("Codex did not return a task result.");
      task = await this.store.get(taskId);
      let filesChanged = [];
      let validations = [];
      if (task.permission !== "review-only") {
        const diff = await this.git.diff(task);
        filesChanged = diff.files;
        validations = await this.validation.run(task, filesChanged);
        if (!filesChanged.length || !diff.patch.trim()) {
          validations.push({ name: "Requested edit produced changes", status: "failed", command: "git diff --name-status", output: "Codex completed without a reviewable Git diff. The task remains failed for retry, escalation, or discard." });
        }
      }
      const validationFailed = validations.some(result => result.status === "failed") || task.tests.some(result => result.status === "failed");
      task = await this.store.update(taskId, value => {
        value.status = validationFailed ? "failed" : "passed";
        value.filesChanged = filesChanged;
        value.tests.push(...validations.map(result => ({ ...result, source: "studio" })));
        value.execution.modelUsed = usedModel || "Codex default";
        value.execution.threadId = outcome.threadId || value.execution.threadId;
        value.execution.finalResponse = outcome.finalResponse || value.execution.finalResponse;
        value.execution.usage = outcome.usage || value.execution.usage;
        value.execution.completedAt = new Date().toISOString();
        value.execution.lastSuccessfulStep = validationFailed ? "Validation completed with failures" : "Changes and validation ready for review";
        value.execution.error = validationFailed ? "One or more task validations failed. Review the evidence, retry, escalate, or discard." : "";
        value.events.push({ at: new Date().toISOString(), kind: validationFailed ? "error" : "complete", message: validationFailed ? "Task completed with validation failures." : "Task passed validation and is ready for review.", details: `${filesChanged.length} changed file(s); ${value.tests.length} recorded check(s).` });
      });
      return this.notify(task);
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === "AbortError" || /abort/i.test(String(error?.message || ""));
      task = await this.store.update(taskId, value => {
        value.status = "failed";
        value.execution.completedAt = new Date().toISOString();
        value.execution.modelUsed = usedModel || value.execution.modelUsed;
        value.execution.error = cancelled ? "Task cancelled. The isolated worktree and any partial changes were preserved." : redactSecrets(error.message || error, 12000);
        value.events.push({ at: new Date().toISOString(), kind: cancelled ? "cancel" : "error", message: cancelled ? "Task cancelled; isolated changes preserved." : "Task failed; isolated changes preserved.", details: value.execution.error });
      });
      await this.notify(task);
      return task;
    } finally {
      this.activeRuns.delete(taskId);
    }
  }

  async cancelTask(taskId) {
    const controller = this.activeRuns.get(taskId);
    if (!controller) throw new Error("Task is not currently running.");
    controller.abort();
    const updated = await this.store.update(taskId, task => {
      task.events.push({ at: new Date().toISOString(), kind: "cancel", message: "Cancellation requested.", details: "Waiting for the local Codex process to stop safely." });
    });
    return this.notify(updated);
  }

  async retryTask(taskId, options = {}) {
    const task = await this.store.get(taskId);
    if (task.status !== "failed") throw new Error("Only failed tasks can be retried.");
    let model = task.route.configuredModel;
    if (options.escalate) {
      const settings = await this.store.getSettings();
      model = settings.modelRoles.deep || DEFAULT_ROUTING_SETTINGS.modelRoles.deep;
      await this.store.update(taskId, value => {
        value.route.role = "deep";
        value.route.configuredModel = model;
        value.route.reasoningEffort = settings.reasoningEffort.deep || "high";
        value.events.push({ at: new Date().toISOString(), kind: "escalation", message: `Escalated retry to the Deep role (${model}).`, details: "The preserved thread, attempted diff, test evidence, and failure logs will be supplied." });
      });
    }
    const current = await this.store.get(taskId);
    let patch = "";
    if (current.worktree) patch = (await this.git.diff(current)).patch;
    const retryContext = JSON.stringify({ previousError: current.execution.error, previousResponse: current.execution.finalResponse, tests: current.tests, currentDiff: redactSecrets(patch, 18000) }, null, 2);
    return this.runTask(taskId, { retry: true, model, retryContext });
  }

  async getDiff(taskId) {
    const task = await this.store.get(taskId);
    if (!task.worktree) return { taskId, files: [], patch: "", message: "This task has no edit worktree." };
    const diff = await this.git.diff(task);
    return { taskId, ...diff };
  }

  async applyTask(taskId) {
    let task = await this.store.get(taskId);
    if (!["passed", "needs-review"].includes(task.status)) throw new Error("Only a completed, reviewable task can be applied.");
    if (this.dirtyProvider()) throw new Error("Studio has unsaved editor changes. Save or discard them before applying this task.");
    const diff = await this.git.diff(task);
    if (!diff.patch.trim()) throw new Error("Task has no changes to apply.");
    const patchPath = `.crownlands-studio/ai/patches/${task.id}.patch`;
    await this.projectFiles.writeTextAtomic(patchPath, diff.patch, { backup: false });
    const applied = await this.git.apply(task);
    task = await this.store.update(taskId, value => {
      value.status = "applied";
      value.appliedAt = new Date().toISOString();
      value.applyPatchPath = patchPath;
      value.filesChanged = applied.files;
      value.events.push({ at: new Date().toISOString(), kind: "apply", message: "Applied the approved task patch to the active project.", details: `Recovery patch: ${patchPath}` });
    });
    return this.notify(task);
  }

  async discardTask(taskId) {
    if (this.activeRuns.has(taskId)) throw new Error("Cancel the running task and wait for it to stop before discarding its worktree.");
    let task = await this.store.get(taskId);
    if (task.status === "applied") throw new Error("Applied tasks cannot be discarded automatically because their changes are now in the active project.");
    if (task.worktree) await this.git.discard(task);
    task = await this.store.update(taskId, value => {
      value.status = "discarded";
      value.discardedAt = new Date().toISOString();
      value.events.push({ at: new Date().toISOString(), kind: "discard", message: "Discarded the isolated task worktree and branch.", details: value.branch || "Review-only task; no worktree existed." });
    });
    return this.notify(task);
  }

  async getPreviewTask(taskId) {
    const task = await this.store.get(taskId);
    if (!task.worktree || !["passed", "needs-review", "failed"].includes(task.status)) throw new Error("A task preview is available after an edit task has produced an isolated worktree.");
    this.git.assertTaskWorktree(task);
    return { id: task.id, worktree: task.worktree, title: task.title };
  }

  dispose() {
    for (const controller of this.activeRuns.values()) controller.abort();
    this.activeRuns.clear();
  }
}

module.exports = { AiWorkspaceService, makeTaskId, taskTitle };
