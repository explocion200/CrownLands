"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const REPO = "explocion200/CrownLands";

function signPackage(bytes, authorization, env, privateKey) {
  if (env.GITHUB_REPOSITORY !== REPO || env.GITHUB_REPOSITORY_ID !== "1269252620"
      || env.GITHUB_REF !== "refs/heads/main" || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "")
      || env.RUNNER_ENVIRONMENT !== "github-hosted" || !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)
      || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || "") || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || "")) {
    throw new Error("Only the GitHub-hosted main publication workflow can sign a release.");
  }
  if (authorization.commit !== env.GITHUB_SHA) throw new Error("Merged PR authorization is for a different commit.");
  const key = crypto.createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("An Ed25519 publication signing key is required.");
  const { commit, ...receipt } = authorization;
  const payload = Buffer.from(JSON.stringify({repository: REPO, repositoryId: 1269252620,
    workflow: ".github/workflows/crownlands-local-publish.yml", ref: env.GITHUB_REF, commit,
    runnerEnvironment: env.RUNNER_ENVIRONMENT, event: env.GITHUB_EVENT_NAME,
    runId: Number(env.GITHUB_RUN_ID), runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    packageSha256: crypto.createHash("sha256").update(bytes).digest("hex"), authorization: receipt}));
  return {schemaVersion: 2, payload: payload.toString("base64"), signature: crypto.sign(null, payload, key).toString("base64")};
}

if (require.main === module) {
  try {
    const envelope = signPackage(fs.readFileSync("release-artifacts/local-game.tar.gz"),
      JSON.parse(fs.readFileSync("release-artifacts/publish-authorization.json", "utf8")),
      process.env, process.env.CROWNLANDS_PUBLISH_SIGNING_KEY);
    fs.writeFileSync("release-artifacts/provenance.json", JSON.stringify(envelope) + "\n");
    console.log("Signed the exact Crownlands package with the dedicated publication key.");
  } catch {
    // Crypto errors must never echo signing material or environment values.
    console.error("Release signing failed; check the signing secret and merged-PR authorization.");
    process.exitCode = 1;
  }
}
module.exports = {signPackage};
