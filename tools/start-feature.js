#!/usr/bin/env node
const {
  SafetyError,
  assertClean,
  assertNode22,
  assertOrigin,
  divergence,
  fetchOrigin,
  getRepoRoot,
  normalizeFeatureName,
  parseCommandArguments,
  refExists,
  revision,
  runGit,
  writeFeatureMetadata,
} = require("./safe-update-lib");

function main() {
  assertNode22();
  const repoRoot = getRepoRoot();
  const { positionals, scopes } = parseCommandArguments(process.argv.slice(2));
  const featureName = normalizeFeatureName(positionals.join("-"));
  const branch = `codex/${featureName}`;

  assertClean(repoRoot);
  assertOrigin(repoRoot);
  fetchOrigin(repoRoot);

  if (refExists(repoRoot, `refs/heads/${branch}`) || refExists(repoRoot, `refs/remotes/origin/${branch}`)) {
    throw new SafetyError(
      `${branch} already exists locally or on GitHub. Choose a new feature name; the existing branch was not changed.`,
    );
  }

  console.log("[Crownlands] Updating local main with fast-forward-only behavior...");
  runGit(repoRoot, ["switch", "main"], { stdio: "inherit" });
  runGit(repoRoot, ["merge", "--ff-only", "origin/main"], { stdio: "inherit" });
  const main = revision(repoRoot, "main");
  const originMain = revision(repoRoot, "origin/main");
  if (main !== originMain) {
    throw new SafetyError("Local main does not exactly match origin/main after the fast-forward attempt.");
  }

  runGit(repoRoot, ["switch", "-c", branch], { stdio: "inherit" });
  const counts = divergence(repoRoot, "origin/main", "HEAD");
  if (counts.behind !== 0 || counts.ahead !== 0) {
    throw new SafetyError(`The new branch unexpectedly started ${counts.behind} behind and ${counts.ahead} ahead.`);
  }
  writeFeatureMetadata(repoRoot, {
    branch,
    featureName,
    baseRef: "origin/main",
    baseCommit: originMain,
    scopes,
    createdAt: new Date().toISOString(),
  });
  console.log(`[Crownlands] Ready on ${branch}. It is 0 commits ahead and 0 commits behind origin/main.`);
  if (!scopes.length) {
    console.log("[Crownlands] No feature paths were declared; prepare-pr will list every changed file for manual scope review.");
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof SafetyError ? error.message : error.stack || error.message;
  console.error(`[Crownlands] Start feature stopped safely: ${message}`);
  process.exitCode = 1;
}
