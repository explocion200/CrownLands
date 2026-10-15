"use strict";
// Read-only migration discovery. Persist only explicitly selected metadata and counts.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const REALM_FIELDS = ["releaseId", "worldId", "resetGeneration", "sharedRealmId", "topology", "status"];
const PROVIDERS = new Set(["google.com", "password", "apple.com", "facebook.com", "github.com", "microsoft.com", "twitter.com", "phone"]);
const FACTORIES = new Set(["onCall", "firebaseOnCall", "timedCallable", "onRequest", "onSchedule", "onDocumentCreated", "onDocumentWritten"]);

function sourceFunctions(source) {
  const entries = [...source.matchAll(/^exports\.(\w+)\s*=\s*(exports\.\w+|\w+)/gm)]
    .map(([, name, factory]) => ({ name, factory }));
  const names = new Set(entries.map(item => item.name));
  if (names.size !== entries.length) throw Error("Duplicate source export; inspect manually.");
  return entries.map(item => {
    const alias = item.factory.startsWith("exports.") ? item.factory.slice(8) : null;
    const factory = alias ? entries.find(entry => entry.name === alias)?.factory : item.factory;
    return { name: item.name, kind: FACTORIES.has(factory) ? factory : "unclassified", ...(alias ? { aliasOf: alias } : {}) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function addAccountCounts(counts, users) {
  for (const user of users) {
    counts.total++;
    if (user.emailVerified === true) counts.emailVerified++;
    if (user.disabled === true) counts.disabled++;
    const providers = new Set((user.providerUserInfo || []).map(item => PROVIDERS.has(item.providerId) ? item.providerId : "other"));
    if (!providers.size) counts.noListedProvider++;
    if (providers.size > 1) counts.multipleProviders++;
    for (const provider of providers) counts.providers[provider] = (counts.providers[provider] || 0) + 1;
  }
  return counts;
}

function authSettings(config) {
  return {
    emailPasswordEnabled: config.signIn?.email?.enabled === true,
    passwordHashAlgorithm: config.signIn?.hashConfig?.algorithm || null,
    passwordPolicyEnforcement: config.passwordPolicyConfig?.passwordPolicyEnforcementState || null,
    tenantsEnabled: config.multiTenant?.allowTenants === true,
    // Do not return OAuth secrets, hash keys/salts, email templates or account identities.
  };
}

async function eachPage(read, consume) {
  const seen = new Set();
  let token;
  for (let page = 0; page < 10000; page++) {
    const result = await read(token);
    await consume(result);
    token = result.nextPageToken;
    if (!token) return;
    if (seen.has(token)) throw Error("Pagination repeated; inventory is incomplete.");
    seen.add(token);
  }
  throw Error("Pagination limit reached; inventory is incomplete.");
}

function apiReader(project, token, fetcher = fetch) {
  return async (url, body) => {
    let response;
    try {
      response = await fetcher(url, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": project, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(45000),
        redirect: "error",
      });
    } catch (_error) { throw Error("Google API transport failed; inventory is incomplete."); }
    // Never surface response bodies, credentials, private values or pagination tokens in errors.
    if (!response.ok) throw Error(`Google API returned HTTP ${response.status}; inventory is incomplete.`);
    try { return await response.json(); }
    catch (_error) { throw Error("Google API returned invalid JSON; inventory is incomplete."); }
  };
}

async function inventory(project, source, read) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) throw Error("Invalid project ID.");
  const startedAt = new Date().toISOString();
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`;
  const database = await read(base);
  const pointer = await read(`${base}/documents/realmConfig/current`);
  const currentRealm = Object.fromEntries(REALM_FIELDS.map(key => [key, pointer.fields?.[key]?.stringValue || null]));
  if (!currentRealm.worldId || !currentRealm.resetGeneration || !currentRealm.sharedRealmId) throw Error("Live realm pointer is incomplete.");
  const config = await read(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config?fields=signIn(email(enabled),hashConfig(algorithm)),passwordPolicyConfig(passwordPolicyEnforcementState),multiTenant(allowTenants)`);
  const authentication = { ...authSettings(config), total: 0, emailVerified: 0, disabled: 0, noListedProvider: 0, multipleProviders: 0, providers: {} };
  if (authentication.tenantsEnabled) throw Error("Tenant inventory is required before migration; this tool covers the default tenant only.");
  await eachPage(token => read(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?${new URLSearchParams({
    maxResults: "1000", fields: "users(providerUserInfo(providerId),emailVerified,disabled),nextPageToken", ...(token ? { nextPageToken: token } : {}),
  })}`), page => addAccountCounts(authentication, page.users || []));
  const functions = [];
  await eachPage(token => read(`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions?${new URLSearchParams({ pageSize: "1000", fields: "functions(name,state,buildConfig(runtime),eventTrigger(eventType)),nextPageToken,unreachable", ...(token ? { pageToken: token } : {}) })}`), page => {
    if (page.unreachable?.length) throw Error("Some function regions are unreachable; inventory is incomplete.");
    for (const item of page.functions || []) functions.push({ name: item.name.split("/").at(-1), region: item.name.split("/")[3], state: item.state || null, runtime: item.buildConfig?.runtime || null, eventType: item.eventTrigger?.eventType || null });
  });
  functions.sort((a, b) => a.name.localeCompare(b.name));
  const scheduler = [];
  for (const region of [...new Set(functions.map(item => item.region))]) {
    await eachPage(token => read(`https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/${region}/jobs?${new URLSearchParams({ pageSize: "500", fields: "jobs(name,schedule,timeZone,state),nextPageToken", ...(token ? { pageToken: token } : {}) })}`), page => {
      for (const job of page.jobs || []) scheduler.push({ name: job.name.split("/").at(-1), region, schedule: job.schedule, timeZone: job.timeZone, state: job.state });
    });
  }
  const buckets = [];
  await eachPage(token => read(`https://storage.googleapis.com/storage/v1/b?${new URLSearchParams({ project, fields: "items(name,location),nextPageToken", ...(token ? { pageToken: token } : {}) })}`), page => {
    for (const bucket of page.items || []) buckets.push({ name: bucket.name, location: bucket.location });
  });
  const topLevelCollections = [];
  await eachPage(token => read(`${base}/documents:listCollectionIds`, { pageSize: 1000, ...(token ? { pageToken: token } : {}) }), async page => {
    for (const id of page.collectionIds || []) {
      const rows = await read(`${base}/documents:runAggregationQuery`, { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: id }] }, aggregations: [{ count: {}, alias: "documentCount" }] } });
      const result = rows.find(row => row.result?.aggregateFields?.documentCount);
      const count = result?.result.aggregateFields.documentCount.integerValue;
      if (!/^\d+$/.test(count || "")) throw Error("Collection count is unavailable; inventory is incomplete.");
      topLevelCollections.push({ id, documentCount: count, readTime: result.readTime || null });
    }
  });
  const localFunctions = sourceFunctions(source);
  const localNames = new Set(localFunctions.map(item => item.name));
  const deployedNames = new Set(functions.map(item => item.name));
  return {
    schemaVersion: 1, project, startedAt, completedAt: new Date().toISOString(),
    database: { location: database.locationId, edition: database.databaseEdition, type: database.type, pointInTimeRecovery: database.pointInTimeRecoveryEnablement, deleteProtection: database.deleteProtectionState },
    currentRealm, authentication, functions, localFunctions, scheduler, buckets,
    topLevelCollections: topLevelCollections.sort((a, b) => a.id.localeCompare(b.id)),
    comparison: { onlyInSource: [...localNames].filter(name => !deployedNames.has(name)), onlyDeployed: [...deployedNames].filter(name => !localNames.has(name)), unclassified: localFunctions.filter(item => item.kind === "unclassified").map(item => item.name) },
    limitations: [
      "Discovery only: no player records, password hashes, secrets or database contents are exported or imported.",
      "Collection counts cover immediate top-level documents, excluding all nested subcollections. Each count has its own read time; this is not a consistent migration snapshot.",
      "Source export classification recognizes current top-level exports and direct aliases; it is not a JavaScript parser or proof of behavioral parity.",
      "Scheduler discovery covers regions with deployed functions. Bucket metadata does not establish object counts or contents.",
      "Authentication totals are a paginated observation, not a frozen account snapshot or proof that existing passwords can be verified locally.",
    ],
  };
}

