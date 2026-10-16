"use strict";
for (const name of ["test_firebase_freeze_plan.py", "test_firebase_transfer_controls.py", "test_transfer_maintenance.py", "test_final_snapshot.py", "test_handover_checks.py", "test_source_handover.py", "test_activate_local_transfer.py"])
  require("node:child_process").execFileSync("python3", [require("node:path").join(__dirname, "local-migration", name)],
    { stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
