"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { performance } = require("node:perf_hooks");
const phase6f = require("../map-scaling-phase-6f/composer");
const {
  allocateNextPlayerRegion,
  hashObject,
  refreshRegionConnections,
} = require("../map-scaling-phase-4/generator");
const {
  MINIMUM_NPC_CITIES_FOR_SPAWN,
  PLAYER_REGION_CITY_CAPACITY,
  derivePlayerRegionSpawnEligibility,
} = require("../../functions/player-region-spawn");
const regionCatalogRuntime = require("../../region-catalog");

const ROOT = path.resolve(__dirname, "../..");
const PHASE = "7";
const PACKAGE_SCHEMA_VERSION = "phase7-generated-region-package-v1";
const STORAGE_SCHEMA_VERSION = "phase7-immutable-storage-v1";
const PUBLICATION_SCHEMA_VERSION = "phase7-atomic-publication-v1";
const ACTIVATION_SCHEMA_VERSION = "phase7-atomic-activation-v1";
const ADMIN_CONTRACT_VERSION = "phase7-studio-admin-contract-v1";
const ASSET_MANIFEST_HASH = "701068cd92127df1790c2759bcd4e9ed6f088896d3ee3a8e767fd30667085c6f";
const PHASE6F_ROOT = path.join(ROOT, "benchmark-results", "map", "phase-6f", "study");
const PHASE6F_MANIFEST_PATH = path.join(PHASE6F_ROOT, "compact-manifest.jsonl");
const PHASE6F_METADATA_PATH = path.join(PHASE6F_ROOT, "run-metadata.json");
const SIDES = Object.freeze(["north", "east", "south", "west"]);
const OPPOSITE = Object.freeze({ north: "south", east: "west", south: "north", west: "east" });
const DELTAS = Object.freeze({
  north: Object.freeze({ x: 0, y: -1 }),
  east: Object.freeze({ x: 1, y: 0 }),
  south: Object.freeze({ x: 0, y: 1 }),
  west: Object.freeze({ x: -1, y: 0 }),
});
const LIFECYCLE = Object.freeze({
  ALLOCATED: "ALLOCATED",
  GENERATING: "GENERATING",
  VALIDATING: "VALIDATING",
  STANDBY: "STANDBY",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
});

function cleanToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return { byteLength: value.length, sha256: sha256(value) };
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hashValue(value) {
  return sha256(stableJson(value));
}

function coordinateKey(coordinate) {
  return `${Number(coordinate.gridX)},${Number(coordinate.gridY)}`;
}

function neighborCoordinate(coordinate, side) {
  const delta = DELTAS[side];
  return { gridX: coordinate.gridX + delta.x, gridY: coordinate.gridY + delta.y };
}

function deepClone(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(deepClone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]));
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeTimings(values) {
  const normalized = values.map(Number).filter(Number.isFinite);
  return {
    count: normalized.length,
    averageMs: normalized.length ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length : 0,
    p50Ms: percentile(normalized, 0.5),
    p95Ms: percentile(normalized, 0.95),
    maximumMs: normalized.length ? Math.max(...normalized) : 0,
  };
}

function assertAdmin(actor, action) {
  if (actor?.role !== "crownlands_map_admin") {
    const error = new Error(`Admin authority is required for ${action}.`);
    error.code = "permission-denied";
    throw error;
  }
}

function createAdminActor(label = "phase7-emulator-admin") {
  return Object.freeze({ id: label, role: "crownlands_map_admin" });
}

function readLockedAssetManifest() {
  const manifestPath = path.join(ROOT, "benchmark-results", "map", "phase-6d", "asset-library", "asset-manifest.json");
  const bytes = fs.readFileSync(manifestPath);
  assert.equal(sha256(bytes), ASSET_MANIFEST_HASH, "The approved Phase 6D asset manifest changed.");
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert.equal(manifest.assetCount, 118, "Phase 7 requires the locked 118-asset library.");
  return { manifest, manifestPath, hash: sha256(bytes) };
}

async function loadApprovedPhase6FRecords(limit) {
  const metadata = JSON.parse(fs.readFileSync(PHASE6F_METADATA_PATH, "utf8"));
  assert.equal(metadata.assetCount, 118);
  assert.equal(metadata.assetManifestHashBefore, ASSET_MANIFEST_HASH);
  assert.equal(metadata.assetManifestHashAfter, ASSET_MANIFEST_HASH);
  const records = [];
  const input = fs.createReadStream(PHASE6F_MANIFEST_PATH, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
    if (records.length >= limit) {
      lines.close();
      input.destroy();
      break;
    }
  }
  assert.equal(records.length, limit, `Expected ${limit} approved Phase 6F records.`);
  return { metadata, records };
}

function rebuildApprovedPlan(record, allocation) {
  const ranked = phase6f.createRankedArtworkPlans({
    allocation,
    themeKey: record.theme,
    variantKey: record.variant,
    retrySalt: record.seed.artworkRetrySalt,
    neighborThemes: record.neighborThemes || {},
    inheritedEdgeContracts: record.inheritedEdgeContracts || {},
  });
  const plan = ranked.find(candidate => (
    candidate.macroCandidateIndex === record.seed.macroCandidateIndex
    && candidate.roadGeometryId === record.roadGeometryId
  ));
  assert(plan, `Unable to rebuild the approved plan for ${record.regionId}.`);
  const parity = phase6f.validateGeometryArtParity(plan);
  assert.equal(parity.valid, true, parity.errors.join(" "));
  assert.equal(record.hashes.compositionPlanHash, hashObject({
    foundation: {
      assetId: plan.foundation.assetId,
      transform: plan.foundation.transform || "none",
      toneProfile: plan.foundationToneProfile,
    },
    barriers: plan.barriers.map(item => ({
      assetId: item.assetId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      crop: item.crop || null,
      flipHorizontal: Boolean(item.flipHorizontal),
      flipVertical: Boolean(item.flipVertical),
    })),
    roads: plan.roads.map(item => ({
      assetId: item.assetId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      crop: item.crop || null,
      flipHorizontal: Boolean(item.flipHorizontal),
      flipVertical: Boolean(item.flipVertical),
      ...(item.roadGeometryId ? { roadGeometryId: item.roadGeometryId } : {}),
      ...(item.roadGeometrySourceTheme ? { roadGeometrySourceTheme: item.roadGeometrySourceTheme } : {}),
      ...(item.roadSkin ? { roadSkin: item.roadSkin } : {}),
    })),
    accents: plan.accents.map(item => ({
      assetId: item.assetId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      crop: item.crop || null,
      flipHorizontal: Boolean(item.flipHorizontal),
      flipVertical: Boolean(item.flipVertical),
    })),
    transitionBands: plan.transitionBands,
  }), `Approved composition hash drifted for ${record.regionId}.`);
  return { plan, parity };
}

