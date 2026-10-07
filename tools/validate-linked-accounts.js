"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const p = require("../functions/linked-account-policy");
const { buildPlan } = require("./admin-linked-accounts");
const { buildReport } = require("./audit-linked-city-feeding");
const { verifyIngress } = require("./verify-linked-account-ingress");
const adminApi = require("./linked-account-admin-api");
const now = 1_800_000_000_000, key = "emulator-only-secret-with-at-least-32-characters";

for (const [input, expected] of [["192.0.2.1", "192.0.2.1"], ["::FFFF:192.0.2.1", "192.0.2.1"],
  ["0:0:0:0:0:ffff:c000:201", "192.0.2.1"], ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
  ["[2001:db8::1]", "2001:db8::1"], ["invalid", ""], ["192.0.2.1:80", ""], ["fe80::1%eth0", ""]]) {
  assert.equal(p.normalizeIp(input), expected);
}
assert.equal(p.fingerprint("192.0.2.1", key), p.fingerprint("::ffff:192.0.2.1", key));
assert.notEqual(p.fingerprint("192.0.2.1", key), p.fingerprint("192.0.2.2", key));
assert.throws(() => p.fingerprint("192.0.2.1", "short"));
const config = { verified: true, suffixLength: 2 };
for (const prefix of ["", "203.0.113.10, ", "garbage, 198.51.100.1, "]) {
  assert.equal(p.ingressIp({ ip: "forged", headers: { "x-forwarded-for": `${prefix}192.0.2.1, 192.0.2.254` } }, config), "192.0.2.1");
}
for (const invalid of [{ verified: false, suffixLength: 2 }, { verified: true, suffixLength: 0 }, { verified: true, suffixLength: 2.5 }]) {
  assert.equal(p.ingressIp({ headers: { "x-forwarded-for": "192.0.2.1, 192.0.2.254" } }, invalid), "");
}
assert.equal(p.ingressIp({ headers: { "x-forwarded-for": "192.0.2.1" } }, config), "");

const left = [{ fingerprint: "same", lastSeenAtMs: now - 1000 }], right = [{ fingerprint: "same", lastSeenAtMs: now - 5000 }];
for (const [a, b, l, r] of [["a", "b", left, right], ["b", "a", right, left]]) {
  const decision = p.evaluate({ a, b, left: l, right: r, nowMs: now });
  assert.deepEqual(decision.signals, ["shared-ip"]);
  assert.equal(decision.restriction.expiresAtMs, now - 5000 + p.WINDOW_MS);
  assert.equal(p.evaluate({ a, b, left: l, right: r, nowMs: decision.restriction.expiresAtMs }).restriction, null);
}
assert.equal(p.evaluate({ a: "a", b: "b", left: [{ fingerprint: "same", lastSeenAtMs: now }],
  right: [{ fingerprint: "same", lastSeenAtMs: now - p.WINDOW_MS }], nowMs: now }).restriction, null);
const confirmed = { active: true, pairUids: ["b", "a"] };
assert.equal(p.evaluate({ a: "a", b: "b", confirmed, nowMs: now + 100 * p.WINDOW_MS }).restriction.expiresAtMs, null);
assert.equal(p.evaluate({ a: "a", b: "a", confirmed, nowMs: now }).restriction, null);
assert.equal(p.evaluate({ a: "a", b: "c", confirmed, nowMs: now }).restriction, null);
assert.equal(p.evaluate({ a: "a", b: "b", confirmed: { ...confirmed, active: false }, nowMs: now }).restriction, null);
assert.equal(p.evaluate({ a: "a", b: "b", sharedInstallationUntilMs: now + 1, nowMs: now }).restriction.expiresAtMs, now + 1);
const many = Array.from({ length: 1000 }, (_, i) => ({ fingerprint: String(i), lastSeenAtMs: now }));
assert(p.evaluate({ a: "a", b: "b", left: many, right: [many[999]], nowMs: now }).restriction, "History was silently truncated");

const pointer = { updateTime: "pointer-version", data: { worldId: "world", resetGeneration: "generation", sharedRealmId: "shard" } };
const profiles = ["a", "b"].map(uid => ({ name: `players/${uid}`, updateTime: uid, data: {
  ...pointer.data, realmShardId: "shard", playerName: "DON", mainCityId: `${uid}-city` } }));
const cities = profiles.map((profile, i) => ({ name: `cities/${profile.data.mainCityId}`, updateTime: `city-${i}`,
  data: { ownerUid: profile.name.split("/").at(-1), name: ["Silverworth", "Crowmoor Gate"][i] } }));
