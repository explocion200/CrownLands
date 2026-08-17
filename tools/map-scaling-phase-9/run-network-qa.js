"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { CONFIG, requireExplicitProjectIdentity, environmentBanner } = require("./environment");
const { getDocument, getStagingWebConfig, createAnonymousIdentity } = require("./staging-api");

const RESULTS_ROOT = path.resolve(__dirname, "../../docs/map-scaling-audit/phase-9/results");
const RESULT_PATH = path.join(RESULTS_ROOT, "NETWORK_QA.json");

function objectUrl(objectPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(CONFIG.storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

async function timedFetch(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, options);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    elapsedMs: performance.now() - started,
    bytes: bytes.length,
    etag: response.headers.get("etag"),
    cacheControl: response.headers.get("cache-control"),
  };
}

async function simulatedConstrainedFetch(url, profile, headers) {
  const started = performance.now();
  await new Promise(resolve => setTimeout(resolve, profile.latencyMs));
  const response = await fetch(url, { cache: "no-store", headers });
  const bytes = Buffer.from(await response.arrayBuffer());
  const transferDelay = Math.ceil((bytes.length * 8 * 1000) / profile.bitsPerSecond);
  await new Promise(resolve => setTimeout(resolve, transferDelay));
  return {
    status: response.status,
    elapsedMs: performance.now() - started,
    actualHttpBytes: bytes.length,
    modeledLatencyMs: profile.latencyMs,
    modeledBitsPerSecond: profile.bitsPerSecond,
    model: "real staging response plus deterministic client-side latency/throughput throttling",
  };
}

async function main() {
  const identity = requireExplicitProjectIdentity({
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
  });
  console.log(environmentBanner(identity));
  const { sdk } = getStagingWebConfig();
  const syntheticPlayer = await createAnonymousIdentity(sdk.apiKey);
  const authHeaders = { Authorization: `Firebase ${syntheticPlayer.idToken}` };
  const worldRoot = `generatedWorlds/${CONFIG.syntheticWorldId}/seasons/${CONFIG.syntheticSeasonId}`;
  const regionIds = ["phase6d_region_0001", "phase6d_region_0002"];
  const urls = [];
  for (const regionId of regionIds) {
    const region = await getDocument(`${worldRoot}/regions/${regionId}`);
    assert.equal(region.data.lifecycle, "ACTIVE");
    const packageDocument = await getDocument(`${worldRoot}/packages/${region.data.packageHash}`);
    const mapObject = packageDocument.data.objects.find(object => object.name === "map.webp");
    urls.push({ regionId, objectPath: mapObject.path, url: objectUrl(mapObject.path), expectedBytes: mapObject.bytes });
  }

  const goodWifi = await timedFetch(urls[0].url, { cache: "no-store", headers: authHeaders });
  assert.equal(goodWifi.status, 200);
  assert.equal(goodWifi.bytes, urls[0].expectedBytes);
  const cachedRepeat = await timedFetch(urls[0].url, { headers: { ...authHeaders, "If-None-Match": goodWifi.etag } });
  assert.equal(cachedRepeat.status, 304);
  assert.equal(cachedRepeat.bytes, 0);

  const moderateMobile = await simulatedConstrainedFetch(urls[0].url, {
    latencyMs: 150,
    bitsPerSecond: 5_000_000,
  }, authHeaders);
  const slowNetwork = await simulatedConstrainedFetch(urls[1].url, {
    latencyMs: 400,
    bitsPerSecond: 1_000_000,
  }, authHeaders);
  assert.equal(moderateMobile.status, 200);
  assert.equal(slowNetwork.status, 200);

  const transitionStart = performance.now();
  const transitionResponse = await fetch(urls[1].url, { cache: "no-store", headers: authHeaders });
  const transitionBytes = Buffer.from(await transitionResponse.arrayBuffer());
  const transitionMs = performance.now() - transitionStart;
  assert.equal(transitionResponse.status, 200);
  assert.equal(transitionBytes.length, urls[1].expectedBytes);

  const failedUrl = objectUrl(`${urls[0].objectPath}.missing-phase9-proof`);
  const failedRequest = await timedFetch(failedUrl, { cache: "no-store", headers: authHeaders });
  assert(failedRequest.status >= 400, `Expected a failed request; received ${failedRequest.status}.`);
  const recovery = await timedFetch(urls[0].url, { cache: "no-store", headers: authHeaders });
  assert.equal(recovery.status, 200);

  const result = {
    schemaVersion: "phase9-network-qa-result-v1",
    environment: "STAGING",
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    endpointsWereRealStagingStorage: true,
    syntheticAuthenticatedPlayer: true,
    goodWifi: { ...goodWifi, etagPresent: Boolean(goodWifi.etag), etag: undefined },
    cachedRepeat: { ...cachedRepeat, etag: undefined },
    moderateMobile,
    throttledSlowNetwork: slowNetwork,
    regionTransition: { status: transitionResponse.status, elapsedMs: transitionMs, bytes: transitionBytes.length },
    failedRequestRecovery: {
      initialStatus: failedRequest.status,
      recoveryStatus: recovery.status,
      recoveryMs: recovery.elapsedMs,
      recovered: recovery.status === 200,
    },
    limitation: "Moderate and slow profiles use deterministic client-side throttling over real staging HTTP responses; they are not carrier-field measurements.",
    productionMutationPerformed: false,
    result: "PASS_WITH_LIMITATION",
    completedAt: new Date().toISOString(),
  };
  fs.mkdirSync(RESULTS_ROOT, { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    result: result.result,
    goodWifiMs: goodWifi.elapsedMs,
    cachedRepeatStatus: cachedRepeat.status,
    moderateMobileMs: moderateMobile.elapsedMs,
    slowNetworkMs: slowNetwork.elapsedMs,
    transitionMs,
    failedRequestRecovered: true,
    productionMutationPerformed: false,
    resultPath: path.relative(process.cwd(), RESULT_PATH),
  }, null, 2));
}

main().catch(error => {
  console.error(`${error.code || "phase9-network-qa-error"}: ${error.stack || error.message}`);
  process.exitCode = 1;
});
