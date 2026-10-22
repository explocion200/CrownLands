"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { Store } = require("../local-backend/store");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  const db = new Store({ schema: "migration_game_clansupport_" + crypto.randomBytes(5).toString("hex") });
  try { await db.initialize(); await require("../functions/test/clan-tower-support-cases")({ db, access: true }); }
  finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
