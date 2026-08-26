#!/usr/bin/env node
const {
  SafetyError,
  assertNode22,
  getRepoRoot,
  gitOutput,
  runGit,
} = require("./safe-update-lib");

function main() {
  assertNode22();
  const repoRoot = getRepoRoot();
  runGit(repoRoot, ["config", "core.hooksPath", ".githooks"]);
  const configured = gitOutput(repoRoot, ["config", "--get", "core.hooksPath"]);
  if (configured !== ".githooks") {
    throw new SafetyError("Git did not retain the repository hook configuration.");
  }
  console.log("[Crownlands] Git safeguards are installed for this checkout.");
}

try {
  main();
} catch (error) {
  const message = error instanceof SafetyError ? error.message : error.stack || error.message;
  console.error(`[Crownlands] Hook setup stopped safely: ${message}`);
  process.exitCode = 1;
}