const input = { pointer, profiles, cities, current: null, mode: "confirm", reason: "Confirmed common control", nowMs: now };
const plan = buildPlan(input);
assert.equal(plan.data.active, true);
assert.equal(plan.planHash, buildPlan({ ...input, nowMs: now + 1000 }).planHash);
assert.notEqual(plan.planHash, buildPlan({ ...input, mode: "remove" }).planHash);
assert.notEqual(plan.planHash, buildPlan({ ...input, current: { updateTime: "new-version" } }).planHash);
assert.throws(() => buildPlan({ ...input, cities: [cities[0], { ...cities[1], data: { ...cities[1].data, ownerUid: "other" } }] }));
const receipts = ["a", "b"].map(c => ({ project: "crown-land-b15e0", verified: true, checks: 4,
  endpoint: adminApi.INGRESS_PROBE_ENDPOINT, fingerprint: c.repeat(64), checkedAtMs: now - 1000, suffixLength: 2 }));
assert(buildPlan({ pointer, mode: "enable-ip", reason: "Reviewed ingress", receipts, nowMs: now }).data.verified);
assert.throws(() => buildPlan({ pointer, mode: "enable-ip", reason: "Reviewed ingress", receipts: [receipts[0], receipts[0]], nowMs: now }));
assert.throws(() => buildPlan({ pointer, mode: "enable-ip", reason: "Reviewed ingress", receipts: receipts.map(r => ({ ...r, checkedAtMs: now - 86_400_001 })), nowMs: now }));

const auditCities = Array.from({ length: 39 }, (_, i) => ({ id: `c${i}`, name: `City ${i}`, regionId: "map", ownerUid: i < 36 ? "a" : "b", isMainCity: i === 0 }));
const event = (id, city, before, after, age) => ({ eventId: id, targetId: `c${city}`, regionId: "map", targetType: "city",
  beforeOwnerUid: before, afterOwnerUid: after, reason: before ? "city_captured" : "neutral_claim", createdAtMs: now - age });
const auditEvents = auditCities.map((city, i) => event(`initial-${i}`, i, "", "a", 6 * 86_400_000));
auditEvents.push(event("direct", 36, "a", "b", 2000), event("via-first", 37, "a", "c", 3000), event("via-second", 37, "c", "b", 1000),
  event("relinquish", 38, "a", "", 4000), event("neutral-claim", 38, "", "b", 500));
const auditInput = { cities: auditCities, events: auditEvents, names: new Map([["a", "One"], ["b", "Two"], ["c", "Third"]]),
  links: (a, b) => p.pairId(a, b) === p.pairId("a", "b") ? ["administrator-confirmed"] : [], endMs: now };
const report = buildReport(auditInput);
assert.equal(report.players.length, 1); assert.equal(report.players[0].currentCities, 36);
assert.equal(report.players[0].startingCities, 39); assert.equal(report.players[0].netGrowth, -3);
assert.equal(report.possibleRoutes.length, 2); assert(report.possibleRoutes.some(route => route.throughNeutral));
assert(report.directTransfers.some(row => row.from === "One" && row.to === "Two" && row.count === 1 && row.retained === 1));
assert.equal(report.players[0].holdings.length, 36);
const unlinkedRoutes = buildReport({ ...auditInput, links: () => [] });
assert.equal(unlinkedRoutes.possibleRoutes.length, 2, "Review routes must not require existing identity evidence");
assert(unlinkedRoutes.possibleRoutes.some(route => route.throughNeutral));
assert(unlinkedRoutes.routeCandidates.some(row => row.from === "One" && row.to === "Two" && row.count === 2 && row.retained === 2));
assert(unlinkedRoutes.possibleRoutes.every(route => route.currentLinkSignals.length === 0 && route.reviewOnly));
assert(!JSON.stringify(report).includes('"fingerprint"'));
const broken = buildReport({ ...auditInput, events: [...auditEvents, event("wrong-owner", 1, "b", "a", 200)] });
assert.equal(broken.dataQuality.brokenChains, 1); assert.equal(broken.players[0].startingCities, null);
const duplicate = buildReport({ ...auditInput, events: [...auditEvents, auditEvents[0]] });
assert.equal(duplicate.dataQuality.duplicateEvents, 1); assert.equal(duplicate.players[0].netGrowth, -3);
const conflict = buildReport({ ...auditInput, events: [...auditEvents, { ...auditEvents[0], beforeOwnerUid: "c" }] });
assert.equal(conflict.dataQuality.conflictingDuplicateEvents, 1); assert.equal(conflict.players[0].netGrowth, null);
const missing = buildReport({ ...auditInput, events: auditEvents.slice(1) });
assert.equal(missing.dataQuality.missingAcquisitionRecords, 1); assert.equal(missing.players[0].startingCities, null);
assert.throws(() => adminApi.externalOutput(path.resolve(__dirname, "../receipt.json")));
assert.deepEqual(adminApi.decode(adminApi.encode({ active: true, expiresAtMs: null, pairUids: ["a", "b"], count: 42 })),
  { active: true, expiresAtMs: null, pairUids: ["a", "b"], count: 42 });

