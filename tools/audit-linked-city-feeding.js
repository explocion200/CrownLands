"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const policy = require("../functions/linked-account-policy");
const apiTools = require("./linked-account-admin-api");
const key = row => `${row.regionId}:${row.id || row.targetId}`;
const regular = city => city.kind !== "stronghold" && !city.strongholdType && !city.campType && !city.targetType;

function buildReport({ cities, events, names = new Map(), links = () => [], audits = [], endMs, days = 5, minCities = 36 }) {
  assert(Number.isFinite(endMs) && days > 0 && Number.isInteger(minCities) && minCities > 0);
  const startMs = endMs - days * 86_400_000;
  const cityMap = new Map(cities.filter(regular).map(city => [key(city), city]));
  const byCity = new Map(), seen = new Map(), inconsistent = new Set();
  const quality = { duplicateEvents: 0, conflictingDuplicateEvents: 0, brokenChains: 0, missingAcquisitionRecords: 0 };
  for (const event of events.filter(row => row.targetType === "city" && row.createdAtMs <= endMs)
    .sort((a, b) => a.createdAtMs - b.createdAtMs || String(a.eventId).localeCompare(String(b.eventId)))) {
    if (!cityMap.has(key(event))) continue;
    if (seen.has(event.eventId)) {
      quality.duplicateEvents++;
      const prior = seen.get(event.eventId);
      if (["targetId", "regionId", "beforeOwnerUid", "afterOwnerUid", "createdAtMs", "reason"].some(field => prior[field] !== event[field])) {
        quality.conflictingDuplicateEvents++; inconsistent.add(key(prior)); inconsistent.add(key(event));
      }
      continue;
    }
    seen.set(event.eventId, event);
    const list = byCity.get(key(event)) || []; list.push(event); byCity.set(key(event), list);
  }
  const count = (map, uid, amount = 1) => { if (uid) map.set(uid, (map.get(uid) || 0) + amount); };
  const current = new Map(), baseline = new Map();
  for (const [cityKey, city] of cityMap) {
    const history = byCity.get(cityKey) || [];
    count(current, city.ownerUid);
    if (!history.length && city.ownerUid) quality.missingAcquisitionRecords++;
    let invalid = inconsistent.has(cityKey) || (history.length && (history.at(-1).afterOwnerUid || "") !== (city.ownerUid || ""));
    for (let i = 1; i < history.length; i++) {
      if ((history[i - 1].afterOwnerUid || "") !== (history[i].beforeOwnerUid || "")
          || history[i - 1].createdAtMs === history[i].createdAtMs) invalid = true;
    }
    if (invalid) quality.brokenChains++;
    let priorOwner = city.ownerUid;
    for (const event of [...history].reverse()) if (event.createdAtMs >= startMs) priorOwner = event.beforeOwnerUid;
    count(baseline, priorOwner);
  }
  const label = uid => uid ? names.get(uid) || "Unknown ruler" : "Neutral";
  const detail = event => ({ city: cityMap.get(key(event))?.name || event.targetId, region: event.regionId,
    priorOwner: label(event.beforeOwnerUid), acquiredAt: new Date(event.createdAtMs).toISOString(), method: event.reason,
    currentLinkSignals: links(event.beforeOwnerUid, event.afterOwnerUid), linkEvidenceTiming: "current-state" });
  const players = [...current].filter(([, n]) => n >= minCities).sort((a, b) => b[1] - a[1]).map(([uid, n]) => ({
    player: label(uid), currentCities: n, endingCities: n,
    startingCities: quality.brokenChains || quality.missingAcquisitionRecords ? null : baseline.get(uid) || 0,
    netGrowth: quality.brokenChains || quality.missingAcquisitionRecords ? null : n - (baseline.get(uid) || 0),
    holdings: [...cityMap].filter(([, city]) => city.ownerUid === uid).map(([cityKey, city]) => {
      const latest = byCity.get(cityKey)?.at(-1);
      return { city: city.name || city.id, region: city.regionId, mainCity: city.isMainCity === true,
        acquisition: latest && latest.afterOwnerUid === uid ? detail(latest) : null,
        acquiredWithinWindow: Boolean(latest && latest.afterOwnerUid === uid && latest.createdAtMs >= startMs) };
    }),
  }));
  const direct = new Map(), routes = [];
  for (const history of byCity.values()) {
    const recent = history.filter(event => event.createdAtMs >= startMs);
    for (const event of recent) {
      const a = event.beforeOwnerUid, b = event.afterOwnerUid;
      if (!a || !b || a === b) continue;
      const id = `${a}\n${b}`, row = direct.get(id) || { from: label(a), to: label(b), count: 0, retained: new Set(), currentLinkSignals: links(a, b), linkEvidenceTiming: "current-state" };
      row.count++;
      if (cityMap.get(key(event)).ownerUid === b && history.at(-1) === event) row.retained.add(key(event));
      direct.set(id, row);
    }
    for (let end = 1; end < recent.length; end++) {
      const receiver = recent[end].afterOwnerUid;
      if (!receiver) continue;
      for (let start = 0; start < end; start++) {
        const origin = recent[start].beforeOwnerUid;
        const signals = origin && origin !== receiver ? links(origin, receiver) : [];
        if (!signals.length) continue;
        const path = [origin, ...recent.slice(start, end + 1).map(event => event.afterOwnerUid)];
        routes.push({ city: cityMap.get(key(recent[end])).name || recent[end].targetId, region: recent[end].regionId,
          route: path.map(label), throughNeutral: path.includes(""), currentLinkSignals: signals,
          linkEvidenceTiming: "current-state", reviewOnly: true, retained: cityMap.get(key(recent[end])).ownerUid === receiver });
      }
    }
  }
  return { window: { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
    dataQuality: quality, players,
    directTransfers: [...direct.values()].map(row => ({ ...row, retained: row.retained.size }))
      .sort((a, b) => b.count - a.count || b.retained - a.retained),
    possibleRoutes: routes.sort((a, b) => Number(b.retained) - Number(a.retained)),
    preventedCaptures: audits.filter(row => row.occurredAtMs >= startMs && row.occurredAtMs <= endMs).map(row => ({
      attacker: label(row.attackerUid), defender: label(row.defenderUid), target: row.targetKey,
      occurredAt: new Date(row.occurredAtMs).toISOString(), recordedSignals: row.signals, linkEvidenceTiming: "recorded-at-resolution" })),
    notes: ["Current links do not establish that those signals existed when an earlier transfer occurred.",
      "IP history begins when verified collection is enabled. Routes are review leads; this report makes no ownership changes.",
      "Missing acquisition records and broken chains are disclosed; baseline metrics are withheld if history is incomplete or inconsistent."],
  };
}

async function main() {
  const { arg, connect, assertActive } = apiTools, api = await connect(arg("project"));
  const output = apiTools.externalOutput(arg("output"));
  const pointer = await api.get("realmConfig/current");
  assertActive(pointer, { worldId: arg("world"), resetGeneration: arg("reset-generation"), sharedRealmId: arg("realm-shard") });
  const realm = pointer.data, storage = `${realm.resetGeneration}--${realm.sharedRealmId}`;
  const board = await api.query(`leaderboards/${storage}`, "entries"), readTime = board.readTime;
  assert(readTime, "Server snapshot timestamp unavailable.");
  const endMs = Date.parse(readTime), scoped = row => row.worldId === realm.worldId
    && row.resetGeneration === realm.resetGeneration && row.realmShardId === realm.sharedRealmId;
  const islands = (await api.query("", "islands", { readTime })).filter(row => scoped(row.data));
  const cities = [];
  for (let i = 0; i < islands.length; i += 8) {
    const pages = await Promise.all(islands.slice(i, i + 8).map(island => api.query(island.name.slice(api.base.length + 1), "cities", { readTime })));
    for (const page of pages) for (const doc of page) if (scoped(doc.data)) cities.push({ ...doc.data, id: doc.name.split("/").at(-1) });
  }
  const names = new Map(board.map(row => [row.name.split("/").at(-1), row.data.displayName || row.data.playerName]));
  for (const city of cities) if (city.ownerUid && !names.has(city.ownerUid)) names.set(city.ownerUid, city.ownerName || "Unknown ruler");
  for (const city of cities) if (city.ownerUid && city.isMainCity) {
    names.set(city.ownerUid, `${names.get(city.ownerUid)} (${city.name || city.id})`);
  }
  const events = (await api.query(`realmEvents/${storage}`, "ownershipChanges", { readTime })).map(row => row.data).filter(scoped);
  const confirmed = new Map((await api.query(policy.ROOT, "confirmedPairs", { readTime })).map(row => [row.name.split("/").at(-1), row.data]));
  const installations = new Map((await api.query(`realmSecurity/${realm.resetGeneration}`, "accountPairs", { readTime })).map(row => [row.name.split("/").at(-1), row.data]));
  const uids = [...new Set([...cities.map(row => row.ownerUid), ...events.flatMap(row => [row.beforeOwnerUid, row.afterOwnerUid])].filter(Boolean))];
  const networks = new Map();
  for (let i = 0; i < uids.length; i += 8) await Promise.all(uids.slice(i, i + 8).map(async uid => {
    networks.set(uid, (await api.query(policy.accountPath(uid), "networkObservations", { readTime })).map(row => row.data));
  }));
  const links = (a, b) => {
    if (!policy.pairId(a, b)) return [];
    const pair = installations.get(policy.pairId(a, b)) || {};
    return policy.evaluate({ a, b, confirmed: confirmed.get(policy.pairId(a, b)),
      sharedInstallationUntilMs: Math.max(pair.sharedInstallationExpiresAtMs || 0, (pair.sharedInstallationLastSeenAtMs || 0) + policy.WINDOW_MS),
      left: networks.get(a), right: networks.get(b), nowMs: endMs }).signals;
  };
  const audits = (await api.query(policy.ROOT, "captureAudit", { readTime })).map(row => row.data)
    .filter(row => row.worldId === realm.worldId && row.resetGeneration === realm.resetGeneration);
  const report = buildReport({ cities, events, names, links, audits, endMs,
    days: Number(arg("days") || 5), minCities: Number(arg("min-cities") || 36) });
  assert.equal((await api.get("realmConfig/current")).updateTime, pointer.updateTime, "Realm changed during the audit.");
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ snapshot: readTime, playersAboveThreshold: report.players.length,
    directPairs: report.directTransfers.length, reviewRoutes: report.possibleRoutes.length, dataQuality: report.dataQuality }));
}
module.exports = { buildReport };
if (require.main === module) main().catch(() => { console.error("City-feeding audit stopped. Check the current realm and read permissions; no private data was printed or ownership changed."); process.exitCode = 1; });