async function main(args) {
  if (args.length) throw Error("This read-only tool takes no arguments and uses .firebaserc's default project.");
  const project = JSON.parse(fs.readFileSync(path.join(ROOT, ".firebaserc"), "utf8")).projects.default;
  let token;
  try { token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (_error) { throw Error("An authorized Google Cloud CLI login is required."); }
  if (!token) throw Error("Google Cloud CLI returned no access token.");
  const report = await inventory(project, fs.readFileSync(path.join(ROOT, "functions/index.js"), "utf8"), apiReader(project, token));
  const parent = path.join(os.homedir(), ".local/share/crownlands");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const output = fs.mkdtempSync(path.join(parent, "firebase-migration-inventory-"));
  fs.chmodSync(output, 0o700);
  fs.writeFileSync(path.join(output, "inventory.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(`Read-only inventory saved to ${output}/inventory.json`);
  console.log(`${report.functions.length} deployed functions, ${report.scheduler.length} scheduled jobs, ${report.authentication.total} accounts. No live data changed.`);
}

module.exports = { addAccountCounts, apiReader, authSettings, eachPage, inventory, sourceFunctions };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  // Unknown filesystem/runtime errors can contain data: show only our controlled error messages.
  const safe = /^(Google API |An authorized Google Cloud CLI |Google Cloud CLI |Invalid project ID\.|Live realm pointer |Tenant inventory |Some function regions |Collection count |Pagination |Duplicate source export|This read-only tool )/.test(error.message);
  console.error(safe ? error.message : "Migration inventory failed; no complete inventory was produced.");
  process.exitCode = 1;
});
