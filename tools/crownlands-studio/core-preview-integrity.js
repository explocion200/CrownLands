"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MANIFEST_RELATIVE_PATH = "benchmark-results/map/core-v2-qa-1/CORE_PREVIEW_INTEGRITY_MANIFEST.json";
const PACKAGE_ROOT_RELATIVE_PATH = "benchmark-results/map/core-v2-qa-1/staging-site/__core_b1__";
const REGION_DIRECTORY_RELATIVE_PATH = `${PACKAGE_ROOT_RELATIVE_PATH}/regions`;
const MAP_DIRECTORY_RELATIVE_PATH = `${PACKAGE_ROOT_RELATIVE_PATH}/maps`;
const EXPECTED = Object.freeze({
  packageVersion: "core-v2-qa1-approved-25-map-final-art-v1",
  candidateId: "reset2-candidate-2e68667049a02b05",
  mapCount: 25,
  regionCount: 25,
  cityCount: 1480,
  objectiveCount: 17,
  reciprocalConnectionCount: 40,
});

const PACKAGE_METADATA = Object.freeze([
  ["staging-fixture", `${PACKAGE_ROOT_RELATIVE_PATH}/fixture.json`, "json"],
  ["phase-a-package-spec", "benchmark-results/map/core-v2-phase-a/core-v2-package-spec.json", "json"],
]);
const RECEIPTS = Object.freeze([
  ["staging-build-receipt", `${PACKAGE_ROOT_RELATIVE_PATH}/build-receipt.json`, "json"],
  ["reset-2-local-candidate", "benchmark-results/map/core-v2-reset-2/RESET_2_LOCAL_CANDIDATE.json", "json"],
]);
const SOURCES = Object.freeze([
  ["core-spec", "tools/core-v2-phase-a/spec.js", "text"],
  ["core-fixture-generator", "tools/core-v2-qa-1/fixture.js", "text"],
  ["staging-package-builder", "tools/core-v2-qa-1/build-staging-site.js", "text"],
  ["reset-candidate-architecture", "tools/core-v2-reset-2/architecture.js", "text"],
]);

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashJson(value) {
  return sha256(Buffer.from(stableStringify(value), "utf8"));
}

function hashText(value) {
  return sha256(Buffer.from(String(value).replace(/\r\n?/g, "\n"), "utf8"));
}

