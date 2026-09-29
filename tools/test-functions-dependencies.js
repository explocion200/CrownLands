"use strict";
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");

// Resolve the production dependency chain, not a separate test-only URI copy.
const functionsRequire = createRequire(path.resolve(__dirname, "../functions/package.json"));
const frameworkRequire = createRequire(functionsRequire.resolve("@google-cloud/functions-framework"));
const eventsRequire = createRequire(frameworkRequire.resolve("cloudevents"));
const ajvRequire = createRequire(eventsRequire.resolve("ajv"));
const uri = ajvRequire("fast-uri");

assert.throws(() => uri.serialize({ scheme: "http", host: "trusted.example", port: "@127.0.0.1:8124", path: "/app" }), /port/i);
const confusedHost = "http://[@127.0.0.1/app";
assert.equal(uri.parse(confusedHost).host, new URL(confusedHost).hostname, "Host decisions must match the HTTP client's authority interpretation.");
assert.equal(uri.parse("http://[127.0.0.1/app").error, "URI host is malformed.");
assert.equal(uri.parse("https://example.com:443/path").host, "example.com");
assert.equal(uri.parse("http://[::1]:8080/path").error, undefined);

const Ajv = eventsRequire("ajv");
const ajv = new Ajv();
ajv.addSchema({ $id: "https://crownlands.example/schemas/value", type: "integer", minimum: 0 });
const validate = ajv.compile({ $id: "https://crownlands.example/schemas/event", type: "object",
  properties: { value: { $ref: "./value" } }, required: ["value"] });
assert.equal(validate({ value: 3 }), true);
assert.equal(validate({ value: -1 }), false);

const { CloudEvent, HTTP } = frameworkRequire("cloudevents");
const event = new CloudEvent({ id: "dependency-smoke", type: "crownlands.test", source: "/tests/dependencies", data: { value: 3 } });
assert.equal(event.validate(), true);
const message = HTTP.structured(event);
const decoded = HTTP.toEvent(message);
assert.equal(decoded.id, event.id);
assert.deepEqual(decoded.data, event.data);
assert.throws(() => new CloudEvent({ id: "invalid", source: "/tests/dependencies" }));
console.log("Validated production URI security fixes, schema references, and CloudEvent validation/HTTP round trips.");
