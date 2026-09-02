#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const path = require("node:path");
const { classifyGitDiff } = require("./change-risk-classifier");

const root = path.resolve(__dirname, "..");

function parseArguments(args) {
  const options = { baseRef: "origin/main", headRef: "HEAD" };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--base") options.baseRef = args[++index];
    else if (args[index] === "--head") options.headRef = args[++index];
    else throw new Error(`Unknown option: ${args[index]}`);
    if (!args[index]) throw new Error(`${args[index - 1]} requires a value.`);
  }
  return options;
}

function focusedValidatorFiles(paths) {
  const validators = new Set();
  const includes = expression => paths.some(filePath => expression.test(filePath));

  if (includes(/(?:\.html$|^(?:public-site|roadmap(?:-data)?|patch-notes)\.js$)/i)) {
    validators.add("validate-public-site-content.js");
  }
  if (includes(/^patch-notes\.js$/i)) validators.add("validate-patch-notes.js");
  if (includes(/\.css$/i)) {
    validators.add("validate-ui-readability.js");
    validators.add("validate-mobile-ui-viewport.js");
    validators.add("validate-crownlands-palette.js");
    validators.add("validate-targeted-ui-contrast.js");
  }
  if (includes(/\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i)) {
    validators.add("validate-asset-performance-budgets.js");
  }
  if (includes(/^animation-manager\.js$/i)) validators.add("validate-animation-system.js");
  if (includes(/^audio-manager\.js$/i)) {
    validators.add("validate-audio-contract.js");
    validators.add("validate-audio-delivery.js");
    validators.add("validate-audio-levels.js");
    validators.add("validate-audio-unlock.js");
  }
  if (includes(/^ui-layout-(?:config|runtime)\.js$/i)) {
    validators.add("validate-ui-layout-editor.js");
    validators.add("validate-mobile-ui-viewport.js");
  }
  return [...validators].sort();
}

function runValidator(fileName) {
  console.log(`[Crownlands] Focused validator: tools/${fileName}`);
  const result = childProcess.spawnSync(process.execPath, [path.join(root, "tools", fileName)], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`tools/${fileName} failed with status ${result.status}.`);
}

function main() {
  const classification = classifyGitDiff(root, parseArguments(process.argv.slice(2)));
  const paths = classification.files.map(item => item.path);
  const validators = focusedValidatorFiles(paths);
  if (!validators.length) {
    console.log("[Crownlands] No content-specific validator applies; syntax, build, artifact, and browser gates still run.");
    return;
  }
  validators.forEach(runValidator);
  console.log(`[Crownlands] ${validators.length} focused validator(s) passed.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[Crownlands] Focused validation failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { focusedValidatorFiles };
