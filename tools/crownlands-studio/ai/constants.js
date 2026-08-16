"use strict";

const MODEL_ROLES = Object.freeze(["deep", "fast", "visual", "qa", "performance", "review"]);
const PERMISSIONS = Object.freeze(["review-only", "safe-edit", "full-development"]);
const TASK_STATUSES = Object.freeze(["planned", "running", "needs-review", "passed", "failed", "applied", "discarded"]);

const AGENT_PROFILES = Object.freeze({
  "feature-builder": Object.freeze({
    id: "feature-builder",
    label: "Feature Builder",
    defaultRole: "deep",
    categories: ["Feature", "Refactor", "Mixed"],
    purpose: "Build new gameplay systems, screens, backend integrations, and multi-file features.",
  }),
  "ui-craftsman": Object.freeze({
    id: "ui-craftsman",
    label: "UI Craftsman",
    defaultRole: "fast",
    categories: ["UI"],
    purpose: "Polish Crownlands UI layout, readability, responsive behavior, components, and theme styling.",
  }),
  "bug-hunter": Object.freeze({
    id: "bug-hunter",
    label: "Bug Hunter",
    defaultRole: "fast",
    categories: ["Bug"],
    purpose: "Reproduce defects, find root causes, apply targeted fixes, and protect regressions.",
  }),
  "qa-inspector": Object.freeze({
    id: "qa-inspector",
    label: "QA Inspector",
    defaultRole: "qa",
    categories: ["QA"],
    purpose: "Audit UI and behavior, capture reproducible findings, and validate fixes against structured QA issues.",
  }),
  "performance-engineer": Object.freeze({
    id: "performance-engineer",
    label: "Performance Engineer",
    defaultRole: "performance",
    categories: ["Performance"],
    purpose: "Profile FPS, rendering, memory, events, image loading, networking, and march performance.",
  }),
  "map-engineer": Object.freeze({
    id: "map-engineer",
    label: "Map Engineer",
    defaultRole: "fast",
    categories: ["Map"],
    purpose: "Maintain map generation, adjacency, roads, placement rules, region data, validation, and map performance.",
  }),
  "economy-designer": Object.freeze({
    id: "economy-designer",
    label: "Economy Designer",
    defaultRole: "deep",
    categories: ["Economy"],
    purpose: "Analyze formulas and data before changing rewards, production, upgrades, items, and economy balance.",
  }),
});

const DEFAULT_ROUTING_SETTINGS = Object.freeze({
  schemaVersion: 1,
  modelRoles: Object.freeze({
    deep: "gpt-5.6-sol",
    fast: "gpt-5.6-luna",
    visual: "gpt-5.6-terra",
    qa: "gpt-5.6-luna",
    performance: "gpt-5.6-sol",
    review: "gpt-5.6-terra",
  }),
  fallbackModel: "gpt-5.6-terra",
  reasoningEffort: Object.freeze({
    deep: "high",
    fast: "medium",
    visual: "medium",
    qa: "medium",
    performance: "high",
    review: "medium",
  }),
  autoEscalation: true,
});

module.exports = {
  AGENT_PROFILES,
  DEFAULT_ROUTING_SETTINGS,
  MODEL_ROLES,
  PERMISSIONS,
  TASK_STATUSES,
};
