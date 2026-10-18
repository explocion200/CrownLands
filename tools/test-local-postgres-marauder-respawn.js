"use strict";
const assert = require("node:assert/strict"), { randomBytes } = require("node:crypto");
const { Store } = require("../local-backend/store");
const { createPlacementFixture } = require("./validate-marauder-terrain");
(async () => {
  assert(!process.env.CROWNLANDS_BACKEND && !process.env.FIRESTORE_EMULATOR_HOST);
  const db = new Store({ schema: "migration_game_respawn_" + randomBytes(4).toString("hex") });
  try {
    await db.initialize();
    const fixture = createPlacementFixture();
    await require("../functions/test/marauder-respawn-cases")({ db, geometry: fixture.geometry });
  } finally {
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schema} CASCADE`);
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
