"use strict";
// Explicit operator migration, never invoked by game startup or static publishing.
const { Pool } = require("../local-backend/node_modules/pg");
function definitions(schema) {
  if (!/^migration_[a-z0-9_]{1,40}$/.test(schema)) throw Error("Invalid migration schema");
  const key = field => `${schema}.query_sort_key((body #> '{fields,${field}}'::text[]))`;
  const predicate = "((collection_id = 'armies'::text) AND (parent_path = ''::text))";
  return [
    ["armies_owner_status_v1", [key("ownerUid"), key("status"), key("worldId"), key("resetGeneration"), key("realmShardId")]],
    ["armies_due_v1", [key("status"), key("worldId"), key("resetGeneration"), key("arrivesAtMs"), 'string_to_array(path, \'/\'::text) COLLATE "C"']],
  ].map(([name, keys]) => ({ name,
    definition: `CREATE INDEX ${name} ON ${schema}.documents USING btree (${keys.join(", ")}) WHERE ${predicate}`,
  }));
}
async function inspect(client, schema) {
  const expected = definitions(schema);
  const { rows } = await client.query(`SELECT c.relname AS name, i.indisvalid AS valid, i.indisready AS ready,
    pg_get_indexdef(c.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_index i ON i.indexrelid=c.oid WHERE n.nspname=$1 AND c.relname=ANY($2::text[])`,
  [schema, expected.map(item => item.name)]);
  return expected.map(item => {
    const found = rows.find(row => row.name === item.name);
    if (found && (!found.valid || !found.ready || found.definition !== item.definition)) {
      throw Error(`Index ${item.name} exists with an invalid or unexpected definition; inspect before retrying`);
    }
    return { ...item, present: Boolean(found) };
  });
}
async function apply(client, schema) {
  // A session lock prevents competing copies of this installer. No data/table
  // lock is retained across builds, and runtime transactions remain unchanged.
  const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1),hashtext($2)) AS acquired", [schema, "army-query-indexes-v1"]);
  if (!lock.rows[0].acquired) throw Error("Another army index installation is running");
  try {
    const before = await inspect(client, schema);
    for (const item of before) if (!item.present) {
      await client.query(item.definition.replace("CREATE INDEX ", "CREATE INDEX CONCURRENTLY "));
    }
    if (before.some(item => !item.present)) await client.query(`ANALYZE ${schema}.documents`);
    return await inspect(client, schema);
  } finally { await client.query("SELECT pg_advisory_unlock(hashtext($1),hashtext($2))", [schema, "army-query-indexes-v1"]); }
}
async function main(args) {
  const applying = args[0] === "--apply";
  if ((!applying && args.length) || (applying && (args.length !== 2 || !/^[a-f0-9]{28,40}$/.test(args[1])))) {
    throw Error("Usage: node tools/local-postgres-army-indexes.js [--apply EXPECTED_ACTIVE_EPOCH]");
  }
  const schema = "migration_game_live";
  const pool = new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 1,
    application_name: "crownlands-army-index-maintenance", statement_timeout: 300000, lock_timeout: 5000 });
  let client;
  try {
    client = await pool.connect();
    if (applying) {
      const state = JSON.parse(require("node:fs").readFileSync("/etc/crownlands-runtime/activation.json", "utf8"));
      if (state.version !== 1 || state.phase !== "active" || state.epoch !== args[1]) throw Error("Active server authority changed");
    }
    const state = applying ? await apply(client, schema) : await inspect(client, schema);
    console.log(JSON.stringify({ applied: applying, indexes: state.map(({ name, present }) => ({ name, present })) }));
  } finally { client?.release(); await pool.end(); }
}
if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error("Army index check/install stopped. Inspect database index validity before retrying; private database errors suppressed.");
  process.exitCode = 1;
});
module.exports = { definitions, inspect, apply };
