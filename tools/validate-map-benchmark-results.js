"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { evaluateBudgets } = require("./map-benchmark/budgets.js");

const root = path.resolve(__dirname, "..");
const phase1Mode = process.argv.includes("--phase-1-after");
const phase2Mode = process.argv.includes("--phase-2-after");
const reportBasename = phase2Mode ? "phase-2-after" : phase1Mode ? "phase-1-after" : "baseline";
const assessmentBasename = phase2Mode ? "phase-2-budget-assessment" : phase1Mode ? "phase-1-budget-assessment" : "budget-assessment";
const reportPath = path.join(root, "benchmark-results", "map", `${reportBasename}.json`);
const assessmentPath = path.join(root, "benchmark-results", "map", `${assessmentBasename}.json`);
const capacityMode = process.argv.includes("--capacity");

if (!fs.existsSync(reportPath)) throw new Error(`Missing benchmark-results/map/${reportBasename}.json. Run the matching full map benchmark first.`);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const expectedMode = phase2Mode ? "Phase 2 after optimization" : phase1Mode ? "Phase 1 after optimization" : "full baseline";
if (report.mode !== expectedMode) throw new Error(`Expected ${expectedMode}, received ${report.mode}.`);

const assessment = evaluateBudgets(report);
fs.writeFileSync(assessmentPath, `${JSON.stringify(assessment, null, 2)}\n`);

const selected = capacityMode ? assessment.capacity : assessment.regression;
console.log(`${capacityMode ? "Capacity" : "Regression"} budget assessment: ${selected.passed ? "PASS" : "FAIL"} (${selected.checks} checks).`);
for (const failure of selected.failures) console.error(`- ${failure}`);
console.log(`Wrote ${path.relative(root, assessmentPath)}`);
if (!selected.passed) process.exitCode = 1;
