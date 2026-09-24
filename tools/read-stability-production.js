"use strict";
// Read-only metadata and aggregate log diagnostics. Never persist raw player payloads or credentials.
const fs = require("node:fs/promises");
const path = require("node:path");
const { operationTiming, operationOutcome, APPLICATION_ERROR_CLAUSE } = require("./stability-log-summary.js");
const root = path.resolve(__dirname, "..");
const lib = path.join(root, "functions/node_modules/firebase-tools/lib");
const output = path.resolve(root, process.argv.find(v => v.startsWith("--output-directory="))?.slice(19)
  || `release-artifacts/stability-production/${new Date().toISOString().replace(/[:.]/g, "-")}`);
const PAGE_LIMIT = 20;
function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  const p = fraction => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
  return { count: sorted.length, p50: p(.5), p95: p(.95), maximum: sorted.at(-1) ?? null };
}
async function main() {
  const config = JSON.parse(await fs.readFile(path.join(root, ".firebaserc"), "utf8"));
  const project = config.projects.default;
  const auth = require(path.join(lib, "auth")), options = { project, projectId: project, nonInteractive: true };
  const account = auth.getProjectDefaultAccount(root);
  if (!account) throw Error("Read-only Firebase diagnostics need the existing authorized CLI login.");
  auth.setActiveAccount(options, account);
  await require(path.join(lib, "requireAuth")).requireAuth(options);
  const { Client } = require(path.join(lib, "apiv2"));
  const logClient = new Client({ urlPrefix: "https://logging.googleapis.com", apiVersion: "v2" });
  // The generic CLI log helper can debug-log response bodies. Suppress those
  // bodies here so private records exist only in memory for aggregation.
  const logging = { listEntries: async (projectId, filter, pageSize, order, pageToken) => {
    const response = await logClient.post("/entries:list", {
      resourceNames: [`projects/${projectId}`], filter, pageSize, orderBy: `timestamp ${order}`,
      ...(pageToken ? { pageToken } : {}),
    }, { skipLog: { body: true, resBody: true, queryParams: true } });
    return { entries: response.body.entries || [], nextPageToken: response.body.nextPageToken };
  } };
  const listing = await require(path.join(lib, "gcp/cloudfunctionsv2")).listAllFunctions(project);
  const functions = listing.functions.map(item => ({ name: item.name.split("/").at(-1), state: item.state,
    runtime: item.buildConfig?.runtime, updatedAt: item.updateTime,
    sourceHash: item.labels?.["firebase-functions-hash"] || null,
    revision: item.serviceConfig?.revision?.split("/").at(-1) || null,
    memory: item.serviceConfig?.availableMemory, concurrency: item.serviceConfig?.maxInstanceRequestConcurrency,
    timeoutSeconds: item.serviceConfig?.timeoutSeconds,
  }));
  const currentRevisions = new Set(functions.map(item => item.revision).filter(Boolean));
  const pointerResult = await require(path.join(lib, "gcp/firestore")).getDocuments(project, ["realmConfig/current"]);
  const fields = pointerResult.documents?.[0]?.fields;
  if (!fields) throw Error("Authoritative current-realm pointer was not readable.");
  const currentRealm = Object.fromEntries(["releaseId", "worldId", "resetGeneration", "sharedRealmId", "topology", "status"]
    .map(key => [key, fields[key]?.stringValue || null]));
  const endedAt = new Date().toISOString();
  const report = { schemaVersion: 1, observedAt: endedAt, project, currentRealm, functions,
    unreachable: listing.unreachable || [], windows: [],
    limitations: ["Aggregate logs only; no gameplay mutations or raw payload exports.",
      `Each query is capped at ${PAGE_LIMIT} pages of 1,000 entries; truncation is explicit.`,
      "Latency distributions represent logged requests; cold starts are not inferred from duration alone.",
      "Error queries include ERROR severity plus known DEFAULT-severity operation/mission failures; log records are not unique failed requests.",
      "Missing phase timing is unavailable, not zero. Expected 4xx responses are separate from 5xx failures."],
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output); // Preserve failed or interrupted receipts too.
  await fs.writeFile(path.join(output, "metadata.json"), JSON.stringify(report, null, 2));
  const selectedDays=(process.argv.find(v=>v.startsWith("--days="))?.slice(7)||"1,7").split(",").map(Number);
  const selectedQueries=(process.argv.find(v=>v.startsWith("--queries="))?.slice(10)||"http,errors,timings").split(",");
  if(selectedDays.some(d=>![1,7].includes(d))||selectedQueries.some(k=>!["http","errors","timings"].includes(k)))throw Error("Unsupported diagnostic window or query");
  const selectedRevisions = (process.argv.find(v => v.startsWith("--revisions="))?.slice(12) || "").split(",").filter(Boolean);
  if (selectedRevisions.some(revision => !/^[a-z0-9-]+$/.test(revision) || !currentRevisions.has(revision))) throw Error("Select only a currently observed deployed revision.");
  const revisionClause = selectedRevisions.length ? " AND (" + selectedRevisions.map(revision => 'resource.labels.revision_name="' + revision + '"').join(" OR ") + ")" : "";
  report.requested={days:selectedDays,queries:selectedQueries,revisions:selectedRevisions};
  for (const days of selectedDays) {
    const since = new Date(Date.parse(endedAt)-days*86400000).toISOString();
    const window = { days, since, until: endedAt, queries: {} };
    for (const [kind, clause] of Object.entries({ http: 'httpRequest.latency:* AND httpRequest.requestMethod="POST"', errors: APPLICATION_ERROR_CLAUSE, timings: '(jsonPayload.requestDurationMs:* OR textPayload:"crownlands_operation" OR jsonPayload.message:"crownlands_operation")' })) {
      if(!selectedQueries.includes(kind))continue;
      const filter = `resource.type="cloud_run_revision" AND ${clause} AND timestamp>="${since}" AND timestamp<="${endedAt}"${revisionClause}`;
      let token, pages=0, count=0, failure=null; const groups = {};
      do {
        let response;
        for (let attempt=0;attempt<3;attempt++) {
          try { response=await logging.listEntries(project,filter,1000,"desc",token); break; }
          catch(error) {
            failure={status:error.status||null,message:"Cloud Logging query failed; no missing entries are inferred."};
            if(attempt<2) await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
          }
        }
        if(!response) break;
        failure=null;
        pages++; count += response.entries.length;
        for (const entry of response.entries) {
          const service = entry.resource?.labels?.service_name || "unknown";
          const revision = entry.resource?.labels?.revision_name || "unknown";
          const key = `${service}/${revision}`;
          const g = groups[key] ||= { service, revision, currentRevision: currentRevisions.has(revision), count:0,
            durations: [], httpStatuses: {}, errorCategories: {}, phases: {}, maxTransactionAttempts: 0 };
          g.count++;
          if (kind === "http") {
            const latency = Number(String(entry.httpRequest?.latency).replace(/s$/, ""))*1000;
            if (Number.isFinite(latency)) g.durations.push(latency);
            const status = String(entry.httpRequest?.status ?? "unknown");
            g.httpStatuses[status] = (g.httpStatuses[status] || 0)+1;
          } else if (kind === "timings") {
            const data = operationTiming(entry) || {};
            if (typeof data.requestDurationMs === "number") g.durations.push(data.requestDurationMs);
            g.maxTransactionAttempts = Math.max(g.maxTransactionAttempts, Number(data.transactionAttempts) || 0);
            for (const phase of ["realmContext", "worldValidation", "documentReads", "routePlanning", "transaction"]) {
              const value = data.phaseDurationMs?.[phase];
              if (typeof value === "number") (g.phases[phase] ||= []).push(value);
            }
          } else {
            // Classify in memory, discard all message text and identifiers.
            const message = JSON.stringify(entry.jsonPayload || entry.textPayload || "").toLowerCase();
            const operation = operationOutcome(entry);
            const category = message.includes("your kingdom is completing scheduled realm maintenance") ? "maintenance-guard"
              : operation?.outcome === "error" ? "operation/" + operation.code
              : ["out of memory", "memory limit", "deadline_exceeded", "resource_exhausted", "failed_precondition", "permission_denied", "unauthenticated", "unavailable", "index", "timeout", "transaction"].find(value => message.includes(value)) || "other";
            g.errorCategories[category] = (g.errorCategories[category] || 0)+1;
          }
        }
        token = response.nextPageToken;
      } while (token && pages < PAGE_LIMIT);
      window.queries[kind] = { status: failure ? (pages ? "partial" : "unverified") : token ? "partial" : "complete", failure, count, pages, truncated: Boolean(token), groups: Object.values(groups).map(g => ({...g,
        durations: stats(g.durations), phases: Object.fromEntries(Object.entries(g.phases).map(([name, values]) => [name, stats(values)])),
      })) };
      console.log(`${days}d ${kind}: ${count} entries; truncated=${Boolean(token)}; unavailable=${Boolean(failure)}`);
    }
    report.windows.push(window);
    await fs.writeFile(path.join(output, "production.json"), JSON.stringify(report, null, 2));
  }
  process.exitCode = report.unreachable.length || report.windows.some(w => Object.values(w.queries).some(q => q.status !== "complete")) ? 1 : 0;
  console.log(`Recorded ${functions.length} backend revisions and current realm identity. No production data changed.`);
}
main().catch(() => {
  console.error("Read-only production diagnostics failed. Check CLI access, supported options and retained aggregate artifacts.");
  process.exitCode = 1;
});