function reconstructCities(record) {
  return record.cityPositions.map(city => ({
    id: city.id,
    name: `Frontier ${city.id.slice(-6).toUpperCase()}`,
    regionId: record.regionId,
    x: city.x,
    y: city.y,
    ownerUid: "",
    ownerKind: "neutral",
    level: 1,
    troops: 10,
    defense: 1,
    generated: true,
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function validateMinimumSpacing(cities, minimum = 112) {
  let observed = Number.POSITIVE_INFINITY;
  for (let left = 0; left < cities.length; left += 1) {
    for (let right = left + 1; right < cities.length; right += 1) {
      observed = Math.min(observed, Math.hypot(cities[left].x - cities[right].x, cities[left].y - cities[right].y));
    }
  }
  return { valid: observed >= minimum, minimumObserved: observed };
}

function createPhase7EdgeContracts(record, allocation, packageIdentityKey) {
  const source = record.publishedEdgeContracts;
  assert(source?.immutableAfterPublication, `Missing approved edge contracts for ${record.regionId}.`);
  const sides = {};
  for (const side of SIDES) {
    const contract = source.sides[side];
    assert(contract, `Missing ${side} edge contract for ${record.regionId}.`);
    const adjacent = neighborCoordinate(allocation.coordinate, side);
    sides[side] = {
      schemaVersion: "phase7-edge-contract-v1",
      side,
      roadSocketCoordinate: { x: contract.socket.x, y: contract.socket.y },
      socketOrientation: contract.socket.inwardOrientation,
      socketTangentOffset: contract.socket.tangentOffset,
      corridorWidth: contract.roadHalfWidth * 2,
      transitionBand: {
        maximumWidth: contract.transitionBandMaximumWidth,
        geometry: contract.transitionGeometry,
      },
      neighborCoordinate: adjacent,
      compatibility: {
        sourceTheme: contract.sourceTheme,
        cardinalOnly: true,
        existingPublishedRegionWins: true,
        openGatedStateExcluded: true,
      },
      owningPackage: {
        identityKey: packageIdentityKey,
        packageSchemaVersion: PACKAGE_SCHEMA_VERSION,
        generatorVersion: phase6f.GENERATOR_VERSION,
      },
      inheritedPublishedConstraint: contract.inheritedPublishedConstraint ? {
        regionId: contract.inheritedPublishedConstraint.regionId,
        side: contract.inheritedPublishedConstraint.side,
        contractHash: contract.inheritedPublishedConstraint.contractHash,
      } : null,
      sourceContractHash: contract.contractHash,
    };
    sides[side].contractHash = hashValue({ ...sides[side], contractHash: undefined });
  }
  return {
    schemaVersion: "phase7-edge-contract-set-v1",
    immutableAfterPublication: true,
    runtimeOpenGatedStateExcluded: true,
    existingPublishedPackageWins: true,
    sides,
    edgeContractHash: hashValue(sides),
  };
}

function createPackageIdentity({ metadata, record, allocation, retrySalt }) {
  const identity = {
    worldId: metadata.worldId,
    seasonId: metadata.seasonId,
    regionId: record.regionId,
    coordinate: {
      gridX: allocation.coordinate.gridX,
      gridY: allocation.coordinate.gridY,
    },
    layer: allocation.coordinate.worldLayer,
    clockwiseSlot: allocation.coordinate.clockwiseOrderIndex,
    generatorVersion: metadata.generatorVersion,
    assetLibraryVersion: metadata.assetLibraryVersion,
    seed: record.seed,
    retrySalt: retrySalt || record.seed.citySeedSalt,
  };
  return { ...identity, identityKey: hashValue(identity) };
}

function immutablePackageBasePath(identity, packageHash) {
  return [
    "generated-worlds",
    "v1",
    "worlds",
    cleanToken(identity.worldId),
    "seasons",
    cleanToken(identity.seasonId),
    "regions",
    cleanToken(identity.regionId),
    "packages",
    packageHash,
  ].join("/");
}

function buildImmutableFiles(packageValue, mapBytes, thumbnailBytes) {
  const serializableFiles = {
    "region-definition.json": packageValue.regionDefinition,
    "city-definitions.json": packageValue.cities,
    "starting-candidates.json": packageValue.startingCandidates,
    "topology-template.json": packageValue.topologyTemplate,
    "roads.json": packageValue.roads,
    "blockers.json": packageValue.blockers,
    "edge-contracts.json": packageValue.edgeContracts,
    "generator-metadata.json": packageValue.identity,
    "validation-receipt.json": packageValue.validationReceipt,
  };
  const files = {
    "map.webp": mapBytes,
    "thumbnail.webp": thumbnailBytes,
    ...Object.fromEntries(Object.entries(serializableFiles).map(([name, value]) => [name, Buffer.from(`${stableJson(value)}\n`)])),
  };
  return files;
}

function packageHashBasis(packageValue) {
  return {
    packageSchemaVersion: packageValue.packageSchemaVersion,
    storageSchemaVersion: packageValue.storageSchemaVersion,
    identity: packageValue.identity,
    compositionPlanHash: packageValue.compositionPlanHash,
    regionDefinitionHash: hashValue(packageValue.regionDefinition),
    cityDefinitionsHash: packageValue.cityDefinitionsHash,
    startingCandidatesHash: hashValue(packageValue.startingCandidates),
    topologyTemplateHash: hashValue(packageValue.topologyTemplate),
    blockerHash: hashValue(packageValue.blockers),
    roadHash: hashValue(packageValue.roads),
    edgeContractHash: packageValue.edgeContracts.edgeContractHash,
    validationReceiptHash: hashValue(packageValue.validationReceipt),
    mapWebpHash: packageValue.mapWebp.sha256,
    thumbnailWebpHash: packageValue.thumbnailWebp.sha256,
    generatorVersion: packageValue.identity.generatorVersion,
    assetLibraryVersion: packageValue.identity.assetLibraryVersion,
  };
}

function finalizeImmutableManifest(packageValue, files) {
  packageValue.packageHash = hashValue(packageHashBasis(packageValue));
  const basePath = immutablePackageBasePath(packageValue.identity, packageValue.packageHash);
  const fileEntries = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, {
    path: `${basePath}/${name}`,
    sha256: sha256(bytes),
    bytes: bytes.length,
    immutable: true,
  }]));
  packageValue.storage = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    basePath,
    immutableVersionedPaths: true,
    mutableLatestAuthoritative: false,
    files: fileEntries,
  };
  packageValue.manifest = {
    schemaVersion: "phase7-package-manifest-v1",
    packageHash: packageValue.packageHash,
    identity: packageValue.identity,
    files: fileEntries,
    packageHashBasis: packageHashBasis(packageValue),
  };
  const manifestBytes = Buffer.from(`${stableJson(packageValue.manifest)}\n`);
  packageValue.storage.files["package-manifest.json"] = {
    path: `${basePath}/package-manifest.json`,
    sha256: sha256(manifestBytes),
    bytes: manifestBytes.length,
    immutable: true,
  };
  return { ...files, "package-manifest.json": manifestBytes };
}

class RoadPresentationCache {
  constructor() {
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  resolve(record) {
    const key = `${record.roadGeometryId}|${record.theme}`;
    if (this.entries.has(key)) {
      this.hits += 1;
      return { key, hash: this.entries.get(key), cacheHit: true };
    }
    const hash = hashValue({
      roadGeometryId: record.roadGeometryId,
      theme: record.theme,
      roadPresentationHash: record.hashes.roadPresentationHash,
      strategy: "approved-phase6f-masked-road-presentation-v1",
    });
    this.entries.set(key, hash);
    this.misses += 1;
    return { key, hash, cacheHit: false };
  }

  snapshot() {
    return { entries: this.entries.size, hits: this.hits, misses: this.misses };
  }
}

class ApprovedPhase6FPackageWorker {
  constructor({ metadata, roadCache = new RoadPresentationCache() }) {
    this.metadata = metadata;
    this.roadCache = roadCache;
  }

