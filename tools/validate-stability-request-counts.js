"use strict";
const assert = require("node:assert/strict");
const { addCounts, collectWindow } = require("./read-stability-request-counts.js");
const series = (revision, count, code = "200") => ({ resource: { labels: { service_name: "operation", revision_name: revision, privateField: "exclude me" } },
  metric: { labels: { response_code: code } }, points: [{ value: { int64Value: count } }], privatePayload: "exclude me" });
(async () => {
  const groups = new Map(), current = new Set(["current"]);
  addCounts(groups, series("current", "2"), current);
  addCounts(groups, series("current", "1", "503"), current);
  addCounts(groups, series("old", "7"), current);
  assert.deepEqual(groups.get("operation/current"), { service: "operation", revision: "current", currentRevision: true, count: 3, statuses: { 200: 2, 503: 1 } });
  assert.equal(groups.get("operation/old").currentRevision, false);
  assert(!JSON.stringify([...groups.values()]).includes("exclude me"));
  const unknownStatus = new Map();
  addCounts(unknownStatus, series("current", "1", "private-label"), current);
  assert.deepEqual(unknownStatus.get("operation/current").statuses, { unknown: 1 });
  for (const count of [undefined, "", "-1", "1.5", "9007199254740992"]) assert.throws(() => addCounts(new Map(), series("current", count), current), /Invalid request-count/);
  const requests = [];
  const client = { get: async (url, options) => { requests.push({url,options}); return requests.length === 1
    ? { body: { timeSeries: [series("current", "2")], nextPageToken: "next" } }
    : { body: { timeSeries: [series("current", "3")] } }; } };
  const result = await collectWindow(client, "test-project", current, "start", "end");
  assert.equal(result.status, "complete"); assert.equal(result.pages, 2); assert.equal(result.groups[0].count, 5);
  assert.equal(requests[1].options.queryParams.pageToken, "next");
  assert.equal(requests[0].url, "/projects/test-project/timeSeries");
  assert.equal(requests[0].options.queryParams["aggregation.perSeriesAligner"], "ALIGN_SUM");
  assert.deepEqual(requests[0].options.skipLog, { body: true, resBody: true, queryParams: true });
  const truncated = await collectWindow({get: async () => ({body:{timeSeries:[series("current","2")],nextPageToken:"more"}})}, "p", current, "s", "e", 1);
  assert.equal(truncated.status,"partial"); assert.equal(truncated.groups[0].count,2);
  const unavailable = await collectWindow({get: async () => {throw {status:503,privatePayload:"exclude me"};}}, "p", current, "s", "e");
  assert.equal(unavailable.status,"unverified"); assert.deepEqual(unavailable.groups,[]); assert.equal(unavailable.failure.status,503);
  assert(!JSON.stringify(unavailable).includes("exclude me"));
  let calls=0;
  const partial = await collectWindow({get: async () => {if(calls++)throw {status:500};return {body:{timeSeries:[series("current","2")],nextPageToken:"more"}};}},"p",current,"s","e");
  assert.equal(partial.status,"partial");assert.equal(partial.groups[0].count,2);
  console.log("Request-count diagnostics passed: pagination, current revisions, status totals, bounded/failed queries and private field exclusion.");
})().catch(error=>{console.error(error);process.exitCode=1;});
