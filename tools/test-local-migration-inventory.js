"use strict";
const assert = require("node:assert/strict");
const { addAccountCounts, apiReader, authSettings, eachPage, inventory, sourceFunctions } = require("./read-local-migration-inventory");

async function main() {
  const secret = "PRIVATE-MUST-NEVER-APPEAR";
  const counts = { total: 0, emailVerified: 0, disabled: 0, noListedProvider: 0, multipleProviders: 0, providers: {} };
  addAccountCounts(counts, [
    { localId: secret, email: secret, passwordHash: secret, emailVerified: true, providerUserInfo: [{ providerId: "google.com" }, { providerId: "password" }, { providerId: "google.com" }] },
    { disabled: true, providerUserInfo: [{ providerId: secret }] },
    {},
  ]);
  assert.deepEqual(counts, { total: 3, emailVerified: 1, disabled: 1, noListedProvider: 1, multipleProviders: 1, providers: { "google.com": 1, password: 1, other: 1 } });
  assert(!JSON.stringify(counts).includes(secret));
  const settings = authSettings({ signIn: { email: { enabled: true }, hashConfig: { algorithm: "SCRYPT", signerKey: secret, saltSeparator: secret } }, passwordPolicyConfig: { passwordPolicyEnforcementState: "ENFORCE" }, secret });
  assert.equal(settings.passwordHashAlgorithm, "SCRYPT");
  assert(!JSON.stringify(settings).includes(secret));
  assert.deepEqual(sourceFunctions("exports.x = onCall(handler);\nexports.y = exports.x;\nexports.z = unexpected();"), [
    { name: "x", kind: "onCall" }, { name: "y", kind: "onCall", aliasOf: "x" }, { name: "z", kind: "unclassified" },
  ]);
  assert.throws(() => sourceFunctions("exports.x = onCall();\nexports.x = onCall();"), /Duplicate/);
  const tokens = [], values = [];
  await eachPage(async token => { tokens.push(token); return token ? { values: [2] } : { values: [1], nextPageToken: "next" }; }, page => values.push(...page.values));
  assert.deepEqual(tokens, [undefined, "next"]); assert.deepEqual(values, [1, 2]);
  await assert.rejects(eachPage(async () => ({ nextPageToken: secret }), () => {}), /Pagination repeated/);
  await assert.rejects(apiReader("project", secret, async () => { throw Error(secret); })("https://example.invalid"), error => !error.message.includes(secret));
  await assert.rejects(apiReader("project", secret, async () => ({ ok: false, status: 403, json: () => { throw Error(secret); } }))("https://example.invalid"), /HTTP 403/);
  await assert.rejects(apiReader("project", secret, async () => ({ ok: true, json: () => { throw Error(secret); } }))("https://example.invalid"), /invalid JSON/);
  let transport;
  await apiReader("test-project", secret, async (url, options) => { transport = { url, options }; return { ok: true, json: async () => ({}) }; })("https://example.invalid/read", { query: "count" });
  assert.equal(transport.options.headers["x-goog-user-project"], "test-project");
  assert.equal(transport.options.redirect, "error");
  assert.equal(transport.options.method, "POST");
  assert.deepEqual(JSON.parse(transport.options.body), { query: "count" });

  const calls = [];
  const read = async (url, body) => {
    calls.push({ url, body });
    if (url.endsWith("/databases/(default)")) return { locationId: "nam5", databaseEdition: "STANDARD", type: "FIRESTORE_NATIVE", privateField: secret };
    if (url.endsWith("/documents/realmConfig/current")) return { fields: { worldId: { stringValue: "current-world" }, resetGeneration: { stringValue: "realm-test" }, sharedRealmId: { stringValue: "shard_0001" }, privateField: { stringValue: secret } } };
    if (url.includes("/config?")) return { signIn: { email: { enabled: true }, hashConfig: { algorithm: "SCRYPT", signerKey: secret } } };
    if (url.includes("accounts:batchGet?")) return url.includes("nextPageToken=") ? { users: [{}] } : { users: [{ localId: secret, providerUserInfo: [{ providerId: "google.com" }] }], nextPageToken: secret };
    if (url.includes("/functions?")) return { functions: [{ name: "projects/test-project/locations/us-central1/functions/x", state: "ACTIVE", serviceConfig: { secretEnvironmentVariables: [secret] } }, { name: "projects/test-project/locations/us-central1/functions/liveOnly", state: "ACTIVE" }] };
    if (url.includes("/jobs?")) return { jobs: [{ name: "projects/test-project/locations/us-central1/jobs/job", schedule: "* * * * *", timeZone: "UTC", state: "ENABLED", httpTarget: { headers: { Authorization: secret } } }] };
    if (url.includes("storage.googleapis.com")) return { items: [{ name: "backup-bucket", location: "US", privateField: secret }] };
    if (url.endsWith(":listCollectionIds")) return { collectionIds: ["worlds", "players"] };
    if (url.endsWith(":runAggregationQuery")) {
      assert.equal(body.structuredAggregationQuery.structuredQuery.from[0].allDescendants, undefined);
      return [{ result: { aggregateFields: { documentCount: { integerValue: "9007199254740993" } } }, readTime: "2026-10-15T00:00:00Z" }];
    }
    throw Error("Unexpected test request");
  };
  const report = await inventory("test-project", "exports.x = onCall();\nexports.localOnly = onSchedule();", read);
  assert.equal(report.authentication.total, 2);
  assert.equal(report.topLevelCollections[0].documentCount, "9007199254740993");
  assert.deepEqual(report.comparison, { onlyInSource: ["localOnly"], onlyDeployed: ["liveOnly"], unclassified: [] });
  assert(!JSON.stringify(report).includes(secret));
  assert(calls.filter(call => call.body).every(call => /:listCollectionIds$|:runAggregationQuery$/.test(call.url)), "Only read-only Firestore queries may use POST");
  assert(calls.some(call => call.url.includes("fields=users%28providerUserInfo%28providerId%29%2CemailVerified%2Cdisabled%29")), "Limit requested account fields");
  await assert.rejects(inventory("../unsafe", "", read), /Invalid project/);
  await assert.rejects(inventory("test-project", "", async (url, body) => url.endsWith("/documents/realmConfig/current") ? {} : read(url, body)), /realm pointer/);
  await assert.rejects(inventory("test-project", "", async (url, body) => url.includes("/config?") ? { multiTenant: { allowTenants: true } } : read(url, body)), /Tenant inventory/);
  await assert.rejects(inventory("test-project", "", async (url, body) => url.includes("/functions?") ? { unreachable: ["region"] } : read(url, body)), /unreachable/);
  await assert.rejects(inventory("test-project", "", async (url, body) => url.endsWith(":runAggregationQuery") ? [] : read(url, body)), /Collection count/);
  console.log("Migration inventory: paginated reads, identity/secret redaction, precision, drift detection and incomplete-read failures passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
