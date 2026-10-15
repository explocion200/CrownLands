"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Store } = require("../local-backend/store");
const { AuthService, secret } = require("../local-backend/auth");
const { prepareSchema } = require("./local-migration/prepare_auth_preview");
const { start } = require("../local-backend/rehearsal-server");

(async () => {
  const source = new Store({ schema: "migration_preview_source_" + crypto.randomBytes(6).toString("hex") });
  const target = new Store({ schema: "migration_auth_preview_" + crypto.randomBytes(6).toString("hex") });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "crownlands-preview-fixture-"));
  try {
    await source.initialize();
    await source.pool.query(`CREATE TABLE ${source.schema}.accounts(uid text PRIMARY KEY,body jsonb NOT NULL)`);
    const owner = { localId: "fixture-original-uid", email: "owner@example.test", emailVerified: true,
      providerUserInfo: [{ providerId: "google.com", rawId: "fixture-google-subject" }] };
    await source.pool.query(`INSERT INTO ${source.schema}.accounts(uid,body) VALUES($1,$2),('other',$3)`, [owner.localId, owner, { localId: "other", email: "other@example.test" }]);
    await source.doc("players/" + owner.localId).set({ city: "fixture-only" });
    await assert.rejects(prepareSchema({ sourceSchema: source.schema, email: "unknown@example.test", store: target }));
    assert.equal((await source.pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [target.schema])).rowCount, 0);
    await prepareSchema({ sourceSchema: source.schema, email: owner.email.toUpperCase(), store: target });
    const account = (await target.pool.query(`SELECT uid,body FROM ${target.schema}.accounts`)).rows;
    assert.deepEqual(account, [{ uid: owner.localId, body: owner }]);
    await assert.rejects(prepareSchema({ sourceSchema: source.schema, email: owner.email, store: target }));
    assert.equal((await target.pool.query(`SELECT count(*) AS n FROM ${target.schema}.accounts`)).rows[0].n, "1");
    const auth = new AuthService({ store: target, rateKey: crypto.randomBytes(32) });
    await auth.initialize();
    await auth.initialize({ createTables: false });
    await target.pool.query(`UPDATE ${target.schema}.accounts SET body=body||'{"disabled":true}'::jsonb`);
    assert.deepEqual((await source.pool.query(`SELECT body FROM ${source.schema}.accounts WHERE uid=$1`, [owner.localId])).rows[0].body, owner);
    assert.equal((await target.pool.query(`SELECT profile_found FROM ${target.schema}.rehearsal_identity`)).rows[0].profile_found, true);
    const config = path.join(directory, "config.json");
    fs.writeFileSync(config, JSON.stringify({ origin: "https://playcrownlands.com", schema: target.schema, rateKey: secret() }), { mode: 0o600 });
    // A schema-owning operator must not accidentally run the public-facing process.
    await assert.rejects(start(config), /restricted runtime database role/);
    console.log("Owner preview PostgreSQL: single-account copy preserves UID/provider, original snapshot unchanged, no-profile/overwrite refusal, separate identity receipt and runtime ownership rejection passed.");
  } finally {
    for (const store of [target, source]) { await store.pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`); await store.close(); }
    fs.rmSync(directory, { recursive: true });
  }
})().catch(() => { console.error("Private preview fixture failed; database details were not printed."); process.exitCode = 1; });
