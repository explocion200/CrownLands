"use strict";
const { execFileSync } = require("node:child_process");
const path = require("node:path");
execFileSync("python3", [path.join(__dirname, "local-migration/test_snapshot.py")],
  { stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
