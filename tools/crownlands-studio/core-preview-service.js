"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  EXPECTED,
  MANIFEST_RELATIVE_PATH,
  verifyManifest,
} = require("./core-preview-integrity");

const CONFIG_RELATIVE_PATH = "objective-visual-config.js";
const CONFIG_SCHEMA_VERSION = "crownlands-objective-visual-config-v1";
const SIZE_RULES = Object.freeze({
  camp: Object.freeze({ minimum: 48, maximum: 400, fallback: 132 }),
  stronghold: Object.freeze({ minimum: 64, maximum: 500, fallback: 154 }),
  crownCitadel: Object.freeze({ minimum: 100, maximum: 700, fallback: 260 }),
});

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
    },
  };
}

function serializeConfig(config) {
  const safe = sanitizeConfig(config);
  const sizes = safe.pendingCore5x5.visualSizes;
  return `window.CROWNLANDS_OBJECTIVE_VISUAL_CONFIG = Object.freeze({\n`
    + `  schemaVersion: ${JSON.stringify(CONFIG_SCHEMA_VERSION)},\n`
    + `  pendingCore5x5: Object.freeze({\n`
    + `    regionIdPrefix: "core-v2-",\n`
    + `    visualSizes: Object.freeze({\n`
    + `      camp: ${sizes.camp},\n`
    + `      stronghold: ${sizes.stronghold},\n`
    + `      crownCitadel: ${sizes.crownCitadel},\n`
    + `    }),\n`
    + `  }),\n`
    + `});\n`;
}

function objectiveKind(objective = {}) {
  if (objective.campType || String(objective.id || "").includes("_camp")) return "camp";
  const type = String(objective.type || objective.strongholdType || "").toLowerCase();
  return type === "crown" || type === "crown_citadel" ? "crownCitadel" : "stronghold";
}

function resolveObjectiveVisualSize(config, region, objective) {
  const kind = objectiveKind(objective);
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

  function readRegions(integrity, config) {
    const mapByRegion = new Map((integrity.manifest.artifacts.mapArt || []).map(map => [map.regionId, map]));
    return (integrity.manifest.artifacts.regions || []).map(entry => {
      const region = JSON.parse(fs.readFileSync(projectFiles.resolveRead(entry.path), "utf8"));
      const objectives = [...(region.camps || []), ...(region.strongholds || [])].map(objective => ({
        ...objective,
        kind: objectiveKind(objective),
        serializedSize: Math.round(Number(objective.size) || SIZE_RULES[objectiveKind(objective)].fallback),
        interactionSize: Math.round(Number(objective.size) || SIZE_RULES[objectiveKind(objective)].fallback),
        visualSize: resolveObjectiveVisualSize(config, region, objective),
      }));
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
      return {
        ok: false,
        editable: false,
        offlineOnly: true,
        notLive: true,
        errors: integrity.errors,
        regions: [],
        config: null,
        integrity: {
          ok: false,
          overallSha256: integrity.overallSha256,
          manifestPath: MANIFEST_RELATIVE_PATH,
        },
      };
    }
    const config = await readConfig();
    return {
      ok: true,
      editable: true,
      offlineOnly: true,
      notLive: true,
      packageVersion: EXPECTED.packageVersion,
      candidateId: EXPECTED.candidateId,
      config,
      regions: readRegions(integrity, config),
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
  SIZE_RULES,
  createCorePreviewService,
  objectiveKind,
  parseConfigSource,
  resolveObjectiveVisualSize,
  sanitizeConfig,
  serializeConfig,
};
