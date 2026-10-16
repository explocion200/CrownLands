"use strict";

// Match the document storage budget, not the much larger REST/backup JSON
// representation. Type wrappers, base64 expansion and JSON escapes are not
// player data: https://firebase.google.com/docs/firestore/storage-size
const stringSize = value => Buffer.byteLength(value, "utf8") + 1;
function nameSize(name) {
  const path = name.includes("/documents/") ? name.split("/documents/")[1] : name;
  return path.split("/").reduce((size, part) => size + stringSize(part), 16);
}
function fieldsSize(fields) {
  return Object.entries(fields || {}).reduce((size, [name, value]) => size + stringSize(name) + valueSize(value), 32);
}
function valueSize(value) {
  if ("nullValue" in value || "booleanValue" in value) return 1;
  if ("integerValue" in value || "doubleValue" in value || "timestampValue" in value) return 8;
  if ("geoPointValue" in value) return 16;
  if ("stringValue" in value) return stringSize(value.stringValue);
  if ("bytesValue" in value) return Buffer.from(value.bytesValue, "base64").length;
  if ("referenceValue" in value) return nameSize(value.referenceValue);
  if ("arrayValue" in value) return (value.arrayValue.values || []).reduce((size, item) => size + valueSize(item), 0);
  if ("mapValue" in value) return fieldsSize(value.mapValue.fields);
  throw Error("Unsupported document value size");
}
function documentSize(body) { return nameSize(body.name) + fieldsSize(body.fields); }
module.exports = { documentSize };
