"use strict";
// Cloud Monitoring aggregates only. No gameplay writes or raw request payloads.
const fs = require("node:fs/promises");
const path = require("node:path");
const PAGE_LIMIT = 20;
const FILTER = 'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision"';

function addCounts(groups, series, currentRevisions) {
  const service = series.resource?.labels?.service_name || "unknown";
  const revision = series.resource?.labels?.revision_name || "unknown";
  const label = series.metric?.labels?.response_code;
  const status = /^\d{3}$/.test(String(label)) ? String(label) : "unknown";
  const key = `${service}/${revision}`;
  const group = groups.get(key) || { service, revision, currentRevision: currentRevisions.has(revision), count: 0, statuses: {} };
  for (const point of series.points || []) {
    const value = point.value?.int64Value;
    const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(group.count + count)) throw Error("Invalid request-count metric");
    group.count += count;
    group.statuses[status] = (group.statuses[status] || 0) + count;
  }
  groups.set(key, group);
}

async function collectWindow(client, project, currentRevisions, since, until, pageLimit = PAGE_LIMIT) {
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > PAGE_LIMIT) throw Error("Invalid page limit");
  const groups = new Map();
  let token, pages = 0, failure = null;
  do {
    let response;
    try {
      response = await client.get(`/projects/${project}/timeSeries`, {
        queryParams: { filter: FILTER, "interval.startTime": since, "interval.endTime": until,
          "aggregation.alignmentPeriod": "3600s", "aggregation.perSeriesAligner": "ALIGN_SUM",
          view: "FULL", pageSize: 10000, ...(token ? { pageToken: token } : {}) },
        skipLog: { body: true, resBody: true, queryParams: true },
      });
    } catch (error) {
      failure = { status: error.status || error.context?.response?.statusCode || null,
        message: "Cloud Monitoring query unavailable; missing counts are not inferred." };
      break;
    }
    pages++;
    for (const series of response.body.timeSeries || []) addCounts(groups, series, currentRevisions);
    token = response.body.nextPageToken;
  } while (token && pages < pageLimit);
  return { since, until, status: failure ? (pages ? "partial" : "unverified") : token ? "partial" : "complete",
    pages, truncated: Boolean(token), failure, groups: [...groups.values()] };
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const output = path.resolve(root, process.argv.find(arg => arg.startsWith("--output-directory="))?.slice(19)
    || `release-artifacts/stability-request-counts/${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.mkdir(output); // Refuse to overwrite earlier receipts.
  const project = JSON.parse(await fs.readFile(path.join(root, ".firebaserc"), "utf8")).projects.default;
  const lib = path.join(root, "functions/node_modules/firebase-tools/lib");
  const auth = require(path.join(lib, "auth"));
  const options = { project, projectId: project, nonInteractive: true }, account = auth.getProjectDefaultAccount(root);
  if (!account) throw Error("Existing authorized Firebase CLI login unavailable");
  auth.setActiveAccount(options, account);
  await require(path.join(lib, "requireAuth")).requireAuth(options);
  const listing = await require(path.join(lib, "gcp/cloudfunctionsv2")).listAllFunctions(project);
  const current = new Set(listing.functions.map(f => f.serviceConfig?.revision?.split("/").at(-1)).filter(Boolean));
  const { Client } = require(path.join(lib, "apiv2"));
  const client = new Client({ urlPrefix: "https://monitoring.googleapis.com", apiVersion: "v3" });
  const until = new Date(Math.floor((Date.now() - 180000) / 3600000) * 3600000).toISOString();
  const report = { schemaVersion: 1, observedAt: new Date().toISOString(), source: "Cloud Monitoring run.googleapis.com/request_count",
    until, revisionCoverage: listing.unreachable?.length ? "partial" : "complete", currentRevisions: [...current], windows: [],
    limitations: ["All HTTP methods and triggers; this is not a POST-only gameplay error rate.",
      "Only requests reaching containers are counted; pre-container platform rejections are excluded.",
      "Hourly aligned windows omit the unfinished hour and allow at least three minutes for metric availability.",
      "Current revisions may have existed for less than the requested window. No duration or cold-start inference. Late metric backfill can change counts even after all pages are retrieved.",
      `Bounded at ${PAGE_LIMIT} pages per window; incomplete results remain partial or unverified.`] };
  for (const days of [1, 7]) {
    const since = new Date(Date.parse(until) - days * 86400000).toISOString();
    const result = { days, ...await collectWindow(client, project, current, since, until) };
    report.windows.push(result);
    await fs.writeFile(path.join(output, "counts.json"), JSON.stringify(report, null, 2));
    console.log(`${days}d request counts: ${result.status}; ${result.pages} page(s); ${result.groups.length} service/revision groups.`);
  }
  process.exitCode = report.revisionCoverage !== "complete" || report.windows.some(w => w.status !== "complete") ? 1 : 0;
}

module.exports = { addCounts, collectWindow };
if (require.main === module) main().catch(() => {
  console.error("Read-only request-count collection failed. Check existing CLI access and retained diagnostic artifacts.");
  process.exitCode = 1;
});
