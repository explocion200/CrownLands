"use strict";

const { DEFAULT_ROUTING_SETTINGS, TASK_STATUSES } = require("./constants");

const STORE_PATH = ".crownlands-studio/ai/tasks.json";
const MAX_TASKS = 250;
const MAX_EVENTS = 300;

const clone = value => JSON.parse(JSON.stringify(value));

class TaskStore {
  constructor(projectFiles, options = {}) {
    this.projectFiles = projectFiles;
    this.clock = options.clock || (() => new Date());
    this.state = null;
    this.writeQueue = Promise.resolve();
  }

  now() {
    return this.clock().toISOString();
  }

  async init() {
    if (this.state) return;
    const fallback = { schemaVersion: 1, settings: clone(DEFAULT_ROUTING_SETTINGS), tasks: [] };
    const loaded = await this.projectFiles.readJson(STORE_PATH, fallback);
    this.state = this.sanitizeStore(loaded);
    let recovered = false;
    this.state.tasks.forEach(task => {
      if (task.status === "running") {
        task.status = "failed";
        task.updatedAt = this.now();
        task.execution = { ...(task.execution || {}), error: "Studio closed while this task was running. The isolated worktree was preserved for retry or discard.", completedAt: this.now() };
        task.events = [...(task.events || []), { at: this.now(), kind: "recovery", message: "Recovered an interrupted task after Studio restart." }].slice(-MAX_EVENTS);
        recovered = true;
      }
    });
    if (recovered) await this.persist();
  }

  sanitizeStore(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const tasks = Array.isArray(source.tasks) ? source.tasks.filter(task => task && typeof task === "object" && typeof task.id === "string") : [];
    for (const task of tasks) {
      if (!TASK_STATUSES.includes(task.status)) task.status = "failed";
      if (!Array.isArray(task.events)) task.events = [];
      task.events = task.events.slice(-MAX_EVENTS);
    }
    return {
      schemaVersion: 1,
      settings: { ...clone(DEFAULT_ROUTING_SETTINGS), ...(source.settings || {}), modelRoles: { ...DEFAULT_ROUTING_SETTINGS.modelRoles, ...(source.settings?.modelRoles || {}) }, reasoningEffort: { ...DEFAULT_ROUTING_SETTINGS.reasoningEffort, ...(source.settings?.reasoningEffort || {}) } },
      tasks: tasks.slice(0, MAX_TASKS),
    };
  }

  async persist() {
    const payload = clone(this.state);
    this.writeQueue = this.writeQueue.then(() => this.projectFiles.writeJsonAtomic(STORE_PATH, payload));
    return this.writeQueue;
  }

  async list() {
    await this.init();
    return clone(this.state.tasks);
  }

  async get(taskId) {
    await this.init();
    const task = this.state.tasks.find(entry => entry.id === taskId);
    if (!task) throw new Error(`AI task was not found: ${taskId}`);
    return clone(task);
  }

  async create(task) {
    await this.init();
    if (this.state.tasks.some(entry => entry.id === task.id)) throw new Error(`AI task already exists: ${task.id}`);
    this.state.tasks.unshift(clone(task));
    this.state.tasks = this.state.tasks.slice(0, MAX_TASKS);
    await this.persist();
    return this.get(task.id);
  }

  async update(taskId, updater) {
    await this.init();
    const index = this.state.tasks.findIndex(entry => entry.id === taskId);
    if (index < 0) throw new Error(`AI task was not found: ${taskId}`);
    const next = clone(this.state.tasks[index]);
    await updater(next);
    next.updatedAt = this.now();
    this.state.tasks[index] = next;
    await this.persist();
    return clone(next);
  }

  async addEvent(taskId, kind, message, details = "") {
    return this.update(taskId, task => {
      task.events ||= [];
      task.events.push({ at: this.now(), kind: String(kind || "info"), message: String(message || ""), details: String(details || "") });
      task.events = task.events.slice(-MAX_EVENTS);
    });
  }

  async getSettings() {
    await this.init();
    return clone(this.state.settings);
  }

  async saveSettings(settings) {
    await this.init();
    this.state.settings = clone(settings);
    await this.persist();
    return this.getSettings();
  }
}

module.exports = { STORE_PATH, TaskStore };
