"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { arg, externalOutput, INGRESS_PROBE_ENDPOINT } = require("./linked-account-admin-api");

async function verifyIngress({ token, expectedIp, suffixLength, fetchImpl = fetch, nowMs = Date.now() }) {
  assert(token && expectedIp, "Supply administrator ID token and expected public IP through named environment variables.");
  assert(Number.isInteger(suffixLength) && suffixLength >= 1 && suffixLength <= 8);
  const results = [];
  for (const spoof of [null, "203.0.113.222", "198.51.100.10, 203.0.113.222", "::ffff:203.0.113.222, invalid-prefix"]) {
    const response = await fetchImpl(INGRESS_PROBE_ENDPOINT, { method: "POST", headers: {
      authorization: `Bearer ${token}`, "content-type": "application/json", ...(spoof ? { "x-forwarded-for": spoof } : {}),
    }, body: JSON.stringify({ data: { suffixLength, expectedIp } }) });
    const body = await response.json();
    assert(response.ok && body.result?.matchesExpected === true, "Ingress check failed; collection must remain disabled.");
    assert.equal(body.result.suffixLength, suffixLength);
    assert(/^[a-f0-9]{64}$/.test(body.result.fingerprint));
    results.push(body.result);
  }
  assert.equal(new Set(results.map(row => row.fingerprint)).size, 1, "Forged headers changed the observed source.");
  return { project: "crown-land-b15e0", verified: true, endpoint: INGRESS_PROBE_ENDPOINT, suffixLength,
    fingerprint: results[0].fingerprint, checks: results.length, checkedAtMs: nowMs };
}
async function main() {
  assert.equal(arg("project"), "crown-land-b15e0");
  const output = externalOutput(arg("output"));
  const receipt = await verifyIngress({ token: process.env[arg("token-env")], expectedIp: process.env[arg("ip-env")],
    suffixLength: Number(arg("suffix-length")) });
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  console.log("Verified four ingress checks. No raw address or token was printed. Repeat from a different public network before enabling collection.");
}
module.exports = { verifyIngress };
if (require.main === module) main().catch(() => { console.error("Ingress verification failed; IP collection was not enabled. Private request data was not printed."); process.exitCode = 1; });
