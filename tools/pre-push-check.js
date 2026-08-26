#!/usr/bin/env node
const fs = require("node:fs");
const {
  SafetyError,
  assertClean,
  assertFeatureBranch,
  assertNode22,
  assertOrigin,
  divergence,
  fetchOrigin,
  getRepoRoot,
  verifyPreparationReceipt,
} = require("./safe-update-lib");

function main() {
  assertNode22();
  const repoRoot = getRepoRoot();
  const remoteName = process.argv[2] || "origin";
  if (remoteName !== "origin") {
    throw new SafetyError(`Prepared Crownlands branches may only be pushed to origin, not ${remoteName}.`);
  }
  const updates = fs.readFileSync(0, "utf8").trim().split(/\r?\n/).filter(Boolean);
  for (const update of updates) {
    const [localRef, , remoteRef] = update.split(/\s+/);
    if (localRef === "refs/heads/main" || remoteRef === "refs/heads/main") {
      throw new SafetyError("Direct pushes from local main or to GitHub main are blocked. Use a pull request.");
    }
  }

  assertClean(repoRoot);
  assertOrigin(repoRoot);
  const branch = assertFeatureBranch(repoRoot);
  for (const update of updates) {
    const [, , remoteRef] = update.split(/\s+/);
    if (remoteRef?.startsWith("refs/heads/") && remoteRef !== `refs/heads/${branch}`) {
      throw new SafetyError(`The prepared ${branch} commit cannot be pushed to ${remoteRef}. Push it to its matching feature branch.`);
    }
  }
  fetchOrigin(repoRoot);
  const counts = divergence(repoRoot, "origin/main", "HEAD");
  if (counts.behind > 0) {
    throw new SafetyError(`${branch} is ${counts.behind} commit(s) behind origin/main. Update the branch and run prepare-pr again.`);
  }
  verifyPreparationReceipt(repoRoot, branch);
  console.log(`[Crownlands] Push approved for prepared commit on ${branch}.`);
}

try {
  main();
} catch (error) {
  const message = error instanceof SafetyError ? error.message : error.stack || error.message;
  console.error(`[Crownlands] Push blocked safely: ${message}`);
  process.exitCode = 1;
}
