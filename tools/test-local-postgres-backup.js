"use strict";
const path = require("node:path");
const { execFileSync } = require("node:child_process");
execFileSync("python3", [path.join(__dirname, "local-migration/test_postgres_backup.py")], { stdio: "inherit" });
execFileSync("python3", [path.join(__dirname, "local-migration/test_database_backup_install.py")], { stdio: "inherit" });
