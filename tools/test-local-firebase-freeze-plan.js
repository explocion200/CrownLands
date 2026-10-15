"use strict";
for (const name of ["test_firebase_freeze_plan.py", "test_firebase_transfer_controls.py"])
  require("node:child_process").execFileSync("python3", [require("node:path").join(__dirname, "local-migration", name)],
    { stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
