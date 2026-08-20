"use strict";

const crypto = require("node:crypto");
const { CONFIG } = require("./environment");
const { googleRequest } = require("./google-api");
const { runFirebase, parseFirebaseJson } = require("./firebase-cli");

const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${CONFIG.stagingProjectId}/databases/(default)/documents`;
const FIRESTORE_NAME_ROOT = `projects/${CONFIG.stagingProjectId}/databases/(default)/documents`;
const FUNCTION_URLS = new Map();

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { bytesValue: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) return { integerValue: String(value) };
    if (!Number.isFinite(value)) throw new Error("Firestore does not accept a non-finite number.");
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`Unsupported Firestore value type ${typeof value}.`);
}

function encodeFields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

function decodeValue(value) {
  if (!value || Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "bytesValue")) return Buffer.from(value.bytesValue, "base64");
  if (Object.hasOwn(value, "arrayValue")) return (value.arrayValue.values || []).map(decodeValue);
  if (Object.hasOwn(value, "mapValue")) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

function normalizeDocument(body) {
  if (!body?.name) return null;
  return {
    name: body.name,
    path: body.name.split("/documents/")[1],
    createTime: body.createTime,
    updateTime: body.updateTime,
    data: decodeFields(body.fields || {}),
    rawFields: body.fields || {},
  };
}

async function setDocument(documentPath, data, options = {}) {
  const query = new URLSearchParams();
  if (options.mustNotExist) query.set("currentDocument.exists", "false");
  if (options.mustExist) query.set("currentDocument.exists", "true");
  if (options.updateTime) query.set("currentDocument.updateTime", options.updateTime);
  const suffix = query.size ? `?${query}` : "";
  const response = await googleRequest(`${FIRESTORE_ROOT}/${documentPath}${suffix}`, {
    method: "PATCH",
    body: { fields: encodeFields(data) },
    quotaProjectId: CONFIG.stagingProjectId,
  });
  return normalizeDocument(response.body);
}

async function setRawDocument(documentPath, rawFields, options = {}) {
  const query = new URLSearchParams();
  if (options.mustNotExist) query.set("currentDocument.exists", "false");
  if (options.mustExist) query.set("currentDocument.exists", "true");
  if (options.updateTime) query.set("currentDocument.updateTime", options.updateTime);
  const suffix = query.size ? `?${query}` : "";
  const response = await googleRequest(`${FIRESTORE_ROOT}/${documentPath}${suffix}`, {
    method: "PATCH",
    body: { fields: rawFields },
    quotaProjectId: CONFIG.stagingProjectId,
  });
  return normalizeDocument(response.body);
}

async function getDocument(documentPath, options = {}) {
  const response = options.idToken
    ? await tokenRequest(`${FIRESTORE_ROOT}/${documentPath}`, options.idToken, { allowStatuses: options.allowStatuses || [404] })
    : await googleRequest(`${FIRESTORE_ROOT}/${documentPath}`, {
      quotaProjectId: CONFIG.stagingProjectId,
      allowStatuses: options.allowStatuses || [404],
    });
  return response.status === 200 ? normalizeDocument(response.body) : null;
}

async function deleteDocument(documentPath) {
  return googleRequest(`${FIRESTORE_ROOT}/${documentPath}`, {
    method: "DELETE",
    quotaProjectId: CONFIG.stagingProjectId,
    allowStatuses: [404],
  });
}

async function listDocuments(collectionPath, options = {}) {
  const query = new URLSearchParams({ pageSize: String(options.pageSize || 300) });
  if (options.pageToken) query.set("pageToken", options.pageToken);
  const response = await googleRequest(`${FIRESTORE_ROOT}/${collectionPath}?${query}`, {
    quotaProjectId: CONFIG.stagingProjectId,
  });
  return {
    documents: (response.body?.documents || []).map(normalizeDocument),
    nextPageToken: response.body?.nextPageToken || "",
  };
}

async function commitWrites(writes) {
  const response = await googleRequest(`${FIRESTORE_ROOT}:commit`, {
    method: "POST",
    quotaProjectId: CONFIG.stagingProjectId,
    body: {
      writes: writes.map(write => {
        if (write.delete) return { delete: `${FIRESTORE_NAME_ROOT}/${write.delete}` };
        return {
          update: {
            name: `${FIRESTORE_NAME_ROOT}/${write.path}`,
            fields: encodeFields(write.data),
          },
          ...(write.mustNotExist ? { currentDocument: { exists: false } } : {}),
        };
      }),
    },
  });
  return response.body;
}

function getStagingWebConfig() {
  const apps = parseFirebaseJson(runFirebase([
    "apps:list", "--project", CONFIG.stagingProjectId, "--json",
  ]).stdout).filter(app => String(app.platform || "").toUpperCase() === "WEB");
  if (apps.length !== 1) throw new Error(`Expected one staging WEB app; found ${apps.length}.`);
  const sdkResult = parseFirebaseJson(runFirebase([
    "apps:sdkconfig", "WEB", apps[0].appId,
    "--project", CONFIG.stagingProjectId,
    "--json",
  ]).stdout);
  const sdk = sdkResult.sdkConfig || JSON.parse(sdkResult.fileContents || "{}");
  if (sdk.projectId !== CONFIG.stagingProjectId || !sdk.apiKey) {
    throw new Error("The staging WEB SDK configuration is incomplete or targets the wrong project.");
  }
  return { app: apps[0], sdk };
}

async function publicJsonRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof URLSearchParams)) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  const body = options.body === undefined
    ? undefined
    : options.body instanceof URLSearchParams
      ? options.body.toString()
      : JSON.stringify(options.body);
  const response = await fetch(url, { method: options.method || "GET", headers, body });
  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  }
  if (!response.ok && !(options.allowStatuses || []).includes(response.status)) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(parsed).slice(0, 2000)}`);
    error.status = response.status;
    error.response = parsed;
    throw error;
  }
  return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), body: parsed };
}

