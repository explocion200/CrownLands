"use strict";
// Explicit additive migration. Game startup and the static publisher never run it.
const { Pool } = require("../local-backend/node_modules/pg");
function definitions(schema) {
  if (!/^migration_[a-z0-9_]{1,40}$/.test(schema)) throw Error("Invalid schema");
  const key = field => `${schema}.query_sort_key((body #> '{fields,${field}}'::text[]))`;
  const stablePath = 'string_to_array(path, \'/\'::text) COLLATE "C"';
  return [
    ["social_contacts_friend_v1", "contacts", ["parent_path", key("friend"), key("updatedAtMs") + " DESC", stablePath]],
    ["social_contacts_block_v1", "contacts", ["parent_path", key("blocked"), key("updatedAtMs") + " DESC", stablePath]],
    ["social_inbox_status_v1", "inbox", ["parent_path", key("status"), key("updatedAtMs") + " DESC", stablePath]],
    ["social_inbox_unread_v1", "inbox", ["parent_path", key("unread"), key("lastIncomingAtMs")]],
    ["social_messages_page_v1", "privateMessages", ["parent_path", key("expiresAtMs") + " DESC", key("sequence") + " DESC", stablePath]],
    ["social_messages_expiry_v1", "privateMessages", [key("expiresAtMs")]],
    ["social_receipts_expiry_v1", "socialReceipts", [key("expiresAtMs")]],
    ["social_reports_expiry_v1", "socialReports", [key("expiresAtMs")]],
    ["social_reports_queue_v1", "socialReports", [key("status"), key("createdAtMs"), stablePath]],
    ["social_requests_expiry_v1", "socialPairs", [key("pendingUntilMs")]],
  ].map(([name, collection, keys]) => ({ name, definition: `CREATE INDEX ${name} ON ${schema}.documents USING btree (${keys.join(", ")}) WHERE (collection_id = '${collection}'::text)` }));
}
async function inspect(client, schema) {
  const expected = definitions(schema), result = await client.query(`SELECT c.relname AS name,i.indisvalid AS valid,i.indisready AS ready,pg_get_indexdef(c.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indexrelid=c.oid WHERE n.nspname=$1 AND c.relname=ANY($2::text[])`, [schema, expected.map(item => item.name)]);
  return expected.map(item => { const found = result.rows.find(row => row.name === item.name); if (found && (!found.valid || !found.ready || found.definition !== item.definition)) throw Error("Unexpected index definition: " + item.name); return { ...item, present: Boolean(found) }; });
}
async function apply(client, schema) {
  const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($1),hashtext('social-indexes-v1')) AS acquired", [schema]);
  if (!lock.rows[0].acquired) throw Error("Another social index installation is running");
  try {
    for (const item of await inspect(client, schema)) if (!item.present) await client.query(item.definition.replace("CREATE INDEX ", "CREATE INDEX CONCURRENTLY "));
    await client.query(`ANALYZE ${schema}.documents`); return await inspect(client, schema);
  } finally { await client.query("SELECT pg_advisory_unlock(hashtext($1),hashtext('social-indexes-v1'))", [schema]); }
}
async function main(args) {
  const applying = args[0] === "--apply";
  if (args.length && (!applying || args.length !== 2)) throw Error("Use --apply EXPECTED_ACTIVE_EPOCH");
  if (applying) { const control = JSON.parse(require("node:fs").readFileSync("/etc/crownlands-runtime/activation.json")); if (control.phase !== "active" || control.epoch !== args[1]) throw Error("Active server changed"); }
  const pool = new Pool({ host: "/var/run/postgresql", database: "crownlands_migration", max: 1, statement_timeout: 300000, lock_timeout: 5000 });
  const client = await pool.connect();
  try { const result = applying ? await apply(client, "migration_game_live") : await inspect(client, "migration_game_live"); console.log(JSON.stringify({ applied: applying, indexes: result.map(({ name, present }) => ({ name, present })) })); }
  finally { client.release(); await pool.end(); }
}
module.exports = { definitions, inspect, apply };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error("Social index installation stopped; inspect index validity. Private details suppressed."); process.exitCode = 1; });