function resolveInside(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, resolved);
  if (!normalized || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Core preview path escapes the selected project: ${normalized || "(empty)"}`);
  }
  return resolved;
}

function createReader(rootDir, options = {}) {
  const customRead = typeof options.readFile === "function" ? options.readFile : null;
  return {
    readBuffer(relativePath) {
      const normalized = normalizeRelativePath(relativePath);
      const absolute = resolveInside(rootDir, normalized);
      const value = customRead ? customRead(normalized, absolute) : fs.readFileSync(absolute);
      return Buffer.isBuffer(value) ? value : Buffer.from(value);
    },
    list(relativePath) {
      return fs.readdirSync(resolveInside(rootDir, relativePath)).sort();
    },
  };
}

function parseJson(reader, relativePath) {
  return JSON.parse(reader.readBuffer(relativePath).toString("utf8"));
}

function parseCatalogSource(source) {
  const context = { window: {} };
  vm.runInNewContext(String(source), context, { timeout: 1000, filename: "region-catalog.js" });
  const catalog = context.window.CROWNLANDS_REGION_CATALOG;
  if (!catalog || !Array.isArray(catalog.regions)) throw new Error("Core preview region catalog is invalid.");
  return JSON.parse(JSON.stringify(catalog));
}

function fileArtifact(reader, [role, relativePath, mode]) {
  const buffer = reader.readBuffer(relativePath);
  const parsed = mode === "json" ? JSON.parse(buffer.toString("utf8")) : null;
  return {
    role,
    path: relativePath,
    hashMode: mode === "json" ? "canonical-json" : "normalized-lf-text",
    sha256: mode === "json" ? hashJson(parsed) : hashText(buffer.toString("utf8")),
    bytes: buffer.length,
  };
}

function objectiveEntries(region) {
  return [...(Array.isArray(region.camps) ? region.camps : []), ...(Array.isArray(region.strongholds) ? region.strongholds : [])];
}

function geometryProjection(region) {
  return (Array.isArray(region.cities) ? region.cities : []).map(city => ({
    id: city.id,
    regionId: city.regionId || region.id,
    x: city.x,
    y: city.y,
    xNorm: city.xNorm,
    yNorm: city.yNorm,
  }));
}

function objectiveProjection(region) {
  return objectiveEntries(region).map(objective => ({
    id: objective.id,
    type: objective.type || objective.campType || objective.strongholdType,
    x: objective.x,
    y: objective.y,
    xNorm: objective.xNorm,
    yNorm: objective.yNorm,
    size: objective.size,
    artSrc: objective.artSrc,
  }));
}

function topologyProjection(region) {
  return Object.keys(region.edgeConnections || {}).sort().reduce((result, side) => {
    result[side] = (region.edgeConnections[side] || []).map(edge => ({
      id: edge.id,
      side: edge.side || side,
      start: edge.start,
      end: edge.end,
      type: edge.type,
      connectsToRegionId: edge.connectsToRegionId,
      arrowXNorm: edge.arrowXNorm,
      arrowYNorm: edge.arrowYNorm,
      intentionalOuter: edge.intentionalOuter,
    }));
    return result;
  }, {});
}

function validateTopology(regions) {
  const opposite = { north: "south", south: "north", east: "west", west: "east" };
  const byId = new Map(regions.map(region => [region.id, region]));
  let directedConnectionCount = 0;
  for (const region of regions) {
    for (const [side, edges] of Object.entries(region.edgeConnections || {})) {
      for (const edge of edges || []) {
        directedConnectionCount += 1;
        const target = byId.get(edge.connectsToRegionId);
        if (!target) throw new Error(`${region.id}.${side} targets unknown region ${edge.connectsToRegionId}.`);
        const reciprocal = (target.edgeConnections?.[opposite[side]] || [])
          .some(candidate => candidate.connectsToRegionId === region.id);
        if (!reciprocal) throw new Error(`${region.id}.${side} is not reciprocal with ${target.id}.`);
      }
    }
  }
  if (directedConnectionCount % 2 !== 0) throw new Error("Core preview has an odd directed connection count.");
  return { directedConnectionCount, reciprocalConnectionCount: directedConnectionCount / 2 };
}

function buildManifest(rootDir, options = {}) {
  const reader = createReader(rootDir, options);
  const regionFiles = reader.list(REGION_DIRECTORY_RELATIVE_PATH).filter(file => file.endsWith(".json"));
  const regions = regionFiles.map(file => ({
    file,
    path: `${REGION_DIRECTORY_RELATIVE_PATH}/${file}`,
    value: parseJson(reader, `${REGION_DIRECTORY_RELATIVE_PATH}/${file}`),
  })).sort((left, right) => String(left.value.id).localeCompare(String(right.value.id)));
  const topology = validateTopology(regions.map(entry => entry.value));
  const regionArtifacts = regions.map(({ path: regionPath, value: region }) => ({
    path: regionPath,
    regionId: region.id,
    gridX: region.gridX,
    gridY: region.gridY,
    cityCount: Array.isArray(region.cities) ? region.cities.length : 0,
    objectiveCount: objectiveEntries(region).length,
    hashMode: "canonical-json",
    sha256: hashJson(region),
    geometrySha256: hashJson(geometryProjection(region)),
    objectivesSha256: hashJson(objectiveProjection(region)),
    topologySha256: hashJson(topologyProjection(region)),
  }));

  const buildReceiptPath = `${PACKAGE_ROOT_RELATIVE_PATH}/build-receipt.json`;
  const buildReceipt = parseJson(reader, buildReceiptPath);
  const mapArtifacts = [...(buildReceipt.maps || [])]
    .sort((left, right) => String(left.regionId).localeCompare(String(right.regionId)))
    .map(map => {
      const filename = path.posix.basename(String(map.target || ""));
      const relativePath = `${MAP_DIRECTORY_RELATIVE_PATH}/${filename}`;
      const buffer = reader.readBuffer(relativePath);
      const digest = sha256(buffer);
      if (digest !== map.sha256 || buffer.length !== map.bytes) {
        throw new Error(`Core preview map art does not match its build receipt: ${relativePath}.`);
      }
      return {
        key: map.key,
        regionId: map.regionId,
        path: relativePath,
        hashMode: "raw-binary",
        sha256: digest,
        bytes: buffer.length,
      };
    });

  const catalogPath = `${PACKAGE_ROOT_RELATIVE_PATH}/region-catalog.js`;
  const catalogBuffer = reader.readBuffer(catalogPath);
  const catalog = parseCatalogSource(catalogBuffer.toString("utf8"));
  const candidate = parseJson(reader, "benchmark-results/map/core-v2-reset-2/RESET_2_LOCAL_CANDIDATE.json");
  const cityCount = regionArtifacts.reduce((total, region) => total + region.cityCount, 0);
  const objectiveCount = regionArtifacts.reduce((total, region) => total + region.objectiveCount, 0);
  const counts = {
    regions: regionArtifacts.length,
    maps: mapArtifacts.length,
    cities: cityCount,
    objectives: objectiveCount,
    directedConnections: topology.directedConnectionCount,
    reciprocalConnections: topology.reciprocalConnectionCount,
  };
  const actual = {
    packageVersion: candidate?.candidate?.corePackageVersion,
    candidateId: candidate?.candidate?.candidateId,
    mapCount: counts.maps,
    regionCount: counts.regions,
    cityCount: counts.cities,
    objectiveCount: counts.objectives,
    reciprocalConnectionCount: counts.reciprocalConnections,
  };
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (actual[key] !== expected) throw new Error(`Core preview ${key} mismatch: expected ${expected}, found ${actual[key]}.`);
  }
  if (catalog.regions.length !== EXPECTED.regionCount) {
    throw new Error(`Core preview catalog mismatch: expected ${EXPECTED.regionCount} regions, found ${catalog.regions.length}.`);
  }
  if (candidate.passed !== true || candidate.productionMutationPerformed !== false) {
    throw new Error("Core preview reset candidate is not a passed, non-production-mutation receipt.");
  }

  const manifest = {
    schemaVersion: "crownlands-core-preview-integrity-v1",
    scope: "LOCAL_DEVELOPMENT_PREVIEW_ONLY",
    authority: {
      supplemental: true,
      adoptedByProductionReset: false,
      note: "Supplemental local-development preview manifest only; not part of reset or production activation until separately reviewed and adopted.",
    },
    packageRoot: PACKAGE_ROOT_RELATIVE_PATH,
    expected: { ...EXPECTED },
    package: {
      version: actual.packageVersion,
      candidateId: actual.candidateId,
      resetCandidatePassed: true,
      productionMutationPerformed: false,
    },
    counts,
    artifacts: {
      regions: regionArtifacts,
      mapArt: mapArtifacts,
      catalog: {
        path: catalogPath,
        hashMode: "normalized-lf-text",
        sha256: hashText(catalogBuffer.toString("utf8")),
        bytes: catalogBuffer.length,
        regionCount: catalog.regions.length,
      },
      packageMetadata: PACKAGE_METADATA.map(entry => fileArtifact(reader, entry)),
      receipts: RECEIPTS.map(entry => fileArtifact(reader, entry)),
      sources: SOURCES.map(entry => fileArtifact(reader, entry)),
    },
  };
  manifest.protectedFileCount = regionArtifacts.length
    + mapArtifacts.length
    + 1
    + manifest.artifacts.packageMetadata.length
    + manifest.artifacts.receipts.length
    + manifest.artifacts.sources.length;
  manifest.overallSha256 = hashJson(manifest);
  return manifest;
}

function artifactDigestMap(manifest) {
  const artifacts = manifest?.artifacts || {};
  const entries = [
    ...(artifacts.regions || []),
    ...(artifacts.mapArt || []),
    ...(artifacts.packageMetadata || []),
    ...(artifacts.receipts || []),
    ...(artifacts.sources || []),
    ...(artifacts.catalog ? [artifacts.catalog] : []),
  ];
  return new Map(entries.map(entry => [entry.path, entry.sha256]));
}

function verifyManifest(rootDir, options = {}) {
  try {
    const reader = createReader(rootDir, options);
    const stored = options.manifest || parseJson(reader, MANIFEST_RELATIVE_PATH);
    const storedWithoutDigest = { ...stored };
    delete storedWithoutDigest.overallSha256;
    const storedSelfDigest = hashJson(storedWithoutDigest);
    const current = buildManifest(rootDir, options);
    const errors = [];
    if (storedSelfDigest !== stored.overallSha256) errors.push("The stored manifest overall digest is invalid.");
    if (stored.overallSha256 !== current.overallSha256) {
      const storedArtifacts = artifactDigestMap(stored);
      const currentArtifacts = artifactDigestMap(current);
      const paths = [...new Set([...storedArtifacts.keys(), ...currentArtifacts.keys()])].sort();
      paths.forEach(relativePath => {
        if (storedArtifacts.get(relativePath) !== currentArtifacts.get(relativePath)) {
          errors.push(`Integrity mismatch: ${relativePath}`);
        }
      });
      if (!errors.some(error => error.startsWith("Integrity mismatch:"))) {
        errors.push("Core preview manifest metadata or counts do not match the package.");
      }
    }
    return {
      ok: errors.length === 0,
      errors,
      manifest: stored,
      current,
      overallSha256: current.overallSha256,
    };
  } catch (error) {
    return { ok: false, errors: [error.message || String(error)], manifest: null, current: null, overallSha256: "" };
  }
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, "..", "..");
  const manifest = buildManifest(rootDir);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = {
  EXPECTED,
  MANIFEST_RELATIVE_PATH,
  MAP_DIRECTORY_RELATIVE_PATH,
  PACKAGE_ROOT_RELATIVE_PATH,
  REGION_DIRECTORY_RELATIVE_PATH,
  buildManifest,
  hashJson,
  hashText,
  stableStringify,
  verifyManifest,
};
