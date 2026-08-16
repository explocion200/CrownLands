"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const BRANCH_PATTERN = /^codex\/studio-task-(task-[a-z0-9][a-z0-9-]{7,63})$/;

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function runWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", code => {
      const result = { code: code ?? 1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(result.stderr || result.stdout || `${file} exited with code ${code}`), result));
    });
    child.stdin.end(input);
  });
}

class GitWorktreeService {
  constructor(projectRoot, options = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.taskRoot = path.resolve(options.taskRoot || path.join(path.dirname(this.projectRoot), ".crownlands-studio-task-worktrees", path.basename(this.projectRoot)));
    this.git = options.git || "git";
  }

  async run(args, cwd = this.projectRoot, options = {}) {
    try {
      const { stdout, stderr } = await execFileAsync(this.git, args, {
        cwd,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
        timeout: options.timeout || 120000,
      });
      return { stdout, stderr };
    } catch (error) {
      const detail = String(error.stderr || error.stdout || error.message || error).trim();
      throw new Error(`Git ${args[0]} failed: ${detail}`, { cause: error });
    }
  }

  async assertRepository() {
    const root = (await this.run(["rev-parse", "--show-toplevel"])).stdout.trim();
    if (!samePath(root, this.projectRoot)) throw new Error(`Selected project root does not match its Git worktree root: ${root}`);
    return root;
  }

  taskPaths(taskId) {
    const branch = `codex/studio-task-${taskId}`;
    const worktree = path.resolve(this.taskRoot, taskId);
    if (!BRANCH_PATTERN.test(branch) || !isInside(this.taskRoot, worktree)) throw new Error("Task branch/worktree boundary validation failed.");
    return { branch, worktree };
  }

  async create(taskId) {
    await this.assertRepository();
    const { branch, worktree } = this.taskPaths(taskId);
    const baseCommit = (await this.run(["rev-parse", "HEAD"])).stdout.trim();
    try {
      await fsp.access(worktree);
      throw new Error(`Task worktree path already exists: ${worktree}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const branchResult = await execFileAsync(this.git, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: this.projectRoot, windowsHide: true }).then(() => true, () => false);
    if (branchResult) throw new Error(`Task branch already exists: ${branch}`);
    await fsp.mkdir(path.dirname(worktree), { recursive: true });
    await this.run(["worktree", "add", "-b", branch, worktree, baseCommit], this.projectRoot, { timeout: 300000 });
    return { branch, worktree, baseCommit };
  }

  assertTaskWorktree(task) {
    const expected = this.taskPaths(task.id);
    if (task.branch !== expected.branch || !samePath(task.worktree, expected.worktree)) throw new Error("Stored task branch/worktree does not match the protected task boundary.");
    return expected;
  }

  async status(cwd) {
    const output = (await this.run(["status", "--porcelain=v1", "--untracked-files=all"], cwd)).stdout;
    return output.split(/\r?\n/).filter(Boolean).map(line => {
      const rawPath = line.slice(3).trim();
      const file = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) : rawPath;
      return { status: line.slice(0, 2), path: file.replace(/^"|"$/g, "").replace(/\\/g, "/") };
    });
  }

  async isProjectClean() {
    return (await this.status(this.projectRoot)).length === 0;
  }

  async prepareDiff(task) {
    this.assertTaskWorktree(task);
    await this.run(["add", "-N", "--", "."], task.worktree).catch(error => {
      if (!/did not match any files/i.test(error.message)) throw error;
    });
  }

  async diff(task) {
    await this.prepareDiff(task);
    const patch = (await this.run(["diff", "--binary", "--no-ext-diff", "--full-index", task.baseCommit, "--"], task.worktree, { maxBuffer: 64 * 1024 * 1024 })).stdout;
    const files = await this.status(task.worktree);
    return { patch, files };
  }

  async diffCheck(task) {
    await this.prepareDiff(task);
    try {
      const result = await this.run(["diff", "--check", task.baseCommit, "--"], task.worktree);
      return { name: "Git diff check", status: "passed", output: result.stdout.trim() || "No whitespace errors." };
    } catch (error) {
      return { name: "Git diff check", status: "failed", output: error.message };
    }
  }

  async currentDiffStat() {
    const [status, stat] = await Promise.all([
      this.status(this.projectRoot),
      this.run(["diff", "--stat", "HEAD", "--"], this.projectRoot).then(result => result.stdout.trim()),
    ]);
    return { dirty: status.length > 0, files: status.slice(0, 100), stat };
  }

  async apply(task) {
    this.assertTaskWorktree(task);
    const clean = await this.isProjectClean();
    if (!clean) throw new Error("Active project has Git changes. Save, commit, stash, or discard them before applying an AI task.");
    const activeHead = (await this.run(["rev-parse", "HEAD"])).stdout.trim();
    if (activeHead !== task.baseCommit) throw new Error(`Active project advanced from ${task.baseCommit.slice(0, 10)} to ${activeHead.slice(0, 10)}. Re-plan or manually reconcile the task; no files were changed.`);
    const { patch, files } = await this.diff(task);
    if (!patch.trim()) throw new Error("Task has no file changes to apply.");
    try {
      await runWithInput(this.git, ["apply", "--check", "--whitespace=nowarn", "-"], { cwd: this.projectRoot }, patch);
    } catch (error) {
      throw new Error(`Task patch conflicts with the active project. No files were changed. ${error.message}`, { cause: error });
    }
    await runWithInput(this.git, ["apply", "--whitespace=nowarn", "-"], { cwd: this.projectRoot }, patch);
    return { files, patch };
  }

  async discard(task) {
    const { branch, worktree } = this.assertTaskWorktree(task);
    const exists = await fsp.stat(worktree).then(stat => stat.isDirectory(), error => error.code === "ENOENT" ? false : Promise.reject(error));
    if (exists) await this.run(["worktree", "remove", "--force", worktree], this.projectRoot, { timeout: 300000 });
    const branchExists = await execFileAsync(this.git, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: this.projectRoot, windowsHide: true }).then(() => true, () => false);
    if (branchExists) await this.run(["branch", "-D", branch], this.projectRoot);
    return { branch, worktree, removed: exists || branchExists };
  }
}

module.exports = { BRANCH_PATTERN, GitWorktreeService, isInside, samePath };
