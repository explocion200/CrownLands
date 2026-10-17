"use strict";
const crypto = require("node:crypto"), { Store } = require("../local-backend/store");
(async () => {
  const db = new Store({ schema: "migration_game_social_" + crypto.randomBytes(4).toString("hex") });
  try { await db.initialize(); const c = await db.pool.connect(); try { await require("./local-postgres-social-indexes").apply(c, db.schema); } finally { c.release(); } await require("./social-test-cases").run(db); }
  finally { await db.pool.query(`DROP SCHEMA ${db.schema} CASCADE`); await db.pool.end(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
