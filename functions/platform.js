"use strict";

// Firebase remains the default until a separately installed local runtime opts
// into a strictly isolated game rehearsal. No production endpoint is changed by
// importing this module or by publishing a static client package.
const mode = process.env.CROWNLANDS_BACKEND || "firebase";
if (mode === "postgres-rehearsal") {
  module.exports = require("../local-backend/platform").fromEnvironment();
} else if (mode === "postgres-local") {
  module.exports = require("../local-backend/permanent-platform").load();
} else if (mode === "firebase") {
  module.exports = {
    ...require("firebase-functions/v2/https"),
    ...require("firebase-functions/v2/scheduler"),
    ...require("firebase-functions/v2/firestore"),
    ...require("firebase-functions/params"),
    ...require("firebase-admin/firestore"),
    getApp: require("firebase-admin/app").getApp,
    getMessaging: require("firebase-admin/messaging").getMessaging,
    admin: require("firebase-admin"),
  };
} else {
  throw Error("Unknown Crownlands backend; refusing to select a database implicitly");
}
