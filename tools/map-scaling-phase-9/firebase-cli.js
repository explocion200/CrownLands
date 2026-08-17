"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

function firebaseInvocation(args) {
  if (process.platform !== "win32") return { command: "firebase", args };
  const located = spawnSync("where.exe", ["firebase.cmd"], { encoding: "utf8", windowsHide: true });
  if (located.status !== 0) throw new Error("firebase.cmd is not available on PATH.");
  const wrapperPath = String(located.stdout || "").split(/\r?\n/).find(Boolean);
  const wrapper = fs.readFileSync(wrapperPath, "utf8");
  const entry = wrapper.match(/node\s+"([^"]*firebase\.js)"/i)?.[1];
  if (!entry) throw new Error(`Could not resolve the Firebase CLI entry point from ${wrapperPath}.`);
  return { command: process.execPath, args: [entry, ...args] };
}

function runFirebase(args, options = {}) {
  const invocation = firebaseInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const error = new Error(`Firebase CLI failed (${args.join(" ")}): ${detail}`);
    error.code = "firebase-cli-failed";
    error.exitCode = result.status;
    throw error;
  }
  return {
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function parseFirebaseJson(stdout) {
  const parsed = JSON.parse(String(stdout || "").trim());
  if (parsed.status !== "success") {
    throw new Error(`Firebase CLI JSON command did not succeed: ${JSON.stringify(parsed)}`);
  }
  return parsed.result;
}

function listProjects() {
  return parseFirebaseJson(runFirebase(["projects:list", "--json"]).stdout);
}

module.exports = Object.freeze({
  firebaseInvocation,
  runFirebase,
  parseFirebaseJson,
  listProjects,
});
