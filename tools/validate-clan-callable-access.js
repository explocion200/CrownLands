const assert = require("node:assert/strict");

const projectId = process.argv[2] || process.env.GCLOUD_PROJECT || "crown-land-b15e0";
const region = process.env.FUNCTION_REGION || "us-central1";
const clanCallables = [
  "createClan",
  "updateClanProfile",
  "joinOpenClan",
  "applyToClan",
  "cancelClanApplication",
  "reviewClanApplication",
  "leaveClan",
  "kickClanMember",
  "promoteClanMember",
  "demoteClanOfficer",
  "transferClanLeadership",
  "claimInactiveClanLeadership",
  "disbandClan",
  "sendClanMessage",
  "reportClanMessage",
];

async function validateCallable(name) {
  const url = `https://${region}-${projectId}.cloudfunctions.net/${name}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: {} }),
    signal: AbortSignal.timeout(30_000),
  });
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();

  assert.notEqual(response.status, 403, `${name} is blocked by its Cloud Run invoker policy.`);
  assert.match(contentType, /application\/json/i, `${name} did not return the Firebase callable protocol.`);

  const payload = JSON.parse(body);
  assert.equal(
    payload?.error?.status,
    "UNAUTHENTICATED",
    `${name} did not reach its Firebase authentication guard.`
  );
}

Promise.all(clanCallables.map(validateCallable))
  .then(() => {
    console.log(`Validated public access to ${clanCallables.length} clan callable endpoints in ${projectId}.`);
  })
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