  generate({ record, allocation, retrySalt = "", inheritedEdgeContracts = null, faultAt = "" }) {
    const startedAt = performance.now();
    assert.equal(record.regionId, allocation.regionId);
    assert.deepEqual(record.coordinate, allocation.coordinate);
    assert.equal(record.status, "standby");
    assert.equal(record.productionActivated, false);
    if (inheritedEdgeContracts) {
      for (const [side, expected] of Object.entries(inheritedEdgeContracts)) {
        const actual = record.inheritedEdgeContracts?.[side];
        assert(actual, `${record.regionId}:${side} is missing an inherited edge contract.`);
        assert.equal(actual.contractHash, expected.contractHash);
      }
    }
    const { plan, parity } = rebuildApprovedPlan(record, allocation);
    const definition = phase6f.createDefinition(allocation, plan);
    const cities = reconstructCities(record);
    const spacing = validateMinimumSpacing(cities);
    assert.equal(cities.length, PLAYER_REGION_CITY_CAPACITY);
    assert.equal(record.startingCandidates.length, 4);
    assert.equal(spacing.valid, true);
    assert.equal(new Set(cities.map(city => city.id)).size, PLAYER_REGION_CITY_CAPACITY);
    const identity = createPackageIdentity({ metadata: this.metadata, record, allocation, retrySalt });
    const edgeContracts = createPhase7EdgeContracts(record, allocation, identity.identityKey);
    const mapPath = path.join(PHASE6F_ROOT, record.raster.mapPath);
    const thumbnailPath = path.join(PHASE6F_ROOT, record.raster.thumbnailPath);
    const mapBytes = fs.readFileSync(mapPath);
    if (faultAt === "after_map_encode") {
      const error = new Error("Injected worker crash after map encode.");
      error.code = "worker-crash-after-map-encode";
      throw error;
    }
    const thumbnailBytes = fs.readFileSync(thumbnailPath);
    assert.equal(sha256(mapBytes), record.raster.webpHash);
    assert.equal(sha256(thumbnailBytes), record.raster.thumbnailHash);
    assert.equal(mapBytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(mapBytes.subarray(8, 12).toString("ascii"), "WEBP");
    const roadPresentation = this.roadCache.resolve(record);
    const topologyTemplate = Object.fromEntries(SIDES.map(side => [side, {
      side,
      state: "gated",
      targetRegionId: "",
      neighborCoordinate: neighborCoordinate(allocation.coordinate, side),
      runtimeMutable: true,
      packageArtState: "unchanged",
    }]));
    const packageValue = {
      phase: PHASE,
      packageSchemaVersion: PACKAGE_SCHEMA_VERSION,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      publicationSchemaVersion: PUBLICATION_SCHEMA_VERSION,
      activationSchemaVersion: ACTIVATION_SCHEMA_VERSION,
      developmentOnly: true,
      productionActivated: false,
      lifecycle: LIFECYCLE.STANDBY,
      identity,
      regionDefinition: {
        ...definition,
        worldId: identity.worldId,
        seasonId: identity.seasonId,
        regionId: identity.regionId,
        coordinate: identity.coordinate,
        layer: identity.layer,
        clockwiseSlot: identity.clockwiseSlot,
        cityCapacity: PLAYER_REGION_CITY_CAPACITY,
        startingCandidateCount: 4,
      },
      cities,
      startingCandidates: record.startingCandidates,
      topologyTemplate,
      roads: plan.roadSystem,
      blockers: plan.blockers,
      edgeContracts,
      compositionPlanHash: record.hashes.compositionPlanHash,
      cityDefinitionsHash: hashValue(cities),
      approvedPhase6FPackageHash: record.packageHash,
      mapWebp: {
        mediaType: "image/webp",
        width: 1448,
        height: 1086,
        sha256: record.raster.webpHash,
        bytes: mapBytes.length,
      },
      thumbnailWebp: {
        mediaType: "image/webp",
        width: 320,
        height: 240,
        sha256: record.raster.thumbnailHash,
        bytes: thumbnailBytes.length,
      },
      roadPresentation,
      validationReceipt: {
        schemaVersion: "phase7-standby-validation-v1",
        valid: true,
        stateHistory: [LIFECYCLE.ALLOCATED, LIFECYCLE.GENERATING, LIFECYCLE.VALIDATING, LIFECYCLE.STANDBY],
        exactCityCapacity: cities.length === PLAYER_REGION_CITY_CAPACITY,
        exactStartingCandidates: record.startingCandidates.length === 4,
        minimumSpacing: spacing.minimumObserved,
        geometryArtParity: parity.valid,
        blockersValid: Array.isArray(plan.blockers),
        edgeContractsValid: Object.keys(edgeContracts.sides).length === 4,
        mapHashVerified: sha256(mapBytes) === record.raster.webpHash,
        thumbnailHashVerified: sha256(thumbnailBytes) === record.raster.thumbnailHash,
      },
    };
    const initialFiles = buildImmutableFiles(packageValue, mapBytes, thumbnailBytes);
    const files = finalizeImmutableManifest(packageValue, initialFiles);
    packageValue.metrics = {
      workerGenerationMs: performance.now() - startedAt,
      source: "approved-phase6f-package-and-raster-adapter",
      browserGenerationAllowed: false,
      deterministic: true,
      idempotent: true,
    };
    packageValue.files = files;
    const validation = validateStandbyPackage(packageValue);
    assert.equal(validation.valid, true, validation.errors.join(" "));
    return packageValue;
  }
}

function validateStandbyPackage(packageValue) {
  const errors = [];
  const identity = packageValue?.identity || {};
  if (packageValue?.packageSchemaVersion !== PACKAGE_SCHEMA_VERSION) errors.push("invalid_package_schema");
  if (packageValue?.lifecycle !== LIFECYCLE.STANDBY) errors.push("not_standby");
  if (packageValue?.developmentOnly !== true || packageValue?.productionActivated !== false) errors.push("not_development_only");
  if (!identity.worldId || !identity.seasonId || !identity.regionId || !identity.identityKey) errors.push("incomplete_identity");
  if (Number(identity.layer) < 1) errors.push("inside_permanent_core");
  if (!Number.isInteger(identity.clockwiseSlot) || identity.clockwiseSlot < 0) errors.push("invalid_clockwise_slot");
  if (identity.generatorVersion !== phase6f.GENERATOR_VERSION) errors.push("generator_version_drift");
  if (packageValue?.cities?.length !== PLAYER_REGION_CITY_CAPACITY) errors.push("not_exactly_40_cities");
  if (new Set((packageValue?.cities || []).map(city => city.id)).size !== PLAYER_REGION_CITY_CAPACITY) errors.push("duplicate_city_ids");
  if (packageValue?.startingCandidates?.length !== 4) errors.push("not_exactly_4_starting_candidates");
  const cityIds = new Set((packageValue?.cities || []).map(city => city.id));
  if ((packageValue?.startingCandidates || []).some(candidate => !cityIds.has(candidate.cityId || candidate.id))) {
    errors.push("starting_candidate_not_in_city_definitions");
  }
  if (!validateMinimumSpacing(packageValue?.cities || []).valid) errors.push("city_spacing_invalid");
  if (packageValue?.mapWebp?.width !== 1448 || packageValue?.mapWebp?.height !== 1086) errors.push("map_dimensions_invalid");
  if (packageValue?.thumbnailWebp?.width !== 320 || packageValue?.thumbnailWebp?.height !== 240) errors.push("thumbnail_dimensions_invalid");
  if (packageValue?.edgeContracts?.runtimeOpenGatedStateExcluded !== true) errors.push("edge_state_baked_into_package");
  if (Object.keys(packageValue?.edgeContracts?.sides || {}).length !== 4) errors.push("edge_contract_count_invalid");
  if (packageValue?.packageHash !== hashValue(packageHashBasis(packageValue))) errors.push("package_hash_invalid");
  for (const [name, descriptor] of Object.entries(packageValue?.storage?.files || {})) {
    const bytes = packageValue.files?.[name];
    if (!bytes || sha256(bytes) !== descriptor.sha256 || bytes.length !== descriptor.bytes) errors.push(`file_hash_invalid:${name}`);
    if (!descriptor.path.includes(`/packages/${packageValue.packageHash}/`)) errors.push(`file_path_not_immutable:${name}`);
  }
  return { valid: errors.length === 0, errors };
}

class Mutex {
  constructor() {
    this.tail = Promise.resolve();
  }

