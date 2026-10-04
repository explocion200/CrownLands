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
assert.equal(uri.parse("//%41.com").host, "a.com", "Encoded hostnames must use the same case normalization as literal hosts.");
assert.equal(uri.equal("//%41.com", "//a.com"), true);

// Exercise the actual Firestore dependency path used by deployed functions.
const adminRequire = createRequire(functionsRequire.resolve("firebase-admin/firestore"));
const firestoreRequire = createRequire(adminRequire.resolve("@google-cloud/firestore"));
const gaxRequire = createRequire(firestoreRequire.resolve("google-gax"));
const { BaseServerInterceptingCall } = gaxRequire("@grpc/grpc-js/build/src/server-interceptors");
const { TLSSocket } = require("node:tls");
const socket = Object.create(TLSSocket.prototype);
const certificate = { raw: Buffer.from("dependency-test-certificate") };
socket.getPeerCertificate = () => certificate;
const call = { stream: { session: { socket } } };
socket.authorized = false;
assert.deepEqual(BaseServerInterceptingCall.prototype.getAuthContext.call(call), {},
  "An unauthorized TLS certificate must not be exposed as an authenticated peer.");
socket.authorized = true;
assert.equal(BaseServerInterceptingCall.prototype.getAuthContext.call(call).sslPeerCertificate, certificate);
assert.deepEqual(BaseServerInterceptingCall.prototype.getAuthContext.call({ stream: { session: { socket: {} } } }), {});

// Isolate parser regressions: the old 252-byte boundary can block the event loop,
// so a timer in the same process would not enforce a useful test deadline.
const { spawnSync } = require("node:child_process");
const multipart = spawnSync(process.execPath, ["-e", `
  const assert = require('node:assert/strict');
  const Busboy = require(process.argv[1]);
  const boundary = 'b'.repeat(252);
  const parser = new Busboy({ headers: { 'content-type': 'multipart/form-data; boundary=' + boundary } });
  const fields = [];
  let finished = false;
  parser.on('field', (name, value) => fields.push([name, value]));
  parser.on('error', error => { throw error; });
  parser.on('finish', () => {
    assert.deepEqual(fields, [['health', 'ok']]);
    finished = true;
  });
  process.on('exit', () => assert.equal(finished, true, 'Multipart parsing did not complete.'));
  parser.end('x'.repeat(1024) + '\\r\\n--' + boundary + '\\r\\n'
    + 'Content-Disposition: form-data; name="health"\\r\\n'
    + '__proto__: safe\\r\\nconstructor: safe\\r\\n\\r\\nok\\r\\n--' + boundary + '--\\r\\n');
`, adminRequire.resolve("@fastify/busboy")], { encoding: "utf8", timeout: 5000, windowsHide: true });
assert.equal(multipart.error, undefined, "Multipart parsing must finish within its isolated deadline.");
assert.equal(multipart.status, 0, multipart.stderr || "Multipart parsing failed.");

const rimrafRequire = createRequire(gaxRequire.resolve("rimraf"));
const globRequire = createRequire(rimrafRequire.resolve("glob"));
const minimatchRequire = createRequire(globRequire.resolve("minimatch"));
const expand = minimatchRequire("brace-expansion");
assert.deepEqual(expand("region-{a,b}-{1..2}"), ["region-a-1", "region-a-2", "region-b-1", "region-b-2"]);
assert.doesNotThrow(() => expand("{".repeat(4000) + "a,b" + "}".repeat(4000)), "Deep patterns must not exhaust the server stack.");

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
console.log("Validated production URI, TLS certificate and multipart parser security fixes, schema references, and CloudEvent round trips.");
