const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { promisify } = require("node:util");
const { SourceControlService } = require("./source-control-service");

const execFileAsync = promisify(execFile);
async function git(root, ...args) { return execFileAsync("git", ["-C", root, ...args], { windowsHide: true }); }

async function repo(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-ui-git-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Crownlands Studio Test");
  await git(root, "config", "user.email", "studio-test@example.invalid");
  await fsp.writeFile(path.join(root, "ui-studio-config.json"), '{"schemaVersion":1}\n', "utf8");
  await fsp.writeFile(path.join(root, "unrelated.txt"), "baseline\n", "utf8");
  await git(root, "add", "."); await git(root, "commit", "-m", "baseline"); await git(root, "switch", "-c", "codex/ui-test");
  return { root, service: new SourceControlService(root) };
}

test("status, diff, and explicit commit are limited to manual UI config", async t => {
  const { root, service } = await repo(t);
  await fsp.writeFile(path.join(root, "ui-studio-config.json"), '{"schemaVersion":1,"changed":true}\n', "utf8");
  const status = await service.status();
  assert.equal(status.branch, "codex/ui-test");
  assert.equal(status.modifiedCount, 1);
  const diff = await service.diff(["ui-studio-config.json"]);
  assert.match(diff.text, /"changed":true/);
  assert.rejects(() => service.diff(["game.js"]), /limited to files saved by the manual UI editor/);
  const committed = await service.commit({ message: "fix(ui): test manual config", files: ["ui-studio-config.json"] });
  assert.equal(committed.ok, true);
  assert.equal((await service.status()).dirty, false);
});

test("commit blocks protected branches and unrelated staged work", async t => {
  const { root, service } = await repo(t);
  await fsp.writeFile(path.join(root, "ui-studio-config.json"), '{"schemaVersion":1,"changed":true}\n', "utf8");
  await fsp.writeFile(path.join(root, "unrelated.txt"), "user work\n", "utf8");
  await git(root, "add", "unrelated.txt");
  await assert.rejects(() => service.commit({ message: "fix(ui): blocked", files: ["ui-studio-config.json"] }), /Unrelated staged files/);
  await git(root, "restore", "--staged", "unrelated.txt"); await git(root, "restore", "unrelated.txt");
  await git(root, "switch", "main");
  await assert.rejects(() => service.commit({ message: "fix(ui): protected", files: ["ui-studio-config.json"] }), /protected branch/);
});

test("push is impossible without explicit confirmation and a configured origin", async t => {
  const { service } = await repo(t);
  await assert.rejects(() => service.push({ confirmed: false }), /explicit confirmation/);
  await assert.rejects(() => service.pushPlan(), /No origin remote/);
});

test("diff review includes a newly introduced untracked UI config", async t => {
  const { root, service } = await repo(t);
  await git(root, "rm", "ui-studio-config.json");
  await git(root, "commit", "-m", "remove config for untracked fixture");
  await fsp.writeFile(path.join(root, "ui-studio-config.json"), '{"schemaVersion":1,"newConfig":true}\n', "utf8");
  const diff = await service.diff(["ui-studio-config.json"]);
  assert.match(diff.text, /Untracked UI files/);
  assert.match(diff.text, /"newConfig":true/);
});