const source = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
function extract(name) {
  const start = source.indexOf(`function ${name}(`), end = source.indexOf("\nfunction ", start + 9);
  assert(start >= 0); return source.slice(start, end < 0 ? source.length : end);
}
const context = vm.createContext({ Date, Number });
for (const name of ["normalizeLinkedCaptureRestriction", "getBattleRuleLabel", "getLegacyBattleResultLabel"]) vm.runInContext(extract(name), context);
assert.equal(context.normalizeLinkedCaptureRestriction({ blocked: true, reason: "linked_account_capture", expiresAtMs: null }).expiresAtMs, null);
assert.match(context.getBattleRuleLabel({ combatRule: { id: "linked_account_capture" } }), /battle allowed; city capture restricted/);
assert.match(context.getLegacyBattleResultLabel({ type: "defense", captureBlockedReason: "linked_account_capture" }), /keep the city/);
async function operationalBoundaries() {
  const requests = [];
  const fetchImpl = async (endpoint, options) => {
    assert.equal(endpoint, adminApi.INGRESS_PROBE_ENDPOINT); requests.push(options);
    return { ok: true, json: async () => ({ result: { matchesExpected: true, fingerprint: "a".repeat(64), suffixLength: 2 } }) };
  };
  const receipt = await verifyIngress({ token: "test-only", expectedIp: "192.0.2.1", suffixLength: 2, fetchImpl, nowMs: now });
  assert.equal(requests.length, 4); assert(!requests[0].headers["x-forwarded-for"]);
  assert(requests.slice(1).every(request => request.headers["x-forwarded-for"]));
  assert(!JSON.stringify(receipt).includes("192.0.2.1")); assert(!JSON.stringify(receipt).includes("test-only"));
  await assert.rejects(verifyIngress({ token: "test-only", expectedIp: "192.0.2.1", suffixLength: 2,
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: { matchesExpected: false } }) }) }));
  let attempt = 0;
  await assert.rejects(verifyIngress({ token: "test-only", expectedIp: "192.0.2.1", suffixLength: 2,
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: { matchesExpected: true, suffixLength: 2,
      fingerprint: (++attempt === 1 ? "a" : "b").repeat(64) } }) }) }));
  const reads = [], db = { doc: path => ({ path }), collection: path => ({ where: (field, op, value) => ({ path, field, op, value }) }) };
  const service = p.createService({ db, secret: () => key });
  const transaction = { get: async ref => {
    reads.push(ref);
    return ref.field ? { docs: [{ data: () => ({ fingerprint: "same", lastSeenAtMs: now }) }] }
      : { data: () => ref.path.includes("confirmedPairs") ? confirmed : {} };
  } };
  assert.equal((await service.read(transaction, "a", "b", 0, now)).restriction.expiresAtMs, null);
  assert.deepEqual(reads.slice(0, 2).map(ref => ref.path), [p.accountPath("a"), p.accountPath("b")]);
  assert(reads.every(ref => ref.path.startsWith(p.ROOT)), "Evidence must persist across seasons");
  assert.equal(reads.filter(ref => ref.field).length, 2);
  await assert.rejects(service.read({ get: async () => { throw new Error("Security read failed"); } }, "a", "b", 0, now), /Security read failed/);
  console.log("Linked-account policy passed: exact IP normalization, trusted suffix and four spoof checks, symmetric rolling expiry, independent observations, permanent removal, cross-season uncapped history, security-read failures, reviewed admin plans, duplicate and incomplete ownership chains, growth/relay/neutral audits and permanent UI labels.");
}
operationalBoundaries().catch(error => { console.error(error.message); process.exitCode = 1; });