  async run(operation) {
    let release;
    const previous = this.tail;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class Phase7IntegrationStore {
  constructor({ resetGeneration = "phase7-development-generation" } = {}) {
    this.resetGeneration = resetGeneration;
    this.mutex = new Mutex();
    this.regions = new Map();
    this.coordinateOwners = new Map();
    this.standbyPackages = new Map();
    this.immutablePackages = new Map();
    this.immutableAssets = new Map();
    this.stagedPublications = new Map();
    this.publicationMarkers = new Map();
    this.activationMarkers = new Map();
    this.runtimeCatalog = new Map();
    this.runtimeTopology = new Map();
    this.cityDefinitions = new Map();
    this.cityOwnership = new Map();
    this.quarantine = [];
    this.events = [];
    this.metrics = {
      assetUploadMs: [],
      hashVerificationMs: [],
      metadataPublicationMs: [],
      activationMs: [],
      duplicatePreventionCount: 0,
      gatedToOpenTransitions: 0,
    };
  }

  observe(event, details = {}) {
    this.events.push({
      sequence: this.events.length + 1,
      event,
      regionId: details.regionId || "",
      lifecycle: details.lifecycle || "",
      durationMs: Number(details.durationMs || 0),
      outcome: details.outcome || "ok",
      retry: Number(details.retry || 0),
      sensitivePlayerDataLogged: false,
    });
  }

  async registerAllocation(allocation, actor) {
    assertAdmin(actor, "region allocation");
    return this.mutex.run(async () => {
      const key = coordinateKey(allocation.coordinate);
      const existingRegionId = this.coordinateOwners.get(key);
      if (existingRegionId && existingRegionId !== allocation.regionId) {
        this.metrics.duplicatePreventionCount += 1;
        const error = new Error(`Coordinate ${key} is already allocated to ${existingRegionId}.`);
        error.code = "duplicate-coordinate";
        throw error;
      }
      const current = this.regions.get(allocation.regionId);
      if (current) {
        if (coordinateKey(current.coordinate) !== key) {
          this.metrics.duplicatePreventionCount += 1;
          const error = new Error(`Region ID ${allocation.regionId} is already allocated at ${coordinateKey(current.coordinate)}.`);
          error.code = "duplicate-region-id";
          throw error;
        }
        return { idempotent: true, region: current };
      }
      const region = {
        regionId: allocation.regionId,
        coordinate: { gridX: allocation.coordinate.gridX, gridY: allocation.coordinate.gridY },
        layer: allocation.coordinate.worldLayer,
        clockwiseSlot: allocation.coordinate.clockwiseOrderIndex,
        lifecycle: LIFECYCLE.ALLOCATED,
        packageHash: "",
        developmentOnly: true,
      };
      this.coordinateOwners.set(key, allocation.regionId);
      this.regions.set(allocation.regionId, region);
      this.observe("allocation", { regionId: allocation.regionId, lifecycle: region.lifecycle });
      return { idempotent: false, region };
    });
  }

  async saveStandbyPackage(packageValue, actor) {
    assertAdmin(actor, "standby package creation");
    return this.mutex.run(async () => {
      const validation = validateStandbyPackage(packageValue);
      if (!validation.valid) {
        this.observe("validation", { regionId: packageValue?.identity?.regionId, outcome: "failed" });
        throw new Error(validation.errors.join(" "));
      }
      const region = this.regions.get(packageValue.identity.regionId);
      assert(region, `Region ${packageValue.identity.regionId} was not allocated.`);
      const existing = this.standbyPackages.get(region.regionId);
      if (existing && existing.packageHash !== packageValue.packageHash) {
        this.metrics.duplicatePreventionCount += 1;
        const error = new Error(`A different STANDBY package already exists for ${region.regionId}.`);
        error.code = "duplicate-coordinate-package";
        throw error;
      }
      this.standbyPackages.set(region.regionId, packageValue);
      region.lifecycle = LIFECYCLE.STANDBY;
      region.packageHash = packageValue.packageHash;
      this.observe("validation", { regionId: region.regionId, lifecycle: region.lifecycle });
      return { idempotent: Boolean(existing), packageHash: packageValue.packageHash };
    });
  }

  publishedNeighborFor(packageValue, side) {
    const adjacentKey = coordinateKey(packageValue.edgeContracts.sides[side].neighborCoordinate);
    const neighborRegionId = this.coordinateOwners.get(adjacentKey);
    if (!neighborRegionId || !this.publicationMarkers.has(neighborRegionId)) return null;
    const neighborHash = this.publicationMarkers.get(neighborRegionId);
    return this.immutablePackages.get(neighborHash) || null;
  }

  validatePublishedNeighborInheritance(packageValue) {
    const errors = [];
    for (const side of SIDES) {
      const neighbor = this.publishedNeighborFor(packageValue, side);
      if (!neighbor) continue;
      const expected = neighbor.edgeContracts.sides[OPPOSITE[side]];
      const inherited = packageValue.edgeContracts.sides[side].inheritedPublishedConstraint;
      if (!inherited
        || inherited.regionId !== neighbor.identity.regionId
        || inherited.contractHash !== expected.sourceContractHash) {
        errors.push(`${side}:stale_or_missing_published_edge_contract`);
      }
    }
    return errors;
  }

  uploadImmutableFile(descriptor, bytes) {
    const existing = this.immutableAssets.get(descriptor.path);
    if (existing) {
      if (existing.sha256 !== descriptor.sha256 || !existing.bytes.equals(bytes)) {
        const error = new Error(`Immutable asset overwrite attempted at ${descriptor.path}.`);
        error.code = "immutable-overwrite";
        throw error;
      }
      return false;
    }
    this.immutableAssets.set(descriptor.path, { sha256: descriptor.sha256, bytes: Buffer.from(bytes) });
    return true;
  }

  verifyImmutableFiles(packageValue) {
    for (const descriptor of Object.values(packageValue.storage.files)) {
      const stored = this.immutableAssets.get(descriptor.path);
      if (!stored || stored.sha256 !== descriptor.sha256 || sha256(stored.bytes) !== descriptor.sha256) return false;
    }
    return true;
  }

  async publishPackage(regionId, actor, { faultAt = "" } = {}) {
    assertAdmin(actor, "region publication");
    return this.mutex.run(async () => {
      const existingMarker = this.publicationMarkers.get(regionId);
      if (existingMarker) {
        const queuedPackage = this.standbyPackages.get(regionId);
        if (queuedPackage && existingMarker !== queuedPackage.packageHash) {
          this.metrics.duplicatePreventionCount += 1;
          const error = new Error(`Region ${regionId} already published a different package.`);
          error.code = "duplicate-publication";
          throw error;
        }
        return { idempotent: true, packageHash: existingMarker, lifecycle: LIFECYCLE.PUBLISHED };
      }
      const packageValue = this.standbyPackages.get(regionId);
      assert(packageValue, `No STANDBY package exists for ${regionId}.`);
      const region = this.regions.get(regionId);
      const initialHash = packageValue.packageHash;
      region.lifecycle = LIFECYCLE.PUBLISHING;
      this.observe("publication_start", { regionId, lifecycle: region.lifecycle });
      const publicationStartedAt = performance.now();
      try {
        const packageValidation = validateStandbyPackage(packageValue);
        if (!packageValidation.valid || faultAt === "validator_failure") {
          const error = new Error(faultAt === "validator_failure" ? "Injected package validator failure." : packageValidation.errors.join(" "));
          error.code = "package-validation-failed";
          throw error;
        }
        const inheritanceErrors = this.validatePublishedNeighborInheritance(packageValue);
        if (inheritanceErrors.length) {
          const error = new Error(inheritanceErrors.join(" "));
          error.code = "stale-edge-contract";
          throw error;
        }
        const uploadStartedAt = performance.now();
        for (const [name, descriptor] of Object.entries(packageValue.storage.files)) {
          this.uploadImmutableFile(descriptor, packageValue.files[name]);
        }
        this.metrics.assetUploadMs.push(performance.now() - uploadStartedAt);
        this.observe("storage_upload", { regionId, durationMs: performance.now() - uploadStartedAt });
        if (faultAt === "after_asset_upload") {
          const error = new Error("Injected worker crash after asset upload.");
          error.code = "crash-after-asset-upload";
          throw error;
        }
        const verificationStartedAt = performance.now();
        if (!this.verifyImmutableFiles(packageValue)) throw new Error("Uploaded package hash verification failed.");
        this.metrics.hashVerificationMs.push(performance.now() - verificationStartedAt);
        this.observe("hash_verification", { regionId, durationMs: performance.now() - verificationStartedAt });
        const staged = {
          schemaVersion: PUBLICATION_SCHEMA_VERSION,
          regionId,
          packageHash: packageValue.packageHash,
          catalog: {
            id: regionId,
            purpose: "player_region",
            permanentCore: false,
            lifecycle: LIFECYCLE.PUBLISHED,
            discoverable: true,
            active: false,
            spawnEligible: false,
            packageHash: packageValue.packageHash,
            coordinate: packageValue.identity.coordinate,
            layer: packageValue.identity.layer,
            clockwiseSlot: packageValue.identity.clockwiseSlot,
            mapAsset: packageValue.storage.files["map.webp"].path,
            thumbnailAsset: packageValue.storage.files["thumbnail.webp"].path,
            regionDefinitionPath: packageValue.storage.files["region-definition.json"].path,
          },
          topology: deepClone(packageValue.topologyTemplate),
          cityDefinitions: deepClone(packageValue.cities),
        };
        this.stagedPublications.set(regionId, staged);
        if (faultAt === "publication_transaction") {
          const error = new Error("Injected publication transaction failure.");
          error.code = "publication-transaction-failed";
          throw error;
        }
        assert.equal(staged.cityDefinitions.length, PLAYER_REGION_CITY_CAPACITY);
        assert.equal(Object.keys(staged.topology).length, 4);
        assert.equal(packageValue.packageHash, initialHash, "Package mutated before publication marker.");
        const metadataStartedAt = performance.now();
        this.immutablePackages.set(packageValue.packageHash, packageValue);
        this.cityDefinitions.set(regionId, staged.cityDefinitions);
        this.runtimeTopology.set(regionId, staged.topology);
        this.runtimeCatalog.set(regionId, staged.catalog);
        this.publicationMarkers.set(regionId, packageValue.packageHash);
        this.standbyPackages.delete(regionId);
        region.lifecycle = LIFECYCLE.PUBLISHED;
        this.stagedPublications.delete(regionId);
        this.metrics.metadataPublicationMs.push(performance.now() - metadataStartedAt);
        this.observe("publication", {
          regionId,
          lifecycle: region.lifecycle,
          durationMs: performance.now() - publicationStartedAt,
        });
        return { idempotent: false, packageHash: packageValue.packageHash, lifecycle: region.lifecycle };
      } catch (error) {
        this.stagedPublications.delete(regionId);
        region.lifecycle = LIFECYCLE.STANDBY;
        this.quarantine.push({ regionId, packageHash: initialHash, reason: error.code || error.message });
        this.observe("publication", { regionId, lifecycle: region.lifecycle, outcome: "failed" });
        throw error;
      }
    });
  }

  initializeCitiesIdempotently(packageValue) {
    const existing = this.cityOwnership.get(packageValue.identity.regionId);
    const expected = packageValue.cities.map(city => ({
      id: city.id,
      regionId: packageValue.identity.regionId,
      resetGeneration: this.resetGeneration,
      ownerUid: "",
      ownerKind: "neutral",
      level: city.level,
      troops: city.troops,
      defense: city.defense,
      x: city.x,
      y: city.y,
    }));
    if (existing) {
      if (hashValue(existing) !== hashValue(expected)) throw new Error(`City initialization conflict in ${packageValue.identity.regionId}.`);
      return { idempotent: true, count: existing.length };
    }
    this.cityOwnership.set(packageValue.identity.regionId, expected);
    return { idempotent: false, count: expected.length };
  }

  activeNeighbor(regionId, side) {
    const catalog = this.runtimeCatalog.get(regionId);
    if (!catalog) return null;
    const adjacent = neighborCoordinate(catalog.coordinate, side);
    const neighborRegionId = this.coordinateOwners.get(coordinateKey(adjacent));
    const neighbor = neighborRegionId ? this.runtimeCatalog.get(neighborRegionId) : null;
    return neighbor?.lifecycle === LIFECYCLE.ACTIVE ? neighbor : null;
  }

  openActiveNeighborConnections(regionId) {
    const packageHashBefore = this.publicationMarkers.get(regionId);
    for (const side of SIDES) {
      const neighbor = this.activeNeighbor(regionId, side);
      if (!neighbor) continue;
      const localTopology = this.runtimeTopology.get(regionId);
      const neighborTopology = this.runtimeTopology.get(neighbor.id);
      localTopology[side] = { ...localTopology[side], state: "open", targetRegionId: neighbor.id };
      neighborTopology[OPPOSITE[side]] = {
        ...neighborTopology[OPPOSITE[side]],
        state: "open",
        targetRegionId: regionId,
      };
      this.metrics.gatedToOpenTransitions += 1;
      this.observe("gated_to_open", { regionId });
    }
    assert.equal(this.publicationMarkers.get(regionId), packageHashBefore, "OPEN/GATED changed the package hash.");
  }

  async activateRegion(regionId, actor, { faultAt = "" } = {}) {
    assertAdmin(actor, "region activation");
    return this.mutex.run(async () => {
      const startedAt = performance.now();
      const packageHash = this.publicationMarkers.get(regionId);
      if (!packageHash) throw new Error(`${regionId} is not PUBLISHED.`);
      if (this.activationMarkers.has(regionId)) {
        return { idempotent: true, packageHash, lifecycle: LIFECYCLE.ACTIVE };
      }
      const packageValue = this.immutablePackages.get(packageHash);
      assert(packageValue, `Published package ${packageHash} is missing.`);
      const validation = validateStandbyPackage(packageValue);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      if (!this.verifyImmutableFiles(packageValue)) throw new Error("Published assets failed activation verification.");
      if (this.validatePublishedNeighborInheritance(packageValue).length) throw new Error("Published neighbor edge contracts do not match.");
      assert.equal(packageValue.cities.length, PLAYER_REGION_CITY_CAPACITY);
      assert.equal(new Set(packageValue.cities.map(city => city.id)).size, PLAYER_REGION_CITY_CAPACITY);
      if (faultAt === "activation_transaction") {
        const error = new Error("Injected activation transaction failure.");
        error.code = "activation-transaction-failed";
        throw error;
      }
      const cityInitialization = this.initializeCitiesIdempotently(packageValue);
      const catalog = this.runtimeCatalog.get(regionId);
      catalog.lifecycle = LIFECYCLE.ACTIVE;
      catalog.active = true;
      catalog.spawnEligible = true;
      this.activationMarkers.set(regionId, packageHash);
      this.regions.get(regionId).lifecycle = LIFECYCLE.ACTIVE;
      this.openActiveNeighborConnections(regionId);
      this.metrics.activationMs.push(performance.now() - startedAt);
      this.observe("activation", { regionId, lifecycle: LIFECYCLE.ACTIVE, durationMs: performance.now() - startedAt });
      return { idempotent: false, packageHash, lifecycle: LIFECYCLE.ACTIVE, cityInitialization };
    });
  }

  spawnEligibility(regionId) {
    const region = this.runtimeCatalog.get(regionId);
    if (!region) return null;
    const regions = [...this.runtimeCatalog.values()].map(entry => ({
      ...entry,
      purpose: "player_region",
      permanentCore: false,
      connections: this.runtimeTopology.get(entry.id),
    }));
    const cityOwnershipState = this.cityOwnership.get(regionId) || [];
    const regularCityIds = (this.cityDefinitions.get(regionId) || []).map(city => city.id);
    return derivePlayerRegionSpawnEligibility({
      region: { ...region, connections: this.runtimeTopology.get(regionId) },
      regions,
      cityOwnershipState,
      regularCityIds,
      resetGeneration: this.resetGeneration,
      ownershipStateAuthoritative: true,
    });
  }

  async claimCityForPlacement(regionId, simulatedPlayerToken) {
    return this.mutex.run(async () => {
      const eligibility = this.spawnEligibility(regionId);
      if (!eligibility?.spawnEligible) {
        const error = new Error(`Region ${regionId} is not eligible for a new placement.`);
        error.code = "spawn-threshold";
        throw error;
      }
      const cities = this.cityOwnership.get(regionId);
      const target = cities.find(city => !city.ownerUid);
      assert(target, `No neutral city remains in ${regionId}.`);
      target.ownerUid = `simulated:${sha256(simulatedPlayerToken).slice(0, 12)}`;
      target.ownerKind = "player";
      const after = this.spawnEligibility(regionId);
      const catalog = this.runtimeCatalog.get(regionId);
      catalog.spawnEligible = after.spawnEligible;
      catalog.currentNpcCityCount = after.currentNpcCityCount;
      this.observe("simulated_spawn_claim", { regionId, lifecycle: LIFECYCLE.ACTIVE });
      return {
        cityId: target.id,
        npcBefore: eligibility.currentNpcCityCount,
        npcAfter: after.currentNpcCityCount,
        subsequentSpawnEligible: after.spawnEligible,
      };
    });
  }

  rejectUnpublishedPackage(regionId, actor) {
    assertAdmin(actor, "unpublished package rejection");
    if (this.publicationMarkers.has(regionId)) throw new Error("Published packages require an explicit versioned migration.");
    const region = this.regions.get(regionId);
    if (region) region.lifecycle = LIFECYCLE.FAILED;
    this.standbyPackages.delete(regionId);
    this.observe("unpublished_package_rejected", { regionId, lifecycle: LIFECYCLE.FAILED });
    return true;
  }

  beginUnpublishedRetry(regionId, actor, retrySalt) {
    assertAdmin(actor, "unpublished package retry");
    if (this.publicationMarkers.has(regionId)) {
      const error = new Error("Published packages are immutable; retry requires a new versioned region/package workflow.");
      error.code = "published-package-immutable";
      throw error;
    }
    assert(String(retrySalt || "").trim(), "A non-empty versioned retry salt is required.");
    const region = this.regions.get(regionId);
    assert(region, `Unknown allocated region ${regionId}.`);
    this.standbyPackages.delete(regionId);
    region.lifecycle = LIFECYCLE.ALLOCATED;
    region.packageHash = "";
    this.observe("unpublished_package_retry", { regionId, lifecycle: LIFECYCLE.ALLOCATED, retry: 1 });
    return {
      regionId,
      coordinate: deepClone(region.coordinate),
      retrySalt: String(retrySalt),
      lifecycle: region.lifecycle,
      coordinateReused: true,
    };
  }

  recoverController(actor) {
    assertAdmin(actor, "controller recovery");
    const actions = [];
    for (const region of this.regions.values()) {
      if (region.lifecycle === LIFECYCLE.ALLOCATED) {
        actions.push({ regionId: region.regionId, action: "resume_generation" });
      } else if ([LIFECYCLE.GENERATING, LIFECYCLE.VALIDATING].includes(region.lifecycle)) {
        region.lifecycle = LIFECYCLE.ALLOCATED;
        actions.push({ regionId: region.regionId, action: "retry_from_allocation" });
      } else if (region.lifecycle === LIFECYCLE.PUBLISHING) {
        if (this.publicationMarkers.has(region.regionId)) {
          region.lifecycle = LIFECYCLE.PUBLISHED;
          actions.push({ regionId: region.regionId, action: "honor_publication_marker" });
        } else {
          this.stagedPublications.delete(region.regionId);
          region.lifecycle = this.standbyPackages.has(region.regionId) ? LIFECYCLE.STANDBY : LIFECYCLE.ALLOCATED;
          actions.push({ regionId: region.regionId, action: "rollback_interrupted_publication" });
        }
      } else {
        actions.push({ regionId: region.regionId, action: "no_change" });
      }
    }
    this.observe("controller_recovery", { outcome: "ok" });
    return actions;
  }

  snapshot() {
    return {
      regionCount: this.regions.size,
      lifecycleCounts: [...this.regions.values()].reduce((counts, region) => {
        counts[region.lifecycle] = (counts[region.lifecycle] || 0) + 1;
        return counts;
      }, {}),
      standbyPackageCount: this.standbyPackages.size,
      publishedPackageCount: this.publicationMarkers.size,
      activeRegionCount: this.activationMarkers.size,
      immutableAssetCount: this.immutableAssets.size,
      stagedPublicationCount: this.stagedPublications.size,
      quarantineCount: this.quarantine.length,
      cityDefinitionCount: [...this.cityDefinitions.values()].reduce((sum, cities) => sum + cities.length, 0),
      initializedCityCount: [...this.cityOwnership.values()].reduce((sum, cities) => sum + cities.length, 0),
      metrics: {
        assetUpload: summarizeTimings(this.metrics.assetUploadMs),
        hashVerification: summarizeTimings(this.metrics.hashVerificationMs),
        metadataPublication: summarizeTimings(this.metrics.metadataPublicationMs),
        activation: summarizeTimings(this.metrics.activationMs),
        duplicatePreventionCount: this.metrics.duplicatePreventionCount,
        gatedToOpenTransitions: this.metrics.gatedToOpenTransitions,
      },
    };
  }
}

class WorldExpansionController {
  constructor({ store, worker, records, metadata, coreRegions, actor }) {
    this.store = store;
    this.worker = worker;
    this.records = records;
    this.metadata = metadata;
    this.actor = actor;
    this.regionsForAllocation = [...coreRegions];
    this.nextRecordIndex = 0;
    this.generationTimings = [];
  }

  inheritedContractsForAllocation(allocation) {
    const inherited = {};
    for (const [side, connection] of Object.entries(allocation.connections)) {
      if (connection.state !== "open") continue;
      const neighborHash = this.store.publicationMarkers.get(connection.targetRegionId);
      const neighbor = neighborHash ? this.store.immutablePackages.get(neighborHash) : null;
      if (!neighbor) continue;
      const oppositeContract = neighbor.edgeContracts.sides[OPPOSITE[side]];
      inherited[side] = {
        regionId: neighbor.identity.regionId,
        side: OPPOSITE[side],
        contractHash: oppositeContract.sourceContractHash,
      };
    }
    return inherited;
  }

  async prepareNext({ faultAt = "" } = {}) {
    const record = this.records[this.nextRecordIndex];
    assert(record, "The Phase 7 integration record pool is exhausted.");
    const allocation = allocateNextPlayerRegion({
      worldId: this.metadata.worldId,
      seasonId: this.metadata.seasonId,
      existingRegions: this.regionsForAllocation,
      regionId: record.regionId,
      generatorVersion: this.metadata.generatorVersion,
    });
    assert.deepEqual(allocation.coordinate, record.coordinate, `Clockwise allocation drifted for ${record.regionId}.`);
    await this.store.registerAllocation(allocation, this.actor);
    this.store.regions.get(record.regionId).lifecycle = LIFECYCLE.GENERATING;
    this.store.observe("generation_start", { regionId: record.regionId, lifecycle: LIFECYCLE.GENERATING });
    const startedAt = performance.now();
    const inherited = this.inheritedContractsForAllocation(allocation);
    let packageValue;
    try {
      packageValue = this.worker.generate({ record, allocation, inheritedEdgeContracts: inherited, faultAt });
    } catch (error) {
      this.store.regions.get(record.regionId).lifecycle = LIFECYCLE.ALLOCATED;
      this.store.observe("generation_end", { regionId: record.regionId, lifecycle: LIFECYCLE.ALLOCATED, outcome: "failed" });
      throw error;
    }
    this.generationTimings.push(performance.now() - startedAt);
    this.store.regions.get(record.regionId).lifecycle = LIFECYCLE.VALIDATING;
    await this.store.saveStandbyPackage(packageValue, this.actor);
    this.store.observe("generation_end", {
      regionId: record.regionId,
      lifecycle: LIFECYCLE.STANDBY,
      durationMs: performance.now() - startedAt,
    });
    this.regionsForAllocation.push({
      id: allocation.regionId,
      purpose: "player_region",
      permanentCore: false,
      lifecycle: "standby",
      gridX: allocation.coordinate.gridX,
      gridY: allocation.coordinate.gridY,
      worldLayer: allocation.coordinate.worldLayer,
      clockwiseOrderIndex: allocation.coordinate.clockwiseOrderIndex,
      connections: allocation.connections,
    });
    this.regionsForAllocation = refreshRegionConnections(this.regionsForAllocation);
    this.nextRecordIndex += 1;
    return { allocation, packageValue };
  }

  async maintainStandbyBuffer(size) {
    assert([1, 2].includes(size), "Phase 7 evaluates STANDBY buffers of one or two.");
    const created = [];
    while ([...this.store.regions.values()].filter(region => region.lifecycle === LIFECYCLE.STANDBY).length < size) {
      created.push(await this.prepareNext());
    }
    return created;
  }

  orderedRegions(lifecycle) {
    return [...this.store.regions.values()]
      .filter(region => !lifecycle || region.lifecycle === lifecycle)
      .sort((left, right) => left.layer - right.layer || left.clockwiseSlot - right.clockwiseSlot);
  }

  async publishNext() {
    const next = this.orderedRegions(LIFECYCLE.STANDBY)[0];
    assert(next, "No STANDBY region is ready for publication.");
    return this.store.publishPackage(next.regionId, this.actor);
  }

  async activateNextPublished() {
    const active = this.orderedRegions(LIFECYCLE.ACTIVE);
    const published = this.orderedRegions(LIFECYCLE.PUBLISHED);
    const next = published[0];
    assert(next, "No PUBLISHED region is ready for activation.");
    const expectedOrder = active.length ? active[active.length - 1].clockwiseSlot + 1 : 0;
    if (next.layer === 1) assert.equal(next.clockwiseSlot, expectedOrder, "Activation skipped the clockwise frontier.");
    return this.store.activateRegion(next.regionId, this.actor);
  }

  generationMetrics() {
    return summarizeTimings(this.generationTimings);
  }
}

class LazyCombinedCatalogAdapter {
  constructor({ productionCatalog, store, cacheLimit = 4 }) {
    this.productionCatalog = productionCatalog;
    this.store = store;
    this.cacheLimit = cacheLimit;
    this.cache = new Map();
    this.metrics = { catalogLookups: [], regionFetches: [], transitions: [] };
  }

  listCatalog() {
    const startedAt = performance.now();
    const generated = [...this.store.runtimeCatalog.values()].map(region => ({
      id: region.id,
      lifecycle: region.lifecycle,
      active: region.active,
      coordinate: region.coordinate,
      layer: region.layer,
      clockwiseSlot: region.clockwiseSlot,
      packageHash: region.packageHash,
      regionDefinitionPath: region.regionDefinitionPath,
      mapAsset: region.mapAsset,
      thumbnailAsset: region.thumbnailAsset,
    }));
    const catalog = {
      schemaVersion: "phase7-combined-catalog-v1",
      currentHandcraftedRegions: this.productionCatalog.regions.map(region => ({
        id: region.id,
        lifecycle: region.lifecycle,
        permanentCore: region.permanentCore,
        regionDefinitionPath: region.regionDefinitionPath,
        mapAsset: region.mapAsset,
        thumbnailAsset: region.thumbnailAsset,
      })),
      generatedRegions: generated,
      definitionsIncluded: false,
      cityDefinitionsIncluded: false,
      mapBytesIncluded: false,
      topologyDetailsIncluded: false,
    };
    const bytes = Buffer.byteLength(stableJson(catalog));
    this.metrics.catalogLookups.push(performance.now() - startedAt);
    return { catalog, bytes };
  }

  fetchRegion(regionId) {
    const startedAt = performance.now();
    if (this.cache.has(regionId)) {
      const cached = this.cache.get(regionId);
      this.cache.delete(regionId);
      this.cache.set(regionId, cached);
      this.metrics.regionFetches.push(performance.now() - startedAt);
      return { value: cached, cacheHit: true, bytes: Buffer.byteLength(stableJson(cached)) };
    }
    const packageHash = this.store.publicationMarkers.get(regionId);
    if (!packageHash) throw new Error(`Generated region ${regionId} is not PUBLISHED.`);
    const packageValue = this.store.immutablePackages.get(packageHash);
    const value = {
      regionDefinition: packageValue.regionDefinition,
      cities: this.store.cityDefinitions.get(regionId),
      topology: this.store.runtimeTopology.get(regionId),
      edgeContracts: packageValue.edgeContracts,
      mapAsset: packageValue.storage.files["map.webp"].path,
      thumbnailAsset: packageValue.storage.files["thumbnail.webp"].path,
    };
    this.cache.set(regionId, value);
    while (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
    this.metrics.regionFetches.push(performance.now() - startedAt);
    return { value, cacheHit: false, bytes: Buffer.byteLength(stableJson(value)) };
  }

  transition(fromRegionId, toRegionId) {
    const startedAt = performance.now();
    const topology = this.store.runtimeTopology.get(fromRegionId);
    assert(Object.values(topology || {}).some(edge => edge.state === "open" && edge.targetRegionId === toRegionId));
    const result = this.fetchRegion(toRegionId);
    this.metrics.transitions.push(performance.now() - startedAt);
    return result;
  }

  snapshot() {
    return {
      cacheLimit: this.cacheLimit,
      cacheSize: this.cache.size,
      catalogLookups: summarizeTimings(this.metrics.catalogLookups),
      regionFetches: summarizeTimings(this.metrics.regionFetches),
      transitions: summarizeTimings(this.metrics.transitions),
    };
  }
}

function createCurrentProductionWorldAdapter() {
  const catalog = require("../../functions/region-catalog.json");
  const layout = require("../../functions/world-layout.json");
  assert.equal(catalog.regions.length, 15);
  assert.equal(layout.maps.length, 15);
  assert.equal(catalog.regions.reduce((sum, region) => sum + region.npcCityCount, 0), 1050);
  assert.equal(regionCatalogRuntime.validateCatalog(catalog).length, 0);
  return {
    adapterVersion: "phase7-current-world-adapter-v1",
    catalog,
    productionMapCount: catalog.regions.length,
    productionCityCount: catalog.regions.reduce((sum, region) => sum + region.npcCityCount, 0),
    directedMapChainCount: 210,
    generatedActiveRegionCount: 0,
    genericGeneratorUsedForCore: false,
    reservedCoreCoordinates: catalog.coreReservations,
  };
}

function createStudioAdminContract() {
  return {
    schemaVersion: ADMIN_CONTRACT_VERSION,
    minimumRole: "crownlands_map_admin",
    readModels: {
      worldGrid: ["coreReservations", "outerRings", "lifecycle"],
      regionInspection: [
        "mapPreview", "fortyCities", "startingCandidates", "blockers", "roads",
        "edgeContracts", "packageHash", "validationReceipt", "generatorVersion", "assetLibraryVersion",
      ],
    },
    lifecycleStates: Object.values(LIFECYCLE),
    actions: {
      generate: { unpublishedOnly: true, serverAuthoritative: true },
      rejectUnpublished: { unpublishedOnly: true, serverAuthoritative: true },
      regenerateUnpublished: { unpublishedOnly: true, versionedRetrySalt: true },
      approvePublication: { explicitApproval: true, atomic: true },
      approveActivation: { explicitApproval: true, atomic: true },
    },
    forbiddenForNormalPlayers: [
      "generate", "publish", "activate", "rewritePackage", "alterEdgeContract",
      "alterPackageHash", "forceConnectionOpen", "chooseCoordinate", "bypassNpcThreshold",
    ],
    largeStudioRedesignIncluded: false,
  };
}

function storageProjection(phase6fResults) {
  const runtimePerRegion = phase6fResults.storage.actualRuntimeMapAndThumbnailBytesFor10000 / 10000;
  const packageMetadataPerRegion = 36 * 1024;
  const receiptAndIndexPerRegion = 6 * 1024;
  const projections = {};
  for (const count of [1000, 10000, 100000]) {
    const runtimeBytes = Math.round(runtimePerRegion * count);
    const metadataBytes = (packageMetadataPerRegion + receiptAndIndexPerRegion) * count;
    projections[count] = {
      runtimeMapAndThumbnailBytes: runtimeBytes,
      runtimeMapAndThumbnailGiB: runtimeBytes / (1024 ** 3),
      immutableMetadataAndReceiptBytes: metadataBytes,
      completePackageProjectionBytes: runtimeBytes + metadataBytes,
      completePackageProjectionGiB: (runtimeBytes + metadataBytes) / (1024 ** 3),
    };
  }
  return {
    phase6fRuntimeBaselineBytesPerRegion: runtimePerRegion,
    packageMetadataPlanningBytesPerRegion: packageMetadataPerRegion,
    receiptAndIndexPlanningBytesPerRegion: receiptAndIndexPerRegion,
    projections,
    imageQualityChanged: false,
  };
}

module.exports = Object.freeze({
  ROOT,
  PHASE,
  PACKAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_VERSION,
  PUBLICATION_SCHEMA_VERSION,
  ACTIVATION_SCHEMA_VERSION,
  ADMIN_CONTRACT_VERSION,
  ASSET_MANIFEST_HASH,
  PHASE6F_ROOT,
  LIFECYCLE,
  SIDES,
  OPPOSITE,
  DELTAS,
  stableJson,
  sha256,
  hashValue,
  coordinateKey,
  neighborCoordinate,
  summarizeTimings,
  createAdminActor,
  readLockedAssetManifest,
  loadApprovedPhase6FRecords,
  validateMinimumSpacing,
  validateStandbyPackage,
  immutablePackageBasePath,
  RoadPresentationCache,
  ApprovedPhase6FPackageWorker,
  Phase7IntegrationStore,
  WorldExpansionController,
  LazyCombinedCatalogAdapter,
  createCurrentProductionWorldAdapter,
  createStudioAdminContract,
  storageProjection,
});
