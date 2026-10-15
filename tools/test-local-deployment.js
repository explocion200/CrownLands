"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { selectMergedPull, requireChecks } = require("./check-local-deploy-merge");
const root = path.resolve(__dirname, "..");
const sha = "a".repeat(40);
const good = { merged_at: "2026-10-15", merge_commit_sha: sha,
  base: { ref: "main", repo: { full_name: "explocion200/CrownLands" } }, head: { sha } };
assert.equal(selectMergedPull([good], sha), good);
for (const invalid of [{...good, merged_at: null}, {...good, merge_commit_sha: "b".repeat(40)},
  {...good, base: {ref: "other", repo: good.base.repo}}]) {
  assert.throws(() => selectMergedPull([invalid], sha));
}
const checks = ["Static validation", "Multiplayer emulator validation", "Validate"]
  .map((name, id) => ({name, id, status: "completed", conclusion: "success", app: {slug: "github-actions"}}));
requireChecks(checks);
assert.throws(() => requireChecks(checks.slice(1)));
assert.throws(() => requireChecks([...checks, {...checks[0], id: 100, conclusion: "failure"}]));
assert.throws(() => requireChecks(checks.map(c => ({...c, app: {slug: "other"}}))));
const workflow = fs.readFileSync(path.join(root, ".github/workflows/crownlands-local-publish.yml"), "utf8");
assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
assert.doesNotMatch(workflow, /pull_request_target:|runs-on: self-hosted|firebase deploy|FIREBASE_TOKEN/);
assert.match(workflow, /check-local-deploy-merge\.js[\s\S]*build-production-client\.js[\s\S]*validate-production-artifact\.js[\s\S]*Sign release provenance/);
assert.match(workflow, /cancel-in-progress: false/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /--prerelease --latest=false/);
for (const match of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(match[1], /@[0-9a-f]{40}$/);
execFileSync(process.platform === "win32" ? "python" : "python3",
  ["-B", "tools/local-deploy/tests.py"], {cwd: root, stdio: "inherit"});
console.log("Validated merged-PR authorization, publisher security, atomic activation and rollback.");
