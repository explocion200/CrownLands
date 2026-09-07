"use strict";
const assert = require("node:assert/strict");
const { commitCoordinateBatch } = require("../../tools/illustrated-map-coordinate-plan");
assert(process.env.FIRESTORE_EMULATOR_HOST, "This check may only use the Firestore emulator");
const project = process.env.GCLOUD_PROJECT || "demo-crownlands";
const root = `/v1/projects/${project}/databases/(default)/documents`;
const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}`;
async function request(method, endpoint, data, options = {}) {
  const target = new URL(url + endpoint);
  for (const [key, value] of Object.entries(options.queryParams || {})) target.searchParams.set(key, value);
  const response = await fetch(target, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error?.message || "Firestore error"}`);
  return { body };
}
const client = { get: (endpoint, options) => request("GET", endpoint, null, options), post: (endpoint, data) => request("POST", endpoint, data) };
async function main() {
  const pointerName = `projects/${project}/databases/(default)/documents/mapArtTest/current`;
  const cityName = `projects/${project}/databases/(default)/documents/mapArtTest/owned`;
  const fields = { x: { integerValue: "10" }, y: { integerValue: "20" }, ownerUid: { stringValue: "original-owner" }, level: { integerValue: "100" }, troops: { integerValue: "730000" }, isMainCity: { booleanValue: true }, name: { stringValue: "Player's chosen name" } };
  await client.post(`${root}:commit`, { writes: [{ update: { name: pointerName, fields: { generation: { stringValue: "current" } } } }, { update: { name: cityName, fields } }] });
  const original = (await client.get(`${root}/mapArtTest/owned`)).body;
  const guard = { path: "mapArtTest/current", validate: document => assert.equal(document.fields.generation.stringValue, "current") };
  await commitCoordinateBatch(client, root, [guard], [{ document: original, position: { x: 400, y: 500 } }]);
  const after = (await client.get(`${root}/mapArtTest/owned`)).body;
  assert.deepEqual(after.fields, { ...fields, x: { integerValue: "400" }, y: { integerValue: "500" } });
  // A stale city snapshot must fail instead of replacing newer gameplay state.
  await assert.rejects(commitCoordinateBatch(client, root, [guard], [{ document: original, position: { x: 600, y: 700 } }]));
  // A realm rollover must abort before any city write is committed.
  await client.post(`${root}:commit`, { writes: [{ update: { name: pointerName, fields: { generation: { stringValue: "next-realm" } } } }] });
  await assert.rejects(commitCoordinateBatch(client, root, [guard], [{ document: after, position: { x: 600, y: 700 } }]));
  assert.deepEqual((await client.get(`${root}/mapArtTest/owned`)).body.fields, after.fields);
  console.log("Validated coordinate-only transaction, owner/Main City/progression preservation, stale-write rejection and realm-rollover rejection.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
