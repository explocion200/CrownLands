const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const firebaseToolsRoot = path.join(root, "functions", "node_modules", "firebase-tools", "lib");
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8"));
const projectId = String(projectConfig?.projects?.default || "").trim();
assert.ok(projectId, ".firebaserc does not define a default Firebase project.");

const firebaseAuth = require(path.join(firebaseToolsRoot, "auth.js"));
const { requireAuth } = require(path.join(firebaseToolsRoot, "requireAuth.js"));
const rulesApi = require(path.join(firebaseToolsRoot, "gcp", "rules.js"));
const functionsBackend = require(path.join(firebaseToolsRoot, "deploy", "functions", "backend.js"));

const normalize = value => String(value || "").replace(/\r\n/g, "\n").trimEnd();
const hash = value => crypto.createHash("sha256").update(normalize(value)).digest("hex");

function sourceGenerationTime(endpoint) {
  const generation = String(endpoint?.source?.storageSource?.generation || "");
  assert.match(generation, /^\d+$/, `${endpoint?.id || "Function"} has no source generation timestamp.`);
  return Number(BigInt(generation) / 1000n);
}

async function main() {
  const account = firebaseAuth.getProjectDefaultAccount(root);
  assert.ok(account, "Firebase authentication is required. Run firebase login first.");
  const options = { project: projectId, projectId, nonInteractive: true };
  firebaseAuth.setActiveAccount(options, account);
  await requireAuth(options);

  const releases = await rulesApi.listAllReleases(projectId);
  const rulesetName = await rulesApi.getLatestRulesetName(projectId, "cloud.firestore", releases);
  assert.ok(rulesetName, "Production has no active Cloud Firestore ruleset.");
  const release = releases.find(candidate => candidate.rulesetName === rulesetName);
  assert.ok(release, `Could not resolve the active Firestore release for ${rulesetName}.`);
  const deployedFiles = await rulesApi.getRulesetContent(rulesetName);
  const deployedRules = deployedFiles.find(file => path.basename(file.name || "") === "firestore.rules")
    || deployedFiles[0];
  assert.ok(deployedRules?.content, "The active Firestore ruleset has no readable source.");

  const localRules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
  if (normalize(deployedRules.content) !== normalize(localRules)) {
    throw new Error([
      "Production Firestore rules do not match this checkout.",
      `local sha256=${hash(localRules)}`,
      `deployed sha256=${hash(deployedRules.content)}`,
    ].join(" "));
  }

  const backend = await functionsBackend.existingBackend({ projectId });
  const endpoints = functionsBackend.allEndpoints(backend);
  const requiredFunctions = ["getRealmInfo", "syncPlayerIdentity"];
  const deployedAtOrAfter = Number(execFileSync("git", ["show", "-s", "--format=%ct", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim()) * 1000;
  for (const functionName of requiredFunctions) {
    const endpoint = endpoints.find(candidate => candidate.id === functionName && candidate.region === "us-central1");
    assert.ok(endpoint, `Production is missing us-central1/${functionName}.`);
    assert.equal(endpoint.platform, "gcfv2", `${functionName} is not deployed on Cloud Functions v2.`);
    assert.equal(endpoint.runtime, "nodejs22", `${functionName} is not deployed on Node 22.`);
    assert.ok(sourceGenerationTime(endpoint) >= deployedAtOrAfter, [
      `${functionName} predates commit ${execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim()}.`,
      "Deploy Functions from this checkout before releasing the client.",
    ].join(" "));
  }

  assert.ok(Date.parse(release.createTime) >= deployedAtOrAfter,
    "The active Firestore release predates this commit. Deploy firestore:rules from this checkout.");

  console.log([
    `Production flag backend matches ${projectId}.`,
    `ruleset=${rulesetName.split("/").pop()}`,
    `rulesSha256=${hash(localRules)}`,
    `functions=${requiredFunctions.join(",")}`,
  ].join(" "));
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
