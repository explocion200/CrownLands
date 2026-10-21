"use strict";
// The production package/provider runs against independently generated accounts,
// actual cookie-authenticated HTTP commands and a disposable PostgreSQL schema.
process.argv.push("--production");
require("./test-local-postgres-native-auth-world");
