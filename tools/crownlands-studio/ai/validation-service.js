"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { redactSecrets } = require("./redact");

const execFileAsync = promisify(execFile);

async function fixedCommand(name, file, args, cwd, timeout = 120000) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, { cwd, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout });
    return { name, status: "passed", command: [file, ...args].join(" "), output: redactSecrets(`${stdout || ""}${stderr || ""}`.trim() || "Passed.", 12000) };
  } catch (error) {
    return { name, status: "failed", command: [file, ...args].join(" "), output: redactSecrets(error.stderr || error.stdout || error.message || error, 12000) };
  }
}

class ValidationService {
  constructor(gitService) {
    this.gitService = gitService;
  }

  async run(task, changedFiles) {
    const results = [await this.gitService.diffCheck(task)];
    const paths = changedFiles.map(file => file.path).filter(Boolean);
    const javascript = paths.filter(file => /\.(?:c?js|mjs)$/i.test(file) && !file.includes("node_modules/")).slice(0, 50);
    for (const relative of javascript) {
      const target = path.resolve(task.worktree, ...relative.split("/"));
      const exists = await fsp.stat(target).then(stat => stat.isFile(), () => false);
      if (exists) results.push(await fixedCommand(`Syntax: ${relative}`, process.execPath, ["--check", target], task.worktree, 30000));
    }
    const studioChanged = paths.some(file => file.startsWith("tools/crownlands-studio/") || file.startsWith("tools/map-editor/") || file === "tools/editor-server.js");
    if (studioChanged) {
      const tests = [
        "tools/crownlands-studio/project-file-service.test.js",
        "tools/crownlands-studio/editor-server-api.test.js",
        "tools/crownlands-studio/studio-structure.test.js",
        "tools/crownlands-studio/ai-workspace.test.js",
      ];
      const existing = [];
      for (const test of tests) {
        if (await fsp.stat(path.join(task.worktree, ...test.split("/"))).then(stat => stat.isFile(), () => false)) existing.push(test);
      }
      if (existing.length) results.push(await fixedCommand("Crownlands Studio regression suite", process.execPath, ["--test", ...existing], task.worktree, 180000));
    }
    return results;
  }
}

module.exports = { ValidationService, fixedCommand };
