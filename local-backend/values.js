"use strict";
const { isDeepStrictEqual } = require("node:util");
const MIN_INT64 = -(2n ** 63n), MAX_INT64 = 2n ** 63n - 1n;

class Timestamp {
  constructor(seconds, nanoseconds) {
    if (!Number.isInteger(seconds) || !Number.isInteger(nanoseconds) || nanoseconds < 0 || nanoseconds >= 1e9) throw Error("Invalid timestamp");
    this.seconds = seconds; this.nanoseconds = nanoseconds;
  }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromMillis(value) { const seconds = Math.floor(value / 1000); return new Timestamp(seconds, Math.round((value - seconds * 1000) * 1e6)); }
  static fromDate(value) { return Timestamp.fromMillis(value.getTime()); }
  static fromString(value) {
    const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value);
    if (!match) throw Error("Unsupported timestamp encoding");
    return new Timestamp(Date.parse(match[1] + "Z") / 1000, Number((match[2] || "").padEnd(9, "0")));
  }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  toDate() { return new Date(this.toMillis()); }
  toString() { return new Date(this.seconds * 1000).toISOString().slice(0, 19) + "." + String(this.nanoseconds).padStart(9, "0") + "Z"; }
  isEqual(other) { return other?.seconds === this.seconds && other?.nanoseconds === this.nanoseconds; }
  valueOf() { return this.toMillis(); }
}

class ReferenceValue { constructor(name) { this.name = name; this.path = name.split("/documents/")[1]; } }
class GeoPoint { constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; } }
class FieldPath {
  constructor(...segments) {
    if (!segments.length || segments.some(s => typeof s !== "string" || !s.length)) throw Error("Invalid field path");
    this.segments = segments;
  }
  static documentId() { return new FieldPath("__name__"); }
  toString() { return this.segments.join("."); }
}
class Transform { constructor(kind, values = []) { this.kind = kind; this.values = values; } }
const FieldValue = Object.freeze({
  serverTimestamp: () => new Transform("timestamp"), delete: () => new Transform("delete"),
  increment: n => { if (typeof n !== "number" || !Number.isFinite(n)) throw Error("Invalid increment"); return new Transform("increment", [n]); },
  arrayUnion: (...values) => new Transform("union", values), arrayRemove: (...values) => new Transform("remove", values),
});

function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "bigint") {
    if (value < MIN_INT64 || value > MAX_INT64) throw Error("Integer outside signed 64-bit range");
    return { integerValue: String(value) };
  }
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && !Object.is(value, -0)) return { integerValue: String(value) };
    return { doubleValue: Number.isNaN(value) ? "NaN" : value === Infinity ? "Infinity" : value === -Infinity ? "-Infinity" : value };
  }
  if (value instanceof Timestamp) return { timestampValue: value.toString() };
  if (value instanceof Date) return { timestampValue: Timestamp.fromDate(value).toString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { bytesValue: Buffer.from(value).toString("base64") };
  if (value instanceof ReferenceValue || value?._documentReference === true) return { referenceValue: value.name };
  if (value instanceof GeoPoint) return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(item => {
    if (Array.isArray(item)) throw Error("Nested arrays are not supported by Firestore");
    return encode(item);
  }) } };
  if (value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  }
  throw Error("Unsupported document value");
}

function decode(value, referenceFactory = name => new ReferenceValue(name)) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 1) throw Error("Malformed typed document value");
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) {
    const n = BigInt(value.integerValue);
    if (n < MIN_INT64 || n > MAX_INT64) throw Error("Integer outside signed 64-bit range");
    return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;
  }
  if ("doubleValue" in value) return value.doubleValue === "NaN" ? NaN : value.doubleValue === "Infinity" ? Infinity : value.doubleValue === "-Infinity" ? -Infinity : Number(value.doubleValue);
  if ("timestampValue" in value) return Timestamp.fromString(value.timestampValue);
  if ("bytesValue" in value) return Buffer.from(value.bytesValue, "base64");
  if ("referenceValue" in value) return referenceFactory(value.referenceValue);
  if ("geoPointValue" in value) return new GeoPoint(value.geoPointValue.latitude, value.geoPointValue.longitude);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(item => decode(item, referenceFactory));
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item, referenceFactory)]));
  throw Error("Unknown document value type");
}

function segments(field) {
  if (field instanceof FieldPath) return field.segments;
  if (typeof field !== "string" || !field || field.split(".").some(s => !s || /[`\[\]*\/]/.test(s))) throw Error("Unsupported field path");
  return field.split(".");
}
function getField(data, field) { return segments(field).reduce((value, key) => value && Object.hasOwn(value, key) ? value[key] : undefined, data); }
function setField(data, field, value) {
  const keys = segments(field);
  let cursor = data;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      if (value instanceof Transform && value.kind === "delete") delete cursor[key];
      else Object.defineProperty(cursor, key, { value, enumerable: true, configurable: true, writable: true });
    } else {
      if (!Object.hasOwn(cursor, key) || !cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
        Object.defineProperty(cursor, key, { value: {}, enumerable: true, configurable: true, writable: true });
      }
      cursor = cursor[key];
    }
  });
}

function plain(value) { return value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function applyValue(previous, next, merge, timestamp) {
  if (next instanceof Transform) {
    if (next.kind === "timestamp") return timestamp;
    if (next.kind === "delete") return next;
    if (next.kind === "increment") {
      if (typeof previous === "bigint") return previous + BigInt(next.values[0]);
      return (typeof previous === "number" ? previous : 0) + next.values[0];
    }
    const existing = Array.isArray(previous) ? [...previous] : [];
    if (next.kind === "union") {
      for (const value of next.values) if (!existing.some(item => isDeepStrictEqual(encode(item), encode(value)))) existing.push(value);
      return existing;
    }
    if (next.kind === "remove") return existing.filter(item => !next.values.some(value => isDeepStrictEqual(encode(item), encode(value))));
    throw Error("Unknown document transform");
  }
  if (plain(next)) {
    const result = merge && plain(previous) && Object.keys(next).length ? { ...previous } : {};
    for (const [key, value] of Object.entries(next)) {
      const resolved = applyValue(previous?.[key], value, merge, timestamp);
      if (resolved instanceof Transform && resolved.kind === "delete") delete result[key];
      else Object.defineProperty(result, key, { value: resolved, enumerable: true, configurable: true, writable: true });
    }
    return result;
  }
  return next;
}
function applyWrite(previous, patch, kind, options, timestamp) {
  if (!plain(patch)) throw Error("Document must be a map");
  if (kind === "update") {
    if (previous === undefined) throw Object.assign(Error("Document does not exist"), { code: 5 });
    const result = decode(encode(previous));
    const fields = Object.keys(patch).map(key => segments(key));
    for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) {
      const length = Math.min(fields[i].length, fields[j].length);
      if (fields[i].slice(0, length).every((part, index) => part === fields[j][index])) throw Error("Conflicting update paths");
    }
    for (const [key, value] of Object.entries(patch)) setField(result, key, applyValue(getField(previous, key), value, false, timestamp));
    return result;
  }
  if (options?.mergeFields) throw Error("Explicit mergeFields requires migration coverage before use");
  return applyValue(previous, patch, options?.merge === true, timestamp);
}

module.exports = { Timestamp, ReferenceValue, GeoPoint, FieldPath, FieldValue, Transform, encode, decode, segments, getField, setField, applyWrite };
