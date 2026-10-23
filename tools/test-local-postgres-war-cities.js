"use strict";
const { randomBytes } = require("node:crypto"), { Store } = require("../local-backend/store");
(async () => {
  const db = new Store({ schema: "migration_game_warcities_" + randomBytes(5).toString("hex") });
  try { await db.initialize(); await require("../functions/test/clan-war-cities-cases")({ db }); }
  finally { await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`); await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
