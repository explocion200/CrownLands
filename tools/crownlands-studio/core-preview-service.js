"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  EXPECTED,
  MANIFEST_RELATIVE_PATH,
  PACKAGE_ROOT_RELATIVE_PATH,
  verifyManifest,
} = require("./core-preview-integrity");

const CONFIG_RELATIVE_PATH = "objective-visual-config.js";
const CONFIG_SCHEMA_VERSION = "crownlands-objective-visual-config-v2";
const SIZE_RULES = Object.freeze({
  camp: Object.freeze({ minimum: 48, maximum: 400, fallback: 132 }),
  stronghold: Object.freeze({ minimum: 64, maximum: 500, fallback: 154 }),
  crownCitadel: Object.freeze({ minimum: 100, maximum: 700, fallback: 260 }),
});
const TOWER_RULES = Object.freeze({
  width: Object.freeze({ minimum: 96, maximum: 320, fallback: 184, integer: true }),
  anchorX: Object.freeze({ minimum: 0, maximum: 1, fallback: 0.5 }),
  anchorY: Object.freeze({ minimum: 0.5, maximum: 1.25, fallback: 0.969 }),
  visualYOffset: Object.freeze({ minimum: -80, maximum: 80, fallback: 0, integer: true }),
});
const HOLDING_TOWER_SLOTS = Object.freeze([
  Object.freeze({ id: "core-v2-holding-tower-1", regionId: "core-v2-north-west-holding-tower-m1-m1", source: "1.png", artSrc: "assets/optimized/holding-tower-1-384x384-4ecfb3a8b86d.webp", reservedX: 736, reservedY: 552, reservationRadiusX: 142, reservationRadiusY: 126, contentBounds: Object.freeze({ left: 0.3172, top: 0.0313, right: 0.6813, bottom: 0.9688 }) }),
  Object.freeze({ id: "core-v2-holding-tower-2", regionId: "core-v2-north-east-holding-tower-p1-m1", source: "2.png", artSrc: "assets/optimized/holding-tower-2-384x384-65f5ac41f3ac.webp", reservedX: 734, reservedY: 555, reservationRadiusX: 142, reservationRadiusY: 126, contentBounds: Object.freeze({ left: 0.3109, top: 0.0313, right: 0.6875, bottom: 0.9688 }) }),
  Object.freeze({ id: "core-v2-holding-tower-3", regionId: "core-v2-south-west-holding-tower-m1-p1", source: "3.png", artSrc: "assets/optimized/holding-tower-3-384x384-6c19186b65e2.webp", reservedX: 724, reservedY: 543, reservationRadiusX: 142, reservationRadiusY: 126, contentBounds: Object.freeze({ left: 0.3281, top: 0.0313, right: 0.6703, bottom: 0.9688 }) }),
  Object.freeze({ id: "core-v2-holding-tower-4", regionId: "core-v2-south-east-holding-tower-p1-p1", source: "4.png", artSrc: "assets/optimized/holding-tower-4-384x384-d0e38c326d09.webp", reservedX: 736, reservedY: 555, reservationRadiusX: 142, reservationRadiusY: 126, contentBounds: Object.freeze({ left: 0.2734, top: 0.0313, right: 0.725, bottom: 0.9688 }) }),
]);

function parseConfigSource(source) {
  const context = { window: {} };
  vm.runInNewContext(String(source), context, { timeout: 1000, filename: CONFIG_RELATIVE_PATH });
  return JSON.parse(JSON.stringify(context.window.CROWNLANDS_OBJECTIVE_VISUAL_CONFIG || {}));
}

function sanitizeSize(value, key) {
  const rule = SIZE_RULES[key];
  const numeric = Number(value);
  const parsed = Math.round(numeric);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || parsed < rule.minimum || parsed > rule.maximum) {
    throw new Error(`${key} visual size must be a whole number from ${rule.minimum} to ${rule.maximum}.`);
  }
  return parsed;
}

function sanitizeTowerValue(value, key) {
  const rule = TOWER_RULES[key];
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < rule.minimum || numeric > rule.maximum || (rule.integer && !Number.isInteger(numeric))) {
    const unit = key === "width" || key === "visualYOffset" ? " px" : "";
    throw new Error(`${key} must be ${rule.integer ? "a whole number" : "a number"} from ${rule.minimum} to ${rule.maximum}${unit}.`);
  }
  return rule.integer ? Math.round(numeric) : Math.round(numeric * 1000) / 1000;
}

