"use strict";

const { AGENT_PROFILES, DEFAULT_ROUTING_SETTINGS } = require("./constants");

const CATEGORY_RULES = Object.freeze([
  ["Performance", /\b(fps|performance|profil(?:e|ing)|slow|lag|memory|render(?:ing)?|event listeners?|dom load|network behavior|march performance)\b/i],
  ["Economy", /\b(economy|gold|reward|production|troop value|upgrade cost|daily mission scaling|item price|balance formula|simulation)\b/i],
  ["Map", /\b(map|region|road|adjacen|city placement|terrain|stronghold|citadel|camp placement|world layout)\b/i],
  ["QA", /\b(audit|qa|quality|overflow|clipping|contrast|broken asset|missing image|console error|responsive check|regression scan)\b/i],
  ["Documentation", /\b(document|documentation|readme|guide|architecture notes?|changelog)\b/i],
  ["Refactor", /\b(refactor|architecture|shared system|restructure|migrate|consolidate|data model)\b/i],
  ["Feature", /\b(add|implement|create|build|new (?:feature|system|screen)|persistence|backend|firebase|server-authoritative)\b/i],
  ["Bug", /\b(fix|bug|broken|fails?|incorrect|why|investigate|root cause|regression)\b/i],
  ["UI", /\b(ui|css|style|align|spacing|color|button|text|layout|responsive|screen|component|theme|icon|modal|panel|tab)\b/i],
]);

const DEEP_SIGNALS = /\b(architecture|backend|firebase|server-authoritative|schema|data model|large|across every|multi-file|refactor|migration|persistence|performance|race condition|security|new system|end-to-end)\b/i;
const LOW_RISK_SIGNALS = /\b(color|spacing|align|text|copy|label|single|small|minor|css|button)\b/i;
const HIGH_RISK_SIGNALS = /\b(firebase|production|backend|schema|migration|database|authentication|economy-wide|combat|progression|server-authoritative|destructive)\b/i;
const VISUAL_SIGNALS = /\b(screenshot|visual|color|alignment|spacing|overflow|responsive|layout|readability|icon)\b/i;

function contextText(context) {
  try { return JSON.stringify(context || {}); } catch { return ""; }
}

function chooseCategory(prompt, context) {
  const text = `${prompt} ${contextText(context)}`;
  const matches = CATEGORY_RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (!matches.length) return { category: "Mixed", matches: [] };
  if (matches.includes("Performance")) return { category: "Performance", matches };
  if (matches.includes("Economy")) return { category: "Economy", matches };
  if (matches.includes("Map")) return { category: "Map", matches };
  if (matches.includes("QA") && !matches.includes("Feature")) return { category: "QA", matches };
  if (matches.includes("Feature") && (matches.includes("UI") || matches.includes("Bug") || matches.includes("Refactor"))) return { category: "Mixed", matches };
  if (matches.includes("UI") && matches.includes("Bug") && !/\b(investigate|why|root cause|crash|exception|fails? to|regression)\b/i.test(text)) return { category: "UI", matches };
  if (matches.includes("Bug")) return { category: "Bug", matches };
  if (matches.includes("UI")) return { category: "UI", matches };
  return { category: matches[0], matches };
}

function agentForCategory(category) {
  return ({
    UI: "ui-craftsman",
    Feature: "feature-builder",
    Bug: "bug-hunter",
    QA: "qa-inspector",
    Performance: "performance-engineer",
    Map: "map-engineer",
    Economy: "economy-designer",
    Refactor: "feature-builder",
    Documentation: "qa-inspector",
    Mixed: "feature-builder",
  })[category] || "feature-builder";
}

function expectedFiles(context, category) {
  const files = [...(context?.sourceFiles || []), ...(context?.relevantFiles || []), ...(context?.qaIssue?.relevantFiles || [])]
    .filter(value => typeof value === "string" && value.trim())
    .map(value => value.trim().replace(/\\/g, "/"));
  const unique = [...new Set(files)].slice(0, 20);
  if (unique.length) return unique;
  return ({
    UI: ["Relevant screen/component HTML, CSS, and JavaScript discovered during inspection"],
    Feature: ["Feature modules, shared contracts, UI, and focused tests discovered during inspection"],
    Bug: ["Reproduction path, root-cause module, and regression test"],
    QA: ["Affected screen/component sources and structured QA record when appropriate"],
    Performance: ["Measured hot path, benchmark/profile harness, and focused implementation files"],
    Map: ["World/region data, map tooling, and map validators as required"],
    Economy: ["Current economy formulas/configuration and analysis or validation artifacts"],
    Documentation: ["Source-backed repository documentation"],
    Refactor: ["Existing shared architecture and regression tests"],
    Mixed: ["Relevant subsystem files discovered during repository inspection"],
  })[category] || ["Relevant source files discovered during inspection"];
}

function validationPlan(category, context) {
  const checks = ["Git diff whitespace/conflict check", "Syntax checks for changed JavaScript"];
  if (["UI", "QA", "Mixed"].includes(category) || context?.area) checks.push("Crownlands Studio regression tests when Studio files change", "Desktop and landscape-mobile visual review");
  if (category === "Map") checks.push("Relevant map validator or benchmark check");
  if (category === "Performance") checks.push("Before/after measurement using the relevant benchmark or profile harness");
  if (category === "Economy") checks.push("Client/server configuration consistency and formula review");
  if (category === "Feature") checks.push("Focused feature tests and existing regression validators");
  return [...new Set(checks)];
}

