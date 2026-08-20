"use strict";

const DEFAULT_CONFIG = require("./reset-runtime-config.json");

const CONTROL_VERSION = "crownlands-reset-runtime-guard-v1";
const MAINTENANCE_MODES = Object.freeze(["OFF", "READ_ONLY"]);
const RESET_ACTIONS = Object.freeze([
  "bootstrap",
  "migration",
  "cutover",
  "generation",
  "publication",
  "activation",
  "expansion",
]);
const WORLD_MUTATIONS = Object.freeze([
  "city_capture",
  "city_upgrade",
  "new_march",
  "rally",
  "reinforcement",
  "objective_capture",
  "main_city_relocation",
  "new_player_placement",
  "generated_region_activation",
  "ownership_change",
]);

function normalizeControls(raw = DEFAULT_CONFIG) {
  const source = raw && typeof raw === "object" ? raw : {};
  const killSwitches = Object.fromEntries(RESET_ACTIONS.map(action => [
    action,
    source.killSwitches?.[action] !== false,
  ]));
  const maintenanceMode = MAINTENANCE_MODES.includes(source.maintenanceMode)
    ? source.maintenanceMode
    : "OFF";
  return Object.freeze({
    schemaVersion: CONTROL_VERSION,
    resetEnabled: source.resetEnabled === true,
    seasonCutoverEnabled: source.seasonCutoverEnabled === true,
    automaticResetEnabled: source.automaticResetEnabled === true,
    maintenanceMode,
    killSwitches: Object.freeze(killSwitches),
  });
}

function assertResetActionAllowed(action, controls = DEFAULT_CONFIG) {
  const normalized = normalizeControls(controls);
  if (!RESET_ACTIONS.includes(action)) throw new Error(`Unknown reset action ${action}.`);
  if (!normalized.resetEnabled) throw new Error("reset-disabled");
  if (normalized.killSwitches[action]) throw new Error(`${action}-killed`);
  if (action === "cutover" && !normalized.seasonCutoverEnabled) throw new Error("season-cutover-disabled");
  if (normalized.automaticResetEnabled) throw new Error("automatic-reset-must-remain-disabled");
  return true;
}

function assertWorldMutationAllowed(operation, controls = DEFAULT_CONFIG) {
  const normalized = normalizeControls(controls);
  if (!WORLD_MUTATIONS.includes(operation)) throw new Error(`Unknown world mutation ${operation}.`);
  if (normalized.maintenanceMode === "READ_ONLY") throw new Error("season-reset-maintenance-read-only");
  return true;
}

function canReadDuringMaintenance(controls = DEFAULT_CONFIG) {
  return normalizeControls(controls).maintenanceMode === "READ_ONLY";
}

module.exports = Object.freeze({
  CONTROL_VERSION,
  MAINTENANCE_MODES,
  RESET_ACTIONS,
  WORLD_MUTATIONS,
  DEFAULT_CONFIG,
  normalizeControls,
  assertResetActionAllowed,
  assertWorldMutationAllowed,
  canReadDuringMaintenance,
});
