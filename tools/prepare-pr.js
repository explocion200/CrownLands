#!/usr/bin/env node
const {
  SafetyError,
  assertClean,
  assertFeatureBranch,
  assertGhAuthenticated,
  assertNode22,
  assertOrigin,
  auditBranch,
  fetchOrigin,
  getRepoRoot,
  markdownAudit,
  normalizeRepoPath,
  printAudit,
  readFeatureMetadata,
  revision,
  run,
  runGit,
  runReleaseGate,
  writePreparationReceipt,
} = require("./safe-update-lib");

function parseArgs(args) {
  const options = { checkOnly: false, scopes: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--check-only") {
      options.checkOnly = true;
    } else if (value === "--scope") {
      if (!args[index + 1]) throw new SafetyError("--scope requires a repository path.");
      options.scopes.push(normalizeRepoPath(args[index + 1]));
      index += 1;
    } else {
      throw new SafetyError(`Unknown option: ${value}`);
    }
  }
  options.scopes = [...new Set(options.scopes)];
  return options;
}

function createOrUpdatePr(repoRoot, audit) {
  const existingResult = run("gh", [
    "pr", "list", "--head", audit.branch, "--base", "main", "--state", "open",
    "--json", "url,body", "--limit", "1",
  ], { cwd: repoRoot });
  const existing = JSON.parse(existingResult.stdout || "[]");
  const title = runGit(repoRoot, ["log", "-1", "--format=%s"]).stdout.trim();
  const markerStart = "<!-- crownlands-safe-update:start -->";
  const markerEnd = "<!-- crownlands-safe-update:end -->";
  const safetySection = `${markerStart}\n${markdownAudit(audit)}\n${markerEnd}`;
  const existingBody = String(existing[0]?.body || "").trim();
  let body;
  if (existingBody.includes(markerStart) && existingBody.includes(markerEnd)) {
    const start = existingBody.indexOf(markerStart);
    const end = existingBody.indexOf(markerEnd) + markerEnd.length;
    body = `${existingBody.slice(0, start)}${safetySection}${existingBody.slice(end)}`.trim();
  } else if (existingBody) {
    body = `${existingBody}\n\n${safetySection}`;
  } else {
    body = `## Summary\n\n${title}\n\n${safetySection}`;
  }
  let url;
  if (existing.length) {
    url = existing[0].url;
    run("gh", ["pr", "edit", url, "--body", body], { cwd: repoRoot, stdio: "inherit" });
    console.log(`[Crownlands] Updated existing pull request: ${url}`);
  } else {
    const created = run("gh", [
      "pr", "create", "--base", "main", "--head", audit.branch,
      "--title", title, "--body", body,
    ], { cwd: repoRoot });
    url = created.stdout.trim().split(/\r?\n/).find(line => /^https:\/\//.test(line)) || created.stdout.trim();
    console.log(`[Crownlands] Created pull request: ${url}`);
  }

  const checks = run("gh", ["pr", "checks", url], { cwd: repoRoot, allowFailure: true });
  if (checks.stdout.trim()) console.log(checks.stdout.trim());
  if (checks.status === 8) {
    console.log("[Crownlands] Pull-request checks are pending. Wait for GitHub to finish; do not merge while checks are pending.");
  } else if (checks.status !== 0) {
    console.warn("[Crownlands] One or more pull-request checks are unavailable or failing. Inspect GitHub and do not merge until required checks pass.");
    if (checks.stderr.trim()) console.warn(checks.stderr.trim());
  } else {
    console.log("[Crownlands] Current pull-request checks are passing.");
  }
  return url;
}

function main() {
  assertNode22();
  const repoRoot = getRepoRoot();
  const options = parseArgs(process.argv.slice(2));
  assertClean(repoRoot);
  assertOrigin(repoRoot);
  const branch = assertFeatureBranch(repoRoot);
  if (!options.checkOnly) assertGhAuthenticated(repoRoot);
  fetchOrigin(repoRoot);

  const metadata = readFeatureMetadata(repoRoot, branch);
  const scopes = options.scopes.length ? options.scopes : (metadata?.scopes || []);
  const audit = auditBranch(repoRoot, { baseRef: "origin/main", scopes });
  printAudit(audit);
  runReleaseGate(repoRoot);
  assertClean(repoRoot);
  fetchOrigin(repoRoot);
  const finalAudit = auditBranch(repoRoot, { baseRef: "origin/main", scopes });
  printAudit(finalAudit);

  writePreparationReceipt(repoRoot, {
    branch,
    head: revision(repoRoot, "HEAD"),
    originMain: revision(repoRoot, "origin/main"),
    scopes,
  });
  console.log("[Crownlands] Preparation receipt saved for this exact commit and origin/main state.");
  if (options.checkOnly) {
    console.log("[Crownlands] Check-only preparation passed. A normal push is now allowed for this exact commit.");
    return;
  }

  runGit(repoRoot, ["push", "--set-upstream", "origin", `HEAD:refs/heads/${branch}`], { stdio: "inherit" });
  createOrUpdatePr(repoRoot, finalAudit);
}

try {
  main();
} catch (error) {
  const message = error instanceof SafetyError ? error.message : error.stack || error.message;
  console.error(`[Crownlands] Prepare PR stopped safely: ${message}`);
  process.exitCode = 1;
}
