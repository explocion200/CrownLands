const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  auditBranch,
  isGeneratedPath,
  normalizeFeatureName,
  normalizeRepoPath,
  pathMatchesScope,
  revision,
  runGit,
  writePreparationReceipt,
} = require("./safe-update-lib");

const toolsRoot = __dirname;
const startFeature = path.join(toolsRoot, "start-feature.js");
const prePushCheck = path.join(toolsRoot, "pre-push-check.js");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    env: process.env,
    windowsHide: true,
  });
}

function git(cwd, args) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

assert.equal(normalizeFeatureName(" City Search "), "city-search");
assert.equal(normalizeFeatureName("codex/Realm__Tools"), "realm-tools");
assert.equal(normalizeRepoPath(".\\tools\\"), "tools");
assert.equal(pathMatchesScope("tools/start-feature.js", "tools"), true);
assert.equal(pathMatchesScope("game.js", "tools"), false);
assert.equal(isGeneratedPath("dist/index.html"), true);
assert.equal(isGeneratedPath("tools/start-feature.js"), false);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-safe-update-test-"));
const remote = path.join(temporaryRoot, "origin.git");
const seed = path.join(temporaryRoot, "seed");
const workspace = path.join(temporaryRoot, "workspace");
const updater = path.join(temporaryRoot, "updater");

try {
  git(temporaryRoot, ["init", "--bare", remote]);
  fs.mkdirSync(seed);
  git(seed, ["init"]);
  git(seed, ["config", "user.name", "Crownlands Test"]);
  git(seed, ["config", "user.email", "test@example.invalid"]);
  fs.writeFileSync(path.join(seed, "README.md"), "safe update test\n", "utf8");
  git(seed, ["add", "README.md"]);
  git(seed, ["commit", "-m", "seed"]);
  git(seed, ["branch", "-M", "main"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(temporaryRoot, ["clone", remote, workspace]);
  git(workspace, ["config", "user.name", "Crownlands Test"]);
  git(workspace, ["config", "user.email", "test@example.invalid"]);

  let result = run(process.execPath, [startFeature, "Example Feature", "--scope", "tools"], { cwd: workspace });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(git(workspace, ["branch", "--show-current"]), "codex/example-feature");
  assert.equal(git(workspace, ["rev-list", "--left-right", "--count", "origin/main...HEAD"]), "0\t0");

  fs.writeFileSync(path.join(workspace, "unfinished.txt"), "unfinished\n", "utf8");
  result = run(process.execPath, [startFeature, "Should Stop"], { cwd: workspace });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unfinished tracked or untracked work exists/);
  assert.equal(git(workspace, ["branch", "--show-current"]), "codex/example-feature");
  fs.unlinkSync(path.join(workspace, "unfinished.txt"));

  result = run(process.execPath, [startFeature, "Example Feature"], { cwd: workspace });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/);
  assert.equal(git(workspace, ["branch", "--show-current"]), "codex/example-feature");

  fs.writeFileSync(path.join(workspace, "feature.txt"), "feature\n", "utf8");
  git(workspace, ["add", "feature.txt"]);
  git(workspace, ["commit", "-m", "add feature"]);
  const narrowAudit = auditBranch(workspace, { scopes: ["tools"] });
  assert.match(narrowAudit.blockers.join("\n"), /outside the declared feature scope/);
  const repositoryWideAudit = auditBranch(workspace, { scopes: ["."] });
  assert.equal(repositoryWideAudit.blockers.length, 0);
  assert.equal(repositoryWideAudit.changedFiles[0].path, "feature.txt");
  writePreparationReceipt(workspace, {
    branch: "codex/example-feature",
    head: revision(workspace, "HEAD"),
    originMain: revision(workspace, "origin/main"),
    scopes: ["tools"],
  });
  const pushInput = `refs/heads/codex/example-feature ${revision(workspace, "HEAD")} refs/heads/codex/example-feature ${"0".repeat(40)}\n`;
  result = run(process.execPath, [prePushCheck, "origin", remote], { cwd: workspace, input: pushInput });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const mainPushInput = `refs/heads/main ${revision(workspace, "HEAD")} refs/heads/main ${"0".repeat(40)}\n`;
  result = run(process.execPath, [prePushCheck, "origin", remote], { cwd: workspace, input: mainPushInput });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Direct pushes.*main.*blocked/);

  git(temporaryRoot, ["clone", remote, updater]);
  git(updater, ["config", "user.name", "Crownlands Test"]);
  git(updater, ["config", "user.email", "test@example.invalid"]);
  fs.appendFileSync(path.join(updater, "README.md"), "remote update\n", "utf8");
  git(updater, ["add", "README.md"]);
  git(updater, ["commit", "-m", "advance main"]);
  git(updater, ["push", "origin", "main"]);
  result = run(process.execPath, [prePushCheck, "origin", remote], { cwd: workspace, input: pushInput });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /behind origin\/main|changed after validation/);

  console.log("Validated safe branch creation, dirty-work refusal, branch conflicts, prepared pushes, main protection, and stale-main protection.");
} finally {
  const expectedPrefix = path.join(os.tmpdir(), "crownlands-safe-update-test-");
  if (!temporaryRoot.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected test path: ${temporaryRoot}`);
  }
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
