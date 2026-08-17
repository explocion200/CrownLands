"use strict";

const path = require("node:path");
const {
  requireExplicitProjectIdentity,
  requireMutationConfirmation,
  environmentBanner,
} = require("./environment");
const { runFirebase } = require("./firebase-cli");

const ROOT = path.resolve(__dirname, "../..");
const FIREBASE_CONFIG = path.join(__dirname, "firebase", "firebase.staging.json");
const COMPONENTS = Object.freeze({
  rules: "firestore,storage",
  health: "functions:phase9-staging:phase9Health",
  functions: "functions:phase9-staging",
  studio: "hosting",
  all: "firestore,storage,functions:phase9-staging",
});

function main() {
  const execute = process.argv.includes("--execute");
  const componentArg = process.argv.find(value => value.startsWith("--components="))?.split("=")[1] || "";
  const only = COMPONENTS[componentArg];
  if (!only) throw new Error("Use --components=rules, --components=health, --components=functions, --components=studio, or --components=all.");
  const input = {
    targetProjectId: process.env.CROWNLANDS_PHASE9_TARGET_PROJECT_ID,
    productionProjectId: process.env.CROWNLANDS_PRODUCTION_PROJECT_ID,
    confirmation: process.env.CROWNLANDS_PHASE9_MUTATION_CONFIRMATION,
  };
  const identity = execute ? requireMutationConfirmation(input) : requireExplicitProjectIdentity(input);
  console.log(environmentBanner(identity));
  const args = [
    "deploy",
    "--only", only,
    "--project", identity.targetProjectId,
    "--config", FIREBASE_CONFIG,
    "--non-interactive",
  ];
  if (!execute) args.push("--dry-run");
  runFirebase(args, { cwd: ROOT, capture: false });
  console.log(JSON.stringify({
    result: "PASS",
    mode: execute ? "DEPLOYED_STAGING_ONLY" : "DRY_RUN",
    components: only,
    stagingProjectId: identity.targetProjectId,
    productionProjectId: identity.productionProjectId,
    productionMutationPerformed: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`${error.code || "phase9-deploy-error"}: ${error.message}`);
  process.exitCode = 1;
}
