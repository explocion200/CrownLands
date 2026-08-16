"use strict";

const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const { AiWorkspaceService } = require("./ai/ai-workspace-service");
const { resolvePackagedCodexPath } = require("./ai/codex-runner");
const { GitWorktreeService } = require("./ai/git-worktree-service");
const { validateConfirmedAction, validateRoutingSettings, validateTaskInput } = require("./ai/ipc-schema");
const { createReadOnlyPreviewServer, safePath } = require("./ai/preview-server");
const { routeTask } = require("./ai/task-router");

const execFileAsync = promisify(execFile);

async function git(root, ...args) {
  return execFileAsync("git", args, { cwd: root, windowsHide: true, encoding: "utf8" });
}

async function createRepository(t) {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), "crownlands-ai-test-"));
  const root = path.join(parent, "project");
  const taskRoot = path.join(parent, "tasks");
  await fsp.mkdir(path.join(root, "src"), { recursive: true });
  await fsp.writeFile(path.join(root, ".gitignore"), ".crownlands-studio/\n", "utf8");
  await fsp.writeFile(path.join(root, "src", "base.txt"), "base\n", "utf8");
  await git(root, "init");
  await git(root, "config", "user.email", "studio-tests@example.invalid");
  await git(root, "config", "user.name", "Crownlands Studio Tests");
  await git(root, "add", ".");
  await git(root, "commit", "-m", "test base");
  t.after(async () => fsp.rm(parent, { recursive: true, force: true }));
  return { parent, root, taskRoot };
}

class FakeRunner {
  constructor(mode = "success") {
    this.mode = mode;
    this.calls = [];
  }

  async capabilities() {
    return { available: true, provider: "fake", sdkVersion: "test" };
  }

  async run(task, options) {
    this.calls.push({ task: task.id, model: options.model, threadId: options.threadId });
    await options.onEvent({ type: "thread.started", threadId: options.threadId || `thread-${task.id}` });
    if (this.mode === "model-fallback" && this.calls.length === 1) throw new Error(`model ${options.model} is unavailable`);
    if (this.mode === "cancel") {
      await new Promise((resolve, reject) => {
        const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (options.signal.aborted) fail();
        else options.signal.addEventListener("abort", fail, { once: true });
      });
    }
    if (task.permission !== "review-only" && this.mode !== "no-change") {
      await fsp.mkdir(path.join(options.workingDirectory, "src"), { recursive: true });
      await fsp.writeFile(path.join(options.workingDirectory, "src", "agent-result.txt"), `attempt ${this.calls.length}\n`, "utf8");
    }
    if (this.mode === "fail-once" && this.calls.length === 1) throw new Error("simulated task failure");
    await options.onEvent({ type: "command", command: "node --test focused.test.js", output: "pass", exitCode: 0, status: "completed" });
    await options.onEvent({ type: "agent-message", text: "Implemented the isolated test change." });
    await options.onEvent({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5 } });
    return { finalResponse: "Implemented the isolated test change.", usage: { input_tokens: 100, output_tokens: 20 }, threadId: options.threadId || `thread-${task.id}`, commands: [] };
  }
}

async function createService(t, runner = new FakeRunner(), dirtyProvider = () => false) {
  const repo = await createRepository(t);
  const service = await new AiWorkspaceService(repo.root, { runner, taskRoot: repo.taskRoot, dirtyProvider }).init();
  return { ...repo, service, runner };
}

test("AUTO routing selects UI Craftsman/Fast for visual polish and Deep for architecture", () => {
  const small = routeTask({ prompt: "Fix the Reports button alignment and beige fill.", context: {}, agent: "auto", model: "" });
  assert.equal(small.category, "UI");
  assert.equal(small.agentId, "ui-craftsman");
  assert.equal(small.role, "fast");
  const large = routeTask({ prompt: "Implement a server-authoritative Bounty system with persistence and a new UI.", context: {}, agent: "auto", model: "" });
  assert.equal(large.agentId, "feature-builder");
  assert.equal(large.role, "deep");
  assert.equal(large.risk, "High");
  assert.ok(large.subtasks.length >= 4);
});