function buildSubtasks(category, complexity) {
  if (complexity !== "High" || !["Feature", "Mixed", "Refactor"].includes(category)) return [];
  return [
    { id: "architecture", title: "Inspect architecture and establish contracts", agent: "feature-builder", role: "deep", dependsOn: [], parallelSafe: false },
    { id: "implementation", title: "Implement the approved feature plan", agent: "feature-builder", role: "deep", dependsOn: ["architecture"], parallelSafe: false },
    { id: "ui", title: "Integrate and polish the user-facing UI where required", agent: "ui-craftsman", role: "fast", dependsOn: ["architecture"], parallelSafe: true },
    { id: "qa", title: "Run focused and regression validation", agent: "qa-inspector", role: "qa", dependsOn: ["implementation", "ui"], parallelSafe: false },
    { id: "review", title: "Review the integrated diff and evidence", agent: "feature-builder", role: "review", dependsOn: ["qa"], parallelSafe: false },
  ];
}

function routeTask(input, settings = DEFAULT_ROUTING_SETTINGS) {
  const text = `${input.prompt} ${contextText(input.context)}`;
  const { category, matches } = chooseCategory(input.prompt, input.context);
  const wordCount = input.prompt.trim().split(/\s+/).length;
  const likelyManyFiles = /\b(all|every|across|system|end-to-end|multi-file|shared)\b/i.test(text);
  const deep = DEEP_SIGNALS.test(text) || likelyManyFiles || wordCount > 90 || ["Performance", "Economy", "Refactor"].includes(category);
  const complexity = deep ? "High" : wordCount > 35 || matches.length > 2 ? "Medium" : "Low";
  const risk = HIGH_RISK_SIGNALS.test(text) ? "High" : complexity === "High" ? "Medium" : LOW_RISK_SIGNALS.test(text) ? "Low" : "Medium";
  const recommendedAgent = agentForCategory(category);
  const agentId = input.agent !== "auto" ? input.agent : recommendedAgent;
  const profile = AGENT_PROFILES[agentId] || AGENT_PROFILES[recommendedAgent];
  let role = profile.defaultRole;
  if (deep) role = category === "Performance" ? "performance" : "deep";
  else if (category === "QA") role = "qa";
  else if (category === "Documentation") role = "review";
  else if (VISUAL_SIGNALS.test(text) && category === "UI" && input.context?.screenshotPath) role = "visual";
  const configuredModel = input.model || settings.modelRoles?.[role] || DEFAULT_ROUTING_SETTINGS.modelRoles[role];
  const fallbackModel = settings.fallbackModel || DEFAULT_ROUTING_SETTINGS.fallbackModel;
  const reasoningEffort = settings.reasoningEffort?.[role] || DEFAULT_ROUTING_SETTINGS.reasoningEffort[role];
  const backendImpact = /\b(backend|firebase|database|schema|server-authoritative|cloud function)\b/i.test(text);
  const gameplayImpact = /\b(gameplay|combat|progression|economy|troop|reward|achievement|bounty|map rule)\b/i.test(text);
  const rationale = [
    `${category} signals matched${matches.length ? ` (${matches.join(", ")})` : ""}.`,
    deep ? "Architectural, cross-file, backend, performance, or high-reasoning signals require the deep role." : "The request appears focused enough for a fast specialist role.",
    input.agent !== "auto" ? `Manual agent override selected ${profile.label}.` : `AUTO selected ${profile.label}.`,
  ];
  return {
    category,
    matches,
    complexity,
    risk,
    subsystem: input.context?.screen || input.context?.component || input.context?.area || category,
    agentId: profile.id,
    agentLabel: profile.label,
    role,
    configuredModel,
    fallbackModel,
    reasoningEffort,
    backendImpact,
    gameplayImpact,
    rationale,
    expectedFiles: expectedFiles(input.context, category),
    validations: validationPlan(category, input.context),
    subtasks: buildSubtasks(category, complexity),
  };
}

function buildPlan(input, route) {
  return {
    summary: input.prompt.replace(/\s+/g, " ").trim(),
    agent: route.agentLabel,
    agentId: route.agentId,
    role: route.role,
    model: route.configuredModel,
    fallbackModel: route.fallbackModel,
    complexity: route.complexity,
    risk: route.risk,
    category: route.category,
    subsystem: route.subsystem,
    expectedFiles: route.expectedFiles,
    systemsAffected: [route.subsystem, route.backendImpact ? "Backend/data contracts" : "Local project source", route.gameplayImpact ? "Gameplay behavior (review required)" : "No intended gameplay change"],
    validations: route.validations,
    backendImpact: route.backendImpact,
    gameplayImpact: route.gameplayImpact,
    permission: input.permission,
    routingRationale: route.rationale,
    subtasks: route.subtasks,
  };
}

module.exports = { buildPlan, chooseCategory, routeTask };
