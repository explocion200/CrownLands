"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const UI_EDITABLE_FILES = Object.freeze(["ui-studio-config.json"]);
const PROTECTED_BRANCHES = new Set(["main", "master"]);

function validateFiles(files) {
  const requested = Array.isArray(files) && files.length ? files : [...UI_EDITABLE_FILES];
  const safe = [...new Set(requested.map(value => String(value || "").trim().replace(/\\/g, "/")))];
  if (!safe.length || safe.some(file => !UI_EDITABLE_FILES.includes(file))) throw new Error("Source-control actions are limited to files saved by the manual UI editor.");
  return safe;
}

function validateMessage(value) {
  const message = String(value || "").replace(/[\r\n]+/g, " ").trim();
  if (message.length < 3 || message.length > 180) throw new Error("Enter a commit message between 3 and 180 characters.");
  return message;
}

function parsePorcelain(output) {
  return String(output || "").split(/\r?\n/).filter(Boolean).map(line => ({
    index: line[0] || " ",
    worktree: line[1] || " ",
    path: line.slice(3).replace(/^"|"$/g, ""),
  }));
}

class SourceControlService {
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.exec = options.exec || execFileAsync;
  }

  async git(args, options = {}) {
    const result = await this.exec("git", ["-C", this.projectRoot, ...args], {
      windowsHide: true,
      timeout: options.timeout || 30000,
      maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
    });
    return String(result.stdout || "").trim();
  }

  async status() {
    const [branch, head, porcelain, staged, remotes] = await Promise.all([
      this.git(["branch", "--show-current"]),
      this.git(["rev-parse", "HEAD"]).catch(() => ""),
      this.git(["status", "--porcelain=v1", "--untracked-files=all"]),
      this.git(["diff", "--cached", "--name-only"]),
      this.git(["remote"]).catch(() => ""),
    ]);
    const files = parsePorcelain(porcelain);
    return {
      branch,
      head,
      protectedBranch: PROTECTED_BRANCHES.has(branch),
      dirty: files.length > 0,
      modifiedCount: files.length,
      files,
      stagedFiles: staged.split(/\r?\n/).filter(Boolean),
      remotes: remotes.split(/\r?\n/).filter(Boolean),
      uiEditableFiles: [...UI_EDITABLE_FILES],
    };
  }

  async diff(rawFiles) {
    const files = validateFiles(rawFiles);
    const [unstaged, staged, status] = await Promise.all([
      this.git(["diff", "--", ...files], { maxBuffer: 4 * 1024 * 1024 }),
      this.git(["diff", "--cached", "--", ...files], { maxBuffer: 4 * 1024 * 1024 }),
      this.status(),
    ]);
    const untracked = [];
    const untrackedPaths = new Set(status.files.filter(file => file.index === "?" && file.worktree === "?").map(file => file.path));
    for (const file of files.filter(candidate => untrackedPaths.has(candidate))) {
      try {
        untracked.push(await this.git(["diff", "--no-index", "--", process.platform === "win32" ? "NUL" : "/dev/null", file], { maxBuffer: 4 * 1024 * 1024 }));
      } catch (error) {
        if (Number(error?.code) !== 1) throw error;
        untracked.push(String(error.stdout || "").trim());
      }
    }
    const text = [staged && "# Staged\n" + staged, unstaged && "# Working tree\n" + unstaged, untracked.filter(Boolean).length && "# Untracked UI files\n" + untracked.filter(Boolean).join("\n\n")].filter(Boolean).join("\n\n");
    return { files, text: text.slice(0, 500000), truncated: text.length > 500000 };
  }

  async commit(payload = {}) {
    const message = validateMessage(payload.message);
    const files = validateFiles(payload.files);
    const before = await this.status();
    if (!before.branch) throw new Error("A named Git branch is required before committing Studio changes.");
    if (before.protectedBranch) throw new Error(`Studio will not commit manual UI changes directly on protected branch ${before.branch}. Create a feature branch first.`);
    const unexpectedStaged = before.stagedFiles.filter(file => !files.includes(file));
    if (unexpectedStaged.length) throw new Error(`Unrelated staged files must be committed or unstaged first: ${unexpectedStaged.join(", ")}`);
    await this.git(["add", "--", ...files]);
    await this.git(["diff", "--cached", "--check", "--", ...files]);
    const staged = await this.git(["diff", "--cached", "--name-only", "--", ...files]);
    if (!staged) throw new Error("There are no saved manual UI changes to commit.");
    await this.git(["commit", "--only", "-m", message, "--", ...files], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
    const after = await this.status();
    return { ok: true, message, files, branch: after.branch, head: after.head, status: after };
  }

  async pushPlan() {
    const status = await this.status();
    if (!status.branch) throw new Error("A named Git branch is required before pushing.");
    if (status.protectedBranch) throw new Error(`Studio will not push protected branch ${status.branch}.`);
    if (!status.remotes.includes("origin")) throw new Error("No origin remote is configured for this project.");
    const remoteUrl = await this.git(["remote", "get-url", "origin"]);
    return { remote: "origin", remoteUrl, branch: status.branch, head: status.head };
  }

  async push(payload = {}) {
    if (payload.confirmed !== true) throw new Error("Push requires explicit confirmation.");
    const plan = await this.pushPlan();
    await this.git(["push", "--set-upstream", plan.remote, plan.branch], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, ...plan };
  }
}

module.exports = { PROTECTED_BRANCHES, SourceControlService, UI_EDITABLE_FILES, parsePorcelain, validateFiles, validateMessage };