test("packaged Windows runtime resolves Codex outside app.asar", () => {
  const resolved = resolvePackagedCodexPath({ resourcesPath: "C:\\Program Files\\Crownlands Studio\\resources", platform: "win32", arch: "x64" });
  assert.match(resolved.replace(/\\/g, "/"), /resources\/codex-runtime\/vendor\/x86_64-pc-windows-msvc\/bin\/codex\.exe$/);
});

test("IPC validation preserves QA/component context and blocks unsupported input", () => {
  const input = validateTaskInput({
    prompt: "Fix the selected component",
    permission: "safe-edit",
    agent: "auto",
    context: { area: "QA", component: "Clan tabs", qaIssue: { id: "qa-clan", title: "Unreadable selected state", relevantFiles: ["styles.css"] } },
    includeScreenshot: true,
  });
  assert.equal(input.context.qaIssue.id, "qa-clan");
  assert.equal(input.context.component, "Clan tabs");
  assert.throws(() => validateTaskInput({ prompt: "Valid task", shell: "powershell" }), /unsupported field/);
  assert.throws(() => validateConfirmedAction({ taskId: "task-20260816010101-abcdef12", confirmed: false }, "Discard task"), /explicit confirmation/);
  assert.throws(() => validateRoutingSettings({ modelRoles: {}, reasoningEffort: {}, fallbackModel: "bad model name" }), /unsupported characters/);
});

test("task creation, worktree isolation, diff retrieval, and apply keep active project protected", async t => {
  const { root, service } = await createService(t);
  const planned = await service.planTask({ prompt: "Add a focused test file.", context: { area: "Tests" }, permission: "safe-edit", agent: "auto" });
  assert.equal(planned.status, "planned");
  assert.equal(planned.branch, "");
  const completed = await service.runTask(planned.id);
  assert.equal(completed.status, "passed");
  assert.match(completed.branch, /^codex\/studio-task-/);
  assert.equal(await fsp.readFile(path.join(root, "src", "base.txt"), "utf8"), "base\n");
  await assert.rejects(() => fsp.readFile(path.join(root, "src", "agent-result.txt"), "utf8"), /ENOENT/);
  const diff = await service.getDiff(planned.id);
  assert.ok(diff.files.some(file => file.path === "src/agent-result.txt"));
  assert.match(diff.patch, /agent-result\.txt/);
  const applied = await service.applyTask(planned.id);
  assert.equal(applied.status, "applied");
  assert.match(await fsp.readFile(path.join(root, "src", "agent-result.txt"), "utf8"), /attempt 1/);
  assert.ok(applied.applyPatchPath.endsWith(`${planned.id}.patch`));
});

test("review-only tasks run against the active project without creating or changing a worktree", async t => {
  const { root, service } = await createService(t);
  const before = (await git(root, "status", "--short")).stdout;
  const planned = await service.planTask({ prompt: "Review the current implementation for security risks.", context: { area: "Review" }, permission: "review-only", agent: "qa-inspector" });
  const completed = await service.runTask(planned.id);
  assert.equal(completed.status, "passed");
  assert.equal(completed.worktree, "");
  assert.equal(completed.branch, "");
  assert.equal((await git(root, "status", "--short")).stdout, before);
  assert.deepEqual((await service.getDiff(planned.id)).files, []);
});

test("discard removes the exact isolated worktree and task branch", async t => {
  const { root, service } = await createService(t);
  const task = await service.planTask({ prompt: "Create a disposable test change.", context: {}, permission: "safe-edit", agent: "auto" });
  const complete = await service.runTask(task.id);
  const worktree = complete.worktree;
  const discarded = await service.discardTask(task.id);
  assert.equal(discarded.status, "discarded");
  assert.equal(await fsp.stat(worktree).then(() => true, () => false), false);
  await assert.rejects(() => git(root, "show-ref", "--verify", `refs/heads/${complete.branch}`));
});

test("dirty and unsaved active state block worktree creation", async t => {
  const unsaved = { value: true };
  const { root, service } = await createService(t, new FakeRunner(), () => unsaved.value);
  const task = await service.planTask({ prompt: "Make an isolated change.", context: {}, permission: "safe-edit", agent: "auto" });
  await assert.rejects(() => service.runTask(task.id), /unsaved editor changes/);
  unsaved.value = false;
  await fsp.writeFile(path.join(root, "src", "base.txt"), "dirty\n", "utf8");
  await assert.rejects(() => service.runTask(task.id), /Git changes/);
  assert.equal((await service.getTask(task.id)).worktree, "");
});

