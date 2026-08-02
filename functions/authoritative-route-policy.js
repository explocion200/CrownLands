"use strict";

const crypto = require("node:crypto");

const AUTHORITATIVE_ROUTES_VERSION = 1;
const BULK_ORDERS_VERSION = 1;
const BULK_ORDER_IDEMPOTENCY_MS = 24 * 60 * 60 * 1000;
const NEARBY_SCOUT_RADIUS = 420;
const REGROUP_RADIUS = 680;
const MAX_NEARBY_SCOUT_TARGETS = 24;
const MAX_REGROUP_SOURCES = 40;

const MARCH_KINDS = new Set(["attack", "transfer", "reinforce", "scout"]);
const IMAGE_TERRAIN_BLOCKERS = Object.freeze({
  west: Object.freeze([
    { x: 282, y: 350, rx: 78, ry: 235, rot: -0.2 },
    { x: 300, y: 770, rx: 82, ry: 300, rot: -0.08 },
    { x: 286, y: 1120, rx: 76, ry: 245, rot: -0.14 },
  ]),
  north: Object.freeze([
    { x: 480, y: 135, rx: 220, ry: 82, rot: -0.04 },
    { x: 780, y: 120, rx: 185, ry: 82, rot: 0.08 },
    { x: 1065, y: 185, rx: 160, ry: 88, rot: 0.18 },
  ]),
  east: Object.freeze([
    { x: 890, y: 305, rx: 72, ry: 210, rot: 0.08 },
    { x: 915, y: 650, rx: 70, ry: 270, rot: -0.03 },
    { x: 820, y: 1080, rx: 72, ry: 195, rot: -0.28 },
  ]),
  south: Object.freeze([
    { x: 245, y: 485, rx: 90, ry: 125, rot: -0.3 },
    { x: 1165, y: 465, rx: 90, ry: 125, rot: 0.24 },
  ]),
  center: Object.freeze([
    { x: 205, y: 250, rx: 120, ry: 100, rot: -0.18 },
    { x: 825, y: 185, rx: 140, ry: 95, rot: 0.12 },
    { x: 985, y: 1000, rx: 105, ry: 95, rot: -0.08 },
    { x: 300, y: 990, rx: 110, ry: 90, rot: 0.08 },
  ]),
});

function safeId(value, maxLength = 96) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, maxLength);
}

function normalizeMarchKind(value, fallback = "attack") {
  const normalized = String(value || "").trim().toLowerCase();
  return MARCH_KINDS.has(normalized) ? normalized : fallback;
}

function normalizeBulkCityIds(value, maxCount) {
  const limit = Math.max(1, Math.floor(Number(maxCount) || 1));
  return [...new Set((Array.isArray(value) ? value : [])
    .map(id => safeId(id))
    .filter(Boolean))]
    .slice(0, limit + 1);
}

function requireBulkRequestId(value) {
  const requestId = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{8,96}$/.test(requestId)) {
    const error = new Error("A valid bulk-order request id is required.");
    error.code = "invalid-request-id";
    throw error;
  }
  return requestId;
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function digest(value, length = 40) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function createBulkRequestSignature(operation, payload) {
  return digest(`${String(operation || "bulk")}|${stableJson(payload)}`, 64);
}

function createBulkRequestDocumentId(operation, requestId) {
  const kind = safeId(operation, 24) || "bulk";
  return `${kind}_${digest(requestId, 40)}`;
}

function createBulkMovementId(uid, operation, requestId, cityId, index = 0) {
  const prefix = operation === "nearby_scout" ? "scout_batch" : "regroup_batch";
  return `${prefix}_${digest(`${uid}|${operation}|${requestId}|${cityId}|${index}`, 48)}`;
}

function isWithinRadius(source, target, radius) {
  const sx = Number(source?.x);
  const sy = Number(source?.y);
  const tx = Number(target?.x);
  const ty = Number(target?.y);
  const maximum = Math.max(0, Number(radius) || 0);
  if (![sx, sy, tx, ty].every(Number.isFinite)) return false;
  return Math.hypot(tx - sx, ty - sy) <= maximum + 1e-6;
}

function getAuthoritativeTerrainBlockers(regionId) {
  return IMAGE_TERRAIN_BLOCKERS[String(regionId || "").trim()] || [];
}

module.exports = {
  AUTHORITATIVE_ROUTES_VERSION,
  BULK_ORDERS_VERSION,
  BULK_ORDER_IDEMPOTENCY_MS,
  NEARBY_SCOUT_RADIUS,
  REGROUP_RADIUS,
  MAX_NEARBY_SCOUT_TARGETS,
  MAX_REGROUP_SOURCES,
  normalizeMarchKind,
  normalizeBulkCityIds,
  requireBulkRequestId,
  createBulkRequestSignature,
  createBulkRequestDocumentId,
  createBulkMovementId,
  isWithinRadius,
  getAuthoritativeTerrainBlockers,
};
