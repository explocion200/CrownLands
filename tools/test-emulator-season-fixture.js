"use strict";
const assert = require("node:assert/strict");
const { assertLocalEmulator, previousSeasonFixture } = require("../functions/test/prepare-current-season-fixture");
for (const host of ["127.0.0.1:8080", "localhost:8080", "[::1]:8080"]) assert.doesNotThrow(() => assertLocalEmulator(host));
for (const host of [undefined, "firestore.googleapis.com:443", "localhost", "user@localhost:8080", "localhost:8080/path", "localhost:8080?query", "localhost:8080#fragment"]) {
  assert.throws(() => assertLocalEmulator(host), /local Firestore emulator|Invalid URL/);
}
for (const [now, prior, armed] of [
  ["2026-09-30T23:59:59.999Z", "realm-2026-08", "2026-08-01T00:00:00.001Z"],
  ["2026-10-01T00:00:00.000Z", "realm-2026-09", "2026-09-01T00:00:00.001Z"],
  ["2027-01-15T12:00:00.000Z", "realm-2026-12", "2026-12-01T00:00:00.001Z"],
]) {
  assert.deepEqual(previousSeasonFixture(Date.parse(now)), { seasonId: prior, armedAtMs: Date.parse(armed) });
}
console.log("Validated emulator-only season setup and UTC month/year rollover.");
