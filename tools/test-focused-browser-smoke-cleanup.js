#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { removeBrowserProfile, waitForProcessExit } = require("./validate-focused-browser-smoke");

async function main() {
  const exitedProcess = { exitCode: 0, signalCode: null };
  assert.equal(await waitForProcessExit(exitedProcess, 1), true, "already-exited browsers should not wait");

  const exitingProcess = new EventEmitter();
  exitingProcess.exitCode = null;
  exitingProcess.signalCode = null;
  setTimeout(() => {
    exitingProcess.exitCode = 0;
    exitingProcess.emit("exit", 0, null);
  }, 5);
  assert.equal(await waitForProcessExit(exitingProcess, 100), true, "browser exit events should be observed");

  const stuckProcess = new EventEmitter();
  stuckProcess.exitCode = null;
  stuckProcess.signalCode = null;
  assert.equal(await waitForProcessExit(stuckProcess, 1), false, "a stuck browser should time out");

  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-browser-smoke-"));
  fs.writeFileSync(path.join(profilePath, "profile.lock"), "transient test fixture");
  let removeAttempts = 0;
  await removeBrowserProfile(profilePath, {
    attempts: 3,
    retryDelayMs: 1,
    remove: async (target, options) => {
      removeAttempts += 1;
      if (removeAttempts < 3) {
        const error = new Error("simulated Chrome profile write");
        error.code = "ENOTEMPTY";
        throw error;
      }
      await fs.promises.rm(target, options);
    },
  });
  assert.equal(removeAttempts, 3, "transient ENOTEMPTY failures should be retried");
  assert.equal(fs.existsSync(profilePath), false, "the browser profile should be removed after retry");

  let guardedRemoveCalled = false;
  await assert.rejects(
    removeBrowserProfile(path.join(os.tmpdir(), "unrelated-profile"), {
      remove: async () => { guardedRemoveCalled = true; },
    }),
    /Refusing to clean unexpected browser profile/,
  );
  assert.equal(guardedRemoveCalled, false, "the path guard must run before deletion");

  console.log("Focused browser cleanup regression tests passed.");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
