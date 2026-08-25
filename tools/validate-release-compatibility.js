const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const gameSource = read("game.js");
const serverRealm = JSON.parse(read("functions/release-config.json"));

const LEGACY_CONTRACT_HASH = "e6029faf76eb863612cebf975f69bbd2e5116571153a916993825a7a7f674020";
const CONTRACT_V2_SEED = [
  "crownlands-api-contract-v2",
  "repairMainCityAssignment:authoritative-main-city-recovery-v2",
  "",
].join("\n");
const CONTRACT_V2_HASH = crypto.createHash("sha256").update(CONTRACT_V2_SEED, "utf8").digest("hex");

assert.equal(
  serverRealm.apiContractHash,
  CONTRACT_V2_HASH,
  "The explicit API contract does not match the reviewed Main City recovery v2 contract seed."
);
assert.notEqual(
  serverRealm.apiContractHash,
  LEGACY_CONTRACT_HASH,
  "The authoritative Main City recovery response cannot reuse the legacy API contract."
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const compatibilitySource = sourceBetween(
  gameSource,
  "async function verifyRealmCompatibility",
  "function resolveMainCityRecoveryResult"
);
const recoverySource = sourceBetween(
  gameSource,
  "function resolveMainCityRecoveryResult",
  "async function requestAuthoritativeMainCityRecovery"
);

function createClientSandbox(contractHash, buildId) {
  const infoMessages = [];
  const sandbox = {
    APP_RELEASE_ID: serverRealm.releaseId,
    RESET_GENERATION: serverRealm.resetGeneration,
    ONLINE_WORLD_ID: serverRealm.worldId,
    verifiedRealmInfo: null,
    activeClanQuestPeriod: null,
    clanQuestServerClockOffsetMs: 0,
    clearInstantEconomyActions: () => {},
    getCurrentClanQuestPeriod: () => ({ period: "test" }),
    withTimeout: promise => promise,
    window: {
      CROWNLANDS_RELEASE_MANIFEST: {
        buildId,
        releaseId: serverRealm.releaseId,
        resetGeneration: serverRealm.resetGeneration,
        worldId: serverRealm.worldId,
        contractHash,
      },
    },
    console: {
      info: (...args) => infoMessages.push(args),
      warn: () => {},
      error: () => {},
      log: () => {},
    },
    Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${compatibilitySource}; this.verifyRealmCompatibility = verifyRealmCompatibility;`,
    sandbox
  );
  sandbox.infoMessages = infoMessages;
  return sandbox;
}

function createRealm(contractHash, serverBuildId) {
  return {
    releaseId: serverRealm.releaseId,
    resetGeneration: serverRealm.resetGeneration,
    worldId: serverRealm.worldId,
    contractHash,
    serverBuildId,
    serverTimeMs: Date.now(),
  };
}

async function expectAdmission(clientContract, clientBuild, serverContract, serverBuild) {
  const sandbox = createClientSandbox(clientContract, clientBuild);
  const realm = createRealm(serverContract, serverBuild);
  const result = await sandbox.verifyRealmCompatibility({ getRealmInfo: async () => realm }, { force: true });
  assert.equal(result, realm);
  return sandbox;
}

async function expectUpdateBlock(clientContract, clientBuild, serverContract, serverBuild) {
  const sandbox = createClientSandbox(clientContract, clientBuild);
  await assert.rejects(
    sandbox.verifyRealmCompatibility(
      { getRealmInfo: async () => createRealm(serverContract, serverBuild) },
      { force: true }
    ),
    /update is still deploying/i
  );
}

function createRecoverySandbox() {
  const sandbox = {
    getKnownCityId: value => (/^[a-z0-9_-]+$/i.test(String(value || "")) ? String(value) : ""),
    getRegionIds: () => ["west", "region_11"],
    getCityRegionId: cityId => String(cityId || "").split("_city_")[0] || "west",
    getOnlineIslandId: regionId => `main-${regionId}`,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${recoverySource}; this.resolveMainCityRecoveryResult = resolveMainCityRecoveryResult;`,
    sandbox
  );
  return sandbox.resolveMainCityRecoveryResult;
}

function readGeneratedBrowserManifest() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read("release-manifest.js"), sandbox);
  return sandbox.window.CROWNLANDS_RELEASE_MANIFEST;
}

async function main() {
  await expectAdmission(LEGACY_CONTRACT_HASH, "legacy-client", LEGACY_CONTRACT_HASH, "legacy-server");
  await expectUpdateBlock(LEGACY_CONTRACT_HASH, "legacy-client", CONTRACT_V2_HASH, "current-server");
  await expectUpdateBlock(CONTRACT_V2_HASH, "current-client", LEGACY_CONTRACT_HASH, "legacy-server");
  await expectAdmission(CONTRACT_V2_HASH, "current-client", CONTRACT_V2_HASH, "current-server");

  const mixedBuilds = await expectAdmission(
    CONTRACT_V2_HASH,
    "current-client-a",
    CONTRACT_V2_HASH,
    "current-server-b"
  );
  assert.equal(
    mixedBuilds.infoMessages.length,
    1,
    "Compatible builds with different build IDs should be admitted with one diagnostic message."
  );

  const resolveRecovery = createRecoverySandbox();
  assert.throws(
    () => resolveRecovery({
      ok: true,
      repairedMainCity: true,
      currentUser: {
        mainCityId: "region_11_city_001",
        mainRegionId: "region_11",
        mainIslandId: "main-region_11",
      },
    }),
    /authoritative recovery result/i,
    "The current client accepted the legacy Main City recovery response."
  );
  for (const status of ["valid", "repaired"]) {
    assert.equal(resolveRecovery({
      ok: true,
      requiresStartingCityClaim: false,
      mainCityRecoveryStatus: status,
      currentUser: {
        mainCityId: "region_11_city_001",
        mainRegionId: "region_11",
        mainIslandId: "main-region_11",
      },
    }).status, status);
  }
  assert.equal(resolveRecovery({
    ok: true,
    requiresStartingCityClaim: true,
    mainCityRecoveryStatus: "claim-required",
    recoveryReason: "no-valid-owned-regular-city",
  }).status, "claim-required");

  const serverManifest = JSON.parse(read("functions/release-manifest.json"));
  const browserManifest = readGeneratedBrowserManifest();
  assert.equal(serverManifest.contractHash, CONTRACT_V2_HASH);
  assert.equal(browserManifest.contractHash, CONTRACT_V2_HASH);
  assert.equal(browserManifest.contractHash, serverManifest.contractHash);
  for (const field of ["buildId", "releaseId", "resetGeneration", "worldId", "callableCount"]) {
    assert.equal(browserManifest[field], serverManifest[field], `Generated manifests drifted for ${field}.`);
  }

  console.log("Release compatibility validation passed for legacy/current client and server combinations.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
