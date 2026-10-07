"use strict";
const path = require("node:path");
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const INGRESS_PROBE_ENDPOINT = "https://us-central1-crown-land-b15e0.cloudfunctions.net/probeLinkedAccountIngress";

function externalOutput(file) {
  if (!file) throw new Error("Supply an output file outside the repository.");
  const root = fs.realpathSync(path.resolve(__dirname, ".."));
  const target = path.join(fs.realpathSync(path.dirname(path.resolve(file))), path.basename(file));
  const relative = path.relative(root, target);
  if (!relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) {
    throw new Error("Operator evidence must be saved outside the repository.");
  }
  return target;
}

function decode(value = {}) {
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, row]) => [key, decode(row)]));
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  return value.stringValue ?? value.timestampValue ?? value.booleanValue ??
    (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue ?? null);
}
function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, row]) => [key, encode(row)])) } };
}
function unpack(doc) { return doc ? { name: doc.name, updateTime: doc.updateTime, data: decode({ mapValue: { fields: doc.fields } }) } : null; }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? "" : process.argv[i + 1] || ""; };

async function connect(project) {
  if (project !== "crown-land-b15e0") throw new Error("Specify the production project explicitly.");
  const root = path.resolve(__dirname, ".."), req = createRequire(path.join(root, "functions/package.json"));
  const lib = path.join(path.dirname(req.resolve("firebase-tools/package.json")), "lib");
  const options = { project, projectId: project, nonInteractive: true }, auth = require(path.join(lib, "auth"));
  const account = auth.getProjectDefaultAccount(root);
  auth.setActiveAccount(options, account);
  await require(path.join(lib, "requireAuth")).requireAuth(options);
  const api = new (require(path.join(lib, "apiv2")).Client)({ urlPrefix: "https://firestore.googleapis.com", apiVersion: "v1", auth: true });
  const base = `projects/${project}/databases/(default)/documents`, skipLog = { body: true, resBody: true, queryParams: true };
  async function get(document, readTime) {
    const response = await api.get(`${base}/${document}`, { skipLog, resolveOnHTTPError: true,
      ...(readTime ? { queryParams: { readTime } } : {}) });
    if (response.status === 404) return null;
    if (response.status !== 200) throw new Error("Private document read failed.");
    return unpack(response.body);
  }
  async function query(parent, collection, { readTime, where } = {}) {
    const rows = [];
    let cursor;
    do {
      const response = await api.post(`${base}${parent ? `/${parent}` : ""}:runQuery`, {
        ...((readTime || rows.readTime) ? { readTime: readTime || rows.readTime } : {}), structuredQuery: {
          from: [{ collectionId: collection }], ...(where ? { where } : {}),
          orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }], limit: 500,
          ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
        },
      }, { skipLog });
      const page = response.body.filter(row => row.document).map(row => unpack(row.document));
      if (!rows.readTime) rows.readTime = response.body.find(row => row.readTime)?.readTime;
      rows.push(...page); cursor = page.length === 500 ? page.at(-1).name : null;
    } while (cursor);
    return rows;
  }
  const email = account?.user?.email || options.user?.email;
  const principalHash = email ? createHash("sha256").update(email).digest("hex") : null;
  return { base, get, query, principalHash, commit: writes => api.post(`${base}:commit`, { writes }, { skipLog }) };
}

function assertActive(pointer, expected) {
  const release = require("../functions/release-config.json");
  if (release.worldTopology !== "core-expansion-v1" || release.realmMode !== "monthly-shared"
      || pointer?.data?.resetReadinessStatus !== "ready" || pointer.data.mode !== "monthly-shared") throw new Error("Active monthly Core realm required.");
  for (const field of ["worldId", "resetGeneration", "sharedRealmId"]) {
    if (!expected[field] || pointer.data[field] !== expected[field]) throw new Error("Current realm differs from the explicitly supplied realm.");
  }
}

module.exports = { arg, connect, decode, encode, unpack, assertActive, externalOutput, INGRESS_PROBE_ENDPOINT };