async function createAnonymousIdentity(apiKey) {
  return (await publicJsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: { returnSecureToken: true },
  })).body;
}

async function setCustomClaims(localId, claims) {
  const response = await googleRequest(
    `https://identitytoolkit.googleapis.com/v1/projects/${CONFIG.stagingProjectId}/accounts:update`,
    {
      method: "POST",
      quotaProjectId: CONFIG.stagingProjectId,
      body: { localId, customAttributes: JSON.stringify(claims) },
    },
  );
  return response.body;
}

async function refreshIdentity(apiKey, refreshToken) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const response = await publicJsonRequest(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return response.body;
}

async function tokenRequest(url, idToken, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${idToken}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json; charset=utf-8");
  return publicJsonRequest(url, { ...options, headers });
}

async function clientSetDocument(documentPath, data, idToken) {
  return tokenRequest(`${FIRESTORE_ROOT}/${documentPath}`, idToken, {
    method: "PATCH",
    body: { fields: encodeFields(data) },
    allowStatuses: [400, 401, 403, 404],
  });
}

async function callFunction(functionName, idToken, data, options = {}) {
  let url = FUNCTION_URLS.get(functionName);
  if (!url) {
    const serviceName = functionName.toLowerCase();
    const service = await googleRequest(
      `https://run.googleapis.com/v2/projects/${CONFIG.stagingProjectId}/locations/us-central1/services/${serviceName}`,
      { quotaProjectId: CONFIG.stagingProjectId },
    );
    url = service.body?.uri;
    if (!url || !url.endsWith(".run.app")) throw new Error(`Cloud Run URI is missing for ${functionName}.`);
    FUNCTION_URLS.set(functionName, url);
  }
  const response = await tokenRequest(url, idToken || "", {
    method: "POST",
    body: { data },
    allowStatuses: options.allowStatuses || [400, 401, 403, 409, 412, 429, 500],
  });
  const error = response.body?.error;
  if (error && !options.expectError) {
    const failure = new Error(`${functionName}: ${error.status || response.status} ${error.message || "callable failed"}`);
    failure.status = response.status;
    failure.callableError = error;
    throw failure;
  }
  return response;
}

async function uploadImmutableObject(objectPath, bytes, metadata = {}) {
  const precondition = metadata.ifGenerationMatch === null
    ? ""
    : `&ifGenerationMatch=${encodeURIComponent(metadata.ifGenerationMatch ?? 0)}`;
  const start = await googleRequest(
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(CONFIG.storageBucket)}/o?uploadType=resumable${precondition}`,
    {
      method: "POST",
      quotaProjectId: CONFIG.stagingProjectId,
      headers: {
        "X-Upload-Content-Type": metadata.contentType || "application/octet-stream",
        "X-Upload-Content-Length": String(bytes.length),
      },
      body: {
        name: objectPath,
        contentType: metadata.contentType || "application/octet-stream",
        cacheControl: metadata.cacheControl || "public, max-age=31536000, immutable",
        metadata: metadata.customMetadata || {},
      },
    },
  );
  const sessionUrl = start.headers.location;
  if (!sessionUrl) throw new Error(`Storage did not return an upload session for ${objectPath}.`);
  const result = await googleRequest(sessionUrl, {
    method: "PUT",
    quotaProjectId: CONFIG.stagingProjectId,
    headers: {
      "Content-Type": metadata.contentType || "application/octet-stream",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });
  return result.body;
}

async function downloadPublicObject(objectPath, options = {}) {
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(CONFIG.storageBucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
  const startedAt = performance.now();
  const response = await fetch(url, { headers: options.headers || {} });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    bytes,
    durationMs: performance.now() - startedAt,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

module.exports = Object.freeze({
  FIRESTORE_ROOT,
  FIRESTORE_NAME_ROOT,
  encodeValue,
  encodeFields,
  decodeValue,
  decodeFields,
  normalizeDocument,
  setDocument,
  setRawDocument,
  getDocument,
  deleteDocument,
  listDocuments,
  commitWrites,
  getStagingWebConfig,
  publicJsonRequest,
  createAnonymousIdentity,
  setCustomClaims,
  refreshIdentity,
  tokenRequest,
  clientSetDocument,
  callFunction,
  uploadImmutableObject,
  downloadPublicObject,
});
