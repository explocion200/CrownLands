#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  removeBrowserProfile,
  startBrowserSession,
  waitForBrowserTargets,
  waitForProcessExit,
} = require("./validate-focused-browser-smoke");

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

  const startingProcess = new EventEmitter();
  startingProcess.exitCode = null;
  startingProcess.signalCode = null;
  let targetProbes = 0;
  const targets = await waitForBrowserTargets(startingProcess, "http://127.0.0.1:1/json/list", {
    attempts: 3,
    fetchTargets: async () => {
      targetProbes += 1;
      if (targetProbes < 3) throw new Error("simulated startup delay");
      return [{ type: "page" }];
    },
  });
  assert.deepEqual(targets, [{ type: "page" }], "DevTools targets should be returned after a delayed startup");
  assert.equal(targetProbes, 3, "DevTools readiness should be retried within the bounded startup window");

  const earlyExitProcess = new EventEmitter();
  earlyExitProcess.exitCode = 1;
  earlyExitProcess.signalCode = null;
  await assert.rejects(
    waitForBrowserTargets(earlyExitProcess, "http://127.0.0.1:1/json/list", {
      attempts: 3,
      fetchTargets: async () => [],
    }),
    /Chrome exited before DevTools became available \(exit 1, signal null\)/,
  );

  let launches = 0;
  let closedFailedLaunches = 0;
  const retriedSession = await startBrowserSession("fake-chrome", {
    attempts: 2,
    closeBrowser: async () => { closedFailedLaunches += 1; },
    createProfile: () => `profile-${launches + 1}`,
    getFreePort: async () => 9000 + launches,
    launchBrowser: () => {
      launches += 1;
      return { exitCode: null, signalCode: null };
    },
    retryDelayMs: 0,
    waitForTargets: async () => {
      if (launches === 1) throw new Error("simulated first launch failure");
      return [{ type: "page", webSocketDebuggerUrl: "ws://test" }];
    },
  });
  assert.equal(launches, 2, "a failed browser launch should be retried");
  assert.equal(closedFailedLaunches, 1, "each failed launch should be closed before retrying");
  assert.equal(retriedSession.targets[0].webSocketDebuggerUrl, "ws://test");

  let exhaustedLaunches = 0;
  await assert.rejects(
    startBrowserSession("fake-chrome", {
      attempts: 2,
      closeBrowser: async () => {},
      createProfile: () => `profile-${exhaustedLaunches + 1}`,
      getFreePort: async () => 9100 + exhaustedLaunches,
      launchBrowser: () => {
        exhaustedLaunches += 1;
        return { exitCode: null, signalCode: null };
      },
      retryDelayMs: 0,
      waitForTargets: async () => { throw new Error("simulated persistent launch failure"); },
    }),
    /Chrome failed to start after 2 attempts:[\s\S]*attempt 1:[\s\S]*attempt 2:/,
  );
  assert.equal(exhaustedLaunches, 2, "browser startup retries must remain bounded");

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
