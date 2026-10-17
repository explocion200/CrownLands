"use strict";
const fs = require("node:fs");

const REQUIRED = ["Static validation", "Multiplayer emulator validation", "Validate"];
const REPO = "explocion200/CrownLands";

function selectMergedPull(pulls, sha) {
  const pr = pulls.find(p => p.merged_at && p.merge_commit_sha === sha
    && p.base?.ref === "main" && p.base?.repo?.full_name === REPO && p.base?.repo?.id === 1269252620);
  if (!pr || !/^[0-9a-f]{40}$/.test(pr.head?.sha || "")) {
    throw new Error("Publication requires a merged pull request targeting this repository's main branch.");
  }
  return pr;
}

function requireChecks(checks, gate, head) {
  if (!gate?.check_suite_id || !/^[0-9a-f]{40}$/.test(head || "")) throw new Error("Trusted release gate required.");
  for (const name of REQUIRED) {
    const matches = checks.filter(c => c.name === name && c.app?.slug === "github-actions"
      && c.check_suite?.id === gate.check_suite_id && c.head_sha === head)
      .sort((a, b) => b.id - a.id);
    if (!matches.length || matches[0].status !== "completed" || matches[0].conclusion !== "success") {
      throw new Error("Required PR check has not passed: " + name);
    }
  }
}

function selectGate(runs, head) {
  const latest = runs.filter(r => r.head_sha === head && r.event === "pull_request"
    && r.path === ".github/workflows/crownlands-release-gate.yml").sort((a, b) => b.id - a.id)[0];
  if (!latest || latest.repository?.full_name !== REPO || latest.repository?.id !== 1269252620
      || latest.status !== "completed" || latest.conclusion !== "success") {
    throw new Error("The latest release-gate run for this PR head has not passed.");
  }
  return latest;
}

async function api(path) {
  const response = await fetch("https://api.github.com/repos/" + REPO + "/" + path, {
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + process.env.GH_TOKEN },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("GitHub authorization check failed: HTTP " + response.status);
  return response.json();
}

async function main() {
  const sha = process.env.GITHUB_SHA;
  if (process.env.GITHUB_REPOSITORY !== REPO || process.env.GITHUB_REF !== "refs/heads/main"
      || !/^[0-9a-f]{40}$/.test(sha || "")) throw new Error("Only this repository's main branch can publish.");
  const pr = selectMergedPull(await api("commits/" + sha + "/pulls?per_page=100"), sha);
  const commit = await api("commits/" + sha);
  const parent = commit.parents?.[0]?.sha;
  if (commit.sha !== sha || !/^[0-9a-f]{40}$/.test(parent || "")) throw new Error("Merged commit parent identity missing.");
  const comparison = await api("compare/" + parent + "..." + pr.head.sha);
  if (!["ahead", "identical"].includes(comparison.status) || comparison.merge_base_commit?.sha !== parent) {
    throw new Error("Reviewed PR head was not current with main before merge.");
  }
  const runs = await api("actions/workflows/crownlands-release-gate.yml/runs?event=pull_request&head_sha="
    + pr.head.sha + "&per_page=100");
  if (runs.total_count > 100) throw new Error("Too many gate runs; cannot verify complete results.");
  const latest = selectGate(runs.workflow_runs, pr.head.sha);
  const checks = [];
  for (let page = 1; page <= 10; page++) {
    const data = await api("check-suites/" + latest.check_suite_id + "/check-runs?filter=all&per_page=100&page=" + page);
    checks.push(...data.check_runs);
    if (checks.length >= data.total_count) break;
    if (page === 10) throw new Error("Too many checks; cannot verify complete results.");
  }
  requireChecks(checks, latest, pr.head.sha);
  fs.mkdirSync("release-artifacts", {recursive: true});
  fs.writeFileSync("release-artifacts/publish-authorization.json", JSON.stringify({commit: sha,
    pullRequest: pr.number, headSha: pr.head.sha, gateRunId: latest.id, gateRunAttempt: latest.run_attempt}) + "\n");
  console.log("Authorized merged PR #" + pr.number + " at " + sha);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { selectMergedPull, requireChecks, selectGate };
