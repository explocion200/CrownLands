"use strict";

const { AGENT_PROFILES, DEFAULT_ROUTING_SETTINGS, MODEL_ROLES, PERMISSIONS } = require("./constants");

const TASK_ID_PATTERN = /^task-[a-z0-9][a-z0-9-]{7,63}$/;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,95}$/i;
const ALLOWED_TASK_KEYS = new Set([
  "prompt", "context", "permission", "agent", "model", "includeScreenshot", "includeCurrentDiff",
]);
const ALLOWED_SETTINGS_KEYS = new Set(["schemaVersion", "modelRoles", "fallbackModel", "reasoningEffort", "autoEscalation"]);
const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object.`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field: ${key}`);
  }
}

function boundedString(value, label, options = {}) {
  const text = String(value ?? "").trim();
  const min = options.min ?? 0;
  const max = options.max ?? 1000;
  if (text.length < min) throw new Error(`${label} must be at least ${min} characters.`);
  if (text.length > max) throw new Error(`${label} must be at most ${max} characters.`);
  if (text.includes("\0")) throw new Error(`${label} contains an invalid null character.`);
  return text;
}

function sanitizeSerializable(value, depth = 0) {
  if (depth > 5) throw new Error("Context nesting is too deep.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Context contains a non-finite number.");
    return value;
  }
  if (typeof value === "string") return boundedString(value, "Context text", { max: 6000 });
  if (Array.isArray(value)) {
    if (value.length > 50) throw new Error("Context arrays may contain at most 50 entries.");
    return value.map(entry => sanitizeSerializable(entry, depth + 1));
  }
  assertPlainObject(value, "Context");
  const entries = Object.entries(value);
  if (entries.length > 60) throw new Error("Context objects may contain at most 60 fields.");
  const result = {};
  for (const [key, child] of entries) {
    if (BLOCKED_OBJECT_KEYS.has(key)) throw new Error(`Context contains blocked field: ${key}`);
    const safeKey = boundedString(key, "Context field", { min: 1, max: 80 });
    result[safeKey] = sanitizeSerializable(child, depth + 1);
  }
  return result;
}

function validateTaskInput(value) {
  assertPlainObject(value, "Task request");
  rejectUnknownKeys(value, ALLOWED_TASK_KEYS, "Task request");
  const prompt = boundedString(value.prompt, "Task", { min: 3, max: 12000 });
  const permission = value.permission === undefined ? "safe-edit" : boundedString(value.permission, "Permission", { min: 1, max: 40 });
  if (!PERMISSIONS.includes(permission)) throw new Error(`Unsupported permission mode: ${permission}`);
  const agent = value.agent === undefined ? "auto" : boundedString(value.agent, "Agent", { min: 1, max: 60 });
  if (agent !== "auto" && !Object.hasOwn(AGENT_PROFILES, agent)) throw new Error(`Unsupported Crownlands agent: ${agent}`);
  const model = value.model ? boundedString(value.model, "Model", { min: 1, max: 96 }) : "";
  if (model && !MODEL_PATTERN.test(model)) throw new Error("Model override contains unsupported characters.");
  const context = value.context === undefined ? {} : sanitizeSerializable(value.context);
  if (JSON.stringify(context).length > 50000) throw new Error("Task context is larger than 50 KB.");
  return Object.freeze({
    prompt,
    context,
    permission,
    agent,
    model,
    includeScreenshot: Boolean(value.includeScreenshot),
    includeCurrentDiff: Boolean(value.includeCurrentDiff),
  });
}

function validateTaskId(value) {
  if (typeof value !== "string") {
    assertPlainObject(value, "Task reference");
    rejectUnknownKeys(value, new Set(["taskId"]), "Task reference");
  }
  const taskId = boundedString(typeof value === "string" ? value : value?.taskId, "Task ID", { min: 8, max: 69 });
  if (!TASK_ID_PATTERN.test(taskId)) throw new Error("Task ID is invalid.");
  return taskId;
}

function validateConfirmedAction(value, action) {
  assertPlainObject(value, `${action} request`);
  rejectUnknownKeys(value, new Set(["taskId", "confirmed"]), `${action} request`);
  if (value.confirmed !== true) throw new Error(`${action} requires explicit confirmation.`);
  return validateTaskId(value.taskId);
}

function validateRetry(value) {
  assertPlainObject(value, "Retry request");
  rejectUnknownKeys(value, new Set(["taskId", "escalate"]), "Retry request");
  return { taskId: validateTaskId(value.taskId), escalate: Boolean(value.escalate) };
}

function validateRoutingSettings(value) {
  assertPlainObject(value, "AI routing settings");
  rejectUnknownKeys(value, ALLOWED_SETTINGS_KEYS, "AI routing settings");
  assertPlainObject(value.modelRoles, "Model role mappings");
  assertPlainObject(value.reasoningEffort, "Reasoning mappings");
  const modelRoles = {};
  const reasoningEffort = {};
  for (const role of MODEL_ROLES) {
    const model = boundedString(value.modelRoles[role] ?? DEFAULT_ROUTING_SETTINGS.modelRoles[role], `${role} model`, { min: 1, max: 96 });
    if (!MODEL_PATTERN.test(model)) throw new Error(`${role} model contains unsupported characters.`);
    modelRoles[role] = model;
    const effort = boundedString(value.reasoningEffort[role] ?? DEFAULT_ROUTING_SETTINGS.reasoningEffort[role], `${role} reasoning`, { min: 1, max: 12 });
    if (!["minimal", "low", "medium", "high", "xhigh"].includes(effort)) throw new Error(`Unsupported reasoning effort: ${effort}`);
    reasoningEffort[role] = effort;
  }
  const fallbackModel = boundedString(value.fallbackModel ?? DEFAULT_ROUTING_SETTINGS.fallbackModel, "Fallback model", { min: 1, max: 96 });
  if (!MODEL_PATTERN.test(fallbackModel)) throw new Error("Fallback model contains unsupported characters.");
  return {
    schemaVersion: 1,
    modelRoles,
    fallbackModel,
    reasoningEffort,
    autoEscalation: value.autoEscalation !== false,
  };
}

module.exports = {
  TASK_ID_PATTERN,
  sanitizeSerializable,
  validateConfirmedAction,
  validateRetry,
  validateRoutingSettings,
  validateTaskId,
  validateTaskInput,
};