test("failed work is preserved and Fast-to-Deep retry receives prior context", async t => {
  const runner = new FakeRunner("fail-once");
  const { service } = await createService(t, runner);
  const task = await service.planTask({ prompt: "Fix a small isolated bug.", context: {}, permission: "safe-edit", agent: "bug-hunter" });
  const failed = await service.runTask(task.id);
  assert.equal(failed.status, "failed");
  assert.ok(failed.worktree);
  const retried = await service.retryTask(task.id, { escalate: true });
  assert.equal(retried.status, "passed");
  assert.equal(retried.route.role, "deep");
  assert.ok(runner.calls[1].threadId);
});

test("persistent task history recovers an interrupted run after relaunch", async t => {
  const { root, taskRoot, service } = await createService(t);
  const planned = await service.planTask({ prompt: "Prepare an interrupted recovery fixture.", context: {}, permission: "safe-edit", agent: "auto" });
  await service.store.update(planned.id, task => {
    task.status = "running";
    task.execution.threadId = "thread-interrupted";
  });
  const relaunched = await new AiWorkspaceService(root, { runner: new FakeRunner(), taskRoot }).init();
  const recovered = await relaunched.getTask(planned.id);
  assert.equal(recovered.status, "failed");
  assert.match(recovered.execution.error, /closed while this task was running/i);
  assert.ok(recovered.events.some(event => event.kind === "recovery"));
});

test("unavailable configured model visibly falls back", async t => {
  const runner = new FakeRunner("model-fallback");
  const { service } = await createService(t, runner);
  const task = await service.planTask({ prompt: "Fix button spacing.", context: {}, permission: "safe-edit", agent: "auto" });
  const complete = await service.runTask(task.id);
  assert.equal(complete.status, "passed");
  assert.match(complete.execution.fallbackNotice, /unavailable/i);
  assert.equal(runner.calls.length, 2);
});

test("an edit task with no reviewable diff fails instead of reporting a false pass", async t => {
  const { service } = await createService(t, new FakeRunner("no-change"));
  const task = await service.planTask({ prompt: "Add an isolated documentation note.", context: {}, permission: "safe-edit", agent: "auto" });
  const completed = await service.runTask(task.id);
  assert.equal(completed.status, "failed");
  assert.ok(completed.tests.some(result => result.name === "Requested edit produced changes" && result.status === "failed"));
});

test("task cancellation stops execution and preserves the isolated worktree", async t => {
  const { service } = await createService(t, new FakeRunner("cancel"));
  const task = await service.planTask({ prompt: "Run a long isolated task.", context: {}, permission: "safe-edit", agent: "auto" });
  const running = service.runTask(task.id);
  for (let attempt = 0; attempt < 100 && (await service.getTask(task.id)).status !== "running"; attempt += 1) await new Promise(resolve => setTimeout(resolve, 10));
  await service.cancelTask(task.id);
  const cancelled = await running;
  assert.equal(cancelled.status, "failed");
  assert.match(cancelled.execution.error, /cancelled/i);
  assert.equal(await fsp.stat(cancelled.worktree).then(stat => stat.isDirectory(), () => false), true);
});

test("project boundary enforcement rejects a tampered worktree and preview traversal", async t => {
  const { root, taskRoot, service } = await createService(t);
  const gitService = new GitWorktreeService(root, { taskRoot });
  assert.throws(() => gitService.assertTaskWorktree({ id: "task-20260816010101-abcdef12", branch: "codex/studio-task-task-20260816010101-abcdef12", worktree: path.resolve(root, "..", "outside"), baseCommit: "x" }), /protected task boundary/);
  assert.equal(safePath(root, "/../outside.txt"), "");
  const server = createReadOnlyPreviewServer(root);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/..%2foutside.txt`);
  assert.equal(response.status, 403);
  assert.equal((await service.getCapabilities()).productionActions, "blocked");
});
