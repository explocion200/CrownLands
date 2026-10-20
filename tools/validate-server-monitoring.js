"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const result = spawnSync("python3", ["-B", path.join(__dirname, "server-monitoring/test_collector.py")], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
