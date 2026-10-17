"use strict";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Firestore emulator required; never run against production");
const { initializeApp, deleteApp } = require("firebase-admin/app"), { getFirestore } = require("firebase-admin/firestore");
(async () => {
  const app = initializeApp({ projectId: "crownlands-social-fixture" }, "social-fixture");
  const db = getFirestore(app); db.settings({ ignoreUndefinedProperties: true });
  try { await require("../../tools/social-test-cases").run(db); }
  finally { await db.terminate(); await deleteApp(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
