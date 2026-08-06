const { spawnSync } = require("node:child_process");
const path = require("node:path");

const result = spawnSync(process.execPath, [path.join(__dirname, "sync-runtime-data.js")], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status || 0;
