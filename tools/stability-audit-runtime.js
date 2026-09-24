"use strict";
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function isProductionBackendUrl(url) {
  return /(?:firebaseio\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|cloudfunctions\.net|\.run\.app)/i.test(url);
}

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds / 1000}s watchdog`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function sourceIdentity(root) {
  const git = args => childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0")
    .filter(file => /\.(?:js|cjs|json|css|html|yaml|webmanifest)$/.test(file) && !file.startsWith("benchmark-results/"));
  const hash = crypto.createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(`${file}\0`);
    hash.update(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : "<deleted>");
  }
  return { commit: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]),
    dirty: Boolean(git(["status", "--porcelain"])), inputDigest: hash.digest("hex"),
    node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() };
}

module.exports = { bounded, sourceIdentity, isProductionBackendUrl };