function sanitizeHoldingTowers(value) {
  const supplied = Array.isArray(value) ? value : [];
  return HOLDING_TOWER_SLOTS.map(slot => {
    const candidate = supplied.find(entry => entry?.id === slot.id || entry?.regionId === slot.regionId) || {};
    return {
      ...slot,
      width: sanitizeTowerValue(candidate.width ?? TOWER_RULES.width.fallback, "width"),
      anchorX: sanitizeTowerValue(candidate.anchorX ?? TOWER_RULES.anchorX.fallback, "anchorX"),
      anchorY: sanitizeTowerValue(candidate.anchorY ?? TOWER_RULES.anchorY.fallback, "anchorY"),
      visualYOffset: sanitizeTowerValue(candidate.visualYOffset ?? TOWER_RULES.visualYOffset.fallback, "visualYOffset"),
    };
  });
}

function sanitizeConfig(value = {}) {
  const source = value.pendingCore5x5 || value;
  const sizes = source.visualSizes || source;
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    pendingCore5x5: {
      regionIdPrefix: "core-v2-",
      visualSizes: {
        camp: sanitizeSize(sizes.camp, "camp"),
        stronghold: sanitizeSize(sizes.stronghold, "stronghold"),
        crownCitadel: sanitizeSize(sizes.crownCitadel, "crownCitadel"),
      },
      holdingTowers: sanitizeHoldingTowers(source.holdingTowers),
    },
  };
}

function serializeConfig(config) {
  const safe = sanitizeConfig(config);
  const sizes = safe.pendingCore5x5.visualSizes;
  const towers = safe.pendingCore5x5.holdingTowers;
  return `window.CROWNLANDS_OBJECTIVE_VISUAL_CONFIG = Object.freeze({\n`
    + `  schemaVersion: ${JSON.stringify(CONFIG_SCHEMA_VERSION)},\n`
    + `  pendingCore5x5: Object.freeze({\n`
    + `    regionIdPrefix: "core-v2-",\n`
    + `    visualSizes: Object.freeze({\n`
    + `      camp: ${sizes.camp},\n`
    + `      stronghold: ${sizes.stronghold},\n`
    + `      crownCitadel: ${sizes.crownCitadel},\n`
    + `    }),\n`
    + `    holdingTowers: Object.freeze([\n`
    + towers.map(tower => `      Object.freeze({\n`
      + `        id: ${JSON.stringify(tower.id)},\n`
      + `        regionId: ${JSON.stringify(tower.regionId)},\n`
      + `        source: ${JSON.stringify(tower.source)},\n`
      + `        artSrc: ${JSON.stringify(tower.artSrc)},\n`
      + `        reservedX: ${tower.reservedX},\n`
      + `        reservedY: ${tower.reservedY},\n`
      + `        reservationRadiusX: ${tower.reservationRadiusX},\n`
      + `        reservationRadiusY: ${tower.reservationRadiusY},\n`
      + `        contentBounds: Object.freeze(${JSON.stringify(tower.contentBounds)}),\n`
      + `        width: ${tower.width},\n`
      + `        anchorX: ${tower.anchorX},\n`
      + `        anchorY: ${tower.anchorY},\n`
      + `        visualYOffset: ${tower.visualYOffset},\n`
      + `      }),`).join("\n")
    + `\n    ]),\n`
    + `  }),\n`
    + `});\n`;
}

function objectiveKind(objective = {}) {
  if (objective.kind === "holdingTower" || String(objective.type || "").toLowerCase() === "holding_tower") return "holdingTower";
  if (objective.campType || String(objective.id || "").includes("_camp")) return "camp";
  const type = String(objective.type || objective.strongholdType || "").toLowerCase();
  return type === "crown" || type === "crown_citadel" ? "crownCitadel" : "stronghold";
}

