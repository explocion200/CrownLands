"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { selectMergedPull, requireChecks, selectGate } = require("./check-local-deploy-merge");
const root = path.resolve(__dirname, "..");
const sha = "a".repeat(40);
const good = { merged_at: "2026-10-15", merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name: "explocion200/CrownLands", id: 1269252620 } }, head: { sha } };
assert.equal(selectMergedPull([good], sha), good);
for (const invalid of [{...good, merged_at: null}, {...good, merge_commit_sha: "b".repeat(40)},
  {...good, base: {ref: "other", repo: good.base.repo}}]) {
  assert.throws(() => selectMergedPull([invalid], sha));
}
const checks = ["Static validation", "Multiplayer emulator validation", "Validate"]
  .map((name, id) => ({name, id, status: "completed", conclusion: "success", app: {slug: "github-actions"},
    head_sha: sha, check_suite: {id: 50}}));
const gate = {id: 10, check_suite_id: 50, head_sha: sha, event: "pull_request", status: "completed", conclusion: "success",
  path: ".github/workflows/crownlands-release-gate.yml", repository: {full_name: "explocion200/CrownLands", id: 1269252620}};
assert.equal(selectGate([gate], sha), gate);
assert.throws(() => selectGate([gate, {...gate, id: 11, conclusion: "failure"}], sha));
for (const patch of [{event: "push"}, {path: ".github/workflows/untrusted.yml"}, {head_sha: "b".repeat(40)},
  {repository: {...gate.repository, id: 1}}]) assert.throws(() => selectGate([{...gate, ...patch}], sha));
requireChecks(checks, gate, sha);
assert.throws(() => requireChecks(checks.slice(1), gate, sha));
assert.throws(() => requireChecks([...checks, {...checks[0], id: 100, conclusion: "failure"}], gate, sha));
for (const patch of [{app: {slug: "other"}}, {head_sha: "b".repeat(40)}, {check_suite: {id: 51}}]) {
  assert.throws(() => requireChecks(checks.map(c => ({...c, ...patch})), gate, sha));
}
const workflow = fs.readFileSync(path.join(root, ".github/workflows/crownlands-local-publish.yml"), "utf8");
assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
assert.doesNotMatch(workflow, /pull_request_target:|runs-on: self-hosted|firebase deploy|FIREBASE_TOKEN/);
assert.match(workflow, /check-local-deploy-merge\.js[\s\S]*build-production-client\.js[\s\S]*validate-production-artifact\.js[\s\S]*Sign release provenance/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /--prerelease --latest=false/);
assert.doesNotMatch(workflow, /actions\/attest|attestations:|id-token:/);
assert.match(workflow, /CROWNLANDS_PUBLISH_SIGNING_KEY: \$\{\{ secrets\.CROWNLANDS_PUBLISH_SIGNING_KEY \}\}/);
for (const match of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(match[1], /@[0-9a-f]{40}$/);
execFileSync("bash", ["-n", "tools/local-deploy/install.sh"], {cwd: root, stdio: "inherit"});
const installer = fs.readFileSync(path.join(root, "tools/local-deploy/install.sh"), "utf8");
assert.match(installer, /install -o root -g root -m 0600 github-app\.pem/);
assert.match(installer, /github_access\.py local_runtime\.py/);
execFileSync(process.platform === "win32" ? "python" : "python3",
  ["-B", "tools/local-deploy/tests.py"], {cwd: root, stdio: "inherit"});
execFileSync(process.platform === "win32" ? "python" : "python3",
  ["-B", "tools/local-deploy/private_tests.py"], {cwd: root, stdio: "inherit"});
console.log("Validated merged-PR authorization, publisher security, atomic activation and rollback.");
