"use strict";
const assert = require("node:assert/strict");
const V = require("../local-backend/values");
const timestamp = V.Timestamp.fromString("2026-10-15T12:00:00.123456789Z");
const value = { int: 9223372036854775807n, negative: -9223372036854775808n, bytes: Buffer.from([0, 1, 255]),
  stamp: timestamp, ref: new V.ReferenceValue("projects/fixture/databases/(default)/documents/missing/parent/children/a"),
  array: [1, "1", null, false, NaN, Infinity], map: { nested: "🔑" } };
assert.deepEqual(V.decode(V.encode(value)), value);
assert.equal(V.decode({ timestampValue: "2026-10-15T12:00:00Z" }).nanoseconds, 0);
assert.equal(V.decode({ integerValue: "9007199254740991" }), Number.MAX_SAFE_INTEGER);
assert.throws(() => V.encode(2n ** 63n));
assert.throws(() => V.encode({ invalid: undefined }));
assert.throws(() => V.decode({ unexpected: true }));
assert.throws(() => V.applyWrite(undefined, { gold: 1 }, "update", {}, timestamp));
const before = { gold: 100, settings: { one: true, two: true }, tags: ["one"] };
const after = V.applyWrite(before, { gold: V.FieldValue.increment(-20), "settings.two": V.FieldValue.delete(),
  tags: V.FieldValue.arrayUnion("one", "two"), touched: V.FieldValue.serverTimestamp() }, "update", {}, timestamp);
assert.deepEqual(after, { gold: 80, settings: { one: true }, tags: ["one", "two"], touched: timestamp });
assert.deepEqual(before, { gold: 100, settings: { one: true, two: true }, tags: ["one"] });
assert.deepEqual(V.applyWrite(before, { settings: { one: false } }, "set", { merge: true }, timestamp).settings, { one: false, two: true });
assert.deepEqual(V.applyWrite(before, { settings: {} }, "set", { merge: true }, timestamp).settings, {});
assert.deepEqual(V.applyWrite(before, { settings: { one: false } }, "update", {}, timestamp).settings, { one: false });
assert.throws(() => V.applyWrite(before, { settings: {}, "settings.one": true }, "update", {}, timestamp));
const polluted = V.decode(V.encode(JSON.parse('{"__proto__":{"polluted":true}}')));
assert.equal({}.polluted, undefined);
assert.equal(Object.hasOwn(polluted, "__proto__"), true);
const fakeReference = { _documentReference: true, name: "not-a-reference", private: "fixture" };
assert.deepEqual(V.decode(V.encode(fakeReference)), fakeReference, "A client map must not impersonate an internal reference");
console.log("Local document values: precision, references, timestamps, transforms, merge semantics and prototype safety passed.");