function resolveObjectiveVisualSize(config, region, objective) {
  const kind = objectiveKind(objective);
  if (kind === "holdingTower") return sanitizeTowerValue(objective?.width ?? TOWER_RULES.width.fallback, "width");
  const prefix = String(config?.pendingCore5x5?.regionIdPrefix || "core-v2-");
  const external = String(region?.id || "").startsWith(prefix)
    ? config?.pendingCore5x5?.visualSizes?.[kind]
    : undefined;
  const serialized = Number(objective?.size);
  const fallback = SIZE_RULES[kind].fallback;
  const value = Number.isFinite(Number(external)) && Number(external) > 0
    ? Number(external)
    : Number.isFinite(serialized) && serialized > 0 ? serialized : fallback;
  return Math.round(value);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function createCorePreviewService(projectFiles, rootDir) {
  if (!projectFiles || !rootDir) throw new Error("Core preview service requires a protected project service and project root.");

  async function readConfig() {
    return sanitizeConfig(parseConfigSource(await projectFiles.readText(CONFIG_RELATIVE_PATH)));
  }

  function readHoldingTowerReservations(config) {
    const fixturePath = `${PACKAGE_ROOT_RELATIVE_PATH}/fixture.json`;
    const fixture = JSON.parse(fs.readFileSync(projectFiles.resolveRead(fixturePath), "utf8"));
    const reservationsByRegion = new Map((fixture.prototypes || [])
      .filter(prototype => prototype.mapType === "HOLDING_TOWER")
      .map(prototype => [prototype.regionId, prototype]));
    return config.pendingCore5x5.holdingTowers.map((tower, index) => {
      const prototype = reservationsByRegion.get(tower.regionId);
      if (!prototype?.objective) throw new Error(`Missing protected Holding Tower reservation for ${tower.regionId}.`);
      const objective = prototype.objective;
      if (Number(objective.x) !== tower.reservedX || Number(objective.y) !== tower.reservedY
        || Number(objective.radiusX) !== tower.reservationRadiusX || Number(objective.radiusY) !== tower.reservationRadiusY) {
        throw new Error(`Holding Tower ${index + 1} visual config does not match its protected reservation.`);
      }
      return {
        ...tower,
        name: prototype.name,
        kind: "holdingTower",
        type: "holding_tower",
        x: Number(objective.x),
        y: Number(objective.y),
        xNorm: Number(objective.x) / 1448,
        yNorm: Number(objective.y) / 1086,
        serializedSize: 0,
        interactionSize: 0,
        visualSize: tower.width,
        visualOnly: true,
        reservationOnly: Boolean(objective.reservationOnly),
      };
    });
  }

  function readRegions(integrity, config) {
    const mapByRegion = new Map((integrity.manifest.artifacts.mapArt || []).map(map => [map.regionId, map]));
    const towersByRegion = new Map(readHoldingTowerReservations(config).map(tower => [tower.regionId, tower]));
    return (integrity.manifest.artifacts.regions || []).map(entry => {
      const region = JSON.parse(fs.readFileSync(projectFiles.resolveRead(entry.path), "utf8"));
      const packagedObjectives = [...(region.camps || []), ...(region.strongholds || [])].map(objective => ({
        ...objective,
        kind: objectiveKind(objective),
        serializedSize: Math.round(Number(objective.size) || SIZE_RULES[objectiveKind(objective)].fallback),
        interactionSize: Math.round(Number(objective.size) || SIZE_RULES[objectiveKind(objective)].fallback),
        visualSize: resolveObjectiveVisualSize(config, region, objective),
      }));
      const tower = towersByRegion.get(region.id);
      const objectives = tower ? [...packagedObjectives, tower] : packagedObjectives;
      const map = mapByRegion.get(region.id);
      return {
        id: region.id,
        name: region.name,
        type: region.type,
        gridX: region.gridX,
        gridY: region.gridY,
        width: region.width,
        height: region.height,
        cityCapacity: region.cityCapacity,
        cities: region.cities || [],
        objectives,
        edgeConnections: region.edgeConnections || {},
        map: map ? {
          key: map.key,
          sha256: map.sha256,
          bytes: map.bytes,
          url: `/api/core-preview/maps/${encodeURIComponent(map.key)}`,
        } : null,
      };
    }).sort((left, right) => left.gridY - right.gridY || left.gridX - right.gridX);
  }

  async function getWorkspace() {
    const integrity = verifyManifest(rootDir);
    if (!integrity.ok) {
      const unavailable = integrity.errors.some(error => /ENOENT|no such file or directory/i.test(error));
      return {
        ok: false,
        editable: false,
        offlineOnly: true,
        notLive: true,
        reason: unavailable ? "unavailable" : "integrity-failed",
        errors: unavailable
          ? ["Pending Core preview unavailable for this project.", ...integrity.errors]
          : integrity.errors,
        regions: [],
        config: null,
        integrity: {
          ok: false,
          overallSha256: integrity.overallSha256,
          manifestPath: MANIFEST_RELATIVE_PATH,
        },
      };
    }
    let config;
    try {
      config = await readConfig();
    } catch (error) {
      const unavailable = /ENOENT|no such file or directory/i.test(error.message || String(error));
      return {
        ok: false,
        editable: false,
        offlineOnly: true,
        notLive: true,
        reason: unavailable ? "unavailable" : "integrity-failed",
        errors: [
          unavailable ? "Pending Core preview unavailable for this project." : "Core Preview Integrity Check Failed.",
          error.message || String(error),
        ],
        regions: [],
        config: null,
        integrity: {
          ok: false,
          overallSha256: integrity.overallSha256,
          manifestPath: MANIFEST_RELATIVE_PATH,
        },
      };
    }
    return {
      ok: true,
      editable: true,
      offlineOnly: true,
      notLive: true,
      packageVersion: EXPECTED.packageVersion,
      candidateId: EXPECTED.candidateId,
      config,
      regions: readRegions(integrity, config),
      visualCounts: {
        packagedObjectives: integrity.manifest.counts.objectives,
        holdingTowers: config.pendingCore5x5.holdingTowers.length,
        totalObjectives: integrity.manifest.counts.objectives + config.pendingCore5x5.holdingTowers.length,
      },
      integrity: {
        ok: true,
        overallSha256: integrity.overallSha256,
        protectedFileCount: integrity.manifest.protectedFileCount,
        manifestPath: MANIFEST_RELATIVE_PATH,
        counts: integrity.manifest.counts,
      },
    };
  }

  function validate(config) {
    try {
      return { ok: true, config: sanitizeConfig(config), errors: [] };
    } catch (error) {
      return { ok: false, config: null, errors: [error.message || String(error)] };
    }
  }

  async function save(config) {
    const safe = sanitizeConfig(config);
    const before = verifyManifest(rootDir);
    if (!before.ok) throw new Error(`Core preview save blocked: ${before.errors.join(" ")}`);
    const previous = await readConfig();
    const previousText = serializeConfig(previous);
    const nextText = serializeConfig(safe);
    let write = { path: CONFIG_RELATIVE_PATH, backupPath: "" };
    if (previousText !== nextText) write = await projectFiles.writeTextAtomic(CONFIG_RELATIVE_PATH, nextText);
    const after = verifyManifest(rootDir);
    if (!after.ok || after.overallSha256 !== before.overallSha256) {
      throw new Error(`Core preview save verification failed: ${after.errors.join(" ") || "protected package digest changed"}`);
    }
    const previousSizes = previous.pendingCore5x5.visualSizes;
    const nextSizes = safe.pendingCore5x5.visualSizes;
    const changes = Object.keys(SIZE_RULES).filter(key => previousSizes[key] !== nextSizes[key]).map(key => ({
      field: `pendingCore5x5.visualSizes.${key}`,
      before: previousSizes[key],
      after: nextSizes[key],
    }));
    previous.pendingCore5x5.holdingTowers.forEach((tower, index) => {
      const nextTower = safe.pendingCore5x5.holdingTowers[index];
      Object.keys(TOWER_RULES).forEach(key => {
        if (tower[key] === nextTower[key]) return;
        changes.push({
          field: `pendingCore5x5.holdingTowers.${tower.id}.${key}`,
          before: tower[key],
          after: nextTower[key],
        });
      });
    });
    return {
      ok: true,
      config: safe,
      path: write.path,
      backupPath: write.backupPath,
      changes,
      changedFiles: changes.length ? [CONFIG_RELATIVE_PATH] : [],
      generatedFilesAffected: 0,
      packageIntegrityUnchanged: true,
      packageOverallSha256: after.overallSha256,
      packageCounts: after.manifest.counts,
      resetCandidateUnchanged: true,
    };
  }

  function resolveMap(key) {
    const normalizedKey = String(key || "").trim();
    if (!/^[a-z0-9-]+$/.test(normalizedKey)) throw new Error("Invalid Core preview map key.");
    const integrity = verifyManifest(rootDir);
    if (!integrity.ok) throw new Error(`Core preview map blocked: ${integrity.errors.join(" ")}`);
    const entry = integrity.manifest.artifacts.mapArt.find(map => map.key === normalizedKey);
    if (!entry) throw new Error("Unknown Core preview map key.");
    const filePath = projectFiles.resolveRead(entry.path);
    if (sha256File(filePath) !== entry.sha256) throw new Error("Core preview map failed integrity verification.");
    return filePath;
  }

  return Object.freeze({ getWorkspace, readConfig, resolveMap, save, validate });
}

module.exports = {
  CONFIG_RELATIVE_PATH,
  CONFIG_SCHEMA_VERSION,
  HOLDING_TOWER_SLOTS,
  SIZE_RULES,
  TOWER_RULES,
  createCorePreviewService,
  objectiveKind,
  parseConfigSource,
  resolveObjectiveVisualSize,
  sanitizeConfig,
  serializeConfig,
};
